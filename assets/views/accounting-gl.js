/* ==========================================================================
   "Настройки → Бухгалтерия → Главная книга" (General Ledger / Journal Entries).

   ДОПУЩЕНИЕ ПРОТОТИПА: как и План счетов — построено по FRD
   (general-ledger-i-chart-of-accounts.md §4), реального движка проводок в
   бэкенде нет. Данные — mock/accounting-gl.mock.js (там же считаются
   остатки счетов из проводок — see coaBalancesByCurrency).

   Апрув ручной проводки выше порога и сторнирование — защищены кодом 2FA
   (gl_entry_approve/gl_entry_reverse, components/admin-2fa.js): это
   реальное движение денег, ближайший по смыслу прецедент в проекте —
   "Одобрить платёж" (payment_approve, operations-payments.js), он тоже под
   2FA. Отклонение — без 2FA, тоже по аналогии с платежами.

   Maker-checker (§4.4 — апрувит ВТОРОЙ администратор) не смоделирован
   буквально: в прототипе один администратор, апрувит тот же — это
   ГРАНИЦА ПРОТОТИПА, отмечено в тексте формы.
   ========================================================================== */

function cg(path) {
  return t(`accountingGl.${path}`);
}

function glRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^accounting-gl\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function glStatusBadge(status) {
  const cls = { PENDING: "badge-warning", POSTED: "badge-success", REVERSED: "badge-neutral", REJECTED: "badge-danger" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${cg(`status.${status}`)}</span>`;
}

function glTypeBadge(type) {
  const cls = { AUTO: "badge-neutral", MANUAL: "badge-info", REVERSAL: "badge-warning" }[type] || "badge-neutral";
  return `<span class="badge ${cls}">${cg(`type.${type}`)}</span>`;
}


function glDrCrCell(e) {
  return `<div class="identity-cell">
    <span class="identity-cell-primary"><span class="table-cell-muted">${cg("drCr.debit")}:</span> ${pdEscape(e.debitAccountName)}</span>
    <span class="identity-cell-primary"><span class="table-cell-muted">${cg("drCr.credit")}:</span> ${pdEscape(e.creditAccountName)}</span>
  </div>`;
}

function glDimsLine(e) {
  const parts = [];
  if (e.appliedRuleCode) parts.push(e.appliedRuleCode);
  if (e.dimensions.vaCode) parts.push(`VA ${e.dimensions.vaCode}`);
  if (e.dimensions.raCode) parts.push(`RA ${e.dimensions.raCode}`);
  if (e.dimensions.clientId) parts.push(`Client`);
  if (e.dimensions.product) parts.push(e.dimensions.product);
  if (e.dimensions.channel) parts.push(e.dimensions.channel);
  return parts.length ? `<div class="table-cell-muted">${parts.join(" · ")}</div>` : "";
}

const glList = createAccessList({
  key: "gl",
  data: () => GL_JOURNAL_ENTRIES,
  searchPlaceholder: () => cg("search"),
  searchText: (e) => `${e.entryId} ${e.transactionId} ${e.description} ${e.debitAccountCode} ${e.creditAccountCode}`,
  tab: { get: (r) => r.status, values: ["PENDING", "POSTED", "REVERSED", "REJECTED"], label: (v) => cg(`status.${v}`) },
  filters: [
    { id: "type", kind: "multi", label: () => cg("fields.type"), get: (r) => r.type, options: () => ["AUTO", "MANUAL", "REVERSAL"].map((v) => ({ value: v, label: cg(`type.${v}`) })) },
    { id: "currency", kind: "multi", label: () => cg("fields.currency"), get: (r) => r.currency, options: () => [...new Set(GL_JOURNAL_ENTRIES.map((e) => e.currency))].map((c) => ({ value: c, label: c })) },
    { id: "created", kind: "date", label: () => cg("columns.effective"), get: (r) => r.effectiveDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, amount: (a, b) => a.amount - b.amount },
  metrics: (list) => [
    { value: list.length, label: cg("metrics.total") },
    { value: list.filter((e) => e.status === "POSTED").length, label: cg("metrics.posted") },
    { value: list.filter((e) => e.status === "PENDING").length, label: cg("metrics.pending") },
    { value: list.filter((e) => e.type === "MANUAL").length, label: cg("metrics.manual") },
  ],
  columns: [
    { label: () => cg("columns.entryId"), html: (e) => `<div class="identity-cell"><button type="button" class="table-link" data-gl-hash="#/accounting-gl/${e.id}">${e.entryId}</button>${glDimsLine(e)}</div>` },
    { label: () => cg("columns.type"), html: (e) => glTypeBadge(e.type) },
    { label: () => cg("columns.drCr"), html: glDrCrCell },
    { label: () => cg("columns.amount"), sort: "amount", html: (e) => coaFormatMoney(e.amount, e.currency) },
    { label: () => cg("columns.status"), html: (e) => glStatusBadge(e.status) },
    { label: () => cg("columns.effective"), sort: "created", html: (e) => dateTimeCell(e.effectiveAt) },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-gl-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.glHash; }));
  },
});

function glDoExport(format) {
  const rows = glList.exportRows();
  exportTable(
    "general-ledger",
    format,
    [cg("columns.entryId"), cg("fields.type"), cg("columns.debit"), cg("columns.credit"), cg("columns.amount"), cg("fields.currency"), cg("columns.status"), cg("columns.effective")],
    rows.map((e) => [e.entryId, cg(`type.${e.type}`), e.debitAccountName, e.creditAccountName, e.amount, e.currency, cg(`status.${e.status}`), e.effectiveAt])
  );
  showToast(cg("export.done"));
}

function viewAccountingGl() {
  const heroActions = `<span class="filters-bar-end">${sectionHintBtn("gl-hint-btn", cg("info"))}<span class="hdr-desktop-only">${exportMenuHtml("gl-export", cg("export.button"), cg("export.hint"))}</span><button type="button" class="btn-primary hdr-desktop-only" id="gl-add">${PLUS_ICON_SVG}<span>${cg("add")}</span></button>${hdrActionsKebab("gl-hdr-km", [{ id: "gl-export-csv", label: `${cg("export.button")} CSV` }, { id: "gl-export-xlsx", label: `${cg("export.button")} XLSX` }, { id: "gl-add-m", icon: PLUS_ICON_SVG, label: cg("add") }])}</span>`;
  return `<div class="list-hero">${pageHeader(t("nav.accounting-gl"), t("navDescriptions.accounting-gl"), heroActions)}</div>${glList.view()}`;
}

function initAccountingGl() {
  glList.init();
  bindExportMenu("gl-export", glDoExport);
  document.getElementById("gl-add")?.addEventListener("click", glOpenCreateForm);
  document.getElementById("gl-export-csv")?.addEventListener("click", () => { closeAllRowKebabs(); glDoExport("csv"); });
  document.getElementById("gl-export-xlsx")?.addEventListener("click", () => { closeAllRowKebabs(); glDoExport("xlsx"); });
  document.getElementById("gl-add-m")?.addEventListener("click", () => { closeAllRowKebabs(); glOpenCreateForm(); });
}

// ---- Ручная проводка ------------------------------------------------------------------------------
function glManualAccountOptions() {
  return COA_ACCOUNTS.filter((a) => a.nodeType !== "GROUP" && a.allowManualEntry && a.status === "ACTIVE").map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
}

// Связанный ВА/РА — необязательное поле: выбирается реальный счёт (mock/accounts.mock.js), а не
// печатается VA-ID/Product/Channel руками. Привязка проверяется по тегу — выбранный счёт должен
// относиться (по .tag) к дебетуемому либо кредитуемому счёту плана счетов; дальше va/ra/clientId
// проводки выводятся из самого выбранного счёта, а не вводятся отдельно (см. правку "как ВА и РА
// привязываются к счёту" — тег, а не руками заполняемые измерения).
function glLinkedAccountOptions() {
  return [{ value: "", label: cg("form.noLinkedAccount") }, ...coaAllAccountInstances().filter((x) => x.tag).map((x) => ({ value: `${x.kind}:${x.id}`, label: `${x.code} · ${x.client ? x.client.name : x.description || x.kind} (${x.tag})` }))];
}

function glOpenCreateForm() {
  const options = glManualAccountOptions();
  if (!options.length) { showToast(cg("form.errNotManual")); return; }
  const html = `
    ${vbSelect("gl-debit", cg("form.debitAccount"), options, options[0].value)}
    ${vbSelect("gl-credit", cg("form.creditAccount"), options, options[1] ? options[1].value : options[0].value)}
    <div class="rt-grid">
      ${vbSelect("gl-currency", cg("form.currency"), ["EUR", "USD", "GBP"].map((c) => ({ value: c, label: c })), "EUR")}
      ${vbInput("gl-amount", cg("form.amount"), "", 'inputmode="decimal" placeholder="1000.00"')}
    </div>
    ${vbSelect("gl-linked", cg("form.linkedAccount"), glLinkedAccountOptions(), "")}
    ${vbTextarea("gl-desc", `${cg("form.description")} *`, "", 2)}
    ${vbInput("gl-doc", cg("form.supportingDocNote"), "")}
  `;
  vbOpenForm({
    title: cg("form.title"),
    width: 600,
    intro: `${cg("form.intro")}<br><br>${cg("form.thresholdNote")(GL_MANUAL_THRESHOLD.toLocaleString("ru-RU"))}`,
    fieldsHtml: html,
    submitLabel: cg("actions.create"),
    onSubmit: (el) => {
      const debit = el.querySelector("#gl-debit").dataset.value || el.querySelector("#gl-debit").value;
      const credit = el.querySelector("#gl-credit").dataset.value || el.querySelector("#gl-credit").value;
      if (debit === credit) return cg("form.errSameAccount");
      const debitAcc = coaByCode(debit), creditAcc = coaByCode(credit);
      if (!debitAcc || !creditAcc) return cg("form.errDebitAccount");
      const currency = el.querySelector("#gl-currency").value;
      const fixedCur = debitAcc.currency || creditAcc.currency;
      if (fixedCur && currency !== fixedCur) return cg("form.errCurrencyMismatch")(fixedCur);
      const raw = el.querySelector("#gl-amount").value.trim().replace(",", ".");
      const amount = Number(raw);
      if (!raw || !Number.isFinite(amount) || amount <= 0) return cg("form.errAmount");
      const description = el.querySelector("#gl-desc").value.trim();
      if (description.length < 3) return cg("form.errDescription");
      const linkedValue = el.querySelector("#gl-linked").value;
      let va = null, vaCode = null, ra = null, raCode = null, clientId = null;
      if (linkedValue) {
        const [kind, accId] = linkedValue.split(":");
        const linked = coaFindAccountInstance(kind, accId);
        if (!linked) return cg("form.errDebitAccount");
        if (linked.tag !== debitAcc.tag && linked.tag !== creditAcc.tag) return cg("form.errAccountMismatch");
        if (kind === "virtual") { va = linked.code; vaCode = linked.code; } else { ra = linked.code; raCode = linked.code; }
        if (linked.client) clientId = linked.client.id;
      }
      const docNote = el.querySelector("#gl-doc").value.trim();
      closeModal();
      const status = amount > GL_MANUAL_THRESHOLD ? "PENDING" : "POSTED";
      glPush({
        type: "MANUAL",
        status,
        debit,
        credit,
        amount,
        currency,
        description,
        dims: { va, vaCode, ra, raCode, clientId, product: null, channel: null },
        supportingDocNote: docNote || null,
      });
      render();
      showToast(status === "PENDING" ? cg("actions.pendingToast") : cg("actions.postedToast"));
      return null;
    },
  });
}

// ---- Апрув / отклонение / сторно -------------------------------------------------------------------
function glApprove(e) {
  requireAdmin2fa("gl_entry_approve", () => {
    e.status = "POSTED";
    e.postedDate = pdNow();
    e.postedAt = formatDateTime(e.postedDate);
    render();
    showToast(cg("actions.approvedToast"));
  });
}

function glOpenReject(e) {
  vbOpenForm({
    title: cg("actions.rejectTitle"),
    width: 440,
    fieldsHtml: vbTextarea("gl-reject-reason", cg("actions.rejectReasonLabel"), "", 3),
    submitLabel: cg("actions.reject"),
    danger: true,
    onSubmit: (el) => {
      const reason = el.querySelector("#gl-reject-reason").value.trim();
      if (!reason) return cg("actions.errRejectReason");
      closeModal();
      e.status = "REJECTED";
      e.rejectReason = reason;
      render();
      showToast(cg("actions.rejectedToast"));
      return null;
    },
  });
}

function glOpenReverse(e) {
  vbOpenForm({
    title: cg("actions.reverseTitle"),
    width: 480,
    intro: cg("actions.reverseText")(e.entryId),
    fieldsHtml: vbTextarea("gl-reverse-reason", cg("actions.reverseReasonLabel"), "", 3),
    submitLabel: cg("actions.reverse"),
    danger: true,
    onSubmit: (el) => {
      const reason = el.querySelector("#gl-reverse-reason").value.trim();
      if (!reason) return cg("actions.errReverseReason");
      closeModal();
      requireAdmin2fa("gl_entry_reverse", () => {
        const d = e.dimensions;
        const reversal = glPush({
          type: "REVERSAL",
          status: "POSTED",
          debit: e.creditAccountCode,
          credit: e.debitAccountCode,
          amount: e.amount,
          currency: e.currency,
          description: `${cg("actions.reverse")}: ${e.entryId} — ${reason}`,
          dims: { va: d.vaId, vaCode: d.vaCode, ra: d.raId, raCode: d.raCode, clientId: d.clientId, product: d.product, channel: d.channel },
          reversalOfId: e.id,
        });
        e.status = "REVERSED";
        e.reversedById = reversal.id;
        render();
        showToast(cg("actions.reversedToast"));
      });
      return null;
    },
  });
}

// ---- Карточка проводки -----------------------------------------------------------------------------
function glDetailActions(e) {
  const items = [];
  if (e.status === "PENDING") {
    items.push(vbActionItem("approve", cg("actions.approve"), CHECK_ICON_SVG));
    items.push(vbActionItem("reject", cg("actions.reject"), ICONS.lock, true));
  }
  if (e.status === "POSTED" && !e.reversedById) items.push(vbActionItem("reverse", cg("actions.reverse"), ICONS.lock, true));
  return vbHeaderActions("", items);
}

function glAccountLink(code, name) {
  return `<button type="button" class="table-link" data-gl-coa-hash="#/accounting-coa/${coaByCode(code) ? coaByCode(code).id : ""}">${pdEscape(name)}</button>`;
}

function viewAccountingGlDetail(id) {
  const e = glById(id);
  if (!e) return vbNotFound();
  const f = cg("fields");
  const d = e.dimensions;
  const dimsRows = [];
  if (d.vaCode) dimsRows.push(detailField(cg("dims.VA-ID"), d.vaCode));
  if (d.raCode) dimsRows.push(detailField(cg("dims.RA-ID"), d.raCode));
  if (d.clientId) { const cu = CLIENTS_USERS_MOCK.find((u) => u.id === d.clientId); dimsRows.push(detailField(cg("dims.Client-ID"), `<button type="button" class="table-link" data-gl-client-hash="#/clients-users/${d.clientId}">${cu ? cu.code : pdShort(d.clientId)}</button>`)); }
  if (d.product) dimsRows.push(detailField(cg("dims.Product"), d.product));
  if (d.channel) dimsRows.push(detailField(cg("dims.Channel"), d.channel));

  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.entryId, e.entryId)}
    ${e.sourceOperationId
      ? detailField(f.transactionId, `<button type="button" class="table-link" data-gl-op-hash="#/operations-payments/${e.sourceOperationId}">${pdEscape(e.transactionId)}</button>`)
      : copyableField(f.transactionId, e.transactionId)}
    ${detailField(f.type, glTypeBadge(e.type))}
    ${detailField(f.status, glStatusBadge(e.status))}
    ${detailField(f.debitAccount, glAccountLink(e.debitAccountCode, e.debitAccountName))}
    ${detailField(f.creditAccount, glAccountLink(e.creditAccountCode, e.creditAccountName))}
    ${e.appliedRuleCode ? (() => { const rule = arByCode(e.appliedRuleCode); return detailField(f.appliedRule, rule ? `<button type="button" class="table-link" data-gl-rule-hash="#/accounting-rules/${rule.id}">${rule.code} · ${pdEscape(rule.name)}</button>` : e.appliedRuleCode); })() : ""}
    ${detailField(f.amount, coaFormatMoney(e.amount, e.currency))}
    ${detailField(f.period, e.period)}
    ${detailField(f.effectiveDate, e.effectiveAt)}
    ${detailField(f.postedDate, e.postedAt || "—")}
    ${detailField(f.createdBy, pdEscape(e.createdBy))}
    ${detailField(f.description, pdEscape(e.description))}
    ${e.reversalOfId ? detailField(f.reversalOf, `<button type="button" class="table-link" data-gl-hash="#/accounting-gl/${e.reversalOfId}">${glById(e.reversalOfId) ? glById(e.reversalOfId).entryId : ""}</button>`) : ""}
    ${e.reversedById ? detailField(f.reversedBy, `<button type="button" class="table-link" data-gl-hash="#/accounting-gl/${e.reversedById}">${glById(e.reversedById) ? glById(e.reversedById).entryId : ""}</button>`) : ""}
    ${e.status === "REJECTED" && e.rejectReason ? detailField(f.rejectReason, pdEscape(e.rejectReason)) : ""}
  </div>`;

  const dims = dimsRows.length ? `<div class="profile-fields profile-fields-grid profile-fields-grid-1">${dimsRows.join("")}</div>` : `<div class="table-cell-muted">${cg("detail.noDims")}</div>`;
  const doc = e.supportingDocNote ? `<p class="table-cell-muted">${pdEscape(e.supportingDocNote)}</p>` : `<p class="table-cell-muted">${cg("detail.noDoc")}</p>`;

  return `<div id="gl-root">
    ${vbDetailHeader({ backHash: "#/accounting-gl", title: e.entryId, badges: `${glTypeBadge(e.type)}${glStatusBadge(e.status)}`, subtitle: e.effectiveAt, actions: glDetailActions(e) })}
    <div class="client-detail-grid">
      <div class="client-detail-grid-main"><div class="profile-flat-block">
        ${flatSection(cg("sections.main"), main)}
        ${flatSection(cg("sections.dims"), dims)}
        ${e.type === "MANUAL" ? flatSection(cg("sections.doc"), doc) : ""}
      </div></div>
    </div>
  </div>`;
}

function initAccountingGlDetail(id) {
  const e = glById(id);
  const root = document.getElementById("gl-root");
  if (!e || !root) return;
  vbAttachCommon(root);
  root.querySelectorAll("[data-gl-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.glHash; }));
  root.querySelectorAll("[data-gl-coa-hash]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.glCoaHash !== "#/accounting-coa/") window.location.hash = b.dataset.glCoaHash; }));
  root.querySelectorAll("[data-gl-client-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.glClientHash; }));
  root.querySelectorAll("[data-gl-op-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.glOpHash; }));
  root.querySelectorAll("[data-gl-rule-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.glRuleHash; }));
  root.querySelectorAll("[data-vb-action]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.vbAction;
      if (act === "approve") glApprove(e);
      if (act === "reject") glOpenReject(e);
      if (act === "reverse") glOpenReverse(e);
    })
  );
}
