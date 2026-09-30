/* ==========================================================================
   "Настройки системы → Тарифы": клиенты тарифов (список, страница, смена тарифа) и история
   операций (расход лимитов); "Маски тарифов": маски, шаблоны правил, параметры поведения,
   назначения и оценка клиента.
   Спецификация: docs/settings-tariffs-spec.md; данные и движок — mock/settings-tariffs.mock.js.
   ========================================================================== */

function tfMaskBadge(s) {
  return tfBadge({ ACTIVE: "badge-success", SCHEDULED: "badge-info", DRAFT: "badge-neutral", ARCHIVED: "badge-neutral", DELETED: "badge-danger" }[s] || "badge-neutral", tfEnum("maskStatus", s));
}

function tfAssignmentBadge(s) {
  return tfBadge({ ACTIVE: "badge-success", SCHEDULED: "badge-info", SUPERSEDED: "badge-neutral" }[s] || "badge-neutral", tfEnum("assignmentStatus", s));
}

function tfMaskLink(m) {
  return m ? vbLink(`#/settings-masks-list/${m.id}`, pdEscape(m.name)) : "—";
}

function tfDate(d) {
  return d ? formatDateTime(d).split(" ")[0] : "—";
}

// ==== Клиенты тарифов ============================================================================================
function tfClientChangeTariff(client) {
  const f = tf("clients.change");
  const personal = tfTariffById(client.tariffId).ownerClientId === client.id;
  const options = tfLiveTariffs().filter((x) => x.clientCategory === client.category && (!x.ownerClientId || x.ownerClientId === client.id) && x.id !== client.tariffId);
  if (!options.length) { vbConfirm({ title: f.title, text: f.none, confirmLabel: vt("common.close"), danger: false, onConfirm: () => {} }); return; }
  tfOpenForm({
    title: f.title,
    width: 520,
    intro: f.intro(pdEscape(client.name), pdEscape(tfTariffById(client.tariffId).name)),
    fields: [
      { id: "tariff", label: tf("columns.tariff"), type: "select", options: options.map((x) => ({ value: x.id, label: `${x.name}${x.ownerClientId ? ` (${tf("common.personal")})` : ""}` })), value: options[0].id },
      ...(personal ? [{ id: "override", label: f.override, type: "checkbox", value: false, hint: f.overrideHint }] : []),
    ],
    submitLabel: f.submit,
    validate: (v) => (personal && !v.override ? f.errPersonal : null),
    confirm: (v) => f.confirm(pdEscape(client.name), pdEscape(tfTariffById(v.tariff).name)),
    onSave: (v) => {
      const now = pdNow();
      client.tariffId = v.tariff;
      client.changes.unshift({ id: tfId(), tariffId: v.tariff, billingPeriod: client.billingPeriod, createdDate: now, createdAt: formatDateTime(now) });
      acTouch(client);
    },
  });
}

const tfClientsList = createAccessList({
  key: "tf-clients",
  data: () => TF_CLIENTS,
  searchPlaceholder: () => tf("clients.search"),
  searchText: (c) => [c.id, c.name].filter(Boolean).join(" "),
  tab: { get: (c) => c.category, values: TF_CATEGORIES, label: (v) => tfEnum("category", v) },
  filters: [
    { id: "tariff", kind: "multi", label: () => tf("filters.tariff"), get: (c) => c.tariffId, options: () => tfLiveTariffs().map((x) => ({ value: x.id, label: x.name })) },
    { id: "kind", kind: "multi", label: () => tf("filters.kind"), get: (c) => (tfTariffById(c.tariffId).ownerClientId ? "personal" : "shared"), options: () => [{ value: "shared", label: tf("common.shared") }, { value: "personal", label: tf("common.personal") }] },
    { id: "billing", kind: "date", label: () => tf("filters.billing"), get: (c) => c.billingPeriod },
    { id: "updated", kind: "date", label: () => tf("filters.updated"), get: (c) => c.updatedDate },
  ],
  defaultSort: (a, b) => b.updatedDate - a.updatedDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name), billing: (a, b) => a.billingPeriod - b.billingPeriod },
  metrics: (list) => {
    const m = tf("clients.metrics");
    return [
      { value: list.filter((c) => tfTariffById(c.tariffId).ownerClientId).length, label: m.personal },
      { value: list.reduce((n, c) => n + c.changes.length, 0), label: m.changes },
      { value: list.filter((c) => TF_HISTORY.some((h) => h.clientId === c.id)).length, label: m.withOps },
    ];
  },
  columns: [
    { label: () => tf("columns.client"), sort: "name", html: (c) => `<div class="identity-cell">${vbLink(`#/settings-tariffs-clients/${c.id}`, pdEscape(c.name))}${vbIdCell(c.id)}</div>` },
    { label: () => tf("columns.category"), html: (c) => tfCatBadge(c.category) },
    { label: () => tf("columns.tariff"), html: (c) => { const x = tfTariffById(c.tariffId); return `<div class="identity-cell">${tfTariffLink(x)}${x.ownerClientId ? tfBadge("badge-warning tf-mini", tf("common.personal")) : ""}</div>`; } },
    { label: () => tf("columns.billing"), sort: "billing", html: (c) => tfDate(c.billingPeriod) },
    { label: () => tf("columns.changes"), html: (c) => c.changes.length },
    { label: () => tf("columns.updated"), html: (c) => dateTimeCell(c.updatedAt) },
    { label: () => "", html: (c) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-tf-client-change="${c.id}">${tf("clients.changeShort")}</button></div>` },
  ],
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    wrap.querySelectorAll("[data-tf-client-change]").forEach((b) => b.addEventListener("click", () => tfClientChangeTariff(tfClientById(b.dataset.tfClientChange))));
  },
});

// Тело карточки тарифа клиента. withHeader=false — без vbDetailHeader (кнопки
// действий переезжают в свою строку прямо над секциями), для мест, где своя шапка
// уже есть (вкладка "Тарифы" на карточке физлица, clients-users.js) — там же
// переиспользуется и initClientDetail_tf, id="tf-root" остаётся общим маркером.
function tfClientDetailBodyHtml(c, { withHeader = true } = {}) {
  const f = tf("fields");
  const d = tf("clients.detail");
  const tariff = tfTariffById(c.tariffId);
  const now = tfNow();
  const ends = tfPeriodEnds(now);
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, c.id)}${detailField(f.client, `${pdEscape(c.name)} ${vbLink(c.link, d.openCard)}`)}${detailField(f.category, tfCatBadge(c.category))}
    ${detailField(f.tariff, `${tfTariffLink(tariff)} ${tfTariffKind(tariff)}`)}${detailField(f.billing, tfDate(c.billingPeriod))}${detailField(f.updated, c.updatedAt)}
  </div>`;
  // доступные лимиты по всем операциям тарифа; пул из нескольких операций показывается одной строкой
  const seen = new Map();
  tfTariffOpsOf(tariff.id).forEach((b) => {
    const op = tfOperationById(b.operationId);
    (tfLimitsFor(c, op.name) || []).forEach((l) => { if (!seen.has(l.id)) seen.set(l.id, { l, ops: [] }); seen.get(l.id).ops.push(op.name); });
  });
  const avRows = [...seen.values()].map(({ l, ops }) => {
    const av = tfAvailable(c.id, l, now);
    const cell = (k) => (l[k] >= TF_STUB ? `<span class="table-cell-muted">${tf("common.unlimited")}</span>` : `<div class="identity-cell"><span>${tfNum(av[k])}</span><span class="table-cell-muted">/ ${tfNum(l[k])}</span></div>`);
    return [`<div class="identity-cell">${vbLink(`#/settings-tariffs-limits/${l.id}`, pdEscape(l.name))}<span class="vb-mono table-cell-muted">${ops.join(", ")}</span></div>`, l.currencyTicker + (l.isRolling ? ` · ${tf("limits.rolling")}` : ""), cell("daily"), cell("weekly"), cell("monthly"), cell("annual"), `${tfNum(l.min)} / ${tfNum(l.max)}`];
  });
  const p = tf("common.periodShort");
  const available = `${vbMiniTable([tf("columns.limit"), tf("columns.currency"), p.daily, p.weekly, p.monthly, p.annual, `${f.min} / ${f.max}`], avRows, d.noLimits)}<p class="table-cell-muted vb-note">${d.availableNote}</p>`;
  const resets = `<div class="profile-fields profile-fields-grid">${detailField(p.daily, tfDt(ends.daily))}${detailField(p.weekly, tfDt(ends.weekly))}${detailField(p.monthly, tfDt(ends.monthly))}${detailField(p.annual, tfDt(ends.annual))}</div><p class="table-cell-muted vb-note">${d.resetNote}</p>`;
  const ownLimits = TF_LIMITS.filter((l) => l.clientId === c.id);
  const ownComm = TF_COMMISSIONS.filter((x) => x.clientId === c.id);
  const own = `${vbMiniTable([tf("columns.name"), tf("columns.type"), tf("columns.currency")], [...ownLimits.map((l) => [vbLink(`#/settings-tariffs-limits/${l.id}`, pdEscape(l.name)), tf("titles.limits"), l.currencyTicker]), ...ownComm.map((x) => [vbLink(`#/settings-tariffs-commissions/${x.id}`, pdEscape(x.name)), tf("titles.commissions"), x.currencyTicker])], d.noOwn)}`;
  const changes = vbMiniTable([tf("columns.created"), tf("columns.tariff"), tf("columns.billing")], c.changes.map((x) => [dateTimeCell(x.createdAt), tfTariffLink(tfTariffById(x.tariffId)), tfDate(x.billingPeriod)]), d.noChanges);
  const history = TF_HISTORY.filter((h) => h.clientId === c.id);
  const historyBlock = `${vbMiniTable([tf("columns.created"), tf("columns.operation"), tf("columns.amount"), tf("columns.status"), tf("columns.trackerId")], history.slice(0, 8).map((h) => [dateTimeCell(h.createdAt), tfMono((tfOperationById(h.operationId) || {}).name), tfNum(h.amount, h.currencyTicker), tfHistoryBadge(h.status), tfMono(pdShort(h.trackerId))]), d.noHistory)}${history.length ? `<p class="table-cell-muted vb-note">${d.historyNote(Math.min(8, history.length), history.length)} ${vbLink("#/settings-tariffs-history", d.openHistory)}</p>` : ""}`;
  const assignments = TF_ASSIGNMENTS.filter((a) => a.clientId === c.id);
  const asBlock = vbMiniTable([tf("columns.created"), tf("columns.mask"), tf("columns.type"), tf("columns.status"), tf("columns.activeTariff")], assignments.map((a) => [dateTimeCell(a.createdAt), tfMaskLink(tfMaskById(a.maskId)), tfEnum("assignmentType", a.type), tfAssignmentBadge(a.status), tfTariffLink(tfTariffById(a.activeTariffId))]), d.noAssignments);
  const personal = !!tariff.ownerClientId;
  const actions = `<button type="button" class="btn-primary" data-tf-act="change">${tf("clients.changeShort")}</button><button type="button" class="btn-secondary" data-tf-act="calc">${d.calc}</button>${personal ? `<button type="button" class="btn-danger" data-tf-act="revoke">${tf("tariffs.revoke.title")}</button>` : `<button type="button" class="btn-secondary" data-tf-act="personal">${d.makePersonal}</button>`}`;
  const headerHtml = withHeader
    ? vbDetailHeader({ backHash: "#/settings-tariffs-clients", title: pdEscape(c.name), badges: `${tfCatBadge(c.category)}${tfTariffKind(tariff)}`, subtitle: vbIdSubtitle(c.id, [tariff.name]), actions })
    : `<div class="tf-embedded-actions">${actions}</div>`;
  return `<div id="tf-root">
    ${headerHtml}
    ${sectionCard(d.general, main)}
    ${sectionCard(d.available, available)}
    ${sectionCard(d.resets, resets, "is-collapsed")}
    ${sectionCard(`${d.own} · ${ownLimits.length + ownComm.length}`, own, "is-collapsed")}
    ${sectionCard(`${d.history} · ${history.length}`, historyBlock)}
    ${sectionCard(`${d.changes} · ${c.changes.length}`, changes, "is-collapsed")}
    ${TF_MASKS_ENABLED ? sectionCard(`${d.assignments} · ${assignments.length}`, asBlock, "is-collapsed") : ""}
  </div>`;
}

function viewClientDetail_tf(id) {
  const c = tfClientById(id);
  if (!c) return vbNotFound();
  return tfClientDetailBodyHtml(c);
}

// skipCommon — не навешивать vbAttachCommon (сворачивание карточек/копирование):
// когда тело встроено в чужую страницу (вкладка "Тариф" на карточке физлица),
// эти же обработчики уже вешает сама страница на весь #cd-content — повторное
// навешивание задваивало бы клики (карточка схлопывалась и тут же раскрывалась).
function initClientDetail_tf(id, { skipCommon = false } = {}) {
  const c = tfClientById(id);
  const root = document.getElementById("tf-root");
  if (!c || !root) return;
  if (!skipCommon) vbAttachCommon(root);
  const act = (n) => root.querySelector(`[data-tf-act="${n}"]`);
  act("change").addEventListener("click", () => tfClientChangeTariff(c));
  act("calc").addEventListener("click", () => tfOpenCalc({ client: c }));
  const rev = act("revoke");
  if (rev) rev.addEventListener("click", () => tfOpenRevoke(c));
  const pers = act("personal");
  if (pers) pers.addEventListener("click", () => tfOpenCopyForm(tfTariffById(c.tariffId), c.id));
}

// ==== История операций =============================================================================================
function tfOpenHistoryForm(h) {
  const f = tf("history.form");
  const isEdit = !!h;
  const ops = TF_OPERATIONS.map((o) => ({ value: o.id, label: o.name }));
  tfOpenForm({
    title: isEdit ? f.editTitle : f.createTitle,
    width: 540,
    intro: isEdit ? f.editIntro : f.createIntro,
    fields: isEdit
      ? [{ id: "status", label: tf("columns.status"), type: "select", options: TF_HISTORY_STATUSES.map((v) => ({ value: v, label: tfEnum("historyStatus", v) })), value: h.status, hint: f.statusHint }]
      : [
          { id: "client", label: tf("columns.client"), type: "select", options: tfClientOptions(false), value: TF_CLIENTS[0].id },
          { id: "operation", label: tf("columns.operation"), type: "select", options: ops, value: ops[0].value },
          { id: "amount", label: tf("columns.amount"), type: "number", required: true, half: true, value: "" },
          { id: "ticker", label: tf("fields.currency"), type: "select", options: TF_TICKERS.map((x) => ({ value: x, label: x })), value: "USDT", half: true },
          { id: "status", label: tf("columns.status"), type: "select", options: TF_HISTORY_STATUSES.map((v) => ({ value: v, label: tfEnum("historyStatus", v) })), value: "PENDING", hint: f.statusHint },
          { id: "trackerId", label: tf("columns.trackerId"), required: true, value: seedToPaymentUuid(Date.now() % 100000 + 900), hint: f.trackerHint },
        ],
    submitLabel: isEdit ? vt("common.save") : vt("common.create"),
    validate: (v) => {
      if (isEdit) return null;
      if (v.amount === null || Number.isNaN(v.amount) || v.amount <= 0) return f.errAmount;
      if (!v.trackerId) return f.errTracker;
      if (TF_HISTORY.some((x) => x.trackerId === v.trackerId)) return tf("errors.historyExists");
      const client = tfClientById(v.client);
      const opName = tfOperationById(v.operation).name;
      if (!tfTariffOp(client.tariffId, opName)) return tf("errors.TARIFF_NOT_ASSOCIATED_WITH_OPERATION");
      return null;
    },
    confirm: isEdit ? (v) => f.confirmStatus(tfEnum("historyStatus", v.status)) : null,
    onSave: (v) => {
      const now = pdNow();
      if (isEdit) { h.status = v.status; acTouch(h); return; }
      TF_HISTORY.unshift(tfStamp({ id: tfId(), clientId: v.client, operationId: v.operation, amount: v.amount, currencyTicker: v.ticker, status: v.status, trackerId: v.trackerId, name: null, description: null }, now));
    },
  });
}

const tfHistoryList = createAccessList({
  key: "tf-history",
  data: () => TF_HISTORY,
  searchPlaceholder: () => tf("history.search"),
  searchText: (h) => [h.id, h.trackerId, h.clientId, (tfClientById(h.clientId) || {}).name].filter(Boolean).join(" "),
  tab: { get: (h) => h.status, values: TF_HISTORY_STATUSES, label: (v) => tfEnum("historyStatus", v) },
  filters: [
    { id: "created", kind: "date", label: () => tf("filters.created"), get: (h) => h.createdDate },
    { id: "operation", kind: "multi", label: () => tf("filters.operation"), get: (h) => h.operationId, options: () => TF_OPERATIONS.map((o) => ({ value: o.id, label: o.name })) },
    { id: "client", kind: "multi", label: () => tf("filters.client"), get: (h) => h.clientId, options: () => TF_CLIENTS.filter((c) => TF_HISTORY.some((h) => h.clientId === c.id)).map((c) => ({ value: c.id, label: c.name })) },
    { id: "currency", kind: "multi", label: () => tf("filters.currency"), get: (h) => h.currencyTicker, options: () => [...new Set(TF_HISTORY.map((h) => h.currencyTicker))].sort().map((v) => ({ value: v, label: v })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = tf("history.metrics");
    return [{ value: new Set(list.map((h) => h.clientId)).size, label: m.clients }, { value: new Set(list.map((h) => h.operationId)).size, label: m.operations }, { value: new Set(list.map((h) => h.currencyTicker)).size, label: m.currencies }];
  },
  columns: [
    { label: () => tf("columns.created"), sort: "created", html: (h) => dateTimeCell(h.createdAt) },
    { label: () => tf("columns.client"), html: (h) => tfClientLink(tfClientById(h.clientId)) },
    { label: () => tf("columns.operation"), html: (h) => tfMono((tfOperationById(h.operationId) || {}).name) },
    { label: () => tf("columns.amount"), html: (h) => `<span class="acc-money">${tfNum(h.amount, h.currencyTicker)}</span>` },
    { label: () => tf("columns.status"), html: (h) => tfHistoryBadge(h.status) },
    { label: () => tf("columns.trackerId"), html: (h) => `<div class="identity-cell-primary">${tfMono(pdShort(h.trackerId))}${copyIconButton(h.trackerId)}</div>` },
    { label: () => "", html: (h) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-tf-h-edit="${h.id}">${tf("history.changeStatus")}</button><button type="button" class="btn-secondary vb-row-btn sl-del" data-tf-h-del="${h.id}">${TRASH_ICON_SVG}</button></div>` },
  ],
  headerAction: () => `<button type="button" class="btn-primary ac-header-btn" id="tf-h-create">+ ${tf("history.create")}</button>`,
  attachHeaderAction: () => { const b = document.getElementById("tf-h-create"); if (b) b.addEventListener("click", () => tfOpenHistoryForm(null)); },
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    wrap.querySelectorAll("[data-tf-h-edit]").forEach((b) => b.addEventListener("click", () => tfOpenHistoryForm(tfHistoryById(b.dataset.tfHEdit))));
    wrap.querySelectorAll("[data-tf-h-del]").forEach((b) => b.addEventListener("click", () => {
      const h = tfHistoryById(b.dataset.tfHDel);
      tfConfirmDelete({ text: tf("history.confirmDelete")(tfNum(h.amount, h.currencyTicker)), onConfirm: () => { TF_HISTORY.splice(TF_HISTORY.indexOf(h), 1); } });
    }));
  },
});

// ==== Маски ===========================================================================================================
function tfConditionText(c) {
  return `${c.behaviorParameterKey} ${tfEnum("operator", c.operator)} ${JSON.stringify(c.expectedValue)}`;
}

const tfMasksList = createAccessList({
  key: "tf-masks",
  data: () => TF_MASKS.filter((m) => m.status !== "DELETED"),
  searchPlaceholder: () => tf("masks.search"),
  searchText: (m) => [m.id, m.name, m.description].filter(Boolean).join(" "),
  tab: { get: (m) => m.status, values: ["DRAFT", "ACTIVE", "SCHEDULED", "ARCHIVED"], label: (v) => tfEnum("maskStatus", v) },
  filters: [
    { id: "type", kind: "multi", label: () => tf("filters.type"), get: (m) => m.type, options: () => TF_MASK_TYPES.map((v) => ({ value: v, label: tfEnum("maskType", v) })) },
    { id: "tariff", kind: "multi", label: () => tf("filters.tariff"), get: (m) => m.tariffId, options: () => tfLiveTariffs().map((x) => ({ value: x.id, label: x.name })) },
    { id: "created", kind: "date", label: () => tf("filters.created"), get: (m) => m.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name), created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = tf("masks.metrics");
    return [{ value: list.filter((x) => x.type === "DEFAULT").length, label: m.defaults }, { value: list.filter((x) => x.type === "RULE_BASED").length, label: m.rules }, { value: list.reduce((n, x) => n + TF_ASSIGNMENTS.filter((a) => a.maskId === x.id && a.status === "ACTIVE").length, 0), label: m.clients }];
  },
  columns: [
    { label: () => tf("columns.name"), sort: "name", html: (m) => `<div class="identity-cell">${vbLink(`#/settings-masks-list/${m.id}`, pdEscape(m.name))}${vbIdCell(m.id)}</div>` },
    { label: () => tf("columns.type"), html: (m) => tfEnum("maskType", m.type) },
    { label: () => tf("columns.status"), html: (m) => tfMaskBadge(m.status) },
    { label: () => tf("columns.tariff"), html: (m) => tfTariffLink(tfTariffById(m.tariffId)) },
    { label: () => tf("columns.condition"), html: (m) => (m.type === "DEFAULT" ? `${tf("fields.risk")} ${m.riskScoreRange.min}–${m.riskScoreRange.max}` : m.type === "RULE_BASED" ? tf("masks.templatesCount")(m.ruleTemplateIds.length) : `<span class="table-cell-muted">${tf("masks.manualOnly")}</span>`) },
    { label: () => tf("columns.delay"), html: (m) => (m.tariffDelay ? tf("masks.days")(m.tariffDelay) : "—") },
    { label: () => tf("columns.activeFrom"), html: (m) => tfDate(m.activeFrom) },
    { label: () => tf("columns.clients"), html: (m) => TF_ASSIGNMENTS.filter((a) => a.maskId === m.id && a.status === "ACTIVE").length },
  ],
  headerAction: () => `<button type="button" class="btn-secondary ac-header-btn" id="tf-mask-eval">${tf("masks.evaluate")}</button><button type="button" class="btn-primary ac-header-btn" id="tf-mask-create">+ ${tf("masks.create")}</button>`,
  attachHeaderAction: () => {
    const b = document.getElementById("tf-mask-create");
    if (b) b.addEventListener("click", () => tfOpenMaskForm(null));
    const e = document.getElementById("tf-mask-eval");
    if (e) e.addEventListener("click", tfOpenEvaluate);
  },
  attachRows: vbAttachRows,
});

function tfOpenMaskForm(mask) {
  const f = tf("masks.form");
  const isEdit = !!mask;
  tfOpenForm({
    title: isEdit ? f.editTitle : f.createTitle,
    width: 600,
    intro: isEdit ? f.editIntro : f.createIntro,
    fields: [
      { id: "name", label: tf("fields.name"), required: true, value: isEdit ? mask.name : "" },
      { id: "description", label: tf("fields.description"), value: isEdit ? mask.description || "" : "" },
      { id: "type", label: tf("fields.type"), type: "select", options: TF_MASK_TYPES.map((v) => ({ value: v, label: tfEnum("maskType", v) })), value: isEdit ? mask.type : "RULE_BASED", disabled: isEdit, hint: f.typeHint },
      { id: "tariff", label: tf("fields.tariff"), type: "select", options: tfLiveTariffs().filter((x) => !x.ownerClientId).map((x) => ({ value: x.id, label: x.name })), value: isEdit ? mask.tariffId : tfLiveTariffs()[0].id },
      { id: "delay", label: f.delay, type: "number", half: true, value: isEdit ? mask.tariffDelay : 0, hint: f.delayHint },
      { id: "riskMin", label: f.riskMin, type: "number", half: true, value: isEdit && mask.riskScoreRange ? mask.riskScoreRange.min : "" },
      { id: "riskMax", label: f.riskMax, type: "number", half: true, value: isEdit && mask.riskScoreRange ? mask.riskScoreRange.max : "" },
      { id: "templates", label: f.templates, type: "checks", options: TF_TEMPLATES.map((x) => ({ value: x.id, label: pdEscape(x.name) })), value: isEdit ? mask.ruleTemplateIds : [] },
    ],
    submitLabel: isEdit ? vt("common.save") : vt("common.create"),
    validate: (v) => {
      const type = isEdit ? mask.type : v.type;
      if (!v.name) return f.errName;
      if (v.delay !== null && (Number.isNaN(v.delay) || v.delay < 0 || !Number.isInteger(v.delay))) return f.errDelay;
      if (type === "DEFAULT") {
        if (v.riskMin === null || v.riskMax === null || Number.isNaN(v.riskMin) || Number.isNaN(v.riskMax) || v.riskMin > v.riskMax) return f.errRange;
      }
      if (type === "RULE_BASED" && !v.templates.length) return f.errTemplates;
      return null;
    },
    confirm: isEdit ? () => f.confirmEdit : null,
    onSave: (v) => {
      const type = isEdit ? mask.type : v.type;
      const vals = { name: v.name, description: v.description || null, tariffId: v.tariff, tariffDelay: v.delay || 0, riskScoreRange: type === "DEFAULT" ? { min: v.riskMin, max: v.riskMax } : null, ruleTemplateIds: type === "RULE_BASED" ? v.templates : [] };
      if (isEdit) { Object.assign(mask, vals); acTouch(mask); return; }
      const created = tfStamp({ id: tfId(), type, status: "DRAFT", activeFrom: null, activeTo: null, maskVersion: 1, previousVersionId: null, ...vals }, pdNow());
      TF_MASKS.unshift(created);
      window.location.hash = `#/settings-masks-list/${created.id}`;
    },
  });
}

function tfOpenPublishMask(mask) {
  const f = tf("masks.publish");
  tfOpenForm({
    title: f.title,
    width: 480,
    intro: f.intro,
    fields: [
      { id: "from", label: f.from, value: "", placeholder: "ГГГГ-ММ-ДД", hint: f.fromHint, half: true },
      { id: "to", label: f.to, value: "", placeholder: "ГГГГ-ММ-ДД", half: true },
    ],
    submitLabel: f.submit,
    validate: (v) => {
      const parse = (s) => (s ? (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null) : undefined);
      const from = parse(v.from);
      const to = parse(v.to);
      if (from === null || to === null || (from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return f.errDate;
      if (from && to && from > to) return f.errOrder;
      return null;
    },
    confirm: (v) => f.confirm(pdEscape(mask.name), v.from ? f.scheduled(v.from) : f.now),
    onSave: (v) => {
      const from = v.from ? new Date(`${v.from}T00:00:00`) : null;
      mask.status = from && from > pdNow() ? "SCHEDULED" : "ACTIVE";
      mask.activeFrom = from || pdNow();
      mask.activeTo = v.to ? new Date(`${v.to}T00:00:00`) : null;
      acTouch(mask);
    },
  });
}

function viewMaskDetail(id) {
  const m = tfMaskById(id);
  if (!m || m.status === "DELETED") return vbNotFound();
  const f = tf("fields");
  const d = tf("masks.detail");
  const tariff = tfTariffById(m.tariffId);
  const assignments = TF_ASSIGNMENTS.filter((a) => a.maskId === m.id);
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, m.id)}${detailField(f.type, tfEnum("maskType", m.type))}${detailField(f.status, tfMaskBadge(m.status))}
    ${detailField(f.tariff, tfTariffLink(tariff))}${detailField(f.description, m.description ? pdEscape(m.description) : "—")}${detailField(f.delay, m.tariffDelay ? tf("masks.days")(m.tariffDelay) : "—")}
    ${detailField(f.risk, m.riskScoreRange ? `${m.riskScoreRange.min}–${m.riskScoreRange.max}` : "—")}${detailField(f.version, m.maskVersion)}${detailField(f.activeFrom, tfDate(m.activeFrom))}${detailField(f.activeTo, tfDate(m.activeTo))}
    ${detailField(f.created, m.createdAt)}${detailField(f.updated, m.updatedAt)}
  </div>`;
  const templates = m.ruleTemplateIds.map(tfTemplateById).filter(Boolean);
  const tplBlock = templates.length ? templates.map((x) => `<div class="tf-tpl"><strong>${pdEscape(x.name)}</strong> <span class="badge badge-neutral">${tfEnum("logical", x.logicalOperator)}</span><ul class="vf-list">${x.conditions.map((c) => `<li class="vb-mono">${pdEscape(tfConditionText(c))}</li>`).join("")}</ul></div>`).join("") : `<div class="table-cell-muted">${d.noTemplates}</div>`;
  const asBlock = vbMiniTable([tf("columns.created"), tf("columns.client"), tf("columns.type"), tf("columns.status"), tf("columns.activeTariff"), tf("columns.pendingTariff")], assignments.map((a) => [dateTimeCell(a.createdAt), tfClientLink(tfClientById(a.clientId)), tfEnum("assignmentType", a.type), tfAssignmentBadge(a.status), tfTariffLink(tfTariffById(a.activeTariffId)), a.pendingTariffId ? `${tfTariffLink(tfTariffById(a.pendingTariffId))}<div class="table-cell-muted">${tfDate(a.tariffEffectiveDate)}</div>` : "—"]), d.noAssignments);
  const canEdit = m.status === "DRAFT" && m.type !== "DEFAULT";
  const canPublish = m.status === "DRAFT";
  const canArchive = (m.status === "ACTIVE" || m.status === "SCHEDULED") && m.type !== "DEFAULT";
  const canDelete = m.status !== "ACTIVE";
  const actions = `<button type="button" class="btn-secondary" data-tf-act="edit"${canEdit ? "" : ` disabled title="${d.editDisabled}"`}>${vt("common.edit")}</button>${canPublish ? `<button type="button" class="btn-primary" data-tf-act="publish">${d.publish}</button>` : ""}${canArchive ? `<button type="button" class="btn-secondary" data-tf-act="archive">${d.archive}</button>` : ""}<button type="button" class="btn-danger" data-tf-act="delete"${canDelete ? "" : ` disabled title="${d.deleteDisabled}"`}>${vt("common.delete")}</button>`;
  return `<div id="tf-root">
    ${vbDetailHeader({ backHash: "#/settings-masks-list", title: pdEscape(m.name), badges: `${tfMaskBadge(m.status)}<span class="badge badge-neutral">${tfEnum("maskType", m.type)}</span>`, subtitle: vbIdSubtitle(m.id, [`v${m.maskVersion}`, m.createdAt]), actions })}
    ${sectionCard(d.general, main)}
    ${sectionCard(`${d.templates} · ${templates.length}`, tplBlock)}
    ${sectionCard(`${d.assignments} · ${assignments.length}`, asBlock)}
  </div>`;
}

function initMaskDetail(id) {
  const m = tfMaskById(id);
  const root = document.getElementById("tf-root");
  if (!m || !root) return;
  vbAttachCommon(root);
  const act = (n) => root.querySelector(`[data-tf-act="${n}"]`);
  act("edit").addEventListener("click", () => tfOpenMaskForm(m));
  const pub = act("publish");
  if (pub) pub.addEventListener("click", () => tfOpenPublishMask(m));
  const arc = act("archive");
  if (arc) arc.addEventListener("click", () => vbConfirm({ title: tf("common.confirmTitle"), text: tf("masks.detail.confirmArchive")(pdEscape(m.name)), confirmLabel: tf("masks.detail.archive"), danger: true, onConfirm: () => { m.status = "ARCHIVED"; m.activeTo = pdNow(); acTouch(m); render(); } }));
  act("delete").addEventListener("click", () => {
    const blocking = m.status === "ARCHIVED" && TF_ASSIGNMENTS.some((a) => a.maskId === m.id && (a.status === "ACTIVE" || a.status === "SCHEDULED"));
    if (blocking) { vbConfirm({ title: tf("masks.detail.cantDeleteTitle"), text: tf("masks.detail.cantDelete"), confirmLabel: vt("common.close"), danger: false, onConfirm: () => {} }); return; }
    tfConfirmDelete({ text: tf("masks.detail.confirmDelete")(pdEscape(m.name)), onConfirm: () => { m.status = "DELETED"; window.location.hash = "#/settings-masks-list"; } });
  });
}

// ---- Шаблоны правил -------------------------------------------------------------------------------------------------
function tfValidateConditions(list) {
  const m = tf("templates.form");
  if (!Array.isArray(list) || !list.length) return m.errConditions;
  const keys = new Set();
  for (const c of list) {
    if (!c || typeof c !== "object") return m.errConditions;
    const p = tfParameterByKey(c.behaviorParameterKey);
    if (!p) return `${tf("errors.MASK_BEHAVIOUR_PARAMETER_NOT_FOUND")}: ${c.behaviorParameterKey}`;
    if (!TF_OPERATORS.includes(c.operator)) return `${m.errOperator}: ${c.operator}`;
    keys.add(c.behaviorParameterKey);
    if (p.expectedTypeOfValue === "number" && p.config && !Array.isArray(c.expectedValue) && typeof c.expectedValue === "number" && ((p.config.min !== undefined && c.expectedValue < p.config.min) || (p.config.max !== undefined && c.expectedValue > p.config.max))) return `${m.errRange}: ${p.key} ${p.config.min}–${p.config.max}`;
  }
  return keys.size < 2 ? m.errTwoKeys : null;
}

const tfTemplatesList = createAccessList({
  key: "tf-tpl",
  data: () => TF_TEMPLATES,
  searchPlaceholder: () => tf("templates.search"),
  searchText: (x) => [x.id, x.name, ...x.conditions.map((c) => c.behaviorParameterKey)].join(" "),
  filters: [{ id: "logical", kind: "multi", label: () => tf("filters.logical"), get: (x) => x.logicalOperator, options: () => ["AND", "OR"].map((v) => ({ value: v, label: tfEnum("logical", v) })) }, { id: "created", kind: "date", label: () => tf("filters.created"), get: (x) => x.createdDate }],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name) },
  metrics: (list) => {
    const m = tf("templates.metrics");
    return [{ value: list.length, label: m.total }, { value: list.reduce((n, x) => n + x.conditions.length, 0), label: m.conditions }, { value: list.filter((x) => !TF_MASKS.some((mk) => mk.ruleTemplateIds.includes(x.id))).length, label: m.unused }];
  },
  columns: [
    { label: () => tf("columns.name"), sort: "name", html: (x) => `<div class="identity-cell"><span>${pdEscape(x.name)}</span>${vbIdCell(x.id)}</div>` },
    { label: () => tf("columns.logical"), html: (x) => tfEnum("logical", x.logicalOperator) },
    { label: () => tf("columns.conditions"), html: (x) => `<div class="identity-cell">${x.conditions.map((c) => `<span class="vb-mono">${pdEscape(tfConditionText(c))}</span>`).join("")}</div>` },
    { label: () => tf("columns.masks"), html: (x) => TF_MASKS.filter((mk) => mk.ruleTemplateIds.includes(x.id) && mk.status !== "DELETED").length },
    { label: () => tf("columns.updated"), html: (x) => dateTimeCell(x.updatedAt) },
    { label: () => "", html: (x) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-tf-tpl-edit="${x.id}">${vt("common.edit")}</button><button type="button" class="btn-secondary vb-row-btn sl-del" data-tf-tpl-del="${x.id}">${TRASH_ICON_SVG}</button></div>` },
  ],
  headerAction: () => `<button type="button" class="btn-primary ac-header-btn" id="tf-tpl-create">+ ${tf("templates.create")}</button>`,
  attachHeaderAction: () => { const b = document.getElementById("tf-tpl-create"); if (b) b.addEventListener("click", () => tfOpenTemplateForm(null)); },
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-tf-tpl-edit]").forEach((b) => b.addEventListener("click", () => tfOpenTemplateForm(tfTemplateById(b.dataset.tfTplEdit))));
    wrap.querySelectorAll("[data-tf-tpl-del]").forEach((b) => b.addEventListener("click", () => {
      const x = tfTemplateById(b.dataset.tfTplDel);
      const used = TF_MASKS.filter((mk) => mk.ruleTemplateIds.includes(x.id) && mk.status !== "DELETED").length;
      tfConfirmDelete({ text: tf("templates.confirmDelete")(pdEscape(x.name), used), onConfirm: () => { TF_MASKS.forEach((mk) => { mk.ruleTemplateIds = mk.ruleTemplateIds.filter((i) => i !== x.id); }); TF_TEMPLATES.splice(TF_TEMPLATES.indexOf(x), 1); } });
    }));
  },
});

function tfOpenTemplateForm(x) {
  const f = tf("templates.form");
  tfOpenForm({
    title: x ? f.editTitle : f.createTitle,
    width: 600,
    intro: f.intro,
    fields: [
      { id: "name", label: tf("fields.name"), required: true, value: x ? x.name : "" },
      { id: "logical", label: tf("fields.logical"), type: "select", options: ["AND", "OR"].map((v) => ({ value: v, label: tfEnum("logical", v) })), value: x ? x.logicalOperator : "AND" },
      { id: "conditions", label: tf("fields.conditions"), type: "json", rows: 10, required: true, value: x ? x.conditions : [{ behaviorParameterKey: "risk.score", operator: "ge", expectedValue: 5 }, { behaviorParameterKey: "user.level", operator: "in", expectedValue: ["medium", "high"] }], hint: f.conditionsHint },
    ],
    submitLabel: x ? vt("common.save") : vt("common.create"),
    validate: (v) => (!v.name ? f.errName : v.conditions === undefined ? f.errJson : tfValidateConditions(v.conditions)),
    confirm: x ? () => f.confirmEdit(TF_MASKS.filter((mk) => mk.ruleTemplateIds.includes(x.id) && mk.status !== "DELETED").length) : null,
    onSave: (v) => {
      if (x) { Object.assign(x, { name: v.name, logicalOperator: v.logical, conditions: v.conditions }); acTouch(x); return; }
      TF_TEMPLATES.unshift(tfStamp({ id: tfId(), name: v.name, logicalOperator: v.logical, conditions: v.conditions }, pdNow()));
    },
  });
}

// ---- Параметры поведения ---------------------------------------------------------------------------------------------------
const tfParametersList = createAccessList({
  key: "tf-param",
  data: () => TF_PARAMETERS,
  searchPlaceholder: () => tf("parameters.search"),
  searchText: (p) => [p.id, p.key, p.displayName].join(" "),
  filters: [{ id: "type", kind: "multi", label: () => tf("filters.valueType"), get: (p) => p.expectedTypeOfValue, options: () => TF_VALUE_TYPES.map((v) => ({ value: v, label: tfEnum("valueType", v) })) }],
  defaultSort: (a, b) => a.priority - b.priority,
  sorts: { key: (a, b) => a.key.localeCompare(b.key), priority: (a, b) => a.priority - b.priority },
  metrics: (list) => {
    const m = tf("parameters.metrics");
    return [{ value: list.length, label: m.total }, { value: list.filter((p) => p.config).length, label: m.withConfig }, { value: list.filter((p) => TF_TEMPLATES.some((x) => x.conditions.some((c) => c.behaviorParameterKey === p.key))).length, label: m.used }];
  },
  columns: [
    { label: () => tf("columns.key"), sort: "key", html: (p) => tfMono(p.key) },
    { label: () => tf("columns.displayName"), html: (p) => pdEscape(p.displayName) },
    { label: () => tf("columns.priority"), sort: "priority", html: (p) => p.priority },
    { label: () => tf("columns.valueType"), html: (p) => tfEnum("valueType", p.expectedTypeOfValue) },
    { label: () => tf("columns.config"), html: (p) => (p.config ? tfMono(JSON.stringify(p.config)) : `<span class="table-cell-muted">—</span>`) },
    { label: () => tf("columns.templates"), html: (p) => TF_TEMPLATES.filter((x) => x.conditions.some((c) => c.behaviorParameterKey === p.key)).length },
    { label: () => "", html: (p) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-tf-p-edit="${p.id}">${vt("common.edit")}</button><button type="button" class="btn-secondary vb-row-btn sl-del" data-tf-p-del="${p.id}">${TRASH_ICON_SVG}</button></div>` },
  ],
  headerAction: () => `<button type="button" class="btn-primary ac-header-btn" id="tf-p-create">+ ${tf("parameters.create")}</button>`,
  attachHeaderAction: () => { const b = document.getElementById("tf-p-create"); if (b) b.addEventListener("click", () => tfOpenParameterForm(null)); },
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-tf-p-edit]").forEach((b) => b.addEventListener("click", () => tfOpenParameterForm(TF_PARAMETERS.find((p) => p.id === b.dataset.tfPEdit))));
    wrap.querySelectorAll("[data-tf-p-del]").forEach((b) => b.addEventListener("click", () => {
      const p = TF_PARAMETERS.find((x) => x.id === b.dataset.tfPDel);
      const used = TF_TEMPLATES.filter((x) => x.conditions.some((c) => c.behaviorParameterKey === p.key)).length;
      tfConfirmDelete({ text: tf("parameters.confirmDelete")(p.key, used), onConfirm: () => { TF_PARAMETERS.splice(TF_PARAMETERS.indexOf(p), 1); } });
    }));
  },
});

function tfOpenParameterForm(p) {
  const f = tf("parameters.form");
  tfOpenForm({
    title: p ? f.editTitle : f.createTitle,
    width: 560,
    intro: f.intro,
    fields: [
      { id: "key", label: tf("columns.key"), required: true, value: p ? p.key : "", hint: f.keyHint },
      { id: "displayName", label: tf("columns.displayName"), required: true, value: p ? p.displayName : "" },
      { id: "priority", label: tf("columns.priority"), type: "number", required: true, half: true, value: p ? p.priority : TF_PARAMETERS.length + 1, hint: f.priorityHint },
      { id: "type", label: tf("columns.valueType"), type: "select", options: TF_VALUE_TYPES.map((v) => ({ value: v, label: tfEnum("valueType", v) })), value: p ? p.expectedTypeOfValue : "string", half: true },
      { id: "config", label: tf("columns.config"), type: "json", rows: 3, value: p && p.config ? p.config : "", hint: f.configHint },
    ],
    submitLabel: p ? vt("common.save") : vt("common.create"),
    validate: (v) => {
      if (!/^[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)*$/.test(v.key)) return f.errKey;
      if (TF_PARAMETERS.some((x) => x !== p && x.key === v.key)) return tf("errors.SAME_DATA_WAS_PROVIDED");
      if (!v.displayName) return f.errName;
      if (v.priority === null || Number.isNaN(v.priority) || !Number.isInteger(v.priority) || v.priority < 1) return f.errPriority;
      if (v.config === undefined || (v.config !== null && !tfJsonObject(v.config))) return f.errConfig;
      if (v.config && v.type === "number" && Object.keys(v.config).some((k) => !["min", "max"].includes(k))) return f.errConfigNumber;
      return null;
    },
    confirm: p ? () => f.confirmEdit : null,
    onSave: (v) => {
      const vals = { key: v.key, displayName: v.displayName, priority: v.priority, expectedTypeOfValue: v.type, config: v.config || null };
      if (p) {
        if (p.key !== v.key) TF_TEMPLATES.forEach((x) => x.conditions.forEach((c) => { if (c.behaviorParameterKey === p.key) c.behaviorParameterKey = v.key; }));
        Object.assign(p, vals);
        acTouch(p);
        return;
      }
      TF_PARAMETERS.push(tfStamp({ id: tfId(), ...vals }, pdNow()));
    },
  });
}

// ---- Назначения масок и оценка клиента ---------------------------------------------------------------------------------------------
const tfAssignmentsList = createAccessList({
  key: "tf-assign",
  data: () => TF_ASSIGNMENTS,
  searchPlaceholder: () => tf("assignments.search"),
  searchText: (a) => [a.id, a.clientId, (tfClientById(a.clientId) || {}).name, (tfMaskById(a.maskId) || {}).name, a.reason].filter(Boolean).join(" "),
  tab: { get: (a) => a.status, values: TF_ASSIGNMENT_STATUSES, label: (v) => tfEnum("assignmentStatus", v) },
  filters: [
    { id: "type", kind: "multi", label: () => tf("filters.assignmentType"), get: (a) => a.type, options: () => TF_ASSIGNMENT_TYPES.map((v) => ({ value: v, label: tfEnum("assignmentType", v) })) },
    { id: "mask", kind: "multi", label: () => tf("filters.mask"), get: (a) => a.maskId, options: () => TF_MASKS.filter((m) => m.status !== "DELETED").map((m) => ({ value: m.id, label: m.name })) },
    { id: "approval", kind: "multi", label: () => tf("filters.approval"), get: (a) => String(a.requiresApproval), options: () => [{ value: "true", label: vt("common.yes") }, { value: "false", label: vt("common.no") }] },
    { id: "created", kind: "date", label: () => tf("filters.created"), get: (a) => a.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = tf("assignments.metrics");
    return [{ value: list.filter((a) => a.type === "MANUAL").length, label: m.manual }, { value: list.filter((a) => a.type === "AUTOMATIC").length, label: m.automatic }, { value: list.filter((a) => a.requiresApproval).length, label: m.approval }];
  },
  columns: [
    { label: () => tf("columns.created"), sort: "created", html: (a) => dateTimeCell(a.createdAt) },
    { label: () => tf("columns.client"), html: (a) => tfClientLink(tfClientById(a.clientId)) },
    { label: () => tf("columns.mask"), html: (a) => tfMaskLink(tfMaskById(a.maskId)) },
    { label: () => tf("columns.type"), html: (a) => tfEnum("assignmentType", a.type) },
    { label: () => tf("columns.status"), html: (a) => tfAssignmentBadge(a.status) },
    { label: () => tf("columns.activeTariff"), html: (a) => tfTariffLink(tfTariffById(a.activeTariffId)) },
    { label: () => tf("columns.pendingTariff"), html: (a) => (a.pendingTariffId ? `<div class="identity-cell">${tfTariffLink(tfTariffById(a.pendingTariffId))}<span class="table-cell-muted">${tfDate(a.tariffEffectiveDate)}</span></div>` : "—") },
    { label: () => tf("columns.reason"), html: (a) => slTrunc(a.reason, true) },
    { label: () => "", html: (a) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-tf-a-edit="${a.id}">${vt("common.edit")}</button><button type="button" class="btn-secondary vb-row-btn sl-del" data-tf-a-del="${a.id}">${TRASH_ICON_SVG}</button></div>` },
  ],
  headerAction: () => `<button type="button" class="btn-secondary ac-header-btn" id="tf-a-eval">${tf("masks.evaluate")}</button><button type="button" class="btn-primary ac-header-btn" id="tf-a-create">+ ${tf("assignments.create")}</button>`,
  attachHeaderAction: () => {
    const b = document.getElementById("tf-a-create");
    if (b) b.addEventListener("click", () => tfOpenAssignmentForm(null));
    const e = document.getElementById("tf-a-eval");
    if (e) e.addEventListener("click", tfOpenEvaluate);
  },
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-tf-a-edit]").forEach((b) => b.addEventListener("click", () => tfOpenAssignmentForm(tfAssignmentById(b.dataset.tfAEdit))));
    wrap.querySelectorAll("[data-tf-a-del]").forEach((b) => b.addEventListener("click", () => {
      const a = tfAssignmentById(b.dataset.tfADel);
      tfConfirmDelete({ text: tf("assignments.confirmDelete")((tfClientById(a.clientId) || {}).name || "", (tfMaskById(a.maskId) || {}).name || ""), onConfirm: () => { TF_ASSIGNMENTS.splice(TF_ASSIGNMENTS.indexOf(a), 1); } });
    }));
  },
});

function tfApplyAssignment(client, mask, type, status, extra) {
  const now = pdNow();
  const prevTariff = tfTariffById(client.tariffId);
  TF_ASSIGNMENTS.filter((a) => a.clientId === client.id && a.type === type && (a.status === "ACTIVE" || a.status === "SCHEDULED")).forEach((a) => { a.status = "SUPERSEDED"; acTouch(a); });
  const pending = status === "SCHEDULED" ? mask.tariffId : null;
  const created = tfStamp({ id: tfId(), maskId: mask.id, clientId: client.id, type, status, activeTariffId: status === "SCHEDULED" ? prevTariff.id : mask.tariffId, pendingTariffId: pending, tariffEffectiveDate: pending ? new Date(now.getTime() + mask.tariffDelay * 86400000) : null, activeFrom: now, requiresApproval: false, reason: null, overridenAutomaticMaskId: null, changes: null, ...extra }, now);
  TF_ASSIGNMENTS.unshift(created);
  if (status === "ACTIVE" && !prevTariff.ownerClientId) {
    client.tariffId = mask.tariffId;
    client.changes.unshift({ id: tfId(), tariffId: mask.tariffId, billingPeriod: client.billingPeriod, createdDate: now, createdAt: formatDateTime(now) });
    acTouch(client);
  }
  return created;
}

function tfOpenAssignmentForm(a) {
  const f = tf("assignments.form");
  const masks = TF_MASKS.filter((m) => m.status !== "DELETED" && m.status !== "ARCHIVED");
  tfOpenForm({
    title: a ? f.editTitle : f.createTitle,
    width: 540,
    intro: a ? f.editIntro : f.createIntro,
    fields: a
      ? [{ id: "status", label: tf("columns.status"), type: "select", options: TF_ASSIGNMENT_STATUSES.map((v) => ({ value: v, label: tfEnum("assignmentStatus", v) })), value: a.status }, { id: "approval", label: f.approval, type: "checkbox", value: a.requiresApproval }, { id: "reason", label: tf("columns.reason"), value: a.reason || "" }]
      : [{ id: "client", label: tf("columns.client"), type: "select", options: tfClientOptions(false), value: TF_CLIENTS[0].id }, { id: "mask", label: tf("columns.mask"), type: "select", options: masks.map((m) => ({ value: m.id, label: `${m.name} · ${tfEnum("maskType", m.type)}` })), value: masks[0].id }, { id: "approval", label: f.approval, type: "checkbox", value: false }, { id: "reason", label: tf("columns.reason"), value: "", hint: f.reasonHint }],
    submitLabel: a ? vt("common.save") : vt("common.create"),
    validate: (v) => {
      if (v.reason && v.reason.length > 250) return f.errReason;
      if (!a && TF_ASSIGNMENTS.some((x) => x.clientId === v.client && x.type === "MANUAL" && (x.status === "ACTIVE" || x.status === "SCHEDULED"))) return f.errManualExists;
      if (!a) { const cl = tfClientById(v.client); if (tfTariffById(tfMaskById(v.mask).tariffId).clientCategory !== cl.category) return tf("errors.INVALID_CATEGORY_PROVIDED"); }
      return null;
    },
    confirm: (v) => (a ? f.confirmEdit : f.confirmCreate((tfClientById(v.client) || {}).name, (tfMaskById(v.mask) || {}).name)),
    onSave: (v) => {
      if (a) { Object.assign(a, { status: v.status, requiresApproval: v.approval, reason: v.reason || null }); acTouch(a); return; }
      tfApplyAssignment(tfClientById(v.client), tfMaskById(v.mask), "MANUAL", "ACTIVE", { requiresApproval: v.approval, reason: v.reason || null });
    },
  });
}

function tfOpenEvaluate() {
  const f = tf("assignments.evaluate");
  openModal({
    title: f.title,
    width: 640,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${f.intro}</p>
      ${vbSelect("tfe-client", tf("columns.client"), tfClientOptions(false).filter((o) => tfClientById(o.value).category === "INDIVIDUAL"), TF_CLIENTS[0].id)}
      <div class="sl-grid">${vbInput("tfe-risk", f.risk, "3")}${switchRowHtml("tfe-trigger", f.manualTrigger, true, { cls: "vb-field tf-check-inline" })}</div>
      ${vbTextarea("tfe-params", f.params, JSON.stringify({ risk: { score: 3 }, user: { level: "low" } }, null, 2), 5)}
      <div class="table-cell-muted sl-hint">${f.paramsHint}</div>
      <div id="tfe-result" class="tf-result"></div><div class="form-error" id="tfe-error" hidden></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="tfe-close">${vt("common.close")}</button><button type="button" class="btn-primary" id="tfe-run">${f.run}</button>`,
    onMount: (el) => {
      el.querySelector("#tfe-close").addEventListener("click", () => { closeModal(); render(); });
      el.querySelector("#tfe-run").addEventListener("click", () => {
        const err = el.querySelector("#tfe-error");
        const fail = (m) => { err.textContent = m; err.hidden = false; };
        const risk = Number(el.querySelector("#tfe-risk").value.trim().replace(",", "."));
        const params = vbParseJson(el.querySelector("#tfe-params").value, false);
        if (Number.isNaN(risk) || risk < 1 || risk > 6) return fail(f.errRisk);
        if (!params.ok || !tfJsonObject(params.value)) return fail(f.errParams);
        err.hidden = true;
        const client = tfClientById(el.querySelector("#tfe-client").value);
        const r = tfEvaluateMask(client.id, params.value, risk);
        const out = el.querySelector("#tfe-result");
        if (r.error) { out.innerHTML = `<div class="vf-banner"><span>${tf(`errors.${r.error}`)}</span></div>`; return; }
        const current = TF_ASSIGNMENTS.find((a) => a.clientId === client.id && a.status === "ACTIVE" && a.type === r.source.replace("RULE_BASED", "AUTOMATIC").replace("DEFAULT", "AUTOMATIC"));
        let note = f.noChange;
        if (!(current && current.maskId === r.mask.id)) {
          const trigger = el.querySelector("#tfe-trigger").checked;
          if (r.source === "MANUAL") note = f.manualWins;
          else if (r.mask.tariffDelay > 0 && !trigger) note = f.noAssignment;
          else {
            const riskier = tfTariffById(r.mask.tariffId).name === "High risk" && tfTariffById(client.tariffId).name !== "High risk";
            const delayed = r.mask.tariffDelay > 0 && !riskier;
            tfApplyAssignment(client, r.mask, "AUTOMATIC", delayed ? "SCHEDULED" : "ACTIVE", {});
            note = delayed ? f.scheduled(r.mask.tariffDelay) : riskier && r.mask.tariffDelay > 0 ? f.riskIgnored : f.activated;
          }
        }
        out.innerHTML = `<div class="profile-fields profile-fields-grid">${detailField(f.selected, tfMaskLink(r.mask))}${detailField(f.source, tfEnum("maskSource", r.source))}${detailField(tf("columns.tariff"), tfTariffLink(tfTariffById(r.mask.tariffId)))}${detailField(f.result, note)}</div>`;
        vbAttachRows(out);
      });
    },
  });
}

// ==== Обёртки для роутера ==================================================================================================================
function viewTariffsClients() {
  return `${pageHeader(tf("titles.clients"), t("navDescriptions.settings-tariffs-clients"))}${tfClientsList.view()}`;
}
function initTariffsClients() {
  tfClientsList.init();
}
function viewTariffsHistory() {
  return `${pageHeader(tf("titles.history"), t("navDescriptions.settings-tariffs-history"))}${tfHistoryList.view()}`;
}
function initTariffsHistory() {
  tfHistoryList.init();
}
function viewMasksList() {
  return `${pageHeader(tf("titles.masks"), t("navDescriptions.settings-masks-list"))}${tfMasksList.view()}`;
}
function initMasksList() {
  tfMasksList.init();
}
function viewMasksTemplates() {
  return `${pageHeader(tf("titles.templates"), t("navDescriptions.settings-masks-templates"))}${tfTemplatesList.view()}`;
}
function initMasksTemplates() {
  tfTemplatesList.init();
}
function viewMasksParameters() {
  return `${pageHeader(tf("titles.parameters"), t("navDescriptions.settings-masks-parameters"))}${tfParametersList.view()}`;
}
function initMasksParameters() {
  tfParametersList.init();
}
function viewMasksAssignments() {
  return `${pageHeader(tf("titles.assignments"), t("navDescriptions.settings-masks-assignments"))}${tfAssignmentsList.view()}`;
}
function initMasksAssignments() {
  tfAssignmentsList.init();
}

// Страница деталей: тариф, лимит, комиссия, клиент тарифов или маска
function viewTariffsDetail(ref) {
  if (!ref) return vbNotFound();
  return { tariff: viewTariffDetail, limit: viewLimitDetail, commission: viewCommissionDetail, client: viewClientDetail_tf, mask: viewMaskDetail }[ref.kind](ref.id);
}
function initTariffsDetail(ref) {
  if (!ref) return;
  ({ tariff: initTariffDetail, limit: initLimitDetail, commission: initCommissionDetail, client: initClientDetail_tf, mask: initMaskDetail }[ref.kind])(ref.id);
}
function tfEntityTitle(ref) {
  if (!ref) return vt("common.notFoundTitle");
  const e = { tariff: tfTariffById, limit: tfLimitById, commission: tfCommissionById, client: tfClientById, mask: tfMaskById }[ref.kind](ref.id);
  return e ? e.name : vt("common.notFoundTitle");
}

// Маршруты списков: id пункта сайдбара → [view, init]
const TF_ROUTES = {
  "settings-tariffs-catalog": [viewTariffsCatalog, initTariffsCatalog],
  "settings-tariffs-operations": [viewTariffsOperations, initTariffsOperations],
  "settings-tariffs-limits": [viewTariffsLimits, initTariffsLimits],
  "settings-tariffs-restrictions": [viewTariffsRestrictions, initTariffsRestrictions],
  "settings-tariffs-commissions": [viewTariffsCommissions, initTariffsCommissions],
  "settings-masks-list": [viewMasksList, initMasksList],
  "settings-masks-templates": [viewMasksTemplates, initMasksTemplates],
  "settings-masks-parameters": [viewMasksParameters, initMasksParameters],
  "settings-masks-assignments": [viewMasksAssignments, initMasksAssignments],
};
