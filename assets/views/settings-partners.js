/* ==========================================================================
   "Клиенты → Партнёрские сервисы" (партнёры, подключённые по API через open banking). Страница сервиса: обзор,
   авторизация, платежи, клиенты, вебхуки, 2FA. Клиенты, пришедшие через партнёра, отдельного раздела в навигации не
   имеют — открываются только из вкладки «Клиенты» на карточке сервиса. Данные и источники — в mock/partners.mock.js.
   Списки — на createAccessList, формы — на vbOpenForm; все изменения — через код 2FA.
   ========================================================================== */

function pn(path) {
  return t(`partners.${path}`);
}

const PN_TABS = ["overview", "auth", "payments", "operations", "clients", "webhooks", "twofa"];
let pnTab = "overview";
let pnLastId = null;
let pnDraft = null; // { id, authMode, twofa, channels, exchangeMode, manual }
const PN_STATUSES = ["ON_REVIEW", "APPROVED", "DECLINED", "BLOCKED"];
const PN_KYC_STATUS_BADGE_CLS = { NOT_STARTED: "badge-neutral", IN_PROGRESS: "badge-info", REJECTED_RETRY: "badge-warning", REJECTED_FINAL: "badge-danger", APPROVED: "badge-success" };

// ---- Отображение ------------------------------------------------------------------------------------------------
function pnStatusBadge(status) {
  const cls = { APPROVED: "badge-success", ON_REVIEW: "badge-warning", DECLINED: "badge-danger", BLOCKED: "badge-danger" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${pn(`status.${status}`)}</span>`;
}

function pnModeBadge(mode) {
  return `<span class="badge ${mode === "LIGHT" ? "badge-info" : "badge-neutral"}">${pn(`mode.${mode}.short`)}</span>`;
}

// KYC партнёрского клиента (документ, раздел 3.4) — уровень + статус его проверки
function pnKycBadge(c) {
  const cls = PN_KYC_STATUS_BADGE_CLS[c.kycStatus] || "badge-neutral";
  const level = c.kycLevel ? pn("kycLevel")(c.kycLevel) : pn("kyc.notPassed");
  return `<div class="identity-cell"><span class="badge ${cls}" title="${escapeAttr(pn(`kyc.statusHint.${c.kycStatus}`))}">${pn(`kyc.status.${c.kycStatus}`)}</span><span class="table-cell-muted">${level}</span></div>`;
}

function pnDepositStatusBadge(status) {
  const cls = { PENDING: "badge-warning", SUCCEEDED: "badge-success", FAILED: "badge-danger" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${pn(`deposit.status.${status}`)}</span>`;
}

function pnPaymentStatusBadge(status) {
  const cls = { DRAFT: "badge-neutral", PROCESSING: "badge-info", SUCCESSFUL: "badge-success", DECLINED: "badge-danger", REFUNDED: "badge-warning" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${pn(`payout.status.${status}`)}</span>`;
}

function pnNameCell(s) {
  return `<div class="identity-cell">${vbLink(`#/clients-partners/${s.id}`, pdEscape(s.name))}${vbIdCell(s.id)}</div>`;
}

// Ссылка на карточку партнёрского клиента (открывается из вкладки «Клиенты» на карточке сервиса)
function pnClientCell(c) {
  return `<div class="identity-cell">${vbLink(`#/clients-partner-users/${c.id}`, pdEscape(c.name))}${vbIdCell(c.id)}</div>`;
}

// Привязанный аккаунт — не «что клиент подключил партнёру» (это была отдельная концепция старого плана с полным
// OAuth-согласием), а прямая ссылка на реальную запись платформы, за которой стоит этот партнёрский клиент
// (документ, раздел 0/3: клиент лёгкого режима — это клиент банка, прошедший регистрацию и KYC на фронте банка).
function pnAccountCell(c) {
  const kindLabel = c.internalKind === "company" ? pn("account.CORPORATE") : pn("account.INDIVIDUAL");
  return `<div class="identity-cell">${vbLink(pnInternalLink(c), pdEscape(c.name))}<span class="table-cell-muted">${kindLabel}${c.companyRole ? ` · ${pn(`companyRole.${c.companyRole}`)}` : ""}</span></div>`;
}

function pnAttachRows(wrap) {
  vbAttachRows(wrap);
  wrap.querySelectorAll(".id-copy").forEach((btn) => btn.addEventListener("click", () => copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn))));
}

function pnInfoButton(text, label) {
  return `<button type="button" class="client-detail-actions-btn acm-info-btn" title="${escapeAttr(text)}" aria-label="${escapeAttr(label)}">${ACM_INFO_ICON}</button>`;
}

// ---- Список сервисов ---------------------------------------------------------------------------------------------
const pnList = createAccessList({
  key: "pn",
  data: () => PN_SERVICES,
  searchPlaceholder: () => pn("list.search"),
  searchText: (s) => `${s.name} ${s.email} ${s.description || ""} ${s.id}`,
  tab: { get: (s) => s.status, values: PN_STATUSES, label: (v) => pn(`status.${v}`) },
  filters: [
    { id: "mode", kind: "multi", label: () => pn("list.mode"), get: (s) => s.authMode, options: () => ["FULL_OAUTH", "LIGHT"].map((v) => ({ value: v, label: pn(`mode.${v}.short`) })) },
    { id: "created", kind: "date", label: () => pn("list.created"), get: (s) => s.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { name: (a, b) => a.name.localeCompare(b.name), created: (a, b) => a.createdDate - b.createdDate },
  columns: [
    { label: () => pn("columns.service"), sort: "name", html: pnNameCell },
    { label: () => pn("columns.status"), html: (s) => pnStatusBadge(s.status) },
    { label: () => pn("columns.mode"), html: (s) => pnModeBadge(s.authMode) },
    { label: () => pn("columns.channels"), html: (s) => PN_CHANNELS.filter((c) => s.channels[c]).map((c) => pn(`channels.${c}.short`)).join(", ") || "—" },
    { label: () => pn("columns.clients"), html: (s) => pnClientsOf(s.id).length },
    { label: () => pn("columns.webhooks"), html: (s) => { const w = pnWebhooksOf(s.id); return w.length ? pn("list.webhooksActive")(w.filter((x) => x.isActive).length, w.length) : "—"; } },
    { label: () => pn("columns.created"), sort: "created", html: (s) => dateTimeCell(s.createdAt) },
  ],
  headerAction: () => `<span class="filters-bar-end">${exportMenuHtml("pn-export", pn("export.button"), pn("export.hint"))}<button type="button" class="btn-primary" id="pn-add">${PLUS_ICON_SVG}<span>${pn("list.add")}</span></button></span>`,
  attachHeaderAction: () => {
    bindExportMenu("pn-export", (f) => {
      exportTable("external-services", f, [pn("columns.service"), pn("columns.status"), pn("columns.mode"), pn("columns.clients"), pn("columns.scopes"), "Email", pn("columns.created")], PN_SERVICES.map((s) => [s.name, pn(`status.${s.status}`), pn(`mode.${s.authMode}.short`), pnClientsOf(s.id).length, s.scopes.join(" "), s.email, s.createdAt]));
      showToast(pn("export.done"));
    });
    document.getElementById("pn-add").addEventListener("click", pnOpenCreate);
  },
  attachRows: pnAttachRows,
});

function viewPartners() {
  return `<div class="list-hero">${pageHeader(t("nav.clients-partners"), t("navDescriptions.clients-partners"), pnInfoButton(pn("info"), pn("title")))}</div>${pnList.view()}`;
}

function initPartners() {
  pnList.init();
}

// ---- Создание сервиса ------------------------------------------------------------------------------------------
const PN_IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const PN_IPV6 = /^[0-9a-fA-F:]+$/;
function pnIsIp(v) {
  return PN_IPV4.test(v) || (v.includes(":") && PN_IPV6.test(v));
}
function pnIsUrl(v) {
  return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v);
}
function pnLines(text) {
  return text.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

function pnSecret() {
  const bytes = new Uint8Array(32);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function pnScopeChecklist(selected) {
  return `<div class="filters-field vb-field"><span class="filters-field-label">${pn("form.scopes")}</span><div class="rt-clients">${PN_SCOPES.map((s) => `<label class="rt-client"><input type="checkbox" value="${s.scope}"${selected.includes(s.scope) ? " checked" : ""} /><span class="pn-scope-check"><span class="vb-mono">${s.scope}</span><span class="table-cell-muted">${pn(`scopeDesc.${s.scope}`)}</span></span></label>`).join("")}</div></div>`;
}

function pnOpenCreate() {
  const f = pn("form");
  vbOpenForm({
    title: f.createTitle,
    width: 620,
    intro: f.createIntro,
    fieldsHtml: `${vbInput("pn-name", `${f.name} *`, "")}${vbInput("pn-desc", f.description, "")}${vbInput("pn-email", `${f.email} *`, "", 'type="email"')}${vbInput("pn-logo", `${f.logoUrl} *`, "", 'placeholder="https://"')}
      ${vbSelect("pn-mode", f.mode, ["FULL_OAUTH", "LIGHT"].map((m) => ({ value: m, label: pn(`mode.${m}.title`) })), "FULL_OAUTH")}
      ${vbTextarea("pn-uris", `${f.redirectUris} *`, "", 2)}${vbTextarea("pn-ips", f.ips, "", 2)}${pnScopeChecklist([])}`,
    submitLabel: vt("common.create"),
    onSubmit: (el) => {
      const e = f.errors;
      const name = el.querySelector("#pn-name").value.trim();
      const email = el.querySelector("#pn-email").value.trim();
      const logoUrl = el.querySelector("#pn-logo").value.trim();
      const uris = pnLines(el.querySelector("#pn-uris").value);
      const ips = pnLines(el.querySelector("#pn-ips").value);
      if (name.length < 2) return e.name;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return e.email;
      if (!pnIsUrl(logoUrl)) return e.logo;
      if (!uris.length || !uris.every(pnIsUrl)) return e.uris;
      if (!ips.every(pnIsIp)) return e.ips;
      const scopes = [...el.querySelectorAll(".rt-clients input:checked")].map((i) => i.value);
      const authMode = el.querySelector("#pn-mode").value;
      closeModal();
      requireAdmin2fa("partner_manage", () => {
        const secret = pnSecret();
        const now = pdNow();
        const rec = {
          id: pnUuid(3000 + PN_SERVICES.length), name, description: el.querySelector("#pn-desc").value.trim(), email, logoUrl, status: "ON_REVIEW", authMode,
          createdDate: now, createdAt: formatDateTime(now), updatedAt: formatDateTime(now), allowedIps: ips, redirectUris: uris, scopes, twofa: { enabled: true }, secretIssuedAt: formatDateTime(now),
          channels: { INNER: true, SWIFT: false, RU_WIRE: false, SBP: false, QR: false }, exchange: { mode: "NONE", manual: false }, corporateAccount: null,
        };
        PN_SERVICES.unshift(rec);
        pnShowSecret(rec, secret, true);
      });
      return null;
    },
  });
}

function pnShowSecret(rec, secret, isNew) {
  const f = pn("secret");
  openModal({
    title: isNew ? f.titleNew : f.titleReissue,
    width: 520,
    bodyHtml: `<p class="modal-confirm-text">${f.text}</p><div class="pn-secret"><span class="vb-mono" id="pn-secret-value">${pdEscape(secret)}</span></div><p class="table-cell-muted">${f.hint}</p>`,
    footerHtml: `<button type="button" class="btn-secondary" id="pn-secret-copy">${f.copy}</button><button type="button" class="btn-primary" id="pn-secret-done">${f.done}</button>`,
    closeOnOverlay: false,
    onMount: (el) => {
      el.querySelector("#pn-secret-copy").addEventListener("click", () => copyTextToClipboard(secret).then(() => showToast(f.copied)));
      el.querySelector("#pn-secret-done").addEventListener("click", () => { closeModal(); window.location.hash = `#/clients-partners/${rec.id}`; render(); });
    },
  });
}

// ---- Страница сервиса -----------------------------------------------------------------------------------------
function pnRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^clients-partners\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ---- Страница партнёрского клиента ------------------------------------------------------------------------------
function currentPartnerUserId() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^clients-partner-users\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function pnDraftFor(s) {
  if (!pnDraft || pnDraft.id !== s.id) pnDraft = { id: s.id, authMode: s.authMode, twofa: s.twofa.enabled, channels: { ...s.channels }, exchangeMode: s.exchange.mode, manual: s.exchange.manual };
  return pnDraft;
}

function pnTabsBar(s) {
  const counts = { clients: pnClientsOf(s.id).length, webhooks: pnWebhooksOf(s.id).length, operations: pnDepositsOfService(s.id).length + pnPaymentsOfService(s.id).length };
  return `<div class="cd-subtabs">${PN_TABS.map((k) => `<button type="button" class="cd-subtab${pnTab === k ? " is-active" : ""}" data-pn-tab="${k}"><span>${pn(`tabs.${k}`)}</span>${counts[k] != null ? `<span class="quick-tab-count">${counts[k]}</span>` : ""}</button>`).join("")}</div>`;
}

function pnHeaderActions(s) {
  const a = pn("actions");
  const item = (act, label, icon, danger) => ({ label, icon, danger, attrs: `data-pn-action="${act}"` });
  const primary = { ON_REVIEW: ["approve", a.approve], DECLINED: ["review", a.review], BLOCKED: ["unblock", a.unblock] }[s.status];
  const items = [item("edit", a.edit, EDIT_ICON_SVG)];
  if (s.status === "ON_REVIEW") items.push(item("decline", a.decline, ICONS.lock, true));
  if (s.status === "APPROVED") items.push(item("block", a.block, ICONS.lock, true));
  items.push({ label: t("headerMenu.exportCard"), icon: DOWNLOAD_ICON_SVG, attrs: `data-vb-action="pdf"` });
  return `${primary ? `<button type="button" class="btn-primary" data-pn-action="${primary[0]}">${primary[1]}</button>` : ""}${rowKebabMenu("pn-head", items)}`;
}

function viewPartnerDetail(id) {
  if (id !== pnLastId) { pnTab = "overview"; pnLastId = id; pnDraft = null; }
  const s = pnById(id);
  if (!s) return vbNotFound();
  return `<div id="vb-root">
    ${vbDetailHeader({ backHash: "#/clients-partners", title: pdEscape(s.name), badges: `${pnStatusBadge(s.status)}${pnModeBadge(s.authMode)}`, subtitle: vbIdSubtitle(s.id, [pdEscape(s.email), s.createdAt]), actions: pnHeaderActions(s), avatar: cdAvatar(s.name) })}
    <div class="cd-tabs-wrap" id="pn-tabs">${pnTabsBar(s)}</div>
    <div id="pn-content"><div id="vb-body">${pnTabContent(s)}</div></div>
  </div>`;
}

function pnTabContent(s) {
  return { overview: pnOverview, auth: pnAuth, payments: pnPayments, operations: pnOperations, clients: pnClients, webhooks: pnWebhooks, twofa: pnTwofa }[pnTab](s);
}

function initPartnerDetail(id) {
  const s = pnById(id);
  const root = document.getElementById("vb-root");
  if (!s || !root) return;
  root.querySelectorAll("[data-pn-action]").forEach((b) => b.addEventListener("click", () => pnHeaderAction(s, b.dataset.pnAction)));
  vbAttachCommon(root);
  pnBindTabs(s, root);
  pnBindTab(s, root.querySelector("#pn-content"));
}

function pnBindTabs(s, root) {
  root.querySelectorAll("[data-pn-tab]").forEach((btn) =>
    btn.addEventListener("click", () => {
      pnTab = btn.dataset.pnTab;
      pnRefresh(s);
    })
  );
}

// Перерисовка вкладок и содержимого без шапки (её обработчики вешаются один раз)
function pnRefresh(s) {
  const root = document.getElementById("vb-root");
  const content = root.querySelector("#pn-content");
  root.querySelector("#pn-tabs").innerHTML = pnTabsBar(s);
  content.innerHTML = `<div id="vb-body">${pnTabContent(s)}</div>`;
  vbAttachCommon(content);
  pnBindTabs(s, root);
  pnBindTab(s, content);
}

// ---- Смена статуса и данные ---------------------------------------------------------------------------------------
function pnSetStatus(s, next, key) {
  const m = pn("statusChange");
  vbConfirm({
    title: m[key].title,
    text: m[key].text(pdEscape(s.name)),
    confirmLabel: m[key].confirm,
    danger: next === "BLOCKED" || next === "DECLINED",
    onConfirm: () => requireAdmin2fa("partner_manage", () => { s.status = next; s.updatedAt = formatDateTime(pdNow()); showToast(m.done); render(); }),
  });
}

function pnHeaderAction(s, act) {
  if (act === "approve") pnSetStatus(s, "APPROVED", "approve");
  else if (act === "decline") pnSetStatus(s, "DECLINED", "decline");
  else if (act === "block") pnSetStatus(s, "BLOCKED", "block");
  else if (act === "unblock") pnSetStatus(s, "APPROVED", "unblock");
  else if (act === "review") pnSetStatus(s, "ON_REVIEW", "review");
  else if (act === "edit") pnOpenEdit(s);
}

function pnOpenEdit(s) {
  const f = pn("form");
  vbOpenForm({
    title: f.editTitle,
    fieldsHtml: `${vbInput("pn-name", `${f.name} *`, s.name)}${vbInput("pn-desc", f.description, s.description || "")}${vbInput("pn-email", `${f.email} *`, s.email, 'type="email"')}${vbInput("pn-logo", `${f.logoUrl} *`, s.logoUrl)}`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const e = f.errors;
      const name = el.querySelector("#pn-name").value.trim();
      const email = el.querySelector("#pn-email").value.trim();
      const logoUrl = el.querySelector("#pn-logo").value.trim();
      if (name.length < 2) return e.name;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return e.email;
      if (!pnIsUrl(logoUrl)) return e.logo;
      closeModal();
      requireAdmin2fa("partner_manage", () => { Object.assign(s, { name, email, logoUrl, description: el.querySelector("#pn-desc").value.trim() }); s.updatedAt = formatDateTime(pdNow()); showToast(pn("saved")); render(); });
      return null;
    },
  });
}

// ---- Вкладка «Обзор» --------------------------------------------------------------------------------------------
function pnValueList(items, delAttr, emptyText) {
  if (!items.length) return `<div class="table-cell-muted">${emptyText}</div>`;
  return `<div class="pn-list">${items.map((v, i) => `<div class="pn-list-row"><span class="vb-mono">${pdEscape(v)}</span><button type="button" class="pn-x" ${delAttr}="${i}" title="${escapeAttr(pn("remove"))}" aria-label="${escapeAttr(pn("remove"))}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 8 8M14 6l-8 8"/></svg></button></div>`).join("")}</div>`;
}

// Среда: до одобрения сервис работает в песочнице, после одобрения — в продакшене (заявка со scopes, callback-URL и IP проверяется нами)
function pnEnvironmentCard(s) {
  const env = s.status === "APPROVED" ? "PRODUCTION" : s.status === "BLOCKED" ? "BLOCKED" : "SANDBOX";
  const rows = [
    [pn("prod.scopes"), s.scopes.length ? pn("prod.count")(s.scopes.length) : "", s.scopes.length > 0],
    [pn("prod.uris"), s.redirectUris.length ? pn("prod.count")(s.redirectUris.length) : "", s.redirectUris.length > 0],
    [pn("prod.ips"), s.allowedIps.length ? pn("prod.count")(s.allowedIps.length) : "", s.allowedIps.length > 0],
  ];
  const badge = { PRODUCTION: "badge-success", SANDBOX: "badge-warning", BLOCKED: "badge-danger" }[env];
  return `<div class="pn-env"><span class="badge ${badge}">${pn(`prod.env.${env}`)}</span></div>
    <p class="table-cell-muted pn-hint">${pn(`prod.text.${env}`)}</p>
    <div class="pn-check-list">${rows.map(([label, val, ok]) => `<div class="pn-check${ok ? " is-ok" : ""}"><span class="pn-check-mark">${ok ? CHECK_ICON_SVG : ""}</span><span>${label}</span><span class="table-cell-muted">${val || pn("prod.missing")}</span></div>`).join("")}</div>`;
}

function pnOverview(s) {
  const f = pn("fields");
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, s.id)}${detailField(f.name, pdEscape(s.name))}${detailField(f.status, pnStatusBadge(s.status))}
    ${copyableField(f.email, s.email)}${detailField(f.description, s.description ? pdEscape(s.description) : "—")}${copyableField(f.logoUrl, s.logoUrl, `<span class="vb-mono">${pdEscape(s.logoUrl)}</span>`)}
    ${detailField(f.created, s.createdAt)}${detailField(f.updated, s.updatedAt)}</div>`;
  const uris = `<div class="pn-block-head"><span class="pn-block-title">${pn("access.redirectUris")}</span><button type="button" class="btn-secondary pn-add-btn" data-pn-add="uri">${PLUS_ICON_SVG}<span>${pn("access.add")}</span></button></div>${pnValueList(s.redirectUris, "data-pn-del-uri", pn("access.noUris"))}<p class="table-cell-muted pn-hint">${pn("access.urisHint")}</p>`;
  const ips = `<div class="pn-block-head"><span class="pn-block-title">${pn("access.ips")}</span><button type="button" class="btn-secondary pn-add-btn" data-pn-add="ip">${PLUS_ICON_SVG}<span>${pn("access.add")}</span></button></div>${pnValueList(s.allowedIps, "data-pn-del-ip", pn("access.noIps"))}<p class="table-cell-muted pn-hint">${pn("access.ipsHint")}</p>`;
  const scopes = s.scopes.length ? `<div class="pn-chips">${s.scopes.map((x) => `<div class="pn-scope"><span class="vb-mono">${x}</span><span class="table-cell-muted">${pn(`scopeDesc.${x}`)}</span></div>`).join("")}</div>` : `<div class="table-cell-muted">—</div>`;
  const secret = `<p class="table-cell-muted">${pn("secret.card")(s.secretIssuedAt)}</p><button type="button" class="btn-secondary pn-reissue" data-pn-action2="reissue">${pn("secret.reissue")}</button>`;
  return `<div class="client-detail-grid">
    <div class="client-detail-grid-main"><div class="profile-flat-block">${flatSection(pn("sections.main"), main)}${flatSection(pn("sections.access"), `${uris}${ips}`)}</div></div>
    <div class="client-detail-grid-side">${sectionCard(pn("sections.env"), pnEnvironmentCard(s))}${sectionCard(pn("sections.scopes"), `${scopes}<p class="table-cell-muted pn-hint">${pn("scopesHint")}</p>`)}${sectionCard(pn("sections.secret"), secret)}</div>
  </div>`;
}

// ---- Вкладка «Авторизация» ----------------------------------------------------------------------------------------
function pnAuth(s) {
  const d = pnDraftFor(s);
  const modes = ["FULL_OAUTH", "LIGHT"].map((m) => `<label class="pn-mode${d.authMode === m ? " is-active" : ""}"><input type="radio" name="pn-mode" value="${m}"${d.authMode === m ? " checked" : ""} />
      <div><div class="pn-mode-title">${pn(`mode.${m}.title`)}</div><div class="table-cell-muted">${pn(`mode.${m}.text`)}</div><ul class="pn-mode-list">${pn(`mode.${m}.points`).map((p) => `<li>${p}</li>`).join("")}</ul></div></label>`).join("");
  const dirty = d.authMode !== s.authMode;
  const flow = `<div class="pn-steps">${pn(`flow.${d.authMode}`).map((x, i) => `<div class="pn-step"><span class="pn-step-num">${i + 1}</span><span>${x}</span></div>`).join("")}</div>`;
  const rows = pnSessionsOf(s.id).sort((a, b) => b.createdDate - a.createdDate);
  const c = pn("columns");
  const sessions = vbMiniTable(
    [c.session, c.client, c.account, c.kind, c.status, c.scopes, c.created, c.expires],
    rows.map((x) => { const cl = pnClientById(x.clientId); return [vbIdCell(x.id), cl ? pdEscape(cl.name) : "—", cl ? pnAccountCell(cl) : "—", pn(`sessionKind.${x.kind}`), `<span class="badge ${x.status === "ACTIVE" ? "badge-success" : x.status === "USED" ? "badge-info" : "badge-neutral"}">${pn(`sessionStatus.${x.status}`)}</span>`, x.scopes.length, x.createdAt, x.expiresAt || "—"]; }),
    pn("sessions.empty")
  );
  return `<div class="profile-flat-block">
    ${flatSection(pn("auth.title"), `<p class="table-cell-muted pn-intro">${pn("auth.intro")}</p><div class="pn-modes">${modes}</div><div class="pn-block-title pn-flow-title">${pn("auth.flowTitle")}</div>${flow}<div class="pn-save-row"><button type="button" class="btn-primary" id="pn-auth-save"${dirty ? "" : " disabled"}>${pn("auth.save")}</button></div>`)}
    ${flatSection(`${pn("sessions.title")} · ${rows.length}`, `<p class="table-cell-muted pn-intro">${pn("sessions.intro")}</p>${sessions}`)}
  </div>`;
}

// ---- Вкладка «Платежи» ---------------------------------------------------------------------------------------------
function pnPaymentsDirty(s, d) {
  return d.exchangeMode !== s.exchange.mode || d.manual !== s.exchange.manual || PN_CHANNELS.some((c) => d.channels[c] !== s.channels[c]);
}

function pnPayments(s) {
  const d = pnDraftFor(s);
  const channels = PN_CHANNELS.map((c) => `<label class="pn-switch-row pn-channel"><input type="checkbox" data-pn-ch="${c}"${d.channels[c] ? " checked" : ""} /><span><strong>${pn(`channels.${c}.title`)}</strong><br><span class="table-cell-muted">${pn(`channels.${c}.text`)}</span></span></label>`).join("");
  const exchange = ["NONE", "CORPORATE_ACCOUNT", "WITHDRAWAL"].map((m) => `<label class="pn-mode${d.exchangeMode === m ? " is-active" : ""}"><input type="radio" name="pn-ex" data-pn-ex="${m}"${d.exchangeMode === m ? " checked" : ""} /><div><div class="pn-mode-title">${pn(`exchange.${m}.title`)}</div><div class="table-cell-muted">${pn(`exchange.${m}.text`)}</div></div></label>`).join("");
  const account = s.corporateAccount ? `<span class="vb-mono">${s.corporateAccount.number}</span> <span class="table-cell-muted">${s.corporateAccount.currency}</span>` : `<span class="table-cell-muted">${pn("exchange.noAccount")}</span>`;
  const manual = d.exchangeMode === "NONE" ? "" : `<label class="pn-switch-row pn-manual"><input type="checkbox" id="pn-manual"${d.manual ? " checked" : ""} /><span><strong>${pn("exchange.manual")}</strong><br><span class="table-cell-muted">${pn("exchange.manualHint")}</span></span></label>`;
  const dirty = pnPaymentsDirty(s, d);
  return `<div class="client-detail-grid">
    <div class="client-detail-grid-main"><div class="profile-flat-block">
      ${flatSection(pn("channels.title"), `<p class="table-cell-muted pn-intro">${pn("channels.intro")}</p>${channels}`)}
      ${flatSection(pn("exchange.title"), `<p class="table-cell-muted pn-intro">${pn("exchange.intro")}</p><div class="pn-modes pn-modes-3">${exchange}</div>${manual}<div class="pn-account-row"><span class="table-cell-muted">${pn("exchange.account")}</span>${account}</div><div class="pn-save-row"><button type="button" class="btn-primary" id="pn-pay-save"${dirty ? "" : " disabled"}>${pn("channels.save")}</button></div>`)}
    </div></div>
    <div class="client-detail-grid-side">${sectionCard(pn("channels.limitsTitle"), `<p class="table-cell-muted">${pn("channels.limitsText")}</p>`)}</div>
  </div>`;
}

// ---- Вкладка «Клиенты» ---------------------------------------------------------------------------------------------
function pnClients(s) {
  const rows = pnClientsOf(s.id);
  const c = pn("columns");
  const table = vbMiniTable(
    [c.client, c.email, c.account, c.kyc, c.status, c.registered, c.lastLogin],
    rows.map((x) => [pnClientCell(x), pdEscape(x.email), pnAccountCell(x), pnKycBadge(x), `<span class="badge ${x.status === "ACTIVE" ? "badge-success" : "badge-danger"}">${pn(`clientStatus.${x.status}`)}</span>`, x.registeredAt, x.lastLoginAt]),
    pn("clients.empty")
  );
  return `<div class="profile-flat-block">${flatSection(`${pn("clients.title")} · ${rows.length}`, `<p class="table-cell-muted pn-intro">${pn("clients.intro")}</p>${table}`)}</div>`;
}

// ---- Вкладка «Операции» (документ, разделы 4-5: депозиты и выплаты по СБП, у сервиса и у всех его клиентов) --------
function pnOperations(s) {
  const c = pn("columns");
  const deposits = pnDepositsOfService(s.id).sort((a, b) => b.createdDate - a.createdDate);
  const payments = pnPaymentsOfService(s.id).sort((a, b) => b.createdDate - a.createdDate);
  const depTable = vbMiniTable(
    [c.client, c.depCost, c.depAmount, c.depFee, c.status, c.created],
    deposits.map((d) => { const cl = pnClientById(d.clientId); return [cl ? pnClientCell(cl) : "—", tfNum(d.cost, "RUB"), `${d.amount} RUB`, `${d.totalFee} RUB`, pnDepositStatusBadge(d.status), d.createdAt]; }),
    pn("operations.noDeposits")
  );
  const payTable = vbMiniTable(
    [c.client, c.paySource, c.payTotal, c.payBank, c.status, c.created],
    payments.map((p) => { const cl = pnClientById(p.clientId); return [cl ? pnClientCell(cl) : "—", `${p.sourceAmount} RUB`, `${p.totalAmount} RUB`, pdEscape(p.bankName), pnPaymentStatusBadge(p.status), p.createdAt]; }),
    pn("operations.noPayments")
  );
  if (!s.channels.SBP) return `<div class="profile-flat-block">${flatSection(pn("operations.title"), `<div class="table-cell-muted">${pn("operations.sbpDisabled")}</div>`)}</div>`;
  return `<div class="profile-flat-block">
    ${flatSection(`${pn("operations.deposits")} · ${deposits.length}`, `<p class="table-cell-muted pn-intro">${pn("operations.depositsIntro")}</p>${depTable}`)}
    ${flatSection(`${pn("operations.payments")} · ${payments.length}`, `<p class="table-cell-muted pn-intro">${pn("operations.paymentsIntro")}</p>${payTable}`)}
  </div>`;
}

// ---- Вкладка «Вебхуки» ----------------------------------------------------------------------------------------------
function pnWebhookStatus(w) {
  if (w.isActive) return `<span class="badge badge-success">${pn("webhooks.on")}</span>`;
  return w.disabledReason ? `<span class="badge badge-danger" title="${escapeAttr(pn("webhooks.retryHint"))}">${pn(`webhooks.reason.${w.disabledReason}`)}</span>` : `<span class="badge badge-neutral">${pn("webhooks.off")}</span>`;
}

function pnWebhooks(s) {
  const rows = pnWebhooksOf(s.id);
  const c = pn("columns");
  const table = vbMiniTable(
    [c.url, c.events, c.status, c.created, ""],
    rows.map((w) => [`<div class="identity-cell"><span class="vb-mono">${pdEscape(w.url)}</span>${w.description ? `<span class="table-cell-muted">${pdEscape(w.description)}</span>` : ""}</div>`, `<span title="${escapeAttr(w.events.join("\n"))}">${pn("webhooks.eventsCount")(w.events.length)}</span>`, pnWebhookStatus(w), w.createdAt, rowKebabMenu(`pn-wh-${w.id}`, [{ label: pn("webhooks.edit"), icon: EDIT_ICON_SVG, attrs: `data-pn-wh-edit="${w.id}"` }, ...(w.isActive ? [] : [{ label: pn("webhooks.enable"), icon: CHECK_ICON_SVG, attrs: `data-pn-wh-on="${w.id}"` }]), { label: pn("webhooks.delete"), icon: TRASH_ICON_SVG, danger: true, attrs: `data-pn-wh-del="${w.id}"` }])]),
    pn("webhooks.empty")
  );
  const add = `<button type="button" class="btn-secondary pn-add-btn" data-pn-add="webhook">${PLUS_ICON_SVG}<span>${pn("webhooks.add")}</span></button>`;
  const rules = `<ul class="pn-rules">${pn("webhooks.rules").map((r) => `<li>${r}</li>`).join("")}</ul>`;
  return `<div class="client-detail-grid">
    <div class="client-detail-grid-main"><div class="profile-flat-block">${flatSection(`${pn("webhooks.title")} · ${rows.length}`, `<p class="table-cell-muted pn-intro">${pn("webhooks.intro")}</p>${table}`, null, null, add)}</div></div>
    <div class="client-detail-grid-side">${sectionCard(pn("webhooks.rulesTitle"), rules)}</div>
  </div>`;
}

function pnOpenWebhook(s, w) {
  const f = pn("webhooks.form");
  const eventRow = (ev, group) => {
    const allowed = s.scopes.includes(group.scope);
    return `<label class="rt-client${allowed ? "" : " is-disabled"}"><input type="checkbox" value="${ev}"${w && w.events.includes(ev) ? " checked" : ""}${allowed ? "" : " disabled"} /><span class="vb-mono">${ev}</span></label>`;
  };
  const groups = PN_EVENT_GROUPS.map((g) => `<div class="pn-ev-group"><div class="pn-ev-title">${pn(`eventGroups.${g.id}`)}${s.scopes.includes(g.scope) ? "" : `<span class="table-cell-muted"> · ${f.needScope(g.scope)}</span>`}</div>${g.events.map((ev) => eventRow(ev, g)).join("")}</div>`).join("");
  vbOpenForm({
    title: w ? f.editTitle : f.addTitle,
    width: 620,
    fieldsHtml: `${vbInput("pn-wh-url", `${f.url} *`, w ? w.url : "", 'placeholder="https://"')}${vbInput("pn-wh-secret", w ? f.secretEdit : `${f.secret} *`, "", 'type="password" autocomplete="new-password"')}<p class="table-cell-muted pn-hint">${f.secretHint}</p>${vbInput("pn-wh-desc", f.description, w ? w.description : "")}
      <label class="rt-client pn-active"><input type="checkbox" id="pn-wh-active"${!w || w.isActive ? " checked" : ""} /><span>${f.active}</span></label>
      <div class="filters-field vb-field"><span class="filters-field-label">${f.events} *</span><div class="rt-clients pn-events">${groups}</div></div>`,
    submitLabel: w ? vt("common.save") : vt("common.create"),
    onSubmit: (el) => {
      const url = el.querySelector("#pn-wh-url").value.trim();
      const secret = el.querySelector("#pn-wh-secret").value;
      const events = [...el.querySelectorAll(".pn-events input:checked")].map((i) => i.value);
      if (!url.toLowerCase().startsWith("https:") || !pnIsUrl(url)) return f.errors.url;
      if (!w && secret.length < 8) return f.errors.secret;
      if (w && secret && secret.length < 8) return f.errors.secret;
      if (!events.length) return f.errors.events;
      const description = el.querySelector("#pn-wh-desc").value.trim();
      const isActive = el.querySelector("#pn-wh-active").checked;
      closeModal();
      requireAdmin2fa("partner_manage", () => {
        if (w) Object.assign(w, { url, events, description, isActive, disabledReason: isActive ? null : w.disabledReason });
        else PN_WEBHOOKS.unshift({ id: pnUuid(4000 + PN_WEBHOOKS.length), serviceId: s.id, url, events, description, isActive, disabledReason: null, createdAt: formatDateTime(pdNow()) });
        showToast(pn("saved"));
        render();
      });
      return null;
    },
  });
}

// ---- Вкладка «2FA» -------------------------------------------------------------------------------------------------
function pnTwofa(s) {
  const d = pnDraftFor(s);
  const dirty = d.twofa !== s.twofa.enabled;
  const body = `<p class="table-cell-muted pn-intro">${pn("twofa.intro")}</p>
    <label class="pn-switch-row"><input type="checkbox" id="pn-twofa"${d.twofa ? " checked" : ""} /><span><strong>${pn("twofa.enable")}</strong><br><span class="table-cell-muted">${pn("twofa.enableHint")}</span></span></label>
    <div class="pn-note">${d.twofa ? pn("twofa.onNote") : pn("twofa.offNote")}</div>
    <div class="pn-save-row"><button type="button" class="btn-primary" id="pn-twofa-save"${dirty ? "" : " disabled"}>${pn("twofa.save")}</button></div>`;
  const side = `<p class="table-cell-muted">${pn("twofa.contract")}</p><p class="table-cell-muted">${pn("twofa.later")}</p>`;
  return `<div class="client-detail-grid"><div class="client-detail-grid-main"><div class="profile-flat-block">${flatSection(pn("twofa.title"), body)}</div></div><div class="client-detail-grid-side">${sectionCard(pn("twofa.sideTitle"), side)}</div></div>`;
}

// ---- Обработчики вкладок ------------------------------------------------------------------------------------------
function pnBindTab(s, root) {
  root.querySelectorAll("[data-pn-add]").forEach((b) => b.addEventListener("click", () => {
    const kind = b.dataset.pnAdd;
    if (kind === "webhook") pnOpenWebhook(s, null);
    else pnOpenAddValue(s, kind);
  }));
  root.querySelectorAll("[data-pn-del-uri]").forEach((b) => b.addEventListener("click", () => pnRemoveValue(s, "redirectUris", Number(b.dataset.pnDelUri))));
  root.querySelectorAll("[data-pn-del-ip]").forEach((b) => b.addEventListener("click", () => pnRemoveValue(s, "allowedIps", Number(b.dataset.pnDelIp))));
  root.querySelectorAll("[data-pn-action2='reissue']").forEach((b) => b.addEventListener("click", () => vbConfirm({
    title: pn("secret.confirmTitle"), text: pn("secret.confirmText"), confirmLabel: pn("secret.reissue"), danger: true,
    onConfirm: () => requireAdmin2fa("partner_manage", () => { s.secretIssuedAt = formatDateTime(pdNow()); pnShowSecret(s, pnSecret(), false); }),
  })));
  root.querySelectorAll("[data-pn-wh-edit]").forEach((b) => b.addEventListener("click", () => pnOpenWebhook(s, PN_WEBHOOKS.find((w) => w.id === b.dataset.pnWhEdit))));
  root.querySelectorAll("[data-pn-wh-on]").forEach((b) => b.addEventListener("click", () => {
    const w = PN_WEBHOOKS.find((x) => x.id === b.dataset.pnWhOn);
    vbConfirm({ title: pn("webhooks.enableTitle"), text: pn("webhooks.enableText")(pdEscape(w.url)), confirmLabel: pn("webhooks.enable"), onConfirm: () => requireAdmin2fa("partner_manage", () => { w.isActive = true; w.disabledReason = null; showToast(pn("saved")); render(); }) });
  }));
  root.querySelectorAll("[data-pn-wh-del]").forEach((b) => b.addEventListener("click", () => {
    const w = PN_WEBHOOKS.find((x) => x.id === b.dataset.pnWhDel);
    vbConfirm({ title: pn("webhooks.deleteTitle"), text: pn("webhooks.deleteText")(pdEscape(w.url)), confirmLabel: pn("webhooks.delete"), danger: true, onConfirm: () => requireAdmin2fa("partner_manage", () => { PN_WEBHOOKS.splice(PN_WEBHOOKS.indexOf(w), 1); showToast(pn("saved")); render(); }) });
  }));
  const redraw = () => pnRefresh(s);
  root.querySelectorAll("input[name='pn-mode']").forEach((r) => r.addEventListener("change", () => { pnDraftFor(s).authMode = r.value; redraw(); }));
  const authSave = root.querySelector("#pn-auth-save");
  if (authSave) authSave.addEventListener("click", () => requireAdmin2fa("partner_manage", () => { s.authMode = pnDraftFor(s).authMode; s.updatedAt = formatDateTime(pdNow()); showToast(pn("saved")); render(); }));
  root.querySelectorAll("[data-pn-ch]").forEach((i) => i.addEventListener("change", () => { pnDraftFor(s).channels[i.dataset.pnCh] = i.checked; redraw(); }));
  root.querySelectorAll("[data-pn-ex]").forEach((i) => i.addEventListener("change", () => { pnDraftFor(s).exchangeMode = i.dataset.pnEx; redraw(); }));
  const manual = root.querySelector("#pn-manual");
  if (manual) manual.addEventListener("change", () => { pnDraftFor(s).manual = manual.checked; redraw(); });
  const paySave = root.querySelector("#pn-pay-save");
  if (paySave) paySave.addEventListener("click", () => {
    const d = pnDraftFor(s);
    if (d.exchangeMode === "CORPORATE_ACCOUNT" && !s.corporateAccount) { showToast(pn("exchange.needAccount")); return; }
    requireAdmin2fa("partner_manage", () => { s.channels = { ...d.channels }; s.exchange = { mode: d.exchangeMode, manual: d.manual }; showToast(pn("saved")); render(); });
  });
  const tf = root.querySelector("#pn-twofa");
  if (tf) tf.addEventListener("change", () => { pnDraftFor(s).twofa = tf.checked; redraw(); });
  const tfSave = root.querySelector("#pn-twofa-save");
  if (tfSave) tfSave.addEventListener("click", () => requireAdmin2fa("partner_manage", () => { s.twofa.enabled = pnDraftFor(s).twofa; showToast(pn("saved")); render(); }));
}

function pnOpenAddValue(s, kind) {
  const f = pn("access");
  const isUri = kind === "uri";
  vbOpenForm({
    title: isUri ? f.addUriTitle : f.addIpTitle,
    fieldsHtml: vbInput("pn-value", isUri ? f.redirectUris : f.ips, "", isUri ? 'placeholder="https://"' : 'placeholder="203.0.113.10"'),
    submitLabel: pn("access.add"),
    onSubmit: (el) => {
      const v = el.querySelector("#pn-value").value.trim();
      if (isUri ? !pnIsUrl(v) : !pnIsIp(v)) return isUri ? pn("form.errors.uris") : pn("form.errors.ips");
      const list = isUri ? s.redirectUris : s.allowedIps;
      if (list.includes(v)) return f.duplicate;
      closeModal();
      requireAdmin2fa("partner_manage", () => { list.push(v); showToast(pn("saved")); render(); });
      return null;
    },
  });
}

function pnRemoveValue(s, field, index) {
  const value = s[field][index];
  vbConfirm({
    title: pn("access.removeTitle"), text: pn("access.removeText")(pdEscape(value)), confirmLabel: pn("remove"), danger: true,
    onConfirm: () => requireAdmin2fa("partner_manage", () => { s[field].splice(index, 1); showToast(pn("saved")); render(); }),
  });
}


// ---- Карточка партнёрского клиента: его данные, KYC, привязанный аккаунт, счета, операции и сессии ----------------
function pnKycBlock(c) {
  const f = pn("fields");
  const cls = PN_KYC_STATUS_BADGE_CLS[c.kycStatus] || "badge-neutral";
  return `<div class="profile-fields profile-fields-grid">
    ${detailField(f.kycLevel, c.kycLevel ? pn("kycLevel")(c.kycLevel) : "—")}
    ${detailField(f.kycStatus, `<span class="badge ${cls}">${pn(`kyc.status.${c.kycStatus}`)}</span>`)}
  </div><p class="table-cell-muted pn-hint">${pn("kyc.hint")}</p>`;
}

// Счета партнёрского клиента — те же счета, что и у привязанной реальной записи платформы (см. вкладку "Счета" в
// карточке обычного клиента, views/clients-users.js): id, баланс, валюты, статус, клик по ID ведёт на страницу счёта
function pnAccountsBlock(c) {
  const accounts = pnAccountsOfClient(c);
  const col = pn("columns");
  return vbMiniTable(
    [col.accId, col.accBalance, col.accCurrencies, col.status],
    accounts.map((a) => [vbLink(accHref(a), a.code), vabsAccountBalanceCell(a.balances), vabsAccountCurrenciesCell(a.balances), accStatusBadge(a.status)]),
    pn("accounts.empty")
  );
}

function viewPartnerUserDetail(id) {
  const c = pnClientById(id);
  if (!c) return vbNotFound();
  const f = pn("fields");
  const svc = pnById(c.serviceId);
  const deposits = pnDepositsOfClient(c.id).sort((a, b) => b.createdDate - a.createdDate);
  const payments = pnPaymentsOfClient(c.id).sort((a, b) => b.createdDate - a.createdDate);
  const sessions = pnSessionsOf(c.serviceId).filter((s) => s.clientId === c.id).sort((a, b) => b.createdDate - a.createdDate);
  const col = pn("columns");
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, c.id)}${detailField(f.email, pdEscape(c.email))}
    ${detailField(f.service, svc ? vbLink(`#/clients-partners/${svc.id}`, pdEscape(svc.name)) : "—")}
    ${detailField(f.status, `<span class="badge ${c.status === "ACTIVE" ? "badge-success" : "badge-danger"}">${pn(`clientStatus.${c.status}`)}</span>`)}
    ${detailField(f.registered, c.registeredAt)}${detailField(f.lastLogin, c.lastLoginAt)}
  </div>`;
  const depTable = vbMiniTable(
    [col.depCost, col.depAmount, col.depFee, col.status, col.created],
    deposits.map((d) => [tfNum(d.cost, "RUB"), `${d.amount} RUB`, `${d.totalFee} RUB`, pnDepositStatusBadge(d.status), d.createdAt]),
    pn("operations.noDeposits")
  );
  const payTable = vbMiniTable(
    [col.paySource, col.payTotal, col.payBank, col.status, col.created],
    payments.map((p) => [`${p.sourceAmount} RUB`, `${p.totalAmount} RUB`, pdEscape(p.bankName), pnPaymentStatusBadge(p.status), p.createdAt]),
    pn("operations.noPayments")
  );
  const opsBlock = `<div class="profile-flat-section-desc">${pn("operations.depositsIntro")}</div>${depTable}
    <div class="profile-flat-section-desc">${pn("operations.paymentsIntro")}</div>${payTable}`;
  const sessTable = vbMiniTable(
    [col.session, col.kind, col.status, col.scopes, col.created, col.expires],
    sessions.map((x) => [vbIdCell(x.id), pn(`sessionKind.${x.kind}`), `<span class="badge ${x.status === "ACTIVE" ? "badge-success" : x.status === "USED" ? "badge-info" : "badge-neutral"}">${pn(`sessionStatus.${x.status}`)}</span>`, x.scopes.length, x.createdAt, x.expiresAt || "—"]),
    pn("sessions.empty")
  );
  const accounts = pnAccountsOfClient(c);
  return `<div id="pn-user-root">
    ${vbDetailHeader({ backHash: svc ? `#/clients-partners/${svc.id}` : "#/clients-partners", title: pdEscape(c.name), badges: `<span class="badge ${c.status === "ACTIVE" ? "badge-success" : "badge-danger"}">${pn(`clientStatus.${c.status}`)}</span>`, subtitle: vbIdSubtitle(c.id, [pdEscape(c.email), c.registeredAt]) })}
    <div class="client-detail-grid">
      <div class="client-detail-grid-main"><div class="profile-flat-block">
        ${flatSection(pn("users.detail.general"), main)}
        ${flatSection(`${pn("accounts.title")} · ${accounts.length}`, pnAccountsBlock(c))}
        ${svc && svc.channels.SBP ? flatSection(`${pn("operations.title")} · ${deposits.length + payments.length}`, opsBlock) : ""}
      </div></div>
      <div class="client-detail-grid-side">${sectionCard(pn("kyc.title"), pnKycBlock(c))}${sectionCard(`${pn("sessions.title")} · ${sessions.length}`, sessTable, "is-collapsed")}</div>
    </div>
  </div>`;
}

function initPartnerUserDetail(id) {
  const c = pnClientById(id);
  const root = document.getElementById("pn-user-root");
  if (!c || !root) return;
  vbAttachCommon(root);
}
