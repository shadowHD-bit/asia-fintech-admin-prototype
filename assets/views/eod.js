/* ==========================================================================
   "Операционный день" (EOD): дашборд, дни работы, снимки балансов, расхождения сверки
   и настройки (день, сверка) в "Настройки системы → Операционный день".
   Спецификация: docs/eod-spec.md; данные и движок закрытия — mock/eod.mock.js.
   Списки построены на createAccessList, формы и подтверждения — на хелперах vb*.
   ========================================================================== */

function ed(path) {
  return t(`eod.${path}`);
}

function eodEnum(group, value) {
  const dict = ed(`enums.${group}`);
  return (dict && value != null && dict[value]) || (value == null ? "" : value);
}

function eodRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^eod-(days|discrepancies)\/(.+)$/);
  return m ? { kind: m[1] === "days" ? "day" : "discrepancy", id: decodeURIComponent(m[2]) } : null;
}

function eodStatusBadge(s) {
  const cls = { PLANNED: "badge-neutral", OPEN: "badge-info", CLOSING_PROCESS: "badge-info", AWAITING_APPROVAL: "badge-warning", CLOSED: "badge-success", FAILED: "badge-danger" }[s] || "badge-neutral";
  return `<span class="badge ${cls}">${eodEnum("status", s)}</span>`;
}

function eodStageBadge(s) {
  const cls = { PENDING: "badge-neutral", RUNNING: "badge-info", RETRIED: "badge-info", COMPLETED: "badge-success", AWAITING_APPROVAL: "badge-warning", FAILED: "badge-danger", ROLLBACK: "badge-warning" }[s] || "badge-neutral";
  return `<span class="badge ${cls}">${eodEnum("stageStatus", s)}</span>`;
}

function eodDiscBadge(s) {
  const cls = { DETECTED: "badge-danger", PENDING_DECISION: "badge-warning", RESOLVED: "badge-success" }[s] || "badge-neutral";
  return `<span class="badge ${cls}">${eodEnum("discStatus", s)}</span>`;
}

function eodDt(d) {
  return d ? dateTimeCell(formatDateTime(d)) : `<span class="table-cell-muted">—</span>`;
}

// Как dateTimeCell, но на <span> с display:flex вместо <div> — чтобы можно было безопасно
// вложить в <button> (используется, когда дата сама становится ссылкой на день).
function eodDtInline(d) {
  if (!d) return `<span class="table-cell-muted">—</span>`;
  const [datePart, timePart] = formatDateTime(d).split(" ");
  return `<span class="dt-cell"><span class="dt-date">${datePart}</span><span class="dt-time">${timePart}</span></span>`;
}

function eodDtText(d) {
  return d ? formatDateTime(d) : "—";
}

function eodMoney(value, currency) {
  return `${formatPaymentAmount(value)} ${currency}`;
}

function eodDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} ${ed("units.h")} ${pad2(m % 60)} ${ed("units.m")}` : `${m} ${ed("units.m")}`;
}

function eodDayDate(day) {
  return day.startDatetime ? formatDateTime(day.startDatetime).split(" ")[0] : ed("day.notOpened");
}

function eodDayLabel(day) {
  return `${eodDayDate(day)} · ${day.code}`;
}

function eodDayLink(day) {
  return day ? vbLink(`#/eod-days/${day.id}`, `${eodDayDate(day)}<span class="table-cell-muted"> · ${day.code}</span>`) : "—";
}

function eodAdminCell(email) {
  if (!email) return `<span class="table-cell-muted">${ed("day.auto")}</span>`;
  const a = eodAdminByEmail(email);
  return a ? vbLink(`#/settings-access/admin/${a.id}`, pdEscape(a.name)) : pdEscape(email);
}

function eodVolumeCell(stats) {
  if (!stats.volumes.length) return `<span class="table-cell-muted">—</span>`;
  return `<div class="identity-cell">${stats.volumes.map((v) => `<span class="acc-money">${eodMoney(v.amount, v.currency)}</span>`).join("")}</div>`;
}

function eodVolumeInline(stats) {
  return stats.volumes.length ? stats.volumes.map((v) => eodMoney(v.amount, v.currency)).join(" · ") : "—";
}

function eodStageName(type) {
  return eodEnum("stage", type);
}

function eodOpenCount(eodId) {
  return eodDiscrepanciesOfDay(eodId).filter(eodIsOpenDiscrepancy).length;
}

function eodChecklist(id, label, on, hint) {
  return switchRowHtml(id, label, on, { cls: "vb-field", hint });
}

function eodResultModal(title, text, actionLabel, actionHash) {
  openModal({
    title,
    width: 420,
    bodyHtml: `<p class="modal-confirm-text">${text}</p>`,
    footerHtml: `${actionHash ? `<button type="button" class="btn-secondary" id="eod-result-go">${actionLabel}</button>` : ""}<button type="button" class="btn-primary" id="eod-result-ok">${vt("common.close")}</button>`,
    onMount: (el) => {
      el.querySelector("#eod-result-ok").addEventListener("click", () => { closeModal(); render(); });
      const go = el.querySelector("#eod-result-go");
      if (go) go.addEventListener("click", () => { closeModal(); window.location.hash = actionHash; });
    },
  });
}

// Расхождение в таблицах: тип сверки и ID в одном блоке — сверху тип (ссылка на расхождение; подтип серым под ним),
// ниже ID с копированием — как операция и ID в списках платежей
function eodDiscIdHeader() {
  return `${ed("columns.reconType")} / ${ed("columns.id")}`;
}

function eodDiscIdCellHtml(d) {
  const sub = d.reconciliationSubType ? `<span class="table-cell-muted">${eodEnum("reconType", d.reconciliationSubType)}</span>` : "";
  return `<div class="identity-cell"><div class="identity-cell-primary">${vbLink(`#/eod-discrepancies/${d.id}`, eodEnum("reconType", d.reconciliationType))}</div>${sub}<div class="identity-cell-sub"><span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>${vbCodeCell(d.code)}</div></div>`;
}

// ==== Дашборд ==============================================================================================
// Кастомная подсказка "инфо" у этапа (вместо нативного title): название, что делает этап, по шагам, что дальше.
// Раскрывается по наведению и по фокусу с клавиатуры.
function eodStageInfoHtml(stage) {
  const info = ed("enums.stageInfo")[stage];
  const name = eodStageName(stage);
  if (!info) return "";
  return `<span class="ed-step-help" tabindex="0" role="button" aria-label="${pdEscape(name)}">i<span class="ed-step-tip" role="tooltip">
    <strong class="ed-tip-title">${name}</strong>
    <span class="ed-tip-what">${info.what}</span>
    <ul class="ed-tip-list">${info.steps.map((s) => `<li>${s}</li>`).join("")}</ul>
    <span class="ed-tip-next">${info.next}</span>
  </span></span>`;
}

function eodStepperHtml(day) {
  const stages = eodStagesOf(day);
  return `<div class="ed-steps">${stages
    .map((s, i) => {
      const cls = s.status === "COMPLETED" ? "is-done" : s.status === "AWAITING_APPROVAL" ? "is-awaiting" : s.status === "RUNNING" || s.status === "RETRIED" ? "is-running" : s.status === "FAILED" ? "is-failed" : "";
      const approve = s.status === "AWAITING_APPROVAL" ? `<button type="button" class="btn-primary vb-row-btn" data-ed-approve="${s.stage}">${ed("dash.approve")}</button>` : "";
      const time = s.endedAt ? `${ed("fields.endedAt")}: ${eodDtText(s.endedAt)}` : s.startedAt ? `${ed("fields.startedAt")}: ${eodDtText(s.startedAt)}` : ed("dash.notStarted");
      // деталей смотреть нечего, пока этап ещё не начался (PENDING) — startedAt/
      // endedAt пустые, найденных расхождений тоже ещё нет
      const details = s.status !== "PENDING" ? `<button type="button" class="table-link ed-step-link" data-ed-stage="${s.stage}">${ed("dash.details")}</button>` : "";
      return `<div class="ed-step ${cls}">
        ${eodStageInfoHtml(s.stage)}
        <div class="ed-step-head"><span class="ed-step-no">${i + 1}</span><strong>${eodStageName(s.stage)}</strong></div>
        <div>${eodStageBadge(s.status)}</div>
        <div class="ed-step-time table-cell-muted">${time}</div>
        <div class="ed-step-actions">${details}${approve}</div>
      </div>`;
    })
    .join("")}</div>`;
}

// Сравнение активного дня с предыдущим (vabsActiveVsPrevious…) — только
// карточки-цифры, без графика (по образцу реального дашборда: там график
// "Хронология объёма операций" стоит рядом, но здесь его сознательно не
// делаем). Объём — сумма по нескольким валютам сразу, честно складывать
// нельзя, поэтому там же, где в реальном дашборде стоит "-", у нас тоже "—";
// то же для "Общая разница" — vabsActiveVsPreviousEodDifferenceTotal по
// исследованию бэкенда всегда возвращает нули (заглушка).
function eodDeltaBadge(n) {
  const cls = n > 0 ? "badge-success" : n < 0 ? "badge-danger" : "badge-neutral";
  return `<span class="badge ${cls}">${n > 0 ? "+" : ""}${n}%</span>`;
}

// Карточки статистики — как на остальных экранах (renderMetricCard/.metrics-grid,
// единым блоком с разделителями), а не отдельные карточки с зазорами.
function eodCompareCardHtml(value, label, subHtml) {
  return `<div class="ed-compare-card">
    <div class="ed-compare-value">${value}</div>
    <div class="ed-compare-label">${label}</div>
    ${subHtml ? `<div class="ed-compare-delta">${subHtml}</div>` : ""}
  </div>`;
}

function eodVsLastDayHtml(cmp, c) {
  return `${eodDeltaBadge(cmp.deltaInPercent)}<span class="table-cell-muted">${cmp.previous} ${c.vsLastDay}</span>`;
}

// Верх страницы: операции за день (единым блоком metrics-grid).
function eodCompareOpsCardsHtml(day) {
  const c = ed("dash.compare");
  const ops = eodCompareOperationsTotal(day);
  const pending = eodComparePendingFailedOperations(day);
  return `<div class="metrics-grid is-thirds">
    ${renderMetricCard(ops.current, c.operations, eodVsLastDayHtml(ops, c))}
    ${renderMetricCard(pending.current, c.pendingFailed, eodVsLastDayHtml(pending, c))}
    ${renderMetricCard("—", c.volumeTitle)}
  </div>`;
}

// Блок "Расхождения": та же карточная сетка, но про расхождения — тоже единым блоком.
function eodCompareDiscCardsHtml(day) {
  const c = ed("dash.compare");
  const disc = eodCompareDiscrepanciesTotal(day);
  const res = eodActiveDiscrepanciesResolution(day);
  return `<div class="metrics-grid is-thirds">
    ${renderMetricCard(disc.current, c.discrepancies, eodVsLastDayHtml(disc, c))}
    ${renderMetricCard("—", c.differenceTitle)}
    ${renderMetricCard(`${res.resolved} ${c.of} ${res.resolved + res.unresolved}`, c.resolved, `<span class="table-cell-muted">${res.resolvedPercent}% · ${c.completionRate}</span>`)}
  </div>`;
}

// Объём дня по валютам — компактными чипами под графиком (вместо длинной строки в шапке слева)
function eodVolumeChipsHtml(stats) {
  if (!stats.volumes.length) return "";
  return `<div class="ed-volume"><span class="ed-volume-label">${ed("dash.heroVolume")}</span>${stats.volumes
    .map((v) => `<span class="hm-chip ed-volume-chip"><strong>${formatPaymentAmount(v.amount)}</strong> ${v.currency}</span>`)
    .join("")}</div>`;
}

// Линейный график "операции по дням за неделю": гладкая линия с градиентной заливкой под ней, пунктирная сетка, подписи осей,
// точки с подсказкой по наведению (вертикальная направляющая + значение). Последние 7 рабочих дней до активного включительно.
function eodWeekChartHtml(day) {
  const c = ed("dash");
  const days = EOD_DAYS.filter((x) => x.startDatetime && x.startDatetime <= day.startDatetime)
    .sort((a, b) => a.startDatetime - b.startDatetime)
    .slice(-7);
  const vals = days.map((x) => ({ x, n: eodDayStats(x).operations, label: `${pad2(x.startDatetime.getDate())}.${pad2(x.startDatetime.getMonth() + 1)}` }));
  const rawMax = Math.max(1, ...vals.map((v) => v.n));
  const step = rawMax <= 5 ? 1 : rawMax <= 10 ? 2 : rawMax <= 25 ? 5 : rawMax <= 50 ? 10 : 20;
  const max = Math.ceil(rawMax / step) * step;
  const W = 620, H = 260, L = 16, R = 16, T = 22, B = 32;
  const iw = W - L - R, ih = H - T - B;
  const px = (i) => L + (vals.length > 1 ? (i / (vals.length - 1)) * iw : iw / 2);
  const py = (n) => T + ih - (n / max) * ih;
  const pts = vals.map((v, i) => [px(i), py(v.n)]);
  let path = pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    path += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  const base = T + ih;
  const area = pts.length ? `${path} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z` : "";
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const grid = ticks.map((v) => `<line class="ed-chart-grid${v === 0 ? " is-base" : ""}" x1="${L}" x2="${W - R}" y1="${py(v)}" y2="${py(v)}"/>`).join("");
  const xs = vals.map((v, i) => `<text class="ed-chart-tick${v.x.id === day.id ? " is-active" : ""}" x="${px(i)}" y="${H - 8}" text-anchor="middle">${v.label}</text>`).join("");
  const colW = vals.length > 1 ? iw / (vals.length - 1) : iw;
  const points = vals
    .map((v, i) => {
      const x = px(i), y = py(v.n);
      const tipW = 94, tipX = Math.min(Math.max(x - tipW / 2, L), W - R - tipW);
      return `<g class="ed-pt${v.x.id === day.id ? " is-active" : ""}">
        <rect class="ed-pt-hit" x="${x - colW / 2}" y="${T}" width="${colW}" height="${ih}"/>
        <line class="ed-pt-guide" x1="${x}" x2="${x}" y1="${T}" y2="${base}"/>
        <circle class="ed-chart-dot" cx="${x}" cy="${y}" r="${v.x.id === day.id ? 4.5 : 3.2}"/>
        <g class="ed-pt-tip"><rect x="${tipX}" y="${Math.max(0, y - 32)}" width="${tipW}" height="20" rx="6"/><text x="${tipX + tipW / 2}" y="${Math.max(0, y - 32) + 13.5}" text-anchor="middle">${v.n} ${c.chartOps} · ${v.label}</text></g>
      </g>`;
    })
    .join("");
  return `<div class="ed-chart-box">
    <svg class="ed-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${c.chartTitle}">
      <defs><linearGradient id="ed-area-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4f6bff" stop-opacity="0.28"/><stop offset="100%" stop-color="#4f6bff" stop-opacity="0"/></linearGradient>
      <linearGradient id="ed-line-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#7c8cff"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient></defs>
      ${grid}<path class="ed-chart-area" d="${area}"/><path class="ed-chart-line" d="${path}"/>${points}${xs}
    </svg></div>`;
}
// Дашборд по образцу главной: голубая шапка (заголовок, статус, период, ключевые цифры, кнопка закрытия дня) и справа вместо
// карты — график операций по дням за неделю; ниже: шаги текущего дня → основная информация → последние расхождения.
// Статистика (сравнение с предыдущим днём, карточки операций и расхождений) живёт в "Аналитика → Дашборды → Операционный день".
function viewEodDashboard() {
  const day = eodActiveDay();
  if (!day) {
    const head = `<div class="list-hero">${pageHeader(ed("titles.dashboard"), t("navDescriptions.eod-dashboard"))}</div>`;
    return `${head}<div class="empty-state empty-state-centered"><div class="empty-state-text-group"><div class="empty-state-title">${ed("dash.emptyTitle")}</div><div class="empty-state-text">${ed("dash.emptyText")}</div></div><button type="button" class="btn-primary" id="ed-create-first">${ed("dash.createFirst")}</button></div>`;
  }
  const next = eodDayById(day.nextEodId);
  const stats = eodDayStats(day);
  const canStart = eodCanStartClose(day);
  let startHint = "";
  if (!canStart && day.status === "OPEN") startHint = ed("dash.hintMismatch");
  const openDisc = eodOpenCount(day.id);
  const fields = `<div class="profile-fields profile-fields-grid">
    ${copyableField(ed("fields.id"), day.code)}${detailField(ed("fields.closingStarted"), day.closingProcessStarted ? vt("common.yes") : vt("common.no"))}
    ${detailField(ed("fields.start"), eodDtText(day.startDatetime))}${detailField(ed("fields.planEnd"), eodDtText(day.endDatetimePlan))}
    ${detailField(ed("fields.closeType"), eodEnum("closeType", day.closeType))}${detailField(ed("fields.nextDay"), next ? eodDayLink(next) : "—")}
  </div>`;
  // "Запустить сверку" отдельной кнопкой не нужна: сверка и так выполняется автоматически на этапе RECONCILIATION при
  // закрытии дня, и после неё в любом случае требуется подтверждение. "Открыть день" убрана: активный день технически
  // никогда не бывает CLOSED, карточку любого дня можно открыть из списка "Дни работы". Кнопка закрытия дня — в шапке.
  const hero = `<div class="hm-hero ed-hero">
    <div class="hm-hero-main">
      <div class="ed-hero-title"><h1 class="hm-hello">${ed("titles.dashboard")}</h1>${eodStatusBadge(day.status)}</div>
      <div class="hm-date">${eodDtText(day.startDatetime)} → ${eodDtText(day.endDatetimePlan)}</div>
      <p class="hm-lead">${t("navDescriptions.eod-dashboard")}</p>
      <div class="hm-pills">
        <span class="hm-pill"><strong>${stats.operations}</strong> ${ed("dash.heroOps")}</span>
        <span class="hm-pill${openDisc ? " is-warn" : ""}"><strong>${openDisc}</strong> ${ed("dash.heroOpenDisc")}</span>
      </div>
      <div class="ed-actions">
        ${canStart ? `<button type="button" class="btn-primary" id="ed-start">${ed("dash.startClose")}</button>` : ""}
        <button type="button" class="btn-secondary" id="ed-dash-pdf">${DOWNLOAD_ICON_SVG}<span>${ed("dash.exportPdf")}</span></button>
        ${startHint ? `<span class="table-cell-muted ed-hint">${startHint}</span>` : ""}
      </div>
    </div>
    <div class="hm-hero-map">${eodWeekChartHtml(day)}${eodVolumeChipsHtml(stats)}</div>
  </div>`;
  const recent = eodDiscrepanciesOfDay(day.id).slice().sort((a, b) => b.createdDate - a.createdDate);
  const recentRows = recent.map((d) => [eodDiscIdCellHtml(d), dateTimeCell(d.createdAt), eodDiscBadge(d.status)]);
  const recentBlock = vbMiniTable([eodDiscIdHeader(), ed("columns.created"), ed("columns.status")], recentRows, ed("dash.noDisc"));
  // "Все →" — ссылка справа в строке заголовка секции (вместо строки под таблицей)
  const seeAll = `<span class="ed-see-all">${vbLink("#/eod-discrepancies", `${ed("dash.allShort")} →`)}</span>`;
  return `<div id="ed-root">${hero}
    <div class="profile-flat-block" id="ed-dash-body">
      ${flatSection(ed("dash.stepsTitle"), eodStepperHtml(day))}
      ${flatSection(ed("dash.mainInfo"), fields)}
      ${flatSection(ed("dash.recent"), recentBlock, null, ed("dash.recentDesc"), seeAll)}
    </div>
  </div>`;
}
// PDF дашборда: график и объём из шапки + шаги, основная информация и последние расхождения (то, что на экране)
function exportEodDashboardPdf(day) {
  const body = document.getElementById("ed-dash-body");
  if (!body) return;
  const chart = document.querySelector(".ed-hero .ed-chart-box");
  const volume = document.querySelector(".ed-hero .ed-volume");
  const name = `${ed("titles.dashboard")} ${eodDayDate(day)}`;
  const meta = `${eodEnum("status", day.status)} · ${eodDtText(day.startDatetime)} → ${eodDtText(day.endDatetimePlan)} · ID: ${day.code}`;
  const html = `${chart ? chart.outerHTML : ""}${volume ? volume.outerHTML : ""}${body.innerHTML}`;
  exPrintHtml(exPdfHtml(`${name} | ${day.code}`, name, meta, html), `${name} | ${day.code}`);
}

function initEodDashboard() {
  const root = document.getElementById("ed-root");
  const day = eodActiveDay();
  if (!day) {
    const b = document.getElementById("ed-create-first");
    if (b) b.addEventListener("click", () => vbConfirm({ title: ed("dash.createFirstTitle"), text: ed("dash.createFirstText"), confirmLabel: ed("dash.createFirst"), danger: false, onConfirm: () => { eodCreateFirst(); render(); } }));
    return;
  }
  if (!root) return;
  vbAttachCommon(root);
  const dashPdf = document.getElementById("ed-dash-pdf");
  if (dashPdf) dashPdf.addEventListener("click", () => exportEodDashboardPdf(day));
  const start = document.getElementById("ed-start");
  if (start) start.addEventListener("click", () => vbConfirm({ title: ed("dash.startTitle"), text: ed("dash.startText"), confirmLabel: ed("dash.startClose"), danger: true, onConfirm: () => requireAdmin2fa("eod_close_start", () => { eodStartClose(day); render(); showToast(t("toast.dayCloseStarted")); }) }));
  root.querySelectorAll("[data-ed-approve]").forEach((b) => b.addEventListener("click", () => eodOpenApprove(day, b.dataset.edApprove)));
  root.querySelectorAll("[data-ed-stage]").forEach((b) => b.addEventListener("click", () => eodOpenStageDetails(day, b.dataset.edStage)));
}

function eodOpenApprove(day, stageType) {
  const open = eodOpenCount(day.id);
  vbConfirm({
    title: ed("dash.approveTitle"),
    text: stageType === "RECONCILIATION" && open ? ed("dash.approveReconText")(eodStageName(stageType), open) : ed("dash.approveText")(eodStageName(stageType)),
    confirmLabel: ed("dash.approve"),
    danger: false,
    onConfirm: () => {
      const r = eodApproveStage(day, stageType);
      // сверка с нерешённым расхождением: этап остаётся на подтверждении
      if (r.blocked) eodResultModal(ed("dash.approveBlockedTitle"), ed("dash.approveBlockedText")(eodOpenCount(day.id)), ed("dash.allDisc"), "#/eod-discrepancies");
      else { render(); showToast(t("toast.stageApproved")); }
    },
  });
}

function eodOpenStageDetails(day, stageType) {
  const s = eodStagesOf(day).find((x) => x.stage === stageType);
  const cfg = eodStageConfig(stageType);
  const found = s.stage === "RECONCILIATION" && s.foundDiscrepancies != null ? detailField(ed("dash.foundDisc"), s.foundDiscrepancies) : "";
  openModal({
    title: `${eodStageName(stageType)} · ${eodEnum("stageStatus", s.status)}`,
    width: 560,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${(ed("enums.stageInfo")[stageType] || {}).what || eodEnum("stageDesc", stageType)}</p>
      <div class="profile-fields profile-fields-grid">
        ${detailField(ed("fields.order"), cfg.order)}${detailField(ed("fields.requiresApproval"), cfg.isAwaitingApproval ? vt("common.yes") : vt("common.no"))}
        ${detailField(ed("fields.status"), eodStageBadge(s.status))}${detailField(ed("fields.startedAt"), eodDtText(s.startedAt))}
        ${detailField(ed("fields.endedAt"), eodDtText(s.endedAt))}${found}
      </div>`,
    footerHtml: `<button type="button" class="btn-primary" id="ed-stage-ok">${vt("common.close")}</button>`,
    onMount: (el) => {
      el.querySelector("#ed-stage-ok").addEventListener("click", closeModal);
      vbAttachRows(el);
    },
  });
}

// ==== Дни работы ==============================================================================================
const eodDaysList = createAccessList({
  key: "eod-days",
  // Своя кнопка экспорта у каждой подвкладки истории — в строке поиска и фильтров, справа
  headerAction: () => `<span class="filters-bar-end">${exportMenuHtml("ed-days-export", ed("histExport.button"), ed("histExport.hintDays"))}</span>`,
  attachHeaderAction: () => bindExportMenu("ed-days-export", openEodHistoryExportModal),
  data: () => EOD_DAYS,
  searchPlaceholder: () => ed("days.search"),
  searchText: (d) => [d.id, d.code, d.hash, d.endedBy, (eodAdminByEmail(d.endedBy) || {}).name].filter(Boolean).join(" "),
  tab: { get: (d) => d.status, values: EOD_STATUSES, label: (v) => eodEnum("status", v) },
  filters: [
    { id: "start", kind: "date", label: () => ed("filters.start"), get: (d) => d.startDatetime },
    { id: "planEnd", kind: "date", label: () => ed("filters.planEnd"), get: (d) => d.endDatetimePlan },
    { id: "end", kind: "date", label: () => ed("filters.end"), get: (d) => d.endDatetimeActual },
    { id: "closeType", kind: "multi", label: () => ed("filters.closeType"), get: (d) => d.closeType, options: () => EOD_CLOSE_TYPES.map((v) => ({ value: v, label: eodEnum("closeType", v) })) },
    { id: "closedBy", kind: "multi", label: () => ed("filters.closedBy"), get: (d) => d.endedBy || "", options: () => [{ value: "", label: ed("day.auto") }, ...EOD_APPROVERS.map((a) => ({ value: a.email, label: a.name }))] },
    { id: "hash", kind: "multi", label: () => ed("filters.hash"), get: (d) => (d.hash ? "yes" : "no"), options: () => [{ value: "yes", label: ed("day.hashYes") }, { value: "no", label: ed("day.hashNo") }] },
  ],
  defaultSort: (a, b) => (b.startDatetime ? b.startDatetime.getTime() : Infinity) - (a.startDatetime ? a.startDatetime.getTime() : Infinity),
  sorts: {
    start: (a, b) => (a.startDatetime ? a.startDatetime.getTime() : Infinity) - (b.startDatetime ? b.startDatetime.getTime() : Infinity),
    end: (a, b) => (a.endDatetimeActual ? a.endDatetimeActual.getTime() : Infinity) - (b.endDatetimeActual ? b.endDatetimeActual.getTime() : Infinity),
  },
  columns: [
    {
      label: () => ed("columns.start"),
      sort: "start",
      html: (d) => `
        <div class="identity-cell">
          <div class="identity-cell-primary">${vbLink(`#/eod-days/${d.id}`, eodDtInline(d.startDatetime))}</div>
          <div class="identity-cell-sub">
            <span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>
            <button type="button" class="id-copy" data-copy-value="${d.code}" title="${t("clientsUsers.copy")}">
              <span class="id-copy-label">${d.code}</span>
              ${COPY_ICON_SVG}
            </button>
          </div>
        </div>`,
    },
    { label: () => ed("columns.end"), sort: "end", html: (d) => eodDt(d.endDatetimeActual) },
    { label: () => ed("columns.elapsed"), html: (d) => (d.endDatetimeActual ? eodDuration(d.endDatetimeActual - d.startDatetime) : `<span class="table-cell-muted">—</span>`) },
    { label: () => ed("columns.operations"), html: (d) => (d.startDatetime ? eodDayStats(d).operations : "—") },
    { label: () => ed("columns.volume"), html: (d) => (d.startDatetime ? eodVolumeCell(eodDayStats(d)) : "—") },
    { label: () => ed("columns.status"), html: (d) => `<div class="identity-cell">${eodStatusBadge(d.status)}<span class="table-cell-muted">${eodEnum("closeType", d.closeType)}</span></div>` },
  ],
  attachRows: vbAttachRows,
});

// Дни работы и снимки балансов — общая вкладка "История" с двумя подвкладками:
// "История по дням" и "История по снимкам" (createAccessList у каждого свой,
// просто переключаем, чья разметка сейчас в #eod-history-content).
let eodHistoryTab = "days"; // "days"|"snapshots"

// Ссылки "Открыть снимки" (со страницы дня, со страницы расхождения по
// балансу) ведут на подвкладку "История по снимкам" общей "Истории".
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-eod-open-snapshots]");
  if (!btn) return;
  eodHistoryTab = "snapshots";
  window.location.hash = "#/eod-history";
});

function eodHistoryTabsBarHtml() {
  const c = ed("history");
  return `<div class="cd-subtabs">
    <button type="button" class="cd-subtab${eodHistoryTab === "days" ? " is-active" : ""}" data-eod-history-tab="days"><span>${c.tabDays}</span></button>
    <button type="button" class="cd-subtab${eodHistoryTab === "snapshots" ? " is-active" : ""}" data-eod-history-tab="snapshots"><span>${c.tabSnapshots}</span></button>
  </div>`;
}

function eodHistoryTabContentHtml() {
  return eodHistoryTab === "days" ? eodDaysList.view() : eodSnapshotsList.view();
}

// eodHistoryTab не сбрасывается на "Дни" при каждом заходе: так работает
// переход по ссылке "Открыть снимки" (выставляет "snapshots" и уходит на
// #/eod-history) — иначе сброс тут же вернул бы обратно на "Дни".
// ---- Экспорт истории (CSV / XLSX): выгружается список активной подвкладки ("по дням" или "по снимкам") с учётом её поиска,
// таба, фильтров и сортировки, без учёта страницы. Перед выгрузкой — модалка с итогом. ----------------------------------
function eodHistoryExportCtx() {
  const days = eodHistoryTab === "days";
  const c = ed("history");
  return { days, list: days ? eodDaysList : eodSnapshotsList, name: days ? c.tabDays : c.tabSnapshots };
}

function openEodHistoryExportModal(format) {
  const x = ed("histExport");
  const { days, list, name } = eodHistoryExportCtx();
  const count = list.exportRows().length;
  const lines = list.filterLines();
  const tab = list.tabValue();
  if (tab) lines.unshift(days ? `${ed("columns.status")}: ${eodEnum("status", tab)}` : `${x.accountType}: ${eodEnum("accountType", tab)}`);
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: `${x.modalTitle}: ${name}`,
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(list.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); list.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportEodHistory(format); });
    },
  });
}

function exportEodHistory(format) {
  const x = ed("histExport");
  const { days, list } = eodHistoryExportCtx();
  const items = list.exportRows();
  let rows;
  if (days) {
    rows = items.map((d) => [
      d.code, eodDtText(d.startDatetime), eodDtText(d.endDatetimeActual), d.endDatetimeActual && d.startDatetime ? eodDuration(d.endDatetimeActual - d.startDatetime) : "",
      d.startDatetime ? eodDayStats(d).operations : "", d.startDatetime ? eodVolumeInline(eodDayStats(d)) : "", eodEnum("status", d.status), eodEnum("closeType", d.closeType),
      eodDtText(d.endDatetimePlan), (eodAdminByEmail(d.endedBy) || {}).name || d.endedBy || "",
    ]);
  } else {
    rows = items.map((s) => {
      const day = eodDayById(s.eodId);
      const acc = accFind(s.accountKind, s.accountId);
      return [
        s.id, day ? eodDayLabel(day) : "", acc ? accTitle(acc) : s.accountId, eodEnum("accountType", s.accountType), s.currency,
        s.openBalanceAmount, s.runningDeltaAmount, s.closeBalanceAmount, s.debitTurnover, s.creditTurnover,
        eodSnapshotDifference(s) === 0 ? ed("snap.formulaFilterOk") : ed("snap.formulaFilterBad"), s.isActive ? vt("common.yes") : vt("common.no"),
      ];
    });
  }
  exportTable(`${days ? "eod_days" : "eod_snapshots"}_${new Date().toISOString().slice(0, 10)}`, format, days ? x.columnsDays : x.columnsSnapshots, rows);
  showToast(x.done(items.length));
}

function viewEodHistory() {
  return `<div class="list-hero">${pageHeader(ed("titles.history"), t("navDescriptions.eod-history"))}</div>
    <div class="cd-tabs-wrap" id="eod-history-tabs">${eodHistoryTabsBarHtml()}</div>
    <div id="eod-history-content">${eodHistoryTabContentHtml()}</div>`;
}

function initEodHistory() {
  const tabsWrap = document.getElementById("eod-history-tabs");
  const content = document.getElementById("eod-history-content");
  if (!tabsWrap || !content) return;
  const bindContent = () => (eodHistoryTab === "days" ? eodDaysList : eodSnapshotsList).init();
  const bindTabs = () =>
    tabsWrap.querySelectorAll("[data-eod-history-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        eodHistoryTab = b.dataset.eodHistoryTab;
        tabsWrap.innerHTML = eodHistoryTabsBarHtml();
        content.innerHTML = eodHistoryTabContentHtml();
        bindTabs();
        bindContent();
      })
    );
  bindTabs();
  bindContent();
}

// ---- Страница дня ------------------------------------------------------------------------------------------------
// Содержимое карточки дня (общие данные, этапы, расхождения, снимки) — одно и то же на странице и в PDF
function eodDayDetailBody(day) {
  const f = ed("fields");
  const d = ed("day");
  const prev = eodDayById(day.previousEodId);
  const next = eodDayById(day.nextEodId);
  const stats = day.startDatetime ? eodDayStats(day) : null;
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, day.code)}${detailField(f.status, eodStatusBadge(day.status))}${detailField(f.active, day.isActive ? vt("common.yes") : vt("common.no"))}
    ${detailField(f.closingStarted, day.closingProcessStarted ? vt("common.yes") : vt("common.no"))}${detailField(f.closeType, eodEnum("closeType", day.closeType))}
    ${detailField(f.start, eodDtText(day.startDatetime))}${detailField(f.planEnd, eodDtText(day.endDatetimePlan))}${detailField(f.actualEnd, eodDtText(day.endDatetimeActual))}
    ${detailField(f.elapsed, day.endDatetimeActual ? eodDuration(day.endDatetimeActual - day.startDatetime) : "—")}${detailField(f.closedBy, day.closingProcessStarted ? eodAdminCell(day.endedBy) : "—")}
    ${detailField(f.prevDay, prev ? eodDayLink(prev) : "—")}${detailField(f.nextDay, next ? eodDayLink(next) : "—")}
    ${detailField(f.operations, stats ? stats.operations : "—")}${detailField(f.volume, stats ? eodVolumeInline(stats) : "—")}
    ${day.failedMessage ? detailField(f.failedMessage, `<span class="acc-warn">${pdEscape(day.failedMessage)}</span>`) : ""}
  </div>`;
  const stages = vbMiniTable(
    [f.order, f.stage, f.status, f.startedAt, f.endedAt],
    eodStagesOf(day).map((s, i) => [i + 1, `<strong>${eodStageName(s.stage)}</strong>`, eodStageBadge(s.status), eodDtText(s.startedAt), eodDtText(s.endedAt)]),
    ""
  );
  const discs = eodDiscrepanciesOfDay(day.id);
  const discRows = discs.map((x) => [eodDiscIdCellHtml(x), eodMoney(x.detail.difference, x.currency), eodDiscBadge(x.status)]);
  const snaps = EOD_SNAPSHOTS.filter((s) => s.eodId === day.id).length;
  return `<div class="profile-flat-block">
      ${flatSection(d.general, main)}
      ${flatSection(d.stages, stages)}
      ${flatSection(`${d.discrepancies} · ${discs.length}`, vbMiniTable([eodDiscIdHeader(), ed("columns.difference"), ed("columns.status")], discRows, d.noDisc))}
      ${flatSection(d.snapshots, `<div class="table-cell-muted">${d.snapshotsNote(snaps)} <button type="button" class="table-link" data-eod-open-snapshots>${d.openSnapshots}</button></div>`)}
    </div>`;
}

function viewEodDayDetail(id) {
  const day = eodDayById(id);
  if (!day) return vbNotFound();
  const d = ed("day");
  const pdf = `<button type="button" class="btn-secondary" id="ed-day-pdf">${DOWNLOAD_ICON_SVG}<span>${d.exportPdf}</span></button>`;
  const toDash = day.isActive ? `<button type="button" class="btn-secondary" data-vb-hash="#/eod-dashboard">${d.toDashboard}</button>` : "";
  return `<div id="ed-root">
    ${vbDetailHeader({ backHash: "#/eod-history", title: `${d.title} ${eodDayDate(day)}`, badges: eodStatusBadge(day.status), subtitle: vbCodeSubtitle(day.code, [eodEnum("closeType", day.closeType)]), actions: `${toDash}${pdf}` })}
    ${eodDayDetailBody(day)}
  </div>`;
}

// PDF карточки дня: общие данные, этапы, расхождения, снимки (печать в "Сохранить как PDF")
function exportEodDayPdf(day) {
  const d = ed("day");
  const name = `${d.title} ${eodDayDate(day)}`;
  const meta = `${eodEnum("status", day.status)} · ID: ${day.code} · ${eodEnum("closeType", day.closeType)}`;
  exPrintHtml(exPdfHtml(`${name} | ${day.code}`, name, meta, eodDayDetailBody(day)), `${name} | ${day.code}`);
}
function initEodDayDetail(id) {
  const day = eodDayById(id);
  const root = document.getElementById("ed-root");
  if (!day || !root) return;
  vbAttachCommon(root);
  const pdf = document.getElementById("ed-day-pdf");
  if (pdf) pdf.addEventListener("click", () => exportEodDayPdf(day));
}

// ==== Снимки балансов ====================================================================================================
function eodFormulaBadge(s) {
  const diff = eodSnapshotDifference(s);
  return diff === 0 ? `<span class="badge badge-success">${ed("snap.formulaOk")}</span>` : `<span class="badge badge-danger">${ed("snap.formulaBad")(formatPaymentAmount(diff))}</span>`;
}

function eodAccountCell(s) {
  const acc = accFind(s.accountKind, s.accountId);
  const title = acc ? accTitle(acc) : pdShort(s.accountId);
  return `<div class="identity-cell">${vbLink(`#/accounts-${s.accountKind}/${s.accountId}`, pdEscape(title))}<span class="table-cell-muted">${t(`accounts.kind.${s.accountKind}`)}</span></div>`;
}

const eodSnapshotsList = createAccessList({
  key: "eod-snap",
  headerAction: () => `<span class="filters-bar-end">${exportMenuHtml("ed-snap-export", ed("histExport.button"), ed("histExport.hintSnapshots"))}</span>`,
  attachHeaderAction: () => bindExportMenu("ed-snap-export", openEodHistoryExportModal),
  data: () => EOD_SNAPSHOTS,
  searchPlaceholder: () => ed("snap.search"),
  searchText: (s) => [s.id, s.balanceId, s.accountId, s.accountSnapshotId, s.currency, (accFind(s.accountKind, s.accountId) || {}).description].filter(Boolean).join(" "),
  tab: { get: (s) => s.accountType, values: ["VIRTUAL", "REAL"], label: (v) => eodEnum("accountType", v) },
  filters: [
    { id: "created", kind: "date", label: () => ed("filters.created"), get: (s) => s.createdDate },
    { id: "eod", kind: "multi", label: () => ed("filters.day"), get: (s) => s.eodId, options: () => EOD_DAYS.filter((d) => EOD_SNAPSHOTS.some((s) => s.eodId === d.id)).reverse().map((d) => ({ value: d.id, label: eodDayLabel(d) })) },
    { id: "currency", kind: "multi", label: () => ed("filters.currency"), get: (s) => s.currency, options: () => [...new Set(EOD_SNAPSHOTS.map((s) => s.currency))].sort().map((c) => ({ value: c, label: c })) },
    { id: "active", kind: "multi", label: () => ed("filters.activeSnap"), get: (s) => String(s.isActive), options: () => [{ value: "true", label: vt("common.yes") }, { value: "false", label: vt("common.no") }] },
    { id: "formula", kind: "multi", label: () => ed("filters.formula"), get: (s) => (eodSnapshotDifference(s) === 0 ? "ok" : "bad"), options: () => [{ value: "ok", label: ed("snap.formulaFilterOk") }, { value: "bad", label: ed("snap.formulaFilterBad") }] },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, diff: (a, b) => eodSnapshotDifference(a) - eodSnapshotDifference(b) },
  columns: [
    { label: () => ed("columns.day"), html: (s) => eodDayLink(eodDayById(s.eodId)) },
    { label: () => ed("columns.account"), html: (s) => eodAccountCell(s) },
    { label: () => ed("columns.currency"), html: (s) => s.currency },
    { label: () => ed("columns.open"), html: (s) => `<span class="acc-money">${formatPaymentAmount(s.openBalanceAmount)}</span>` },
    { label: () => ed("columns.delta"), html: (s) => `<span class="acc-amount ${s.runningDeltaAmount >= 0 ? "acc-in" : "acc-out"}">${s.runningDeltaAmount > 0 ? "+" : ""}${formatPaymentAmount(s.runningDeltaAmount)}</span>` },
    { label: () => ed("columns.close"), html: (s) => `<span class="acc-money">${formatPaymentAmount(s.closeBalanceAmount)}</span>` },
    { label: () => ed("columns.turnover"), html: (s) => `<div class="identity-cell"><span>${formatPaymentAmount(s.debitTurnover)}</span><span class="table-cell-muted">${formatPaymentAmount(s.creditTurnover)}</span></div>` },
    { label: () => ed("columns.formula"), sort: "diff", html: (s) => `<div class="identity-cell">${eodFormulaBadge(s)}${s.isActive ? `<span class="table-cell-muted">${ed("snap.activeMark")}</span>` : ""}</div>` },
  ],
  attachRows: vbAttachRows,
});

// ==== Расхождения ==========================================================================================================
function eodEntityCell(d) {
  if (d.entityType === "OPERATION") {
    const op = vbOperationById(d.entityId);
    return `<div class="identity-cell">${vbLink(`#/settings-vabs-operations/${d.entityId}`, op ? pdEscape(op.name) : pdShort(d.entityId))}<span class="table-cell-muted">${eodEnum("entityType", d.entityType)}</span></div>`;
  }
  const acc = d.accountRef ? accFind(d.accountRef.kind, d.accountRef.id) : null;
  const link = acc ? vbLink(`#/accounts-${acc.kind}/${acc.id}`, pdEscape(accTitle(acc))) : pdShort(d.entityId);
  return `<div class="identity-cell">${link}<span class="table-cell-muted">${eodEnum("entityType", d.entityType)}</span></div>`;
}

// ---- Меню "три точки" с решениями по расхождению — то же самое в шапке
// карточки расхождения и в списке (rowKebabMenu/clients-users.js). Пункты
// открывают ту же форму решения (eodOpenResolveForm) с разным пресетом типа.
const ED_CLOCK_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l2.8 2"/></svg>`;

function eodDiscMenuItems(d) {
  const m = ed("disc.detail");
  const attrs = (preset) => `data-ed-disc-id="${d.id}" data-ed-resolve-preset="${preset}"`;
  return [
    { label: m.actionAccept, icon: CHECK_ICON_SVG, attrs: attrs("RESOLVED_ACCEPTED") },
    { label: m.actionDefer, icon: ED_CLOCK_ICON_SVG, attrs: attrs("DEFERRED") },
    { label: m.actionCorrect, icon: PLUS_ICON_SVG, attrs: attrs("RESOLVED_CORRECTED") },
  ];
}

// "Выгрузить в PDF" — всегда (в шапке карточки и в строке списка), решения по расхождению — только пока оно открыто
function eodDiscMenuHtml(d) {
  const pdf = { label: ed("disc.detail").exportPdf, icon: DOWNLOAD_ICON_SVG, attrs: `data-ed-disc-pdf="${d.id}"` };
  return rowKebabMenu(`disc-${d.id}`, [pdf, ...(eodIsOpenDiscrepancy(d) ? eodDiscMenuItems(d) : [])]);
}

function eodBindResolvePresetButtons(scope) {
  scope.querySelectorAll("[data-ed-disc-pdf]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = eodDiscrepancyById(b.dataset.edDiscPdf);
      if (d) exportEodDiscPdf(d);
    })
  );
  scope.querySelectorAll("[data-ed-resolve-preset]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = eodDiscrepancyById(b.dataset.edDiscId);
      if (d) eodOpenResolveForm(d, b.dataset.edResolvePreset);
    })
  );
}

function eodLastResolution(d) {
  return d.resolutions.length ? d.resolutions[d.resolutions.length - 1] : null;
}

const eodDiscList = createAccessList({
  key: "eod-disc",
  data: () => EOD_DISCREPANCIES,
  searchPlaceholder: () => ed("disc.search"),
  searchText: (d) => [d.id, d.code, d.entityId, d.eodId, d.currency, d.reconciliationType, d.entityType, d.detail.fieldName].filter(Boolean).join(" "),
  tab: { get: (d) => d.status, values: EOD_DISC_STATUSES, label: (v) => eodEnum("discStatus", v) },
  filters: [
    { id: "created", kind: "date", label: () => ed("filters.created"), get: (d) => d.createdDate },
    { id: "eod", kind: "multi", label: () => ed("filters.day"), get: (d) => d.eodId, options: () => EOD_DAYS.filter((day) => EOD_DISCREPANCIES.some((d) => d.eodId === day.id)).reverse().map((day) => ({ value: day.id, label: eodDayLabel(day) })) },
    { id: "reconType", kind: "multi", label: () => ed("filters.reconType"), get: (d) => d.reconciliationType, options: () => EOD_RECON_TYPES.map((v) => ({ value: v, label: eodEnum("reconType", v) })) },
    { id: "entityType", kind: "multi", label: () => ed("filters.entityType"), get: (d) => d.entityType, options: () => EOD_ENTITY_TYPES.map((v) => ({ value: v, label: eodEnum("entityType", v) })) },
    { id: "currency", kind: "multi", label: () => ed("filters.currency"), get: (d) => d.currency, options: () => [...new Set(EOD_DISCREPANCIES.map((d) => d.currency))].sort().map((c) => ({ value: c, label: c })) },
    { id: "resolution", kind: "multi", label: () => ed("filters.resolution"), get: (d) => (eodLastResolution(d) ? eodLastResolution(d).resolutionType : ""), options: () => EOD_RESOLUTION_TYPES.map((v) => ({ value: v, label: eodEnum("resolution", v) })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, diff: (a, b) => a.detail.difference - b.detail.difference },
  // Одним блоком: сравнение активного дня с предыдущим (всего / общая разница) + разрез по типам сущностей
  metrics: (list) => {
    const m = ed("disc.metrics");
    const day = eodActiveDay();
    const c = ed("dash.compare");
    const cmp = [];
    if (day) {
      const disc = eodCompareDiscrepanciesTotal(day);
      cmp.push({ value: disc.current, label: c.discrepancies, sub: eodVsLastDayHtml(disc, c) }, { value: "—", label: c.differenceTitle });
    }
    return [
      ...cmp,
      { value: list.filter((d) => d.entityType === "OPERATION").length, label: m.operations },
      { value: list.filter((d) => d.entityType === "VIRTUAL_BALANCE").length, label: m.virtual },
      { value: list.filter((d) => d.entityType === "REAL_BALANCE").length, label: m.real },
    ];
  },
  columns: [
    { label: () => eodDiscIdHeader(), html: eodDiscIdCellHtml },
    { label: () => ed("columns.created"), sort: "created", html: (d) => dateTimeCell(d.createdAt) },
    { label: () => ed("columns.day"), html: (d) => eodDayLink(eodDayById(d.eodId)) },
    { label: () => ed("columns.entity"), html: (d) => eodEntityCell(d) },
    { label: () => `${ed("columns.expected")} / ${ed("columns.actual")}`, html: (d) => `<div class="identity-cell"><span>${eodMoney(d.detail.expectedValue, d.currency)}</span><span class="table-cell-muted">${eodMoney(d.detail.actualValue, d.currency)}</span></div>` },
    { label: () => ed("columns.difference"), sort: "diff", html: (d) => `<span class="acc-warn acc-amount">${eodMoney(d.detail.difference, d.currency)}</span>` },
    { label: () => ed("columns.status"), html: (d) => eodDiscBadge(d.status) },
    { label: () => "", html: (d) => `<div class="sl-actions">${eodDiscMenuHtml(d)}</div>` },
  ],
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    eodBindResolvePresetButtons(wrap);
  },
});

// Страница "Расхождения": голубая шапка с экспортом, сверху статистика расхождений активного дня к предыдущему, затем список
function viewEodDiscrepancies() {
  return `<div class="list-hero">${pageHeader(ed("titles.discrepancies"), t("navDescriptions.eod-discrepancies"), exportMenuHtml("ed-disc-export", ed("discExport.button"), ed("discExport.hint")))}</div>${eodDiscList.view()}`;
}

// ---- Экспорт списка расхождений (CSV / XLSX): то, что показывает таблица — поиск, таб, фильтры и сортировка, без учёта страницы ----
function openExportDiscModal(format) {
  const x = ed("discExport");
  const count = eodDiscList.exportRows().length;
  const lines = eodDiscList.filterLines();
  const tab = eodDiscList.tabValue();
  if (tab) lines.unshift(`${ed("columns.status")}: ${eodEnum("discStatus", tab)}`);
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle,
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(eodDiscList.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); eodDiscList.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportEodDiscrepancies(format); });
    },
  });
}

function exportEodDiscrepancies(format) {
  const x = ed("discExport");
  const list = eodDiscList.exportRows();
  const rows = list.map((r) => {
    const day = eodDayById(r.eodId);
    return [
      r.code, eodEnum("reconType", r.reconciliationType), r.reconciliationSubType ? eodEnum("reconType", r.reconciliationSubType) : "",
      eodEnum("entityType", r.entityType), r.entityId || "", day ? eodDayDate(day) : "", r.createdAt,
      r.detail.expectedValue, r.detail.actualValue, r.detail.difference, r.currency || "", eodEnum("discStatus", r.status),
    ];
  });
  exportTable(`discrepancies_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(list.length));
}

function initEodDiscrepancies() {
  eodDiscList.init();
  bindExportMenu("ed-disc-export", openExportDiscModal);
}

// "Исправлено" в ядре НЕ создаёт корректирующую проводку — такой мутации нет
// вовсе (docs/eod.md, TODO 9, подтверждено чтением кода). Это только
// перепроверка: система заново сверяет сущность и закрывает расхождение,
// только если разницы уже нет. Саму проводку нужно поправить заранее — для
// операции это редактирование проводки на её странице ("Операции vABS",
// кнопка редактирования строки); для баланса это в прототипе (и в реальном
// API — снимки только для чтения) сделать нечем, доступны только "Принято"/
// "Отклонено"/"Отложено"/"Передано выше".
function eodFixEntityLinkHtml(d) {
  if (d.entityType !== "OPERATION") return `<p class="table-cell-muted sl-hint">${ed("resolve.noFixBalance")}</p>`;
  return `<p class="table-cell-muted sl-hint">${ed("resolve.fixHint")}</p>`;
}

// ==== "Регулировка" (Adjustment) — мастер создания операции с реальными/
// виртуальными транзакциями, пошагово. Подтверждено реальным скриншотом
// формы в системе (поля Client ID/External operation ID/Name/Description/
// Metadata JSON + секции Real transactions/Virtual transactions с Currency/
// Account ID/Amount/Transfer type/Provider tx ID/Raw tx data/Description,
// +/− на несколько транзакций каждого вида) — значит, создание всё-таки
// реально (vabsCreateRealTransactions/vabsCreateVirtualTransactions на новую
// операцию), в отличие от вывода из более раннего поиска по ключевым словам
// в схеме, который эту форму не нашёл. Компоненты — те же, что у мастера
// создания счёта (kyc-stepper, acw-set*, acwMsHtml — обобщён под onChange).
function edAdjEmptyState(d) {
  return { step: 1, discrepancy: d || null, clientId: null, externalOperationId: "", name: "", description: "", metadataText: "", realLegs: [], virtualLegs: [] };
}
let edAdjState = null;
let edAdjLegSeq = 0;

function edAdjStepKeys() {
  return ["main", "real", "virtual"];
}

function edAdjClientOptions() {
  return [
    ...CLIENTS_USERS_MOCK.map((u) => ({ value: u.id, label: u.fullName || u.email, sub: paymentClientTypeLabel("INDIVIDUAL") })),
    ...CLIENTS_COMPANIES_MOCK.map((co) => ({ value: co.id, label: co.name, sub: paymentClientTypeLabel("CORPORATE") })),
  ];
}

function edAdjStepperHtml() {
  const c = ed("adj");
  const steps = edAdjStepKeys().map((k, i) => ({ n: i + 1, label: c.steps[k] }));
  return `<div class="kyc-stepper">${steps
    .map((st, idx) => {
      const cls = st.n < edAdjState.step ? "is-done" : st.n === edAdjState.step ? "is-current" : "is-pending";
      return `<div class="kyc-stepper-item">
        <div class="kyc-stepper-circle ${cls}">${st.n < edAdjState.step ? CHECK_ICON_SVG : `<span>${st.n}</span>`}</div>
        ${idx < steps.length - 1 ? `<div class="kyc-stepper-line${st.n < edAdjState.step ? " is-done" : ""}"></div>` : ""}
        <div class="kyc-stepper-label"><div class="kyc-stepper-title">${st.label}</div></div>
      </div>`;
    })
    .join("")}</div>`;
}

function edAdjStepMainHtml() {
  const c = ed("adj");
  const s = edAdjState;
  return `
    <div class="filters-field">
      <span class="filters-field-label">${c.clientId} *</span>
      ${acwMsHtml("adj-client", c.clientPlaceholder, { single: true, options: edAdjClientOptions, get: () => (s.clientId ? [s.clientId] : []), set: (v) => { s.clientId = v[0] || null; }, onChange: edAdjRenderStep })}
    </div>
    <div class="sl-grid">
      ${vbInput("adj-ext", c.externalId, s.externalOperationId)}
      ${vbInput("adj-name", `${c.name} *`, s.name)}
    </div>
    ${vbTextarea("adj-desc", c.description, s.description, 2)}
    ${vbTextarea("adj-meta", c.metadata, s.metadataText, 4)}
    <div class="form-error" id="adj-error" hidden></div>
  `;
}

function edAdjLegRowHtml(kind, leg) {
  const c = ed("adj");
  const accounts = kind === "real" ? [...ACCOUNTS_REAL_MOCK, ...ACCOUNTS_NOSTRO_MOCK] : ACCOUNTS_VIRTUAL_MOCK;
  const accOptions = () => accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.kind === "virtual" ? (a.client ? a.client.name : "") : a.provider.name}` }));
  const curOptions = () => ACC_CURRENCY_LIST.map((x) => ({ value: x, label: x }));
  const sideOptions = () => [{ value: "DEBIT", label: accEnum("transferType", "DEBIT") }, { value: "CREDIT", label: accEnum("transferType", "CREDIT") }];
  const msField = (id, label, ph, options, get, set) => `<div class="filters-field">
    <span class="filters-field-label">${label}</span>
    ${acwMsHtml(id, ph, { single: true, options, get, set, onChange: edAdjRenderStep })}
  </div>`;
  // Свёрнутая проводка — одна компактная строка-сводка (чтобы при нескольких проводках модалка не разрасталась)
  const title = kind === "real" ? c.realTx : c.virtualTx;
  const head = (collapsed) => `<div class="acw-set-head adj-leg-head" data-adj-toggle="${kind}:${leg._row}">
      <span class="adj-leg-chevron${collapsed ? "" : " is-open"}">${FILTER_GROUP_CHEVRON}</span>
      <span class="acw-set-group-title">${title}</span>
      ${collapsed ? `<span class="adj-leg-summary table-cell-muted">${leg.currency || "—"} · ${leg.accountId ? pdShort(leg.accountId) : "—"} · ${accEnum("transferType", leg.transferType)} ${leg.amount || "—"}</span>` : ""}
      <button type="button" class="icon-btn adj-leg-remove" data-adj-remove="${kind}:${leg._row}" title="${vt("common.delete")}">${TRASH_ICON_SVG}</button>
    </div>`;
  if (leg._collapsed) return `<div class="pc-section acw-set adj-leg-collapsed">${head(true)}</div>`;
  return `<div class="pc-section acw-set">
    ${head(false)}
    <div class="acw-set-grid">
      ${msField(`adj-${kind}-cur-${leg._row}`, `${c.currency} *`, c.selectPlaceholder, curOptions, () => (leg.currency ? [leg.currency] : []), (v) => { leg.currency = v[0] || ""; })}
      ${msField(`adj-${kind}-acc-${leg._row}`, `${kind === "real" ? c.realAccount : c.virtualAccount} *`, c.selectPlaceholder, accOptions, () => (leg.accountId ? [leg.accountId] : []), (v) => { leg.accountId = v[0] || ""; })}
    </div>
    <div class="acw-set-grid">
      ${vbInput(`adj-${kind}-amt-${leg._row}`, `${c.amount} *`, leg.amount)}
      ${msField(`adj-${kind}-side-${leg._row}`, `${c.transferType} *`, c.selectPlaceholder, sideOptions, () => (leg.transferType ? [leg.transferType] : []), (v) => { leg.transferType = v[0] || "DEBIT"; })}
    </div>
    <div class="acw-set-grid">
      ${vbInput(`adj-${kind}-ptx-${leg._row}`, c.providerTx, leg.providerTxId)}
      ${vbInput(`adj-${kind}-raw-${leg._row}`, c.rawData, leg.rawTxData)}
    </div>
    ${vbInput(`adj-${kind}-desc-${leg._row}`, c.description, leg.description)}
  </div>`;
}

function edAdjStepLegsHtml(kind) {
  const c = ed("adj");
  const legs = kind === "real" ? edAdjState.realLegs : edAdjState.virtualLegs;
  return `<div class="filters-field">
    <p class="table-cell-muted">${c.legsIntro}</p>
    <div class="acw-sets">${legs.length ? legs.map((l) => edAdjLegRowHtml(kind, l)).join("") : `<div class="table-cell-muted">${c.legsEmpty}</div>`}</div>
    <button type="button" class="table-link" data-adj-add="${kind}">${kind === "real" ? c.addReal : c.addVirtual}</button>
  </div>
  <div class="form-error" id="adj-error" hidden></div>`;
}

function edAdjStepBodyHtml() {
  const key = edAdjStepKeys()[edAdjState.step - 1];
  const inner = key === "main" ? edAdjStepMainHtml() : edAdjStepLegsHtml(key);
  return `<div class="pc-form-stack">${inner}</div>`;
}

function edAdjBindStepMain(modalEl) {
  const s = edAdjState;
  acwBindMs(modalEl);
  modalEl.querySelector("#adj-ext").addEventListener("input", (e) => { s.externalOperationId = e.target.value; });
  modalEl.querySelector("#adj-name").addEventListener("input", (e) => { s.name = e.target.value; });
  modalEl.querySelector("#adj-desc").addEventListener("input", (e) => { s.description = e.target.value; });
  modalEl.querySelector("#adj-meta").addEventListener("input", (e) => { s.metadataText = e.target.value; });
}

function edAdjBindStepLegs(modalEl, kind) {
  const legs = kind === "real" ? edAdjState.realLegs : edAdjState.virtualLegs;
  acwBindMs(modalEl);
  legs.forEach((l) => {
    const bind = (field, key, evt) => {
      const el = modalEl.querySelector(`#adj-${kind}-${field}-${l._row}`);
      if (el) el.addEventListener(evt, (e) => { l[key] = e.target.value; });
    };
    bind("amt", "amount", "input");
    bind("ptx", "providerTxId", "input");
    bind("raw", "rawTxData", "input");
    bind("desc", "description", "input");
  });
  // клик по шапке проводки — свернуть/развернуть
  modalEl.querySelectorAll("[data-adj-toggle]").forEach((head) =>
    head.addEventListener("click", (e) => {
      if (e.target.closest("[data-adj-remove]")) return;
      const [k, row] = head.dataset.adjToggle.split(":");
      const arr = k === "real" ? edAdjState.realLegs : edAdjState.virtualLegs;
      const leg = arr.find((l) => String(l._row) === row);
      if (leg) { leg._collapsed = !leg._collapsed; edAdjRenderStep(modalEl); }
    })
  );
  modalEl.querySelectorAll("[data-adj-remove]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const [k, row] = btn.dataset.adjRemove.split(":");
      const arr = k === "real" ? edAdjState.realLegs : edAdjState.virtualLegs;
      const idx = arr.findIndex((l) => String(l._row) === row);
      if (idx >= 0) arr.splice(idx, 1);
      edAdjRenderStep(modalEl);
    })
  );
  const addBtn = modalEl.querySelector("[data-adj-add]");
  if (addBtn)
    addBtn.addEventListener("click", () => {
      edAdjLegSeq += 1;
      const arr = addBtn.dataset.adjAdd === "real" ? edAdjState.realLegs : edAdjState.virtualLegs;
      arr.forEach((l) => { l._collapsed = true; }); // добавляем новую — предыдущие сворачиваем
      arr.push({ _row: edAdjLegSeq, currency: "", accountId: "", amount: "", transferType: "DEBIT", providerTxId: "", rawTxData: "", description: "" });
      edAdjRenderStep(modalEl);
    });
}

function edAdjBindStep(modalEl) {
  const key = edAdjStepKeys()[edAdjState.step - 1];
  if (key === "main") edAdjBindStepMain(modalEl);
  else edAdjBindStepLegs(modalEl, key);
}

function edAdjFooterHtml() {
  const c = ed("adj");
  const isLast = edAdjState.step === edAdjStepKeys().length;
  const backBtn = edAdjState.step > 1 ? `<button type="button" class="btn-secondary" id="adj-back">${c.back}</button>` : `<button type="button" class="btn-secondary" id="adj-cancel">${vt("common.cancel")}</button>`;
  return `${backBtn}<button type="button" class="btn-primary" id="adj-next">${isLast ? c.submit : c.next}</button>`;
}

function edAdjRenderStep(modalEl) {
  const root = modalEl && modalEl.id === "app-modal" ? modalEl : document.getElementById("app-modal");
  root.querySelector(".modal-body").innerHTML = `${edAdjStepperHtml()}${edAdjStepBodyHtml()}`;
  root.querySelector(".modal-footer").innerHTML = edAdjFooterHtml();
  edAdjBindStepChrome(root);
  edAdjBindStep(root);
  acwMsReposition();
}

function edAdjBindStepChrome(modalEl) {
  const cancelBtn = modalEl.querySelector("#adj-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", () => { acwMsClose(); closeModal(); });
  const backBtn = modalEl.querySelector("#adj-back");
  if (backBtn) backBtn.addEventListener("click", () => { acwMsClose(); edAdjState.step -= 1; edAdjRenderStep(modalEl); });
  modalEl.querySelector("#adj-next").addEventListener("click", () => edAdjGoNext(modalEl));
}

function edAdjValidateStep() {
  const c = ed("adj");
  const s = edAdjState;
  const key = edAdjStepKeys()[s.step - 1];
  if (key === "main") {
    if (!s.clientId) return c.errClient;
    if (!s.name.trim()) return c.errName;
    if (s.metadataText.trim() && !vbParseJson(s.metadataText, true).ok) return vt("common.errJson");
    return null;
  }
  const legs = key === "real" ? s.realLegs : s.virtualLegs;
  for (const l of legs) {
    if (!l.currency || !l.accountId || !String(l.amount).trim()) return c.errLegFields;
    const n = Number(String(l.amount).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return c.errLegAmount;
  }
  if (key === "virtual" && !s.realLegs.length && !s.virtualLegs.length) return c.errNoLegs;
  return null;
}

function edAdjGoNext(modalEl) {
  const err = edAdjValidateStep();
  const errEl = modalEl.querySelector("#adj-error");
  if (err) {
    if (errEl) { errEl.textContent = err; errEl.hidden = false; }
    return;
  }
  if (errEl) errEl.hidden = true;
  if (edAdjState.step < edAdjStepKeys().length) {
    edAdjState.step += 1;
    edAdjRenderStep(modalEl);
    return;
  }
  edAdjSubmit();
}

function edAdjBuildLeg(kind, l, order, now) {
  edAdjLegSeq += 1;
  return {
    id: seedToPaymentUuid(41000 + edAdjLegSeq * 3 + order),
    legKind: kind,
    accountId: l.accountId,
    currency: l.currency,
    amount: eodRound(Number(String(l.amount).replace(",", "."))),
    transferType: l.transferType,
    order,
    status: "NEW",
    previousStatus: null,
    description: (l.description || "").trim() || null,
    providerTxId: (l.providerTxId || "").trim() || null,
    rawTxData: (l.rawTxData || "").trim() || null,
    createdDate: now,
    createdAt: formatDateTime(now),
  };
}

// Отправка создаёт РЕАЛЬНУЮ операцию (те же поля/форма, что в реальной
// системе) — но, в отличие от прямого исправления той же сущности, это
// отдельная компенсирующая операция, поэтому расхождение по конкретной
// операции она не "чинит" автоматически по факту повторной сверки; здесь
// для удобства сценария в прототипе решение всё равно записывается сразу.
function edAdjSubmit() {
  const s = edAdjState;
  const now = pdNow();
  const realLegs = s.realLegs.map((l, i) => edAdjBuildLeg("real", l, i + 1, now));
  const virtualLegs = s.virtualLegs.map((l, i) => edAdjBuildLeg("virtual", l, i + 1, now));
  const client = paymentClientById(s.clientId);
  const virtualAccounts = virtualLegs.map((l) => ACCOUNTS_VIRTUAL_MOCK.find((a) => a.id === l.accountId)).filter(Boolean);
  const realAccounts = realLegs.map((l) => [...ACCOUNTS_REAL_MOCK, ...ACCOUNTS_NOSTRO_MOCK].find((a) => a.id === l.accountId)).filter(Boolean);
  const clientRefs = [];
  if (client) clientRefs.push({ id: client.id, name: client.name, link: null });
  virtualAccounts.forEach((a) => { if (a.client && !clientRefs.some((c) => c.id === a.client.id)) clientRefs.push(a.client); });
  const providerRefs = [];
  realAccounts.forEach((a) => { if (a.provider && !providerRefs.some((p) => p.id === a.provider.id)) providerRefs.push(a.provider); });
  const parsedMeta = s.metadataText.trim() ? vbParseJson(s.metadataText, true) : { ok: true, value: null };
  const op = {
    id: seedToPaymentUuid(42000 + edAdjLegSeq),
    name: s.name.trim(),
    description: s.description.trim() || null,
    externalOperationId: s.externalOperationId.trim() || null,
    status: "NEW",
    clientRefs,
    providerRefs,
    virtualLegs,
    realLegs,
    metadata: parsedMeta.ok ? parsedMeta.value : null,
    errorMessages: [],
    references: [],
  };
  vbStamp(op, now, now);
  vbRecalcOperation(op, { silent: true });
  VB_OPERATIONS.unshift(op);
  VB_OPERATION_INDEX[op.id] = op;
  const d = s.discrepancy;
  closeModal();
  if (d) eodResolveDiscrepancy(d, "RESOLVED_CORRECTED", s.description.trim() || null, CURRENT_ADMIN.email, now);
  render();
  showToast(t("toast.adjustmentCreated"));
}

function openAdjustmentModal(d) {
  edAdjState = edAdjEmptyState(d);
  if (d) edAdjState.name = ed("adj").defaultName(d.code);
  openModal({
    title: ed("adj").title,
    width: 640,
    bodyHtml: `${edAdjStepperHtml()}${edAdjStepBodyHtml()}`,
    footerHtml: edAdjFooterHtml(),
    onMount: (modalEl) => { edAdjBindStepChrome(modalEl); edAdjBindStep(modalEl); },
  });
}

// presetType — быстрые действия у заголовка страницы расхождения / меню в
// списке ("Принять расхождение" → RESOLVED_ACCEPTED, "Отложить решение" →
// DEFERRED); без пресета — общая форма со всеми типами решения.
// "Создать корректирующую транзакцию" (RESOLVED_CORRECTED) открывает мастер
// "Регулировка" выше, сюда не попадает.
function eodOpenResolveForm(d, presetType) {
  if (!d) return;
  if (presetType === "RESOLVED_CORRECTED") return openAdjustmentModal(d);
  const f = ed("resolve");
  const initial = presetType || "RESOLVED_ACCEPTED";
  vbOpenForm({
    title: f.title,
    width: 520,
    intro: f.intro,
    fieldsHtml: `${eodFixEntityLinkHtml(d)}
      ${vbSelect("ed-res-type", f.type, EOD_RESOLUTION_TYPES.map((v) => ({ value: v, label: `${eodEnum("resolution", v)}` })), initial)}
      <p class="table-cell-muted sl-hint" id="ed-res-hint">${eodEnum("resolutionHint", initial)}</p>
      ${vbTextarea("ed-res-comment", f.comment, "", 3)}`,
    submitLabel: f.submit,
    onSubmit: (el) => {
      const type = el.querySelector("#ed-res-type").value;
      const comment = el.querySelector("#ed-res-comment").value.trim();
      // комментарий необязателен при любом решении (в ядре comment nullable); при
      // RESOLVED_CORRECTED ядро перепроверяет сущность и отклоняет решение, если
      // расхождение осталось (RECONCILIATION_DISCREPANCY_STILL_MISMATCH)
      if (type === "RESOLVED_CORRECTED" && eodStillMismatch(d)) return f.errStillMismatch;
      const closes = type !== "DEFERRED" && type !== "ESCALATED";
      vbConfirm({
        title: f.confirmTitle,
        text: closes ? f.confirmClose(eodEnum("resolution", type)) : f.confirmKeep(eodEnum("resolution", type)),
        confirmLabel: f.submit,
        danger: closes,
        onConfirm: () => { eodResolveDiscrepancy(d, type, comment, CURRENT_ADMIN.email, pdNow()); render(); showToast(t("toast.resolutionSaved")); },
      });
      return null;
    },
  });
  const sel = document.getElementById("ed-res-type");
  if (sel) sel.addEventListener("change", () => { document.getElementById("ed-res-hint").textContent = eodEnum("resolutionHint", sel.value); });
  document.querySelectorAll("#app-modal [data-vb-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.vbHash; }));
}

// ---- Страница расхождения ------------------------------------------------------------------------------------------
// Вкладки сверху страницы (как на карточках счетов/клиентов/платежей —
// cd-tabs-wrap сразу под шапкой): "Обзор" (общая информация), "Операции" или
// "Снимок баланса" (в зависимости от entityType — то, по чему шла сверка) и
// всегда "История решений".
let eodDiscPageTab = "overview"; // "overview"|"data"|"history"
let eodDiscOpTab = "main"; // "main"|"real"|"virtual" — подвкладки внутри "Операции"

function eodOperationRow(op) {
  return [
    vbOpNameIdCell(op, "data-vb-hash"),
    op.description ? pdEscape(op.description) : "—",
    vbOpStatusBadge(op.status),
    op.externalOperationId || "—",
    dateTimeCell(op.createdAt),
  ];
}

function eodMainFieldsHtml(d) {
  const f = ed("fields");
  const m = ed("disc.detail");
  const day = eodDayById(d.eodId);
  const lastRes = eodLastResolution(d);
  const resolvedField = lastRes ? `${eodEnum("resolution", lastRes.resolutionType)} · ${lastRes.createdAt}` : m.notResolved;
  return `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, d.code)}${detailField(f.status, eodDiscBadge(d.status))}${detailField(f.day, eodDayLink(day))}
    ${detailField(f.reconType, eodEnum("reconType", d.reconciliationType))}${detailField(f.subType, d.reconciliationSubType ? eodEnum("reconType", d.reconciliationSubType) : "—")}
    ${detailField(f.entityType, eodEnum("entityType", d.entityType))}${detailField(f.entity, eodEntityCell(d))}
    ${copyableField(f.entityId, d.entityId, `<span class="vb-mono">${d.entityId}</span>`)}${detailField(f.currency, d.currency)}
    ${detailField(f.created, d.createdAt)}${detailField(f.updated, d.updatedAt)}${detailField(m.resolved, resolvedField)}
  </div>`;
}

// Расхождение по операции — показываем саму операцию (сводная строка + её
// реальные/виртуальные проводки, те же таблицы, что на странице операции,
// vbLegsTable через общий vbOpTab).
function eodDiscOpSubTabsBarHtml(op) {
  const m = ed("disc.detail");
  const tabs = [
    { key: "main", label: m.opTabMain },
    { key: "real", label: m.opTabReal, count: op.realLegs.length },
    { key: "virtual", label: m.opTabVirtual, count: op.virtualLegs.length },
  ];
  return `<div class="cd-subtabs">${tabs
    .map((tb) => `<button type="button" class="cd-subtab${eodDiscOpTab === tb.key ? " is-active" : ""}" data-ed-disc-op-tab="${tb.key}"><span>${tb.label}</span>${tb.count != null ? `<span class="quick-tab-count">${tb.count}</span>` : ""}</button>`)
    .join("")}</div>`;
}

function eodDiscOpBodyHtml(op) {
  if (eodDiscOpTab === "main") {
    const c = vt("columns");
    return vbMiniTable([vbOpNameIdHeader(), c.description, c.status, c.externalId, c.created], [eodOperationRow(op)], "");
  }
  vbOpTab = eodDiscOpTab;
  return vbLegsTable(op, { hideBalanceCheck: true });
}

function eodBindOpSubTabs(op) {
  const tabsEl = document.getElementById("ed-disc-op-tabs");
  const bodyEl = document.getElementById("ed-disc-op-body");
  if (!op || !tabsEl || !bodyEl) return;
  const bindLegClicks = () => {
    vbAttachCommon(bodyEl);
    if (eodDiscOpTab === "main") return;
    const all = [...op.virtualLegs, ...op.realLegs];
    bodyEl.querySelectorAll("[data-vb-raw]").forEach((b) =>
      b.addEventListener("click", () => {
        const leg = all.find((l) => l.id === b.dataset.vbRaw);
        openModal({ title: vt("operations.detail.rawTitle"), width: 560, bodyHtml: `<pre class="pd-json">${pdEscape(leg.rawTxData)}</pre>`, footerHtml: `<button type="button" class="btn-secondary" id="vb-cancel">${vt("common.close")}</button>`, onMount: (el) => el.querySelector("#vb-cancel").addEventListener("click", closeModal) });
      })
    );
  };
  const bindTabs = () =>
    tabsEl.querySelectorAll("[data-ed-disc-op-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        eodDiscOpTab = b.dataset.edDiscOpTab;
        tabsEl.innerHTML = eodDiscOpSubTabsBarHtml(op);
        bodyEl.innerHTML = eodDiscOpBodyHtml(op);
        bindTabs();
        bindLegClicks();
      })
    );
  bindTabs();
  bindLegClicks();
}

function eodDiscOperationTabHtml(d) {
  const m = ed("disc.detail");
  const op = vbOperationById(d.entityId);
  if (!op) return `<p class="table-cell-muted">${m.opGone}</p>`;
  return `<div class="cd-tabs-wrap" id="ed-disc-op-tabs">${eodDiscOpSubTabsBarHtml(op)}</div><div id="ed-disc-op-body">${eodDiscOpBodyHtml(op)}</div>`;
}

// Расхождение по балансу — показываем снимок баланса, по которому шла сверка
// (та же карточка с формулой open+Δ=close, что и в списке "Снимки балансов").
function eodDiscSnapshot(d) {
  const accountType = d.entityType === "VIRTUAL_BALANCE" ? "VIRTUAL" : "REAL";
  return EOD_SNAPSHOTS.find((s) => s.eodId === d.eodId && s.accountType === accountType && s.balanceId === d.entityId) || null;
}

// Снимок — той же карточкой (profile-flat-block/flatSection), что и общая
// информация выше, а не голыми полями без секции — только по конкретному
// балансу, по которому это расхождение (eodDiscSnapshot уже фильтрует именно
// по нему: eodId + accountType + balanceId).
function eodDiscSnapshotTabHtml(d) {
  const m = ed("disc.detail");
  const s = eodDiscSnapshot(d);
  const body = !s
    ? `<p class="table-cell-muted">${m.snapGone}</p>`
    : `<div class="profile-fields profile-fields-grid">
        ${detailField(ed("columns.day"), eodDayLink(eodDayById(s.eodId)))}${detailField(ed("columns.account"), eodAccountCell(s))}${detailField(ed("columns.currency"), s.currency)}
        ${detailField(ed("columns.open"), `<span class="acc-money">${formatPaymentAmount(s.openBalanceAmount)}</span>`)}${detailField(ed("columns.delta"), `<span class="acc-amount ${s.runningDeltaAmount >= 0 ? "acc-in" : "acc-out"}">${s.runningDeltaAmount > 0 ? "+" : ""}${formatPaymentAmount(s.runningDeltaAmount)}</span>`)}${detailField(ed("columns.close"), `<span class="acc-money">${formatPaymentAmount(s.closeBalanceAmount)}</span>`)}
        ${detailField(ed("columns.turnover"), `${formatPaymentAmount(s.debitTurnover)} / ${formatPaymentAmount(s.creditTurnover)}`)}${detailField(ed("columns.formula"), eodFormulaBadge(s))}
      </div><p class="table-cell-muted vb-note"><button type="button" class="table-link" data-eod-open-snapshots>${ed("day.openSnapshots")}</button></p>`;
  return `<div class="profile-flat-block">${flatSection(m.tabSnapshot, body)}</div>`;
}

function eodDiscHistoryTabHtml(d) {
  const f = ed("fields");
  const m = ed("disc.detail");
  const resRows = d.resolutions.map((r) => [dateTimeCell(r.createdAt), `<strong>${eodEnum("resolution", r.resolutionType)}</strong>`, eodAdminCell(r.adminId), r.comment ? pdEscape(r.comment) : "—"]);
  return vbMiniTable([f.created, f.resolution, f.admin, f.comment], resRows, m.noResolutions);
}

// Только два верхних таба: "Обзор" (общая информация + операция/снимок —
// то, по чему шла сверка — слева, превью комментариев справа, как в карточке
// платежа) и "История решений".
function eodDiscPageTabs(d) {
  const m = ed("disc.detail");
  return [
    { key: "overview", label: m.tabOverview },
    { key: "history", label: m.resolutions, count: d.resolutions.length },
  ];
}

function eodDiscPageTabsBarHtml(d) {
  return `<div class="cd-subtabs">${eodDiscPageTabs(d)
    .map((tb) => `<button type="button" class="cd-subtab${eodDiscPageTab === tb.key ? " is-active" : ""}" data-ed-disc-page-tab="${tb.key}"><span>${tb.label}</span>${tb.count != null ? `<span class="quick-tab-count">${tb.count}</span>` : ""}</button>`)
    .join("")}</div>`;
}

function eodDiscOverviewTabHtml(d) {
  const dataBlock = d.entityType === "OPERATION" ? eodDiscOperationTabHtml(d) : eodDiscSnapshotTabHtml(d);
  return `<div class="client-detail-grid">
    <div class="client-detail-grid-main">
      <div class="profile-flat-block">${flatSection(ed("disc.detail").general, eodMainFieldsHtml(d))}</div>
      ${dataBlock}
    </div>
    <div class="client-detail-grid-side">${eodCommentsPreviewHtml(d)}</div>
  </div>`;
}

function eodDiscPageTabContentHtml(d) {
  return eodDiscPageTab === "history" ? eodDiscHistoryTabHtml(d) : eodDiscOverviewTabHtml(d);
}

function eodBindDiscPageTabs(d) {
  const tabsWrap = document.getElementById("ed-disc-page-tabs");
  const content = document.getElementById("ed-disc-tab-content");
  if (!tabsWrap || !content) return;
  const bindContent = () => {
    vbAttachCommon(content);
    if (eodDiscPageTab === "overview" && d.entityType === "OPERATION") eodBindOpSubTabs(vbOperationById(d.entityId));
    const viewAllBtn = content.querySelector("[data-ed-open-comments]");
    if (viewAllBtn) viewAllBtn.addEventListener("click", () => eodOpenCommentsDrawer(d));
    const addBtn = content.querySelector("[data-ed-add-comment]");
    if (addBtn) addBtn.addEventListener("click", () => eodOpenCommentsDrawer(d));
  };
  const bindTabs = () =>
    tabsWrap.querySelectorAll("[data-ed-disc-page-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        eodDiscPageTab = b.dataset.edDiscPageTab;
        if (eodDiscPageTab === "overview") eodDiscOpTab = "main";
        tabsWrap.innerHTML = eodDiscPageTabsBarHtml(d);
        content.innerHTML = eodDiscPageTabContentHtml(d);
        bindTabs();
        bindContent();
      })
    );
  bindTabs();
  bindContent();
}

// ---- Комментарии — как в карточке платежа: маленькая карточка-превью
// (последний комментарий + счётчик) в правом сайдбаре вкладки "Обзор",
// полный список — в выезжающем справа сайдбаре поверх экрана (тот же
// паттерн .filters-drawer: overlay + aside, requestAnimationFrame + класс
// is-open, Escape/клик по оверлею закрывают). Только в прототипе:
// подтверждённой мутации для комментариев в ядре не нашлось (docs/eod.md,
// исследование), поэтому честно помечены как локальные.
function eodCommentAuthorName(email) {
  const a = eodAdminByEmail(email);
  return a ? a.name : email;
}

function eodCommentAuthorRole(email) {
  const a = eodAdminByEmail(email);
  if (!a || !a.roleIds || !a.roleIds.length) return "";
  return a.roleIds.map((id) => acRoleById(id)).filter(Boolean).map((r) => r.name).join(", ");
}

// Свои/чужие действия — как в карточке платежа: редактировать и удалять
// можно только свой комментарий (cm.adminId === CURRENT_ADMIN.email).
let edCommentSeq = 0;
let edCommentEditingId = null; // id комментария, который сейчас редактируется инлайн — не в модалке

function eodCommentRowHtml(cm) {
  const role = eodCommentAuthorRole(cm.adminId);
  const own = cm.adminId === CURRENT_ADMIN.email;
  return `<div class="pd-comment">
    <div class="pd-comment-head">
      <span class="pd-comment-author">${pdEscape(eodCommentAuthorName(cm.adminId))}</span>
      ${own
        ? `<span class="pd-comment-actions">
            <button type="button" class="icon-btn" data-ed-comment-edit="${cm.id}" title="${vt("common.edit")}">${EDIT_ICON_SVG}</button>
            <button type="button" class="icon-btn icon-btn-danger" data-ed-comment-delete="${cm.id}" title="${vt("common.delete")}">${TRASH_ICON_SVG}</button>
          </span>`
        : ""}
    </div>
    ${role ? `<div class="pd-comment-role">${pdEscape(role)}</div>` : ""}
    <div class="pd-comment-text">${pdEscape(cm.text)}</div>
    <div class="pd-comment-date pd-comment-date-bottom">${formatDateTime(cm.createdAt)}</div>
  </div>`;
}

// Правка — инлайн в той же строке (textarea вместо текста + Сохранить/Отмена),
// не отдельная модалка.
function eodCommentEditRowHtml(cm) {
  return `<div class="pd-comment">
    <div class="pd-comment-head"><span class="pd-comment-author">${pdEscape(eodCommentAuthorName(cm.adminId))}</span></div>
    <textarea class="form-textarea vb-field" id="ed-comment-edit-${cm.id}" rows="3">${pdEscape(cm.text)}</textarea>
    <div class="sl-actions">
      <button type="button" class="btn-secondary vb-row-btn" data-ed-comment-cancel="${cm.id}">${vt("common.cancel")}</button>
      <button type="button" class="btn-primary vb-row-btn" data-ed-comment-save="${cm.id}">${vt("common.save")}</button>
    </div>
  </div>`;
}

function eodCommentsPreviewHtml(d) {
  const m = ed("disc.detail");
  const list = (d.comments || []).slice().reverse();
  const latest = list[0];
  const body = latest
    ? `${eodCommentRowHtml(latest)}${list.length > 1 ? `<button type="button" class="table-link pd-view-all" data-ed-open-comments>${m.viewAll} (${list.length})</button>` : ""}`
    : `<div class="table-cell-muted">${m.noComments}</div>`;
  return sectionCard(
    `${m.comments} · ${list.length}`,
    `<div class="kyc-actions-row"><button type="button" class="profile-flat-edit" data-ed-add-comment>${PLUS_ICON_SVG}<span>${m.addComment}</span></button></div>
    <div class="pd-feed">${body}</div>`
  );
}

function eodCommentsDrawerBodyHtml(d) {
  const m = ed("disc.detail");
  const list = (d.comments || []).slice().reverse();
  if (!list.length) return `<p class="table-cell-muted">${m.noComments}</p>`;
  return list.map((cm) => (cm.id === edCommentEditingId ? eodCommentEditRowHtml(cm) : eodCommentRowHtml(cm))).join("");
}

// Перерисовка тела дровера (не всей модалки — комментарии теперь добавляются
// и редактируются прямо в off-canvas, без отдельной модалки/поповера) +
// превью в сайдбаре "Обзора", если он сейчас открыт.
function eodRerenderComments(d) {
  const bodyEl = document.getElementById("ed-comments-drawer-body");
  if (bodyEl) { bodyEl.innerHTML = eodCommentsDrawerBodyHtml(d); eodBindCommentsBody(d); }
  if (eodDiscPageTab === "overview") {
    const content = document.getElementById("ed-disc-tab-content");
    if (content) content.innerHTML = eodDiscPageTabContentHtml(d);
    const tabsWrap = document.getElementById("ed-disc-page-tabs");
    if (tabsWrap) eodBindDiscPageTabs(d);
  }
}

function eodBindCommentsBody(d) {
  const bodyEl = document.getElementById("ed-comments-drawer-body");
  if (!bodyEl) return;
  bodyEl.querySelectorAll("[data-ed-comment-edit]").forEach((b) =>
    b.addEventListener("click", () => { edCommentEditingId = b.dataset.edCommentEdit; eodRerenderComments(d); })
  );
  bodyEl.querySelectorAll("[data-ed-comment-cancel]").forEach((b) =>
    b.addEventListener("click", () => { edCommentEditingId = null; eodRerenderComments(d); })
  );
  bodyEl.querySelectorAll("[data-ed-comment-save]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.edCommentSave;
      const ta = document.getElementById(`ed-comment-edit-${id}`);
      const text = ta ? ta.value.trim() : "";
      if (!text) return;
      const cm = (d.comments || []).find((c) => c.id === id);
      if (cm) cm.text = text;
      edCommentEditingId = null;
      acTouch(d);
      eodRerenderComments(d);
    })
  );
  bodyEl.querySelectorAll("[data-ed-comment-delete]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.edCommentDelete;
      vbConfirm({
        title: ed("disc.detail").deleteCommentTitle,
        text: ed("disc.detail").deleteCommentText,
        confirmLabel: vt("common.delete"),
        danger: true,
        onConfirm: () => {
          d.comments = (d.comments || []).filter((c) => c.id !== id);
          acTouch(d);
          eodRerenderComments(d);
        },
      });
    })
  );
}

function eodCommentsDrawerHtml(d) {
  const m = ed("disc.detail");
  return `
    <div class="filters-drawer-overlay" id="ed-comments-overlay"></div>
    <aside class="filters-drawer" id="ed-comments-drawer">
      <div class="filters-drawer-header">
        <h2 class="filters-drawer-title">${m.comments}</h2>
        <button type="button" class="filters-drawer-close" id="ed-comments-drawer-close">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <div class="filters-drawer-body pd-feed" id="ed-comments-drawer-body">${eodCommentsDrawerBodyHtml(d)}</div>
      <div class="filters-drawer-footer ed-comment-compose">
        <p class="table-cell-muted vb-note">${m.commentsNote}</p>
        <textarea class="form-textarea" id="ed-comments-new-text" rows="2" placeholder="${m.commentPlaceholder}"></textarea>
        <button type="button" class="btn-primary" id="ed-comments-add">${m.addComment}</button>
      </div>
    </aside>
  `;
}

function eodHandleCommentsDrawerEscape(e) {
  if (e.key === "Escape") eodCloseCommentsDrawer();
}

function eodOpenCommentsDrawer(d) {
  edCommentEditingId = null;
  const wrap = document.createElement("div");
  wrap.id = "ed-comments-drawer-wrap";
  wrap.innerHTML = eodCommentsDrawerHtml(d);
  document.body.appendChild(wrap);
  document.getElementById("ed-comments-drawer-close").addEventListener("click", eodCloseCommentsDrawer);
  document.getElementById("ed-comments-overlay").addEventListener("click", eodCloseCommentsDrawer);
  eodBindCommentsBody(d);
  document.getElementById("ed-comments-add").addEventListener("click", () => {
    const ta = document.getElementById("ed-comments-new-text");
    const text = ta ? ta.value.trim() : "";
    if (!text) return;
    edCommentSeq += 1;
    d.comments = d.comments || [];
    d.comments.push({ id: `${d.id}-c${edCommentSeq}`, adminId: CURRENT_ADMIN.email, createdAt: pdNow(), text });
    acTouch(d);
    ta.value = "";
    eodRerenderComments(d);
  });
  requestAnimationFrame(() => {
    const o = document.getElementById("ed-comments-overlay");
    const dr = document.getElementById("ed-comments-drawer");
    if (o) o.classList.add("is-open");
    if (dr) dr.classList.add("is-open");
  });
  document.addEventListener("keydown", eodHandleCommentsDrawerEscape);
  document.body.classList.add("filters-drawer-open");
}

function eodCloseCommentsDrawer() {
  const wrap = document.getElementById("ed-comments-drawer-wrap");
  if (!wrap) return;
  const overlay = document.getElementById("ed-comments-overlay");
  const drawer = document.getElementById("ed-comments-drawer");
  if (overlay) overlay.classList.remove("is-open");
  if (drawer) drawer.classList.remove("is-open");
  document.removeEventListener("keydown", eodHandleCommentsDrawerEscape);
  document.body.classList.remove("filters-drawer-open");
  edCommentEditingId = null;
  setTimeout(() => wrap.remove(), 220);
}

// Карточки "поле / ожидаемое / фактическое / разница" + пояснение — общие для страницы и PDF
function eodDiscStatsHtml(d) {
  const m = ed("disc.detail");
  const f = ed("fields");
  const det = d.detail;
  // Единым KPI-блоком (metrics-grid), как метрики на списках, а не четыре отдельные карточки
  return `<div class="metrics-grid is-four">
    ${renderMetricCard(pdEscape(det.fieldName), f.fieldName)}
    ${renderMetricCard(eodMoney(det.expectedValue, d.currency), f.expected)}
    ${renderMetricCard(eodMoney(det.actualValue, d.currency), f.actual)}
    ${renderMetricCard(`<span class="acc-warn">${eodMoney(det.difference, d.currency)}</span>`, f.difference)}
  </div><p class="table-cell-muted vb-note">${d.entityType === "OPERATION" ? m.noteOperation : m.noteBalance}</p>`;
}

// PDF расхождения: сводка, обзор (основное, данные операции/снимка, комментарии) и история
function exportEodDiscPdf(d) {
  const m = ed("disc.detail");
  const prevTab = eodDiscPageTab;
  const prevOp = eodDiscOpTab;
  eodDiscPageTab = "overview";
  eodDiscOpTab = "main";
  const overview = eodDiscOverviewTabHtml(d);
  const history = eodDiscHistoryTabHtml(d);
  eodDiscPageTab = prevTab;
  eodDiscOpTab = prevOp;
  const name = `${m.title} ${d.code}`;
  const meta = `${eodEnum("discStatus", d.status)} · ID: ${d.code} · ${eodEnum("reconType", d.reconciliationType)} · ${d.createdAt}`;
  const body = `${eodDiscStatsHtml(d)}${overview}<section class="pdf-section"><h2>${ed("disc.detail").historyTitle || ""}</h2>${history}</section>`;
  exPrintHtml(exPdfHtml(`${name} | ${d.code}`, name, meta, body), `${name} | ${d.code}`);
}

function viewEodDiscrepancyDetail(id) {
  const d = eodDiscrepancyById(id);
  if (!d) return vbNotFound();
  const m = ed("disc.detail");
  const stats = eodDiscStatsHtml(d);
  const actions = eodDiscMenuHtml(d);
  eodDiscPageTab = "overview";
  eodDiscOpTab = "main";
  return `<div id="ed-root">
    ${vbDetailHeader({ backHash: "#/eod-discrepancies", title: m.title, badges: eodDiscBadge(d.status), subtitle: vbCodeSubtitle(d.code, [eodEnum("reconType", d.reconciliationType), d.createdAt]), actions })}
    ${stats}
    <div class="cd-tabs-wrap" id="ed-disc-page-tabs">${eodDiscPageTabsBarHtml(d)}</div>
    <div id="ed-disc-tab-content">${eodDiscPageTabContentHtml(d)}</div>
  </div>`;
}

function initEodDiscrepancyDetail(id) {
  const d = eodDiscrepancyById(id);
  const root = document.getElementById("ed-root");
  if (!d || !root) return;
  vbAttachCommon(root);
  eodBindResolvePresetButtons(root);
  eodBindDiscPageTabs(d);
}

function viewEodDetail(ref) {
  if (!ref) return vbNotFound();
  return ref.kind === "day" ? viewEodDayDetail(ref.id) : viewEodDiscrepancyDetail(ref.id);
}

function initEodDetail(ref) {
  if (!ref) return;
  if (ref.kind === "day") initEodDayDetail(ref.id);
  else initEodDiscrepancyDetail(ref.id);
}

function eodEntityTitle(ref) {
  if (!ref) return vt("common.notFoundTitle");
  if (ref.kind === "day") {
    const d = eodDayById(ref.id);
    return d ? eodDayLabel(d) : vt("common.notFoundTitle");
  }
  const d = eodDiscrepancyById(ref.id);
  return d ? d.code : vt("common.notFoundTitle");
}

// ==== Настройки: день ========================================================================================================
function eodConfirmSave(text, apply) {
  vbConfirm({ title: ed("settings.confirmTitle"), text, confirmLabel: vt("common.save"), danger: false, onConfirm: apply });
}

function eodParseHolidays(text) {
  const lines = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const m = line.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
    if (!out.includes(line)) out.push(line);
  }
  return out.sort();
}

function viewEodSettingsDay() {
  const c = EOD_CONFIG;
  const f = ed("settings.fields");
  const yesNo = (v) => (v ? `<span class="badge badge-success">${vt("common.yes")}</span>` : `<span class="badge badge-neutral">${vt("common.no")}</span>`);
  const schedule = `<div class="profile-fields profile-fields-grid">
    ${detailField(f.initializingProcess, eodEnum("closeType", c.initializingProcess))}${detailField(f.cutoffTime, c.cutoffTime)}${detailField(f.cutoffTimezone, c.cutoffTimezone)}
    ${detailField(f.delay, `${c.nonFinalOperationsDelayMinutes} ${ed("units.minutes")}`)}${detailField(f.activeInWeekends, yesNo(c.activeInWeekends))}${detailField(f.activeInHolidays, yesNo(c.activeInHolidays))}
    ${detailField(f.holidayDates, c.holidayDates.length ? c.holidayDates.map((h) => `<span class="badge badge-neutral">${h}</span>`).join(" ") : `<span class="table-cell-muted">${ed("settings.noHolidays")}</span>`)}
    ${detailField(f.allowStageRetries, yesNo(c.allowStageRetries))}${detailField(f.maxRetries, c.maxRetries)}${detailField(f.retryBackoff, `${c.retryBackoffMinutes} ${ed("units.minutes")}`)}
    ${detailField(ed("fields.updated"), c.updatedAt)}
  </div>
  <p class="table-cell-muted vb-note">${ed("settings.scheduleNote")}</p>`;
  const stageRows = c.stageConfigs.map((s) => [s.order, `<strong>${eodStageName(s.stageType)}</strong><div class="table-cell-muted">${eodEnum("stageDesc", s.stageType)}</div>`, `<span class="vb-mono">${pdEscape(s.name)}</span>`, yesNo(s.isAwaitingApproval)]);
  const stages = `${vbMiniTable([ed("fields.order"), ed("fields.stage"), ed("settings.stageName"), ed("fields.requiresApproval")], stageRows, "")}
  <p class="table-cell-muted vb-note">${ed("settings.stagesNote")}</p>`;
  // "Изменить" — стандартная кнопка в заголовке плоской секции
  return `<div id="ed-root"><div class="list-hero">${pageHeader(ed("titles.settingsDay"), t("navDescriptions.settings-eod-day"))}</div>
    <div class="profile-flat-block">
      ${flatSection(ed("settings.schedule"), schedule, "data-ed-cfg-edit")}
      ${flatSection(ed("settings.stages"), stages, "data-ed-stages-edit")}
    </div>
  </div>`;
}

function initEodSettingsDay() {
  const root = document.getElementById("ed-root");
  if (!root) return;
  vbAttachCommon(root);
  root.querySelector("[data-ed-cfg-edit]").addEventListener("click", eodOpenConfigForm);
  root.querySelector("[data-ed-stages-edit]").addEventListener("click", eodOpenStagesForm);
}

function eodOpenConfigForm() {
  const c = EOD_CONFIG;
  const f = ed("settings.fields");
  const m = ed("settings.form");
  const zones = EOD_TIMEZONES.includes(c.cutoffTimezone) ? EOD_TIMEZONES : [c.cutoffTimezone, ...EOD_TIMEZONES];
  vbOpenForm({
    title: m.title,
    width: 560,
    intro: m.intro,
    fieldsHtml: `${vbSelect("ed-cfg-init", f.initializingProcess, EOD_CLOSE_TYPES.map((v) => ({ value: v, label: eodEnum("closeType", v) })), c.initializingProcess)}
      <div class="sl-grid">${vbInput("ed-cfg-cutoff", `${f.cutoffTime} *`, c.cutoffTime, 'placeholder="23:40"')}${vbSelect("ed-cfg-tz", f.cutoffTimezone, zones.map((z) => ({ value: z, label: z })), c.cutoffTimezone)}</div>
      ${vbInput("ed-cfg-delay", `${f.delay} (${ed("units.minutes")}) *`, String(c.nonFinalOperationsDelayMinutes))}
      ${eodChecklist("ed-cfg-weekends", f.activeInWeekends, c.activeInWeekends)}${eodChecklist("ed-cfg-holidays", f.activeInHolidays, c.activeInHolidays)}
      ${vbTextarea("ed-cfg-holidayDates", f.holidayDates, c.holidayDates.join("\n"), 3)}<p class="table-cell-muted sl-hint">${m.holidaysHint}</p>
      ${eodChecklist("ed-cfg-retries", f.allowStageRetries, c.allowStageRetries)}
      <div class="sl-grid">${vbInput("ed-cfg-max", `${f.maxRetries} *`, String(c.maxRetries))}${vbInput("ed-cfg-backoff", `${f.retryBackoff} (${ed("units.minutes")}) *`, String(c.retryBackoffMinutes))}</div>`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const cutoff = el.querySelector("#ed-cfg-cutoff").value.trim();
      const int = (id) => { const v = el.querySelector(id).value.trim(); return /^\d+$/.test(v) ? Number(v) : NaN; };
      const delay = int("#ed-cfg-delay");
      const max = int("#ed-cfg-max");
      const backoff = int("#ed-cfg-backoff");
      const holidays = eodParseHolidays(el.querySelector("#ed-cfg-holidayDates").value);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) return m.errCutoff;
      if (Number.isNaN(delay) || delay > 1440) return m.errDelay;
      if (Number.isNaN(max) || max < 1 || max > 10) return m.errMax;
      if (Number.isNaN(backoff) || backoff > 1440) return m.errBackoff;
      if (!holidays) return m.errHolidays;
      const next = {
        initializingProcess: el.querySelector("#ed-cfg-init").value, cutoffTime: cutoff, cutoffTimezone: el.querySelector("#ed-cfg-tz").value, nonFinalOperationsDelayMinutes: delay,
        activeInWeekends: el.querySelector("#ed-cfg-weekends").checked, activeInHolidays: el.querySelector("#ed-cfg-holidays").checked, holidayDates: holidays,
        allowStageRetries: el.querySelector("#ed-cfg-retries").checked, maxRetries: max, retryBackoffMinutes: backoff,
      };
      eodConfirmSave(ed("settings.confirmSchedule"), () => { Object.assign(EOD_CONFIG, next); acTouch(EOD_CONFIG); render(); });
      return null;
    },
  });
}

function eodOpenStagesForm() {
  const m = ed("settings.stagesForm");
  vbOpenForm({
    title: m.title,
    width: 520,
    intro: m.intro,
    fieldsHtml: EOD_CONFIG.stageConfigs.map((s) => eodChecklist(`ed-stage-${s.stageType}`, `${s.order}. ${eodStageName(s.stageType)}`, s.isAwaitingApproval, eodEnum("stageDesc", s.stageType))).join(""),
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const next = {};
      EOD_CONFIG.stageConfigs.forEach((s) => { next[s.stageType] = el.querySelector(`#ed-stage-${s.stageType}`).checked; });
      eodConfirmSave(ed("settings.confirmStages"), () => { EOD_CONFIG.stageConfigs.forEach((s) => { s.isAwaitingApproval = next[s.stageType]; }); acTouch(EOD_CONFIG); render(); });
      return null;
    },
  });
}

// ==== Настройки: сверка ======================================================================================================
function eodToleranceText(s) {
  if (!s.toleranceEnable) return `<span class="table-cell-muted">${ed("recon.toleranceOff")}</span>`;
  return s.toleranceType === "RECONCILIATION_PERCENT" ? `${s.tolerance}%` : `${s.tolerance} ${ed("recon.perAmount")}`;
}

function viewEodSettingsRecon() {
  const f = ed("recon");
  const rows = EOD_RECON_SETTINGS.map((s) => {
    const notes = [s.reconciliationType === "NOSTRO" ? `<span class="badge badge-warning">${f.notImplemented}</span>` : ""].filter(Boolean).join("");
    return [
      `<strong>${eodEnum("reconType", s.reconciliationType)}</strong><div class="table-cell-muted ed-desc">${eodEnum("reconTypeDesc", s.reconciliationType)}</div>`,
      eodEnum("frequency", s.reconciliationFrequency),
      eodToleranceText(s),
      notes || "—",
      dateTimeCell(s.updatedAt),
      `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-ed-setting="${s.id}">${vt("common.edit")}</button></div>`,
    ];
  });
  return `<div id="ed-root"><div class="list-hero">${pageHeader(ed("titles.settingsRecon"), t("navDescriptions.settings-eod-reconciliation"))}</div>
    <div class="profile-flat-block">${flatSection(f.title || ed("titles.settingsRecon"), `${vbMiniTable([f.type, f.frequency, f.tolerance, f.notes, ed("fields.updated"), ""], rows, "")}
    <p class="table-cell-muted vb-note">${f.frequencyNote}</p><p class="table-cell-muted vb-note">${f.toleranceNote}</p>`)}</div>
  </div>`;
}

function initEodSettingsRecon() {
  const root = document.getElementById("ed-root");
  if (!root) return;
  root.querySelectorAll("[data-ed-setting]").forEach((b) => b.addEventListener("click", () => eodOpenSettingForm(EOD_RECON_SETTINGS.find((s) => s.id === b.dataset.edSetting))));
}

function eodOpenSettingForm(s) {
  if (!s) return;
  const f = ed("recon");
  const m = f.form;
  vbOpenForm({
    title: `${m.title}: ${eodEnum("reconType", s.reconciliationType)}`,
    width: 520,
    intro: m.intro,
    fieldsHtml: `${vbSelect("ed-set-freq", f.frequency, EOD_RECON_FREQUENCIES.map((v) => ({ value: v, label: eodEnum("frequency", v) })), s.reconciliationFrequency)}
      ${eodChecklist("ed-set-enable", f.toleranceEnable, s.toleranceEnable)}
      <div class="sl-grid">${vbSelect("ed-set-type", f.toleranceType, EOD_TOLERANCE_TYPES.map((v) => ({ value: v, label: eodEnum("toleranceType", v) })), s.toleranceType || "RECONCILIATION_AMOUNT")}${vbInput("ed-set-value", f.toleranceValue, s.tolerance == null ? "" : String(s.tolerance))}</div>`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const enabled = el.querySelector("#ed-set-enable").checked;
      const type = el.querySelector("#ed-set-type").value;
      const raw = el.querySelector("#ed-set-value").value.trim().replace(",", ".");
      let value = null;
      if (enabled) {
        value = Number(raw);
        if (!raw || Number.isNaN(value) || value < 0) return m.errValue;
        if (type === "RECONCILIATION_PERCENT" && value > 100) return m.errPercent;
      }
      const next = { reconciliationFrequency: el.querySelector("#ed-set-freq").value, toleranceEnable: enabled, toleranceType: enabled ? type : s.toleranceType, tolerance: enabled ? value : s.tolerance };
      eodConfirmSave(ed("recon.confirm"), () => { Object.assign(s, next); acTouch(s); render(); });
      return null;
    },
  });
}


