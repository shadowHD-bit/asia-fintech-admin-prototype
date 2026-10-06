/* ==========================================================================
   Моковые данные и движок для "Операционные настройки → Агрегация": сети провайдера
   крипто-кошельков, триггеры сбора депозитных адресов на сервисный адрес (SERVICE),
   пачки сбора (батчи) и их история. Прототип по реальной спеке провайдера
   crypto-cp-provider (aggregation-triggers.md / aggregation-settlement.md /
   aggregation-admin-ui.md): разрез — сеть целиком, без выбора валюты; суммы — в USD,
   чтобы порог значил одно и то же для любой валюты сети.
   Реальное: 6 видов триггеров и их умолчания, статусы оценки и пачки, правила пауз
   и приоритета при одновременном срабатывании (SERVICE_LOW_BALANCE → READY_ACCUMULATION
   → PERIODIC), правила ошибок валидации.
   Условное: сами сети (взяты 4 крипто-сети, уже заведённые в "vABS → Сети и валюты",
   mock/settings-vabs.mock.js: BITCOIN, ETHEREUM, LITECOIN, TRON — FIAT не агрегируется,
   адресов на ней нет), валюты, суммы, курсы к USD, история и пачки — демонстрационные данные.
   ========================================================================== */

const AGG_NETWORKS = ["TRON", "ETHEREUM", "BITCOIN", "LITECOIN"];

// Курс тикера к USD — условный, подобран так, чтобы суммы в примерах читались ровно
const AGG_USD_RATES = { TRX: 0.34402, TUSDT: 0.9997, ETH: 3180, USDT: 1, BTC: 61000, LTC: 85 };

function aggUsd(ticker, amount) {
  const rate = AGG_USD_RATES[ticker];
  if (rate == null || amount == null) return null;
  return Math.floor(amount * rate * 100) / 100;
}

// Валюты сети: сколько сейчас реально можно собрать (READY) и сколько лежит на SERVICE.
// TRON: баланс SERVICE недоступен (провайдер не ответил) — демонстрирует DATA_UNAVAILABLE.
// ETHEREUM: баланс есть, у USDT он ниже типичного порога — демонстрирует низкий остаток.
const AGG_CURRENCY_SPECS = {
  TRON: [
    { ticker: "TRX", readyAmount: 500, serviceBalanceAmount: null },
    { ticker: "TUSDT", readyAmount: 140, serviceBalanceAmount: null },
  ],
  ETHEREUM: [
    { ticker: "ETH", readyAmount: 0.05, serviceBalanceAmount: 1.2 },
    { ticker: "USDT", readyAmount: 1200, serviceBalanceAmount: 320 },
  ],
  BITCOIN: [
    { ticker: "BTC", readyAmount: 0.012, serviceBalanceAmount: 0.6 },
  ],
  LITECOIN: [
    { ticker: "LTC", readyAmount: 9, serviceBalanceAmount: 140 },
  ],
};

function aggCurrencies(network) {
  return AGG_CURRENCY_SPECS[network].map((c) => {
    const isRateAvailable = AGG_USD_RATES[c.ticker] != null;
    return {
      ticker: c.ticker,
      readyAmount: c.readyAmount,
      readyAmountUsd: isRateAvailable ? aggUsd(c.ticker, c.readyAmount) : null,
      serviceBalanceAmount: c.serviceBalanceAmount,
      serviceBalanceUsd: c.serviceBalanceAmount != null && isRateAvailable ? aggUsd(c.ticker, c.serviceBalanceAmount) : null,
      isRateAvailable,
    };
  });
}

function aggCurrencyByTicker(network, ticker) {
  return aggCurrencies(network).find((c) => c.ticker === ticker) || null;
}

// Баланс SERVICE считается доступным, если провайдер вернул хоть одно значение по сети
function aggIsServiceBalanceAvailable(network) {
  return AGG_CURRENCY_SPECS[network].some((c) => c.serviceBalanceAmount != null);
}

// ---- Виды триггеров и их умолчания (aggregation-triggers.md, раздел "Умолчания") --------------------
const AGG_TRIGGER_KINDS = ["WITHDRAWAL_SHORTFALL", "FEE_QUOTE_SHORTFALL", "MANUAL", "PERIODIC", "READY_ACCUMULATION", "SERVICE_LOW_BALANCE"];
// Приоритет при одновременном срабатывании нескольких проактивных триггеров — побеждает первый по списку
const AGG_SCHEDULED_KINDS = ["SERVICE_LOW_BALANCE", "READY_ACCUMULATION", "PERIODIC"];

const AGG_TRIGGER_DEFAULTS = {
  WITHDRAWAL_SHORTFALL: { enabled: true, canDisable: true, isOnDemand: true, params: {} },
  FEE_QUOTE_SHORTFALL: { enabled: true, canDisable: true, isOnDemand: true, params: {} },
  MANUAL: { enabled: true, canDisable: false, isOnDemand: true, params: {} },
  PERIODIC: { enabled: false, canDisable: true, isOnDemand: false, params: { intervalMinutes: 60 } },
  READY_ACCUMULATION: { enabled: false, canDisable: true, isOnDemand: false, params: { thresholdUsd: 1000 } },
  SERVICE_LOW_BALANCE: { enabled: false, canDisable: true, isOnDemand: false, params: { minBalanceUsd: 500, minCollectUsd: null } },
};

const AGG_PARAM_LIMITS = {
  intervalMinutes: { min: 5, max: 10080 },
  thresholdUsd: { min: 0.01, max: 100000000 },
  minBalanceUsd: { min: 0.01, max: 100000000 },
  minCollectUsd: { min: 0.01, max: 100000000 },
};

// ---- Состояние по сети (мутируется действиями администратора) ------------------------------------------
function aggInitNetworkState() {
  const triggers = {};
  AGG_TRIGGER_KINDS.forEach((kind) => {
    const d = AGG_TRIGGER_DEFAULTS[kind];
    triggers[kind] = {
      isEnabled: d.enabled,
      params: { ...d.params },
      cooldownUntil: null,
      lastOutcome: null,
      lastOutcomeAt: null,
      lastFiredAt: null,
      lastAggregationId: null,
      configUpdatedBy: null,
      configUpdateReason: null,
      configUpdatedAt: null,
    };
  });
  return { control: { isEnabled: true, reason: null, disabledSince: null, disabledByName: null }, triggers };
}

const AGG_STATE = {};
AGG_NETWORKS.forEach((n) => { AGG_STATE[n] = aggInitNetworkState(); });

// ---- Последовательные id/код пачек и событий (тот же приём, что tfId/tfCode — entityCode читает тот же seed) ---
let aggSeq = 80000;
function aggId() { aggSeq += 1; return seedToPaymentUuid(aggSeq); }
function aggCode(prefix) { return entityCode(prefix, aggSeq); }

function aggHoursAgo(h) { return new Date(MOCK_NOW.getTime() - h * 3600 * 1000); }
function aggMinutesAgo(m) { return new Date(MOCK_NOW.getTime() - m * 60 * 1000); }

// ---- Пачки (батчи) -----------------------------------------------------------------------------------
const AGG_BATCH_ACTIVE_STATUSES = ["DRAFT", "SUBMITTED", "CONFIRMING"];

// Детерминированные "адреса" депозитов для демонстрации — не настоящие ключи, просто
// символы нужного вида на сеть (TRON/ETHEREUM/BITCOIN/LITECOIN), по тому же приёму
// сид-генерации, что entityCode/seedToPaymentUuid.
const AGG_B58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function aggAddrChars(seed, len, alphabet) {
  let x = (seed * 2654435761) >>> 0;
  let s = "";
  for (let i = 0; i < len; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    s += alphabet[x % alphabet.length];
  }
  return s;
}
function aggAddress(network, seed) {
  if (network === "TRON") return "T" + aggAddrChars(seed, 33, AGG_B58_CHARS);
  if (network === "ETHEREUM") return "0x" + aggAddrChars(seed, 40, "0123456789abcdef");
  if (network === "BITCOIN") return "bc1q" + aggAddrChars(seed, 38, "023456789acdefghjklmnpqrstuvwxyz");
  if (network === "LITECOIN") return "ltc1q" + aggAddrChars(seed, 38, "023456789acdefghjklmnpqrstuvwxyz");
  return aggAddrChars(seed, 34, AGG_B58_CHARS);
}
function aggTxHash(network, seed) {
  return network === "TRON" ? aggAddrChars(seed, 64, "0123456789abcdef") : "0x" + aggAddrChars(seed, 64, "0123456789abcdef");
}

// Исход сбора по каждому адресу пачки — отдельное от депозитов поле (addressOutcomes
// в реальном API): у упавшей/отклонённой пачки депозиты отвязываются и теряются, это
// единственный источник, что было с конкретным адресом. outcome — либо фиксированный
// статус на все адреса, либо функция (i) => статус для смешанного исхода.
function aggMakeAddressOutcomes(network, count, outcome, seedBase) {
  const specs = AGG_CURRENCY_SPECS[network];
  const list = [];
  for (let i = 0; i < count; i++) {
    const spec = specs[i % specs.length];
    const amount = Math.round((0.4 + ((seedBase + i * 7) % 11) * 0.37) * (spec.ticker === "BTC" ? 0.01 : spec.ticker === "ETH" ? 0.02 : 1) * 1000) / 1000;
    list.push({
      address: aggAddress(network, seedBase * 1000 + i),
      ticker: spec.ticker,
      amount,
      outcome: typeof outcome === "function" ? outcome(i) : outcome,
    });
  }
  return list;
}

function aggMakeBatch(network, status, triggerKind, addressesCount, createdAt, extra) {
  const id = aggId();
  const code = aggCode("AGB");
  return {
    id, code, network, status, triggerKind, addressesCount,
    createdAt, submittedAt: null, processedAt: null,
    txHashes: [], addressOutcomes: [], error: null, failureReason: null, failure: null,
    releasedBy: null, releasedAt: null, releaseOutcome: null, releaseReason: null,
    ...extra,
  };
}

const aggB1 = aggMakeBatch("TRON", "FAILED", "FEE_QUOTE_SHORTFALL", 2, aggHoursAgo(26), {
  submittedAt: aggMinutesAgo(26 * 60 - 1), processedAt: aggMinutesAgo(26 * 60 - 40),
  addressOutcomes: aggMakeAddressOutcomes("TRON", 2, "NOT_SUBMITTED", 101),
  error: "Crypto processing provider error: Can't aggregate (Status: 400)",
  failureReason: "PROVIDER_REJECTED",
  failure: { statusCode: 400, providerErrorId: "ERR-7F3A1C9D", requestId: "req-88213f", step: "SUBMIT" },
});
const aggB2 = aggMakeBatch("TRON", "FAILED", "MANUAL", 3, aggHoursAgo(45), {
  submittedAt: aggHoursAgo(45), processedAt: aggHoursAgo(44),
  addressOutcomes: aggMakeAddressOutcomes("TRON", 3, "NOT_SUBMITTED", 102),
  error: "Crypto processing provider error: Can't aggregate (Status: 503)",
  failureReason: "PROVIDER_UNAVAILABLE",
  failure: { statusCode: 503, providerErrorId: "ERR-2B9E04AA", requestId: "req-5509c2", step: "SUBMIT" },
});
const aggB3 = aggMakeBatch("ETHEREUM", "SUBMITTED", "SERVICE_LOW_BALANCE", 14, aggMinutesAgo(6), {
  submittedAt: aggMinutesAgo(5),
  addressOutcomes: aggMakeAddressOutcomes("ETHEREUM", 14, "PENDING", 103),
});
const aggB4 = aggMakeBatch("ETHEREUM", "CONFIRMED", "READY_ACCUMULATION", 22, aggHoursAgo(30), {
  submittedAt: aggHoursAgo(30), processedAt: aggHoursAgo(29),
  addressOutcomes: aggMakeAddressOutcomes("ETHEREUM", 22, "CONFIRMED", 104),
  txHashes: [aggTxHash("ETHEREUM", 1041), aggTxHash("ETHEREUM", 1042)],
});
const aggB5 = aggMakeBatch("TRON", "CONFIRMED", "WITHDRAWAL_SHORTFALL", 1, aggHoursAgo(72), {
  submittedAt: aggHoursAgo(72), processedAt: aggHoursAgo(71.7),
  addressOutcomes: aggMakeAddressOutcomes("TRON", 1, "CONFIRMED", 105),
  txHashes: [aggTxHash("TRON", 1051)],
});
const aggB6 = aggMakeBatch("TRON", "PARTIALLY_CONFIRMED", "MANUAL", 5, aggHoursAgo(96), {
  submittedAt: aggHoursAgo(96), processedAt: aggHoursAgo(95.5),
  addressOutcomes: aggMakeAddressOutcomes("TRON", 5, (i) => (i < 3 ? "CONFIRMED" : "REJECTED"), 106),
  txHashes: [aggTxHash("TRON", 1061)],
});
const aggB7 = aggMakeBatch("ETHEREUM", "EXPIRED", "SERVICE_LOW_BALANCE", 9, aggHoursAgo(120), {
  submittedAt: aggHoursAgo(120),
  addressOutcomes: aggMakeAddressOutcomes("ETHEREUM", 9, "PENDING", 107),
  txHashes: [aggTxHash("ETHEREUM", 1071), aggTxHash("ETHEREUM", 1072)],
});
const aggB8 = aggMakeBatch("TRON", "REJECTED", "READY_ACCUMULATION", 6, aggHoursAgo(144), {
  submittedAt: aggHoursAgo(144), processedAt: aggHoursAgo(143.6),
  addressOutcomes: aggMakeAddressOutcomes("TRON", 6, "REJECTED", 108),
});

let AGG_BATCHES = [aggB3, aggB1, aggB2, aggB4, aggB5, aggB6, aggB7, aggB8];

function aggBatchById(id) { return AGG_BATCHES.find((b) => b.id === id) || null; }
function aggBatchesOf(network) { return AGG_BATCHES.filter((b) => b.network === network); }
function aggOpenBatch(network) { return aggBatchesOf(network).find((b) => AGG_BATCH_ACTIVE_STATUSES.includes(b.status)) || null; }

// ---- История (события триггеров и выключателя) --------------------------------------------------------
function aggMakeEvent(network, kind, type, createdAt, extra) {
  return { id: aggId(), code: aggCode("AGE"), network, kind: kind || null, type, aggregationId: null, actorName: null, reason: null, details: {}, createdAt, ...extra };
}

let AGG_EVENTS = [
  aggMakeEvent("TRON", "FEE_QUOTE_SHORTFALL", "SKIPPED_OPEN_BATCH", aggHoursAgo(26) /* чуть позже создания aggB1 */, { aggregationId: aggB1.id, details: { draftOutcome: "ALREADY_OPEN" } }),
  aggMakeEvent("TRON", "FEE_QUOTE_SHORTFALL", "FIRED", aggHoursAgo(26.01), { aggregationId: aggB1.id, details: { draftOutcome: "CREATED" } }),
  aggMakeEvent("TRON", "MANUAL", "FIRED", aggHoursAgo(45), { aggregationId: aggB2.id, actorName: "Админ Тестовый", reason: "Перед крупным выводом клиента" }),
  aggMakeEvent("TRON", "MANUAL", "SKIPPED_NOTHING_TO_COLLECT", aggHoursAgo(20), { actorName: "Админ Тестовый", reason: "Проверка перед техработами" }),
  aggMakeEvent("ETHEREUM", "SERVICE_LOW_BALANCE", "FIRED", aggMinutesAgo(6), { aggregationId: aggB3.id }),
  aggMakeEvent("ETHEREUM", "READY_ACCUMULATION", "COVERED_BY_OTHER_TRIGGER", aggMinutesAgo(6), { aggregationId: aggB3.id, details: { primaryKind: "SERVICE_LOW_BALANCE" } }),
  aggMakeEvent("ETHEREUM", "READY_ACCUMULATION", "FIRED", aggHoursAgo(30), { aggregationId: aggB4.id }),
  aggMakeEvent("ETHEREUM", "PERIODIC", "CONFIG_CHANGED", aggHoursAgo(48), {
    actorName: "Админ Тестовый", reason: "Сбор раз в 6 часов",
    details: { before: { isEnabled: false, params: { intervalMinutes: 60 } }, after: { isEnabled: true, params: { intervalMinutes: 360 } } },
  }),
  aggMakeEvent("TRON", "WITHDRAWAL_SHORTFALL", "FIRED", aggHoursAgo(72), { aggregationId: aggB5.id }),
  aggMakeEvent("TRON", "MANUAL", "FIRED", aggHoursAgo(96), { aggregationId: aggB6.id, actorName: "Админ Тестовый", reason: "Накопилось много депозитов за выходные" }),
  aggMakeEvent("ETHEREUM", "SERVICE_LOW_BALANCE", "FIRED", aggHoursAgo(120), { aggregationId: aggB7.id }),
  aggMakeEvent("TRON", "READY_ACCUMULATION", "FIRED", aggHoursAgo(144), { aggregationId: aggB8.id }),
  aggMakeEvent("TRON", "SERVICE_LOW_BALANCE", "METRIC_UNAVAILABLE", aggHoursAgo(50), { details: { unavailableTickers: ["TRX", "TUSDT"], reason: "SERVICE balance is unavailable" } }),
];
AGG_EVENTS.sort((a, b) => b.createdAt - a.createdAt);

// ---- Состояние триггеров (ссылки на пачки и исходы — после того, как пачки и id уже созданы) ------------
(function aggSeedTriggerStates() {
  const tron = AGG_STATE.TRON.triggers;
  Object.assign(tron.FEE_QUOTE_SHORTFALL, { lastOutcome: "SKIPPED_OPEN_BATCH", lastOutcomeAt: aggHoursAgo(26), lastFiredAt: aggHoursAgo(26.01), lastAggregationId: aggB1.id });
  Object.assign(tron.MANUAL, { lastOutcome: "SKIPPED_NOTHING_TO_COLLECT", lastOutcomeAt: aggHoursAgo(20), lastFiredAt: aggHoursAgo(45), lastAggregationId: aggB2.id });
  Object.assign(tron.WITHDRAWAL_SHORTFALL, { lastOutcome: "FIRED", lastOutcomeAt: aggHoursAgo(72), lastFiredAt: aggHoursAgo(72), lastAggregationId: aggB5.id });
  Object.assign(tron.READY_ACCUMULATION, { lastOutcome: "FIRED", lastOutcomeAt: aggHoursAgo(144), lastFiredAt: aggHoursAgo(144), lastAggregationId: aggB8.id });
  Object.assign(tron.SERVICE_LOW_BALANCE, { lastOutcome: null, lastOutcomeAt: null, lastFiredAt: aggHoursAgo(120), lastAggregationId: null });

  const eth = AGG_STATE.ETHEREUM.triggers;
  Object.assign(eth.SERVICE_LOW_BALANCE, {
    isEnabled: true, params: { minBalanceUsd: 500, minCollectUsd: 100 },
    lastOutcome: "FIRED", lastOutcomeAt: aggMinutesAgo(6), lastFiredAt: aggMinutesAgo(6), lastAggregationId: aggB3.id,
    configUpdatedBy: { name: "Админ Тестовый" }, configUpdateReason: "Выводы USDT встают вечером — собираем заранее", configUpdatedAt: aggHoursAgo(60),
  });
  Object.assign(eth.READY_ACCUMULATION, {
    isEnabled: true, params: { thresholdUsd: 1000 },
    lastOutcome: "COVERED_BY_OTHER_TRIGGER", lastOutcomeAt: aggMinutesAgo(6), lastFiredAt: aggHoursAgo(30), lastAggregationId: aggB3.id,
  });
  Object.assign(eth.PERIODIC, {
    isEnabled: true, params: { intervalMinutes: 360 },
    configUpdatedBy: { name: "Админ Тестовый" }, configUpdateReason: "Сбор раз в 6 часов", configUpdatedAt: aggHoursAgo(48),
  });
  Object.assign(eth.WITHDRAWAL_SHORTFALL, { lastOutcome: "FIRED", lastOutcomeAt: aggHoursAgo(120), lastFiredAt: aggHoursAgo(120), lastAggregationId: aggB7.id });
})();

function aggParams(network, kind) { return AGG_STATE[network].triggers[kind].params; }

// ---- Живая оценка условия: только у трёх проактивных (как в реальном движке) -------------------------------
function aggEvaluate(network, kind) {
  if (!AGG_SCHEDULED_KINDS.includes(kind)) return null;
  const state = AGG_STATE[network].triggers[kind];
  const params = aggParams(network, kind);
  const now = MOCK_NOW;

  if (kind === "PERIODIC") {
    if (!state.isEnabled) return null;
    const anchor = state.lastFiredAt || state.configUpdatedAt || now;
    let next = new Date(anchor.getTime() + params.intervalMinutes * 60000);
    while (next.getTime() <= now.getTime()) next = new Date(next.getTime() + params.intervalMinutes * 60000);
    return { status: "NOT_DUE", valueUsd: null, thresholdUsd: null, nextRunAt: next, lowBalanceTickers: [], unavailableTickers: [], reason: null, evaluatedAt: now };
  }

  const currencies = aggCurrencies(network);

  if (kind === "READY_ACCUMULATION") {
    const withReady = currencies.filter((c) => c.readyAmount > 0);
    const unavailable = withReady.filter((c) => !c.isRateAvailable).map((c) => c.ticker);
    const sum = withReady.filter((c) => c.isRateAvailable).reduce((s, c) => s + c.readyAmountUsd, 0);
    const threshold = params.thresholdUsd;
    let status, reason;
    if (unavailable.length) { status = "DATA_UNAVAILABLE"; reason = `No USD rate for ${unavailable.join(", ")}`; }
    else if (sum >= threshold) { status = "DUE"; reason = `READY ${sum} USD is at or above the threshold ${threshold} USD`; }
    else { status = "NOT_DUE"; reason = `READY ${sum} USD is below the threshold ${threshold} USD`; }
    return { status, valueUsd: sum, thresholdUsd: threshold, nextRunAt: null, lowBalanceTickers: [], unavailableTickers: unavailable, reason, evaluatedAt: now };
  }

  // SERVICE_LOW_BALANCE — по каждой валюте, у которой есть что собрать
  const withReady = currencies.filter((c) => c.readyAmount > 0);
  const svcAvailable = aggIsServiceBalanceAvailable(network);
  if (!svcAvailable) {
    return { status: "DATA_UNAVAILABLE", valueUsd: null, thresholdUsd: params.minBalanceUsd, nextRunAt: null, lowBalanceTickers: [], unavailableTickers: withReady.map((c) => c.ticker), reason: "SERVICE balance is unavailable", evaluatedAt: now };
  }
  const unavailable = withReady.filter((c) => !c.isRateAvailable || c.serviceBalanceAmount == null).map((c) => c.ticker);
  const minCollect = params.minCollectUsd;
  const eligible = withReady.filter((c) => c.isRateAvailable && c.serviceBalanceAmount != null && (minCollect == null || c.readyAmountUsd >= minCollect));
  if (!eligible.length) {
    return { status: "DATA_UNAVAILABLE", valueUsd: null, thresholdUsd: params.minBalanceUsd, nextRunAt: null, lowBalanceTickers: [], unavailableTickers: unavailable, reason: "No currency with both a balance and enough READY to collect", evaluatedAt: now };
  }
  const low = eligible.filter((c) => c.serviceBalanceUsd < params.minBalanceUsd);
  const minVal = Math.min(...eligible.map((c) => c.serviceBalanceUsd));
  const status = low.length ? "DUE" : "NOT_DUE";
  const reason = low.length ? `${low.map((c) => c.ticker).join(", ")} balance is below the threshold ${params.minBalanceUsd} USD` : `All eligible balances are at or above the threshold ${params.minBalanceUsd} USD`;
  return { status, valueUsd: minVal, thresholdUsd: params.minBalanceUsd, nextRunAt: null, lowBalanceTickers: low.map((c) => c.ticker), unavailableTickers: unavailable, reason, evaluatedAt: now };
}

function aggIsDefaultParams(kind, params) {
  return JSON.stringify(params) === JSON.stringify(AGG_TRIGGER_DEFAULTS[kind].params);
}

// ---- Сборка ответа на экран сети (как vabsCryptoProviderAggregationTriggers) ---------------------------
function aggNetworkOverview(network) {
  const st = AGG_STATE[network];
  const open = aggOpenBatch(network);
  const triggers = AGG_TRIGGER_KINDS.map((kind) => {
    const s = st.triggers[kind];
    const def = AGG_TRIGGER_DEFAULTS[kind];
    const cooldownUntil = s.cooldownUntil && s.cooldownUntil.getTime() > MOCK_NOW.getTime() ? s.cooldownUntil : null;
    return {
      kind, isOnDemand: def.isOnDemand, isEnabled: s.isEnabled, canDisable: def.canDisable,
      isDefault: aggIsDefaultParams(kind, s.params),
      params: s.params, defaultParams: def.params,
      evaluation: aggEvaluate(network, kind),
      cooldownUntil,
      lastOutcome: s.lastOutcome, lastOutcomeAt: s.lastOutcomeAt, lastFiredAt: s.lastFiredAt,
      lastAggregation: s.lastAggregationId ? aggBatchById(s.lastAggregationId) : null,
      configUpdatedBy: s.configUpdatedBy, configUpdateReason: s.configUpdateReason, configUpdatedAt: s.configUpdatedAt,
    };
  });
  return {
    network, isAvailable: true,
    aggregationControl: { ...st.control },
    isServiceBalanceAvailable: aggIsServiceBalanceAvailable(network),
    currencies: aggCurrencies(network),
    openAggregation: open,
    triggers,
  };
}

// ---- Мутации -------------------------------------------------------------------------------------------
function aggLogEvent(network, kind, type, extra) {
  const ev = aggMakeEvent(network, kind, type, pdNow(), extra);
  AGG_EVENTS.unshift(ev);
  return ev;
}

function aggSetTriggerConfig(network, kind, { isEnabled, params, reason }) {
  const s = AGG_STATE[network].triggers[kind];
  const before = { isEnabled: s.isEnabled, params: { ...s.params } };
  if (isEnabled !== undefined) s.isEnabled = isEnabled;
  if (params) Object.assign(s.params, params);
  const now = pdNow();
  s.configUpdatedBy = { name: CURRENT_ADMIN.name };
  s.configUpdateReason = reason || null;
  s.configUpdatedAt = now;
  aggLogEvent(network, kind, "CONFIG_CHANGED", { actorName: CURRENT_ADMIN.name, reason: reason || null, details: { before, after: { isEnabled: s.isEnabled, params: { ...s.params } } } });
}

function aggCreateBatch(network, triggerKind, addressesCount) {
  const now = pdNow();
  const batch = aggMakeBatch(network, "DRAFT", triggerKind, addressesCount, now, {});
  AGG_BATCHES.unshift(batch);
  return batch;
}

// Ручной запуск — те же проверки, что и у автоматики (выключатель, открытая пачка, пауза, нечего собирать)
function aggManualRun(network, reason) {
  const st = AGG_STATE[network];
  const now = pdNow();
  const mTrig = st.triggers.MANUAL;
  const finish = (outcome, aggregationId, extra) => {
    mTrig.lastOutcome = outcome;
    mTrig.lastOutcomeAt = now;
    aggLogEvent(network, "MANUAL", outcome, { actorName: CURRENT_ADMIN.name, reason, aggregationId: aggregationId || null, ...extra });
    return { outcome, aggregation: aggregationId ? aggBatchById(aggregationId) : null, cooldownUntil: mTrig.cooldownUntil };
  };
  if (!st.control.isEnabled) return finish("SKIPPED_AGGREGATION_DISABLED");
  const open = aggOpenBatch(network);
  if (open) return finish("SKIPPED_OPEN_BATCH", open.id, { details: { aggregationId: open.id } });
  if (mTrig.cooldownUntil && mTrig.cooldownUntil.getTime() > now.getTime()) return finish("SKIPPED_COOLDOWN", null, { details: { cooldownUntil: mTrig.cooldownUntil } });
  const collectible = aggCurrencies(network).filter((c) => c.readyAmount > 0);
  if (!collectible.length) return finish("SKIPPED_NOTHING_TO_COLLECT");
  const batch = aggCreateBatch(network, "MANUAL", collectible.length * 3 + 1);
  mTrig.lastFiredAt = now;
  mTrig.lastAggregationId = batch.id;
  return finish("FIRED", batch.id);
}

// Выключатель операции AGGREGATION — упрощённо, на уровне сети (без общего провайдерского свитча)
function aggSetControl(network, isEnabled, reason) {
  const st = AGG_STATE[network];
  const now = pdNow();
  st.control.isEnabled = isEnabled;
  st.control.reason = isEnabled ? null : (reason || null);
  st.control.disabledSince = isEnabled ? null : now;
  st.control.disabledByName = isEnabled ? null : CURRENT_ADMIN.name;
  aggLogEvent(network, null, isEnabled ? "AGGREGATION_ENABLED" : "AGGREGATION_DISABLED", { actorName: CURRENT_ADMIN.name, reason: reason || null });
}

// Ручное закрытие зависшей (EXPIRED) пачки
function aggReleaseBatch(id, outcome, reason) {
  const b = aggBatchById(id);
  if (!b) return null;
  const now = pdNow();
  b.status = outcome === "CONFIRMED" ? "CONFIRMED" : "REJECTED";
  b.releasedBy = { name: CURRENT_ADMIN.name };
  b.releasedAt = now;
  b.releaseOutcome = outcome;
  b.releaseReason = reason;
  aggLogEvent(b.network, b.triggerKind, outcome === "CONFIRMED" ? "FIRED" : "FAILED", { actorName: CURRENT_ADMIN.name, reason, aggregationId: b.id, details: { manualRelease: true, outcome } });
  return b;
}

function aggEventsOf({ networks, kinds, types, aggregationId, dateFrom, dateTo } = {}) {
  return AGG_EVENTS.filter((e) =>
    (!networks || !networks.length || networks.includes(e.network)) &&
    (!kinds || !kinds.length || (e.kind && kinds.includes(e.kind))) &&
    (!types || !types.length || types.includes(e.type)) &&
    (!aggregationId || e.aggregationId === aggregationId) &&
    (!dateFrom || e.createdAt >= dateFrom) &&
    (!dateTo || e.createdAt <= dateTo)
  ).sort((a, b) => b.createdAt - a.createdAt);
}

const AGG_BATCH_STATUSES = ["DRAFT", "SUBMITTED", "CONFIRMING", "CONFIRMED", "PARTIALLY_CONFIRMED", "REJECTED", "FAILED", "EXPIRED", "COMPLETED", "PARTIALLY_COMPLETED"];
