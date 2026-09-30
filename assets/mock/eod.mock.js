/* ==========================================================================
   Моковые данные и "движок" для раздела "Операционный день" (EOD, ядро VABS):
   дни, стадии закрытия, конфигурация, снимки балансов, расхождения сверки.
   Форма записей — сущности ядра (eods, eod_stages, eod_configs, eod_stage_configs,
   virtual/real_account_snapshots и *_balance_snapshots, reconciliation_settings,
   reconciliation_discrepancies (+details, +resolutions)).
   Спецификация: docs/eod-spec.md.
   Реальное: поля и связи сущностей, статусы дня и стадий, порядок стадий
   (BOD → ODO → RECONCILIATION → EOTI → EOD, порядок из кода ядра; подтверждения по умолчанию только у RECONCILIATION и EOD; ODO всегда ждёт ручного подтверждения; approvedBy/approvedAt в ядре не заполняются, endedBy — админ, запустивший закрытие; сверка при подтверждении не завершается, пока есть нерешённые расхождения), типы закрытия, значения конфигурации по умолчанию
   (cutoff 23:40, задержка 30 мин, 3 повтора, пауза 5 мин), правило расчёта планового закрытия
   (+1 день к дате открытия, пропуск выходных и праздников), типы сверки и периодичности,
   типы допуска (сумма/процент), формулы сверки (дебет = кредит по операции и валюте;
   open + delta = close по снимку баланса), исключение открытых расхождений при повторном
   запуске, жизненный цикл расхождения и типы решений, цепочка хешей закрытых дней.
   Условное: ID, даты, число дней истории, кто и как закрывал день, операции и объёмы закрытых
   дней (в API нет списочных агрегатов по дню), снимки балансов и суммы, значения настроек сверки
   (в документации указано лишь, что настройки создаются для всех типов), названия и описания
   стадий, хеши (в ядре точка вычисления хеша при закрытии ещё не задана — здесь считается,
   что хеш вычисляется при закрытии, а у первых закрытых дней его нет).
   Сверка операций считается по реальным проводкам мока vABS (settings-vabs.mock.js):
   правка проводки в разделе "Операции vABS" меняет результат сверки.
   Должен загружаться после settings-access.mock.js, accounts.mock.js, settings-vabs.mock.js и
   security-kyt.mock.js (используется ktHex). Функции pdNow, CURRENT_ADMIN — только на этапе
   вызовов из интерфейса, при загрузке не используются.
   ========================================================================== */

// Порядок из кода ядра (DEFAULT_STAGE_CONFIGS, eod-config.service.ts): BOD 1, ODO 2,
// RECONCILIATION 3, EOTI 4, EOD 5 (в docs/eod.md порядок указан неверно)
const EOD_STAGE_TYPES = ["BOD", "ODO", "RECONCILIATION", "EOTI", "EOD"];
const EOD_STATUSES = ["PLANNED", "OPEN", "CLOSING_PROCESS", "AWAITING_APPROVAL", "CLOSED", "FAILED"];
const EOD_STAGE_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "AWAITING_APPROVAL", "FAILED", "RETRIED", "ROLLBACK"];
const EOD_CLOSE_TYPES = ["AUTO", "MANUAL", "AUTO_AND_MANUAL"];
const EOD_RECON_TYPES = ["REAL_BALANCE", "VIRTUAL_BALANCE", "OPERATION", "NOSTRO", "VIRTUAL_TRANSACTION", "REAL_TRANSACTION"];
const EOD_RECON_FREQUENCIES = ["EVERY_OPERATION_DAY", "EVERY_3_OPERATION_DAYS", "EVERY_7_OPERATION_DAYS", "EVERY_14_OPERATION_DAYS", "EVERY_21_OPERATION_DAYS", "EVERY_30_OPERATION_DAYS"];
const EOD_TOLERANCE_TYPES = ["RECONCILIATION_PERCENT", "RECONCILIATION_AMOUNT"];
const EOD_DISC_STATUSES = ["DETECTED", "PENDING_DECISION", "RESOLVED"];
const EOD_RESOLUTION_TYPES = ["RESOLVED_CORRECTED", "RESOLVED_ACCEPTED", "RESOLVED", "DISMISSED", "DEFERRED", "ESCALATED"];
const EOD_ENTITY_TYPES = ["OPERATION", "VIRTUAL_BALANCE", "REAL_BALANCE"];
const EOD_TIMEZONES = ["UTC", "Asia/Tashkent", "Asia/Bishkek", "Asia/Almaty", "Asia/Dubai", "Europe/Moscow"];
const EOD_EXCLUDED_TX_STATUSES = ["DECLINED", "PENDING", "REPLACED"];

function eodStamp(entity, created, updated) {
  entity.createdDate = created;
  entity.createdAt = formatDateTime(created);
  entity.updatedDate = updated || created;
  entity.updatedAt = formatDateTime(entity.updatedDate);
  return entity;
}

function eodMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function eodRound(n) {
  return Math.round(n * 100) / 100;
}

// ---- Конфигурация -----------------------------------------------------------------------------------
const EOD_STAGE_NAMES = {
  BOD: ["Beginning of Day", "Opening of the operating day"],
  ODO: ["Operation Day Open", "Opening of operation processing"],
  EOTI: ["End of Transaction Input", "Closing of transaction input"],
  RECONCILIATION: ["Reconciliation", "Reconciliation of operations and balances"],
  EOD: ["End of Day", "Final closing of the operating day"],
};

const EOD_CONFIG = eodStamp(
  {
    id: seedToPaymentUuid(31000),
    initializingProcess: "AUTO_AND_MANUAL",
    cutoffTime: "23:40",
    cutoffTimezone: "UTC",
    nonFinalOperationsDelayMinutes: 30,
    activeInHolidays: false,
    activeInWeekends: false,
    holidayDates: [],
    allowStageRetries: true,
    maxRetries: 3,
    retryBackoffMinutes: 5,
    stageConfigs: EOD_STAGE_TYPES.map((type, i) => ({
      id: seedToPaymentUuid(31100 + i),
      stageType: type,
      order: i + 1,
      // по умолчанию подтверждения требуют только RECONCILIATION и EOD (код ядра)
      isAwaitingApproval: type === "RECONCILIATION" || type === "EOD",
      name: EOD_STAGE_NAMES[type][0],
      description: EOD_STAGE_NAMES[type][1],
    })),
  },
  new Date(2026, 2, 12, 10, 4),
  new Date(2026, 6, 30, 12, 15)
);

function eodDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Плановое закрытие: +1 день к дате открытия, время cutoff, сдвиг вперёд, пока день выходной или праздничный
function eodCalcPlan(from, cfg) {
  const [hh, mm] = cfg.cutoffTime.split(":").map(Number);
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, hh, mm);
  for (let i = 0; i < 400; i += 1) {
    const weekend = (d.getDay() === 0 || d.getDay() === 6) && !cfg.activeInWeekends;
    const holiday = cfg.holidayDates.includes(eodDateKey(d)) && !cfg.activeInHolidays;
    if (!weekend && !holiday) break;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// ---- Настройки сверки ------------------------------------------------------------------------------------
const EOD_RECON_SETTINGS = [
  ["REAL_BALANCE", "EVERY_OPERATION_DAY", false, null, null],
  ["VIRTUAL_BALANCE", "EVERY_OPERATION_DAY", true, "RECONCILIATION_AMOUNT", 0.05],
  ["OPERATION", "EVERY_OPERATION_DAY", true, "RECONCILIATION_AMOUNT", 0.01],
  ["NOSTRO", "EVERY_7_OPERATION_DAYS", false, null, null],
  ["VIRTUAL_TRANSACTION", "EVERY_OPERATION_DAY", false, null, null],
  ["REAL_TRANSACTION", "EVERY_OPERATION_DAY", false, null, null],
].map(([type, frequency, enabled, toleranceType, tolerance], i) =>
  eodStamp(
    { id: seedToPaymentUuid(31200 + i), reconciliationType: type, reconciliationFrequency: frequency, toleranceEnable: enabled, toleranceType, tolerance },
    new Date(2026, 2, 12, 10, 4),
    new Date(2026, 5, 4, 15, 40)
  )
);

function eodSetting(type) {
  return EOD_RECON_SETTINGS.find((s) => s.reconciliationType === type) || null;
}

// Допуск встраивается в условие сверки: без допуска расхождением считается любая разница
function eodOverTolerance(type, expected, difference) {
  if (difference <= 0) return false;
  const s = eodSetting(type);
  if (!s || !s.toleranceEnable || s.tolerance == null) return true;
  if (s.toleranceType === "RECONCILIATION_AMOUNT") return difference > s.tolerance;
  return difference > (Math.abs(expected) * s.tolerance) / 100;
}

// ---- Операционные дни ----------------------------------------------------------------------------------------
const EOD_HISTORY_DAYS = 31;
const EOD_APPROVERS = ACCESS_ADMINS.filter((a) => a.status === "ACTIVE").slice(0, 4);

function eodAdminByEmail(email) {
  return ACCESS_ADMINS.find((a) => a.email === email) || null;
}

const EOD_DAYS = [];
(function buildEodDays() {
  // рабочие дни, заканчивающиеся четвергом 17 сентября 2026 (в пятницу 18-го идёт текущий день)
  const workdays = [];
  const cursor = new Date(2026, 8, 17);
  while (workdays.length < EOD_HISTORY_DAYS + 1) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) workdays.unshift(new Date(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  const closeAt = (i) => new Date(workdays[i].getFullYear(), workdays[i].getMonth(), workdays[i].getDate(), 23, 40 + ((i * 7) % 13));
  let previous = null;
  for (let k = 0; k < EOD_HISTORY_DAYS; k += 1) {
    const start = closeAt(k);
    const planEnd = new Date(workdays[k + 1].getFullYear(), workdays[k + 1].getMonth(), workdays[k + 1].getDate(), 23, 40);
    const withApprovals = k < 12 || k % 4 === 0;
    const day = {
      id: seedToPaymentUuid(30000 + k),
      code: entityCode("EOD", 30000 + k),
      status: "CLOSED",
      isActive: false,
      closingProcessStarted: true,
      closeType: k < 10 ? "MANUAL" : "AUTO_AND_MANUAL",
      startDatetime: start,
      endDatetimePlan: planEnd,
      endDatetimeActual: null,
      endedBy: null,
      failedMessage: null,
      hash: null,
      hashComputedAt: null,
      previousEodId: previous ? previous.id : null,
      nextEodId: null,
      currentStageId: null,
      stages: [],
      stats: { operations: 150 + ((k * 53) % 240), volumes: [{ currency: "USD", amount: 420000 + ((k * 91733) % 900000) }, { currency: "EUR", amount: 160000 + ((k * 40111) % 380000) }, { currency: "RUB", amount: 9100000 + ((k * 731009) % 21000000) }] },
    };
    // стадии закрытия
    let t = eodMinutes(planEnd, k % 5); // cron срабатывает раз в 5 минут
    const approver = EOD_APPROVERS[k % EOD_APPROVERS.length];
    EOD_STAGE_TYPES.forEach((type, i) => {
      const startedAt = t;
      const wait = withApprovals ? 2 + ((k + i * 3) % 9) : 0;
      const duration = type === "RECONCILIATION" ? 3 + (k % 4) : 1 + (i % 2);
      const endedAt = eodMinutes(startedAt, withApprovals ? wait : duration);
      day.stages.push({
        id: seedToPaymentUuid(32000 + k * 10 + i),
        eodId: day.id,
        stage: type,
        status: "COMPLETED",
        // approvedBy/approvedAt в ядре нигде не заполняются (всегда null)
        approvedBy: null,
        approvedAt: null,
        startedAt,
        endedAt,
      });
      t = endedAt;
    });
    day.endDatetimeActual = t;
    day.endedBy = withApprovals ? approver.email : null;
    if (k >= 3) {
      day.hash = ktHex(31000 + k, 64);
      day.hashComputedAt = eodMinutes(t, 1);
    }
    day.currentStageId = day.stages[day.stages.length - 1].id;
    eodStamp(day, eodMinutes(start, -5), t);
    if (previous) previous.nextEodId = day.id;
    EOD_DAYS.push(day);
    previous = day;
  }
  // текущий (открытый) день и следующий (плановый)
  const activeStart = closeAt(EOD_HISTORY_DAYS);
  const active = eodStamp(
    {
      id: seedToPaymentUuid(30000 + EOD_HISTORY_DAYS),
      code: entityCode("EOD", 30000 + EOD_HISTORY_DAYS),
      status: "OPEN",
      isActive: true,
      closingProcessStarted: false,
      closeType: EOD_CONFIG.initializingProcess,
      startDatetime: activeStart,
      endDatetimePlan: eodCalcPlan(activeStart, EOD_CONFIG),
      endDatetimeActual: null,
      endedBy: null,
      failedMessage: null,
      hash: null,
      hashComputedAt: null,
      previousEodId: previous.id,
      nextEodId: null,
      currentStageId: null,
      stages: [],
      stats: null,
    },
    eodMinutes(activeStart, -5),
    activeStart
  );
  eodInitOpenStages(active, activeStart);
  const planned = eodStamp(
    {
      id: seedToPaymentUuid(30000 + EOD_HISTORY_DAYS + 1),
      code: entityCode("EOD", 30000 + EOD_HISTORY_DAYS + 1),
      status: "PLANNED",
      isActive: false,
      closingProcessStarted: false,
      closeType: EOD_CONFIG.initializingProcess,
      startDatetime: null,
      endDatetimePlan: null,
      endDatetimeActual: null,
      endedBy: null,
      failedMessage: null,
      hash: null,
      hashComputedAt: null,
      previousEodId: active.id,
      nextEodId: null,
      currentStageId: null,
      stages: [],
      stats: null,
    },
    activeStart
  );
  previous.nextEodId = active.id;
  active.nextEodId = planned.id;
  EOD_DAYS.push(active, planned);
})();

// Стадии открытого дня, как их оставляет BOD в ядре: BOD выполнен, ODO всегда
// остаётся RUNNING (ждёт ручного подтверждения), остальные ожидают. Текущая
// стадия дня — ODO.
function eodInitOpenStages(day, at) {
  const idx = EOD_DAYS.indexOf(day);
  const base = 39000 + (idx >= 0 ? idx : EOD_DAYS.length) * 10;
  day.stages = EOD_STAGE_TYPES.map((type, i) => ({
    id: seedToPaymentUuid(base + i),
    eodId: day.id,
    stage: type,
    status: i === 0 ? "COMPLETED" : i === 1 ? "RUNNING" : "PENDING",
    approvedBy: null,
    approvedAt: null,
    startedAt: i <= 1 ? at : null,
    endedAt: i === 0 ? at : null,
  }));
  day.currentStageId = day.stages[1].id;
}

function eodDayById(id) {
  return EOD_DAYS.find((d) => d.id === id) || null;
}

function eodActiveDay() {
  return EOD_DAYS.find((d) => d.isActive) || null;
}

// Текущее "время" мока: MOCK_NOW плюс число совершённых в интерфейсе действий (минут)
function eodNow() {
  return new Date(MOCK_NOW.getTime() + (typeof paymentActionTick === "number" ? paymentActionTick : 0) * 60 * 1000);
}

function eodDayEnd(day) {
  return day.endDatetimeActual || eodNow();
}

// ---- Операции и объём дня ---------------------------------------------------------------------------------------
// Закрытые дни — условные агрегаты; для открытого дня считаем по операциям мока vABS
function eodOperationsOfDay(day) {
  if (!day.startDatetime) return [];
  const end = eodDayEnd(day);
  return VB_OPERATIONS.filter((op) => op.createdDate >= day.startDatetime && op.createdDate <= end);
}

function eodDayStats(day) {
  if (day.stats) return day.stats;
  const ops = eodOperationsOfDay(day);
  const byCurrency = {};
  ops.forEach((op) =>
    op.virtualLegs.forEach((l) => {
      if (l.transferType === "DEBIT" && l.status === "CONFIRMED") byCurrency[l.currency] = (byCurrency[l.currency] || 0) + l.amount;
    })
  );
  const volumes = Object.keys(byCurrency)
    .map((currency) => ({ currency, amount: eodRound(byCurrency[currency]) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  return { operations: ops.length, volumes };
}

// ---- Сравнение активного дня с предыдущим (дашборд vabsActiveVsPrevious…) ------------------------------------------------
// Реальные запросы без параметров (кроме …OperationsByStatus, статус не
// фильтруем — берём все); vabsActiveVsPreviousEodDifferenceTotal по
// исследованию бэкенда — заглушка, всегда нули, поэтому не строим карточку под
// неё отдельно.
function eodPctDelta(current, previous) {
  if (!previous) return current ? 100 : 0;
  return eodRound(((current - previous) / previous) * 100);
}

function eodCompareOperationsTotal(day) {
  const prev = eodDayById(day.previousEodId);
  const current = eodDayStats(day).operations;
  const previous = prev ? eodDayStats(prev).operations : 0;
  return { current, previous, deltaInPercent: eodPctDelta(current, previous) };
}

// По валютам — сгруппированный объём (сама схема отдаёт объект, но по факту это
// срез по каждой валюте; честно показываем по каждой встретившейся валюте)
function eodCompareProcessedVolume(day) {
  const prev = eodDayById(day.previousEodId);
  const curMap = {};
  eodDayStats(day).volumes.forEach((v) => { curMap[v.currency] = v.amount; });
  const prevMap = {};
  if (prev) eodDayStats(prev).volumes.forEach((v) => { prevMap[v.currency] = v.amount; });
  const currencies = [...new Set([...Object.keys(curMap), ...Object.keys(prevMap)])];
  return currencies.map((currency) => {
    const currentAmount = curMap[currency] || 0;
    const previousAmount = prevMap[currency] || 0;
    return { currency, currentAmount, previousAmount, deltaInPercent: eodPctDelta(currentAmount, previousAmount) };
  });
}

function eodCompareDiscrepanciesTotal(day) {
  const prev = eodDayById(day.previousEodId);
  const current = eodDiscrepanciesOfDay(day.id).length;
  const previous = prev ? eodDiscrepanciesOfDay(prev.id).length : 0;
  return { current, previous, deltaInPercent: eodPctDelta(current, previous) };
}

// "Pending / Failed Operations" с реального дашборда — операции не в статусе
// COMPLETED (VabsOperationStatus: NEW, PROCESSING, COMPLETED, DECLINED,
// PARTIAL_DECLINED, ERROR — vabsActiveVsPreviousEodOperationsByStatus).
const EOD_PENDING_FAILED_OP_STATUSES = ["NEW", "PROCESSING", "DECLINED", "PARTIAL_DECLINED", "ERROR"];

function eodComparePendingFailedOperations(day) {
  const prev = eodDayById(day.previousEodId);
  const count = (d) => eodOperationsOfDay(d).filter((op) => EOD_PENDING_FAILED_OP_STATUSES.includes(op.status)).length;
  const current = count(day);
  const previous = prev ? count(prev) : 0;
  return { current, previous, deltaInPercent: eodPctDelta(current, previous) };
}

function eodActiveDiscrepanciesResolution(day) {
  const list = eodDiscrepanciesOfDay(day.id);
  const resolved = list.filter((d) => d.status === "RESOLVED").length;
  const unresolved = list.length - resolved;
  const pct = (n) => (list.length ? eodRound((n / list.length) * 100) : 0);
  return { resolved, unresolved, resolvedPercent: pct(resolved), unresolvedPercent: pct(unresolved) };
}

// Операции активного дня по часовым интервалам от открытия до сейчас (или до
// закрытия) — startedAt/endedAt в мс, как отдаёт реальный запрос
function eodActiveOperationsVolumeTimeline(day) {
  if (!day.startDatetime) return [];
  const end = eodDayEnd(day);
  const ops = eodOperationsOfDay(day);
  const buckets = [];
  let cursor = new Date(day.startDatetime);
  while (cursor < end) {
    const bucketEnd = new Date(Math.min(cursor.getTime() + 60 * 60 * 1000, end.getTime()));
    buckets.push({ startedAt: cursor.getTime(), endedAt: bucketEnd.getTime(), count: 0 });
    cursor = bucketEnd;
  }
  ops.forEach((op) => {
    const b = buckets.find((x) => op.createdDate.getTime() >= x.startedAt && op.createdDate.getTime() <= x.endedAt);
    if (b) b.count += 1;
  });
  return buckets;
}

// ---- Снимки балансов ----------------------------------------------------------------------------------------------------
const EOD_SNAPSHOTS = [];
(function buildSnapshots() {
  const usable = (a) => !["ARCHIVED", "ERROR", "CLOSED"].includes(a.status) && a.balances.some((b) => b.total > 0);
  const accounts = [
    ...ACCOUNTS_VIRTUAL_MOCK.filter(usable).slice(0, 12),
    ...ACCOUNTS_REAL_MOCK.filter(usable).slice(0, 5),
    ...ACCOUNTS_NOSTRO_MOCK.filter(usable).slice(0, 3),
  ];
  const daysIdx = [EOD_HISTORY_DAYS - 3, EOD_HISTORY_DAYS - 2, EOD_HISTORY_DAYS - 1, EOD_HISTORY_DAYS];
  let seed = 0;
  accounts.forEach((acc) => {
    const accountType = acc.kind === "virtual" ? "VIRTUAL" : "REAL";
    acc.balances.forEach((bal) => {
      if (!(bal.total > 0)) return;
      seed += 1;
      const balanceId = seedToPaymentUuid(33000 + seed);
      const chain = [];
      let close = bal.total;
      for (let n = daysIdx.length - 1; n >= 0; n -= 1) {
        const s = seed * 7 + n * 13;
        const sign = s % 3 === 0 ? -1 : 1;
        const delta = eodRound(sign * Math.min(bal.total * 0.03, 240) * (0.4 + (s % 7) / 10));
        const extra = eodRound(40 + ((s * 37) % 900));
        const increase = eodRound(Math.max(delta, 0) + extra);
        const decrease = eodRound(Math.max(-delta, 0) + extra);
        const active = acc.ledgerType === "ACTIVE";
        const open = eodRound(close - delta);
        chain[n] = {
          balanceId,
          openBalanceAmount: open,
          runningDeltaAmount: eodRound(increase - decrease),
          closeBalanceAmount: close,
          debitTurnover: active ? increase : decrease,
          creditTurnover: active ? decrease : increase,
        };
        close = open;
      }
      daysIdx.forEach((dayIndex, n) => {
        const day = EOD_DAYS[dayIndex];
        const created = eodMinutes(day.startDatetime, 30 + ((seed * 11) % 600));
        EOD_SNAPSHOTS.push(
          Object.assign(
            {
              id: seedToPaymentUuid(34000 + seed * 10 + n),
              accountSnapshotId: seedToPaymentUuid(35000 + seed * 10 + n),
              eodId: day.id,
              accountType,
              accountKind: acc.kind,
              accountId: acc.id,
              currency: bal.currency,
              isActive: n === daysIdx.length - 1,
              previousId: n > 0 ? seedToPaymentUuid(34000 + seed * 10 + n - 1) : null,
              nextId: n < daysIdx.length - 1 ? seedToPaymentUuid(34000 + seed * 10 + n + 1) : null,
            },
            chain[n],
            { createdDate: created, createdAt: formatDateTime(created) }
          )
        );
      });
    });
  });
  // нарушение формулы open + delta = close: вчерашний виртуальный, сегодняшние два виртуальных и один реальный
  const pickSnap = (dayIndex, type, nth) => EOD_SNAPSHOTS.filter((s) => s.eodId === EOD_DAYS[dayIndex].id && s.accountType === type)[nth];
  [[EOD_HISTORY_DAYS - 1, "VIRTUAL", 4, 75.1], [EOD_HISTORY_DAYS, "VIRTUAL", 2, 123.45], [EOD_HISTORY_DAYS, "VIRTUAL", 7, 0.03], [EOD_HISTORY_DAYS, "REAL", 1, 500]].forEach(([dayIndex, type, nth, diff]) => {
    const s = pickSnap(dayIndex, type, nth);
    if (s) s.closeBalanceAmount = eodRound(s.closeBalanceAmount + diff);
  });
})();

function eodSnapshotById(id) {
  return EOD_SNAPSHOTS.find((s) => s.id === id) || null;
}

function eodSnapshotExpected(s) {
  return eodRound(s.openBalanceAmount + s.runningDeltaAmount);
}

function eodSnapshotDifference(s) {
  return eodRound(Math.abs(s.closeBalanceAmount - eodSnapshotExpected(s)));
}

// ---- Расхождения -------------------------------------------------------------------------------------------------------------
const EOD_DISCREPANCIES = [];
let eodDiscSeq = 0;

function eodAddDiscrepancy(spec, created) {
  eodDiscSeq += 1;
  const d = eodStamp(
    {
      id: seedToPaymentUuid(36000 + eodDiscSeq),
      code: entityCode("DSC", 36000 + eodDiscSeq),
      eodId: spec.eodId,
      reconciliationType: spec.reconciliationType,
      reconciliationSubType: spec.reconciliationSubType || null,
      entityType: spec.entityType,
      entityId: spec.entityId,
      status: "DETECTED",
      currency: spec.currency,
      detail: { fieldName: spec.fieldName, expectedValue: spec.expectedValue, actualValue: spec.actualValue, difference: spec.difference },
      resolutions: [],
      accountRef: spec.accountRef || null,
    },
    created
  );
  EOD_DISCREPANCIES.push(d);
  return d;
}

function eodDiscrepancyById(id) {
  return EOD_DISCREPANCIES.find((d) => d.id === id) || null;
}

function eodIsOpenDiscrepancy(d) {
  return d.status !== "RESOLVED";
}

// Уже есть открытое расхождение или принятое (RESOLVED_ACCEPTED) — повторно не создаём
function eodHasBlockingDiscrepancy(eodId, entityId, currency, type, subType) {
  return EOD_DISCREPANCIES.some(
    (d) =>
      d.eodId === eodId && d.entityId === entityId && d.currency === currency && d.reconciliationType === type && (d.reconciliationSubType || null) === (subType || null) &&
      (d.status !== "RESOLVED" || d.resolutions.some((r) => r.resolutionType === "RESOLVED_ACCEPTED"))
  );
}

// Дисбаланс дебет/кредит по операции и валюте (отдельно виртуальные и реальные проводки)
function eodFindOperationImbalances(day, operationIds) {
  const result = [];
  eodOperationsOfDay(day).forEach((op) => {
    if (operationIds && !operationIds.includes(op.id)) return;
    [["virtual", "VIRTUAL_TRANSACTION"], ["real", "REAL_TRANSACTION"]].forEach(([side, subType]) => {
      const groups = {};
      (side === "virtual" ? op.virtualLegs : op.realLegs)
        .filter((l) => !EOD_EXCLUDED_TX_STATUSES.includes(l.status))
        .forEach((l) => {
          const g = (groups[l.currency] = groups[l.currency] || { debit: 0, credit: 0 });
          if (l.transferType === "DEBIT") g.debit += l.amount;
          else g.credit += l.amount;
        });
      Object.keys(groups).forEach((currency) => {
        const debit = eodRound(groups[currency].debit);
        const credit = eodRound(groups[currency].credit);
        const difference = eodRound(Math.abs(debit - credit));
        if (eodOverTolerance("OPERATION", Math.min(debit, credit), difference)) result.push({ op, subType, currency, expected: Math.min(debit, credit), actual: Math.max(debit, credit), difference });
      });
    });
  });
  return result;
}

function eodRunOperationReconciliation({ eodId, excludeOpenDiscrepancies, operationIds }, at) {
  const day = eodDayById(eodId);
  if (!day) return [];
  const created = [];
  eodFindOperationImbalances(day, operationIds).forEach((x) => {
    if (excludeOpenDiscrepancies && eodHasBlockingDiscrepancy(eodId, x.op.id, x.currency, "OPERATION", x.subType)) return;
    created.push(
      eodAddDiscrepancy(
        { eodId, reconciliationType: "OPERATION", reconciliationSubType: x.subType, entityType: "OPERATION", entityId: x.op.id, currency: x.currency, fieldName: "Amount", expectedValue: x.expected, actualValue: x.actual, difference: x.difference },
        at
      )
    );
  });
  return created;
}

function eodRunBalanceSnapshotReconciliation({ eodId, accountType, excludeOpenDiscrepancies, balanceSnapshotIds }, at) {
  const type = accountType === "VIRTUAL" ? "VIRTUAL_BALANCE" : "REAL_BALANCE";
  const created = [];
  EOD_SNAPSHOTS.filter((s) => s.eodId === eodId && s.accountType === accountType && (!balanceSnapshotIds || balanceSnapshotIds.includes(s.id))).forEach((s) => {
    const expected = eodSnapshotExpected(s);
    const difference = eodSnapshotDifference(s);
    if (!eodOverTolerance(type, expected, difference)) return;
    if (excludeOpenDiscrepancies && eodHasBlockingDiscrepancy(eodId, s.balanceId, s.currency, type, null)) return;
    created.push(
      eodAddDiscrepancy(
        { eodId, reconciliationType: type, entityType: type, entityId: s.balanceId, currency: s.currency, fieldName: "AMOUNT", expectedValue: expected, actualValue: s.closeBalanceAmount, difference, accountRef: { kind: s.accountKind, id: s.accountId } },
        at
      )
    );
  });
  return created;
}

// Полный прогон стадии RECONCILIATION: три проверки параллельно
function eodRunAllReconciliation(eodId, at) {
  return [
    ...eodRunOperationReconciliation({ eodId, excludeOpenDiscrepancies: true }, at),
    ...eodRunBalanceSnapshotReconciliation({ eodId, accountType: "VIRTUAL", excludeOpenDiscrepancies: true }, at),
    ...eodRunBalanceSnapshotReconciliation({ eodId, accountType: "REAL", excludeOpenDiscrepancies: true }, at),
  ];
}

function eodDiscrepanciesOfDay(eodId) {
  return EOD_DISCREPANCIES.filter((d) => d.eodId === eodId);
}

// Решение: DEFERRED и ESCALATED оставляют расхождение в ожидании решения, остальные закрывают его
function eodResolveDiscrepancy(d, resolutionType, comment, adminEmail, at) {
  d.resolutions.push({ id: seedToPaymentUuid(37000 + d.resolutions.length + eodDiscSeq * 7 + EOD_DISCREPANCIES.indexOf(d)), resolutionType, comment: comment || null, adminId: adminEmail, createdDate: at, createdAt: formatDateTime(at) });
  d.status = resolutionType === "DEFERRED" || resolutionType === "ESCALATED" ? "PENDING_DECISION" : "RESOLVED";
  d.updatedDate = at;
  d.updatedAt = formatDateTime(at);
}

// ---- Начальные расхождения: история и то, что нашла ранняя ручная сверка сегодня ------------------------------------
(function seedDiscrepancies() {
  const admin = (i) => EOD_APPROVERS[i % EOD_APPROVERS.length].email;
  const opAt = (i) => VB_OPERATIONS[(i * 41) % VB_OPERATIONS.length].id;
  const virt = ACCOUNTS_VIRTUAL_MOCK.filter((a) => a.status === "ACTIVE");
  const real = ACCOUNTS_REAL_MOCK.filter((a) => a.status === "ACTIVE");
  const opSpec = (k, i, subType, currency, expected, difference) => ({ eodId: EOD_DAYS[k].id, reconciliationType: "OPERATION", reconciliationSubType: subType, entityType: "OPERATION", entityId: opAt(i), currency, fieldName: "Amount", expectedValue: expected, actualValue: eodRound(expected + difference), difference });
  const balSpec = (k, type, acc, currency, expected, difference) => ({ eodId: EOD_DAYS[k].id, reconciliationType: type, entityType: type, entityId: seedToPaymentUuid(38000 + k * 5 + Math.round(difference)), currency, fieldName: "AMOUNT", expectedValue: expected, actualValue: eodRound(expected + difference), difference, accountRef: { kind: acc.kind, id: acc.id } });
  const cases = [
    [opSpec(19, 1, "VIRTUAL_TRANSACTION", "USD", 1500, 12.5), "RESOLVED_CORRECTED", "Пропущена проводка комиссии, добавлена вручную", 0],
    [balSpec(22, "VIRTUAL_BALANCE", virt[3], "EUR", 8420.4, 3.2), "RESOLVED_ACCEPTED", "Разница от округления курса, в пределах допустимого", 1],
    [opSpec(24, 2, "REAL_TRANSACTION", "EUR", 760, 40), "ESCALATED", "Передано финансовому директору, ждём выписку банка", 2],
    [balSpec(25, "REAL_BALANCE", real[2], "USD", 55210, 250), "DISMISSED", "Дубликат расхождения по тому же счёту", 3],
    [opSpec(27, 3, "VIRTUAL_TRANSACTION", "RUB", 98000, 1100), "DEFERRED", "Ждём подтверждения от провайдера", 0],
    [opSpec(28, 4, "REAL_TRANSACTION", "USD", 2300, 15), "RESOLVED_CORRECTED", "Скорректирована сумма проводки", 1],
  ];
  cases.forEach(([spec, resolution, comment, adminIdx], i) => {
    const day = EOD_DAYS.find((d) => d.id === spec.eodId);
    const d = eodAddDiscrepancy(spec, eodMinutes(day.endDatetimePlan, 3 + i));
    eodResolveDiscrepancy(d, resolution, comment, admin(adminIdx), eodMinutes(day.endDatetimeActual, 90 + i * 20));
  });
  // вчерашняя сверка снимков нашла нарушение формулы — принято как допустимое
  const yesterday = EOD_DAYS[EOD_HISTORY_DAYS - 1];
  eodRunBalanceSnapshotReconciliation({ eodId: yesterday.id, accountType: "VIRTUAL", excludeOpenDiscrepancies: true }, eodMinutes(yesterday.endDatetimePlan, 4)).forEach((d) =>
    eodResolveDiscrepancy(d, "RESOLVED_ACCEPTED", "Разница подтверждена бухгалтерией", admin(2), eodMinutes(yesterday.endDatetimeActual, 120))
  );
  // на текущем дне: в проводках двух операций нарушен баланс, сегодняшняя ручная сверка нашла первую
  const active = eodActiveDay();
  const candidates = VB_OPERATIONS.filter((op) => op.createdDate >= active.startDatetime && op.realLegs.length >= 2 && op.realLegs.every((l) => l.status === "CONFIRMED"));
  if (candidates[0]) candidates[0].realLegs[0].amount = eodRound(candidates[0].realLegs[0].amount + 137.5);
  const earlier = new Date(MOCK_NOW.getTime() - 3 * 60 * 60 * 1000);
  eodRunOperationReconciliation({ eodId: active.id, excludeOpenDiscrepancies: true }, earlier);
  eodRunBalanceSnapshotReconciliation({ eodId: active.id, accountType: "VIRTUAL", excludeOpenDiscrepancies: true }, earlier);
  if (candidates[1]) candidates[1].realLegs[0].amount = eodRound(candidates[1].realLegs[0].amount + 60);
})();

// ---- Движок закрытия дня ---------------------------------------------------------------------------------------------------------------
function eodStageConfig(type) {
  return EOD_CONFIG.stageConfigs.find((c) => c.stageType === type);
}

// Стадии дня в порядке конфигурации; ещё не созданные показываем как ожидающие
function eodStagesOf(day) {
  return EOD_CONFIG.stageConfigs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cfg) => day.stages.find((s) => s.stage === cfg.stageType) || { id: null, eodId: day.id, stage: cfg.stageType, status: "PENDING", approvedBy: null, approvedAt: null, startedAt: null, endedAt: null });
}

// Запуск закрытия админом (vabsStartEodCloseProcess): подходит день OPEN/FAILED без
// начатого закрытия, у которого closeType совпадает с config.initializingProcess
// (тип AUTO не исключается — админ может запустить и его, если он совпал с конфигом)
function eodCanStartClose(day) {
  return !!day && day.isActive && (day.status === "OPEN" || day.status === "FAILED") && !day.closingProcessStarted && day.closeType === EOD_CONFIG.initializingProcess;
}

// endedBy в ядре пишется в момент СТАРТА закрытия (id админа), а не при закрытии.
// Стадии у открытого дня уже есть (BOD выполнен, ODO ждёт) — старт подтверждает
// текущую стадию, дальше стадии идут синхронно друг за другом.
function eodStartClose(day, adminEmail) {
  const now = pdNow();
  day.closingProcessStarted = true;
  day.endedBy = adminEmail || CURRENT_ADMIN.email;
  day.status = "CLOSING_PROCESS";
  day.failedMessage = null;
  day.updatedDate = now;
  day.updatedAt = formatDateTime(now);
  const current = day.stages.find((s) => s.id === day.currentStageId) || day.stages[1];
  return eodProcessStage(day, current);
}

// Число нерешённых расхождений дня (DETECTED / PENDING_DECISION)
function eodUnresolvedCount(day) {
  return EOD_DISCREPANCIES.filter((d) => d.eodId === day.id && d.status !== "RESOLVED").length;
}

// Обработка стадии админом (processStage): ODO/EOTI/EOD завершаются;
// RECONCILIATION заново гоняет сверку и завершается, только если нерешённых
// расхождений нет — иначе остаётся AWAITING_APPROVAL (подтверждение "ничего не делает").
function eodProcessStage(day, stage) {
  stage.startedAt = stage.startedAt || pdNow();
  if (stage.stage === "RECONCILIATION") {
    stage.foundDiscrepancies = eodRunAllReconciliation(day.id, pdNow()).length;
    if (eodUnresolvedCount(day) > 0) {
      stage.status = "AWAITING_APPROVAL";
      day.status = "AWAITING_APPROVAL";
      return { ok: false, blocked: true };
    }
  }
  eodCompleteStage(day, stage);
  return { ok: true, blocked: false };
}

// Автоматический запуск стадии после завершения предыдущей (executeStage)
function eodExecuteStage(day, stage) {
  const cfg = eodStageConfig(stage.stage);
  stage.startedAt = pdNow();
  day.currentStageId = stage.id;
  stage.foundDiscrepancies = 0;
  if (stage.stage === "ODO") {
    // ODO всегда остаётся RUNNING и ждёт ручного подтверждения
    stage.status = "RUNNING";
    return;
  }
  if (stage.stage === "RECONCILIATION") {
    stage.foundDiscrepancies = eodRunAllReconciliation(day.id, pdNow()).length;
    // при вызове админом: ждёт подтверждения, только если остались нерешённые расхождения
    if (eodUnresolvedCount(day) > 0) {
      stage.status = "AWAITING_APPROVAL";
      day.status = "AWAITING_APPROVAL";
      return;
    }
    eodCompleteStage(day, stage);
    return;
  }
  if (cfg.isAwaitingApproval && stage.stage === "EOD") {
    stage.status = "AWAITING_APPROVAL";
    day.status = "AWAITING_APPROVAL";
    return;
  }
  if (cfg.isAwaitingApproval && stage.stage === "EOTI") {
    stage.status = "AWAITING_APPROVAL";
    day.status = "AWAITING_APPROVAL";
    return;
  }
  eodCompleteStage(day, stage);
}

// approvedBy/approvedAt в ядре не заполняются — здесь тоже
function eodCompleteStage(day, stage) {
  const now = pdNow();
  stage.status = "COMPLETED";
  stage.endedAt = now;
  day.status = "CLOSING_PROCESS";
  const next = day.stages[day.stages.indexOf(stage) + 1];
  if (next) eodExecuteStage(day, next);
  else eodCloseDay(day);
}

// vabsManualApproveEodStage: подтверждается ТЕКУЩАЯ стадия дня (тип должен совпасть);
// статус AWAITING_APPROVAL мутация не проверяет — подтверждаются и RUNNING (ODO), и FAILED
function eodApproveStage(day, stageType) {
  const stage = day.stages.find((s) => s.id === day.currentStageId);
  if (!stage || stage.stage !== stageType || stage.status === "COMPLETED") return { ok: false, blocked: false };
  return eodProcessStage(day, stage);
}

// Перепроверка при решении RESOLVED_CORRECTED: если расхождение всё ещё есть —
// ядро кидает RECONCILIATION_DISCREPANCY_STILL_MISMATCH
function eodStillMismatch(d) {
  const day = eodDayById(d.eodId);
  if (!day) return false;
  if (d.entityType === "OPERATION") return eodFindOperationImbalances(day, [d.entityId]).length > 0;
  const accountType = d.entityType === "VIRTUAL_BALANCE" ? "VIRTUAL" : "REAL";
  return EOD_SNAPSHOTS.some((s) => s.eodId === d.eodId && s.accountType === accountType && s.balanceId === d.entityId && eodOverTolerance(d.entityType, eodSnapshotExpected(s), eodSnapshotDifference(s)));
}

// Закрытие: день закрыт и получает хеш, следующий день открывается, создаётся новый плановый
function eodCloseDay(day) {
  const now = pdNow();
  day.status = "CLOSED";
  day.isActive = false;
  day.endDatetimeActual = now;
  day.stats = eodDayStats(Object.assign({}, day, { stats: null }));
  const previous = eodDayById(day.previousEodId);
  day.hash = ktHex(31000 + EOD_DAYS.indexOf(day) + (previous && previous.hash ? previous.hash.charCodeAt(3) : 0), 64);
  day.hashComputedAt = now;
  day.updatedDate = now;
  day.updatedAt = formatDateTime(now);
  const next = eodDayById(day.nextEodId);
  if (!next) return;
  next.status = "OPEN";
  next.isActive = true;
  next.startDatetime = now;
  next.closeType = EOD_CONFIG.initializingProcess;
  next.endDatetimePlan = eodCalcPlan(now, EOD_CONFIG);
  next.updatedDate = now;
  next.updatedAt = formatDateTime(now);
  eodInitOpenStages(next, now); // BOD нового дня: выполнен, ODO ждёт подтверждения
  const created = eodStamp(
    { id: seedToPaymentUuid(30000 + EOD_DAYS.length), code: entityCode("EOD", 30000 + EOD_DAYS.length), status: "PLANNED", isActive: false, closingProcessStarted: false, closeType: EOD_CONFIG.initializingProcess, startDatetime: null, endDatetimePlan: null, endDatetimeActual: null, endedBy: null, failedMessage: null, hash: null, hashComputedAt: null, previousEodId: next.id, nextEodId: null, currentStageId: null, stages: [], stats: null },
    now
  );
  next.nextEodId = created.id;
  EOD_DAYS.push(created);
}

// Проверка целостности: пересчёт хеша сравнивается с сохранённым; без хеша — false
function eodVerifyHash(day) {
  return !!day.hash;
}

// Первый операционный день при инициализации системы (одноразово)
function eodCreateFirst() {
  if (EOD_DAYS.length) return null;
  const now = pdNow();
  const open = eodStamp({ id: seedToPaymentUuid(30000), code: entityCode("EOD", 30000), status: "OPEN", isActive: true, closingProcessStarted: false, closeType: EOD_CONFIG.initializingProcess, startDatetime: now, endDatetimePlan: eodCalcPlan(now, EOD_CONFIG), endDatetimeActual: null, endedBy: null, failedMessage: null, hash: null, hashComputedAt: null, previousEodId: null, nextEodId: null, currentStageId: null, stages: [], stats: null }, now);
  const planned = eodStamp({ id: seedToPaymentUuid(30001), code: entityCode("EOD", 30001), status: "PLANNED", isActive: false, closingProcessStarted: false, closeType: EOD_CONFIG.initializingProcess, startDatetime: null, endDatetimePlan: null, endDatetimeActual: null, endedBy: null, failedMessage: null, hash: null, hashComputedAt: null, previousEodId: open.id, nextEodId: null, currentStageId: null, stages: [], stats: null }, now);
  open.nextEodId = planned.id;
  EOD_DAYS.push(open, planned);
  eodInitOpenStages(open, now);
  return open;
}
