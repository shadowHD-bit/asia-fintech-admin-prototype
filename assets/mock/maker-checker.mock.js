/* ==========================================================================
   "Настройки → Maker-Checker" — правила подтверждения и запросы на подтверждение.

   ДОПУЩЕНИЕ ПРОТОТИПА: раздела нет в реальном бэкенде (read-only репозитории) —
   построен по отдельной спеке заказчика (D:\Project\multibank\maker-checker.md,
   RM-87441), а не по реальному API.

   "Шесть глаз" (requiredApprovals > 1 — нужно N РАЗНЫХ подтверждающих, не любой
   один из списка ролей) спекой не описано вообще — это наше расширение поверх
   неё, добавлено по отдельной просьбе поверх базового "четыре глаза"
   (requiredApprovals:1 — обычный случай, ровно как в документе).

   Реально подключено (proof of concept — не все 9 категорий из MVP-таблицы
   спеки, это было бы нереально за один заход):
   - Тарифы: создание/редактирование (assets/views/settings-tariffs.js, tfOpenTariffForm).
   - Курсы: ручная наценка (assets/views/settings-rates.js, rtOpenMarkupForm) —
     единственное правило с requiredApprovals:2 (шесть глаз), для демонстрации.
   Остальные категории из MVP-таблицы (Payments, Account Management, Masks,
   KYC/KYB, KYT, User/Role Management) существуют только как значения `entity`
   в правилах — без реального перехвата действия. Честно, не выдаётся за готовое.

   CURRENT_ADMIN — единственная сессия в прототипе. "Проверяющий — не создатель"
   демонстрируется без имитации чужой сессии (решение пользователя): карточка
   запроса просто не даёт одобрить/отклонить свой же запрос — кнопки не
   показываются, если makerId === текущий админ. Для шестиглазых запросов
   засеяно одно уже существующее подтверждение от ДРУГОГО (не CURRENT_ADMIN)
   администратора — можно дать недостающее второе и увидеть, как запрос
   реально закрывается и применяется действие.

   Особый случай "единственный суперадмин" (§"Особый случай: Superadmin" в
   спеке) — проверяется по-настоящему (mcIsSoleSuperadmin), но в затравке
   admins есть ВТОРОЙ активный SUPER ("Марат Эсенов", settings-access.mock.js) —
   иначе CURRENT_ADMIN обходил бы проверку всегда и живую демонстрацию обычного
   флоу было бы не показать.

   Общий журнал аудита (security-audit-logs.mock.js) в этом заходе не
   затронут — у каждого запроса есть свой timeline (создание/подтверждения/
   отклонение), это и служит журналом процесса для данной фичи.

   Загружается после settings-access.mock.js (ACCESS_ADMINS/ACCESS_ROLES) и
   после app.js — НЕТ: обращения к CURRENT_ADMIN/render() только внутри тел
   функций (см. правило порядка загрузки — после инцидента с GL пустым экраном).
   ========================================================================== */

function mcCurrentAdminRecord() {
  return ACCESS_ADMINS.find((a) => a.email === CURRENT_ADMIN.email) || null;
}

function mcRoleName(roleId) {
  const r = ACCESS_ROLES.find((x) => x.id === roleId);
  return r ? r.name : roleId;
}

function mcAdminById(id) {
  return ACCESS_ADMINS.find((a) => a.id === id) || null;
}

// Независимый "тикающий" таймер — НЕ pdNow() (тот определён в views/operations-payment-detail.js,
// который грузится намного позже этого мока: обращение к нему здесь при загрузке точно так же
// валило бы файл ReferenceError'ом, как раньше валил CURRENT_ADMIN — нашлось по консоли браузера).
let mcClockTick = 0;
function mcNow() {
  mcClockTick += 1;
  return new Date(MOCK_NOW.getTime() + mcClockTick * 60 * 1000);
}

function mcStamp(entity, createdDate, updatedDate) {
  entity.createdDate = createdDate;
  entity.createdAt = formatDateTime(createdDate);
  entity.updatedDate = updatedDate || createdDate;
  entity.updatedAt = formatDateTime(entity.updatedDate);
  return entity;
}

// Справочник сущностей — из MVP-таблицы спеки ("Область применения")
const MC_ENTITIES = ["Payment", "Account", "Mask", "Tariff", "KycConfig", "KytRule", "Rate", "User", "Role"];
// Спека (§"Структура правила") ограничивает Action Type только CREATE/UPDATE — DELETE/EXPORT/IMPORT/
// APPROVE/REJECT добавлены сверх неё по отдельной просьбе (та же логика, что и "шесть глаз"):
// в реальных разделах админки есть и удаление (роли, тарифы, маски), и экспорт/импорт (справочники),
// и отдельное подтверждение/отклонение решений (KYC-шаги, платежи) — ограничиваться только
// CREATE/UPDATE было бы честнее к спеке, но менее полезно для прототипа.
const MC_ACTION_TYPES = ["CREATE", "UPDATE", "DELETE", "EXPORT", "IMPORT", "APPROVE", "REJECT"];

// ---- Правила подтверждения ------------------------------------------------------------------
const MC_RULE_SPECS = [
  // [actionType, entity, checkerRoleIds, requiredApprovals, isEnabled, description]
  ["CREATE", "Tariff", ["role-treasurer", "role-super"], 1, true, "Новый тариф меняет условия для клиентов — нужно подтверждение казначейства"],
  ["UPDATE", "Tariff", ["role-treasurer", "role-super"], 1, true, "Изменение существующего тарифа затрагивает уже подключённых клиентов"],
  ["UPDATE", "Rate", ["role-treasurer", "role-super"], 2, true, "Ручная наценка курса — шесть глаз: правило после инцидента с задвоенной наценкой"],
  ["CREATE", "Payment", ["role-payments-approver"], 1, false, "Выключено — демонстрационное правило из MVP-таблицы спеки, реально не подключено"],
  ["UPDATE", "Role", ["role-super"], 1, true, "Изменение ролей — только суперадмин"],
  ["CREATE", "User", ["role-compliance-officer"], 1, false, "Выключено — демонстрационное, реально не подключено"],
];
const MC_D_BASE = new Date(2026, 5, 1, 10, 0);
const APPROVAL_RULES = MC_RULE_SPECS.map(([actionType, entity, checkerRoleIds, requiredApprovals, isEnabled, description], i) =>
  mcStamp(
    { id: seedToPaymentUuid(45000 + i), actionType, entity, checkerRoleIds, requiredApprovals, isEnabled, status: "ACTIVE", description },
    new Date(MC_D_BASE.getTime() + i * 48 * 3600 * 1000)
  )
);

function mcRuleById(id) {
  return APPROVAL_RULES.find((r) => r.id === id) || null;
}

function mcActiveRuleFor(actionType, entity) {
  return APPROVAL_RULES.find((r) => r.actionType === actionType && r.entity === entity && r.isEnabled && r.status === "ACTIVE") || null;
}

// ---- Запросы на подтверждение ----------------------------------------------------------------
let mcSeq = 0;
function mcNextCode() {
  mcSeq += 1;
  return `AR-${String(mcSeq).padStart(5, "0")}`;
}

function mcIsSoleSuperadmin(adminRecord) {
  if (!adminRecord || !adminRecord.roleIds.includes("role-super")) return false;
  const supers = ACCESS_ADMINS.filter((a) => a.status === "ACTIVE" && a.roleIds.includes("role-super"));
  return supers.length === 1 && supers[0].id === adminRecord.id;
}

function mcCreateSummary(fields) {
  return { pattern: "CREATE", fields };
}

function mcUpdateSummary(changes) {
  return { pattern: "UPDATE", changes };
}

const APPROVAL_REQUESTS = [];

// apply — функция, которая реально выполняет исходное действие (живёт только в памяти сессии —
// это прототип, не бэкенд с персистентным outbox).
function mcCreateRequest({ rule, actionType, entity, targetType, targetId, targetLabel, summary, apply, makerOverride }) {
  const now = mcNow();
  const maker = makerOverride || mcCurrentAdminRecord();
  const req = mcStamp(
    {
      id: seedToPaymentUuid((Date.now() + mcSeq) % 100000 + 46000),
      code: mcNextCode(),
      status: "PENDING",
      ruleId: rule.id,
      actionType,
      entity,
      requiredApprovals: rule.requiredApprovals,
      makerId: maker ? maker.id : null,
      makerName: maker ? maker.name : CURRENT_ADMIN.name,
      makerRoleIds: maker ? maker.roleIds : [],
      targetType,
      targetId: targetId || null,
      targetLabel,
      summary,
      approvals: [],
      rejection: null,
      expiresAt: new Date(now.getTime() + 72 * 3600 * 1000),
      timeline: [{ eventType: "CREATED", actorId: maker ? maker.id : null, actorName: maker ? maker.name : CURRENT_ADMIN.name, comment: null, occurredAt: now }],
      apply,
    },
    now
  );
  APPROVAL_REQUESTS.unshift(req);
  return req;
}

// Единая точка входа для "защищённых" действий. Если активного правила нет — выполняется сразу.
// Если текущий админ — единственный активный SUPER, особый случай спеки тоже выполняет немедленно
// (с пометкой bypassed — отображается в карточке запросов как отдельное событие, см. UI).
function mcTryGate({ actionType, entity, targetType, targetId, targetLabel, summary, apply }) {
  const rule = mcActiveRuleFor(actionType, entity);
  if (!rule) {
    apply();
    return { gated: false };
  }
  const maker = mcCurrentAdminRecord();
  if (mcIsSoleSuperadmin(maker)) {
    apply();
    return { gated: false, bypassed: true };
  }
  const request = mcCreateRequest({ rule, actionType, entity, targetType, targetId, targetLabel, summary, apply });
  return { gated: true, request };
}

function mcById(id) {
  return APPROVAL_REQUESTS.find((r) => r.id === id) || null;
}

function mcIsOverdue(req) {
  // MOCK_NOW, не mcNow() — это проверка на чтение (вызывается при каждом рендере строки списка),
  // а не создание нового события; тикающий счётчик здесь увеличивался бы без остановки.
  return req.status === "PENDING" && req.expiresAt && MOCK_NOW > req.expiresAt;
}

function mcEligibleCheckerRoleIds(req) {
  const rule = mcRuleById(req.ruleId);
  return rule ? rule.checkerRoleIds : [];
}

// checker !== maker (жёсткое правило спеки) + шесть глаз: один и тот же человек не может дать
// второе подтверждение за себя же (учитывается через approvals.some ниже)
function mcCanCurrentAdminDecide(req) {
  if (req.status !== "PENDING") return false;
  const me = mcCurrentAdminRecord();
  if (!me) return false;
  if (req.makerId === me.id) return false;
  if (req.approvals.some((a) => a.checkerId === me.id)) return false;
  const roles = mcEligibleCheckerRoleIds(req);
  return me.roleIds.some((r) => roles.includes(r));
}

function mcApprove(req, comment) {
  const me = mcCurrentAdminRecord();
  const now = mcNow();
  const roleId = me.roleIds.find((r) => mcEligibleCheckerRoleIds(req).includes(r));
  req.approvals.push({ checkerId: me.id, checkerName: me.name, checkerRoleName: mcRoleName(roleId), comment: comment || null, decidedAt: now });
  req.timeline.push({ eventType: "APPROVED_STEP", actorId: me.id, actorName: me.name, comment: comment || null, occurredAt: now });
  if (req.approvals.length >= req.requiredApprovals) {
    req.status = "APPROVED";
    req.timeline.push({ eventType: "APPROVED", actorId: me.id, actorName: me.name, comment: null, occurredAt: now });
    if (req.apply) req.apply();
  }
  mcStamp(req, req.createdDate, now);
}

function mcReject(req, comment) {
  const me = mcCurrentAdminRecord();
  const now = mcNow();
  req.status = "REJECTED";
  req.rejection = { checkerId: me.id, checkerName: me.name, comment, decidedAt: now };
  req.timeline.push({ eventType: "REJECTED", actorId: me.id, actorName: me.name, comment, occurredAt: now });
  mcStamp(req, req.createdDate, now);
}

// ---- Затравка демо-запросов -------------------------------------------------------------------
// Создатели и первые подтверждающие — реальные записи ACCESS_ADMINS, НЕ CURRENT_ADMIN (иначе
// "чужую" карточку нельзя было бы ни одобрить, ни увидеть недостающее шестиглазое подтверждение).
(() => {
  const treasurer = ACCESS_ADMINS.find((a) => a.roleIds.includes("role-treasurer"));
  const otherAdmin = ACCESS_ADMINS.find((a) => a.roleIds.includes("role-admin"));
  const complianceOfficer = ACCESS_ADMINS.find((a) => a.roleIds.includes("role-compliance-officer"));
  // НЕ mcCurrentAdminRecord()/CURRENT_ADMIN здесь: эта затравка выполняется немедленно при загрузке
  // мока, а CURRENT_ADMIN определён в app.js, который грузится последним (та же причина, по которой
  // в одной из прошлых версий мока "ReferenceError" на этом месте обнулял весь массив — пример этого
  // класса багов см. в начале данного файла). Email продублирован литералом нарочно.
  const meAdmin = ACCESS_ADMINS.find((a) => a.email === "admin@asiafin.tech");
  const tariffRule = mcActiveRuleFor("CREATE", "Tariff");
  const tariffUpdateRule = mcActiveRuleFor("UPDATE", "Tariff");
  const rateRule = mcActiveRuleFor("UPDATE", "Rate");

  // 1. PENDING, создал другой админ — текущий может сам одобрить/отклонить (роль SUPER подходит)
  mcCreateRequest({
    rule: tariffRule, actionType: "CREATE", entity: "Tariff", targetType: "TARIFF", targetLabel: "VIP Corporate",
    summary: mcCreateSummary([
      { label: "Название", value: "VIP Corporate" },
      { label: "Категория", value: "Корпоративный" },
      { label: "Операций привязано", value: "6" },
    ]),
    apply: () => {},
    makerOverride: otherAdmin,
  }).createdDate = new Date(MOCK_NOW.getTime() - 5 * 3600 * 1000);

  // 2. PENDING, создал сам CURRENT_ADMIN (через meAdmin, без обращения к ещё не загруженному
  // глобалу CURRENT_ADMIN) — виден во вкладке "Мои запросы", ждёт другого подтверждающего
  mcCreateRequest({
    rule: tariffUpdateRule, actionType: "UPDATE", entity: "Tariff", targetType: "TARIFF", targetLabel: "Corporate Standard",
    summary: mcUpdateSummary([
      { attribute: "Лимит в день", currentValue: "50 000 EUR", targetValue: "100 000 EUR" },
      { attribute: "Комиссия SWIFT", currentValue: "0.5%", targetValue: "0.35%" },
    ]),
    apply: () => {},
    makerOverride: meAdmin,
  });

  // 3. Шесть глаз, 1 из 2 подтверждений уже есть (от другого админа) — не хватает ровно одного
  const sixEyes = mcCreateRequest({
    rule: rateRule, actionType: "UPDATE", entity: "Rate", targetType: "RATE_MARKUP", targetLabel: "EUR/USD +0.8%",
    summary: mcCreateSummary([
      { label: "Валютная пара", value: "EUR/USD" },
      { label: "Тип", value: "Процент" },
      { label: "Значение", value: "+0.8%" },
      { label: "Причина", value: "Компенсация волатильности после открытия торгов" },
    ]),
    apply: () => {},
    makerOverride: otherAdmin,
  });
  sixEyes.createdDate = new Date(MOCK_NOW.getTime() - 20 * 3600 * 1000);
  if (treasurer) {
    sixEyes.approvals.push({ checkerId: treasurer.id, checkerName: treasurer.name, checkerRoleName: "TREASURER", comment: "Согласовано, сумма в пределах нормы", decidedAt: new Date(MOCK_NOW.getTime() - 10 * 3600 * 1000) });
    sixEyes.timeline.push({ eventType: "APPROVED_STEP", actorId: treasurer.id, actorName: treasurer.name, comment: "Согласовано, сумма в пределах нормы", occurredAt: new Date(MOCK_NOW.getTime() - 10 * 3600 * 1000) });
  }

  // 4. APPROVED — завершённый пример (обычный, четыре глаза)
  const approved = mcCreateRequest({
    rule: tariffUpdateRule, actionType: "UPDATE", entity: "Tariff", targetType: "TARIFF", targetLabel: "KYC Level 2",
    summary: mcUpdateSummary([{ attribute: "Описание", currentValue: "Базовый тариф KYC L2", targetValue: "Базовый тариф KYC L2 (ред. 2026-09)" }]),
    apply: () => {},
    makerOverride: otherAdmin,
  });
  approved.createdDate = new Date(MOCK_NOW.getTime() - 9 * 24 * 3600 * 1000);
  if (treasurer) {
    approved.status = "APPROVED";
    approved.approvals.push({ checkerId: treasurer.id, checkerName: treasurer.name, checkerRoleName: "TREASURER", comment: "ОК", decidedAt: new Date(MOCK_NOW.getTime() - 8 * 24 * 3600 * 1000) });
    approved.timeline.push(
      { eventType: "APPROVED_STEP", actorId: treasurer.id, actorName: treasurer.name, comment: "ОК", occurredAt: new Date(MOCK_NOW.getTime() - 8 * 24 * 3600 * 1000) },
      { eventType: "APPROVED", actorId: treasurer.id, actorName: treasurer.name, comment: null, occurredAt: new Date(MOCK_NOW.getTime() - 8 * 24 * 3600 * 1000) }
    );
  }

  // 5. REJECTED — с обязательной причиной
  const rejected = mcCreateRequest({
    rule: rateRule, actionType: "UPDATE", entity: "Rate", targetType: "RATE_MARKUP", targetLabel: "USD/RUB +2.5%",
    summary: mcCreateSummary([{ label: "Валютная пара", value: "USD/RUB" }, { label: "Тип", value: "Процент" }, { label: "Значение", value: "+2.5%" }]),
    apply: () => {},
    makerOverride: otherAdmin,
  });
  rejected.createdDate = new Date(MOCK_NOW.getTime() - 6 * 24 * 3600 * 1000);
  if (complianceOfficer) {
    rejected.status = "REJECTED";
    rejected.rejection = { checkerId: complianceOfficer.id, checkerName: complianceOfficer.name, comment: "Наценка выше политики риска без обоснования — пересчитать и подать заново", decidedAt: new Date(MOCK_NOW.getTime() - 5.5 * 24 * 3600 * 1000) };
    rejected.timeline.push({ eventType: "REJECTED", actorId: complianceOfficer.id, actorName: complianceOfficer.name, comment: rejected.rejection.comment, occurredAt: rejected.rejection.decidedAt });
  }

  // 6. EXPIRED — никто не обработал вовремя
  const expired = mcCreateRequest({
    rule: tariffRule, actionType: "CREATE", entity: "Tariff", targetType: "TARIFF", targetLabel: "Seasonal Promo 2026Q3",
    summary: mcCreateSummary([{ label: "Название", value: "Seasonal Promo 2026Q3" }, { label: "Категория", value: "Физлицо" }]),
    apply: () => {},
    makerOverride: otherAdmin,
  });
  expired.createdDate = new Date(MOCK_NOW.getTime() - 10 * 24 * 3600 * 1000);
  expired.expiresAt = new Date(MOCK_NOW.getTime() - 7 * 24 * 3600 * 1000);
  expired.status = "EXPIRED";
  expired.timeline.push({ eventType: "EXPIRED", actorId: null, actorName: "Система", comment: null, occurredAt: expired.expiresAt });

  // 7. PENDING, Role UPDATE (четыре глаза, только SUPER) — другой пример сущности и инициатора
  const roleUpdateRule = mcActiveRuleFor("UPDATE", "Role");
  if (roleUpdateRule && treasurer) {
    mcCreateRequest({
      rule: roleUpdateRule, actionType: "UPDATE", entity: "Role", targetType: "ROLE", targetLabel: "COMPLIANCE_OFFICER",
      summary: mcUpdateSummary([{ attribute: "Доступ к разделу «Санкционные списки»", currentValue: "READ", targetValue: "WRITE" }]),
      apply: () => {},
      makerOverride: treasurer,
    }).createdDate = new Date(MOCK_NOW.getTime() - 2 * 3600 * 1000);
  }

  // 8. PENDING, шесть глаз, 0 из 2 — свежий запрос, ещё никто не подтвердил
  if (complianceOfficer) {
    mcCreateRequest({
      rule: rateRule, actionType: "UPDATE", entity: "Rate", targetType: "RATE_MARKUP", targetLabel: "GBP/USD -0.4%",
      summary: mcCreateSummary([
        { label: "Валютная пара", value: "GBP/USD" },
        { label: "Тип", value: "Процент" },
        { label: "Значение", value: "-0.4%" },
        { label: "Причина", value: "Корректировка под котировки провайдера после обновления фида" },
      ]),
      apply: () => {},
      makerOverride: complianceOfficer,
    }).createdDate = new Date(MOCK_NOW.getTime() - 1 * 3600 * 1000);
  }

  // 9. PENDING, создал казначей — проверяет случай другого инициатора, четыре глаза
  if (treasurer) {
    mcCreateRequest({
      rule: tariffUpdateRule, actionType: "UPDATE", entity: "Tariff", targetType: "TARIFF", targetLabel: "High risk",
      summary: mcUpdateSummary([
        { attribute: "Лимит в день", currentValue: "10 000 EUR", targetValue: "5 000 EUR" },
        { attribute: "Комиссия", currentValue: "1.2%", targetValue: "1.8%" },
      ]),
      apply: () => {},
      makerOverride: treasurer,
    }).createdDate = new Date(MOCK_NOW.getTime() - 30 * 3600 * 1000);
  }

  // 10. REJECTED — создание тарифа, отклонено (другой пример, не по курсу)
  if (treasurer) {
    const rejectedTariff = mcCreateRequest({
      rule: tariffRule, actionType: "CREATE", entity: "Tariff", targetType: "TARIFF", targetLabel: "Crypto Friends",
      summary: mcCreateSummary([{ label: "Название", value: "Crypto Friends" }, { label: "Категория", value: "Физлицо" }, { label: "Операций привязано", value: "3" }]),
      apply: () => {},
      makerOverride: otherAdmin,
    });
    rejectedTariff.createdDate = new Date(MOCK_NOW.getTime() - 4 * 24 * 3600 * 1000);
    rejectedTariff.status = "REJECTED";
    rejectedTariff.rejection = { checkerId: treasurer.id, checkerName: treasurer.name, comment: "Условия пересекаются с уже действующим тарифом «VIP Crypto» — уточнить отличие перед повторной подачей", decidedAt: new Date(MOCK_NOW.getTime() - 3.7 * 24 * 3600 * 1000) };
    rejectedTariff.timeline.push({ eventType: "REJECTED", actorId: treasurer.id, actorName: treasurer.name, comment: rejectedTariff.rejection.comment, occurredAt: rejectedTariff.rejection.decidedAt });
  }

  // 11. APPROVED — шесть глаз, полностью пройденный пример (оба подтверждения уже даны)
  if (treasurer && complianceOfficer) {
    const approvedSixEyes = mcCreateRequest({
      rule: rateRule, actionType: "UPDATE", entity: "Rate", targetType: "RATE_MARKUP", targetLabel: "USD/KGS +1.1%",
      summary: mcCreateSummary([{ label: "Валютная пара", value: "USD/KGS" }, { label: "Тип", value: "Процент" }, { label: "Значение", value: "+1.1%" }]),
      apply: () => {},
      makerOverride: otherAdmin,
    });
    approvedSixEyes.createdDate = new Date(MOCK_NOW.getTime() - 15 * 24 * 3600 * 1000);
    approvedSixEyes.status = "APPROVED";
    const t1 = new Date(MOCK_NOW.getTime() - 14.5 * 24 * 3600 * 1000);
    const t2 = new Date(MOCK_NOW.getTime() - 14 * 24 * 3600 * 1000);
    approvedSixEyes.approvals.push(
      { checkerId: treasurer.id, checkerName: treasurer.name, checkerRoleName: "TREASURER", comment: null, decidedAt: t1 },
      { checkerId: complianceOfficer.id, checkerName: complianceOfficer.name, checkerRoleName: "COMPLIANCE_OFFICER", comment: "Вторая подпись — подтверждаю", decidedAt: t2 }
    );
    approvedSixEyes.timeline.push(
      { eventType: "APPROVED_STEP", actorId: treasurer.id, actorName: treasurer.name, comment: null, occurredAt: t1 },
      { eventType: "APPROVED_STEP", actorId: complianceOfficer.id, actorName: complianceOfficer.name, comment: "Вторая подпись — подтверждаю", occurredAt: t2 },
      { eventType: "APPROVED", actorId: complianceOfficer.id, actorName: complianceOfficer.name, comment: null, occurredAt: t2 }
    );
  }

  // 12. EXPIRED — ручная наценка курса, никто не успел обработать
  if (otherAdmin) {
    const expiredRate = mcCreateRequest({
      rule: rateRule, actionType: "UPDATE", entity: "Rate", targetType: "RATE_MARKUP", targetLabel: "EUR/KGS +0.6%",
      summary: mcCreateSummary([{ label: "Валютная пара", value: "EUR/KGS" }, { label: "Тип", value: "Процент" }, { label: "Значение", value: "+0.6%" }]),
      apply: () => {},
      makerOverride: otherAdmin,
    });
    expiredRate.createdDate = new Date(MOCK_NOW.getTime() - 8 * 24 * 3600 * 1000);
    expiredRate.expiresAt = new Date(MOCK_NOW.getTime() - 5 * 24 * 3600 * 1000);
    expiredRate.status = "EXPIRED";
    expiredRate.timeline.push({ eventType: "EXPIRED", actorId: null, actorName: "Система", comment: null, occurredAt: expiredRate.expiresAt });
  }
})();
