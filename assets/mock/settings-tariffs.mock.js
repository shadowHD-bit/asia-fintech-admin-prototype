/* ==========================================================================
   Моковые данные и расчёты для "Настройки системы → Тарифы" и "Маски тарифов" (сервис tariffs).
   Форма записей — сущности сервиса: tariffs, operations, tariff_operations, limits,
   limit-restrictions, change_limit_histories, commissions, commission_factors, clients,
   change_tariff_histories, operation_histories, masks, mask_rule_templates,
   mask_behaviour_parameters, mask_assignments.
   Спецификация: docs/settings-tariffs-spec.md.
   Реальное: поля и связи сущностей; операции (12 имён из реестра интеграции лимитов) и их статус
   интеграции; логика лимитов (периоды день/неделя/месяц/год с каскадом, min/max на одну
   операцию, базовая валюта и пересчёт, общий пул через привязку к нескольким операциям,
   скользящее окно, персональный лимит замещает общий, ограничения на значения, расход =
   PENDING + SUCCESSFUL, REJECTED освобождает, проверки соотношения значений и ограничений);
   логика комиссий (факторы по порядку, границы суммы, min/max, накопление суммы, базовая валюта);
   персональные тарифы (копия с переопределениями, защита от подмены и снятие); движок масок
   (ручное назначение → лучшая по числу совпадений RULE_BASED → DEFAULT по риску, задержка тарифа,
   рост риска отменяет задержку); значения лимитов из аналитики (крипто L1 1000/день и 5000/месяц,
   минимумы 30 и 10 USDT, СБП-депозит 850 000 ₽ за скользящие 7 дней, max 50 000 ₽, min 1000 ₽,
   вывод по реквизитам min 2000 ₽), заглушки 999999999 для «без ограничений».
   Условное: ID и даты, состав тарифов и их условия, права тарифа, значения комиссий (в
   документации приведён лишь пример 5%), лимиты для корпоративных клиентов и тарифа повышенного
   риска, сами клиенты и их история операций, курсы валют, ограничения на лимиты, маски, шаблоны
   и назначения. Должен загружаться после clients-users.mock.js и clients-companies.mock.js.
   ========================================================================== */

// Маски тарифов пока не нужны: экраны и связанные блоки скрыты флагом, код и данные сохранены
const TF_MASKS_ENABLED = false;

const TF_CATEGORIES = ["INDIVIDUAL", "CORPORATE"];
const TF_HISTORY_STATUSES = ["PENDING", "SUCCESSFUL", "REJECTED"];
const TF_STUB = 999999999; // заглушка «без ограничений» из документации
const TF_RATES = { USDT: 1, USD: 1, EUR: 1.08, RUB: 1 / 95, BTC: 60000, ETH: 3200, KGS: 1 / 87 };
const TF_TICKERS = Object.keys(TF_RATES);

function tfConvert(amount, from, to) {
  if (from === to) return amount;
  return (amount * TF_RATES[from]) / TF_RATES[to];
}

function tfRound(n) {
  return Math.round(n * 100) / 100;
}

function tfStamp(entity, created, updated) {
  entity.createdDate = created;
  entity.createdAt = formatDateTime(created);
  entity.updatedDate = updated || created;
  entity.updatedAt = formatDateTime(entity.updatedDate);
  return entity;
}

let tfSeq = 0;
function tfId() {
  tfSeq += 1;
  return seedToPaymentUuid(60000 + tfSeq);
}

const TF_D0 = new Date(2026, 2, 12, 10, 0);
const TF_D1 = new Date(2026, 6, 15, 12, 30);

// ---- Операции ----------------------------------------------------------------------------------
// [имя, описание, домен, направление, старт потока, статус интеграции лимитов]
const TF_OPERATION_SPECS = [
  ["OUTGOING_SBP", "Outgoing payment via SBP", "FIAT", "OUTGOING", "OUR", "YES"],
  ["OUTGOING_CARD_NUMBER", "Outgoing transfer to a card number", "FIAT", "OUTGOING", "OUR", "YES"],
  ["OUTGOING_REQUISITES", "Outgoing transfer by requisites", "FIAT", "OUTGOING", "OUR", "YES"],
  ["OUTGOING_CASH", "Cash withdrawal", "FIAT", "OUTGOING", "OUR", "YES"],
  ["NEURON_CRYPTO_OUT", "Crypto withdrawal", "CRYPTO", "OUTGOING", "OUR", "YES"],
  ["NEURON_CRYPTO_TRANSFER", "Internal crypto transfer between platform users", "CRYPTO", "TRANSFER", "OUR", "YES"],
  ["NEURON_CRYPTO_IN", "Crypto deposit", "CRYPTO", "DEPOSIT", "EXTERNAL", "PARTIAL"],
  ["INCOMING_SBP", "Deposit via SBP", "FIAT", "DEPOSIT", "OUR", "YES"],
  ["INCOMING_REQUISITES", "Deposit by requisites", "FIAT", "DEPOSIT", "OUR", "YES"],
  ["INCOMING_CARD_NUMBER", "Deposit from a card", "FIAT", "DEPOSIT", "EXTERNAL", "NO"],
  ["INCOMING_CASH", "Cash deposit", "FIAT", "DEPOSIT", "OUR", "YES"],
  ["CRYPTO_ACQUIRING_OFFCHAIN", "Off-chain crypto acquiring payment", "CRYPTO", "INTERNAL_PAYMENT", "OUR", "YES"],
];
const TF_OPERATIONS = TF_OPERATION_SPECS.map(([name, description, domain, direction, start, integration]) =>
  tfStamp({ id: tfId(), name, description, domain, direction, start, integration }, TF_D0, TF_D0)
);

function tfOperationById(id) {
  return TF_OPERATIONS.find((o) => o.id === id) || null;
}
function tfOperationByName(name) {
  return TF_OPERATIONS.find((o) => o.name === name) || null;
}

// ---- Ограничения лимитов ----------------------------------------------------------------------------
const TF_RESTRICTIONS = [
  ["Crypto self-limit cap", "Cap for self-configured crypto limits of individual clients", "USDT", 2000, 5000, 10000, 50000, null, null],
  ["Fiat self-limit cap", "Cap for self-configured fiat limits", "RUB", 500000, 1500000, 5000000, 30000000, 100, 1000000],
].map(([name, description, currencyTicker, maxDaily, maxWeekly, maxMonthly, maxAnnual, min, max]) =>
  tfStamp({ id: tfId(), name, description, currencyTicker, maxDaily, maxWeekly, maxMonthly, maxAnnual, min, max }, TF_D1)
);

function tfRestrictionById(id) {
  return TF_RESTRICTIONS.find((r) => r.id === id) || null;
}

// ---- Тарифы и связь с операциями ---------------------------------------------------------------------------
const TF_CRYPTO_OPS = ["NEURON_CRYPTO_OUT", "NEURON_CRYPTO_TRANSFER", "NEURON_CRYPTO_IN", "CRYPTO_ACQUIRING_OFFCHAIN"];
const TF_FIAT_OPS = ["OUTGOING_SBP", "OUTGOING_CARD_NUMBER", "OUTGOING_REQUISITES", "OUTGOING_CASH", "INCOMING_SBP", "INCOMING_REQUISITES", "INCOMING_CARD_NUMBER", "INCOMING_CASH"];

function tfPermissions(ops, extra) {
  return { railsOperations: { operations: ops }, ...extra };
}

// [имя, описание, категория, условия, операции, права-доп, создан]
const TF_TARIFF_SPECS = [
  ["KYC Level 1", "Tariff for clients with the first KYC level: crypto only", "INDIVIDUAL", { kycLevel: 1 }, ["NEURON_CRYPTO_OUT", "NEURON_CRYPTO_TRANSFER", "NEURON_CRYPTO_IN", "CRYPTO_ACQUIRING_OFFCHAIN"], { globalBlocks: { readOnlyAccountMode: false } }],
  ["KYC Level 2", "Tariff for clients with the second KYC level: crypto and fiat", "INDIVIDUAL", { kycLevel: 2 }, [...TF_CRYPTO_OPS, ...TF_FIAT_OPS], { scoringRules: { holdPeriodOnOutgoingPaymentsHours: 1 } }],
  ["KYC Level 3", "Tariff for clients with the third KYC level: widest limits", "INDIVIDUAL", { kycLevel: 3 }, [...TF_CRYPTO_OPS, ...TF_FIAT_OPS], { limits: { maximumUniqueBeneficiariesPerDay: 20 } }],
  ["High risk", "Restricted tariff for clients with a high risk score", "INDIVIDUAL", { riskScore: { gte: 5 } }, ["NEURON_CRYPTO_OUT", "NEURON_CRYPTO_IN"], { globalBlocks: { readOnlyAccountMode: false, withdrawStatus: "REVIEW" }, scoringRules: { holdPeriodOnOutgoingPaymentsHours: 24, requirePreApprovalForLargePayments: true, complianceOfficerNotification: true } }],
  ["Corporate Standard", "Base tariff for legal entities", "CORPORATE", { kybLevel: 1 }, [...TF_CRYPTO_OPS, ...TF_FIAT_OPS], { otherPermission: { forceTwoStepApproval: { enabled: true, authType: "Email" } } }],
];
const TF_TARIFFS = TF_TARIFF_SPECS.map(([name, description, clientCategory, conditions, ops, extra], i) =>
  tfStamp({ id: tfId(), name, description, clientCategory, conditions: JSON.stringify(conditions), permissions: tfPermissions(ops, extra), ownerClientId: null, sourceTariffId: null, deleted: false }, TF_D0, TF_D1)
);

const TF_TARIFF_OPS = []; // { id, tariffId, operationId }
TF_TARIFFS.forEach((t) => {
  t.permissions.railsOperations.operations.forEach((name) => {
    TF_TARIFF_OPS.push({ id: tfId(), tariffId: t.id, operationId: tfOperationByName(name).id });
  });
});

function tfTariffById(id) {
  return TF_TARIFFS.find((t) => t.id === id) || null;
}
function tfTariffByName(name) {
  return TF_TARIFFS.find((t) => t.name === name && !t.deleted) || null;
}
function tfLiveTariffs() {
  return TF_TARIFFS.filter((t) => !t.deleted);
}
function tfTariffOpsOf(tariffId) {
  return TF_TARIFF_OPS.filter((x) => x.tariffId === tariffId);
}
function tfTariffOpById(id) {
  return TF_TARIFF_OPS.find((x) => x.id === id) || null;
}
function tfTariffOp(tariffId, operationName) {
  const op = tfOperationByName(operationName);
  return op ? TF_TARIFF_OPS.find((x) => x.tariffId === tariffId && x.operationId === op.id) || null : null;
}
function tfTariffOpLabel(id) {
  const x = tfTariffOpById(id);
  const t = x && tfTariffById(x.tariffId);
  const o = x && tfOperationById(x.operationId);
  return t && o ? `${t.name} · ${o.name}` : "—";
}

// ---- Лимиты --------------------------------------------------------------------------------------------------------
function tfBind(tariffNames, opNames) {
  const ids = [];
  tariffNames.forEach((tn) => opNames.forEach((on) => { const x = tfTariffOp(tfTariffByName(tn).id, on); if (x) ids.push(x.id); }));
  return ids;
}

// [имя, описание, тикер, база, скользящий, day, week, month, year, min, max, тарифы, операции, ограничение]
const OUT_FIAT = ["OUTGOING_SBP", "OUTGOING_CARD_NUMBER", "OUTGOING_REQUISITES", "OUTGOING_CASH"];
const IN_FIAT = ["INCOMING_SBP", "INCOMING_REQUISITES", "INCOMING_CARD_NUMBER", "INCOMING_CASH"];
const TF_LIMIT_SPECS = [
  ["KYC L1 Crypto Withdrawal", "Crypto pool: withdrawal and internal transfer", "USDT", true, false, 1000, 5000, 5000, 60000, null, null, ["KYC Level 1"], ["NEURON_CRYPTO_OUT", "NEURON_CRYPTO_TRANSFER"]],
  ["KYC L2 Crypto Withdrawal", "Crypto pool: withdrawal and internal transfer", "USDT", true, false, TF_STUB, TF_STUB, TF_STUB, TF_STUB, null, null, ["KYC Level 2"], ["NEURON_CRYPTO_OUT", "NEURON_CRYPTO_TRANSFER"]],
  ["KYC L3 Crypto Withdrawal", "Crypto pool: withdrawal and internal transfer", "USDT", true, false, TF_STUB, TF_STUB, TF_STUB, TF_STUB, null, null, ["KYC Level 3"], ["NEURON_CRYPTO_OUT", "NEURON_CRYPTO_TRANSFER"]],
  ["Min crypto withdrawal", "Minimum single withdrawal, channel min-limit", "USDT", true, false, TF_STUB, TF_STUB, TF_STUB, TF_STUB, 30, null, ["KYC Level 1", "KYC Level 2", "KYC Level 3"], ["NEURON_CRYPTO_OUT"]],
  ["Min crypto deposit", "Minimum crypto deposit, channel min-limit", "USDT", true, false, TF_STUB, TF_STUB, TF_STUB, TF_STUB, 10, null, ["KYC Level 1", "KYC Level 2", "KYC Level 3"], ["NEURON_CRYPTO_IN"]],
  ["Fiat Outgoing pool", "Common fiat turnover limit for all outgoing channels", "RUB", true, false, TF_STUB, TF_STUB, TF_STUB, TF_STUB, null, null, ["KYC Level 2", "KYC Level 3"], OUT_FIAT],
  ["Min requisites withdrawal", "Minimum withdrawal by requisites", "RUB", true, false, TF_STUB, TF_STUB, TF_STUB, TF_STUB, 2000, null, ["KYC Level 2", "KYC Level 3"], ["OUTGOING_REQUISITES"]],
  ["Fiat Incoming pool", "Common fiat deposit limit for all incoming channels", "RUB", true, false, TF_STUB, TF_STUB, TF_STUB, TF_STUB, null, null, ["KYC Level 2", "KYC Level 3"], IN_FIAT],
  ["SBP deposit L3", "SBP deposit: 850 000 for the last 7 days, up to 50 000 per operation", "RUB", true, true, 850000, 850000, 3400000, 40800000, 1000, 50000, ["KYC Level 3"], ["INCOMING_SBP"]],
  ["High risk Crypto Withdrawal", "Restricted crypto pool for high risk clients", "USDT", true, false, 100, 300, 500, 3000, 10, 100, ["High risk"], ["NEURON_CRYPTO_OUT"]],
  ["Corporate Crypto pool", "Crypto pool for legal entities", "USDT", true, false, 50000, 200000, 800000, 8000000, 30, null, ["Corporate Standard"], ["NEURON_CRYPTO_OUT", "NEURON_CRYPTO_TRANSFER"]],
  ["Corporate Fiat Outgoing", "Fiat outgoing pool for legal entities", "RUB", true, false, 5000000, 20000000, 80000000, 800000000, null, null, ["Corporate Standard"], OUT_FIAT],
];
const TF_LIMITS = TF_LIMIT_SPECS.map(([name, description, currencyTicker, isBaseCurrency, isRolling, daily, weekly, monthly, annual, min, max, tariffNames, opNames], i) =>
  tfStamp({ id: tfId(), name, description, currencyTicker, isBaseCurrency, isRolling, daily, weekly, monthly, annual, min, max, clientId: null, restrictionId: null, tariffOperationIds: tfBind(tariffNames, opNames), changes: [] }, TF_D0, TF_D1)
);

function tfLimitById(id) {
  return TF_LIMITS.find((l) => l.id === id) || null;
}

function tfSnapshotLimit(limit, at) {
  const { daily, weekly, monthly, annual, min, max, currencyTicker, isBaseCurrency, restrictionId } = limit;
  limit.changes.unshift({ id: tfId(), daily, weekly, monthly, annual, min, max, currencyTicker, isBaseCurrency, restrictionId, createdDate: at, createdAt: formatDateTime(at) });
}

// Значения самого первого снимка — как при создании лимита; у SBP L3 и L1 есть история корректировок
TF_LIMITS.forEach((l) => tfSnapshotLimit(l, l.createdDate));
(function seedLimitChanges() {
  const l1 = TF_LIMITS[0];
  l1.changes.unshift({ ...l1.changes[0], id: tfId(), daily: 500, weekly: 2500, monthly: 5000, annual: 50000, createdDate: new Date(2026, 4, 2, 11, 0), createdAt: formatDateTime(new Date(2026, 4, 2, 11, 0)) });
  const sbp = TF_LIMITS[8];
  sbp.changes.unshift({ ...sbp.changes[0], id: tfId(), weekly: 700000, daily: 700000, monthly: 2800000, annual: 33600000, createdDate: new Date(2026, 5, 18, 15, 40), createdAt: formatDateTime(new Date(2026, 5, 18, 15, 40)) });
})();

// ---- Комиссии ----------------------------------------------------------------------------------------------------------
function tfFactor(order, name, type, fields) {
  return { id: tfId(), order, name, description: null, type, amountFrom: 0, amountTo: 1000000000, min: null, max: null, percent: null, fixed: null, formula: null, conditions: null, ...fields };
}

// [имя, описание, тикер, тарифы, операции, факторы]
const TF_COMMISSION_SPECS = [
  ["Crypto withdrawal fee", "Withdrawal commission", "USDT", ["KYC Level 1", "KYC Level 2", "KYC Level 3"], ["NEURON_CRYPTO_OUT"], [tfFactor(1, "System fee", "SYSTEM", { percent: 1, min: 1, max: 50 })]],
  ["SBP withdrawal fee", "Outgoing SBP commission", "RUB", ["KYC Level 2", "KYC Level 3"], ["OUTGOING_SBP"], [tfFactor(1, "System fee", "SYSTEM", { percent: 1, min: 30, max: 500 })]],
  ["Card withdrawal fee", "Card transfer: platform and provider fee", "RUB", ["KYC Level 2", "KYC Level 3"], ["OUTGOING_CARD_NUMBER"], [tfFactor(1, "System fee", "SYSTEM", { percent: 1, min: 50 }), tfFactor(2, "Provider fee", "PROVIDER", { percent: 0.5, fixed: 10 })]],
  ["Requisites withdrawal fee", "Transfer by requisites", "RUB", ["KYC Level 2", "KYC Level 3"], ["OUTGOING_REQUISITES"], [tfFactor(1, "System fee", "SYSTEM", { percent: 0.5, fixed: 100 })]],
  ["Cash withdrawal fee", "Cash withdrawal", "RUB", ["KYC Level 2", "KYC Level 3"], ["OUTGOING_CASH"], [tfFactor(1, "System fee", "SYSTEM", { percent: 1, min: 100 })]],
  ["SBP deposit fee", "Incoming SBP commission", "RUB", ["KYC Level 3"], ["INCOMING_SBP"], [tfFactor(1, "System fee", "SYSTEM", { percent: 0.5, max: 300 })]],
  ["Corporate crypto withdrawal fee", "Legal entities: withdrawal", "USDT", ["Corporate Standard"], ["NEURON_CRYPTO_OUT"], [tfFactor(1, "System fee", "SYSTEM", { amountTo: 100000, percent: 0.5, min: 5 }), tfFactor(2, "System fee (large)", "SYSTEM", { amountFrom: 100000, percent: 0.2, max: 1000 })]],
];
const TF_COMMISSIONS = TF_COMMISSION_SPECS.map(([name, description, currencyTicker, tariffNames, opNames, factors]) =>
  tfStamp({ id: tfId(), name, description, currencyTicker, isBaseCurrency: true, whitelabelId: null, clientId: null, tariffOperationIds: tfBind(tariffNames, opNames), factors }, TF_D0, TF_D1)
);

function tfCommissionById(id) {
  return TF_COMMISSIONS.find((c) => c.id === id) || null;
}

// ---- Клиенты тарифов и история смен -----------------------------------------------------------------------------------
const TF_CLIENTS = [];
CLIENTS_USERS_MOCK.forEach((u, i) => {
  const risky = !!u.blockReasons;
  const level = u.kycLevel || 1;
  const tariff = tfTariffByName(risky ? "High risk" : `KYC Level ${level}`);
  const c = tfStamp({ id: u.id, name: u.fullName || u.email, category: "INDIVIDUAL", tariffId: tariff.id, billingPeriod: new Date(u.createdDate.getFullYear(), u.createdDate.getMonth(), u.createdDate.getDate()), kind: "user", link: `#/clients-users/${u.id}`, changes: [] }, u.createdDate, u.createdDate);
  c.changes.unshift({ id: tfId(), tariffId: tfTariffByName("KYC Level 1").id, billingPeriod: c.billingPeriod, createdDate: u.createdDate, createdAt: formatDateTime(u.createdDate) });
  if (!risky && level > 1) c.changes.unshift({ id: tfId(), tariffId: tariff.id, billingPeriod: c.billingPeriod, createdDate: new Date(u.createdDate.getTime() + 36 * 3600 * 1000), createdAt: formatDateTime(new Date(u.createdDate.getTime() + 36 * 3600 * 1000)) });
  if (risky) c.changes.unshift({ id: tfId(), tariffId: tariff.id, billingPeriod: c.billingPeriod, createdDate: new Date(u.createdDate.getTime() + 60 * 3600 * 1000), createdAt: formatDateTime(new Date(u.createdDate.getTime() + 60 * 3600 * 1000)) });
  TF_CLIENTS.push(c);
});
CLIENTS_COMPANIES_MOCK.slice(0, 8).forEach((co) => {
  const tariff = tfTariffByName("Corporate Standard");
  const c = tfStamp({ id: co.id, name: co.name, category: "CORPORATE", tariffId: tariff.id, billingPeriod: new Date(co.createdDate.getFullYear(), co.createdDate.getMonth(), co.createdDate.getDate()), kind: "company", link: `#/clients-companies/${co.id}`, changes: [] }, co.createdDate, co.createdDate);
  c.changes.unshift({ id: tfId(), tariffId: tariff.id, billingPeriod: c.billingPeriod, createdDate: co.createdDate, createdAt: formatDateTime(co.createdDate) });
  TF_CLIENTS.push(c);
});

function tfClientById(id) {
  return TF_CLIENTS.find((c) => c.id === id) || null;
}

// Персональный тариф: копия «KYC Level 3» для одного клиента с изменёнными значениями
(function seedPersonal() {
  const client = TF_CLIENTS.find((c) => c.kind === "user" && tfTariffById(c.tariffId).name === "KYC Level 3");
  if (!client) return;
  const copy = tfCopyTariff({ sourceTariffId: tfTariffByName("KYC Level 3").id, clientId: client.id, limitOverrides: {}, factorOverrides: {} }, new Date(2026, 7, 20, 14, 10));
  const pool = TF_LIMITS.find((l) => l.name === "KYC L3 Crypto Withdrawal" && l.tariffOperationIds.some((id) => tfTariffOpById(id).tariffId === copy.id));
  if (pool) { pool.daily = 20000; pool.weekly = 80000; pool.monthly = 300000; pool.annual = 3000000; }
})();

// ---- Копирование тарифа (персональный или обычный) --------------------------------------------------------------
// overrides: limitOverrides[sourceLimitId] = {daily,...}, factorOverrides[sourceFactorId] = {percent,...}
function tfCopyTariff({ sourceTariffId, clientId, name, description, limitOverrides = {}, factorOverrides = {} }, at) {
  const src = tfTariffById(sourceTariffId);
  const suffix = clientId ? "(personal)" : "(copy)";
  const copy = tfStamp({ id: tfId(), name: name || `${src.name} ${suffix}`, description: description || src.description, clientCategory: src.clientCategory, conditions: src.conditions, permissions: JSON.parse(JSON.stringify(src.permissions)), ownerClientId: clientId || null, sourceTariffId: src.id, deleted: false }, at);
  TF_TARIFFS.push(copy);
  const opMap = {};
  tfTariffOpsOf(src.id).forEach((x) => {
    const nx = { id: tfId(), tariffId: copy.id, operationId: x.operationId };
    TF_TARIFF_OPS.push(nx);
    opMap[x.id] = nx.id;
  });
  // лимиты: копируем только общие лимиты, привязанные исключительно к тарифу-источнику; общие пулы переезжают копиями
  TF_LIMITS.filter((l) => !l.clientId && l.tariffOperationIds.some((id) => opMap[id])).forEach((l) => {
    const o = limitOverrides[l.id] || {};
    const nl = tfStamp({ ...l, id: tfId(), name: o.name || l.name, description: l.description, daily: o.daily ?? l.daily, weekly: o.weekly ?? l.weekly, monthly: o.monthly ?? l.monthly, annual: o.annual ?? l.annual, min: o.min !== undefined ? o.min : l.min, max: o.max !== undefined ? o.max : l.max, isRolling: o.isRolling ?? l.isRolling, tariffOperationIds: l.tariffOperationIds.filter((id) => opMap[id]).map((id) => opMap[id]), changes: [] }, at);
    tfSnapshotLimit(nl, at);
    TF_LIMITS.push(nl);
  });
  TF_COMMISSIONS.filter((c) => !c.clientId && c.tariffOperationIds.some((id) => opMap[id])).forEach((c) => {
    const nc = tfStamp({ ...c, id: tfId(), tariffOperationIds: c.tariffOperationIds.filter((id) => opMap[id]).map((id) => opMap[id]), factors: c.factors.map((f) => ({ ...f, id: tfId(), ...(factorOverrides[f.id] || {}) })) }, at);
    TF_COMMISSIONS.push(nc);
  });
  if (clientId) {
    const client = tfClientById(clientId);
    client.tariffId = copy.id;
    client.changes.unshift({ id: tfId(), tariffId: copy.id, billingPeriod: client.billingPeriod, createdDate: at, createdAt: formatDateTime(at) });
  }
  return copy;
}

// Снятие персонального тарифа: клиент возвращается на общий, персональный тариф и его лимиты и комиссии удаляются
function tfRevokePersonal(clientId, targetTariffId, at, personalId) {
  const client = tfClientById(clientId);
  const personal = tfTariffById(personalId || client.tariffId);
  const back = tfTariffById(targetTariffId || personal.sourceTariffId);
  const opIds = tfTariffOpsOf(personal.id).map((x) => x.id);
  personal.deleted = true;
  for (let i = TF_LIMITS.length - 1; i >= 0; i -= 1) if (TF_LIMITS[i].tariffOperationIds.some((id) => opIds.includes(id))) TF_LIMITS.splice(i, 1);
  for (let i = TF_COMMISSIONS.length - 1; i >= 0; i -= 1) if (TF_COMMISSIONS[i].tariffOperationIds.some((id) => opIds.includes(id))) TF_COMMISSIONS.splice(i, 1);
  for (let i = TF_TARIFF_OPS.length - 1; i >= 0; i -= 1) if (opIds.includes(TF_TARIFF_OPS[i].id)) TF_TARIFF_OPS.splice(i, 1);
  // клиент возвращается только если он сидел на снимаемом тарифе; «осиротевший» персональный тариф просто удаляется
  if (client.tariffId === personal.id) {
    client.tariffId = back.id;
    client.changes.unshift({ id: tfId(), tariffId: back.id, billingPeriod: client.billingPeriod, createdDate: at, createdAt: formatDateTime(at) });
  }
  return back;
}

// ---- История операций (расход лимитов) ----------------------------------------------------------------------------------------
const TF_HISTORY = [];
(function seedHistory() {
  const statusPool = ["SUCCESSFUL", "SUCCESSFUL", "SUCCESSFUL", "SUCCESSFUL", "SUCCESSFUL", "PENDING", "REJECTED"];
  const tickerFor = (op, s) => (op.domain === "FIAT" ? (s % 9 === 0 ? "USD" : "RUB") : s % 8 === 0 ? "BTC" : s % 5 === 0 ? "ETH" : "USDT");
  const amountFor = (ticker, s) => (ticker === "RUB" ? 1500 + ((s * 7919) % 60000) : ticker === "BTC" ? 0.001 + ((s * 13) % 30) / 1000 : ticker === "ETH" ? 0.05 + ((s * 17) % 20) / 10 : 20 + ((s * 331) % 900));
  let n = 0;
  TF_CLIENTS.slice(0, 22).forEach((c, ci) => {
    const t = tfTariffById(c.tariffId);
    const ops = tfTariffOpsOf(t.id).map((x) => tfOperationById(x.operationId)).filter((o) => o.name !== "CRYPTO_ACQUIRING_OFFCHAIN");
    const count = 3 + (ci % 6);
    for (let j = 0; j < count; j += 1) {
      n += 1;
      const s = ci * 17 + j * 5 + 3;
      const op = ops[s % ops.length];
      const ticker = tickerFor(op, s);
      const created = new Date(MOCK_NOW.getTime() - (j * 47 + (ci % 9) * 6 + (s % 5)) * 3600 * 1000 - (s % 55) * 60000);
      TF_HISTORY.push(tfStamp({ id: tfId(), clientId: c.id, operationId: op.id, amount: +amountFor(ticker, s).toFixed(ticker === "BTC" ? 5 : 2), currencyTicker: ticker, status: statusPool[s % statusPool.length], trackerId: seedToPaymentUuid(70000 + n), name: null, description: null }, created, new Date(created.getTime() + 4 * 60000)));
    }
  });
  TF_HISTORY.sort((a, b) => b.createdDate - a.createdDate);
})();

function tfHistoryById(id) {
  return TF_HISTORY.find((h) => h.id === id) || null;
}

// ---- Периоды и доступные лимиты ----------------------------------------------------------------------------------------------
function tfNow() {
  return new Date(MOCK_NOW.getTime() + (typeof paymentActionTick === "number" ? paymentActionTick : 0) * 60000);
}

// Календарные периоды со сбросом в 00:00 (настройка LIMITS_PERIODS_RESET_*): день, ISO-неделя, месяц, год
function tfPeriodStarts(now, rolling) {
  if (rolling) {
    const h = 3600 * 1000;
    return { daily: new Date(now - 24 * h), weekly: new Date(now - 7 * 24 * h), monthly: new Date(now - 30 * 24 * h), annual: new Date(now - 365 * 24 * h) };
  }
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (day.getDay() + 6) % 7;
  return { daily: day, weekly: new Date(day.getFullYear(), day.getMonth(), day.getDate() - dow), monthly: new Date(now.getFullYear(), now.getMonth(), 1), annual: new Date(now.getFullYear(), 0, 1) };
}

function tfPeriodEnds(now) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (day.getDay() + 6) % 7;
  return { daily: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1), weekly: new Date(day.getFullYear(), day.getMonth(), day.getDate() - dow + 7), monthly: new Date(now.getFullYear(), now.getMonth() + 1, 1), annual: new Date(now.getFullYear() + 1, 0, 1) };
}

// Расход по лимиту: записи истории клиента по операциям всех привязок лимита, кроме REJECTED, в валюте лимита
function tfSpent(clientId, limit, since) {
  const opIds = new Set(limit.tariffOperationIds.map((id) => tfTariffOpById(id)).filter(Boolean).map((x) => x.operationId));
  return TF_HISTORY.filter((h) => h.clientId === clientId && opIds.has(h.operationId) && h.status !== "REJECTED" && h.createdDate >= since).reduce((sum, h) => sum + tfConvert(h.amount, h.currencyTicker, limit.currencyTicker), 0);
}

// Каскад: остаток дня не больше остатка недели, недели — месяца, месяца — года
function tfAvailable(clientId, limit, now) {
  const starts = tfPeriodStarts(now || tfNow(), limit.isRolling);
  const rest = (period) => Math.max(0, limit[period] - tfSpent(clientId, limit, starts[period]));
  const annual = rest("annual");
  const monthly = Math.min(rest("monthly"), annual);
  const weekly = Math.min(rest("weekly"), monthly);
  const daily = Math.min(rest("daily"), weekly);
  return { daily: tfRound(daily), weekly: tfRound(weekly), monthly: tfRound(monthly), annual: tfRound(annual) };
}

// Комиссии клиента по операции: та же логика замещения, что и у tfLimitsFor —
// персональные (clientId === client.id) полностью замещают общие, если есть хотя бы одна.
function tfCommissionsFor(client, operationName) {
  const x = tfTariffOp(client.tariffId, operationName);
  if (!x) return null;
  const bound = TF_COMMISSIONS.filter((c) => c.tariffOperationIds.includes(x.id) && (!c.clientId || c.clientId === client.id));
  return bound.some((c) => c.clientId === client.id) ? bound.filter((c) => c.clientId === client.id) : bound;
}

// Лимиты клиента по операции: привязанные к его тарифу, персональные замещают общие
function tfLimitsFor(client, operationName) {
  const x = tfTariffOp(client.tariffId, operationName);
  if (!x) return null;
  const bound = TF_LIMITS.filter((l) => l.tariffOperationIds.includes(x.id) && (!l.clientId || l.clientId === client.id));
  return bound.some((l) => l.clientId === client.id) ? bound.filter((l) => l.clientId === client.id) : bound;
}

// checkLimit: проходят все лимиты операции; сумма пересчитывается в валюту каждого лимита
function tfCheckLimit(client, operationName, ticker, amount) {
  const limits = tfLimitsFor(client, operationName);
  if (limits === null) return { error: "TARIFF_NOT_ASSOCIATED_WITH_OPERATION" };
  if (!limits.length) return { error: "LIMIT_NOT_FOUND" };
  const now = tfNow();
  const checks = limits.map((l) => {
    const rated = tfRound(tfConvert(amount, ticker, l.currencyTicker));
    const av = tfAvailable(client.id, l, now);
    const reasons = [];
    if (l.min !== null && rated < l.min) reasons.push("BELOW_MIN");
    if (l.max !== null && rated > l.max) reasons.push("ABOVE_MAX");
    if (rated > av.daily) reasons.push("ABOVE_AVAILABLE");
    return { limit: l, ratedAmount: rated, available: av, reasons, result: !reasons.length };
  });
  return { result: checks.every((c) => c.result), checks };
}

// ---- Комиссии: расчёт ---------------------------------------------------------------------------------------------------------------
// Комиссия тарифа+операции: своя валюта, иначе базовая с пересчётом; факторы по порядку, каждый считает от суммы + накопленное
function tfFindCommission(tariffId, operationName, ticker, clientId) {
  const x = tfTariffOp(tariffId, operationName);
  if (!x) return null;
  const list = TF_COMMISSIONS.filter((c) => c.tariffOperationIds.includes(x.id) && (!c.clientId || c.clientId === clientId));
  const own = list.filter((c) => c.clientId === clientId);
  const pool = own.length ? own : list;
  return pool.find((c) => c.currencyTicker === ticker) || pool.find((c) => c.isBaseCurrency) || null;
}

function tfTotalFee(tariffId, operationName, ticker, amount, clientId) {
  const commission = tfFindCommission(tariffId, operationName, ticker, clientId);
  if (!commission) return null;
  const base = tfConvert(amount, ticker, commission.currencyTicker);
  let running = base;
  const steps = [];
  commission.factors.slice().sort((a, b) => a.order - b.order).forEach((f) => {
    if (base < f.amountFrom || base > f.amountTo) return;
    let fee = (running + (f.fixed || 0)) * ((f.percent || 0) * 0.01);
    if (f.percent === null && f.fixed !== null) fee = f.fixed;
    if (f.min !== null && fee < f.min) fee = f.min;
    if (f.max !== null && fee > f.max) fee = f.max;
    fee = tfRound(fee);
    steps.push({ factor: f, fee });
    running += fee;
  });
  const totalFee = tfRound(steps.reduce((s, x) => s + x.fee, 0));
  return { commission, steps, totalFee: tfRound(tfConvert(totalFee, commission.currencyTicker, ticker)), totalAmount: tfRound(amount + tfConvert(totalFee, commission.currencyTicker, ticker)), commissionTicker: commission.currencyTicker };
}

// ---- Правила лимитов (проверки при сохранении) ----------------------------------------------------------------------------------------
// Возвращает ключ ошибки или null; ключи совпадают с i18n tariffs.errors.*
function tfValidateLimitValues(v, restriction) {
  const { daily, weekly, monthly, annual, min, max } = v;
  if (min !== null && max !== null && min > max) return "minGtMax";
  if (min !== null && min > daily) return "minGtDaily";
  if (daily * 7 < weekly) return "dailyForWeekLtWeekly";
  if (daily > weekly) return "dailyGtWeekly";
  if (weekly * 4 < monthly) return "weeklyForMonthLtMonthly";
  if (weekly > monthly) return "weeklyGtMonthly";
  if (restriction) {
    if (daily > restriction.maxDaily) return "aboveRestrictionDaily";
    if (weekly > restriction.maxWeekly) return "aboveRestrictionWeekly";
    if (monthly > restriction.maxMonthly) return "aboveRestrictionMonthly";
    if (annual > restriction.maxAnnual) return "aboveRestrictionAnnual";
    if (max !== null && restriction.max !== null && max > restriction.max) return "aboveRestrictionMax";
    if (min !== null && restriction.min !== null && min < restriction.min) return "belowRestrictionMin";
  }
  return null;
}

// Уникальность: у одной привязки тариф+операция не может быть двух лимитов в одной валюте, базовый — только один
function tfValidateLimitBindings(limit, tariffOpIds, ignoreId) {
  for (const id of tariffOpIds) {
    const others = TF_LIMITS.filter((l) => l.id !== ignoreId && l.clientId === limit.clientId && l.tariffOperationIds.includes(id));
    if (others.some((l) => l.currencyTicker === limit.currencyTicker)) return { key: "limitRecordExists", at: id };
    if (limit.isBaseCurrency && others.some((l) => l.isBaseCurrency)) return { key: "baseAlreadyExists", at: id };
  }
  return null;
}

// ---- Маски ------------------------------------------------------------------------------------------------------------------------------------
const TF_MASK_TYPES = ["DEFAULT", "RULE_BASED", "MANUAL"];
const TF_MASK_STATUSES = ["DRAFT", "ACTIVE", "SCHEDULED", "ARCHIVED", "DELETED"];
const TF_ASSIGNMENT_STATUSES = ["ACTIVE", "SCHEDULED", "SUPERSEDED"];
const TF_ASSIGNMENT_TYPES = ["AUTOMATIC", "MANUAL"];
const TF_VALUE_TYPES = ["string", "number", "boolean", "array", "object"];
const TF_OPERATORS = ["eq", "ne", "gt", "ge", "lt", "le", "in", "not_in", "between", "contains", "exists", "is_null", "is_not_null"];

const TF_PARAMETERS = [
  ["risk.score", "Risk score", 1, "number", { min: 1, max: 6 }],
  ["user.level", "User level", 2, "string", null],
  ["client.country", "Client country", 3, "string", null],
].map(([key, displayName, priority, expectedTypeOfValue, config]) => tfStamp({ id: tfId(), key, displayName, priority, expectedTypeOfValue, config }, TF_D1));

const TF_TEMPLATES = [
  ["High risk + level", "AND", [{ behaviorParameterKey: "risk.score", operator: "ge", expectedValue: 5 }, { behaviorParameterKey: "user.level", operator: "in", expectedValue: ["medium", "high"] }]],
  ["Risky country", "OR", [{ behaviorParameterKey: "client.country", operator: "in", expectedValue: ["IR", "KP"] }, { behaviorParameterKey: "risk.score", operator: "ge", expectedValue: 6 }]],
].map(([name, logicalOperator, conditions]) => tfStamp({ id: tfId(), name, logicalOperator, conditions }, TF_D1));

function tfMask(spec) {
  return tfStamp({ id: tfId(), name: spec.name, description: spec.description || null, type: spec.type, status: spec.status, riskScoreRange: spec.range || null, tariffDelay: spec.delay || 0, activeFrom: spec.from || null, activeTo: null, maskVersion: 1, tariffId: tfTariffByName(spec.tariff).id, previousVersionId: null, ruleTemplateIds: spec.templates || [] }, spec.created || TF_D1, spec.created || TF_D1);
}
const TF_MASKS = [
  tfMask({ name: "Default 1-2", type: "DEFAULT", status: "ACTIVE", range: { min: 1, max: 2 }, tariff: "KYC Level 3", from: TF_D1 }),
  tfMask({ name: "Default 3-4", type: "DEFAULT", status: "ACTIVE", range: { min: 3, max: 4 }, tariff: "KYC Level 2", delay: 1, from: TF_D1 }),
  tfMask({ name: "Default 5-6", type: "DEFAULT", status: "ACTIVE", range: { min: 5, max: 6 }, tariff: "High risk", from: TF_D1 }),
  tfMask({ name: "Rule risky", type: "RULE_BASED", status: "ACTIVE", delay: 2, tariff: "High risk", templates: [TF_TEMPLATES[0].id], from: TF_D1 }),
  tfMask({ name: "Manual VIP", type: "MANUAL", status: "ACTIVE", tariff: "KYC Level 3", from: TF_D1 }),
  tfMask({ name: "Rule risky country (draft)", type: "RULE_BASED", status: "DRAFT", delay: 0, tariff: "High risk", templates: [TF_TEMPLATES[1].id], created: new Date(2026, 8, 10, 9, 20) }),
  tfMask({ name: "Default 1-3 (old)", type: "DEFAULT", status: "ARCHIVED", range: { min: 1, max: 3 }, tariff: "KYC Level 2", from: new Date(2026, 3, 1) }),
];
TF_MASKS[6].activeTo = TF_D1;

const TF_ASSIGNMENTS = [];
(function seedAssignments() {
  const users = TF_CLIENTS.filter((c) => c.kind === "user");
  const add = (client, mask, type, status, activeTariff, pendingTariff, at, extra) =>
    TF_ASSIGNMENTS.push(tfStamp({ id: tfId(), maskId: mask.id, clientId: client.id, type, status, activeTariffId: activeTariff.id, pendingTariffId: pendingTariff ? pendingTariff.id : null, tariffEffectiveDate: pendingTariff ? new Date(at.getTime() + 2 * 86400000) : null, activeFrom: at, requiresApproval: false, reason: null, overridenAutomaticMaskId: null, changes: null, ...extra }, at, at));
  const l1 = tfTariffByName("KYC Level 1");
  const l2 = tfTariffByName("KYC Level 2");
  const l3 = tfTariffByName("KYC Level 3");
  const hr = tfTariffByName("High risk");
  add(users[0], TF_MASKS[0], "AUTOMATIC", "ACTIVE", l3, null, new Date(2026, 8, 1, 10, 0));
  add(users[1], TF_MASKS[1], "AUTOMATIC", "SUPERSEDED", l1, null, new Date(2026, 7, 20, 10, 0));
  add(users[1], TF_MASKS[1], "AUTOMATIC", "ACTIVE", l2, null, new Date(2026, 7, 21, 10, 0));
  add(users[2], TF_MASKS[3], "AUTOMATIC", "SCHEDULED", l2, hr, new Date(2026, 8, 17, 11, 30));
  add(users[3], TF_MASKS[4], "MANUAL", "ACTIVE", l3, null, new Date(2026, 8, 5, 12, 0), { reason: "VIP client, agreed with the account manager" });
  add(users[4], TF_MASKS[2], "AUTOMATIC", "ACTIVE", hr, null, new Date(2026, 8, 9, 15, 10));
})();

function tfMaskById(id) {
  return TF_MASKS.find((m) => m.id === id) || null;
}
function tfTemplateById(id) {
  return TF_TEMPLATES.find((t) => t.id === id) || null;
}
function tfParameterByKey(key) {
  return TF_PARAMETERS.find((p) => p.key === key) || null;
}
function tfAssignmentById(id) {
  return TF_ASSIGNMENTS.find((a) => a.id === id) || null;
}

// Проверка одного условия шаблона по параметрам клиента (ключ вида "risk.score" — путь в объекте)
function tfConditionMatches(cond, params) {
  const value = String(cond.behaviorParameterKey).split(".").reduce((o, k) => (o == null ? undefined : o[k]), params);
  const e = cond.expectedValue;
  switch (cond.operator) {
    case "eq": return value === e;
    case "ne": return value !== e;
    case "gt": return value > e;
    case "ge": return value >= e;
    case "lt": return value < e;
    case "le": return value <= e;
    case "in": return Array.isArray(e) && e.includes(value);
    case "not_in": return Array.isArray(e) && !e.includes(value);
    case "between": return Array.isArray(e) && value >= e[0] && value <= e[1];
    case "contains": return Array.isArray(value) ? value.includes(e) : String(value).includes(String(e));
    case "exists": return value !== undefined;
    case "is_null": return value == null;
    case "is_not_null": return value != null;
    default: return false;
  }
}

function tfTemplateScore(template, params) {
  const hits = template.conditions.filter((c) => tfConditionMatches(c, params)).length;
  const ok = template.logicalOperator === "AND" ? hits === template.conditions.length : hits > 0;
  return ok ? hits : 0;
}

// Движок: ручное назначение → лучшая RULE_BASED (по числу совпадений, затем приоритет ключевого параметра, затем новее) →
// DEFAULT по диапазону риска. Возвращает { mask, reason } или { error }
function tfEvaluateMask(clientId, params, riskScore) {
  const manual = TF_ASSIGNMENTS.find((a) => a.clientId === clientId && a.type === "MANUAL" && (a.status === "ACTIVE" || a.status === "SCHEDULED"));
  if (manual) return { mask: tfMaskById(manual.maskId), source: "MANUAL" };
  const active = TF_MASKS.filter((m) => m.status === "ACTIVE");
  const scored = active
    .filter((m) => m.type === "RULE_BASED")
    .map((m) => {
      const hits = m.ruleTemplateIds.map(tfTemplateById).filter(Boolean).reduce((n, t) => n + tfTemplateScore(t, params), 0);
      const prio = Math.min(...m.ruleTemplateIds.map(tfTemplateById).filter(Boolean).flatMap((t) => t.conditions.map((c) => (tfParameterByKey(c.behaviorParameterKey) || { priority: 99 }).priority)));
      return { m, hits, prio };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.prio - b.prio || b.m.createdDate - a.m.createdDate);
  if (scored.length) return { mask: scored[0].m, source: "RULE_BASED" };
  const def = active.find((m) => m.type === "DEFAULT" && m.riskScoreRange && riskScore >= m.riskScoreRange.min && riskScore <= m.riskScoreRange.max);
  if (def) return { mask: def, source: "DEFAULT" };
  return { error: "MASK_NOT_FOUND" };
}
