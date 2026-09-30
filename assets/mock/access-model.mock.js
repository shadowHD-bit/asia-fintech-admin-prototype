/* ==========================================================================
   Модель доступа админки — по устройству ACL из bb2 (apps/acl/src/access-model): роль выдаёт гранты "раздел × уровень доступа",
   уровни READ < WRITE < DELETE включающие (WRITE даёт READ). Каталог составлен под разделы и функции ЭТОГО прототипа, а не
   переписан из bb2: раздел системы = пункт меню нашей админки, действия — то, что реально умеет каждый экран (экспорт, создание,
   одобрение, блокировка, закрытие и т.д.).
   Денежные разделы (money) — те, что двигают деньги или меняют учётные остатки: одобрение платежей и обменов, вывод
   криптовалюты, закрытие операционного дня, регулировка, принудительная отмена OTC, проводки vABS. Так же, как в bb2, они
   вынесены отдельными разделами, чтобы право «менять раздел» не давало право «двигать деньги».
   Страница — пункт меню (id как в NAV_TREE): видна, когда у роли выданы все её разделы минимум на READ.
   Условное (для наглядности): состав ролей-шаблонов; названия ролей и их гранты придуманы под наш прототип.
   ========================================================================== */

// Категории — группы бокового меню
const ACM_CATEGORIES = ["CLIENTS", "OPERATIONS", "ACCOUNTS", "EOD", "ANALYTICS", "SECURITY", "SETTINGS"];

function acmFeatureDef(code, category, levels, money) {
  // название берётся из i18n при обращении, чтобы следовать языку интерфейса
  return { code, category, money: !!money, levels, get title() { return t(`accessMatrix.features.${code}`); } };
}

// [код, категория, {уровень: [действия]}, денежный]
const ACM_FEATURES = [
  // Клиенты
  acmFeatureDef("clients_users", "CLIENTS", {
    READ: ["Список и карточка пользователя", "Операции и счета клиента", "Экспорт списка и карточки в PDF"],
    WRITE: ["Редактирование данных", "Блокировка и разблокировка", "Блокировка операций", "Сброс пароля", "Изменение статуса KYC"],
  }),
  acmFeatureDef("clients_companies", "CLIENTS", {
    READ: ["Список и карточка компании", "Участники и документы", "Экспорт списка и карточки в PDF"],
    WRITE: ["Редактирование данных", "Блокировка и разблокировка", "Работа с документами", "Изменение статуса KYB"],
  }),
  // Операции
  acmFeatureDef("payments_fiat", "OPERATIONS", {
    READ: ["Список и карточка платежа", "Экспорт списка и карточки в PDF"],
    WRITE: ["Создание платежа", "Запрос информации у клиента", "Комментарии и вложения", "Отклонение платежа"],
  }),
  acmFeatureDef("payment_approval", "OPERATIONS", { WRITE: ["Одобрение и отправка платежа"] }, true),
  acmFeatureDef("payments_crypto", "OPERATIONS", {
    READ: ["Список и карточка криптоплатежа", "Экспорт списка и карточки в PDF"],
    WRITE: ["Комментарии и вложения", "Отклонение платежа"],
  }),
  acmFeatureDef("crypto_withdrawals", "OPERATIONS", { WRITE: ["Создание вывода во внешний кошелёк", "Создание перевода между клиентами"] }, true),
  acmFeatureDef("exchanges", "OPERATIONS", {
    READ: ["Список и карточка обмена", "Экспорт списка и карточки в PDF"],
    WRITE: ["Комментарии", "Изменение курса", "Отклонение обмена"],
  }),
  acmFeatureDef("exchange_approval", "OPERATIONS", { WRITE: ["Одобрение обмена"] }, true),
  acmFeatureDef("otc_deals", "OPERATIONS", {
    READ: ["Список и карточка сделки", "Экспорт списка и карточки в PDF"],
    WRITE: ["Комментарии администраторов"],
  }),
  acmFeatureDef("otc_force_cancel", "OPERATIONS", { WRITE: ["Принудительная отмена сделки с возвратом средств продавцу"] }, true),
  acmFeatureDef("financial_reports", "OPERATIONS", { READ: ["Просмотр и выгрузка финансовых отчётов"] }),
  // Счета
  acmFeatureDef("accounts_virtual", "ACCOUNTS", {
    READ: ["Список и карточка счёта", "Балансы и операции счёта", "Экспорт списка, карточки и операций"],
    WRITE: ["Создание и редактирование счёта", "Заморозка и активация", "Архивация"],
    DELETE: ["Закрытие счёта"],
  }),
  acmFeatureDef("accounts_provider", "ACCOUNTS", {
    READ: ["Реальные и корреспондентские счета", "Реквизиты, балансы и связанные счета", "Экспорт списка и карточки"],
    WRITE: ["Создание и редактирование счёта", "Заморозка и активация", "Архивация"],
    DELETE: ["Закрытие счёта"],
  }),
  // Операционный день
  acmFeatureDef("eod_days", "EOD", { READ: ["Дашборд дня", "История дней и снимков", "Экспорт истории"] }),
  acmFeatureDef("eod_close", "EOD", { WRITE: ["Запуск закрытия дня", "Одобрение этапов закрытия"] }, true),
  acmFeatureDef("eod_discrepancies", "EOD", {
    READ: ["Список и карточка расхождения", "Экспорт списка и карточки в PDF"],
    WRITE: ["Решение по расхождению", "Комментарии"],
  }),
  acmFeatureDef("eod_adjustments", "EOD", { WRITE: ["Регулировка: корректирующие транзакции"] }, true),
  acmFeatureDef("eod_settings", "EOD", {
    READ: ["Настройки дня и этапов", "Сверка"],
    WRITE: ["Изменение настроек дня и сверки"],
  }),
  // Аналитика
  acmFeatureDef("analytics", "ANALYTICS", { READ: ["Дашборды по клиентам, операциям, счетам, операционному дню и событиям"] }),
  // Безопасность
  acmFeatureDef("audit_logs", "SECURITY", { READ: ["Список и карточка события", "Экспорт списка и карточки в PDF"] }),
  acmFeatureDef("aml_checks", "SECURITY", {
    READ: ["Список и карточка проверки"],
    WRITE: ["Решение по проверке", "Комментарии"],
  }),
  acmFeatureDef("system_access", "SECURITY", {
    READ: ["Состояние доступа к системе"],
    WRITE: ["Завершение всех сессий", "Технические работы", "Аварийные ограничения"],
  }),
  acmFeatureDef("twofa_policy", "SECURITY", {
    READ: ["Политика 2FA и история изменений"],
    WRITE: ["Изменение политики 2FA"],
  }),
  // Настройки системы
  acmFeatureDef("access_roles", "SETTINGS", {
    READ: ["Роли, матрица доступа и каталог прав"],
    WRITE: ["Создание и правка ролей и их прав"],
    DELETE: ["Удаление роли"],
  }),
  acmFeatureDef("access_admins", "SETTINGS", {
    READ: ["Список и карточка администратора"],
    WRITE: ["Приглашение", "Смена ролей", "Приостановка и активация"],
    DELETE: ["Удаление администратора"],
  }),
  acmFeatureDef("rates", "SETTINGS", {
    READ: ["Курсы пар, источники и наценки"],
    WRITE: ["Создание и отмена наценок на курс"],
  }, true),
  acmFeatureDef("payment_routing", "SETTINGS", {
    READ: ["Правила маршрутизации, маршруты по умолчанию, исполнения и статистика"],
    WRITE: ["Создание, правка, порядок и статусы правил, маршруты по умолчанию, retry и уведомления"],
  }, true),
  acmFeatureDef("partners", "CLIENTS", {
    READ: ["Партнёрские сервисы и их клиенты: доступы, сессии, вебхуки"],
    WRITE: ["Создание сервиса, смена статуса, доступов, режима авторизации, платёжных каналов, вебхуков и 2FA"],
  }),
  acmFeatureDef("tariffs", "SETTINGS", {
    READ: ["Тарифы, лимиты, ограничения и комиссии"],
    WRITE: ["Изменение тарифов, лимитов и комиссий", "Назначение тарифов клиентам"],
    DELETE: ["Удаление тарифов и лимитов"],
  }),
  acmFeatureDef("verifications", "SETTINGS", {
    READ: ["Конфигурации KYC и KYB, документы и адреса"],
    WRITE: ["Изменение конфигураций", "Проверка документов и адресов"],
  }),
  acmFeatureDef("sanctions", "SETTINGS", {
    READ: ["Санкционные списки физлиц и компаний"],
    WRITE: ["Импорт и правка записей"],
    DELETE: ["Удаление записей"],
  }),
  acmFeatureDef("kyt_settings", "SETTINGS", {
    READ: ["Конфигурации KYT и скоринга"],
    WRITE: ["Изменение конфигураций"],
  }),
  acmFeatureDef("vabs_dictionaries", "SETTINGS", {
    READ: ["Сети, валюты и перечисления"],
    WRITE: ["Изменение сетей, валют и перечислений"],
  }),
  acmFeatureDef("vabs_operations", "SETTINGS", {
    READ: ["Операции vABS и проводки"],
    WRITE: ["Создание и правка операций и проводок"],
  }, true),
  acmFeatureDef("vabs_providers", "SETTINGS", {
    READ: ["Провайдеры vABS"],
    WRITE: ["Изменение провайдеров"],
  }),
];

// Страницы = пункты меню (id как в NAV_TREE); group — верхний пункт меню
const ACM_PAGE_GROUPS = ["clients", "analytics-dashboards", "operations", "accounts-virtual", "eod", "financial-reports", "security", "settings"];

function acmPageDef(code, group, feature, level) {
  return acmPageRaw(code, group, [{ feature, level: level || "READ" }]);
}

function acmPageRaw(code, group, requires) {
  return { code, group, section: group, parent: null, requires, get title() { return t(`nav.${code}`); } };
}

const ACM_PAGES = [
  acmPageDef("clients-users", "clients", "clients_users"),
  acmPageDef("clients-companies", "clients", "clients_companies"),
  ...["analytics-users", "analytics-operations", "analytics-accounts", "analytics-eod", "analytics-events"].map((id) => acmPageDef(id, "analytics-dashboards", "analytics")),
  acmPageDef("analytics-routing", "analytics-dashboards", "payment_routing"),
  acmPageDef("operations-payments", "operations", "payments_fiat"),
  acmPageDef("operations-crypto-payments", "operations", "payments_crypto"),
  acmPageDef("operations-exchanges", "operations", "exchanges"),
  acmPageDef("operations-otc", "operations", "otc_deals"),
  acmPageDef("accounts-virtual", "accounts-virtual", "accounts_virtual"),
  acmPageDef("eod-dashboard", "eod", "eod_days"),
  acmPageDef("eod-discrepancies", "eod", "eod_discrepancies"),
  acmPageDef("eod-history", "eod", "eod_days"),
  acmPageDef("financial-reports", "financial-reports", "financial_reports"),
  acmPageDef("security-audit-logs", "security", "audit_logs"),
  acmPageDef("security-aml-checks", "security", "aml_checks"),
  acmPageDef("security-system-access", "security", "system_access"),
  acmPageDef("twofa-policy", "security", "twofa_policy"),
  acmPageRaw("settings-access", "settings", [{ feature: "access_roles", level: "READ" }, { feature: "access_admins", level: "READ" }]),
  acmPageDef("settings-rates", "settings", "rates"),
  acmPageDef("settings-routing-rules", "settings", "payment_routing"),
  acmPageDef("settings-routing-settings", "settings", "payment_routing"),
  acmPageDef("settings-routing-executions", "settings", "payment_routing"),
  acmPageDef("clients-partners", "clients", "partners"),
  ...["catalog", "operations", "limits", "restrictions", "commissions", "clients", "history"].map((id) => acmPageDef(`settings-tariffs-${id}`, "settings", "tariffs")),
  acmPageDef("settings-sanctions-individuals", "settings", "sanctions"),
  acmPageDef("settings-sanctions-companies", "settings", "sanctions"),
  acmPageDef("settings-kyt-configs", "settings", "kyt_settings"),
  acmPageDef("settings-verif-kyc", "settings", "verifications"),
  acmPageDef("settings-verif-documents", "settings", "verifications"),
  acmPageDef("settings-verif-addresses", "settings", "verifications"),
  acmPageDef("settings-eod-day", "settings", "eod_settings"),
  acmPageDef("settings-eod-reconciliation", "settings", "eod_settings"),
  acmPageDef("settings-vabs-networks", "settings", "vabs_dictionaries"),
  acmPageDef("settings-vabs-currencies", "settings", "vabs_dictionaries"),
  acmPageDef("settings-vabs-enums", "settings", "vabs_dictionaries"),
  acmPageDef("settings-vabs-operations", "settings", "vabs_operations"),
  acmPageDef("settings-vabs-providers", "settings", "vabs_providers"),
  acmPageDef("settings-vabs-accounts", "settings", "accounts_provider"),
];

// Шаблоны ролей (для создания роли и стартового набора): гранты — { раздел, уровень }
const ACM_PRESETS = [
  {
    name: "OPERATIONS_OPERATOR", title: "Оператор операций", desc: "платежи, обмены, криптоплатежи и сделки без права одобрения",
    grants: [
      { feature: "payments_fiat", level: "WRITE" }, { feature: "payments_crypto", level: "WRITE" }, { feature: "exchanges", level: "WRITE" }, { feature: "otc_deals", level: "WRITE" },
      { feature: "clients_users", level: "READ" }, { feature: "clients_companies", level: "READ" }, { feature: "accounts_virtual", level: "READ" }, { feature: "financial_reports", level: "READ" },
    ],
  },
  {
    name: "PAYMENTS_APPROVER", title: "Согласующий платежей", desc: "проверка и одобрение платежей и обменов",
    grants: [
      { feature: "payments_fiat", level: "WRITE" }, { feature: "payment_approval", level: "WRITE" }, { feature: "payments_crypto", level: "READ" },
      { feature: "exchanges", level: "WRITE" }, { feature: "exchange_approval", level: "WRITE" }, { feature: "otc_deals", level: "READ" },
      { feature: "clients_users", level: "READ" }, { feature: "clients_companies", level: "READ" }, { feature: "accounts_virtual", level: "READ" },
    ],
  },
  {
    name: "COMPLIANCE_OFFICER", title: "Комплаенс-офицер", desc: "KYC/KYB, санкции, AML и аудит",
    grants: [
      { feature: "clients_users", level: "WRITE" }, { feature: "clients_companies", level: "WRITE" }, { feature: "verifications", level: "WRITE" }, { feature: "sanctions", level: "WRITE" },
      { feature: "kyt_settings", level: "READ" }, { feature: "aml_checks", level: "WRITE" }, { feature: "audit_logs", level: "READ" },
      { feature: "payments_fiat", level: "READ" }, { feature: "payments_crypto", level: "READ" }, { feature: "analytics", level: "READ" },
    ],
  },
  {
    name: "TREASURER", title: "Казначей", desc: "счета, операционный день и сверка",
    grants: [
      { feature: "accounts_virtual", level: "WRITE" }, { feature: "accounts_provider", level: "WRITE" }, { feature: "eod_days", level: "READ" }, { feature: "eod_close", level: "WRITE" },
      { feature: "eod_discrepancies", level: "WRITE" }, { feature: "eod_adjustments", level: "WRITE" }, { feature: "eod_settings", level: "READ" },
      { feature: "financial_reports", level: "READ" }, { feature: "exchanges", level: "READ" }, { feature: "analytics", level: "READ" },
    ],
  },
  {
    name: "SECURITY_OFFICER", title: "Офицер безопасности", desc: "журнал событий, доступ к системе и 2FA",
    grants: [
      { feature: "audit_logs", level: "READ" }, { feature: "aml_checks", level: "READ" }, { feature: "system_access", level: "WRITE" }, { feature: "twofa_policy", level: "WRITE" },
      { feature: "access_admins", level: "READ" }, { feature: "access_roles", level: "READ" },
    ],
  },
  {
    name: "SUPPORT_AGENT", title: "Специалист поддержки", desc: "клиенты, операции и счета на просмотр, блокировки и комментарии",
    grants: [
      { feature: "clients_users", level: "WRITE" }, { feature: "clients_companies", level: "READ" }, { feature: "payments_fiat", level: "WRITE" },
      { feature: "payments_crypto", level: "READ" }, { feature: "exchanges", level: "READ" }, { feature: "otc_deals", level: "WRITE" }, { feature: "accounts_virtual", level: "READ" },
    ],
  },
  {
    name: "ROLES_ADMIN", title: "Администратор доступа", desc: "управление ролями и администраторами",
    grants: [
      { feature: "access_roles", level: "DELETE" }, { feature: "access_admins", level: "DELETE" }, { feature: "audit_logs", level: "READ" },
    ],
  },
];

