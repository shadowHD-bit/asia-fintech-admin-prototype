/* ==========================================================================
   Моковые данные для раздела "Счета" (виртуальные, реальные, корреспондентские).
   Форма записей — типы VabsVirtualAccount / VabsRealAccount ядра
   (core-feature-dev_bank_core/schema.graphql, сгенерированная SDL-схема —
   единственный авторитетный источник полей, читал 24.09.2026).

   Подтверждено повторным чтением схемы и сущностей (real-account.entity.ts,
   virtual-account.entity.ts, accounts-plugin/*):
   - У счёта НЕТ отдельного поля "название"/"алиас" — только свободный текст
     description (+ restrictionDetails у ограничения). Раньше это место в UI
     занимало description — убрано из таблиц (см. accAccountCell ниже),
     остаётся только в поле "Описание" на карточке.
   - rails: [String!]! — это поле есть ТОЛЬКО у VabsRealAccount (резолвится
     через findRealAccountRails). У VabsVirtualAccount такого поля нет вовсе.
     "Корреспондентский" счёт в реальной схеме — это тот же VabsRealAccount
     (type=NOSTRO), поэтому rails есть и у него тоже.
   - Реквизиты реального/корреспондентского счёта в UI — это НАБОРЫ
     (depositSets, см. ACC_DEPOSIT_SCHEMAS ниже): валюты + рельс + фиксированные
     поля схемы рельса + lookupKey. (Отдельное непрозрачное requisites: VabsJSON!
     счёта в интерфейсе не показываем.) У виртуального счёта своих реквизитов нет
     — только производные depositDetails (см. accDepositDetails/lookupKey).
   - Статусы (ACTIVE, FROZEN, DISABLED, CLOSED, ARCHIVED, ERROR) — оба enum'а
     (RealAccountStatusEnum/VirtualAccountStatusEnum) совпадают 1-в-1, ARCHIVED
     подтверждён как реальное значение, не выдумано.
   - Заморозка/закрытие/архивация/активация — это не отдельные мутации, а один
     и тот же generic vabsUpdate(Real|Virtual)Accounts со status, но сама
     четвёрка действий РЕАЛЬНА: AccountActionEnum { ACTIVATE, ARCHIVE, CLOSE,
     FREEZE } с готовым мэппингом действие→статус (acc-accounts.service.ts) —
     ровно та же четвёрка, что уже была в accActionButtons (views/accounts.js).
   - Связи виртуальный↔реальный — в реальной схеме ДВЕ разные связи: M2M
     virtualAccounts↔realAccounts (список ID) и ОТДЕЛЬНО tree-иерархия
     parent/children ТОЛЬКО среди виртуальных счетов. Здесь это намеренно
     упрощено в один плоский linkedIds + parentId — честная упрощённая модель,
     не точная копия схемы.
   - Значения restrictionReason (справочник AccountRestrictionReasonEnum) — из
     внешнего пакета @vabs/common, исходников которого нет ни в одном из двух
     репозиториев, поэтому остаются условными (см. ниже).
   Условное: сами счета, суммы, конкретные значения реквизитов и причин
   ограничений (справочник значений не найден ни в одном репозитории),
   категории, ID у провайдеров.
   Клиенты и платежи взяты из других моков, чтобы ссылки вели на существующие
   карточки. Должен загружаться после clients-users / clients-companies /
   operations-payments.
   ========================================================================== */

const ACC_RESTRICTION_REASONS = ["COMPLIANCE_REVIEW", "CLIENT_REQUEST", "SUSPICIOUS_ACTIVITY", "COURT_ORDER"];
const ACC_STATUSES = ["ACTIVE", "FROZEN", "DISABLED", "CLOSED", "ARCHIVED", "ERROR"];

// name, group (условная группа для генерации данных), rails; category у провайдера в ядре везде PRIMARY.
// rails — значения из реального PaymentSystemEnum/VabsPaymentSystem (см. шапку
// файла); раньше почти у всех провайдеров, кроме первых трёх, стоял пустой
// список — обычному card/cash/crypto-провайдеру тоже полагается свой рельс,
// иначе поле просто никогда не видно. Paygine → SBP не выдумано: в этом же
// проекте уже подтверждено чтением бэкенда (создание SBP-платежа), что справочник
// банков для SBP отдаёт именно Paygine.
const ACC_PROVIDERS = [
  { name: "Paygine", group: "PAYMENT", rails: ["RU_WIRE", "SBP"] },
  { name: "Pay2me", group: "PAYMENT", rails: ["SWIFT", "WIRE"] },
  { name: "Requisites provider", group: "BANK", rails: ["SWIFT", "RU_WIRE", "REQUISITES", "ACH", "WIRE"] },
  { name: "Cash provider", group: "CASH", rails: ["CASH"] },
  { name: "Crypto Processing", group: "CRYPTO", rails: ["CRYPTO_WALLET"] },
  { name: "Harbour and Hills", group: "CRYPTO", rails: ["CRYPTO_WALLET"] },
  { name: "Pintopay", group: "CARD", rails: ["CARD_NUMBER"] },
  { name: "Walletverse", group: "CRYPTO", rails: ["CRYPTO_WALLET"] },
  { name: "Elcart", group: "CARD", rails: ["CARD_NUMBER"] },
].map((p, i) => ({ ...p, id: seedToPaymentUuid(3000 + i), code: entityCode("VBP", 3000 + i), category: "PRIMARY" }));

const ACC_SERVICE_CLIENT = { id: seedToPaymentUuid(3100), name: "Азия Финтех (служебный клиент)", legalType: "CORPORATE", link: null };

function accFakeAddress(seed) {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ123456789";
  let x = seed * 7919 + 13;
  let out = "T";
  for (let i = 0; i < 33; i += 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out += alphabet[x % alphabet.length];
  }
  return out;
}

function accIban(seed) {
  return `CH${10 + (seed % 80)} 0076 2011 ${String(1000 + ((seed * 37) % 9000))} 5295 7`;
}

// Реквизиты реального/корреспондентского счёта — не "свободные параметры счёта",
// а НАБОРЫ реквизитов (VabsCreateDepositDetailsClientSetForRealBalanceInput,
// core schema.graphql): у набора — currencyIds[] (несколько валют сразу), схема
// реквизитов рельса (depositDetailsSchema — фиксированный список полей, rail
// обязателен), depositDetails по этой схеме и обязательный lookupKey ("Primary
// search index …" — по нему опознаётся входящий платёж). Счёт может иметь
// несколько наборов; рельсы счёта (findRealAccountRails) — это рельсы его
// наборов. Итоговые реквизиты клиенту = merge(providerSet [банк-реквизиты
// провайдера по валюте+рельсу], clientSet).
// ФОРМА НАБОРА РЕКВИЗИТОВ ПО РЕЙЛУ — фиксированная, по реальной админке (скрины
// формы "Добавить реквизиты") и коду провайдеров: в наборе спрашиваются только
// КЛИЕНТСКИЕ поля; банк-реквизиты провайдера (код/название банка, корр. банк,
// БИК/ИНН и т.п.) лежат в provider-set и подмешиваются к ним при выдаче
// (deposit-details.service.ts: merge(providerSet, clientSet)) — их при
// создании счёта не вводят.
//   Общая информация (у всех): Валюты (несколько), Рельс, Ключ поиска — все обязательны.
//   SWIFT       — Beneficiary: Name, Address; Beneficiary Bank: Account; Remittance Information.
//   RU_WIRE     — только Remittance Information.
//   SBP         — Beneficiary Bank: Account (по коду Paygine/Pay2me там телефон, он же ключ поиска).
//   REQUISITES  — Beneficiary Bank: Account.
// Все поля обязательны. Ограничения "валюта ↔ рельс" в форме нет (на скринах USD.K
// выбрана и с RU_WIRE, и с SBP) — доступны любые валюты счёта.
// Другие рельсы (WIRE/ACH/CARD_NUMBER/CASH/CRYPTO_WALLET) на скринах не показаны и
// в коде схемы не найдены — набора реквизитов для них нет.
// В GraphQL remittanceInformation — массив строк; в форме одно поле.
// groups — разделы формы: заголовок (или null) + ключи полей.
// lookup — поле, значение которого по умолчанию подставляется в ключ поиска.
const ACC_DEPOSIT_SCHEMAS = {
  SWIFT: {
    groups: [
      { title: "Beneficiary", fields: ["beneficiaryName", "beneficiaryAddress"] },
      { title: "Beneficiary Bank", fields: ["beneficiaryBankAccount"] },
      { title: null, fields: ["remittanceInformation"] },
    ],
    lookup: "beneficiaryBankAccount",
  },
  RU_WIRE: { groups: [{ title: null, fields: ["remittanceInformation"] }], lookup: null },
  SBP: { groups: [{ title: "Beneficiary Bank", fields: ["beneficiaryBankAccount"] }], lookup: "beneficiaryBankAccount", phoneAccount: true },
  REQUISITES: { groups: [{ title: "Beneficiary Bank", fields: ["beneficiaryBankAccount"] }], lookup: "beneficiaryBankAccount" },
};
Object.values(ACC_DEPOSIT_SCHEMAS).forEach((sch) => { sch.fields = sch.groups.flatMap((g) => g.fields); });

// все поля набора обязательны
function accDepositRequired(rail) {
  return !!ACC_DEPOSIT_SCHEMAS[rail];
}

// Только для генерации мока: какие валюты счёта естественно попадают в набор
// рельса (RUB — RU_WIRE/СБП, прочий фиат — SWIFT/REQUISITES). В самой форме
// такого ограничения нет.
function accRailAcceptsCurrency(rail, currency) {
  if (!ACC_DEPOSIT_SCHEMAS[rail] || currency === "USDT") return false;
  return rail === "RU_WIRE" || rail === "SBP" ? currency === "RUB" : currency !== "RUB";
}

function accDepositFieldValue(key, seed, rail) {
  if (key === "beneficiaryName") return "Asia Fintech Ltd";
  if (key === "beneficiaryAddress") return "Bishkek, Chuy Ave 100";
  if (key === "beneficiaryBankAccount") return rail === "SBP" ? `+7901${String(1000000 + seed * 137).slice(0, 7)}` : accIban(seed);
  if (key === "remittanceInformation") return String(1000000 + ((seed * 7919) % 9000000));
  return "";
}

// Наборы реквизитов счёта: по одному на рельс провайдера, в набор попадают все
// подходящие рельсу валюты счёта
function accBuildDepositSets(provider, currencies, seed) {
  const sets = [];
  provider.rails.forEach((rail, idx) => {
    const sch = ACC_DEPOSIT_SCHEMAS[rail];
    if (!sch) return;
    const cur = currencies.filter((c) => accRailAcceptsCurrency(rail, c));
    if (!cur.length) return;
    const fields = sch.fields.map((k) => [k, accDepositFieldValue(k, seed + idx, rail)]);
    const lookupField = sch.lookup && fields.find(([k]) => k === sch.lookup);
    sets.push({
      id: seedToPaymentUuid(30000 + seed * 10 + idx),
      currencies: cur,
      rail,
      fields,
      lookupKey: lookupField ? lookupField[1] : seedToPaymentUuid(31000 + seed * 10 + idx),
    });
  });
  return sets;
}

// Реквизиты для пополнения виртуального счёта по валюте.
// lookupKey — подтверждённое чтением схемы 24.09.2026 реальное поле
// VabsDepositDetailsClientSet.lookupKey ("Primary search index extracted from
// the deposit details (e.g., account number, phone, or reference)",
// core-feature-dev_bank_core/schema.graphql) — это и есть "Ключ поиска" из
// реального скрина реквизитов. Здесь — производные реквизиты виртуального
// счёта: копируются, не редактируются. Редактируются только наборы реквизитов
// РЕАЛЬНОГО счёта (см. accBuildDepositSets).
function accDepositDetails(currency, seed) {
  const lookupKey = ["lookupKey", seedToPaymentUuid(9000 + seed)];
  if (currency === "USDT") return { schema: null, fields: [["address", accFakeAddress(seed + 40)], ["network", "TRON (TRC-20)"], lookupKey] };
  if (currency === "RUB") {
    return {
      schema: "RU_WIRE",
      fields: [
        ["beneficiary", "ООО «Азия Финтех»"], ["inn", "7712345678"], ["kpp", "771201001"], ["bankName", "АО «Банк Пример»"], ["bik", "044525999"],
        ["account", `40702810${String(100000000000 + ((seed * 104729) % 899999999999))}`], ["corrAccount", "30101810400000000999"], ["remittance", `Пополнение счёта ${seed + 100000}`], lookupKey,
      ],
    };
  }
  if (currency === "KGS") return { schema: "INNER", fields: [["account", `AF-${100000 + seed * 13}`], ["remittance", `Пополнение счёта ${seed + 100000}`], lookupKey] };
  return {
    schema: "SWIFT",
    fields: [
      ["beneficiary", "Asia Fintech Ltd"], ["beneficiaryAddress", "Bishkek, Chuy Ave 100"], ["bankName", pick(["Bank Alpha AG", "Nordic Trade Bank"], seed)],
      ["swift", pick(["ALPHCHZZ", "NRTBDKKK"], seed)], ["iban", accIban(seed + 5)], ["correspondentBank", "Intermediary Bank NA"],
      ["correspondentSwift", "IMBKUS33"], ["correspondentAccount", "0012345678"], ["remittance", `Top up ${seed + 100000}`], lookupKey,
    ],
  };
}

function accMakeBalances(currencies, seed, { zero, big, realType }) {
  return currencies.map((currency, idx) => {
    const base = zero ? 0 : big ? 150000 + ((seed * 48611 + idx * 9001) % 4800000) : 120 + ((seed * 937 + idx * 211) % 49000);
    const total = zero ? 0 : +(base + ((seed * 13 + idx) % 100) / 100).toFixed(2);
    const hold = !zero && seed % 3 === 0 ? +(total * 0.08).toFixed(2) : 0;
    // id и description — реальные поля VabsRealBalance/VabsVirtualBalance
    // (schema.graphql); description по умолчанию пустой
    return { id: seedToPaymentUuid(20000 + seed * 10 + idx), code: entityCode("BAL", 20000 + seed * 10 + idx), description: null, currency, total, hold, available: +(total - hold).toFixed(2), status: "ACTIVE", type: realType || null };
  });
}

// ---- Реальные счета (кроме ностро) ---------------------------------------------------------
const ACC_REAL_PROVIDER_ORDER = [2, 1, 0, 4, 5, 6, 7, 8]; // индексы в ACC_PROVIDERS
const ACCOUNTS_REAL_MOCK = Array.from({ length: 22 }).map((_, i) => {
  const seed = i + 1;
  const provider = ACC_PROVIDERS[pick(ACC_REAL_PROVIDER_ORDER, seed)];
  const status = pick(["ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "FROZEN", "DISABLED", "CLOSED", "ERROR", "ARCHIVED"], seed * 5);
  const isCrypto = provider.group === "CRYPTO";
  const currencies = isCrypto ? ["USDT"] : provider.group === "CARD" ? ["USD", "EUR"] : pick([["USD"], ["EUR"], ["USD", "EUR"], ["RUB"], ["KGS", "USD"]], seed);
  const tag = isCrypto ? pick(["CP_SENDER_CLIENT", "CP_RECIPIENT_CLIENT", null], seed) : seed % 2 === 0 ? "CUSTOMER_FIAT_ACCOUNT" : null;
  const createdDate = new Date(MOCK_NOW.getTime() - seed * 31.7 * 60 * 60 * 1000);
  const updatedDate = new Date(createdDate.getTime() + (20 + (seed % 90)) * 60 * 1000);
  const restricted = status === "FROZEN" || status === "DISABLED";
  return {
    id: seedToPaymentUuid(4000 + seed),
    code: entityCode("ACR", 4000 + seed),
    kind: "real",
    provider,
    providerExternalId: `EXT-${(seed * 7919) % 90000 + 10000}`,
    type: pick(["CLIENT", "EXTERNAL", "SYSTEM", "INTERNAL"], seed * 3),
    ledgerType: "ACTIVE",
    status,
    tag,
    description: isCrypto ? `Кошелёк ${provider.name}` : `Счёт в ${provider.name}`,
    rails: provider.rails,
    depositSets: accBuildDepositSets(provider, currencies, seed),
    balances: accMakeBalances(currencies, seed, { zero: status === "CLOSED" || status === "ARCHIVED", realType: isCrypto ? "DEPOSIT_ADDRESS" : "SERVICE_ADDRESS" }),
    restrictionReason: restricted ? pick(ACC_RESTRICTION_REASONS, seed) : null,
    restrictionDetails: restricted && seed % 2 === 0 ? "Ожидается ответ провайдера по запросу документов" : null,
    references: seed % 5 === 0 ? [{ name: "legacyAccountId", value: `BB-${10000 + seed * 17}` }] : [],
    errorMessages: status === "ERROR" ? ["Провайдер вернул ошибку при создании счёта: timeout"] : [],
    client: null,
    linkedIds: [],
    createdDate,
    createdAt: formatDateTime(createdDate),
    updatedDate,
    updatedAt: formatDateTime(updatedDate),
  };
});

// ---- Корреспондентские (ностро) ---------------------------------------------------------------
// [индекс провайдера, валюты, тег, статус]
const ACC_NOSTRO_SPECS = [
  [0, ["RUB"], null, "ACTIVE"],
  [1, ["USD", "EUR"], null, "ACTIVE"],
  [2, ["USD"], null, "ACTIVE"],
  [2, ["EUR"], null, "ACTIVE"],
  [2, ["RUB"], null, "FROZEN"],
  [3, ["USD", "EUR", "RUB", "KGS"], "CASH_LIQUIDITY_POOL", "ACTIVE"],
  [4, ["USDT"], "CP_LIQUIDITY_POOL", "ACTIVE"],
  [1, ["USD"], null, "ERROR"],
  [0, ["RUB"], null, "CLOSED"],
  [2, ["KGS"], null, "ACTIVE"],
];
const ACCOUNTS_NOSTRO_MOCK = ACC_NOSTRO_SPECS.map(([providerIdx, currencies, tag, status], i) => {
  const seed = i + 1;
  const provider = ACC_PROVIDERS[providerIdx];
  const createdDate = new Date(MOCK_NOW.getTime() - (seed * 47 + 200) * 60 * 60 * 1000);
  const updatedDate = new Date(MOCK_NOW.getTime() - seed * 5.5 * 60 * 60 * 1000);
  const restricted = status === "FROZEN";
  return {
    id: seedToPaymentUuid(5000 + seed),
    code: entityCode("ACN", 5000 + seed),
    kind: "correspondent",
    provider,
    providerExternalId: `NST-${(seed * 4093) % 90000 + 10000}`,
    type: "NOSTRO",
    ledgerType: "ACTIVE",
    status,
    tag,
    description: tag ? `${provider.name}: пул ликвидности` : `Bank's nostro account with ${provider.name}`,
    rails: provider.rails,
    depositSets: accBuildDepositSets(provider, currencies, seed + 60),
    balances: accMakeBalances(currencies, seed, { zero: status === "CLOSED" || status === "ERROR", big: true, realType: provider.group === "CRYPTO" || provider.group === "CASH" ? "HOT_WALLET" : "SERVICE_ADDRESS" }),
    restrictionReason: restricted ? "COMPLIANCE_REVIEW" : null,
    restrictionDetails: restricted ? "Приостановлено до завершения проверки банком-корреспондентом" : null,
    references: [],
    errorMessages: status === "ERROR" ? ["Не удалось получить остаток у провайдера: 503 Service Unavailable"] : [],
    client: null,
    linkedIds: [],
    createdDate,
    createdAt: formatDateTime(createdDate),
    updatedDate,
    updatedAt: formatDateTime(updatedDate),
  };
});

// ---- Виртуальные счета ----------------------------------------------------------------------------------
const ACC_SERVICE_VIRTUALS = [
  ["PAYABLE_TO_CUSTOMER", "PASSIVE", "Кредиторская задолженность перед клиентами", "SYSTEM"],
  ["CUSTOMER_INCOMING_TRANSACTION_REVENUE", "PASSIVE", "Доход по входящим транзакциям", "SERVICE"],
  ["CUSTOMER_OUTGOING_TRANSACTION_REVENUE", "PASSIVE", "Доход по исходящим транзакциям", "SERVICE"],
  ["CP_LIQUIDITY_POOL", "ACTIVE", "Мастер-пул ликвидности (виртуальный)", "SYSTEM"],
];

function accClientRef(seed) {
  if (seed % 3 === 0) {
    const c = CLIENTS_COMPANIES_MOCK[seed % CLIENTS_COMPANIES_MOCK.length];
    return { id: c.id, code: c.code, name: c.name, legalType: "CORPORATE", link: `#/clients-companies/${c.id}` };
  }
  const u = CLIENTS_USERS_MOCK[seed % CLIENTS_USERS_MOCK.length];
  return { id: u.id, code: u.code, name: u.fullName || u.email, legalType: "INDIVIDUAL", link: `#/clients-users/${u.id}` };
}

const ACCOUNTS_VIRTUAL_MOCK = Array.from({ length: 40 }).map((_, i) => {
  const seed = i + 1;
  const svc = i >= 36 ? ACC_SERVICE_VIRTUALS[i - 36] : null;
  const client = svc ? ACC_SERVICE_CLIENT : accClientRef(seed);
  const isCrypto = !svc && seed % 4 === 0;
  const currencies = svc ? pick([["USD", "EUR", "RUB"], ["USD", "RUB"], ["USD"]], seed) : isCrypto ? ["USDT"] : pick([["USD"], ["EUR"], ["RUB"], ["KGS"], ["USD", "EUR"], ["USD", "RUB", "KGS"]], seed);
  const status = svc ? "ACTIVE" : pick(["ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "FROZEN", "DISABLED", "CLOSED", "ARCHIVED", "ERROR"], seed * 7);
  const restricted = status === "FROZEN" || status === "DISABLED";
  const createdDate = new Date(MOCK_NOW.getTime() - seed * 17.9 * 60 * 60 * 1000);
  const updatedDate = new Date(createdDate.getTime() + (10 + (seed % 120)) * 60 * 1000);
  return {
    id: seedToPaymentUuid(6000 + seed),
    code: entityCode("ACC", 6000 + seed),
    kind: "virtual",
    client,
    type: svc ? svc[3] : "CLIENT",
    category: svc || seed % 7 !== 0 ? "PRIMARY" : "SECONDARY",
    ledgerType: svc ? svc[1] : "ACTIVE",
    status,
    tag: svc ? svc[0] : isCrypto ? "CUSTOMER_CRYPTO_WALLET" : "CUSTOMER_FIAT_ACCOUNT",
    description: svc ? svc[2] : isCrypto ? "Крипто-кошелёк" : seed % 5 === 0 ? "Транзитный счёт" : "Основной счёт",
    balances: accMakeBalances(currencies, seed, { zero: status === "CLOSED" || status === "ARCHIVED" || status === "ERROR", big: !!svc }),
    restrictionReason: restricted ? pick(ACC_RESTRICTION_REASONS, seed) : null,
    restrictionDetails: restricted && seed % 2 === 1 ? "Запрос дополнительных документов у клиента" : null,
    references: seed % 5 === 0 ? [{ name: "legacyAccountId", value: `BB-${20000 + seed * 19}` }] : [],
    errorMessages: status === "ERROR" ? ["Создание счёта у провайдера не завершилось: timeout"] : [],
    depositDetails: [],
    parentId: null,
    linkedIds: [],
    createdDate,
    createdAt: formatDateTime(createdDate),
    updatedDate,
    updatedAt: formatDateTime(updatedDate),
  };
});

// Дерево: несколько дочерних счетов у клиентских счетов того же клиента
[[8, 5], [17, 12], [26, 21], [33, 30]].forEach(([child, parent]) => {
  const c = ACCOUNTS_VIRTUAL_MOCK[child];
  const p = ACCOUNTS_VIRTUAL_MOCK[parent];
  c.parentId = p.id;
  c.client = p.client;
  c.description = "Дочерний счёт";
});

// Связи виртуальный ↔ реальный/ностро (многие-ко-многим), реквизиты для пополнения
const ACC_ALL_REAL_SIDE = [...ACCOUNTS_REAL_MOCK, ...ACCOUNTS_NOSTRO_MOCK];
ACCOUNTS_VIRTUAL_MOCK.forEach((v, i) => {
  const seed = i + 1;
  const nostro = ACCOUNTS_NOSTRO_MOCK[seed % ACCOUNTS_NOSTRO_MOCK.length];
  const real = ACCOUNTS_REAL_MOCK[(seed * 3) % ACCOUNTS_REAL_MOCK.length];
  const links = v.type === "CLIENT" ? [nostro, real] : [nostro];
  if (seed % 6 === 0) links.push(ACCOUNTS_REAL_MOCK[(seed * 5 + 1) % ACCOUNTS_REAL_MOCK.length]);
  const unique = [...new Set(links)];
  v.linkedIds = unique.map((r) => r.id);
  unique.forEach((r) => { if (!r.linkedIds.includes(v.id)) r.linkedIds.push(v.id); });
  if (v.type === "CLIENT" && v.status === "ACTIVE") {
    v.depositDetails = v.balances.map((b, idx) => ({ currency: b.currency, ...accDepositDetails(b.currency, seed + idx) }));
  }
});
// Клиент реального счёта с клиентским тегом — клиент первого связанного виртуального
ACCOUNTS_REAL_MOCK.forEach((r) => {
  if (r.tag === "CUSTOMER_FIAT_ACCOUNT" || r.tag === "CP_SENDER_CLIENT" || r.tag === "CP_RECIPIENT_CLIENT") {
    const v = ACCOUNTS_VIRTUAL_MOCK.find((x) => r.linkedIds.includes(x.id) && x.type === "CLIENT");
    if (v) r.client = v.client;
  }
});

// ---- Проводки ---------------------------------------------------------------------------------------------------
const ACC_TX_STATUS_TO_OPERATION = { CONFIRMED: "COMPLETED", PENDING: "PROCESSING", PROCESSING: "PROCESSING", DECLINED: "DECLINED", ERROR: "ERROR" };
const ACC_TX_STATUS_POOL = ["CONFIRMED", "CONFIRMED", "CONFIRMED", "CONFIRMED", "CONFIRMED", "CONFIRMED", "PENDING", "PROCESSING", "DECLINED", "ERROR"];
const ACC_FIAT_OPERATIONS = [
  { name: "Incoming payment", dir: "in", payment: true },
  { name: "Outgoing payment", dir: "out", payment: true },
  { name: "Outgoing payment", dir: "out", payment: true },
  { name: "Incoming payment", dir: "in", payment: true },
];
const ACC_CRYPTO_OPERATIONS = [
  { name: "CRYPTO_WALLET.CUSTOMER_DEPOSIT", dir: "in" },
  { name: "CRYPTO_WALLET.CUSTOMER_WITHDRAWAL", dir: "out" },
  { name: "CRYPTO_WALLET.CUSTOMER_TRANSFER", dir: "out" },
  { name: "CRYPTO_ACQUIRING.CUSTOMER_INVOICE", dir: "in" },
  { name: "CRYPTO_WALLET.TRANSFER_TO_MASTER", dir: "out" },
];

function accBuildTransactions(account, seedBase) {
  const empty = account.status === "ARCHIVED" || account.status === "ERROR";
  const count = empty ? 0 : account.status === "CLOSED" ? 3 : 7 + (seedBase % 9);
  const increaseSide = account.ledgerType === "ACTIVE" ? "DEBIT" : "CREDIT";
  const isReal = account.kind !== "virtual";
  return Array.from({ length: count })
    .map((_, j) => {
      const s = seedBase * 31 + j;
      const balance = pick(account.balances, s);
      const currency = balance.currency;
      const ops = currency === "USDT" ? ACC_CRYPTO_OPERATIONS : ACC_FIAT_OPERATIONS;
      const op = pick(ops, s);
      const status = pick(ACC_TX_STATUS_POOL, s * 3);
      const scale = account.kind === "correspondent" ? 40 : 1;
      const amount = +((80 + ((s * 517) % 7900)) * scale + ((s * 7) % 100) / 100).toFixed(2);
      const createdDate = new Date(MOCK_NOW.getTime() - (j * 19 + (seedBase % 7)) * 60 * 60 * 1000 - (s % 50) * 60 * 1000);
      const payment = op.payment ? pick(OPERATIONS_PAYMENTS_MOCK, s * 5) : null;
      return {
        id: seedToPaymentUuid(7000 + seedBase * 100 + j),
        accountId: account.id,
        operation: { id: seedToPaymentUuid(8000 + seedBase * 100 + j), code: entityCode("VBO", 8000 + seedBase * 100 + j), name: op.name, status: ACC_TX_STATUS_TO_OPERATION[status] },
        paymentId: payment ? payment.id : null,
        order: 1 + (s % 4),
        transferType: op.dir === "in" ? increaseSide : increaseSide === "DEBIT" ? "CREDIT" : "DEBIT",
        amount,
        currency,
        status,
        previousStatus: status === "CONFIRMED" && s % 4 === 0 ? "PENDING" : null,
        providerTxId: isReal ? `PRV-${(s * 2654435) % 9000000 + 1000000}` : null,
        description: op.dir === "in" ? "Поступление" : "Списание",
        createdDate,
        createdAt: formatDateTime(createdDate),
      };
    })
    .sort((a, b) => b.createdDate - a.createdDate);
}

const ACCOUNT_TRANSACTIONS = {};
ACCOUNTS_VIRTUAL_MOCK.forEach((a, i) => { ACCOUNT_TRANSACTIONS[a.id] = accBuildTransactions(a, i + 1); });
ACCOUNTS_REAL_MOCK.forEach((a, i) => { ACCOUNT_TRANSACTIONS[a.id] = accBuildTransactions(a, i + 101); });
ACCOUNTS_NOSTRO_MOCK.forEach((a, i) => { ACCOUNT_TRANSACTIONS[a.id] = accBuildTransactions(a, i + 201); });

// ---- Доступ ------------------------------------------------------------------------------------------------------------
function accAllAccounts() {
  return [...ACCOUNTS_VIRTUAL_MOCK, ...ACCOUNTS_REAL_MOCK, ...ACCOUNTS_NOSTRO_MOCK];
}

function accFind(kind, id) {
  const source = kind === "virtual" ? ACCOUNTS_VIRTUAL_MOCK : kind === "real" ? ACCOUNTS_REAL_MOCK : kind === "correspondent" ? ACCOUNTS_NOSTRO_MOCK : accAllAccounts();
  return source.find((a) => a.id === id) || null;
}
