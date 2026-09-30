/* ==========================================================================
   "Настройки системы → Курсы": курсы пар, наценки (глобальные и индивидуальные), источники курсов.
   Модель и границы прототипа — в mock/rates.mock.js: наценки в схеме бэкенда описаны, но API управления ими нет,
   поэтому создание и отмена наценок здесь моделируются. Списки построены на createAccessList, формы — на vbOpenForm.
   ========================================================================== */

function rt(path) {
  return t(`rates.${path}`);
}

let ratesTab = "pairs";
const RATES_TABS = ["pairs", "markups", "individual", "providers"];

// ---- Отображение ------------------------------------------------------------------------------------------------
function rtStatusBadge(status) {
  const cls = { ACTIVE: "badge-success", EXPIRED: "badge-neutral", CANCELLED: "badge-danger", UNAVAILABLE: "badge-warning" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${rt(`status.${status}`)}</span>`;
}

function rtPairCell(p) {
  return `<div class="identity-cell"><span class="rt-pair">${pdEscape(ratePairLabel(p))}</span>${vbCodeCell(p.code)}</div>`;
}

function rtMarkupCell(a) {
  if (!a) return `<span class="table-cell-muted">—</span>`;
  return `<div class="identity-cell"><span class="rt-markup ${Number(a.value) < 0 ? "is-neg" : ""}">${rateMarkupText(a)}</span><span class="table-cell-muted">${rt(`type.${a.type}`)}</span></div>`;
}

function rtEndedCell(a) {
  const at = a.status === "CANCELLED" ? a.cancelledAt : a.endedAt;
  return at ? dateTimeCell(at) : "—";
}

function rtCreatedCell(a) {
  return `<div class="identity-cell">${dateTimeCell(a.createdAt)}<span class="table-cell-muted">${pdEscape(a.createdBy)}</span></div>`;
}

function rtClientsCell(a) {
  const names = a.clientIds.map((id) => rateClientById(id)).filter(Boolean).map((c) => c.name);
  const rest = names.length > 2 ? `<span class="table-cell-muted">${rt("clientsMore")(names.length - 2)}</span>` : "";
  return `<div class="identity-cell">${names.slice(0, 2).map(pdEscape).join("<br>")}${rest}</div>`;
}

function rtAttachRows(wrap) {
  wrap.querySelectorAll(".id-copy").forEach((btn) => btn.addEventListener("click", () => copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn))));
  wrap.querySelectorAll("[data-rt-set]").forEach((b) => b.addEventListener("click", () => rtOpenMarkupForm("global", b.dataset.rtSet)));
  wrap.querySelectorAll("[data-rt-history]").forEach((b) => b.addEventListener("click", () => rtOpenHistory(b.dataset.rtHistory)));
  wrap.querySelectorAll("[data-rt-cancel]").forEach((b) => b.addEventListener("click", () => rtConfirmCancel(b.dataset.rtCancel)));
}

// ---- Списки -------------------------------------------------------------------------------------------------------
function rtBar(primaryHtml) {
  return () => `<span class="filters-bar-end">${exportMenuHtml("rt-export", rt("export.button"), rt("export.hint"))}${primaryHtml || ""}</span>`;
}

const rtPairsList = createAccessList({
  key: "rt-pairs",
  data: () => RATE_PAIRS,
  searchPlaceholder: () => rt("pairs.search"),
  searchText: (p) => `${ratePairLabel(p)} ${p.base}${p.quote} ${p.id}`,
  tab: null,
  filters: [
    { id: "markup", kind: "multi", label: () => rt("pairs.filterMarkup"), get: (p) => (rateActiveGlobal(p) ? "with" : "without"), options: () => ["with", "without"].map((v) => ({ value: v, label: rt(`pairs.markup.${v}`) })) },
    { id: "quote", kind: "multi", label: () => rt("pairs.filterQuote"), get: (p) => p.quote, options: () => [...new Set(RATE_PAIRS.map((p) => p.quote))].map((v) => ({ value: v, label: v })) },
  ],
  defaultSort: (a, b) => ratePairLabel(a).localeCompare(ratePairLabel(b)),
  sorts: { pair: (a, b) => ratePairLabel(a).localeCompare(ratePairLabel(b)), updated: (a, b) => a.updated - b.updated },
  columns: [
    { label: () => rt("columns.pair"), sort: "pair", html: rtPairCell },
    { label: () => rt("columns.aggregated"), html: (p) => rateFormat(p.rate, p) },
    { label: () => rt("columns.markup"), html: (p) => rtMarkupCell(rateActiveGlobal(p)) },
    { label: () => rt("columns.final"), html: (p) => `<strong>${rateFormat(rateFinal(p), p)}</strong>` },
    { label: () => rt("columns.deviation"), html: (p) => { const d = (rateFinal(p) / p.rate - 1) * 100; return d === 0 ? "—" : `${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} %`; } },
    { label: () => rt("columns.sources"), html: (p) => p.sources.map((id) => rateProviderById(id).name).join(", ") },
    { label: () => rt("columns.updated"), sort: "updated", html: (p) => dateTimeCell(formatDateTime(p.updated)) },
    { label: () => "", html: (p) => rowKebabMenu(`rt-pair-${p.id}`, [
      { label: rt("actions.setMarkup"), icon: EDIT_ICON_SVG, attrs: `data-rt-set="${p.id}"` },
      { label: rt("actions.history"), icon: ICONS.exchange, attrs: `data-rt-history="${p.id}"` },
    ]) },
  ],
  headerAction: rtBar(""),
  attachHeaderAction: () => bindExportMenu("rt-export", (f) => rtExport("pairs", f)),
  attachRows: rtAttachRows,
});

function rtCancelItem(a) {
  return a.status === "ACTIVE" ? rowKebabMenu(`rt-adj-${a.id}`, [{ label: rt("actions.cancel"), icon: TRASH_ICON_SVG, danger: true, attrs: `data-rt-cancel="${a.id}"` }]) : "";
}

function rtAdjFilters(data) {
  return [
    { id: "pair", kind: "multi", label: () => rt("filters.pair"), get: (a) => a.pairId, options: () => RATE_PAIRS.map((p) => ({ value: p.id, label: ratePairLabel(p) })) },
    { id: "type", kind: "multi", label: () => rt("filters.type"), get: (a) => a.type, options: () => ["PERCENTAGE", "FIXED"].map((v) => ({ value: v, label: rt(`type.${v}`) })) },
    { id: "created", kind: "date", label: () => rt("filters.created"), get: (a) => a.createdDate },
  ];
}

const rtMarkupsList = createAccessList({
  key: "rt-markups",
  data: () => RATE_GLOBAL_ADJUSTMENTS,
  searchPlaceholder: () => rt("markups.search"),
  searchText: (a) => `${ratePairLabel(ratePairById(a.pairId))} ${a.description || ""} ${a.id}`,
  tab: { get: (a) => a.status, values: ["ACTIVE", "EXPIRED", "CANCELLED"], label: (v) => rt(`status.${v}`) },
  filters: rtAdjFilters(),
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, value: (a, b) => a.value - b.value },
  columns: [
    { label: () => rt("columns.pair"), html: (a) => rtPairCell(ratePairById(a.pairId)) },
    { label: () => rt("columns.markup"), sort: "value", html: rtMarkupCell },
    { label: () => rt("columns.final"), html: (a) => { const p = ratePairById(a.pairId); return a.status === "ACTIVE" ? `<strong>${rateFormat(rateFinal(p), p)}</strong>` : "—"; } },
    { label: () => rt("columns.status"), html: (a) => rtStatusBadge(a.status) },
    { label: () => rt("columns.description"), html: (a) => (a.description ? `<span class="table-truncate table-truncate-wide" title="${escapeAttr(a.description)}">${pdEscape(a.description)}</span>` : "—") },
    { label: () => rt("columns.created"), sort: "created", html: rtCreatedCell },
    { label: () => rt("columns.ended"), html: rtEndedCell },
    { label: () => "", html: rtCancelItem },
  ],
  headerAction: rtBar(`<button type="button" class="btn-primary" id="rt-add-global">${PLUS_ICON_SVG}<span>${"" }</span></button>`),
  attachHeaderAction: () => {
    bindExportMenu("rt-export", (f) => rtExport("markups", f));
    document.getElementById("rt-add-global").addEventListener("click", () => rtOpenMarkupForm("global"));
  },
  attachRows: rtAttachRows,
});

const rtIndividualList = createAccessList({
  key: "rt-individual",
  data: () => RATE_INDIVIDUAL_ADJUSTMENTS,
  searchPlaceholder: () => rt("individual.search"),
  searchText: (a) => `${ratePairLabel(ratePairById(a.pairId))} ${a.description || ""} ${a.clientIds.map((id) => (rateClientById(id) || {}).name).join(" ")}`,
  tab: { get: (a) => a.status, values: ["ACTIVE", "EXPIRED", "CANCELLED"], label: (v) => rt(`status.${v}`) },
  filters: rtAdjFilters(),
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, value: (a, b) => a.value - b.value },
  columns: [
    { label: () => rt("columns.clients"), html: rtClientsCell },
    { label: () => rt("columns.pair"), html: (a) => rtPairCell(ratePairById(a.pairId)) },
    { label: () => rt("columns.markup"), sort: "value", html: rtMarkupCell },
    { label: () => rt("columns.personal"), html: (a) => { const p = ratePairById(a.pairId); const v = a.status === "ACTIVE" ? rateApply(rateFinal(p), a.type, a.value) : null; return v ? `<strong>${rateFormat(v, p)}</strong>` : "—"; } },
    { label: () => rt("columns.status"), html: (a) => rtStatusBadge(a.status) },
    { label: () => rt("columns.description"), html: (a) => (a.description ? `<span class="table-truncate table-truncate-wide" title="${escapeAttr(a.description)}">${pdEscape(a.description)}</span>` : "—") },
    { label: () => rt("columns.created"), sort: "created", html: rtCreatedCell },
    { label: () => rt("columns.ended"), html: rtEndedCell },
    { label: () => "", html: rtCancelItem },
  ],
  headerAction: rtBar(`<button type="button" class="btn-primary" id="rt-add-individual">${PLUS_ICON_SVG}<span>${""}</span></button>`),
  attachHeaderAction: () => {
    bindExportMenu("rt-export", (f) => rtExport("individual", f));
    document.getElementById("rt-add-individual").addEventListener("click", () => rtOpenMarkupForm("individual"));
  },
  attachRows: rtAttachRows,
});

const rtProvidersList = createAccessList({
  key: "rt-providers",
  data: () => RATE_PROVIDERS,
  searchPlaceholder: () => rt("providers.search"),
  searchText: (p) => p.name,
  tab: null,
  filters: [
    { id: "kind", kind: "multi", label: () => rt("providers.filterKind"), get: (p) => p.kind, options: () => ["EXCHANGE", "REGULATOR"].map((v) => ({ value: v, label: rt(`providers.kind.${v}`) })) },
    { id: "status", kind: "multi", label: () => rt("columns.status"), get: (p) => p.status, options: () => ["ACTIVE", "UNAVAILABLE"].map((v) => ({ value: v, label: rt(`status.${v}`) })) },
  ],
  defaultSort: (a, b) => a.name.localeCompare(b.name),
  sorts: {},
  columns: [
    { label: () => rt("columns.provider"), html: (p) => `<strong>${pdEscape(p.name)}</strong>` },
    { label: () => rt("columns.kind"), html: (p) => `<span class="badge badge-neutral">${rt(`providers.kind.${p.kind}`)}</span>` },
    { label: () => rt("columns.status"), html: (p) => rtStatusBadge(p.status) },
    { label: () => rt("columns.pairs"), html: (p) => RATE_PAIRS.filter((x) => x.sources.includes(p.id)).map(ratePairLabel).join(", ") },
    { label: () => rt("columns.lastUpdate"), html: (p) => dateTimeCell(formatDateTime(p.updated)) },
  ],
  headerAction: rtBar(""),
  attachHeaderAction: () => bindExportMenu("rt-export", (f) => rtExport("providers", f)),
  attachRows: rtAttachRows,
});

const RT_LISTS = { pairs: rtPairsList, markups: rtMarkupsList, individual: rtIndividualList, providers: rtProvidersList };

// ---- Экран ---------------------------------------------------------------------------------------------------------
function rtTabsBar() {
  return `<div class="cd-subtabs">${RATES_TABS.map((k) => `<button type="button" class="cd-subtab${ratesTab === k ? " is-active" : ""}" data-rt-tab="${k}"><span>${rt(`tabs.${k}`)}</span><span class="quick-tab-count">${RT_LISTS[k].count()}</span></button>`).join("")}</div>`;
}

function viewSettingsRates() {
  const m = window.location.hash.match(/^#\/?settings-rates\/(pairs|markups|individual|providers)$/);
  if (m) ratesTab = m[1];
  const info = `<button type="button" class="client-detail-actions-btn acm-info-btn" title="${escapeAttr(rt("info"))}" aria-label="${escapeAttr(rt("title"))}">${ACM_INFO_ICON}</button>`;
  return `
    <div class="list-hero">${pageHeader(t("nav.settings-rates"), t("navDescriptions.settings-rates"), info)}</div>
    <div class="cd-tabs-wrap" id="rt-tabs">${rtTabsBar()}</div>
    <div id="rt-content">${rtContent()}</div>
  `;
}

function rtContent() {
  return `${RT_LISTS[ratesTab].view()}`;
}

function initSettingsRates() {
  document.querySelectorAll("[data-rt-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ratesTab = btn.dataset.rtTab;
      document.getElementById("rt-tabs").innerHTML = rtTabsBar();
      document.getElementById("rt-content").innerHTML = rtContent();
      initSettingsRates();
    });
  });
  RT_LISTS[ratesTab].init();
  const add = document.getElementById("rt-add-global") || document.getElementById("rt-add-individual");
  if (add) add.querySelector("span").textContent = rt(ratesTab === "individual" ? "individual.add" : "markups.add");
}

// ---- Экспорт -------------------------------------------------------------------------------------------------------
function rtExport(kind, format) {
  const c = rt("columns");
  let headers, rows;
  if (kind === "pairs") {
    headers = [c.pair, c.aggregated, c.markup, c.final, c.updated];
    rows = RATE_PAIRS.map((p) => [ratePairLabel(p), p.rate, rateMarkupText(rateActiveGlobal(p)), rateFinal(p), formatDateTime(p.updated)]);
  } else if (kind === "providers") {
    headers = [c.provider, c.kind, c.status, c.lastUpdate];
    rows = RATE_PROVIDERS.map((p) => [p.name, rt(`providers.kind.${p.kind}`), rt(`status.${p.status}`), formatDateTime(p.updated)]);
  } else {
    const list = kind === "individual" ? RATE_INDIVIDUAL_ADJUSTMENTS : RATE_GLOBAL_ADJUSTMENTS;
    headers = kind === "individual" ? [c.clients, c.pair, c.markup, c.status, c.description, c.created, c.ended] : [c.pair, c.markup, c.status, c.description, c.created, c.ended];
    rows = list.map((a) => {
      const base = [ratePairLabel(ratePairById(a.pairId)), `${rateMarkupText(a)} (${rt(`type.${a.type}`)})`, rt(`status.${a.status}`), a.description || "", a.createdAt, (a.status === "CANCELLED" ? a.cancelledAt : a.endedAt) || ""];
      return kind === "individual" ? [a.clientIds.map((id) => (rateClientById(id) || {}).name).join("; "), ...base] : base;
    });
  }
  exportTable(`rates-${kind}`, format, headers, rows);
  showToast(rt("export.done"));
}

// ---- История по паре -----------------------------------------------------------------------------------------------
function rtOpenHistory(pairId) {
  const p = ratePairById(pairId);
  const rows = RATE_GLOBAL_ADJUSTMENTS.filter((a) => a.pairId === pairId).sort((a, b) => b.createdDate - a.createdDate).map((a) => [rateMarkupText(a) + ` <span class="table-cell-muted">${rt(`type.${a.type}`)}</span>`, rtStatusBadge(a.status), a.createdAt, (a.status === "CANCELLED" ? a.cancelledAt : a.endedAt) || "—", pdEscape(a.description || "—")]);
  const c = rt("columns");
  openModal({
    title: rt("history.title")(ratePairLabel(p)),
    width: 760,
    bodyHtml: vbMiniTable([c.markup, c.status, c.created, c.ended, c.description], rows, rt("history.empty")),
    footerHtml: `<button type="button" class="btn-secondary" id="rt-history-close">${rt("history.close")}</button>`,
    onMount: (el) => el.querySelector("#rt-history-close").addEventListener("click", closeModal),
  });
}

// ---- Создание наценки ------------------------------------------------------------------------------------------
function rtOpenMarkupForm(kind, pairId) {
  const f = rt("form");
  const isInd = kind === "individual";
  const pairOptions = RATE_PAIRS.map((p) => ({ value: p.id, label: ratePairLabel(p) }));
  const selected = pairId || RATE_PAIRS[0].id;
  const clients = isInd
    ? `<div class="filters-field vb-field"><span class="filters-field-label">${f.clients}</span><div class="rt-clients">${RATE_CLIENTS.map((c) => `<label class="rt-client"><input type="checkbox" value="${c.id}" /><span>${pdEscape(c.name)}</span></label>`).join("")}</div></div>`
    : "";
  vbOpenForm({
    title: isInd ? f.titleIndividual : f.titleGlobal,
    width: 560,
    intro: isInd ? f.introIndividual : f.introGlobal,
    fieldsHtml: `${vbSelect("rt-pair", f.pair, pairOptions, selected)}${clients}
      <div class="rt-grid">${vbSelect("rt-type", f.type, ["PERCENTAGE", "FIXED"].map((v) => ({ value: v, label: rt(`type.${v}`) })), "PERCENTAGE")}${vbInput("rt-value", f.value, "", 'inputmode="decimal" placeholder="1.5"')}</div>
      <div class="rt-preview" id="rt-preview"></div>
      ${vbInput("rt-desc", f.description, "")}`,
    submitLabel: vt("common.create"),
    onSubmit: (el) => {
      const pair = ratePairById(el.querySelector("#rt-pair").value);
      const type = el.querySelector("#rt-type").value;
      const raw = el.querySelector("#rt-value").value.trim().replace(",", ".");
      const value = Number(raw);
      const description = el.querySelector("#rt-desc").value.trim();
      const e = f.errors;
      if (raw === "" || !Number.isFinite(value)) return e.value;
      if (value === 0) return e.zero;
      if (type === "PERCENTAGE" && value <= -100) return e.percent;
      const base = isInd ? rateFinal(pair) : pair.rate;
      if (rateApply(base, type, value) === null) return e.result;
      let clientIds = [];
      if (isInd) {
        clientIds = [...el.querySelectorAll(".rt-clients input:checked")].map((i) => i.value);
        if (!clientIds.length) return e.clients;
      }
      if (description.length < 3) return e.description;
      if (description.length > 500) return e.descriptionLong;
      closeModal();
      requireAdmin2fa("rates_markup_change", () => rtCreateMarkup(kind, { pair, type, value, description, clientIds }));
      return null;
    },
  });
  const el = document.getElementById("rt-preview");
  const update = () => {
    const pair = ratePairById(document.getElementById("rt-pair").value);
    const type = document.getElementById("rt-type").value;
    const value = Number(document.getElementById("rt-value").value.trim().replace(",", "."));
    const base = isInd ? rateFinal(pair) : pair.rate;
    const valid = document.getElementById("rt-value").value.trim() !== "" && Number.isFinite(value);
    const res = valid ? rateApply(base, type, value) : null;
    el.innerHTML = `<span>${isInd ? f.baseFinal : f.baseAggregated}: <strong>${rateFormat(base, pair)}</strong></span><span class="rt-preview-arrow">→</span><span>${isInd ? f.resultPersonal : f.resultFinal}: <strong>${res ? rateFormat(res, pair) : "—"}</strong></span>${isInd ? "" : `<span class="table-cell-muted">${rateActiveGlobal(pair) ? f.replaces : ""}</span>`}`;
  };
  ["rt-pair", "rt-type", "rt-value"].forEach((id) => {
    const n = document.getElementById(id);
    n.addEventListener("input", update);
    n.addEventListener("change", update);
  });
  update();
}

function rtCreateMarkup(kind, d) {
  const now = pdNow();
  const rec = { id: rtUuid(++rtSeq), pairId: d.pair.id, type: d.type, value: d.value, status: "ACTIVE", description: d.description, createdDate: now, createdAt: formatDateTime(now), createdBy: CURRENT_ADMIN.email, endedDate: null, endedAt: null, cancelledDate: null, cancelledAt: null };
  if (kind === "individual") {
    rec.clientIds = d.clientIds;
    RATE_INDIVIDUAL_ADJUSTMENTS.unshift(rec);
  } else {
    RATE_GLOBAL_ADJUSTMENTS.filter((a) => a.pairId === d.pair.id && a.status === "ACTIVE").forEach((a) => { a.status = "EXPIRED"; a.endedDate = now; a.endedAt = formatDateTime(now); });
    RATE_GLOBAL_ADJUSTMENTS.unshift(rec);
  }
  showToast(rt("form.created"));
  ratesTab = kind === "individual" ? "individual" : "markups";
  render();
}

function rtConfirmCancel(id) {
  const a = RATE_GLOBAL_ADJUSTMENTS.find((x) => x.id === id) || RATE_INDIVIDUAL_ADJUSTMENTS.find((x) => x.id === id);
  if (!a) return;
  const pair = ratePairById(a.pairId);
  vbConfirm({
    title: rt("cancel.title"),
    text: rt("cancel.text")(ratePairLabel(pair), rateMarkupText(a)),
    confirmLabel: rt("actions.cancel"),
    danger: true,
    onConfirm: () => requireAdmin2fa("rates_markup_change", () => {
      const now = pdNow();
      a.status = "CANCELLED";
      a.cancelledDate = now;
      a.cancelledAt = formatDateTime(now);
      showToast(rt("cancel.done"));
      render();
    }),
  });
}
