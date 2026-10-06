/* ==========================================================================
   "Операционные настройки → Агрегация": сети провайдера крипто-кошельков, их триггеры
   сбора депозитных адресов на сервисный адрес (SERVICE), пачки сбора и история.
   Прототип по реальной спеке провайдера crypto-cp-provider (aggregation-admin-ui.md
   и смежные документы) — раздел есть в бэкенде (ветка core-dev), в двух базовых
   ветках проекта на момент написания отсутствовал.
   Данные и движок — mock/aggregation.mock.js. Карточки сетей и триггеров — вручную
   (их всего 2 и 6 на сеть, таблица тут не нужна); пачки — список на createAccessList.
   ========================================================================== */

function agg(path) {
  return t(`aggregation.${path}`);
}

function aggKindLabel(kind) {
  return agg(`kind.${kind}.name`);
}

function aggKindSubtitle(kind) {
  return agg(`kind.${kind}.subtitle`);
}

function aggMoneyUsd(n) {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} $`;
}

function aggEvalBadge(status) {
  const cls = { DUE: "badge-warning", NOT_DUE: "badge-neutral", DATA_UNAVAILABLE: "badge-danger" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${agg(`evalStatus.${status}`)}</span>`;
}

function aggBatchBadge(status) {
  const cls = {
    DRAFT: "badge-neutral", SUBMITTED: "badge-info", CONFIRMING: "badge-info", CONFIRMED: "badge-success", PARTIALLY_CONFIRMED: "badge-warning",
    REJECTED: "badge-danger", FAILED: "badge-danger", EXPIRED: "badge-warning", COMPLETED: "badge-neutral", PARTIALLY_COMPLETED: "badge-neutral",
  }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${agg(`batchStatus.${status}`)}</span>`;
}

function aggAddressOutcomeBadge(outcome) {
  const cls = { CONFIRMED: "badge-success", REJECTED: "badge-danger", PENDING: "badge-info", UNSEEN: "badge-warning", NOT_SUBMITTED: "badge-neutral" }[outcome] || "badge-neutral";
  return `<span class="badge ${cls}">${agg(`addressOutcome.${outcome}`)}</span>`;
}

function aggAddressesTableHtml(b) {
  if (!b.addressOutcomes.length) return `<div class="table-cell-muted">—</div>`;
  const rows = b.addressOutcomes.map((a) => [
    `<span class="inline-copy vb-mono">${slTrunc(a.address)}${copyIconButton(a.address)}</span>`,
    `<span class="vb-mono">${a.ticker}</span>`,
    a.amount,
    aggAddressOutcomeBadge(a.outcome),
  ]);
  return vbMiniTable([agg("batches.addressColumn"), agg("batches.tickerColumn"), agg("batches.amountColumn"), agg("batches.outcomeColumn")], rows, "—");
}

function aggFailureHtml(b) {
  if (!b.failureReason && !b.error) return "";
  const lines = [];
  if (b.failureReason) lines.push(`<strong>${agg(`failure.reason.${b.failureReason}`)}</strong>`);
  if (b.error) lines.push(pdEscape(b.error));
  if (b.failure) {
    const f = b.failure;
    lines.push(`${agg("failure.statusCode")}: ${f.statusCode}`);
    lines.push(`${agg("failure.providerErrorId")}: <span class="inline-copy vb-mono">${f.providerErrorId}${copyIconButton(f.providerErrorId)}</span>`);
    lines.push(`${agg("failure.requestId")}: <span class="inline-copy vb-mono">${f.requestId}${copyIconButton(f.requestId)}</span>`);
    lines.push(`${agg(`failure.step.${f.step}`)}`);
  }
  lines.push(`<span class="table-cell-muted">${agg("failure.returnedNote")}</span>`);
  return lines.map((l) => `<div>${l}</div>`).join("");
}

function aggEventTypeLabel(type) {
  return agg(`eventType.${type}`);
}

function aggNetworkRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^settings-aggregation-networks\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function aggBatchRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^settings-aggregation-batches\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Кружок "i" рядом с названием триггера — подсказка по наведению (общий [title] → .js-tooltip,
// components/tooltip.js), без перехода. Переход — по названию сети в заголовке столбца, оно ведёт
// на карточку сети, где у каждого из этих же триггеров уже есть и настройка, и история.
function aggInfoDotHtml(text) {
  return `<span class="agg-info-dot" title="${escapeAttr(text)}">i</span>`;
}

// Тоглы в таблице — только индикатор состояния (включён/выключен), не кнопка: менять настройку можно
// на карточке сети, где это действие требует причины и идёт в историю. Визуал — тот же переключатель,
// что и везде (components/switch.js), просто заблокированный.
function aggToggleIndicatorHtml(on) {
  return `<span class="switch agg-static-switch"><input type="checkbox" ${on ? "checked" : ""} disabled /><span class="switch-track"><span class="switch-thumb"></span></span></span>`;
}

// Заголовок столбца сети: имя (кликабельно, ведёт на карточку сети) + баланс. Если баланс SERVICE
// не получен от провайдера — просто прочерк с пояснением в подсказке, без простыни текста в ячейке.
function aggNetworkColumnHeaderHtml(network) {
  const ov = aggNetworkOverview(network);
  const totalReadyUsd = ov.currencies.filter((c) => c.isRateAvailable).reduce((s, c) => s + c.readyAmountUsd, 0);
  const serviceTotal = ov.isServiceBalanceAvailable
    ? ov.currencies.filter((c) => c.isRateAvailable && c.serviceBalanceUsd != null).reduce((s, c) => s + c.serviceBalanceUsd, 0)
    : null;
  const serviceCell = serviceTotal !== null
    ? aggMoneyUsd(serviceTotal)
    : `<span title="${escapeAttr(agg("networks.serviceUnavailable"))}">—</span>`;
  return `<div class="identity-cell agg-overview-net-col">
    <button type="button" class="table-link" data-agg-net-open="${network}">${network}</button>
    <span class="table-cell-muted">${agg("networks.ready")}: ${aggMoneyUsd(totalReadyUsd)}</span>
    <span class="table-cell-muted">${agg("networks.service")}: ${serviceCell}</span>
  </div>`;
}

// Обзорная таблица вверху раздела: строки — виды триггеров (с подсказкой, что каждый делает),
// столбцы — сети (имя + баланс в заголовке) с тоглом, включён ли триггер именно в этой сети.
function aggOverviewTableHtml() {
  const headers = [agg("overview.trigger"), ...AGG_NETWORKS.map(aggNetworkColumnHeaderHtml)];
  const rows = AGG_TRIGGER_KINDS.map((kind) => {
    const label = `<span class="agg-overview-th">${aggKindLabel(kind)}${aggInfoDotHtml(aggKindSubtitle(kind))}</span>`;
    const toggles = AGG_NETWORKS.map((network) => aggToggleIndicatorHtml(aggNetworkOverview(network).triggers.find((tr) => tr.kind === kind).isEnabled));
    return [label, ...toggles];
  });
  return vbMiniTable(headers, rows, "");
}

function viewAggregationNetworks() {
  return `<div class="list-hero">${pageHeader(agg("networks.title"), t("navDescriptions.settings-aggregation-networks"), sectionHintBtn("agg-net-hint-btn", agg("networks.info")))}</div>
    ${aggOverviewTableHtml()}`;
}

function initAggregationNetworks() {
  document.querySelectorAll("[data-agg-net-open]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/settings-aggregation-networks/${b.dataset.aggNetOpen}`; }));
}

// ==== Сеть: карточка ======================================================================================
// Та же форма, что у дашборда операционного дня (eod.js, viewEodDashboard): hero-шапка с заголовком,
// статусом, ключевыми цифрами и действиями, ниже — шаги (здесь: триггеры сбора) и плоский блок секций.
function aggTriggerParamText(tr) {
  if (tr.kind === "READY_ACCUMULATION") return agg("params.from")(tr.params.thresholdUsd);
  if (tr.kind === "SERVICE_LOW_BALANCE") return `${agg("params.below")(tr.params.minBalanceUsd)} · ${tr.params.minCollectUsd != null ? agg("params.minCollect")(tr.params.minCollectUsd) : agg("params.noMinCollect")}`;
  return null;
}

// Описание строки триггера: у расписания — сразу заданный интервал, а не общая фраза (остальные —
// как в справочнике видов, agg("kind.*.subtitle")).
function aggTriggerDescription(tr) {
  if (tr.kind === "PERIODIC" && tr.params.intervalMinutes) return agg("params.onceEvery")(tr.params.intervalMinutes);
  return aggKindSubtitle(tr.kind);
}

// Триггер — имя кликабельно, под ним ID события с копированием (тот же приём "имя сверху, ID снизу",
// что и в остальных списках приложения). На карточке пачки (другая страница) это обычная ссылка на
// сеть; в истории самой сети (currentNetwork совпадает — та же страница, hash не поменяется, обычная
// ссылка там просто не сработает) — вместо перехода прокручивает к строке этого триггера на этой же странице.
function aggEventTriggerCellHtml(e, currentNetwork) {
  if (!e.kind) return agg("history.controlEvent");
  const nameHtml = e.network === currentNetwork
    ? `<button type="button" class="table-link" data-agg-scroll-trigger="${e.kind}">${aggKindLabel(e.kind)}</button>`
    : vbLink(`#/settings-aggregation-networks/${e.network}`, aggKindLabel(e.kind));
  return `<div class="identity-cell">
    <div class="identity-cell-primary">${nameHtml}</div>
    <div class="identity-cell-sub"><span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>${vbCodeCell(e.code)}</div>
  </div>`;
}

// Само событие — ссылка на пачку, если она к нему привязана (запустил сбор / пропуск "пачка уже
// идёт" / ошибка и т.п. — всегда про конкретную пачку); событий без пачки (пропуски до её создания,
// смена настройки, выключатель) — просто текст.
function aggEventTypeCellHtml(e, currentBatchId) {
  const label = aggEventTypeLabel(e.type);
  return e.aggregationId && e.aggregationId !== currentBatchId ? vbLink(`#/settings-aggregation-batches/${e.aggregationId}`, label) : label;
}

function aggEventsTableHtml(events, currentNetwork, currentBatchId) {
  const rows = events.map((e) => [
    formatDateTime(e.createdAt),
    aggEventTriggerCellHtml(e, currentNetwork),
    aggEventTypeCellHtml(e, currentBatchId),
    e.actorName ? pdEscape(e.actorName) : agg("history.system"),
    e.reason ? pdEscape(e.reason) : "—",
  ]);
  return vbMiniTable([agg("history.date"), agg("history.trigger"), agg("history.event"), agg("history.actor"), agg("history.reason")], rows, agg("history.empty"));
}

// Таблица валют сети: сколько можно собрать и сколько уже на SERVICE — по каждой валюте отдельно
// (вместо чипов в шапке, которые плохо читались при нескольких валютах).
function aggCurrenciesTableHtml(ov) {
  const rows = ov.currencies.map((c) => [
    `<span class="vb-mono">${c.ticker}</span>`,
    c.isRateAvailable ? aggMoneyUsd(c.readyAmountUsd) : `<span class="table-cell-muted">${agg("currencies.noRate")}</span>`,
    c.serviceBalanceAmount != null && c.isRateAvailable
      ? aggMoneyUsd(c.serviceBalanceUsd)
      : `<span title="${escapeAttr(ov.isServiceBalanceAvailable ? agg("currencies.noRate") : agg("networks.serviceUnavailable"))}">—</span>`,
  ]);
  return vbMiniTable([agg("currencies.ticker"), agg("currencies.ready"), agg("currencies.service")], rows, "");
}

// Вкл/выкл и так видно по переключателю — бейдж нужен, только пока есть что добавить: сработает
// триггер прямо сейчас, не хватает данных для проверки условия и т.п. (только у трёх с условием).
function aggStepBadgeHtml(tr) {
  if (!tr.isEnabled || !tr.evaluation) return "";
  return aggEvalBadge(tr.evaluation.status);
}

// Доп. инфо под строкой триггера, когда он включён: параметр (с пометкой "по умолчанию", если не
// менялся), живое условие (прогресс накопления / наименьший остаток / следующий запуск по расписанию),
// пауза, последний исход, ссылка на последнюю пачку, кто и когда менял настройку.
function aggTriggerExtraHtml(tr) {
  const lines = [];
  const paramText = aggTriggerParamText(tr);
  if (paramText) lines.push(`${paramText}${tr.isDefault ? ` · ${agg("params.default")}` : ""}`);
  else if (tr.isDefault && tr.params && Object.keys(tr.params).length) lines.push(agg("params.default"));
  if (tr.evaluation) {
    if (tr.kind === "READY_ACCUMULATION" && tr.evaluation.valueUsd != null && tr.evaluation.thresholdUsd) {
      const pct = Math.min(100, Math.round((tr.evaluation.valueUsd / tr.evaluation.thresholdUsd) * 100));
      lines.push(`<div class="rg-bar agg-step-bar"><span class="rg-bar-ok" style="width:${pct}%"></span></div>${aggMoneyUsd(tr.evaluation.valueUsd)} / ${aggMoneyUsd(tr.evaluation.thresholdUsd)}`);
    } else if (tr.kind === "SERVICE_LOW_BALANCE" && tr.evaluation.valueUsd != null) {
      lines.push(`${agg("evalStatus.lowestBalance")}: ${aggMoneyUsd(tr.evaluation.valueUsd)}`);
    } else if (tr.kind === "PERIODIC" && tr.evaluation.nextRunAt && tr.params.intervalMinutes) {
      const intervalMs = tr.params.intervalMinutes * 60000;
      const remainingMs = tr.evaluation.nextRunAt.getTime() - MOCK_NOW.getTime();
      const pct = Math.min(100, Math.max(0, Math.round(((intervalMs - remainingMs) / intervalMs) * 100)));
      lines.push(`<div class="rg-bar agg-step-bar"><span class="rg-bar-ok" style="width:${pct}%"></span></div>${agg("params.nextRun")(formatDateTime(tr.evaluation.nextRunAt))}`);
    }
  }
  if (tr.cooldownUntil) lines.push(agg("cooldown.until")(formatDateTime(tr.cooldownUntil)));
  if (tr.lastOutcome) lines.push(`${agg(`eventType.${tr.lastOutcome}`)}${tr.lastOutcomeAt ? ` · ${formatDateTime(tr.lastOutcomeAt)}` : ""}`);
  if (tr.lastAggregation) lines.push(`${agg("history.batch")} ${vbLink(`#/settings-aggregation-batches/${tr.lastAggregation.id}`, tr.lastAggregation.code)} — ${agg(`batchStatus.${tr.lastAggregation.status}`)}`);
  if (tr.configUpdatedBy) lines.push(agg("config.changedBy")(pdEscape(tr.configUpdatedBy.name), formatDateTime(tr.configUpdatedAt), pdEscape(tr.configUpdateReason || "")));
  return lines.length ? `<div class="agg-trigger-row-info table-cell-muted">${lines.map((l) => `<div>${l}</div>`).join("")}</div>` : "";
}

// Строка-настройка триггера — тот же приём, что у уведомлений маршрутизации (settings-routing.js,
// rgNotifyCard/.rg-notify): переключатель + название + описание (что и зачем), доп. инфо ниже —
// только когда включён. "Настроить" — у трёх видов с параметрами (PERIODIC/READY_ACCUMULATION/
// SERVICE_LOW_BALANCE); у двух реактивных триггеров менять нечего, кроме самого включения.
function aggTriggerRowHtml(network, tr) {
  const editBtn = !tr.isOnDemand ? `<button type="button" class="btn-secondary vb-row-btn" data-agg-edit="${tr.kind}">${vt("common.edit")}</button>` : "";
  return `<div class="rg-notify agg-trigger-row${tr.isEnabled ? "" : " is-off"}" id="agg-trigger-row-${tr.kind}">
    <label class="pn-switch-row">
      <span class="switch"><input type="checkbox" data-agg-toggle="${tr.kind}"${tr.isEnabled ? " checked" : ""} /><span class="switch-track"><span class="switch-thumb"></span></span></span>
      <span><strong>${aggKindLabel(tr.kind)}</strong> ${aggStepBadgeHtml(tr)}<br><span class="table-cell-muted">${aggTriggerDescription(tr)}</span></span>
    </label>
    ${tr.isEnabled ? aggTriggerExtraHtml(tr) : ""}
    ${editBtn ? `<div class="agg-trigger-row-foot">${editBtn}</div>` : ""}
  </div>`;
}

function viewAggregationNetworkDetail(network) {
  if (!network || !AGG_NETWORKS.includes(network)) return vbNotFound();
  const ov = aggNetworkOverview(network);
  const control = ov.aggregationControl;
  const totalReadyUsd = ov.currencies.filter((c) => c.isRateAvailable).reduce((s, c) => s + c.readyAmountUsd, 0);
  const serviceTotal = ov.isServiceBalanceAvailable
    ? ov.currencies.filter((c) => c.isRateAvailable && c.serviceBalanceUsd != null).reduce((s, c) => s + c.serviceBalanceUsd, 0)
    : null;
  const statusBadge = control.isEnabled ? `<span class="badge badge-success">${agg("control.enabled")}</span>` : `<span class="badge badge-danger">${agg("control.disabled")}</span>`;
  const openBadge = ov.openAggregation ? `<span class="badge badge-info">${agg("networks.openBatch")}</span>` : "";
  const lead = !control.isEnabled
    ? agg("control.bannerDisabled")(formatDateTime(control.disabledSince), control.reason ? pdEscape(control.reason) : "—", pdEscape(control.disabledByName || ""))
    : agg("networks.leadDefault");
  const manualTr = ov.triggers.find((x) => x.kind === "MANUAL");
  const hint = ov.openAggregation
    ? `<span class="table-cell-muted ed-hint">${vbLink(`#/settings-aggregation-batches/${ov.openAggregation.id}`, agg("networks.openBatchLink"))}</span>`
    : manualTr && manualTr.lastOutcome
    ? `<span class="table-cell-muted ed-hint">${agg("manual.lastRun")(agg(`manual.outcome.${manualTr.lastOutcome}`), formatDateTime(manualTr.lastOutcomeAt))}</span>`
    : "";
  const currenciesTable = aggCurrenciesTableHtml(ov);
  const hero = `<div class="hm-hero ed-hero agg-hero-full">
    <div class="hm-hero-main">
      <div class="ed-hero-title">
        <div class="hm-hello-row"><h1 class="hm-hello">${network}</h1></div>${statusBadge}${openBadge}
        <div class="agg-hero-actions">
          ${control.isEnabled ? `<button type="button" class="btn-secondary" data-agg-act="disable">${agg("control.disable")}</button>` : `<button type="button" class="btn-secondary" data-agg-act="enable">${agg("control.enable")}</button>`}
          <button type="button" class="btn-primary" data-agg-act="run">${agg("manual.run")}</button>
        </div>
      </div>
      <p class="hm-lead">${lead}</p>
      <div class="hm-pills">
        <span class="hm-pill"><strong>${aggMoneyUsd(totalReadyUsd)}</strong> ${agg("networks.ready")}</span>
        <span class="hm-pill${serviceTotal === null ? " is-warn" : ""}"><strong>${serviceTotal !== null ? aggMoneyUsd(serviceTotal) : "—"}</strong> ${agg("networks.service")}</span>
      </div>
      ${hint ? `<div class="ed-actions">${hint}</div>` : ""}
    </div>
  </div>`;
  const rows = ov.triggers.filter((tr) => tr.kind !== "MANUAL").map((tr) => aggTriggerRowHtml(network, tr)).join("");
  const events = aggEventsOf({ networks: [network] }).slice(0, 15);
  return `<div id="agg-root">${hero}
    <div class="profile-flat-block">
      ${flatSection(agg("networks.currencies"), currenciesTable)}
      ${flatSection(agg("networks.triggersTitle"), `<div class="agg-trigger-rows">${rows}</div>`, null, agg("networks.triggersDesc"))}
      ${flatSection(`${agg("history.title")} · ${events.length}`, aggEventsTableHtml(events, network))}
    </div>
  </div>`;
}

function aggWouldFireNow(network, kind, params) {
  if (!AGG_STATE[network].control.isEnabled || aggOpenBatch(network)) return false;
  const currencies = aggCurrencies(network);
  if (kind === "READY_ACCUMULATION") {
    const sum = currencies.filter((c) => c.readyAmount > 0 && c.isRateAvailable).reduce((s, c) => s + c.readyAmountUsd, 0);
    return sum >= params.thresholdUsd;
  }
  if (kind === "SERVICE_LOW_BALANCE") {
    if (!aggIsServiceBalanceAvailable(network)) return false;
    const minCollect = params.minCollectUsd;
    const eligible = currencies.filter((c) => c.readyAmount > 0 && c.isRateAvailable && c.serviceBalanceAmount != null && (minCollect == null || c.readyAmountUsd >= minCollect));
    return eligible.some((c) => c.serviceBalanceUsd < params.minBalanceUsd);
  }
  return false;
}

// Поля параметров — общие для диалога включения (аггОpenToggleDialog, когда включаем проактивный
// триггер впервые — незачем включать его вслепую на умолчаниях и отдельно потом открывать "Настроить")
// и диалога правки уже включённого (aggOpenEditDialog).
function aggParamFieldsHtml(kind, tr) {
  if (kind === "PERIODIC") {
    return vbInput("agg-p-interval", `${agg("fields.intervalMinutes")}<span class="req-star">*</span>`, String(tr.params.intervalMinutes ?? AGG_TRIGGER_DEFAULTS.PERIODIC.params.intervalMinutes), 'inputmode="numeric"');
  }
  if (kind === "READY_ACCUMULATION") {
    const hint = tr.evaluation ? `<div class="table-cell-muted sl-hint">${agg("dialog.currentValue")(aggMoneyUsd(tr.evaluation.valueUsd))}</div>` : "";
    return `${vbInput("agg-p-threshold", `${agg("fields.thresholdUsd")}<span class="req-star">*</span>`, String(tr.params.thresholdUsd ?? AGG_TRIGGER_DEFAULTS.READY_ACCUMULATION.params.thresholdUsd), 'inputmode="decimal"')}${hint}`;
  }
  if (kind === "SERVICE_LOW_BALANCE") {
    const hint = tr.evaluation && tr.evaluation.valueUsd != null ? `<div class="table-cell-muted sl-hint">${agg("dialog.currentValue")(aggMoneyUsd(tr.evaluation.valueUsd))}</div>` : "";
    return `${vbInput("agg-p-min", `${agg("fields.minBalanceUsd")}<span class="req-star">*</span>`, String(tr.params.minBalanceUsd ?? AGG_TRIGGER_DEFAULTS.SERVICE_LOW_BALANCE.params.minBalanceUsd), 'inputmode="decimal"')}${hint}${vbInput("agg-p-collect", agg("fields.minCollectUsd"), tr.params.minCollectUsd != null ? String(tr.params.minCollectUsd) : "", 'inputmode="decimal"')}<div class="table-cell-muted sl-hint">${agg("dialog.minCollectHint")}</div>`;
  }
  return "";
}

// Возвращает { params } или { error }. Поля — те же id, что в aggParamFieldsHtml.
function aggReadParamFields(kind, el) {
  if (kind === "PERIODIC") {
    const raw = el.querySelector("#agg-p-interval").value.trim();
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || n < 5 || n > 10080) return { error: agg("errors.intervalRange") };
    return { params: { intervalMinutes: n } };
  }
  if (kind === "READY_ACCUMULATION") {
    const raw = el.querySelector("#agg-p-threshold").value.trim().replace(",", ".");
    const n = Number(raw);
    if (!raw || Number.isNaN(n) || n <= 0 || n > 100000000) return { error: agg("errors.amountRange") };
    return { params: { thresholdUsd: Math.round(n * 100) / 100 } };
  }
  if (kind === "SERVICE_LOW_BALANCE") {
    const raw = el.querySelector("#agg-p-min").value.trim().replace(",", ".");
    const n = Number(raw);
    if (!raw || Number.isNaN(n) || n <= 0 || n > 100000000) return { error: agg("errors.amountRange") };
    const params = { minBalanceUsd: Math.round(n * 100) / 100 };
    const rawC = el.querySelector("#agg-p-collect").value.trim().replace(",", ".");
    if (rawC === "") params.minCollectUsd = null;
    else {
      const nc = Number(rawC);
      if (Number.isNaN(nc) || nc <= 0 || nc > 100000000) return { error: agg("errors.amountRange") };
      params.minCollectUsd = Math.round(nc * 100) / 100;
    }
    return { params };
  }
  return { params: {} };
}

// Включение/выключение. У трёх проактивных триггеров включение сразу показывает поле параметра —
// незачем включать на умолчаниях и только потом открывать "Настроить" отдельным действием.
function aggOpenToggleDialog(network, kind, nextEnabled) {
  const tr = aggNetworkOverview(network).triggers.find((x) => x.kind === kind);
  const withParams = nextEnabled && !tr.isOnDemand;
  const paramFields = withParams ? aggParamFieldsHtml(kind, tr) : "";
  vbOpenForm({
    title: nextEnabled ? agg("dialog.enableTitle")(aggKindLabel(kind)) : agg("dialog.disableTitle")(aggKindLabel(kind)),
    width: withParams ? 520 : 480,
    intro: !nextEnabled ? agg(`consequence.${kind}`) : withParams ? aggKindSubtitle(kind) : null,
    fieldsHtml: `${paramFields}${vbTextarea("agg-toggle-reason", `${agg("dialog.reason")}<span class="req-star">*</span>`, "")}`,
    submitLabel: nextEnabled ? vt("common.enable") : vt("common.disable"),
    danger: !nextEnabled,
    onSubmit: (el) => {
      const reason = el.querySelector("#agg-toggle-reason").value.trim();
      if (!reason) return agg("errors.reason");
      let params;
      if (withParams) {
        const r = aggReadParamFields(kind, el);
        if (r.error) return r.error;
        params = r.params;
      }
      const effectiveParams = params ? { ...tr.params, ...params } : tr.params;
      const willFireNow = nextEnabled && kind !== "PERIODIC" && aggWouldFireNow(network, kind, effectiveParams);
      closeModal();
      aggSetTriggerConfig(network, kind, { isEnabled: nextEnabled, params, reason });
      render();
      if (willFireNow) showToast(agg("dialog.willFireToast"));
      return null;
    },
  });
}

// Только параметры уже включённого триггера — включение/выключение делает тогл (aggOpenToggleDialog).
function aggOpenEditDialog(network, kind) {
  const tr = aggNetworkOverview(network).triggers.find((x) => x.kind === kind);
  vbOpenForm({
    title: agg("dialog.editTitle")(aggKindLabel(kind)),
    width: 520,
    intro: aggKindSubtitle(kind),
    fieldsHtml: `${aggParamFieldsHtml(kind, tr)}${vbTextarea("agg-edit-reason", `${agg("dialog.reason")}<span class="req-star">*</span>`, "")}`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const reason = el.querySelector("#agg-edit-reason").value.trim();
      if (!reason) return agg("errors.reason");
      const r = aggReadParamFields(kind, el);
      if (r.error) return r.error;
      const willFireNow = tr.isEnabled && kind !== "PERIODIC" && aggWouldFireNow(network, kind, { ...tr.params, ...r.params });
      closeModal();
      aggSetTriggerConfig(network, kind, { params: r.params, reason });
      render();
      if (willFireNow) showToast(agg("dialog.willFireToast"));
      return null;
    },
  });
}

function aggOpenControlDialog(network, nextEnabled) {
  vbOpenForm({
    title: nextEnabled ? agg("control.enableTitle") : agg("control.disableTitle"),
    width: 480,
    intro: nextEnabled ? null : agg("control.disableConsequence")(network),
    fieldsHtml: vbTextarea("agg-ctrl-reason", `${agg("dialog.reason")}<span class="req-star">*</span>`, ""),
    submitLabel: nextEnabled ? vt("common.enable") : vt("common.disable"),
    danger: !nextEnabled,
    onSubmit: (el) => {
      const reason = el.querySelector("#agg-ctrl-reason").value.trim();
      if (!reason) return agg("errors.reason");
      closeModal();
      aggSetControl(network, nextEnabled, reason);
      render();
      return null;
    },
  });
}

function aggOpenRunDialog(network) {
  vbOpenForm({
    title: agg("manual.title"),
    width: 480,
    intro: agg("manual.intro"),
    fieldsHtml: vbTextarea("agg-run-reason", `${agg("dialog.reason")}<span class="req-star">*</span>`, ""),
    submitLabel: agg("manual.run"),
    onSubmit: (el) => {
      const reason = el.querySelector("#agg-run-reason").value.trim();
      if (!reason) return agg("errors.reason");
      closeModal();
      const res = aggManualRun(network, reason);
      render();
      showToast(agg(`manual.outcome.${res.outcome}`));
      return null;
    },
  });
}

function initAggregationNetworkDetail(network) {
  const root = document.getElementById("agg-root");
  if (!root) return;
  vbAttachCommon(root);
  root.querySelectorAll("[data-agg-toggle]").forEach((cb) =>
    cb.addEventListener("change", () => {
      const kind = cb.dataset.aggToggle;
      const next = cb.checked;
      cb.checked = !next;
      aggOpenToggleDialog(network, kind, next);
    })
  );
  root.querySelectorAll("[data-agg-edit]").forEach((b) => b.addEventListener("click", () => aggOpenEditDialog(network, b.dataset.aggEdit)));
  root.querySelectorAll("[data-agg-scroll-trigger]").forEach((b) =>
    b.addEventListener("click", () => {
      const row = document.getElementById(`agg-trigger-row-${b.dataset.aggScrollTrigger}`);
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("agg-row-flash");
      setTimeout(() => row.classList.remove("agg-row-flash"), 1200);
    })
  );
  const act = (n) => root.querySelector(`[data-agg-act="${n}"]`);
  const disableBtn = act("disable");
  if (disableBtn) disableBtn.addEventListener("click", () => aggOpenControlDialog(network, false));
  const enableBtn = act("enable");
  if (enableBtn) enableBtn.addEventListener("click", () => aggOpenControlDialog(network, true));
  const runBtn = act("run");
  if (runBtn) runBtn.addEventListener("click", () => aggOpenRunDialog(network));
}

// ==== Пачки: список =======================================================================================
const aggBatchesList = createAccessList({
  key: "agg-batches",
  data: () => AGG_BATCHES,
  searchPlaceholder: () => agg("batches.search"),
  searchText: (b) => [b.code, b.network, b.triggerKind].filter(Boolean).join(" "),
  tab: null,
  filters: [
    { id: "network", kind: "multi", label: () => agg("batches.network"), get: (b) => b.network, options: () => AGG_NETWORKS.map((n) => ({ value: n, label: n })) },
    { id: "kind", kind: "multi", label: () => agg("batches.trigger"), get: (b) => b.triggerKind, options: () => AGG_TRIGGER_KINDS.map((k) => ({ value: k, label: aggKindLabel(k) })) },
    { id: "status", kind: "multi", label: () => agg("batches.status"), get: (b) => b.status, options: () => AGG_BATCH_STATUSES.map((s) => ({ value: s, label: agg(`batchStatus.${s}`) })) },
    { id: "created", kind: "date", label: () => agg("batches.created"), get: (b) => b.createdAt },
  ],
  defaultSort: (a, b) => b.createdAt - a.createdAt,
  sorts: { created: (a, b) => a.createdAt - b.createdAt },
  columns: [
    {
      label: () => agg("batches.trigger"),
      html: (b) => `<div class="identity-cell"><div class="identity-cell-primary">${vbLink(`#/settings-aggregation-batches/${b.id}`, aggKindLabel(b.triggerKind))}</div><div class="identity-cell-sub"><span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>${vbCodeCell(b.code)}</div></div>`,
    },
    { label: () => agg("batches.network"), html: (b) => b.network },
    { label: () => agg("batches.addresses"), html: (b) => b.addressesCount },
    { label: () => agg("batches.status"), html: (b) => aggBatchBadge(b.status) },
    { label: () => agg("batches.created"), sort: "created", html: (b) => dateTimeCell(formatDateTime(b.createdAt)) },
  ],
  attachRows: vbAttachRows,
});

function viewAggregationBatches() {
  return `<div class="list-hero">${pageHeader(agg("batches.title"), t("navDescriptions.settings-aggregation-batches"), sectionHintBtn("agg-batches-hint-btn", agg("batches.info")))}</div>${aggBatchesList.view()}`;
}
function initAggregationBatches() {
  aggBatchesList.init();
}

// ==== Пачка: карточка ======================================================================================
function aggOpenReleaseDialog(b) {
  vbOpenForm({
    title: agg("release.title"),
    width: 480,
    intro: agg("release.intro"),
    fieldsHtml: `${vbSelect("agg-release-outcome", agg("release.outcomeLabel"), [{ value: "", label: agg("release.outcomePlaceholder") }, { value: "CONFIRMED", label: agg("release.outcome.CONFIRMED") }, { value: "RELEASED", label: agg("release.outcome.RELEASED") }], "")}${vbTextarea("agg-release-reason", `${agg("dialog.reason")}<span class="req-star">*</span>`, "")}`,
    submitLabel: agg("release.button"),
    danger: true,
    onSubmit: (el) => {
      const outcome = el.querySelector("#agg-release-outcome").value;
      const reason = el.querySelector("#agg-release-reason").value.trim();
      if (!outcome) return agg("errors.outcomeRequired");
      if (!reason) return agg("errors.reason");
      closeModal();
      aggReleaseBatch(b.id, outcome, reason);
      render();
      return null;
    },
  });
}

function viewAggregationBatchDetail(id) {
  const b = aggBatchById(id);
  if (!b) return vbNotFound();
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(agg("batches.id"), b.code)}${detailField(agg("batches.network"), b.network)}${detailField(agg("batches.trigger"), aggKindLabel(b.triggerKind))}
    ${detailField(agg("batches.addresses"), b.addressesCount)}${detailField(agg("batches.status"), aggBatchBadge(b.status))}
    ${detailField(agg("batches.created"), formatDateTime(b.createdAt))}${detailField(agg("batches.submitted"), b.submittedAt ? formatDateTime(b.submittedAt) : "—")}${detailField(agg("batches.processed"), b.processedAt ? formatDateTime(b.processedAt) : "—")}
  </div>`;
  const hashes = b.txHashes.length
    ? `<div class="agg-hash-list">${b.txHashes.map((h) => {
        const url = paymentExplorerTxUrl(b.network, h);
        const hashHtml = url
          ? `<a class="table-link pd-hash-link agg-hash-text" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" title="${t("paymentDetail.crypto.openExplorer")}">${h}</a>`
          : `<span class="agg-hash-text">${h}</span>`;
        return `<div class="agg-hash-row"><span class="inline-copy vb-mono">${hashHtml}${copyIconButton(h)}</span></div>`;
      }).join("")}</div>`
    : `<div class="table-cell-muted">${agg("batches.noHashes")}</div>`;
  const release = b.releasedBy ? `<div class="table-cell-muted agg-batch-release">${agg("release.releasedBy")(pdEscape(b.releasedBy.name), formatDateTime(b.releasedAt), agg(`release.outcome.${b.releaseOutcome}`), pdEscape(b.releaseReason || ""))}</div>` : "";
  const failure = aggFailureHtml(b);
  const events = aggEventsOf({ aggregationId: b.id });
  const actions = b.status === "EXPIRED" ? `<button type="button" class="btn-primary" data-agg-act="release">${agg("release.button")}</button>` : "";
  return `<div id="agg-root">
    ${vbDetailHeader({ backHash: "#/settings-aggregation-batches", title: `${b.network}: ${aggKindLabel(b.triggerKind)}`, badges: aggBatchBadge(b.status), subtitle: vbCodeSubtitle(b.code, [formatDateTime(b.createdAt)]), actions })}
    <div class="profile-flat-block">
      ${flatSection(vt("sections.main"), `${main}${release}`)}
      ${failure ? flatSection(agg("failure.title"), failure) : ""}
      ${flatSection(`${agg("batches.addressesTitle")} · ${b.addressOutcomes.length}`, aggAddressesTableHtml(b))}
      ${flatSection(agg("batches.hashes"), hashes)}
      ${flatSection(`${agg("history.why")} · ${events.length}`, aggEventsTableHtml(events, null, b.id))}
    </div>
  </div>`;
}

function initAggregationBatchDetail(id) {
  const b = aggBatchById(id);
  const root = document.getElementById("agg-root");
  if (!b || !root) return;
  vbAttachCommon(root);
  const btn = root.querySelector('[data-agg-act="release"]');
  if (btn) btn.addEventListener("click", () => aggOpenReleaseDialog(b));
}
