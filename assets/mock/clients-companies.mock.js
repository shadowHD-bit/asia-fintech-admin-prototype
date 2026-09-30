/* ==========================================================================
   Моковые данные для "Клиенты → Компании".
   Форма строки — реальный JSON-ответ `companies` (получен от пользователя
   21.09.2026), обязательность полей — по факту чтения GraphQL-схемы
   (apps/companies/schema.graphql, apps/identity/schema.graphql) 21.09.2026:

   Гарантированно есть всегда (`!` в схеме): id, service, createdAt, updatedAt.
   Всё остальное формально nullable по схеме — НО `name` по факту (продуктовое
   решение, аналогично email у пользователей) всегда заполняется на создании
   компании, поэтому в моке считаем его гарантированным. `registeredBusinessName`
   (полное юр. название) — отдельное, честно опциональное поле: в реальном
   коде бэкенда даже два разных сервиса используют РАЗНЫЙ порядок фолбэка между
   ними (client-step.service.ts: registeredBusinessName ?? name;
   company-sanctions.service.ts: name ?? registeredBusinessName ?? tradingName).
   - `currentKYBLevelStatusV2` САМ ПО СЕБЕ nullable — у части компаний KYB
     может быть вообще не начат (поля нет, а не "статус пустой"). Раньше я
     генерировал его всегда — поправлено, часть записей теперь без него.
   - `companyType.description`, который был в первой версии мока, в реальной
     схеме НЕ СУЩЕСТВУЕТ — `CompanyType` содержит только `id` (без человеко-
     читаемого названия), поэтому это поле убрано из мока целиком — показывать
     по нему всё равно нечего.
   - taxId/taxNumber/inn в ответе `companies` нет вообще (бэкенд их не
     отдаёт этим запросом) — отсюда пустая колонка "Налоговый ID" в реальной
     админке. Вместо неё показываем businessPhone — оно реально запрашивается,
     но в реальной таблице нигде не выводится.
   - Статус — не плоское поле, а `currentKYBLevelStatusV2.status`, и там
     встречается значение REQUIRES_REVIEW — тот же общий статус-enum (7
     значений), что и у KYC, а не отдельный узкий KYBStepStatusEnum.
   ========================================================================== */

// Тот же общий статус-enum, что и KYC_STATUS_OPTIONS у пользователей —
// подтверждено значением REQUIRES_REVIEW в реальном ответе.
const KYB_STATUS_OPTIONS = ["SUCCESSFUL", "REJECTED", "PROCESSING", "PENDING", "REQUIRES_REVIEW", "REJECTED_RETRY", "NOT_CONNECTED"];

// kybConfig.name — подтверждено реальным значением "KYB L1 (screening)" для
// уровня 1; L2/L3 экстраполированы по тому же паттерну именования, сами
// названия не подтверждены отдельным примером.
const KYB_CONFIG_NAMES = ["KYB L1 (screening)", "KYB L2 (documents)", "KYB L3 (final review)"];

// Шаги внутри уровня KYB (currentKYBLevelStatusV2.stepStatuses[].kybStepConfig.step) —
// раньше тут были придуманные коды (DOCUMENTS/FINAL_REVIEW), которых в бэкенде
// не существует. По факту чтения кода 23.09.2026 нашёлся закрытый каталог всех
// возможных типов шага — libs/bank-core-common/lib/enums/kyb-step.enum.ts
// (KYBStepEnum, подтверждён Postgres-enum'ом kyb_steps_step_enum и тем, что у
// каждого из 7 кодов есть свой процессор в apps/identity/src/kyb/services/kyb-step.service.ts
// _stepProcessorsMap — ровно 7 штук, ни больше ни меньше):
//   SCREENING, SCORING, SUMSUB, ADMIN, REGISTER_BENEFICIARIES, ABS_CUSTOMER, OPEN_ACCOUNT
// Порядок и состав шагов — НЕ глобальный, а per-конфиг (kyb_step_configs.order,
// уникален в рамках kybConfig.id, обход строго последовательный: getNextStep ищет
// order-1) — то есть реальный список шагов для конкретных L1/L2/L3 живёт только
// в БД, не в коде. Подтверждён скриншотом только состав L1: SCREENING → ADMIN →
// OPEN_ACCOUNT. Составы L2/L3 ниже — правдоподобная экстраполяция (более полные
// уровни используют больше шагов из ТОГО ЖЕ реального каталога), но сами коды
// шагов теперь только из подтверждённого enum, ничего не выдумано.
const KYB_STEP_NAMES = {
  SCREENING: "Скрининг",
  SCORING: "Скоринг риска",
  SUMSUB: "Проверка Sumsub",
  ADMIN: "Проверка администратором",
  REGISTER_BENEFICIARIES: "Регистрация бенефициаров",
  ABS_CUSTOMER: "Регистрация клиента в АБС",
  OPEN_ACCOUNT: "Открытие счёта",
};

function kybStepDef(code) {
  return { step: code, name: KYB_STEP_NAMES[code] };
}

// Участники компании (вкладка "Сотрудники") — по факту чтения схемы companies (members.resolver.ts,
// members.service.ts) 30.09.2026:
// - member.id — суррогат членства, НЕ userId (одна строка = членство в одной компании; тот же человек
//   может быть участником нескольких компаний с разным type/accessRoles в каждой).
// - type (CompanyMemberTypeEnum) — кто человек юридически: ubo/shareholder/representative/director.
// - accessRoles — права ИМЕННО в этой компании, отдельный динамический словарь (CompanyAccessRoleEnum),
//   сид словаря в коде: COMPANY_REGISTRANT (полный доступ, выдаётся регистранту автоматически, компания
//   не может остаться без единого участника с этой ролью — инвариант _assertRegistrantsRemain),
//   COMPANY_PAYER (просмотр + платежи), COMPANY_VIEWER (только просмотр). Смена — только целиком
//   (updateCompanyMember({ accessRoles: [...] })), не add/remove по одной.
// - positions — свободный текст (должности), share — доля владения (только для ubo/shareholder).
const COMPANY_MEMBER_TYPES = ["director", "representative", "shareholder", "ubo"];
const COMPANY_ACCESS_ROLES = ["COMPANY_REGISTRANT", "COMPANY_PAYER", "COMPANY_VIEWER"];
const COMPANY_MEMBER_POSITIONS = ["Финансовый директор", "Главный бухгалтер", "Менеджер по продажам", "Технический директор", "Операционный директор"];

// member.id — суррогат (companyId:userId), не userId; opts переопределяет type/accessRoles/positions/share
// для детерминированной генерации (регистрант) или задаёт их явно (создание/добавление сотрудника вручную).
function coMakeMember(companyId, user, opts = {}) {
  return {
    id: `${companyId}:${user.id}`,
    userId: user.id,
    name: user.fullName || user.email,
    email: user.email,
    kycStatus: user.kycStatus,
    kycLevel: user.kycLevel,
    type: opts.type || COMPANY_MEMBER_TYPES[0],
    accessRoles: opts.accessRoles || [],
    positions: opts.positions || [],
    share: opts.share != null ? opts.share : null,
  };
}

const KYB_STEPS_BY_LEVEL = {
  1: ["SCREENING", "ADMIN", "OPEN_ACCOUNT"].map(kybStepDef),
  2: ["SCREENING", "SCORING", "ADMIN", "OPEN_ACCOUNT"].map(kybStepDef),
  3: ["SCREENING", "SCORING", "SUMSUB", "REGISTER_BENEFICIARIES", "ABS_CUSTOMER", "ADMIN", "OPEN_ACCOUNT"].map(kybStepDef),
};

const KYB_REJECTION_REASONS = ["Не совпадают учредительные документы", "Компания в санкционном списке", "Недостаточно данных о бенефициарах"];

// Проверки компании (query verificationChecks, судя по всему тот же тип VerificationCheck,
// что и у пользователей — clientId просто указывает на id компании вместо id пользователя;
// отдельного подтверждённого примера ответа для компании не было, набор checkType
// экстраполирован по аналогии с VERIFICATION_CHECKS_BY_LEVEL у пользователей).
const COMPANY_VERIFICATION_CHECK_STATUSES = ["PASSED", "FAILED", "ERROR", "RUNNING"];
const COMPANY_VERIFICATION_CHECKS_BY_LEVEL = {
  1: [
    { checkType: "SELF_CHECK_SANCTIONED_COMPANIES", provider: "SELF", name: "Проверка компании по санкционным спискам" },
    { checkType: "SELF_CHECK_BANNED_COUNTRIES", provider: "SELF", name: "Проверка по запрещённым странам" },
  ],
  2: [
    { checkType: "IDX_COMPANY_REGISTRY_LOOKUP", provider: "IDX", name: "Сверка с реестром юрлиц" },
    { checkType: "IDX_UBO_CHECK", provider: "IDX", name: "Проверка бенефициаров" },
  ],
  3: [
    { checkType: "PAYGINE_COMPANY_REGISTER", provider: "PAYGINE", name: "Регистрация компании в Paygine" },
  ],
};

// Company.service — обычная строка (нет закрытого enum на бэкенде), в
// реальных примерах встречен только один сервис.
const COMPANY_SERVICE_OPTIONS = ["ASIA_FINTECH"];

// sourceOfWealth (company.sourceOfWealth — string[]) — реальный список ключей
// найден 23.09.2026 в apps/companies/src/static-data/static-data.service.ts
// (getCommonStaticData().companySourcesOfWealth), не отдельный TS/GraphQL enum
// (на бэке это просто string[] без closed-enum), но сами значения подтверждены.
const COMPANY_SOURCE_OF_WEALTH_KEYS = [
  "employment_income", "annual_income", "fx_trading", "savings_deposit", "sales_shares_dividends",
  "matured_investment", "business_profit", "annual_profit_after_tax", "rental_income", "loan", "gift", "others",
];

// sourceOfFundsV2.key — реальный список найден там же (companySourcesOfFunds).
const COMPANY_SOURCE_OF_FUNDS_KEYS = [
  "revenue_business_activities", "commission_sales", "investment_capital", "dividend_income_share", "sales_goods_services", "others",
];

// companyType.item.name — реальное поле из пасенного запроса `company` (companyType
// { id item { name } } — как и у countryOfIncorporation, это ссылка на справочник,
// а не голый id, как считалось раньше). Подтверждено одно значение ("Corporation"),
// остальные — типовые для организационно-правовых форм, не подтверждены отдельно.
const COMPANY_TYPE_NAMES = ["Corporation", "LLC", "Sole Proprietorship", "Partnership"];

// companyOwnershipStructure — реальный закрытый enum, найден в коде 23.09.2026:
// apps/companies/src/companies/enums/company-ownership-structure.enum.ts
// (CompanyOwnershipStructureEnum = PUBLIC | PRIVATE) — раньше в моке было только
// подтверждённое скриншотом "PRIVATE", теперь используем оба реальных значения.
const COMPANY_OWNERSHIP_STRUCTURES = ["PRIVATE", "PUBLIC"];

// Валюты для paidUpShareCapital/annualTurnover (FinancialAmountType: amount +
// currency{ticker,symbol} — сама форма подтверждена чтением кода 23.09.2026,
// apps/companies/src/companies/graphql/types/financial-amount.type.ts; конкретный
// набор валют — не из справочника, просто несколько правдоподобных).
const COMPANY_FINANCE_CURRENCIES = [
  { ticker: "USD", symbol: "$" },
  { ticker: "EUR", symbol: "€" },
  { ticker: "KGS", symbol: "с" },
];

// totalNumberOfEmployees — подтверждено, что это просто String-поле на бэке (не
// число), по коду static-data предполагается, что оно заполняется из готового
// набора "бакетов", но сам список бакетов в коде не нашёлся — эти значения
// правдоподобны по смыслу, не подтверждены отдельным примером.
const COMPANY_EMPLOYEE_BUCKETS = ["1-10", "11-50", "51-200", "201-500", "500+"];

// Документы компании (23.09.2026, чтение кода): используется ТА ЖЕ сущность
// DocumentType/apps/identity/src/documents, что и у физлиц (clientId один и тот же
// столбец, различается только соседним clientType: INDIVIDUAL | CORPORATE —
// apps/identity/src/documents/entities/document.entity.ts, libs/bank-core-common/
// .../identity-connector/enums/indentity-type.enum.ts). DocumentStatusEnum/действия
// (изменить/добавить, без удаления) — те же самые, что и в clients-users.mock.js.
// Конкретные коды конфигов документов для юрлиц в коде не встретились (общий
// DocumentConfigCodeEnum общий на оба типа клиента, но какие именно значения
// используются для компаний — не подтверждено), поэтому берём правдоподобные по
// смыслу (учредительные документы), честно помечено как не подтверждено отдельно.
const COMPANY_DOCUMENT_CONFIGS = [
  { id: "cdc-reg-cert", name: "Свидетельство о регистрации", code: "COMPANY_REGISTRATION_CERT" },
  { id: "cdc-articles", name: "Устав компании", code: "ARTICLES_OF_ASSOCIATION" },
  { id: "cdc-ubo", name: "Декларация бенефициаров", code: "UBO_DECLARATION" },
];

// Адреса компании (23.09.2026, чтение кода): тот же Address/AddressClientUnion,
// что и у физлиц (apps/addresses/src/address — AddressClientUnion = Company | User,
// company.addresses — реальное resolveField в companies.resolver.ts). Категорий-
// enum'а для адресов нет вовсе (справочник category — свободная строка), но именно
// эти две встретились в коде как обязательные для компании: static-data.service.ts,
// companyAddressesRequiredCategories: ['REGISTERED', 'OPERATIONAL'].
const COMPANY_ADDRESS_CATEGORIES = ["REGISTERED", "OPERATIONAL"];

// businessActivities[].item.code/name — в реальном примере виден только код ("424"),
// человекочитаемое название кода не подтверждено, экстраполировано по смыслу ОКЭД/ОКВЭД.
const BUSINESS_ACTIVITY_CODES = [
  { code: "424", name: "Оптовая торговля металлами и металлическими рудами" },
  { code: "620", name: "Разработка компьютерного программного обеспечения" },
  { code: "451", name: "Торговля автотранспортными средствами" },
  { code: "691", name: "Деятельность в области права" },
  { code: "561", name: "Деятельность ресторанов и предприятий общественного питания" },
];

// additionalInfos (companyOnboardingStep/companyBranchesWithinCountry/companyBranchesOutsideCountry) —
// реальные поля из query `company.additionalInfos` (id/key/name/type/value) — общее
// key-value хранилище, здесь берём три ключа, которые видели в реальном примере.
// ВАЖНО: companyOnboardingStep — это НЕ шаги KYB (см. KYB_STEPS_BY_LEVEL выше, у
// них отдельный типизированный каталог KYBStepEnum) — это отдельное свободное
// строковое поле без закрытого enum на бэкенде (companies.service.ts пишет его
// через generic additionalInfo, а не через типизированную колонку). По факту
// чтения кода 23.09.2026 единственное подтверждённое значение, которое реально
// пишет код — COMPANY_DIRECTORS_VERIFICATION (и то только для service=FCB, не
// для ASIA_FINTECH), плюс COMPANY_REGISTRANT_INFO с реального скриншота
// (23.09.2026) — источник в коде для него не нашёлся, но раз это боевые данные,
// оставляем как есть. Других значений нет — не выдумываем.
const COMPANY_ONBOARDING_STEPS = ["COMPANY_REGISTRANT_INFO", "COMPANY_DIRECTORS_VERIFICATION"];

const COMPANY_NAME_STEMS = [
  "Silk Road Trading", "Bishkek Logistics", "Osh Textile Group", "Nomad Capital Partners",
  "Central Asia Export", "Ala-Too Commerce", "Tien Shan Holding", "Issyk-Kul Resort Management",
  "Kyrgyz Mining Corp", "Manas Development",
];
const COMPANY_LEGAL_SUFFIXES = ["ООО", "ОсОО", "LLC", "ЗАО"];

function pad2Companies(n) {
  return String(n).padStart(2, "0");
}

function formatCompanyDateTime(date) {
  return `${pad2Companies(date.getDate())}.${pad2Companies(date.getMonth() + 1)}.${String(date.getFullYear()).slice(2)} ${pad2Companies(date.getHours())}:${pad2Companies(date.getMinutes())}`;
}

// dd.mm.yyyy — для дат без времени (dateOfIncorporation).
function formatBirthDateCompanies(date) {
  return `${pad2Companies(date.getDate())}.${pad2Companies(date.getMonth() + 1)}.${date.getFullYear()}`;
}

// Косметика: id в реальном ответе — UUID (см. пример "7677f9b4-5b6f-4e60-909f-8a14804dfde7")
function seedToUuid(seed) {
  const hex = (n, len) => (n >>> 0).toString(16).padStart(len, "0").slice(-len);
  return `${hex(seed * 2654435761, 8)}-${hex(seed * 40503, 4)}-4${hex(seed * 2246822519, 3).slice(0, 3)}-8${hex(seed * 3266489917, 3).slice(0, 3)}-${hex(seed * 2246822519, 12)}`;
}

const CLIENTS_COMPANIES_MOCK = Array.from({ length: 26 }).map((_, i) => {
  const seed = i + 1;
  const stem = pick(COMPANY_NAME_STEMS, seed * 3);
  const legalSuffix = pick(COMPANY_LEGAL_SUFFIXES, seed);

  const createdDate = new Date(MOCK_NOW.getTime() - seed * 14.3 * 60 * 60 * 1000);
  const updatedDate = new Date(createdDate.getTime() + (5 + (seed % 70)) * 60 * 1000);

  const kybLevel = 1 + (seed % 3);
  const kybStatus = pick(KYB_STATUS_OPTIONS, seed * 5);
  const hasRisk = seed % 6 === 0;
  const isBlocked = seed % 11 === 0;

  // registeredBusinessName (полное юр. название) — честно опционально, у
  // части записей нет (как в реальном примере "рап"). name — всегда есть.
  const hasRegisteredName = seed % 3 !== 0;

  // currentKYBLevelStatusV2 сам по себе nullable — KYB мог быть ещё не начат
  const hasKybStatus = seed % 13 !== 0;

  // Прогресс по уровням KYB (kybLevelStatusesV2) — тот же паттерн, что и у
  // kycLevelStatuses пользователя: уровни ниже текущего пройдены, текущий несёт
  // статус самой записи.
  const kybLevelStatuses = !hasKybStatus
    ? []
    : [1, 2, 3].filter((lvl) => lvl <= kybLevel).map((lvl) => ({ level: lvl, status: lvl < kybLevel ? "SUCCESSFUL" : kybStatus }));

  // Шаги текущего уровня (currentKYBLevelStatusV2.stepStatuses) — шаги до текущего
  // пройдены, текущий несёт общий статус записи, дальше — не начаты (NOT_CONNECTED).
  const kybSteps = !hasKybStatus ? [] : KYB_STEPS_BY_LEVEL[kybLevel] || [];
  const kybCurrentStepIndex = kybSteps.length ? seed % kybSteps.length : 0;
  const kybStepStatuses = kybSteps.map((s, idx) => {
    let stepStatus;
    if (idx < kybCurrentStepIndex) stepStatus = "SUCCESSFUL";
    else if (idx === kybCurrentStepIndex) stepStatus = kybStatus;
    else stepStatus = "NOT_CONNECTED";
    const isRejected = stepStatus === "REJECTED" || stepStatus === "REJECTED_RETRY";
    return {
      step: s.step,
      name: s.name,
      status: stepStatus,
      rejectionReason: isRejected ? pick(KYB_REJECTION_REASONS, seed + idx) : null,
      comment: isRejected && seed % 2 === 0 ? "Требуется уточнение у клиента" : null,
    };
  });

  const checkConfigs = !hasKybStatus ? [] : COMPANY_VERIFICATION_CHECKS_BY_LEVEL[kybLevel] || [];
  const verificationChecks = checkConfigs.map((c, idx) => {
    const checkStatus = pick(COMPANY_VERIFICATION_CHECK_STATUSES, seed + idx * 7);
    const isBad = checkStatus === "ERROR" || checkStatus === "FAILED";
    const checkedAt = new Date(updatedDate.getTime() - (checkConfigs.length - idx) * 15 * 60 * 1000);
    const companyId = seedToUuid(seed);
    return {
      id: `cvc${seed.toString(16)}${idx}`,
      clientId: companyId,
      checkType: c.checkType,
      provider: c.provider,
      name: c.name,
      status: checkStatus,
      createdAt: checkedAt,
      updatedAt: checkedAt,
      errorMessage: isBad ? pick(KYB_REJECTION_REASONS, seed + idx) : null,
      verificationMessage: checkStatus === "PASSED" ? "Совпадений не найдено" : null,
      request: { clientId: companyId, checkType: c.checkType },
      response: isBad ? { status: "ERROR", message: "provider timeout" } : { status: checkStatus, clientRef: companyId },
    };
  });

  const businessActivity = pick(BUSINESS_ACTIVITY_CODES, seed);
  const countryOfIncorporationId = pick(COUNTRY_OPTIONS, seed + 1).id;

  // Документы — не у всех загружены полностью (как и у физлиц). Форма — 1-в-1
  // DocumentType (см. комментарий у COMPANY_DOCUMENT_CONFIGS выше).
  const documents =
    seed % 5 === 0
      ? []
      : COMPANY_DOCUMENT_CONFIGS.slice(0, 1 + (seed % COMPANY_DOCUMENT_CONFIGS.length)).map((cfg, idx) => {
          const docSeed = seed + idx;
          const docStatus = pick(DOCUMENT_STATUSES, docSeed);
          const isRejected = docStatus === "REJECTED" || docStatus === "REJECTED_RETRY";
          const fileId = `cf${seed.toString(16)}${idx}`;
          return {
            id: `cd${seed.toString(16)}${idx}`,
            config: cfg,
            countryId: countryOfIncorporationId,
            status: docStatus,
            isActive: docSeed % 7 !== 0,
            rejectTags: isRejected ? [pick(DOCUMENT_REJECT_TAGS, docSeed)] : [],
            externalRejectReasons: isRejected ? pick(KYB_REJECTION_REASONS, docSeed) : null,
            createdAt: new Date(createdDate.getTime() + (idx + 1) * 20 * 60 * 1000),
            updatedAt: new Date(updatedDate.getTime() - idx * 5 * 60 * 1000),
            files: [
              {
                id: fileId,
                url: `https://picsum.photos/seed/${fileId}/480/320`,
                mimetype: "image/jpeg",
                originalName: `${cfg.code.toLowerCase()}_${seed}.jpg`,
                size: String(180000 + docSeed * 3721),
              },
            ],
          };
        });

  // Адреса — REGISTERED всегда есть (юридический адрес обязателен для регистрации
  // компании), OPERATIONAL — не у всех (реально ведёт деятельность не всегда по
  // другому адресу).
  const addresses = [
    { category: "REGISTERED", countryId: countryOfIncorporationId, city: pick(CITY_NAMES, seed), street: `ул. Юридическая, ${seed}`, postalCode: `7200${seed % 10}` },
    ...(seed % 2 === 0
      ? [{ category: "OPERATIONAL", countryId: pick(COUNTRY_OPTIONS, seed + 3).id, city: pick(CITY_NAMES, seed + 1), street: seed % 4 === 0 ? null : `ул. Рабочая, ${seed + 5}`, postalCode: null }]
      : []),
  ];

  // Финансовые поля (FinancialAmountType/строки — см. комментарии у констант выше).
  const shareCapitalCurrency = pick(COMPANY_FINANCE_CURRENCIES, seed);
  const turnoverCurrency = pick(COMPANY_FINANCE_CURRENCIES, seed + 1);
  const dateOfIncorporationDate = new Date(1995 + (seed % 29), seed % 12, 1 + (seed % 27));

  // sourceOfWealth/sourceOfFundsV2 — честно опциональны (не у всех заполнены на
  // момент онбординга). detailsSourceOfWealth — разбивка суммы по конкретному
  // источнику (реальная форма: amount + sourceOfWealth(key) + currency), берём
  // ровно один источник из sourceOfWealth, если он есть.
  const hasSourceOfWealth = seed % 4 !== 0;
  const sourceOfWealthKey = hasSourceOfWealth ? pick(COMPANY_SOURCE_OF_WEALTH_KEYS, seed) : null;
  const sourceOfWealth = hasSourceOfWealth ? [sourceOfWealthKey] : [];
  const hasSourceOfFunds = seed % 3 !== 0;
  const sourceOfFundsV2 = hasSourceOfFunds ? [{ key: pick(COMPANY_SOURCE_OF_FUNDS_KEYS, seed + 2), value: null }] : [];
  const detailsSourceOfWealthCurrency = pick(COMPANY_FINANCE_CURRENCIES, seed + 2);
  const detailsSourceOfWealth = hasSourceOfWealth
    ? [{ amount: String(500 + seed * 71), sourceOfWealth: sourceOfWealthKey, currency: detailsSourceOfWealthCurrency }]
    : [];

  // incomingPaymentsByCountries/outgoingPaymentsByCountries — реальные поля,
  // подтверждены пасенным запросом `company` (businessActivity{item{code,name}},
  // country{item{name}}, percentage). Не у всех компаний заполнены — это
  // отдельная админская форма ("Добавить новый"), логично, что у части пусто.
  const incomingPaymentsByCountries =
    seed % 3 !== 0
      ? [{ countryId: countryOfIncorporationId, businessActivity: pick(BUSINESS_ACTIVITY_CODES, seed + 4), percentage: 20 + (seed % 8) * 10 }]
      : [];
  const outgoingPaymentsByCountries =
    seed % 4 === 0
      ? [{ countryId: pick(COUNTRY_OPTIONS, seed + 5).id, businessActivity: pick(BUSINESS_ACTIVITY_CODES, seed + 6), percentage: 30 + (seed % 6) * 10 }]
      : [];

  return {
    id: seedToUuid(seed),
    code: entityCode("CMP", seed),
    createdDate,
    updatedDate,
    createdAt: formatCompanyDateTime(createdDate),
    updatedAt: formatCompanyDateTime(updatedDate),
    service: pick(COMPANY_SERVICE_OPTIONS, seed),
    name: `${stem} ${seed}`,
    registeredBusinessName: hasRegisteredName ? `Общество с ограниченной ответственностью "${stem}"` : null,
    tradingName: stem,
    type: null,
    countryOfIncorporationId,
    companyTypeName: pick(COMPANY_TYPE_NAMES, seed),
    companyOwnershipStructure: pick(COMPANY_OWNERSHIP_STRUCTURES, seed),
    businessActivities: [businessActivity],
    registrationNumber: seed % 7 === 0 ? null : `19220${1 + (seed % 9)}-3301-${legalSuffix}`,
    businessEmail: seed % 4 === 0 ? null : `office${seed}@${stem.toLowerCase().replace(/[^a-z]+/g, "")}.com`,
    businessPhone: seed % 3 === 0 ? null : `+996${String(500000000 + seed * 977).slice(0, 9)}`,
    website: seed % 4 === 0 ? null : `https://${stem.toLowerCase().replace(/[^a-z]+/g, "")}.com`,
    faxNumber: seed % 6 === 0 ? `+996${String(312000000 + seed * 331).slice(0, 9)}` : null,
    taxNumber: seed % 3 === 0 ? null : `${20000000000 + seed * 91771}`,
    dateOfIncorporation: dateOfIncorporationDate,
    dateOfIncorporationLabel: formatBirthDateCompanies(dateOfIncorporationDate),
    totalNumberOfEmployees: pick(COMPANY_EMPLOYEE_BUCKETS, seed),
    paidUpShareCapital: seed % 5 === 0 ? null : { amount: String(10000 + seed * 3417), currency: shareCapitalCurrency },
    annualTurnover: seed % 4 === 0 ? null : { amount: String(120000 + seed * 51823), currency: turnoverCurrency },
    sourceOfWealth,
    sourceOfFundsV2,
    detailsSourceOfWealth,
    incomingPaymentsByCountries,
    outgoingPaymentsByCountries,
    documents,
    addresses,
    additionalInfos: [
      { key: "companyOnboardingStep", value: pick(COMPANY_ONBOARDING_STEPS, seed) },
      { key: "companyBranchesWithinCountry", value: String(seed % 4) },
      { key: "companyBranchesOutsideCountry", value: String(seed % 3) },
    ],
    kybLevel: hasKybStatus ? kybLevel : null,
    kybConfigName: hasKybStatus ? KYB_CONFIG_NAMES[kybLevel - 1] : null,
    kybLevelStatuses,
    kybStepStatuses,
    verificationChecks,
    currentKYBLevelStatusV2: hasKybStatus
      ? {
          status: kybStatus,
          currentStep: { status: kybStatus },
          kybConfig: { id: `kc-${kybLevel}`, name: KYB_CONFIG_NAMES[kybLevel - 1] },
        }
      : null,
    scoringRiskLevel: hasRisk ? pick(SCORING_RISK_LEVELS, seed) : null,
    blockReasons: isBlocked ? ["Подозрительная активность"] : null,
  };
});

// Довязка карточки клиента → реальные компании: clients-users.mock.js (грузится
// первым) знает только роль в user.linkedCompanies — id/name/kybStatus/
// scoringRiskLevel берём отсюда, из настоящих записей CLIENTS_COMPANIES_MOCK,
// а не выдумываем отдельно, чтобы переход по ссылке вёл на реальную карточку.
CLIENTS_USERS_MOCK.forEach((user, userIdx) => {
  user.linkedCompanies.forEach((link, linkIdx) => {
    const company = CLIENTS_COMPANIES_MOCK[(userIdx * 2 + linkIdx) % CLIENTS_COMPANIES_MOCK.length];
    link.id = company.id;
    link.name = company.name;
    link.kybStatus = company.currentKYBLevelStatusV2 ? company.currentKYBLevelStatusV2.status : null;
    link.scoringRiskLevel = company.scoringRiskLevel;
  });
});

// Обратная связь: участники компании (вкладка "Сотрудники" на карточке компании, вкладка "Компании" на
// карточке физлица). Реальный запрос `company` списка участников не отдаёт (только registrant{id}) — но
// отдельные запросы companyMembers/myCompanyMembers (apps/companies members.resolver.ts) отдают полную
// per-company модель членства (type/accessRoles/positions/share, см. coMakeMember выше), поэтому строим
// то же ребро user↔company, что уже есть в user.linkedCompanies, но с реальными по форме полями, не только
// id/имя. Тип и доступ — детерминированно по seed, без реальных данных на конкретного человека (их и не
// может быть — сид общий, не привязан к конкретной компании).
CLIENTS_COMPANIES_MOCK.forEach((company) => {
  company.members = [];
});
CLIENTS_USERS_MOCK.forEach((user, userIdx) => {
  user.linkedCompanies.forEach((link, linkIdx) => {
    const company = CLIENTS_COMPANIES_MOCK.find((c) => c.id === link.id);
    if (!company || company.members.some((m) => m.userId === user.id)) return;
    const seed = userIdx * 3 + linkIdx;
    company.members.push(
      coMakeMember(company.id, user, {
        type: pick(COMPANY_MEMBER_TYPES, seed + 1),
        accessRoles: seed % 4 === 0 ? [] : seed % 4 === 1 ? ["COMPANY_VIEWER"] : ["COMPANY_PAYER"],
        positions: seed % 3 === 0 ? [pick(COMPANY_MEMBER_POSITIONS, seed)] : [],
        share: seed % 5 === 0 ? 10 + (seed % 40) : null,
      })
    );
  });
});

// registrant — реальное поле схемы (company.registrant.id), не nullable по факту (компанию регистрирует
// конкретный пользователь); строка члена регистранта создаётся в той же транзакции, что и сама компания,
// с accessRoles: ['COMPANY_REGISTRANT'] (документ HOW_IT_WORKS.md, раздел 5) — инвариант: у компании всегда
// есть хотя бы один участник с этой ролью. Отдельной сущности "кто именно регистрировал" в моке нет — берём
// первого участника, а если участников нет вовсе, пользователя по seed (реальная запись CLIENTS_USERS_MOCK).
CLIENTS_COMPANIES_MOCK.forEach((company, idx) => {
  const registrantUser = company.members[0] ? CLIENTS_USERS_MOCK.find((u) => u.id === company.members[0].userId) : CLIENTS_USERS_MOCK[idx % CLIENTS_USERS_MOCK.length];
  company.registrant = { id: registrantUser.id, name: registrantUser.fullName || registrantUser.email };
  const existing = company.members.find((m) => m.userId === registrantUser.id);
  if (existing) existing.accessRoles = [...new Set([...existing.accessRoles, "COMPANY_REGISTRANT"])];
  else company.members.unshift(coMakeMember(company.id, registrantUser, { type: "representative", accessRoles: ["COMPANY_REGISTRANT"] }));
});
