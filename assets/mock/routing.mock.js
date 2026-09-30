/* ==========================================================================
   "Настройки системы → Маршрутизация операций": данные и движок правил.
   Основа — спека «Маршрутизация платежей» (правила из групп условий: AND внутри группы, OR между группами; маршруты правила —
   провайдер + необязательный ностро-счёт с приоритетом; маршруты по умолчанию на пару «валюта + рельс»; исполнения и попытки;
   retry и уведомления). Сверка с бэкендом core: сейчас провайдера подбирают по conditions самого провайдера
   (supportedPaymentSchemas, supportedAccountCurrencyIds) без приоритета и запасных вариантов; правил, исполнений и попыток нет,
   поэтому раздел — проект доработки. Точка встраивания: перед подбором провайдера для проводки списания исходящего платежа;
   движок выбирает провайдера и записывает в проводку условие «имя провайдера равно X».
   Условное (придумано для наглядности): все правила, маршруты по умолчанию, исполнения, попытки, история и настройки.
   Провайдеры и ностро-счета — из разделов «vABS → Провайдеры» и «Счета».
   ========================================================================== */

const RG_RAILS = ["SWIFT", "RU_WIRE", "SBP"];
const RG_CURRENCIES = ["RUB", "USD", "EUR", "KGS"];
const RG_COUNTRIES = { RU: "Россия", KZ: "Казахстан", KG: "Киргизия", DE: "Германия", CN: "Китай", AE: "ОАЭ", TR: "Турция", US: "США", GB: "Великобритания" };
const RG_TYPES = ["INDIVIDUAL", "CORPORATE"];
const RG_KYC = ["1", "2", "3", "4"];

// Атрибуты условий (CONDITION_ATTRIBUTES): тип и допустимые операторы
const RG_OPERATORS = {
  NUMBER: ["EQ", "NEQ", "GT", "LT", "GTE", "LTE", "BETWEEN"],
  ENUM: ["EQ", "NEQ"],
  DATETIME: ["BEFORE", "AFTER", "TIME_BETWEEN"],
};
const RG_ATTRS = [
  { id: "currency", type: "ENUM", options: RG_CURRENCIES, required: true },
  { id: "rail", type: "ENUM", options: RG_RAILS, required: true },
  { id: "amount", type: "NUMBER" },
  { id: "createdTime", type: "DATETIME" },
  { id: "recipientCountry", type: "ENUM", options: Object.keys(RG_COUNTRIES) },
  { id: "recipientType", type: "ENUM", options: RG_TYPES },
  { id: "senderType", type: "ENUM", options: RG_TYPES },
  { id: "kycStatus", type: "ENUM", options: RG_KYC },
];

function rgAttr(id) {
  return RG_ATTRS.find((a) => a.id === id);
}

// ---- Провайдеры и ностро ---------------------------------------------------------------------------
// Возможности: рельс → валюты (по конфигурациям провайдеров core: supportedPaymentSchemas, supportedAccountCurrencyIds)
const RG_PROVIDER_CAPS = {
  Paygine: { RU_WIRE: ["RUB"], SBP: ["RUB"] },
  Pay2me: { SWIFT: ["USD", "EUR"] },
  "Requisites provider": { SWIFT: ["USD", "EUR"], RU_WIRE: ["RUB"] },
};
const RG_PROVIDERS = VB_PROVIDERS.filter((p) => RG_PROVIDER_CAPS[p.name]).map((p) => ({ id: p.id, name: p.name, status: p.status, caps: RG_PROVIDER_CAPS[p.name] }));

function rgProviderById(id) {
  return RG_PROVIDERS.find((p) => p.id === id) || null;
}

function rgProviderSupports(provider, currency, rail) {
  return !!provider && !!provider.caps[rail] && provider.caps[rail].includes(currency);
}

// Ностро-счета провайдеров (раздел «Счета → Корреспондентские»); валюты — из спецификации мока счетов
const RG_NOSTRO = ACCOUNTS_NOSTRO_MOCK.map((a, i) => ({ id: a.id, providerId: a.provider.id, extId: a.providerExternalId, status: a.status, currencies: ACC_NOSTRO_SPECS[i][1] }));

function rgNostroList(providerId) {
  return RG_NOSTRO.filter((a) => a.providerId === providerId);
}

function rgNostroById(id) {
  return id ? RG_NOSTRO.find((a) => a.id === id) || null : null;
}
// ---- Расчёт условий ------------------------------------------------------------------------------------
function rgTimeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

function rgPaymentValue(payment, attrId) {
  if (attrId === "createdTime") return payment.createdAt;
  return payment[attrId];
}

// Возвращает true / false для одного условия по снимку платежа
function rgCondMatches(cond, payment) {
  const attr = rgAttr(cond.attrId);
  const v = rgPaymentValue(payment, cond.attrId);
  if (attr.type === "ENUM") return cond.operator === "EQ" ? String(v) === String(cond.value) : String(v) !== String(cond.value);
  if (attr.type === "NUMBER") {
    const n = Number(v), a = Number(cond.value), b = Number(cond.valueMax);
    return { EQ: n === a, NEQ: n !== a, GT: n > a, LT: n < a, GTE: n >= a, LTE: n <= a, BETWEEN: n >= a && n <= b }[cond.operator];
  }
  const d = v instanceof Date ? v : new Date(v);
  if (cond.operator === "TIME_BETWEEN") {
    const cur = d.getHours() * 60 + d.getMinutes();
    const from = rgTimeToMinutes(cond.value), to = rgTimeToMinutes(cond.valueMax);
    return from <= to ? cur >= from && cur <= to : cur >= from || cur <= to;
  }
  const t = new Date(cond.value).getTime();
  return cond.operator === "BEFORE" ? d.getTime() < t : d.getTime() > t;
}

function rgRuleActiveAt(rule, at) {
  if (rule.status !== "ACTIVE") return false;
  if (rule.dateStart && at < rule.dateStart) return false;
  if (rule.dateEnd && at > rule.dateEnd) return false;
  return true;
}

// Группа совпала, если все условия выполнены (AND); правило подходит, если совпала любая группа (OR)
function rgRuleMatch(rule, payment) {
  for (let gi = 0; gi < rule.groups.length; gi++) {
    const failed = rule.groups[gi].conditions.filter((c) => !rgCondMatches(c, payment));
    if (!failed.length) return { ok: true, groupIndex: gi };
  }
  // причина отказа: группа с наибольшим числом выполненных условий, первое невыполненное условие
  let best = null;
  rule.groups.forEach((g, gi) => {
    const failed = g.conditions.filter((c) => !rgCondMatches(c, payment));
    if (!best || failed.length < best.failed.length) best = { gi, failed };
  });
  return { ok: false, groupIndex: best ? best.gi : 0, failedCond: best && best.failed[0] };
}

function rgActiveRulesSorted(at) {
  return RG_RULES.filter((r) => rgRuleActiveAt(r, at)).sort((a, b) => a.priority - b.priority);
}

function rgDefaultFor(currency, rail) {
  return RG_DEFAULTS.find((d) => d.currency === currency && d.rail === rail) || null;
}

// Что сделает движок с платежом: подходящие правила по приоритету, маршруты первого, затем маршруты по умолчанию
function rgEvaluate(payment) {
  const at = payment.createdAt;
  const rules = rgActiveRulesSorted(at).map((rule) => ({ rule, ...rgRuleMatch(rule, payment) }));
  const first = rules.find((r) => r.ok) || null;
  return { rules, first, defaults: rgDefaultFor(payment.currency, payment.rail) };
}

// ---- Правила -------------------------------------------------------------------------------------------------
let rgSeq = 1;
function rgId(prefix) {
  return `${prefix}-${String(++rgSeq).padStart(4, "0")}`;
}
function rgUuid(n) {
  return seedToPaymentUuid(7000 + n);
}

const RG_DAY = 24 * 3600 * 1000;
function rgDate(offsetDays, h, m) {
  const d = new Date(MOCK_NOW.getTime() + offsetDays * RG_DAY);
  d.setHours(h == null ? 10 : h, m || 0, 0, 0);
  return d;
}

function rgCond(attrId, operator, value, valueMax) {
  return { id: rgId("c"), attrId, operator, value: String(value), valueMax: valueMax == null ? null : String(valueMax) };
}
function rgGroup(conditions) {
  return { id: rgId("g"), conditions };
}
function rgRoute(providerName, nostroIndex) {
  const p = RG_PROVIDERS.find((x) => x.name === providerName);
  const nostro = nostroIndex == null ? null : ACCOUNTS_NOSTRO_MOCK[nostroIndex];
  return { id: rgId("r"), providerId: p.id, nostroAccountId: nostro ? nostro.id : null };
}
function rgRule(n, d) {
  const created = rgDate(-(60 - n * 3), 11, n * 7);
  const updated = rgDate(-(20 - n), 15, n * 5);
  return Object.assign({ id: rgUuid(n), description: "", dateStart: null, dateEnd: null, createdDate: created, createdAt: formatDateTime(created), updatedDate: updated, updatedAt: formatDateTime(updated), createdBy: "a.kim@aziafintech.kz" }, d);
}

const RG_RULES = [
  rgRule(1, {
    name: "EUR SWIFT — крупные суммы", description: "Крупные евровые переводы идут через основной банк с запасным вариантом", priority: 10, status: "ACTIVE",
    groups: [rgGroup([rgCond("currency", "EQ", "EUR"), rgCond("rail", "EQ", "SWIFT"), rgCond("amount", "GTE", 10000)])],
    routes: [rgRoute("Pay2me", 1), rgRoute("Requisites provider", 3)],
  }),
  rgRule(2, {
    name: "USD SWIFT — малые суммы и ОАЭ", description: "USD до 10 000 и все переводы в ОАЭ идут через Requisites provider", priority: 20, status: "ACTIVE",
    groups: [
      rgGroup([rgCond("currency", "EQ", "USD"), rgCond("rail", "EQ", "SWIFT"), rgCond("amount", "LT", 10000)]),
      rgGroup([rgCond("currency", "EQ", "USD"), rgCond("rail", "EQ", "SWIFT"), rgCond("recipientCountry", "EQ", "AE")]),
    ],
    routes: [rgRoute("Requisites provider", 2), rgRoute("Pay2me", 1)],
  }),
  rgRule(3, {
    name: "Компании — EUR SWIFT средних сумм", description: "Юрлица, переводы от 1 000 до 9 999,99 EUR", priority: 30, status: "ACTIVE",
    groups: [rgGroup([rgCond("currency", "EQ", "EUR"), rgCond("rail", "EQ", "SWIFT"), rgCond("senderType", "EQ", "CORPORATE"), rgCond("amount", "BETWEEN", 1000, 9999.99)])],
    routes: [rgRoute("Requisites provider", 3), rgRoute("Pay2me", 1)],
  }),
  rgRule(4, {
    name: "RUB — RU_WIRE до 1 млн", description: "Рублёвые переводы по России до 1 000 000", priority: 40, status: "ACTIVE",
    groups: [rgGroup([rgCond("currency", "EQ", "RUB"), rgCond("rail", "EQ", "RU_WIRE"), rgCond("amount", "LTE", 1000000)])],
    routes: [rgRoute("Paygine", 0), rgRoute("Requisites provider", null)],
  }),
  rgRule(5, {
    name: "СБП — идентифицированные физлица", description: "СБП только для физлиц с уровнем KYC выше первого", priority: 50, status: "ACTIVE",
    groups: [rgGroup([rgCond("currency", "EQ", "RUB"), rgCond("rail", "EQ", "SBP"), rgCond("senderType", "EQ", "INDIVIDUAL"), rgCond("kycStatus", "NEQ", "1")])],
    routes: [rgRoute("Paygine", 0)],
  }),
  rgRule(6, {
    name: "Ночной режим RU_WIRE", description: "С 23:00 до 06:00 рублёвые переводы уходят через Requisites provider", priority: 60, status: "ACTIVE",
    groups: [rgGroup([rgCond("currency", "EQ", "RUB"), rgCond("rail", "EQ", "RU_WIRE"), rgCond("createdTime", "TIME_BETWEEN", "23:00", "06:00")])],
    routes: [rgRoute("Requisites provider", null), rgRoute("Paygine", 0)],
  }),
  rgRule(7, {
    name: "Пилот: USD SWIFT от 50 000", description: "Проверка нового маршрута для крупных долларовых переводов", priority: 70, status: "DRAFT",
    groups: [rgGroup([rgCond("currency", "EQ", "USD"), rgCond("rail", "EQ", "SWIFT"), rgCond("amount", "GTE", 50000)])],
    routes: [rgRoute("Pay2me", 1)],
  }),
  rgRule(8, {
    name: "Германия — EUR SWIFT на конец года", description: "Сезонное правило для переводов в Германию", priority: 80, status: "SCHEDULED", dateStart: rgDate(20, 0, 0), dateEnd: rgDate(50, 23, 59),
    groups: [rgGroup([rgCond("currency", "EQ", "EUR"), rgCond("rail", "EQ", "SWIFT"), rgCond("recipientCountry", "EQ", "DE")])],
    routes: [rgRoute("Requisites provider", 3)],
  }),
  rgRule(9, {
    name: "USD SWIFT — Турция (старое)", description: "Правило снято после смены договора", priority: 90, status: "ARCHIVED",
    groups: [rgGroup([rgCond("currency", "EQ", "USD"), rgCond("rail", "EQ", "SWIFT"), rgCond("recipientCountry", "EQ", "TR")])],
    routes: [rgRoute("Pay2me", 1)],
  }),
];

// Маршруты по умолчанию: пара «валюта + рельс» → список маршрутов по приоритету
const RG_DEFAULTS = [
  { currency: "USD", rail: "SWIFT", routes: [rgRoute("Pay2me", 1), rgRoute("Requisites provider", 2)] },
  { currency: "EUR", rail: "SWIFT", routes: [rgRoute("Pay2me", 1), rgRoute("Requisites provider", 3)] },
  { currency: "RUB", rail: "RU_WIRE", routes: [rgRoute("Requisites provider", null), rgRoute("Paygine", 0)] },
  { currency: "RUB", rail: "SBP", routes: [rgRoute("Paygine", 0)] },
];

// Настройки: retry и уведомления
const RG_SETTINGS = {
  retry: { maxRetries: 2, delayMs: 3000 },
  notifications: {
    failure: { enabled: true, channels: ["UI", "EMAIL"] },
    provider: { enabled: true, channels: ["UI"] },
    failureRate: { enabled: true, channels: ["UI", "EMAIL"], threshold: 15, intervalMin: 60 },
    defaultUsage: { enabled: false, channels: ["UI"], interval: "DAY", count: 10 },
  },
};
const RG_CHANNELS = ["UI", "EMAIL", "TELEGRAM"];

// История изменений правил (RULE_CHANGE)
const RG_CHANGES = [
  { id: rgId("h"), ruleId: RG_RULES[0].id, entityType: "RULE", field: "priority", oldValue: "20", newValue: "10", comment: "Приоритет выше USD-правила: крупные суммы обрабатываем первыми", by: "a.kim@aziafintech.kz", at: rgDate(-18, 12, 5) },
  { id: rgId("h"), ruleId: RG_RULES[0].id, entityType: "CONDITION", field: "amount", oldValue: "≥ 5 000", newValue: "≥ 10 000", comment: "Порог поднят по решению финансистов", by: "a.kim@aziafintech.kz", at: rgDate(-9, 16, 40) },
  { id: rgId("h"), ruleId: RG_RULES[1].id, entityType: "ROUTE", field: "routes", oldValue: "Pay2me", newValue: "Requisites provider → Pay2me", comment: "Основной маршрут поменяли из-за задержек Pay2me", by: "a.kim@aziafintech.kz", at: rgDate(-5, 9, 15) },
  { id: rgId("h"), ruleId: RG_RULES[8].id, entityType: "RULE", field: "status", oldValue: "ACTIVE", newValue: "ARCHIVED", comment: "Договор с турецким банком расторгнут", by: "a.kim@aziafintech.kz", at: rgDate(-12, 10, 0) },
];

// ---- Исполнения и попытки (генерация по правилам) -----------------------------------------------------------
const RG_ERRORS = [
  ["PROVIDER_TIMEOUT", "Провайдер не ответил за отведённое время"],
  ["NOSTRO_INSUFFICIENT_FUNDS", "Недостаточно средств на ностро-счёте"],
  ["RAIL_UNAVAILABLE", "Рельс временно недоступен"],
  ["BENEFICIARY_BANK_REJECTED", "Банк получателя отклонил перевод"],
];

function rgLcg(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

function rgRoutesToAttempts(routes, source, numStart, outcome, rand, baseTime) {
  // outcome: "SUCCESS" — последний маршрут успешен; "FAIL" — все неудачны
  const list = [];
  routes.forEach((route, i) => {
    const last = i === routes.length - 1;
    const success = outcome === "SUCCESS" && last;
    const err = RG_ERRORS[Math.floor(rand() * RG_ERRORS.length)];
    const created = new Date(baseTime.getTime() + (numStart + i) * 4000);
    list.push({
      id: rgId("a"), attemptNumber: numStart + i + 1, routeSource: source, providerId: route.providerId, nostroAccountId: route.nostroAccountId,
      status: success ? "SUCCESS" : "FAILED", errorCode: success ? null : err[0], errorMessage: success ? null : err[1],
      rawResponse: success ? { status: "ACCEPTED", providerOrderId: `PRV-${Math.floor(rand() * 900000 + 100000)}` } : { status: "ERROR", code: err[0], message: err[1] },
      createdAt: formatDateTime(created), createdDate: created,
    });
  });
  return list;
}

const RG_EXECUTIONS = [];
(function buildExecutions() {
  const rand = rgLcg(7);
  const rails = { SWIFT: ["USD", "EUR"], RU_WIRE: ["RUB"], SBP: ["RUB"] };
  for (let i = 0; i < 56; i++) {
    const rail = RG_RAILS[Math.floor(rand() * 3)];
    const currency = rails[rail][Math.floor(rand() * rails[rail].length)];
    const created = new Date(MOCK_NOW.getTime() - (i * 5.3 + rand() * 4) * 3600 * 1000);
    const bigSwift = rail === "SWIFT" && rand() > 0.6;
    const payment = {
      currency, rail, createdAt: created,
      amount: rail === "SWIFT" ? Math.round((bigSwift ? 10000 + rand() * 60000 : 300 + rand() * 9000) * 100) / 100 : Math.round((20000 + rand() * 900000)) ,
      recipientCountry: rail === "SWIFT" ? ["DE", "CN", "AE", "TR", "US", "GB"][Math.floor(rand() * 6)] : "RU",
      recipientType: rand() > 0.5 ? "CORPORATE" : "INDIVIDUAL", senderType: rand() > 0.55 ? "CORPORATE" : "INDIVIDUAL", kycStatus: String(1 + Math.floor(rand() * 4)),
    };
    const ev = rgEvaluate(payment);
    const rule = ev.first ? ev.first.rule : null;
    const roll = rand();
    const scenario = i % 11 === 0 ? "FAILED" : i % 13 === 0 ? "PENDING_RETRY" : i % 17 === 0 ? "PROCESSING" : roll > 0.78 && rule ? "USE_DEFAULT" : rule ? "SUCCESS" : "USE_DEFAULT";
    const dflt = ev.defaults ? ev.defaults.routes : [];
    let attempts = [];
    let status = scenario;
    if (scenario === "SUCCESS") {
      const rr = rule.routes;
      const useSecond = rr.length > 1 && rand() > 0.7;
      attempts = rgRoutesToAttempts(useSecond ? rr.slice(0, 2) : rr.slice(0, 1), "RULE", 0, "SUCCESS", rand, created);
    } else if (scenario === "USE_DEFAULT") {
      const ruleFail = rule ? rgRoutesToAttempts(rule.routes, "RULE", 0, "FAIL", rand, created) : [];
      attempts = [...ruleFail, ...rgRoutesToAttempts(dflt.slice(0, 1), "DEFAULT", ruleFail.length, "SUCCESS", rand, created)];
    } else if (scenario === "FAILED") {
      const ruleFail = rule ? rgRoutesToAttempts(rule.routes, "RULE", 0, "FAIL", rand, created) : [];
      attempts = [...ruleFail, ...rgRoutesToAttempts(dflt, "DEFAULT", ruleFail.length, "FAIL", rand, created)];
      if (!attempts.length) status = "FAILED";
    } else if (scenario === "PENDING_RETRY") {
      attempts = rgRoutesToAttempts(rule ? rule.routes.slice(0, 1) : dflt.slice(0, 1), rule ? "RULE" : "DEFAULT", 0, "FAIL", rand, created);
    } else {
      const route = (rule ? rule.routes : dflt)[0];
      if (route) attempts = [{ id: rgId("a"), attemptNumber: 1, routeSource: rule ? "RULE" : "DEFAULT", providerId: route.providerId, nostroAccountId: route.nostroAccountId, status: "PROCESSING", errorCode: null, errorMessage: null, rawResponse: null, createdAt: formatDateTime(created), createdDate: created }];
    }
    const finished = ["SUCCESS", "USE_DEFAULT", "FAILED"].includes(status) ? new Date(created.getTime() + (attempts.length * 4 + 2) * 1000) : null;
    RG_EXECUTIONS.push({
      id: rgUuid(100 + i), paymentId: seedToPaymentUuid(8000 + i), status, ruleId: rule ? rule.id : null, payment, attempts,
      createdDate: created, createdAt: formatDateTime(created), finishedAt: finished ? formatDateTime(finished) : null,
    });
  }
})();

function rgRuleById(id) {
  return RG_RULES.find((r) => r.id === id) || null;
}
function rgExecutionsOfRule(id) {
  return RG_EXECUTIONS.filter((e) => e.ruleId === id);
}
function rgChangesOfRule(id) {
  return RG_CHANGES.filter((c) => c.ruleId === id).sort((a, b) => b.at - a.at);
}
function rgLastProviderId(ex) {
  const a = ex.attempts[ex.attempts.length - 1];
  return a ? a.providerId : null;
}

// Статистика за N дней (PAYMENT_ROUTING_AGG_STATS, PROVIDER_AGG, RULE_AGG считаются на лету из исполнений)
function rgStats(days) {
  const from = MOCK_NOW.getTime() - days * RG_DAY;
  const list = RG_EXECUTIONS.filter((e) => e.createdDate.getTime() >= from);
  const cnt = (s) => list.filter((e) => e.status === s).length;
  const attempts = list.reduce((n, e) => n + e.attempts.length, 0);
  const providers = {};
  list.forEach((e) => e.attempts.forEach((a) => {
    const p = providers[a.providerId] || (providers[a.providerId] = { providerId: a.providerId, count: 0, success: 0, failed: 0 });
    p.count++;
    if (a.status === "SUCCESS") p.success++;
    if (a.status === "FAILED") p.failed++;
  }));
  const rules = {};
  list.forEach((e) => {
    if (!e.ruleId) return;
    const r = rules[e.ruleId] || (rules[e.ruleId] = { ruleId: e.ruleId, count: 0, success: 0, failed: 0 });
    r.count++;
    if (e.status === "SUCCESS" || e.status === "USE_DEFAULT") r.success++;
    if (e.status === "FAILED") r.failed++;
  });
  const errors = {};
  list.forEach((e) => e.attempts.forEach((a) => { if (a.errorCode) errors[a.errorCode] = (errors[a.errorCode] || 0) + 1; }));
  return {
    total: list.length, success: cnt("SUCCESS"), failed: cnt("FAILED"), defaults: cnt("USE_DEFAULT"), retry: cnt("PENDING_RETRY"), attempts,
    avgAttempts: list.length ? attempts / list.length : 0,
    providers: Object.values(providers).sort((a, b) => b.count - a.count), rules: Object.values(rules).sort((a, b) => b.count - a.count),
    errors: Object.entries(errors).sort((a, b) => b[1] - a[1]),
  };
}
