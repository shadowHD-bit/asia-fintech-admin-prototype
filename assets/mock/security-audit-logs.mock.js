/* ==========================================================================
   Моковые данные для "Безопасность → Аудит-логи".
   Форма записи — тип AuditLog сервиса audit-log (monorepo-backend…/apps/audit-log),
   спецификация: docs/security-audit-logs-spec.md.
   Реальное: структура записи и её обязательные поля, значения статуса
   (SUCCESS/FAILURE), типов акторов (USER/ADMIN/SYSTEM), источников, действий
   (CREATE/UPDATE/DELETE/LOGIN/LOGOUT/STATUS_CHANGE/UNKNOWN), важности, категории и
   сущности из конфигов справочника, шаблоны auth:* и query:signIn.
   Условное: шаблоны mutation:* админских действий, сущность Payment, сами
   события, IP и устройства. changes: в реальности сейчас почти всегда пустое
   (никто не пишет diff) — заполнено у части записей (blockUser/updateRoles —
   для проверки вёрстки; vabsUpdatePaymentsStatus — реальный diff из
   status/previousStatus самого платежа, см. "История изменений" на карточке
   платежа).
   Акторы и затронутые сущности взяты из других моков, чтобы ссылки вели на
   существующие карточки.
   ========================================================================== */

// [pattern, category, entity, action, severity, actorType, affectedType]
const AUDIT_TEMPLATES = [
  ["auth:user_login", "AUTH", "Session", "LOGIN", "INFO", "USER", "Session"],
  ["auth:user_login_attempt", "AUTH", "Session", "LOGIN", "WARNING", "USER", "Session"],
  ["auth:user_logout", "AUTH", "Session", "LOGOUT", "INFO", "USER", "Session"],
  ["auth:credentials_updated", "AUTH", "Credentials", "UPDATE", "INFO", "USER", "UserAccount"],
  ["auth:two_factor_enabled", "AUTH", "TwoFactor", "CREATE", "INFO", "USER", "UserAccount"],
  ["auth:two_factor_disabled", "AUTH", "TwoFactor", "DELETE", "WARNING", "USER", "UserAccount"],
  ["auth:api_key_created", "AUTH", "ApiKey", "CREATE", "INFO", "USER", "UserAccount"],
  ["auth:notification_channel_disabled", "NOTIFICATIONS", "NotificationChannel", "UPDATE", "INFO", "USER", "UserAccount"],
  ["query:signIn", "AUTH", "AdminSession", "LOGIN", "INFO", "ADMIN", "Admin"],
  ["mutation:sendInvitationToAdmin", "USER_MGMT", "UserAccount", "CREATE", "WARNING", "ADMIN", "Admin"],
  ["mutation:updateRoles", "AUTH", "Role", "UPDATE", "WARNING", "ADMIN", "Role"],
  ["mutation:blockUser", "USER_MGMT", "UserAccount", "STATUS_CHANGE", "CRITICAL", "ADMIN", "UserAccount"],
  ["mutation:deleteAdmin", "USER_MGMT", "UserAccount", "DELETE", "CRITICAL", "ADMIN", "Admin"],
  ["mutation:approveKycStep", "COMPLIANCE", "KYCLevel", "STATUS_CHANGE", "INFO", "ADMIN", "UserAccount"],
  ["mutation:vabsUpdatePaymentsStatus", "FINANCE", "Payment", "STATUS_CHANGE", "WARNING", "ADMIN", "Payment"],
  ["query:vabsClients", "DEFAULT", "DEFAULT", "UNKNOWN", "INFO", "ADMIN", "UserAccount"],
  ["system:retention_cleanup", "SYSTEM", "DEFAULT", "DELETE", "INFO", "SYSTEM", null],
];

// Цель из каталога (AuditTarget): type — GRAPHQL или EVENT (реальные значения),
// description — статическое описание цели, а не записи (в записи своего
// описания нет). Тексты описаний — условные.
const AUDIT_TARGET_DESCRIPTIONS = {
  "auth:user_login": "Вход клиента в систему.",
  "auth:user_login_attempt": "Попытка входа клиента.",
  "auth:user_logout": "Выход клиента из системы.",
  "auth:credentials_updated": "Клиент изменил учётные данные.",
  "auth:two_factor_enabled": "Клиент включил двухфакторную защиту.",
  "auth:two_factor_disabled": "Клиент отключил двухфакторную защиту.",
  "auth:api_key_created": "Клиент создал API-ключ.",
  "auth:notification_channel_disabled": "Клиент отключил канал уведомлений.",
  "query:signIn": "Вход администратора в панель.",
  "mutation:sendInvitationToAdmin": "Отправлено приглашение администратору.",
  "mutation:updateRoles": "Изменены роли и права.",
  "mutation:blockUser": "Блокировка пользователя.",
  "mutation:deleteAdmin": "Удаление администратора.",
  "mutation:approveKycStep": "Подтверждён шаг KYC.",
  "mutation:vabsUpdatePaymentsStatus": "Изменён статус платежа.",
  "query:vabsClients": null,
  "system:retention_cleanup": "Автоочистка записей по сроку хранения.",
};

const AUDIT_FAILURE_REASONS =["Invalid credentials", "2FA code is invalid", "Account is blocked", "Too many attempts"];
const AUDIT_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36",
];
const AUDIT_PLACES = [
  ["Кыргызстан", "Бишкек"], ["Казахстан", "Алматы"], ["Россия", "Москва"], ["Узбекистан", "Ташкент"], ["Кипр", "Лимасол"], ["Германия", "Франкфурт"],
];
const AUDIT_RISK_LEVELS = ["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"];
const AUDIT_RISK_FLAGS = ["NEW_DEVICE", "GEO_MISMATCH", "TOR_EXIT_NODE", "MULTIPLE_FAILURES", "OFF_HOURS"];

const AUDIT_LOGS_MOCK = Array.from({ length: 64 }).map((_, i) => {
  const seed = i + 1;
  const tpl = pick(AUDIT_TEMPLATES, seed * 7);
  const [pattern, category, entity, action, severity, actorType, affectedType] = tpl;

  const createdDate = new Date(MOCK_NOW.getTime() - seed * 131 * 60 * 1000 - (seed % 7) * 17 * 1000);
  const updatedDate = new Date(createdDate.getTime() + 1000);

  // ---- Актор
  const activeAdmins = ACCESS_ADMINS.filter((a) => a.status === "ACTIVE");
  let actor;
  if (actorType === "ADMIN") {
    const a = pick(activeAdmins, seed);
    const roleNames = a.roleIds.map((id) => (ACCESS_ROLES.find((r) => r.id === id) || {}).name).filter(Boolean);
    actor = { id: a.id, type: "ADMIN", snapshot: { name: a.name, email: a.email, role: roleNames[0] || null } };
  } else if (actorType === "SYSTEM") {
    actor = { id: "system", type: "SYSTEM", snapshot: { name: "audit-log", email: null, role: null } };
  } else {
    const u = pick(CLIENTS_USERS_MOCK, seed * 3);
    actor = { id: u.id, type: "USER", snapshot: { name: u.fullName, email: u.email, role: null } };
  }

  // ---- Результат
  const isAttempt = pattern === "auth:user_login_attempt";
  const failure = isAttempt ? seed % 10 < 7 : seed % 13 === 0;
  const failureReason = failure ? pick(AUDIT_FAILURE_REASONS, seed) : null;

  // ---- Источник и контекст
  const ua = actorType === "SYSTEM" ? null : pick(AUDIT_USER_AGENTS, seed + (actorType === "ADMIN" ? 0 : 1));
  const source = actorType === "ADMIN" || actorType === "SYSTEM" ? "BACKOFFICE" : /iPhone|Android/.test(ua) ? "MOBILE APP" : seed % 11 === 0 ? "TG_BOT" : "WEB APP";
  const [country, city] = pick(AUDIT_PLACES, seed);
  const context =
    actorType === "SYSTEM"
      ? { ipAddress: null, userAgent: null, origin: null, geo: null, requestId: null, sessionId: null, deviceId: null }
      : {
          ipAddress: `${100 + (seed * 7) % 120}.${(seed * 13) % 250}.${(seed * 29) % 250}.${1 + (seed * 3) % 250}`,
          userAgent: ua,
          origin: actorType === "ADMIN" ? "https://admin.asiafin.tech" : "https://app.asiafin.tech",
          geo: { country, city },
          requestId: seedToPaymentUuid(seed + 1200),
          sessionId: seedToPaymentUuid(seed + 1300),
          deviceId: seed % 4 === 0 ? null : seedToPaymentUuid(seed + 1400),
        };

  // ---- Затронуто
  let affected = null;
  const related = [];
  let paymentStatusChange = null;
  if (affectedType === "Payment") {
    const p = pick(OPERATIONS_PAYMENTS_MOCK, seed);
    affected = { id: p.id, type: "Payment", ownerId: p.senderClientId || null };
    related.push({ type: "Payment", id: p.id, name: p.purposeOfPayment });
    // mutation:vabsUpdatePaymentsStatus реально меняет статус платежа — у
    // платежа уже есть status/previousStatus (см. operations-payments.mock.js),
    // используем их как diff этой записи (previousStatus почти всегда null,
    // тогда честно берём условный "PROCESSING" как предыдущий шаг).
    if (pattern === "mutation:vabsUpdatePaymentsStatus") {
      paymentStatusChange = { changedFields: ["status"], oldValue: { status: p.previousStatus || "PROCESSING" }, newValue: { status: p.status } };
    }
  } else if (affectedType === "Role") {
    const r = pick(ACCESS_ROLES.filter((x) => x.type === "ADMIN"), seed);
    affected = { id: r.id, type: "Role", ownerId: null };
    related.push({ type: "Role", id: r.id, name: r.name });
  } else if (affectedType === "Admin") {
    const a = pick(ACCESS_ADMINS, seed + 2);
    affected = { id: a.id, type: "Admin", ownerId: null };
    related.push({ type: "Admin", id: a.id, name: a.name });
  } else if (affectedType === "UserAccount") {
    const target = actorType === "USER" ? actor.id : pick(CLIENTS_USERS_MOCK, seed * 5).id;
    affected = { id: target, type: "UserAccount", ownerId: target };
  } else if (affectedType === "Session") {
    affected = { id: seedToPaymentUuid(seed + 1300), type: "Session", ownerId: actor.id };
  }

  // ---- Риск
  const hasRisk = isAttempt ? seed % 3 !== 0 : seed % 9 === 0;
  const riskAssessment = hasRisk
    ? {
        level: pick(AUDIT_RISK_LEVELS, seed),
        source: "scoring",
        flags: [pick(AUDIT_RISK_FLAGS, seed), pick(AUDIT_RISK_FLAGS, seed + 2)].filter((f, idx, arr) => arr.indexOf(f) === idx),
        score: 15 + ((seed * 11) % 80),
      }
    : null;

  // ---- Изменения: в реальности пусто, две записи заполнены для проверки вёрстки
  let changes = { changedFields: [], oldValue: null, newValue: null };
  if (pattern === "mutation:blockUser" && seed % 2 === 1) changes = { changedFields: ["status"], oldValue: { status: "ACTIVE" }, newValue: { status: "BLOCKED" } };
  if (pattern === "mutation:updateRoles" && seed % 2 === 1) changes = { changedFields: ["grants"], oldValue: { grants: [{ featureCode: "vabs_payment", level: "READ" }] }, newValue: { grants: [{ featureCode: "vabs_payment", level: "WRITE" }] } };
  if (paymentStatusChange) changes = paymentStatusChange;

  // у части старых записей нет связи со справочником — event пустой
  const noEvent = seed % 19 === 0;

  return {
    id: seedToPaymentUuid(seed + 900),
    code: entityCode("LOG", seed + 900),
    createdDate,
    createdAt: formatDateTime(createdDate),
    updatedDate,
    updatedAt: formatDateTime(updatedDate),
    correlationId: seedToPaymentUuid(Math.floor(seed / 2) + 800),
    source,
    auditTargetId: noEvent ? null : seedToPaymentUuid(seed % 20 + 500),
    actor,
    event: noEvent ? null : { pattern, category, entity, action, severity },
    target: noEvent ? null : { id: seedToPaymentUuid(seed % 20 + 500), type: /^(auth|system):/.test(pattern) ? "EVENT" : "GRAPHQL", description: AUDIT_TARGET_DESCRIPTIONS[pattern] || null },
    affectedEntity: affected,
    context,
    result: { status: failure ? "FAILURE" : "SUCCESS", failureReason, changes },
    metadata: related.length || riskAssessment ? { relatedEntities: related, riskAssessment } : null,
  };
});

