/* ==========================================================================
   "Клиенты → Партнёрские сервисы" и их клиенты (карточка клиента открывается только со вкладки «Клиенты» сервиса,
   отдельного раздела в навигации нет): данные.
   Источники:
   - Сущность внешнего сервиса open-banking (name, description, email, allowedIpAddresses, redirectUris, logoUrl, scopes,
     status ON_REVIEW / APPROVED / DECLINED / BLOCKED, хэш секрета клиента) и план разработчиков с встречи 25.09 (режим
     авторизации по сервису — полный OAuth 2.0 или лёгкий; 2FA по партнёру; запросы и вебхуки СБП; второй этап — оплата
     по QR и обмен с выводом крипты на адрес партнёра) — это более ранний и широкий план, часть сервисов (FULL_OAUTH)
     всё ещё живёт по нему.
   - Документ "Asia-Fintech Open Banking - партнёрская интеграция: клиенты, KYC и СБП" (версия 2026-09-28) — финальная
     спека именно ЛЁГКОГО режима: scopes tb:accounts:read/tb:payments:read/tb:payments:write (не ap:*, как в более
     раннем плане — префикс скопов ниже приведён к tb:, лишние ap:accounts:write/ap:tariffs:read/ap:personal-data:read
     оставлены как условные, из старого плана, этим документом не покрыты), только физлица (clientType: INDIVIDUAL —
     поэтому юрлица-клиенты ниже заведены только для сервисов НЕ в лёгком режиме), KYC клиента — уровень + статус
     (NOT_STARTED/IN_PROGRESS/REJECTED_RETRY/REJECTED_FINAL/APPROVED — этот статус-энум из документа, не путать с
     общим статус-энумом KYC/KYB клиентов платформы), пополнение и выплата по СБП.
   Условное (придумано для наглядности, подтверждённых примеров нет): сами сервисы, клиенты (кроме связи с реальными
   записями платформы, см. ниже), сессии, вебхуки, названия событий СБП/аккаунтов (документ описывает только KYC- и
   SBP-события — остальные группы из более раннего плана), депозиты и выплаты по СБП, уровень/статус KYC партнёрских клиентов.
   Реальное: коды событий KYC_LEVEL_APPROVED/DECLINED и SBP_DEPOSIT_SUCCEEDED/FAILED, поля тела депозита/выплаты и их
   ответов (cost/amount/fee/wlfee/totalFee, qrUrl, sessions, purposeOfPayment/sourceOfFunds) — из документа буквально.
   Партнёрский клиент лёгкого режима по документу — это ровно клиент банка (регистрируется и проходит KYC на фронте
   банка, вы не собираете его данные сами), поэтому ниже он не "придуманное имя", а ссылка на реальную запись из
   clients-users.mock.js (для FULL_OAUTH-сервисов — иногда на clients-companies.mock.js, это уже вне документа).
   Должен загружаться после clients-users.mock.js и clients-companies.mock.js.
   ========================================================================== */

function pnDate(daysAgo, hour, minute) {
  const d = new Date(MOCK_NOW.getFullYear(), MOCK_NOW.getMonth(), MOCK_NOW.getDate(), hour == null ? 12 : hour, minute || 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function pnUuid(n) {
  const h = (n * 2246822519 >>> 0).toString(16).padStart(8, "0");
  const g = ((n + 3) * 40503 >>> 0).toString(16).padStart(4, "0");
  return `${h}-${g}-4${g.slice(1)}-b${h.slice(1, 4)}-${h}${g}`;
}

// Scopes — префикс tb: из документа Open Banking (2026-09-28); первые три — ровно то, что нужно для сценария KYC+СБП
// из документа, остальные три (accounts:write/tariffs:read/personal-data:read) — из более раннего широкого плана,
// этим документом не описаны и не подтверждены под новым префиксом (условное продолжение).
const PN_SCOPES = [
  { scope: "tb:accounts:read", category: "INDIVIDUAL" },
  { scope: "tb:payments:read", category: "INDIVIDUAL" },
  { scope: "tb:payments:write", category: "INDIVIDUAL" },
  { scope: "tb:accounts:write", category: "INDIVIDUAL" },
  { scope: "tb:tariffs:read", category: "INDIVIDUAL" },
  { scope: "tb:personal-data:read", category: "INDIVIDUAL" },
];

// События вебхуков по группам и scope, который для них нужен (доставка — только при активной подписке И выданном scope).
// Группы kyc и sbpDeposits — из документа (раздел 6.2) буквально. Группы accounts/inner/swift/ruWire/sbpPayments —
// из более раннего широкого плана (полный OAuth, другие рельсы), документом не покрыты.
const PN_EVENT_GROUPS = [
  { id: "kyc", scope: "tb:accounts:read", events: ["KYC_LEVEL_APPROVED", "KYC_LEVEL_DECLINED"] },
  { id: "sbpDeposits", scope: "tb:payments:read", events: ["SBP_DEPOSIT_SUCCEEDED", "SBP_DEPOSIT_FAILED"] },
  { id: "sbpPayments", scope: "tb:payments:read", events: ["SBP_PAYMENT_CREATED", "SBP_PAYMENT_UPDATED", "SBP_PAYMENT_SUCCEEDED", "SBP_PAYMENT_DECLINED", "SBP_PAYMENT_REFUNDED"] },
  { id: "accounts", scope: "tb:accounts:read", events: ["ACCOUNTS_ORDERED", "ACCOUNTS_CREATED"] },
  { id: "inner", scope: "tb:payments:read", events: ["INNER_PAYMENT_CREATED", "INNER_PAYMENT_UPDATED", "INNER_PAYMENT_SUCCEEDED", "INNER_PAYMENT_DECLINED", "INNER_PAYMENT_REFUNDED"] },
  { id: "swift", scope: "tb:payments:read", events: ["SWIFT_PAYMENT_CREATED", "SWIFT_PAYMENT_UPDATED", "SWIFT_PAYMENT_SUCCEEDED", "SWIFT_PAYMENT_DECLINED", "SWIFT_PAYMENT_REFUNDED"] },
  { id: "ruWire", scope: "tb:payments:read", events: ["RU_WIRE_PAYMENT_CREATED", "RU_WIRE_PAYMENT_UPDATED", "RU_WIRE_PAYMENT_SUCCEEDED", "RU_WIRE_PAYMENT_DECLINED", "RU_WIRE_PAYMENT_REFUNDED"] },
];

// Платёжные каналы сервиса; qr и обмен — второй этап
const PN_CHANNELS = ["INNER", "SWIFT", "RU_WIRE", "SBP", "QR"];

function pnService(n, d) {
  const created = pnDate(d.createdAgo, 11, (n * 13) % 60);
  return Object.assign({ id: pnUuid(n), code: entityCode("PNS", n), logoUrl: `https://cdn.example.com/${d.slug}/logo.svg`, createdDate: created, createdAt: formatDateTime(created), updatedAt: formatDateTime(pnDate(Math.max(0, d.createdAgo - 5), 14, 5)) }, d);
}

const PN_SERVICES = [
  pnService(1, {
    slug: "walletverse", name: "Walletverse", description: "Криптокошелёк: покупка и продажа USDT за рубли, пополнение и вывод по СБП", email: "integration@walletverse.example",
    status: "APPROVED", authMode: "LIGHT", createdAgo: 40,
    allowedIps: ["203.0.113.14", "203.0.113.15"], redirectUris: ["https://app.walletverse.example/auth/callback", "https://staging.walletverse.example/auth/callback"],
    scopes: ["tb:accounts:read", "tb:payments:read", "tb:payments:write"], twofa: { enabled: false }, secretIssuedAt: formatDateTime(pnDate(40, 11, 0)),
    channels: { INNER: true, SWIFT: false, RU_WIRE: false, SBP: true, QR: false },
  }),
  pnService(2, {
    slug: "novapay", name: "NovaPay Demo", description: "Тестовый мерчант: принимает оплату переводами", email: "dev@novapay.example",
    status: "ON_REVIEW", authMode: "FULL_OAUTH", createdAgo: 3,
    allowedIps: ["198.51.100.7"], redirectUris: ["https://novapay.example/oauth/return"],
    scopes: ["tb:accounts:read", "tb:payments:read", "tb:payments:write"], twofa: { enabled: true }, secretIssuedAt: formatDateTime(pnDate(3, 11, 0)),
    channels: { INNER: true, SWIFT: true, RU_WIRE: true, SBP: false, QR: false },
    clientOwnership: "ANY",
  }),
  pnService(3, {
    slug: "cryptobridge", name: "CryptoBridge Test", description: "Заявка от обменника: интеграция не прошла проверку по договору", email: "ops@cryptobridge.example",
    status: "DECLINED", authMode: "FULL_OAUTH", createdAgo: 22,
    allowedIps: ["192.0.2.55"], redirectUris: ["https://cryptobridge.example/cb"],
    scopes: ["tb:accounts:read"], twofa: { enabled: true }, secretIssuedAt: formatDateTime(pnDate(22, 11, 0)),
    channels: { INNER: true, SWIFT: false, RU_WIRE: false, SBP: false, QR: false },
    clientOwnership: "ANY",
  }),
  pnService(4, {
    slug: "legacygw", name: "Legacy Gateway", description: "Прежний платёжный шлюз, заблокирован после смены договора", email: "admin@legacygw.example",
    status: "BLOCKED", authMode: "FULL_OAUTH", createdAgo: 160,
    allowedIps: ["198.51.100.99", "198.51.100.100"], redirectUris: ["https://legacygw.example/return"],
    scopes: ["tb:accounts:read", "tb:payments:read", "tb:payments:write"], twofa: { enabled: true }, secretIssuedAt: formatDateTime(pnDate(160, 11, 0)),
    channels: { INNER: true, SWIFT: true, RU_WIRE: true, SBP: false, QR: false },
    clientOwnership: "OWN",
  }),
];

// KYC партнёрского клиента (документ, раздел 3.4): уровень + статус его проверки — простое поле, не лестница
// пройденных уровней. Уровни — уровни KYC нашей платформы (Настройки → Верификации → KYC, 4 уровня); допущение
// прототипа: используем ту же шкалу для партнёрских клиентов, отдельной партнёрской шкалы в документе не описано,
// только то, что банк её "сообщает при подключении". СБП партнёру открывается с уровня, на котором привязывается
// телефон (см. settings-verifications.mock.js: Level 3 — PAYGINE_PHONE) — поэтому ниже депозиты/выплаты только у kycLevel >= 3.
const PN_KYC_SPECS = [
  { level: 1, status: "IN_PROGRESS" },
  { level: 2, status: "IN_PROGRESS" },
  { level: 3, status: "REJECTED_RETRY" },
  { level: 2, status: "REJECTED_FINAL" },
  { level: 4, status: "APPROVED" },
  { level: null, status: "NOT_STARTED" },
  { level: 3, status: "APPROVED" },
  { level: 4, status: "IN_PROGRESS" },
];

function pnBuildClients(service, count, offset) {
  const isLight = service.authMode === "LIGHT"; // документ: юрлица в лёгком режиме не поддерживаются
  return Array.from({ length: count }, (_, i) => {
    const n = offset + i;
    const corporate = !isLight && i % 3 === 2;
    let internalKind, internalId, name, email;
    if (corporate) {
      const co = CLIENTS_COMPANIES_MOCK[n % CLIENTS_COMPANIES_MOCK.length];
      internalKind = "company";
      internalId = co.id;
      name = co.name;
      email = co.businessEmail || "";
    } else {
      const u = CLIENTS_USERS_MOCK[n % CLIENTS_USERS_MOCK.length];
      internalKind = "user";
      internalId = u.id;
      name = u.fullName || u.email;
      email = u.email;
    }
    const reg = pnDate(30 - i * 2 > 0 ? 30 - i * 2 : 1, 10 + (i % 8), (i * 11) % 60);
    const kyc = PN_KYC_SPECS[i % PN_KYC_SPECS.length];
    return {
      id: pnUuid(500 + n), serviceId: service.id, name, email,
      // Связка с реальной записью платформы (документ, раздел 0/3: партнёрский клиент лёгкого режима — это клиент
      // банка, прошедший регистрацию и KYC на фронте банка) — не совпадение по email, а прямая ссылка.
      internalKind, internalId,
      kycLevel: kyc.level, kycStatus: kyc.status,
      status: i % 9 === 8 ? "BLOCKED" : "ACTIVE",
      registeredAt: formatDateTime(reg), registeredDate: reg, lastLoginAt: formatDateTime(pnDate(i % 6, 9 + (i % 9), 20)),
      companyRole: corporate ? (i % 2 === 0 ? "REGISTRANT" : "EMPLOYEE") : null,
    };
  });
}

const PN_CLIENTS = [...pnBuildClients(PN_SERVICES[0], 12, 0), ...pnBuildClients(PN_SERVICES[1], 2, 3), ...pnBuildClients(PN_SERVICES[3], 3, 7)];

// Гарантируем реальные платежи по рельсу СБП у клиентов сервисов с включённым каналом СБП: вкладка "Операции" на
// карточке сервиса (settings-partners.js, pnServiceSbpPayments) переиспользует общий список платежей
// (OPERATIONS_PAYMENTS_MOCK, operations-payments.mock.js — грузится раньше этого файла), отфильтрованный по
// paymentSystem: "SBP" и internalId клиентов сервиса. Но это два независимых генератора — совпадение клиента по
// чистой случайности не гарантировано (и по факту не случилось ни у одного сервиса), поэтому здесь добавляем
// несколько настоящих строк в общий список (не отдельную сущность) — по пополнению и выплате на паре физлиц
// каждого СБП-сервиса. Форма строки — как у остальных строк OPERATIONS_PAYMENTS_MOCK (SBP: только одна сторона
// наш клиент, см. комментарий в шапке operations-payments.mock.js).
(function ensurePnSbpPayments() {
  let seed = 9000;
  PN_SERVICES.filter((s) => s.channels && s.channels.SBP).forEach((service) => {
    pnClientsOf(service.id).filter((c) => c.internalKind === "user").slice(0, 3).forEach((c) => {
      const user = CLIENTS_USERS_MOCK.find((u) => u.id === c.internalId);
      if (!user) return;
      [true, false].forEach((isIncoming) => {
        seed += 1;
        const created = pnDate(seed % 20, 9 + (seed % 10), (seed * 7) % 60);
        const updated = new Date(created.getTime() + 5 * 60 * 1000);
        const status = pick(PAYMENT_STATUS_OPTIONS, seed);
        const settled = status === "SUCCESSFUL" ? new Date(updated.getTime() + 2 * 60 * 1000) : null;
        const sourceAmount = 500 + ((seed * 137) % 9000);
        const feeAmount = +(sourceAmount * 0.012).toFixed(2);
        const userRef = { id: user.id, type: "INDIVIDUAL", name: user.fullName || user.email, link: `#/clients-users/${user.id}` };
        const emptyRef = { id: null, type: null, name: null, link: null };
        const senderRef = isIncoming ? emptyRef : userRef;
        const recipientRef = isIncoming ? userRef : emptyRef;
        OPERATIONS_PAYMENTS_MOCK.push({
          id: seedToPaymentUuid(seed), code: entityCode("PAY", seed),
          createdDate: created, updatedDate: updated, createdAt: formatDateTime(created), updatedAt: formatDateTime(updated),
          settledDate: settled, settledAt: settled ? formatDateTime(settled) : null,
          direction: isIncoming ? "INCOMING" : "OUTGOING",
          paymentSystem: "SBP", cryptoOperationType: null, cryptoWallet: null,
          status, previousStatus: null, isFavorite: false, sourceOfFunds: null,
          senderClientId: senderRef.id, senderClientType: senderRef.type, senderClientName: senderRef.name, senderClientLink: senderRef.link,
          recipientClientId: recipientRef.id, recipientClientType: recipientRef.type, recipientClientName: recipientRef.name, recipientClientLink: recipientRef.link,
          sourceAmount, sourceCurrency: "RUB", targetAmount: sourceAmount, targetCurrency: "RUB", exchangeRate: 1,
          feeAmount, feeCurrency: "RUB", totalAmount: +(sourceAmount + feeAmount).toFixed(2), totalCurrency: "RUB",
          purposeOfPayment: "Перевод по СБП", note: null,
        });
      });
    });
  });
})();

// Сессии: kind — CODE (код авторизации, живёт 60 с: ACTIVE / USED / EXPIRED) или TOKEN (access token: ACTIVE / INACTIVE)
const PN_SESSIONS = [];
(function buildSessions() {
  let n = 0;
  PN_CLIENTS.forEach((c, i) => {
    const created = pnDate(i % 9, 9 + (i % 10), (i * 7) % 60);
    const svc = PN_SERVICES.find((s) => s.id === c.serviceId);
    { const sid = 900 + n++; PN_SESSIONS.push({ id: pnUuid(sid), code: entityCode("PNT", sid), serviceId: c.serviceId, kind: "TOKEN", clientId: c.id, status: i % 4 === 3 ? "INACTIVE" : "ACTIVE", scopes: svc.scopes, createdAt: formatDateTime(created), createdDate: created, expiresAt: formatDateTime(new Date(created.getTime() + 365 * 24 * 3600 * 1000)) }); }
    if (i % 3 === 0) {
      const exp = new Date(created.getTime() + 60 * 1000);
      const sid = 900 + n++;
      PN_SESSIONS.push({ id: pnUuid(sid), code: entityCode("PNT", sid), serviceId: c.serviceId, kind: "CODE", clientId: c.id, status: i % 6 === 0 ? "USED" : "EXPIRED", scopes: svc.scopes, createdAt: formatDateTime(created), createdDate: created, expiresAt: formatDateTime(exp) });
    }
  });
})();

// ---- Депозиты и выплаты по СБП (документ, разделы 4 и 5) — только у клиентов с kycLevel >= 3 (привязан номер
// СБП, см. комментарий у PN_KYC_SPECS) сервисов с каналом SBP включён (сейчас — только Walletverse).
const PN_SBP_DEPOSIT_STATUSES = ["PENDING", "SUCCEEDED", "FAILED"];
const PN_SBP_PAYMENT_STATUSES = ["DRAFT", "PROCESSING", "SUCCESSFUL", "DECLINED", "REFUNDED"];
const PN_SOURCE_OF_FUNDS = ["SALARY", "SAVING", "COMMISSION_OF_SALES", "INVESTMENT_CAPITAL"];

const PN_SBP_DEPOSITS = [];
const PN_SBP_PAYMENTS = [];
(function buildSbpOps() {
  let dep = 0, pay = 0;
  PN_CLIENTS.forEach((c, i) => {
    const svc = PN_SERVICES.find((s) => s.id === c.serviceId);
    if (!svc.channels.SBP || (c.kycLevel || 0) < 3) return;
    // 1-2 депозита на клиента
    const depCount = 1 + (i % 2);
    for (let k = 0; k < depCount; k += 1) {
      dep += 1;
      const cost = 500 + ((i * 137 + k * 311) % 9500);
      const wlfee = +(cost * 0.005).toFixed(2);
      const fee = +(cost * 0.01).toFixed(2);
      const totalFee = +(wlfee + fee).toFixed(2);
      const amount = +(cost - totalFee).toFixed(2);
      const status = PN_SBP_DEPOSIT_STATUSES[(i + k) % PN_SBP_DEPOSIT_STATUSES.length];
      const created = pnDate((i + k) % 20, 9 + (k % 10), (i * 5) % 60);
      PN_SBP_DEPOSITS.push({
        id: pnUuid(2000 + dep), code: entityCode("DEP", 2000 + dep), serviceId: svc.id, clientId: c.id,
        cost, amount, fee, wlfee, totalFee, status,
        qrUrl: `https://qr.nspk.ru/${pnUuid(2000 + dep).slice(0, 8)}`,
        isTransferProcessed: status !== "PENDING",
        createdDate: created, createdAt: formatDateTime(created),
      });
    }
    // выплата — не у всех, только у части клиентов
    if (i % 2 === 0) {
      pay += 1;
      const sourceAmount = 300 + ((i * 211) % 8000);
      const totalFee = +(sourceAmount * 0.01).toFixed(2);
      const status = PN_SBP_PAYMENT_STATUSES[(i + pay) % PN_SBP_PAYMENT_STATUSES.length];
      const created = pnDate(i % 15, 10 + (i % 8), (i * 9) % 60);
      PN_SBP_PAYMENTS.push({
        id: pnUuid(2500 + pay), code: entityCode("PYT", 2500 + pay), serviceId: svc.id, clientId: c.id,
        sourceAmount, totalFee, totalAmount: +(sourceAmount + totalFee).toFixed(2),
        bankName: ["Пример Банк", "Тестбанк", "Демо Финанс"][i % 3], bankBic: "044525" + String(100 + (i % 900)),
        purposeOfPayment: "Вывод средств", sourceOfFunds: PN_SOURCE_OF_FUNDS[i % PN_SOURCE_OF_FUNDS.length],
        orderId: `${svc.slug.toUpperCase()}-${1000 + i}`, status,
        createdDate: created, createdAt: formatDateTime(created),
      });
    }
  });
})();

// disabledReason: RETRY_TIMEOUT — подписка отключена после исчерпания 20 повторов доставки; включается обратно вручную
const PN_WEBHOOKS = [
  { id: pnUuid(701), serviceId: PN_SERVICES[0].id, url: "https://api.walletverse.example/hooks/payments", description: "KYC и статусы СБП", isActive: true, disabledReason: null, events: ["KYC_LEVEL_APPROVED", "KYC_LEVEL_DECLINED", "SBP_DEPOSIT_SUCCEEDED", "SBP_DEPOSIT_FAILED", "SBP_PAYMENT_SUCCEEDED", "SBP_PAYMENT_DECLINED"], createdAt: formatDateTime(pnDate(38, 12, 0)) },
  { id: pnUuid(702), serviceId: PN_SERVICES[0].id, url: "https://api.walletverse.example/hooks/accounts", description: "Открытие счетов", isActive: false, disabledReason: "RETRY_TIMEOUT", events: ["ACCOUNTS_CREATED"], createdAt: formatDateTime(pnDate(38, 12, 10)) },
  { id: pnUuid(703), serviceId: PN_SERVICES[1].id, url: "https://novapay.example/hooks/all", description: "", isActive: false, disabledReason: null, events: ["INNER_PAYMENT_UPDATED", "RU_WIRE_PAYMENT_SUCCEEDED"], createdAt: formatDateTime(pnDate(2, 15, 0)) },
];

function pnById(id) {
  return PN_SERVICES.find((s) => s.id === id);
}
function pnClientsOf(serviceId) {
  return PN_CLIENTS.filter((c) => c.serviceId === serviceId);
}
function pnSessionsOf(serviceId) {
  return PN_SESSIONS.filter((s) => s.serviceId === serviceId);
}
function pnWebhooksOf(serviceId) {
  return PN_WEBHOOKS.filter((w) => w.serviceId === serviceId);
}
function pnClientById(id) {
  return PN_CLIENTS.find((c) => c.id === id);
}
function pnDepositsOfService(serviceId) {
  return PN_SBP_DEPOSITS.filter((d) => d.serviceId === serviceId);
}
function pnPaymentsOfService(serviceId) {
  return PN_SBP_PAYMENTS.filter((p) => p.serviceId === serviceId);
}
// Ссылка на реальную запись платформы, к которой привязан партнёрский клиент (документ: лёгкий режим — это клиент банка)
function pnInternalLink(c) {
  return c.internalKind === "company" ? `#/clients-companies/${c.internalId}` : `#/clients-users/${c.internalId}`;
}
// Код реальной записи платформы (клиент/компания), к которой привязан партнёрский клиент — для отображения вместо сырого UUID
function pnInternalCode(c) {
  const rec = c.internalKind === "company" ? CLIENTS_COMPANIES_MOCK.find((x) => x.id === c.internalId) : CLIENTS_USERS_MOCK.find((x) => x.id === c.internalId);
  return rec ? rec.code : c.internalId;
}
// Обратный поиск: привязан ли этот пользователь/компания платформы к партнёрскому сервису через open banking
// (ExternalServiceClientEntity: userId ↔ externalServiceId, см. apps/open-banking) — используется в таблице
// «Физлица», строка под ID: если есть связка, вместо белого лейбла (user.service — ASIA_FINTECH/BITBANKER/...,
// ортогональное понятие) показываем реального партнёра. Связь по internalId, не по совпадению email.
function pnClientByInternal(kind, id) {
  return PN_CLIENTS.find((c) => c.internalKind === kind && c.internalId === id);
}
