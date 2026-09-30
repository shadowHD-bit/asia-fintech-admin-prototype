/* ==========================================================================
   Моковые данные для "Настройки системы → Верификации": конфигурации KYC (с шагами),
   конфигурации документов (с полями), категории адресов.
   Спецификация: docs/settings-verifications-spec.md.
   Реальное: формы записей (KYCConfig, KYCStepConfig, DocumentConfig,
   DocumentFieldConfig, AddressCategory), значения KYCStepEnum, KYCStepStatus,
   DocumentFieldType, коды конфигураций документов (DocumentConfigCodeEnum), ключи
   полей документов, версионирование (новая запись с тем же уровнем и сервисом /
   тем же названием становится версией N+1, предыдущая неактивна), шаги 5 конфигураций
   и названия категорий адресов из текущей админки, содержимое provider_config
   типовых шагов.
   Условное: ID, даты, тексты возможностей и обязательных действий, описания полей,
   часть конфигураций документов, число стран (в моке 6 стран вместо 248).
   Клиенты на конфигурациях взяты из мока "Клиенты → Пользователи".
   Должен загружаться после clients-users.mock.js.
   ========================================================================== */

// KYCStepEnum (схема identity + значения PAYGINE_* из кода)
const VF_STEP_KINDS = [
  "BB_MANUAL_PII", "BB_CHECKS", "BB_ID_DOC_COUNTRY", "BB_MANUAL", "BB_MANUAL_CHECKS", "BB_SUMSUB", "BB_SUMSUB_CHECKS", "BB_SBP",
  "PAYGINE_PHONE", "PAYGINE_UPRID", "PAYGINE_ESIA", "ADMIN", "SCREENING", "SCORING", "SUMSUB", "BB_SUMSUB_DIRECT", "BITRIX", "ABS_CUSTOMER",
];
const VF_KYC_STEP_STATUSES = ["NOT_CONNECTED", "PENDING", "PROCESSING", "REJECTED", "REJECTED_RETRY", "REQUIRES_REVIEW", "SUCCESSFUL"];

const VF_CHECKS_TEMPLATE = (checks, status) => ({ checks, process: { isAuto: true, rules: [{ checks, onRisk: { status: status || "REJECTED" } }] } });
const VF_STEP_DEFAULTS = {
  BB_MANUAL_PII: {},
  BB_CHECKS: VF_CHECKS_TEMPLATE(["SELF_CHECK_SANCTIONED_INDIVIDUALS"]),
  BB_ID_DOC_COUNTRY: {},
  BB_MANUAL: { livenessEnabled: true, sumsubRoutingEnabled: false, selfieRequired: true },
  BB_MANUAL_CHECKS: VF_CHECKS_TEMPLATE(["IDX_CHECK_TERRORIST", "IDX_CHECK_BANKRUPT", "IDX_PASSPORT_COMPLEX_CHECK"], "REQUIRES_REVIEW"),
  BB_SUMSUB: { levelName: "standard" },
  BB_SUMSUB_CHECKS: VF_CHECKS_TEMPLATE(["IDX_CHECK_TERRORIST", "IDX_CHECK_BANKRUPT"], "REQUIRES_REVIEW"),
  BB_SBP: {},
  PAYGINE_PHONE: { maxSmsResends: 3, maxCodeAttempts: 3, phoneSource: "PERSONAL_PHONE_SBP", passportDocumentCodes: ["PASSPORT_RUS"], sendOptionalFields: true },
  PAYGINE_UPRID: { pollScheduleMinutes: [0, 1, 1, 1, 1, 5, 5, 10, 15, 30, 60], passportDocumentCodes: ["PASSPORT_RUS"], sendOptionalFields: true },
  ADMIN: { process: { isAuto: false } },
  SCREENING: VF_CHECKS_TEMPLATE(["SELF_CHECK_SANCTIONED_COMPANIES", "SELF_CHECK_SANCTIONED_MEMBERS"], "REQUIRES_REVIEW"),
};
function vfStepDefault(step) {
  return JSON.parse(JSON.stringify(VF_STEP_DEFAULTS[step] || {}));
}

function vfStamp(entity, createdDate, updatedDate) {
  entity.createdDate = createdDate;
  entity.createdAt = formatDateTime(createdDate);
  entity.updatedDate = updatedDate || createdDate;
  entity.updatedAt = formatDateTime(entity.updatedDate);
  return entity;
}

// ---- Конфигурации KYC ----------------------------------------------------------------------
const VF_D_APR = new Date(2026, 3, 12, 2, 43);
const VF_KYC_SPECS = [
  // [ключ, имя, сервис, уровень, версия, активна, создана, шаги, родитель (ключ), кнопка, возможности, обязательные действия]
  ["kyb1", "ASIA_FINTECH_KYC_IN_KYB", "ASIA_FINTECH_KYC_IN_KYB", 1, 1, true, new Date(2026, 6, 28, 13, 35), ["BB_MANUAL_PII", "BB_CHECKS"], null, "Пройти проверку", KYC_FEATURES_BY_LEVEL.null, ["FILL_PERSONAL_DATA"]],
  ["l1v1", "Level 1", "ASIA_FINTECH", 1, 1, false, VF_D_APR, ["BB_MANUAL_PII", "BB_CHECKS"], null, "Начать верификацию", KYC_FEATURES_BY_LEVEL[1], ["FILL_PERSONAL_DATA"]],
  ["l1v2", "Level 1", "ASIA_FINTECH", 1, 2, true, new Date(2026, 8, 15, 11, 20), ["BB_MANUAL_PII", "BB_CHECKS"], null, "Начать верификацию", KYC_FEATURES_BY_LEVEL[1], ["FILL_PERSONAL_DATA"]],
  ["l2", "Level 2", "ASIA_FINTECH", 2, 1, true, VF_D_APR, ["BB_ID_DOC_COUNTRY", "BB_MANUAL", "BB_MANUAL_CHECKS", "BB_SUMSUB", "BB_SUMSUB_CHECKS"], "l1v1", "Подтвердить личность", KYC_FEATURES_BY_LEVEL[2], ["UPLOAD_DOCUMENTS", "LIVENESS"]],
  ["l3", "Level 3", "ASIA_FINTECH", 3, 1, true, VF_D_APR, ["PAYGINE_PHONE", "PAYGINE_UPRID"], "l2", "Открыть расширенные возможности", KYC_FEATURES_BY_LEVEL[3], ["BIND_SBP_PHONE"]],
  ["l4", "Level 4", "ASIA_FINTECH", 4, 1, true, new Date(2026, 8, 11, 22, 32), ["ADMIN"], "l3", "Запросить максимальный уровень", ["Все возможности платформы"], []],
];
const VF_STEP_NAMES = { BB_MANUAL_PII: "Базовая анкета", BB_CHECKS: "Проверка по спискам", BB_ID_DOC_COUNTRY: "Определение страны документа", BB_MANUAL: "Ручная проверка паспорта", BB_MANUAL_CHECKS: "Автоматические проверки", BB_SUMSUB: "Проверка в Sumsub", BB_SUMSUB_CHECKS: "Автопроверки Sumsub", PAYGINE_PHONE: "Привязка телефона Paygine", PAYGINE_UPRID: "УПРИД (проверка паспорта)", ADMIN: "Решение оператора" };

const VF_KYC_CONFIGS = VF_KYC_SPECS.map(([key, name, service, level, version, isActive, created, steps, , button, features, actions], i) =>
  vfStamp(
    {
      id: seedToPaymentUuid(13000 + i),
      key, name, service, level, configVersion: version, isActive,
      description: null,
      startButtonText: button,
      availableFeatures: [...features],
      requiredActions: [...actions],
      parentIds: [],
      references: [],
      steps: steps.map((step, idx) => ({
        id: seedToPaymentUuid(13100 + i * 10 + idx),
        step,
        order: idx + 1,
        name: null,
        description: null,
        providerConfig: vfStepDefault(step),
      })),
    },
    created,
    new Date(created.getTime() + (i % 3) * 60 * 1000)
  )
);
VF_KYC_SPECS.forEach((spec, i) => {
  const parentKey = spec[8];
  if (parentKey) VF_KYC_CONFIGS[i].parentIds = [VF_KYC_CONFIGS.find((c) => c.key === parentKey).id];
});

function vfKycById(id) {
  return VF_KYC_CONFIGS.find((c) => c.id === id) || null;
}
// Клиенты остаются на той версии конфигурации, на которой начали: берём самую раннюю версию с этим именем
function vfUsersOfKyc(cfg) {
  const sameName = VF_KYC_CONFIGS.filter((c) => c.name === cfg.name);
  const minVersion = Math.min(...sameName.map((c) => c.configVersion));
  if (cfg.configVersion !== minVersion) return [];
  return CLIENTS_USERS_MOCK.filter((u) => u.kycConfigName === cfg.name);
}

// ---- Конфигурации KYB ------------------------------------------------------------------------
// По аналогии с KYC-конфигурациями выше, но для юрлиц: то же версионирование (новая активная
// конфигурация того же уровня деактивирует предыдущую), тот же общий каталог кодов шага
// (verif.steps, см. i18n.js) — только шаги и уровни берутся из уже установленного мока компаний
// (KYB_STEPS_BY_LEVEL/KYB_CONFIG_NAMES, clients-companies.mock.js — закрытый каталог KYBStepEnum
// из 7 кодов, libs/bank-core-common/lib/enums/kyb-step.enum.ts, комментарий там же). Сервис у
// компаний в моке всегда один (COMPANY_SERVICE_OPTIONS = ["ASIA_FINTECH"]), поэтому, в отличие от
// KYC, поле service тут не варьируется и в списке/фильтрах не выводится.
const VF_KYB_D0 = new Date(2026, 6, 28, 13, 35);
const VF_KYB_CONFIGS = [1, 2, 3].map((level, i) =>
  vfStamp(
    {
      id: seedToPaymentUuid(13900 + i),
      key: `kyb${level}`, name: KYB_CONFIG_NAMES[level - 1], service: "ASIA_FINTECH", level,
      configVersion: 1, isActive: true, description: null,
      steps: KYB_STEPS_BY_LEVEL[level].map((st, idx) => ({
        id: seedToPaymentUuid(13950 + i * 10 + idx), step: st.step, order: idx + 1, name: st.name, description: null,
      })),
    },
    VF_KYB_D0
  )
);

function vfKybById(id) {
  return VF_KYB_CONFIGS.find((c) => c.id === id) || null;
}
// Компании остаются на той версии конфигурации, на которой начали KYB (тот же принцип, что vfUsersOfKyc)
function vfCompaniesOfKyb(cfg) {
  const sameName = VF_KYB_CONFIGS.filter((c) => c.name === cfg.name);
  const minVersion = Math.min(...sameName.map((c) => c.configVersion));
  if (cfg.configVersion !== minVersion) return [];
  return CLIENTS_COMPANIES_MOCK.filter((c) => c.kybConfigName === cfg.name);
}

// ---- Конфигурации документов -------------------------------------------------------------------
// [key, label, type, displayInTable, description]
const VF_PASSPORT_FIELDS = [
  ["number", "Серия и номер", "STRING", true, "Серия и номер документа"], ["surname", "Фамилия", "STRING", true, "Фамилия из документа"], ["name", "Имя", "STRING", true, "Имя из документа"],
  ["patronymic", "Отчество", "STRING", false, "Отчество из документа"], ["birthDate", "Дата рождения", "DATE", true, "Дата рождения"], ["birthPlace", "Место рождения", "STRING", false, "Место рождения"],
  ["gender", "Пол", "STRING", false, "Пол владельца"], ["issuedDate", "Дата выдачи", "DATE", true, "Дата выдачи документа"], ["issuedBy", "Кем выдан", "STRING", false, "Орган, выдавший документ"],
  ["departmentCode", "Код подразделения", "STRING", false, "Код подразделения"], ["expiryDate", "Действителен до", "DATE", false, "Срок действия"],
];
const VF_DRIVES_FIELDS = [
  ["number", "Номер удостоверения", "STRING", true, "Номер водительского удостоверения"], ["issuedDate", "Дата выдачи", "DATE", true, "Дата выдачи"], ["surname", "Фамилия", "STRING", true, "Фамилия"],
  ["name", "Имя", "STRING", true, "Имя"], ["birthDate", "Дата рождения", "DATE", false, "Дата рождения"], ["categories", "Категории", "STRING", false, "Открытые категории"], ["expiryDate", "Действительно до", "DATE", false, "Срок действия"],
];
const VF_OFFER_FIELDS = [
  ["registrationDate", "Дата регистрации", "DATE", true, "Дата регистрации клиента"], ["generatedAt", "Сформирован", "DATE", true, "Дата формирования документа"], ["directorName", "Директор", "STRING", false, "ФИО директора"],
  ["clientId", "ID клиента", "STRING", true, "Идентификатор клиента"], ["clientDocumentNumber", "Номер документа клиента", "STRING", false, "Номер документа клиента"], ["templateVersion", "Версия шаблона", "NUMBER", false, "Версия шаблона"],
];
const VF_ID_CARD_FIELDS = [["number", "Номер карты", "STRING", true, "Номер ID-карты"], ["surname", "Фамилия", "STRING", true, "Фамилия"], ["name", "Имя", "STRING", true, "Имя"], ["expiryDate", "Действительна до", "DATE", false, "Срок действия"]];

const VF_ALL_COUNTRIES = COUNTRY_OPTIONS.map((c) => c.id);
// [имя, описание, код, тип, версия, активна, страны, поля, дата]
const VF_DOC_SPECS = [
  ["Уведомление о присоединении к оферте", "Автоматически сформированное уведомление", "PUBLIC_OFFER_JOIN", "AGREEMENT", 1, true, [], VF_OFFER_FIELDS, new Date(2026, 6, 2, 16, 55)],
  ["Selfie with Document", "Selfie with Document", "SELFIE_WITH_DOC", "SELFIE", 1, true, [], [], new Date(2026, 3, 16, 6, 34)],
  ["Selfie", "Selfie", null, "SELFIE", 1, true, [], [], new Date(2026, 3, 16, 6, 34)],
  ["Russian Passport IDX", "Russian Federation Passport (IDX)", "PASSPORT_RUS_IDX", "PASSPORT", 1, true, ["ru"], VF_PASSPORT_FIELDS, new Date(2026, 3, 16, 0, 46)],
  ["Selfie IDX", "Selfie IDX", "SELFIE_IDX", "SELFIE", 1, true, [], [], new Date(2026, 3, 16, 0, 46)],
  ["Russian Passport", "Russian Federation Passport", "PASSPORT_RUS", "PASSPORT", 1, true, ["ru"], VF_PASSPORT_FIELDS, new Date(2026, 3, 16, 0, 14)],
  ["Russian Driver License", "Russian Federation Driver License", "DRIVES_RUS", "DRIVERS", 1, true, ["ru"], VF_DRIVES_FIELDS, new Date(2026, 3, 16, 0, 14)],
  ["Passport", "Passport", "PASSPORT", "PASSPORT", 1, true, VF_ALL_COUNTRIES, VF_PASSPORT_FIELDS, new Date(2026, 3, 15, 23, 56)],
  ["Driver License", "Driver License", "DRIVES", "DRIVERS", 1, true, VF_ALL_COUNTRIES, VF_DRIVES_FIELDS.slice(0, 6), new Date(2026, 3, 15, 23, 56)],
  ["ID Card", "ID Card", "ID_CARD", "ID_CARD", 1, true, VF_ALL_COUNTRIES, VF_ID_CARD_FIELDS, new Date(2026, 3, 15, 23, 40)],
  ["Passport", "Passport (старая версия)", null, "PASSPORT", 0, false, VF_ALL_COUNTRIES, VF_PASSPORT_FIELDS.slice(0, 8), new Date(2025, 8, 4, 20, 29)],
];
const VF_DOC_CONFIGS = VF_DOC_SPECS.map(([name, description, code, docType, version, isActive, countries, fields, created], i) => {
  const rec = vfStamp(
    { id: seedToPaymentUuid(14000 + i), name, description, code, docType, configVersion: version || 1, isActive, availableCountryIds: [...countries], references: [] },
    created,
    new Date(created.getTime() + (i % 4) * 60 * 1000)
  );
  rec.fieldConfigs = fields.map(([key, label, type, displayInTable, fdesc], idx) =>
    vfStamp({ id: seedToPaymentUuid(14100 + i * 20 + idx), key, label, type, displayInTable, description: fdesc, order: idx + 1, isActive: true, references: [] }, created)
  );
  return rec;
});
// у первой версии "Passport" версия ниже актуальной: актуальная — 2
VF_DOC_CONFIGS.find((d) => d.code === "PASSPORT").configVersion = 2;
VF_DOC_CONFIGS[VF_DOC_CONFIGS.length - 1].configVersion = 1;

function vfDocById(id) {
  return VF_DOC_CONFIGS.find((d) => d.id === id) || null;
}

// ---- Категории адресов ------------------------------------------------------------------------------
// [имя, описание, число адресов, создана, удалена, используется в KYC]
const VF_ADDRESS_SPECS = [
  ["Operational address", "Operational address", 31, new Date(2026, 6, 23, 12, 50), null],
  ["birth_place", "Place of birth", 838, new Date(2026, 5, 16, 19, 46), null],
  ["gfvythgfrf", "gfyhtb", 0, new Date(2026, 3, 18, 19, 2), new Date(2026, 3, 18, 19, 3)],
  ["test3", "dfdf", 0, new Date(2026, 3, 9, 12, 28), new Date(2026, 3, 9, 12, 28)],
  ["Correspondence address", "Correspondence address", 88, new Date(2026, 3, 8, 12, 36), null],
  ["proof of address", null, 2, new Date(2026, 3, 7, 17, 16), null],
  ["test_address", "test", 2, new Date(2026, 3, 6, 14, 34), null],
  ["test1", "test1", 0, new Date(2026, 3, 6, 14, 34), new Date(2026, 3, 6, 14, 34)],
  ["residential", null, 2414, new Date(2022, 11, 22, 16, 56), null],
];
const VF_ADDRESS_CATEGORIES = VF_ADDRESS_SPECS.map(([name, description, addressesCount, created, deleted], i) => {
  const rec = vfStamp({ id: seedToPaymentUuid(15000 + i), name, description, addressesCount, deletedDate: deleted, deletedAt: deleted ? formatDateTime(deleted) : null }, created, created);
  return rec;
});
// Названия категорий, которые ищет код KYC (identity: шаги BB_MANUAL_PII и BB_MANUAL)
const VF_KYC_ADDRESS_CATEGORIES = ["birth_place", "residential"];
