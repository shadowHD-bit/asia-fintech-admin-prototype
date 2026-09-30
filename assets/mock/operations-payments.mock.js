/* ==========================================================================
   Моковые данные для "Операции → Платежи".
   Схема выверена чтением бэкенда 21.09.2026: `payments(input: FindPaymentsInput)`
   — core-feature-dev_bank_core/plugins/common-payments-plugin/core/payments/
   graphql/{resolvers/payments.resolver.ts, inputs/find-payments.input.ts,
   types/common-payment.type.ts}. Это ОТДЕЛЬНЫЙ бэкенд-репозиторий от того,
   что использовался для users/companies (там этого модуля нет).

   Гарантированно есть всегда (`!` в CommonPaymentType): id, createdAt,
   updatedAt, direction, isFavorite, paymentSystem, status, attachments,
   amount, fee, totalAmount, purposeOfPayment.
   Nullable: sender, recipient, settled, previousStatus, note, metadata
   (и внутри sender/recipient — clientId, clientType тоже nullable).

   Фильтров по сумме и сортировки в FindPaymentsInput НЕТ (проверено) —
   поэтому здесь их тоже нет: не добавляем то, чего не отдаёт реальная ручка.

   sender/recipient.clientId — когда одна сторона реально "наш" клиент, а когда
   null (сторона вне системы, есть только реквизиты) — НЕ производится единым
   резолвером, а выставляется отдельно в каждом payment-method сервисе при
   создании платежа (core/payments/methods/<method>/services/<...>.service.ts),
   см. исследование 23.09.2026:
   - INNER/DEFERRED_INNER/EXCHANGE/OTC — ОБЕ стороны всегда наши клиенты
     (inner-payments.service.ts, exchange-payments.service.ts, у OTC это сделка
     между двумя нашими клиентами — otc-payments-accounting.service.ts).
   - SWIFT/WIRE/ACH/SBP/CARD_NUMBER (классические внешние рельсы) — ровно одна
     сторона наш клиент (та, что соответствует direction), другая — внешняя, её
     clientId всегда null (ach-payments.service.ts и аналоги по остальным методам).
   - CRYPTO_WALLET/CASH в реальном коде имеют доп. подслучаи (например перевод
     между двумя своими кошельками — тоже обе стороны внутренние), но это
     решается внутренним типом операции, а не paymentSystem/direction — в моке
     не моделируем, используем тот же паттерн "одна сторона", что и у прочих
     внешних рельсов (честно недомоделировано, не выдаём за подтверждённое).
   ========================================================================== */

// PaymentStatusEnum — core/payments/enums/payment-status.enum.ts
const PAYMENT_STATUS_OPTIONS = ["DRAFT", "PROCESSING", "ON_REVIEW", "NEED_ACTION", "SUCCESSFUL", "REFUNDED", "DECLINED"];

// PaymentDirectionEnum — payment-direction.enum.ts. В схеме есть и значение
// BOTH, но это семантика фильтра ("любое направление"), не значение самого
// платежа — строка платежа всегда INCOMING либо OUTGOING, поэтому в UI (и в
// моке, и в фильтре) оставлены только эти два, чтобы не было выбора,
// который гарантированно ничего не найдёт.
const PAYMENT_DIRECTION_OPTIONS = ["INCOMING", "OUTGOING"];

// PaymentSystemEnum — payment-system.enum.ts (полный список — 19 рельсов,
// здесь подмножество, реально встречающееся в моке, но допустимых значений
// в фильтре больше — см. PAYMENT_SYSTEM_ALL_OPTIONS)
const PAYMENT_SYSTEM_ALL_OPTIONS = [
  "SWIFT", "ELCART_CARD", "IFSC", "BSB", "ACH", "WIRE", "SBP", "CARD_NUMBER",
  "REQUISITES", "RU_WIRE", "CASH", "INNER", "DEFERRED_INNER", "EXCHANGE",
  "INTERNAL_CARDS", "OTC", "CRYPTO_WALLET", "CRYPTO_ACQUIRING", "CARD",
];
const PAYMENT_SYSTEM_MOCK_OPTIONS = ["SWIFT", "SBP", "CARD_NUMBER", "WIRE", "ACH", "CASH", "CRYPTO_WALLET", "OTC", "INNER"];

// PaymentClientTypeEnum — common/enums/payment-client-type.enum.ts
const PAYMENT_CLIENT_TYPE_OPTIONS = ["INDIVIDUAL", "CORPORATE"];

const PAYMENT_CURRENCY_OPTIONS = ["USD", "EUR", "RUB", "KGS", "USDT"];

const PAYMENT_PURPOSES = [
  "Оплата услуг", "Перевод между счетами", "Возврат средств", "Пополнение баланса",
  "Оплата по счёту", "Вывод средств", "Перевод по СБП", "Обмен валюты",
];

// PaymentSourceOfFunds — core/payments/methods/base/enums/payment-source-of-funds.enum.ts
// (только у BasePaymentType — SWIFT/WIRE/ACH и т.п., подтверждено пасенным
// примером реального ответа 23.09.2026: там же у конкретного платежа было null —
// поле честно опционально, заполнено не всегда).
const PAYMENT_SOURCE_OF_FUNDS_OPTIONS = [
  "COMMISSION_OF_SALES", "DIVIDEND_INCOME_FROM_SHARE", "INVESTMENT_CAPITAL",
  "REVENUE_GENERATED_FROM_BUSINESS_ACTIVITIES", "SALARY", "SAVING",
];

function seedToPaymentUuid(seed) {
  const hex = (n, len) => (n >>> 0).toString(16).padStart(len, "0").slice(-len);
  return `${hex(seed * 374761393, 8)}-${hex(seed * 668265263, 4)}-4${hex(seed * 2246822519, 3).slice(0, 3)}-9${hex(seed * 3266489917, 3).slice(0, 3)}-${hex(seed * 2654435761, 12)}`;
}

// Отправитель/получатель раньше были случайными "чужими" uuid, никуда не
// ведущими. Реальный senderClientId/recipientClientId в схеме — это id из
// identity/companies-сервисов (то же пространство id, что и у CLIENTS_USERS_MOCK/
// CLIENTS_COMPANIES_MOCK), поэтому линкуем на настоящие записи — тогда в
// таблице можно показать имя (а не голый id) и по клику вести на карточку
// клиента. name — с тем же фолбэком на email, что и везде в проекте (у
// физлица email обязателен, ФИО — нет).
// riskLevel сюда сознательно НЕ добавляем: скоринг в реальном коде считается
// на сам платёж (см. PAYMENT_BOTH_INTERNAL_SYSTEMS-комментарий ниже про
// payments-accounting.service.ts → processScoringEvent → payment.metadata.
// scoringResult), а не хранится как статическое поле клиента-стороны платежа.
// Уровень риска клиента (scoringRiskLevel) — отдельная, честная вещь на
// карточке самого клиента (Клиенты → Пользователи/Компании), но не здесь.
function paymentPartyRef(seed, offset) {
  const type = pick(PAYMENT_CLIENT_TYPE_OPTIONS, seed + offset);
  if (type === "CORPORATE") {
    const c = CLIENTS_COMPANIES_MOCK[(seed + offset) % CLIENTS_COMPANIES_MOCK.length];
    return { id: c.id, type, name: c.name, link: `#/clients-companies/${c.id}` };
  }
  const u = CLIENTS_USERS_MOCK[(seed + offset) % CLIENTS_USERS_MOCK.length];
  return { id: u.id, type, name: u.fullName || u.email, link: `#/clients-users/${u.id}` };
}

// См. комментарий в шапке файла: только на этих рельсах ОБЕ стороны — наши
// клиенты; на остальных — ровно одна (та, что соответствует direction),
// другая сторона вне системы (есть только реквизиты, не клиент).
const PAYMENT_BOTH_INTERNAL_SYSTEMS = ["INNER", "DEFERRED_INNER", "EXCHANGE", "OTC"];

// Рельсы на базе BasePaymentType (BasePaymentMethodExternalClientEntity) —
// только у них внешняя сторона реально имеет имя (accountHolderName/
// firstName+lastName), вводится вручную при создании платежа. Подтверждено
// чтением swift/wire/ach-payments.service.ts + *.entity.ts 24.09.2026.
const PAYMENT_BASE_RAIL_SYSTEMS = ["SWIFT", "WIRE", "ACH"];

// Внешняя сторона (не наш клиент) — не значит "нет данных вообще": в реальном
// коде clientType для внешней стороны всегда сохраняется явным обязательным
// полем (вводится тем, кто создаёт платёж), а вот имя есть НЕ у всех рельсов:
// - SWIFT/WIRE/ACH (BasePaymentType) — имя реально есть (accountHolderName).
// - SBP — имени в схеме нет вовсе: получателя определяет только bankId из
//   справочника банков (см. комментарий к CreateSbpPaymentExternalClientInput
//   в реальном коде — БИК необязателен именно потому, что справочник Paygine
//   отдаёт по банку только id+название, имени участника там нет).
// - CARD_NUMBER — тоже нет: только cardPan, держателя карты схема не хранит.
// Честно возвращаем name: null для этих двух рельсов, а не выдумываем ФИО.
// id/ссылки на карточку нет и быть не может — это не наш клиент.
function paymentExternalPartyRef(seed, offset, paymentSystem) {
  const type = pick(PAYMENT_CLIENT_TYPE_OPTIONS, seed + offset);
  const hasName = PAYMENT_BASE_RAIL_SYSTEMS.includes(paymentSystem);
  const name = hasName
    ? type === "CORPORATE"
      ? `${pick(COMPANY_NAME_STEMS, seed + offset)} ${1 + ((seed + offset) % 40)}`
      : `${pick(FIRST_NAMES, seed + offset)} ${pick(LAST_NAMES, (seed + offset) * 3)}`
    : null;
  return { type, name };
}

// ---- CRYPTO_WALLET: сеть, хеш и внешний адрес ------------------------------------------------------
// Сети — ключи из networkToExplorerUrlMap бэкенда (neuron-transactions): по ним строится ссылка на эксплорер.
// Токен во всех сетях USDT (в прототипе другие активы не рассматриваем).
const PAYMENT_CRYPTO_NETWORKS = ["TRON", "ETHEREUM"]; // только сети, которые есть в справочнике vABS (VB_NETWORKS) — на них ведут ссылки из карточки

function cwHex(seed, len) {
  let s = "";
  let x = (seed * 2654435761) >>> 0;
  while (s.length < len) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    s += x.toString(16).padStart(8, "0");
  }
  return s.slice(0, len);
}

function cwBase58(seed, len) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = "";
  let x = (seed * 2246822519) >>> 0;
  while (s.length < len) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    s += alphabet[x % alphabet.length];
  }
  return s;
}

function cwAddress(network, seed) {
  return network === "TRON" ? `T${cwBase58(seed, 33)}` : `0x${cwHex(seed, 40)}`;
}

function cwShort(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
}

// Внутренний перевод между клиентами (CUSTOMER_TRANSFER) в блокчейн не попадает — хеша нет
function buildCryptoWallet(seed, operationType) {
  const network = pick(PAYMENT_CRYPTO_NETWORKS, seed);
  const onChain = operationType !== "CUSTOMER_TRANSFER";
  return {
    networkName: network,
    currencyTicker: "USDT",
    hash: onChain ? (network === "TRON" ? cwHex(seed + 7, 64) : `0x${cwHex(seed + 7, 64)}`) : null,
    addressFrom: onChain ? cwAddress(network, seed + 1) : null,
    addressFromTag: null,
    addressTo: onChain ? cwAddress(network, seed + 2) : null,
    addressToTag: null,
  };
}

const OPERATIONS_PAYMENTS_MOCK = Array.from({ length: 40 }).map((_, i) => {
  const seed = i + 1;
  const baseDirection = pick(PAYMENT_DIRECTION_OPTIONS, seed);
  // Каждая 4-я строка — крипто: ТОЛЬКО рельс CRYPTO_WALLET (CRYPTO_ACQUIRING и часть типов операций пока не
  // рассматриваем) с типом операции ввод / вывод / перевод между клиентами (cryptoWallet.operationType).
  // У остальных строк крипто-рельса и USDT нет — фиат и крипто не смешиваются ("Фиатные платежи" / "Криптоплатежи").
  const isCryptoRow = seed % 4 === 0;
  let paymentSystem = pick(PAYMENT_SYSTEM_MOCK_OPTIONS, seed * 3);
  if (isCryptoRow) paymentSystem = "CRYPTO_WALLET";
  else if (paymentSystem === "CRYPTO_WALLET") paymentSystem = "SWIFT";
  const cryptoOperationType = isCryptoRow ? pick(["CUSTOMER_DEPOSIT", "CUSTOMER_WITHDRAWAL", "CUSTOMER_TRANSFER", "CUSTOMER_DEPOSIT", "CUSTOMER_WITHDRAWAL"], seed) : null;
  const isCryptoTransfer = cryptoOperationType === "CUSTOMER_TRANSFER";
  // Направление: у внутренних рельсов (INNER и т.п.) — BOTH, как в реальном enum; у крипто-ввода/вывода — по типу операции;
  // крипто-перевод между клиентами тоже BOTH (обе стороны наши) — допущение прототипа.
  const direction = PAYMENT_BOTH_INTERNAL_SYSTEMS.includes(paymentSystem) || isCryptoTransfer ? "BOTH"
    : cryptoOperationType === "CUSTOMER_DEPOSIT" ? "INCOMING"
    : cryptoOperationType === "CUSTOMER_WITHDRAWAL" ? "OUTGOING"
    : baseDirection;
  const status = pick(PAYMENT_STATUS_OPTIONS, seed * 5);

  const createdDate = new Date(MOCK_NOW.getTime() - seed * 6.1 * 60 * 60 * 1000);
  const updatedDate = new Date(createdDate.getTime() + (3 + (seed % 40)) * 60 * 1000);
  const isSettled = status === "SUCCESSFUL" || (status === "REFUNDED" && seed % 2 === 0);
  const settledDate = isSettled ? new Date(updatedDate.getTime() + 2 * 60 * 1000) : null;

  // На INNER/DEFERRED_INNER/EXCHANGE/OTC обе стороны — наши клиенты; на
  // остальных рельсах — только сторона, соответствующая direction (вторая
  // сторона вне системы, clientId=null, есть только реквизиты — раздел
  // "Реквизиты" на карточке платежа, а не клиентская сущность).
  const isBothInternal = PAYMENT_BOTH_INTERNAL_SYSTEMS.includes(paymentSystem) || isCryptoTransfer;
  const hasSender = isBothInternal || direction === "OUTGOING";
  const hasRecipient = isBothInternal || direction === "INCOMING";
  const cryptoWallet = isCryptoRow ? buildCryptoWallet(seed, cryptoOperationType) : null;
  // У крипто внешняя сторона — не человек, а адрес в сети (имя = сокращённый адрес, типа клиента нет)
  const senderRef = cryptoWallet && cryptoOperationType === "CUSTOMER_DEPOSIT" ? { type: null, name: cwShort(cryptoWallet.addressFrom) } : hasSender ? paymentPartyRef(seed, 1000) : paymentExternalPartyRef(seed, 1000, paymentSystem);
  const recipientRef = cryptoWallet && cryptoOperationType === "CUSTOMER_WITHDRAWAL" ? { type: null, name: cwShort(cryptoWallet.addressTo) } : hasRecipient ? paymentPartyRef(seed, 2000) : paymentExternalPartyRef(seed, 2000, paymentSystem);

  const fiatCurrencies = PAYMENT_CURRENCY_OPTIONS.filter((c) => c !== "USDT");
  const currency = isCryptoRow ? "USDT" : pick(fiatCurrencies, seed);
  const isExchange = !isCryptoRow && (paymentSystem === "OTC" || paymentSystem === "EXCHANGE" || seed % 9 === 0);
  const targetCurrency = isExchange ? pick(fiatCurrencies, seed + 2) : currency;

  const sourceAmount = 50 + ((seed * 137) % 9500);
  const exchangeRate = isExchange ? +(0.85 + ((seed % 20) / 100)).toFixed(4) : 1;
  const targetAmount = isExchange ? +(sourceAmount * exchangeRate).toFixed(2) : sourceAmount;
  const feeAmount = +(sourceAmount * 0.012).toFixed(2);
  const totalAmount = +(sourceAmount + feeAmount).toFixed(2);

  return {
    id: seedToPaymentUuid(seed),
    code: entityCode(isCryptoRow ? "CRY" : "PAY", seed),
    createdDate,
    updatedDate,
    createdAt: formatDateTime(createdDate),
    updatedAt: formatDateTime(updatedDate),
    settledDate,
    settledAt: settledDate ? formatDateTime(settledDate) : null,
    direction,
    paymentSystem,
    cryptoOperationType,
    cryptoWallet,
    status,
    previousStatus: status === "DECLINED" && seed % 2 === 0 ? "ON_REVIEW" : null,
    isFavorite: seed % 11 === 0,
    sourceOfFunds: seed % 5 === 0 ? pick(PAYMENT_SOURCE_OF_FUNDS_OPTIONS, seed) : null,
    // id/link есть только у настоящих клиентов (senderRef.id truthy) — у
    // внешней стороны (paymentExternalPartyRef) их нет вовсе, только type/name.
    senderClientId: senderRef.id || null,
    senderClientType: senderRef.type,
    senderClientName: senderRef.name,
    senderClientLink: senderRef.link || null,
    recipientClientId: recipientRef.id || null,
    recipientClientType: recipientRef.type,
    recipientClientName: recipientRef.name,
    recipientClientLink: recipientRef.link || null,
    sourceAmount,
    sourceCurrency: currency,
    targetAmount,
    targetCurrency,
    exchangeRate,
    feeAmount,
    feeCurrency: currency,
    totalAmount,
    totalCurrency: currency,
    purposeOfPayment: pick(PAYMENT_PURPOSES, seed),
    note: seed % 6 === 0 ? "Требуется дополнительная проверка отправителя" : null,
  };
});
