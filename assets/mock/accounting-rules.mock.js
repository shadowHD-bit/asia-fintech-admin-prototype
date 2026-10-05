/* ==========================================================================
   "Настройки → Бухгалтерия → Правила проводок" (Accounting Rules).

   ДОПУЩЕНИЕ ПРОТОТИПА: как и План счетов/Главная книга — построено по FRD
   (general-ledger-i-chart-of-accounts.md §5 "Accounting Rules"), реального
   движка правил в бэкенде нет.

   ОТЛИЧИЕ ОТ ЛИТЕРАЛЬНОГО §5 FRD (осознанное, см. комментарий в
   accounting-coa.mock.js "ПРИВЯЗКА ВА/РА К СЧЁТУ"): FRD описывает у правила
   набор "аналитических измерений", которые можно жёстко прописать в правиле
   (VA-ID/RA-ID/Client-ID/Product/Channel) поверх атрибутов операции. В этом
   прототипе измерения проводки уже выводятся СТРУКТУРНО — из тега реального
   ВА/РА, участвующего в операции (glDimsForClient в accounting-gl.mock.js) —
   поэтому у правила здесь НЕТ поля "измерения": это не повтор ошибки,
   которую уже исправили в Плане счетов, а её логичное продолжение в
   Правилах. Правило отвечает только за ОДНО: по какому триггеру и при каких
   условиях списать/зачислить какую сумму на какую пару счетов плана счетов.

   Условия (§5.2): currency, rail (= Channel в терминах FRD, канал платежа),
   и свой для прототипа leg (SOURCE/TARGET — какая сторона валютной пары, FX
   в наших платежах не укладывается в одно поле currency). Условие "null" у
   ключа значит "любое значение" (условие не участвует в сопоставлении).

   Загружается после clients-users.mock.js (entityCode) и accounting-coa.mock.js
   (coaByCode для валидации формы); до accounting-gl.mock.js, т.к. §12
   автогенерации проводок там теперь читает правила отсюда, а не держит
   собственную карту счетов по валюте.
   ========================================================================== */

const AR_TRIGGERS = ["PAYMENT_RECEIVED", "PAYMENT_SENT", "PAYMENT_FEE", "FX_TRADE", "FX_FEE", "CRYPTO_DEPOSIT", "CRYPTO_WITHDRAWAL"];
const AR_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"];
const AR_AMOUNT_BASIS = ["FULL", "FEE"];

function arStamp(entity, createdDate, updatedDate) {
  entity.createdDate = createdDate;
  entity.createdAt = formatDateTime(createdDate);
  entity.updatedDate = updatedDate || createdDate;
  entity.updatedAt = formatDateTime(entity.updatedDate);
  return entity;
}

let arSeq = 0;
// Префикс ACR, не AR — "AR" уже занят запросами на подтверждение (maker-checker.mock.js: mcNextCode → AR-00001),
// одна и та же буквенная пометка на двух разных сущностях путала бы в интерфейсе.
function arNextId() {
  arSeq += 1;
  return { id: seedToPaymentUuid(42000 + arSeq), code: entityCode("ACR", 42000 + arSeq, 6) };
}

const AR_D0 = new Date(2026, 2, 12, 9, 0);

// spec: { name, description, trigger, conditions:{currency?,rail?,leg?}, sequence, debit, credit,
//         amountBasis, creationCondition? }
function arMake(spec, i) {
  const { id, code } = arNextId();
  const created = new Date(AR_D0.getTime() + i * 11 * 3600 * 1000);
  return arStamp(
    {
      id,
      code,
      name: spec.name,
      description: spec.description || "",
      trigger: spec.trigger,
      conditions: { currency: spec.conditions.currency || null, rail: spec.conditions.rail || null, leg: spec.conditions.leg || null },
      sequence: spec.sequence,
      debitAccountCode: spec.debit,
      creditAccountCode: spec.credit,
      amountBasis: spec.amountBasis || "FULL",
      creationCondition: spec.creationCondition || null,
      status: spec.status || "ACTIVE",
    },
    created
  );
}

// ---- Реестр правил — по аналогии с таблицей примеров §5.3 FRD (AR-001…AR-018), но под реальные рельсы
// и валюты, которые есть в наших платежах (OPERATIONS_PAYMENTS_MOCK) и в Плане счетов этого прототипа.
const AR_SPECS = [
  { name: "Входящий платёж — EUR", description: "Тело входящего фиатного платежа в EUR: приход на Nostro EUR, обязательство перед клиентом", trigger: "PAYMENT_RECEIVED", conditions: { currency: "EUR" }, sequence: 1, debit: "1101", credit: "2100", amountBasis: "FULL" },
  { name: "Входящий платёж — GBP", description: "Тело входящего фиатного платежа в GBP", trigger: "PAYMENT_RECEIVED", conditions: { currency: "GBP" }, sequence: 1, debit: "1102", credit: "2100", amountBasis: "FULL" },
  { name: "Входящий платёж — USD", description: "Тело входящего фиатного платежа в USD", trigger: "PAYMENT_RECEIVED", conditions: { currency: "USD" }, sequence: 1, debit: "1103", credit: "2100", amountBasis: "FULL" },
  { name: "Исходящий платёж — EUR", description: "Тело исходящего фиатного платежа в EUR: списание обязательства клиента, уход с Nostro EUR", trigger: "PAYMENT_SENT", conditions: { currency: "EUR" }, sequence: 1, debit: "2100", credit: "1101", amountBasis: "FULL" },
  { name: "Исходящий платёж — GBP", description: "Тело исходящего фиатного платежа в GBP", trigger: "PAYMENT_SENT", conditions: { currency: "GBP" }, sequence: 1, debit: "2100", credit: "1102", amountBasis: "FULL" },
  { name: "Исходящий платёж — USD", description: "Тело исходящего фиатного платежа в USD", trigger: "PAYMENT_SENT", conditions: { currency: "USD" }, sequence: 1, debit: "2100", credit: "1103", amountBasis: "FULL" },
  { name: "Комиссия платформы", description: "Комиссия платформы за фиатный платёж — списывается с клиента в доход", trigger: "PAYMENT_FEE", conditions: {}, sequence: 2, debit: "2100", credit: "4100", amountBasis: "FEE", creationCondition: "feeAmount > 0" },
  { name: "Обмен — списание EUR", description: "FX-сделка, сторона списания в EUR: клиринг валютной пары", trigger: "FX_TRADE", conditions: { leg: "SOURCE", currency: "EUR" }, sequence: 1, debit: "2100", credit: "1401", amountBasis: "FULL" },
  { name: "Обмен — списание GBP", description: "FX-сделка, сторона списания в GBP", trigger: "FX_TRADE", conditions: { leg: "SOURCE", currency: "GBP" }, sequence: 1, debit: "2100", credit: "1402", amountBasis: "FULL" },
  { name: "Обмен — зачисление EUR", description: "FX-сделка, сторона зачисления в EUR", trigger: "FX_TRADE", conditions: { leg: "TARGET", currency: "EUR" }, sequence: 2, debit: "1401", credit: "2100", amountBasis: "FULL" },
  { name: "Обмен — зачисление GBP", description: "FX-сделка, сторона зачисления в GBP", trigger: "FX_TRADE", conditions: { leg: "TARGET", currency: "GBP" }, sequence: 2, debit: "1402", credit: "2100", amountBasis: "FULL" },
  { name: "Комиссия за обмен", description: "Комиссия платформы за валютный обмен", trigger: "FX_FEE", conditions: {}, sequence: 3, debit: "2100", credit: "4200", amountBasis: "FEE", creationCondition: "feeAmount > 0" },
  { name: "Крипто-депозит", description: "Зачисление криптовалюты на клиентский кошелёк", trigger: "CRYPTO_DEPOSIT", conditions: {}, sequence: 1, debit: "1130", credit: "2100", amountBasis: "FULL" },
  { name: "Крипто-вывод", description: "Списание криптовалюты с клиентского кошелька", trigger: "CRYPTO_WITHDRAWAL", conditions: {}, sequence: 1, debit: "2100", credit: "1130", amountBasis: "FULL" },
];

const ACCOUNTING_RULES = AR_SPECS.map((spec, i) => arMake(spec, i));

function arById(id) {
  return ACCOUNTING_RULES.find((r) => r.id === id) || null;
}
function arByCode(code) {
  return ACCOUNTING_RULES.find((r) => r.code === code) || null;
}

// ---- Сопоставление условий правила с контекстом операции: null в условии = "любое значение" --------------
function arConditionsMatch(conditions, ctx) {
  if (conditions.currency && conditions.currency !== ctx.currency) return false;
  if (conditions.rail && conditions.rail !== ctx.rail) return false;
  if (conditions.leg && conditions.leg !== ctx.leg) return false;
  return true;
}

// Единственное активное правило для триггера+условий — найти несколько активных правил, подходящих под
// один и тот же контекст, было бы конфликтом (§5.4 FRD запрещает), поэтому берём первое совпадение.
function arFindRule(trigger, ctx) {
  return ACCOUNTING_RULES.find((r) => r.status === "ACTIVE" && r.trigger === trigger && arConditionsMatch(r.conditions, ctx)) || null;
}

// Правила, перекрывающиеся друг с другом (одинаковый триггер + одинаковые условия на всех активных
// правилах, кроме редактируемого) — используется формой добавления/изменения правила для валидации.
function arConflictingRule(rule) {
  return (
    ACCOUNTING_RULES.find(
      (r) =>
        r.id !== rule.id &&
        r.status === "ACTIVE" &&
        rule.status === "ACTIVE" &&
        r.trigger === rule.trigger &&
        r.conditions.currency === rule.conditions.currency &&
        r.conditions.rail === rule.conditions.rail &&
        r.conditions.leg === rule.conditions.leg
    ) || null
  );
}

function arUsageCount(rule) {
  return typeof GL_JOURNAL_ENTRIES !== "undefined" ? GL_JOURNAL_ENTRIES.filter((e) => e.appliedRuleCode === rule.code).length : 0;
}
