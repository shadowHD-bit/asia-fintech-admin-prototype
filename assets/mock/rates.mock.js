/* ==========================================================================
   "Настройки системы → Курсы": данные и расчёт.
   Модель — по бэкенду core (plugins/rates-plugin): источники курса (provider) → базовые курсы → агрегированный курс пары →
   итоговый курс = агрегированный с ГЛОБАЛЬНОЙ наценкой (последняя ACTIVE по паре) → персональный курс клиента = итоговый с
   ИНДИВИДУАЛЬНОЙ наценкой (ACTIVE, привязана к клиентам). Тип наценки: PERCENTAGE — курс × (1 + значение / 100),
   FIXED — курс + значение; результат ≤ 0 не принимается (как в final-rates.service). Статусы: ACTIVE / EXPIRED / CANCELLED.
   ГРАНИЦЫ ПРОТОТИПА: в GraphQL-схеме бэкенда типы наценок описаны, но запросов и мутаций для них нет (есть только внутренние
   CRUD-сервисы), поэтому создание и отмена наценок здесь — модель под будущий API. Условное: сами курсы, источники,
   клиенты и история наценок придуманы для наглядности. Допущение: новая глобальная наценка по паре завершает предыдущую
   активную (в коде бэкенда просто берётся последняя активная).
   ========================================================================== */

function rtUuid(n) {
  const h = (n * 2654435761 >>> 0).toString(16).padStart(8, "0");
  const g = ((n + 7) * 40503 >>> 0).toString(16).padStart(4, "0");
  return `${h}-${g}-4${g.slice(1)}-a${h.slice(1, 4)}-${h}${g}`;
}

function rtDate(daysAgo, hour, minute) {
  const d = new Date(MOCK_NOW.getFullYear(), MOCK_NOW.getMonth(), MOCK_NOW.getDate(), hour == null ? 12 : hour, minute || 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

// Пары: decimals — знаков после запятой при показе курса
const RATE_PAIRS = [
  { id: rtUuid(1), base: "USD", quote: "KZT", rate: 512.4, decimals: 2, sources: ["binance", "kraken", "nbrk"], updated: rtDate(0, 11, 58) },
  { id: rtUuid(2), base: "EUR", quote: "KZT", rate: 556.65, decimals: 2, sources: ["kraken", "nbrk"], updated: rtDate(0, 11, 58) },
  { id: rtUuid(3), base: "USDT", quote: "USD", rate: 1.0004, decimals: 4, sources: ["binance", "coinbase", "okx"], updated: rtDate(0, 11, 59) },
  { id: rtUuid(4), base: "USDT", quote: "KZT", rate: 512.6, decimals: 2, sources: ["binance", "okx"], updated: rtDate(0, 11, 59) },
  { id: rtUuid(5), base: "EUR", quote: "USD", rate: 1.0862, decimals: 4, sources: ["kraken", "coinbase", "ecb"], updated: rtDate(0, 11, 57) },
  { id: rtUuid(6), base: "GBP", quote: "USD", rate: 1.271, decimals: 4, sources: ["kraken", "coinbase"], updated: rtDate(0, 11, 57) },
  { id: rtUuid(7), base: "USD", quote: "RUB", rate: 92.15, decimals: 2, sources: ["cbr", "binance"], updated: rtDate(0, 11, 30) },
  { id: rtUuid(8), base: "USD", quote: "CNY", rate: 7.241, decimals: 4, sources: ["kraken", "okx"], updated: rtDate(0, 11, 56) },
  { id: rtUuid(9), base: "BTC", quote: "USD", rate: 67420.5, decimals: 2, sources: ["binance", "coinbase", "kraken", "okx"], updated: rtDate(0, 12, 0) },
  { id: rtUuid(10), base: "ETH", quote: "USD", rate: 3520.1, decimals: 2, sources: ["binance", "coinbase", "kraken"], updated: rtDate(0, 12, 0) },
].map((p, i) => ({ ...p, code: entityCode("RTP", i + 1) }));

// Источники курсов (провайдеры rates-plugin); delay — задержка последнего обновления в секундах
const RATE_PROVIDERS = [
  { id: "binance", name: "Binance", kind: "EXCHANGE", status: "ACTIVE", updated: rtDate(0, 12, 0), delay: 2 },
  { id: "coinbase", name: "Coinbase", kind: "EXCHANGE", status: "ACTIVE", updated: rtDate(0, 11, 59), delay: 4 },
  { id: "kraken", name: "Kraken", kind: "EXCHANGE", status: "ACTIVE", updated: rtDate(0, 11, 59), delay: 3 },
  { id: "okx", name: "OKX", kind: "EXCHANGE", status: "ACTIVE", updated: rtDate(0, 11, 58), delay: 5 },
  { id: "nbrk", name: "Нацбанк Казахстана", kind: "REGULATOR", status: "ACTIVE", updated: rtDate(0, 9, 0), delay: 10800 },
  { id: "cbr", name: "Банк России", kind: "REGULATOR", status: "ACTIVE", updated: rtDate(0, 9, 5), delay: 10500 },
  { id: "ecb", name: "Европейский центробанк", kind: "REGULATOR", status: "UNAVAILABLE", updated: rtDate(2, 15, 0), delay: 172800 },
];

const RATE_CLIENTS = [
  { id: rtUuid(101), name: "Иванов Пётр Сергеевич" },
  { id: rtUuid(102), name: "Смирнова Анна Олеговна" },
  { id: rtUuid(103), name: "ТОО «Алтын Трейд»" },
  { id: rtUuid(104), name: "Ким Даниил Андреевич" },
  { id: rtUuid(105), name: "ТОО «Steppe Logistics»" },
  { id: rtUuid(106), name: "Нурланов Ерлан Маратович" },
  { id: rtUuid(107), name: "ИП Ахметова Д. К." },
  { id: rtUuid(108), name: "Belov Trading LLP" },
];

function ratePairByCode(base, quote) {
  return RATE_PAIRS.find((p) => p.base === base && p.quote === quote);
}
function ratePairById(id) {
  return RATE_PAIRS.find((p) => p.id === id);
}
function rateClientById(id) {
  return RATE_CLIENTS.find((c) => c.id === id);
}
function rateProviderById(id) {
  return RATE_PROVIDERS.find((p) => p.id === id);
}
function ratePairLabel(p) {
  return `${p.base}/${p.quote}`;
}

let rtSeq = 200;
function rtGlobal(pair, type, value, status, description, createdAgo, extra) {
  const created = rtDate(createdAgo, 10 + (createdAgo % 6), (createdAgo * 7) % 60);
  return Object.assign({ id: rtUuid(++rtSeq), pairId: pair.id, type, value, status, description, createdDate: created, createdAt: formatDateTime(created), createdBy: "a.kim@aziafintech.kz", endedDate: null, endedAt: null, cancelledDate: null, cancelledAt: null }, extra || {});
}
function rtEnd(rec, agoDays, cancelled) {
  const d = rtDate(agoDays, 9, 30);
  if (cancelled) { rec.status = "CANCELLED"; rec.cancelledDate = d; rec.cancelledAt = formatDateTime(d); }
  else { rec.status = "EXPIRED"; rec.endedDate = d; rec.endedAt = formatDateTime(d); }
  return rec;
}

const RATE_GLOBAL_ADJUSTMENTS = [
  rtGlobal(RATE_PAIRS[0], "PERCENTAGE", 1.5, "ACTIVE", "Маржа на обмен USD → KZT", 12),
  rtEnd(rtGlobal(RATE_PAIRS[0], "PERCENTAGE", 1.2, "ACTIVE", "Прежняя маржа USD → KZT", 60), 12),
  rtEnd(rtGlobal(RATE_PAIRS[0], "PERCENTAGE", 2.5, "ACTIVE", "Повышенная маржа на время волатильности", 95), 60),
  rtGlobal(RATE_PAIRS[1], "PERCENTAGE", 1.4, "ACTIVE", "Маржа на обмен EUR → KZT", 20),
  rtGlobal(RATE_PAIRS[2], "FIXED", 0.0006, "ACTIVE", "Фиксированная надбавка на USDT/USD", 33),
  rtGlobal(RATE_PAIRS[3], "PERCENTAGE", 0.8, "ACTIVE", "Маржа на USDT → KZT", 8),
  rtGlobal(RATE_PAIRS[4], "PERCENTAGE", 0.6, "ACTIVE", "Маржа на EUR/USD", 41),
  rtEnd(rtGlobal(RATE_PAIRS[4], "PERCENTAGE", 0.9, "ACTIVE", "Акционная маржа, отменена до запуска", 70), 66, true),
  rtGlobal(RATE_PAIRS[6], "PERCENTAGE", 2, "ACTIVE", "Маржа на USD → RUB", 5),
  rtGlobal(RATE_PAIRS[8], "PERCENTAGE", 0.5, "ACTIVE", "Маржа на BTC/USD", 18),
  rtEnd(rtGlobal(RATE_PAIRS[9], "FIXED", 4.5, "ACTIVE", "Фиксированная надбавка на ETH/USD", 50), 21),
];

const RATE_INDIVIDUAL_ADJUSTMENTS = [
  Object.assign(rtGlobal(RATE_PAIRS[0], "PERCENTAGE", -0.7, "ACTIVE", "Льготный курс для крупного клиента", 9), { clientIds: [RATE_CLIENTS[2].id, RATE_CLIENTS[4].id] }),
  Object.assign(rtGlobal(RATE_PAIRS[3], "PERCENTAGE", -0.3, "ACTIVE", "Персональные условия по договору", 15), { clientIds: [RATE_CLIENTS[7].id] }),
  Object.assign(rtGlobal(RATE_PAIRS[8], "PERCENTAGE", -0.2, "ACTIVE", "VIP-клиенты: скидка на BTC", 27), { clientIds: [RATE_CLIENTS[0].id, RATE_CLIENTS[5].id, RATE_CLIENTS[3].id] }),
  rtEnd(Object.assign(rtGlobal(RATE_PAIRS[1], "PERCENTAGE", -0.5, "ACTIVE", "Скидка на период акции", 80), { clientIds: [RATE_CLIENTS[1].id, RATE_CLIENTS[6].id] }), 30),
  rtEnd(Object.assign(rtGlobal(RATE_PAIRS[6], "FIXED", -0.4, "ACTIVE", "Разовая скидка, отменена менеджером", 44), { clientIds: [RATE_CLIENTS[6].id] }), 40, true),
];

// ---- Расчёт ------------------------------------------------------------------------------------------------------
// Возвращает новое значение курса или null, если результат ≤ 0 (как в бэкенде)
function rateApply(rate, type, value) {
  const out = type === "PERCENTAGE" ? rate * (value / 100 + 1) : rate + value;
  return out > 0 ? out : null;
}

function rateActiveGlobal(pair) {
  return RATE_GLOBAL_ADJUSTMENTS.filter((a) => a.pairId === pair.id && a.status === "ACTIVE").sort((a, b) => b.createdDate - a.createdDate)[0] || null;
}

function rateFinal(pair) {
  const adj = rateActiveGlobal(pair);
  return adj ? rateApply(pair.rate, adj.type, adj.value) || pair.rate : pair.rate;
}

function rateFormat(value, pair) {
  return Number(value).toLocaleString("ru-RU", { minimumFractionDigits: pair.decimals, maximumFractionDigits: pair.decimals });
}

function rateMarkupText(a) {
  if (!a) return "—";
  const v = Number(a.value);
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const abs = Math.abs(v).toLocaleString("ru-RU", { maximumFractionDigits: 6 });
  return a.type === "PERCENTAGE" ? `${sign}${abs} %` : `${sign}${abs}`;
}
