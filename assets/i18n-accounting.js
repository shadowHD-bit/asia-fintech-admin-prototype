/* ==========================================================================
   "Настройки → Бухгалтерия" — План счетов (CoA), дальше Отчёты.
   ДОПУЩЕНИЕ ПРОТОТИПА: раздела нет в реальном бэкенде — построен по FRD
   research-gl-coa.md / general-ledger-i-chart-of-accounts.md, см. комментарий
   в mock/accounting-coa.mock.js.

   БЕЗ ГЛАВНОЙ КНИГИ И ПРАВИЛ ПРОВОДОК (убраны 05.10.2026, по архитектуре
   реальной отчётности vABS — read-слой прямо над проводками ВА/РА, без
   отдельного GL-сервиса, см. комментарий в mock/accounting-coa.mock.js).
   Namespace'ы accountingGl/accountingRules и ключи nav["accounting-gl"/
   "accounting-rules"] удалены вместе с разделами.
   ========================================================================== */

i18nMerge(I18N.ru, {
  nav: {
    accounting: "Бухгалтерия",
    "accounting-coa": "План счетов",
    "accounting-reports": "Отчёты ГК",
  },
  navDescriptions: {
    "accounting-coa": "Иерархический справочник бухгалтерских счетов: активы, обязательства, капитал, доходы, расходы",
    "accounting-reports": "Оборотно-сальдовая ведомость, баланс, P&L, отчёт о сейфгардинге и другая бухгалтерская отчётность",
  },
  accountingCoa: {
    title: "План счетов",
    info: "План счетов (Chart of Accounts) — структура бухгалтерских категорий (Активы/Обязательства/Капитал/Доходы/Расходы). Привязка к реальным виртуальным/реальным счетам — через тег счёта (как в реальном бэкенде: PAYABLE_TO_CUSTOMER, CUSTOMER_FIAT_ACCOUNT и т.п.) — счёт плана счетов объединяет все ВА/РА с этим тегом. Остатки считаются прямо из их проводок — без отдельного журнала между Планом счетов и реальными счетами. Раздел — проект будущей фичи, построен по требованиям, а не по реальному API",
    search: "Поиск по коду или названию",
    add: "Новый счёт",
    yes: "Да", no: "Нет",
    export: { button: "Экспорт", hint: "Выгрузится весь план счетов с текущими балансами", done: "План счетов выгружен" },
    category: { ASSETS: "Активы", LIABILITIES: "Обязательства", EQUITY: "Капитал", INCOME: "Доходы", EXPENSES: "Расходы" },
    normalBalance: { DEBIT: "Дебет", CREDIT: "Кредит" },
    nodeType: { GROUP: "Группа", ANALYTICAL: "Аналитический", TECHNICAL: "Технический" },
    status: { ACTIVE: "Активен", INACTIVE: "Неактивен", ARCHIVED: "В архиве" },
    columns: {
      code: "Код", name: "Наименование", category: "Категория", normalBalance: "Сальдо", nodeType: "Тип узла",
      balance: "Остаток", status: "Статус", allowManual: "Ручные проводки", created: "Создан",
      account: "Счёт", drCr: "Дебет/Кредит", date: "Дата",
    },
    metrics: { total: "Всего счетов", analytical: "Аналитических", groups: "Групп", technical: "Технических" },
    fields: {
      code: "Код счёта", name: "Наименование", description: "Описание", parent: "Родительский счёт", category: "Категория",
      currency: "Валюта", currencyAny: "Мультивалютный", normalBalance: "Нормальное сальдо", nodeType: "Тип узла",
      tag: "Тег (привязка к ВА/РА)", client: "Клиент", account: "Счёт",
      allowManual: "Разрешить ручные проводки", isSystem: "Системный счёт", isTechnical: "Технический счёт",
      balance: "Текущий остаток", created: "Дата создания", updated: "Дата обновления", status: "Статус",
    },
    sections: { main: "Основное", linkedAccounts: "Привязанные счета", children: "Дочерние счета", entries: "Проводки", flags: "Флаги" },
    detail: {
      noChildren: "Дочерних счетов нет", noEntries: "Проводок по счёту ещё не было",
      noTag: "Нет реального тега — у этого счёта нет аналога среди ВА/РА (допущение прототипа)",
      noTagHint: "У этого счёта нет тега — привязать к нему реальные ВА/РА нельзя",
      noLinkedAccounts: "Счетов с этим тегом пока нет", noClient: "Системный",
      groupBalanceHint: "Остаток группы — сумма потомков (агрегируется автоматически, проводки на группу не создаются)",
    },
    form: {
      addTitle: "Новый счёт", editTitle: "Редактировать счёт",
      errCode: "Укажите код счёта (4–6 цифр)", errCodeFormat: "Код — только цифры, от 4 до 6 символов", errCodeExists: "Счёт с таким кодом уже существует",
      errName: "Укажите наименование", errNameExists: "Счёт с таким наименованием уже существует",
      errParent: "Выберите родительский счёт", errParentInactive: "Родительский счёт должен быть активен",
      errDepth: "Максимальная глубина иерархии — 3 уровня",
      errTagInUse: "Этот тег уже привязан к другому счёту плана счетов",
      tagNone: "— нет привязки —",
      tagHint: "Тег — реальное значение из справочника ВА/РА (как PAYABLE_TO_CUSTOMER). Один тег можно привязать только к одному счёту плана счетов; счета-группы тега не имеют",
      createIntro: "Категория наследуется от родительского счёта и после создания не редактируется",
      editIntro: "Код и категория счёта не редактируются",
    },
    actions: {
      create: "Создать", save: "Сохранить", deactivate: "Деактивировать", activate: "Активировать", archive: "Архивировать",
      addChild: "Создать дочерний субсчёт",
      link: "Привязать счёт", unlink: "Отвязать",
      linkTitle: "Привязать счёт", linkIntro: (tag) => `Выбранному счёту будет присвоен тег «${tag}» — он станет относиться к этому счёту плана счетов`,
      linkedToast: "Счёт привязан", noCandidates: "Нет счетов, которые можно привязать",
      unlinkTitle: "Отвязать счёт", unlinkText: (code) => `Счёт «${code}» перестанет относиться к этому счёту плана счетов (тег будет снят)`,
      errNotFound: "Счёт не найден",
      deactivateTitle: "Деактивировать счёт", deactivateText: (name) => `Счёт «${name}» перестанет принимать новые проводки. Счёт можно будет снова активировать`,
      deactivateBlockedBalance: "Нельзя деактивировать счёт с ненулевым остатком",
      activateTitle: "Активировать счёт", activateText: (name) => `Счёт «${name}» снова будет доступен для проводок`,
      archiveTitle: "Архивировать счёт", archiveText: (name) => `Счёт «${name}» перестанет отображаться в стандартных списках. Данные сохранятся полностью`,
      archiveBlockedStatus: "Архивировать можно только неактивный счёт", archiveBlockedBalance: "Архивировать можно только счёт с нулевым остатком",
      systemBlocked: "Системный счёт — статус меняется только в составе релиза, не из админки",
    },
    importExport: {
      importTitle: "Импортировать план счетов", importHint: "CSV или Excel. Режим «полная замена» недоступен, если в системе есть проводки",
      importNote: "Импорт — заготовка интерфейса: загрузка файла и разбор в прототипе не реализованы",
    },
  },
});

i18nMerge(I18N.en, {
  nav: {
    accounting: "Accounting",
    "accounting-coa": "Chart of Accounts",
    "accounting-reports": "GL Reports",
  },
  navDescriptions: {
    "accounting-coa": "Hierarchical directory of accounting accounts: assets, liabilities, equity, income, expenses",
    "accounting-reports": "Trial balance, balance sheet, P&L, safeguarding report and other accounting reports",
  },
  accountingCoa: {
    title: "Chart of Accounts",
    info: "Chart of Accounts is the structure of accounting categories (Assets/Liabilities/Equity/Income/Expenses). Linkage to real virtual/real accounts is through the account's tag (same as the real backend: PAYABLE_TO_CUSTOMER, CUSTOMER_FIAT_ACCOUNT, etc.) — a chart-of-accounts line groups every VA/RA carrying that tag. Balances are computed directly from their entries — no separate journal between the Chart of Accounts and the real accounts. This section is a future-feature design, built from requirements, not from a real API",
    search: "Search by code or name",
    add: "New account",
    yes: "Yes", no: "No",
    export: { button: "Export", hint: "Exports the whole chart of accounts with current balances", done: "Chart of accounts exported" },
    category: { ASSETS: "Assets", LIABILITIES: "Liabilities", EQUITY: "Equity", INCOME: "Income", EXPENSES: "Expenses" },
    normalBalance: { DEBIT: "Debit", CREDIT: "Credit" },
    nodeType: { GROUP: "Group", ANALYTICAL: "Analytical", TECHNICAL: "Technical" },
    status: { ACTIVE: "Active", INACTIVE: "Inactive", ARCHIVED: "Archived" },
    columns: {
      code: "Code", name: "Name", category: "Category", normalBalance: "Balance side", nodeType: "Node type",
      balance: "Balance", status: "Status", allowManual: "Manual entries", created: "Created",
      account: "Account", drCr: "Debit/Credit", date: "Date",
    },
    metrics: { total: "Total accounts", analytical: "Analytical", groups: "Groups", technical: "Technical" },
    fields: {
      code: "Account code", name: "Name", description: "Description", parent: "Parent account", category: "Category",
      currency: "Currency", currencyAny: "Multi-currency", normalBalance: "Normal balance", nodeType: "Node type",
      tag: "Tag (VA/RA linkage)", client: "Client", account: "Account",
      allowManual: "Allow manual entries", isSystem: "System account", isTechnical: "Technical account",
      balance: "Current balance", created: "Created date", updated: "Updated date", status: "Status",
    },
    sections: { main: "Main", linkedAccounts: "Linked accounts", children: "Child accounts", entries: "Journal entries", flags: "Flags" },
    detail: {
      noChildren: "No child accounts", noEntries: "No entries posted to this account yet",
      noTag: "No real tag — this account has no counterpart among VA/RA (prototype assumption)",
      noTagHint: "This account has no tag — real VA/RA accounts can't be linked to it",
      noLinkedAccounts: "No accounts with this tag yet", noClient: "System",
      groupBalanceHint: "Group balance is the sum of its children (auto-aggregated, entries are never posted directly on a group)",
    },
    form: {
      addTitle: "New account", editTitle: "Edit account",
      errCode: "Enter an account code (4–6 digits)", errCodeFormat: "Code must be 4–6 digits only", errCodeExists: "An account with this code already exists",
      errName: "Enter a name", errNameExists: "An account with this name already exists",
      errParent: "Select a parent account", errParentInactive: "Parent account must be active",
      errDepth: "Maximum hierarchy depth is 3 levels",
      errTagInUse: "This tag is already linked to another chart-of-accounts line",
      tagNone: "— no linkage —",
      tagHint: "Tag — a real value from the VA/RA directory (like PAYABLE_TO_CUSTOMER). One tag can be linked to only one chart-of-accounts line; group accounts have no tag",
      createIntro: "Category is inherited from the parent account and cannot be edited afterwards",
      editIntro: "Code and category cannot be edited",
    },
    actions: {
      create: "Create", save: "Save", deactivate: "Deactivate", activate: "Activate", archive: "Archive",
      addChild: "Create child sub-account",
      link: "Link account", unlink: "Unlink",
      linkTitle: "Link account", linkIntro: (tag) => `The selected account will get the tag "${tag}" — it will belong to this chart-of-accounts line`,
      linkedToast: "Account linked", noCandidates: "No accounts available to link",
      unlinkTitle: "Unlink account", unlinkText: (code) => `Account "${code}" will stop belonging to this chart-of-accounts line (the tag will be cleared)`,
      errNotFound: "Account not found",
      deactivateTitle: "Deactivate account", deactivateText: (name) => `Account "${name}" will stop accepting new entries. It can be reactivated later`,
      deactivateBlockedBalance: "Cannot deactivate an account with a non-zero balance",
      activateTitle: "Activate account", activateText: (name) => `Account "${name}" will accept entries again`,
      archiveTitle: "Archive account", archiveText: (name) => `Account "${name}" will stop showing in standard lists. Data is fully preserved`,
      archiveBlockedStatus: "Only an inactive account can be archived", archiveBlockedBalance: "Only an account with a zero balance can be archived",
      systemBlocked: "System account — status changes only ship as part of a release, not from the admin panel",
    },
    importExport: {
      importTitle: "Import chart of accounts", importHint: "CSV or Excel. \"Full replace\" mode is unavailable if entries already exist",
      importNote: "Import is a UI stub — file upload and parsing are not implemented in the prototype",
    },
  },
});
