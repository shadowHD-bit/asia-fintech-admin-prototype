/* ==========================================================================
   "Настройки → Maker-Checker" + "Профиль → Подтверждения".
   ДОПУЩЕНИЕ ПРОТОТИПА: раздела нет в реальном бэкенде — построен по отдельной
   спеке заказчика (maker-checker.md, RM-87441). См. комментарий в
   mock/maker-checker.mock.js.
   ========================================================================== */

i18nMerge(I18N.ru, {
  makerChecker: {
    yes: "Да",
    no: "Нет",
    status: { PENDING: "На рассмотрении", APPROVED: "Одобрен", REJECTED: "Отклонён", EXPIRED: "Просрочен" },
    actionType: { CREATE: "Создание", UPDATE: "Изменение", DELETE: "Удаление", EXPORT: "Экспорт данных", IMPORT: "Импорт данных", APPROVE: "Подтверждение", REJECT: "Отклонение" },
    entities: {
      Payment: "Платёж", Account: "Счёт", Mask: "Маска", Tariff: "Тариф", KycConfig: "Конфиг KYC/KYB",
      KytRule: "Скоринговое правило KYT", Rate: "Курс", User: "Пользователь", Role: "Роль",
    },
    gate: { createdToast: "Действие требует подтверждения — создан запрос в Maker-Checker" },
    rules: {
      search: "Поиск по сущности или описанию",
      add: "Новое правило",
      info: "Правило подтверждения определяет, какое действие в системе требует обязательного подтверждения вторым администратором, и какие роли уполномочены это подтверждение давать. Без правила действие выполняется немедленно.",
      fourEyes: "Четыре глаза",
      sixEyes: "Шесть глаз",
      fields: {
        action: "Действие", actionType: "Тип действия", entity: "Сущность", checkerRoles: "Роли подтверждающих",
        requiredApprovals: "Уровень контроля", enabled: "Включено", created: "Создано", description: "Описание",
      },
      form: {
        createTitle: "Новое правило", editTitle: "Редактировать правило",
        createIntro: "Тип действия и сущность после создания не редактируются — для их изменения создайте новое правило.",
        editIntro: "Тип действия и сущность не редактируются.",
        errCheckerRoles: "Укажите хотя бы одну роль подтверждающего",
        errExists: "Правило для этого типа действия и сущности уже существует",
      },
    },
    requests: {
      info: "Запросы на подтверждение действий (maker-checker): кто создал, какие администраторы уже подтвердили или отклонили, и какой статус у запроса",
      search: "Поиск по номеру, названию или создателю",
      overdue: "Просрочен",
      fields: {
        code: "Номер запроса", maker: "Создал", progress: "Подтверждений", status: "Статус", created: "Создан",
        target: "Объект", expires: "Истекает",
      },
      summary: { attribute: "Поле", currentValue: "Было", targetValue: "Станет", comment: "Комментарий", empty: "Нет данных" },
      sections: { main: "Основное", summary: "Что меняется", approvals: "Подтверждения", timeline: "История" },
      timeline: {
        event: "Событие", actor: "Кто", comment: "Комментарий", when: "Когда",
        events: { CREATED: "Запрос создан", APPROVED_STEP: "Подтверждение", APPROVED: "Одобрен и выполнен", REJECTED: "Отклонён", EXPIRED: "Просрочен" },
      },
      noApprovalsYet: "Подтверждений пока нет",
    },
    actions: {
      create: "Создать", save: "Сохранить", createdToast: "Правило создано", savedToast: "Правило сохранено",
      approve: "Одобрить", reject: "Отклонить",
      approveTitle: "Одобрить запрос",
      approveIntro: "Запрос будет одобрен, и исходное действие выполнится немедленно.",
      approveIntroSixEyes: (progress) => `Это правило требует несколько независимых подтверждений (сейчас ${progress}). После вашего подтверждения действие выполнится, только если наберётся нужное количество.`,
      approveCommentLabel: "Комментарий (необязательно)",
      approvedToast: "Запрос одобрен, действие выполнено", approvedStepToast: "Подтверждение учтено — ждём ещё одного подтверждающего",
      rejectTitle: "Отклонить запрос", rejectReasonLabel: "Причина отклонения (обязательно)", errRejectReason: "Укажите причину отклонения",
      rejectedToast: "Запрос отклонён",
    },
    profile: {
      subtabs: { mine: "Мои запросы", toMe: "На моё подтверждение" },
    },
  },
});

i18nMerge(I18N.en, {
  makerChecker: {
    yes: "Yes",
    no: "No",
    status: { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", EXPIRED: "Expired" },
    actionType: { CREATE: "Create", UPDATE: "Update", DELETE: "Delete", EXPORT: "Data export", IMPORT: "Data import", APPROVE: "Approval", REJECT: "Rejection" },
    entities: {
      Payment: "Payment", Account: "Account", Mask: "Mask", Tariff: "Tariff", KycConfig: "KYC/KYB config",
      KytRule: "KYT scoring rule", Rate: "Rate", User: "User", Role: "Role",
    },
    gate: { createdToast: "This action requires approval — a Maker-Checker request has been created" },
    rules: {
      search: "Search by entity or description",
      add: "New rule",
      info: "An approval rule defines which action in the system requires mandatory confirmation by a second administrator, and which roles are authorized to confirm it. Without a rule, the action executes immediately.",
      fourEyes: "Four eyes",
      sixEyes: "Six eyes",
      fields: {
        action: "Action", actionType: "Action type", entity: "Entity", checkerRoles: "Checker roles",
        requiredApprovals: "Control level", enabled: "Enabled", created: "Created", description: "Description",
      },
      form: {
        createTitle: "New rule", editTitle: "Edit rule",
        createIntro: "Action type and entity can't be edited afterwards — create a new rule to change them.",
        editIntro: "Action type and entity can't be edited.",
        errCheckerRoles: "Select at least one checker role",
        errExists: "A rule for this action type and entity already exists",
      },
    },
    requests: {
      info: "Approval requests (maker-checker): who created them, which admins already approved or rejected, and the request's current status",
      search: "Search by code, name or maker",
      overdue: "Overdue",
      fields: {
        code: "Request code", maker: "Created by", progress: "Approvals", status: "Status", created: "Created",
        target: "Target", expires: "Expires",
      },
      summary: { attribute: "Field", currentValue: "Current", targetValue: "New value", comment: "Comment", empty: "No data" },
      sections: { main: "Main", summary: "What's changing", approvals: "Approvals", timeline: "History" },
      timeline: {
        event: "Event", actor: "Actor", comment: "Comment", when: "When",
        events: { CREATED: "Request created", APPROVED_STEP: "Approval", APPROVED: "Approved and executed", REJECTED: "Rejected", EXPIRED: "Expired" },
      },
      noApprovalsYet: "No approvals yet",
    },
    actions: {
      create: "Create", save: "Save", createdToast: "Rule created", savedToast: "Rule saved",
      approve: "Approve", reject: "Reject",
      approveTitle: "Approve request",
      approveIntro: "The request will be approved and the original action will execute immediately.",
      approveIntroSixEyes: (progress) => `This rule requires several independent approvals (currently ${progress}). After your approval, the action executes only once enough approvals are collected.`,
      approveCommentLabel: "Comment (optional)",
      approvedToast: "Request approved, action executed", approvedStepToast: "Approval recorded — waiting for one more approver",
      rejectTitle: "Reject request", rejectReasonLabel: "Rejection reason (required)", errRejectReason: "Enter a rejection reason",
      rejectedToast: "Request rejected",
    },
    profile: {
      subtabs: { mine: "My requests", toMe: "Awaiting my approval" },
    },
  },
});
