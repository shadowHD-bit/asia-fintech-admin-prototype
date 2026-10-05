/* ==========================================================================
   Финансовые отчёты. Назначение и контракт восстановлены по READ-ONLY
   бэкендам (bb2/vabs, доступ только на чтение — см. правила проекта):
   - apps/acl: фича VabsFeatureCodeEnum.VABS_REPORT ("Финансовые отчёты"),
     только WRITE (страница существует, чтобы СГЕНЕРИРОВАТЬ отчёт, отдельной
     ручки на чтение цифр нет), страница bo_reports ("/vabs/panel/reports"),
     роль "Казначей" — основной держатель права.
   - apps/files-api: 8 готовых шаблонов отчётов (папка documents/templates/
     common-payments): trial-balance, balance-sheet, profit-and-loss,
     cash-flow, balance-snapshot, client-balances, deal-registry,
     operation-type-turnover — плюс otc-deal-receipt (не отчёт, разовая
     квитанция по сделке).
   - tools/federation/subgraphs/vabs.graphql: мутация
     vabsGenerateFinancialReport(VabsGenerateFinancialReportInput) — общие
     параметры отчётов (report, format, period, currencyIds, operationTypes,
     clientIds, accountClasses, accountIds, hideZero).
   Сама логика расчёта отчётов (запросы к леджеру) лежит в соседнем сервисе
   vabs, а не в bb2 — её содержимое READ-ONLY доступом не открывается, поэтому
   расчёты в прототипе собраны заново из данных, которые у нас реально есть.

   В этом заходе реализованы 5 из 8 отчётов бэкенда — те, для которых в
   прототипе есть на что опереться:
   - "Снимок балансов" — assets/mock/accounts.mock.js (текущие остатки счёта).
   - "Клиентские остатки и обороты" — остатки из accounts.mock.js + реальные
     проводки vABS (assets/mock/settings-vabs.mock.js, VB_OPERATIONS).
   - "Реестр сделок" и "Обороты по типам операций" — те же источники, что и
     "Аналитика → Операции" (assets/mock/operations-payments.mock.js,
     operations-exchanges.mock.js, otc-deals.mock.js), плюс попытка реального
     расчёта комиссии через тарифный движок (assets/mock/settings-tariffs.mock.js,
     tfTotalFee) там, где операцию и клиента можно сопоставить с тарифом.
   - "Оборотно-сальдовая ведомость" (добавлена 2026-10-02, после того как в
     прототипе появился "Бухгалтерия → План счетов"; пересчитана 2026-10-05
     после отказа от отдельной Главной книги) — реальные проводки ВА/РА из
     assets/mock/accounts.mock.js (ACCOUNT_TRANSACTIONS) через coaTxOfAccount,
     сгруппированные по счёту плана счетов и валюте, см. frTrialBalanceRows ниже.
   Балансовый отчёт, P&L и cash flow из каталога бэкенда сюда пока не входят —
   у плана счетов есть классификация (класс/сторона), но нет ещё одной
   дополнительной сущности из §5 бэкенда (account_role/account_kind) и шаблона
   строк отчёта (row_aggr_type из budget-спеки) — это следующий шаг, не
   реализовано в этом заходе. ГРАНИЦА ПРОТОТИПА, полная спецификация и
   таблица допущений — docs/financial-reports-spec.md.

   Экспорт — только XLSX (exportTable из assets/components/export.js), без
   выбора формата: по просьбе пользователя первой сделана только эта выгрузка.
   ========================================================================== */

function frT() {
  return t("financialReports");
}

// ---- Состояние экрана (общие фильтры для всех отчётов; часть фильтров
// применима не ко всем отчётам — см. FR_REPORTS[].filters) --------------------
let frReport = "balanceSnapshot";
let frPeriod = "days30";
let frCurrency = "all";
let frAccountKind = "all"; // virtual | real | nostro | all
let frOpCategory = "all"; // fiat | crypto | exchanges | otc | all
let frClientQuery = "";

// Код клиента (USR-.../CMP-...) по id — в проводках отчётов клиент известен только по id/имени
function frClientCode(clientId) {
  const u = CLIENTS_USERS_MOCK.find((x) => x.id === clientId);
  if (u) return u.code;
  const c = CLIENTS_COMPANIES_MOCK.find((x) => x.id === clientId);
  return c ? c.code : null;
}

function frPeriodFrom(period) {
  if (period === "all") return null;
  const days = period === "days7" ? 7 : period === "days30" ? 30 : 90;
  return new Date(MOCK_NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

// ============================================================================
// 1. Снимок балансов — по каждому счёту и валюте, на текущий момент. Реальные
// данные счетов (accounts.mock.js): available/hold/total уже посчитаны там же,
// где их показывает раздел "Счета".
// ============================================================================
function frBalanceSnapshotRows() {
  const sets = [
    ["virtual", ACCOUNTS_VIRTUAL_MOCK],
    ["real", ACCOUNTS_REAL_MOCK],
    ["nostro", ACCOUNTS_NOSTRO_MOCK],
  ];
  const rows = [];
  sets.forEach(([kind, list]) => {
    if (frAccountKind !== "all" && frAccountKind !== kind) return;
    list.forEach((a) => {
      a.balances.forEach((b) => {
        if (frCurrency !== "all" && b.currency !== frCurrency) return;
        rows.push({ accountId: a.id, accountCode: a.code, accountKind: kind, accountType: a.type, ledgerType: a.ledgerType, currency: b.currency, available: b.available, reserved: b.hold, total: b.total });
      });
    });
  });
  return rows;
}

// ---- Проводки vABS одного счёта (виртуальный якорь или реальная нога) --------
function frLegsOfAccount(accountId, kind) {
  const out = [];
  VB_OPERATIONS.forEach((op) => {
    (kind === "virtual" ? op.virtualLegs : op.realLegs).forEach((l) => { if (l.accountId === accountId) out.push(l); });
  });
  return out;
}

// ============================================================================
// 2. Клиентские остатки и обороты — по клиентскому (виртуальному) счёту и
// валюте. Остаток на конец — реальный текущий остаток счёта; обороты по
// дебету/кредиту за период — сумма реальных проводок vABS счёта за период;
// остаток на начало периода восстановлен «назад» от текущего остатка по
// знаку проводки (тот же принцип, что и accounts.js: DEBIT на активном счёте
// увеличивает остаток). Служебные счета банка (пул обязательств, доход) в
// отчёт не попадают — это не клиентские остатки.
// ============================================================================
function frClientTurnoverRows() {
  const from = frPeriodFrom(frPeriod);
  if (frAccountKind !== "all" && frAccountKind !== "virtual") return [];
  const rows = [];
  ACCOUNTS_VIRTUAL_MOCK.forEach((a) => {
    if (!a.client || a.client.id === ACC_SERVICE_CLIENT.id) return;
    const incomingSide = a.ledgerType === "ACTIVE" ? "DEBIT" : "CREDIT";
    const byCurrency = {};
    a.balances.forEach((b) => { byCurrency[b.currency] = { available: b.available, reserved: b.hold, total: b.total, debit: 0, credit: 0 }; });
    frLegsOfAccount(a.id, "virtual").forEach((l) => {
      if (from && l.createdDate < from) return;
      const row = byCurrency[l.currency] || (byCurrency[l.currency] = { available: 0, reserved: 0, total: 0, debit: 0, credit: 0 });
      if (l.transferType === "DEBIT") row.debit += l.amount; else row.credit += l.amount;
    });
    Object.keys(byCurrency).forEach((cur) => {
      if (frCurrency !== "all" && cur !== frCurrency) return;
      const r = byCurrency[cur];
      const netChange = incomingSide === "DEBIT" ? r.debit - r.credit : r.credit - r.debit;
      rows.push({
        clientId: a.client.id, clientCode: a.client.code, clientName: a.client.name, legalType: a.client.legalType, accountId: a.id, accountCode: a.code,
        currency: cur, opening: +(r.total - netChange).toFixed(2), debitTurnover: +r.debit.toFixed(2),
        creditTurnover: +r.credit.toFixed(2), closing: r.total, reserved: r.reserved,
      });
    });
  });
  if (!frClientQuery.trim()) return rows;
  const q = frClientQuery.trim().toLowerCase();
  return rows.filter((r) => (r.clientName || "").toLowerCase().includes(q) || (r.clientId || "").toLowerCase().includes(q) || (r.clientCode || "").toLowerCase().includes(q));
}

// ---- Тарифный движок: попытка сопоставить операцию с реальным тарифом клиента ----
// Клиент → уровень (KYC/KYB/риск), тот же признак, что и у условий тарифа в
// settings-tariffs.mock.js; связи "id клиента = id клиента в tariffs" в
// прототипе нет (клиенты тарифов — свой отдельный мок TF_CLIENTS), поэтому
// сопоставляем не по id, а по уровню — так же, как сам тариф назначается
// клиенту в реальной системе (по условиям, а не по прямой ссылке).
function frClientLevelInfo(clientId, clientType) {
  if (!clientId) return null;
  if (clientType === "CORPORATE") {
    const c = CLIENTS_COMPANIES_MOCK.find((x) => x.id === clientId);
    return c ? { legal: "CORPORATE", kybLevel: c.kybLevel, riskLevel: c.scoringRiskLevel } : null;
  }
  const u = CLIENTS_USERS_MOCK.find((x) => x.id === clientId);
  return u ? { legal: "INDIVIDUAL", kycLevel: u.kycLevel, riskLevel: u.scoringRiskLevel } : null;
}

function frTariffForClientInfo(info) {
  if (!info) return null;
  if (info.legal === "CORPORATE") return tfTariffByName("Corporate Standard");
  if (["HIGH_RISK", "VERY_HIGH_RISK", "PROHIBITED_RISK"].includes(info.riskLevel)) return tfTariffByName("High risk");
  if (info.kycLevel === 3) return tfTariffByName("KYC Level 3");
  if (info.kycLevel === 2) return tfTariffByName("KYC Level 2");
  if (info.kycLevel === 1) return tfTariffByName("KYC Level 1");
  return null;
}

// paymentSystem/направление → код операции тарифов (TF_FIAT_OPS); только
// рельсы, которые в модуле tariffs вообще описаны (SBP/CARD_NUMBER/CASH) —
// у SWIFT/WIRE/ACH/INNER тарифа в модуле нет, это честная находка, не пробел прототипа.
function frFiatTariffOp(paymentSystem, direction) {
  if (direction === "BOTH") return null;
  const suffix = { SBP: "SBP", CARD_NUMBER: "CARD_NUMBER", CASH: "CASH" }[paymentSystem];
  if (!suffix) return null;
  const name = `${direction === "INCOMING" ? "INCOMING" : "OUTGOING"}_${suffix}`;
  return TF_FIAT_OPS.includes(name) ? name : null;
}

function frCryptoTariffOp(cryptoOperationType) {
  return { CUSTOMER_WITHDRAWAL: "NEURON_CRYPTO_OUT", CUSTOMER_DEPOSIT: "NEURON_CRYPTO_IN", CUSTOMER_TRANSFER: "NEURON_CRYPTO_TRANSFER" }[cryptoOperationType] || null;
}

// Возвращает {amount, currency, source: "tariff"|"mock"} — реальная комиссия
// по тарифу, где сопоставление удалось, иначе комиссия, уже посчитанная в
// моке самой операции (feeAmount/fee) — см. financialReports.notes.opTypeTurnover.
function frResolveRevenue(row, category) {
  const fallback = { amount: row.feeAmount != null ? row.feeAmount : row.fee, currency: row.feeCurrency || row.sourceCurrency || row.baseCurrencyTicker, source: "mock" };
  if (category !== "fiat" && category !== "crypto") return fallback;
  const opName = category === "fiat" ? frFiatTariffOp(row.paymentSystem, row.direction) : frCryptoTariffOp(row.cryptoOperationType);
  if (!opName) return fallback;
  const clientId = row.direction === "INCOMING" ? row.recipientClientId : row.senderClientId;
  const clientType = row.direction === "INCOMING" ? row.recipientClientType : row.senderClientType;
  const tariff = frTariffForClientInfo(frClientLevelInfo(clientId, clientType));
  if (!tariff) return fallback;
  const result = tfTotalFee(tariff.id, opName, row.sourceCurrency, row.sourceAmount, clientId);
  if (!result) return fallback;
  return { amount: result.totalFee, currency: row.sourceCurrency, source: "tariff" };
}

// ---- Общий источник для "Реестр сделок" и "Обороты по типам операций" -------
function frCategoryLists() {
  return [
    ["fiat", OPERATIONS_PAYMENTS_MOCK.filter((r) => !isCryptoPayment(r))],
    ["crypto", OPERATIONS_PAYMENTS_MOCK.filter(isCryptoPayment)],
    ["exchanges", OPERATIONS_EXCHANGES_MOCK],
    ["otc", OTC_DEALS_MOCK],
  ];
}

function frRowStatusLabel(r, cat) {
  return cat === "otc" ? otcEnum("status", r.status) : paymentStatusLabel(r.status);
}

function frRowTypeLabel(r, cat) {
  const c = frT().categories;
  if (cat === "fiat") return `${c.fiat} · ${paymentSystemLabel(r.paymentSystem)}`;
  if (cat === "crypto") return `${c.crypto} · ${t(`operationsPayments.cryptoOperation.${r.cryptoOperationType}`)}`;
  if (cat === "exchanges") return `${c.exchanges} · ${r.sourceCurrency} → ${r.targetCurrency}`;
  return `${c.otc} · ${otcEnum("type", r.type)}`;
}

// Одна операция → одна или две "ноги" проводки (валюта + дебет/кредит +
// клиент этой стороны) — то же дробление, что у настоящей двойной записи:
// обмен и OTC двигают ДВЕ разные валюты по разным сторонам сделки, фиат/крипто —
// одну валюту (BOTH — внутренний перевод — сразу и дебет у одной стороны, и
// кредит у другой).
function frRowLegs(r, cat) {
  if (cat === "exchanges") {
    return [
      { currency: r.sourceCurrency, debit: r.sourceAmount, credit: 0, clientId: r.senderClientId, clientName: r.senderClientName },
      { currency: r.targetCurrency, debit: 0, credit: r.targetAmount, clientId: r.recipientClientId, clientName: r.recipientClientName },
    ];
  }
  if (cat === "otc") {
    return [
      { currency: r.baseCurrencyTicker, debit: r.amount, credit: 0, clientId: r.sellerUserId, clientName: r.sellerName },
      { currency: r.quoteCurrencyTicker, debit: 0, credit: r.cost, clientId: r.buyerUserId, clientName: r.buyerName },
    ];
  }
  const cur = r.totalCurrency || r.sourceCurrency;
  const amt = r.sourceAmount;
  if (r.direction === "OUTGOING") return [{ currency: cur, debit: amt, credit: 0, clientId: r.senderClientId, clientName: r.senderClientName }];
  if (r.direction === "INCOMING") return [{ currency: cur, debit: 0, credit: amt, clientId: r.recipientClientId, clientName: r.recipientClientName }];
  return [
    { currency: cur, debit: amt, credit: 0, clientId: r.senderClientId, clientName: r.senderClientName },
    { currency: cur, debit: 0, credit: amt, clientId: r.recipientClientId, clientName: r.recipientClientName },
  ];
}

// ============================================================================
// 3. Реестр сделок — построчный журнал проводок (ног) по операциям всех
// четырёх видов. Источники — те же моки, что у "Аналитика → Операции".
// ============================================================================
function frDealRegistryRows() {
  const from = frPeriodFrom(frPeriod);
  const rows = [];
  frCategoryLists().forEach(([cat, list]) => {
    if (frOpCategory !== "all" && frOpCategory !== cat) return;
    list.forEach((r) => {
      const d = r.createdDate;
      if (from && d < from) return;
      frRowLegs(r, cat).forEach((leg) => {
        if (frCurrency !== "all" && leg.currency !== frCurrency) return;
        rows.push({
          date: d, operationId: r.id, operationCode: r.code, operationType: frRowTypeLabel(r, cat), clientId: leg.clientId || null,
          clientCode: leg.clientId ? frClientCode(leg.clientId) : null,
          clientName: leg.clientName || null, currency: leg.currency, debitTurnover: leg.debit, creditTurnover: leg.credit,
          status: frRowStatusLabel(r, cat),
        });
      });
    });
  });
  if (frClientQuery.trim()) {
    const q = frClientQuery.trim().toLowerCase();
    return rows
      .filter((row) => (row.clientName || "").toLowerCase().includes(q) || (row.clientId || "").toLowerCase().includes(q))
      .sort((a, b) => b.date - a.date);
  }
  return rows.sort((a, b) => b.date - a.date);
}

// ============================================================================
// 4. Обороты по типам операций — по каждому виду и валюте: число операций,
// обороты по дебету/кредиту (та же разбивка на "ноги", что и в реестре
// сделок) и комиссионный доход (см. frResolveRevenue). Расходы не смоделированы.
// ============================================================================
function frOpTypeTurnoverRows() {
  const from = frPeriodFrom(frPeriod);
  const rows = [];
  frCategoryLists().forEach(([cat, list]) => {
    if (frOpCategory !== "all" && frOpCategory !== cat) return;
    const buckets = {};
    list.forEach((r) => {
      const d = r.createdDate;
      if (from && d < from) return;
      const legs = frRowLegs(r, cat);
      let counted = false;
      legs.forEach((leg) => {
        if (frCurrency !== "all" && leg.currency !== frCurrency) return;
        const b = (buckets[leg.currency] = buckets[leg.currency] || { count: 0, debit: 0, credit: 0, revenue: 0, tariffCount: 0, totalCount: 0 });
        b.debit += leg.debit;
        b.credit += leg.credit;
        if (!counted) { b.count += 1; counted = true; }
      });
      const rev = frResolveRevenue(r, cat);
      const bucket = buckets[rev.currency];
      if (bucket && (frCurrency === "all" || rev.currency === frCurrency)) {
        bucket.revenue += rev.amount || 0;
        bucket.totalCount += 1;
        if (rev.source === "tariff") bucket.tariffCount += 1;
      }
    });
    Object.keys(buckets).forEach((cur) => {
      const b = buckets[cur];
      rows.push({
        category: cat, currency: cur, count: b.count, debitTurnover: +b.debit.toFixed(2), creditTurnover: +b.credit.toFixed(2),
        revenue: +b.revenue.toFixed(2), revenueSource: b.totalCount ? `${Math.round((b.tariffCount / b.totalCount) * 100)}% ${frT().revenueSource.tariff}` : "—",
        expense: 0,
      });
    });
  });
  return rows;
}

// ============================================================================
// 5. Оборотно-сальдовая ведомость — по каждому счёту плана счетов (ANALYTICAL/
// TECHNICAL, группы не включены — их остаток уже виден как сумма детей на
// карточке счёта в "План счетов") и валюте: входящий остаток считается по
// проводкам ДО начала периода, обороты — по проводкам ВНУТРИ периода,
// исходящий = входящий + чистый оборот (знак — по normalBalance счёта, как и
// в coaBalancesByCurrency). Источник — те же реальные проводки ВА/РА
// (coaTxOfAccount/ACCOUNT_TRANSACTIONS), что и остатки в "План счетов", без
// отдельной Главной книги — см. заголовок accounting-coa.mock.js (05.10.2026).
// ============================================================================
function frTrialBalanceRows() {
  const from = frPeriodFrom(frPeriod);
  const rows = [];
  COA_ACCOUNTS.filter((a) => a.nodeType !== "GROUP").forEach((a) => {
    const normalFactor = a.normalBalance === "DEBIT" ? 1 : -1;
    const byCurrency = {};
    coaTxOfAccount(a).filter((tx) => tx.status === "CONFIRMED").forEach((tx) => {
      if (frCurrency !== "all" && tx.currency !== frCurrency) return;
      const b = (byCurrency[tx.currency] = byCurrency[tx.currency] || { opening: 0, debit: 0, credit: 0 });
      const isDebitSide = tx.transferType === "DEBIT";
      if (from && tx.createdDate < from) {
        b.opening += (isDebitSide ? 1 : -1) * normalFactor * tx.amount;
      } else if (!from || tx.createdDate >= from) {
        if (isDebitSide) b.debit += tx.amount; else b.credit += tx.amount;
      }
    });
    Object.keys(byCurrency).forEach((cur) => {
      const b = byCurrency[cur];
      const closing = b.opening + (b.debit - b.credit) * normalFactor;
      if (!b.opening && !b.debit && !b.credit && !closing) return;
      rows.push({
        accountCode: a.code, accountName: a.name, category: a.category, normalBalance: a.normalBalance, currency: cur,
        opening: +b.opening.toFixed(2), debitTurnover: +b.debit.toFixed(2), creditTurnover: +b.credit.toFixed(2), closing: +closing.toFixed(2),
      });
    });
  });
  return rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

// ============================================================================
// Определение отчётов экрана: строки предпросмотра/экспорта, применимые
// фильтры и заголовки колонок (переиспользуются и таблицей на экране, и XLSX).
// ============================================================================
function frReportDefs() {
  const f = frT();
  return {
    balanceSnapshot: {
      title: f.reports.balanceSnapshot.title, desc: f.reports.balanceSnapshot.desc, note: f.notes.balanceSnapshot,
      filters: { period: false, currency: true, accountKind: true, opCategory: false, client: false },
      columns: Object.values(f.columns.balanceSnapshot),
      rows: frBalanceSnapshotRows,
      toRow: (r) => [r.accountCode, f.kinds[r.accountKind], r.accountType || "", accEnum("ledger", r.ledgerType), r.currency, r.available, r.reserved, r.total],
    },
    clientTurnover: {
      title: f.reports.clientTurnover.title, desc: f.reports.clientTurnover.desc, note: f.notes.clientTurnover,
      filters: { period: true, currency: true, accountKind: false, opCategory: false, client: true },
      columns: Object.values(f.columns.clientTurnover),
      rows: frClientTurnoverRows,
      toRow: (r) => [r.clientCode, r.clientName, r.legalType === "CORPORATE" ? "Юрлицо" : "Физлицо", r.accountCode, r.currency, r.opening, r.debitTurnover, r.creditTurnover, r.closing, r.reserved],
    },
    dealRegistry: {
      title: f.reports.dealRegistry.title, desc: f.reports.dealRegistry.desc, note: f.notes.dealRegistry,
      filters: { period: true, currency: true, accountKind: false, opCategory: true, client: true },
      columns: Object.values(f.columns.dealRegistry),
      rows: frDealRegistryRows,
      toRow: (r) => [formatDateTime(r.date), r.operationCode, r.operationType, r.clientCode || "", r.clientName || "", r.currency, r.debitTurnover || "", r.creditTurnover || "", r.status],
    },
    opTypeTurnover: {
      title: f.reports.opTypeTurnover.title, desc: f.reports.opTypeTurnover.desc, note: f.notes.opTypeTurnover,
      filters: { period: true, currency: true, accountKind: false, opCategory: true, client: false },
      columns: Object.values(f.columns.opTypeTurnover),
      rows: frOpTypeTurnoverRows,
      toRow: (r) => [f.categories[r.category], r.currency, r.count, r.debitTurnover, r.creditTurnover, r.revenue, r.revenueSource, r.expense],
    },
    trialBalance: {
      title: f.reports.trialBalance.title, desc: f.reports.trialBalance.desc, note: f.notes.trialBalance,
      filters: { period: true, currency: true, accountKind: false, opCategory: false, client: false },
      columns: Object.values(f.columns.trialBalance),
      rows: frTrialBalanceRows,
      toRow: (r) => [`${r.accountCode} · ${r.accountName}`, co(`category.${r.category}`), co(`normalBalance.${r.normalBalance}`), r.currency, r.opening, r.debitTurnover, r.creditTurnover, r.closing],
    },
  };
}

// ---- Разметка -----------------------------------------------------------------
const FR_PREVIEW_LIMIT = 20;

// Список валют для выпадающего списка — считается БЕЗ учёта текущего значения
// фильтра валюты (иначе после выбора одной валюты список схлопнулся бы до
// неё же: def.rows() сам уже отфильтрован по frCurrency).
function frAvailableCurrencies(rowsFn) {
  const saved = frCurrency;
  frCurrency = "all";
  const list = rowsFn();
  frCurrency = saved;
  return Array.from(new Set(list.map((r) => r.currency))).sort();
}

function frFilterBarHtml(def) {
  const f = frT();
  const parts = [];
  if (def.filters.period) {
    parts.push(`<div class="fr-filter"><span class="fr-filter-label">${f.filters.period}</span>${anPeriodTabsHtml("fr-period", frPeriod)}</div>`);
  }
  if (def.filters.currency) {
    const currencies = frAvailableCurrencies(def.rows);
    parts.push(`<div class="fr-filter"><span class="fr-filter-label">${f.filters.currency}</span><select class="address-form-input" id="fr-currency"><option value="all"${frCurrency === "all" ? " selected" : ""}>${f.filters.currencyAll}</option>${currencies.map((c) => `<option value="${c}"${frCurrency === c ? " selected" : ""}>${c}</option>`).join("")}</select></div>`);
  }
  if (def.filters.accountKind) {
    const kinds = ["virtual", "real", "nostro"];
    parts.push(`<div class="fr-filter"><span class="fr-filter-label">${f.filters.accountKind}</span><select class="address-form-input" id="fr-account-kind"><option value="all"${frAccountKind === "all" ? " selected" : ""}>${f.filters.all}</option>${kinds.map((k) => `<option value="${k}"${frAccountKind === k ? " selected" : ""}>${f.kinds[k]}</option>`).join("")}</select></div>`);
  }
  if (def.filters.opCategory) {
    const cats = ["fiat", "crypto", "exchanges", "otc"];
    parts.push(`<div class="fr-filter"><span class="fr-filter-label">${f.filters.opCategory}</span><select class="address-form-input" id="fr-op-category"><option value="all"${frOpCategory === "all" ? " selected" : ""}>${f.filters.all}</option>${cats.map((c) => `<option value="${c}"${frOpCategory === c ? " selected" : ""}>${f.categories[c]}</option>`).join("")}</select></div>`);
  }
  if (def.filters.client) {
    parts.push(`<div class="fr-filter fr-filter-grow"><span class="fr-filter-label">${f.filters.client}</span><input type="text" class="address-form-input" id="fr-client-query" placeholder="${f.filters.clientPlaceholder}" value="${escapeAttr(frClientQuery)}"></div>`);
  }
  return `<div class="fr-filters">${parts.join("")}</div>`;
}

function frTableHtml(def) {
  const f = frT();
  const allRows = def.rows();
  if (!allRows.length) return `<div class="dash-empty">${f.noData}</div>`;
  const shown = allRows.slice(0, FR_PREVIEW_LIMIT);
  return `
    <div class="table-scroll"><table class="data-table">
      <thead><tr>${def.columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${shown.map((r) => `<tr>${def.toRow(r).map((v) => `<td>${frFmtCell(v)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>
    ${allRows.length > shown.length ? `<div class="fr-preview-note">${f.previewNote(shown.length, allRows.length)}</div>` : ""}
  `;
}

function frFmtCell(v) {
  if (typeof v === "number") return formatPaymentAmount(v);
  return v === null || v === undefined || v === "" ? `<span class="table-cell-muted">—</span>` : pdEscape(String(v));
}

function viewFinancialReports() {
  const f = frT();
  const defs = frReportDefs();
  const def = defs[frReport];
  return `
    <div class="list-hero">${pageHeader(t("nav.financial-reports"), f.lead, sectionHintBtn("fr-hint-btn", f.info))}</div>
    <div class="quick-tabs fr-report-tabs">${Object.keys(defs).map((id) => `<button type="button" class="quick-tab${id === frReport ? " is-active" : ""}" data-fr-report="${id}">${defs[id].title}</button>`).join("")}</div>
    <div class="card fr-card">
      <div class="fr-card-head">
        <div>
          <h3 class="an-subsection-title">${def.title}</h3>
          <p class="an-subsection-desc">${def.desc}</p>
        </div>
        <button type="button" class="btn-secondary" id="fr-export-btn" title="${f.exportHint}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14v2h12v-2"/></svg>${f.exportButton}</button>
      </div>
      ${frFilterBarHtml(def)}
      ${frTableHtml(def)}
      <p class="fr-note">${def.note}</p>
    </div>
  `;
}

function frRefresh() {
  const container = document.getElementById("view-container");
  if (container) { container.innerHTML = viewFinancialReports(); initFinancialReports(); }
}

function initFinancialReports() {
  document.querySelectorAll("[data-fr-report]").forEach((btn) => {
    btn.addEventListener("click", () => {
      frReport = btn.dataset.frReport;
      // Сбрасываем все фильтры при смене отчёта — иначе значение, оставшееся от
      // фильтра, которого у нового отчёта нет на экране (например "Вид счёта"),
      // тихо всё равно применяется внутри frClientTurnoverRows и рассинхронизирует
      // то, что видно, с тем, что реально выгружается.
      frPeriod = "days30";
      frCurrency = "all";
      frAccountKind = "all";
      frOpCategory = "all";
      frClientQuery = "";
      frRefresh();
    });
  });
  document.querySelectorAll("[data-fr-period]").forEach((btn) => {
    btn.addEventListener("click", () => { frPeriod = btn.dataset.frPeriod; frRefresh(); });
  });
  const currencySel = document.getElementById("fr-currency");
  if (currencySel) currencySel.addEventListener("change", () => { frCurrency = currencySel.value; frRefresh(); });
  const kindSel = document.getElementById("fr-account-kind");
  if (kindSel) kindSel.addEventListener("change", () => { frAccountKind = kindSel.value; frRefresh(); });
  const catSel = document.getElementById("fr-op-category");
  if (catSel) catSel.addEventListener("change", () => { frOpCategory = catSel.value; frRefresh(); });
  const clientInput = document.getElementById("fr-client-query");
  if (clientInput) {
    clientInput.addEventListener("input", () => { frClientQuery = clientInput.value; frRefresh(); });
    // курсор в конец поля после перерисовки — иначе он прыгает в начало при каждом вводе
    clientInput.focus();
    clientInput.setSelectionRange(clientInput.value.length, clientInput.value.length);
  }
  const exportBtn = document.getElementById("fr-export-btn");
  if (exportBtn) exportBtn.addEventListener("click", frExportCurrent);
}

function frExportCurrent() {
  const f = frT();
  const def = frReportDefs()[frReport];
  const rows = def.rows().map(def.toRow);
  const stamp = new Date().toISOString().slice(0, 10);
  exportTable(`financial_report_${frReport}_${stamp}`, "xlsx", def.columns, rows);
  showToast(f.exported(f.reports[frReport].title, rows.length));
}
