/* ==========================================================================
   "Настройки системы → Тарифы": общая часть (хелперы, конструктор форм), каталог тарифов,
   операции, калькулятор проверки операции. Лимиты, ограничения и комиссии — в
   settings-tariffs-limits.js, клиенты, история и маски — в settings-tariffs-clients.js.
   Спецификация: docs/settings-tariffs-spec.md; данные — mock/settings-tariffs.mock.js.
   Списки построены на createAccessList, формы и подтверждения — на хелперах vb*.
   ========================================================================== */

// ---- Общие хелперы -------------------------------------------------------------------------------
function tf(path) {
  return t(`tariffs.${path}`);
}

function tfEnum(group, value) {
  const dict = tf(`enums.${group}`);
  return (dict && value != null && dict[value]) || (value == null ? "" : value);
}

function tfRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^settings-(tariffs-(catalog|limits|commissions)|masks-list)\/(.+)$/);
  if (!m) return null;
  const kind = { "tariffs-catalog": "tariff", "tariffs-limits": "limit", "tariffs-commissions": "commission", "masks-list": "mask" }[m[1]];
  return { kind, id: decodeURIComponent(m[3]) };
}

function tfNum(value, ticker) {
  if (value === null || value === undefined) return "—";
  if (value >= TF_STUB) return tf("common.unlimited");
  const digits = ticker === "BTC" ? 5 : 2;
  return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: digits })}${ticker ? ` ${ticker}` : ""}`;
}

function tfDt(d) {
  return d ? formatDateTime(d) : "—";
}

function tfMono(text) {
  return `<span class="vb-mono">${pdEscape(text)}</span>`;
}

function tfBadge(cls, text) {
  return `<span class="badge ${cls}">${text}</span>`;
}

function tfCatBadge(cat) {
  return tfBadge(cat === "CORPORATE" ? "badge-info" : "badge-neutral", tfEnum("category", cat));
}

function tfHistoryBadge(s) {
  return tfBadge({ SUCCESSFUL: "badge-success", PENDING: "badge-warning", REJECTED: "badge-danger" }[s] || "badge-neutral", tfEnum("historyStatus", s));
}

function tfIntegrationBadge(s) {
  return tfBadge({ YES: "badge-success", PARTIAL: "badge-warning", NO: "badge-danger" }[s] || "badge-neutral", tfEnum("integration", s));
}

function tfTariffLink(tariff) {
  return tariff ? vbLink(`#/settings-tariffs-catalog/${tariff.id}`, pdEscape(tariff.name)) : "—";
}

function tfClientLink(client) {
  return client ? vbLink(client.link, pdEscape(client.name)) : "—";
}

function tfTariffKind(tariff) {
  return tariff.ownerClientId ? tfBadge("badge-warning", tf("common.personal")) : tfBadge("badge-neutral", tf("common.shared"));
}

// ---- Конструктор форм: поля описываются данными, значения и проверка — одним обработчиком ----------
// type: text | number | select | textarea | checkbox | checks | json
function tfFieldHtml(f) {
  const id = `tff-${f.id}`;
  const label = `${f.label}${f.required ? " *" : ""}`;
  const dis = f.disabled ? " disabled" : "";
  const hint = f.hint ? `<div class="table-cell-muted sl-hint">${f.hint}</div>` : "";
  if (f.type === "checkbox") return `${switchRowHtml(id, f.label, f.value, { cls: "vb-field", attrs: dis.trim() })}${hint}`;
  if (f.type === "select") return `${vbSelect(id, label, f.options, f.value, dis)}${hint}`;
  if (f.type === "textarea" || f.type === "json") return `${vbTextarea(id, label, f.type === "json" && typeof f.value !== "string" ? JSON.stringify(f.value, null, 2) : f.value || "", f.rows || 4)}${hint}`;
  if (f.type === "checks") return `<div class="filters-field vb-field"><span class="filters-field-label">${label}</span><div class="ac-checklist" id="${id}">${vfCheckboxes(f.options, f.value || [], "data-tff-check")}</div></div>${hint}`;
  return `${vbInput(id, label, f.value === null || f.value === undefined ? "" : String(f.value), `${dis}${f.placeholder ? ` placeholder="${f.placeholder}"` : ""}`)}${hint}`;
}

function tfFieldsHtml(fields) {
  let html = "";
  for (let i = 0; i < fields.length; i += 1) {
    if (fields[i].half && fields[i + 1] && fields[i + 1].half) {
      html += `<div class="sl-grid">${tfFieldHtml(fields[i])}${tfFieldHtml(fields[i + 1])}</div>`;
      i += 1;
    } else html += tfFieldHtml(fields[i]);
  }
  return html;
}

// Числа: пусто → null, запятая допускается, нечисло → NaN; json: разобранное значение или undefined при ошибке
function tfReadFields(el, fields) {
  const v = {};
  fields.forEach((f) => {
    const node = el.querySelector(`#tff-${f.id}`);
    if (!node) return;
    if (f.type === "checkbox") v[f.id] = node.checked;
    else if (f.type === "checks") v[f.id] = [...node.querySelectorAll("[data-tff-check]:checked")].map((i) => i.getAttribute("data-tff-check"));
    else if (f.type === "number") {
      const raw = node.value.trim().replace(",", ".");
      v[f.id] = raw === "" ? null : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
    } else if (f.type === "json") {
      const r = vbParseJson(node.value, true);
      v[f.id] = r.ok ? r.value : undefined;
    } else v[f.id] = node.value.trim();
  });
  return v;
}

// validate(values) → строка ошибки или null; onSave(values); confirm — текст подтверждения перед сохранением
function tfOpenForm({ title, width = 560, intro, fields, submitLabel, danger, validate, onSave, confirm, confirmTitle }) {
  vbOpenForm({
    title,
    width,
    intro,
    fieldsHtml: tfFieldsHtml(fields),
    submitLabel: submitLabel || vt("common.save"),
    danger,
    onSubmit: (el) => {
      const values = tfReadFields(el, fields);
      const err = validate ? validate(values) : null;
      if (err) return err;
      const run = () => { onSave(values); render(); };
      if (confirm) {
        vbConfirm({ title: confirmTitle || tf("common.confirmTitle"), text: typeof confirm === "function" ? confirm(values) : confirm, confirmLabel: submitLabel || vt("common.save"), danger: !!danger, onConfirm: run });
      } else {
        closeModal();
        run();
      }
      return null;
    },
  });
}

function tfConfirmDelete({ title, text, onConfirm }) {
  vbConfirm({ title: title || tf("common.deleteTitle"), text, confirmLabel: vt("common.delete"), danger: true, onConfirm: () => { onConfirm(); render(); } });
}

function tfJsonObject(v) {
  return v !== undefined && v !== null && typeof v === "object" && !Array.isArray(v);
}

// Права тарифа по AJV-схеме сервиса: разрешённые разделы, обязательные railsOperations.operations, границы чисел
const TF_PERMISSION_KEYS = ["globalBlocks", "railsOperations", "limits", "scoringRules", "otherPermission"];
function tfValidatePermissions(p) {
  if (!tfJsonObject(p)) return "permObject";
  if (Object.keys(p).some((k) => !TF_PERMISSION_KEYS.includes(k))) return "permUnknown";
  const rails = p.railsOperations;
  if (!tfJsonObject(rails) || !Array.isArray(rails.operations) || rails.operations.some((x) => typeof x !== "string")) return "permOperations";
  if (new Set(rails.operations).size !== rails.operations.length) return "permOperationsUnique";
  const nums = [["limits", ["firstUseCapPerNewBeneficiary", "firstUseCapPerNewCountry", "limitPerBeneficiary", "limitPerDevice", "maximumUniqueBeneficiariesPerDay"]], ["scoringRules", ["holdPeriodOnIncomingFundsHours", "holdPeriodOnOutgoingPaymentsHours", "firstUseDelayForNewBeneficiaryHours"]]];
  for (const [section, keys] of nums) {
    if (p[section] === undefined) continue;
    if (!tfJsonObject(p[section])) return "permObject";
    for (const k of keys) if (p[section][k] !== undefined && (typeof p[section][k] !== "number" || p[section][k] < 0)) return "permNumber";
  }
  return null;
}

// ==== Каталог тарифов ===========================================================================================
function tfTariffCounts(tariff) {
  const opIds = tfTariffOpsOf(tariff.id).map((x) => x.id);
  return {
    operations: opIds.length,
    limits: TF_LIMITS.filter((l) => l.tariffOperationIds.some((id) => opIds.includes(id))).length,
    commissions: TF_COMMISSIONS.filter((c) => c.tariffOperationIds.some((id) => opIds.includes(id))).length,
    clients: TF_CLIENTS.filter((c) => c.tariffId === tariff.id).length,
  };
}

const tfTariffsList = createAccessList({
  key: "tf-tariffs",
  data: () => tfLiveTariffs(),
  searchPlaceholder: () => tf("tariffs.search"),
  searchText: (x) => [x.id, x.name, x.description, x.ownerClientId, (tfClientById(x.ownerClientId) || {}).name].filter(Boolean).join(" "),
  tab: { get: (x) => (x.ownerClientId ? "personal" : "shared"), values: ["shared", "personal"], label: (v) => tf(`common.${v}Tab`) },
  filters: [
    { id: "category", kind: "multi", label: () => tf("filters.category"), get: (x) => x.clientCategory, options: () => TF_CATEGORIES.map((v) => ({ value: v, label: tfEnum("category", v) })) },
    { id: "operation", kind: "multi", label: () => tf("filters.operation"), get: (x) => tfTariffOpsOf(x.id).map((o) => o.operationId), options: () => TF_OPERATIONS.map((o) => ({ value: o.id, label: o.name })) },
    { id: "created", kind: "date", label: () => tf("filters.created"), get: (x) => x.createdDate },
    { id: "updated", kind: "date", label: () => tf("filters.updated"), get: (x) => x.updatedDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name), created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => {
    const m = tf("tariffs.metrics");
    return [
      { value: list.reduce((n, x) => n + tfTariffCounts(x).clients, 0), label: m.clients },
      { value: new Set(list.flatMap((x) => tfTariffOpsOf(x.id).map((o) => o.operationId))).size, label: m.operations },
      { value: list.filter((x) => tfTariffCounts(x).limits === 0).length, label: m.noLimits },
    ];
  },
  columns: [
    { label: () => tf("columns.name"), sort: "name", html: (x) => `<div class="identity-cell">${vbLink(`#/settings-tariffs-catalog/${x.id}`, pdEscape(x.name))}${vbCodeCell(x.code)}</div>` },
    { label: () => tf("columns.category"), html: (x) => tfCatBadge(x.clientCategory) },
    { label: () => tf("columns.kind"), html: (x) => (x.ownerClientId ? `<div class="identity-cell">${tfTariffKind(x)}${tfClientLink(tfClientById(x.ownerClientId))}</div>` : tfTariffKind(x)) },
    { label: () => tf("columns.operations"), html: (x) => tfTariffCounts(x).operations },
    { label: () => tf("columns.limits"), html: (x) => tfTariffCounts(x).limits },
    { label: () => tf("columns.commissions"), html: (x) => tfTariffCounts(x).commissions },
    { label: () => tf("columns.clients"), html: (x) => tfTariffCounts(x).clients },
    { label: () => tf("columns.created"), sort: "created", html: (x) => dateTimeCell(x.createdAt) },
    { label: () => "", html: (x) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-tf-copy="${x.id}">${tf("tariffs.copyShort")}</button></div>` },
  ],
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    wrap.querySelectorAll("[data-tf-copy]").forEach((b) => b.addEventListener("click", () => tfOpenCopyForm(tfTariffById(b.dataset.tfCopy))));
  },
});

function tfOpenTariffForm(tariff) {
  const f = tf("tariffs.form");
  const isEdit = !!tariff;
  const boundOps = isEdit ? tfTariffOpsOf(tariff.id).map((x) => x.operationId) : [];
  const fields = [
    { id: "name", label: tf("fields.name"), required: true, value: isEdit ? tariff.name : "" },
    { id: "description", label: tf("fields.description"), value: isEdit ? tariff.description || "" : "" },
    { id: "category", label: tf("fields.category"), required: true, type: "select", options: TF_CATEGORIES.map((v) => ({ value: v, label: tfEnum("category", v) })), value: isEdit ? tariff.clientCategory : "INDIVIDUAL", hint: f.categoryHint },
    { id: "conditions", label: tf("fields.conditions"), required: true, type: "json", rows: 3, value: isEdit ? JSON.parse(tariff.conditions) : {}, hint: f.conditionsHint },
    { id: "operations", label: tf("fields.operations"), type: "checks", options: TF_OPERATIONS.map((o) => ({ value: o.id, label: `<span class="vb-mono">${o.name}</span>` })), value: boundOps, hint: f.operationsHint },
    { id: "permissions", label: tf("fields.permissions"), type: "json", rows: 8, value: isEdit ? tariff.permissions || { railsOperations: { operations: [] } } : { railsOperations: { operations: [] } }, hint: f.permissionsHint },
  ];
  tfOpenForm({
    title: isEdit ? f.editTitle : f.createTitle,
    width: 640,
    intro: isEdit ? f.editIntro : f.createIntro,
    fields,
    submitLabel: isEdit ? vt("common.save") : vt("common.create"),
    validate: (v) => {
      if (!v.name) return f.errName;
      if (TF_TARIFFS.some((x) => !x.deleted && x !== tariff && x.name.toLowerCase() === v.name.toLowerCase())) return f.errExists;
      if (!tfJsonObject(v.conditions)) return f.errConditions;
      if (v.permissions === undefined) return f.errPermJson;
      if (v.permissions !== null) { const e = tfValidatePermissions(v.permissions); if (e) return f.perm[e]; }
      if (isEdit && v.category !== tariff.clientCategory && TF_CLIENTS.some((c) => c.tariffId === tariff.id)) return f.errCategoryClients;
      return null;
    },
    confirm: isEdit ? (v) => f.confirmEdit(tfTariffCounts(tariff).clients) : null,
    onSave: (v) => {
      // Maker-Checker: если на создание/изменение тарифа есть активное правило — вместо немедленного
      // применения создаётся запрос на подтверждение (см. mcTryGate, mock/maker-checker.mock.js).
      const apply = () => {
        const now = pdNow();
        let target = tariff;
        if (!isEdit) {
          target = tfStamp({ id: tfId(), code: tfCode("TFT"), name: v.name, description: v.description || null, clientCategory: v.category, conditions: JSON.stringify(v.conditions), permissions: v.permissions, ownerClientId: null, sourceTariffId: null, deleted: false }, now);
          TF_TARIFFS.unshift(target);
        } else {
          Object.assign(target, { name: v.name, description: v.description || null, clientCategory: v.category, conditions: JSON.stringify(v.conditions), permissions: v.permissions });
          acTouch(target);
        }
        // связь тариф ↔ операции: недостающие добавляются, снятые удаляются вместе с привязками лимитов и комиссий
        const have = tfTariffOpsOf(target.id);
        v.operations.forEach((opId) => { if (!have.some((x) => x.operationId === opId)) TF_TARIFF_OPS.push({ id: tfId(), tariffId: target.id, operationId: opId }); });
        have.filter((x) => !v.operations.includes(x.operationId)).forEach((x) => {
          TF_LIMITS.forEach((l) => { l.tariffOperationIds = l.tariffOperationIds.filter((id) => id !== x.id); });
          TF_COMMISSIONS.forEach((c) => { c.tariffOperationIds = c.tariffOperationIds.filter((id) => id !== x.id); });
          TF_TARIFF_OPS.splice(TF_TARIFF_OPS.indexOf(x), 1);
        });
        if (!isEdit) window.location.hash = `#/settings-tariffs-catalog/${target.id}`;
      };
      const fl = tf("fields");
      const changes = [];
      if (isEdit) {
        if (v.name !== tariff.name) changes.push({ attribute: fl.name, currentValue: tariff.name, targetValue: v.name });
        if ((v.description || "") !== (tariff.description || "")) changes.push({ attribute: fl.description, currentValue: tariff.description || "—", targetValue: v.description || "—" });
        if (v.category !== tariff.clientCategory) changes.push({ attribute: fl.category, currentValue: tfEnum("category", tariff.clientCategory), targetValue: tfEnum("category", v.category) });
      }
      const gate = mcTryGate({
        actionType: isEdit ? "UPDATE" : "CREATE",
        entity: "Tariff",
        targetType: "TARIFF",
        targetId: isEdit ? tariff.id : null,
        targetLabel: v.name,
        summary: isEdit
          ? mcUpdateSummary(changes)
          : mcCreateSummary([
              { label: fl.name, value: v.name },
              { label: fl.category, value: tfEnum("category", v.category) },
              { label: tf("columns.operations"), value: v.operations.length },
            ]),
        apply,
      });
      if (gate.gated) showToast(mc("gate.createdToast"));
    },
  });
}

function tfOpenCopyForm(source, presetClientId) {
  if (!source) return;
  const f = tf("tariffs.copy");
  const limits = TF_LIMITS.filter((l) => !l.clientId && l.tariffOperationIds.some((id) => tfTariffOpById(id).tariffId === source.id));
  const commissions = TF_COMMISSIONS.filter((c) => !c.clientId && c.tariffOperationIds.some((id) => tfTariffOpById(id).tariffId === source.id));
  const clients = TF_CLIENTS.filter((c) => c.category === source.clientCategory && !TF_TARIFFS.some((x) => !x.deleted && x.ownerClientId === c.id));
  const numCell = (id, v, w) => `<input class="address-form-input tf-cell-input" type="text" id="${id}" value="${v === null || v === undefined ? "" : v}" style="width:${w || 92}px" />`;
  const limitRows = limits.map((l) => `<tr><td>${pdEscape(l.name)}<div class="table-cell-muted">${l.currencyTicker}</div></td>${["daily", "weekly", "monthly", "annual", "min", "max"].map((k) => `<td>${numCell(`tfc-l-${l.id}-${k}`, l[k])}</td>`).join("")}</tr>`).join("");
  const factorRows = commissions.flatMap((c) => c.factors.map((fa) => `<tr><td>${pdEscape(c.name)}<div class="table-cell-muted">${pdEscape(fa.name)} · ${c.currencyTicker}</div></td>${["percent", "fixed", "min", "max"].map((k) => `<td>${numCell(`tfc-f-${fa.id}-${k}`, fa[k], 80)}</td>`).join("")}</tr>`)).join("");
  vbOpenForm({
    title: f.title,
    width: 900,
    intro: f.intro(pdEscape(source.name)),
    fieldsHtml: `${vbSelect("tfc-client", f.client, [{ value: "", label: f.clientNone }, ...clients.map((c) => ({ value: c.id, label: c.name }))], presetClientId || "")}<div class="table-cell-muted sl-hint">${f.clientHint}</div>
      <div class="sl-grid">${vbInput("tfc-name", f.name, "", `placeholder="${pdEscape(source.name)} (copy)"`)}${vbInput("tfc-desc", f.description, "")}</div>
      <div class="sl-section-title">${f.limitsTitle}</div>
      ${limits.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>${f.limit}</th>${["daily", "weekly", "monthly", "annual", "min", "max"].map((k) => `<th>${tf(`fields.${k}`)}</th>`).join("")}</tr></thead><tbody>${limitRows}</tbody></table></div>` : `<div class="table-cell-muted">${f.noLimits}</div>`}
      <div class="sl-section-title">${f.factorsTitle}</div>
      ${factorRows ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>${f.factor}</th>${["percent", "fixed", "min", "max"].map((k) => `<th>${tf(`fields.${k}`)}</th>`).join("")}</tr></thead><tbody>${factorRows}</tbody></table></div>` : `<div class="table-cell-muted">${f.noFactors}</div>`}`,
    submitLabel: f.submit,
    onSubmit: (el) => {
      const read = (id) => { const raw = el.querySelector(`#${id}`).value.trim().replace(",", "."); return raw === "" ? null : /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN; };
      const limitOverrides = {};
      const factorOverrides = {};
      for (const l of limits) {
        const vals = {};
        for (const k of ["daily", "weekly", "monthly", "annual", "min", "max"]) {
          const v = read(`tfc-l-${l.id}-${k}`);
          if (Number.isNaN(v) || ((k === "daily" || k === "weekly" || k === "monthly" || k === "annual") && v === null)) return f.errNumber(l.name);
          vals[k] = v;
        }
        const restr = l.restrictionId ? tfRestrictionById(l.restrictionId) : null;
        const err = tfValidateLimitValues(vals, restr);
        if (err) return `${l.name}: ${tf(`errors.${err}`)}`;
        if (["daily", "weekly", "monthly", "annual", "min", "max"].some((k) => vals[k] !== l[k])) limitOverrides[l.id] = vals;
      }
      for (const c of commissions) for (const fa of c.factors) {
        const vals = {};
        for (const k of ["percent", "fixed", "min", "max"]) { const v = read(`tfc-f-${fa.id}-${k}`); if (Number.isNaN(v)) return f.errNumber(`${c.name} / ${fa.name}`); vals[k] = v; }
        if (vals.min !== null && vals.max !== null && vals.min > vals.max) return `${c.name} / ${fa.name}: ${tf("errors.factorMinGtMax")}`;
        if (["percent", "fixed", "min", "max"].some((k) => vals[k] !== fa[k])) factorOverrides[fa.id] = vals;
      }
      const clientId = el.querySelector("#tfc-client").value || null;
      const name = el.querySelector("#tfc-name").value.trim();
      if (name && TF_TARIFFS.some((x) => !x.deleted && x.name.toLowerCase() === name.toLowerCase())) return tf("tariffs.form.errExists");
      const description = el.querySelector("#tfc-desc").value.trim();
      const run = () => {
        const copy = tfCopyTariff({ sourceTariffId: source.id, clientId, name, description, limitOverrides, factorOverrides }, pdNow());
        window.location.hash = `#/settings-tariffs-catalog/${copy.id}`;
        render();
      };
      vbConfirm({ title: tf("common.confirmTitle"), text: clientId ? f.confirmPersonal((tfClientById(clientId) || {}).name) : f.confirmShared, confirmLabel: f.submit, danger: false, onConfirm: run });
      return null;
    },
  });
}

function tfOpenRevoke(client, personalTariff) {
  const personal = personalTariff || tfTariffById(client.tariffId);
  if (!personal || !personal.ownerClientId) return;
  const isCurrent = client.tariffId === personal.id;
  const f = tf("tariffs.revoke");
  const options = tfLiveTariffs().filter((x) => !x.ownerClientId && x.clientCategory === personal.clientCategory);
  vbOpenForm({
    title: f.title,
    width: 480,
    intro: isCurrent ? f.intro(pdEscape(client.name), pdEscape(personal.name)) : f.introOrphan(pdEscape(client.name), pdEscape(personal.name)),
    fieldsHtml: vbSelect("tfr-target", f.target, options.map((x) => ({ value: x.id, label: x.name })), personal.sourceTariffId && options.some((x) => x.id === personal.sourceTariffId) ? personal.sourceTariffId : (options[0] || {}).id),
    submitLabel: f.submit,
    danger: true,
    onSubmit: (el) => {
      const target = el.querySelector("#tfr-target").value;
      vbConfirm({ title: tf("common.confirmTitle"), text: f.confirm(pdEscape(personal.name)), confirmLabel: f.submit, danger: true, onConfirm: () => { tfRevokePersonal(client.id, target, pdNow(), personal.id); window.location.hash = isCurrent ? client.link : "#/settings-tariffs-catalog"; render(); } });
      return null;
    },
  });
}

// ---- Страница тарифа -----------------------------------------------------------------------------------------------
function viewTariffDetail(id) {
  const x = tfTariffById(id);
  if (!x || x.deleted) return vbNotFound();
  const f = tf("fields");
  const d = tf("tariffs.detail");
  const counts = tfTariffCounts(x);
  const owner = x.ownerClientId ? tfClientById(x.ownerClientId) : null;
  const source = x.sourceTariffId ? tfTariffById(x.sourceTariffId) : null;
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, x.code)}${detailField(f.category, tfCatBadge(x.clientCategory))}${detailField(f.kind, tfTariffKind(x))}
    ${detailField(f.description, x.description ? pdEscape(x.description) : "—")}${detailField(f.owner, owner ? tfClientLink(owner) : "—")}${detailField(f.source, source ? tfTariffLink(source) : "—")}
    ${detailField(f.created, x.createdAt)}${detailField(f.updated, x.updatedAt)}
  </div>`;
  const opRows = tfTariffOpsOf(x.id).map((b) => {
    const op = tfOperationById(b.operationId);
    const ls = TF_LIMITS.filter((l) => l.tariffOperationIds.includes(b.id));
    const cs = TF_COMMISSIONS.filter((c) => c.tariffOperationIds.includes(b.id));
    return [`<span class="vb-mono">${op.name}</span>`, tfIntegrationBadge(op.integration), ls.length ? ls.map((l) => vbLink(`#/settings-tariffs-limits/${l.id}`, pdEscape(l.name))).join("<br>") : `<span class="table-cell-muted">${d.noLimit}</span>`, cs.length ? cs.map((c) => vbLink(`#/settings-tariffs-commissions/${c.id}`, pdEscape(c.name))).join("<br>") : `<span class="table-cell-muted">${d.noCommission}</span>`];
  });
  const ops = vbMiniTable([f.operation, tf("columns.integration"), tf("columns.limits"), tf("columns.commissions")], opRows, d.noOperations);
  const clients = TF_CLIENTS.filter((c) => c.tariffId === x.id);
  const clientsBlock = `${vbMiniTable([tf("columns.client"), tf("columns.category"), tf("columns.billing")], clients.slice(0, 10).map((c) => [tfClientLink(c), tfCatBadge(c.category), formatDateTime(c.billingPeriod).split(" ")[0]]), d.noClients)}${clients.length > 10 ? `<p class="table-cell-muted vb-note">${d.moreClients(clients.length - 10)}</p>` : ""}`;
  const masks = TF_MASKS.filter((m) => m.tariffId === x.id && m.status !== "DELETED");
  const masksBlock = vbMiniTable([tf("columns.name"), tf("columns.type"), tf("columns.status")], masks.map((m) => [vbLink(`#/settings-masks-list/${m.id}`, pdEscape(m.name)), tfEnum("maskType", m.type), tfMaskBadge(m.status)]), d.noMasks);
  const canDelete = counts.clients === 0;
  const actions = `<button type="button" class="btn-secondary" data-tf-act="edit">${vt("common.edit")}</button>
    <button type="button" class="btn-secondary" data-tf-act="copy">${tf("tariffs.copyShort")}</button>
    <button type="button" class="btn-secondary" data-tf-act="calc">${d.calc}</button>
    ${owner ? `<button type="button" class="btn-danger" data-tf-act="revoke">${tf("tariffs.revoke.title")}</button>` : `<button type="button" class="btn-danger" data-tf-act="delete">${vt("common.delete")}</button>`}`;
  return `<div id="tf-root">
    ${vbDetailHeader({ backHash: "#/settings-tariffs-catalog", title: pdEscape(x.name), badges: `${tfCatBadge(x.clientCategory)}${tfTariffKind(x)}`, subtitle: vbCodeSubtitle(x.code, [x.createdAt]), actions })}
    <div class="pd-grid">
      <div class="pd-col"><div class="profile-flat-block">${flatSection(d.general, main)}${flatSection(`${d.operations} · ${counts.operations}`, ops)}${flatSection(`${d.clients} · ${clients.length}`, clientsBlock)}</div></div>
      <div class="pd-col">${sectionCard(d.conditions, vbJson(JSON.parse(x.conditions)), "is-collapsed")}${sectionCard(d.permissions, x.permissions ? vbJson(x.permissions) : `<div class="table-cell-muted">—</div>`, "is-collapsed")}${TF_MASKS_ENABLED ? sectionCard(`${d.masks} · ${masks.length}`, masksBlock, "is-collapsed") : ""}</div>
    </div>
  </div>`;
}

function initTariffDetail(id) {
  const x = tfTariffById(id);
  const root = document.getElementById("tf-root");
  if (!x || !root) return;
  vbAttachCommon(root);
  const act = (n) => root.querySelector(`[data-tf-act="${n}"]`);
  act("edit").addEventListener("click", () => tfOpenTariffForm(x));
  act("copy").addEventListener("click", () => tfOpenCopyForm(x));
  act("calc").addEventListener("click", () => tfOpenCalc({ tariff: x }));
  const del = act("delete");
  if (del) del.addEventListener("click", () => {
    const n = tfTariffCounts(x).clients;
    if (n) { vbConfirm({ title: tf("tariffs.detail.cantDeleteTitle"), text: tf("tariffs.detail.cantDelete")(n), confirmLabel: vt("common.close"), danger: false, onConfirm: () => {} }); return; }
    tfConfirmDelete({ text: tf("tariffs.detail.confirmDelete")(pdEscape(x.name)), onConfirm: () => { x.deleted = true; TF_MASKS.filter((m) => m.tariffId === x.id && m.status !== "DELETED").forEach((m) => { m.status = "DELETED"; }); window.location.hash = "#/settings-tariffs-catalog"; } });
  });
  const rev = act("revoke");
  if (rev) rev.addEventListener("click", () => tfOpenRevoke(tfClientById(x.ownerClientId), x));
}

// ==== Операции ========================================================================================================
function tfOperationCounts(op) {
  const bindings = TF_TARIFF_OPS.filter((b) => b.operationId === op.id);
  const ids = bindings.map((b) => b.id);
  return { tariffs: new Set(bindings.map((b) => b.tariffId)).size, limits: TF_LIMITS.filter((l) => l.tariffOperationIds.some((i) => ids.includes(i))).length, commissions: TF_COMMISSIONS.filter((c) => c.tariffOperationIds.some((i) => ids.includes(i))).length, history: TF_HISTORY.filter((h) => h.operationId === op.id).length };
}

const tfOperationsList = createAccessList({
  key: "tf-ops",
  data: () => TF_OPERATIONS,
  searchPlaceholder: () => tf("operations.search"),
  searchText: (o) => [o.code, o.name, o.description].filter(Boolean).join(" "),
  tab: { get: (o) => o.domain, values: ["CRYPTO", "FIAT"], label: (v) => tfEnum("opDomain", v) },
  filters: [
    { id: "direction", kind: "multi", label: () => tf("filters.direction"), get: (o) => o.direction, options: () => ["OUTGOING", "DEPOSIT", "TRANSFER", "INTERNAL_PAYMENT"].map((v) => ({ value: v, label: tfEnum("opDirection", v) })) },
    { id: "start", kind: "multi", label: () => tf("filters.start"), get: (o) => o.start, options: () => ["OUR", "EXTERNAL"].map((v) => ({ value: v, label: tfEnum("opStart", v) })) },
    { id: "integration", kind: "multi", label: () => tf("filters.integration"), get: (o) => o.integration, options: () => ["YES", "PARTIAL", "NO"].map((v) => ({ value: v, label: tfEnum("integration", v) })) },
  ],
  defaultSort: (a, b) => TF_OPERATIONS.indexOf(a) - TF_OPERATIONS.indexOf(b),
  sorts: { name: (a, b) => a.name.localeCompare(b.name) },
  metrics: (list) => {
    const m = tf("operations.metrics");
    return [
      { value: list.filter((o) => o.integration === "YES").length, label: m.integrated },
      { value: list.filter((o) => o.integration !== "YES").length, label: m.notFull },
      { value: list.filter((o) => tfOperationCounts(o).limits === 0).length, label: m.noLimits },
    ];
  },
  columns: [
    { label: () => tf("columns.operation"), sort: "name", html: (o) => `<div class="identity-cell">${tfMono(o.name)}<span class="table-cell-muted">${pdEscape(o.description || "")}</span></div>` },
    { label: () => tf("columns.domain"), html: (o) => tfEnum("opDomain", o.domain) },
    { label: () => tf("columns.direction"), html: (o) => `<div class="identity-cell"><span>${tfEnum("opDirection", o.direction)}</span><span class="table-cell-muted">${tfEnum("opStart", o.start)}</span></div>` },
    { label: () => tf("columns.integration"), html: (o) => `<div class="identity-cell">${tfIntegrationBadge(o.integration)}${tf("operations.notes")[o.name] ? `<span class="table-cell-muted ed-desc">${tf("operations.notes")[o.name]}</span>` : ""}</div>` },
    { label: () => tf("columns.tariffs"), html: (o) => tfOperationCounts(o).tariffs },
    { label: () => tf("columns.limits"), html: (o) => tfOperationCounts(o).limits },
    { label: () => tf("columns.commissions"), html: (o) => tfOperationCounts(o).commissions },
    { label: () => "", html: (o) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-tf-op-edit="${o.id}">${vt("common.edit")}</button><button type="button" class="btn-secondary vb-row-btn sl-del" data-tf-op-del="${o.id}">${TRASH_ICON_SVG}</button></div>` },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-tf-op-edit]").forEach((b) => b.addEventListener("click", () => tfOpenOperationForm(tfOperationById(b.dataset.tfOpEdit))));
    wrap.querySelectorAll("[data-tf-op-del]").forEach((b) => b.addEventListener("click", () => tfDeleteOperation(tfOperationById(b.dataset.tfOpDel))));
  },
});

function tfOpenOperationForm(op) {
  const f = tf("operations.form");
  tfOpenForm({
    title: op ? f.editTitle : f.createTitle,
    width: 520,
    intro: f.intro,
    fields: [
      { id: "name", label: tf("fields.name"), required: true, value: op ? op.name : "", hint: f.nameHint },
      { id: "description", label: tf("fields.description"), value: op ? op.description || "" : "" },
      { id: "domain", label: tf("fields.domain"), type: "select", options: ["CRYPTO", "FIAT"].map((v) => ({ value: v, label: tfEnum("opDomain", v) })), value: op ? op.domain : "FIAT" },
      { id: "direction", label: tf("fields.direction"), type: "select", options: ["OUTGOING", "DEPOSIT", "TRANSFER", "INTERNAL_PAYMENT"].map((v) => ({ value: v, label: tfEnum("opDirection", v) })), value: op ? op.direction : "OUTGOING" },
    ],
    submitLabel: op ? vt("common.save") : vt("common.create"),
    validate: (v) => {
      if (!/^[A-Z][A-Z0-9_]+$/.test(v.name)) return f.errName;
      if (TF_OPERATIONS.some((o) => o !== op && o.name === v.name)) return f.errExists;
      return null;
    },
    confirm: op ? () => f.confirmEdit : null,
    onSave: (v) => {
      if (op) { Object.assign(op, { name: v.name, description: v.description || null, domain: v.domain, direction: v.direction }); acTouch(op); return; }
      TF_OPERATIONS.push(tfStamp({ id: tfId(), code: tfCode("TFO"), name: v.name, description: v.description || null, domain: v.domain, direction: v.direction, start: "OUR", integration: "NO" }, pdNow()));
    },
  });
}

function tfDeleteOperation(op) {
  const c = tfOperationCounts(op);
  tfConfirmDelete({
    text: tf("operations.confirmDelete")(pdEscape(op.name), c.tariffs, c.limits, c.commissions),
    onConfirm: () => {
      const ids = TF_TARIFF_OPS.filter((b) => b.operationId === op.id).map((b) => b.id);
      TF_LIMITS.forEach((l) => { l.tariffOperationIds = l.tariffOperationIds.filter((i) => !ids.includes(i)); });
      TF_COMMISSIONS.forEach((k) => { k.tariffOperationIds = k.tariffOperationIds.filter((i) => !ids.includes(i)); });
      for (let i = TF_TARIFF_OPS.length - 1; i >= 0; i -= 1) if (ids.includes(TF_TARIFF_OPS[i].id)) TF_TARIFF_OPS.splice(i, 1);
      for (let i = TF_HISTORY.length - 1; i >= 0; i -= 1) if (TF_HISTORY[i].operationId === op.id) TF_HISTORY.splice(i, 1);
      TF_OPERATIONS.splice(TF_OPERATIONS.indexOf(op), 1);
    },
  });
}

// ==== Калькулятор: проверка лимитов и расчёт комиссии ===========================================================
function tfOpenCalc({ tariff, client }) {
  const f = tf("calc");
  const tariffObj = client ? tfTariffById(client.tariffId) : tariff;
  const ops = tfTariffOpsOf(tariffObj.id).map((b) => tfOperationById(b.operationId));
  openModal({
    title: client ? f.titleClient(pdEscape(client.name)) : f.titleTariff(pdEscape(tariffObj.name)),
    width: 720,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${client ? f.introClient(pdEscape(tariffObj.name)) : f.introTariff}</p>
      <div class="sl-grid sl-grid-3">${vbSelect("tfx-op", f.operation, ops.map((o) => ({ value: o.name, label: o.name })), (ops[0] || {}).name)}${vbSelect("tfx-ticker", f.currency, TF_TICKERS.map((c) => ({ value: c, label: c })), "USDT")}${vbInput("tfx-amount", f.amount, "100")}</div>
      <div id="tfx-result" class="tf-result"></div><div class="form-error" id="tfx-error" hidden></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="tfx-close">${vt("common.close")}</button><button type="button" class="btn-primary" id="tfx-run">${f.run}</button>`,
    onMount: (el) => {
      el.querySelector("#tfx-close").addEventListener("click", closeModal);
      el.querySelector("#tfx-run").addEventListener("click", () => {
        const err = el.querySelector("#tfx-error");
        const raw = el.querySelector("#tfx-amount").value.trim().replace(",", ".");
        const amount = Number(raw);
        if (!raw || Number.isNaN(amount) || amount <= 0) { err.textContent = f.errAmount; err.hidden = false; return; }
        err.hidden = true;
        const opName = el.querySelector("#tfx-op").value;
        const ticker = el.querySelector("#tfx-ticker").value;
        let html = "";
        if (client) {
          const r = tfCheckLimit(client, opName, ticker, amount);
          if (r.error) html += `<div class="vf-banner"><span>${tf(`errors.${r.error}`)}</span></div>`;
          else {
            html += `<div class="sl-section-title">${f.limitsTitle} ${tfBadge(r.result ? "badge-success" : "badge-danger", r.result ? f.allowed : f.denied)}</div>`;
            html += vbMiniTable([f.limit, f.rated, f.availableDaily, f.reason], r.checks.map((c) => [vbLink(`#/settings-tariffs-limits/${c.limit.id}`, pdEscape(c.limit.name)), tfNum(c.ratedAmount, c.limit.currencyTicker), tfNum(c.available.daily, c.limit.currencyTicker), c.reasons.length ? c.reasons.map((x) => tfBadge("badge-danger", tf(`errors.reason.${x}`))).join(" ") : tfBadge("badge-success", "OK")]), "");
          }
        }
        const fee = tfTotalFee(tariffObj.id, opName, ticker, amount, client ? client.id : null);
        html += `<div class="sl-section-title">${f.feeTitle}</div>`;
        if (!fee) html += `<div class="table-cell-muted">${f.noCommission}</div>`;
        else {
          html += vbMiniTable([f.factor, f.type, f.fee], fee.steps.map((s) => [pdEscape(s.factor.name), s.factor.type, tfNum(s.fee, fee.commissionTicker)]), f.noFactors);
          html += `<div class="profile-fields profile-fields-grid tf-total">${detailField(f.commission, vbLink(`#/settings-tariffs-commissions/${fee.commission.id}`, pdEscape(fee.commission.name)))}${detailField(f.totalFee, `<strong>${tfNum(fee.totalFee, ticker)}</strong>`)}${detailField(f.totalAmount, `<strong>${tfNum(fee.totalAmount, ticker)}</strong>`)}</div>`;
        }
        const out = el.querySelector("#tfx-result");
        out.innerHTML = html;
        vbAttachRows(out);
      });
    },
  });
}

// ==== Обёртки для роутера ===============================================================================================================
function viewTariffsCatalog() {
  return `<div class="list-hero">${pageHeader(tf("titles.catalog"), t("navDescriptions.settings-tariffs-catalog"), `${sectionHintBtn("tf-catalog-hint-btn", tf("info.catalog"))}<button type="button" class="btn-primary" id="tf-tariff-create">+ ${tf("tariffs.create")}</button>`)}</div>${tfTariffsList.view()}`;
}
function initTariffsCatalog() {
  tfTariffsList.init();
  const b = document.getElementById("tf-tariff-create");
  if (b) b.addEventListener("click", () => tfOpenTariffForm(null));
}
function viewTariffsOperations() {
  return `<div class="list-hero">${pageHeader(tf("titles.operations"), t("navDescriptions.settings-tariffs-operations"), `${sectionHintBtn("tf-op-hint-btn", tf("info.operations"))}<button type="button" class="btn-primary" id="tf-op-create">+ ${tf("operations.create")}</button>`)}</div>${tfOperationsList.view()}`;
}
function initTariffsOperations() {
  tfOperationsList.init();
  const b = document.getElementById("tf-op-create");
  if (b) b.addEventListener("click", () => tfOpenOperationForm(null));
}
