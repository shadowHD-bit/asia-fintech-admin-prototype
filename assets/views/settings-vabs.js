/* ==========================================================================
   "Настройки системы → vABS": сети, валюты, справочники (общая часть и три
   первых раздела). Операции и провайдеры — в settings-vabs-ops.js.
   Спецификация: docs/settings-vabs-spec.md; данные — mock/settings-vabs.mock.js.
   Списки построены на заготовке createAccessList (views/settings-access.js).
   ========================================================================== */

// ---- Общие хелперы ---------------------------------------------------------------------------
function vt(path) {
  return t(`vabs.${path}`);
}

function vbEnum(group, value) {
  const dict = vt(`enums.${group}`);
  return (dict && value != null && dict[value]) || (value == null ? "" : value);
}

function vbStatusBadge(status) {
  return `<span class="badge ${status === "ACTIVE" ? "badge-success" : "badge-warning"}">${vbEnum("entityStatus", status)}</span>`;
}

function vbTypeBadge(type) {
  return `<span class="badge ${type === "ACCOUNT" ? "badge-info" : "badge-neutral"}">${vbEnum("providerType", type)}</span>`;
}

function vbOpStatusBadge(status) {
  const cls = { COMPLETED: "badge-success", PROCESSING: "badge-info", NEW: "badge-neutral", PARTIAL_DECLINED: "badge-warning", DECLINED: "badge-danger", ERROR: "badge-danger" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${accEnum("opStatus", status)}</span>`;
}

function vbLink(hash, text) {
  return `<button type="button" class="table-link" data-vb-hash="${hash}">${text}</button>`;
}

// Копируемая ID-ячейка таблицы: entity.code (mock/clients-users.mock.js: entityCode) — читаемый, сырые UUID не показываем
function vbCodeCell(code) {
  return `<button type="button" class="id-copy" data-copy-value="${code}" title="${t("clientsUsers.copy")}"><span class="id-copy-label">${code}</span>${COPY_ICON_SVG}</button>`;
}

function vbJson(value) {
  return `<pre class="pd-json">${pdEscape(JSON.stringify(value, null, 2))}</pre>`;
}

function vbMiniTable(headers, rows, emptyText) {
  if (!rows.length) return `<div class="table-cell-muted">${emptyText}</div>`;
  return `<div class="table-scroll"><table class="data-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

function vbAttachRows(wrap) {
  wrap.querySelectorAll("[data-vb-hash],[data-acc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.vbHash || b.dataset.accHash; }));
}

function vbAttachCommon(scope) {
  scope.querySelectorAll(".collapsible-card-head").forEach((btn) => btn.addEventListener("click", () => btn.closest(".collapsible-card").classList.toggle("is-collapsed")));
  scope.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => btn.addEventListener("click", () => copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn))));
  scope.querySelectorAll(".copy-target").forEach((el) => el.addEventListener("click", () => copyTextToClipboard(el.dataset.copyText).then(() => { el.classList.add("is-copied"); setTimeout(() => el.classList.remove("is-copied"), 900); })));
  scope.querySelectorAll('[data-vb-action="pdf"]').forEach((b) => b.addEventListener("click", () => vbExportCardPdf(scope)));
  vbAttachRows(scope);
}

// Действия шапки карточки: главная кнопка и меню «⋯» (переключение статуса и т.п. + выгрузка карточки в PDF)
function vbActionItem(action, label, icon, danger) {
  return { label, icon, danger, attrs: `data-vb-action="${action}"` };
}

function vbHeaderActions(primaryHtml, items = []) {
  return `${primaryHtml}${rowKebabMenu("vb-head", [...items, vbActionItem("pdf", t("headerMenu.exportCard"), DOWNLOAD_ICON_SVG)])}`;
}

// PDF карточки: всё содержимое страницы (в том числе свёрнутые секции) в печатной версии
function vbExportCardPdf(scope) {
  const body = scope.querySelector(".pd-grid, .client-detail-grid, #vb-body, #vb-prov-content");
  const titleEl = scope.querySelector(".page-title");
  if (!body || !titleEl) return;
  const name = titleEl.textContent.trim();
  const sub = scope.querySelector(".client-detail-subtitle");
  const meta = sub ? sub.textContent.replace(/\s+/g, " ").trim() : "";
  exPrintHtml(exPdfHtml(name, name, meta, body.outerHTML.replace(/is-collapsed/g, "")), name);
}

// Экспорт списка — в строке поиска и фильтров вместе с главным действием списка
function vbBarActions(primaryHtml) {
  return `<span class="filters-bar-end">${exportMenuHtml("vb-export", vt("export.button"), vt("export.hint"))}${primaryHtml || ""}</span>`;
}

function vbAttachBar(kind, primaryId, onPrimary) {
  bindExportMenu("vb-export", (format) => vbOpenExportModal(kind, format));
  const btn = primaryId ? document.getElementById(primaryId) : null;
  if (btn) btn.addEventListener("click", onPrimary);
}

const VB_BACK_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg>`;

function vbDetailHeader({ backHash, title, badges = "", subtitle = "", actions = "", avatar = "" }) {
  return `
    <div class="card client-detail-header cd-hero">
      <button type="button" class="client-detail-back" data-vb-hash="${backHash}" title="${vt("common.back")}">${VB_BACK_ICON}</button>
      ${avatar}
      <div class="client-detail-header-main">
        <div class="client-detail-title-row"><span class="page-title">${title}</span>${badges}</div>
        <div class="client-detail-subtitle">${subtitle}</div>
      </div>
      <div class="pd-header-tools">${actions}</div>
    </div>`;
}

// Подзаголовок детальной карточки: код сущности (читаемый entity.code — сырые UUID в интерфейсе не показываем) + доп. части
function vbCodeSubtitle(code, extra) {
  const parts = [`<span class="inline-copy">ID: ${code}${copyIconButton(code)}</span>`, ...extra];
  return parts.join(`<span class="client-detail-subtitle-sep">·</span>`);
}

function vbNotFound() {
  return `${pageHeader(vt("common.notFoundTitle"))}
    <div class="empty-state"><div class="empty-state-icon">${ICONS.box}</div>
    <div class="empty-state-title">${vt("common.notFoundTitle")}</div><div class="empty-state-text">${vt("common.notFoundText")}</div></div>`;
}

function vbRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^settings-vabs-(networks|currencies|enums|operations|providers)\/(.+)$/);
  return m ? { kind: m[1], id: decodeURIComponent(m[2]) } : null;
}

// Вкладка деталей сбрасывается при входе, но сохраняется после действия на странице
let vbKeepTab = false;
function vbTakeKeep() {
  const keep = vbKeepTab;
  vbKeepTab = false;
  return keep;
}
function vbRerender() {
  vbKeepTab = true;
  render();
}

// ---- Формы и модалки --------------------------------------------------------------------------
function vbInput(id, label, value = "", attrs = "") {
  return `<label class="filters-field vb-field"><span class="filters-field-label">${label}</span><input class="address-form-input" ${/\btype=/.test(attrs) ? "" : 'type="text"'} id="${id}" value="${escapeAttr(value)}" ${attrs} /></label>`;
}

function vbTextarea(id, label, value = "", rows = 3) {
  return `<label class="filters-field vb-field"><span class="filters-field-label">${label}</span><textarea class="form-textarea vb-mono" id="${id}" rows="${rows}">${pdEscape(value)}</textarea></label>`;
}

function vbSelect(id, label, options, selected, attrs = "") {
  return `<label class="filters-field vb-field"><span class="filters-field-label">${label}</span><select class="address-form-input" id="${id}" ${attrs}>${options
    .map((o) => `<option value="${escapeAttr(o.value)}"${String(o.value) === String(selected) ? " selected" : ""}>${o.label}</option>`)
    .join("")}</select></label>`;
}

// onSubmit(el) возвращает текст ошибки или null (и сам закрывает модалку при успехе)
function vbOpenForm({ title, width = 480, intro, fieldsHtml, submitLabel, danger, onSubmit }) {
  openModal({
    title,
    width,
    bodyHtml: `${intro ? `<p class="modal-confirm-text pd-modal-intro">${intro}</p>` : ""}<div class="modal-form">${fieldsHtml}</div><div class="form-error" id="vb-modal-error" hidden></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="vb-cancel">${vt("common.cancel")}</button><button type="button" class="${danger ? "btn-danger" : "btn-primary"}" id="vb-submit">${submitLabel}</button>`,
    onMount: (el) => {
      const err = el.querySelector("#vb-modal-error");
      el.querySelector("#vb-cancel").addEventListener("click", closeModal);
      el.querySelector("#vb-submit").addEventListener("click", () => {
        const message = onSubmit(el);
        if (message) { err.textContent = message; err.hidden = false; }
      });
    },
  });
}

function vbConfirm({ title, text, confirmLabel, danger, onConfirm }) {
  openConfirmModal({ title, text, confirmLabel, cancelLabel: vt("common.cancel"), danger, onConfirm });
}

function vbParseJson(text, allowEmpty) {
  const value = text.trim();
  if (!value) return allowEmpty ? { ok: true, value: null } : { ok: false };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (e) {
    return { ok: false };
  }
}

function vbToggleStatus(entity, next, texts) {
  vbConfirm({
    title: texts.title,
    text: texts.text,
    confirmLabel: texts.confirm,
    danger: next === "DISABLED",
    onConfirm: () => { entity.status = next; acTouch(entity); vbRerender(); },
  });
}

// ---- Сети -----------------------------------------------------------------------------------------------
const vbNetworksList = createAccessList({
  key: "vb-net",
  data: () => VB_NETWORKS,
  searchPlaceholder: () => vt("networks.search"),
  searchText: (n) => [n.id, n.name, n.description].filter(Boolean).join(" "),
  tab: { get: (r) => r.status, values: ["ACTIVE", "DISABLED"], label: (v) => vbEnum("entityStatus", v) },
  filters: [{ id: "created", kind: "date", label: () => vt("filters.created"), get: (r) => r.createdDate }],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name), created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = vt("networks.metrics");
    return [
      { value: list.reduce((n, x) => n + vbCurrenciesOfNetwork(x.name).length, 0), label: m.currencies },
      { value: list.reduce((n, x) => n + vbCurrenciesOfNetwork(x.name).filter((c) => c.status === "DISABLED").length, 0), label: m.disabled },
      { value: list.filter((x) => !vbCurrenciesOfNetwork(x.name).length).length, label: m.empty },
    ];
  },
  columns: [
    { label: () => vt("columns.name"), sort: "name", html: (n) => `<div class="identity-cell">${vbLink(`#/settings-vabs-networks/${n.id}`, pdEscape(n.name))}${vbCodeCell(n.code)}</div>` },
    { label: () => vt("columns.description"), html: (n) => (n.description ? pdEscape(n.description) : "—") },
    { label: () => vt("columns.status"), html: (n) => vbStatusBadge(n.status) },
    { label: () => vt("columns.currencies"), html: (n) => vbCurrenciesOfNetwork(n.name).length },
    { label: () => vt("columns.created"), sort: "created", html: (n) => dateTimeCell(n.createdAt) },
    { label: () => vt("columns.updated"), html: (n) => dateTimeCell(n.updatedAt) },
  ],
  headerAction: () => vbBarActions(`<button type="button" class="btn-primary" id="vb-net-add">${PLUS_ICON_SVG}<span>${vt("networks.add")}</span></button>`),
  attachHeaderAction: () => vbAttachBar("networks", "vb-net-add", () => vbOpenNetworkForm(null)),
  attachRows: vbAttachRows,
});

function vbOpenNetworkForm(net) {
  const m = vt("networks.form");
  vbOpenForm({
    title: net ? m.editTitle : m.addTitle,
    fieldsHtml: `${vbInput("vb-name", vt("fields.name"), net ? net.name : "")}${vbInput("vb-desc", vt("fields.description"), net && net.description ? net.description : "")}`,
    submitLabel: net ? vt("common.save") : vt("common.create"),
    onSubmit: (el) => {
      const name = el.querySelector("#vb-name").value.trim();
      const description = el.querySelector("#vb-desc").value.trim() || null;
      if (!name) return m.errName;
      if (VB_NETWORKS.some((n) => n !== net && n.name.toLowerCase() === name.toLowerCase())) return m.errExists;
      closeModal();
      if (net) { Object.assign(net, { name, description }); acTouch(net); vbRerender(); return null; }
      const now = pdNow();
      VB_NETWORKS.unshift(vbStamp({ id: seedToPaymentUuid(Date.now() % 100000 + 50000), name, description, status: "ACTIVE", references: [], metadata: null }, now));
      render();
      return null;
    },
  });
}

function viewNetworkDetail(id) {
  const n = VB_NETWORKS.find((x) => x.id === id);
  if (!n) return vbNotFound();
  const f = vt("fields");
  const d = vt("networks.detail");
  const cur = vbCurrenciesOfNetwork(n.name);
  const active = n.status === "ACTIVE";
  const actions = vbHeaderActions(`<button type="button" class="btn-primary" data-vb-action="edit">${vt("common.edit")}</button>`, [active ? vbActionItem("disable", vt("common.disable"), ICONS.lock, true) : vbActionItem("enable", vt("common.enable"), CHECK_ICON_SVG)]);
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, n.code)}${detailField(f.name, pdEscape(n.name))}${detailField(f.status, vbStatusBadge(n.status))}
    ${detailField(f.description, n.description ? pdEscape(n.description) : "—")}${detailField(f.created, n.createdAt)}${detailField(f.updated, n.updatedAt)}</div>`;
  const currencies = vbMiniTable(
    [f.ticker, f.description, f.decimals, f.status],
    cur.map((c) => [vbLink(`#/settings-vabs-currencies/${c.id}`, pdEscape(c.ticker)), pdEscape(c.description), c.decimals, vbStatusBadge(c.status)]),
    d.noCurrencies
  );
  return `<div id="vb-root">
    ${vbDetailHeader({ backHash: "#/settings-vabs-networks", title: pdEscape(n.name), badges: vbStatusBadge(n.status), subtitle: vbCodeSubtitle(n.code, [n.createdAt]), actions })}
    <div class="client-detail-grid">
      <div class="client-detail-grid-main"><div class="profile-flat-block">${flatSection(vt("sections.main"), main)}${flatSection(`${d.currencies} · ${cur.length}`, currencies)}</div></div>
      <div class="client-detail-grid-side">${sectionCard(vt("sections.references"), `<div class="table-cell-muted">${vt("common.noReferences")}</div>`)}${sectionCard(vt("sections.service"), vbJson({ metadata: n.metadata }), "is-collapsed")}</div>
    </div>
  </div>`;
}

function initNetworkDetail(id) {
  const n = VB_NETWORKS.find((x) => x.id === id);
  const root = document.getElementById("vb-root");
  if (!n || !root) return;
  vbAttachCommon(root);
  const m = vt("networks.form");
  root.querySelectorAll("[data-vb-action]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.vbAction;
      if (act === "edit") vbOpenNetworkForm(n);
      if (act === "disable") vbToggleStatus(n, "DISABLED", { title: m.disableTitle, text: m.disableText(pdEscape(n.name)), confirm: vt("common.disable") });
      if (act === "enable") vbToggleStatus(n, "ACTIVE", { title: m.enableTitle, text: m.enableText(pdEscape(n.name)), confirm: vt("common.enable") });
    })
  );
}

// ---- Валюты ------------------------------------------------------------------------------------------------
const vbCurrenciesList = createAccessList({
  key: "vb-cur",
  data: () => VB_CURRENCIES,
  searchPlaceholder: () => vt("currencies.search"),
  searchText: (c) => [c.code, c.ticker, c.description, c.networkName].filter(Boolean).join(" "),
  tab: { get: (r) => r.status, values: ["ACTIVE", "DISABLED"], label: (v) => vbEnum("entityStatus", v) },
  filters: [
    { id: "created", kind: "date", label: () => vt("filters.created"), get: (r) => r.createdDate },
    { id: "network", kind: "multi", label: () => vt("filters.network"), get: (r) => r.networkName, options: () => VB_NETWORKS.map((n) => ({ value: n.name, label: n.name })) },
    { id: "decimals", kind: "multi", label: () => vt("filters.decimals"), get: (r) => r.decimals, options: () => [...new Set(VB_CURRENCIES.map((c) => c.decimals))].sort((a, b) => a - b).map((d) => ({ value: d, label: String(d) })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { ticker: (a, b) => a.ticker.localeCompare(b.ticker), created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = vt("currencies.metrics");
    return [
      { value: list.filter((c) => c.networkName === "FIAT").length, label: m.fiat },
      { value: list.filter((c) => c.networkName !== "FIAT").length, label: m.crypto },
      { value: new Set(list.map((c) => c.networkName)).size, label: m.networks },
    ];
  },
  columns: [
    { label: () => vt("columns.ticker"), sort: "ticker", html: (c) => `<div class="identity-cell">${vbLink(`#/settings-vabs-currencies/${c.id}`, pdEscape(c.ticker))}${vbCodeCell(c.code)}</div>` },
    { label: () => vt("columns.description"), html: (c) => pdEscape(c.description) },
    { label: () => vt("columns.network"), html: (c) => { const n = vbNetworkByName(c.networkName); return n ? vbLink(`#/settings-vabs-networks/${n.id}`, pdEscape(n.name)) : pdEscape(c.networkName); } },
    { label: () => vt("columns.decimals"), html: (c) => c.decimals },
    { label: () => vt("columns.status"), html: (c) => vbStatusBadge(c.status) },
    { label: () => vt("columns.created"), sort: "created", html: (c) => dateTimeCell(c.createdAt) },
    { label: () => vt("columns.updated"), html: (c) => dateTimeCell(c.updatedAt) },
  ],
  headerAction: () => vbBarActions(`<button type="button" class="btn-primary" id="vb-cur-add">${PLUS_ICON_SVG}<span>${vt("currencies.add")}</span></button>`),
  attachHeaderAction: () => vbAttachBar("currencies", "vb-cur-add", () => vbOpenCurrencyForm(null)),
  attachRows: vbAttachRows,
});

function vbOpenCurrencyForm(cur) {
  const m = vt("currencies.form");
  const networkOptions = VB_NETWORKS.map((n) => ({ value: n.name, label: n.name }));
  vbOpenForm({
    title: cur ? m.editTitle : m.addTitle,
    intro: cur ? m.editWarning : null,
    fieldsHtml: `${vbInput("vb-ticker", vt("fields.ticker"), cur ? cur.ticker : "")}
      ${vbSelect("vb-network", vt("fields.network"), networkOptions, cur ? cur.networkName : "FIAT")}
      ${vbInput("vb-decimals", vt("fields.decimals"), cur ? String(cur.decimals) : "2", 'inputmode="numeric"')}
      ${vbInput("vb-desc", vt("fields.description"), cur ? cur.description || "" : "")}
      ${cur ? vbSelect("vb-status", vt("fields.status"), ["ACTIVE", "DISABLED"].map((s) => ({ value: s, label: vbEnum("entityStatus", s) })), cur.status) : ""}`,
    submitLabel: cur ? vt("common.save") : vt("common.create"),
    onSubmit: (el) => {
      const ticker = el.querySelector("#vb-ticker").value.trim();
      const network = el.querySelector("#vb-network").value;
      const decimalsRaw = el.querySelector("#vb-decimals").value.trim();
      const description = el.querySelector("#vb-desc").value.trim() || null;
      if (!ticker || !/^[A-Za-z0-9.]+$/.test(ticker)) return m.errTicker;
      if (!/^\d+$/.test(decimalsRaw) || Number(decimalsRaw) > 36) return m.errDecimals;
      if (VB_CURRENCIES.some((c) => c !== cur && c.ticker.toLowerCase() === ticker.toLowerCase() && c.networkName === network)) return m.errExists;
      closeModal();
      if (cur) {
        Object.assign(cur, { ticker, networkName: network, decimals: Number(decimalsRaw), description: description || `${ticker}:${network}`, status: el.querySelector("#vb-status").value });
        acTouch(cur);
        vbRerender();
        return null;
      }
      VB_CURRENCIES.unshift(vbStamp({ id: seedToPaymentUuid(Date.now() % 100000 + 60000), ticker, networkName: network, decimals: Number(decimalsRaw), description: description || `${ticker}:${network}`, status: "ACTIVE", references: [], metadata: null }, pdNow()));
      render();
      return null;
    },
  });
}

function viewCurrencyDetail(id) {
  const c = vbCurrencyById(id);
  if (!c) return vbNotFound();
  const f = vt("fields");
  const d = vt("currencies.detail");
  const net = vbNetworkByName(c.networkName);
  const active = c.status === "ACTIVE";
  const actions = vbHeaderActions(`<button type="button" class="btn-primary" data-vb-action="edit">${vt("common.edit")}</button>`, [active ? vbActionItem("disable", vt("common.disable"), ICONS.lock, true) : vbActionItem("enable", vt("common.enable"), CHECK_ICON_SVG)]);
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, c.code)}${detailField(f.ticker, pdEscape(c.ticker))}${detailField(f.status, vbStatusBadge(c.status))}
    ${detailField(f.network, net ? vbLink(`#/settings-vabs-networks/${net.id}`, pdEscape(net.name)) : pdEscape(c.networkName))}
    ${detailField(f.decimals, c.decimals)}${detailField(f.description, c.description ? pdEscape(c.description) : "—")}
    ${detailField(f.created, c.createdAt)}${detailField(f.updated, c.updatedAt)}</div>`;
  const maps = VB_CURRENCY_MAPPINGS.filter((x) => x.currencyId === c.id || x.providerCurrencyId === c.id);
  const usage = vbMiniTable(
    [f.provider, d.ours, d.theirs, f.decimals],
    maps.map((x) => {
      const p = vbProviderById(x.providerId);
      const ours = vbCurrencyById(x.currencyId);
      const theirs = vbCurrencyById(x.providerCurrencyId);
      return [vbLink(`#/settings-vabs-providers/${p.id}`, pdEscape(p.name)), vbLink(`#/settings-vabs-currencies/${ours.id}`, pdEscape(ours.ticker)), vbLink(`#/settings-vabs-currencies/${theirs.id}`, pdEscape(theirs.ticker)), x.decimals];
    }),
    d.noUsage
  );
  return `<div id="vb-root">
    ${vbDetailHeader({ backHash: "#/settings-vabs-currencies", title: pdEscape(c.ticker), badges: vbStatusBadge(c.status), subtitle: vbCodeSubtitle(c.code, [pdEscape(c.networkName), c.createdAt]), actions })}
    <div class="client-detail-grid">
      <div class="client-detail-grid-main"><div class="profile-flat-block">${flatSection(vt("sections.main"), main)}${flatSection(`${d.usage} · ${maps.length}`, usage)}</div></div>
      <div class="client-detail-grid-side">${sectionCard(vt("sections.references"), `<div class="table-cell-muted">${vt("common.noReferences")}</div>`)}${sectionCard(vt("sections.service"), vbJson({ metadata: c.metadata }), "is-collapsed")}</div>
    </div>
  </div>`;
}

function initCurrencyDetail(id) {
  const c = vbCurrencyById(id);
  const root = document.getElementById("vb-root");
  if (!c || !root) return;
  vbAttachCommon(root);
  const m = vt("currencies.form");
  root.querySelectorAll("[data-vb-action]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.vbAction;
      if (act === "edit") vbOpenCurrencyForm(c);
      if (act === "disable") vbToggleStatus(c, "DISABLED", { title: m.disableTitle, text: m.disableText(pdEscape(c.ticker)), confirm: vt("common.disable") });
      if (act === "enable") vbToggleStatus(c, "ACTIVE", { title: m.enableTitle, text: m.enableText(pdEscape(c.ticker)), confirm: vt("common.enable") });
    })
  );
}

// ---- Справочники (перечисления) ------------------------------------------------------------------------
function vbEnumUsage(e) {
  return e.usedIn ? vt(`enumsPage.usedIn.${e.usedIn}`) : null;
}

const vbEnumsList = createAccessList({
  key: "vb-enum",
  data: () => VB_ENUMS,
  searchPlaceholder: () => vt("enumsPage.search"),
  searchText: (e) => [e.name, e.description, vbEnumUsage(e), ...e.values].filter(Boolean).join(" "),
  tab: null,
  filters: [],
  defaultSort: (a, b) => a.name.localeCompare(b.name),
  sorts: { name: (a, b) => a.name.localeCompare(b.name), count: (a, b) => a.values.length - b.values.length },
  metrics: (list) => {
    const m = vt("enumsPage.metrics");
    return [
      { value: list.length, label: m.total },
      { value: list.reduce((n, e) => n + e.values.length, 0), label: m.values },
    ];
  },
  columns: [
    { label: () => vt("columns.enumName"), sort: "name", html: (e) => `<div class="identity-cell">${vbLink(`#/settings-vabs-enums/${e.name}`, e.name)}${e.description ? `<span class="table-cell-muted">${pdEscape(e.description)}</span>` : ""}</div>` },
    { label: () => vt("columns.usedIn"), html: (e) => vbEnumUsage(e) || "—" },
    { label: () => vt("columns.valuesCount"), sort: "count", html: (e) => e.values.length },
    { label: () => vt("columns.values"), html: (e) => `<div class="ac-badges">${e.values.slice(0, 4).map((v) => `<span class="badge badge-neutral">${pdEscape(v)}</span>`).join("")}${e.values.length > 4 ? `<span class="table-cell-muted">+${e.values.length - 4}</span>` : ""}</div>` },
    { label: () => vt("columns.updated"), html: (e) => dateTimeCell(e.updatedAt) },
  ],
  headerAction: () => vbBarActions(""),
  attachHeaderAction: () => vbAttachBar("enums", null, null),
  attachRows: vbAttachRows,
});

function viewEnumDetail(name) {
  const e = VB_ENUMS.find((x) => x.name === name);
  if (!e) return vbNotFound();
  const d = vt("enumsPage.detail");
  const f = vt("fields");
  const usage = vbEnumUsage(e);
  const actions = vbHeaderActions(`<button type="button" class="btn-primary" data-vb-action="add">${d.addValue}</button>`);
  const info = `<div class="profile-fields profile-fields-grid">
    ${detailField(f.name, e.name)}${detailField(f.usedIn, usage || "—")}${detailField(f.description, e.description ? pdEscape(e.description) : "—")}${detailField(f.updated, e.updatedAt)}</div>
    <p class="table-cell-muted vb-note">${d.readOnlyNote}</p>`;
  const values = vbMiniTable(
    [d.value, ""],
    e.values.map((v) => [`<span class="vb-mono">${pdEscape(v)}</span>`, `<button type="button" class="btn-secondary vb-row-btn" data-vb-remove="${escapeAttr(v)}">${d.remove}</button>`]),
    d.noValues
  );
  return `<div id="vb-root">
    ${vbDetailHeader({ backHash: "#/settings-vabs-enums", title: e.name, badges: `<span class="badge badge-neutral">${vt("enumsPage.valuesLabel")(e.values.length)}</span>`, subtitle: e.updatedAt, actions })}
    <div id="vb-body"><div class="profile-flat-block">${flatSection(vt("sections.main"), info)}${flatSection(`${d.values} · ${e.values.length}`, values)}</div></div>
  </div>`;
}

function initEnumDetail(name) {
  const e = VB_ENUMS.find((x) => x.name === name);
  const root = document.getElementById("vb-root");
  if (!e || !root) return;
  vbAttachCommon(root);
  const d = vt("enumsPage.detail");
  root.querySelector('[data-vb-action="add"]').addEventListener("click", () =>
    vbOpenForm({
      title: d.addTitle,
      intro: d.addText,
      fieldsHtml: vbInput("vb-value", d.value, ""),
      submitLabel: vt("common.add"),
      onSubmit: (el) => {
        const value = el.querySelector("#vb-value").value.trim();
        if (!value || !/^[A-Za-z0-9_.-]+$/.test(value)) return d.errValue;
        if (e.values.includes(value)) return d.errExists;
        closeModal();
        e.values.push(value);
        acTouch(e);
        vbRerender();
        return null;
      },
    })
  );
  root.querySelectorAll("[data-vb-remove]").forEach((b) =>
    b.addEventListener("click", () => {
      const value = b.dataset.vbRemove;
      vbConfirm({
        title: d.removeTitle,
        text: d.removeText(pdEscape(value), pdEscape(e.name)),
        confirmLabel: d.remove,
        danger: true,
        onConfirm: () => { e.values = e.values.filter((v) => v !== value); acTouch(e); vbRerender(); },
      });
    })
  );
}



