/* ==========================================================================
   Моковые данные для "Настройки → Роли и права" (роли, администраторы).
   Модель — ACL из bb2 (apps/acl/src/access-model, данные — mock/access-model.mock.js): роль выдаёт гранты
   "фича × уровень доступа" (READ < WRITE < DELETE, каждый следующий включает предыдущие). Правил и разрешений как отдельных
   сущностей в интерфейсе нет: их порождает генератор из деклараций. Страницы бэк-офиса видны, когда роль закрывает
   все фичи страницы на уровне READ.

   Из bb2 взято устройство: роль → гранты "раздел × уровень", SUPER получает всё, ADMIN — всё, кроме управления доступом, SERVICE описан
   контрактом сервисов, клиентские роли назначаются автоматически. Каталог разделов и шаблоны ролей — свои, под разделы прототипа.
   Условное (для наглядности): роли-шаблоны, LEGACY_AUDITOR, ARCHIVED_TEST, список администраторов и даты.
   ========================================================================== */

const ACM_LEVELS = ["READ", "WRITE", "DELETE"];

// Разделы управления самим доступом: роль ADMIN их не получает (как в bb2 — исключение управления ACL), SUPER получает всё
const ACM_ACL_MANAGEMENT_CODES = ["access_roles", "access_admins"];

function acmFeature(code) {
  return ACM_FEATURES.find((f) => f.code === code) || null;
}

// Высший объявленный у фичи уровень (у некоторых фич нет READ или DELETE)
function acmTopLevel(feature) {
  return [...ACM_LEVELS].reverse().find((l) => feature.levels[l]) || null;
}

// Гранты роли — { код фичи: уровень }; уровень включающий (WRITE ⊃ READ, DELETE ⊃ WRITE)
function acmLevelRank(level) {
  return level ? ACM_LEVELS.indexOf(level) + 1 : 0;
}

function acmGrantsAll(excludeCodes) {
  const grants = {};
  ACM_FEATURES.forEach((f) => {
    if (!excludeCodes.includes(f.code)) grants[f.code] = acmTopLevel(f);
  });
  return grants;
}

function acmGrantsFromList(list) {
  const grants = {};
  list.forEach(({ feature, level }) => {
    const f = acmFeature(feature);
    if (!f) return;
    if (acmLevelRank(level) > acmLevelRank(grants[feature])) grants[feature] = level;
  });
  return grants;
}

function accessRoleDate(daysAgo) {
  return new Date(MOCK_NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
}

function accessMakeRole(id, name, description, type, status, isSystem, grants, daysAgo, extra = {}) {
  const created = accessRoleDate(daysAgo);
  const updated = new Date(created.getTime() + 3 * 24 * 60 * 60 * 1000);
  return {
    id, name, description, type, status, isSystem,
    applicableTypes: [type],
    grants, // { featureCode: level } — только для админских ролей; у клиентских null
    templateCode: null,
    createdDate: created, createdAt: formatDateTime(created),
    updatedDate: updated, updatedAt: formatDateTime(updated),
    ...extra,
  };
}

const acmPresetRoles = ACM_PRESETS.map((p, i) =>
  accessMakeRole(`role-${p.name.toLowerCase().replace(/_/g, "-")}`, p.name, `${p.title}: ${p.desc}`, "ADMIN", "ACTIVE", false, acmGrantsFromList(p.grants), 240 - i * 25, { templateCode: p.name })
);

const ACCESS_ROLES = [
  accessMakeRole("role-super", "SUPER", "Полный доступ ко всем разделам админки", "ADMIN", "ACTIVE", true, acmGrantsAll([]), 400),
  accessMakeRole("role-admin", "ADMIN", "Все разделы, кроме управления ролями и администраторами", "ADMIN", "ACTIVE", true, acmGrantsAll(ACM_ACL_MANAGEMENT_CODES), 400),
  accessMakeRole("role-service", "SERVICE", "Сервисный доступ: операции контракта сервисов, а не разделы админки", "ADMIN", "ACTIVE", true, {}, 400, { contractOnly: true }),
  ...acmPresetRoles,
  accessMakeRole("role-legacy-auditor", "LEGACY_AUDITOR", "Прежняя роль аудитора (заменена COMPLIANCE_OFFICER)", "ADMIN", "DEPRECATED", false,
    acmGrantsFromList(ACM_FEATURES.filter((f) => /audit/.test(f.code) && f.levels.READ).map((f) => ({ feature: f.code, level: "READ" }))), 200),
  accessMakeRole("role-archived-test", "ARCHIVED_TEST", "Тестовая роль, не используется", "ADMIN", "ARCHIVED", false, {}, 150),
  accessMakeRole("role-default", "DEFAULT", "Базовый публичный клиентский доступ", "CLIENT", "ACTIVE", true, null, 400),
  accessMakeRole("role-registered-user", "REGISTERED_USER", "Зарегистрированный пользователь: профиль и базовые операции без платежей", "CLIENT", "ACTIVE", false, null, 400),
  accessMakeRole("role-registered-companies", "REGISTERED_COMPANIES", "Роль зарегистрированной компании: управление компанией и дочерними компаниями", "CLIENT", "ACTIVE", false, null, 400),
  accessMakeRole("role-blocked", "BLOCKED", "Роль-маркер блокировки клиента (deny-гейт)", "CLIENT", "ACTIVE", true, null, 400),
];

// ---- Администраторы --------------------------------------------------------------------
// [имя, статус, роли, дней назад создан, причина приостановки]
const ACCESS_ADMIN_SEEDS = [
  ["Админ Тестовый", "ACTIVE", ["role-super"], 380, null, "admin@asiafin.tech"],
  ["Айгерим Бекешова", "ACTIVE", ["role-admin"], 300, null],
  ["Тилек Асанов", "ACTIVE", ["role-operations-operator"], 210, null],
  ["Нурбек Кадыров", "ACTIVE", ["role-payments-approver"], 180, null],
  ["Джамиля Оморова", "ACTIVE", ["role-compliance-officer"], 150, null],
  ["Эрлан Токтосунов", "ACTIVE", ["role-treasurer"], 120, null],
  ["Асель Жумабекова", "ACTIVE", ["role-compliance-officer", "role-legacy-auditor"], 100, null],
  ["Бакыт Сыраков", "SUSPENDED", ["role-super"], 260, "Длительное отсутствие, доступ приостановлен до возвращения"],
  ["Динара Ибраимова", "SUSPENDED", ["role-support-agent"], 130, "Нарушение регламента проверки платежей"],
  ["Санжар Молдогазиев", "INACTIVE", ["role-admin"], 320, null],
  ["Гульнара Турсунова", "INVITED", ["role-security-officer"], 1, null],
  ["Азамат Кадыров", "INVITED", ["role-operations-operator"], 0, null],
  ["Чолпон Асанова", "EXPIRED", ["role-support-agent"], 20, null],
  ["Рустам Оморов", "EXPIRED", ["role-roles-admin"], 35, null],
];

const ACCESS_ADMINS = ACCESS_ADMIN_SEEDS.map(([name, status, roleIds, daysAgo, suspensionReason, email], i) => {
  const created = accessRoleDate(daysAgo);
  const updated = new Date(created.getTime() + (i % 5 + 1) * 24 * 60 * 60 * 1000);
  const invited = status === "INVITED" || status === "EXPIRED" ? created : new Date(created.getTime() - 60 * 60 * 1000);
  return {
    id: seedToPaymentUuid(i + 300),
    name,
    email: email || `staff.${String(i + 1).padStart(2, "0")}@asiafin.tech`,
    status,
    roleIds,
    invitedDate: invited,
    invitedAt: formatDateTime(invited),
    suspensionReason,
    hasIdentity: !(status === "INVITED" || status === "EXPIRED"),
    createdDate: created, createdAt: formatDateTime(created),
    updatedDate: updated, updatedAt: formatDateTime(updated),
  };
});

// ---- Эффективный доступ -------------------------------------------------------------------
// Итоговые гранты набора ролей: по каждой фиче — максимальный уровень среди ролей
function acmEffectiveGrants(roles) {
  const out = {};
  roles.forEach((r) => {
    Object.entries(r.grants || {}).forEach(([code, level]) => {
      if (acmLevelRank(level) > acmLevelRank(out[code])) out[code] = level;
    });
  });
  return out;
}

// Страница видна, если выданы все её фичи на нужном уровне; вкладка невидима, если закрыт родитель
function acmPageVisibility(grants) {
  const visible = {};
  ACM_PAGES.forEach((p) => {
    visible[p.code] = p.requires.every((r) => acmLevelRank(grants[r.feature]) >= acmLevelRank(r.level));
  });
  ACM_PAGES.forEach((p) => {
    if (p.parent && !visible[p.parent]) visible[p.code] = false;
  });
  return visible;
}

