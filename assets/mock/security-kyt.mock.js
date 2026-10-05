/* ==========================================================================
   Моковые данные для KYT: "Настройки системы → KYT → Конфигурации транзакций" и
   "Безопасность → AML-проверки" (в сервисе kyt это transactions).
   Форма записей — сущности сервиса kyt (transaction_configs, transaction_step_configs,
   transactions, transaction_steps, transaction_step_attempts).
   Спецификация: docs/security-kyt-spec.md.
   Реальное: поля и связи, статусы (ERROR, PENDING, PROCESSING, AUTO_SUCCESS,
   AUTO_FAILED, MANUAL_SUCCESS, MANUAL_FAILED, APPROVED, REJECTED, NEED_ACTION), причины
   ручной проверки, риск-классы Coinkyt (RELIABLE, SUSPICIOUS, RISKY), провайдеры шага
   (coinkyt, sumsub, scoring), события уведомлений и их паттерны RMQ, два типа
   конфигураций (COINKYT_ADDRESS_CHECK, COINKYT_TRANSACTION_CHECK), состав данных проверки,
   примеры ID трекера и текст ошибки Coinkyt со скриншотов.
   Условное: ID, даты, адреса и хеши, баллы и категории, подмена провайдера,
   описания. Должен загружаться после clients-users.mock.js.
   ========================================================================== */

const KYT_STATUSES = ["PENDING", "PROCESSING", "NEED_ACTION", "APPROVED", "REJECTED", "ERROR"];
const KYT_ALL_STATUSES = ["ERROR", "PENDING", "PROCESSING", "AUTO_SUCCESS", "AUTO_FAILED", "MANUAL_SUCCESS", "MANUAL_FAILED", "APPROVED", "REJECTED", "NEED_ACTION"];
const KYT_STEP_PROVIDERS = ["coinkyt", "sumsub", "scoring"];
const KYT_EVENTS = [
  ["PREPARED", "response.transaction.prepared"], ["EXECUTE", "request.transaction.execute"], ["PROCESS", "request.transaction.process"],
  ["CONSIDERED", "response.transaction.considered"], ["ERROR", "response.transaction.error"], ["NEED_ACTION", "response.transaction.need-action"],
];
const KYT_RISK_CLASSES = ["RELIABLE", "SUSPICIOUS", "RISKY"];
const KYT_MANUAL_TRIGGERS = ["AML_SERVICE_UNAVAILABLE", "EXCEEDS_AUTO_LIMIT", "MANUAL_REVIEW_REQUESTED", "OPERATOR_DECISION"];

function ktStamp(entity, created, updated) {
  entity.createdDate = created;
  entity.createdAt = formatDateTime(created);
  entity.updatedDate = updated || created;
  entity.updatedAt = formatDateTime(entity.updatedDate);
  return entity;
}

// ---- Конфигурации транзакций ----------------------------------------------------------------------
const KYT_COINKYT_FORMAT = (checkType, extra) => ({
  whitelabelId: { path: "whitelabelId" }, currency: { path: "currency" }, checkType, blockchain: { path: "blockchain" }, token: { path: "token" }, directs: { path: "directs" }, ...extra,
});
const KYT_ADDRESS_SCHEMA = {
  type: "object",
  required: ["whitelabelId", "currency", "blockchain", "address"],
  properties: {
    whitelabelId: { type: "string" }, currency: { type: "string" }, blockchain: { type: "string", enum: ["btc", "eth", "trx"] }, address: { type: "string", minLength: 10 }, directs: { type: "boolean" },
  },
};
const KYT_TX_SCHEMA = {
  type: "object",
  required: ["whitelabelId", "currency", "blockchain", "transaction"],
  properties: {
    whitelabelId: { type: "string" }, currency: { type: "string" }, blockchain: { type: "string", enum: ["btc", "eth", "trx"] }, transaction: { type: "string", minLength: 10 },
  },
};
const KYT_NOTIFY = () => ({ rmq: { exchange: "kyt_x", events: [{ event: "CONSIDERED", pattern: "response.transaction.considered" }, { event: "ERROR", pattern: "response.transaction.error" }, { event: "NEED_ACTION", pattern: "response.transaction.need-action" }] } });

// [ключ, имя, тип, описание, версия, активна, создана, схема, описание шага, формат шага]
const KYT_CONFIG_SPECS = [
  ["addr1", "coinkyt-address-check", "COINKYT_ADDRESS_CHECK", "Coinkyt address AML check", 1, false, new Date(2026, 4, 8, 20, 22), KYT_ADDRESS_SCHEMA, "Check wallet address through Coinkyt provider", KYT_COINKYT_FORMAT("address", { address: { path: "address" } })],
  ["addr2", "coinkyt-address-check", "COINKYT_ADDRESS_CHECK", "Coinkyt address AML check", 2, true, new Date(2026, 8, 21, 17, 25), KYT_ADDRESS_SCHEMA, "Check wallet address through Coinkyt provider", KYT_COINKYT_FORMAT("address", { address: { path: "address" } })],
  ["tx1", "coinkyt-transaction-check", "COINKYT_TRANSACTION_CHECK", "Coinkyt transaction AML check", 1, true, new Date(2026, 4, 8, 20, 22), KYT_TX_SCHEMA, "Check blockchain transaction through Coinkyt provider", KYT_COINKYT_FORMAT("transaction", { transaction: { path: "transaction" } })],
];
const KYT_CONFIGS = KYT_CONFIG_SPECS.map(([key, name, type, description, version, isActive, created, schema, stepDesc, format], i) =>
  ktStamp(
    {
      id: seedToPaymentUuid(16000 + i), code: entityCode("KTC", 16000 + i), key, name, type, description, configVersion: version, isActive,
      schema: JSON.parse(JSON.stringify(schema)), notify: KYT_NOTIFY(),
      steps: [{ id: seedToPaymentUuid(16100 + i), order: 1, name: null, step: "coinkyt", description: stepDesc, format: JSON.parse(JSON.stringify(format)), providerData: { provider: "coinkyt", mode: "sync" } }],
    },
    created
  )
);

function ktConfigById(id) {
  return KYT_CONFIGS.find((c) => c.id === id) || null;
}

// ---- Проверки (транзакции) ------------------------------------------------------------------------------
const KYT_TRACKERS = ["addr-check-sync-001", "addr-risky-001", "addr-check-001", "tx-safe-001", "tx-manual-approve-001", "addr-check-002", "tx-risky-002"];
const KYT_CATEGORIES = [["exchange_licensed", 100], ["online_wallet", 100], ["payment_system", 100], ["gambling", 0], ["darknet_marketplace", 0], ["scam", 0], ["exchange_unlicensed", 25], ["other", 50]];
const KYT_ERRORS = ["Coinkyt returned HTTP 422: [object Object]", "Coinkyt returned HTTP 400: api_key is required", "Coinkyt returned HTTP 503: Service Unavailable"];
const KYT_CHAINS = [["BTC", "btc", "1A1z7agoat7TestAddress"], ["ETH", "eth", "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"], ["TRX", "trx", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"]];

function ktHex(seed, len) {
  let x = ((seed * 2654435761) % 2147483646) + 1;
  let out = "";
  for (let i = 0; i < len; i += 1) {
    x = (x * 48271) % 2147483647;
    out += "0123456789abcdef"[x % 16];
  }
  return out;
}

// распределение статусов (как в статистике на скриншоте: большинство "требует действия")
const KYT_STATUS_POOL = ["NEED_ACTION", "NEED_ACTION", "NEED_ACTION", "NEED_ACTION", "APPROVED", "APPROVED", "APPROVED", "REJECTED", "ERROR", "PROCESSING", "PENDING", "APPROVED"];

function ktBuildTransaction(seed, override) {
  const status = pick(KYT_STATUS_POOL, seed * 5);
  const config = pick([KYT_CONFIGS[1], KYT_CONFIGS[1], KYT_CONFIGS[2], KYT_CONFIGS[0]], seed);
  const isTx = config.type === "COINKYT_TRANSACTION_CHECK";
  const chain = pick(KYT_CHAINS, seed);
  const created = new Date(MOCK_NOW.getTime() - (seed * 47 + (seed % 5) * 13) * 60 * 60 * 1000);
  const updated = new Date(created.getTime() + (3 + (seed % 25)) * 60 * 1000);
  const finalStatuses = ["APPROVED", "REJECTED", "NEED_ACTION"];
  const score = ["ERROR", "PENDING", "PROCESSING"].includes(status) ? null : pick([42, 18, 17, 14, 43, 9, 27, 61], seed * 3);
  const riskClass = status === "APPROVED" ? (score > 25 ? "SUSPICIOUS" : "RELIABLE") : status === "REJECTED" ? "RISKY" : status === "NEED_ACTION" ? (score > 40 ? "RISKY" : "SUSPICIOUS") : null;
  const data = { whitelabelId: "default", currency: chain[0], blockchain: chain[1], ...(isTx ? { transaction: ktHex(seed, 64) } : { address: chain[2], directs: true }) };
  const stepStatus = { APPROVED: score !== null && score > 25 ? "MANUAL_SUCCESS" : "AUTO_SUCCESS", REJECTED: seed % 2 ? "MANUAL_FAILED" : "AUTO_FAILED", NEED_ACTION: "AUTO_FAILED", ERROR: "ERROR", PROCESSING: "PROCESSING", PENDING: "PENDING" }[status];
  const manualChecked = stepStatus === "MANUAL_SUCCESS" || stepStatus === "MANUAL_FAILED";
  const fallback = seed % 9 === 0 && !["PENDING", "PROCESSING"].includes(status);
  const errorMessage = status === "ERROR" ? pick(KYT_ERRORS, seed) : null;
  const violations = riskClass && riskClass !== "RELIABLE" ? [pick(KYT_CATEGORIES.filter((c) => c[1] < 50), seed)] : [];
  const step = {
    id: seedToPaymentUuid(17500 + seed), order: 1, providerName: fallback ? "scoring" : "coinkyt", stepConfigStep: "coinkyt", status: stepStatus, score, riskClass,
    errorMessage, providerTransactionId: status === "PENDING" ? null : `ck-${ktHex(seed + 7, 16)}`,
    manualCheckRequired: status === "NEED_ACTION", manualTrigger: status === "NEED_ACTION" ? "EXCEEDS_AUTO_LIMIT" : manualChecked ? "EXCEEDS_AUTO_LIMIT" : null,
    manualComment: manualChecked ? (stepStatus === "MANUAL_SUCCESS" ? "Approved by operator after review" : "Rejected by operator") : null,
    manualCheckedById: manualChecked ? "admin@asiafin.tech" : null, manualCheckedAt: manualChecked ? formatDateTime(updated) : null,
    fallbackApplied: fallback, fallbackReason: fallback ? "Coinkyt: HTTP 503 (условие: httpStatus ≥ 500)" : null,
    scoringInput: { ...data, checkType: isTx ? "transaction" : "address" },
    scoringOutput: score === null ? null : {
      riskScore: +(score / 100).toFixed(2), riskScorePercent: score, riskClass, generalThresholdExceeded: score > 25,
      categories: [{ name: "exchange_licensed", percent: 100 - score }, ...(violations.length ? [{ name: violations[0][0], percent: score }] : [{ name: "other", percent: score }])],
      categoryThresholdViolations: violations.map(([name, limit]) => ({ category: name, percent: score, threshold: limit })),
      reasons: score > 25 ? [`Общий балл ${score} выше порога 25`] : [],
    },
    attempts: [],
  };
  const dur = 180 + ((seed * 37) % 900);
  if (fallback) {
    step.attempts = [
      { id: seedToPaymentUuid(17600 + seed * 2), attemptNo: 1, providerName: "coinkyt", isFallback: false, status: "FAILED", errorCode: "KYT-018", errorMessage: pick(KYT_ERRORS, 2), durationMs: 1200 + dur, triggeredBy: null },
      { id: seedToPaymentUuid(17601 + seed * 2), attemptNo: 2, providerName: "scoring", isFallback: true, status: "SUCCESS", errorCode: null, errorMessage: null, durationMs: dur, triggeredBy: { source: "ERROR", path: "httpStatus", operator: "GTE", value: 500 } },
    ];
  } else if (!["PENDING"].includes(status)) {
    step.attempts = [{ id: seedToPaymentUuid(17600 + seed * 2), attemptNo: 1, providerName: "coinkyt", isFallback: false, status: status === "ERROR" ? "FAILED" : "SUCCESS", errorCode: status === "ERROR" ? "KYT-018" : null, errorMessage: errorMessage, durationMs: dur, triggeredBy: null }];
  }
  const u = seed % 7 === 0 ? CLIENTS_USERS_MOCK[seed % CLIENTS_USERS_MOCK.length] : null;
  const rec = {
    id: seedToPaymentUuid(17000 + seed), code: entityCode("KTX", 17000 + seed), configId: config.id, status, trackerId: seed % 4 === 0 ? seedToPaymentUuid(17200 + seed) : pick(KYT_TRACKERS, seed),
    data, errorMessage, totalScore: score, client: u ? { id: u.id, name: u.fullName, link: `#/clients-users/${u.id}` } : null, steps: [step],
    scoringResult: score === null ? { totalScore: 0 } : { totalScore: score, coinkyt: { stepStatus, totalScore: score, riskClass } },
  };
  return ktStamp(Object.assign(rec, override || {}), created, updated);
}

const KYT_TRANSACTIONS = Array.from({ length: 64 }).map((_, i) => ktBuildTransaction(i + 1));
KYT_TRANSACTIONS.sort((a, b) => b.createdDate - a.createdDate);

function ktTxById(id) {
  return KYT_TRANSACTIONS.find((t) => t.id === id) || null;
}
function ktTxOfConfig(configId) {
  return KYT_TRANSACTIONS.filter((t) => t.configId === configId);
}

// ---- Связь проверки с крипто-операцией и решение по деньгам ------------------------------------------------
// Найдено чтением bb2 (tools/federation/subgraphs/vabs.graphql, зеркало схемы соседнего сервиса vabs, и ACL
// apps/acl/.../kyt.features.ts): у флагнутой проверки по КРИПТО-ТРАНЗАКЦИИ (не по адресу — это отдельный тип
// проверки, тут решения по деньгам нет) бэкенд отдельно хранит ссылку на операцию (coreOperationId на записи
// депозита/вывода у провайдера) и отдельное решение по деньгам, помимо самого вердикта KYT:
//   - депозит: VabsCryptoProviderDepositDecision — CREDIT_ORIGINAL / CREDIT_ADDRESS (свой targetClientId/
//     targetAddress) / REFUND_SENDER / REFUND_ADDRESS (свой refundAddress), мутация vabsDecideCryptoProviderDeposit;
//   - вывод: VabsCryptoProviderWithdrawalDecision — только APPROVE / REJECT, мутация vabsDecideCryptoProviderWithdrawal
//     (адрес перенаправления для вывода бэкенд не поддерживает).
// В прототипе это решение хранится в fundDecision/fundDecisionAt/fundDecisionBy/fundTarget (адрес получателя,
// заполняется только у *_ADDRESS-решений) — отдельно от status/steps самой проверки.
// Не используем isCryptoPayment() здесь: она определена в assets/views/operations-payments.js, который в этот
// момент (загрузка моков) ещё не выполнялся — используем то же самое условие (paymentSystem === "CRYPTO_WALLET") напрямую.
const KYT_CRYPTO_DEPOSITS = OPERATIONS_PAYMENTS_MOCK.filter((r) => r.paymentSystem === "CRYPTO_WALLET" && r.cryptoOperationType === "CUSTOMER_DEPOSIT");
const KYT_CRYPTO_WITHDRAWALS = OPERATIONS_PAYMENTS_MOCK.filter((r) => r.paymentSystem === "CRYPTO_WALLET" && r.cryptoOperationType === "CUSTOMER_WITHDRAWAL");

KYT_TRANSACTIONS.forEach((tx, i) => {
  const cfg = ktConfigById(tx.configId);
  tx.operationId = null;
  tx.operationDirection = null;
  tx.fundDecision = null;
  tx.fundDecisionAt = null;
  tx.fundDecisionBy = null;
  tx.fundTarget = null;
  if (tx.status !== "NEED_ACTION" || !cfg || cfg.type !== "COINKYT_TRANSACTION_CHECK" || i % 2 !== 0) return;
  const isDeposit = i % 4 === 0;
  const pool = isDeposit ? KYT_CRYPTO_DEPOSITS : KYT_CRYPTO_WITHDRAWALS;
  if (!pool.length) return;
  const op = pool[i % pool.length];
  tx.operationId = op.id;
  tx.operationDirection = isDeposit ? "DEPOSIT" : "WITHDRAWAL";
});

function ktFundDecisionLabel(d) {
  return d ? kt(`checks.fundDecision.values.${d}`) : "—";
}

// Решение по деньгам применяется поверх проверки — сама она может остаться в статусе "Требует действия"
// (решение по вердикту KYT и решение по деньгам в реальной системе принимаются отдельно, см. комментарий выше).
function ktApplyFundDecision(tx, decision, target) {
  tx.fundDecision = decision;
  tx.fundDecisionAt = formatDateTime(pdNow());
  tx.fundDecisionBy = CURRENT_ADMIN.email;
  tx.fundTarget = target || null;
}

// ==== Исключения KYT (крипто): временное освобождение конкретного клиента + адреса + валюты + сети + направления
// от проверки на ОДИН предстоящий перевод — VabsCryptoProviderKytException (таблица cp_provider_kyt_exceptions,
// найдено в схеме vabs.graphql, зеркалируемой в bb2; право доступа — apps/acl/.../kyt.features.ts,
// KytFeatureCodeEnum.KYT_EXCEPTION, "физически живёт в схеме vabs, но по смыслу относится к разделу AML").
// Срок действия — от 1 часа до 1 года от создания, по умолчанию 72 часа (докстрока мутации
// vabsCreateCryptoProviderKytException). Статусы: ACTIVE, CONSUMED (сработало на переводе), REVOKED (отозвано
// вручную — только пока ACTIVE), EXPIRED (истекло без использования, срок вышел).
const KYT_EXCEPTION_STATUSES = ["ACTIVE", "CONSUMED", "REVOKED", "EXPIRED"];

function ktExceptionStatusBadge(s) {
  const cls = { ACTIVE: "badge-success", CONSUMED: "badge-info", REVOKED: "badge-neutral", EXPIRED: "badge-neutral" }[s] || "badge-neutral";
  return `<span class="badge ${cls}">${kt(`exceptions.enums.status.${s}`)}</span>`;
}

// [seed, statusIdx (ACTIVE/CONSUMED/REVOKED/EXPIRED), direction, индекс валюты/сети в KYT_CHAINS, часов с создания, срок действия в часах]
const KYT_EXCEPTION_SPECS = [
  [1, 0, "DEPOSIT", 0, 4, 72],
  [2, 0, "WITHDRAWAL", 1, 20, 72],
  [3, 0, "DEPOSIT", 2, 2, 720],
  [4, 1, "DEPOSIT", 2, 50, 72],
  [5, 2, "DEPOSIT", 0, 30, 168],
  [6, 3, "WITHDRAWAL", 1, 200, 72],
  [7, 1, "WITHDRAWAL", 0, 100, 24],
  [8, 3, "DEPOSIT", 1, 400, 72],
];

const KYT_EXCEPTIONS = KYT_EXCEPTION_SPECS.map(([seed, statusIdx, direction, chainIdx, ageHours, ttlHours]) => {
  const status = KYT_EXCEPTION_STATUSES[statusIdx];
  const chain = KYT_CHAINS[chainIdx];
  const client = CLIENTS_USERS_MOCK[(seed * 5) % CLIENTS_USERS_MOCK.length];
  const admin = typeof ACCESS_ADMINS !== "undefined" && ACCESS_ADMINS.length ? ACCESS_ADMINS[seed % ACCESS_ADMINS.length] : null;
  const adminEmail = admin ? admin.email : "admin@asiafin.tech";
  const created = new Date(MOCK_NOW.getTime() - ageHours * 60 * 60 * 1000);
  const expires = new Date(created.getTime() + ttlHours * 60 * 60 * 1000);
  const revoked = status === "REVOKED" ? new Date(created.getTime() + 60 * 60 * 1000) : null;
  const consumed = status === "CONSUMED" ? new Date(created.getTime() + 60 * 60 * 1000) : null;
  return ktStamp(
    {
      id: seedToPaymentUuid(18000 + seed), code: entityCode("KTE", 18000 + seed),
      client: { id: client.id, name: client.fullName || client.email, link: `#/clients-users/${client.id}` },
      address: chain[2], currency: chain[0], network: chain[1].toUpperCase(), direction, status,
      expiresDate: expires, expiresAt: formatDateTime(expires),
      createdBy: adminEmail,
      revokedDate: revoked, revokedAt: revoked ? formatDateTime(revoked) : null, revokedBy: revoked ? adminEmail : null,
      consumedDate: consumed, consumedAt: consumed ? formatDateTime(consumed) : null,
    },
    created
  );
});

function ktExceptionById(id) {
  return KYT_EXCEPTIONS.find((x) => x.id === id) || null;
}
