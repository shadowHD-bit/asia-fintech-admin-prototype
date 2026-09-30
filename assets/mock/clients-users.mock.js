/* ==========================================================================
   Моковые данные для "Клиенты → Пользователи".
   Список (таблица) повторяет поля запроса `users` (FindUsersV2Input).
   Карточка клиента — поля запроса `findUser` (FindUserInput), полный пример
   ответа проверен и сверен 1-в-1 с реальным бэкендом 18.09.2026 — см.
   memory/backend_users_query.md. Полей, которых нет ни в одном из этих двух
   запросов, здесь намеренно нет.
   ========================================================================== */

// Небольшой набор стран — с флагами в том же паттерне, что и переключатель языка.
const COUNTRY_OPTIONS = [
  {
    id: "kg",
    code: "KG",
    name: "Кыргызстан",
    flag: `<svg viewBox="0 0 20 14" width="100%" height="100%"><rect width="20" height="14" fill="#e8112d"/><circle cx="10" cy="7" r="3.4" fill="#fdef42"/><circle cx="10" cy="7" r="1.3" fill="none" stroke="#e8112d" stroke-width="0.5"/></svg>`,
  },
  {
    id: "kz",
    code: "KZ",
    name: "Казахстан",
    flag: `<svg viewBox="0 0 20 14" width="100%" height="100%"><rect width="20" height="14" fill="#00afca"/><circle cx="10" cy="7" r="3" fill="#fec50c"/></svg>`,
  },
  {
    id: "uz",
    code: "UZ",
    name: "Узбекистан",
    flag: `<svg viewBox="0 0 20 14" width="100%" height="100%"><rect width="20" height="4.3" y="0" fill="#0099b5"/><rect width="20" height="4.3" y="4.85" fill="#fff"/><rect width="20" height="4.3" y="9.7" fill="#1eb53a"/><rect width="20" height="0.55" y="4.3" fill="#ce1126"/><rect width="20" height="0.55" y="9.15" fill="#ce1126"/></svg>`,
  },
  {
    id: "tj",
    code: "TJ",
    name: "Таджикистан",
    flag: `<svg viewBox="0 0 20 14" width="100%" height="100%"><rect width="20" height="4.3" y="0" fill="#cc0000"/><rect width="20" height="5.4" y="4.3" fill="#fff"/><rect width="20" height="4.3" y="9.7" fill="#006600"/></svg>`,
  },
  {
    id: "ru",
    code: "RU",
    name: "Россия",
    flag: `<svg viewBox="0 0 20 14" width="100%" height="100%"><rect width="20" height="14" fill="#fff"/><rect y="4.67" width="20" height="9.33" fill="#0039A6"/><rect y="9.33" width="20" height="4.67" fill="#D52B1E"/></svg>`,
  },
  {
    id: "az",
    code: "AZ",
    name: "Азербайджан",
    flag: `<svg viewBox="0 0 20 14" width="100%" height="100%"><rect width="20" height="4.67" y="0" fill="#00b9e4"/><rect width="20" height="4.67" y="4.67" fill="#e4312b"/><rect width="20" height="4.67" y="9.33" fill="#00af66"/></svg>`,
  },
];

function findCountry(id) {
  return COUNTRY_OPTIONS.find((c) => c.id === id) || null;
}

const SERVICE_OPTIONS = ["ASIA_FINTECH", "ASIA_FINTECH_KYC_IN_KYB"];

// KYCStepStatusEnum — из libs/bank-core-common/lib/enums/kyc-step-status.enum.ts
const KYC_STATUS_OPTIONS = [
  "SUCCESSFUL",
  "REJECTED",
  "PROCESSING",
  "PENDING",
  "REQUIRES_REVIEW",
  "REJECTED_RETRY",
  "NOT_CONNECTED",
];

const KYC_CONFIG_NAMES = ["Level 1", "Level 2", "Level 3", "ASIA_FINTECH_KYC_IN_KYB"];

// kycConfig.level + availableFeatures — из currentKYCLevelStatusV2.kycConfig в findUser
const KYC_LEVEL_BY_CONFIG_NAME = { "Level 1": 1, "Level 2": 2, "Level 3": 3, ASIA_FINTECH_KYC_IN_KYB: null };
const KYC_FEATURES_BY_LEVEL = {
  1: ["Приём и отправка платежей в криптовалюте"],
  2: ["Приём и отправка платежей в криптовалюте", "Фиатные платежи и переводы"],
  3: ["Приём и отправка платежей в криптовалюте", "Криптоэквайринг", "P2P-переводы", "Переводы по СБП"],
  null: ["Операции в рамках компании (KYB)"],
};

// Шаги внутри каждого уровня — имена и порядок как в реальном KYC-флоу
// (apps/identity/src/kyc, см. разбор в переписке про KYC-уровни).
const KYC_STEPS_BY_LEVEL = {
  1: [
    { step: "BB_MANUAL_PII", name: "Базовая анкета" },
    { step: "BB_CHECKS", name: "Проверка по спискам" },
  ],
  2: [
    { step: "BB_ID_DOC_COUNTRY", name: "Определение страны документа" },
    { step: "BB_MANUAL", name: "Ручная проверка паспорта" },
    { step: "BB_MANUAL_CHECKS", name: "Автоматические проверки" },
  ],
  3: [
    { step: "PAYGINE_PHONE", name: "Привязка телефона Paygine" },
    { step: "PAYGINE_UPRID", name: "УПРИД (проверка паспорта)" },
  ],
};

const REJECTION_REASONS = ["Некачественное фото документа", "Данные не совпадают с документом", "Истёк срок действия документа"];

// Проверки верификации (query verificationChecks, filter clientIds: [user.id]) — отдельная
// от шагов KYC сущность: технические вызовы внешних провайдеров/самопроверок, статус
// (VerificationCheckStatusEnum) независим от статуса шага KYC. checkType — реальный
// VerificationCheckTypeEnum, provider — VerificationCheckProviderEnum.
const VERIFICATION_CHECK_STATUSES = ["PASSED", "FAILED", "ERROR", "RUNNING"];
const VERIFICATION_CHECKS_BY_LEVEL = {
  1: [
    { checkType: "SELF_CHECK_BANNED_COUNTRIES", provider: "SELF", name: "Проверка по запрещённым странам" },
    { checkType: "SELF_CHECK_SANCTIONED_INDIVIDUALS", provider: "SELF", name: "Проверка по санкционным спискам" },
  ],
  2: [
    { checkType: "IDX_PARSE_AUTO_PASSPORT", provider: "IDX", name: "Автоматический разбор паспорта" },
    { checkType: "IDX_COMPARE_LIVENESS", provider: "IDX", name: "Сравнение с лайвнес-фото" },
    { checkType: "IDX_PASSPORT_COMPLEX_CHECK", provider: "IDX", name: "Комплексная проверка паспорта" },
  ],
  3: [
    { checkType: "PAYGINE_REGISTER", provider: "PAYGINE", name: "Регистрация клиента в Paygine" },
    { checkType: "PAYGINE_CHECK_PHONE", provider: "PAYGINE", name: "Проверка телефона" },
    { checkType: "PAYGINE_UPRID_START", provider: "PAYGINE", name: "Запуск УПРИД" },
  ],
};
// ScoringRiskLevelEnum — полный реальный список из 5 значений (проверено
// чтением бэкенда): LOW_RISK | MEDIUM_RISK | HIGH_RISK | VERY_HIGH_RISK | PROHIBITED_RISK.
const SCORING_RISK_LEVELS = ["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK", "VERY_HIGH_RISK", "PROHIBITED_RISK"];

// Документы верификации (DocumentType, apps/identity/src/documents) — реальная модель:
// status — прямое поле (DocumentStatusEnum), не производная; DocumentConfig — шаблон
// типа документа (name/code/доступные страны), DocumentRejectTag — предустановленные
// причины отклонения (rejectTags), плюс свободный текст (externalRejectReasons).
const DOCUMENT_STATUSES = ["NOT_REVIEWED", "REJECTED", "REJECTED_RETRY", "APPROVED"];
const DOCUMENT_REJECT_TAGS = [
  "Некачественное фото документа",
  "Данные не совпадают с документом",
  "Истёк срок действия документа",
  "Подозрение на подделку",
  "Неполный комплект файлов",
];
// code — реальный DocumentConfigCodeEnum; countryIds: null — конфиг доступен для любой страны.
const DOCUMENT_CONFIGS = [
  { id: "dc-passport-rus", name: "Russian Passport", code: "PASSPORT_RUS", countryIds: ["ru"] },
  { id: "dc-passport", name: "Паспорт", code: "PASSPORT", countryIds: ["kg", "kz", "uz", "tj", "az"] },
  { id: "dc-selfie", name: "Селфи с документом", code: "SELFIE_WITH_DOC", countryIds: null },
  { id: "dc-idcard", name: "ID Card", code: "ID_CARD", countryIds: null },
];

const FIRST_NAMES = [
  "Медер", "Тилек", "Айбек", "Нурбек", "Эрлан", "Джамиля", "Айгерим", "Гульнара",
  "Санжар", "Бакыт", "Азамат", "Чолпон", "Динара", "Рустам", "Асель",
];
const LAST_NAMES = [
  "Сыраков", "Ибраимов", "Асанов", "Турсунов", "Молдогазиев", "Кадыров",
  "Жумабеков", "Оморов", "Бекешов", "Токтосунов",
];
const CITY_NAMES = ["Бишкек", "Ош", "Алматы", "Ташкент", "Душанбе", "Москва", "Баку"];

function pick(arr, seed) {
  return arr[seed % arr.length];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// dd.mm.yy hh:mm — формат из референс-скриншота ("18.09.26 15:46")
function formatDateTime(date) {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${String(date.getFullYear()).slice(2)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

const MOCK_NOW = new Date(2026, 8, 18, 16, 0); // 18 сентября 2026, для стабильности между перезагрузками

// Короткий читаемый код сущности — не поле бэкенда (там первичный id — UUID, cм. seedToPaymentUuid), а витринный
// код для UI и копирования, тот же приём, что уже был у OTC-сделок (referenceNumber, mock/otc-deals.mock.js) и
// аудит-логов (auLogCode, views/security-audit-logs.js): префикс сущности + 12 hex-символов, детерминированно
// по seed (тот же алгоритм, что у cwHex, operations-payments.mock.js — здесь отдельная копия, потому что этот
// файл грузится первым и cwHex к этому моменту ещё не объявлена). Определена здесь, а не в каждом моке отдельно,
// чтобы код у всех сущностей был по одной и той же схеме; используется как ОСНОВНОЙ отображаемый id — в списках,
// на карточках, при копировании, — реальный uuid (entity.id) в этом качестве больше нигде не показываем.
function entityCode(prefix, seed, len = 12) {
  let s = "";
  let x = (seed * 2654435761) >>> 0;
  while (s.length < len) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    s += x.toString(16).padStart(8, "0");
  }
  return `${prefix}-${s.slice(0, len).toUpperCase()}`;
}

// 34 записи, разнесённые по последним ~3 неделям — этого достаточно, чтобы
// фильтры по датам и пагинация (при 10/20 на страницу) вели себя осмысленно.
const CLIENTS_USERS_MOCK = Array.from({ length: 34 }).map((_, i) => {
  const seed = i + 1;
  const first = pick(FIRST_NAMES, seed);
  const last = pick(LAST_NAMES, seed * 3);
  const middle = seed % 4 === 0 ? `${pick(FIRST_NAMES, seed + 1)}ович` : null;
  const status = pick(KYC_STATUS_OPTIONS, seed * 5);
  const country = seed % 6 === 0 ? null : findCountry(pick(COUNTRY_OPTIONS, seed).id);
  const kycConfigName = pick(KYC_CONFIG_NAMES, seed * 2);
  const kycLevel = KYC_LEVEL_BY_CONFIG_NAME[kycConfigName];

  const createdDate = new Date(MOCK_NOW.getTime() - seed * 9.7 * 60 * 60 * 1000);
  const updatedDate = new Date(createdDate.getTime() + (4 + (seed % 50)) * 60 * 1000);
  const birthDate = new Date(1978 + (seed % 26), seed % 12, 1 + (seed % 27));

  // У asia-fintech форма регистрации собирает только email (см. реальный экран
  // "Данные аккаунта") — email обязателен всегда, телефон опционален.
  const email = `user${seed}@fexpost.com`;
  const phone = seed % 4 === 0 ? null : `+7901${String(1000000 + seed * 137).slice(0, 7)}`;

  const placeOfBirthCountry = pick(COUNTRY_OPTIONS, seed + 2);
  const nationalityCountryId = seed % 3 === 0 ? (country ? country.id : null) : null;

  // blockReasons — как в реальном ответе: null у активных, массив причин у заблокированных
  const isBlocked = seed % 9 === 0;
  const blockReasons = isBlocked ? ["Подозрительная активность"] : null;

  // Прогресс по уровням KYC (kycLevelStatusesV2) — уровни ниже текущего пройдены,
  // текущий несёт статус самой записи
  const kycLevelStatuses =
    kycLevel == null
      ? []
      : [1, 2, 3]
          .filter((lvl) => lvl <= kycLevel)
          .map((lvl) => ({
            level: lvl,
            name: `Level ${lvl}`,
            status: lvl < kycLevel ? "SUCCESSFUL" : status,
          }));

  // Детальная история шагов ТЕКУЩЕГО уровня (currentKYCLevelStatusV2.stepStatuses) —
  // шаги до текущего пройдены, текущий несёт общий статус записи, дальше — не начаты.
  const kycSteps = kycLevel == null ? [] : KYC_STEPS_BY_LEVEL[kycLevel] || [];
  const currentStepIndex = kycSteps.length ? seed % kycSteps.length : 0;
  const kycStepStatuses = kycSteps.map((s, idx) => {
    let stepStatus;
    if (idx < currentStepIndex) stepStatus = "SUCCESSFUL";
    else if (idx === currentStepIndex) stepStatus = status;
    else stepStatus = "NOT_CONNECTED";

    const isRejected = stepStatus === "REJECTED" || stepStatus === "REJECTED_RETRY";
    const executed = idx <= currentStepIndex ? new Date(updatedDate.getTime() - (kycSteps.length - idx) * 40 * 60 * 1000) : null;
    const processed = executed && (stepStatus === "SUCCESSFUL" || isRejected) ? new Date(executed.getTime() + 5 * 60 * 1000) : null;

    return {
      step: s.step,
      name: s.name,
      status: stepStatus,
      executedAt: executed,
      processedAt: processed,
      rejectionReason: isRejected ? pick(REJECTION_REASONS, seed + idx) : null,
      comment: isRejected && seed % 2 === 0 ? "Требуется повторная загрузка документа" : null,
    };
  });

  // scoringProfile (personal.scoringProfile) — у большинства пусто/false, у части — заполнено
  const hasRiskFlags = seed % 6 === 0;
  const scoringProfile = {
    scoringRiskLevel: hasRiskFlags ? pick(SCORING_RISK_LEVELS, seed) : null,
    isPep: seed % 11 === 0,
    isUsa: seed % 13 === 0,
    isFamilyMemberPep: seed % 17 === 0,
    sanctionList: seed % 19 === 0,
    adverseMedia: seed % 15 === 0,
    totalScore: hasRiskFlags ? 20 + (seed % 60) : null,
  };

  const addresses = [
    {
      category: "birth_place",
      countryId: placeOfBirthCountry.id,
      city: pick(CITY_NAMES, seed + 4),
      street: null,
      postalCode: null,
    },
    ...(country
      ? [
          {
            category: "residential",
            countryId: country.id,
            city: pick(CITY_NAMES, seed),
            street: seed % 3 === 0 ? null : `ул. Тестовая, ${seed}`,
            postalCode: seed % 5 === 0 ? `7200${seed % 10}` : null,
          },
        ]
      : []),
  ];

  // Привязанные компании (CompanyMember: user ↔ company) — не у всех. Должность/роль
  // участника запросом не отдаётся, поэтому здесь только количество записей-заглушек;
  // id/name/kybStatus/scoringRiskLevel реальной компании подставляются позже, в
  // clients-companies.mock.js (грузится вторым и линкует на настоящие записи
  // CLIENTS_COMPANIES_MOCK, а не выдуманные имена).
  const linkedCompanies =
    seed % 3 === 0
      ? [
          {},
          ...(seed % 9 === 0 ? [{}] : []),
        ]
      : [];

  // Документы верификации — не у всех загружены полностью. status — прямое поле
  // (DocumentStatusEnum), rejectTags/externalRejectReasons заполнены только при отклонении.
  const documents =
    seed % 5 === 0
      ? []
      : DOCUMENT_CONFIGS.slice(0, 1 + (seed % DOCUMENT_CONFIGS.length)).map((cfg, idx) => {
          const docSeed = seed + idx;
          const status = pick(DOCUMENT_STATUSES, docSeed);
          const isRejected = status === "REJECTED" || status === "REJECTED_RETRY";
          const fileId = `f${seed.toString(16)}${idx}`;

          return {
            id: `d${seed.toString(16)}${idx}`,
            config: cfg,
            countryId: cfg.countryIds ? cfg.countryIds[0] : (country || placeOfBirthCountry).id,
            status,
            isActive: docSeed % 7 !== 0,
            rejectTags: isRejected ? [pick(DOCUMENT_REJECT_TAGS, docSeed)] : [],
            externalRejectReasons: isRejected ? pick(REJECTION_REASONS, docSeed) : null,
            createdAt: new Date(createdDate.getTime() + (idx + 1) * 20 * 60 * 1000),
            updatedAt: new Date(updatedDate.getTime() - idx * 5 * 60 * 1000),
            // files — федеративная ссылка на File (files-api): id/url/mimetype/originalName/size
            // реальны, url — плейсхолдер (в прототипе нет своего файлового сервера).
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

  const userId = `${seed.toString(16).padStart(4, "0")}${(seed * 97).toString(16)}_${(seed * 13).toString(16)}`;

  // Проверки текущего уровня — статус проверки самостоятельный (не производный от статуса
  // шага), errorMessage/response с ошибкой только при ERROR/FAILED.
  const checkConfigs = kycLevel == null ? [] : VERIFICATION_CHECKS_BY_LEVEL[kycLevel] || [];
  const verificationChecks = checkConfigs.map((c, idx) => {
    const checkStatus = pick(VERIFICATION_CHECK_STATUSES, seed + idx * 7);
    const isBad = checkStatus === "ERROR" || checkStatus === "FAILED";
    const checkedAt = new Date(updatedDate.getTime() - (checkConfigs.length - idx) * 15 * 60 * 1000);

    return {
      id: `vc${seed.toString(16)}${idx}`,
      clientId: userId,
      checkType: c.checkType,
      provider: c.provider,
      name: c.name,
      status: checkStatus,
      createdAt: checkedAt,
      updatedAt: checkedAt,
      errorMessage: isBad ? pick(REJECTION_REASONS, seed + idx) : null,
      verificationMessage: checkStatus === "PASSED" ? "Совпадений не найдено" : null,
      request: { clientId: userId, checkType: c.checkType },
      response: isBad
        ? { status: "ERROR", message: "provider timeout" }
        : { status: checkStatus, clientRef: userId, hasPersonalData: true },
    };
  });

  // Счета клиента (виртуальные/реальные) сюда НЕ генерируются — они уже есть в
  // ACCOUNTS_VIRTUAL_MOCK/ACCOUNTS_REAL_MOCK (assets/mock/accounts.mock.js,
  // грузится позже и сам линкует счета на этого клиента через accClientRef(seed),
  // см. getClientVirtualAccounts/getClientRealAccounts в views/clients-users.js).
  // Так счёт из вкладки клиента и счёт в общем разделе "Счета" — одна и та же
  // запись, и переход по ссылке ведёт на реальную страницу счёта.
  return {
    id: userId,
    code: entityCode("USR", seed),
    createdDate,
    updatedDate,
    createdAt: formatDateTime(createdDate),
    updatedAt: formatDateTime(updatedDate),
    service: pick(SERVICE_OPTIONS, seed),
    fullName: `${last} ${first}${middle ? ` ${middle}` : ""}`,
    firstName: first,
    lastName: last,
    middleName: middle,
    email,
    phone,
    phoneSbp: phone && seed % 2 === 0 ? phone : null,
    gender: seed % 2 === 0 ? "MALE" : "FEMALE",
    birthDate,
    tin: seed % 3 === 0 ? null : String(300000000000 + seed * 9973),
    placeOfBirthCountryId: placeOfBirthCountry.id,
    nationalityCountryId,
    residenceCountryId: country ? country.id : null,
    addresses,
    kycConfigName,
    kycLevel,
    kycStatus: status,
    kycLevelStatuses,
    kycStepStatuses,
    verificationChecks,
    blockReasons,
    scoringProfile,
    linkedCompanies,
    documents,
  };
});
