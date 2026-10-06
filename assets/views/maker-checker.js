/* ==========================================================================
   "Настройки → Maker-Checker" (Правила подтверждения / Запросы на подтверждение)
   + личный кабинет (Профиль → Подтверждения → Мои / На моё подтверждение).

   ДОПУЩЕНИЕ ПРОТОТИПА: раздела нет в реальном бэкенде — построен по отдельной
   спеке заказчика (maker-checker.md, RM-87441), не по реальному API. "Шесть
   глаз" (requiredApprovals > 1) — наше расширение поверх спеки, см. комментарий
   в mock/maker-checker.mock.js.

   Реально подключено (не все 9 категорий MVP-таблицы спеки): создание/
   редактирование тарифа (settings-tariffs.js) и ручная наценка курса
   (settings-rates.js, там и единственное правило с requiredApprovals:2).

   Создание/редактирование правила — без 2FA: ближайший по сути прецедент —
   "Настройки → vABS → Сети/Валюты" (settings-vabs.js), тоже просто диалог
   подтверждения. Одобрение/отклонение ЗАПРОСА — это и есть сам защитный
   механизм, второй уровень контроля (2FA) поверх него был бы избыточен.
   ========================================================================== */

function mc(path) {
  return t(`makerChecker.${path}`);
}

let profileApprovalsSubtab = "mine";

function mcStatusBadge(status) {
  const cls = { PENDING: "badge-warning", APPROVED: "badge-success", REJECTED: "badge-danger", EXPIRED: "badge-neutral" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${mc(`status.${status}`)}</span>`;
}

function mcActionTypeBadge(actionType) {
  const cls = { CREATE: "badge-info", UPDATE: "badge-warning" }[actionType] || "badge-neutral";
  return `<span class="badge ${cls}">${mc(`actionType.${actionType}`)}</span>`;
}

function mcEntityLabel(entity) {
  return mc(`entities.${entity}`);
}

function mcRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^settings-maker-checker-requests\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function mcProgressText(req) {
  return req.requiredApprovals > 1 ? `${req.approvals.length}/${req.requiredApprovals}` : "—";
}

// ---- Список правил --------------------------------------------------------------------------
const mcRulesList = createAccessList({
  key: "mc-rules",
  data: () => APPROVAL_RULES,
  searchPlaceholder: () => mc("rules.search"),
  searchText: (r) => `${mcEntityLabel(r.entity)} ${r.description || ""}`,
  filters: [
    { id: "entity", kind: "multi", label: () => mc("rules.fields.entity"), get: (r) => r.entity, options: () => MC_ENTITIES.map((e) => ({ value: e, label: mcEntityLabel(e) })) },
    { id: "enabled", kind: "multi", label: () => mc("rules.fields.enabled"), get: (r) => (r.isEnabled ? "yes" : "no"), options: () => [{ value: "yes", label: mc("yes") }, { value: "no", label: mc("no") }] },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate },
  columns: [
    { label: () => mc("rules.fields.action"), html: (r) => `<div class="identity-cell"><div>${mcEntityLabel(r.entity)}</div><div class="table-cell-muted">${mcActionTypeBadge(r.actionType)}</div></div>` },
    { label: () => mc("rules.fields.description"), html: (r) => (r.description ? pdEscape(r.description) : `<span class="table-cell-muted">—</span>`) },
    { label: () => mc("rules.fields.checkerRoles"), html: (r) => {
      const shown = r.checkerRoleIds.slice(0, 3).map((id) => `<span class="badge badge-neutral">${mcRoleName(id)}</span>`).join(" ");
      const rest = r.checkerRoleIds.length - 3;
      return rest > 0 ? `${shown} <span class="badge badge-neutral">+${rest}</span>` : shown;
    } },
    { label: () => mc("rules.fields.requiredApprovals"), html: (r) => (r.requiredApprovals > 1 ? `${mc("rules.sixEyes")} · ${r.requiredApprovals}` : mc("rules.fourEyes")) },
    { label: () => mc("rules.fields.enabled"), html: (r) => (r.isEnabled ? `<span class="coa-bool-icon">${CHECK_ICON_SVG}</span>` : `<span class="table-cell-muted">—</span>`) },
    { label: () => mc("rules.fields.created"), sort: "created", html: (r) => dateTimeCell(r.createdAt) },
    { label: () => "", html: (r) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-mc-rule-edit="${r.id}">${vt("common.edit")}</button></div>` },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-mc-rule-edit]").forEach((b) => b.addEventListener("click", () => mcOpenRuleForm(mcRuleById(b.dataset.mcRuleEdit))));
  },
});

// ---- Роли подтверждающих: кастомный дропдаун с мультивыбором (openSelectDropdown) ----------
function mcCheckerRoleOptions() {
  return ACCESS_ROLES.filter((r) => r.type === "ADMIN" && r.status === "ACTIVE").map((r) => ({ value: r.id, label: r.name }));
}

function mcCheckerRoleLabel(ids) {
  if (!ids.length) return mc("rules.wizard.rolesPlaceholder");
  const opts = mcCheckerRoleOptions();
  const names = ids.map((id) => (opts.find((o) => o.value === id) || { label: id }).label);
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown;
}

// Кнопка-поле в стиле .pc-dropdown-trigger, попап — components/select-dropdown.js (портал в body,
// иначе внутри .modal-body с overflow-y:auto он обрезается и уходит в скролл).
function mcRolesFieldHtml(ids) {
  const fl = mc("rules.fields");
  return `<label class="filters-field vb-field"><span class="filters-field-label">${fl.checkerRoles}<span class="req-star">*</span></span>
    <button type="button" class="pc-dropdown-trigger" id="mc-roles-trigger"><span>${pdEscape(mcCheckerRoleLabel(ids))}</span><span class="pc-dropdown-chevron">${FILTER_GROUP_CHEVRON}</span></button>
  </label>`;
}

function mcBindRolesTrigger(el, ids, onChange) {
  const trigger = el.querySelector("#mc-roles-trigger");
  trigger.addEventListener("click", () => {
    openSelectDropdown({
      anchorEl: trigger,
      options: mcCheckerRoleOptions(),
      selected: ids,
      doneLabel: mc("rules.wizard.done"),
      searchPlaceholder: mc("rules.wizard.rolesSearch"),
      emptyLabel: mc("rules.wizard.rolesEmpty"),
      onChange: (vals) => {
        onChange(vals);
        trigger.querySelector("span").textContent = mcCheckerRoleLabel(vals);
      },
    });
  });
}

// ---- Создание правила — степпер (3 шага): что проверяем → кто подтверждает → параметры ----------
const MC_WIZ_STEPS = ["main", "approvers", "params"];
let mcWiz = null;

// Пара «сущность + тип действия» занята, если правило на неё уже есть (выключенное тоже занимает).
function mcWizOccupied(actionType, entity) {
  return APPROVAL_RULES.some((r) => r.actionType === actionType && r.entity === entity);
}

function mcWizFreeEntities(actionType) {
  return MC_ENTITIES.filter((e) => !mcWizOccupied(actionType, e));
}

function mcWizFreeActions(entity) {
  return MC_ACTION_TYPES.filter((a) => !mcWizOccupied(a, entity));
}

function mcWizEmptyState() {
  const pair = MC_ENTITIES.flatMap((e) => MC_ACTION_TYPES.map((a) => [e, a])).find(([e, a]) => !mcWizOccupied(a, e));
  const [entity, actionType] = pair || [MC_ENTITIES[0], MC_ACTION_TYPES[0]];
  return { step: 1, actionType, entity, roleIds: [], requiredApprovals: 1, isEnabled: true, description: "" };
}

function mcWizStepperHtml() {
  const c = mc("rules.wizard.steps");
  return `<div class="kyc-stepper">${MC_WIZ_STEPS.map((k, i) => {
    const n = i + 1;
    const cls = n < mcWiz.step ? "is-done" : n === mcWiz.step ? "is-current" : "is-pending";
    return `<div class="kyc-stepper-item">
      <div class="kyc-stepper-circle ${cls}">${n < mcWiz.step ? CHECK_ICON_SVG : `<span>${n}</span>`}</div>
      ${i < MC_WIZ_STEPS.length - 1 ? `<div class="kyc-stepper-line${n < mcWiz.step ? " is-done" : ""}"></div>` : ""}
      <div class="kyc-stepper-label"><div class="kyc-stepper-title">${c[k]}</div></div>
    </div>`;
  }).join("")}</div>`;
}

function mcWizStepBodyHtml() {
  const fl = mc("rules.fields");
  const w = mc("rules.wizard");
  if (mcWiz.step === 1) {
    return `${vbSelect("mc-wiz-entity", fl.entity, mcWizFreeEntities(mcWiz.actionType).map((v) => ({ value: v, label: mcEntityLabel(v) })), mcWiz.entity)}
      ${vbSelect("mc-wiz-actionType", fl.actionType, mcWizFreeActions(mcWiz.entity).map((v) => ({ value: v, label: mc(`actionType.${v}`) })), mcWiz.actionType)}
      <p class="table-cell-muted vb-note">${mc("rules.form.createIntro")}</p>`;
  }
  if (mcWiz.step === 2) {
    return `${mcRolesFieldHtml(mcWiz.roleIds)}
      ${vbSelect("mc-wiz-requiredApprovals", fl.requiredApprovals, [{ value: "1", label: mc("rules.fourEyes") }, { value: "2", label: `${mc("rules.sixEyes")} (2)` }], String(mcWiz.requiredApprovals))}
      <p class="table-cell-muted vb-note">${w.approversNote}</p>`;
  }
  return `<label class="filters-field vb-field"><span class="filters-field-label"><input type="checkbox" id="mc-wiz-isEnabled"${mcWiz.isEnabled ? " checked" : ""} /> ${fl.enabled}</span></label>
    ${vbTextarea("mc-wiz-description", fl.description, mcWiz.description, 3)}
    <div class="form-error" id="mc-wiz-error" hidden></div>`;
}

function mcWizFooterHtml() {
  const w = mc("rules.wizard");
  const isLast = mcWiz.step === MC_WIZ_STEPS.length;
  const backBtn = mcWiz.step > 1 ? `<button type="button" class="btn-secondary" id="mc-wiz-back">${w.back}</button>` : `<button type="button" class="btn-secondary" id="mc-wiz-cancel">${vt("common.cancel")}</button>`;
  return `${backBtn}<button type="button" class="btn-primary" id="mc-wiz-next">${isLast ? mc("actions.create") : w.next}</button>`;
}

// Сохраняем значения текущего шага в mcWiz перед переходом, чтобы не терять ввод при «Назад».
function mcWizCollect(root) {
  if (mcWiz.step === 1) {
    mcWiz.actionType = root.querySelector("#mc-wiz-actionType").value;
    mcWiz.entity = root.querySelector("#mc-wiz-entity").value;
  } else if (mcWiz.step === 2) {
    mcWiz.requiredApprovals = Number(root.querySelector("#mc-wiz-requiredApprovals").value);
  } else {
    mcWiz.isEnabled = root.querySelector("#mc-wiz-isEnabled").checked;
    mcWiz.description = root.querySelector("#mc-wiz-description").value;
  }
}

function mcWizValidate() {
  const f = mc("rules.form");
  if (mcWiz.step === 1 && APPROVAL_RULES.some((r) => r.actionType === mcWiz.actionType && r.entity === mcWiz.entity)) return f.errExists;
  if (mcWiz.step === 2 && !mcWiz.roleIds.length) return f.errCheckerRoles;
  return null;
}

function mcWizRender(root) {
  root.querySelector(".modal-body").innerHTML = `${mcWizStepperHtml()}${mcWizStepBodyHtml()}`;
  root.querySelector(".modal-footer").innerHTML = mcWizFooterHtml();
  if (mcWiz.step === 2) mcBindRolesTrigger(root, mcWiz.roleIds, (vals) => { mcWiz.roleIds = vals; });
  if (mcWiz.step === 1) {
    root.querySelector("#mc-wiz-entity").addEventListener("change", (e) => {
      mcWiz.entity = e.target.value;
      const free = mcWizFreeActions(mcWiz.entity);
      if (!free.includes(mcWiz.actionType)) mcWiz.actionType = free[0] || mcWiz.actionType;
      mcWizRender(root);
    });
    root.querySelector("#mc-wiz-actionType").addEventListener("change", (e) => {
      mcWiz.actionType = e.target.value;
      const free = mcWizFreeEntities(mcWiz.actionType);
      if (!free.includes(mcWiz.entity)) mcWiz.entity = free[0] || mcWiz.entity;
      mcWizRender(root);
    });
  }
  const back = root.querySelector("#mc-wiz-back");
  if (back) back.addEventListener("click", () => { mcWizCollect(root); mcWiz.step -= 1; mcWizRender(root); });
  const cancel = root.querySelector("#mc-wiz-cancel");
  if (cancel) cancel.addEventListener("click", closeModal);
  root.querySelector("#mc-wiz-next").addEventListener("click", () => {
    mcWizCollect(root);
    const err = mcWizValidate();
    const errEl = root.querySelector("#mc-wiz-error");
    if (err) {
      if (errEl) { errEl.textContent = err; errEl.hidden = false; }
      return;
    }
    if (mcWiz.step < MC_WIZ_STEPS.length) { mcWiz.step += 1; mcWizRender(root); return; }
    mcWizSubmit();
  });
}

function mcWizSubmit() {
  const now = pdNow();
  APPROVAL_RULES.push(mcStamp({
    id: seedToPaymentUuid(Date.now() % 100000 + 47000), actionType: mcWiz.actionType, entity: mcWiz.entity,
    checkerRoleIds: mcWiz.roleIds, requiredApprovals: mcWiz.requiredApprovals, isEnabled: mcWiz.isEnabled,
    status: "ACTIVE", description: mcWiz.description.trim() || null,
  }, now));
  closeModal();
  render();
  showToast(mc("actions.createdToast"));
}

function mcOpenRuleCreateWizard() {
  mcWiz = mcWizEmptyState();
  openModal({
    title: mc("rules.form.createTitle"),
    width: 560,
    bodyHtml: "<div></div>",
    footerHtml: "<div></div>",
    onMount: (el) => mcWizRender(el),
  });
}

// ---- Редактирование: тип и сущность не меняются, остальное — как в мастере --------------------
function mcOpenRuleEditForm(rule) {
  const f = mc("rules.form");
  const fl = mc("rules.fields");
  const state = { roleIds: [...rule.checkerRoleIds] };
  openModal({
    title: f.editTitle,
    width: 560,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${f.editIntro}</p><div class="modal-form">
      ${mcRolesFieldHtml(state.roleIds)}
      ${vbSelect("mc-requiredApprovals", fl.requiredApprovals, [{ value: "1", label: mc("rules.fourEyes") }, { value: "2", label: `${mc("rules.sixEyes")} (2)` }], String(rule.requiredApprovals))}
      <label class="filters-field vb-field"><span class="filters-field-label"><input type="checkbox" id="mc-isEnabled"${rule.isEnabled ? " checked" : ""} /> ${fl.enabled}</span></label>
      ${vbTextarea("mc-description", fl.description, rule.description || "", 2)}
      <div class="form-error" id="mc-edit-error" hidden></div>
    </div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="mc-edit-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="mc-edit-submit">${mc("actions.save")}</button>`,
    onMount: (el) => {
      mcBindRolesTrigger(el, state.roleIds, (vals) => { state.roleIds = vals; });
      el.querySelector("#mc-edit-cancel").addEventListener("click", closeModal);
      el.querySelector("#mc-edit-submit").addEventListener("click", () => {
        const errEl = el.querySelector("#mc-edit-error");
        if (!state.roleIds.length) { errEl.textContent = f.errCheckerRoles; errEl.hidden = false; return; }
        Object.assign(rule, {
          checkerRoleIds: state.roleIds,
          requiredApprovals: Number(el.querySelector("#mc-requiredApprovals").value),
          isEnabled: el.querySelector("#mc-isEnabled").checked,
          description: el.querySelector("#mc-description").value.trim() || null,
        });
        mcStamp(rule, rule.createdDate, pdNow());
        closeModal();
        render();
        showToast(mc("actions.savedToast"));
      });
    },
  });
}

function mcOpenRuleForm(rule) {
  if (rule) mcOpenRuleEditForm(rule);
  else mcOpenRuleCreateWizard();
}

function viewMakerCheckerRules() {
  const heroActions = `<span class="filters-bar-end">${sectionHintBtn("mc-rules-hint-btn", mc("rules.info"))}<button type="button" class="btn-primary hdr-desktop-only" id="mc-rule-add">${PLUS_ICON_SVG}<span>${mc("rules.add")}</span></button>${hdrActionsKebab("mc-rules-hdr-km", [{ id: "mc-rule-add-m", icon: PLUS_ICON_SVG, label: mc("rules.add") }])}</span>`;
  return `<div class="list-hero">${pageHeader(t("nav.settings-maker-checker-rules"), t("navDescriptions.settings-maker-checker-rules"), heroActions)}</div>${mcRulesList.view()}`;
}

function initMakerCheckerRules() {
  mcRulesList.init();
  document.getElementById("mc-rule-add")?.addEventListener("click", () => mcOpenRuleForm(null));
  document.getElementById("mc-rule-add-m")?.addEventListener("click", () => { closeAllRowKebabs(); mcOpenRuleForm(null); });
}

// ---- Список запросов (переиспользуется и в "Настройки", и в профиле) -------------------------
function mcBuildRequestsList(scopeKey, dataFn) {
  return createAccessList({
    key: `mc-requests-${scopeKey}`,
    data: dataFn,
    searchPlaceholder: () => mc("requests.search"),
    searchText: (r) => `${r.code} ${r.targetLabel} ${r.makerName}`,
    tab: { get: (r) => r.status, values: ["PENDING", "APPROVED", "REJECTED", "EXPIRED"], label: (v) => mc(`status.${v}`) },
    filters: [
      { id: "entity", kind: "multi", label: () => mc("rules.fields.entity"), get: (r) => r.entity, options: () => MC_ENTITIES.map((e) => ({ value: e, label: mcEntityLabel(e) })) },
      { id: "actionType", kind: "multi", label: () => mc("rules.fields.actionType"), get: (r) => r.actionType, options: () => MC_ACTION_TYPES.map((v) => ({ value: v, label: mc(`actionType.${v}`) })) },
      { id: "created", kind: "date", label: () => mc("requests.fields.created"), get: (r) => r.createdDate },
    ],
    defaultSort: (a, b) => b.createdDate - a.createdDate,
    sorts: { created: (a, b) => a.createdDate - b.createdDate },
    columns: [
      { label: () => mc("requests.fields.code"), html: (r) => `<div class="identity-cell"><button type="button" class="table-link" data-mc-req-hash="#/settings-maker-checker-requests/${r.id}">${r.code}</button><div class="table-cell-muted">${pdEscape(r.targetLabel)}</div></div>` },
      { label: () => mc("rules.fields.entity"), html: (r) => `${mcActionTypeBadge(r.actionType)} ${mcEntityLabel(r.entity)}` },
      { label: () => mc("requests.fields.maker"), html: (r) => (r.makerId ? `<button type="button" class="table-link" data-ac-admin-hash="#/settings-access/admin/${r.makerId}">${pdEscape(r.makerName)}</button>` : pdEscape(r.makerName)) },
      { label: () => mc("requests.fields.progress"), html: mcProgressText },
      { label: () => mc("requests.fields.status"), html: (r) => `${mcStatusBadge(r.status)}${mcIsOverdue(r) ? ` <span class="badge badge-danger">${mc("requests.overdue")}</span>` : ""}` },
      { label: () => mc("requests.fields.created"), sort: "created", html: (r) => dateTimeCell(r.createdAt) },
    ],
    attachRows: (wrap) => {
      wrap.querySelectorAll("[data-mc-req-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.mcReqHash; }));
      wrap.querySelectorAll("[data-ac-admin-hash]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); window.location.hash = b.dataset.acAdminHash; }));
    },
  });
}

const mcRequestsListAll = mcBuildRequestsList("all", () => APPROVAL_REQUESTS);

function viewMakerCheckerRequests() {
  return `<div class="list-hero">${pageHeader(t("nav.settings-maker-checker-requests"), t("navDescriptions.settings-maker-checker-requests"), sectionHintBtn("mc-requests-hint-btn", mc("requests.info")))}</div>${mcRequestsListAll.view()}`;
}

function initMakerCheckerRequests() {
  mcRequestsListAll.init();
}

// ---- Карточка запроса -------------------------------------------------------------------------
function mcSummaryHtml(req) {
  if (req.summary.pattern === "CREATE") {
    return `<div class="profile-fields profile-fields-grid profile-fields-grid-1">${req.summary.fields.map((f) => detailField(f.label, pdEscape(String(f.value)))).join("")}</div>`;
  }
  return vbMiniTable(
    [mc("requests.summary.attribute"), mc("requests.summary.currentValue"), mc("requests.summary.targetValue")],
    req.summary.changes.map((c) => [pdEscape(c.attribute), pdEscape(String(c.currentValue)), pdEscape(String(c.targetValue))]),
    mc("requests.summary.empty")
  );
}

function mcTimelineHtml(req) {
  return vbMiniTable(
    [mc("requests.timeline.event"), mc("requests.timeline.actor"), mc("requests.timeline.comment"), mc("requests.timeline.when")],
    req.timeline.map((e) => [mc(`requests.timeline.events.${e.eventType}`), e.actorName ? pdEscape(e.actorName) : "—", e.comment ? pdEscape(e.comment) : "—", dateTimeCell(formatDateTime(e.occurredAt))]),
    "—"
  );
}

function mcDetailActions(req) {
  const items = [];
  if (mcCanCurrentAdminDecide(req)) {
    items.push(vbActionItem("approve", mc("actions.approve"), CHECK_ICON_SVG));
    items.push(vbActionItem("reject", mc("actions.reject"), ICONS.lock, true));
  }
  return vbHeaderActions("", items);
}

function viewMakerCheckerRequestDetail(id) {
  const r = mcById(id);
  if (!r) return vbNotFound();
  const rule = mcRuleById(r.ruleId);
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(mc("requests.fields.code"), r.code)}
    ${detailField(mc("rules.fields.actionType"), mcActionTypeBadge(r.actionType))}
    ${detailField(mc("rules.fields.entity"), mcEntityLabel(r.entity))}
    ${detailField(mc("requests.fields.target"), pdEscape(r.targetLabel))}
    ${detailField(mc("requests.fields.status"), mcStatusBadge(r.status))}
    ${detailField(mc("requests.fields.maker"), r.makerId ? `<button type="button" class="table-link" data-ac-admin-hash="#/settings-access/admin/${r.makerId}">${pdEscape(r.makerName)}</button>` : pdEscape(r.makerName))}
    ${detailField(mc("requests.fields.created"), r.createdAt)}
    ${detailField(mc("requests.fields.expires"), r.expiresAt ? formatDateTime(r.expiresAt) : "—")}
    ${detailField(mc("rules.fields.requiredApprovals"), r.requiredApprovals > 1 ? `${mc("rules.sixEyes")} — ${mcProgressText(r)}` : mc("rules.fourEyes"))}
    ${detailField(mc("rules.fields.checkerRoles"), rule ? rule.checkerRoleIds.map((id2) => `<span class="badge badge-neutral">${mcRoleName(id2)}</span>`).join(" ") : "—")}
    ${rule && rule.description ? detailField(mc("rules.fields.description"), pdEscape(rule.description)) : ""}
  </div>`;

  // Боковая карточка — кто уже решил по запросу (кто одобрил/отклонил и когда), а не инфо о
  // правиле: это то, что хотели видеть "с ходу" сбоку, не разворачивая основной блок. Имя — ссылка
  // на карточку админа; дата — одной строкой (dateTimeCell тут не годится, он для колонок таблиц,
  // а не для строки текста "роль · дата").
  const decisionRow = (adminId, name, roleName, badge, comment, when) => `<div class="pf-2fa-row">
      <div class="pf-2fa-main">
        <div class="pf-2fa-title"><button type="button" class="table-link" data-ac-admin-hash="#/settings-access/admin/${adminId}">${pdEscape(name)}</button> ${badge}</div>
        <div class="table-cell-muted">${roleName ? `${pdEscape(roleName)} · ` : ""}${formatDateTime(when)}</div>
        ${comment ? `<div class="table-cell-muted">${pdEscape(comment)}</div>` : ""}
      </div>
    </div>`;
  const decisions = [
    ...r.approvals.map((a) => decisionRow(a.checkerId, a.checkerName, a.checkerRoleName, `<span class="badge badge-success">${mc("actions.approve")}</span>`, a.comment, a.decidedAt)),
    ...(r.rejection ? [decisionRow(r.rejection.checkerId, r.rejection.checkerName, null, `<span class="badge badge-danger">${mc("actions.reject")}</span>`, r.rejection.comment, r.rejection.decidedAt)] : []),
  ];
  const approvalsCard = decisions.length ? `<div class="pf-2fa">${decisions.join("")}</div>` : `<div class="table-cell-muted">${mc("requests.noApprovalsYet")}</div>`;

  return `<div id="mc-req-root">
    ${vbDetailHeader({
      backHash: "#/settings-maker-checker-requests",
      title: r.code,
      badges: `${mcActionTypeBadge(r.actionType)}${mcStatusBadge(r.status)}`,
      subtitle: [mcEntityLabel(r.entity), pdEscape(r.targetLabel), r.createdAt].join(`<span class="client-detail-subtitle-sep">·</span>`),
      actions: mcDetailActions(r),
    })}
    <div class="client-detail-grid">
      <div class="client-detail-grid-main"><div class="profile-flat-block">
        ${flatSection(mc("requests.sections.main"), main)}
        ${flatSection(mc("requests.sections.summary"), mcSummaryHtml(r))}
        ${flatSection(mc("requests.sections.timeline"), mcTimelineHtml(r))}
      </div></div>
      <div class="client-detail-grid-side">${sectionCard(mc("requests.sections.approvals"), approvalsCard)}</div>
    </div>
  </div>`;
}

function mcOpenRejectForm(req) {
  vbOpenForm({
    title: mc("actions.rejectTitle"),
    width: 440,
    fieldsHtml: vbTextarea("mc-reject-reason", mc("actions.rejectReasonLabel"), "", 3),
    submitLabel: mc("actions.reject"),
    danger: true,
    onSubmit: (el) => {
      const reason = el.querySelector("#mc-reject-reason").value.trim();
      if (!reason) return mc("actions.errRejectReason");
      closeModal();
      mcReject(req, reason);
      render();
      showToast(mc("actions.rejectedToast"));
      return null;
    },
  });
}

function mcOpenApproveForm(req) {
  vbOpenForm({
    title: mc("actions.approveTitle"),
    width: 440,
    intro: req.requiredApprovals > 1 ? mc("actions.approveIntroSixEyes")(mcProgressText(req)) : mc("actions.approveIntro"),
    fieldsHtml: vbTextarea("mc-approve-comment", mc("actions.approveCommentLabel"), "", 2),
    submitLabel: mc("actions.approve"),
    onSubmit: (el) => {
      const comment = el.querySelector("#mc-approve-comment").value.trim();
      closeModal();
      mcApprove(req, comment);
      render();
      showToast(req.status === "APPROVED" ? mc("actions.approvedToast") : mc("actions.approvedStepToast"));
      return null;
    },
  });
}

function initMakerCheckerRequestDetail(id) {
  const r = mcById(id);
  const root = document.getElementById("mc-req-root");
  if (!r || !root) return;
  vbAttachCommon(root);
  root.querySelectorAll("[data-ac-admin-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.acAdminHash; }));
  root.querySelectorAll("[data-vb-action]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.vbAction;
      if (act === "approve") mcOpenApproveForm(r);
      if (act === "reject") mcOpenRejectForm(r);
    })
  );
}

// ---- Интеграция в личный кабинет (Профиль → Подтверждения) ------------------------------------
const mcRequestsListMine = mcBuildRequestsList("mine", () => {
  const me = mcCurrentAdminRecord();
  return me ? APPROVAL_REQUESTS.filter((r) => r.makerId === me.id) : [];
});
const mcRequestsListToMe = mcBuildRequestsList("tome", () => {
  const me = mcCurrentAdminRecord();
  if (!me) return [];
  return APPROVAL_REQUESTS.filter((r) => r.status === "PENDING" && r.makerId !== me.id && !r.approvals.some((a) => a.checkerId === me.id) && mcEligibleCheckerRoleIds(r).some((roleId) => me.roleIds.includes(roleId)));
});

function profileApprovalsHtml() {
  const list = profileApprovalsSubtab === "toMe" ? mcRequestsListToMe : mcRequestsListMine;
  const tabs = `<div class="quick-tabs">${["mine", "toMe"].map((k) => `<button type="button" class="quick-tab${profileApprovalsSubtab === k ? " is-active" : ""}" data-pf-approvals-subtab="${k}">${mc(`profile.subtabs.${k}`)}</button>`).join("")}</div>`;
  return `${tabs}${list.view()}`;
}

function initProfileApprovalsTab() {
  document.querySelectorAll("[data-pf-approvals-subtab]").forEach((b) => b.addEventListener("click", () => { profileApprovalsSubtab = b.dataset.pfApprovalsSubtab; render(); }));
  (profileApprovalsSubtab === "toMe" ? mcRequestsListToMe : mcRequestsListMine).init();
}
