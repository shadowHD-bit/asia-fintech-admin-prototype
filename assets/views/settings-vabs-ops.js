/* ==========================================================================
   "Настройки системы → vABS": операции и провайдеры + маршрутизация разделов.
   Общие хелперы, сети, валюты и справочники — в settings-vabs.js.
   Спецификация: docs/settings-vabs-spec.md; данные — mock/settings-vabs.mock.js.
   ========================================================================== */

const VB_OP_STATUSES = ["NEW", "PROCESSING", "COMPLETED", "PARTIAL_DECLINED", "DECLINED", "ERROR"];

function vbAccountLink(accountId) {
  const acc = accFind("all", accountId);
  if (!acc) return `<span class="vb-mono">${pdShort(accountId)}</span>`;
  return `<div class="identity-cell"><button type="button" class="table-link" data-acc-hash="${accHref(acc)}">${pdEscape(accTitle(acc))}</button>${vbCodeCell(acc.code)}</div>`;
}

// ---- Операции: список --------------------------------------------------------------------------------------
function vbOperationClientOptions() {
  const map = new Map();
  VB_OPERATIONS.forEach((op) => op.clientRefs.forEach((c) => map.set(c.id, c.name)));
  return [...map].map(([value, label]) => ({ value, label }));
}

const vbOperationsList = createAccessList({
  key: "vb-op",
  data: () => VB_OPERATIONS,
  searchPlaceholder: () => vt("operations.search"),
  searchText: (op) =>
    [op.code, op.name, op.description, op.externalOperationId, ...op.virtualLegs.flatMap((l) => [l.code, l.accountId]), ...op.realLegs.flatMap((l) => [l.code, l.accountId, l.providerTxId])]
      .filter(Boolean)
      .join(" "),
  tab: { get: (r) => r.status, values: VB_OP_STATUSES, label: (v) => accEnum("opStatus", v) },
  filters: [
    { id: "created", kind: "date", label: () => vt("filters.created"), get: (r) => r.createdDate },
    { id: "client", kind: "multi", label: () => vt("filters.client"), get: (r) => r.clientRefs.map((c) => c.id), options: vbOperationClientOptions },
    { id: "provider", kind: "multi", label: () => vt("filters.provider"), get: (r) => r.providerRefs.map((p) => p.id), options: () => VB_PROVIDERS.map((p) => ({ value: p.id, label: p.name })) },
    { id: "name", kind: "multi", label: () => vt("filters.operationName"), get: (r) => r.name, options: () => [...new Set(VB_OPERATIONS.map((o) => o.name))].sort().map((n) => ({ value: n, label: n })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = vt("operations.metrics");
    return [
      { value: list.length, label: m.total },
      { value: new Set(list.flatMap((o) => o.clientRefs.map((c) => c.id))).size, label: m.clients },
      { value: new Set(list.flatMap((o) => o.providerRefs.map((p) => p.id))).size, label: m.providers },
      { value: list.filter((o) => o.externalOperationId).length, label: m.external },
    ];
  },
  columns: [
    { label: () => vbOpNameIdHeader(), html: (o) => vbOpNameIdCell(o, "data-vb-hash") },
    { label: () => vt("columns.description"), html: (o) => (o.description ? pdEscape(o.description) : "—") },
    { label: () => vt("columns.status"), html: (o) => vbOpStatusBadge(o.status) },
    { label: () => vt("columns.externalId"), html: (o) => o.externalOperationId || "—" },
    { label: () => vt("columns.created"), sort: "created", html: (o) => dateTimeCell(o.createdAt) },
  ],
  headerAction: () => vbBarActions(""),
  attachHeaderAction: () => vbAttachBar("operations", null, null),
  attachRows: vbAttachRows,
});

// ---- Операции: страница ----------------------------------------------------------------------------------
let vbOpTab = "virtual";

function vbBalanceCheck(legs) {
  const d = vt("operations.detail");
  const by = {};
  legs.forEach((l) => {
    by[l.currency] = by[l.currency] || { DEBIT: 0, CREDIT: 0 };
    by[l.currency][l.transferType] += l.amount;
  });
  const rows = Object.entries(by).map(([cur, v]) => {
    const ok = Math.abs(v.DEBIT - v.CREDIT) < 0.005;
    return `<div class="vb-check"><span>${cur}: ${accEnum("transferType", "DEBIT")} ${formatPaymentAmount(v.DEBIT)} · ${accEnum("transferType", "CREDIT")} ${formatPaymentAmount(v.CREDIT)}</span><span class="badge ${ok ? "badge-success" : "badge-danger"}">${ok ? d.balanced : d.unbalanced}</span></div>`;
  });
  return rows.length ? `<div class="vb-check-wrap"><div class="vb-check-title">${d.balanceCheck}</div>${rows.join("")}</div>` : "";
}

// Название операции и ID — одним блоком: сверху название (ссылка на операцию), ниже ID с копированием.
// hashAttr — атрибут перехода, который слушает конкретный список (data-vb-hash / data-acc-hash).
function vbOpNameIdHeader() {
  return `${vt("columns.name")} / ${vt("columns.id")}`;
}

function vbOpNameIdCell(o, hashAttr) {
  return `<div class="identity-cell"><div class="identity-cell-primary"><button type="button" class="table-link" ${hashAttr}="#/settings-vabs-operations/${o.id}">${pdEscape(o.name)}</button></div><div class="identity-cell-sub"><span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>${vbCodeCell(o.code)}</div></div>`;
}

function vbLegsTable(op, opts) {
  const c = vt("operations.detail.columns");
  const legs = vbOpTab === "virtual" ? op.virtualLegs : op.realLegs;
  const rows = legs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((l) => {
      const inc = accIsIncrease(accFind("all", l.accountId) || { ledgerType: "ACTIVE" }, l);
      return [
        // ID транзакции, под ним (если есть) ID от провайдера с пометкой и копированием
        `<div class="identity-cell"><div class="identity-cell-primary">${vbLink(`#/settings-vabs-operations/${op.id}`, l.code)}${copyIconButton(l.code)}</div>${
          l.providerTxId
            ? `<div class="identity-cell-sub"><span class="identity-cell-tag">${c.providerTx}</span><button type="button" class="id-copy" data-copy-value="${escapeAttr(l.providerTxId)}" title="${t("clientsUsers.copy")}"><span class="id-copy-label">${pdEscape(l.providerTxId)}</span>${COPY_ICON_SVG}</button></div>`
            : ""
        }</div>`,
        accCurrencyBadge(l.currency), // валюта и сеть вместе: у крипто "USDT · TRON", у фиата только код
        vbAccountLink(l.accountId),
        `<span class="badge badge-neutral">${accEnum("transferType", l.transferType)}</span>`,
        `<span class="acc-amount ${inc ? "acc-in" : "acc-out"}">${formatPaymentAmount(l.amount)}</span>`,
        accTxStatusBadge(l.status),
        l.description ? pdEscape(l.description) : "—",
      ];
    });
  const headers = [c.id, c.ticker, c.account, c.side, c.amount, c.status, c.description];
  const check = opts && opts.hideBalanceCheck ? "" : vbBalanceCheck(legs);
  return `${vbMiniTable(headers, rows, vt("operations.detail.noLegs"))}${check}`;
}

function vbOpTabsBar(op) {
  const d = vt("operations.detail.tabs");
  return `<div class="cd-subtabs">${["virtual", "real"]
    .map((k) => `<button type="button" class="cd-subtab${vbOpTab === k ? " is-active" : ""}" data-vb-tab="${k}"><span>${d[k]}</span><span class="quick-tab-count">${(k === "virtual" ? op.virtualLegs : op.realLegs).length}</span></button>`)
    .join("")}</div>`;
}

function viewOperationDetail(id) {
  const op = vbOperationById(id);
  if (!op) return vbNotFound();
  if (!vbTakeKeep()) vbOpTab = "virtual";
  const f = vt("fields");
  const d = vt("operations.detail");
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, op.code)}${detailField(f.name, pdEscape(op.name))}${detailField(f.status, `${vbOpStatusBadge(op.status)}`)}
    ${detailField(f.description, op.description ? pdEscape(op.description) : "—")}${op.externalOperationId ? copyableField(f.externalId, op.externalOperationId) : detailField(f.externalId, "—")}
    ${detailField(f.created, op.createdAt)}${detailField(f.updated, op.updatedAt)}</div>
    <p class="table-cell-muted vb-note">${d.statusNote}</p>`;
  const people = `<div class="profile-fields">
    ${detailField(f.clients, op.clientRefs.length ? op.clientRefs.map((c) => (c.link ? vbLink(c.link, pdEscape(c.name)) : pdEscape(c.name))).join("<br>") : "—")}
    ${detailField(f.providers, op.providerRefs.length ? op.providerRefs.map((p) => vbLink(`#/settings-vabs-providers/${p.id}`, pdEscape(p.name))).join("<br>") : "—")}</div>`;
  const errors = op.errorMessages.length
    ? `<div class="card client-block-card"><div class="detail-section-title">${d.errors}</div><ul class="block-reasons-list">${op.errorMessages.map((e) => `<li>${pdEscape(`${e.code} · ${e.title}${e.message ? ` — ${e.message}` : ""}`)}</li>`).join("")}</ul></div>`
    : "";
  const actions = vbHeaderActions(`<button type="button" class="btn-primary" data-vb-action="edit">${vt("common.edit")}</button>`);
  return `<div id="vb-root">
    ${vbDetailHeader({ backHash: "#/settings-vabs-operations", title: `${d.titlePrefix} — ${pdEscape(op.name)}`, badges: vbOpStatusBadge(op.status), subtitle: vbCodeSubtitle(op.code, [op.createdAt]), actions })}
    ${errors}
    <div class="pd-grid">
      <div class="pd-col">${sectionCard(vt("sections.main"), main)}</div>
      <div class="pd-col">${sectionCard(d.participants, people)}${sectionCard(vt("sections.service"), vbJson({ metadata: op.metadata, references: op.references }), "is-collapsed")}</div>
    </div>
    <div class="cd-tabs-wrap" id="vb-op-tabs">${vbOpTabsBar(op)}</div>
    <div id="vb-op-legs" class="card vb-legs">${vbLegsTable(op)}</div>
  </div>`;
}

function vbBindLegs(op) {
  const root = document.getElementById("vb-op-legs");
  vbAttachCommon(root);
  const all = [...op.virtualLegs, ...op.realLegs];
  root.querySelectorAll("[data-vb-raw]").forEach((b) =>
    b.addEventListener("click", () => {
      const leg = all.find((l) => l.id === b.dataset.vbRaw);
      openModal({ title: vt("operations.detail.rawTitle"), width: 560, bodyHtml: `<pre class="pd-json">${pdEscape(leg.rawTxData)}</pre>`, footerHtml: `<button type="button" class="btn-secondary" id="vb-cancel">${vt("common.close")}</button>`, onMount: (el) => el.querySelector("#vb-cancel").addEventListener("click", closeModal) });
    })
  );
}

function initOperationDetail(id) {
  const op = vbOperationById(id);
  const root = document.getElementById("vb-root");
  if (!op || !root) return;
  vbAttachCommon(root);
  vbBindLegs(op);
  const bindTabs = () =>
    document.querySelectorAll("[data-vb-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        vbOpTab = b.dataset.vbTab;
        document.getElementById("vb-op-tabs").innerHTML = vbOpTabsBar(op);
        document.getElementById("vb-op-legs").innerHTML = vbLegsTable(op);
        bindTabs();
        vbBindLegs(op);
      })
    );
  bindTabs();
  root.querySelector('[data-vb-action="edit"]').addEventListener("click", () => vbOpenOperationForm(op));
}

function vbOpenOperationForm(op) {
  const m = vt("operations.form");
  vbOpenForm({
    title: m.title,
    width: 520,
    intro: m.intro,
    fieldsHtml: `${vbInput("vb-desc", vt("fields.description"), op.description || "")}${vbInput("vb-ext", vt("fields.externalId"), op.externalOperationId || "")}${vbTextarea("vb-meta", vt("fields.metadata"), op.metadata ? JSON.stringify(op.metadata, null, 2) : "", 6)}`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const parsed = vbParseJson(el.querySelector("#vb-meta").value, true);
      if (!parsed.ok) return vt("common.errJson");
      if (parsed.value !== null && (typeof parsed.value !== "object" || Array.isArray(parsed.value))) return vt("common.errJsonObject");
      closeModal();
      op.description = el.querySelector("#vb-desc").value.trim() || null;
      op.externalOperationId = el.querySelector("#vb-ext").value.trim() || null;
      op.metadata = parsed.value;
      acTouch(op);
      vbRerender();
      return null;
    },
  });
}

function vbOpenLegEditor(op, leg) {
  const m = vt("operations.legForm");
  const allowed = VB_TX_TRANSITIONS[leg.status] || [];
  const options = [leg.status, ...allowed].map((s) => ({ value: s, label: accEnum("txStatus", s) }));
  vbOpenForm({
    title: m.title,
    width: 520,
    intro: allowed.length ? m.intro : m.finalNote,
    fieldsHtml: `${vbSelect("vb-status", vt("fields.status"), options, leg.status, allowed.length ? "" : "disabled")}
      ${vbInput("vb-desc", vt("fields.description"), leg.description || "")}
      ${vbInput("vb-ptx", vt("operations.detail.columns.providerTx"), leg.providerTxId || "")}
      ${vbTextarea("vb-raw", vt("operations.detail.columns.rawData"), leg.rawTxData || "", 4)}`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const next = el.querySelector("#vb-status").value;
      const apply = () => {
        if (next !== leg.status) { leg.previousStatus = leg.status; leg.status = next; }
        leg.description = el.querySelector("#vb-desc").value.trim() || null;
        leg.providerTxId = el.querySelector("#vb-ptx").value.trim() || null;
        leg.rawTxData = el.querySelector("#vb-raw").value.trim() || null;
        vbRecalcOperation(op);
        acTouch(op);
        vbRerender();
      };
      if (next === "CONFIRMED" && leg.status !== "CONFIRMED") {
        const values = { desc: el.querySelector("#vb-desc").value, ptx: el.querySelector("#vb-ptx").value, raw: el.querySelector("#vb-raw").value };
        vbConfirm({
          title: m.confirmTitle,
          text: m.confirmText,
          confirmLabel: m.confirmLabel,
          danger: false,
          onConfirm: () => {
            leg.previousStatus = leg.status;
            leg.status = "CONFIRMED";
            leg.description = values.desc.trim() || null;
            leg.providerTxId = values.ptx.trim() || null;
            leg.rawTxData = values.raw.trim() || null;
            vbRecalcOperation(op);
            acTouch(op);
            vbRerender();
          },
        });
        return null;
      }
      closeModal();
      apply();
      return null;
    },
  });
}

// ---- Провайдеры: список --------------------------------------------------------------------------------------
const vbProvidersList = createAccessList({
  key: "vb-prov",
  data: () => VB_PROVIDERS,
  searchPlaceholder: () => vt("providers.search"),
  searchText: (p) => [p.id, p.name, p.description].filter(Boolean).join(" "),
  tab: { get: (r) => r.status, values: ["ACTIVE", "DISABLED"], label: (v) => vbEnum("entityStatus", v) },
  filters: [
    { id: "type", kind: "multi", label: () => vt("filters.type"), get: (r) => r.type, options: () => ["ACCOUNT", "EXCHANGE"].map((v) => ({ value: v, label: vbEnum("providerType", v) })) },
    { id: "category", kind: "multi", label: () => vt("filters.category"), get: (r) => r.category, options: () => [...new Set(VB_PROVIDERS.map((p) => p.category))].map((v) => ({ value: v, label: v })) },
    { id: "project", kind: "multi", label: () => vt("filters.project"), get: (r) => r.project.name, options: () => [...new Set(VB_PROVIDERS.map((p) => p.project.name))].map((v) => ({ value: v, label: v })) },
    { id: "created", kind: "date", label: () => vt("filters.created"), get: (r) => r.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name), created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = vt("providers.metrics");
    return [
      { value: list.filter((p) => p.type === "ACCOUNT").length, label: m.account },
      { value: list.filter((p) => p.type === "EXCHANGE").length, label: m.exchange },
      { value: new Set(list.map((p) => p.project.name)).size, label: m.projects },
    ];
  },
  columns: [
    { label: () => vt("columns.name"), sort: "name", html: (p) => `<div class="identity-cell">${vbLink(`#/settings-vabs-providers/${p.id}`, pdEscape(p.name))}${vbCodeCell(p.code)}</div>` },
    { label: () => vt("columns.type"), html: (p) => vbTypeBadge(p.type) },
    { label: () => vt("columns.category"), html: (p) => p.category },
    { label: () => vt("columns.project"), html: (p) => pdEscape(p.project.name) },
    { label: () => vt("columns.status"), html: (p) => vbStatusBadge(p.status) },
    { label: () => vt("columns.realAccounts"), html: (p) => vbRealAccountsOfProvider(p.id).length },
    { label: () => vt("columns.created"), sort: "created", html: (p) => dateTimeCell(p.createdAt) },
    { label: () => vt("columns.updated"), html: (p) => dateTimeCell(p.updatedAt) },
  ],
  headerAction: () => vbBarActions(""),
  attachHeaderAction: () => vbAttachBar("providers", null, null),
  attachRows: vbAttachRows,
});

// ---- Провайдеры: страница ----------------------------------------------------------------------------------
const VB_PROVIDER_TABS = ["overview", "config", "accounts", "mappings", "operations"];
let vbProvTab = "overview";

function vbConfigValue(key, value) {
  if (Array.isArray(value)) {
    if (/CurrencyIds$/.test(key)) {
      return `<div class="ac-badges">${value.map((id) => { const c = vbCurrencyById(id); return c ? `<button type="button" class="badge badge-neutral vb-badge-link" data-vb-hash="#/settings-vabs-currencies/${c.id}">${pdEscape(c.ticker)}</button>` : `<span class="badge badge-neutral">${pdShort(id)}</span>`; }).join("")}</div>`;
    }
    return `<div class="ac-badges">${value.map((v) => `<span class="badge badge-neutral">${pdEscape(v)}</span>`).join("")}</div>`;
  }
  if (typeof value === "string" && (/AccountId$/.test(key) || key === "virtualAccountId")) {
    const acc = accFind("all", value);
    if (acc) return `<button type="button" class="table-link" data-acc-hash="${accHref(acc)}">${pdEscape(accTitle(acc))}</button> <span class="table-cell-muted vb-mono">${acc.code}</span>`;
  }
  if (typeof value === "string" && /^[0-9a-f-]{36}$/.test(value)) return `<span class="inline-copy vb-mono">${pdShort(value)}${copyIconButton(value)}</span>`;
  return pdEscape(String(value));
}

function vbProviderTabsBar() {
  const d = vt("providers.detail.tabs");
  return `<div class="cd-subtabs">${VB_PROVIDER_TABS.map((k) => `<button type="button" class="cd-subtab${vbProvTab === k ? " is-active" : ""}" data-vb-tab="${k}"><span>${d[k]}</span></button>`).join("")}</div>`;
}

function vbProviderTabBody(p) {
  const f = vt("fields");
  const d = vt("providers.detail");
  if (vbProvTab === "config") {
    const keys = vt("providers.configKeys");
    const rows = Object.entries(p.providerConfig.config).map(([k, v]) => [`<div class="identity-cell"><span>${keys[k] || k}</span><span class="table-cell-muted vb-mono">${k}</span></div>`, vbConfigValue(k, v)]);
    const head = `<div class="vb-config-head"><span class="table-cell-muted">${d.configNote}</span><button type="button" class="btn-secondary" data-vb-action="editConfig">${d.editConfig}</button></div>`;
    return sectionCard(d.tabs.config, head + vbMiniTable([d.configKey, d.configValue], rows, d.noConfig));
  }
  if (vbProvTab === "accounts") {
    const list = vbRealAccountsOfProvider(p.id);
    return sectionCard(`${d.tabs.accounts} · ${list.length}`, list.length ? accLinkedTable(list) : `<div class="table-cell-muted">${d.noAccounts}</div>`);
  }
  if (vbProvTab === "mappings") {
    const list = VB_CURRENCY_MAPPINGS.filter((x) => x.providerId === p.id);
    const rows = list.map((x) => {
      const ours = vbCurrencyById(x.currencyId);
      const theirs = vbCurrencyById(x.providerCurrencyId);
      return [vbLink(`#/settings-vabs-currencies/${ours.id}`, pdEscape(ours.ticker)), vbLink(`#/settings-vabs-currencies/${theirs.id}`, pdEscape(theirs.ticker)), x.decimals, x.description ? pdEscape(x.description) : "—", `<button type="button" class="btn-secondary vb-row-btn" data-vb-map="${x.id}" title="${vt("common.edit")}">${EDIT_ICON_SVG}</button>`];
    });
    return sectionCard(`${d.tabs.mappings} · ${list.length}`, vbMiniTable([d.ours, d.theirs, f.decimals, f.description, ""], rows, d.noMappings));
  }
  if (vbProvTab === "operations") {
    const ops = VB_OPERATIONS.filter((o) => o.providerRefs.some((x) => x.id === p.id));
    const rows = ops.slice(0, 10).map((o) => [vbLink(`#/settings-vabs-operations/${o.id}`, o.code), pdEscape(o.name), vbOpStatusBadge(o.status), o.createdAt]);
    return sectionCard(
      `${d.tabs.operations} · ${ops.length}`,
      `${vbMiniTable([vt("columns.id"), vt("columns.name"), vt("columns.status"), vt("columns.created")], rows, d.noOperations)}${ops.length ? `<p class="table-cell-muted vb-note">${d.opsNote(Math.min(10, ops.length), ops.length)} ${vbLink("#/settings-vabs-operations", d.openOperations)}</p>` : ""}`
    );
  }
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, p.code)}${detailField(f.name, pdEscape(p.name))}${detailField(f.type, vbTypeBadge(p.type))}${detailField(f.category, p.category)}
    ${detailField(f.project, pdEscape(p.project.name))}${detailField(f.status, vbStatusBadge(p.status))}${detailField(f.description, p.description ? pdEscape(p.description) : "—")}
    ${detailField(f.created, p.createdAt)}${detailField(f.updated, p.updatedAt)}</div>`;
  return `<div class="pd-grid"><div class="pd-col">${sectionCard(vt("sections.main"), main)}</div>
    <div class="pd-col">${sectionCard(f.conditions, p.conditions ? vbJson(p.conditions) : `<div class="table-cell-muted">—</div>`)}${sectionCard(vt("sections.service"), vbJson({ metadata: p.metadata, references: p.references }), "is-collapsed")}</div></div>`;
}

function viewProviderDetail(id) {
  const p = vbProviderById(id);
  if (!p) return vbNotFound();
  if (!vbTakeKeep()) vbProvTab = "overview";
  const active = p.status === "ACTIVE";
  const actions = vbHeaderActions(`<button type="button" class="btn-primary" data-vb-action="edit">${vt("common.edit")}</button>`, [active ? vbActionItem("disable", vt("common.disable"), ICONS.lock, true) : vbActionItem("enable", vt("common.enable"), CHECK_ICON_SVG)]);
  return `<div id="vb-root">
    ${vbDetailHeader({ backHash: "#/settings-vabs-providers", title: pdEscape(p.name), badges: `${vbStatusBadge(p.status)}${vbTypeBadge(p.type)}`, subtitle: vbCodeSubtitle(p.code, [pdEscape(p.project.name), p.createdAt]), actions })}
    <div class="cd-tabs-wrap" id="vb-prov-tabs">${vbProviderTabsBar()}</div>
    <div id="vb-prov-content">${vbProviderTabBody(p)}</div>
  </div>`;
}

function initProviderDetail(id) {
  const p = vbProviderById(id);
  const root = document.getElementById("vb-root");
  if (!p || !root) return;
  const bindContent = () => {
    const content = document.getElementById("vb-prov-content");
    vbAttachCommon(content);
    const cfg = content.querySelector('[data-vb-action="editConfig"]');
    if (cfg) cfg.addEventListener("click", () => vbOpenConfigForm(p));
    content.querySelectorAll("[data-vb-map]").forEach((b) => b.addEventListener("click", () => vbOpenMappingForm(VB_CURRENCY_MAPPINGS.find((x) => x.id === b.dataset.vbMap))));
  };
  const bindTabs = () =>
    document.querySelectorAll("[data-vb-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        vbProvTab = b.dataset.vbTab;
        document.getElementById("vb-prov-tabs").innerHTML = vbProviderTabsBar();
        document.getElementById("vb-prov-content").innerHTML = vbProviderTabBody(p);
        bindTabs();
        bindContent();
      })
    );
  vbAttachCommon(root);
  bindTabs();
  bindContent();
  const m = vt("providers.form");
  root.querySelectorAll(".pd-header-tools [data-vb-action]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.vbAction;
      if (act === "edit") vbOpenProviderForm(p);
      if (act === "disable") vbToggleStatus(p, "DISABLED", { title: m.disableTitle, text: m.disableText(pdEscape(p.name)), confirm: vt("common.disable") });
      if (act === "enable") vbToggleStatus(p, "ACTIVE", { title: m.enableTitle, text: m.enableText(pdEscape(p.name)), confirm: vt("common.enable") });
    })
  );
}

function vbOpenProviderForm(p) {
  const m = vt("providers.form");
  vbOpenForm({
    title: m.editTitle,
    width: 520,
    fieldsHtml: `${vbInput("vb-desc", vt("fields.description"), p.description || "")}${vbInput("vb-cat", vt("fields.category"), p.category)}${vbTextarea("vb-cond", vt("fields.conditions"), p.conditions ? JSON.stringify(p.conditions, null, 2) : "", 4)}`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const category = el.querySelector("#vb-cat").value.trim();
      const parsed = vbParseJson(el.querySelector("#vb-cond").value, true);
      if (!category) return m.errCategory;
      if (!parsed.ok) return vt("common.errJson");
      if (parsed.value !== null && (typeof parsed.value !== "object" || Array.isArray(parsed.value))) return vt("common.errJsonObject");
      closeModal();
      p.description = el.querySelector("#vb-desc").value.trim() || null;
      p.category = category;
      p.conditions = parsed.value;
      acTouch(p);
      vbRerender();
      return null;
    },
  });
}

function vbOpenConfigForm(p) {
  const m = vt("providers.configForm");
  vbOpenForm({
    title: m.title,
    width: 620,
    intro: m.intro,
    fieldsHtml: vbTextarea("vb-config", vt("fields.config"), JSON.stringify(p.providerConfig.config, null, 2), 14),
    submitLabel: vt("common.save"),
    danger: true,
    onSubmit: (el) => {
      const parsed = vbParseJson(el.querySelector("#vb-config").value, false);
      if (!parsed.ok) return vt("common.errJson");
      if (typeof parsed.value !== "object" || Array.isArray(parsed.value) || !Object.keys(parsed.value).length) return m.errEmpty;
      closeModal();
      p.providerConfig.config = parsed.value;
      acTouch(p.providerConfig);
      acTouch(p);
      vbRerender();
      return null;
    },
  });
}

function vbOpenMappingForm(mapping) {
  const m = vt("providers.mappingForm");
  vbOpenForm({
    title: m.title,
    fieldsHtml: `${vbInput("vb-decimals", vt("fields.decimals"), String(mapping.decimals), 'inputmode="numeric"')}${vbInput("vb-desc", vt("fields.description"), mapping.description || "")}`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const raw = el.querySelector("#vb-decimals").value.trim();
      if (!/^\d+$/.test(raw) || Number(raw) > 36) return vt("currencies.form.errDecimals");
      closeModal();
      mapping.decimals = Number(raw);
      mapping.description = el.querySelector("#vb-desc").value.trim() || null;
      acTouch(mapping);
      vbRerender();
      return null;
    },
  });
}

// ---- Маршрутизация разделов ------------------------------------------------------------------------------
function vbListOf(kind) {
  return { networks: vbNetworksList, currencies: vbCurrenciesList, enums: vbEnumsList, operations: vbOperationsList, providers: vbProvidersList }[kind];
}

function viewVabsList(kind) {
  return `<div class="list-hero">${pageHeader(vt(`titles.${kind}`), t(`navDescriptions.settings-vabs-${kind}`), sectionHintBtn(`vb-${kind}-hint-btn`, vt(`info.${kind}`)))}</div>${vbListOf(kind).view()}`;
}

// ---- Экспорт списка (CSV / XLSX): то, что показывает таблица — поиск, вкладка, фильтры и сортировка, без учёта страницы ----
const VB_EXPORT_ROWS = {
  networks: (n) => [n.name, n.code, n.description || "", vbEnum("entityStatus", n.status), vbCurrenciesOfNetwork(n.name).length, n.createdAt, n.updatedAt],
  currencies: (c) => [c.ticker, c.code, c.description || "", c.networkName, c.decimals, vbEnum("entityStatus", c.status), c.createdAt, c.updatedAt],
  enums: (e) => [e.name, vbEnumUsage(e) || "", e.values.length, e.values.join(", "), e.updatedAt],
  operations: (o) => [o.code, o.name, o.description || "", accEnum("opStatus", o.status), o.externalOperationId || "", o.createdAt],
  providers: (p) => [p.name, p.code, vbEnum("providerType", p.type), p.category, p.project.name, vbEnum("entityStatus", p.status), vbRealAccountsOfProvider(p.id).length, p.createdAt, p.updatedAt],
};

function vbOpenExportModal(kind, format) {
  const list = vbListOf(kind);
  const x = vt("export");
  const count = list.exportRows().length;
  const lines = list.filterLines();
  const tab = list.tabValue();
  if (tab) lines.unshift(`${x.status}: ${kind === "operations" ? accEnum("opStatus", tab) : vbEnum("entityStatus", tab)}`);
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle[kind],
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
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); vbExportTable(kind, format); });
    },
  });
}

function vbExportTable(kind, format) {
  const x = vt("export");
  const list = vbListOf(kind).exportRows();
  exportTable(`vabs_${kind}_${new Date().toISOString().slice(0, 10)}`, format, x.columns[kind], list.map(VB_EXPORT_ROWS[kind]));
  showToast(x.done(list.length));
}

function initVabsList(kind) {
  vbListOf(kind).init();
}

const VB_DETAIL_VIEWS = { networks: viewNetworkDetail, currencies: viewCurrencyDetail, enums: viewEnumDetail, operations: viewOperationDetail, providers: viewProviderDetail };
const VB_DETAIL_INITS = { networks: initNetworkDetail, currencies: initCurrencyDetail, enums: initEnumDetail, operations: initOperationDetail, providers: initProviderDetail };

function viewVabsDetail(ref) {
  return ref ? VB_DETAIL_VIEWS[ref.kind](ref.id) : vbNotFound();
}

function initVabsDetail(ref) {
  if (ref) VB_DETAIL_INITS[ref.kind](ref.id);
}

// Название сущности для хлебных крошек
function vbEntityTitle(ref) {
  if (!ref) return vt("common.notFoundTitle");
  const e =
    ref.kind === "networks" ? VB_NETWORKS.find((x) => x.id === ref.id) :
    ref.kind === "currencies" ? vbCurrencyById(ref.id) :
    ref.kind === "enums" ? VB_ENUMS.find((x) => x.name === ref.id) :
    ref.kind === "operations" ? vbOperationById(ref.id) :
    vbProviderById(ref.id);
  if (!e) return vt("common.notFoundTitle");
  return ref.kind === "currencies" ? e.ticker : ref.kind === "operations" ? e.code : e.name;
}


