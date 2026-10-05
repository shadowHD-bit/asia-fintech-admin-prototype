/* ==========================================================================
   "Безопасность → Аудит-логи": таблица событий и страница каждого события.
   Спецификация: docs/security-audit-logs-spec.md; данные —
   assets/mock/security-audit-logs.mock.js (тип AuditLog сервиса audit-log).
   Журнал только для чтения. Порядок: от новых к старым (сортировки в реальном
   запросе нет). Список построен на заготовке createAccessList
   (views/settings-access.js): поиск, табы, фильтры справа, чипы, пагинация.
   ========================================================================== */

function auEnum(group, value) {
  const dict = t(`audit.enums.${group}`);
  return (dict && value != null && dict[value]) || (value == null ? "" : value);
}

function auEventTitle(row) {
  const a = t("audit");
  if (!row.event || row.event.entity === "DEFAULT") return a.notDescribed;
  return `${auEnum("action", row.event.action)} · ${auEnum("entity", row.event.entity)}`;
}

// Секция как на макете: заголовок, справа краткая сводка, сворачивается
function auSection(title, summary, body, collapsed) {
  return `<div class="card collapsible-card${collapsed ? " is-collapsed" : ""}">
    <button type="button" class="collapsible-card-head" data-collapse-toggle>
      <span class="detail-section-title">${title}</span>
      ${summary ? `<span class="au-sec-summary">${summary}</span>` : ""}
      <span class="collapsible-card-chevron">${ICONS.chevron}</span>
    </button>
    <div class="collapsible-card-body">${body}</div>
  </div>`;
}

function auSeverityBadge(sev) {
  const cls = sev === "CRITICAL" ? "badge-danger" : sev === "WARNING" ? "badge-warning" : "badge-neutral";
  return `<span class="badge ${cls}">${auEnum("severity", sev)}</span>`;
}

function auResultBadge(status) {
  return `<span class="badge ${status === "SUCCESS" ? "badge-success" : "badge-danger"}">${auEnum("result", status)}</span>`;
}

function auActorTypeBadge(type) {
  return `<span class="badge ${type === "ADMIN" ? "badge-info" : "badge-neutral"}">${auEnum("actorType", type)}</span>`;
}

function auShortId(id) {
  return id && id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id || "";
}

function auParseUA(ua) {
  if (!ua) return null;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "Linux";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const version = (ua.match(/(?:Chrome|Version|Edg)\/(\d+)/) || [])[1];
  return `${browser}${version ? ` ${version}` : ""} (${os})`;
}

function auActorLabel(row) {
  const s = row.actor.snapshot || {};
  return s.name || s.email || t("audit.unknownActor");
}

// Куда вести по типу затронутой сущности (только там, где есть карточка)
function auEntityHash(type, id) {
  if (!id) return null;
  if (type === "Payment" && OPERATIONS_PAYMENTS_MOCK.some((p) => p.id === id)) return `#/operations-payments/${id}`;
  if (type === "UserAccount" && CLIENTS_USERS_MOCK.some((u) => u.id === id)) return `#/clients-users/${id}`;
  if (type === "Role" && ACCESS_ROLES.some((r) => r.id === id)) return `#/settings-access/role/${id}`;
  if (type === "Admin" && ACCESS_ADMINS.some((a) => a.id === id)) return `#/settings-access/admin/${id}`;
  return null;
}

function auActorHash(actor) {
  if (actor.type === "ADMIN") return auEntityHash("Admin", actor.id);
  if (actor.type === "USER") return auEntityHash("UserAccount", actor.id);
  return null;
}

// Код затронутой сущности (USR-.../PAY-... и т.п.) — только там, где у сущности уже есть entity.code
// (Admin/Role его пока не завели), иначе то же усечение id, что и раньше
function auEntityCode(type, id) {
  if (!id) return auShortId(id);
  if (type === "Payment") {
    const p = OPERATIONS_PAYMENTS_MOCK.find((x) => x.id === id);
    if (p) return p.code;
  }
  if (type === "UserAccount") {
    const u = CLIENTS_USERS_MOCK.find((x) => x.id === id);
    if (u) return u.code;
  }
  return auShortId(id);
}

function auActorCode(actor) {
  if (actor.type === "USER") {
    const u = CLIENTS_USERS_MOCK.find((x) => x.id === actor.id);
    if (u) return u.code;
  }
  return auShortId(actor.id);
}

function auUnique(getter) {
  return [...new Set(AUDIT_LOGS_MOCK.map(getter).filter((v) => v != null && v !== ""))];
}

// ---- Список -----------------------------------------------------------------------------
const AU_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const auditLogsList = createAccessList({
  key: "audit",
  data: () => AUDIT_LOGS_MOCK,
  searchPlaceholder: () => t("audit.search"),
  // как в реальном search: по полям самой записи (correlation, актор и его
  // снимок, объект/владелец, IP/origin/geo, request/session id, цель, user-agent);
  // по названию события/категории/паттерну бэкенд НЕ ищет — они в таблице цели
  searchText: (r) =>
    [r.correlationId, r.actor.id, r.actor.snapshot && r.actor.snapshot.email, r.actor.snapshot && r.actor.snapshot.name, r.actor.snapshot && r.actor.snapshot.role, r.source, r.affectedEntity && r.affectedEntity.id, r.affectedEntity && r.affectedEntity.ownerId,
      r.context.ipAddress, r.context.origin, r.context.geo && `${r.context.geo.country} ${r.context.geo.city}`, r.context.requestId, r.context.sessionId, r.auditTargetId, r.context.userAgent]
      .filter(Boolean)
      .join(" "),
  tab: { get: (r) => r.actor.type, values: ["USER", "ADMIN", "SYSTEM"], label: (v) => t(`audit.tabs.${v}`) },
  filters: [
    { id: "created", kind: "date", label: () => t("audit.filters.period"), get: (r) => r.createdDate },
    { id: "category", kind: "multi", label: () => t("audit.filters.category"), get: (r) => (r.event ? r.event.category : ""), options: () => auUnique((r) => r.event && r.event.category).map((v) => ({ value: v, label: auEnum("category", v) })) },
    { id: "entity", kind: "multi", label: () => t("audit.filters.entity"), get: (r) => (r.event ? r.event.entity : ""), options: () => auUnique((r) => r.event && r.event.entity).map((v) => ({ value: v, label: auEnum("entity", v) })) },
    { id: "action", kind: "multi", label: () => t("audit.filters.action"), get: (r) => (r.event ? r.event.action : ""), options: () => auUnique((r) => r.event && r.event.action).map((v) => ({ value: v, label: auEnum("action", v) })) },
    { id: "severity", kind: "multi", label: () => t("audit.filters.severity"), get: (r) => (r.event ? r.event.severity : ""), options: () => ["INFO", "WARNING", "CRITICAL"].map((v) => ({ value: v, label: auEnum("severity", v) })) },
    { id: "result", kind: "multi", label: () => t("audit.filters.result"), get: (r) => r.result.status, options: () => ["SUCCESS", "FAILURE"].map((v) => ({ value: v, label: auEnum("result", v) })) },
    { id: "source", kind: "multi", label: () => t("audit.filters.source"), get: (r) => r.source, options: () => ["WEB APP", "MOBILE APP", "BACKOFFICE", "TG_BOT"].map((v) => ({ value: v, label: auEnum("source", v) })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: {},
  // Время записи — сортировка в реальном API только createdAt DESC, так и есть.
  // Колонка "Событие" — действие; сущность — в фильтре и в карточке.
  columns: [
    {
      label: () => t("audit.columns.event"),
      html: (r) => `<div class="identity-cell"><div class="identity-cell-primary"><button type="button" class="table-link au-link" data-audit-id="${r.id}">${r.event && r.event.action !== "UNKNOWN" ? auEnum("action", r.event.action) : t("audit.notDescribed")}</button></div><div class="identity-cell-sub"><span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>${vbCodeCell(r.code)}</div></div>`,
    },
    { label: () => t("audit.columns.time"), html: (r) => dateTimeCell(r.createdAt) },
    { label: () => t("audit.columns.category"), html: (r) => (r.event ? auEnum("category", r.event.category) : t("audit.common.noValue")) },
    {
      label: () => t("audit.columns.object"),
      html: (r) => (r.affectedEntity ? `<div class="identity-cell"><span>${auEnum("entity", r.affectedEntity.type)}</span><span class="table-cell-muted au-inline-copy">${auEntityCode(r.affectedEntity.type, r.affectedEntity.id)}${copyIconButton(r.affectedEntity.id)}</span></div>` : t("audit.common.noValue")),
    },
    {
      label: () => t("audit.columns.actor"),
      html: (r) => {
        const s = r.actor.snapshot || {};
        const sub = r.actor.type === "USER" ? s.email || "" : r.actor.type === "ADMIN" ? "" : "";
        return `<div class="identity-cell"><span class="au-actor-line"><span>${pdEscape(auActorLabel(r))}</span>${r.actor.type !== "USER" ? auActorTypeBadge(r.actor.type) : ""}</span>${sub ? `<span class="table-cell-muted">${pdEscape(sub)}</span>` : ""}</div>`;
      },
    },
    { label: () => t("audit.columns.severity"), html: (r) => (r.event ? auSeverityBadge(r.event.severity) : t("audit.common.noValue")) },
    { label: () => t("audit.columns.result"), html: (r) => auResultBadge(r.result.status) },
    { label: () => t("audit.columns.correlation"), html: (r) => `<span class="au-inline-copy vb-mono">${auShortId(r.correlationId)}${copyIconButton(r.correlationId)}</span>` },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll(".au-link").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/security-audit-logs/${b.dataset.auditId}`; }));
  },
});

// ---- Экспорт (CSV / XLSX): то, что показывает список — поиск, таб, фильтры и сортировка, без учёта страницы.
// В реальном API у audit-log выгрузки нет — экспорт клиентский, по загруженным записям. -------------------------------
function openExportAuditModal(format) {
  const x = t("audit.export");
  const count = auditLogsList.exportRows().length;
  const lines = auditLogsList.filterLines();
  const tab = auditLogsList.tabValue();
  if (tab) lines.unshift(`${x.actorType}: ${t(`audit.tabs.${tab}`)}`);
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle,
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(auditLogsList.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); auditLogsList.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportAuditLogs(format); });
    },
  });
}

function exportAuditLogs(format) {
  const x = t("audit.export");
  const list = auditLogsList.exportRows();
  const rows = list.map((r) => {
    const s = r.actor.snapshot || {};
    const ev = r.event;
    return [
      r.code, r.createdAt, ev && r.event.action !== "UNKNOWN" ? auEnum("action", ev.action) : "", ev ? auEnum("category", ev.category) : "",
      r.affectedEntity ? auEnum("entity", r.affectedEntity.type) : "", r.affectedEntity ? auEntityCode(r.affectedEntity.type, r.affectedEntity.id) : "",
      auActorLabel(r), t(`audit.tabs.${r.actor.type}`), s.email || "", ev ? auEnum("severity", ev.severity) : "", auEnum("result", r.result.status),
      r.result.failureReason || "", r.source ? auEnum("source", r.source) : "", r.context.ipAddress || "", r.correlationId,
    ];
  });
  exportTable(`audit_logs_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(list.length));
}

function viewAuditLogs() {
  return `
    <div class="list-hero">${pageHeader(t("audit.title"), t("audit.subtitle"), `${sectionHintBtn("audit-hint-btn", t("audit.info"))}${exportMenuHtml("au-export", t("audit.export.button"), t("audit.export.hint"))}`)}</div>
    ${auditLogsList.view()}
    <p class="table-cell-muted au-retention">${t("audit.retentionNote")}</p>
  `;
}

function initAuditLogs() {
  auditLogsList.init();
  bindExportMenu("au-export", openExportAuditModal);
}

// ---- Страница события -------------------------------------------------------------------------
function currentAuditId() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^security-audit-logs\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function auLinkOrText(text, hash) {
  return hash ? `<button type="button" class="table-link" data-au-hash="${hash}">${text}</button>` : text;
}

function renderAuditChanges(changes) {
  const a = t("audit.detail");
  if (!changes || !changes.changedFields || !changes.changedFields.length) return `<div class="table-cell-muted">${a.noChanges}</div>`;
  const val = (obj, f) => (obj && obj[f] !== undefined ? pdEscape(JSON.stringify(obj[f])) : t("audit.common.noValue"));
  return `<table class="pd-fee-table"><thead><tr><th>${a.changeField}</th><th>${a.changeOld}</th><th>${a.changeNew}</th></tr></thead><tbody>${changes.changedFields
    .map((f) => `<tr><td>${f}</td><td>${val(changes.oldValue, f)}</td><td>${val(changes.newValue, f)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function viewAuditDetail(id) {
  const a = t("audit");
  const d = a.detail;
  const row = AUDIT_LOGS_MOCK.find((r) => r.id === id);

  if (!row) {
    return `${pageHeader(a.notFoundTitle)}
      <div class="empty-state"><div class="empty-state-icon">${ICONS.box}</div>
      <div class="empty-state-title">${a.notFoundTitle}</div><div class="empty-state-text">${a.notFoundText}</div></div>`;
  }

  const ev = row.event;
  const snap = row.actor.snapshot || {};
  const ctx = row.context;
  const risk = row.metadata && row.metadata.riskAssessment;
  const relatedEntities = (row.metadata && row.metadata.relatedEntities) || [];
  // связанные записи — тот же запрос auditLogs(correlationIds), текущая запись исключается
  const linked = AUDIT_LOGS_MOCK.filter((r) => r.correlationId === row.correlationId && r.id !== row.id).sort((x, y) => y.createdDate - x.createdDate);
  const ua = auParseUA(ctx.userAgent);
  const nv = t("audit.common.noValue");
  const changed = (row.result.changes && row.result.changes.changedFields) || [];
  const hasContext = !!(ctx.ipAddress || ctx.userAgent || ctx.deviceId || row.source);

  const main = ev
    ? `<div class="profile-fields profile-fields-grid">
        ${detailField(d.fields.date, row.createdAt)}
        ${detailField(d.fields.category, auEnum("category", ev.category))}
        ${detailField(d.fields.entity, auEnum("entity", ev.entity))}
        ${detailField(d.fields.action, auEnum("action", ev.action))}
        ${copyableField(d.fields.pattern, ev.pattern)}
      </div>
      <div class="au-desc"><div class="filters-field-label">${d.fields.description}</div><div>${row.target && row.target.description ? pdEscape(row.target.description) : `<span class="table-cell-muted">${d.noDescription}</span>`}</div></div>`
    : `<div class="table-cell-muted">${d.noEvent}</div>`;

  const who = `<div class="profile-fields profile-fields-grid">
      ${detailField(d.fields.initiator, snap.name ? auLinkOrText(pdEscape(snap.name), auActorHash(row.actor)) : snap.email ? pdEscape(snap.email) : a.unknownActor)}
      ${copyableField(d.fields.identifier, auActorCode(row.actor))}
      ${detailField(d.fields.actorType, auActorTypeBadge(row.actor.type))}
    </div>`;

  const what = row.affectedEntity
    ? `<div class="profile-fields profile-fields-grid">
        ${detailField(d.fields.objectType, auEnum("entity", row.affectedEntity.type))}
        ${copyableField(d.fields.object, row.affectedEntity.id, auLinkOrText(`<span class="vb-mono">${auEntityCode(row.affectedEntity.type, row.affectedEntity.id)}</span>`, auEntityHash(row.affectedEntity.type, row.affectedEntity.id)))}
        ${row.affectedEntity.ownerId ? detailField(d.fields.client, auLinkOrText(`<span class="vb-mono">${auEntityCode("UserAccount", row.affectedEntity.ownerId)}</span>`, auEntityHash("UserAccount", row.affectedEntity.ownerId))) : ""}
      </div>`
    : `<div class="table-cell-muted">${d.noAffected}</div>`;

  const changesBody = renderAuditChanges(row.result.changes);

  const context = hasContext
    ? `<div class="profile-fields profile-fields-grid">
        ${detailField(d.fields.source, auEnum("source", row.source))}
        ${copyableField(d.fields.ip, ctx.ipAddress)}
        ${detailField(d.fields.location, ctx.geo ? `${ctx.geo.country}, ${ctx.geo.city}` : nv)}
        ${detailField(d.fields.device, ua || nv)}
        ${copyableField(d.fields.deviceId, ctx.deviceId)}
      </div>`
    : `<div class="table-cell-muted">${d.noContext}</div>`;

  const result = `<div class="profile-fields">
      ${detailField(d.fields.status, auResultBadge(row.result.status))}
      ${detailField(d.fields.failureReason, row.result.failureReason ? pdEscape(row.result.failureReason) : nv)}
    </div>`;

  const linkedBody = linked.length
    ? `<div class="pd-feed">${linked.map((r) => `<div class="pd-party"><div><button type="button" class="table-link" data-au-hash="#/security-audit-logs/${r.id}">${auEventTitle(r)}</button><div class="table-cell-muted">${r.createdAt}</div></div>${auResultBadge(r.result.status)}</div>`).join("")}</div>`
    : `<div class="table-cell-muted">${d.noLinked}</div>`;

  const tech = `<div class="profile-fields">
      ${copyableField(d.fields.recordUuid, row.id)}
      ${row.auditTargetId ? copyableField(d.fields.targetId, row.auditTargetId) : detailField(d.fields.targetId, nv)}
      ${detailField(d.fields.publication, row.target ? row.target.type : nv)}
      ${copyableField(d.fields.correlationId, row.correlationId)}
      ${copyableField(d.fields.requestId, ctx.requestId)}
      ${copyableField(d.fields.sessionId, ctx.sessionId)}
    </div>`;

  return `
    <div id="au-root">
      <div class="card client-detail-header cd-hero">
        <button type="button" class="client-detail-back" id="au-back" title="${d.back}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg></button>
        <div class="client-detail-header-main">
          <div class="client-detail-title-row"><span class="page-title">${auEventTitle(row)}</span>${ev ? auSeverityBadge(ev.severity) : ""}${auResultBadge(row.result.status)}</div>
          <div class="client-detail-subtitle"><span>${row.createdAt}</span><span class="client-detail-subtitle-sep">·</span><span class="inline-copy">ID: ${row.code}${copyIconButton(row.code)}</span></div>
        </div>
        <div class="pd-header-tools">${rowKebabMenu("au-menu", [{ label: t("audit.export.pdf"), icon: DOWNLOAD_ICON_SVG, attrs: "data-au-pdf" }])}</div>
      </div>
      <div class="pd-grid">
        <div class="pd-col">
          <div class="profile-flat-block">
            ${flatSection(d.sections.main, main)}
            ${flatSection(d.sections.who, who)}
            ${flatSection(d.sections.what, what)}
            ${flatSection(d.sections.changes, changesBody)}
            ${flatSection(d.sections.context, context)}
          </div>
        </div>
        <div class="pd-col">
          ${auSection(d.sections.result, "", result)}
          ${auSection(d.sections.linked, linked.length ? String(linked.length) : d.noData, linkedBody, true)}
          ${risk ? auSection(d.sections.risk, "", `<div class="profile-fields">
            ${detailField(d.fields.riskLevel, `<span class="badge ${riskLevelBadgeClass(risk.level)}">${riskLevelLabel(risk.level)}</span>`)}
            ${detailField(d.fields.riskScore, risk.score)}
            ${detailField(d.fields.riskSource, risk.source)}
            ${detailField(d.fields.riskFlags, `<div class="ac-badges">${risk.flags.map((f) => `<span class="badge badge-warning">${f}</span>`).join("")}</div>`)}
          </div>`, true) : ""}
          ${relatedEntities.length ? auSection(d.sections.related, String(relatedEntities.length), `<div class="pd-feed">${relatedEntities.map((e) => `<div class="pd-party"><div><div>${auLinkOrText(pdEscape(e.name || e.id), auEntityHash(e.type, e.id))}</div><div class="table-cell-muted">${auEnum("entity", e.type)} · ${auShortId(e.id)}</div></div></div>`).join("")}</div>`, true) : ""}
          ${auSection(d.sections.tech, "", tech, true)}
        </div>
      </div>
    </div>`;
}

// PDF карточки события: всё содержимое страницы (в том числе свёрнутые секции) в печатной версии
function exportAuditDetailPdf(row) {
  const grid = document.querySelector("#au-root .pd-grid");
  if (!grid) return;
  const ev = row.event;
  const name = auEventTitle(row);
  const meta = `${auResultBadge ? auEnum("result", row.result.status) : ""} · ${row.createdAt} · ${row.code}${ev ? ` · ${auEnum("severity", ev.severity)}` : ""}`;
  const body = grid.outerHTML.replace(/is-collapsed/g, "");
  exPrintHtml(exPdfHtml(`${name} | ${row.code}`, name, meta, body), `${name} | ${row.code}`);
}

function initAuditDetail() {
  const pdfBtn = document.querySelector("[data-au-pdf]");
  if (pdfBtn) {
    const row = AUDIT_LOGS_MOCK.find((r) => r.id === currentAuditId());
    if (row) pdfBtn.addEventListener("click", () => exportAuditDetailPdf(row));
  }
  const back = document.getElementById("au-back");
  if (back) back.addEventListener("click", () => { window.location.hash = "#/security-audit-logs"; });
  const root = document.getElementById("au-root");
  if (!root) return;
  root.querySelectorAll(".collapsible-card-head").forEach((btn) => btn.addEventListener("click", () => btn.closest(".collapsible-card").classList.toggle("is-collapsed")));
  root.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => btn.addEventListener("click", () => copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn))));
  root.querySelectorAll(".copy-target").forEach((el) => el.addEventListener("click", () => copyTextToClipboard(el.dataset.copyText).then(() => { el.classList.add("is-copied"); setTimeout(() => el.classList.remove("is-copied"), 900); })));
  root.querySelectorAll("[data-au-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.auHash; }));
}
