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
    { label: () => mc("rules.fields.action"), html: (r) => `<div class="identity-cell">${mcActionTypeBadge(r.actionType)}<div class="table-cell-muted">${mcEntityLabel(r.entity)}</div></div>` },
    { label: () => mc("rules.fields.description"), html: (r) => (r.description ? pdEscape(r.description) : `<span class="table-cell-muted">—</span>`) },
    { label: () => mc("rules.fields.checkerRoles"), html: (r) => r.checkerRoleIds.map((id) => `<span class="badge badge-neutral">${mcRoleName(id)}</span>`).join(" ") },
    { label: () => mc("rules.fields.requiredApprovals"), html: (r) => (r.requiredApprovals > 1 ? `<span class="badge badge-warning">${mc("rules.sixEyes")} · ${r.requiredApprovals}</span>` : mc("rules.fourEyes")) },
    { label: () => mc("rules.fields.enabled"), html: (r) => (r.isEnabled ? `<span class="coa-bool-icon">${CHECK_ICON_SVG}</span>` : `<span class="table-cell-muted">—</span>`) },
    { label: () => mc("rules.fields.created"), sort: "created", html: (r) => dateTimeCell(r.createdAt) },
    { label: () => "", html: (r) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-mc-rule-edit="${r.id}">${vt("common.edit")}</button></div>` },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-mc-rule-edit]").forEach((b) => b.addEventListener("click", () => mcOpenRuleForm(mcRuleById(b.dataset.mcRuleEdit))));
  },
});

function mcOpenRuleForm(rule) {
  const f = mc("rules.form");
  const fl = mc("rules.fields");
  const isEdit = !!rule;
  const existing = (actionType, entity) => APPROVAL_RULES.some((r) => r !== rule && r.actionType === actionType && r.entity === entity);
  const html = `
    ${vbSelect("mc-actionType", fl.actionType, MC_ACTION_TYPES.map((v) => ({ value: v, label: mc(`actionType.${v}`) })), isEdit ? rule.actionType : "CREATE", isEdit ? "disabled" : "")}
    ${vbSelect("mc-entity", fl.entity, MC_ENTITIES.map((v) => ({ value: v, label: mcEntityLabel(v) })), isEdit ? rule.entity : MC_ENTITIES[0], isEdit ? "disabled" : "")}
    <div class="filters-field vb-field" style="margin-top:6px"><span class="filters-field-label">${fl.checkerRoles}<span class="req-star">*</span></span><div class="rt-clients">${ACCESS_ROLES.filter((r) => r.type === "ADMIN" && r.status === "ACTIVE").map(
      (r) => `<label class="rt-client"><input type="checkbox" data-mc-checker-role value="${r.id}"${isEdit && rule.checkerRoleIds.includes(r.id) ? " checked" : ""} /><span>${r.name}</span></label>`
    ).join("")}</div></div>
    ${vbSelect("mc-requiredApprovals", fl.requiredApprovals, [{ value: "1", label: mc("rules.fourEyes") }, { value: "2", label: `${mc("rules.sixEyes")} (2)` }], isEdit ? String(rule.requiredApprovals) : "1")}
    <label class="filters-field vb-field" style="margin-top:6px"><span class="filters-field-label"><input type="checkbox" id="mc-isEnabled"${!isEdit || rule.isEnabled ? " checked" : ""} /> ${fl.enabled}</span></label>
    ${vbTextarea("mc-description", fl.description, isEdit ? rule.description || "" : "", 2)}
  `;
  vbOpenForm({
    title: isEdit ? f.editTitle : f.createTitle,
    width: 560,
    intro: isEdit ? f.editIntro : f.createIntro,
    fieldsHtml: html,
    submitLabel: isEdit ? mc("actions.save") : mc("actions.create"),
    onSubmit: (el) => {
      const actionType = el.querySelector("#mc-actionType").value;
      const entity = el.querySelector("#mc-entity").value;
      const checkerRoleIds = [...el.querySelectorAll("[data-mc-checker-role]:checked")].map((i) => i.value);
      const requiredApprovals = Number(el.querySelector("#mc-requiredApprovals").value);
      const isEnabled = el.querySelector("#mc-isEnabled").checked;
      const description = el.querySelector("#mc-description").value.trim() || null;
      if (!checkerRoleIds.length) return f.errCheckerRoles;
      if (!isEdit && existing(actionType, entity)) return f.errExists;
      closeModal();
      if (!isEdit) {
        const now = pdNow();
        APPROVAL_RULES.push(mcStamp({ id: seedToPaymentUuid(Date.now() % 100000 + 47000), actionType, entity, checkerRoleIds, requiredApprovals, isEnabled, status: "ACTIVE", description }, now));
      } else {
        Object.assign(rule, { checkerRoleIds, requiredApprovals, isEnabled, description });
        mcStamp(rule, rule.createdDate, pdNow());
      }
      render();
      showToast(isEdit ? mc("actions.savedToast") : mc("actions.createdToast"));
      return null;
    },
  });
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
