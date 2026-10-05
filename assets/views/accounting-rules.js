/* ==========================================================================
   "Настройки → Бухгалтерия → Правила проводок" (Accounting Rules).

   ДОПУЩЕНИЕ ПРОТОТИПА: построено по FRD (general-ledger-i-chart-of-accounts.md
   §5), реального движка правил в бэкенде нет — см. комментарий в начале
   mock/accounting-rules.mock.js (там же объяснено, почему у правила нет
   поля "аналитические измерения", в отличие от буквального текста FRD).

   Список/карточка/форма — тот же паттерн, что и План счетов
   (accounting-coa.js): createAccessList + vbDetailHeader/flatSection +
   vbOpenForm/vbConfirm, без 2FA (конфигурация, не движение денег — как и
   План счетов).

   Автогенерация проводок Главной книги (accounting-gl.mock.js §12) читает
   правила отсюда через arFindRule(trigger, ctx) — поэтому включение/
   выключение правила или правка счетов здесь сразу меняет то, что покажет
   Главная книга при следующей перезагрузке мока (в прототипе моки строятся
   один раз при загрузке страницы, поэтому эффект виден после перезагрузки —
   это честно отражено в форме, см. m.effectNote ниже).
   ========================================================================== */

function ar(path) {
  return t(`accountingRules.${path}`);
}

function arRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^accounting-rules\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function arStatusBadge(status) {
  const cls = { ACTIVE: "badge-success", INACTIVE: "badge-warning", ARCHIVED: "badge-neutral" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${ar(`status.${status}`)}</span>`;
}

function arAccountLabel(code) {
  const a = coaByCode(code);
  return a ? `${a.code} · ${a.name}` : code;
}

// Условия правила — короткая человекочитаемая строка для списка/карточки ("любое значение" не показываем).
function arConditionsText(rule) {
  const c = rule.conditions;
  const parts = [];
  if (c.currency) parts.push(c.currency);
  if (c.rail) parts.push(c.rail);
  if (c.leg) parts.push(ar(`leg.${c.leg}`));
  return parts.length ? parts.join(" · ") : ar("anyConditions");
}

const arList = createAccessList({
  key: "ar",
  data: () => ACCOUNTING_RULES,
  searchPlaceholder: () => ar("search"),
  searchText: (r) => `${r.code} ${r.name} ${r.description} ${r.debitAccountCode} ${r.creditAccountCode}`,
  tab: { get: (r) => r.status, values: AR_STATUSES, label: (v) => ar(`status.${v}`) },
  filters: [
    { id: "trigger", kind: "multi", label: () => ar("fields.trigger"), get: (r) => r.trigger, options: () => AR_TRIGGERS.map((v) => ({ value: v, label: ar(`trigger.${v}`) })) },
    { id: "basis", kind: "multi", label: () => ar("fields.amountBasis"), get: (r) => r.amountBasis, options: () => AR_AMOUNT_BASIS.map((v) => ({ value: v, label: ar(`amountBasis.${v}`) })) },
  ],
  defaultSort: (a, b) => (a.trigger === b.trigger ? a.sequence - b.sequence : a.trigger.localeCompare(b.trigger)),
  sorts: { created: (a, b) => a.createdDate - b.createdDate },
  metrics: (list) => [
    { value: list.length, label: ar("metrics.total") },
    { value: list.filter((r) => r.status === "ACTIVE").length, label: ar("metrics.active") },
    { value: new Set(list.map((r) => r.trigger)).size, label: ar("metrics.triggers") },
  ],
  columns: [
    { label: () => ar("columns.rule"), html: (r) => `<div class="identity-cell"><button type="button" class="table-link" data-ar-hash="#/accounting-rules/${r.id}">${pdEscape(r.name)}</button>${vbCodeCell(r.code)}</div>` },
    { label: () => ar("columns.trigger"), html: (r) => `<div class="identity-cell"><span>${ar(`trigger.${r.trigger}`)}</span><span class="table-cell-muted">${arConditionsText(r)}</span></div>` },
    { label: () => ar("columns.seq"), html: (r) => r.sequence },
    { label: () => ar("columns.drCr"), html: (r) => `<div class="identity-cell"><span class="table-cell-muted">${ar("drCr.debit")}:</span> ${pdEscape(arAccountLabel(r.debitAccountCode))}<span class="table-cell-muted">${ar("drCr.credit")}:</span> ${pdEscape(arAccountLabel(r.creditAccountCode))}</div>` },
    { label: () => ar("columns.amountBasis"), html: (r) => ar(`amountBasis.${r.amountBasis}`) },
    { label: () => ar("columns.usage"), html: (r) => arUsageCount(r) },
    { label: () => ar("columns.status"), html: (r) => arStatusBadge(r.status) },
    { label: () => "", html: (r) => `<div class="sl-actions"><button type="button" class="btn-secondary vb-row-btn" data-ar-edit="${r.id}">${vt("common.edit")}</button></div>` },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-ar-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.arHash; }));
    wrap.querySelectorAll("[data-ar-edit]").forEach((b) => b.addEventListener("click", () => arOpenForm(arById(b.dataset.arEdit))));
  },
});

function arDoExport(format) {
  const rows = arList.exportRows();
  exportTable(
    "accounting-rules",
    format,
    [ar("columns.code"), ar("columns.name"), ar("columns.trigger"), ar("columns.conditions"), ar("columns.seq"), ar("columns.debit"), ar("columns.credit"), ar("columns.amountBasis"), ar("columns.status")],
    rows.map((r) => [r.code, r.name, ar(`trigger.${r.trigger}`), arConditionsText(r), r.sequence, arAccountLabel(r.debitAccountCode), arAccountLabel(r.creditAccountCode), ar(`amountBasis.${r.amountBasis}`), ar(`status.${r.status}`)])
  );
  showToast(ar("export.done"));
}

function viewAccountingRules() {
  const heroActions = `<span class="filters-bar-end">${sectionHintBtn("ar-hint-btn", ar("info"))}<span class="hdr-desktop-only">${exportMenuHtml("ar-export", ar("export.button"), ar("export.hint"))}</span><button type="button" class="btn-primary hdr-desktop-only" id="ar-add">${PLUS_ICON_SVG}<span>${ar("add")}</span></button>${hdrActionsKebab("ar-hdr-km", [{ id: "ar-export-csv", label: `${ar("export.button")} CSV` }, { id: "ar-export-xlsx", label: `${ar("export.button")} XLSX` }, { id: "ar-add-m", icon: PLUS_ICON_SVG, label: ar("add") }])}</span>`;
  return `<div class="list-hero">${pageHeader(t("nav.accounting-rules"), t("navDescriptions.accounting-rules"), heroActions)}</div>${arList.view()}`;
}

function initAccountingRules() {
  arList.init();
  bindExportMenu("ar-export", arDoExport);
  document.getElementById("ar-add")?.addEventListener("click", () => arOpenForm(null));
  document.getElementById("ar-export-csv")?.addEventListener("click", () => { closeAllRowKebabs(); arDoExport("csv"); });
  document.getElementById("ar-export-xlsx")?.addEventListener("click", () => { closeAllRowKebabs(); arDoExport("xlsx"); });
  document.getElementById("ar-add-m")?.addEventListener("click", () => { closeAllRowKebabs(); arOpenForm(null); });
}

// ---- Форма добавления/изменения правила -------------------------------------------------------------
function arAccountOptions() {
  return COA_ACCOUNTS.filter((a) => a.nodeType !== "GROUP").map((a) => ({ value: a.code, label: `${a.code} · ${a.name}${a.status !== "ACTIVE" ? ` (${co(`status.${a.status}`)})` : ""}` }));
}

function arConditionValueOptions(values, noneLabel) {
  return [{ value: "", label: noneLabel }, ...values.map((v) => ({ value: v, label: v }))];
}

function arOpenForm(rule) {
  const f = ar("fields");
  const m = ar("form");
  const isEdit = !!rule;
  const accOptions = arAccountOptions();
  const html = `
    ${vbInput("ar-name", `${f.name} *`, isEdit ? rule.name : "")}
    ${vbTextarea("ar-desc", f.description, isEdit ? rule.description : "", 2)}
    <div class="rt-grid">
      ${vbSelect("ar-trigger", `${f.trigger} *`, AR_TRIGGERS.map((v) => ({ value: v, label: ar(`trigger.${v}`) })), isEdit ? rule.trigger : AR_TRIGGERS[0])}
      ${vbInput("ar-seq", `${f.sequence} *`, isEdit ? String(rule.sequence) : "1", 'inputmode="numeric"')}
    </div>
    <p class="table-cell-muted">${m.conditionsHint}</p>
    <div class="rt-grid rt-grid-3">
      ${vbSelect("ar-cur", f.conditionCurrency, arConditionValueOptions(["EUR", "GBP", "USD", "USDT"], m.anyValue), isEdit ? rule.conditions.currency || "" : "")}
      ${vbSelect("ar-rail", f.conditionRail, arConditionValueOptions([...new Set(OPERATIONS_PAYMENTS_MOCK.map((p) => p.paymentSystem))], m.anyValue), isEdit ? rule.conditions.rail || "" : "")}
      ${vbSelect("ar-leg", f.conditionLeg, arConditionValueOptions(["SOURCE", "TARGET"], m.anyValue), isEdit ? rule.conditions.leg || "" : "")}
    </div>
    <div class="rt-grid">
      ${vbSelect("ar-debit", `${f.debitAccount} *`, accOptions, isEdit ? rule.debitAccountCode : accOptions[0].value)}
      ${vbSelect("ar-credit", `${f.creditAccount} *`, accOptions, isEdit ? rule.creditAccountCode : (accOptions[1] ? accOptions[1].value : accOptions[0].value))}
    </div>
    ${vbSelect("ar-basis", f.amountBasis, AR_AMOUNT_BASIS.map((v) => ({ value: v, label: ar(`amountBasis.${v}`) })), isEdit ? rule.amountBasis : "FULL")}
    ${vbInput("ar-cond", f.creationCondition, isEdit ? rule.creationCondition || "" : "")}
    <p class="table-cell-muted">${m.creationConditionHint}</p>
    ${vbSelect("ar-status", f.status, AR_STATUSES.map((v) => ({ value: v, label: ar(`status.${v}`) })), isEdit ? rule.status : "ACTIVE")}
  `;
  vbOpenForm({
    title: isEdit ? m.editTitle : m.addTitle,
    width: 620,
    intro: isEdit ? m.effectNoteEdit : m.effectNoteAdd,
    fieldsHtml: html,
    submitLabel: isEdit ? ar("actions.save") : ar("actions.create"),
    onSubmit: (el) => {
      const name = el.querySelector("#ar-name").value.trim();
      if (name.length < 3) return m.errName;
      const description = el.querySelector("#ar-desc").value.trim();
      const trigger = el.querySelector("#ar-trigger").value;
      const sequence = Number(el.querySelector("#ar-seq").value.trim());
      if (!Number.isInteger(sequence) || sequence < 1) return m.errSequence;
      const debit = el.querySelector("#ar-debit").value;
      const credit = el.querySelector("#ar-credit").value;
      if (debit === credit) return m.errSameAccount;
      const debitAcc = coaByCode(debit), creditAcc = coaByCode(credit);
      if (!debitAcc || !creditAcc) return m.errAccount;
      const status = el.querySelector("#ar-status").value;
      if (status === "ACTIVE" && (debitAcc.status !== "ACTIVE" || creditAcc.status !== "ACTIVE")) return m.errAccountInactive;
      const conditions = {
        currency: el.querySelector("#ar-cur").value || null,
        rail: el.querySelector("#ar-rail").value || null,
        leg: el.querySelector("#ar-leg").value || null,
      };
      const amountBasis = el.querySelector("#ar-basis").value;
      const creationCondition = el.querySelector("#ar-cond").value.trim() || null;
      const draft = { id: isEdit ? rule.id : "new", trigger, conditions, status };
      if (status === "ACTIVE" && arConflictingRule(draft)) return m.errConflict;
      closeModal();
      if (isEdit) {
        Object.assign(rule, { name, description, trigger, sequence, debitAccountCode: debit, creditAccountCode: credit, amountBasis, creationCondition, status });
        arStamp(rule, rule.createdDate, pdNow());
      } else {
        const { id, code } = arNextId();
        ACCOUNTING_RULES.push(arStamp({ id, code, name, description, trigger, conditions, sequence, debitAccountCode: debit, creditAccountCode: credit, amountBasis, creationCondition, status }, pdNow()));
      }
      render();
      showToast(isEdit ? ar("actions.savedToast") : ar("actions.createdToast"));
      return null;
    },
  });
}

// ---- Карточка правила --------------------------------------------------------------------------------
function arDetailActions(rule) {
  const items = [];
  if (rule.status === "ACTIVE") items.push(vbActionItem("deactivate", ar("actions.deactivate"), ICONS.lock));
  if (rule.status === "INACTIVE") {
    items.push(vbActionItem("activate", ar("actions.activate"), CHECK_ICON_SVG));
    items.push(vbActionItem("archive", ar("actions.archive"), ICONS.box, true));
  }
  return vbHeaderActions(`<button type="button" class="btn-secondary" data-ar-action="edit">${vt("common.edit")}</button>`, items);
}

function viewAccountingRuleDetail(id) {
  const r = arById(id);
  if (!r) return vbNotFound();
  const f = ar("fields");
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.code, r.code)}
    ${detailField(f.trigger, ar(`trigger.${r.trigger}`))}
    ${detailField(f.sequence, r.sequence)}
    ${detailField(f.conditionCurrency, r.conditions.currency || ar("form.anyValue"))}
    ${detailField(f.conditionRail, r.conditions.rail || ar("form.anyValue"))}
    ${detailField(f.conditionLeg, r.conditions.leg ? ar(`leg.${r.conditions.leg}`) : ar("form.anyValue"))}
    ${detailField(f.debitAccount, `<button type="button" class="table-link" data-ar-coa-hash="#/accounting-coa/${coaByCode(r.debitAccountCode) ? coaByCode(r.debitAccountCode).id : ""}">${pdEscape(arAccountLabel(r.debitAccountCode))}</button>`)}
    ${detailField(f.creditAccount, `<button type="button" class="table-link" data-ar-coa-hash="#/accounting-coa/${coaByCode(r.creditAccountCode) ? coaByCode(r.creditAccountCode).id : ""}">${pdEscape(arAccountLabel(r.creditAccountCode))}</button>`)}
    ${detailField(f.amountBasis, ar(`amountBasis.${r.amountBasis}`))}
    ${r.creationCondition ? detailField(f.creationCondition, pdEscape(r.creationCondition)) : ""}
    ${detailField(f.status, arStatusBadge(r.status))}
    ${detailField(f.created, r.createdAt)}
    ${detailField(f.updated, r.updatedAt)}
    ${detailField(f.description, r.description ? pdEscape(r.description) : "—")}
  </div>`;
  const usage = arUsageCount(r);
  const usageBlock = `<p class="table-cell-muted">${ar("detail.usageNote")(usage)}</p>`;
  return `<div id="ar-root">
    ${vbDetailHeader({ backHash: "#/accounting-rules", title: `${r.code} · ${pdEscape(r.name)}`, badges: arStatusBadge(r.status), subtitle: r.createdAt, actions: arDetailActions(r) })}
    <div class="client-detail-grid">
      <div class="client-detail-grid-main"><div class="profile-flat-block">${flatSection(ar("sections.main"), main)}${flatSection(ar("sections.usage"), usageBlock)}</div></div>
    </div>
  </div>`;
}

function initAccountingRuleDetail(id) {
  const r = arById(id);
  const root = document.getElementById("ar-root");
  if (!r || !root) return;
  vbAttachCommon(root);
  root.querySelectorAll("[data-ar-coa-hash]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.arCoaHash !== "#/accounting-coa/") window.location.hash = b.dataset.arCoaHash; }));
  root.querySelectorAll("[data-vb-action]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.vbAction;
      if (act === "edit") arOpenForm(r);
      if (act === "deactivate") vbConfirm({ title: ar("actions.deactivateTitle"), text: ar("actions.deactivateText")(pdEscape(r.name)), confirmLabel: ar("actions.deactivate"), danger: true, onConfirm: () => { r.status = "INACTIVE"; arStamp(r, r.createdDate, pdNow()); render(); } });
      if (act === "activate") vbConfirm({ title: ar("actions.activateTitle"), text: ar("actions.activateText")(pdEscape(r.name)), confirmLabel: ar("actions.activate"), danger: false, onConfirm: () => { r.status = "ACTIVE"; arStamp(r, r.createdDate, pdNow()); render(); } });
      if (act === "archive") vbConfirm({ title: ar("actions.archiveTitle"), text: ar("actions.archiveText")(pdEscape(r.name)), confirmLabel: ar("actions.archive"), danger: true, onConfirm: () => { r.status = "ARCHIVED"; arStamp(r, r.createdDate, pdNow()); render(); } });
    })
  );
}
