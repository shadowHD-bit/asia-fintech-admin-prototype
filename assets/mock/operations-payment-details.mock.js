/* ==========================================================================
   Моковые данные для страницы деталей платежа/обмена.
   Форма — по спецификации docs/operations-payment-details-spec.md (сверена с
   бэкендом core-feature-dev_bank_core/plugins/common-payments-plugin):
   - fee: у каждой стороны provider / bank / total;
   - реквизиты зависят от платёжной системы (base для SWIFT/WIRE/ACH, sbp,
     cardNumber, inner/exchange, crypto, otc, cash);
   - комментарии (PaymentComment: adminId, comment, attachments);
   - запросы информации (PaymentInfoRequest: requestText, responseText, status);
   - вложения (customFileName; имя файла и размер в реальности приходят из
     сервиса файлов — здесь заполнены для наглядности);
   - скоринг лежит в metadata.scoringResult (типизированного поля нет).
   Детали строятся детерминированно от id платежа и кэшируются, чтобы
   добавленные в интерфейсе комментарии/запросы не пропадали при перерисовке.
   Загружается после operations-payments.mock.js и operations-exchanges.mock.js.
   ========================================================================== */

const PAYMENT_DETAIL_EXTRAS = new Map();

// "Текущий оператор" — автор комментариев и запросов, созданных в интерфейсе.
// Раньше были случайные uuid, никуда не ведущие — теперь настоящие записи
// ACCESS_ADMINS (settings-access.mock.js), чтобы в комментариях показывать
// реальное имя админа, а не голый id. Функции, а не const — ACCESS_ADMINS
// грузится ПОСЛЕ этого файла (settings-access.mock.js), обращаться к нему
// можно только внутри вызова функции, не на верхнем уровне модуля.
function paymentAdminId() {
  return ACCESS_ADMINS[0].id; // "Админ Тестовый" — тот же условный "текущий оператор", что и везде в проекте
}
function paymentOtherAdminIds() {
  return ACCESS_ADMINS.slice(1, 4).map((a) => a.id);
}

const PAYMENT_MOCK_BANKS = [
  { name: "Optima Bank", bic: "OPTLKG22", country: "Кыргызстан", city: "Бишкек" },
  { name: "Demir Bank", bic: "DEMIKG22", country: "Кыргызстан", city: "Бишкек" },
  { name: "Halyk Bank", bic: "HSBKKZKX", country: "Казахстан", city: "Алматы" },
  { name: "Deutsche Bank", bic: "DEUTDEFF", country: "Германия", city: "Франкфурт" },
];

const PAYMENT_MOCK_NETWORKS = [
  { network: "TRON", ticker: "USDT" },
  { network: "Ethereum", ticker: "USDT" },
  { network: "Bitcoin", ticker: "BTC" },
];

const PAYMENT_COMMENT_TEXTS = [
  "Проверил реквизиты получателя, расхождений нет.",
  "Запросил подтверждение источника средств.",
  "Клиент подтвердил назначение платежа по телефону.",
  "Сумма выше типового лимита для клиента, передал старшему оператору.",
];

const PAYMENT_REQUEST_TEXTS = [
  "Пришлите договор или инвойс, на основании которого выполняется платёж.",
  "Уточните источник средств и назначение платежа.",
];

const PAYMENT_REQUEST_RESPONSES = [
  "Договор поставки во вложении, оплата по счёту №112.",
  "Средства получены от продажи товара, подтверждающий документ прикреплён.",
];

const PAYMENT_MOCK_FILES = [
  { customFileName: "Инвойс", fileName: "invoice.pdf", sizeKb: 184 },
  { customFileName: "Договор", fileName: "contract.pdf", sizeKb: 612 },
  { customFileName: null, fileName: "transfer_screenshot.png", sizeKb: 241 },
];

function paymentHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

function paymentHexOf(seed, len) {
  let s = "";
  let x = seed >>> 0;
  while (s.length < len) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    s += x.toString(16).padStart(8, "0");
  }
  return s.slice(0, len);
}

function paymentPersonName(h, k) {
  return `${pick(LAST_NAMES, h + k)} ${pick(FIRST_NAMES, h + k * 3)}`;
}

function paymentPartyName(h, k, clientType) {
  return clientType === "CORPORATE" ? `${pick(COMPANY_NAME_STEMS, h + k)} LLC` : paymentPersonName(h, k);
}

function buildPaymentClient(h, k, clientId, clientType) {
  return {
    clientId: clientId || seedToPaymentUuid(h + k * 100),
    clientType: clientType || "INDIVIDUAL",
    accountId: String(1000000 + ((h + k * 7919) % 8999999)),
    accountHolderName: paymentPartyName(h, k, clientType),
    email: `user${(h + k) % 900}@fexpost.com`,
    phoneNumber: `+7901${String(1000000 + ((h + k * 137) % 8999999)).slice(0, 7)}`,
  };
}

function buildPaymentRail(row, h) {
  const bank = pick(PAYMENT_MOCK_BANKS, h);
  const bank2 = pick(PAYMENT_MOCK_BANKS, h + 1);
  const iban = (b) => `KG${10 + (h % 80)}${b.bic.slice(0, 4)}${String(h * 7919).slice(-12).padStart(12, "0")}`;
  const externalType = row.recipientClientType || "INDIVIDUAL";

  switch (row.paymentSystem) {
    case "SWIFT":
    case "WIRE":
    case "ACH":
      return {
        kind: "base",
        accountType: row.paymentSystem === "SWIFT" ? null : pick(["CHECKING", "SAVINGS"], h),
        internal: { accountHolderName: paymentPersonName(h, 1), accountNumber: iban(bank), bankName: bank.name },
        external: {
          // firstName/lastName/middleName — реальные поля
          // BasePaymentMethodExternalClientEntity (только у физлиц, для
          // юрлица — null, только accountHolderName); согласованы с уже
          // сгенерированным accountHolderName (тот же paymentPersonName(h,2)).
          firstName: externalType === "INDIVIDUAL" ? pick(FIRST_NAMES, h + 6) : null,
          lastName: externalType === "INDIVIDUAL" ? pick(LAST_NAMES, h + 2) : null,
          middleName: null,
          accountHolderName: paymentPartyName(h, 2, externalType),
          clientType: externalType,
          bankCode: bank2.bic,
          accountNumber: iban(bank2),
          branchCode: String(100 + (h % 900)),
          bankName: bank2.name,
          country: bank2.country,
          city: bank2.city,
          addressLine: `ул. Ленина, ${1 + (h % 90)}`,
          postalCode: String(720000 + (h % 999)),
        },
        // Уточнено 24.09.2026 (services/entities, не только GraphQL-тип):
        // intermediaryBank — общее поле BasePaymentMethodExternalClientEntity,
        // одинаково хранится и принимается у SWIFT, WIRE и ACH — не только у
        // SWIFT, как считалось раньше. У SBP/CARD_NUMBER такого поля нет вовсе.
        intermediaryBank: h % 2 === 0 ? { name: pick(PAYMENT_MOCK_BANKS, h + 2).name, bankCode: pick(PAYMENT_MOCK_BANKS, h + 2).bic } : null,
      };
    case "SBP":
      return {
        kind: "sbp",
        internal: { accountHolderName: paymentPersonName(h, 1), accountNumber: iban(bank) },
        external: { bankId: String(100000000 + (h % 899999999)), bankBic: `04452${String(1000 + (h % 8999))}`, clientType: externalType },
      };
    case "CARD_NUMBER":
      return {
        kind: "cardNumber",
        external: { cardPan: `5536 91** **** ${String(1000 + (h % 8999))}`, clientType: externalType },
      };
    case "INNER":
      return {
        kind: "inner",
        senderClient: buildPaymentClient(h, 1, row.senderClientId, row.senderClientType),
        recipientClient: buildPaymentClient(h, 2, row.recipientClientId, row.recipientClientType),
      };
    case "EXCHANGE": {
      // Один и тот же клиент по обе стороны (см. шапку operations-exchanges.
      // mock.js) — buildPaymentClient(h, k, ...) с разным k сгенерировал бы
      // ДВА разных имени для одного и того же человека, поэтому берём общего
      // клиента один раз (k=1) и только подставляем разные accountId — те же,
      // что уже показаны в списке (row.senderAccountId/recipientAccountId).
      const sameClient = buildPaymentClient(h, 1, row.senderClientId, row.senderClientType);
      return {
        kind: "inner",
        senderClient: { ...sameClient, accountId: row.senderAccountId || sameClient.accountId },
        recipientClient: { ...sameClient, accountId: row.recipientAccountId || sameClient.accountId },
      };
    }
    case "CRYPTO_WALLET": {
      // Сеть, хеш и адреса лежат прямо в строке платежа (row.cryptoWallet, operations-payments.mock.js) — так список и карточка согласованы
      const cw = row.cryptoWallet;
      if (cw) return { kind: "crypto", operationType: row.cryptoOperationType, ...cw };
      const net = pick(PAYMENT_MOCK_NETWORKS, h);
      return {
        kind: "crypto",
        operationType: "CUSTOMER_WITHDRAWAL",
        networkName: net.network,
        currencyTicker: net.ticker,
        hash: `0x${paymentHexOf(h, 64)}`,
        addressFrom: `0x${paymentHexOf(h + 1, 40)}`,
        addressTo: `0x${paymentHexOf(h + 2, 40)}`,
      };
    }
    case "OTC": {
      const seller = buildPaymentClient(h, 3, null, "INDIVIDUAL");
      const buyer = buildPaymentClient(h, 4, null, "CORPORATE");
      return {
        kind: "otc",
        referenceNumber: `OTC-${String(100000 + (h % 899999))}`,
        dealId: seedToPaymentUuid(h + 5),
        dealType: pick(["CRYPTO_CRYPTO", "CRYPTO_FIAT", "FIAT_CRYPTO", "FIAT_FIAT"], h),
        status: pick(["PENDING", "CONFIRMING", "COMPLETED", "REJECTED"], h),
        sellerClientId: seller.clientId,
        sellerEmail: seller.email,
        buyerClientId: buyer.clientId,
        buyerEmail: buyer.email,
        baseNetworkName: pick(PAYMENT_MOCK_NETWORKS, h).network,
        quoteNetworkName: pick(PAYMENT_MOCK_NETWORKS, h + 1).network,
      };
    }
    case "CASH":
      return {
        kind: "cash",
        operationType: pick(["DEPOSIT", "WITHDRAWAL"], h),
        internal: { clientId: row.senderClientId || seedToPaymentUuid(h + 6), representativeId: seedToPaymentUuid(h + 7) },
        external: {
          officeId: `office-${1 + (h % 12)}`,
          whiteLabelId: seedToPaymentUuid(h + 8),
          partnerId: h % 3 === 0 ? seedToPaymentUuid(h + 9) : null,
          operatorId: seedToPaymentUuid(h + 10),
        },
      };
    default:
      return { kind: "none" };
  }
}

// Платёж, созданный прямо в интерфейсе (мастер "Создать платёж" в списке
// платежей, operations-payments.js) — честно начинается "с нуля": комментариев/
// запросов ещё не было. Скоринг (processScoringEvent) реально считается не
// при подготовке, а при отправке (sendPayment, подтверждено чтением
// payments-accounting.service.ts) — поэтому пока платёж в DRAFT ("Сохранить
// черновик"), скоринга нет; как только он "отправлен" ("Создать" → status
// PROCESSING, см. submitCreatePayment), скоринг честно появляется — так же,
// как у любого другого платежа не в DRAFT. Реквизиты (rail) — ровно то, что
// ввёл админ в форме (row._manualRail), а не сгенерированные по хешу id —
// иначе введённые данные бы просто потерялись на карточке платежа.
function buildManualPaymentExtras(row) {
  const h = paymentHash(row.id);
  const level = pick(SCORING_RISK_LEVELS, h);
  const scoring =
    row.status === "DRAFT"
      ? null
      : {
          finalDecision: pick(["APPROVED", "MANUAL_REVIEW", "DECLINED"], h),
          normalizedScore: 8 + (h % 85),
          riskLevel: { name: level, level: SCORING_RISK_LEVELS.indexOf(level) + 1 },
          provider: "Scoring Service",
        };
  return {
    fee: { provider: +(row.feeAmount * 0.35).toFixed(2), bank: +(row.feeAmount * 0.65).toFixed(2), total: row.feeAmount, rate: row.exchangeRate || 1 },
    // attachments: AttachmentInput[] реально есть на CreateCommonPaymentInput —
    // то, что админ приложил на шаге "Краткое содержание" мастера создания
    // (row.attachments, см. submitCreatePayment/pcStepSummaryHtml,
    // operations-payments.js).
    attachments: row.attachments || [],
    scoring,
    operation: { status: row.status === "DRAFT" ? "NEW" : "PROCESSING", providers: [] },
    rail: row._manualRail,
    comments: [],
    infoRequests: [],
  };
}

function getPaymentDetailExtras(row) {
  if (PAYMENT_DETAIL_EXTRAS.has(row.id)) return PAYMENT_DETAIL_EXTRAS.get(row.id);

  if (row._manual) {
    const extras = buildManualPaymentExtras(row);
    PAYMENT_DETAIL_EXTRAS.set(row.id, extras);
    return extras;
  }

  const h = paymentHash(row.id);
  const feeTotal = row.feeAmount;
  const rate = row.exchangeRate || 1;

  const commentsCount = h % 4;
  const comments = Array.from({ length: commentsCount }).map((_, i) => {
    const date = new Date(row.createdDate.getTime() + (i + 1) * 17 * 60 * 1000);
    return {
      id: `cm-${row.id.slice(0, 6)}-${i}`,
      adminId: pick(paymentOtherAdminIds(), h + i),
      text: pick(PAYMENT_COMMENT_TEXTS, h + i),
      createdDate: date,
      createdAt: formatDateTime(date),
    };
  });

  const hasRequest = row.status === "NEED_ACTION" || h % 5 === 0;
  const infoRequests = hasRequest
    ? [
        (() => {
          const requested = new Date(row.createdDate.getTime() + 25 * 60 * 1000);
          const awaiting = row.status === "NEED_ACTION";
          const responded = awaiting ? null : new Date(requested.getTime() + 40 * 60 * 1000);
          return {
            id: `ir-${row.id.slice(0, 6)}`,
            adminId: pick(paymentOtherAdminIds(), h),
            requestText: pick(PAYMENT_REQUEST_TEXTS, h),
            responseText: awaiting ? null : pick(PAYMENT_REQUEST_RESPONSES, h),
            status: awaiting ? "AWAITING_CLIENT_RESPONSE" : "CLIENT_RESPONDED",
            createdAt: formatDateTime(requested),
            respondedAt: responded ? formatDateTime(responded) : null,
          };
        })(),
      ]
    : [];

  // url — для картинок честный плейсхолдер picsum (реальных байт у старых
  // демо-вложений нет; тот же приём уже используется для документов KYC,
  // см. openDocumentAddWizard в clients-users.js), у остальных — null (только
  // значок, без превью/скачивания, чтобы не выдавать выдумку за файл).
  const attachments = PAYMENT_MOCK_FILES.slice(0, h % 3).map((f, i) => ({
    id: `at-${row.id.slice(0, 6)}-${i}`,
    ...f,
    url: typeof pdIsImageFile !== "undefined" && pdIsImageFile(f.fileName) ? `https://picsum.photos/seed/${row.id.slice(0, 8)}-${i}/480/320` : null,
  }));

  // scoring — вызов _gqlScoringConnectorService.processScoringEvent, результат
  // { finalDecision, normalizedScore, riskLevel } пишется в payment.metadata.
  // scoringResult (payments-accounting.service.ts, подтверждено чтением кода
  // 23.09.2026). provider — название самого сервиса скоринга; конкретное
  // отображаемое имя в коде не встретилось (только имя коннектора), поэтому
  // здесь условное "Scoring Service" — честно не подтверждённое значение.
  const level = pick(SCORING_RISK_LEVELS, h);
  const scoring =
    h % 3 === 0
      ? null
      : {
          finalDecision: pick(["APPROVED", "MANUAL_REVIEW", "DECLINED"], h),
          normalizedScore: 8 + (h % 85),
          riskLevel: { name: level, level: SCORING_RISK_LEVELS.indexOf(level) + 1 },
          provider: "Scoring Service",
        };

  // operation.status/providers — реальные поля ответа getSoloPayment
  // (operation{providers, status}, пример 23.09.2026). Статус — реальный
  // VabsOperationStatus (NEW/PROCESSING/ERROR/DECLINED/PARTIAL_DECLINED/
  // COMPLETED, подтверждено vbCalcOperationStatus в settings-vabs.mock.js).
  // providers — названия провайдеров проводок этой операции (VB_PROVIDERS).
  const operation = {
    status: pick(["NEW", "PROCESSING", "ERROR", "DECLINED", "PARTIAL_DECLINED", "COMPLETED"], h + 3),
    providers: typeof VB_PROVIDERS !== "undefined" ? VB_PROVIDERS.slice(h % VB_PROVIDERS.length, (h % VB_PROVIDERS.length) + 1).map((p) => p.name) : [],
  };

  // У обмена комиссия — не provider/bank пополам, как у переводов: вся
  // комиссия банковская (по сути спред), provider-часть всегда 0
  // (_getExchangeBankFee/_calculateExchangeAmounts, exchange-payments.
  // service.ts, подтверждено чтением 24.09.2026).
  const isExchange = row.paymentSystem === "EXCHANGE";
  const extras = {
    fee: {
      provider: isExchange ? 0 : +(feeTotal * 0.35).toFixed(2),
      bank: isExchange ? feeTotal : +(feeTotal * 0.65).toFixed(2),
      total: feeTotal,
      rate,
    },
    attachments,
    scoring,
    operation,
    rail: buildPaymentRail(row, h),
    comments,
    infoRequests,
  };
  PAYMENT_DETAIL_EXTRAS.set(row.id, extras);
  return extras;
}
