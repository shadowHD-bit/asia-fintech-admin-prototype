/* ==========================================================================
   KYT: "Настройки системы → KYT → Конфигурации транзакций" и
   "Безопасность → AML-проверки" (транзакции сервиса kyt).
   Спецификация: docs/security-kyt-spec.md; данные — mock/security-kyt.mock.js.
   Списки построены на createAccessList, формы и подтверждения — на хелперах vb*.
   ========================================================================== */

function kt(path) {
  return t(`kyt.${path}`);
}

function ktRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^(settings-kyt-configs|security-aml-checks)\/(.+)$/);
  return m ? { kind: m[1] === "settings-kyt-configs" ? "config" : "check", id: decodeURIComponent(m[2]) } : null;
}

function ktStatusLabel(s) {
  return kt(`enums.status.${s}`);
}

function ktStatusBadge(s) {
  const cls = { APPROVED: "badge-success", AUTO_SUCCESS: "badge-success", MANUAL_SUCCESS: "badge-success", NEED_ACTION: "badge-warning", ERROR: "badge-danger", REJECTED: "badge-danger", AUTO_FAILED: "badge-danger", MANUAL_FAILED: "badge-danger", PROCESSING: "badge-info", PENDING: "badge-neutral" }[s] || "badge-neutral";
  return `<span class="badge ${cls}">${ktStatusLabel(s)}</span>`;
}

function ktRiskBadge(r) {
  if (!r) return "—";
  const cls = r === "RELIABLE" ? "badge-success" : r === "SUSPICIOUS" ? "badge-warning" : "badge-danger";
  return `<span class="badge ${cls}">${kt(`enums.risk.${r}`)}</span>`;
}

function ktCfgLabel(c) {
  return `${c.name} · v${c.configVersion}`;
}

// ==== Конфигурации: список ================================================================================
const ktConfigsList = createAccessList({
  key: "kt-cfg",
  data: () => KYT_CONFIGS,
  searchPlaceholder: () => kt("configs.search"),
  searchText: (c) => [c.code, c.name, c.type, c.description].filter(Boolean).join(" "),
  tab: { get: (c) => (c.isActive ? "active" : "inactive"), values: ["active", "inactive"], label: (v) => kt(`configs.tabs.${v}`) },
  filters: [
    { id: "created", kind: "date", label: () => kt("filters.created"), get: (c) => c.createdDate },
    { id: "updated", kind: "date", label: () => kt("filters.updated"), get: (c) => c.updatedDate },
    { id: "version", kind: "multi", label: () => kt("filters.version"), get: (c) => c.configVersion, options: () => [...new Set(KYT_CONFIGS.map((c) => c.configVersion))].sort((a, b) => a - b).map((v) => ({ value: String(v), label: String(v) })) },
    { id: "type", kind: "multi", label: () => kt("filters.type"), get: (c) => c.type, options: () => [...new Set(KYT_CONFIGS.map((c) => c.type))].map((v) => ({ value: v, label: v })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, name: (a, b) => a.name.localeCompare(b.name) },
  metrics: (list) => {
    const m = kt("configs.metrics");
    return [
      { value: new Set(list.map((c) => c.type)).size, label: m.types },
      { value: list.reduce((n, c) => n + c.steps.length, 0), label: m.steps },
      { value: new Set(list.flatMap((c) => c.steps.map((s) => s.step))).size, label: m.providers },
    ];
  },
  columns: [
    { label: () => kt("columns.id"), html: (c) => `<div class="identity-cell-primary">${vbLink(`#/settings-kyt-configs/${c.id}`, c.code)}${copyIconButton(c.code)}</div>` },
    { label: () => kt("columns.name"), sort: "name", html: (c) => pdEscape(c.name) },
    { label: () => kt("columns.description"), html: (c) => slTrunc(c.description, true) },
    { label: () => kt("columns.created"), sort: "created", html: (c) => dateTimeCell(c.createdAt) },
    { label: () => kt("columns.updated"), html: (c) => dateTimeCell(c.updatedAt) },
    { label: () => kt("columns.type"), html: (c) => `<span class="vb-mono">${pdEscape(c.type)}</span>` },
    { label: () => kt("columns.version"), html: (c) => c.configVersion },
    { label: () => kt("columns.state"), html: (c) => vfStateBadge(c.isActive) },
    { label: () => kt("columns.steps"), html: (c) => c.steps.length },
    { label: () => "", html: (c) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-kt-newver="${c.id}">${kt("configs.newVersionShort")}</button></div>` },
  ],
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    wrap.querySelectorAll("[data-kt-newver]").forEach((b) => b.addEventListener("click", () => ktOpenConfigForm(ktConfigById(b.dataset.ktNewver))));
  },
});

// ==== Конфигурации: форма создания / новой версии ==============================================
const KT_STEP_FORMAT_HINT = { coinkyt: { whitelabelId: { path: "whitelabelId" }, currency: { path: "currency" }, blockchain: { path: "blockchain" }, address: { path: "address" } }, sumsub: { applicant: { path: { fullName: { path: "debitor.fullName" } } } }, scoring: {} };

function ktStepRowHtml(data) {
  const providers = KYT_STEP_PROVIDERS.map((p) => `<option value="${p}"${data.step === p ? " selected" : ""}>${p}</option>`).join("");
  return `<div class="vf-step" data-kt-step>
    <div class="vf-step-head"><strong class="kt-step-no"></strong>
      <span class="vf-step-tools"><button type="button" class="btn-secondary vb-row-btn" data-kt-up>↑</button><button type="button" class="btn-secondary vb-row-btn" data-kt-down>↓</button><button type="button" class="btn-secondary vb-row-btn" data-kt-del title="${kt("configs.form.remove")}">${TRASH_ICON_SVG}</button></span></div>
    <div class="sl-grid">
      <label class="filters-field vb-field"><span class="filters-field-label">${kt("fields.stepProvider")}<span class="req-star">*</span></span><select class="address-form-input" data-kt-provider>${providers}</select></label>
      <label class="filters-field vb-field"><span class="filters-field-label">${kt("fields.name")}<span class="req-star">*</span></span><input class="address-form-input" type="text" data-kt-sname value="${escapeAttr(data.name || "")}" /></label>
    </div>
    <label class="filters-field vb-field"><span class="filters-field-label">${kt("fields.description")}</span><input class="address-form-input" type="text" data-kt-sdesc value="${escapeAttr(data.description || "")}" /></label>
    <label class="filters-field vb-field"><span class="filters-field-label">${kt("fields.format")}<span class="req-star">*</span></span><textarea class="form-textarea vb-mono" data-kt-sfmt rows="5">${pdEscape(JSON.stringify(data.format || {}, null, 2))}</textarea></label>
    <label class="filters-field vb-field"><span class="filters-field-label">${kt("fields.providerData")}</span><textarea class="form-textarea vb-mono" data-kt-sdata rows="3">${pdEscape(data.providerData ? JSON.stringify(data.providerData, null, 2) : "")}</textarea></label>
  </div>`;
}

function ktOpenConfigForm(base) {
  const f = kt("configs.form");
  const isVersion = !!base;
  const b = base || { name: "", type: "", description: "", schema: { type: "object", required: [], properties: {} }, notify: KYT_NOTIFY(), steps: [{ step: "coinkyt", name: "", description: "", format: KT_STEP_FORMAT_HINT.coinkyt, providerData: null }] };
  b.steps = b.steps.map((st) => ({ ...st, name: st.name || st.step }));
  const selectedEvents = b.notify.rmq.events.map((e) => e.event);
  const events = KYT_EVENTS.map(([ev, pattern]) => ({ value: ev, label: `${ev} <span class="table-cell-muted vb-mono">${pattern}</span>` }));
  openModal({
    title: isVersion ? f.versionTitle : f.createTitle,
    width: 780,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${isVersion ? f.versionIntro(pdEscape(b.name), b.configVersion + 1) : f.createIntro}</p>
      <div class="sl-grid">${vbInput("kt-name", `${kt("fields.name")}<span class="req-star">*</span>`, b.name, isVersion ? "disabled" : "")}${vbInput("kt-type", `${kt("fields.type")}<span class="req-star">*</span>`, b.type)}</div>
      ${vbInput("kt-desc", kt("fields.description"), b.description || "")}
      ${vbTextarea("kt-schema", `${kt("fields.schema")}<span class="req-star">*</span>`, JSON.stringify(b.schema, null, 2), 10)}
      <p class="table-cell-muted sl-hint">${f.schemaHint}</p>
      <div class="sl-section-title">${kt("fields.notify")}</div>
      ${vbInput("kt-exchange", kt("fields.exchange"), b.notify.rmq.exchange || "")}
      <div class="filters-field vb-field"><span class="filters-field-label">${kt("fields.events")}</span><div class="ac-checklist" id="kt-events">${vfCheckboxes(events, selectedEvents, "data-kt-event")}</div></div>
      <div class="sl-section-title">${kt("configs.detail.steps")}</div>
      <div id="kt-steps"></div>
      <button type="button" class="btn-secondary" id="kt-add-step">+ ${f.addStep}</button>
      <div class="form-error" id="vb-modal-error" hidden></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="vb-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="vb-submit">${isVersion ? f.versionSubmit : vt("common.create")}</button>`,
    onMount: (el) => {
      const box = el.querySelector("#kt-steps");
      const err = el.querySelector("#vb-modal-error");
      const renumber = () => box.querySelectorAll("[data-kt-step]").forEach((row, i) => { row.querySelector(".kt-step-no").textContent = `${kt("configs.detail.step")} ${i + 1}`; });
      const addRow = (data) => {
        box.insertAdjacentHTML("beforeend", ktStepRowHtml(data));
        const row = box.lastElementChild;
        const prov = row.querySelector("[data-kt-provider]");
        const fmt = row.querySelector("[data-kt-sfmt]");
        fmt.addEventListener("input", () => { fmt.dataset.touched = "1"; });
        prov.addEventListener("change", () => { if (!fmt.dataset.touched) fmt.value = JSON.stringify(KT_STEP_FORMAT_HINT[prov.value] || {}, null, 2); });
        row.querySelector("[data-kt-del]").addEventListener("click", () => { row.remove(); renumber(); });
        row.querySelector("[data-kt-up]").addEventListener("click", () => { if (row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling); renumber(); });
        row.querySelector("[data-kt-down]").addEventListener("click", () => { if (row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row); renumber(); });
        renumber();
      };
      b.steps.forEach((s) => addRow(s));
      el.querySelector("#kt-add-step").addEventListener("click", () => addRow({ step: "coinkyt", format: KT_STEP_FORMAT_HINT.coinkyt }));
      el.querySelector("#vb-cancel").addEventListener("click", closeModal);
      el.querySelector("#vb-submit").addEventListener("click", () => {
        const fail = (m) => { err.textContent = m; err.hidden = false; };
        const name = el.querySelector("#kt-name").value.trim();
        const type = el.querySelector("#kt-type").value.trim();
        if (!name) return fail(f.errName);
        if (!type || !/^[A-Z0-9_]+$/.test(type)) return fail(f.errType);
        const schema = vbParseJson(el.querySelector("#kt-schema").value, false);
        if (!schema.ok || typeof schema.value !== "object" || Array.isArray(schema.value)) return fail(f.errSchema);
        if (!schema.value.properties && !schema.value.$defs) return fail(f.errSchemaProps);
        const rows = [...box.querySelectorAll("[data-kt-step]")];
        if (!rows.length) return fail(f.errNoSteps);
        const steps = [];
        for (let i = 0; i < rows.length; i += 1) {
          const sname = rows[i].querySelector("[data-kt-sname]").value.trim();
          const fmt = vbParseJson(rows[i].querySelector("[data-kt-sfmt]").value, false);
          const pd = vbParseJson(rows[i].querySelector("[data-kt-sdata]").value, true);
          if (!sname) return fail(f.errStepName(i + 1));
          if (!fmt.ok || typeof fmt.value !== "object" || Array.isArray(fmt.value)) return fail(f.errStepFormat(i + 1));
          if (!pd.ok) return fail(f.errStepData(i + 1));
          steps.push({ id: seedToPaymentUuid(Date.now() % 100000 + i + 30000), order: i + 1, name: sname, step: rows[i].querySelector("[data-kt-provider]").value, description: rows[i].querySelector("[data-kt-sdesc]").value.trim() || null, format: fmt.value, providerData: pd.value });
        }
        const evs = [...el.querySelectorAll("[data-kt-event]:checked")].map((i) => i.dataset.ktEvent);
        const exchange = el.querySelector("#kt-exchange").value.trim();
        const previous = KYT_CONFIGS.filter((c) => c.name === name).sort((a, c) => c.configVersion - a.configVersion)[0];
        const cfg = ktStamp({
          id: seedToPaymentUuid(Date.now() % 100000 + 35000), key: null, name, type, description: el.querySelector("#kt-desc").value.trim() || null, configVersion: previous ? previous.configVersion + 1 : 1, isActive: true,
          schema: schema.value, notify: { rmq: { ...(exchange ? { exchange } : {}), events: evs.map((ev) => ({ event: ev, pattern: KYT_EVENTS.find((x) => x[0] === ev)[1] })) } }, steps,
        }, pdNow());
        if (previous) { previous.isActive = false; acTouch(previous); }
        KYT_CONFIGS.unshift(cfg);
        closeModal();
        window.location.hash = `#/settings-kyt-configs/${cfg.id}`;
      });
    },
  });
}

// ==== Конфигурации: страница ===========================================================================
function viewKytConfigDetail(id) {
  const c = ktConfigById(id);
  if (!c) return vbNotFound();
  const f = kt("fields");
  const d = kt("configs.detail");
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, c.code)}${detailField(f.name, pdEscape(c.name))}${detailField(f.description, c.description ? pdEscape(c.description) : "—")}${detailField(f.type, `<span class="vb-mono">${pdEscape(c.type)}</span>`)}
    ${detailField(f.created, c.createdAt)}${detailField(f.updated, c.updatedAt)}${detailField(f.version, c.configVersion)}${detailField(f.state, vfStateBadge(c.isActive))}</div>`;
  const events = vbMiniTable([f.event, f.pattern], c.notify.rmq.events.map((e) => [`<strong>${e.event}</strong>`, `<span class="vb-mono">${pdEscape(e.pattern)}</span>`]), d.noEvents);
  const notify = `${c.notify.rmq.exchange ? `<div class="profile-fields">${detailField(f.exchange, `<span class="vb-mono">${pdEscape(c.notify.rmq.exchange)}</span>`)}</div>` : ""}${events}`;
  const steps = c.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) =>
      flatSection(
        `${d.step} ${s.order}${s.name ? ` · ${pdEscape(s.name)}` : ""}`,
        `<div class="profile-fields profile-fields-grid">${detailField(f.order, s.order)}${detailField(f.name, s.name ? pdEscape(s.name) : "—")}${detailField(f.stepProvider, `<span class="vb-mono">${pdEscape(s.step)}</span>`)}${detailField(f.description, s.description ? pdEscape(s.description) : "—")}</div>
        <div class="vf-cfg-title">${f.format}</div>${vbJson(s.format)}
        <div class="vf-cfg-title">${f.providerData}</div>${s.providerData ? vbJson(s.providerData) : `<div class="table-cell-muted">—</div>`}`,
        `data-kt-step-edit="${s.id}"`
      )
    )
    .join("");
  const checks = ktTxOfConfig(c.id);
  const rows = checks.slice(0, 10).map((x) => [vbLink(`#/security-aml-checks/${x.id}`, x.code), x.createdAt, ktStatusBadge(x.status), x.totalScore === null ? "—" : x.totalScore, `<span class="vb-mono">${pdEscape(x.trackerId || "—")}</span>`]);
  const checksBlock = `${vbMiniTable([kt("columns.id"), kt("columns.created"), kt("columns.status"), kt("columns.totalScore"), kt("columns.trackerId")], rows, d.noChecks)}${checks.length ? `<p class="table-cell-muted vb-note">${d.checksNote(Math.min(10, checks.length), checks.length)} ${vbLink("#/security-aml-checks", d.openChecks)}</p>` : ""}`;
  return `<div id="kt-root">
    ${vbDetailHeader({ backHash: "#/settings-kyt-configs", title: d.title, badges: `${vfStateBadge(c.isActive)}<span class="badge badge-neutral">v${c.configVersion}</span>`, subtitle: vbCodeSubtitle(c.code, [`<span class="vb-mono">${pdEscape(c.type)}</span>`, c.createdAt]), actions: "" })}
    <div class="vf-banner"><span>${d.banner}</span><button type="button" class="btn-secondary" data-kt-action="newVersion">${d.newVersion}</button></div>
    <div class="pd-grid">
      <div class="pd-col"><div class="profile-flat-block">${flatSection(d.general, main)}${steps}${flatSection(`${d.checks} · ${checks.length}`, checksBlock)}</div></div>
      <div class="pd-col">${sectionCard(d.schema, vbJson(c.schema), "is-collapsed")}${sectionCard(d.notify, notify, "is-collapsed")}</div>
    </div>
  </div>`;
}

function initKytConfigDetail(id) {
  const c = ktConfigById(id);
  const root = document.getElementById("kt-root");
  if (!c || !root) return;
  vbAttachCommon(root);
  root.querySelector('[data-kt-action="newVersion"]').addEventListener("click", () => ktOpenConfigForm(c));
  root.querySelectorAll("[data-kt-step-edit]").forEach((b) => b.addEventListener("click", () => ktOpenStepEdit(c, c.steps.find((s) => s.id === b.dataset.ktStepEdit))));
}

function ktOpenStepEdit(c, s) {
  if (!s) return;
  const f = kt("configs.stepForm");
  vbOpenForm({
    title: f.title,
    width: 620,
    intro: f.intro,
    fieldsHtml: `${vbInput("kt-sdesc", kt("fields.description"), s.description || "")}${vbTextarea("kt-sfmt", `${kt("fields.format")}<span class="req-star">*</span>`, JSON.stringify(s.format, null, 2), 12)}`,
    submitLabel: vt("common.save"),
    danger: true,
    onSubmit: (el) => {
      const fmt = vbParseJson(el.querySelector("#kt-sfmt").value, false);
      if (!fmt.ok || typeof fmt.value !== "object" || Array.isArray(fmt.value)) return vt("common.errJsonObject");
      closeModal();
      s.description = el.querySelector("#kt-sdesc").value.trim() || null;
      s.format = fmt.value;
      acTouch(c);
      render();
      return null;
    },
  });
}

// ==== AML-проверки: список ==========================================================================
function ktClientOptions() {
  const m = new Map();
  KYT_TRANSACTIONS.forEach((x) => { if (x.client) m.set(x.client.id, x.client.name); });
  return [...m].map(([value, label]) => ({ value, label }));
}

const ktChecksList = createAccessList({
  key: "kt-chk",
  data: () => KYT_TRANSACTIONS,
  searchPlaceholder: () => kt("checks.search"),
  searchText: (x) => [x.code, x.trackerId, x.client && x.client.id, x.client && x.client.name, x.data.address, x.data.transaction].filter(Boolean).join(" "),
  tab: { get: (x) => x.status, values: KYT_STATUSES, label: (v) => ktStatusLabel(v) },
  filters: [
    { id: "created", kind: "date", label: () => kt("filters.created"), get: (x) => x.createdDate },
    { id: "updated", kind: "date", label: () => kt("filters.updated"), get: (x) => x.updatedDate },
    { id: "config", kind: "multi", label: () => kt("filters.config"), get: (x) => x.configId, options: () => KYT_CONFIGS.map((c) => ({ value: c.id, label: ktCfgLabel(c) })) },
    { id: "client", kind: "multi", label: () => kt("filters.client"), get: (x) => (x.client ? x.client.id : ""), options: ktClientOptions },
    { id: "risk", kind: "multi", label: () => kt("filters.risk"), get: (x) => (x.steps[0].riskClass || ""), options: () => KYT_RISK_CLASSES.map((v) => ({ value: v, label: kt(`enums.risk.${v}`) })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, updated: (a, b) => a.updatedDate - b.updatedDate },
  columns: [
    { label: () => kt("columns.id"), html: (x) => `<div class="identity-cell-primary">${vbLink(`#/security-aml-checks/${x.id}`, x.code)}${copyIconButton(x.code)}</div>` },
    { label: () => kt("columns.config"), html: (x) => { const c = ktConfigById(x.configId); return c ? vbLink(`#/settings-kyt-configs/${c.id}`, pdEscape(c.name)) : "—"; } },
    { label: () => kt("columns.created"), sort: "created", html: (x) => dateTimeCell(x.createdAt) },
    { label: () => kt("columns.updated"), sort: "updated", html: (x) => dateTimeCell(x.updatedAt) },
    { label: () => kt("columns.client"), html: (x) => (x.client ? vbLink(x.client.link, pdEscape(x.client.name)) : "—") },
    { label: () => kt("columns.status"), html: (x) => ktStatusBadge(x.status) },
    { label: () => kt("columns.totalScore"), html: (x) => (x.totalScore === null ? "—" : x.totalScore) },
    { label: () => kt("columns.error"), html: (x) => slTrunc(x.errorMessage, true) },
    // Операция — только у проверок по крипто-транзакции, у которых бэкенд реально связывает KYT-кейс с
    // конкретной crypto-provider операцией (coreOperationId); у проверок по адресу и без связи — прочерк.
    { label: () => kt("columns.operation"), html: (x) => { if (!x.operationId) return "—"; const op = vbOperationById(x.operationId); return vbLink(`#/settings-vabs-operations/${x.operationId}`, op ? op.code : pdShort(x.operationId)); } },
    { label: () => "", html: (x) => ktCheckRowActionsMenu(x) },
  ],
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    wrap.querySelectorAll("[data-kt-fund-action]").forEach((b) => b.addEventListener("click", () => ktHandleFundAction(b.dataset.ktFundAction)));
  },
});

// ---- Экспорт списка проверок (CSV / XLSX): то, что показывает таблица — поиск, вкладка, фильтры и сортировка,
// без учёта страницы. Перед выгрузкой — модалка с итогом (тот же паттерн, что и в остальном приложении). --------
function ktOpenChecksExportModal(format) {
  const x = kt("checks.export");
  const count = ktChecksList.exportRows().length;
  const lines = ktChecksList.filterLines();
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle,
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(ktChecksList.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); ktChecksList.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); ktExportChecksTable(format); });
    },
  });
}

function ktExportChecksTable(format) {
  const x = kt("checks.export");
  const rows = ktChecksList.exportRows().map((r) => [
    r.code, ktConfigById(r.configId) ? ktConfigById(r.configId).name : "", r.createdAt, r.updatedAt,
    r.client ? r.client.name : "", ktStatusLabel(r.status), r.totalScore === null ? "" : r.totalScore, r.trackerId || "", r.errorMessage || "", r.operationId || "",
  ]);
  exportTable(`aml_checks_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(rows.length));
}

// ---- Действия в строке: решение по деньгам (только у проверок с привязанной крипто-операцией, пока решение
// не принято) + "Принять решение" по самой проверке (если она ждёт вердикта) — это ДВА независимых решения,
// см. комментарий в security-kyt.mock.js. ---------------------------------------------------------------------
const RETURN_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5 3.5 8.5 7 12"/><path d="M3.5 8.5H12a4 4 0 0 1 4 4v2"/></svg>`;

function ktCheckRowActionsMenu(x) {
  const a = kt("checks.rowActions");
  const items = [];
  if (x.operationId && !x.fundDecision) {
    if (x.operationDirection === "DEPOSIT") {
      items.push({ label: a.creditOriginal, icon: CHECK_ICON_SVG, attrs: `data-kt-fund-action="creditOriginal:${x.id}"` });
      items.push({ label: a.creditAddress, icon: EDIT_ICON_SVG, attrs: `data-kt-fund-action="creditAddress:${x.id}"` });
      items.push({ label: a.refundSender, icon: RETURN_ICON_SVG, attrs: `data-kt-fund-action="refundSender:${x.id}"` });
      items.push({ label: a.refundAddress, icon: RETURN_ICON_SVG, attrs: `data-kt-fund-action="refundAddress:${x.id}"`, danger: true });
    } else if (x.operationDirection === "WITHDRAWAL") {
      items.push({ label: a.approveWithdrawal, icon: CHECK_ICON_SVG, attrs: `data-kt-fund-action="approveWithdrawal:${x.id}"` });
      items.push({ label: a.rejectWithdrawal, icon: PAY_DECLINE_ICON_SVG, attrs: `data-kt-fund-action="rejectWithdrawal:${x.id}"`, danger: true });
    }
  }
  if (x.status === "NEED_ACTION" && x.steps[0].manualCheckRequired) {
    items.push({ label: kt("checks.detail.decide"), icon: EDIT_ICON_SVG, attrs: `data-kt-fund-action="decide:${x.id}"` });
  }
  return items.length ? rowKebabMenu(`kt-chk-${x.id}`, items) : "";
}

function ktHandleFundAction(raw) {
  const [action, id] = raw.split(":");
  const x = ktTxById(id);
  if (!x) return;
  if (action === "decide") return ktOpenDecision(x);
  if (action === "creditOriginal") return ktConfirmFundDecision(x, "CREDIT_ORIGINAL");
  if (action === "refundSender") return ktConfirmFundDecision(x, "REFUND_SENDER");
  if (action === "creditAddress") return ktOpenFundTargetForm(x, "CREDIT_ADDRESS");
  if (action === "refundAddress") return ktOpenFundTargetForm(x, "REFUND_ADDRESS");
  if (action === "approveWithdrawal") return ktConfirmFundDecision(x, "APPROVE");
  if (action === "rejectWithdrawal") return ktConfirmFundDecision(x, "REJECT");
}

// Прямые решения (без дополнительного адреса) — зачислить исходному клиенту, вернуть отправителю, одобрить/
// отклонить вывод — только подтверждение.
function ktConfirmFundDecision(x, decision) {
  const m = kt("checks.fundDecision");
  vbConfirm({
    title: m.confirmTitle,
    text: m.confirmText(m.values[decision]),
    confirmLabel: m.values[decision],
    danger: decision === "REJECT",
    onConfirm: () => {
      ktApplyFundDecision(x, decision, null);
      render();
      showToast(m.done(m.values[decision]));
    },
  });
}

// Решения с адресом получателя (зачислить на другой кошелёк / вернуть на другой адрес) — форма с обязательным
// адресом (VabsDecideCryptoProviderDepositPayloadInput: targetAddress / refundAddress).
function ktOpenFundTargetForm(x, decision) {
  const m = kt("checks.fundDecision");
  vbOpenForm({
    title: m.values[decision],
    width: 480,
    intro: m.targetIntro,
    fieldsHtml: vbInput("kt-fund-target", m.targetLabel, ""),
    submitLabel: m.values[decision],
    danger: decision === "REFUND_ADDRESS",
    onSubmit: (el) => {
      const target = el.querySelector("#kt-fund-target").value.trim();
      if (!target) return m.errTarget;
      closeModal();
      ktApplyFundDecision(x, decision, target);
      render();
      showToast(m.done(m.values[decision]));
      return null;
    },
  });
}

// ==== Исключения KYT: список ============================================================================
// VabsCryptoProviderKytException (см. комментарий в security-kyt.mock.js) — вкладка на этой же странице,
// рядом с "Проверки" (право доступа в bb2 объединяет их в один раздел AML).
function ke(path) {
  return kt(`exceptions.${path}`);
}

function ktExceptionRowActionsMenu(x) {
  if (x.status !== "ACTIVE") return "";
  return rowKebabMenu(`kt-exc-${x.id}`, [{ label: ke("actions.revoke"), icon: TRASH_ICON_SVG, danger: true, attrs: `data-kt-exc-revoke="${x.id}"` }]);
}

const ktExceptionsList = createAccessList({
  key: "kt-exc",
  data: () => KYT_EXCEPTIONS,
  searchPlaceholder: () => ke("search"),
  searchText: (x) => [x.code, x.client.id, x.client.name, x.address].join(" "),
  tab: { get: (x) => x.status, values: KYT_EXCEPTION_STATUSES, label: (v) => ke(`enums.status.${v}`) },
  filters: [
    { id: "created", kind: "date", label: () => ke("filters.created"), get: (x) => x.createdDate },
    { id: "direction", kind: "multi", label: () => ke("filters.direction"), get: (x) => x.direction, options: () => ["DEPOSIT", "WITHDRAWAL"].map((v) => ({ value: v, label: ke(`enums.direction.${v}`) })) },
    { id: "currency", kind: "multi", label: () => ke("filters.currency"), get: (x) => x.currency, options: () => [...new Set(KYT_EXCEPTIONS.map((x) => x.currency))].map((v) => ({ value: v, label: v })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, expires: (a, b) => a.expiresDate - b.expiresDate },
  columns: [
    { label: () => ke("columns.id"), html: (x) => `<div class="identity-cell-primary">${x.code}${copyIconButton(x.code)}</div>` },
    { label: () => ke("columns.client"), html: (x) => vbLink(x.client.link, pdEscape(x.client.name)) },
    { label: () => ke("columns.address"), html: (x) => `<span class="vb-mono">${pdEscape(x.address)}</span>` },
    { label: () => ke("columns.currency"), html: (x) => `${x.currency} <span class="table-cell-muted">· ${x.network}</span>` },
    { label: () => ke("columns.direction"), html: (x) => ke(`enums.direction.${x.direction}`) },
    { label: () => ke("columns.createdBy"), html: (x) => pdEscape(x.createdBy) },
    { label: () => ke("columns.expires"), sort: "expires", html: (x) => dateTimeCell(x.expiresAt) },
    { label: () => ke("columns.status"), html: (x) => ktExceptionStatusBadge(x.status) },
    { label: () => "", html: (x) => ktExceptionRowActionsMenu(x) },
  ],
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    wrap.querySelectorAll("[data-kt-exc-revoke]").forEach((b) => b.addEventListener("click", () => ktRevokeException(ktExceptionById(b.dataset.ktExcRevoke))));
  },
});

// ---- Экспорт списка исключений (CSV / XLSX) — тот же паттерн, что и у списка проверок выше. -----------------
function ktOpenExceptionsExportModal(format) {
  const x = ke("export");
  const count = ktExceptionsList.exportRows().length;
  const lines = ktExceptionsList.filterLines();
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle,
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(ktExceptionsList.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); ktExceptionsList.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); ktExportExceptionsTable(format); });
    },
  });
}

function ktExportExceptionsTable(format) {
  const x = ke("export");
  const rows = ktExceptionsList.exportRows().map((r) => [
    r.code, r.client.name, r.address, `${r.currency} · ${r.network}`, ke(`enums.direction.${r.direction}`), r.createdBy, r.expiresAt, ke(`enums.status.${r.status}`),
  ]);
  exportTable(`kyt_exceptions_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(rows.length));
}

const KYT_EXCEPTION_DURATIONS = [["1h", 1], ["24h", 24], ["72h", 72], ["7d", 168], ["30d", 720], ["1y", 8760]];

function ktOpenExceptionForm() {
  const f = ke("form");
  const clients = CLIENTS_USERS_MOCK.slice(0, 12).map((u) => ({ value: u.id, label: u.fullName || u.email }));
  const chains = KYT_CHAINS.map((c, i) => ({ value: String(i), label: `${c[0]} · ${c[1].toUpperCase()}` }));
  vbOpenForm({
    title: f.title,
    width: 520,
    intro: f.intro,
    fieldsHtml: `${vbSelect("kt-exc-client", f.client, clients, clients[0].value)}
      ${vbInput("kt-exc-address", f.address, "")}
      <div class="sl-grid">${vbSelect("kt-exc-chain", f.currency, chains, "0")}${vbSelect("kt-exc-direction", f.direction, [{ value: "DEPOSIT", label: ke("enums.direction.DEPOSIT") }, { value: "WITHDRAWAL", label: ke("enums.direction.WITHDRAWAL") }], "DEPOSIT")}</div>
      ${vbSelect("kt-exc-duration", f.duration, KYT_EXCEPTION_DURATIONS.map(([k]) => ({ value: k, label: f.durations[k] })), "72h")}`,
    submitLabel: ke("create"),
    onSubmit: (el) => {
      const clientId = el.querySelector("#kt-exc-client").value;
      const client = CLIENTS_USERS_MOCK.find((u) => u.id === clientId);
      if (!client) return f.errClient;
      const address = el.querySelector("#kt-exc-address").value.trim();
      if (!address) return f.errAddress;
      const chain = KYT_CHAINS[+el.querySelector("#kt-exc-chain").value];
      const direction = el.querySelector("#kt-exc-direction").value;
      const hours = KYT_EXCEPTION_DURATIONS.find(([k]) => k === el.querySelector("#kt-exc-duration").value)[1];
      closeModal();
      const now = pdNow();
      const exc = ktStamp(
        {
          id: seedToPaymentUuid(Date.now() % 100000 + 48000),
          client: { id: client.id, name: client.fullName || client.email, link: `#/clients-users/${client.id}` },
          address, currency: chain[0], network: chain[1].toUpperCase(), direction, status: "ACTIVE",
          expiresDate: new Date(now.getTime() + hours * 60 * 60 * 1000), expiresAt: formatDateTime(new Date(now.getTime() + hours * 60 * 60 * 1000)),
          createdBy: CURRENT_ADMIN.email, revokedDate: null, revokedAt: null, revokedBy: null, consumedDate: null, consumedAt: null,
        },
        now
      );
      KYT_EXCEPTIONS.unshift(exc);
      render();
      return null;
    },
  });
}

function ktRevokeException(x) {
  if (!x) return;
  const m = ke("revoke");
  vbConfirm({
    title: m.title,
    text: m.text,
    confirmLabel: m.confirm,
    danger: true,
    onConfirm: () => {
      const now = pdNow();
      x.status = "REVOKED";
      x.revokedDate = now;
      x.revokedAt = formatDateTime(now);
      x.revokedBy = CURRENT_ADMIN.email;
      render();
      showToast(m.done);
    },
  });
}

// ==== AML-проверки: создание ==================================================================================
function ktSampleData(cfg) {
  const props = (cfg.schema && cfg.schema.properties) || {};
  const known = { whitelabelId: "default", currency: "BTC", blockchain: "btc", address: "1A1z7agoat7TestAddress", transaction: "c2f4f23b5f7cTestTxHash", directs: true };
  const out = {};
  Object.keys(props).forEach((k) => {
    const p = props[k] || {};
    out[k] = known[k] !== undefined ? known[k] : p.enum ? p.enum[0] : p.type === "boolean" ? true : p.type === "number" ? 0 : "";
  });
  return out;
}

// Упрощённая имитация решения провайдера: балл из данных; выше порога 25 — автоматически не пройдено и нужно решение оператора
function ktEvaluate(tx) {
  const seedStr = `${tx.trackerId || ""}${tx.data.address || tx.data.transaction || ""}`;
  const score = [...seedStr].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 70;
  const risky = score > 25;
  const step = tx.steps[0];
  const now = pdNow();
  Object.assign(step, {
    status: risky ? "AUTO_FAILED" : "AUTO_SUCCESS", score, riskClass: score > 40 ? "RISKY" : risky ? "SUSPICIOUS" : "RELIABLE", errorMessage: null,
    manualCheckRequired: risky, manualTrigger: risky ? "EXCEEDS_AUTO_LIMIT" : null, providerTransactionId: `ck-${ktHex(score + tx.steps.length + 3, 16)}`,
    scoringOutput: { riskScore: +(score / 100).toFixed(2), riskScorePercent: score, riskClass: score > 40 ? "RISKY" : risky ? "SUSPICIOUS" : "RELIABLE", generalThresholdExceeded: risky, categories: [{ name: "exchange_licensed", percent: 100 - score }, { name: "other", percent: score }], categoryThresholdViolations: [], reasons: risky ? [`Общий балл ${score} выше порога 25`] : [] },
  });
  step.attempts.push({ id: seedToPaymentUuid(Date.now() % 100000 + step.attempts.length + 40000), attemptNo: step.attempts.length + 1, providerName: step.providerName, isFallback: false, status: "SUCCESS", errorCode: null, errorMessage: null, durationMs: 240 + score * 5, triggeredBy: null });
  tx.status = risky ? "NEED_ACTION" : "APPROVED";
  tx.totalScore = score;
  tx.errorMessage = null;
  tx.scoringResult = { totalScore: score, coinkyt: { stepStatus: step.status, totalScore: score, riskClass: step.riskClass } };
  tx.updatedDate = now;
  tx.updatedAt = formatDateTime(now);
}

// Поле формы данных проверки — по одному полю на свойство схемы конфигурации (а не общий JSON): тип поля
// берётся из типа свойства (enum → select, boolean → переключатель, number → числовое поле, иначе — текст),
// поэтому форма одинаково работает и для двух встроенных типов (проверка адреса/транзакции), и для схемы
// любой конфигурации, которую администратор создал сам ("Настройки → KYT → Конфигурации транзакций").
function ktDataFieldHtml(key, prop, required, sample) {
  const label = `${key}${required ? " *" : ""}`;
  const id = `kt-f-${key}`;
  if (prop.enum) return vbSelect(id, label, prop.enum.map((v) => ({ value: v, label: v })), sample);
  if (prop.type === "boolean") return `<div class="vb-field">${switchRowHtml(id, label, !!sample)}</div>`;
  if (prop.type === "number") return vbInput(id, label, sample ?? 0, 'type="number"');
  return vbInput(id, label, sample ?? "");
}

function ktDataFieldsHtml(cfg) {
  const props = (cfg.schema && cfg.schema.properties) || {};
  const required = (cfg.schema && cfg.schema.required) || [];
  const sample = ktSampleData(cfg);
  return Object.keys(props)
    .map((key) => ktDataFieldHtml(key, props[key] || {}, required.includes(key), sample[key]))
    .join("");
}

// Читает значения полей формы обратно в объект data — тип чтения зеркалит то, каким полем свойство отрисовано.
function ktReadDataFields(cfg) {
  const props = (cfg.schema && cfg.schema.properties) || {};
  const required = (cfg.schema && cfg.schema.required) || [];
  const data = {};
  const missing = [];
  Object.keys(props).forEach((key) => {
    const prop = props[key] || {};
    const el = document.getElementById(`kt-f-${key}`);
    if (!el) return;
    let value;
    if (prop.type === "boolean") value = el.checked;
    else if (prop.type === "number") value = el.value === "" ? null : Number(el.value);
    else value = el.value.trim();
    if (required.includes(key) && (value === "" || value === null || value === undefined)) missing.push(key);
    data[key] = value;
  });
  return { data, missing };
}

function ktOpenCheckForm() {
  const f = kt("checks.form");
  const active = KYT_CONFIGS.filter((c) => c.isActive);
  const clients = [{ value: "", label: "—" }, ...CLIENTS_USERS_MOCK.slice(0, 12).map((u) => ({ value: u.id, label: u.fullName }))];
  vbOpenForm({
    title: f.title,
    width: 620,
    intro: f.intro,
    fieldsHtml: `${vbSelect("kt-cfg", kt("fields.config"), active.map((c) => ({ value: c.id, label: `${c.name} (${c.type})` })), active[0].id)}
      <div class="sl-grid">${vbInput("kt-tracker", kt("fields.trackerId"), "")}${vbSelect("kt-client", kt("fields.client"), clients, "")}</div>
      <div class="sl-section-title">${kt("fields.data")}</div>
      <div id="kt-data-fields" class="sl-grid">${ktDataFieldsHtml(active[0])}</div>`,
    submitLabel: vt("common.create"),
    onSubmit: (el) => {
      const cfg = ktConfigById(el.querySelector("#kt-cfg").value);
      const { data, missing } = ktReadDataFields(cfg);
      if (missing.length) return f.errRequired(missing.join(", "));
      const u = CLIENTS_USERS_MOCK.find((x) => x.id === el.querySelector("#kt-client").value);
      closeModal();
      const now = pdNow();
      const tx = ktStamp({
        id: seedToPaymentUuid(Date.now() % 100000 + 45000), configId: cfg.id, status: "PROCESSING", trackerId: el.querySelector("#kt-tracker").value.trim() || null, data, errorMessage: null, totalScore: null,
        client: u ? { id: u.id, name: u.fullName, link: `#/clients-users/${u.id}` } : null, scoringResult: { totalScore: 0 },
        steps: [{ id: seedToPaymentUuid(Date.now() % 100000 + 46000), order: 1, providerName: cfg.steps[0].step, stepConfigStep: cfg.steps[0].step, status: "PROCESSING", score: null, riskClass: null, errorMessage: null, providerTransactionId: null, manualCheckRequired: false, manualTrigger: null, manualComment: null, manualCheckedById: null, manualCheckedAt: null, fallbackApplied: false, fallbackReason: null, scoringInput: { ...data }, scoringOutput: null, attempts: [] }],
      }, now);
      ktEvaluate(tx);
      KYT_TRANSACTIONS.unshift(tx);
      window.location.hash = `#/security-aml-checks/${tx.id}`;
      return null;
    },
  });
  // Поля данных перестраиваются под схему выбранной конфигурации при смене конфигурации.
  const sel = document.getElementById("kt-cfg");
  if (sel) sel.addEventListener("change", () => { document.getElementById("kt-data-fields").innerHTML = ktDataFieldsHtml(ktConfigById(sel.value)); });
}

// ==== AML-проверки: страница ===========================================================================
function ktStepCard(tx, s) {
  const f = kt("fields");
  const d = kt("checks.detail");
  const manual = s.manualCheckedById
    ? `${detailField(f.manualChecked, `${pdEscape(s.manualCheckedById)} · ${s.manualCheckedAt}`)}${detailField(f.manualComment, s.manualComment ? pdEscape(s.manualComment) : "—")}`
    : "";
  const fields = `<div class="profile-fields profile-fields-grid">
    ${detailField(f.stepProvider, `<span class="vb-mono">${pdEscape(s.providerName)}</span>`)}${detailField(f.status, ktStatusBadge(s.status))}${detailField(f.score, s.score === null ? "—" : s.score)}${detailField(f.riskClass, ktRiskBadge(s.riskClass))}
    ${detailField(f.providerTx, s.providerTransactionId ? `<span class="vb-mono">${pdEscape(s.providerTransactionId)}</span>` : "—")}
    ${detailField(f.manualRequired, s.manualCheckRequired ? vt("common.yes") : vt("common.no"))}${detailField(f.manualTrigger, s.manualTrigger ? kt(`enums.trigger.${s.manualTrigger}`) : "—")}${manual}
    ${s.errorMessage ? detailField(f.error, pdEscape(s.errorMessage)) : ""}</div>`;
  const fallback = s.fallbackApplied ? `<div class="vf-banner">${d.fallbackApplied(pdEscape(s.providerName), pdEscape(s.fallbackReason || ""))}</div>` : "";
  const attempts = vbMiniTable(
    [f.attemptNo, f.stepProvider, f.fallback, f.status, f.error, f.duration],
    s.attempts.map((a) => [a.attemptNo, `<span class="vb-mono">${pdEscape(a.providerName)}</span>`, a.isFallback ? vt("common.yes") : vt("common.no"), `<span class="badge ${a.status === "SUCCESS" ? "badge-success" : "badge-danger"}">${kt(`enums.attempt.${a.status}`)}</span>`, a.errorMessage ? slTrunc(`${a.errorCode || ""} ${a.errorMessage}`, true) : "—", `${a.durationMs} ${d.ms}`]),
    d.noAttempts
  );
  return sectionCard(
    `${d.step} ${s.order} · ${pdEscape(s.stepConfigStep)}`,
    `${fallback}${fields}<div class="vf-cfg-title">${d.attempts}</div>${attempts}<div class="vf-cfg-title">${f.input}</div>${s.scoringInput ? vbJson(s.scoringInput) : "—"}<div class="vf-cfg-title">${f.output}</div>${s.scoringOutput ? vbJson(s.scoringOutput) : "—"}`
  );
}

function viewKytCheckDetail(id) {
  const x = ktTxById(id);
  if (!x) return vbNotFound();
  const f = kt("fields");
  const d = kt("checks.detail");
  const cfg = ktConfigById(x.configId);
  const step = x.steps[0];
  const actions = [];
  if (x.status === "NEED_ACTION" && step.manualCheckRequired) actions.push(`<button type="button" class="btn-primary" data-kt-action="decide">${d.decide}</button>`);
  if (x.status === "ERROR" || x.status === "PENDING") actions.push(`<button type="button" class="btn-secondary" data-kt-action="rerun">${d.rerun}</button>`);
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, x.code)}${detailField(f.config, cfg ? vbLink(`#/settings-kyt-configs/${cfg.id}`, pdEscape(ktCfgLabel(cfg))) : "—")}${detailField(f.status, ktStatusBadge(x.status))}
    ${detailField(f.totalScore, x.totalScore === null ? "—" : x.totalScore)}${x.trackerId ? copyableField(f.trackerId, x.trackerId) : detailField(f.trackerId, "—")}
    ${detailField(f.client, x.client ? vbLink(x.client.link, pdEscape(x.client.name)) : "—")}${detailField(f.created, x.createdAt)}${detailField(f.updated, x.updatedAt)}
    ${x.errorMessage ? detailField(f.error, pdEscape(x.errorMessage)) : ""}</div>`;
  const errorBlock = x.errorMessage ? `<div class="card client-block-card"><div class="detail-section-title">${d.errorTitle}</div><ul class="block-reasons-list"><li>${pdEscape(x.errorMessage)}</li></ul></div>` : "";
  return `<div id="kt-root">
    ${vbDetailHeader({ backHash: "#/security-aml-checks", title: `${d.title} ${x.code}`, badges: ktStatusBadge(x.status), subtitle: vbCodeSubtitle(x.code, [x.trackerId ? `<span class="vb-mono">${pdEscape(x.trackerId)}</span>` : d.noTracker, x.createdAt]), actions: actions.join("") })}
    ${errorBlock}
    <div class="pd-grid">
      <div class="pd-col">${sectionCard(d.general, main)}${x.steps.map((s) => ktStepCard(x, s)).join("")}</div>
      <div class="pd-col">${sectionCard(d.data, vbJson(x.data))}${sectionCard(d.result, vbJson(x.scoringResult), "is-collapsed")}</div>
    </div>
  </div>`;
}

function initKytCheckDetail(id) {
  const x = ktTxById(id);
  const root = document.getElementById("kt-root");
  if (!x || !root) return;
  vbAttachCommon(root);
  root.querySelectorAll("[data-kt-action]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.ktAction === "decide") ktOpenDecision(x);
    if (b.dataset.ktAction === "rerun") {
      const d = kt("checks.detail");
      vbConfirm({ title: d.rerunTitle, text: d.rerunText, confirmLabel: d.rerun, danger: false, onConfirm: () => { ktEvaluate(x); render(); } });
    }
  }));
}

function ktOpenDecision(x) {
  const m = kt("checks.decision");
  const step = x.steps[0];
  const risks = KYT_RISK_CLASSES.map((v) => ({ value: v, label: kt(`enums.risk.${v}`) }));
  vbOpenForm({
    title: m.title,
    width: 560,
    intro: m.intro(pdEscape(step.scoringOutput ? String(step.score) : "—")),
    fieldsHtml: `${vbSelect("kt-dec", m.decision, [{ value: "MANUAL_SUCCESS", label: m.approve }, { value: "MANUAL_FAILED", label: m.reject }], "MANUAL_SUCCESS")}
      ${vbSelect("kt-risk", m.riskClass, risks, step.riskClass || "SUSPICIOUS")}
      ${vbTextarea("kt-comment", `${m.comment}<span class="req-star">*</span>`, "", 3)}`,
    submitLabel: m.submit,
    onSubmit: (el) => {
      const status = el.querySelector("#kt-dec").value;
      const riskClass = el.querySelector("#kt-risk").value;
      const comment = el.querySelector("#kt-comment").value.trim();
      if (!comment) return m.errComment;
      vbConfirm({
        title: m.confirmTitle,
        text: status === "MANUAL_SUCCESS" ? m.confirmApprove : m.confirmReject,
        confirmLabel: status === "MANUAL_SUCCESS" ? m.approve : m.reject,
        danger: status === "MANUAL_FAILED",
        onConfirm: () => {
          const now = pdNow();
          Object.assign(step, { status, riskClass, manualCheckRequired: false, manualComment: comment, manualCheckedById: CURRENT_ADMIN.email, manualCheckedAt: formatDateTime(now) });
          x.status = status === "MANUAL_SUCCESS" ? "APPROVED" : "REJECTED";
          x.scoringResult = { ...x.scoringResult, coinkyt: { ...(x.scoringResult.coinkyt || {}), stepStatus: status, riskClass } };
          x.updatedDate = now;
          x.updatedAt = formatDateTime(now);
          render();
        },
      });
      return null;
    },
  });
}

// ==== Точки входа для маршрутизации ==============================================================================
function viewKytConfigs() {
  return `<div class="list-hero">${pageHeader(kt("titles.configs"), t("navDescriptions.settings-kyt-configs"), `${sectionHintBtn("kt-cfg-hint-btn", kt("info.configs"))}<button type="button" class="btn-primary" id="kt-cfg-create">+ ${kt("configs.create")}</button>`)}</div>${ktConfigsList.view()}`;
}
function initKytConfigs() {
  ktConfigsList.init();
  const b = document.getElementById("kt-cfg-create");
  if (b) b.addEventListener("click", () => ktOpenConfigForm(null));
}
// "Проверки" / "Исключения" — одна страница, две вкладки (право доступа в bb2 объединяет их в один раздел AML,
// см. комментарий в security-kyt.mock.js); вкладка не сбрасывается на "Проверки" при каждом заходе, тем же
// приёмом, что и history-вкладки EOD.
let ktChecksTab = "checks"; // "checks"|"exceptions"

function ktChecksTabsBarHtml() {
  const c = kt("exceptions.tabs");
  const info = ktChecksTab === "exceptions"
    ? `<button type="button" class="client-detail-actions-btn acm-info-btn" style="margin-left:auto" title="${escapeAttr(kt("exceptions.note"))}" aria-label="${escapeAttr(c.exceptions)}">${ACM_INFO_ICON}</button>`
    : "";
  return `<div class="cd-subtabs">
    <button type="button" class="cd-subtab${ktChecksTab === "checks" ? " is-active" : ""}" data-kt-checks-tab="checks"><span>${c.checks}</span></button>
    <button type="button" class="cd-subtab${ktChecksTab === "exceptions" ? " is-active" : ""}" data-kt-checks-tab="exceptions"><span>${c.exceptions}</span></button>
    ${info}
  </div>`;
}

function ktChecksTabContentHtml() {
  return ktChecksTab === "checks" ? ktChecksList.view() : ktExceptionsList.view();
}

// Экспорт и "Создать" — в шапке (список.hero), как и на остальных страницах со списками (см. accounts.js,
// security-audit-logs.js): не внутри тулбара самого списка. Меняются вместе со вкладкой.
function ktChecksHeroActionsHtml() {
  return ktChecksTab === "checks"
    ? `${exportMenuHtml("kt-chk-export", kt("checks.export.button"), kt("checks.export.hint"))}<button type="button" class="btn-primary" id="kt-chk-create">+ ${kt("checks.create")}</button>`
    : `${exportMenuHtml("kt-exc-export", ke("export.button"), ke("export.hint"))}<button type="button" class="btn-primary" id="kt-exc-create">+ ${ke("create")}</button>`;
}

function bindKtChecksHeroActions() {
  if (ktChecksTab === "checks") {
    const b = document.getElementById("kt-chk-create");
    if (b) b.addEventListener("click", ktOpenCheckForm);
    bindExportMenu("kt-chk-export", (format) => ktOpenChecksExportModal(format));
  } else {
    const b = document.getElementById("kt-exc-create");
    if (b) b.addEventListener("click", ktOpenExceptionForm);
    bindExportMenu("kt-exc-export", (format) => ktOpenExceptionsExportModal(format));
  }
}

function viewKytChecks() {
  return `<div class="list-hero">${pageHeader(kt("titles.checks"), t("navDescriptions.security-aml-checks"), `${sectionHintBtn("kt-checks-hint-btn", kt("info.checks"))}<span id="kt-checks-hero-actions" style="display:contents">${ktChecksHeroActionsHtml()}</span>`)}</div>
    <div class="cd-tabs-wrap" id="kt-checks-tabs">${ktChecksTabsBarHtml()}</div>
    <div id="kt-checks-content">${ktChecksTabContentHtml()}</div>`;
}
function initKytChecks() {
  const tabsWrap = document.getElementById("kt-checks-tabs");
  const content = document.getElementById("kt-checks-content");
  const heroActions = document.getElementById("kt-checks-hero-actions");
  if (!tabsWrap || !content) return;
  const bindContent = () => (ktChecksTab === "checks" ? ktChecksList : ktExceptionsList).init();
  const bindTabs = () =>
    tabsWrap.querySelectorAll("[data-kt-checks-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        ktChecksTab = b.dataset.ktChecksTab;
        tabsWrap.innerHTML = ktChecksTabsBarHtml();
        content.innerHTML = ktChecksTabContentHtml();
        if (heroActions) heroActions.innerHTML = ktChecksHeroActionsHtml();
        bindTabs();
        bindContent();
        bindKtChecksHeroActions();
      })
    );
  bindTabs();
  bindContent();
  bindKtChecksHeroActions();
}
function viewKytDetail(ref) {
  if (!ref) return vbNotFound();
  return ref.kind === "config" ? viewKytConfigDetail(ref.id) : viewKytCheckDetail(ref.id);
}
function initKytDetail(ref) {
  if (!ref) return;
  if (ref.kind === "config") initKytConfigDetail(ref.id);
  else initKytCheckDetail(ref.id);
}
function ktEntityTitle(ref) {
  if (!ref) return vt("common.notFoundTitle");
  if (ref.kind === "config") { const c = ktConfigById(ref.id); return c ? ktCfgLabel(c) : vt("common.notFoundTitle"); }
  const x = ktTxById(ref.id);
  return x ? x.code : vt("common.notFoundTitle");
}
