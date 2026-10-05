/* ==========================================================================
   "Настройки → Бухгалтерия → План счетов" (Chart of Accounts).

   ДОПУЩЕНИЕ ПРОТОТИПА (уточнено 01.10.2026, включая отдельно изученный
   vabs/bb2): иерархического экрана «План счетов» в реальном бэкенде нет —
   но сама классификация счетов реальна: у VA/RA есть `tag` (см. ниже) и
   `ledgerType: ACTIVE|PASSIVE`, а в vabs есть настоящая двойная запись
   (virtual_transactions) и готовые финансовые отчёты (Trial Balance,
   Balance Sheet и др., см. карточку «Финансовые отчёты»/эту же карточку в
   section-docs.js) — просто без древовидного admin-экрана и без ручных
   проводок с апрувом. Весь этот раздел построен по требованиям из documents:
     D:\Project\multibank\research-gl-coa.md
     D:\Project\multibank\general-ledger-i-chart-of-accounts.md
   а не по существующему коду — это проект будущей фичи, а не отражение
   реального API.

   Структура счёта — ровно таблица из §2.3 FRD.

   ПРИВЯЗКА ВА/РА К СЧЕТУ (пересмотрено 2026-10-01, по находкам в read-only
   репо: postings-and-accounts.md, VabsVirtualAccountTagEnum, erp-export
   client-account-references.constant.ts). Раньше здесь были "обязательные
   измерения" (VA-ID/RA-ID/Client-ID/Product/Channel), которые как бы
   заполнялись вручную на каждой проводке — это не соответствовало тому, как
   это устроено в реальном бэкенде, и было прямо названо неправильным.
   Реальный механизм — СТРУКТУРНЫЙ: у ВА/РА есть поле `tag` (уже есть в
   mock/accounts.mock.js — CUSTOMER_FIAT_ACCOUNT, CUSTOMER_CRYPTO_WALLET,
   PAYABLE_TO_CUSTOMER, cards_account, CP_LIQUIDITY_POOL,
   CASH_LIQUIDITY_POOL и т.д.), и именно этот тег определяет, к какому
   счёту плана счетов относится баланс — не отдельное поле на проводке.
   Один тег может стоять у многих ВА/РА (control-account: баланс счёта
   плана счетов = сумма всех ВА/РА с этим тегом).
   Поэтому у ANALYTICAL/TECHNICAL счёта теперь есть необязательное поле
   `tag` — задаётся только там, где в mock/accounts.mock.js реально
   встречается такой тег (счёт привязан к конкретным существующим ВА/РА,
   см. coaLinkedAccounts ниже); у остальных счетов (кредитный портфель,
   доходы/расходы, капитал) tag=null — для них в реальном бэкенде нет
   аналога вообще (ни тега, ни отдельного учёта), это так и остаётся
   ДОПУЩЕНИЕМ ПРОТОТИПА, но уже без вводящей в заблуждение "привязки через
   обязательные поля проводки".
   "Product"/"Channel" как измерения убраны полностью — не нашёл для них
   подтверждения ни в одном из read-only репозиториев.

   БЕЗ ОТДЕЛЬНОЙ ГЛАВНОЙ КНИГИ (пересмотрено 05.10.2026, по архитектуре реальной системы отчётности
   vABS: "обеспечить 12 отчётов без внедрения отдельного GL-сервиса — классификация тегом на счёте,
   отчётность read-слоем поверх Operation+RealTx/VirtualTx"). Раньше здесь был план на отдельный журнал
   проводок (Главная книга) с движком правил, строящим проводки из операций заново — это дважды источник
   истины на одни и те же деньги (сам факт движения уже есть в проводках ВА/РА), и ничем не защищено от
   расхождения между журналом и реальными остатками, если правило построено неверно. Вместо этого остатки
   и "проводки" счёта плана счетов (coaBalancesByCurrency/coaEntriesForAccount, см. ниже) — это ПРЯМО
   проводки его привязанных по тегу ВА/РА (ACCOUNT_TRANSACTIONS, mock/accounts.mock.js — тот самый
   RealTx/VirtualTx) — второго леджера нет и расходиться не с чем. Главная книга и Правила проводок,
   которые были в прототипе 05.10.2026 между этим обновлением и предыдущим, удалены полностью.
   Это первая и единственная для этой итерации часть раздела "Бухгалтерия" — следующий шаг — отчёты
   (financial-reports.js) поверх этого же read-слоя, план счетов дальше не меняется.
   ========================================================================== */

function coaStamp(entity, createdDate, updatedDate) {
  entity.createdDate = createdDate;
  entity.createdAt = formatDateTime(createdDate);
  entity.updatedDate = updatedDate || createdDate;
  entity.updatedAt = formatDateTime(entity.updatedDate);
  return entity;
}

const COA_SPECS = [
  // [код, имя, категория, сальдо, тип узла, родитель, валюта|null=мультивалютный,
  //  isSystem, isTechnical, allowManualEntry, tag]
  // tag — реальное значение из mock/accounts.mock.js (ВА/РА с этим тегом принадлежат этому счёту,
  // см. coaLinkedAccounts ниже); null — у счёта нет известного реального аналога (допущение прототипа).
  ["1000", "Assets", "ASSETS", "DEBIT", "GROUP", null, null, true, false, false, null],
  ["1100", "Platform Nostro Accounts", "ASSETS", "DEBIT", "GROUP", "1000", null, true, false, false, null],
  // Сами счета в конкретных банках — обычные управляемые счета (банк-партнёр сменился, открыли новый) — системная
  // защита (is_system) нужна только структуре (группам), не каждому отдельному nostro-счёту
  ["1101", "Nostro EUR - Bank Name", "ASSETS", "DEBIT", "ANALYTICAL", "1100", "EUR", false, false, false, null],
  ["1102", "Nostro GBP - Bank Name", "ASSETS", "DEBIT", "ANALYTICAL", "1100", "GBP", false, false, false, null],
  ["1103", "Nostro USD - Bank Name", "ASSETS", "DEBIT", "ANALYTICAL", "1100", "USD", false, false, false, null],
  ["1110", "Client Dedicated Accounts", "ASSETS", "DEBIT", "GROUP", "1000", null, true, false, false, null],
  ["1111", "Dedicated EUR Accounts", "ASSETS", "DEBIT", "ANALYTICAL", "1110", "EUR", false, false, false, null],
  ["1112", "Dedicated GBP Accounts", "ASSETS", "DEBIT", "ANALYTICAL", "1110", "GBP", false, false, false, null],
  ["1120", "Client Pool Accounts", "ASSETS", "DEBIT", "GROUP", "1000", null, true, false, false, null],
  // Оба пула ссылаются на один и тот же реальный тег CP_LIQUIDITY_POOL (в mock/accounts.mock.js это
  // единственный найденный реальный тег пула ликвидности) — деление Retail/Business поверх него
  // остаётся допущением прототипа, в отличие от самой привязки к реальным счетам.
  ["1121", "Pool EUR - Retail", "ASSETS", "DEBIT", "ANALYTICAL", "1120", "EUR", false, false, false, "CP_LIQUIDITY_POOL"],
  ["1122", "Pool EUR - Business", "ASSETS", "DEBIT", "ANALYTICAL", "1120", "EUR", false, false, false, "CP_LIQUIDITY_POOL"],
  // Клиентские крипто-кошельки — реальный тег CUSTOMER_CRYPTO_WALLET (ACTIVE в постах sync-bus), у нас
  // раньше такого счёта не было вовсе — добавлен специально под найденную привязку
  ["1130", "Client Crypto Wallets", "ASSETS", "DEBIT", "ANALYTICAL", "1000", null, false, false, false, "CUSTOMER_CRYPTO_WALLET"],
  ["1200", "Loan Portfolio", "ASSETS", "DEBIT", "ANALYTICAL", "1000", null, false, false, true, null],
  ["1300", "Interest Receivable", "ASSETS", "DEBIT", "ANALYTICAL", "1000", null, false, false, true, null],
  ["1400", "FX Clearing", "ASSETS", "DEBIT", "GROUP", "1000", null, true, false, false, null],
  ["1401", "FX Clearing EUR", "ASSETS", "DEBIT", "TECHNICAL", "1400", "EUR", true, true, false, null],
  ["1402", "FX Clearing GBP", "ASSETS", "DEBIT", "TECHNICAL", "1400", "GBP", true, true, false, null],
  ["1500", "Suspense / Transit", "ASSETS", "DEBIT", "TECHNICAL", "1000", null, true, true, false, null],
  ["2000", "Liabilities", "LIABILITIES", "CREDIT", "GROUP", null, null, true, false, false, null],
  ["2100", "Client Deposits - Current", "LIABILITIES", "CREDIT", "ANALYTICAL", "2000", null, false, false, true, "CUSTOMER_FIAT_ACCOUNT"],
  ["2110", "Client Deposits - Card", "LIABILITIES", "CREDIT", "ANALYTICAL", "2000", null, false, false, true, "cards_account"],
  ["2120", "Client Deposits - Savings", "LIABILITIES", "CREDIT", "ANALYTICAL", "2000", null, false, false, true, null],
  ["2200", "Held / Frozen Funds", "LIABILITIES", "CREDIT", "ANALYTICAL", "2000", null, false, false, true, null],
  ["2300", "Partner Payables", "LIABILITIES", "CREDIT", "ANALYTICAL", "2000", null, false, false, true, null],
  ["3000", "Equity", "EQUITY", "CREDIT", "GROUP", null, null, true, false, false, null],
  ["3100", "Share Capital", "EQUITY", "CREDIT", "ANALYTICAL", "3000", null, true, false, false, null],
  ["3200", "Retained Earnings", "EQUITY", "CREDIT", "ANALYTICAL", "3000", null, true, false, false, null],
  ["3300", "Current Period Result", "EQUITY", "CREDIT", "TECHNICAL", "3000", null, true, true, false, null],
  ["4000", "Income", "INCOME", "CREDIT", "GROUP", null, null, true, false, false, null],
  ["4100", "Transfer Fee Income", "INCOME", "CREDIT", "ANALYTICAL", "4000", null, false, false, false, null],
  ["4110", "SEPA Fee Income", "INCOME", "CREDIT", "ANALYTICAL", "4100", null, false, false, false, null],
  ["4120", "SWIFT Fee Income", "INCOME", "CREDIT", "ANALYTICAL", "4100", null, false, false, false, null],
  ["4130", "FPS Fee Income", "INCOME", "CREDIT", "ANALYTICAL", "4100", null, false, false, false, null],
  ["4200", "FX Revenue", "INCOME", "CREDIT", "ANALYTICAL", "4000", null, false, false, false, null],
  ["4300", "Maintenance Fee Income", "INCOME", "CREDIT", "ANALYTICAL", "4000", null, false, false, false, null],
  ["4400", "Loan Interest Income", "INCOME", "CREDIT", "ANALYTICAL", "4000", null, false, false, false, null],
  ["4500", "Other Income", "INCOME", "CREDIT", "ANALYTICAL", "4000", null, false, false, true, null],
  ["5000", "Expenses", "EXPENSES", "DEBIT", "GROUP", null, null, true, false, false, null],
  ["5100", "Correspondent Bank Fees", "EXPENSES", "DEBIT", "ANALYTICAL", "5000", null, false, false, false, null],
  ["5200", "Payment Provider Fees", "EXPENSES", "DEBIT", "ANALYTICAL", "5000", null, false, false, false, null],
  ["5300", "Interest Expense", "EXPENSES", "DEBIT", "ANALYTICAL", "5000", null, false, false, true, null],
  ["5400", "FX Revaluation Loss", "EXPENSES", "DEBIT", "TECHNICAL", "5000", null, true, true, false, null],
  ["5500", "Other Expenses", "EXPENSES", "DEBIT", "ANALYTICAL", "5000", null, false, false, true, null],
];

const COA_D_BASE = new Date(2026, 0, 12, 9, 0);

const COA_ACCOUNTS = COA_SPECS.map(([code, name, category, normalBalance, nodeType, parentCode, currency, isSystem, isTechnical, allowManualEntry, tag], i) => {
  const created = new Date(COA_D_BASE.getTime() + i * 36 * 3600 * 1000);
  return coaStamp(
    {
      id: seedToPaymentUuid(39000 + i),
      code,
      name,
      category,
      normalBalance,
      nodeType,
      parentCode,
      currency,
      isSystem,
      isTechnical,
      allowManualEntry,
      tag,
      description: null,
      status: "ACTIVE",
      alertThreshold: isTechnical ? 0 : null,
    },
    created
  );
});

function coaById(id) {
  return COA_ACCOUNTS.find((a) => a.id === id) || null;
}

function coaByCode(code) {
  return COA_ACCOUNTS.find((a) => a.code === code) || null;
}

function coaChildren(code) {
  return COA_ACCOUNTS.filter((a) => a.parentCode === code);
}

function coaParent(a) {
  return a.parentCode ? coaByCode(a.parentCode) : null;
}

// ---- Привязка ВА/РА к счёту плана счетов — через реальное поле `tag` (mock/accounts.mock.js), ------
// не через выдуманные "измерения проводки". Один тег может стоять у многих ВА/РА — баланс счёта
// плана счетов = сумма всех ВА/РА с этим тегом (control-account), поэтому coaLinkedAccounts может
// вернуть несколько записей.
function coaAllAccountInstances() {
  return [...ACCOUNTS_VIRTUAL_MOCK, ...ACCOUNTS_REAL_MOCK, ...ACCOUNTS_NOSTRO_MOCK];
}

function coaLinkedAccounts(a) {
  if (!a.tag) return [];
  return coaAllAccountInstances().filter((x) => x.tag === a.tag);
}

function coaFindAccountInstance(kind, id) {
  const src = kind === "virtual" ? ACCOUNTS_VIRTUAL_MOCK : kind === "real" ? ACCOUNTS_REAL_MOCK : ACCOUNTS_NOSTRO_MOCK;
  return src.find((x) => x.id === id) || null;
}

// Реальные значения тега, доступные для выбора у счёта плана счетов — функция, не константа:
// пересчитывается при каждом открытии формы, чтобы подхватывать новые теги, которые админ мог
// только что проставить вручную на ВА/РА (карточка счёта → "Изменить", поле "Тег" — реальное
// поле `tag: String`, см. accounts.js accOpenEditModal). Не только теги реальных ВА/РА, но и те,
// что уже привязаны к другим счетам плана счетов (чтобы не терять свежесозданный тег без счетов).
function coaKnownTags() {
  const fromAccounts = coaAllAccountInstances().map((x) => x.tag);
  const fromCoa = COA_ACCOUNTS.map((a) => a.tag);
  return [...new Set([...fromAccounts, ...fromCoa].filter(Boolean))].sort();
}

// Глубина в иерархии (0 — категория верхнего уровня) — для отступа в списке
function coaDepth(a) {
  let d = 0;
  let cur = a;
  while (cur.parentCode) {
    cur = coaByCode(cur.parentCode);
    d += 1;
  }
  return d;
}

// ---- Остатки и проводки: read-слой прямо над настоящими проводками по счетам (ACCOUNT_TRANSACTIONS,
// mock/accounts.mock.js — это и есть RealTx/VirtualTx), без отдельного журнала Главной книги между ними
// и Планом счетов (05.10.2026, пересмотрено по архитектуре реальной системы отчётности vABS: "без
// внедрения отдельного GL-сервиса — отчётность строится read-слоем поверх Operation+RealTx/VirtualTx").
// Счёт плана счетов объединяет все ВА/РА со своим тегом (coaLinkedAccounts) — его остаток/проводки —
// это остатки/проводки ЭТИХ счетов, а не записи отдельной сущности, которую можно было бы завести
// неправильно и получить расхождение с реальными балансами.
function coaTxOfAccount(a) {
  return coaLinkedAccounts(a).flatMap((acc) => (ACCOUNT_TRANSACTIONS[acc.id] || []).map((tx) => ({ ...tx, accountRef: acc })));
}

// Только CONFIRMED — остальные статусы (PENDING/PROCESSING/DECLINED/ERROR) ещё не факт хозяйственной жизни.
function coaBalancesByCurrency(a) {
  if (a.nodeType === "GROUP") {
    const out = {};
    coaChildren(a.code).forEach((c) => {
      const kids = coaBalancesByCurrency(c);
      Object.keys(kids).forEach((cur) => { out[cur] = (out[cur] || 0) + kids[cur]; });
    });
    return out;
  }
  const out = {};
  const normalFactor = a.normalBalance === "DEBIT" ? 1 : -1;
  coaTxOfAccount(a).filter((tx) => tx.status === "CONFIRMED").forEach((tx) => {
    const amtSign = tx.transferType === "DEBIT" ? 1 : -1;
    out[tx.currency] = Math.round(((out[tx.currency] || 0) + amtSign * normalFactor * tx.amount) * 100) / 100;
  });
  return out;
}

function coaHasNonzeroBalance(a) {
  return Object.values(coaBalancesByCurrency(a)).some((v) => Math.abs(v) > 0.005);
}

// Проводки для карточки счёта плана счетов — те же ACCOUNT_TRANSACTIONS, просто собранные со всех
// привязанных по тегу ВА/РА в одну ленту и отсортированные по дате (самое новое сверху).
function coaEntriesForAccount(a) {
  return coaTxOfAccount(a).sort((x, y) => y.createdDate - x.createdDate);
}
