/* ==========================================================================
   Мок "Операции → ОТС сделки". Форма записи — VabsOtcDeal из core-feature-dev_bank_core (schema.graphql, INTEGRATION.md
   модуля common-payments-plugin/core/payments/methods/otc): админские ручки vabsGetAdminOtcDeals / vabsGetAdminOtcDeal /
   vabsGetAdminOtcStats / vabsForceCancelAdminOtcDeal / vabsExportAdminOtcDealReceiptPdf.

   Что взято из бэкенда:
   - 8 статусов: PENDING, CONFIRMING, REJECTING, CANCELING (транзиторные) и COMPLETED, REJECTED, CANCELED, EXPIRED (терминальные);
   - 4 типа по base/quote: CRYPTO_CRYPTO, CRYPTO_FIAT, FIAT_CRYPTO, FIAT_FIAT;
   - продавец (seller) продаёт base-валюту, покупатель (buyer) платит quote-валютой: cost = amount × price;
     priceInQuote = price, priceInBase = 1 / price; fee — комиссия площадки в base-валюте (0, если тариф не задан);
   - referenceNumber "OTC-XXXXXXXXXXXX", срок сделки expiresAt (по умолчанию 24 ч, минимум 5 минут, максимум 7 дней);
   - админ видит только sellerEmail / buyerEmail (алиасы из адресной книги видны только самим участникам);
   - force-cancel — только PENDING-сделки, причина обязательна (до 500 символов), canceledBy = id админа;
   - платёж: paymentId = id операции в леджере, статус платежа: DRAFT → PROCESSING → SUCCESSFUL / DECLINED.
   ГРАНИЦЫ ПРОТОТИПА (не из бэкенда): сами значения (суммы, курсы, даты, причины) — демонстрационные; список проводок и
   уведомлений по сделке выводится из статуса по правилам документации модуля, а не читается отдельной ручкой.
   ========================================================================== */

const OTC_DEAL_STATUSES = ["PENDING", "CONFIRMING", "REJECTING", "CANCELING", "COMPLETED", "REJECTED", "CANCELED", "EXPIRED"];
const OTC_TRANSIENT_STATUSES = ["CONFIRMING", "REJECTING", "CANCELING"];
const OTC_ACTIVE_STATUSES = ["PENDING", ...OTC_TRANSIENT_STATUSES];
const OTC_FAILED_STATUSES = ["REJECTED", "CANCELED", "EXPIRED"];
const OTC_DEAL_TYPES = ["CRYPTO_CRYPTO", "CRYPTO_FIAT", "FIAT_CRYPTO", "FIAT_FIAT"];
const OTC_STUCK_AFTER_MS = 5 * 60 * 1000; // OtcStuckDealsScheduler: транзиторный статус дольше ~5 минут — re-drive

// Валюты сделки: тикер + сеть (у фиата сети нет)
const OTC_ASSETS = {
  USDT_TRON: { ticker: "USDT", network: "TRON", kind: "CRYPTO" },
  USDT_ETH: { ticker: "USDT", network: "ETHEREUM", kind: "CRYPTO" },
  USD: { ticker: "USD", network: null, kind: "FIAT" },
  EUR: { ticker: "EUR", network: null, kind: "FIAT" },
  RUB: { ticker: "RUB", network: null, kind: "FIAT" },
  KGS: { ticker: "KGS", network: null, kind: "FIAT" },
};

// base — что продаёт продавец, quote — чем платит покупатель; price — quote за 1 base
const OTC_PAIRS = [
  { base: "USDT_TRON", quote: "RUB", price: 92.4, sizes: [800, 2500, 12000] },
  { base: "USDT_ETH", quote: "KGS", price: 87.9, sizes: [500, 3000, 9000] },
  { base: "USDT_TRON", quote: "USD", price: 1.001, sizes: [1500, 10000, 40000] },
  { base: "USDT_TRON", quote: "USDT_ETH", price: 0.999, sizes: [2000, 8000, 25000] },
  { base: "EUR", quote: "USDT_TRON", price: 1.085, sizes: [1200, 6000, 20000] },
  { base: "USD", quote: "USDT_ETH", price: 0.998, sizes: [1000, 5000, 15000] },
  { base: "USD", quote: "EUR", price: 0.92, sizes: [3000, 12000, 50000] },
  { base: "EUR", quote: "RUB", price: 100.8, sizes: [700, 4000, 15000] },
  { base: "USD", quote: "KGS", price: 87.6, sizes: [500, 2500, 10000] },
  { base: "RUB", quote: "KGS", price: 0.95, sizes: [60000, 250000, 900000] },
];

const OTC_WHITE_LABELS = ["3f1c9a52-7d0e-4b6a-9a2e-5c8b1d4e7f10", "8a6e2b91-4c3d-4f57-b0a8-2e9d6c1f3a75"];

const OTC_COMMENTS = [null, null, "Сделка по устной договорённости", "Оплата по счёту-фактуре", "Просьба подтвердить до конца дня", null, "Регулярный клиент", null];
const OTC_REJECTION_REASONS = ["Не устраивает курс", "Передумал", "Нет средств на счёте", "Ошибочно указан получатель"];
const OTC_CANCELLATION_REASONS = ["Изменились условия", "Ошибка в цене", "Создана по ошибке"];
const OTC_ADMIN_CANCEL_REASONS = ["Отмена по обращению в поддержку", "Подозрение на мошенничество, сделка остановлена до проверки"];

// Порядок статусов по сделкам: свежие — активные, дальше вперемешку
const OTC_STATUS_PLAN = [
  "PENDING", "PENDING", "COMPLETED", "CONFIRMING", "PENDING", "COMPLETED", "REJECTED", "PENDING", "COMPLETED", "CANCELED",
  "EXPIRED", "COMPLETED", "REJECTING", "COMPLETED", "COMPLETED", "CANCELED", "COMPLETED", "EXPIRED", "REJECTED", "COMPLETED",
  "COMPLETED", "CANCELING", "COMPLETED", "REJECTED", "COMPLETED", "EXPIRED", "COMPLETED", "CANCELED", "COMPLETED", "COMPLETED",
  "REJECTED", "COMPLETED", "EXPIRED", "COMPLETED", "CANCELED", "COMPLETED", "COMPLETED", "REJECTED", "COMPLETED", "EXPIRED",
  "COMPLETED", "COMPLETED",
];

function otcAssetLabel(key) {
  return OTC_ASSETS[key].ticker;
}

function otcDealType(baseKey, quoteKey) {
  return `${OTC_ASSETS[baseKey].kind}_${OTC_ASSETS[quoteKey].kind}`;
}

function otcRefNumber(seed) {
  return `OTC-${cwHex(seed + 301, 12).toUpperCase()}`;
}

// Комментарии администраторов (только в прототипе): у части сделок уже есть заметки поддержки
const OTC_ADMIN_NOTES = ["Клиент обратился в поддержку, уточняем детали сделки", "Проверили участников — замечаний нет", "Покупатель просил продлить срок, срок не меняем", "Связались с продавцом, ждём ответ"];

function otcSeedComments(seed, createdDate, doneDate) {
  if (seed % 3 !== 0 || typeof ACCESS_ADMINS === "undefined" || !ACCESS_ADMINS.length) return [];
  const count = 1 + (seed % 2);
  return Array.from({ length: count }).map((_, k) => ({
    id: `otc-seed-${seed}-${k}`,
    adminId: ACCESS_ADMINS[(seed + k) % ACCESS_ADMINS.length].email,
    createdAt: new Date(createdDate.getTime() + (30 + k * 45) * 60 * 1000),
    text: OTC_ADMIN_NOTES[(seed + k) % OTC_ADMIN_NOTES.length],
  }));
}

const OTC_DEALS_MOCK = OTC_STATUS_PLAN.map((status, i) => {
  const seed = i + 1;
  const pair = OTC_PAIRS[(seed * 3) % OTC_PAIRS.length];
  const seller = CLIENTS_USERS_MOCK[(seed * 3) % CLIENTS_USERS_MOCK.length];
  const buyer = CLIENTS_USERS_MOCK[(seed * 3 + 7) % CLIENTS_USERS_MOCK.length];
  const sizes = pair.sizes;
  const amount = +(sizes[seed % sizes.length] * (1 + ((seed * 7) % 10) / 20)).toFixed(2);
  const price = pair.price;
  const cost = +(amount * price).toFixed(2);
  const fee = seed % 9 === 0 ? 0 : +(amount * 0.005).toFixed(2);
  const ttlHours = [24, 24, 48, 72, 6][seed % 5];

  const createdDate = new Date(MOCK_NOW.getTime() - (i * 5.7 + 0.4) * 60 * 60 * 1000);
  const expiresDate = new Date(createdDate.getTime() + Math.max(ttlHours, status === "PENDING" ? 72 : 0) * 60 * 60 * 1000);
  // Завершение: через 10–600 минут после создания, но не позже "сейчас"
  const afterMs = Math.min((10 + ((seed * 53) % 590)) * 60 * 1000, ttlHours * 0.9 * 3600 * 1000, MOCK_NOW.getTime() - createdDate.getTime() - 6 * 60 * 1000);
  const doneDate = new Date(createdDate.getTime() + Math.max(afterMs, 60 * 1000));
  const transientAge = seed === 4 ? 12 : 1 + (seed % 3); // сделка №4 зависла в CONFIRMING дольше порога
  const updatedDate = OTC_TRANSIENT_STATUSES.includes(status) ? new Date(MOCK_NOW.getTime() - transientAge * 60 * 1000) : status === "PENDING" ? new Date(createdDate.getTime() + 60 * 1000) : status === "EXPIRED" ? expiresDate : doneDate;

  const isAdminCancel = status === "CANCELED" && seed % 2 === 0;
  const admin = typeof ACCESS_ADMINS !== "undefined" && ACCESS_ADMINS.length ? ACCESS_ADMINS[seed % ACCESS_ADMINS.length] : null;
  const canceledBy = status === "CANCELED" ? (isAdminCancel && admin ? admin.id : seller.id) : null;

  const at = (date) => (date ? formatDateTime(date) : null);
  const dateOf = (cond, date) => (cond ? date : null);
  const completedDate = dateOf(status === "COMPLETED", doneDate);
  const rejectedDate = dateOf(status === "REJECTED", doneDate);
  const canceledDate = dateOf(status === "CANCELED", doneDate);
  const expiredDate = dateOf(status === "EXPIRED", expiresDate);

  return {
    id: seedToPaymentUuid(seed + 700),
    referenceNumber: otcRefNumber(seed),
    sellerUserId: seller.id,
    sellerEmail: seller.email,
    sellerName: seller.fullName || seller.email,
    buyerUserId: buyer.id,
    buyerEmail: buyer.email,
    buyerName: buyer.fullName || buyer.email,
    baseKey: pair.base,
    quoteKey: pair.quote,
    baseCurrencyTicker: OTC_ASSETS[pair.base].ticker,
    quoteCurrencyTicker: OTC_ASSETS[pair.quote].ticker,
    baseNetworkName: OTC_ASSETS[pair.base].network,
    quoteNetworkName: OTC_ASSETS[pair.quote].network,
    type: otcDealType(pair.base, pair.quote),
    amount,
    price,
    priceInQuote: price,
    priceInBase: +(1 / price).toFixed(8),
    cost,
    fee,
    status,
    comment: OTC_COMMENTS[seed % OTC_COMMENTS.length],
    rejectionReason: status === "REJECTED" ? OTC_REJECTION_REASONS[seed % OTC_REJECTION_REASONS.length] : null,
    rejectedBy: status === "REJECTED" ? buyer.id : null,
    cancellationReason: status === "CANCELED" ? (isAdminCancel ? OTC_ADMIN_CANCEL_REASONS[seed % OTC_ADMIN_CANCEL_REASONS.length] : OTC_CANCELLATION_REASONS[seed % OTC_CANCELLATION_REASONS.length]) : null,
    canceledBy,
    comments: otcSeedComments(seed, createdDate, doneDate),
    whiteLabelId: OTC_WHITE_LABELS[seed % OTC_WHITE_LABELS.length],
    paymentId: seedToPaymentUuid(seed + 900),
    createdDate,
    updatedDate,
    expiresDate,
    completedDate,
    rejectedDate,
    canceledDate,
    expiredDate,
    createdAt: at(createdDate),
    updatedAt: at(updatedDate),
    expiresAt: at(expiresDate),
    completedAt: at(completedDate),
    rejectedAt: at(rejectedDate),
    canceledAt: at(canceledDate),
    expiredAt: at(expiredDate),
  };
});

function otcDealById(id) {
  return OTC_DEALS_MOCK.find((d) => d.id === id) || null;
}

function otcIsTransient(d) {
  return OTC_TRANSIENT_STATUSES.includes(d.status);
}

// Транзиторный статус дольше порога — сделка "зависла", её подхватит планировщик re-drive
function otcIsStuck(d) {
  return otcIsTransient(d) && MOCK_NOW.getTime() - d.updatedDate.getTime() > OTC_STUCK_AFTER_MS;
}

// Force-cancel доступен только PENDING-сделке, срок которой не истёк
function otcCanForceCancel(d) {
  return d.status === "PENDING" && d.expiresDate.getTime() > MOCK_NOW.getTime();
}

// Квитанция PDF — только для COMPLETED (isReceiptPdfExportAvailable)
function otcCanReceipt(d) {
  return d.status === "COMPLETED";
}

// Статус платежа сделки: нет row → DRAFT → PROCESSING → SUCCESSFUL / DECLINED
function otcPaymentStatus(d) {
  if (d.status === "COMPLETED") return "SUCCESSFUL";
  if (OTC_FAILED_STATUSES.includes(d.status)) return "DECLINED";
  return "PROCESSING";
}

// Проводки леджера (OtcDealVirtualOrderEnum, INTEGRATION.md → Ledger / Accounting): order, фаза, D/C, сумма, счёт, валюта.
// state: DONE — выполнена, RUNNING — выполняется (транзиторный статус), WAITING — ждёт подтверждения покупателя, SKIPPED — не выполнялась
function otcLedger(d) {
  const settle = d.status === "COMPLETED" ? "DONE" : d.status === "CONFIRMING" ? "RUNNING" : d.status === "PENDING" ? "WAITING" : "SKIPPED";
  const reverse = OTC_FAILED_STATUSES.includes(d.status) ? "DONE" : d.status === "REJECTING" || d.status === "CANCELING" ? "RUNNING" : "SKIPPED";
  const base = d.baseCurrencyTicker;
  const quote = d.quoteCurrencyTicker;
  return [
    { order: 1, phase: "hold", dc: "DEBIT", amount: +(d.amount + d.fee).toFixed(8), currency: base, account: "sellerMain", state: "DONE" },
    { order: 2, phase: "settle", dc: "CREDIT", amount: d.amount, currency: base, account: "buyerBase", state: settle },
    { order: 3, phase: "settle", dc: "DEBIT", amount: d.cost, currency: quote, account: "buyerQuote", state: settle },
    { order: 4, phase: "settle", dc: "CREDIT", amount: d.cost, currency: quote, account: "sellerQuote", state: settle },
    { order: 5, phase: "settle", dc: "CREDIT", amount: d.fee, currency: base, account: "commission", state: settle },
    { order: 6, phase: "reverse", dc: "CREDIT", amount: +(d.amount + d.fee).toFixed(8), currency: base, account: "sellerMain", state: reverse },
  ];
}

// Письма по сделке (таблица "Email-уведомления" документации): кому и когда уходит
function otcNotifications(d) {
  const list = [{ code: "CREATED", to: ["buyer"], at: d.createdDate }];
  if (d.status === "COMPLETED") list.push({ code: "COMPLETED", to: ["seller", "buyer"], at: d.completedDate });
  if (d.status === "REJECTED") list.push({ code: "REJECTED", to: ["seller"], at: d.rejectedDate });
  if (d.status === "CANCELED") list.push({ code: "CANCELED", to: ["buyer"], at: d.canceledDate });
  if (d.status === "EXPIRED") list.push({ code: "EXPIRED", to: ["seller", "buyer"], at: d.expiredDate });
  return list;
}

// Хронология сделки
function otcTimeline(d) {
  const ev = [{ code: "created", date: d.createdDate }, { code: "hold", date: new Date(d.createdDate.getTime() + 60 * 1000) }];
  if (d.status === "PENDING") ev.push({ code: "waiting", date: null });
  if (d.status === "CONFIRMING") ev.push({ code: "confirming", date: d.updatedDate });
  if (d.status === "REJECTING") ev.push({ code: "rejecting", date: d.updatedDate });
  if (d.status === "CANCELING") ev.push({ code: "canceling", date: d.updatedDate });
  if (d.status === "COMPLETED") ev.push({ code: "confirmed", date: new Date(d.completedDate.getTime() - 60 * 1000) }, { code: "completed", date: d.completedDate });
  if (d.status === "REJECTED") ev.push({ code: "rejected", date: d.rejectedDate });
  if (d.status === "CANCELED") ev.push({ code: "canceled", date: d.canceledDate });
  if (d.status === "EXPIRED") ev.push({ code: "expired", date: d.expiredDate });
  return ev;
}


