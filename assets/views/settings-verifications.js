/* ==========================================================================
   "Настройки системы → Верификации": конфигурации KYC, конфигурации документов,
   категории адресов. Спецификация: docs/settings-verifications-spec.md;
   данные — mock/settings-verifications.mock.js. Списки построены на createAccessList
   (views/settings-access.js), формы и подтверждения — на хелперах vb* (views/settings-vabs.js).
   ========================================================================== */

function vf(path) {
  return t(`verif.${path}`);
}

function vfRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^settings-verif-(kyc|kyb|documents)\/(.+)$/);
  return m ? { kind: m[1], id: decodeURIComponent(m[2]) } : null;
}

function vfStepLabel(step) {
  return vf(`steps.${step}.name`);
}

function vfStateBadge(active) {
  return `<span class="badge ${active ? "badge-success" : "badge-neutral"}">${vf(`state.${active ? "active" : "inactive"}`)}</span>`;
}

function vfLines(text) {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

function vfCheckboxes(items, selected, attr) {
  return items
    .map((i) => `<label class="filter-checkbox-item"><input type="checkbox" ${attr}="${escapeAttr(i.value)}"${selected.includes(i.value) ? " checked" : ""} /><span class="filter-checkbox-box"></span><span class="ac-rule-label">${i.label}</span></label>`)
    .join("");
}

function vfNotFoundHtml() {
  return vbNotFound();
}

let vfKeepTab = false;
function vfRerender() {
  vfKeepTab = true;
  render();
}

// ==== KYC: список ==========================================================================
function vfKycStepsCount(c) {
  return c.steps.length;
}

const vfKycList = createAccessList({
  key: "vf-kyc",
  data: () => VF_KYC_CONFIGS,
  searchPlaceholder: () => vf("kyc.search"),
  searchText: (c) => [c.code, c.name, c.description, c.service].filter(Boolean).join(" "),
  tab: { get: (c) => (c.isActive ? "active" : "inactive"), values: ["active", "inactive"], label: (v) => vf(`status.${v}`) },
  filters: [
    { id: "created", kind: "date", label: () => vf("filters.created"), get: (c) => c.createdDate },
    { id: "updated", kind: "date", label: () => vf("filters.updated"), get: (c) => c.updatedDate },
    { id: "service", kind: "multi", label: () => vf("filters.service"), get: (c) => c.service, options: () => [...new Set(VF_KYC_CONFIGS.map((c) => c.service))].map((s) => ({ value: s, label: s })) },
    { id: "level", kind: "multi", label: () => vf("filters.level"), get: (c) => c.level, options: () => [...new Set(VF_KYC_CONFIGS.map((c) => c.level))].sort((a, b) => a - b).map((l) => ({ value: String(l), label: String(l) })) },
    { id: "version", kind: "multi", label: () => vf("filters.version"), get: (c) => c.configVersion, options: () => [...new Set(VF_KYC_CONFIGS.map((c) => c.configVersion))].sort((a, b) => a - b).map((v) => ({ value: String(v), label: String(v) })) },
  ],
  defaultSort: (a, b) => b.configVersion - a.configVersion || b.createdDate - a.createdDate,
  sorts: {},
  columns: [
    { label: () => vf("columns.id"), html: (c) => `<div class="identity-cell-primary">${vbLink(`#/settings-verif-kyc/${c.id}`, c.code)}${copyIconButton(c.code)}</div>` },
    { label: () => vf("columns.name"), html: (c) => pdEscape(c.name || "—") },
    { label: () => vf("columns.service"), html: (c) => pdEscape(c.service) },
    { label: () => vf("columns.level"), html: (c) => c.level },
    { label: () => vf("columns.version"), html: (c) => c.configVersion },
    { label: () => vf("columns.state"), html: (c) => vfStateBadge(c.isActive) },
    { label: () => vf("columns.steps"), html: vfKycStepsCount },
    { label: () => vf("columns.created"), html: (c) => dateTimeCell(c.createdAt) },
    { label: () => vf("columns.updated"), html: (c) => dateTimeCell(c.updatedAt) },
    { label: () => "", html: (c) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-vf-newver="${c.id}">${vf("kyc.newVersionShort")}</button></div>` },
  ],
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    wrap.querySelectorAll("[data-vf-newver]").forEach((b) => b.addEventListener("click", () => vfOpenKycForm(vfKycById(b.dataset.vfNewver))));
  },
});

// ==== KYB: список ==========================================================================
// По аналогии со списком KYC выше, но проще: один сервис (не фильтруем по нему), уровень — из
// закрытого набора 1-3 (см. комментарий в моке), поэтому фильтр по уровню — не диапазон, а сами
// встречающиеся значения, как и у KYC.
const vfKybList = createAccessList({
  key: "vf-kyb",
  data: () => VF_KYB_CONFIGS,
  searchPlaceholder: () => vf("kyb.search"),
  searchText: (c) => [c.code, c.name, c.description].filter(Boolean).join(" "),
  tab: { get: (c) => (c.isActive ? "active" : "inactive"), values: ["active", "inactive"], label: (v) => vf(`status.${v}`) },
  filters: [
    { id: "created", kind: "date", label: () => vf("filters.created"), get: (c) => c.createdDate },
    { id: "updated", kind: "date", label: () => vf("filters.updated"), get: (c) => c.updatedDate },
    { id: "level", kind: "multi", label: () => vf("filters.level"), get: (c) => c.level, options: () => [...new Set(VF_KYB_CONFIGS.map((c) => c.level))].sort((a, b) => a - b).map((l) => ({ value: String(l), label: String(l) })) },
    { id: "version", kind: "multi", label: () => vf("filters.version"), get: (c) => c.configVersion, options: () => [...new Set(VF_KYB_CONFIGS.map((c) => c.configVersion))].sort((a, b) => a - b).map((v) => ({ value: String(v), label: String(v) })) },
  ],
  defaultSort: (a, b) => a.level - b.level || b.configVersion - a.configVersion,
  sorts: {},
  columns: [
    { label: () => vf("columns.id"), html: (c) => `<div class="identity-cell-primary">${vbLink(`#/settings-verif-kyb/${c.id}`, c.code)}${copyIconButton(c.code)}</div>` },
    { label: () => vf("columns.name"), html: (c) => pdEscape(c.name || "—") },
    { label: () => vf("columns.level"), html: (c) => c.level },
    { label: () => vf("columns.version"), html: (c) => c.configVersion },
    { label: () => vf("columns.state"), html: (c) => vfStateBadge(c.isActive) },
    { label: () => vf("columns.steps"), html: (c) => c.steps.length },
    { label: () => vf("columns.created"), html: (c) => dateTimeCell(c.createdAt) },
    { label: () => vf("columns.updated"), html: (c) => dateTimeCell(c.updatedAt) },
    { label: () => "", html: (c) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-vf-kyb-newver="${c.id}">${vf("kyb.newVersionShort")}</button></div>` },
  ],
  attachRows: (wrap) => {
    vbAttachRows(wrap);
    wrap.querySelectorAll("[data-vf-kyb-newver]").forEach((b) => b.addEventListener("click", () => vfOpenKybForm(vfKybById(b.dataset.vfKybNewver))));
  },
});

// ==== KYB: форма создания / новой версии ===================================================
// Проще мастера KYC (без отдельных шагов-экранов): один модальный шаг, как форма конфигурации
// KYT (security-kyt.js, ktOpenConfigForm) — шаги выбираются из ЗАКРЫТОГО каталога KYBStepEnum
// (те же 7 кодов, что уже используются в шагах компании, см. KYB_STEP_NAMES в
// clients-companies.mock.js), поэтому JSON-редактор настроек шага не нужен: для KYB provider-
// config в моках не установлен (в отличие от KYC, где он подтверждён реальными данными).
function vfKybStepRowHtml(st, i) {
  const f = vf("kyb.form");
  const kinds = Object.keys(KYB_STEP_NAMES).map((k) => `<option value="${k}"${st.step === k ? " selected" : ""}>${vfStepLabel(k)}</option>`).join("");
  return `<div class="vf-step" data-vf-kyb-step>
    <div class="vf-step-head"><strong>${f.step} ${i + 1}</strong><button type="button" class="btn-secondary vb-row-btn" data-vf-kyb-del title="${f.remove}">${TRASH_ICON_SVG}</button></div>
    <div class="sl-grid">
      <label class="filters-field vb-field"><span class="filters-field-label">${f.step} *</span><select class="address-form-input" data-vf-kyb-kind>${kinds}</select></label>
      <label class="filters-field vb-field"><span class="filters-field-label">${vf("fields.order")} *</span><input class="address-form-input" type="text" inputmode="numeric" data-vf-kyb-order value="${escapeAttr(String(st.order))}" /></label>
    </div>
    <label class="filters-field vb-field"><span class="filters-field-label">${vf("fields.name")} *</span><input class="address-form-input" type="text" data-vf-kyb-sname value="${escapeAttr(st.name)}" /></label>
  </div>`;
}

function vfOpenKybForm(base) {
  const f = vf("kyb.form");
  const isVersion = !!base;
  const b = base || { name: "", level: "", description: "", steps: [{ step: "SCREENING", order: 1, name: vfStepLabel("SCREENING") }] };
  openModal({
    title: isVersion ? f.versionTitle : f.createTitle,
    width: 620,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${isVersion ? f.versionIntro(pdEscape(b.name), b.level, b.configVersion + 1) : f.createIntro}</p>
      <div class="sl-grid">${vbInput("vf-kyb-name", vf("fields.name"), b.name)}${vbInput("vf-kyb-level", f.level, String(b.level), isVersion ? "disabled" : 'inputmode="numeric"')}</div>
      ${vbInput("vf-kyb-desc", vf("fields.description"), b.description || "")}
      <div class="sl-section-title">${vf("kyb.detail.title")}: ${vf("fields.name")} — ${f.step}</div>
      <div id="vf-kyb-steps"></div>
      <button type="button" class="btn-secondary" id="vf-kyb-add-step">+ ${f.addStep}</button>
      <div class="form-error" id="vf-kyb-error" hidden></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="vf-kyb-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="vf-kyb-submit">${isVersion ? f.versionSubmit : vt("common.create")}</button>`,
    onMount: (el) => {
      const box = el.querySelector("#vf-kyb-steps");
      const err = el.querySelector("#vf-kyb-error");
      const addRow = (data) => {
        box.insertAdjacentHTML("beforeend", vfKybStepRowHtml(data, box.children.length));
        const row = box.lastElementChild;
        row.querySelector("[data-vf-kyb-del]").addEventListener("click", () => { row.remove(); [...box.children].forEach((r, i) => { r.querySelector("strong").textContent = `${f.step} ${i + 1}`; }); });
      };
      b.steps.forEach((s) => addRow(s));
      el.querySelector("#vf-kyb-add-step").addEventListener("click", () => addRow({ step: "SCREENING", order: box.children.length + 1, name: vfStepLabel("SCREENING") }));
      el.querySelector("#vf-kyb-cancel").addEventListener("click", closeModal);
      el.querySelector("#vf-kyb-submit").addEventListener("click", () => {
        const fail = (m) => { err.textContent = m; err.hidden = false; };
        const level = el.querySelector("#vf-kyb-level").value.trim();
        if (!/^\d+$/.test(level) || Number(level) < 1 || Number(level) > 20) return fail(f.errLevel);
        const rows = [...box.querySelectorAll("[data-vf-kyb-step]")];
        if (!rows.length) return fail(f.errNoSteps);
        const orders = new Set();
        const steps = [];
        for (let i = 0; i < rows.length; i += 1) {
          const order = rows[i].querySelector("[data-vf-kyb-order]").value.trim();
          const name = rows[i].querySelector("[data-vf-kyb-sname]").value.trim();
          if (!name) return fail(f.errStepName(i + 1));
          if (!/^\d+$/.test(order) || Number(order) < 1) return fail(f.errOrder(i + 1));
          if (orders.has(Number(order))) return fail(f.errOrderDup(i + 1));
          orders.add(Number(order));
          steps.push({ id: seedToPaymentUuid(Date.now() % 100000 + i + 92000), step: rows[i].querySelector("[data-vf-kyb-kind]").value, order: Number(order), name, description: null });
        }
        const name = el.querySelector("#vf-kyb-name").value.trim() || null;
        const now = pdNow();
        const previous = VF_KYB_CONFIGS.find((c) => c.isActive && c.level === Number(level));
        const cfg = vfStamp({
          id: seedToPaymentUuid(Date.now() % 100000 + 93000), key: null, name, service: "ASIA_FINTECH", level: Number(level),
          configVersion: previous ? previous.configVersion + 1 : 1, isActive: true,
          description: el.querySelector("#vf-kyb-desc").value.trim() || null,
          steps: steps.sort((a, b2) => a.order - b2.order),
        }, now);
        if (previous) { previous.isActive = false; acTouch(previous); }
        VF_KYB_CONFIGS.unshift(cfg);
        closeModal();
        window.location.hash = `#/settings-verif-kyb/${cfg.id}`;
        return null;
      });
    },
  });
}

// ==== KYC: мастер создания / новой версии ==================================================
// Пошагово (как мастер счёта): 1) основное, 2) шаги, 3) проверка. Поля — как в реальной
// форме "New KYC config": Service*, Level*, Version (назначает сервер, только чтение),
// Name, Description + шаги (Step*, Order*, Name*, Description, Provider config).
// Версия в API не передаётся: сервер берёт активную по service+level и ставит +1,
// прежнюю деактивирует (kyc-config.service.ts create). Копирования шагов из
// прошлой версии в ядре нет — здесь шаги прежней версии подставляются в мастер
// как удобство, реально уходят те, что в форме (createKYCConfig.steps).
let vfWz = null;
let vfWzSeq = 0;

function vfWzKeys() {
  return ["main", "steps", "summary"];
}

function vfWzNewStep(kind, order) {
  vfWzSeq += 1;
  return { _row: vfWzSeq, step: kind, order: String(order), name: "", description: "", cfgText: JSON.stringify(vfStepDefault(kind), null, 2), cfgTouched: false };
}

function vfWzNextVersion() {
  const level = Number(vfWz.level);
  const previous = VF_KYC_CONFIGS.find((c) => c.isActive && c.service === vfWz.service.trim() && c.level === level);
  return previous ? previous.configVersion + 1 : 1;
}

function vfWzStepperHtml() {
  const w = vf("kyc.wizard");
  return `<div class="kyc-stepper">${vfWzKeys()
    .map((k, i, arr) => {
      const n = i + 1;
      const cls = n < vfWz.step ? "is-done" : n === vfWz.step ? "is-current" : "is-pending";
      return `<div class="kyc-stepper-item">
        <div class="kyc-stepper-circle ${cls}">${n < vfWz.step ? CHECK_ICON_SVG : `<span>${n}</span>`}</div>
        ${i < arr.length - 1 ? `<div class="kyc-stepper-line${n < vfWz.step ? " is-done" : ""}"></div>` : ""}
        <div class="kyc-stepper-label"><div class="kyc-stepper-title">${w[k]}</div></div>
      </div>`;
    })
    .join("")}</div>`;
}

function vfWzMainHtml() {
  const f = vf("kyc.form");
  const w = vf("kyc.wizard");
  const s = vfWz;
  const services = [...new Set(VF_KYC_CONFIGS.map((c) => c.service))];
  const parents = VF_KYC_CONFIGS.filter((c) => c.isActive && (!s.base || c.id !== s.base.id)).map((c) => ({ value: c.id, label: `${pdEscape(c.name || c.service)} · ${vf("columns.level")} ${c.level} · v${c.configVersion}` }));
  const lock = s.base ? "disabled" : "";
  const ver = s.service.trim() && /^\d+$/.test(String(s.level)) ? vfWzNextVersion() : "—";
  return `
    <div class="sl-grid-3">
      ${vbInput("vfw-service", `${vf("fields.service")} *`, s.service, `list="vf-services" ${lock}`)}<datalist id="vf-services">${services.map((x) => `<option value="${escapeAttr(x)}"></option>`).join("")}</datalist>
      ${vbInput("vfw-level", `${vf("fields.level")} *`, String(s.level), `inputmode="numeric" ${lock}`)}
      <label class="filters-field vb-field"><span class="filters-field-label">${w.versionLabel}</span><input class="address-form-input" type="text" id="vfw-version" value="${ver}" disabled /></label>
    </div>
    <p class="table-cell-muted sl-hint">${w.versionHint}</p>
    <div class="sl-grid">${vbInput("vfw-name", vf("fields.name"), s.name)}${vbInput("vfw-button", vf("fields.startButton"), s.startButton)}</div>
    ${vbInput("vfw-desc", vf("fields.description"), s.description)}
    <div class="sl-grid">${vbTextarea("vfw-features", `${vf("fields.features")} (${f.onePerLine})`, s.features, 3)}${vbTextarea("vfw-actions", `${vf("fields.requiredActions")} (${f.onePerLine})`, s.actions, 3)}</div>
    <div class="filters-field vb-field"><span class="filters-field-label">${vf("fields.parents")}</span><div class="ac-checklist" id="vfw-parents">${parents.length ? vfCheckboxes(parents, s.parentIds, "data-vf-parent") : `<span class="table-cell-muted">—</span>`}</div></div>
    <div class="form-error" id="vfw-error" hidden></div>`;
}

function vfWzStepRowHtml(st, i) {
  const w = vf("kyc.wizard");
  const kindOptions = () => VF_STEP_KINDS.map((k) => ({ value: k, label: `${vf(`steps.${k}.name`)}`, sub: k }));
  return `<div class="pc-section acw-set">
    <div class="acw-set-head"><span class="acw-set-group-title">${vf("kyc.form.step")} ${i + 1}</span><button type="button" class="icon-btn" data-vfw-remove="${st._row}" title="${vf("kyc.form.remove")}">${TRASH_ICON_SVG}</button></div>
    <div class="acw-set-grid">
      <div class="filters-field"><span class="filters-field-label">${vf("kyc.form.stepType")} *</span>
        ${acwMsHtml(`vfw-kind-${st._row}`, w.stepPlaceholder, { single: true, options: kindOptions, get: () => (st.step ? [st.step] : []), set: (v) => { st.step = v[0] || st.step; if (!st.cfgTouched) st.cfgText = JSON.stringify(vfStepDefault(st.step), null, 2); }, onChange: vfWzRender })}
      </div>
      ${vbInput(`vfw-order-${st._row}`, `${w.order} *`, st.order, 'inputmode="numeric"')}
    </div>
    <div class="acw-set-grid">${vbInput(`vfw-sname-${st._row}`, `${vf("fields.name")} *`, st.name)}${vbInput(`vfw-sdesc-${st._row}`, vf("fields.description"), st.description)}</div>
    ${vbTextarea(`vfw-scfg-${st._row}`, vf("fields.providerConfig"), st.cfgText, 5)}
  </div>`;
}

function vfWzStepsHtml() {
  const w = vf("kyc.wizard");
  return `<div class="filters-field">
    <p class="table-cell-muted">${w.stepsIntro}</p>
    <div class="acw-sets">${vfWz.steps.length ? vfWz.steps.map(vfWzStepRowHtml).join("") : `<div class="table-cell-muted">${w.stepsEmpty}</div>`}</div>
    <button type="button" class="table-link" id="vfw-add">+ ${vf("kyc.form.addStep")}</button>
  </div>
  <div class="form-error" id="vfw-error" hidden></div>`;
}

function vfWzSummaryHtml() {
  const w = vf("kyc.wizard");
  const s = vfWz;
  const f = vf("fields");
  const rows = s.steps.slice().sort((a, b) => Number(a.order) - Number(b.order)).map((x) => [x.order, `<strong>${vfStepLabel(x.step)}</strong><div class="table-cell-muted vb-mono">${x.step}</div>`, pdEscape(x.name), x.description ? pdEscape(x.description) : "—"]);
  return `<div class="profile-fields profile-fields-grid">
      ${detailField(f.service, pdEscape(s.service))}${detailField(f.level, pdEscape(String(s.level)))}${detailField(f.version, vfWzNextVersion())}
      ${detailField(f.name, s.name ? pdEscape(s.name) : "—")}${detailField(f.startButton, s.startButton ? pdEscape(s.startButton) : "—")}${detailField(f.description, s.description ? pdEscape(s.description) : "—")}
    </div>
    <div class="vf-cfg-title">${w.sumSteps} · ${rows.length}</div>
    ${vbMiniTable([f.order, f.stepCode, f.name, f.description], rows, "")}`;
}

function vfWzBodyHtml() {
  const key = vfWzKeys()[vfWz.step - 1];
  const inner = key === "main" ? vfWzMainHtml() : key === "steps" ? vfWzStepsHtml() : vfWzSummaryHtml();
  return `<div class="pc-form-stack">${inner}</div>`;
}

function vfWzFooterHtml() {
  const w = vf("kyc.wizard");
  const last = vfWz.step === vfWzKeys().length;
  const left = vfWz.step > 1 ? `<button type="button" class="btn-secondary" id="vfw-back">${w.back}</button>` : `<button type="button" class="btn-secondary" id="vfw-cancel">${vt("common.cancel")}</button>`;
  return `${left}<button type="button" class="btn-primary" id="vfw-next">${last ? (vfWz.base ? vf("kyc.form.versionSubmit") : vt("common.create")) : w.next}</button>`;
}

function vfWzBind(el) {
  const s = vfWz;
  const key = vfWzKeys()[s.step - 1];
  const on = (id, evt, fn) => { const n = el.querySelector(`#${id}`); if (n) n.addEventListener(evt, fn); };
  if (key === "main") {
    on("vfw-service", "input", (e) => { s.service = e.target.value; vfWzRefreshVersion(el); });
    on("vfw-level", "input", (e) => { s.level = e.target.value; vfWzRefreshVersion(el); });
    on("vfw-name", "input", (e) => { s.name = e.target.value; });
    on("vfw-button", "input", (e) => { s.startButton = e.target.value; });
    on("vfw-desc", "input", (e) => { s.description = e.target.value; });
    on("vfw-features", "input", (e) => { s.features = e.target.value; });
    on("vfw-actions", "input", (e) => { s.actions = e.target.value; });
    el.querySelectorAll("[data-vf-parent]").forEach((cb) => cb.addEventListener("change", () => { s.parentIds = [...el.querySelectorAll("[data-vf-parent]:checked")].map((i) => i.dataset.vfParent); }));
  } else if (key === "steps") {
    acwBindMs(el);
    s.steps.forEach((st) => {
      on(`vfw-order-${st._row}`, "input", (e) => { st.order = e.target.value; });
      on(`vfw-sname-${st._row}`, "input", (e) => { st.name = e.target.value; });
      on(`vfw-sdesc-${st._row}`, "input", (e) => { st.description = e.target.value; });
      on(`vfw-scfg-${st._row}`, "input", (e) => { st.cfgText = e.target.value; st.cfgTouched = true; });
    });
    el.querySelectorAll("[data-vfw-remove]").forEach((b) => b.addEventListener("click", () => { s.steps = s.steps.filter((x) => String(x._row) !== b.dataset.vfwRemove); acwMsClose(); vfWzRender(el); }));
    on("vfw-add", "click", () => {
      const max = s.steps.reduce((m, x) => Math.max(m, Number(x.order) || 0), 0);
      s.steps.push(vfWzNewStep("BB_CHECKS", max + 1));
      vfWzRender(el);
    });
  }
  on("vfw-cancel", "click", () => { acwMsClose(); closeModal(); });
  on("vfw-back", "click", () => { acwMsClose(); s.step -= 1; vfWzRender(el); });
  on("vfw-next", "click", () => vfWzGoNext(el));
}

function vfWzRefreshVersion(el) {
  const v = el.querySelector("#vfw-version");
  if (v) v.value = vfWz.service.trim() && /^\d+$/.test(String(vfWz.level)) ? vfWzNextVersion() : "—";
}

function vfWzRender(modalEl) {
  const root = modalEl && modalEl.id === "app-modal" ? modalEl : document.getElementById("app-modal");
  root.querySelector(".modal-body").innerHTML = `${vfWzStepperHtml()}${vfWzBodyHtml()}`;
  root.querySelector(".modal-footer").innerHTML = vfWzFooterHtml();
  vfWzBind(root);
  acwMsReposition();
}

function vfWzValidate() {
  const f = vf("kyc.form");
  const w = vf("kyc.wizard");
  const s = vfWz;
  const key = vfWzKeys()[s.step - 1];
  if (key === "main") {
    if (!s.service.trim()) return f.errService;
    if (!/^\d+$/.test(String(s.level).trim()) || Number(s.level) < 1 || Number(s.level) > 20) return f.errLevel;
    return null;
  }
  if (key === "steps") {
    if (!s.steps.length) return f.errNoSteps;
    const orders = new Set();
    for (let i = 0; i < s.steps.length; i += 1) {
      const st = s.steps[i];
      if (!st.name.trim()) return w.errStepName(i + 1);
      if (!/^\d+$/.test(String(st.order).trim()) || Number(st.order) < 1) return w.errOrder(i + 1);
      if (orders.has(Number(st.order))) return w.errOrderDup(i + 1);
      orders.add(Number(st.order));
      const parsed = vbParseJson(st.cfgText, false);
      if (!parsed.ok || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return f.errStepJson(i + 1);
    }
  }
  return null;
}

function vfWzGoNext(el) {
  const err = vfWzValidate();
  const box = el.querySelector("#vfw-error");
  if (err) { if (box) { box.textContent = err; box.hidden = false; } return; }
  if (vfWz.step < vfWzKeys().length) { vfWz.step += 1; vfWzRender(el); return; }
  vfWzSubmit();
}

function vfWzSubmit() {
  const s = vfWz;
  const service = s.service.trim();
  const level = Number(s.level);
  const now = pdNow();
  const steps = s.steps
    .slice()
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((x, i) => ({ id: seedToPaymentUuid(Date.now() % 100000 + i + 90000), step: x.step, order: Number(x.order), name: x.name.trim(), description: x.description.trim() || null, providerConfig: vbParseJson(x.cfgText, false).value }));
  const previous = VF_KYC_CONFIGS.find((c) => c.isActive && c.service === service && c.level === level);
  const cfg = vfStamp({
    id: seedToPaymentUuid(Date.now() % 100000 + 95000), key: null,
    name: s.name.trim() || null, service, level,
    configVersion: previous ? previous.configVersion + 1 : 1, isActive: true,
    description: s.description.trim() || null, startButtonText: s.startButton.trim() || null,
    availableFeatures: vfLines(s.features), requiredActions: vfLines(s.actions),
    parentIds: s.parentIds.slice(), references: [], steps,
  }, now);
  if (previous) { previous.isActive = false; acTouch(previous); }
  VF_KYC_CONFIGS.unshift(cfg);
  closeModal();
  window.location.hash = `#/settings-verif-kyc/${cfg.id}`;
  showToast(t("toast.kycConfigCreated"));
}

function vfOpenKycForm(base) {
  const f = vf("kyc.form");
  vfWz = {
    step: 1, base: base || null,
    service: base ? base.service : "", level: base ? String(base.level) : "", name: base ? base.name || "" : "", startButton: base ? base.startButtonText || "" : "",
    description: base ? base.description || "" : "", features: base ? base.availableFeatures.join("\n") : "", actions: base ? base.requiredActions.join("\n") : "",
    parentIds: base ? base.parentIds.slice() : [],
    steps: base ? base.steps.slice().sort((a, b) => a.order - b.order).map((x) => Object.assign(vfWzNewStep(x.step, x.order), { name: x.name || "", description: x.description || "", cfgText: JSON.stringify(x.providerConfig || {}, null, 2), cfgTouched: true })) : [],
  };
  openModal({
    title: base ? f.versionTitle : f.createTitle,
    width: 760,
    bodyHtml: `${vfWzStepperHtml()}${vfWzBodyHtml()}`,
    footerHtml: vfWzFooterHtml(),
    onMount: (el) => vfWzBind(el),
  });
}


// ==== KYC: страница конфигурации ==============================================================
function vfConfigValue(v) {
  if (typeof v === "boolean") return v ? vt("common.yes") : vt("common.no");
  if (Array.isArray(v)) return v.every((x) => typeof x !== "object") ? `<div class="ac-badges">${v.map((x) => `<span class="badge badge-neutral">${pdEscape(String(x))}</span>`).join("")}</div>` : vbJson(v);
  if (v && typeof v === "object") return vbJson(v);
  return pdEscape(String(v));
}

function vfProviderConfigView(cfg) {
  const entries = Object.entries(cfg || {});
  if (!entries.length) return `<div class="table-cell-muted">${vf("kyc.detail.emptyConfig")}</div>`;
  const keys = vf("providerKeys");
  return `<div class="profile-fields">${entries.map(([k, v]) => detailField(`${keys[k] || k}<span class="vb-mono vf-key"> ${k}</span>`, vfConfigValue(v))).join("")}</div>`;
}

function viewKycDetail(id) {
  const c = vfKycById(id);
  if (!c) return vfNotFoundHtml();
  const f = vf("fields");
  const d = vf("kyc.detail");
  const parents = c.parentIds.map((pid) => vfKycById(pid)).filter(Boolean);
  const users = vfUsersOfKyc(c);
  const actions = `<button type="button" class="btn-secondary" data-vf-action="edit">${vt("common.edit")}</button>`;
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, c.code)}${detailField(f.name, c.name ? pdEscape(c.name) : "—")}${detailField(f.service, pdEscape(c.service))}${detailField(f.level, c.level)}
    ${detailField(f.version, c.configVersion)}${detailField(f.state, vfStateBadge(c.isActive))}${detailField(f.startButton, c.startButtonText ? pdEscape(c.startButtonText) : "—")}
    ${detailField(f.description, c.description ? pdEscape(c.description) : "—")}${detailField(f.created, c.createdAt)}${detailField(f.updated, c.updatedAt)}</div>`;
  const list = (arr) => (arr.length ? `<ul class="vf-list">${arr.map((x) => `<li>${pdEscape(x)}</li>`).join("")}</ul>` : `<div class="table-cell-muted">—</div>`);
  const parentHtml = parents.length ? parents.map((p) => vbLink(`#/settings-verif-kyc/${p.id}`, `${pdEscape(p.name || p.service)} · ${f.level} ${p.level} · v${p.configVersion}`)).join("<br>") : `<span class="table-cell-muted">${d.noParents}</span>`;
  const steps = c.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) =>
      flatSection(
        `${vf("kyc.form.step")} ${s.order} · ${vfStepLabel(s.step)}`,
        `<div class="profile-fields profile-fields-grid">${detailField(f.stepCode, `<span class="vb-mono">${s.step}</span>`)}${detailField(f.order, s.order)}${detailField(f.name, s.name ? pdEscape(s.name) : "—")}${detailField(f.description, s.description ? pdEscape(s.description) : vf(`steps.${s.step}.hint`))}</div>
        <div class="vf-cfg-title">${f.providerConfig}</div>${vfProviderConfigView(s.providerConfig)}`,
        `data-vf-step-edit="${s.id}"`
      )
    )
    .join("");
  const usersTable = vbMiniTable(
    [vf("columns.id"), f.fullName, f.email, f.currentStatus, f.country, vf("columns.created")],
    users.slice(0, 15).map((u) => {
      const country = u.residenceCountryId ? findCountry(u.residenceCountryId) : null;
      return [vbLink(`#/clients-users/${u.id}`, u.code), pdEscape(u.fullName), pdEscape(u.email), `<span class="badge ${statusBadgeClass(u.kycStatus)}">${kycStatusLabel(u.kycStatus)}</span>`, country ? `<span class="table-country"><span class="flag-icon">${country.flag}</span>${country.name}</span>` : "—", u.createdAt];
    }),
    c.isActive && VF_KYC_CONFIGS.some((x) => x.name === c.name && x.configVersion < c.configVersion) ? d.usersOnOlder : d.noUsers
  );
  return `<div id="vf-root">
    ${vbDetailHeader({ backHash: "#/settings-verif-kyc", title: `${d.title} ${c.code}`, badges: `${vfStateBadge(c.isActive)}<span class="badge badge-neutral">v${c.configVersion}</span>`, subtitle: vbCodeSubtitle(c.code, [pdEscape(c.service), `${f.level} ${c.level}`, c.createdAt]), actions })}
    <div class="vf-banner"><span>${d.stepsBanner}</span><button type="button" class="btn-secondary" data-vf-action="newVersion">${d.newVersion}</button></div>
    <div class="pd-grid">
      <div class="pd-col"><div class="profile-flat-block">${flatSection(vt("sections.main"), main)}${steps}${flatSection(`${d.users} · ${users.length}`, usersTable)}</div></div>
      <div class="pd-col">${sectionCard(f.features, list(c.availableFeatures))}${sectionCard(f.requiredActions, list(c.requiredActions))}${sectionCard(f.parents, parentHtml)}${sectionCard(vt("sections.service"), vbJson({ references: c.references }), "is-collapsed")}</div>
    </div>
  </div>`;
}

function initKycDetail(id) {
  const c = vfKycById(id);
  const root = document.getElementById("vf-root");
  if (!c || !root) return;
  vbAttachCommon(root);
  root.querySelector('[data-vf-action="edit"]').addEventListener("click", () => vfOpenKycEdit(c));
  root.querySelector('[data-vf-action="newVersion"]').addEventListener("click", () => vfOpenKycForm(c));
  root.querySelectorAll("[data-vf-step-edit]").forEach((b) => b.addEventListener("click", () => vfOpenStepEdit(c, c.steps.find((s) => s.id === b.dataset.vfStepEdit))));
}

// ==== KYB: страница конфигурации ==============================================================
function viewKybDetail(id) {
  const c = vfKybById(id);
  if (!c) return vfNotFoundHtml();
  const f = vf("fields");
  const d = vf("kyb.detail");
  const companies = vfCompaniesOfKyb(c);
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, c.code)}${detailField(f.name, c.name ? pdEscape(c.name) : "—")}${detailField(f.level, c.level)}
    ${detailField(f.version, c.configVersion)}${detailField(f.state, vfStateBadge(c.isActive))}
    ${detailField(f.description, c.description ? pdEscape(c.description) : "—")}${detailField(f.created, c.createdAt)}${detailField(f.updated, c.updatedAt)}</div>`;
  const steps = c.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) =>
      flatSection(
        `${f.stepCode} ${s.order} · ${vfStepLabel(s.step)}`,
        `<div class="profile-fields profile-fields-grid">${detailField(f.stepCode, `<span class="vb-mono">${s.step}</span>`)}${detailField(f.order, s.order)}${detailField(f.name, s.name ? pdEscape(s.name) : "—")}${detailField(f.description, s.description ? pdEscape(s.description) : vf(`steps.${s.step}.hint`))}</div>`
      )
    )
    .join("");
  const companiesTable = vbMiniTable(
    [vf("columns.id"), f.name, "KYB", vf("columns.created")],
    companies.slice(0, 15).map((cm) => [vbLink(`#/clients-companies/${cm.id}`, cm.code), pdEscape(cm.name), cm.currentKYBLevelStatusV2 ? `<span class="badge ${statusBadgeClass(cm.currentKYBLevelStatusV2.status)}">${kybStatusLabel(cm.currentKYBLevelStatusV2.status)}</span>` : "—", cm.createdAt]),
    d.noCompanies
  );
  return `<div id="vf-root">
    ${vbDetailHeader({ backHash: "#/settings-verif-kyb", title: `${d.title} ${c.code}`, badges: `${vfStateBadge(c.isActive)}<span class="badge badge-neutral">v${c.configVersion}</span>`, subtitle: vbCodeSubtitle(c.code, [`${f.level} ${c.level}`, c.createdAt]) })}
    <div class="vf-banner"><span>${d.stepsBanner}</span><button type="button" class="btn-secondary" data-vf-kyb-action="newVersion">${d.newVersion}</button></div>
    ${flatSection(vt("sections.main"), main)}
    ${steps}
    ${flatSection(`${d.companies} · ${companies.length}`, companiesTable)}
  </div>`;
}

function initKybDetail(id) {
  const c = vfKybById(id);
  const root = document.getElementById("vf-root");
  if (!c || !root) return;
  vbAttachCommon(root);
  const b = root.querySelector('[data-vf-kyb-action="newVersion"]');
  if (b) b.addEventListener("click", () => vfOpenKybForm(c));
}

function vfOpenKycEdit(c) {
  const f = vf("kyc.form");
  const parents = VF_KYC_CONFIGS.filter((x) => x.id !== c.id).map((x) => ({ value: x.id, label: `${pdEscape(x.name || x.service)} · ${vf("columns.level")} ${x.level} · v${x.configVersion}` }));
  vbOpenForm({
    title: f.editTitle,
    width: 620,
    intro: f.editIntro,
    fieldsHtml: `${vbInput("vf-name", vf("fields.name"), c.name || "")}${vbInput("vf-desc", vf("fields.description"), c.description || "")}${vbInput("vf-button", vf("fields.startButton"), c.startButtonText || "")}
      <div class="sl-grid">${vbTextarea("vf-features", `${vf("fields.features")} (${f.onePerLine})`, c.availableFeatures.join("\n"), 4)}${vbTextarea("vf-actions", `${vf("fields.requiredActions")} (${f.onePerLine})`, c.requiredActions.join("\n"), 4)}</div>
      <div class="filters-field vb-field"><span class="filters-field-label">${vf("fields.parents")}</span><div class="ac-checklist">${vfCheckboxes(parents, c.parentIds, "data-vf-parent")}</div></div>`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      closeModal();
      Object.assign(c, {
        name: el.querySelector("#vf-name").value.trim() || null, description: el.querySelector("#vf-desc").value.trim() || null, startButtonText: el.querySelector("#vf-button").value.trim() || null,
        availableFeatures: vfLines(el.querySelector("#vf-features").value), requiredActions: vfLines(el.querySelector("#vf-actions").value),
        parentIds: [...el.querySelectorAll("[data-vf-parent]:checked")].map((i) => i.dataset.vfParent),
      });
      acTouch(c);
      vfRerender();
      return null;
    },
  });
}

function vfOpenStepEdit(c, s) {
  if (!s) return;
  const f = vf("kyc.stepForm");
  vbOpenForm({
    title: `${f.title}: ${vfStepLabel(s.step)}`,
    width: 620,
    intro: f.intro,
    fieldsHtml: `${vbInput("vf-sname", vf("fields.name"), s.name || "")}${vbInput("vf-sdesc", vf("fields.description"), s.description || "")}${vbTextarea("vf-scfg", vf("fields.providerConfig"), JSON.stringify(s.providerConfig || {}, null, 2), 10)}`,
    submitLabel: vt("common.save"),
    danger: true,
    onSubmit: (el) => {
      const parsed = vbParseJson(el.querySelector("#vf-scfg").value, false);
      if (!parsed.ok || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return vt("common.errJsonObject");
      closeModal();
      s.name = el.querySelector("#vf-sname").value.trim() || null;
      s.description = el.querySelector("#vf-sdesc").value.trim() || null;
      s.providerConfig = parsed.value;
      acTouch(c);
      vfRerender();
      return null;
    },
  });
}

// ==== Документы: список ====================================================================
function vfCountryName(id) {
  const c = findCountry(id);
  return c ? c.name : id;
}

const vfDocList = createAccessList({
  key: "vf-doc",
  data: () => VF_DOC_CONFIGS,
  searchPlaceholder: () => vf("docs.search"),
  searchText: (d) => [d.recordCode, d.name, d.description, d.code, d.docType].filter(Boolean).join(" "),
  tab: { get: (d) => (d.isActive ? "active" : "inactive"), values: ["active", "inactive"], label: (v) => vf(`status.${v}`) },
  filters: [
    { id: "created", kind: "date", label: () => vf("filters.created"), get: (d) => d.createdDate },
    { id: "docType", kind: "multi", label: () => vf("filters.docType"), get: (d) => d.docType, options: () => [...new Set(VF_DOC_CONFIGS.map((d) => d.docType))].map((v) => ({ value: v, label: v })) },
    { id: "country", kind: "multi", label: () => vf("filters.country"), get: (d) => d.availableCountryIds, options: () => COUNTRY_OPTIONS.map((c) => ({ value: c.id, label: c.name })) },
    { id: "code", kind: "multi", label: () => vf("filters.code"), get: (d) => d.code || "", options: () => VF_DOC_CONFIGS.filter((d) => d.code).map((d) => ({ value: d.code, label: d.code })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name), created: (a, b) => a.createdDate - b.createdDate, updated: (a, b) => a.updatedDate - b.updatedDate },
  metrics: (list) => {
    const m = vf("docs.metrics");
    return [
      { value: new Set(list.map((d) => d.docType)).size, label: m.types },
      { value: list.reduce((n, d) => n + d.fieldConfigs.length, 0), label: m.fields },
      { value: list.filter((d) => !d.availableCountryIds.length).length, label: m.noCountries },
    ];
  },
  columns: [
    { label: () => vf("columns.id"), html: (d) => `<div class="identity-cell-primary">${vbLink(`#/settings-verif-documents/${d.id}`, d.recordCode)}${copyIconButton(d.recordCode)}</div>` },
    { label: () => vf("columns.name"), sort: "name", html: (d) => pdEscape(d.name) },
    { label: () => vf("columns.description"), html: (d) => slTrunc(d.description, true) },
    { label: () => vf("columns.code"), html: (d) => (d.code ? `<span class="vb-mono">${d.code}</span>` : "—") },
    { label: () => vf("columns.docType"), html: (d) => pdEscape(d.docType) },
    { label: () => vf("columns.version"), html: (d) => d.configVersion },
    { label: () => vf("columns.state"), html: (d) => vfStateBadge(d.isActive) },
    { label: () => vf("columns.countries"), html: (d) => d.availableCountryIds.length },
    { label: () => vf("columns.fields"), html: (d) => d.fieldConfigs.length },
    { label: () => vf("columns.created"), sort: "created", html: (d) => dateTimeCell(d.createdAt) },
    { label: () => vf("columns.updated"), sort: "updated", html: (d) => dateTimeCell(d.updatedAt) },
  ],
  attachRows: vbAttachRows,
});

// ==== Документы: форма ===========================================================================
function vfOpenDocForm(doc) {
  const f = vf("docs.form");
  const isEdit = !!doc;
  const docTypes = [...new Set(VF_DOC_CONFIGS.map((d) => d.docType))];
  const countries = COUNTRY_OPTIONS.map((c) => ({ value: c.id, label: c.name }));
  vbOpenForm({
    title: isEdit ? f.editTitle : f.createTitle,
    width: 600,
    intro: isEdit ? f.editIntro : f.createIntro,
    fieldsHtml: `${vbInput("vf-name", `${vf("fields.name")} *`, isEdit ? doc.name : "")}
      <div class="sl-grid">${vbInput("vf-doctype", `${vf("fields.docType")} *`, isEdit ? doc.docType : "", `list="vf-doctypes" ${isEdit ? "disabled" : ""}`)}<datalist id="vf-doctypes">${docTypes.map((v) => `<option value="${escapeAttr(v)}"></option>`).join("")}</datalist>${vbInput("vf-code", vf("fields.code"), isEdit && doc.code ? doc.code : "")}</div>
      ${vbInput("vf-desc", vf("fields.description"), isEdit && doc.description ? doc.description : "")}
      <div class="filters-field vb-field"><span class="filters-field-label">${vf("fields.countries")}</span><div class="ac-checklist">${vfCheckboxes(countries, isEdit ? doc.availableCountryIds : [], "data-vf-country")}</div></div>`,
    submitLabel: isEdit ? vt("common.save") : vt("common.create"),
    onSubmit: (el) => {
      const name = el.querySelector("#vf-name").value.trim();
      const docType = el.querySelector("#vf-doctype").value.trim();
      const code = el.querySelector("#vf-code").value.trim() || null;
      if (!name) return f.errName;
      if (!isEdit && !docType) return f.errDocType;
      if (isEdit && name !== doc.name && VF_DOC_CONFIGS.some((d) => d.name === name)) return f.errNameExists;
      if (code && VF_DOC_CONFIGS.some((d) => d !== doc && d.code === code)) return f.errCodeExists;
      const countryIds = [...el.querySelectorAll("[data-vf-country]:checked")].map((i) => i.dataset.vfCountry);
      const description = el.querySelector("#vf-desc").value.trim() || null;
      closeModal();
      if (isEdit) {
        Object.assign(doc, { name, code, description, availableCountryIds: countryIds });
        acTouch(doc);
        vfRerender();
        return null;
      }
      const previous = VF_DOC_CONFIGS.find((d) => d.isActive && d.name === name);
      const rec = vfStamp({ id: seedToPaymentUuid(Date.now() % 100000 + 96000), name, description, code, docType, configVersion: previous ? previous.configVersion + 1 : 1, isActive: true, availableCountryIds: countryIds, references: [], fieldConfigs: [] }, pdNow());
      if (previous) { previous.isActive = false; acTouch(previous); }
      VF_DOC_CONFIGS.unshift(rec);
      window.location.hash = `#/settings-verif-documents/${rec.id}`;
      return null;
    },
  });
}

// ==== Документы: страница ==========================================================================
const vfFieldState = { search: "", onlyTable: false };

function vfFieldsHtml(doc) {
  const f = vf("fields");
  const d = vf("docs.detail");
  const q = vfFieldState.search.trim().toLowerCase();
  const rows = doc.fieldConfigs
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((x) => (!vfFieldState.onlyTable || x.displayInTable) && (!q || [x.key, x.label, x.description, x.id].join(" ").toLowerCase().includes(q)))
    .map((x) => [
      x.order, `<span class="vb-mono">${pdEscape(x.key)}</span>`, pdEscape(x.label), pdEscape(x.description), vf(`fieldTypes.${x.type}`),
      vfStateBadge(x.isActive), x.displayInTable ? vt("common.yes") : vt("common.no"), x.updatedAt,
      `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-vf-field-edit="${x.id}" title="${vt("common.edit")}">${EDIT_ICON_SVG}</button><button type="button" class="btn-secondary vb-row-btn sl-del" data-vf-field-del="${x.id}" title="${d.deleteField}">${TRASH_ICON_SVG}</button></div>`,
    ]);
  return vbMiniTable([f.order, f.key, f.label, f.description, f.type, f.state, d.displayInTable, vf("columns.updated"), ""], rows, d.noFields);
}

function viewDocDetail(id) {
  const doc = vfDocById(id);
  if (!doc) return vfNotFoundHtml();
  if (!vfKeepTab) { vfFieldState.search = ""; vfFieldState.onlyTable = false; }
  vfKeepTab = false;
  const f = vf("fields");
  const d = vf("docs.detail");
  const actions = `<button type="button" class="btn-secondary" data-vf-action="edit">${vt("common.edit")}</button><button type="button" class="btn-danger" data-vf-action="delete">${vt("common.delete")}</button>`;
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, doc.recordCode)}${detailField(f.name, pdEscape(doc.name))}${detailField(f.code, doc.code ? `<span class="vb-mono">${doc.code}</span>` : "—")}${detailField(f.docType, pdEscape(doc.docType))}
    ${detailField(f.version, doc.configVersion)}${detailField(f.state, vfStateBadge(doc.isActive))}${detailField(f.description, doc.description ? pdEscape(doc.description) : "—")}
    ${detailField(f.created, doc.createdAt)}${detailField(f.updated, doc.updatedAt)}</div>`;
  const countries = doc.availableCountryIds.length ? `<div class="ac-badges">${doc.availableCountryIds.map((c) => `<span class="badge badge-neutral">${pdEscape(vfCountryName(c))}</span>`).join("")}</div>` : `<div class="table-cell-muted">${d.noCountries}</div>`;
  return `<div id="vf-root">
    ${vbDetailHeader({ backHash: "#/settings-verif-documents", title: pdEscape(doc.name), badges: `${vfStateBadge(doc.isActive)}<span class="badge badge-neutral">v${doc.configVersion}</span>`, subtitle: vbCodeSubtitle(doc.recordCode, [pdEscape(doc.docType), doc.createdAt]), actions })}
    <div class="pd-grid">
      <div class="pd-col">${sectionCard(vt("sections.main"), main)}</div>
      <div class="pd-col">${sectionCard(f.countries, countries)}${sectionCard(vt("sections.service"), vbJson({ references: doc.references }), "is-collapsed")}</div>
    </div>
    ${sectionCard(`${d.fields} · ${doc.fieldConfigs.length}`, `<div class="vf-fields-tools">
      <div class="filters-search"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5.5"/><path d="m17 17-3.5-3.5"/></svg><input type="text" id="vf-field-search" placeholder="${d.fieldSearch}" value="${escapeAttr(vfFieldState.search)}" /></div>
      ${switchRowHtml("vf-field-only", d.onlyTable, vfFieldState.onlyTable)}
      <button type="button" class="btn-primary" data-vf-action="addField">+ ${d.addField}</button></div>
      <div id="vf-fields">${vfFieldsHtml(doc)}</div>`)}
  </div>`;
}

function vfBindFields(doc) {
  const box = document.getElementById("vf-fields");
  vbAttachCommon(box);
  box.querySelectorAll("[data-vf-field-edit]").forEach((b) => b.addEventListener("click", () => vfOpenFieldForm(doc, doc.fieldConfigs.find((x) => x.id === b.dataset.vfFieldEdit))));
  box.querySelectorAll("[data-vf-field-del]").forEach((b) =>
    b.addEventListener("click", () => {
      const field = doc.fieldConfigs.find((x) => x.id === b.dataset.vfFieldDel);
      const d = vf("docs.detail");
      vbConfirm({ title: d.deleteFieldTitle, text: d.deleteFieldText(pdEscape(field.label), pdEscape(field.key)), confirmLabel: vt("common.delete"), danger: true, onConfirm: () => { doc.fieldConfigs.splice(doc.fieldConfigs.indexOf(field), 1); acTouch(doc); vfRerender(); } });
    })
  );
}

function initDocDetail(id) {
  const doc = vfDocById(id);
  const root = document.getElementById("vf-root");
  if (!doc || !root) return;
  vbAttachCommon(root);
  vfBindFields(doc);
  const refresh = () => { document.getElementById("vf-fields").innerHTML = vfFieldsHtml(doc); vfBindFields(doc); };
  document.getElementById("vf-field-search").addEventListener("input", (e) => { vfFieldState.search = e.target.value; refresh(); });
  document.getElementById("vf-field-only").addEventListener("change", (e) => { vfFieldState.onlyTable = e.target.checked; refresh(); });
  root.querySelectorAll("[data-vf-action]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.vfAction;
      if (act === "edit") vfOpenDocForm(doc);
      if (act === "addField") vfOpenFieldForm(doc, null);
      if (act === "delete") {
        const m = vf("docs.form");
        vbConfirm({ title: m.deleteTitle, text: m.deleteText(pdEscape(doc.name)), confirmLabel: vt("common.delete"), danger: true, onConfirm: () => { VF_DOC_CONFIGS.splice(VF_DOC_CONFIGS.indexOf(doc), 1); window.location.hash = "#/settings-verif-documents"; } });
      }
    })
  );
}

function vfOpenFieldForm(doc, field) {
  const m = vf("docs.fieldForm");
  const types = ["STRING", "NUMBER", "DATE", "BOOLEAN"].map((v) => ({ value: v, label: vf(`fieldTypes.${v}`) }));
  const checkbox = (id, label, on) => switchRowHtml(id, label, on, { cls: "vb-field" });
  vbOpenForm({
    title: field ? m.editTitle : m.addTitle,
    width: 560,
    intro: m.intro,
    fieldsHtml: `<div class="sl-grid">${vbInput("vf-key", `${vf("fields.key")} *`, field ? field.key : "")}${vbInput("vf-label", `${vf("fields.label")} *`, field ? field.label : "")}</div>
      ${vbInput("vf-fdesc", `${vf("fields.description")} *`, field ? field.description : "")}
      <div class="sl-grid">${vbSelect("vf-type", vf("fields.type"), types, field ? field.type : "STRING")}${vbInput("vf-order", `${vf("fields.order")} *`, String(field ? field.order : doc.fieldConfigs.length + 1), 'inputmode="numeric"')}</div>
      ${checkbox("vf-active", vf("fields.state"), field ? field.isActive : true)}${checkbox("vf-intable", m.displayInTable, field ? field.displayInTable : false)}`,
    submitLabel: field ? vt("common.save") : vt("common.create"),
    onSubmit: (el) => {
      const key = el.querySelector("#vf-key").value.trim();
      const label = el.querySelector("#vf-label").value.trim();
      const description = el.querySelector("#vf-fdesc").value.trim();
      const orderRaw = el.querySelector("#vf-order").value.trim();
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) return m.errKey;
      if (!label || !description) return m.errRequired;
      if (!/^\d+$/.test(orderRaw)) return m.errOrder;
      if (doc.fieldConfigs.some((x) => x !== field && x.key === key)) return m.errKeyExists;
      closeModal();
      const data = { key, label, description, type: el.querySelector("#vf-type").value, order: Number(orderRaw), isActive: el.querySelector("#vf-active").checked, displayInTable: el.querySelector("#vf-intable").checked };
      if (field) Object.assign(field, data);
      else doc.fieldConfigs.push(vfStamp({ id: seedToPaymentUuid(Date.now() % 100000 + 97000), references: [], ...data }, pdNow()));
      if (field) acTouch(field);
      acTouch(doc);
      vfRerender();
      return null;
    },
  });
}

// ==== Адреса: категории ===============================================================================
function vfCategoryUsed(cat) {
  return VF_KYC_ADDRESS_CATEGORIES.includes(cat.name);
}

const vfAddressList = createAccessList({
  key: "vf-addr",
  data: () => VF_ADDRESS_CATEGORIES,
  searchPlaceholder: () => vf("addresses.search"),
  searchText: (c) => [c.code, c.name, c.description].filter(Boolean).join(" "),
  tab: { get: (c) => (c.deletedDate ? "deleted" : "active"), values: ["active", "deleted"], label: (v) => vf(`addresses.tabs.${v}`) },
  filters: [
    { id: "created", kind: "date", label: () => vf("filters.created"), get: (c) => c.createdDate },
    { id: "updated", kind: "date", label: () => vf("filters.updated"), get: (c) => c.updatedDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, updated: (a, b) => a.updatedDate - b.updatedDate, deleted: (a, b) => (a.deletedDate || 0) - (b.deletedDate || 0) },
  metrics: (list) => {
    const m = vf("addresses.metrics");
    return [
      { value: list.reduce((n, c) => n + c.addressesCount, 0), label: m.addresses },
      { value: list.filter((c) => c.addressesCount > 0).length, label: m.withAddresses },
      { value: list.filter(vfCategoryUsed).length, label: m.usedInKyc },
    ];
  },
  columns: [
    { label: () => vf("columns.id"), html: (c) => `<div class="identity-cell-primary"><button type="button" class="id-copy" data-copy-value="${c.code}" title="${t("clientsUsers.copy")}"><span class="id-copy-label">${c.code}</span>${COPY_ICON_SVG}</button></div>` },
    { label: () => vf("columns.name"), html: (c) => `<div class="identity-cell"><span>${pdEscape(c.name)}</span>${vfCategoryUsed(c) ? `<span class="badge badge-info vf-used">${vf("addresses.usedInKycBadge")}</span>` : ""}</div>` },
    { label: () => vf("columns.addresses"), html: (c) => c.addressesCount },
    { label: () => vf("columns.description"), html: (c) => (c.description ? pdEscape(c.description) : "—") },
    { label: () => vf("columns.created"), sort: "created", html: (c) => dateTimeCell(c.createdAt) },
    { label: () => vf("columns.updated"), sort: "updated", html: (c) => dateTimeCell(c.updatedAt) },
    { label: () => vf("columns.deleted"), sort: "deleted", html: (c) => (c.deletedAt ? dateTimeCell(c.deletedAt) : "—") },
    { label: () => "", html: (c) => (c.deletedDate ? "" : `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-vf-cat-edit="${c.id}" title="${vt("common.edit")}">${EDIT_ICON_SVG}</button><button type="button" class="btn-secondary vb-row-btn sl-del" data-vf-cat-del="${c.id}" title="${vt("common.delete")}">${TRASH_ICON_SVG}</button></div>`) },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-vf-cat-edit]").forEach((b) => b.addEventListener("click", () => vfOpenCategoryForm(VF_ADDRESS_CATEGORIES.find((c) => c.id === b.dataset.vfCatEdit))));
    wrap.querySelectorAll("[data-vf-cat-del]").forEach((b) => b.addEventListener("click", () => vfConfirmCategoryDelete(VF_ADDRESS_CATEGORIES.find((c) => c.id === b.dataset.vfCatDel))));
  },
});

function vfOpenCategoryForm(cat) {
  const m = vf("addresses.form");
  vbOpenForm({
    title: cat ? m.editTitle : m.addTitle,
    intro: cat && vfCategoryUsed(cat) ? m.kycWarning(pdEscape(cat.name)) : null,
    fieldsHtml: `${vbInput("vf-name", `${vf("fields.name")} *`, cat ? cat.name : "")}${vbInput("vf-desc", vf("fields.description"), cat && cat.description ? cat.description : "")}`,
    submitLabel: cat ? vt("common.save") : vt("common.create"),
    onSubmit: (el) => {
      const name = el.querySelector("#vf-name").value.trim();
      if (name.length < 2) return m.errName;
      if (VF_ADDRESS_CATEGORIES.some((c) => c !== cat && !c.deletedDate && c.name.toLowerCase() === name.toLowerCase())) return m.errExists;
      const description = el.querySelector("#vf-desc").value.trim() || null;
      closeModal();
      if (cat) { Object.assign(cat, { name, description }); acTouch(cat); }
      else VF_ADDRESS_CATEGORIES.unshift(vfStamp({ id: seedToPaymentUuid(Date.now() % 100000 + 98000), name, description, addressesCount: 0, deletedDate: null, deletedAt: null }, pdNow()));
      render();
      return null;
    },
  });
}

function vfConfirmCategoryDelete(cat) {
  if (!cat) return;
  const m = vf("addresses.form");
  vbConfirm({
    title: m.deleteTitle,
    text: `${m.deleteText(pdEscape(cat.name), cat.addressesCount)}${vfCategoryUsed(cat) ? `<br><br><span class="acc-warn">${m.deleteKycWarning}</span>` : ""}`,
    confirmLabel: vt("common.delete"),
    danger: true,
    onConfirm: () => {
      const now = pdNow();
      cat.deletedDate = now;
      cat.deletedAt = formatDateTime(now);
      render();
    },
  });
}

// ==== Точки входа для маршрутизации =====================================================================
const VF_LISTS = { kyc: vfKycList, kyb: vfKybList, documents: vfDocList, addresses: vfAddressList };
const VF_LIST_HERO_ACTION = {
  kyc: { id: "vf-kyc-create", label: () => vf("kyc.create"), onClick: () => vfOpenKycForm(null) },
  kyb: { id: "vf-kyb-create", label: () => vf("kyb.create"), onClick: () => vfOpenKybForm(null) },
  documents: { id: "vf-doc-create", label: () => vf("docs.create"), onClick: () => vfOpenDocForm(null) },
  addresses: { id: "vf-cat-add", label: () => vf("addresses.add"), onClick: () => vfOpenCategoryForm(null) },
};

function viewVerifList(kind) {
  const list = VF_LISTS[kind];
  const a = VF_LIST_HERO_ACTION[kind];
  return `<div class="list-hero">${pageHeader(vf(`titles.${kind}`), t(`navDescriptions.settings-verif-${kind}`), `${sectionHintBtn(`vf-${kind}-hint-btn`, vf(`info.${kind}`))}<button type="button" class="btn-primary" id="${a.id}">+ ${a.label()}</button>`)}</div>
    ${kind === "addresses" ? `<p class="table-cell-muted sl-info">${vf("addresses.note")}</p>` : ""}${list.view()}`;
}

function initVerifList(kind) {
  VF_LISTS[kind].init();
  const a = VF_LIST_HERO_ACTION[kind];
  const b = document.getElementById(a.id);
  if (b) b.addEventListener("click", a.onClick);
}

function viewVerifDetail(ref) {
  if (!ref) return vfNotFoundHtml();
  if (ref.kind === "kyc") return viewKycDetail(ref.id);
  if (ref.kind === "kyb") return viewKybDetail(ref.id);
  return viewDocDetail(ref.id);
}

function initVerifDetail(ref) {
  if (!ref) return;
  if (ref.kind === "kyc") return initKycDetail(ref.id);
  if (ref.kind === "kyb") return initKybDetail(ref.id);
  initDocDetail(ref.id);
}

function vfEntityTitle(ref) {
  if (!ref) return vt("common.notFoundTitle");
  if (ref.kind === "kyc") {
    const c = vfKycById(ref.id);
    return c ? `${c.name || c.service} · v${c.configVersion}` : vt("common.notFoundTitle");
  }
  if (ref.kind === "kyb") {
    const c = vfKybById(ref.id);
    return c ? `${c.name || `KYB L${c.level}`} · v${c.configVersion}` : vt("common.notFoundTitle");
  }
  const d = vfDocById(ref.id);
  return d ? d.name : vt("common.notFoundTitle");
}
