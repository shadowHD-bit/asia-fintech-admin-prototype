/* ==========================================================================
   "Операции → ОТС сделки": список всех OTC-сделок платформы и страница каждой сделки.
   Модель — VabsOtcDeal (core-feature-dev_bank_core, модуль OTC): продавец продаёт base-валюту покупателю за quote-валюту
   по своей цене; покупатель подтверждает или отклоняет, продавец может отменить. Админские ручки: vabsGetAdminOtcDeals,
   vabsGetAdminOtcDeal, vabsGetAdminOtcStats, vabsForceCancelAdminOtcDeal (только PENDING, причина обязательна),
   vabsExportAdminOtcDealReceiptPdf (только COMPLETED). Данные — assets/mock/otc-deals.mock.js.
   Список построен на заготовке createAccessList (views/settings-access.js), страница — по образцу карточек счёта и платежа.
   ГРАНИЦЫ ПРОТОТИПА: в админском запросе бэкенда фильтры только статус / пользователь / WhiteLabel / поиск; фильтры по типу,
   валютам и периоду, экспорт списка и PDF карточки выполняются на стороне клиента по загруженным сделкам.
   ========================================================================== */

const ot = (path) => t(`operationsOtc.${path}`);

function otcEnum(group, value) {
  const dict = ot(`enums.${group}`);
  return (dict && value != null && dict[value]) || (value == null ? "" : value);
}

function otcStatusBadge(status) {
  const cls = { PENDING: "badge-warning", CONFIRMING: "badge-info", REJECTING: "badge-info", CANCELING: "badge-info", COMPLETED: "badge-success", REJECTED: "badge-danger", CANCELED: "badge-neutral", EXPIRED: "badge-neutral" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${otcEnum("status", status)}</span>`;
}

function otcGroupOf(d) {
  return OTC_ACTIVE_STATUSES.includes(d.status) ? "active" : d.status === "COMPLETED" ? "completed" : "failed";
}

// Суммы: у крипто до 6 знаков после запятой, у фиата 2
function otcMoney(value, ticker) {
  const crypto = ticker === "USDT";
  return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: crypto ? 6 : 2 })} ${ticker}`;
}

function otcPriceText(d) {
  return `1 ${d.baseCurrencyTicker} = ${d.price.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${d.quoteCurrencyTicker}`;
}

function otcNetworkBadge(name) {
  if (!name) return "";
  const net = typeof vbNetworkByName === "function" ? vbNetworkByName(name) : null;
  return net
    ? `<button type="button" class="badge badge-neutral vb-badge-link" data-otc-hash="#/settings-vabs-networks/${net.id}">${pdEscape(name)}</button>`
    : `<span class="badge badge-neutral">${pdEscape(name)}</span>`;
}

// Сумма с сетью бейджем и ссылкой на валюту в настройках vABS
function otcAmountLine(value, ticker, network) {
  const cur = typeof vbCurrencyByTicker === "function" ? vbCurrencyByTicker(ticker, network || "FIAT") : null;
  const label = otcMoney(value, ticker);
  const text = cur ? `<button type="button" class="table-link" data-otc-hash="#/settings-vabs-currencies/${cur.id}">${label}</button>` : `<span>${label}</span>`;
  return `<span class="otc-amount">${text}${otcNetworkBadge(network)}</span>`;
}

function otcPartyLink(userId, name) {
  return `<button type="button" class="table-link" data-otc-hash="#/clients-users/${userId}">${pdEscape(name)}</button>`;
}

function otcPartyCell(userId, name, email) {
  return `<div class="identity-cell">${otcPartyLink(userId, name)}<span class="table-cell-muted">${pdEscape(email)}</span></div>`;
}

function otcActorName(d, userId) {
  if (!userId) return "—";
  if (userId === d.sellerUserId) return `${ot("roles.seller")} · ${pdEscape(d.sellerName)}`;
  if (userId === d.buyerUserId) return `${ot("roles.buyer")} · ${pdEscape(d.buyerName)}`;
  const admin = typeof acAdminById === "function" ? acAdminById(userId) : null;
  return admin ? `${ot("roles.admin")} · <button type="button" class="table-link" data-otc-hash="#/settings-access/admin/${admin.id}">${pdEscape(admin.name)}</button>` : `${ot("roles.admin")} · ${pdShort(userId)}`;
}

function otcFinalDate(d) {
  return d.completedAt || d.rejectedAt || d.canceledAt || d.expiredAt || null;
}

function otcUnique(getter) {
  return [...new Map(OTC_DEALS_MOCK.map((d) => [getter(d).value, getter(d)])).values()];
}

// ---- Список -----------------------------------------------------------------------------------
function otcDealCell(d) {
  return `<div class="identity-cell">
    <div class="identity-cell-primary">
      <button type="button" class="table-link" data-otc-open="${d.id}">${pdEscape(d.referenceNumber)}</button>
      ${copyIconButton(d.referenceNumber)}
    </div>
  </div>`;
}

function otcStatusCell(d) {
  let sub = "";
  if (d.status === "PENDING") sub = `<span class="table-cell-muted">${ot("list.until")(d.expiresAt)}</span>`;
  if (otcIsStuck(d)) sub = `<span class="acc-warn">${ot("list.stuck")}</span>`;
  return `<div class="identity-cell">${otcStatusBadge(d.status)}${sub}</div>`;
}

function otcRowMenu(d) {
  const a = ot("actions");
  const items = [
    { action: "pdf", label: a.pdf, icon: DOWNLOAD_ICON_SVG },
    { action: "vabs", label: a.goToOperation, icon: PD_EXTERNAL_LINK_ICON },
    ...(otcCanForceCancel(d) ? [{ action: "forceCancel", label: a.forceCancel, icon: TRASH_ICON_SVG, danger: true }] : []),
  ];
  return rowKebabMenu(`otc-row-${d.id}`, items.map((i) => ({ label: i.label, icon: i.icon, danger: i.danger, attrs: `data-otc-row-action="${i.action}:${d.id}"` })));
}

const otcList = createAccessList({
  key: "otc",
  data: () => OTC_DEALS_MOCK,
  searchPlaceholder: () => ot("search"),
  // как в vabsGetAdminOtcDeals: ILIKE по номеру сделки, почтам сторон и комментарию + точное совпадение id
  searchText: (d) => [d.referenceNumber, d.id, d.sellerEmail, d.buyerEmail, d.comment, d.paymentId].filter(Boolean).join(" "),
  tab: { get: otcGroupOf, values: ["active", "completed", "failed"], label: (v) => ot(`tabs.${v}`) },
  filters: [
    { id: "created", kind: "date", label: () => ot("filters.created"), get: (d) => d.createdDate },
    { id: "status", kind: "multi", label: () => ot("filters.status"), get: (d) => d.status, options: () => OTC_DEAL_STATUSES.map((v) => ({ value: v, label: otcEnum("status", v) })) },
    { id: "type", kind: "multi", label: () => ot("filters.type"), get: (d) => d.type, options: () => OTC_DEAL_TYPES.map((v) => ({ value: v, label: otcEnum("type", v) })) },
    { id: "base", kind: "multi", label: () => ot("filters.base"), get: (d) => d.baseKey, options: () => otcUnique((d) => ({ value: d.baseKey, label: otcAssetText(d.baseKey) })) },
    { id: "quote", kind: "multi", label: () => ot("filters.quote"), get: (d) => d.quoteKey, options: () => otcUnique((d) => ({ value: d.quoteKey, label: otcAssetText(d.quoteKey) })) },
    { id: "fee", kind: "multi", label: () => ot("filters.fee"), get: (d) => (d.fee > 0 ? "yes" : "no"), options: () => ["yes", "no"].map((v) => ({ value: v, label: ot(`feeFilter.${v}`) })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: { created: (a, b) => a.createdDate - b.createdDate, deal: (a, b) => a.referenceNumber.localeCompare(b.referenceNumber), amount: (a, b) => a.amount - b.amount },
  // Одним блоком, как vabsGetAdminOtcStats: всего и разрез по статусам
  metrics: (list) => {
    const m = ot("metrics");
    const stuck = list.filter(otcIsStuck).length;
    return [
      { value: list.length, label: m.total },
      { value: list.filter((d) => d.status === "PENDING").length, label: m.pending },
      { value: list.filter(otcIsTransient).length, label: m.processing, sub: stuck ? `<span class="acc-warn">${m.stuck(stuck)}</span>` : "" },
      { value: list.filter((d) => d.status === "COMPLETED").length, label: m.completed },
      { value: list.filter((d) => OTC_FAILED_STATUSES.includes(d.status)).length, label: m.failed },
    ];
  },
  columns: [
    { label: () => ot("columns.deal"), sort: "deal", html: otcDealCell },
    { label: () => ot("columns.type"), html: (d) => `<span class="badge badge-neutral">${otcEnum("type", d.type)}</span>` },
    { label: () => ot("columns.seller"), html: (d) => otcPartyCell(d.sellerUserId, d.sellerName, d.sellerEmail) },
    { label: () => ot("columns.buyer"), html: (d) => otcPartyCell(d.buyerUserId, d.buyerName, d.buyerEmail) },
    { label: () => ot("columns.amount"), sort: "amount", html: (d) => `<div class="identity-cell"><span class="otc-deal-line">${otcAmountLine(d.amount, d.baseCurrencyTicker, d.baseNetworkName)}<span class="otc-arrow">→</span>${otcAmountLine(d.cost, d.quoteCurrencyTicker, d.quoteNetworkName)}</span><span class="table-cell-muted">${otcPriceText(d)}</span></div>` },
    { label: () => ot("columns.status"), html: otcStatusCell },
    { label: () => ot("columns.created"), sort: "created", html: (d) => dateTimeCell(d.createdAt) },
    { label: () => "", html: (d) => otcRowMenu(d) },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-otc-open]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/operations-otc/${b.dataset.otcOpen}`; }));
    wrap.querySelectorAll("[data-otc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.otcHash; }));
    wrap.querySelectorAll("[data-otc-row-action]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const [action, id] = btn.dataset.otcRowAction.split(":");
        const deal = otcDealById(id);
        if (deal) otcHandleAction(action, deal);
      })
    );
  },
});

function otcAssetText(key) {
  const a = OTC_ASSETS[key];
  return a.network ? `${a.ticker} · ${a.network}` : a.ticker;
}

// ---- Действия -------------------------------------------------------------------------------------
function otcHandleAction(action, deal) {
  if (action === "pdf") requireAdmin2fa("otc_deal_pdf", () => otcExportDealPdf(deal));
  else if (action === "vabs") window.location.hash = `#/settings-vabs-operations/${deal.paymentId}`;
  else if (action === "forceCancel") otcOpenForceCancel(deal);
}

// vabsForceCancelAdminOtcDeal: только PENDING (не истёкшая), причина обязательна, до 500 символов.
// Ответ мутации — статус CANCELING, дальше async-обработка доводит до CANCELED (в прототипе — через пару секунд).
function otcOpenForceCancel(deal) {
  const f = ot("force");
  if (!otcCanForceCancel(deal)) { showToast(f.notAllowed); return; }
  vbOpenForm({
    title: f.title,
    intro: f.intro(pdEscape(deal.referenceNumber)),
    fieldsHtml: vbTextarea("otc-force-reason", f.reason, "", 3),
    submitLabel: f.submit,
    danger: true,
    onSubmit: (el) => {
      const reason = el.querySelector("#otc-force-reason").value.trim();
      if (!reason) return f.errRequired;
      if (reason.length > 500) return f.errLength;
      closeModal();
      requireAdmin2fa("otc_force_cancel", () => {
        const admin = typeof ACCESS_ADMINS !== "undefined" ? ACCESS_ADMINS.find((a) => a.email === CURRENT_ADMIN.email) : null;
        deal.status = "CANCELING";
        deal.cancellationReason = reason;
        deal.canceledBy = admin ? admin.id : CURRENT_ADMIN.email;
        deal.updatedDate = new Date();
        deal.updatedAt = formatDateTime(deal.updatedDate);
        render();
        showToast(f.started);
        setTimeout(() => {
          if (deal.status !== "CANCELING") return;
          deal.status = "CANCELED";
          deal.canceledDate = new Date();
          deal.canceledAt = formatDateTime(deal.canceledDate);
          deal.updatedDate = deal.canceledDate;
          deal.updatedAt = deal.canceledAt;
          render();
          showToast(f.done);
        }, 2500);
      });
    },
  });
}

// ---- Экспорт списка (CSV / XLSX): то, что показывает таблица — поиск, таб, фильтры и сортировка, без учёта страницы -----
function otcExportLines() {
  const lines = otcList.filterLines();
  const tab = otcList.tabValue();
  if (tab) lines.unshift(`${ot("export.group")}: ${ot(`tabs.${tab}`)}`);
  return lines;
}

function openExportOtcModal(format) {
  const x = ot("export");
  const count = otcList.exportRows().length;
  const lines = otcExportLines();
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle,
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(otcList.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); otcList.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); requireAdmin2fa("otc_export", () => exportOtcDeals(format)); });
    },
  });
}

function exportOtcDeals(format) {
  const x = ot("export");
  const list = otcList.exportRows();
  const rows = list.map((d) => [
    d.id, d.referenceNumber, otcEnum("type", d.type), otcEnum("status", d.status),
    d.sellerName, d.sellerEmail, d.buyerName, d.buyerEmail,
    d.amount, d.baseCurrencyTicker, d.baseNetworkName || "", d.price, d.cost, d.quoteCurrencyTicker, d.quoteNetworkName || "", d.fee,
    d.createdAt, d.expiresAt, otcFinalDate(d) || "", d.rejectionReason || d.cancellationReason || "", d.comment || "", d.paymentId,
  ]);
  exportTable(`otc_deals_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(list.length));
}

// ---- Страница списка ----------------------------------------------------------------------------
function viewOperationsOtc() {
  return `<div class="list-hero">${pageHeader(t("nav.operations-otc"), t("navDescriptions.operations-otc"), `${sectionHintBtn("otc-hint-btn", ot("info"))}${exportMenuHtml("otc-export", ot("export.button"), ot("export.hint"))}`)}</div>${otcList.view()}`;
}

function initOperationsOtcView() {
  bindExportMenu("otc-export", openExportOtcModal);
  otcList.init();
}

// ---- Страница сделки ----------------------------------------------------------------------------
function currentOtcDealId() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^operations-otc\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function otcDealMenu(d) {
  const a = ot("actions");
  const items = [
    { label: a.pdf, icon: DOWNLOAD_ICON_SVG, attrs: 'data-otc-action="pdf"' },
    ...(otcCanForceCancel(d) ? [{ label: a.forceCancel, icon: TRASH_ICON_SVG, danger: true, attrs: 'data-otc-action="forceCancel"' }] : []),
  ];
  return rowKebabMenu("otc-head", items);
}

function otcBanners(d) {
  const b = ot("detail.banners");
  let html = "";
  if (otcIsStuck(d)) html += `<div class="card client-block-card"><div class="detail-section-title">${b.stuckTitle}</div><ul class="block-reasons-list"><li>${b.stuckText(otcEnum("status", d.status))}</li></ul></div>`;
  if (d.status === "REJECTED") html += `<div class="card client-block-card"><div class="detail-section-title">${b.rejectedTitle}</div><ul class="block-reasons-list"><li>${pdEscape(d.rejectionReason)}</li></ul></div>`;
  if (d.status === "CANCELED") html += `<div class="card client-block-card"><div class="detail-section-title">${b.canceledTitle}</div><ul class="block-reasons-list"><li>${pdEscape(d.cancellationReason)}</li></ul></div>`;
  if (d.status === "EXPIRED") html += `<div class="card client-block-card"><div class="detail-section-title">${b.expiredTitle}</div><ul class="block-reasons-list"><li>${b.expiredText}</li></ul></div>`;
  return html;
}

function otcTimelineHtml(d) {
  const tl = ot("timeline");
  const rows = otcTimeline(d).map((e) => {
    const title = typeof tl[e.code] === "function" ? tl[e.code](d) : tl[e.code];
    const date = e.date ? formatDateTime(e.date) : ot("detail.until")(d.expiresAt);
    const isFinal = ["completed", "rejected", "canceled", "expired"].includes(e.code);
    return `<li class="otc-tl-item${isFinal ? " is-final" : ""}${e.code === "waiting" ? " is-waiting" : ""}"><span class="otc-tl-dot"></span><div><div class="otc-tl-title">${title}</div><div class="table-cell-muted">${date}</div></div></li>`;
  });
  return `<ul class="otc-tl">${rows.join("")}</ul>`;
}

// ---- Основная часть страницы — как в платежах: сумма → общая информация → стороны → исход → платёж → служебное ----
function otcHeroSection(d) {
  const h = ot("detail.hero");
  const s = ot("detail.sections");
  const side = (label, value, ticker, network) => `<div class="pd-hero-side"><div class="pd-hero-label">${label}</div>
      <div class="pd-hero-amount">${value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: ticker === "USDT" ? 6 : 2 })}<span class="pd-hero-cur">${ticker}</span>${network ? ` <span class="badge badge-neutral">${pdEscape(network)}</span>` : ""}</div></div>`;
  const stat = (label, value) => `<div class="pd-hero-stat"><div class="pd-hero-label">${label}</div><div class="pd-hero-stat-value">${value}</div></div>`;
  return flatSection(
    s.money,
    `<div class="pd-hero">
      <div class="pd-hero-money">
        ${side(h.sells, d.amount, d.baseCurrencyTicker, d.baseNetworkName)}
        <div class="pd-hero-arrow">${PD_ARROW_ICON}</div>
        ${side(h.pays, d.cost, d.quoteCurrencyTicker, d.quoteNetworkName)}
      </div>
      <div class="pd-hero-stats">
        ${stat(h.price, otcPriceText(d))}
        ${stat(h.priceBase, `1 ${d.quoteCurrencyTicker} = ${d.priceInBase.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} ${d.baseCurrencyTicker}`)}
        ${stat(h.fee, d.fee > 0 ? otcMoney(d.fee, d.baseCurrencyTicker) : h.noFee)}
        ${stat(h.sellerHold, otcMoney(d.amount + d.fee, d.baseCurrencyTicker))}
      </div>
    </div>`
  );
}

function otcGeneralSection(d) {
  const f = ot("detail.fields");
  return flatSection(
    ot("detail.sections.general"),
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(f.type, otcEnum("type", d.type))}
      ${copyableField(f.status, otcEnum("status", d.status), otcStatusBadge(d.status))}
      ${copyableField(f.created, d.createdAt)}
      ${copyableField(f.updated, d.updatedAt)}
      ${copyableField(f.expires, d.expiresAt)}
      ${d.comment ? copyableField(f.comment, d.comment) : detailField(f.comment, ot("detail.noValue"))}
    </div>`
  );
}

// Счёт стороны в нашей системе — виртуальный счёт клиента в продаваемой валюте (продавец отдаёт с него, покупатель получает на него)
function otcPartyAccount(userId, ticker) {
  const acc = typeof ensureClientAccount === "function" ? ensureClientAccount(userId, ticker) : null;
  if (!acc) return "";
  return detailField(`${t("paymentDetail.fields.accountNumber")} · ${ticker}`, `<span class="profile-field-value-wrap"><button type="button" class="table-link" data-otc-hash="${accHref(acc)}">${acc.id}</button>${copyIconButton(acc.id)}</span>`);
}

function otcPartiesSection(d) {
  const partyBox = (role, userId, name, ticker, gives, gets) => `<div class="pd-party-box">
      <div class="pd-party-box-label">${ot(`roles.${role}`)}</div>
      <div class="pd-party-box-main">
        <span class="badge badge-neutral">${paymentClientTypeLabel("INDIVIDUAL")}</span>
        ${otcPartyLink(userId, name)}
        <button type="button" class="id-copy" data-copy-value="${userId}" title="${userId}">${COPY_ICON_SVG}</button>
      </div>
      <div class="profile-fields profile-fields-grid profile-fields-grid-1 pd-party-box-extra">
        ${paymentPartyExtraPairs(userId, "INDIVIDUAL")}
        ${otcPartyAccount(userId, ticker)}
        ${detailField(ot("detail.gives"), gives)}
        ${detailField(ot("detail.gets"), gets)}
      </div>
    </div>`;
  return flatSection(
    ot("detail.sections.parties"),
    `<div class="pd-parties-row">
      ${partyBox("seller", d.sellerUserId, d.sellerName, d.baseCurrencyTicker, otcMoney(d.amount + d.fee, d.baseCurrencyTicker), otcMoney(d.cost, d.quoteCurrencyTicker))}
      <div class="pd-parties-arrow">${PD_ARROW_ICON}</div>
      ${partyBox("buyer", d.buyerUserId, d.buyerName, d.baseCurrencyTicker, otcMoney(d.cost, d.quoteCurrencyTicker), otcMoney(d.amount, d.baseCurrencyTicker))}
    </div>`
  );
}

function otcOutcomeSection(d) {
  const f = ot("detail.fields");
  const rows = [];
  if (d.status === "COMPLETED") rows.push(copyableField(f.completedAt, d.completedAt));
  if (d.status === "REJECTED") rows.push(copyableField(f.rejectedAt, d.rejectedAt), detailField(f.rejectedBy, otcActorName(d, d.rejectedBy)), copyableField(f.rejectionReason, d.rejectionReason));
  if (d.status === "CANCELED") rows.push(copyableField(f.canceledAt, d.canceledAt), detailField(f.canceledBy, otcActorName(d, d.canceledBy)), copyableField(f.cancellationReason, d.cancellationReason));
  if (d.status === "EXPIRED") rows.push(copyableField(f.expiredAt, d.expiredAt));
  if (!rows.length) return "";
  return flatSection(ot("detail.sections.outcome"), `<div class="profile-fields profile-fields-grid profile-fields-grid-3">${rows.join("")}</div>`);
}

function otcPaymentSection(d) {
  const f = ot("detail.fields");
  const st = otcPaymentStatus(d);
  return flatSection(
    ot("detail.sections.payment"),
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(f.paymentId, d.paymentId)}
      ${copyableField(f.paymentSystem, "OTC")}
      ${copyableField(f.paymentStatus, paymentStatusLabel(st), `<span class="badge ${paymentStatusBadgeClass(st)}">${paymentStatusLabel(st)}</span>`)}
    </div>`
  );
}

// Служебное: идентификаторы и данные сделки в том виде, как их отдаёт vabsGetAdminOtcDeal
function otcServiceSection(d) {
  const f = ot("detail.fields");
  const raw = {
    id: d.id, referenceNumber: d.referenceNumber, status: d.status, type: d.type,
    sellerUserId: d.sellerUserId, buyerUserId: d.buyerUserId, sellerEmail: d.sellerEmail, buyerEmail: d.buyerEmail,
    baseCurrencyTicker: d.baseCurrencyTicker, quoteCurrencyTicker: d.quoteCurrencyTicker,
    amount: String(d.amount), price: String(d.price), priceInBase: String(d.priceInBase), cost: String(d.cost), fee: String(d.fee),
    comment: d.comment, rejectionReason: d.rejectionReason, cancellationReason: d.cancellationReason, canceledBy: d.canceledBy, rejectedBy: d.rejectedBy,
    whiteLabelId: d.whiteLabelId, paymentId: d.paymentId,
    createdAt: d.createdDate.toISOString(), updatedAt: d.updatedDate.toISOString(), expiresAt: d.expiresDate.toISOString(),
    completedAt: d.completedDate ? d.completedDate.toISOString() : null, rejectedAt: d.rejectedDate ? d.rejectedDate.toISOString() : null,
    canceledAt: d.canceledDate ? d.canceledDate.toISOString() : null, expiredAt: d.expiredDate ? d.expiredDate.toISOString() : null,
  };
  return flatSection(
    ot("detail.sections.service"),
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(f.reference, d.referenceNumber)}
      ${copyableField(f.whiteLabel, d.whiteLabelId)}
    </div>
    <div class="pd-req-subtitle">${ot("detail.dealData")}</div>
    <pre class="pd-json">${pdEscape(JSON.stringify(raw, null, 2))}</pre>`
  );
}

// ---- Комментарии администраторов (только в прототипе: в схеме OTC комментариев к сделке нет) ------------------------------
let otcCommentSeq = 0;
let otcCommentEditingId = null;

function otcCommentRowHtml(cm) {
  const role = eodCommentAuthorRole(cm.adminId);
  const own = cm.adminId === CURRENT_ADMIN.email;
  return `<div class="pd-comment">
    <div class="pd-comment-head">
      <span class="pd-comment-author">${pdEscape(eodCommentAuthorName(cm.adminId))}</span>
      ${own ? `<span class="pd-comment-actions">
        <button type="button" class="icon-btn" data-otc-comment-edit="${cm.id}" title="${vt("common.edit")}">${EDIT_ICON_SVG}</button>
        <button type="button" class="icon-btn icon-btn-danger" data-otc-comment-delete="${cm.id}" title="${vt("common.delete")}">${TRASH_ICON_SVG}</button>
      </span>` : ""}
    </div>
    ${role ? `<div class="pd-comment-role">${pdEscape(role)}</div>` : ""}
    <div class="pd-comment-text">${pdEscape(cm.text)}</div>
    <div class="pd-comment-date pd-comment-date-bottom">${formatDateTime(cm.createdAt)}</div>
  </div>`;
}

function otcCommentEditRowHtml(cm) {
  return `<div class="pd-comment">
    <div class="pd-comment-head"><span class="pd-comment-author">${pdEscape(eodCommentAuthorName(cm.adminId))}</span></div>
    <textarea class="form-textarea vb-field" id="otc-comment-edit-${cm.id}" rows="3">${pdEscape(cm.text)}</textarea>
    <div class="sl-actions">
      <button type="button" class="btn-secondary vb-row-btn" data-otc-comment-cancel="${cm.id}">${vt("common.cancel")}</button>
      <button type="button" class="btn-primary vb-row-btn" data-otc-comment-save="${cm.id}">${vt("common.save")}</button>
    </div>
  </div>`;
}

function otcCommentsCard(d) {
  const c = ot("detail.comments");
  const list = [...(d.comments || [])].sort((a, b) => b.createdAt - a.createdAt);
  const body = list.length
    ? `${otcCommentRowHtml(list[0])}${list.length > 1 ? `<button type="button" class="table-link pd-view-all" data-otc-open-comments>${c.viewAll} (${list.length})</button>` : ""}`
    : `<div class="table-cell-muted">${c.empty}</div>`;
  return sectionCard(
    `${ot("detail.sections.comments")} · ${list.length}`,
    `<div class="kyc-actions-row"><button type="button" class="profile-flat-edit" data-otc-open-comments>${PLUS_ICON_SVG}<span>${c.add}</span></button></div><div class="pd-feed">${body}</div>`
  );
}

function otcCommentsDrawerBodyHtml(d) {
  const list = [...(d.comments || [])].sort((a, b) => b.createdAt - a.createdAt);
  if (!list.length) return `<p class="table-cell-muted">${ot("detail.comments.empty")}</p>`;
  return list.map((cm) => (cm.id === otcCommentEditingId ? otcCommentEditRowHtml(cm) : otcCommentRowHtml(cm))).join("");
}

function otcRerenderComments(d) {
  const bodyEl = document.getElementById("otc-comments-drawer-body");
  if (bodyEl) { bodyEl.innerHTML = otcCommentsDrawerBodyHtml(d); otcBindCommentsBody(d); }
  const side = document.getElementById("otc-comments-slot");
  if (side) {
    side.innerHTML = otcCommentsCard(d);
    otcBindCommentsCard(d);
    side.querySelectorAll(".collapsible-card-head").forEach((btn) => btn.addEventListener("click", () => btn.closest(".collapsible-card").classList.toggle("is-collapsed")));
  }
}

function otcBindCommentsBody(d) {
  const bodyEl = document.getElementById("otc-comments-drawer-body");
  if (!bodyEl) return;
  bodyEl.querySelectorAll("[data-otc-comment-edit]").forEach((b) => b.addEventListener("click", () => { otcCommentEditingId = b.dataset.otcCommentEdit; otcRerenderComments(d); }));
  bodyEl.querySelectorAll("[data-otc-comment-cancel]").forEach((b) => b.addEventListener("click", () => { otcCommentEditingId = null; otcRerenderComments(d); }));
  bodyEl.querySelectorAll("[data-otc-comment-save]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.otcCommentSave;
      const ta = document.getElementById(`otc-comment-edit-${id}`);
      const text = ta ? ta.value.trim() : "";
      if (!text) return;
      const cm = (d.comments || []).find((c) => c.id === id);
      if (cm) cm.text = text;
      otcCommentEditingId = null;
      otcRerenderComments(d);
    })
  );
  bodyEl.querySelectorAll("[data-otc-comment-delete]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.otcCommentDelete;
      const c = ot("detail.comments");
      vbConfirm({ title: c.deleteTitle, text: c.deleteText, confirmLabel: vt("common.delete"), danger: true, onConfirm: () => { d.comments = (d.comments || []).filter((x) => x.id !== id); otcRerenderComments(d); } });
    })
  );
}

function otcCloseCommentsDrawer() {
  const wrap = document.getElementById("otc-comments-drawer-wrap");
  if (!wrap) return;
  const overlay = document.getElementById("otc-comments-overlay");
  const drawer = document.getElementById("otc-comments-drawer");
  if (overlay) overlay.classList.remove("is-open");
  if (drawer) drawer.classList.remove("is-open");
  document.removeEventListener("keydown", otcCommentsEscape);
  document.body.classList.remove("filters-drawer-open");
  otcCommentEditingId = null;
  setTimeout(() => wrap.remove(), 220);
}

function otcCommentsEscape(e) {
  if (e.key === "Escape") otcCloseCommentsDrawer();
}

function otcOpenCommentsDrawer(d) {
  const c = ot("detail.comments");
  otcCommentEditingId = null;
  const wrap = document.createElement("div");
  wrap.id = "otc-comments-drawer-wrap";
  wrap.innerHTML = `
    <div class="filters-drawer-overlay" id="otc-comments-overlay"></div>
    <aside class="filters-drawer" id="otc-comments-drawer">
      <div class="filters-drawer-header">
        <h2 class="filters-drawer-title">${ot("detail.sections.comments")}</h2>
        <button type="button" class="filters-drawer-close" id="otc-comments-close"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg></button>
      </div>
      <div class="filters-drawer-body pd-feed" id="otc-comments-drawer-body">${otcCommentsDrawerBodyHtml(d)}</div>
      <div class="filters-drawer-footer ed-comment-compose">
        <textarea class="form-textarea" id="otc-comments-new" rows="2" placeholder="${c.placeholder}"></textarea>
        <button type="button" class="btn-primary" id="otc-comments-add">${c.add}</button>
      </div>
    </aside>`;
  document.body.appendChild(wrap);
  document.getElementById("otc-comments-close").addEventListener("click", otcCloseCommentsDrawer);
  document.getElementById("otc-comments-overlay").addEventListener("click", otcCloseCommentsDrawer);
  otcBindCommentsBody(d);
  document.getElementById("otc-comments-add").addEventListener("click", () => {
    const ta = document.getElementById("otc-comments-new");
    const text = ta.value.trim();
    if (!text) return;
    otcCommentSeq += 1;
    d.comments = d.comments || [];
    d.comments.push({ id: `${d.id}-c${otcCommentSeq}`, adminId: CURRENT_ADMIN.email, createdAt: pdNow(), text });
    ta.value = "";
    otcRerenderComments(d);
  });
  requestAnimationFrame(() => {
    const o = document.getElementById("otc-comments-overlay");
    const dr = document.getElementById("otc-comments-drawer");
    if (o) o.classList.add("is-open");
    if (dr) dr.classList.add("is-open");
  });
  document.addEventListener("keydown", otcCommentsEscape);
  document.body.classList.add("filters-drawer-open");
}

function otcBindCommentsCard(d) {
  document.querySelectorAll("[data-otc-open-comments]").forEach((b) => b.addEventListener("click", () => otcOpenCommentsDrawer(d)));
}

// ---- Проводки сделки — тот же принцип, что и у платежа/обмена (renderLedgerTable, operations-payment-detail.js):
// продавец отдаёт актив (base) и платит комиссию, покупатель платит (quote). Показываем только для завершённой
// сделки — до этого проводок в учёте ещё нет, есть только блокировка средств продавца (см. "Итог сделки").
function otcLeg(d, order, description, side, amount, currency, acc) {
  const seed = Math.abs(paymentStableHash(`${d.id}:${order}`));
  return { id: seedToPaymentUuid(85000 + (seed % 20000)), code: entityCode("LEG", 85000 + (seed % 20000)), order, description, side, amount, currency, acc: acc || null, status: "COMPLETED", createdAt: d.completedAt || d.createdAt };
}

function otcLedgerLegsFor(d) {
  if (d.status !== "COMPLETED") return [];
  const l = ot("ledger");
  const sellerBase = d.sellerUserId ? ensureClientAccount(d.sellerUserId, d.baseCurrencyTicker) : null;
  const buyerBase = d.buyerUserId ? ensureClientAccount(d.buyerUserId, d.baseCurrencyTicker) : null;
  const sellerQuote = d.sellerUserId ? ensureClientAccount(d.sellerUserId, d.quoteCurrencyTicker) : null;
  const buyerQuote = d.buyerUserId ? ensureClientAccount(d.buyerUserId, d.quoteCurrencyTicker) : null;
  let order = 0;
  const legs = [otcLeg(d, ++order, l.sellerHold, "DEBIT", +(d.amount + d.fee).toFixed(8), d.baseCurrencyTicker, sellerBase)];
  if (d.fee > 0) legs.push(otcLeg(d, ++order, l.fee, "CREDIT", d.fee, d.baseCurrencyTicker, pdServiceAccount(38)));
  legs.push(otcLeg(d, ++order, l.assetToBuyer, "CREDIT", d.amount, d.baseCurrencyTicker, buyerBase));
  legs.push(otcLeg(d, ++order, l.paymentFromBuyer, "DEBIT", d.cost, d.quoteCurrencyTicker, buyerQuote));
  legs.push(otcLeg(d, ++order, l.paymentToSeller, "CREDIT", d.cost, d.quoteCurrencyTicker, sellerQuote));
  return legs;
}

function otcLedgerExportRows(d) {
  const l = t("paymentDetail.ledger");
  const legs = otcLedgerLegsFor(d);
  const headers = [l.colDescription, l.colId, l.colSide, l.colAmount, l.colCurrency, l.colAccount, l.colStatus, l.colDate];
  const rows = legs.map((x) => [x.description, x.code, accEnum("transferType", x.side), x.amount, x.currency, x.acc ? x.acc.code : l.noAccount, accEnum("opStatus", x.status), x.createdAt]);
  return { headers, rows };
}

function otcLedgerSection(d) {
  const l = ot("ledger");
  return renderLedgerTable(otcLedgerLegsFor(d), {
    title: l.title, intro: l.intro,
    emptyTitle: d.status === "COMPLETED" ? t("paymentDetail.ledger.emptyTitle") : l.emptyPendingTitle,
    emptyText: d.status === "COMPLETED" ? t("paymentDetail.ledger.emptyText") : l.emptyPendingText,
    exportKey: "otc-ledger-export", hashAttr: "data-otc-hash",
  });
}

// Тело страницы (без шапки): слева плоские секции как в платежах, справа — хронология и комментарии администраторов
function otcDealBodyHtml(d, forPdf) {
  return `<div class="client-detail-grid">
      <div class="client-detail-grid-main">
        <div class="profile-flat-block">
          ${otcHeroSection(d)}
          ${otcGeneralSection(d)}
          ${otcPartiesSection(d)}
          ${otcOutcomeSection(d)}
          ${otcPaymentSection(d)}
          ${otcLedgerSection(d)}
          ${otcServiceSection(d)}
        </div>
      </div>
      <div class="client-detail-grid-side">
        ${sectionCard(ot("detail.sections.timeline"), otcTimelineHtml(d))}
        ${forPdf ? "" : `<div id="otc-comments-slot">${otcCommentsCard(d)}</div>`}
      </div>
    </div>`;
}

function viewOtcDetail(id) {
  const d = otcDealById(id);
  const dt = ot("detail");
  if (!d) {
    return `${pageHeader(dt.notFoundTitle)}
      <div class="empty-state"><div class="empty-state-icon">${ICONS.box}</div>
      <div class="empty-state-title">${dt.notFoundTitle}</div><div class="empty-state-text">${dt.notFoundText}</div></div>`;
  }
  return `
    <div id="otc-root">
      <div class="card client-detail-header cd-hero">
        <button type="button" class="client-detail-back" id="otc-back" title="${dt.back}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg></button>
        <div class="client-detail-header-main">
          <div class="client-detail-title-row"><span class="page-title">${dt.title} ${pdEscape(d.referenceNumber)}</span>${otcStatusBadge(d.status)}</div>
          <div class="client-detail-subtitle">
            <span>${otcEnum("type", d.type)}</span><span class="client-detail-subtitle-sep">·</span><span>${d.createdAt}</span>
          </div>
        </div>
        <div class="pd-header-tools">
          <button type="button" class="client-detail-actions-btn" data-otc-action="vabs" title="${ot("actions.goToOperation")}">${PD_EXTERNAL_LINK_ICON}</button>
          ${otcDealMenu(d)}
        </div>
      </div>
      ${otcBanners(d)}
      <div id="otc-grid">${otcDealBodyHtml(d)}</div>
    </div>`;
}

// ---- PDF: карточка сделки — то же содержимое, что на странице, все секции развёрнуты. Работает и из строки списка ----
function otcExportDealPdf(d) {
  const name = `${ot("detail.title")} ${d.referenceNumber}`;
  const meta = `${otcEnum("status", d.status)} · ${otcEnum("type", d.type)} · ${d.createdAt}`;
  const body = otcDealBodyHtml(d, true).replace(/is-collapsed/g, "");
  exPrintHtml(exPdfHtml(`${name} | ${d.referenceNumber}`, name, meta, body), `${name} | ${d.referenceNumber}`);
}
function initOtcDetail() {
  const d = otcDealById(currentOtcDealId());
  const back = document.getElementById("otc-back");
  if (back) back.addEventListener("click", () => { window.location.hash = "#/operations-otc"; });
  const root = document.getElementById("otc-root");
  if (!root || !d) return;
  root.querySelectorAll("[data-otc-action]").forEach((b) => b.addEventListener("click", () => otcHandleAction(b.dataset.otcAction, d)));
  root.querySelectorAll(".collapsible-card-head").forEach((btn) => btn.addEventListener("click", () => btn.closest(".collapsible-card").classList.toggle("is-collapsed")));
  otcBindCommentsCard(d);
  root.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => btn.addEventListener("click", () => copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn))));
  root.querySelectorAll(".copy-target").forEach((el) => el.addEventListener("click", () => copyTextToClipboard(el.dataset.copyText).then(() => { el.classList.add("is-copied"); setTimeout(() => el.classList.remove("is-copied"), 900); })));
  root.querySelectorAll("[data-otc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.otcHash; }));
  bindExportMenu("otc-ledger-export", (format) => {
    const { headers, rows } = otcLedgerExportRows(d);
    exportTable(`otc-${d.referenceNumber}-ledger`, format, headers, rows);
    showToast(t("paymentDetail.ledger.exportDone"));
  });
}






