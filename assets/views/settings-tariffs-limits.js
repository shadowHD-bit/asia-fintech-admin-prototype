/* ==========================================================================
   "Настройки системы → Тарифы": лимиты (список, страница, формы, привязки, история изменений),
   ограничения лимитов и комиссии (список, страница, факторы).
   Спецификация: docs/settings-tariffs-spec.md; данные — mock/settings-tariffs.mock.js.
   Формы — конструктор tfOpenForm (views/settings-tariffs.js).
   ========================================================================== */

function tfPeriodsCell(l) {
  if ([l.daily, l.weekly, l.monthly, l.annual].every((v) => v >= TF_STUB)) return `<span class="table-cell-muted">${tf("common.unlimited")}</span>`;
  const n = (v) => tfNum(v).replace(` ${l.currencyTicker}`, "");
  const p = tf("common.periodShort");
  return `<div class="identity-cell"><span>${p.daily} ${n(l.daily)} · ${p.weekly} ${n(l.weekly)}</span><span class="table-cell-muted">${p.monthly} ${n(l.monthly)} · ${p.annual} ${n(l.annual)}</span></div>`;
}

function tfBindingsLabel(ids) {
  if (!ids.length) return `<span class="table-cell-muted">${tf("limits.noBindings")}</span>`;
  const names = [...new Set(ids.map((id) => (tfOperationById((tfTariffOpById(id) || {}).operationId) || {}).name).filter(Boolean))];
  const tariffs = new Set(ids.map((id) => (tfTariffOpById(id) || {}).tariffId)).size;
  return `<div class="identity-cell"><span class="vb-mono">${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}</span><span class="table-cell-muted">${tf("limits.bindingsSummary")(ids.length, tariffs)}</span></div>`;
}

function tfClientOptions(includeNone) {
  return [...(includeNone ? [{ value: "", label: "—" }] : []), ...TF_CLIENTS.map((c) => ({ value: c.id, label: c.name }))];
}

function tfTariffOpOptions(exclude) {
  return TF_TARIFF_OPS.filter((x) => !exclude.includes(x.id) && tfTariffById(x.tariffId) && !tfTariffById(x.tariffId).deleted).map((x) => ({ value: x.id, label: tfTariffOpLabel(x.id) }));
}

// Всем клиентам тарифов, к которым привязан лимит или комиссия
function tfAffectedClients(tariffOpIds) {
  const tariffIds = new Set(tariffOpIds.map((id) => (tfTariffOpById(id) || {}).tariffId));
  return TF_CLIENTS.filter((c) => tariffIds.has(c.tariffId)).length;
}

// ==== Лимиты =============================================================================================================
const tfLimitsList = createAccessList({
  key: "tf-limits",
  data: () => TF_LIMITS,
  searchPlaceholder: () => tf("limits.search"),
  searchText: (l) => [l.id, l.name, l.description, l.clientId, (tfClientById(l.clientId) || {}).name].filter(Boolean).join(" "),
  tab: { get: (l) => (l.clientId ? "personal" : "shared"), values: ["shared", "personal"], label: (v) => tf(`common.${v}Tab`) },
  filters: [
    { id: "currency", kind: "multi", label: () => tf("filters.currency"), get: (l) => l.currencyTicker, options: () => [...new Set(TF_LIMITS.map((l) => l.currencyTicker))].sort().map((v) => ({ value: v, label: v })) },
    { id: "tariff", kind: "multi", label: () => tf("filters.tariff"), get: (l) => [...new Set(l.tariffOperationIds.map((id) => (tfTariffOpById(id) || {}).tariffId))], options: () => tfLiveTariffs().map((x) => ({ value: x.id, label: x.name })) },
    { id: "operation", kind: "multi", label: () => tf("filters.operation"), get: (l) => [...new Set(l.tariffOperationIds.map((id) => (tfTariffOpById(id) || {}).operationId))], options: () => TF_OPERATIONS.map((o) => ({ value: o.id, label: o.name })) },
    { id: "rolling", kind: "multi", label: () => tf("filters.rolling"), get: (l) => String(l.isRolling), options: () => [{ value: "true", label: vt("common.yes") }, { value: "false", label: vt("common.no") }] },
    { id: "restriction", kind: "multi", label: () => tf("filters.restriction"), get: (l) => (l.restrictionId ? "yes" : "no"), options: () => [{ value: "yes", label: vt("common.yes") }, { value: "no", label: vt("common.no") }] },
    { id: "created", kind: "date", label: () => tf("filters.created"), get: (l) => l.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name), created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = tf("limits.metrics");
    return [
      { value: list.filter((l) => new Set(l.tariffOperationIds.map((id) => (tfTariffOpById(id) || {}).operationId)).size > 1).length, label: m.pools },
      { value: list.filter((l) => l.isRolling).length, label: m.rolling },
      { value: list.filter((l) => l.min !== null || l.max !== null).length, label: m.channel },
    ];
  },
  columns: [
    { label: () => tf("columns.name"), sort: "name", html: (l) => `<div class="identity-cell">${vbLink(`#/settings-tariffs-limits/${l.id}`, pdEscape(l.name))}${vbIdCell(l.id)}</div>` },
    { label: () => tf("columns.currency"), html: (l) => `<div class="identity-cell"><span>${l.currencyTicker}</span>${l.isBaseCurrency ? `<span class="badge badge-info tf-mini">${tf("common.base")}</span>` : ""}</div>` },
    { label: () => tf("columns.periods"), html: (l) => tfPeriodsCell(l) },
    { label: () => tf("columns.minMax"), html: (l) => `<div class="identity-cell"><span>${tf("fields.min")} ${tfNum(l.min)}</span><span class="table-cell-muted">${tf("fields.max")} ${tfNum(l.max)}</span></div>` },
    { label: () => tf("columns.window"), html: (l) => (l.isRolling ? tfBadge("badge-warning", tf("limits.rolling")) : tf("limits.calendar")) },
    { label: () => tf("columns.bindings"), html: (l) => tfBindingsLabel(l.tariffOperationIds) },
    { label: () => tf("columns.client"), html: (l) => (l.clientId ? tfClientLink(tfClientById(l.clientId)) : `<span class="table-cell-muted">—</span>`) },
    { label: () => tf("columns.updated"), html: (l) => dateTimeCell(l.updatedAt) },
  ],
  attachRows: vbAttachRows,
});

const TF_LIMIT_NUM_FIELDS = ["daily", "weekly", "monthly", "annual", "min", "max"];

function tfLimitNumbersFields(l) {
  const g = (k) => (l ? l[k] : null);
  return [
    { id: "daily", label: tf("fields.daily"), type: "number", required: true, half: true, value: l ? l.daily : "" },
    { id: "weekly", label: tf("fields.weekly"), type: "number", required: true, half: true, value: l ? l.weekly : "" },
    { id: "monthly", label: tf("fields.monthly"), type: "number", required: true, half: true, value: l ? l.monthly : "" },
    { id: "annual", label: tf("fields.annual"), type: "number", required: true, half: true, value: l ? l.annual : "" },
    { id: "min", label: tf("fields.min"), type: "number", half: true, value: g("min") },
    { id: "max", label: tf("fields.max"), type: "number", half: true, value: g("max") },
  ];
}

function tfValidateLimitForm(v, limit) {
  if (!v.name) return tf("limits.form.errName");
  for (const k of ["daily", "weekly", "monthly", "annual"]) if (v[k] === null || Number.isNaN(v[k]) || v[k] < 0) return tf("limits.form.errNumber")(tf(`fields.${k}`));
  for (const k of ["min", "max"]) if (Number.isNaN(v[k]) || (v[k] !== null && v[k] < 0)) return tf("limits.form.errNumber")(tf(`fields.${k}`));
  const restr = v.restriction ? tfRestrictionById(v.restriction) : null;
  if (restr && limit && restr.currencyTicker !== limit.currencyTicker) return tf("errors.restrictionCurrency");
  if (restr && !limit && restr.currencyTicker !== v.currency) return tf("errors.restrictionCurrency");
  const e = tfValidateLimitValues(v, restr);
  return e ? tf(`errors.${e}`) : null;
}

function tfOpenLimitForm(limit) {
  const f = tf("limits.form");
  const isEdit = !!limit;
  const restrictionOptions = [{ value: "", label: "—" }, ...TF_RESTRICTIONS.map((r) => ({ value: r.id, label: `${r.name} · ${r.currencyTicker}` }))];
  const fields = [
    { id: "name", label: tf("fields.name"), required: true, value: isEdit ? limit.name : "" },
    { id: "description", label: tf("fields.description"), value: isEdit ? limit.description || "" : "" },
    ...(isEdit ? [] : [{ id: "currency", label: tf("fields.currency"), type: "select", options: TF_TICKERS.map((c) => ({ value: c, label: c })), value: "USDT", half: true }]),
    ...(isEdit ? [] : [{ id: "isBase", label: f.isBase, type: "checkbox", value: true }]),
    { id: "isRolling", label: f.isRolling, type: "checkbox", value: isEdit ? limit.isRolling : false, hint: f.rollingHint },
    ...tfLimitNumbersFields(limit),
    { id: "restriction", label: tf("fields.restriction"), type: "select", options: restrictionOptions, value: isEdit ? limit.restrictionId || "" : "", hint: f.restrictionHint },
    ...(isEdit ? [] : [
      { id: "client", label: f.client, type: "select", options: tfClientOptions(true), value: "", hint: f.clientHint },
      { id: "tariffs", label: f.tariffs, type: "checks", options: tfLiveTariffs().filter((x) => !x.ownerClientId).map((x) => ({ value: x.id, label: pdEscape(x.name) })), value: [] },
      { id: "operation", label: f.operation, type: "select", options: TF_OPERATIONS.map((o) => ({ value: o.id, label: o.name })), value: TF_OPERATIONS[0].id, hint: f.operationHint },
    ]),
  ];
  tfOpenForm({
    title: isEdit ? f.editTitle : f.createTitle,
    width: 640,
    intro: isEdit ? f.editIntro : f.createIntro,
    fields,
    submitLabel: isEdit ? vt("common.save") : vt("common.create"),
    validate: (v) => {
      const err = tfValidateLimitForm(v, limit);
      if (err) return err;
      if (!isEdit) {
        if (!v.tariffs.length) return f.errTariffs;
        const opIds = v.tariffs.map((tid) => (tfTariffOp(tid, tfOperationById(v.operation).name) || {}).id);
        if (opIds.some((id) => !id)) return f.errNotAssociated;
        const draft = { clientId: v.client || null, currencyTicker: v.currency, isBaseCurrency: v.isBase };
        const clash = tfValidateLimitBindings(draft, opIds, null);
        if (clash) return `${tf(`errors.${clash.key}`)} (${tfTariffOpLabel(clash.at)})`;
        if (!v.isBase && opIds.some((id) => !TF_LIMITS.some((l) => l.clientId === draft.clientId && l.isBaseCurrency && l.tariffOperationIds.includes(id)))) return tf("errors.limitRequireBase");
      }
      return null;
    },
    confirm: isEdit ? () => f.confirmEdit(tfAffectedClients(limit.tariffOperationIds)) : null,
    onSave: (v) => {
      const now = pdNow();
      const nums = { daily: v.daily, weekly: v.weekly, monthly: v.monthly, annual: v.annual, min: v.min, max: v.max };
      if (isEdit) {
        Object.assign(limit, { name: v.name, description: v.description || null, isRolling: v.isRolling, restrictionId: v.restriction || null, ...nums });
        acTouch(limit);
        tfSnapshotLimit(limit, now);
        return;
      }
      const opIds = v.tariffs.map((tid) => tfTariffOp(tid, tfOperationById(v.operation).name).id);
      const created = tfStamp({ id: tfId(), name: v.name, description: v.description || null, currencyTicker: v.currency, isBaseCurrency: v.isBase, isRolling: v.isRolling, ...nums, clientId: v.client || null, restrictionId: v.restriction || null, tariffOperationIds: opIds, changes: [] }, now);
      tfSnapshotLimit(created, now);
      TF_LIMITS.unshift(created);
      window.location.hash = `#/settings-tariffs-limits/${created.id}`;
    },
  });
}

function tfOpenBindLimit(limit) {
  const f = tf("limits.bind");
  const options = tfTariffOpOptions(limit.tariffOperationIds);
  if (!options.length) { vbConfirm({ title: f.title, text: f.none, confirmLabel: vt("common.close"), danger: false, onConfirm: () => {} }); return; }
  tfOpenForm({
    title: f.title,
    width: 560,
    intro: f.intro,
    fields: [{ id: "ids", label: f.select, type: "checks", options, value: [] }],
    submitLabel: f.submit,
    validate: (v) => {
      if (!v.ids.length) return f.errNone;
      const clash = tfValidateLimitBindings(limit, v.ids, limit.id);
      return clash ? `${tf(`errors.${clash.key}`)} (${tfTariffOpLabel(clash.at)})` : null;
    },
    onSave: (v) => { limit.tariffOperationIds = [...limit.tariffOperationIds, ...v.ids]; acTouch(limit); },
  });
}

function tfChangeBaseLimit(limit) {
  const others = TF_LIMITS.filter((l) => l !== limit && l.isBaseCurrency && l.clientId === limit.clientId && l.tariffOperationIds.some((id) => limit.tariffOperationIds.includes(id)));
  vbConfirm({
    title: tf("common.confirmTitle"),
    text: tf("limits.confirmBase")(pdEscape(limit.name), others.length),
    confirmLabel: tf("limits.makeBase"),
    danger: true,
    onConfirm: () => { others.forEach((l) => { l.isBaseCurrency = false; acTouch(l); }); limit.isBaseCurrency = true; acTouch(limit); render(); },
  });
}

function viewLimitDetail(id) {
  const l = tfLimitById(id);
  if (!l) return vbNotFound();
  const f = tf("fields");
  const d = tf("limits.detail");
  const restr = l.restrictionId ? tfRestrictionById(l.restrictionId) : null;
  const client = l.clientId ? tfClientById(l.clientId) : null;
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, l.id)}${detailField(f.currency, `${l.currencyTicker}${l.isBaseCurrency ? ` ${tfBadge("badge-info", tf("common.base"))}` : ""}`)}${detailField(f.description, l.description ? pdEscape(l.description) : "—")}
    ${detailField(f.window, l.isRolling ? tfBadge("badge-warning", tf("limits.rolling")) : tf("limits.calendar"))}
    ${detailField(f.daily, tfNum(l.daily, l.currencyTicker))}${detailField(f.weekly, tfNum(l.weekly, l.currencyTicker))}${detailField(f.monthly, tfNum(l.monthly, l.currencyTicker))}${detailField(f.annual, tfNum(l.annual, l.currencyTicker))}
    ${detailField(f.min, tfNum(l.min, l.currencyTicker))}${detailField(f.max, tfNum(l.max, l.currencyTicker))}
    ${detailField(f.client, client ? tfClientLink(client) : d.shared)}${detailField(f.restriction, restr ? `${pdEscape(restr.name)}` : "—")}
    ${detailField(f.created, l.createdAt)}${detailField(f.updated, l.updatedAt)}
  </div>`;
  const bindRows = l.tariffOperationIds.map((bid) => {
    const b = tfTariffOpById(bid);
    return [b ? tfTariffLink(tfTariffById(b.tariffId)) : "—", b ? tfMono((tfOperationById(b.operationId) || {}).name) : "—", `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn sl-del" data-tf-unbind="${bid}">${d.unbind}</button></div>`];
  });
  const bindings = `${vbMiniTable([tf("columns.tariff"), f.operation, ""], bindRows, d.noBindings)}<div class="vf-cfg-actions"><button type="button" class="btn-secondary" data-tf-act="bind">${d.bind}</button></div><p class="table-cell-muted vb-note">${d.poolNote}</p>`;
  const restrBlock = restr ? `<div class="profile-fields profile-fields-grid">${detailField(f.name, pdEscape(restr.name))}${detailField(f.currency, restr.currencyTicker)}${detailField(f.maxDaily, tfNum(restr.maxDaily, restr.currencyTicker))}${detailField(f.maxWeekly, tfNum(restr.maxWeekly, restr.currencyTicker))}${detailField(f.maxMonthly, tfNum(restr.maxMonthly, restr.currencyTicker))}${detailField(f.maxAnnual, tfNum(restr.maxAnnual, restr.currencyTicker))}</div><p class="table-cell-muted vb-note">${d.restrictionNote}</p>` : `<div class="table-cell-muted">${d.noRestriction}</div>`;
  const histRows = l.changes.map((c) => [dateTimeCell(c.createdAt), tfNum(c.daily), tfNum(c.weekly), tfNum(c.monthly), tfNum(c.annual), tfNum(c.min), tfNum(c.max)]);
  const history = vbMiniTable([f.created, f.daily, f.weekly, f.monthly, f.annual, f.min, f.max], histRows, d.noHistory);
  const actions = `<button type="button" class="btn-secondary" data-tf-act="edit">${vt("common.edit")}</button>${l.isBaseCurrency ? "" : `<button type="button" class="btn-secondary" data-tf-act="base">${tf("limits.makeBase")}</button>`}<button type="button" class="btn-danger" data-tf-act="delete">${vt("common.delete")}</button>`;
  return `<div id="tf-root">
    ${vbDetailHeader({ backHash: "#/settings-tariffs-limits", title: pdEscape(l.name), badges: `${l.isBaseCurrency ? tfBadge("badge-info", tf("common.base")) : ""}${l.isRolling ? tfBadge("badge-warning", tf("limits.rolling")) : ""}${client ? tfBadge("badge-neutral", tf("common.personal")) : ""}`, subtitle: vbIdSubtitle(l.id, [l.currencyTicker, l.createdAt]), actions })}
    <div class="pd-grid">
      <div class="pd-col"><div class="profile-flat-block">${flatSection(d.general, main)}${flatSection(`${d.bindings} · ${l.tariffOperationIds.length}`, bindings)}</div></div>
      <div class="pd-col">${sectionCard(d.restriction, restrBlock)}${sectionCard(`${d.history} · ${l.changes.length}`, history, "is-collapsed")}</div>
    </div>
  </div>`;
}

function initLimitDetail(id) {
  const l = tfLimitById(id);
  const root = document.getElementById("tf-root");
  if (!l || !root) return;
  vbAttachCommon(root);
  const act = (n) => root.querySelector(`[data-tf-act="${n}"]`);
  act("edit").addEventListener("click", () => tfOpenLimitForm(l));
  act("bind").addEventListener("click", () => tfOpenBindLimit(l));
  const base = act("base");
  if (base) base.addEventListener("click", () => tfChangeBaseLimit(l));
  act("delete").addEventListener("click", () => tfConfirmDelete({ text: tf("limits.detail.confirmDelete")(pdEscape(l.name), tfAffectedClients(l.tariffOperationIds)), onConfirm: () => { TF_LIMITS.splice(TF_LIMITS.indexOf(l), 1); window.location.hash = "#/settings-tariffs-limits"; } }));
  root.querySelectorAll("[data-tf-unbind]").forEach((b) => b.addEventListener("click", () => {
    const bid = b.dataset.tfUnbind;
    vbConfirm({ title: tf("common.confirmTitle"), text: tf("limits.detail.confirmUnbind")(tfTariffOpLabel(bid)), confirmLabel: tf("limits.detail.unbind"), danger: true, onConfirm: () => { l.tariffOperationIds = l.tariffOperationIds.filter((x) => x !== bid); acTouch(l); render(); } });
  }));
}

// ==== Ограничения лимитов ===============================================================================================
const tfRestrictionsList = createAccessList({
  key: "tf-restr",
  data: () => TF_RESTRICTIONS,
  searchPlaceholder: () => tf("restrictions.search"),
  searchText: (r) => [r.id, r.name, r.description].filter(Boolean).join(" "),
  filters: [
    { id: "currency", kind: "multi", label: () => tf("filters.currency"), get: (r) => r.currencyTicker, options: () => [...new Set(TF_RESTRICTIONS.map((r) => r.currencyTicker))].map((v) => ({ value: v, label: v })) },
    { id: "created", kind: "date", label: () => tf("filters.created"), get: (r) => r.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name) },
  metrics: (list) => {
    const m = tf("restrictions.metrics");
    return [{ value: list.length, label: m.total }, { value: list.reduce((n, r) => n + TF_LIMITS.filter((l) => l.restrictionId === r.id).length, 0), label: m.limits }, { value: list.filter((r) => !TF_LIMITS.some((l) => l.restrictionId === r.id)).length, label: m.unused }];
  },
  columns: [
    { label: () => tf("columns.name"), sort: "name", html: (r) => `<div class="identity-cell"><span>${pdEscape(r.name)}</span><span class="table-cell-muted ed-desc">${pdEscape(r.description || "")}</span></div>` },
    { label: () => tf("columns.currency"), html: (r) => r.currencyTicker },
    { label: () => tf("columns.periods"), html: (r) => tfPeriodsCell({ ...r, daily: r.maxDaily, weekly: r.maxWeekly, monthly: r.maxMonthly, annual: r.maxAnnual }) },
    { label: () => tf("columns.minMax"), html: (r) => `<div class="identity-cell"><span>${tf("fields.min")} ${tfNum(r.min)}</span><span class="table-cell-muted">${tf("fields.max")} ${tfNum(r.max)}</span></div>` },
    { label: () => tf("columns.limits"), html: (r) => TF_LIMITS.filter((l) => l.restrictionId === r.id).length },
    { label: () => tf("columns.updated"), html: (r) => dateTimeCell(r.updatedAt) },
    { label: () => "", html: (r) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-tf-restr-edit="${r.id}">${vt("common.edit")}</button><button type="button" class="btn-secondary vb-row-btn sl-del" data-tf-restr-del="${r.id}">${TRASH_ICON_SVG}</button></div>` },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-tf-restr-edit]").forEach((b) => b.addEventListener("click", () => tfOpenRestrictionForm(tfRestrictionById(b.dataset.tfRestrEdit))));
    wrap.querySelectorAll("[data-tf-restr-del]").forEach((b) => b.addEventListener("click", () => {
      const r = tfRestrictionById(b.dataset.tfRestrDel);
      const used = TF_LIMITS.filter((l) => l.restrictionId === r.id).length;
      tfConfirmDelete({ text: tf("restrictions.confirmDelete")(pdEscape(r.name), used), onConfirm: () => { TF_LIMITS.forEach((l) => { if (l.restrictionId === r.id) l.restrictionId = null; }); TF_RESTRICTIONS.splice(TF_RESTRICTIONS.indexOf(r), 1); } });
    }));
  },
});

function tfOpenRestrictionForm(r) {
  const f = tf("restrictions.form");
  const isEdit = !!r;
  const g = (k) => (r ? r[k] : null);
  tfOpenForm({
    title: isEdit ? f.editTitle : f.createTitle,
    width: 600,
    intro: f.intro,
    fields: [
      { id: "name", label: tf("fields.name"), required: true, value: isEdit ? r.name : "" },
      { id: "description", label: tf("fields.description"), value: isEdit ? r.description || "" : "" },
      { id: "currency", label: tf("fields.currency"), type: "select", options: TF_TICKERS.map((c) => ({ value: c, label: c })), value: isEdit ? r.currencyTicker : "USDT", disabled: isEdit },
      { id: "maxDaily", label: tf("fields.maxDaily"), type: "number", required: true, half: true, value: g("maxDaily") },
      { id: "maxWeekly", label: tf("fields.maxWeekly"), type: "number", required: true, half: true, value: g("maxWeekly") },
      { id: "maxMonthly", label: tf("fields.maxMonthly"), type: "number", required: true, half: true, value: g("maxMonthly") },
      { id: "maxAnnual", label: tf("fields.maxAnnual"), type: "number", required: true, half: true, value: g("maxAnnual") },
      { id: "min", label: tf("fields.min"), type: "number", half: true, value: g("min") },
      { id: "max", label: tf("fields.max"), type: "number", half: true, value: g("max") },
    ],
    submitLabel: isEdit ? vt("common.save") : vt("common.create"),
    validate: (v) => {
      if (!v.name) return f.errName;
      for (const k of ["maxDaily", "maxWeekly", "maxMonthly", "maxAnnual"]) if (v[k] === null || Number.isNaN(v[k]) || v[k] < 0) return f.errNumber(tf(`fields.${k}`));
      for (const k of ["min", "max"]) if (Number.isNaN(v[k]) || (v[k] !== null && v[k] < 0)) return f.errNumber(tf(`fields.${k}`));
      if (v.min !== null && v.max !== null && v.min > v.max) return tf("errors.minGtMax");
      if (isEdit) {
        const bad = TF_LIMITS.find((l) => l.restrictionId === r.id && tfValidateLimitValues(l, { ...r, maxDaily: v.maxDaily, maxWeekly: v.maxWeekly, maxMonthly: v.maxMonthly, maxAnnual: v.maxAnnual, min: v.min, max: v.max }));
        if (bad) return f.errRatio(bad.name);
      }
      return null;
    },
    confirm: isEdit ? () => f.confirmEdit : null,
    onSave: (v) => {
      const vals = { name: v.name, description: v.description || null, maxDaily: v.maxDaily, maxWeekly: v.maxWeekly, maxMonthly: v.maxMonthly, maxAnnual: v.maxAnnual, min: v.min, max: v.max };
      if (isEdit) { Object.assign(r, vals); acTouch(r); return; }
      TF_RESTRICTIONS.unshift(tfStamp({ id: tfId(), currencyTicker: v.currency, ...vals }, pdNow()));
    },
  });
}

// ==== Комиссии ===========================================================================================================
function tfFactorText(fa, ticker) {
  const parts = [];
  if (fa.percent !== null) parts.push(`${fa.percent}%`);
  if (fa.fixed !== null) parts.push(`+ ${tfNum(fa.fixed, ticker)}`);
  if (fa.min !== null) parts.push(`min ${tfNum(fa.min)}`);
  if (fa.max !== null) parts.push(`max ${tfNum(fa.max)}`);
  return parts.join(" · ") || "—";
}

const tfCommissionsList = createAccessList({
  key: "tf-comm",
  data: () => TF_COMMISSIONS,
  searchPlaceholder: () => tf("commissions.search"),
  searchText: (c) => [c.id, c.name, c.description, c.whitelabelId].filter(Boolean).join(" "),
  tab: { get: (c) => (c.clientId ? "personal" : "shared"), values: ["shared", "personal"], label: (v) => tf(`common.${v}Tab`) },
  filters: [
    { id: "currency", kind: "multi", label: () => tf("filters.currency"), get: (c) => c.currencyTicker, options: () => [...new Set(TF_COMMISSIONS.map((c) => c.currencyTicker))].map((v) => ({ value: v, label: v })) },
    { id: "tariff", kind: "multi", label: () => tf("filters.tariff"), get: (c) => [...new Set(c.tariffOperationIds.map((id) => (tfTariffOpById(id) || {}).tariffId))], options: () => tfLiveTariffs().map((x) => ({ value: x.id, label: x.name })) },
    { id: "operation", kind: "multi", label: () => tf("filters.operation"), get: (c) => [...new Set(c.tariffOperationIds.map((id) => (tfTariffOpById(id) || {}).operationId))], options: () => TF_OPERATIONS.map((o) => ({ value: o.id, label: o.name })) },
    { id: "created", kind: "date", label: () => tf("filters.created"), get: (c) => c.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name), created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = tf("commissions.metrics");
    return [{ value: list.reduce((n, c) => n + c.factors.length, 0), label: m.factors }, { value: list.filter((c) => c.factors.length > 1).length, label: m.multi }, { value: list.filter((c) => !c.tariffOperationIds.length).length, label: m.unbound }];
  },
  columns: [
    { label: () => tf("columns.name"), sort: "name", html: (c) => `<div class="identity-cell">${vbLink(`#/settings-tariffs-commissions/${c.id}`, pdEscape(c.name))}${vbIdCell(c.id)}</div>` },
    { label: () => tf("columns.currency"), html: (c) => `<div class="identity-cell"><span>${c.currencyTicker}</span>${c.isBaseCurrency ? `<span class="badge badge-info tf-mini">${tf("common.base")}</span>` : ""}</div>` },
    { label: () => tf("columns.factors"), html: (c) => `<div class="identity-cell"><span>${c.factors.length}</span><span class="table-cell-muted">${c.factors[0] ? tfFactorText(c.factors[0], c.currencyTicker) : ""}</span></div>` },
    { label: () => tf("columns.bindings"), html: (c) => tfBindingsLabel(c.tariffOperationIds) },
    { label: () => tf("columns.client"), html: (c) => (c.clientId ? tfClientLink(tfClientById(c.clientId)) : `<span class="table-cell-muted">—</span>`) },
    { label: () => tf("columns.updated"), html: (c) => dateTimeCell(c.updatedAt) },
  ],
  attachRows: vbAttachRows,
});

function tfFactorFields(fa) {
  const g = (k) => (fa ? fa[k] : null);
  return [
    { id: "name", label: tf("fields.name"), required: true, half: true, value: fa ? fa.name : "System fee" },
    { id: "type", label: tf("fields.type"), required: true, half: true, value: fa ? fa.type : "SYSTEM" },
    { id: "amountFrom", label: tf("fields.amountFrom"), type: "number", required: true, half: true, value: fa ? fa.amountFrom : 0 },
    { id: "amountTo", label: tf("fields.amountTo"), type: "number", required: true, half: true, value: fa ? fa.amountTo : 1000000000 },
    { id: "percent", label: tf("fields.percent"), type: "number", half: true, value: g("percent") },
    { id: "fixed", label: tf("fields.fixed"), type: "number", half: true, value: g("fixed") },
    { id: "min", label: tf("fields.min"), type: "number", half: true, value: g("min") },
    { id: "max", label: tf("fields.max"), type: "number", half: true, value: g("max") },
    { id: "order", label: tf("fields.order"), type: "number", required: true, value: fa ? fa.order : "", hint: tf("commissions.factorForm.orderHint") },
    { id: "formula", label: tf("fields.formula"), value: g("formula") || "", hint: tf("commissions.factorForm.formulaHint") },
    { id: "conditions", label: tf("fields.conditions"), type: "json", rows: 2, value: fa && fa.conditions ? JSON.parse(fa.conditions) : "" },
  ];
}

function tfValidateFactor(v, commission, factor) {
  const m = tf("commissions.factorForm");
  if (!v.name || !v.type) return m.errName;
  for (const k of ["amountFrom", "amountTo", "percent", "fixed", "min", "max"]) if (Number.isNaN(v[k]) || (v[k] !== null && v[k] < 0)) return tf("errors.factorNegative");
  if (v.amountFrom === null || v.amountTo === null) return m.errRange;
  if (v.amountFrom > v.amountTo) return tf("errors.factorFromGtTo");
  if (v.min !== null && v.max !== null && v.min > v.max) return tf("errors.factorMinGtMax");
  if (v.order === null || Number.isNaN(v.order) || !Number.isInteger(v.order) || v.order < 1) return tf("errors.factorOrder");
  if (commission.factors.some((x) => x !== factor && x.order === v.order)) return tf("errors.factorOrder");
  if (v.conditions === undefined || (v.conditions !== null && !tfJsonObject(v.conditions))) return m.errConditions;
  if (v.percent === null && v.fixed === null && !v.formula) return m.errNoValue;
  return null;
}

function tfFactorFromValues(v) {
  return { name: v.name, type: v.type, amountFrom: v.amountFrom, amountTo: v.amountTo, percent: v.percent, fixed: v.fixed, min: v.min, max: v.max, order: v.order, formula: v.formula || null, conditions: v.conditions ? JSON.stringify(v.conditions) : null };
}

function tfOpenFactorForm(commission, factor) {
  const m = tf("commissions.factorForm");
  tfOpenForm({
    title: factor ? m.editTitle : m.createTitle,
    width: 600,
    intro: m.intro,
    fields: tfFactorFields(factor).map((f) => (f.id === "order" && !factor ? { ...f, value: Math.max(0, ...commission.factors.map((x) => x.order)) + 1 } : f)),
    submitLabel: factor ? vt("common.save") : vt("common.create"),
    validate: (v) => tfValidateFactor(v, commission, factor),
    confirm: factor ? () => m.confirmEdit(tfAffectedClients(commission.tariffOperationIds)) : null,
    onSave: (v) => {
      if (factor) Object.assign(factor, tfFactorFromValues(v));
      else commission.factors.push({ id: tfId(), description: null, ...tfFactorFromValues(v) });
      acTouch(commission);
    },
  });
}

function tfOpenCommissionForm(c) {
  const f = tf("commissions.form");
  const isEdit = !!c;
  const fields = isEdit
    ? [
        { id: "name", label: tf("fields.name"), required: true, value: c.name },
        { id: "description", label: tf("fields.description"), value: c.description || "" },
        { id: "whitelabel", label: tf("fields.whitelabel"), value: c.whitelabelId || "" },
      ]
    : [
        { id: "name", label: tf("fields.name"), required: true, value: "" },
        { id: "description", label: tf("fields.description"), value: "" },
        { id: "currency", label: tf("fields.currency"), type: "select", options: TF_TICKERS.map((x) => ({ value: x, label: x })), value: "USDT", half: true },
        { id: "whitelabel", label: tf("fields.whitelabel"), value: "", half: true },
        { id: "isBase", label: f.isBase, type: "checkbox", value: true },
        { id: "client", label: f.client, type: "select", options: tfClientOptions(true), value: "", hint: f.clientHint },
        { id: "tariffs", label: f.tariffs, type: "checks", options: tfLiveTariffs().filter((x) => !x.ownerClientId).map((x) => ({ value: x.id, label: pdEscape(x.name) })), value: [] },
        { id: "operation", label: f.operation, type: "select", options: TF_OPERATIONS.map((o) => ({ value: o.id, label: o.name })), value: TF_OPERATIONS[0].id },
        ...tfFactorFields(null).map((x) => ({ ...x, id: `f_${x.id}`, label: `${f.factorPrefix}: ${x.label}`, value: x.id === "order" ? 1 : x.value })),
      ];
  tfOpenForm({
    title: isEdit ? f.editTitle : f.createTitle,
    width: 640,
    intro: isEdit ? f.editIntro : f.createIntro,
    fields,
    submitLabel: isEdit ? vt("common.save") : vt("common.create"),
    validate: (v) => {
      if (!v.name) return f.errName;
      if (isEdit) return null;
      const fv = { name: v.f_name, type: v.f_type, amountFrom: v.f_amountFrom, amountTo: v.f_amountTo, percent: v.f_percent, fixed: v.f_fixed, min: v.f_min, max: v.f_max, order: v.f_order, formula: v.f_formula, conditions: v.f_conditions };
      const fe = tfValidateFactor(fv, { factors: [] }, null);
      if (fe) return fe;
      if (!v.tariffs.length) return f.errTariffs;
      const opName = tfOperationById(v.operation).name;
      const opIds = v.tariffs.map((tid) => (tfTariffOp(tid, opName) || {}).id);
      if (opIds.some((id) => !id)) return tf("limits.form.errNotAssociated");
      const clientId = v.client || null;
      for (const id of opIds) {
        const others = TF_COMMISSIONS.filter((x) => x.clientId === clientId && x.tariffOperationIds.includes(id));
        if (others.some((x) => x.currencyTicker === v.currency)) return `${tf("errors.commissionExists")} (${tfTariffOpLabel(id)})`;
        if (v.isBase && others.some((x) => x.isBaseCurrency)) return `${tf("errors.baseAlreadyExists")} (${tfTariffOpLabel(id)})`;
        if (!v.isBase && !others.some((x) => x.isBaseCurrency)) return tf("errors.commissionRequireBase");
      }
      return null;
    },
    onSave: (v) => {
      const now = pdNow();
      if (isEdit) { Object.assign(c, { name: v.name, description: v.description || null, whitelabelId: v.whitelabel || null }); acTouch(c); return; }
      const opName = tfOperationById(v.operation).name;
      const opIds = v.tariffs.map((tid) => tfTariffOp(tid, opName).id);
      const fv = { name: v.f_name, type: v.f_type, amountFrom: v.f_amountFrom, amountTo: v.f_amountTo, percent: v.f_percent, fixed: v.f_fixed, min: v.f_min, max: v.f_max, order: v.f_order, formula: v.f_formula, conditions: v.f_conditions };
      const created = tfStamp({ id: tfId(), name: v.name, description: v.description || null, currencyTicker: v.currency, isBaseCurrency: v.isBase, whitelabelId: v.whitelabel || null, clientId: v.client || null, tariffOperationIds: opIds, factors: [{ id: tfId(), description: null, ...tfFactorFromValues(fv) }] }, now);
      TF_COMMISSIONS.unshift(created);
      window.location.hash = `#/settings-tariffs-commissions/${created.id}`;
    },
  });
}

function tfOpenBindCommission(c) {
  const f = tf("commissions.bind");
  const options = tfTariffOpOptions(c.tariffOperationIds);
  if (!options.length) { vbConfirm({ title: f.title, text: f.none, confirmLabel: vt("common.close"), danger: false, onConfirm: () => {} }); return; }
  tfOpenForm({
    title: f.title,
    width: 560,
    intro: f.intro,
    fields: [{ id: "ids", label: f.select, type: "checks", options, value: [] }],
    submitLabel: f.submit,
    validate: (v) => {
      if (!v.ids.length) return f.errNone;
      for (const id of v.ids) {
        const others = TF_COMMISSIONS.filter((x) => x !== c && x.clientId === c.clientId && x.tariffOperationIds.includes(id));
        if (others.some((x) => x.currencyTicker === c.currencyTicker)) return `${tf("errors.commissionExists")} (${tfTariffOpLabel(id)})`;
        if (c.isBaseCurrency && others.some((x) => x.isBaseCurrency)) return `${tf("errors.baseAlreadyExists")} (${tfTariffOpLabel(id)})`;
      }
      return null;
    },
    onSave: (v) => { c.tariffOperationIds = [...c.tariffOperationIds, ...v.ids]; acTouch(c); },
  });
}

function viewCommissionDetail(id) {
  const c = tfCommissionById(id);
  if (!c) return vbNotFound();
  const f = tf("fields");
  const d = tf("commissions.detail");
  const client = c.clientId ? tfClientById(c.clientId) : null;
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, c.id)}${detailField(f.currency, `${c.currencyTicker}${c.isBaseCurrency ? ` ${tfBadge("badge-info", tf("common.base"))}` : ""}`)}${detailField(f.description, c.description ? pdEscape(c.description) : "—")}
    ${detailField(f.whitelabel, c.whitelabelId ? tfMono(c.whitelabelId) : "—")}${detailField(f.client, client ? tfClientLink(client) : d.shared)}${detailField(f.created, c.createdAt)}${detailField(f.updated, c.updatedAt)}
  </div>`;
  const factorRows = c.factors.slice().sort((a, b) => a.order - b.order).map((fa) => [fa.order, `<strong>${pdEscape(fa.name)}</strong>`, fa.type, `${tfNum(fa.amountFrom)} — ${fa.amountTo >= 1000000000 ? "∞" : tfNum(fa.amountTo)}`, fa.percent === null ? "—" : `${fa.percent}%`, tfNum(fa.fixed), tfNum(fa.min), tfNum(fa.max), fa.formula ? tfMono(fa.formula) : "—", fa.conditions ? tfMono(fa.conditions) : "—", `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-tf-factor-edit="${fa.id}">${vt("common.edit")}</button><button type="button" class="btn-secondary vb-row-btn sl-del" data-tf-factor-del="${fa.id}">${TRASH_ICON_SVG}</button></div>`]);
  const factors = `${vbMiniTable([f.order, f.name, f.type, f.amountRange, f.percent, f.fixed, f.min, f.max, f.formula, f.conditions, ""], factorRows, d.noFactors)}<div class="vf-cfg-actions"><button type="button" class="btn-secondary" data-tf-act="addFactor">${d.addFactor}</button></div><p class="table-cell-muted vb-note">${d.formulaNote}</p>`;
  const bindRows = c.tariffOperationIds.map((bid) => { const b = tfTariffOpById(bid); return [b ? tfTariffLink(tfTariffById(b.tariffId)) : "—", b ? tfMono((tfOperationById(b.operationId) || {}).name) : "—", `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn sl-del" data-tf-unbind="${bid}">${tf("limits.detail.unbind")}</button></div>`]; });
  const bindings = `${vbMiniTable([tf("columns.tariff"), f.operation, ""], bindRows, d.noBindings)}<div class="vf-cfg-actions"><button type="button" class="btn-secondary" data-tf-act="bind">${d.bind}</button></div>`;
  const firstTariff = c.tariffOperationIds.map((bid) => tfTariffById((tfTariffOpById(bid) || {}).tariffId)).find(Boolean);
  const actions = `<button type="button" class="btn-secondary" data-tf-act="edit">${vt("common.edit")}</button>${firstTariff ? `<button type="button" class="btn-secondary" data-tf-act="calc">${d.calc}</button>` : ""}${c.isBaseCurrency ? "" : `<button type="button" class="btn-secondary" data-tf-act="base">${tf("limits.makeBase")}</button>`}<button type="button" class="btn-danger" data-tf-act="delete">${vt("common.delete")}</button>`;
  return `<div id="tf-root">
    ${vbDetailHeader({ backHash: "#/settings-tariffs-commissions", title: pdEscape(c.name), badges: `${c.isBaseCurrency ? tfBadge("badge-info", tf("common.base")) : ""}${client ? tfBadge("badge-neutral", tf("common.personal")) : ""}`, subtitle: vbIdSubtitle(c.id, [c.currencyTicker, c.createdAt]), actions })}
    <div class="pd-grid">
      <div class="pd-col"><div class="profile-flat-block">${flatSection(d.general, main)}${flatSection(`${d.factors} · ${c.factors.length}`, factors)}</div></div>
      <div class="pd-col">${sectionCard(`${d.bindings} · ${c.tariffOperationIds.length}`, bindings)}</div>
    </div>
  </div>`;
}

function initCommissionDetail(id) {
  const c = tfCommissionById(id);
  const root = document.getElementById("tf-root");
  if (!c || !root) return;
  vbAttachCommon(root);
  const act = (n) => root.querySelector(`[data-tf-act="${n}"]`);
  act("edit").addEventListener("click", () => tfOpenCommissionForm(c));
  act("addFactor").addEventListener("click", () => tfOpenFactorForm(c, null));
  act("bind").addEventListener("click", () => tfOpenBindCommission(c));
  const calc = act("calc");
  if (calc) calc.addEventListener("click", () => tfOpenCalc({ tariff: c.tariffOperationIds.map((bid) => tfTariffById((tfTariffOpById(bid) || {}).tariffId)).find(Boolean) }));
  const base = act("base");
  if (base) base.addEventListener("click", () => {
    const others = TF_COMMISSIONS.filter((x) => x !== c && x.isBaseCurrency && x.clientId === c.clientId && x.tariffOperationIds.some((i) => c.tariffOperationIds.includes(i)));
    vbConfirm({ title: tf("common.confirmTitle"), text: tf("commissions.confirmBase")(pdEscape(c.name), others.length), confirmLabel: tf("limits.makeBase"), danger: true, onConfirm: () => { others.forEach((x) => { x.isBaseCurrency = false; acTouch(x); }); c.isBaseCurrency = true; acTouch(c); render(); } });
  });
  act("delete").addEventListener("click", () => tfConfirmDelete({ text: tf("commissions.detail.confirmDelete")(pdEscape(c.name), tfAffectedClients(c.tariffOperationIds)), onConfirm: () => { TF_COMMISSIONS.splice(TF_COMMISSIONS.indexOf(c), 1); window.location.hash = "#/settings-tariffs-commissions"; } }));
  root.querySelectorAll("[data-tf-factor-edit]").forEach((b) => b.addEventListener("click", () => tfOpenFactorForm(c, c.factors.find((x) => x.id === b.dataset.tfFactorEdit))));
  root.querySelectorAll("[data-tf-factor-del]").forEach((b) => b.addEventListener("click", () => {
    const fa = c.factors.find((x) => x.id === b.dataset.tfFactorDel);
    tfConfirmDelete({ text: tf("commissions.detail.confirmDeleteFactor")(pdEscape(fa.name)), onConfirm: () => { c.factors.splice(c.factors.indexOf(fa), 1); acTouch(c); } });
  }));
  root.querySelectorAll("[data-tf-unbind]").forEach((b) => b.addEventListener("click", () => {
    const bid = b.dataset.tfUnbind;
    vbConfirm({ title: tf("common.confirmTitle"), text: tf("limits.detail.confirmUnbind")(tfTariffOpLabel(bid)), confirmLabel: tf("limits.detail.unbind"), danger: true, onConfirm: () => { c.tariffOperationIds = c.tariffOperationIds.filter((x) => x !== bid); acTouch(c); render(); } });
  }));
}

// ==== Обёртки для роутера ===================================================================================================
function viewTariffsLimits() {
  return `<div class="list-hero">${pageHeader(tf("titles.limits"), t("navDescriptions.settings-tariffs-limits"), `<button type="button" class="btn-primary" id="tf-limit-create">+ ${tf("limits.create")}</button>`)}</div>${tfLimitsList.view()}`;
}
function initTariffsLimits() {
  tfLimitsList.init();
  const b = document.getElementById("tf-limit-create");
  if (b) b.addEventListener("click", () => tfOpenLimitForm(null));
}
function viewTariffsRestrictions() {
  return `<div class="list-hero">${pageHeader(tf("titles.restrictions"), t("navDescriptions.settings-tariffs-restrictions"), `<button type="button" class="btn-primary" id="tf-restr-create">+ ${tf("restrictions.create")}</button>`)}</div>${tfRestrictionsList.view()}`;
}
function initTariffsRestrictions() {
  tfRestrictionsList.init();
  const b = document.getElementById("tf-restr-create");
  if (b) b.addEventListener("click", () => tfOpenRestrictionForm(null));
}
function viewTariffsCommissions() {
  return `<div class="list-hero">${pageHeader(tf("titles.commissions"), t("navDescriptions.settings-tariffs-commissions"), `<button type="button" class="btn-primary" id="tf-comm-create">+ ${tf("commissions.create")}</button>`)}</div>${tfCommissionsList.view()}`;
}
function initTariffsCommissions() {
  tfCommissionsList.init();
  const b = document.getElementById("tf-comm-create");
  if (b) b.addEventListener("click", () => tfOpenCommissionForm(null));
}
