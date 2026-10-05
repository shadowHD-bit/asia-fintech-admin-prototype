/* ==========================================================================
   "Настройки системы → Маршрутизация операций" — родительский пункт сайдбара с тремя своими вкладками:
     • "Правила" (settings-routing-rules) — список правил и конструктор (страница правила);
     • "Настройки" (settings-routing-settings) — общие настройки (retry, уведомления) и маршруты по умолчанию
       («валюта × рельс») одной страницей;
     • "История" (settings-routing-executions) — журнал попыток маршрутизации.
   Статистика — отдельным пунктом в "Аналитика → Дашборды" (analytics-routing).
   Страница правила — конструктор: группы условий (AND внутри группы, OR между группами) и маршруты (провайдер +
   необязательный ностро-счёт) с приоритетом. «Проверить маршрут» показывает, что сделает движок с платежом.
   Данные и движок — mock/routing.mock.js; изменения идут с причиной и кодом 2FA (действие routing_manage).
   ========================================================================== */

function rg(path) {
  return t(`routing.${path}`);
}

const RG_RULE_STATUSES = ["ACTIVE", "DRAFT", "SCHEDULED", "ARCHIVED"];
const RG_EXEC_STATUSES = ["SUCCESS", "USE_DEFAULT", "FAILED", "PENDING_RETRY", "PROCESSING"];
const RG_TRANSITIONS = { DRAFT: ["ACTIVE", "ARCHIVED", "DELETED"], SCHEDULED: ["ACTIVE", "ARCHIVED", "DELETED"], ACTIVE: ["ARCHIVED", "DELETED"], ARCHIVED: ["ACTIVE", "DELETED"] };

let rgStatsDays = 14;
let rgSettingsDraft = null;

// ---- Форматирование -----------------------------------------------------------------------------------------
function rgNum(n) {
  return Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function rgEnumLabel(attrId, value) {
  if (attrId === "recipientCountry") return RG_COUNTRIES[value] || value;
  if (attrId === "recipientType" || attrId === "senderType") return rg(`enum.type.${value}`);
  if (attrId === "kycStatus") return rg("enum.kyc")(value);
  return value;
}

const RG_OP_SYMBOL = { EQ: "=", NEQ: "≠", GT: ">", LT: "<", GTE: "≥", LTE: "≤", BETWEEN: "–" };

function rgFmtInput(value) {
  return String(value || "").replace("T", " ");
}

function rgCondShort(c) {
  const attr = rgAttr(c.attrId);
  if (c.attrId === "currency" || c.attrId === "rail") return c.operator === "EQ" ? c.value : `≠ ${c.value}`;
  const name = rg(`attr.${c.attrId}`);
  if (attr.type === "ENUM") return `${name} ${RG_OP_SYMBOL[c.operator]} ${rgEnumLabel(c.attrId, c.value)}`;
  if (attr.type === "NUMBER") return c.operator === "BETWEEN" ? `${name} ${rgNum(c.value)} – ${rgNum(c.valueMax)}` : `${name} ${RG_OP_SYMBOL[c.operator]} ${rgNum(c.value)}`;
  if (c.operator === "TIME_BETWEEN") return `${rg("attr.time")} ${c.value}–${c.valueMax}`;
  return `${name} ${rg(`ops.${c.operator}`).toLowerCase()} ${rgFmtInput(c.value)}`;
}

// Для таблицы (в отличие от полной карточки правила) условия ограничены тремя чипами: если их больше, показываем
// первые три (сохраняя, к какой группе ИЛИ они относятся) и ссылку "+N ещё условий" на карточку правила.
const RG_CONDITIONS_PREVIEW_MAX = 3;

function rgConditionsCell(rule) {
  const flat = [];
  rule.groups.forEach((g, gi) => g.conditions.forEach((c) => flat.push({ gi, c })));
  const shown = flat.slice(0, RG_CONDITIONS_PREVIEW_MAX);
  const moreCount = flat.length - shown.length;
  const byGroup = [];
  shown.forEach(({ gi, c }) => {
    let entry = byGroup.find((e) => e.gi === gi);
    if (!entry) { entry = { gi, chips: [] }; byGroup.push(entry); }
    entry.chips.push(c);
  });
  const groupsHtml = byGroup
    .map((entry, idx) => `${idx ? `<span class="rg-or-tag">${rg("or")}</span>` : ""}<div class="rg-chips">${entry.chips.map((c) => `<span class="rg-chip${c.attrId === "currency" || c.attrId === "rail" ? " is-key" : ""}">${pdEscape(rgCondShort(c))}</span>`).join("")}</div>`)
    .join("");
  const moreHtml = moreCount > 0 ? `<button type="button" class="table-link rg-more-link" data-rg-more="${rule.id}">${rg("rules.moreConditions")(moreCount, acPlural(moreCount, rg("rules.conditionOne"), rg("rules.conditionFew"), rg("rules.conditionMany")))}</button>` : "";
  return `<div class="rg-groups-cell">${groupsHtml}${moreHtml}</div>`;
}

function rgRouteLabel(route, withNostro = true) {
  const p = rgProviderById(route.providerId);
  const n = rgNostroById(route.nostroAccountId);
  return `${pdEscape(p ? p.name : "—")}${withNostro && n ? ` <span class="table-cell-muted">${pdEscape(n.extId)}</span>` : ""}`;
}

function rgRoutesCell(routes) {
  if (!routes.length) return "—";
  return `<div class="rg-chain">${routes.map((r, i) => `${i ? `<span class="rg-arrow">→</span>` : ""}<span class="rg-hop">${rgRouteLabel(r)}</span>`).join("")}</div>`;
}

function rgStatusBadge(status) {
  const cls = { ACTIVE: "badge-success", DRAFT: "badge-neutral", SCHEDULED: "badge-info", ARCHIVED: "badge-warning", DELETED: "badge-danger" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${rg(`status.${status}`)}</span>`;
}

function rgExecBadge(status) {
  const cls = { SUCCESS: "badge-success", USE_DEFAULT: "badge-info", FAILED: "badge-danger", PENDING_RETRY: "badge-warning", PROCESSING: "badge-neutral" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${rg(`execStatus.${status}`)}</span>`;
}

function rgAttemptBadge(status) {
  const cls = { SUCCESS: "badge-success", FAILED: "badge-danger", PROCESSING: "badge-neutral", PENDING: "badge-neutral" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${rg(`attemptStatus.${status}`)}</span>`;
}

function rgPeriod(rule) {
  if (!rule.dateStart && !rule.dateEnd) return `<span class="table-cell-muted">${rg("noPeriod")}</span>`;
  const f = (d) => (d ? formatDateTime(d).slice(0, 10) : "…");
  return `${f(rule.dateStart)} — ${f(rule.dateEnd)}`;
}

function rgPaymentText(p) {
  return `${rgNum(p.amount)} ${p.currency} · ${p.rail}`;
}

function rgInfoButton() {
  return sectionHintBtn("rg-hint-btn", rg("info"));
}

function rgVisibleRules() {
  return RG_RULES.filter((r) => r.status !== "DELETED").sort((a, b) => a.priority - b.priority);
}

function rgRuleUsage(ruleId, days) {
  const from = MOCK_NOW.getTime() - days * RG_DAY;
  const list = rgExecutionsOfRule(ruleId).filter((e) => e.createdDate.getTime() >= from);
  const ok = list.filter((e) => e.status === "SUCCESS" || e.status === "USE_DEFAULT").length;
  return { count: list.length, ok, rate: list.length ? Math.round((ok / list.length) * 100) : null };
}

// ---- Причина изменения и 2FA -------------------------------------------------------------------------------------
function rgAskReason({ title, intro, submit, danger, onDone }) {
  vbOpenForm({
    title,
    width: 520,
    intro,
    fieldsHtml: vbTextarea("rg-reason", rg("reason.label"), "", 3),
    submitLabel: submit,
    danger,
    onSubmit: (el) => {
      const reason = el.querySelector("#rg-reason").value.trim();
      if (!reason) return rg("reason.required");
      if (reason.length > 500) return rg("reason.long");
      closeModal();
      requireAdmin2fa("routing_manage", () => onDone(reason));
      return null;
    },
  });
}

function rgLogChange(ruleId, entityType, field, oldValue, newValue, comment) {
  RG_CHANGES.push({ id: rgId("h"), ruleId, entityType, field, oldValue: String(oldValue), newValue: String(newValue), comment, by: CURRENT_ADMIN.email, at: pdNow() });
}

// ---- Экран «Правила» (settings-routing-rules) — список и конструктор правил -------------------------------------
function viewRoutingRules() {
  rgRuleState = null;
  const actions = `${rgInfoButton()}<button type="button" class="btn-secondary" id="rg-simulate">${rg("simulate.button")}</button><button type="button" class="btn-primary" id="rg-new">${PLUS_ICON_SVG}<span>${rg("rules.add")}</span></button>`;
  return `<div class="list-hero">${pageHeader(t("nav.settings-routing-rules"), t("navDescriptions.settings-routing-rules"), actions)}</div>${rgRulesList.view()}`;
}

function initRoutingRules() {
  document.getElementById("rg-simulate").addEventListener("click", () => rgOpenSimulator());
  document.getElementById("rg-new").addEventListener("click", () => openRuleCreateWizard());
  rgRulesList.init();
}

// ---- Экран «Настройки» (settings-routing-settings) — общие настройки (retry, уведомления) и маршруты по умолчанию
// («валюта + рельс») — двумя вкладками одной страницы.
let rgSettingsPageTab = "general";

function viewRoutingSettings() {
  const tabs = [{ id: "general", label: rg("settings.tabGeneral") }, { id: "defaults", label: rg("settings.tabDefaults") }];
  const bar = `<div class="cd-tabs-wrap"><div class="cd-subtabs">${tabs.map((tb) => `<button type="button" class="cd-subtab${rgSettingsPageTab === tb.id ? " is-active" : ""}" data-rg-set-tab="${tb.id}"><span>${tb.label}</span></button>`).join("")}</div></div>`;
  const body = rgSettingsPageTab === "defaults" ? `<div id="rg-defaults-content">${rgDefaultsTab()}</div>` : `<div id="rg-settings-content">${rgSettingsTab()}</div>`;
  return `<div class="list-hero">${pageHeader(t("nav.settings-routing-settings"), t("navDescriptions.settings-routing-settings"), rgInfoButton())}</div>${bar}<div id="rg-settings-page-body">${body}</div>`;
}

function initRoutingSettings() {
  document.querySelectorAll("[data-rg-set-tab]").forEach((b) => b.addEventListener("click", () => {
    if (rgSettingsPageTab === b.dataset.rgSetTab) return;
    rgSettingsPageTab = b.dataset.rgSetTab;
    render();
  }));
  if (rgSettingsPageTab === "defaults") rgBindDefaults(); else rgBindSettings();
}
// ---- Экран «История» (settings-routing-executions) — журнал попыток маршрутизации --------------------------------
function viewRoutingExecutions() {
  return `<div class="list-hero">${pageHeader(t("nav.settings-routing-executions"), t("navDescriptions.settings-routing-executions"), rgInfoButton())}</div>${rgExecList.view()}`;
}

function initRoutingExecutions() {
  rgExecList.init();
}

// ---- Аналитика → Дашборды → «Маршрутизация» (analytics-routing) — статистика --------------------------------------
function viewAnalyticsRouting() {
  return `<div id="rg-content">${rgStatsTab()}</div>`;
}

function exportAnalyticsRoutingPdf() {
  const root = document.getElementById("view-container");
  if (!root) return;
  const name = t("nav.analytics-routing");
  exPrintHtml(exPdfHtml(name, name, anCurrentDateText(), root.innerHTML), name);
}

function initAnalyticsRouting() {
  rgBindStats();
}

// ---- Вкладка «Правила» ----------------------------------------------------------------------------------------
// "В конец" переиспользует общий ICONS.chevron (вниз); "В начало" — тот же чеврон зеркально (вверх), а не тот же
// значок, что и у "В конец" — иначе в меню было не различить, какой пункт куда двигает.
const RG_UP_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4-4 4 4"/></svg>`;

function rgRuleKebab(r) {
  const items = [{ label: rg("actions.open"), icon: ICONS.box, attrs: `data-rg-act="open" data-rg-id="${r.id}"` }];
  RG_TRANSITIONS[r.status].forEach((next) => {
    if (next === "DELETED") return;
    const label = next === "ACTIVE" ? (r.status === "ARCHIVED" ? rg("actions.restore") : rg("actions.activate")) : rg("actions.archive");
    items.push({ label, icon: next === "ACTIVE" ? CHECK_ICON_SVG : ICONS.lock, attrs: `data-rg-act="status:${next}" data-rg-id="${r.id}"` });
  });
  items.push({ label: rg("actions.toStart"), icon: RG_UP_ICON_SVG, attrs: `data-rg-act="start" data-rg-id="${r.id}"` });
  items.push({ label: rg("actions.toEnd"), icon: ICONS.chevron, attrs: `data-rg-act="end" data-rg-id="${r.id}"` });
  items.push({ label: rg("actions.duplicate"), icon: COPY_ICON_SVG, attrs: `data-rg-act="duplicate" data-rg-id="${r.id}"` });
  items.push({ label: rg("actions.delete"), icon: TRASH_ICON_SVG, danger: true, attrs: `data-rg-act="status:DELETED" data-rg-id="${r.id}"` });
  return rowKebabMenu(`rg-rule-${r.id}`, items);
}

// Список правил — общая заготовка createAccessList (табы статусов слева, поиск, фильтры), только без пагинации:
// порядок строк — порядок проверки, поэтому строки идут по приоритету, и перетаскивать их можно, пока список не отфильтрован
const rgRulesList = createAccessList({
  key: "rg-rules",
  data: () => rgVisibleRules(),
  noPager: true,
  tableClass: "rg-table",
  searchPlaceholder: () => rg("rules.search"),
  searchText: (r) => `${r.name} ${r.description} ${r.routes.map((x) => (rgProviderById(x.providerId) || {}).name || "").join(" ")} ${r.code}`,
  tab: { get: (r) => r.status, values: RG_RULE_STATUSES, label: (v) => rg(`status.${v}`) },
  filters: [
    { id: "provider", kind: "multi", label: () => rg("columns.provider"), get: (r) => r.routes.map((x) => x.providerId), options: () => RG_PROVIDERS.map((p) => ({ value: p.id, label: p.name })) },
    { id: "currency", kind: "multi", label: () => rg("attr.currency"), get: (r) => rgRuleCondValues(r, "currency"), options: () => RG_CURRENCIES.map((c) => ({ value: c, label: c })) },
    { id: "rail", kind: "multi", label: () => rg("attr.rail"), get: (r) => rgRuleCondValues(r, "rail"), options: () => RG_RAILS.map((c) => ({ value: c, label: c })) },
    { id: "created", kind: "date", label: () => rg("columns.created"), get: (r) => r.createdDate },
  ],
  defaultSort: (a, b) => a.priority - b.priority,
  sorts: {},
  rowAttrs: (r) => `data-rg-row="${r.id}"${rgRulesDnd() ? ' draggable="true"' : ""}`,
  tableNote: () => `<p class="table-cell-muted rg-hint">${rgRulesDnd() ? rg("rules.dragHint") : rg("rules.dragOff")}</p>`,
  columns: [
    { label: () => "", tdClass: "rg-handle-cell", html: () => (rgRulesDnd() ? `<span class="rg-handle" title="${escapeAttr(rg("rules.drag"))}">${rgGripIcon()}</span>` : "") },
    { label: () => rg("columns.rule"), html: (r) => `<div class="identity-cell">${vbLink(`#/settings-routing-rules/rule/${r.id}`, pdEscape(r.name))}</div>` },
    { label: () => rg("columns.conditions"), html: (r) => rgConditionsCell(r) },
    { label: () => rg("columns.routes"), html: (r) => rgRoutesCell(r.routes) },
    { label: () => rg("columns.status"), html: (r) => rgStatusBadge(r.status) },
    { label: () => rg("columns.period"), html: (r) => rgPeriod(r) },
    { label: () => "", html: (r) => rgRuleKebab(r) },
  ],
  attachRows: (wrap) => rgBindRuleRows(wrap),
});

function rgRulesDnd() {
  return !rgRulesList.isFiltered();
}

function rgRuleCondValues(rule, attrId) {
  return rule.groups.flatMap((g) => g.conditions.filter((c) => c.attrId === attrId && c.operator === "EQ").map((c) => c.value));
}
function rgGripIcon() {
  return `<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.4"/><circle cx="13" cy="5" r="1.4"/><circle cx="7" cy="10" r="1.4"/><circle cx="13" cy="10" r="1.4"/><circle cx="7" cy="15" r="1.4"/><circle cx="13" cy="15" r="1.4"/></svg>`;
}

function rgBindRuleRows(root) {
  vbAttachRows(root);
  root.querySelectorAll("[data-rg-act]").forEach((b) => b.addEventListener("click", () => rgRuleAction(rgRuleById(b.dataset.rgId), b.dataset.rgAct)));
  root.querySelectorAll("[data-rg-more]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/settings-routing-rules/rule/${b.dataset.rgMore}`; }));  const body = root.querySelector("tbody");
  if (!body) return;
  let dragId = null;
  body.querySelectorAll("tr[draggable]").forEach((tr) => {
    tr.addEventListener("dragstart", (e) => { dragId = tr.dataset.rgRow; tr.classList.add("is-dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); });
    tr.addEventListener("dragend", () => { tr.classList.remove("is-dragging"); body.querySelectorAll(".rg-drop-before, .rg-drop-after").forEach((x) => x.classList.remove("rg-drop-before", "rg-drop-after")); });
    tr.addEventListener("dragover", (e) => {
      if (!dragId || tr.dataset.rgRow === dragId) return;
      e.preventDefault();
      const r = tr.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      body.querySelectorAll(".rg-drop-before, .rg-drop-after").forEach((x) => x.classList.remove("rg-drop-before", "rg-drop-after"));
      tr.classList.add(before ? "rg-drop-before" : "rg-drop-after");
    });
    tr.addEventListener("drop", (e) => {
      e.preventDefault();
      const target = tr.dataset.rgRow;
      if (!dragId || target === dragId) return;
      const r = tr.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      const src = dragId;
      dragId = null;
      rgMoveRule(src, before ? "BEFORE" : "AFTER", target);
    });
  });
}

// Порядок правил: пересчёт приоритетов (10, 20, 30 …) в порядке отображения
function rgMoveRule(ruleId, type, targetId) {
  const order = rgVisibleRules().map((r) => r.id).filter((id) => id !== ruleId);
  let idx = type === "START" ? 0 : type === "END" ? order.length : order.indexOf(targetId) + (type === "AFTER" ? 1 : 0);
  order.splice(idx, 0, ruleId);
  const rule = rgRuleById(ruleId);
  const newPriority = (order.indexOf(ruleId) + 1) * 10;
  if (newPriority === rule.priority && order.every((id, i) => rgRuleById(id).priority === (i + 1) * 10)) return;
  requireAdmin2fa("routing_manage", () => {
    const old = rule.priority;
    order.forEach((id, i) => { rgRuleById(id).priority = (i + 1) * 10; });
    rgLogChange(ruleId, "RULE", "priority", old, rule.priority, rg("moved"));
    rule.updatedAt = formatDateTime(pdNow());
    showToast(rg("rules.moved"));
    render();
  });
}

function rgRuleAction(rule, act) {
  if (!rule) return;
  if (act === "open") window.location.hash = `#/settings-routing-rules/rule/${rule.id}`;
  else if (act.startsWith("status:")) rgChangeStatus(rule, act.split(":")[1]);
  else if (act === "start") rgMoveRule(rule.id, "START");
  else if (act === "end") rgMoveRule(rule.id, "END");
  else if (act === "duplicate") rgDuplicate(rule);
}

function rgChangeStatus(rule, next) {
  const m = rg("statusChange")[next];
  rgAskReason({
    title: m.title, intro: m.text(pdEscape(rule.name)), submit: m.confirm, danger: next === "DELETED" || next === "ARCHIVED",
    onDone: (reason) => {
      const old = rule.status;
      rule.status = next === "ACTIVE" && rule.dateStart && rule.dateStart > MOCK_NOW ? "SCHEDULED" : next;
      rule.updatedAt = formatDateTime(pdNow());
      rgLogChange(rule.id, "RULE", "status", old, rule.status, reason);
      showToast(rg("statusChange.done"));
      if (next === "DELETED" && window.location.hash.includes(rule.id)) window.location.hash = "#/settings-routing-rules";
      render();
    },
  });
}

function rgClone(o) {
  return JSON.parse(JSON.stringify(o), (k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && (k === "dateStart" || k === "dateEnd") ? new Date(v) : v));
}

function rgDuplicate(rule) {
  requireAdmin2fa("routing_manage", () => {
    const copy = rgClone(rule);
    const now = pdNow();
    copy.id = rgUuid(600 + RG_RULES.length);
    copy.code = entityCode("RGR", 7600 + RG_RULES.length);
    copy.name = `${rule.name} ${rg("copySuffix")}`.slice(0, 64);
    copy.status = "DRAFT";
    copy.priority = (Math.max(...rgVisibleRules().map((r) => r.priority)) || 0) + 10;
    copy.groups.forEach((g) => { g.id = rgId("g"); g.conditions.forEach((c) => { c.id = rgId("c"); }); });
    copy.routes.forEach((r) => { r.id = rgId("r"); });
    copy.createdDate = now; copy.createdAt = formatDateTime(now); copy.updatedDate = now; copy.updatedAt = copy.createdAt; copy.createdBy = CURRENT_ADMIN.email;
    RG_RULES.push(copy);
    rgLogChange(copy.id, "RULE", "created", "—", copy.name, rg("duplicated")(rule.name));
    showToast(rg("rules.duplicated"));
    window.location.hash = `#/settings-routing-rules/rule/${copy.id}`;
  });
}

// ---- Редактор маршрутов (правило и маршрут по умолчанию) -------------------------------------------------------
function rgProviderOptions(selected, pair) {
  return RG_PROVIDERS.filter((p) => !pair || rgProviderSupports(p, pair.currency, pair.rail)).map((p) => `<option value="${p.id}"${p.id === selected ? " selected" : ""}>${pdEscape(p.name)}${p.status !== "ACTIVE" ? ` (${rg("providerOff")})` : ""}</option>`).join("");
}

function rgNostroOptions(providerId, selected) {
  const list = rgNostroList(providerId);
  return `<option value="">${rg("route.noNostro")}</option>${list.map((n) => `<option value="${n.id}"${n.id === selected ? " selected" : ""}${n.status === "ACTIVE" ? "" : " disabled"}>${pdEscape(n.extId)} · ${n.currencies.join("/")}${n.status === "ACTIVE" ? "" : ` · ${n.status}`}</option>`).join("")}`;
}

function rgRouteRowsHtml(routes, editable, pair) {
  const addBtn = editable ? `<button type="button" class="btn-secondary pn-add-btn rg-add" data-rg-route="add">${PLUS_ICON_SVG}<span>${rg("route.add")}</span></button>` : "";
  if (!routes.length) return `<div class="rg-routes-box"><div class="table-cell-muted">${rg("route.empty")}</div>${addBtn}</div>`;
  return `<div class="rg-routes-box"><div class="rg-routes">${routes.map((r, i) => {
    const p = rgProviderById(r.providerId);
    const n = rgNostroById(r.nostroAccountId);
    const role = i === 0 ? rg("route.primary") : rg("route.fallback")(i);
    if (!editable) {
      return `<div class="rg-route"><span class="rg-route-num">${i + 1}</span><div class="rg-route-main"><strong>${pdEscape(p ? p.name : "—")}</strong><span class="table-cell-muted">${n ? `${rg("route.nostro")}: ${pdEscape(n.extId)} · ${n.currencies.join("/")}` : rg("route.noNostro")}</span></div><span class="badge ${i === 0 ? "badge-info" : "badge-neutral"}">${role}</span></div>`;
    }
    return `<div class="rg-route" data-i="${i}"><span class="rg-route-num">${i + 1}</span>
      <div class="rg-route-fields"><select class="address-form-input" data-f="provider">${rgProviderOptions(r.providerId, pair)}</select><select class="address-form-input" data-f="nostro">${rgNostroOptions(r.providerId, r.nostroAccountId)}</select></div>
      <span class="rg-route-tools"><button type="button" class="pn-x" data-rg-route="up" title="${escapeAttr(rg("route.up"))}"${i === 0 ? " disabled" : ""}>↑</button><button type="button" class="pn-x" data-rg-route="down" title="${escapeAttr(rg("route.down"))}"${i === routes.length - 1 ? " disabled" : ""}>↓</button><button type="button" class="pn-x" data-rg-route="del" title="${escapeAttr(rg("route.remove"))}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 8 8M14 6l-8 8"/></svg></button></span></div>`;
  }).join("")}</div>${addBtn}</div>`;
}

// Общая привязка: routes — рабочий массив, onChange — перерисовка контейнера; pair — {currency, rail} (для маршрутов по умолчанию)
function rgBindRouteRows(root, routes, onChange, pair) {
  root.querySelectorAll(".rg-route[data-i]").forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelector("[data-f='provider']").addEventListener("change", (e) => { routes[i].providerId = e.target.value; routes[i].nostroAccountId = null; onChange(); });
    row.querySelector("[data-f='nostro']").addEventListener("change", (e) => { routes[i].nostroAccountId = e.target.value || null; onChange(); });
    row.querySelectorAll("[data-rg-route]").forEach((b) => b.addEventListener("click", () => {
      const a = b.dataset.rgRoute;
      if (a === "up" && i > 0) [routes[i - 1], routes[i]] = [routes[i], routes[i - 1]];
      else if (a === "down" && i < routes.length - 1) [routes[i + 1], routes[i]] = [routes[i], routes[i + 1]];
      else if (a === "del") routes.splice(i, 1);
      onChange();
    }));
  });
  const add = root.querySelector(".rg-add");
  if (add) add.addEventListener("click", () => {
    const first = RG_PROVIDERS.find((p) => !pair || rgProviderSupports(p, pair.currency, pair.rail)) || RG_PROVIDERS[0];
    routes.push({ id: rgId("r"), providerId: first.id, nostroAccountId: null });
    onChange();
  });
}

// ---- Вкладка «Маршруты по умолчанию» --------------------------------------------------------------------------------
function rgPairSupported(currency, rail) {
  return RG_PROVIDERS.some((p) => rgProviderSupports(p, currency, rail));
}

function rgDefaultsTab() {
  // Плоская таблица: одна строка на пару «валюта + рельс», которую хоть один провайдер поддерживает
  const head = `<tr><th>${rg("defaults.currency")}</th><th>${rg("attr.rail")}</th><th>${rg("columns.routes")}</th><th></th></tr>`;
  const rows = RG_CURRENCIES.flatMap((cur) => RG_RAILS.filter((rail) => rgPairSupported(cur, rail)).map((rail) => {
    const d = rgDefaultFor(cur, rail);
    const route = d ? rgRoutesCell(d.routes) : `<span class="badge badge-warning">${rg("defaults.missing")}</span>`;
    return `<tr><td><strong>${cur}</strong></td><td>${rail}</td><td>${route}</td><td class="rg-actions-cell"><button type="button" class="btn-secondary" data-rg-default="${cur}:${rail}">${EDIT_ICON_SVG}<span>${d ? rg("defaults.change") : rg("defaults.configure")}</span></button></td></tr>`;
  })).join("");
  return `<div class="profile-flat-block">
    ${flatSection(rg("defaults.title"), `<p class="table-cell-muted rg-intro">${rg("defaults.intro")}${rg("defaults.providersLink")(vbLink("#/settings-vabs-providers", rg("defaults.openProviders")))}</p><div class="table-scroll"><table class="data-table rg-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`)}
  </div>`;
}

function rgBindDefaults() {
  const root = document.getElementById("rg-defaults-content");
  vbAttachRows(root);
  root.querySelectorAll("[data-rg-default]").forEach((b) => b.addEventListener("click", () => { const [cur, rail] = b.dataset.rgDefault.split(":"); rgOpenDefaultEditor(cur, rail); }));
}

function rgOpenDefaultEditor(currency, rail) {
  const existing = rgDefaultFor(currency, rail);
  const work = existing ? rgClone(existing.routes) : [];
  const pair = { currency, rail };
  openModal({
    title: rg("defaults.editTitle")(currency, rail),
    width: 640,
    bodyHtml: `<p class="modal-confirm-text">${rg("defaults.editIntro")}</p><div id="rg-def-editor"></div><div class="form-error" id="rg-def-error" hidden></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="rg-def-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="rg-def-save">${vt("common.save")}</button>`,
    onMount: (el) => {
      const box = el.querySelector("#rg-def-editor");
      const draw = () => { box.innerHTML = rgRouteRowsHtml(work, true, pair); rgBindRouteRows(box, work, draw, pair); };
      draw();
      el.querySelector("#rg-def-cancel").addEventListener("click", closeModal);
      el.querySelector("#rg-def-save").addEventListener("click", () => {
        const err = el.querySelector("#rg-def-error");
        const bad = work.some((r) => !rgProviderSupports(rgProviderById(r.providerId), currency, rail));
        const dup = new Set(work.map((r) => `${r.providerId}:${r.nostroAccountId || ""}`)).size !== work.length;
        if (bad) { err.textContent = rg("errors.unsupported")(currency, rail); err.hidden = false; return; }
        if (dup) { err.textContent = rg("errors.duplicateRoute"); err.hidden = false; return; }
        closeModal();
        rgAskReason({
          title: rg("defaults.saveTitle")(currency, rail), intro: rg("defaults.saveIntro"), submit: vt("common.save"),
          onDone: () => {
            const old = existing ? existing.routes.map((r) => (rgProviderById(r.providerId) || {}).name).join(" → ") : "—";
            if (existing && work.length) existing.routes = work;
            else if (existing) RG_DEFAULTS.splice(RG_DEFAULTS.indexOf(existing), 1);
            else if (work.length) RG_DEFAULTS.push({ currency, rail, routes: work });
            showToast(rg("defaults.saved"));
            render();
          },
        });
      });
    },
  });
}

// ---- Вкладка «Исполнения» ------------------------------------------------------------------------------------------
// Допущение прототипа: платежи в исполнениях мока не связаны с платежами раздела «Операции», поэтому при первом
// обращении привязываем каждое исполнение к реальному исходящему фиатному платежу — чтобы ссылка вела в его карточку.
function rgLinkPayments() {
  const pool = OPERATIONS_PAYMENTS_MOCK.filter((r) => !isCryptoPayment(r) && r.direction === "OUTGOING");
  const list = pool.length ? pool : OPERATIONS_PAYMENTS_MOCK;
  RG_EXECUTIONS.forEach((e, i) => { if (!e.paymentLinked && list.length) { e.paymentId = list[i % list.length].id; e.paymentLinked = true; } });
}

// Код реального платежа, к которому привязано исполнение (см. rgLinkPayments) — для отображения вместо сырого UUID
function rgPaymentCode(e) {
  rgLinkPayments();
  const p = OPERATIONS_PAYMENTS_MOCK.find((r) => r.id === e.paymentId);
  return p ? p.code : pdShort(e.paymentId);
}

const rgExecList = createAccessList({
  key: "rg-exec",
  data: () => { rgLinkPayments(); return RG_EXECUTIONS; },
  searchPlaceholder: () => rg("exec.search"),
  searchText: (e) => `${e.code} ${rgPaymentCode(e)} ${e.ruleId ? (rgRuleById(e.ruleId) || {}).name : ""}`,
  tab: { get: (e) => e.status, values: RG_EXEC_STATUSES, label: (v) => rg(`execStatus.${v}`) },
  filters: [
    { id: "rule", kind: "multi", label: () => rg("columns.rule"), get: (e) => e.ruleId || "default", options: () => [...RG_RULES.map((r) => ({ value: r.id, label: r.name })), { value: "default", label: rg("exec.noRule") }] },
    { id: "provider", kind: "multi", label: () => rg("columns.provider"), get: (e) => rgLastProviderId(e) || "", options: () => RG_PROVIDERS.map((p) => ({ value: p.id, label: p.name })) },
    { id: "rail", kind: "multi", label: () => rg("attr.rail"), get: (e) => e.payment.rail, options: () => RG_RAILS.map((r) => ({ value: r, label: r })) },
    { id: "currency", kind: "multi", label: () => rg("attr.currency"), get: (e) => e.payment.currency, options: () => RG_CURRENCIES.map((r) => ({ value: r, label: r })) },
    { id: "created", kind: "date", label: () => rg("columns.created"), get: (e) => e.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, attempts: (a, b) => a.attempts.length - b.attempts.length },
  columns: [
    { label: () => rg("columns.execution"), html: (e) => `<div class="identity-cell"><button type="button" class="table-link" data-rg-exec="${e.id}">${e.code}</button><span class="table-cell-muted">${rg("exec.payment")}: ${rgPaymentCode(e)}</span></div>` },
    { label: () => rg("columns.status"), html: (e) => rgExecBadge(e.status) },
    { label: () => rg("columns.payment"), html: (e) => `<div class="identity-cell"><span>${rgPaymentText(e.payment)}</span><span class="table-cell-muted">${e.payment.senderType === "CORPORATE" ? rg("enum.type.CORPORATE") : rg("enum.type.INDIVIDUAL")}</span></div>` },
    { label: () => rg("columns.rule"), html: (e) => { const r = rgRuleById(e.ruleId); return r ? vbLink(`#/settings-routing-rules/rule/${r.id}`, pdEscape(r.name)) : `<span class="table-cell-muted">${rg("exec.noRule")}</span>`; } },
    { label: () => rg("columns.finalRoute"), html: (e) => { const a = e.attempts[e.attempts.length - 1]; return a ? `<div class="identity-cell">${rgRouteLabel(a, true)}<span class="table-cell-muted">${a.routeSource === "DEFAULT" ? rg("source.DEFAULT") : rg("source.RULE")}</span></div>` : "—"; } },
    { label: () => rg("columns.attempts"), sort: "attempts", html: (e) => e.attempts.length },
    { label: () => rg("columns.created"), sort: "created", html: (e) => dateTimeCell(e.createdAt) },
    { label: () => rg("columns.finished"), html: (e) => (e.finishedAt ? dateTimeCell(e.finishedAt) : "—") },
  ],
  headerAction: () => `<span class="filters-bar-end">${exportMenuHtml("rg-export", rg("export.button"), rg("export.hint"))}</span>`,
  attachHeaderAction: () => bindExportMenu("rg-export", (f) => {
    exportTable("routing-executions", f, [rg("columns.execution"), rg("columns.payment"), rg("columns.status"), rg("columns.rule"), rg("columns.finalRoute"), rg("columns.attempts"), rg("columns.created"), rg("columns.finished")],
      RG_EXECUTIONS.map((e) => { const a = e.attempts[e.attempts.length - 1]; const r = rgRuleById(e.ruleId); return [e.code, `${e.payment.amount} ${e.payment.currency} ${e.payment.rail}`, rg(`execStatus.${e.status}`), r ? r.name : rg("exec.noRule"), a ? (rgProviderById(a.providerId) || {}).name : "", e.attempts.length, e.createdAt, e.finishedAt || ""]; }));
    showToast(rg("export.done"));
  }),
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    wrap.querySelectorAll("[data-rg-exec]").forEach((b) => b.addEventListener("click", () => rgOpenExecution(b.dataset.rgExec)));
  },
});

// ---- Страница исполнения (settings-routing-executions/{id}) -----------------------------------------------------
function rgExecutionRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^settings-routing-executions\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function rgOpenExecution(id) {
  window.location.hash = `#/settings-routing-executions/${id}`;
}

function viewExecutionDetail(id) {
  rgLinkPayments();
  const e = RG_EXECUTIONS.find((x) => x.id === id);
  if (!e) return vbNotFound();
  const r = rgRuleById(e.ruleId);
  const p = e.payment;
  const c = rg("columns");
  const header = vbDetailHeader({
    backHash: "#/settings-routing-executions",
    title: `${rg("exec.title")} ${e.code}`,
    badges: rgExecBadge(e.status),
    subtitle: [e.createdAt, ...(e.finishedAt ? [e.finishedAt] : [])].join(" · "),
  });
  const attempts = e.attempts.length
    ? `<div class="table-scroll"><table class="data-table rg-table rg-attempts"><thead><tr><th>#</th><th>${c.source}</th><th>${c.provider}</th><th>${c.status}</th><th>${c.error}</th><th>${c.created}</th><th></th></tr></thead><tbody>${e.attempts.map((a) => `<tr><td>${a.attemptNumber}</td><td><span class="badge ${a.routeSource === "DEFAULT" ? "badge-info" : "badge-neutral"}">${rg(`source.${a.routeSource}`)}</span></td><td>${rgRouteLabel(a)}</td><td>${rgAttemptBadge(a.status)}</td><td>${a.errorCode ? `<div class="identity-cell"><span class="vb-mono">${a.errorCode}</span><span class="table-cell-muted">${pdEscape(a.errorMessage)}</span></div>` : "—"}</td><td>${dateTimeCell(a.createdAt)}</td><td class="rg-actions-cell">${a.rawResponse ? `<button type="button" class="table-link rg-raw-toggle" data-rg-raw aria-expanded="false"><span>${rg("exec.rawShow")}</span><span class="rg-raw-caret">${ICONS.chevron}</span></button>` : ""}</td></tr>${a.rawResponse ? `<tr class="rg-raw-row" hidden><td></td><td colspan="6">${vbJson(a.rawResponse)}</td></tr>` : ""}`).join("")}</tbody></table></div>`
    : `<div class="table-cell-muted">${rg("exec.noAttempts")}</div>`;
  const payment = `<div class="rg-meta-list">${rgMetaRow(rg("exec.payment"), vbLink(`#/operations-payments/${e.paymentId}`, `<span class="vb-mono">${rgPaymentCode(e)}</span>`))}${rgMetaRow(c.payment, rgPaymentText(p))}${rgMetaRow(rg("attr.recipientCountry"), pdEscape(RG_COUNTRIES[p.recipientCountry] || p.recipientCountry))}${rgMetaRow(rg("attr.senderType"), rgEnumLabel("senderType", p.senderType))}${rgMetaRow(rg("attr.recipientType"), rgEnumLabel("recipientType", p.recipientType))}${rgMetaRow(rg("attr.kycStatus"), rgEnumLabel("kycStatus", p.kycStatus))}</div>`;
  const rule = `<div class="rg-meta-list">${rgMetaRow(c.rule, r ? vbLink(`#/settings-routing-rules/rule/${r.id}`, pdEscape(r.name)) : `<span class="table-cell-muted">${rg("exec.noRule")}</span>`)}${rgMetaRow(c.status, rgExecBadge(e.status))}${rgMetaRow(c.attempts, e.attempts.length)}${rgMetaRow(c.created, e.createdAt)}${rgMetaRow(c.finished, e.finishedAt || "—")}</div>`;
  return `<div id="vb-root">${header}<div class="client-detail-grid">
    <div class="client-detail-grid-main"><div class="profile-flat-block">${flatSection(`${rg("exec.attempts")} · ${e.attempts.length}`, attempts)}</div></div>
    <div class="client-detail-grid-side">${sectionCard(rg("exec.title"), rule)}${sectionCard(rg("exec.payment"), payment)}</div>
  </div></div>`;
}

function initExecutionDetail() {
  const root = document.getElementById("vb-root");
  if (!root) return;
  vbAttachCommon(root);
  // Ответ провайдера скрыт, пока не нажали «Ответ провайдера» в строке попытки
  root.querySelectorAll("[data-rg-raw]").forEach((btn) => btn.addEventListener("click", () => {
    const row = btn.closest("tr").nextElementSibling;
    const open = row.hidden;
    row.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("is-open", open);
    btn.firstElementChild.textContent = open ? rg("exec.rawHide") : rg("exec.rawShow");
  }));
}
// ---- Вкладка «Статистика» --------------------------------------------------------------------------------------------
// Донат "успешно / по умолчанию / ошибка / ждут повтора" — те же 4 числа, что и в KPI-карточках ниже, просто ещё и
// диаграммой в шапке (тот же приём, что и в остальной аналитике: KPI-карточки + донат того же среза).
function rgStatusDonutSegments(s) {
  return [
    { label: rg("stats.success"), value: s.success, color: "var(--color-success)" },
    { label: rg("stats.defaults"), value: s.defaults, color: "var(--color-info)" },
    { label: rg("stats.failed"), value: s.failed, color: "var(--color-danger)" },
    { label: rg("stats.retry"), value: s.retry, color: "var(--color-warning)" },
  ];
}

function rgAnalyticsHero(s, days) {
  const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);
  return `<div class="hm-hero">
    <div class="hm-hero-main">
      <div class="hm-hello-row"><h1 class="hm-hello">${t("nav.analytics-routing")}</h1>${sectionHintBtn("an-routing-hint-btn", rg("hero.info"))}</div>
      <div class="hm-date">${anCurrentDateText()}</div>
      <p class="hm-lead">${rg("hero.lead")}</p>
      <div class="hm-pills">
        <span class="hm-pill"><strong>${s.total}</strong> ${rg("hero.totalPill")(days)}</span>
        <span class="hm-pill"><strong>${pct(s.success)}%</strong> ${rg("hero.successRate")}</span>
      </div>
      <div class="ed-actions">
        <button type="button" class="btn-secondary an-hero-btn" id="rg-an-refresh">${AN_REFRESH_ICON_SVG}<span>${rg("hero.refresh")}</span></button>
        <button type="button" class="btn-secondary an-hero-btn" id="rg-an-export-pdf">${DOWNLOAD_ICON_SVG}<span>${rg("hero.exportPdf")}</span></button>
      </div>
    </div>
    <div class="hm-hero-map">
      <div class="an-hero-donut">${dashDonut(rgStatusDonutSegments(s), { emptyText: rg("stats.empty"), legendNarrow: true, large: true })}</div>
    </div>
  </div>`;
}

function rgStatsTab() {
  const s = rgStats(rgStatsDays);
  const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);
  const period = [7, 14].map((d) => `<button type="button" class="quick-tab${rgStatsDays === d ? " is-active" : ""}" data-rg-days="${d}">${rg("stats.days")(d)}</button>`).join("");
  const cards = `<div class="metrics-grid an-kpi-grid">${renderMetricCard(s.total, rg("stats.total"), rg("stats.attemptsSub")(s.attempts))}${renderMetricCard(`${pct(s.success)}%`, rg("stats.success"), `${s.success}`)}${renderMetricCard(`${pct(s.defaults)}%`, rg("stats.defaults"), `${s.defaults}`)}${renderMetricCard(s.failed, rg("stats.failed"), `${pct(s.failed)}%`)}${renderMetricCard(s.retry, rg("stats.retry"), "")}${renderMetricCard(rgNum(s.avgAttempts), rg("stats.avg"), "")}</div>`;
  const maxP = Math.max(1, ...s.providers.map((p) => p.count));
  const provBars = s.providers.length ? s.providers.map((p) => { const pr = rgProviderById(p.providerId); return `<div class="rg-bar-row"><span class="rg-bar-name">${pdEscape(pr ? pr.name : "—")}</span><div class="rg-bar"><span class="rg-bar-ok" style="width:${(p.success / maxP) * 100}%"></span><span class="rg-bar-fail" style="width:${(p.failed / maxP) * 100}%"></span></div><span class="rg-bar-val">${p.count}<span class="table-cell-muted"> · ${rg("stats.okFail")(p.success, p.failed)}</span></span></div>`; }).join("") : `<div class="table-cell-muted">${rg("stats.empty")}</div>`;
  const ruleRows = s.rules.length ? s.rules.map((r) => { const rule = rgRuleById(r.ruleId); return `<tr><td>${rule ? vbLink(`#/settings-routing-rules/rule/${rule.id}`, pdEscape(rule.name)) : "—"}</td><td>${r.count}</td><td>${r.success}</td><td>${r.failed}</td><td>${Math.round((r.count / (s.total || 1)) * 100)}%</td></tr>`; }).join("") : `<tr><td colspan="5"><span class="table-cell-muted">${rg("stats.empty")}</span></td></tr>`;
  const errRows = s.errors.map(([code, n]) => ({ label: rg(`errorNames.${code}`), title: code, value: n }));

  return `
    ${rgAnalyticsHero(s, rgStatsDays)}

    <div class="rg-toolbar"><div class="quick-tabs">${period}</div></div>
    ${cards}

    ${anFlatSection(rg("stats.byProvider"), anChartCard(null, provBars), rg("stats.byProviderDesc"))}
    ${anFlatSection(
      rg("stats.byRule"),
      anChartCard(null, `<div class="table-scroll"><table class="data-table"><thead><tr><th>${rg("columns.rule")}</th><th>${rg("stats.executions")}</th><th>${rg("stats.ok")}</th><th>${rg("stats.fail")}</th><th>${rg("stats.share")}</th></tr></thead><tbody>${ruleRows}</tbody></table></div>`),
      rg("stats.byRuleDesc")
    )}
    ${anFlatSection(rg("stats.errors"), anChartCard(null, anBarListHtml(errRows, { emptyText: rg("stats.empty") })), rg("stats.errorsDesc"))}
  `;
}

function rgBindStats() {
  const root = document.getElementById("rg-content");
  vbAttachRows(root);
  root.querySelectorAll("[data-rg-days]").forEach((b) => b.addEventListener("click", () => { rgStatsDays = Number(b.dataset.rgDays); root.innerHTML = rgStatsTab(); rgBindStats(); }));
  const refreshBtn = document.getElementById("rg-an-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", () => { render(); showToast(rg("hero.refreshed")); });
  const exportBtn = document.getElementById("rg-an-export-pdf");
  if (exportBtn) exportBtn.addEventListener("click", () => exportAnalyticsRoutingPdf());
}

// ---- Вкладка «Настройки» ----------------------------------------------------------------------------------------------
function rgSettingsWork() {
  if (!rgSettingsDraft) rgSettingsDraft = rgClone(RG_SETTINGS);
  return rgSettingsDraft;
}

function rgSettingsDirty() {
  return JSON.stringify(rgSettingsWork()) !== JSON.stringify(RG_SETTINGS);
}

function rgNotifyCard(key, n) {
  const params = {
    failureRate: `<div class="rg-params"><label class="filters-field vb-field"><span class="filters-field-label">${rg("settings.threshold")}</span><input class="address-form-input" type="number" min="1" max="100" data-rg-num="failureRate:threshold" value="${n.threshold}" /></label><label class="filters-field vb-field"><span class="filters-field-label">${rg("settings.intervalMin")}</span><input class="address-form-input" type="number" min="5" max="1440" data-rg-num="failureRate:intervalMin" value="${n.intervalMin}" /></label></div>`,
    defaultUsage: `<div class="rg-params"><label class="filters-field vb-field"><span class="filters-field-label">${rg("settings.interval")}</span><select class="address-form-input" data-rg-sel="defaultUsage:interval">${["DAY", "WEEK", "MONTH"].map((v) => `<option value="${v}"${n.interval === v ? " selected" : ""}>${rg(`settings.intervals.${v}`)}</option>`).join("")}</select></label><label class="filters-field vb-field"><span class="filters-field-label">${rg("settings.count")}</span><input class="address-form-input" type="number" min="1" data-rg-num="defaultUsage:count" value="${n.count}" /></label></div>`,
  }[key] || "";
  const count = rgRecipientIds(n).length;
  const recipients = `<div class="rg-notify-channel"><span class="filters-field-label">${rg("settings.recipients")}</span><button type="button" class="btn-secondary" data-rg-recipients="${key}">${count ? rg("settings.recipientsCount")(count, acPlural(count, rg("settings.adminOne"), rg("settings.adminFew"), rg("settings.adminMany"))) : rg("settings.recipientsNone")}</button></div>`;
  return `<div class="rg-notify${n.enabled ? "" : " is-off"}"><label class="pn-switch-row"><input type="checkbox" data-rg-en="${key}"${n.enabled ? " checked" : ""} /><span><strong>${rg(`settings.notify.${key}.title`)}</strong><br><span class="table-cell-muted">${rg(`settings.notify.${key}.text`)}</span></span></label>${n.enabled ? `${params}${recipients}` : ""}</div>`;
}

// Получатели уведомления — активные администраторы; хранятся списком id в настройках уведомления.
function rgRecipientIds(n) {
  const active = new Set(ACCESS_ADMINS.filter((a) => a.status === "ACTIVE").map((a) => a.id));
  return (n.recipients || []).filter((id) => active.has(id));
}

function rgOpenRecipients(key, w, onDone) {
  const n = w.notifications[key];
  // Мультивыбор — общий пикер acRolePicker (выпадающий список с поиском, выбранные — чипами); администраторы
  // подставляются вместо ролей: имя — название, почта — описание.
  const admins = ACCESS_ADMINS.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, name: a.name, description: a.email }));
  let picker = null;
  openModal({
    title: rg("settings.recipientsTitle"),
    width: 520,
    bodyHtml: `<label class="filters-field vb-field"><span class="filters-field-label">${rg("settings.recipients")}</span></label><div id="rg-rcp-box"></div><p class="table-cell-muted rg-hint">${rg("settings.emailNote")}</p>`,
    footerHtml: `<button type="button" class="btn-secondary" id="rg-rcp-cancel">${rg("rule.wizard.cancel")}</button><button type="button" class="btn-primary" id="rg-rcp-ok">${rg("settings.recipientsApply")}</button>`,
    onMount: (el) => {
      picker = acRolePicker(el, "rg-rcp-box", rgRecipientIds(n), admins, { placeholder: rg("settings.pickAdmins"), search: rg("settings.searchAdmins"), empty: rg("settings.noAdmins") }, true);
      el.querySelector("#rg-rcp-cancel").addEventListener("click", closeModal);
      el.querySelector("#rg-rcp-ok").addEventListener("click", () => { n.recipients = picker.ids(); closeSelectDropdown(); closeModal(); onDone(); });
    },
  });
}

function rgSettingsTab() {
  const w = rgSettingsWork();
  const retry = `<p class="table-cell-muted rg-intro">${rg("settings.retryIntro")}</p><div class="rg-params"><label class="filters-field vb-field"><span class="filters-field-label">${rg("settings.maxRetries")}</span><input class="address-form-input" type="number" min="0" max="10" data-rg-num="retry:maxRetries" value="${w.retry.maxRetries}" /></label><label class="filters-field vb-field"><span class="filters-field-label">${rg("settings.delayMs")}</span><input class="address-form-input" type="number" min="0" max="600000" step="500" data-rg-num="retry:delayMs" value="${w.retry.delayMs}" /></label></div>`;
  const notes = Object.keys(w.notifications).map((k) => rgNotifyCard(k, w.notifications[k])).join("");
  const bar = rgSettingsDirty() ? `<div class="tf-savebar"><span class="tf-savebar-text">${rg("settings.unsaved")}</span><span class="tf-savebar-actions"><button type="button" class="btn-secondary" id="rg-set-discard">${rg("settings.discard")}</button><button type="button" class="btn-primary" id="rg-set-save">${rg("settings.save")}</button></span></div>` : "";
  return `<div class="profile-flat-block">${flatSection(rg("settings.retryTitle"), retry)}${flatSection(rg("settings.notifyTitle"), `<p class="table-cell-muted rg-intro">${rg("settings.notifyIntro")}</p>${notes}`)}</div>${bar}`;
}

function rgBindSettings() {
  const root = document.getElementById("rg-settings-content");
  const w = rgSettingsWork();
  const redraw = () => { root.innerHTML = rgSettingsTab(); rgBindSettings(); };
  root.querySelectorAll("[data-rg-num]").forEach((i) => i.addEventListener("change", () => {
    const [group, field] = i.dataset.rgNum.split(":");
    const v = Math.max(0, Math.round(Number(i.value) || 0));
    if (group === "retry") w.retry[field] = v; else w.notifications[group][field] = v;
    redraw();
  }));
  root.querySelectorAll("[data-rg-sel]").forEach((s) => s.addEventListener("change", () => { const [g, f] = s.dataset.rgSel.split(":"); w.notifications[g][f] = s.value; redraw(); }));
  root.querySelectorAll("[data-rg-en]").forEach((i) => i.addEventListener("change", () => { w.notifications[i.dataset.rgEn].enabled = i.checked; redraw(); }));
  root.querySelectorAll("[data-rg-recipients]").forEach((b) => b.addEventListener("click", () => rgOpenRecipients(b.dataset.rgRecipients, w, redraw)));
  const discard = root.querySelector("#rg-set-discard");
  if (discard) discard.addEventListener("click", () => { rgSettingsDraft = null; redraw(); });
  const save = root.querySelector("#rg-set-save");
  if (save) save.addEventListener("click", () => {
    rgAskReason({
      title: rg("settings.saveTitle"), intro: rg("settings.saveIntro"), submit: rg("settings.save"),
      onDone: () => { Object.assign(RG_SETTINGS.retry, w.retry); RG_SETTINGS.notifications = rgClone(w.notifications); rgSettingsDraft = null; showToast(rg("settings.saved")); render(); },
    });
  });
}

// ---- Проверка маршрута (симулятор) --------------------------------------------------------------------------------
function rgSelectHtml(id, label, options, selected) {
  return vbSelect(id, label, options, selected);
}

function rgOpenSimulator() {
  const f = rg("simulate");
  const now = MOCK_NOW;
  const pad = (n) => String(n).padStart(2, "0");
  const val = { currency: "EUR", rail: "SWIFT", amount: "15000", recipientCountry: "DE", recipientType: "CORPORATE", senderType: "CORPORATE", kycStatus: "3", time: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
  const attrOpts = (id) => rgAttr(id).options.map((v) => ({ value: v, label: id === "recipientCountry" ? `${v} · ${RG_COUNTRIES[v]}` : rgEnumLabel(id, v) }));
  openModal({
    title: f.title,
    width: 860,
    bodyHtml: `<p class="modal-confirm-text">${f.intro}</p>
      <div class="rg-sim-grid">
        ${rgSelectHtml("sim-currency", rg("attr.currency"), attrOpts("currency"), val.currency)}${rgSelectHtml("sim-rail", rg("attr.rail"), attrOpts("rail"), val.rail)}
        ${vbInput("sim-amount", rg("attr.amount"), val.amount, 'inputmode="decimal"')}${vbInput("sim-time", rg("attr.time"), val.time, 'type="time"')}
        ${rgSelectHtml("sim-country", rg("attr.recipientCountry"), attrOpts("recipientCountry"), val.recipientCountry)}${rgSelectHtml("sim-rtype", rg("attr.recipientType"), attrOpts("recipientType"), val.recipientType)}
        ${rgSelectHtml("sim-stype", rg("attr.senderType"), attrOpts("senderType"), val.senderType)}${rgSelectHtml("sim-kyc", rg("attr.kycStatus"), attrOpts("kycStatus"), val.kycStatus)}
      </div><div id="rg-sim-result"></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="rg-sim-close">${rg("close")}</button>`,
    onMount: (el) => {
      const read = () => {
        const [h, m] = el.querySelector("#sim-time").value.split(":").map(Number);
        const at = new Date(MOCK_NOW); at.setHours(h || 0, m || 0, 0, 0);
        return { currency: el.querySelector("#sim-currency").value, rail: el.querySelector("#sim-rail").value, amount: Number(String(el.querySelector("#sim-amount").value).replace(",", ".")) || 0, createdAt: at, recipientCountry: el.querySelector("#sim-country").value, recipientType: el.querySelector("#sim-rtype").value, senderType: el.querySelector("#sim-stype").value, kycStatus: el.querySelector("#sim-kyc").value };
      };
      const draw = () => { el.querySelector("#rg-sim-result").innerHTML = rgSimResult(read()); el.querySelectorAll("#rg-sim-result [data-vb-hash]").forEach((b) => b.addEventListener("click", () => { closeModal(); window.location.hash = b.dataset.vbHash; })); };
      el.querySelectorAll("select, input").forEach((i) => { i.addEventListener("change", draw); i.addEventListener("input", draw); });
      el.querySelector("#rg-sim-close").addEventListener("click", closeModal);
      draw();
    },
  });
}

function rgChainSteps(routes, source, start) {
  return routes.map((r, i) => {
    const p = rgProviderById(r.providerId);
    const n = rgNostroById(r.nostroAccountId);
    const warn = (p && p.status !== "ACTIVE" ? rg("simulate.providerOff") : "") || (n && n.status !== "ACTIVE" ? rg("simulate.nostroOff")(n.status) : "");
    return `<div class="rg-step"><span class="rg-route-num">${start + i}</span><div class="rg-route-main"><strong>${rgRouteLabel(r)}</strong><span class="table-cell-muted">${rg(`source.${source}`)}${i ? ` · ${rg("route.fallback")(i)}` : ""}</span></div>${warn ? `<span class="badge badge-warning">${warn}</span>` : ""}</div>`;
  }).join("");
}

function rgSimResult(payment) {
  const f = rg("simulate");
  const ev = rgEvaluate(payment);
  const first = ev.first;
  const dflt = ev.defaults ? ev.defaults.routes : [];
  let verdict;
  if (first) verdict = `<div class="rg-verdict is-ok"><strong>${f.byRule(pdEscape(first.rule.name), first.rule.priority, first.groupIndex + 1)}</strong> ${vbLink(`#/settings-routing-rules/rule/${first.rule.id}`, f.open)}</div>`;
  else if (dflt.length) verdict = `<div class="rg-verdict is-default"><strong>${f.noRule}</strong></div>`;
  else verdict = `<div class="rg-verdict is-fail"><strong>${f.failed}</strong></div>`;
  const chain = `${first ? rgChainSteps(first.rule.routes, "RULE", 1) : ""}${dflt.length ? `${rgChainSteps(dflt, "DEFAULT", (first ? first.rule.routes.length : 0) + 1)}` : ""}`;
  const rules = ev.rules.length ? ev.rules.map((r) => {
    const later = r.ok && r !== first;
    const reason = r.ok ? (later ? f.matchedLower : f.matched(r.groupIndex + 1)) : `${f.notMatched}: ${pdEscape(rgCondShort(r.failedCond))}`;
    return `<div class="rg-check-row ${r.ok ? "is-ok" : ""}"><span class="rg-check-dot">${r.ok ? "✓" : "✕"}</span><span>${pdEscape(r.rule.name)} <span class="table-cell-muted">· ${rg("columns.priority")} ${r.rule.priority}</span></span><span class="table-cell-muted">${reason}</span></div>`;
  }).join("") : `<div class="table-cell-muted">${f.noRules}</div>`;
  return `<div class="rg-sim-result">${verdict}
    <div class="pn-block-title">${f.chain}</div>${chain ? `<div class="rg-steps">${chain}</div>` : `<div class="table-cell-muted">${f.emptyChain}</div>`}

    <div class="pn-block-title">${f.rulesCheck}</div><div class="rg-checks">${rules}</div></div>`;
}

// ---- Страница правила ---------------------------------------------------------------------------------------------
let rgRuleState = null; // { id (null для нового), draft, editing }

function rgRuleRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^settings-routing-rules\/rule\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function rgBlankRule() {
  return {
    id: null, name: "", description: "", priority: 0, status: "DRAFT", dateStart: null, dateEnd: null,
    groups: [rgNewGroup()], routes: [], createdAt: "", updatedAt: "",
  };
}

function rgNewGroup() {
  return { id: rgId("g"), conditions: [{ id: rgId("c"), attrId: "currency", operator: "EQ", value: RG_CURRENCIES[1], valueMax: null }, { id: rgId("c"), attrId: "rail", operator: "EQ", value: RG_RAILS[0], valueMax: null }] };
}

function viewRuleDetail(id) {
  if (!rgRuleState || rgRuleState.key !== id) {
    const rule = id === "new" ? null : rgRuleById(id);
    rgRuleState = { key: id, id: rule ? rule.id : null, draft: rule ? rgClone(rule) : rgBlankRule(), editing: !rule };
    rgRuleDetailTab = "rule";
  }
  const st = rgRuleState;
  if (id !== "new" && !st.id) return vbNotFound();
  return `<div id="vb-root">${rgRuleHeader()}<div id="rg-rule-body">${rgRuleBody()}</div></div>`;
}

function rgRuleHeader() {
  const st = rgRuleState;
  const rule = st.id ? rgRuleById(st.id) : null;
  const title = st.id ? pdEscape(rule.name) : rg("rule.newTitle");
  const badges = st.id ? `${rgStatusBadge(rule.status)}<span class="badge badge-neutral">${rg("columns.priority")} ${rule.priority}</span>` : rgStatusBadge("DRAFT");
  const sub = st.id ? vbCodeSubtitle(rule.code, [`${rg("rule.created")} ${rule.createdAt}`, `${rg("rule.updated")} ${rule.updatedAt}`]) : rg("rule.newSubtitle");
  let actions = "";
  if (st.id) {
    const items = [{ label: rg("simulate.button"), icon: ICONS.exchange, attrs: `data-rg-head="simulate"` }];
    RG_TRANSITIONS[rule.status].forEach((next) => {
      const label = next === "ACTIVE" ? (rule.status === "ARCHIVED" ? rg("actions.restore") : rg("actions.activate")) : next === "ARCHIVED" ? rg("actions.archive") : rg("actions.delete");
      items.push({ label, icon: next === "ACTIVE" ? CHECK_ICON_SVG : next === "DELETED" ? TRASH_ICON_SVG : ICONS.lock, danger: next === "DELETED", attrs: `data-rg-head="status:${next}"` });
    });
    items.push({ label: rg("actions.duplicate"), icon: COPY_ICON_SVG, attrs: `data-rg-head="duplicate"` });
    items.push({ label: t("headerMenu.exportCard"), icon: DOWNLOAD_ICON_SVG, attrs: `data-vb-action="pdf"` });
    actions = `${st.editing ? "" : `<button type="button" class="btn-primary" data-rg-head="edit">${rg("rule.edit")}</button>`}${rowKebabMenu("rg-head", items)}`;
  }
  return vbDetailHeader({ backHash: "#/settings-routing-rules", title, badges, subtitle: sub, actions });
}

function rgOpts(list, selected) {
  return list.map((o) => `<option value="${escapeAttr(o.value)}"${String(o.value) === String(selected) ? " selected" : ""}>${pdEscape(o.label)}</option>`).join("");
}

function rgToInput(d) {
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function rgCondEditHtml(g, gi, c, ci) {
  const attr = rgAttr(c.attrId);
  const locked = ci < 2;
  const attrSel = `<select class="address-form-input" data-f="attr"${locked ? " disabled" : ""}>${rgOpts(RG_ATTRS.filter((a) => !a.required || a.id === c.attrId).map((a) => ({ value: a.id, label: rg(`attr.${a.id}`) })), c.attrId)}</select>`;
  const opSel = `<select class="address-form-input" data-f="op">${rgOpts(RG_OPERATORS[attr.type].map((o) => ({ value: o, label: rg(`ops.${o}`) })), c.operator)}</select>`;
  let val;
  if (attr.type === "ENUM") val = `<select class="address-form-input" data-f="value">${rgOpts(attr.options.map((v) => ({ value: v, label: c.attrId === "recipientCountry" ? `${v} · ${RG_COUNTRIES[v]}` : rgEnumLabel(c.attrId, v) })), c.value)}</select>`;
  else if (attr.type === "NUMBER") val = `<input class="address-form-input" data-f="value" inputmode="decimal" value="${escapeAttr(c.value)}" placeholder="0" />${c.operator === "BETWEEN" ? `<span class="rg-dash">–</span><input class="address-form-input" data-f="valueMax" inputmode="decimal" value="${escapeAttr(c.valueMax || "")}" placeholder="0" />` : ""}`;
  else if (c.operator === "TIME_BETWEEN") val = `<input class="address-form-input" type="time" data-f="value" value="${escapeAttr(c.value)}" /><span class="rg-dash">–</span><input class="address-form-input" type="time" data-f="valueMax" value="${escapeAttr(c.valueMax || "")}" />`;
  else val = `<input class="address-form-input" type="datetime-local" data-f="value" value="${escapeAttr(c.value)}" />`;
  return `<div class="rg-cond" data-g="${gi}" data-c="${ci}">${attrSel}${opSel}<div class="rg-cond-value">${val}</div>${locked ? `<span class="rg-cond-lock" title="${escapeAttr(rg("rule.requiredHint"))}">${ICONS.lock}</span>` : `<button type="button" class="pn-x" data-rg-cond="del" title="${escapeAttr(rg("rule.removeCondition"))}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 8 8M14 6l-8 8"/></svg></button>`}</div>`;
}

function rgCondViewHtml(c) {
  const attr = rgAttr(c.attrId);
  let val;
  if (c.attrId === "currency" || c.attrId === "rail") val = `<strong>${pdEscape(c.value)}</strong>`;
  else if (attr.type === "ENUM") val = pdEscape(rgEnumLabel(c.attrId, c.value));
  else if (attr.type === "NUMBER") val = c.operator === "BETWEEN" ? `${rgNum(c.value)} – ${rgNum(c.valueMax)}` : rgNum(c.value);
  else val = c.operator === "TIME_BETWEEN" ? `${c.value} – ${c.valueMax}` : rgFmtInput(c.value);
  return `<div class="rg-cond is-view"><span class="rg-cond-attr">${rg(`attr.${c.attrId}`)}</span><span class="rg-cond-op">${rg(`ops.${c.operator}`)}</span><span class="rg-cond-val">${val}</span></div>`;
}

function rgConditionsHtml(d, editing) {
  const groups = d.groups.map((g, gi) => `${gi ? `<div class="rg-or">${rg("or")}</div>` : ""}<div class="rg-group">
      <div class="rg-group-head"><span class="rg-group-title">${rg("rule.group")} ${gi + 1}</span><span class="table-cell-muted">${rg("rule.andHint")}</span>${editing && d.groups.length > 1 ? `<button type="button" class="pn-x rg-group-del" data-rg-group="del:${gi}" title="${escapeAttr(rg("rule.removeGroup"))}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 8 8M14 6l-8 8"/></svg></button>` : ""}</div>
      <div class="rg-conds">${g.conditions.map((c, ci) => (editing ? rgCondEditHtml(g, gi, c, ci) : rgCondViewHtml(c))).join("")}</div>
      ${editing ? `<button type="button" class="btn-secondary pn-add-btn rg-add" data-rg-group="cond:${gi}">${PLUS_ICON_SVG}<span>${rg("rule.addCondition")}</span></button>` : ""}</div>`).join("");
  return `${groups}${editing ? `<button type="button" class="btn-secondary pn-add-btn rg-add" data-rg-group="add">${PLUS_ICON_SVG}<span>${rg("rule.addGroup")}</span></button>` : ""}`;
}

function rgRouteWarnings(d) {
  // Уникальные пары «валюта + рельс» из групп: несколько групп с одной и той же парой (например, добавили
  // группу и не поменяли условия) не должны дублировать одно и то же предупреждение по маршруту.
  const seen = new Set();
  const pairs = [];
  d.groups.forEach((g) => {
    const cur = g.conditions.find((c) => c.attrId === "currency" && c.operator === "EQ");
    const rail = g.conditions.find((c) => c.attrId === "rail" && c.operator === "EQ");
    if (!cur || !rail) return;
    const key = `${cur.value}:${rail.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ currency: cur.value, rail: rail.value });
  });
  return d.routes.map((r) => {
    const p = rgProviderById(r.providerId);
    const bad = pairs.filter((pr) => !rgProviderSupports(p, pr.currency, pr.rail));
    return bad.length ? bad.map((b) => rg("errors.unsupported")(b.currency, b.rail)).join("; ") : "";
  });
}

// Компактная строка "метка — значение" в один ряд с разделителем — для узкой боковой карточки параметров правила
// (в отличие от .profile-fields, где метка сверху, значение снизу — для широкой сетки в главной колонке, здесь не
// подходит: карточка узкая, и такая раскладка растягивает её по высоте без пользы).
function rgMetaRow(label, valueHtml) {
  return `<div class="rg-meta-row"><span class="rg-meta-label">${label}</span><span class="rg-meta-value">${valueHtml}</span></div>`;
}

function rgRuleSummary(d) {
  const s = rg("rule.summary");
  const groups = d.groups.map((g) => g.conditions.map((c) => rgCondShort(c)).join(" · ")).join(` ${rg("or")} `);
  const chain = d.routes.length ? d.routes.map((r) => `${(rgProviderById(r.providerId) || {}).name || "—"}`).join(" → ") : "—";
  return `<p class="rg-sum">${s.when} <strong>${pdEscape(groups)}</strong></p><p class="rg-sum">${s.then} <strong>${pdEscape(chain)}</strong></p>`;
}

// История правила — отдельная вкладка карточки (не свёрнутая боковая карточка), чтобы влезало столько записей,
// сколько нужно, не растягивая боковую колонку.
let rgRuleDetailTab = "rule";

function rgRuleTabsBar(rule) {
  const ch = rgChangesOfRule(rule.id);
  const tabs = [
    { id: "rule", label: rg("rule.tabRule") },
    { id: "history", label: rg("rule.tabHistory"), count: ch.length },
  ];
  return `<div class="cd-subtabs">${tabs.map((tb) => `<button type="button" class="cd-subtab${rgRuleDetailTab === tb.id ? " is-active" : ""}" data-rg-rule-tab="${tb.id}"><span>${tb.label}</span>${tb.count != null ? `<span class="quick-tab-count">${tb.count}</span>` : ""}</button>`).join("")}</div>`;
}

function rgRuleHistoryContent(rule) {
  const ch = rgChangesOfRule(rule.id);
  const body = ch.length
    ? `<div class="table-scroll"><table class="data-table rg-table"><thead><tr><th>${rg("history.date")}</th><th>${rg("history.by")}</th><th>${rg("history.field")}</th><th>${rg("history.oldValue")}</th><th>${rg("history.newValue")}</th><th>${rg("history.comment")}</th></tr></thead><tbody>${[...ch].sort((a, b) => b.at - a.at).map((h) => `<tr><td>${formatDateTime(h.at)}</td><td>${pdEscape(h.by)}</td><td>${pdEscape(rg(`fields.${h.field}`) === `routing.fields.${h.field}` ? h.field : rg(`fields.${h.field}`))}</td><td>${pdEscape(h.oldValue)}</td><td>${pdEscape(h.newValue)}</td><td>${pdEscape(h.comment)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="table-cell-muted">${rg("rule.noHistory")}</div>`;
  return `<div class="profile-flat-block">${flatSection(rg("rule.history"), body)}</div>`;
}

function rgRuleMainContent() {
  const st = rgRuleState;
  const d = st.draft;
  const editing = st.editing;
  const rule = st.id ? rgRuleById(st.id) : null;
  const warns = rgRouteWarnings(d);
  const routesHtml = rgRouteRowsHtml(d.routes, editing, null);
  const routeWarn = warns.some(Boolean) ? `<div class="rg-warn">${warns.map((w, i) => (w ? `${i + 1}: ${pdEscape(w)}` : "")).filter(Boolean).join("<br>")}</div>` : "";
  const params = editing
    ? `<div class="rg-params-col">${vbInput("rg-name", `${rg("rule.name")} *`, d.name, 'maxlength="64"')}${vbTextarea("rg-desc", rg("rule.description"), d.description, 3)}${vbInput("rg-from", rg("rule.dateStart"), rgToInput(d.dateStart), 'type="datetime-local"')}${vbInput("rg-to", rg("rule.dateEnd"), rgToInput(d.dateEnd), 'type="datetime-local"')}<p class="table-cell-muted rg-hint">${rg("rule.priorityHint")}</p></div>`
    : `<div class="rg-meta-list">${rgMetaRow(rg("columns.status"), rgStatusBadge(rule.status))}${rgMetaRow(rg("columns.priority"), rule.priority)}${rgMetaRow(rg("columns.period"), rgPeriod(rule))}${rgMetaRow(rg("rule.author"), pdEscape(rule.createdBy))}${rgMetaRow(rg("rule.created"), rule.createdAt)}${rgMetaRow(rg("rule.updated"), rule.updatedAt)}</div>`;
  let usage = "";
  if (rule) {
    const u = rgRuleUsage(rule.id, 14);
    const last = rgExecutionsOfRule(rule.id).sort((a, b) => b.createdDate - a.createdDate)[0];
    usage = sectionCard(rg("rule.usage"), u.count ? `<div class="rg-meta-list">${rgMetaRow(rg("rule.executions14"), u.count)}${rgMetaRow(rg("rule.successRate"), `${u.rate}%`)}${rgMetaRow(rg("rule.lastUse"), last ? last.createdAt : "—")}</div><button type="button" class="btn-secondary rg-usage-btn" data-rg-head="executions">${rg("rule.openExecutions")}</button>` : `<div class="table-cell-muted">${rg("rule.noUsage")}</div>`);
  }
  const bar = editing ? `<div class="tf-savebar"><span class="tf-savebar-text">${st.id ? rg("rule.unsaved") : rg("rule.newBar")}</span><span class="tf-savebar-actions"><button type="button" class="btn-secondary" id="rg-rule-cancel">${rg("rule.cancel")}</button><button type="button" class="btn-primary" id="rg-rule-save">${st.id ? rg("rule.save") : rg("rule.create")}</button></span></div>` : "";
  return `<div class="client-detail-grid">
    <div class="client-detail-grid-main"><div class="profile-flat-block">${flatSection(rg("rule.conditions"), `<p class="table-cell-muted rg-intro">${rg("rule.conditionsIntro")}</p>${rgConditionsHtml(d, editing)}`)}${flatSection(rg("rule.routes"), `<p class="table-cell-muted rg-intro">${rg("rule.routesIntro")}</p>${routesHtml}${routeWarn}`)}</div></div>
    <div class="client-detail-grid-side">${sectionCard(rg("rule.params"), params)}${sectionCard(rg("rule.summaryTitle"), rgRuleSummary(d))}${usage}</div>
  </div>${bar}`;
}

function rgRuleBody() {
  const st = rgRuleState;
  const rule = st.id ? rgRuleById(st.id) : null;
  const showTabs = rule && !st.editing;
  if (!showTabs) return rgRuleMainContent();
  const content = rgRuleDetailTab === "history" ? rgRuleHistoryContent(rule) : rgRuleMainContent();
  return `<div class="cd-tabs-wrap" id="rg-rule-tabs">${rgRuleTabsBar(rule)}</div><div id="rg-rule-tab-content">${content}</div>`;
}

function initRuleDetail(id) {
  const st = rgRuleState;
  const root = document.getElementById("vb-root");
  if (!root || (id !== "new" && !st.id)) return;
  vbAttachCommon(root);
  root.querySelectorAll("[data-rg-head]").forEach((b) => b.addEventListener("click", () => rgHeadAction(b.dataset.rgHead)));
  root.querySelectorAll("[data-rg-rule-tab]").forEach((b) => b.addEventListener("click", () => { rgRuleDetailTab = b.dataset.rgRuleTab; rgRerenderRule(); }));
  rgBindRuleBody();
}

function rgRerenderRule() {
  const root = document.getElementById("vb-root");
  root.querySelector(".cd-hero").outerHTML = rgRuleHeader();
  document.getElementById("rg-rule-body").innerHTML = rgRuleBody();
  vbAttachCommon(root);
  root.querySelectorAll("[data-rg-head]").forEach((b) => b.addEventListener("click", () => rgHeadAction(b.dataset.rgHead)));
  root.querySelectorAll("[data-rg-rule-tab]").forEach((b) => b.addEventListener("click", () => { rgRuleDetailTab = b.dataset.rgRuleTab; rgRerenderRule(); }));
  rgBindRuleBody();
}

function rgHeadAction(act) {
  const st = rgRuleState;
  const rule = st.id ? rgRuleById(st.id) : null;
  if (act === "edit") { st.editing = true; st.draft = rgClone(rule); rgRuleDetailTab = "rule"; rgRerenderRule(); }
  else if (act === "simulate") rgOpenSimulator();
  else if (act === "executions") { window.location.hash = "#/settings-routing-executions"; }
  else if (act === "duplicate") rgDuplicate(rule);
  else if (act.startsWith("status:")) rgChangeStatus(rule, act.split(":")[1]);
}

function rgBindRuleBody() {
  const st = rgRuleState;
  const root = document.getElementById("rg-rule-body");
  if (!st.editing) return;
  const d = st.draft;
  const redraw = () => rgRerenderRule();
  const name = root.querySelector("#rg-name");
  if (name) {
    name.addEventListener("input", () => { d.name = name.value; });
    root.querySelector("#rg-desc").addEventListener("input", (e) => { d.description = e.target.value; });
    root.querySelector("#rg-from").addEventListener("change", (e) => { d.dateStart = e.target.value ? new Date(e.target.value) : null; });
    root.querySelector("#rg-to").addEventListener("change", (e) => { d.dateEnd = e.target.value ? new Date(e.target.value) : null; });
  }
  root.querySelectorAll(".rg-cond[data-g]").forEach((row) => {
    const g = d.groups[Number(row.dataset.g)];
    const c = g.conditions[Number(row.dataset.c)];
    const attrSel = row.querySelector("[data-f='attr']");
    attrSel.addEventListener("change", () => {
      const a = rgAttr(attrSel.value);
      c.attrId = a.id; c.operator = RG_OPERATORS[a.type][0];
      c.value = a.type === "ENUM" ? a.options[0] : a.type === "DATETIME" ? "00:00" : ""; c.valueMax = null;
      redraw();
    });
    row.querySelector("[data-f='op']").addEventListener("change", (e) => {
      c.operator = e.target.value;
      const a = rgAttr(c.attrId);
      if (a.type === "DATETIME") { c.value = c.operator === "TIME_BETWEEN" ? "00:00" : ""; c.valueMax = c.operator === "TIME_BETWEEN" ? "06:00" : null; }
      else c.valueMax = c.operator === "BETWEEN" ? c.valueMax || "" : null;
      redraw();
    });
    const v = row.querySelector("[data-f='value']");
    if (v) v.addEventListener("change", () => { c.value = v.value; redraw(); });
    const vm = row.querySelector("[data-f='valueMax']");
    if (vm) vm.addEventListener("change", () => { c.valueMax = vm.value; redraw(); });
    const del = row.querySelector("[data-rg-cond='del']");
    if (del) del.addEventListener("click", () => { g.conditions.splice(Number(row.dataset.c), 1); redraw(); });
  });
  root.querySelectorAll("[data-rg-group]").forEach((b) => b.addEventListener("click", () => {
    const [act, idx] = b.dataset.rgGroup.split(":");
    if (act === "add") d.groups.push(rgNewGroup());
    else if (act === "del") d.groups.splice(Number(idx), 1);
    else if (act === "cond") d.groups[Number(idx)].conditions.push({ id: rgId("c"), attrId: "amount", operator: "GTE", value: "", valueMax: null });
    redraw();
  }));
  const routesBox = root.querySelector(".rg-routes-box");
  if (routesBox) rgBindRouteRows(routesBox, d.routes, redraw, null);
  const cancel = root.querySelector("#rg-rule-cancel");
  if (cancel) cancel.addEventListener("click", () => {
    const changed = st.id ? JSON.stringify(d) !== JSON.stringify(rgRuleById(st.id)) : true;
    const back = () => { if (!st.id) window.location.hash = "#/settings-routing-rules"; else { st.editing = false; st.draft = rgClone(rgRuleById(st.id)); rgRerenderRule(); } };
    if (!changed) return back();
    vbConfirm({ title: rg("rule.discardTitle"), text: rg("rule.discardText"), confirmLabel: rg("rule.discard"), danger: true, onConfirm: back });
  });
  const save = root.querySelector("#rg-rule-save");
  if (save) save.addEventListener("click", rgSaveRule);
}

function rgValidate(d) {
  const e = rg("errors");
  if (!d.name.trim() || d.name.trim().length > 64) return e.name;
  if (d.description.length > 255) return e.description;
  if (d.dateStart && d.dateEnd && d.dateEnd <= d.dateStart) return e.period;
  if (!d.groups.length) return e.groups;
  for (const g of d.groups) {
    if (!g.conditions.length) return e.groups;
    for (const c of g.conditions) {
      const a = rgAttr(c.attrId);
      if (a.type === "NUMBER") {
        if (c.value === "" || !Number.isFinite(Number(String(c.value).replace(",", ".")))) return e.number;
        if (c.operator === "BETWEEN" && (c.valueMax === "" || !Number.isFinite(Number(c.valueMax)) || Number(c.valueMax) < Number(c.value))) return e.between;
      }
      if (a.type === "DATETIME" && (!c.value || (c.operator === "TIME_BETWEEN" && !c.valueMax))) return e.time;
    }
  }
  if (!d.routes.length) return e.routes;
  if (d.routes.some((r) => !r.providerId)) return e.routes;
  if (new Set(d.routes.map((r) => `${r.providerId}:${r.nostroAccountId || ""}`)).size !== d.routes.length) return e.duplicateRoute;
  const w = rgRouteWarnings(d).find(Boolean);
  if (w) return w;
  return null;
}

function rgNormalize(d) {
  d.groups.forEach((g) => g.conditions.forEach((c) => { if (typeof c.value === "string") c.value = c.value.replace(",", "."); if (c.valueMax) c.valueMax = String(c.valueMax).replace(",", "."); }));
}

function rgSaveRule() {
  const st = rgRuleState;
  const d = st.draft;
  rgNormalize(d);
  const err = rgValidate(d);
  if (err) { showToast(err); return; }
  if (st.id) {
    rgAskReason({ title: rg("rule.saveTitle"), intro: rg("rule.saveIntro"), submit: rg("rule.save"), onDone: (reason) => rgApplyEdit(reason) });
    return;
  }
  const others = rgVisibleRules().map((r) => ({ value: r.id, label: `${r.priority} · ${r.name}` }));
  vbOpenForm({
    title: rg("rule.createTitle"),
    width: 540,
    intro: rg("rule.createIntro"),
    fieldsHtml: `${vbSelect("rg-new-status", rg("rule.startStatus"), [{ value: "DRAFT", label: rg("status.DRAFT") }, { value: "ACTIVE", label: rg("status.ACTIVE") }], "DRAFT")}
      ${vbSelect("rg-new-pos", rg("rule.position"), ["END", "START", "BEFORE", "AFTER"].map((v) => ({ value: v, label: rg(`positions.${v}`) })), "END")}
      <div id="rg-new-target-wrap" hidden>${vbSelect("rg-new-target", rg("rule.positionTarget"), others, others.length ? others[0].value : "")}</div>`,
    submitLabel: rg("rule.create"),
    onSubmit: (el) => {
      const pos = el.querySelector("#rg-new-pos").value;
      const target = el.querySelector("#rg-new-target").value;
      const status = el.querySelector("#rg-new-status").value;
      if ((pos === "BEFORE" || pos === "AFTER") && !target) return rg("errors.target");
      closeModal();
      requireAdmin2fa("routing_manage", () => rgApplyCreate(status, pos, target));
      return null;
    },
  });
  const pos = document.getElementById("rg-new-pos");
  const wrap = document.getElementById("rg-new-target-wrap");
  pos.addEventListener("change", () => { wrap.hidden = !(pos.value === "BEFORE" || pos.value === "AFTER"); });
}

function rgGroupsText(groups) {
  return groups.map((g) => g.conditions.map(rgCondShort).join(" · ")).join(` ${rg("or")} `);
}
function rgRoutesText(routes) {
  return routes.map((r) => `${(rgProviderById(r.providerId) || {}).name || "—"}${rgNostroById(r.nostroAccountId) ? ` (${rgNostroById(r.nostroAccountId).extId})` : ""}`).join(" → ");
}

function rgApplyEdit(reason) {
  const st = rgRuleState;
  const rule = rgRuleById(st.id);
  const d = st.draft;
  const log = (type, field, o, n) => rgLogChange(rule.id, type, field, o, n, reason);
  const fmt = (x) => (x ? formatDateTime(x) : "—");
  if (d.name !== rule.name) log("RULE", "name", rule.name, d.name);
  if (d.description !== rule.description) log("RULE", "description", rule.description || "—", d.description || "—");
  if (fmt(d.dateStart) !== fmt(rule.dateStart)) log("RULE", "dateStart", fmt(rule.dateStart), fmt(d.dateStart));
  if (fmt(d.dateEnd) !== fmt(rule.dateEnd)) log("RULE", "dateEnd", fmt(rule.dateEnd), fmt(d.dateEnd));
  if (rgGroupsText(d.groups) !== rgGroupsText(rule.groups)) log("CONDITION", "conditions", rgGroupsText(rule.groups), rgGroupsText(d.groups));
  if (rgRoutesText(d.routes) !== rgRoutesText(rule.routes)) log("ROUTE", "routes", rgRoutesText(rule.routes), rgRoutesText(d.routes));
  Object.assign(rule, { name: d.name.trim(), description: d.description.trim(), dateStart: d.dateStart, dateEnd: d.dateEnd, groups: d.groups, routes: d.routes });
  rule.updatedAt = formatDateTime(pdNow());
  st.editing = false;
  st.draft = rgClone(rule);
  showToast(rg("rule.saved"));
  render();
}

function rgApplyCreate(status, pos, target) {
  const st = rgRuleState;
  const d = st.draft;
  const now = pdNow();
  const id = rgUuid(700 + RG_RULES.length);
  const code = entityCode("RGR", 7700 + RG_RULES.length);
  const rule = Object.assign(rgClone(d), { id, code, name: d.name.trim(), description: d.description.trim(), status: status === "ACTIVE" && d.dateStart && d.dateStart > MOCK_NOW ? "SCHEDULED" : status, priority: 0, createdDate: now, createdAt: formatDateTime(now), updatedDate: now, updatedAt: formatDateTime(now), createdBy: CURRENT_ADMIN.email });
  RG_RULES.push(rule);
  const order = rgVisibleRules().map((r) => r.id).filter((x) => x !== id);
  const idx = pos === "START" ? 0 : pos === "END" ? order.length : order.indexOf(target) + (pos === "AFTER" ? 1 : 0);
  order.splice(idx, 0, id);
  order.forEach((x, i) => { rgRuleById(x).priority = (i + 1) * 10; });
  rgLogChange(id, "RULE", "created", "—", rule.name, rg("rule.createdComment"));
  rgRuleState = null;
  showToast(rg("rule.created2"));
  window.location.hash = `#/settings-routing-rules/rule/${id}`;
}

// ---- Мастер создания правила — степпер в модалке (кнопка "Новое правило" на вкладке "Правила"). Полная страница
// правила ("Правила"/rule/new) при этом не убрана — она по-прежнему открывается по прямой ссылке, просто кнопка
// на неё больше не ведёт: степпер удобнее для создания с нуля, а полноэкранный конструктор остаётся для правки
// уже существующих правил. Шаги переиспользуют те же кусочки разметки/привязки, что и полная страница —
// rgConditionsHtml/rgBindRuleBody для условий, rgRouteRowsHtml/rgBindRouteRows для маршрутов — просто в рамках
// модалки, а не всей страницы.
let rwState = null; // { step, draft, status, pos, target }

function rwEmptyState() {
  const others = rgVisibleRules().map((r) => ({ value: r.id, label: `${r.priority} · ${r.name}` }));
  return { step: 1, draft: rgBlankRule(), status: "DRAFT", pos: "END", target: others.length ? others[0].value : "" };
}

function rwStepperHtml() {
  const steps = [rg("rule.wizard.step1"), rg("rule.wizard.step2"), rg("rule.wizard.step3"), rg("rule.wizard.step4")];
  return `<div class="kyc-stepper doc-wizard-stepper">${steps
    .map((label, idx) => {
      const n = idx + 1;
      const cls = n < rwState.step ? "is-done" : n === rwState.step ? "is-current" : "is-pending";
      return `<div class="kyc-stepper-item"><div class="kyc-stepper-circle ${cls}">${n < rwState.step ? CHECK_ICON_SVG : `<span>${n}</span>`}</div>${idx < steps.length - 1 ? `<div class="kyc-stepper-line${n < rwState.step ? " is-done" : ""}"></div>` : ""}<div class="kyc-stepper-label"><div class="kyc-stepper-title">${label}</div></div></div>`;
    })
    .join("")}</div>`;
}

function rwStepHtml() {
  const s = rwState;
  const d = s.draft;
  if (s.step === 1) {
    const others = rgVisibleRules().map((r) => ({ value: r.id, label: `${r.priority} · ${r.name}` }));
    const showTarget = s.pos === "BEFORE" || s.pos === "AFTER";
    return `${vbInput("rw-name", `${rg("rule.name")} *`, d.name, 'maxlength="64"')}
      ${vbTextarea("rw-desc", rg("rule.description"), d.description, 3)}
      <div class="rg-route-fields">${vbInput("rw-from", rg("rule.dateStart"), rgToInput(d.dateStart), 'type="datetime-local"')}${vbInput("rw-to", rg("rule.dateEnd"), rgToInput(d.dateEnd), 'type="datetime-local"')}</div>
      ${vbSelect("rw-status", rg("rule.startStatus"), [{ value: "DRAFT", label: rg("status.DRAFT") }, { value: "ACTIVE", label: rg("status.ACTIVE") }], s.status)}
      ${vbSelect("rw-pos", rg("rule.position"), ["END", "START", "BEFORE", "AFTER"].map((v) => ({ value: v, label: rg(`positions.${v}`) })), s.pos)}
      <div id="rw-target-wrap" ${showTarget ? "" : "hidden"}>${vbSelect("rw-target", rg("rule.positionTarget"), others, s.target || (others.length ? others[0].value : ""))}</div>`;
  }
  if (s.step === 2) {
    return `<p class="table-cell-muted rg-intro">${rg("rule.conditionsIntro")}</p>${rgConditionsHtml(d, true)}`;
  }
  if (s.step === 3) {
    const warns = rgRouteWarnings(d);
    const routeWarn = warns.some(Boolean) ? `<div class="rg-warn">${warns.map((w, i) => (w ? `${i + 1}: ${pdEscape(w)}` : "")).filter(Boolean).join("<br>")}</div>` : "";
    return `<p class="table-cell-muted rg-intro">${rg("rule.routesIntro")}</p>${rgRouteRowsHtml(d.routes, true, null)}${routeWarn}`;
  }
  const target = rgRuleById(s.target);
  const posLabel = s.pos === "BEFORE" || s.pos === "AFTER" ? `${rg(`positions.${s.pos}`)} · ${target ? target.name : "—"}` : rg(`positions.${s.pos}`);
  return `<div class="rg-meta-list">${rgMetaRow(rg("rule.name"), pdEscape(d.name) || "—")}${rgMetaRow(rg("columns.status"), rgStatusBadge(s.status))}${rgMetaRow(rg("rule.position"), posLabel)}${rgMetaRow(rg("columns.period"), rgPeriod(d))}</div>
    <div class="rg-summary-block">${rgRuleSummary(d)}</div>`;
}

function rwFooterHtml() {
  const back = rwState.step > 1 ? `<button type="button" class="btn-secondary" id="rw-back">${rg("rule.wizard.back")}</button>` : `<button type="button" class="btn-secondary" id="rw-cancel">${rg("rule.wizard.cancel")}</button>`;
  return `${back}<button type="button" class="btn-primary" id="rw-next">${rwState.step === 4 ? rg("rule.wizard.create") : rg("rule.wizard.next")}</button>`;
}

function rwValidateStep() {
  const s = rwState;
  const d = s.draft;
  const e = rg("errors");
  if (s.step === 1) {
    if (!d.name.trim() || d.name.trim().length > 64) return e.name;
    if (d.description.length > 255) return e.description;
    if (d.dateStart && d.dateEnd && d.dateEnd <= d.dateStart) return e.period;
    if ((s.pos === "BEFORE" || s.pos === "AFTER") && !s.target) return e.target;
    return null;
  }
  if (s.step === 2) {
    if (!d.groups.length) return e.groups;
    for (const g of d.groups) {
      if (!g.conditions.length) return e.groups;
      for (const c of g.conditions) {
        const a = rgAttr(c.attrId);
        if (a.type === "NUMBER") {
          if (c.value === "" || !Number.isFinite(Number(String(c.value).replace(",", ".")))) return e.number;
          if (c.operator === "BETWEEN" && (c.valueMax === "" || !Number.isFinite(Number(c.valueMax)) || Number(c.valueMax) < Number(c.value))) return e.between;
        }
        if (a.type === "DATETIME" && (!c.value || (c.operator === "TIME_BETWEEN" && !c.valueMax))) return e.time;
      }
    }
    return null;
  }
  if (s.step === 3) {
    if (!d.routes.length) return e.routes;
    if (d.routes.some((r) => !r.providerId)) return e.routes;
    if (new Set(d.routes.map((r) => `${r.providerId}:${r.nostroAccountId || ""}`)).size !== d.routes.length) return e.duplicateRoute;
    const w = rgRouteWarnings(d).find(Boolean);
    if (w) return w;
    return null;
  }
  return null;
}

function rwRenderStep(modalEl) {
  modalEl.querySelector(".modal-body").innerHTML = `${rwStepperHtml()}${rwStepHtml()}<div class="form-error" id="rw-error" hidden></div>`;
  modalEl.querySelector(".modal-footer").innerHTML = rwFooterHtml();
  rwBind(modalEl);
}

function rwBind(modalEl) {
  const s = rwState;
  const d = s.draft;
  const fail = (msg) => { const el = modalEl.querySelector("#rw-error"); if (el) { el.textContent = msg; el.hidden = false; } };
  if (s.step === 1) {
    modalEl.querySelector("#rw-name").addEventListener("input", (e) => { d.name = e.target.value; });
    modalEl.querySelector("#rw-desc").addEventListener("input", (e) => { d.description = e.target.value; });
    modalEl.querySelector("#rw-from").addEventListener("change", (e) => { d.dateStart = e.target.value ? new Date(e.target.value) : null; });
    modalEl.querySelector("#rw-to").addEventListener("change", (e) => { d.dateEnd = e.target.value ? new Date(e.target.value) : null; });
    modalEl.querySelector("#rw-status").addEventListener("change", (e) => { s.status = e.target.value; });
    const posSel = modalEl.querySelector("#rw-pos");
    const wrap = modalEl.querySelector("#rw-target-wrap");
    posSel.addEventListener("change", (e) => { s.pos = e.target.value; wrap.hidden = !(s.pos === "BEFORE" || s.pos === "AFTER"); });
    const targetSel = modalEl.querySelector("#rw-target");
    if (targetSel) targetSel.addEventListener("change", (e) => { s.target = e.target.value; });
  }
  if (s.step === 2) {
    modalEl.querySelectorAll(".rg-cond[data-g]").forEach((row) => {
      const g = d.groups[Number(row.dataset.g)];
      const c = g.conditions[Number(row.dataset.c)];
      const attrSel = row.querySelector("[data-f='attr']");
      attrSel.addEventListener("change", () => {
        const a = rgAttr(attrSel.value);
        c.attrId = a.id; c.operator = RG_OPERATORS[a.type][0];
        c.value = a.type === "ENUM" ? a.options[0] : a.type === "DATETIME" ? "00:00" : ""; c.valueMax = null;
        rwRenderStep(modalEl);
      });
      row.querySelector("[data-f='op']").addEventListener("change", (e) => {
        c.operator = e.target.value;
        const a = rgAttr(c.attrId);
        if (a.type === "DATETIME") { c.value = c.operator === "TIME_BETWEEN" ? "00:00" : ""; c.valueMax = c.operator === "TIME_BETWEEN" ? "06:00" : null; }
        else c.valueMax = c.operator === "BETWEEN" ? c.valueMax || "" : null;
        rwRenderStep(modalEl);
      });
      const v = row.querySelector("[data-f='value']");
      if (v) v.addEventListener("change", () => { c.value = v.value; rwRenderStep(modalEl); });
      const vm = row.querySelector("[data-f='valueMax']");
      if (vm) vm.addEventListener("change", () => { c.valueMax = vm.value; rwRenderStep(modalEl); });
      const del = row.querySelector("[data-rg-cond='del']");
      if (del) del.addEventListener("click", () => { g.conditions.splice(Number(row.dataset.c), 1); rwRenderStep(modalEl); });
    });
    modalEl.querySelectorAll("[data-rg-group]").forEach((b) => b.addEventListener("click", () => {
      const [act, idx] = b.dataset.rgGroup.split(":");
      if (act === "add") d.groups.push(rgNewGroup());
      else if (act === "del") d.groups.splice(Number(idx), 1);
      else if (act === "cond") d.groups[Number(idx)].conditions.push({ id: rgId("c"), attrId: "amount", operator: "GTE", value: "", valueMax: null });
      rwRenderStep(modalEl);
    }));
  }
  if (s.step === 3) {
    const routesBox = modalEl.querySelector(".rg-routes-box");
    if (routesBox) rgBindRouteRows(routesBox, d.routes, () => rwRenderStep(modalEl), null);
  }

  const cancelBtn = modalEl.querySelector("#rw-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  const backBtn = modalEl.querySelector("#rw-back");
  if (backBtn) backBtn.addEventListener("click", () => { s.step -= 1; rwRenderStep(modalEl); });

  modalEl.querySelector("#rw-next").addEventListener("click", () => {
    const err = rwValidateStep();
    if (err) { fail(err); return; }
    if (s.step < 4) { s.step += 1; rwRenderStep(modalEl); return; }
    rgNormalize(d);
    const finalErr = rgValidate(d);
    if (finalErr) { fail(finalErr); return; }
    closeModal();
    requireAdmin2fa("routing_manage", () => {
      rgRuleState = { key: "new", id: null, draft: d, editing: true };
      rgApplyCreate(s.status, s.pos, s.target);
    });
  });
}

function openRuleCreateWizard() {
  rwState = rwEmptyState();
  openModal({
    title: rg("rule.newTitle"),
    width: 720,
    bodyHtml: `${rwStepperHtml()}${rwStepHtml()}<div class="form-error" id="rw-error" hidden></div>`,
    footerHtml: rwFooterHtml(),
    onMount: (modalEl) => rwBind(modalEl),
  });
}
