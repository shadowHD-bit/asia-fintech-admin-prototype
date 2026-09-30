/* ==========================================================================
   Раздел "Счета": три пункта сайдбара (Виртуальные / Реальные / Корреспондентские),
   у каждого таблица, и страница счёта (Обзор, Балансы, Реквизиты, Связанные счета, Операции).
   Спецификация: docs/accounts-spec.md; данные — assets/mock/accounts.mock.js.
   Списки построены на заготовке createAccessList (views/settings-access.js).
   ========================================================================== */

// ---- Хелперы отображения ------------------------------------------------------------------
function accEnum(group, value) {
  const dict = t(`accounts.enums.${group}`);
  return (dict && value != null && dict[value]) || (value == null ? "" : value);
}

function accStatusBadge(status) {
  const cls = { ACTIVE: "badge-success", FROZEN: "badge-warning", DISABLED: "badge-neutral", CLOSED: "badge-neutral", ARCHIVED: "badge-neutral", ERROR: "badge-danger" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${accEnum("status", status)}</span>`;
}

function accKindBadge(kind) {
  const cls = kind === "correspondent" ? "badge-info" : "badge-neutral";
  return `<span class="badge ${cls}">${t(`accounts.kind.${kind}`)}</span>`;
}

function accTxStatusBadge(status) {
  const cls = { CONFIRMED: "badge-success", PENDING: "badge-warning", PROCESSING: "badge-info", DECLINED: "badge-danger", ERROR: "badge-danger", REPLACED: "badge-neutral" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${accEnum("txStatus", status)}</span>`;
}

function accMoney(value, currency) {
  return `${formatPaymentAmount(value)} ${currency}`;
}

// Не показываем это в таблице/заголовке карточки самого раздела "Счета" (там
// только ID, см. accAccountCell/accDetailHeader — у счёта нет отдельного поля
// названия). Но это единственный человекочитаемый фолбэк для ссылок на счёт
// из ДРУГИХ разделов (хлебные крошки app.js, снимки/расхождения eod.js,
// проводки vABS settings-vabs-ops.js) — там голый ID без какого-либо текста
// был бы хуже, поэтому оставляем description/tag как крайний случай.
function accTitle(a) {
  return a.description || a.tag || a.code;
}

function accHref(a) {
  return `#/accounts-${a.kind}/${a.id}`;
}

function accMainBalance(a) {
  if (!a.balances.length) return null;
  return [...a.balances].sort((x, y) => y.total - x.total)[0];
}

function accHasFunds(a) {
  return a.balances.some((b) => b.total > 0);
}

function accBalanceCell(a) {
  const main = accMainBalance(a);
  if (!main) return `<span class="table-cell-muted">${t("accounts.noBalances")}</span>`;
  const more = a.balances.length > 1 ? t("accounts.currenciesCount")(a.balances.length) : "";
  return `<div class="identity-cell"><span class="acc-money">${accMoney(main.total, main.currency)}</span>${more ? `<span class="table-cell-muted">${more}</span>` : ""}</div>`;
}

function accOwnerCell(a) {
  if (a.kind === "virtual") {
    const c = a.client;
    const name = c.link ? `<button type="button" class="table-link" data-acc-hash="${c.link}">${pdEscape(c.name)}</button>` : `<span>${pdEscape(c.name)}</span>`;
    return `<div class="identity-cell">${name}${c.link ? `<span class="badge badge-neutral">${accEnum("legalType", c.legalType)}</span>` : `<span class="table-cell-muted">${t("accounts.serviceClient")}</span>`}</div>`;
  }
  return `<div class="identity-cell"><span>${pdEscape(a.provider.name)}</span><span class="table-cell-muted">${a.providerExternalId}</span></div>`;
}

// ID — единственное, что реально показываем в таблице (клик по нему ведёт на
// карточку счёта): у счёта нет отдельного поля "название"/алиас, только
// свободный текст description (подтверждено чтением схемы 24.09.2026, см.
// шапку accounts.mock.js) — раньше description ошибочно выводился здесь как
// если бы это было имя счёта.
function accAccountCell(a) {
  return `<div class="identity-cell">
    <span class="inline-copy">
      <button type="button" class="table-link" data-acc-hash="${accHref(a)}">${a.code}</button>
      ${copyIconButton(a.code)}
    </span>
    ${a.description ? `<span class="table-cell-muted">${pdEscape(a.description)}</span>` : ""}
  </div>`;
}

// Бейджи валют, в которых у счёта есть баланс (список кодов, без сумм) — как
// уже было у корреспондентских счетов, теперь одинаково для всех трёх видов.
// Больше ACC_CURRENCY_BADGES_MAX валют не растягивают строку: первые три —
// бейджами-ссылками на карточку валюты в "Настройки vABS", остальные
// сворачиваются в "+N" (полный список — во всплывающей подсказке). У
// крипто-валюты рядом сеть.
const ACC_CURRENCY_BADGES_MAX = 3;

function accNetworkOf(currency) {
  const net = vbNetworkOfTicker(currency);
  return net === "FIAT" ? null : net;
}

function accCurrencyBadge(currency) {
  const cur = vbCurrencyByTicker(currency, vbNetworkOfTicker(currency));
  const net = accNetworkOf(currency);
  const label = `${currency}${net ? ` · ${net}` : ""}`;
  return cur
    ? `<button type="button" class="badge badge-neutral vb-badge-link" data-acc-hash="#/settings-vabs-currencies/${cur.id}">${label}</button>`
    : `<span class="badge badge-neutral">${label}</span>`;
}

function accCurrencyLink(currency) {
  const cur = vbCurrencyByTicker(currency, vbNetworkOfTicker(currency));
  return cur ? `<button type="button" class="table-link" data-acc-hash="#/settings-vabs-currencies/${cur.id}"><strong>${currency}</strong></button>` : `<strong>${currency}</strong>`;
}

// Сеть — только у крипто-валюты (у фиата сети как отдельной сущности нет)
function accNetworkLink(currency) {
  const name = accNetworkOf(currency);
  if (!name) return t("accounts.noValue");
  const net = vbNetworkByName(name);
  return net ? `<button type="button" class="table-link" data-acc-hash="#/settings-vabs-networks/${net.id}">${pdEscape(net.name)}</button>` : pdEscape(name);
}

function accCurrenciesCell(a) {
  if (!a.balances.length) return t("accounts.noValue");
  const shown = a.balances.slice(0, ACC_CURRENCY_BADGES_MAX);
  const rest = a.balances.slice(ACC_CURRENCY_BADGES_MAX);
  const more = rest.length ? `<span class="badge badge-neutral" title="${rest.map((b) => b.currency).join(", ")}">+${rest.length}</span>` : "";
  return `<div class="ac-badges">${shown.map((b) => accCurrencyBadge(b.currency)).join("")}${more}</div>`;
}

// rails — реальное поле ЕСТЬ только у VabsRealAccount (findRealAccountRails,
// core-feature-dev_bank_core); корреспондентский счёт в реальной схеме — тот
// же VabsRealAccount (type=NOSTRO), поэтому у него rails тоже есть. У
// VabsVirtualAccount такого поля нет вовсе — колонка есть только у "Реальных"
// и "Корреспондентских" таблиц, не у "Виртуальных" (см. accRailBadges ниже,
// переиспользуется и в таблице, и на карточке счёта).

function accIsIncrease(account, tx) {
  return tx.transferType === (account.ledgerType === "ACTIVE" ? "DEBIT" : "CREDIT");
}

function accUnique(getter, list) {
  return [...new Set(list.map(getter).filter((v) => v != null && v !== ""))];
}

// ---- Списки ---------------------------------------------------------------------------------------
const ACC_CURRENCY_LIST = ["USD", "EUR", "RUB", "KGS", "USDT"];

function accCommonFilters(list, { withKind, withProvider, withClient }) {
  const F = "accounts.filters";
  const filters = [];
  if (withKind) filters.push({ id: "kind", kind: "multi", label: () => t(`${F}.kind`), get: (r) => r.kind, options: () => ["virtual", "real", "correspondent"].map((v) => ({ value: v, label: t(`accounts.kind.${v}`) })) });
  filters.push({ id: "type", kind: "multi", label: () => t(`${F}.type`), get: (r) => r.type, options: () => accUnique((r) => r.type, list()).map((v) => ({ value: v, label: accEnum("type", v) })) });
  filters.push({ id: "ledger", kind: "multi", label: () => t(`${F}.ledger`), get: (r) => r.ledgerType, options: () => ["ACTIVE", "PASSIVE"].map((v) => ({ value: v, label: accEnum("ledger", v) })) });
  if (withProvider) filters.push({ id: "provider", kind: "multi", label: () => t(`${F}.provider`), get: (r) => (r.provider ? r.provider.name : ""), options: () => accUnique((r) => r.provider && r.provider.name, list()).map((v) => ({ value: v, label: v })) });
  if (withClient) {
    filters.push({ id: "clientType", kind: "multi", label: () => t(`${F}.clientType`), get: (r) => r.client.legalType, options: () => ["INDIVIDUAL", "CORPORATE"].map((v) => ({ value: v, label: accEnum("legalType", v) })) });
  }
  filters.push({ id: "currency", kind: "multi", label: () => t(`${F}.currency`), get: (r) => r.balances.map((b) => b.currency), options: () => ACC_CURRENCY_LIST.map((v) => ({ value: v, label: v })) });
  filters.push({ id: "balance", kind: "multi", label: () => t(`${F}.balance`), get: (r) => (accHasFunds(r) ? "nonzero" : "zero"), options: () => ["nonzero", "zero"].map((v) => ({ value: v, label: t(`accounts.balanceFilter.${v}`) })) });
  filters.push({ id: "created", kind: "date", label: () => t(`${F}.created`), get: (r) => r.createdDate });
  return filters;
}

function accSearchText(r) {
  return [r.id, r.description, r.tag, r.providerExternalId, r.provider && r.provider.name, r.client && r.client.name, ...(r.references || []).map((x) => x.value)].filter(Boolean).join(" ");
}

// Сортировка по колонке "Счёт" — теперь там только ID (см. accAccountCell,
// у счёта нет отдельного поля названия), поэтому сравниваем по ID.
function accCreatedSort() {
  return { created: (a, b) => a.createdDate - b.createdDate, account: (a, b) => a.id.localeCompare(b.id) };
}

const ACC_STATUS_TAB = { get: (r) => r.status, values: ACC_STATUSES, label: (v) => accEnum("status", v) };
const ACC_NEWEST_FIRST = (a, b) => b.createdDate - a.createdDate;

const accCol = (key) => () => t(`accounts.columns.${key}`);
const ACC_COL_ACCOUNT = { label: accCol("account"), sort: "account", html: accAccountCell };
// Причину ограничения в таблице не показываем (слишком тесно, и это деталь
// карточки, не список) — только сам статус; сама причина остаётся на
// карточке счёта (accBanners) и в фильтре.
const ACC_COL_STATUS = { label: accCol("status"), html: (a) => accStatusBadge(a.status) };
const ACC_COL_CREATED = { label: accCol("created"), sort: "created", html: (a) => dateTimeCell(a.createdAt) };

// Троеточие в строке таблицы — те же действия и та же гейтинг-логика по
// статусу, что и в меню шапки карточки счёта (accAvailableActions), только
// пункты меню собираются здесь и на каждую строку своё меню (rowKebabMenu,
// тот же компонент, что и в "Операции → Платежи/Обмены").
const ACC_COL_ACTIONS = {
  label: () => "",
  html: (a) => {
    // Выгрузка карточки в PDF — в каждой строке, поэтому меню не бывает пустым
    const items = [{ action: "exportPdf", label: t("accounts.detail.actions.exportPdf"), icon: DOWNLOAD_ICON_SVG }, ...accAvailableActions(a)];
    return rowKebabMenu(`acc-row-${a.id}`, items.map((i) => ({ label: i.label, icon: i.icon, danger: i.danger, attrs: `data-acc-row-action="${i.action}:${a.id}"` })));
  },
};

function accAttachRows(wrap) {
  wrap.querySelectorAll("[data-acc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.accHash; }));
  wrap.querySelectorAll("[data-acc-row-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [action, id] = btn.dataset.accRowAction.split(":");
      const acc = accFind("all", id);
      if (acc) accHandleAction(action, acc);
    });
  });
}

const accountsVirtualList = createAccessList({
  key: "acc-virtual",
  data: () => ACCOUNTS_VIRTUAL_MOCK,
  searchPlaceholder: () => t("accounts.search"),
  searchText: accSearchText,
  tab: ACC_STATUS_TAB,
  filters: accCommonFilters(() => ACCOUNTS_VIRTUAL_MOCK, { withClient: true }),
  defaultSort: ACC_NEWEST_FIRST,
  sorts: accCreatedSort(),
  metrics: (list) => {
    const m = t("accounts.metrics");
    return [
      { value: new Set(list.filter((r) => r.client.link).map((r) => r.client.id)).size, label: m.clients },
      { value: list.filter(accHasFunds).length, label: m.nonzero },
      { value: list.filter((r) => r.restrictionReason).length, label: m.restricted },
      { value: list.filter((r) => r.parentId).length, label: m.children },
      { value: new Set(list.flatMap((r) => r.balances.map((b) => b.currency))).size, label: m.currencies },
    ];
  },
  columns: [
    ACC_COL_ACCOUNT,
    { label: accCol("client"), html: accOwnerCell },
    { label: accCol("type"), html: (a) => accEnum("type", a.type) },
    { label: accCol("ledger"), html: (a) => accEnum("ledger", a.ledgerType) },
    { label: accCol("currencies"), html: accCurrenciesCell },
    ACC_COL_STATUS,
    { label: accCol("balance"), html: accBalanceCell },
    ACC_COL_CREATED,
    ACC_COL_ACTIONS,
  ],
  attachRows: accAttachRows,
});

const accountsRealList = createAccessList({
  key: "acc-real",
  headerAction: () => accBarActions(),
  attachHeaderAction: () => accAttachBarActions("real"),
  data: () => ACCOUNTS_REAL_MOCK,
  searchPlaceholder: () => t("accounts.search"),
  searchText: accSearchText,
  tab: ACC_STATUS_TAB,
  filters: accCommonFilters(() => ACCOUNTS_REAL_MOCK, { withProvider: true }),
  defaultSort: ACC_NEWEST_FIRST,
  sorts: accCreatedSort(),
  metrics: (list) => {
    const m = t("accounts.metrics");
    return [
      { value: new Set(list.map((r) => r.provider.name)).size, label: m.providers },
      { value: list.filter(accHasFunds).length, label: m.nonzero },
      { value: list.filter((r) => r.restrictionReason).length, label: m.restricted },
      { value: new Set(list.flatMap((r) => r.linkedIds)).size, label: m.linkedVirtual },
      { value: new Set(list.flatMap((r) => r.balances.map((b) => b.currency))).size, label: m.currencies },
    ];
  },
  columns: [
    ACC_COL_ACCOUNT,
    { label: accCol("provider"), html: accOwnerCell },
    { label: accCol("type"), html: (a) => accEnum("type", a.type) },
    { label: accCol("rails"), html: accRailBadges },
    { label: accCol("currencies"), html: accCurrenciesCell },
    ACC_COL_STATUS,
    { label: accCol("balance"), html: accBalanceCell },
    ACC_COL_CREATED,
    ACC_COL_ACTIONS,
  ],
  attachRows: accAttachRows,
});

const accountsCorrespondentList = createAccessList({
  key: "acc-corr",
  headerAction: () => accBarActions(),
  attachHeaderAction: () => accAttachBarActions("correspondent"),
  data: () => ACCOUNTS_NOSTRO_MOCK,
  searchPlaceholder: () => t("accounts.search"),
  searchText: accSearchText,
  tab: ACC_STATUS_TAB,
  filters: accCommonFilters(() => ACCOUNTS_NOSTRO_MOCK, { withProvider: true }).filter((f) => f.id !== "type" && f.id !== "ledger"),
  defaultSort: ACC_NEWEST_FIRST,
  sorts: accCreatedSort(),
  metrics: (list) => {
    const m = t("accounts.metrics");
    return [
      { value: new Set(list.map((r) => r.provider.name)).size, label: m.providers },
      { value: new Set(list.flatMap((r) => r.balances.map((b) => b.currency))).size, label: m.currencies },
      { value: list.filter(accHasFunds).length, label: m.nonzero },
      { value: list.filter((r) => r.restrictionReason).length, label: m.restricted },
      { value: new Set(list.flatMap((r) => r.linkedIds)).size, label: m.linkedVirtual },
    ];
  },
  columns: [
    ACC_COL_ACCOUNT,
    { label: accCol("provider"), html: accOwnerCell },
    { label: accCol("rails"), html: accRailBadges },
    { label: accCol("currencies"), html: accCurrenciesCell },
    ACC_COL_STATUS,
    { label: accCol("balance"), html: accBalanceCell },
    ACC_COL_CREATED,
    ACC_COL_ACTIONS,
  ],
  attachRows: accAttachRows,
});

const ACCOUNT_LISTS = { virtual: accountsVirtualList, real: accountsRealList, correspondent: accountsCorrespondentList };

// ---- Страницы списков (каждый вид счетов — отдельный пункт сайдбара) ---------------------------
function viewAccounts(kind) {
  const note = kind === "correspondent" ? `<p class="table-cell-muted acc-note">${t("accounts.nostroNote")}</p>` : "";
  return `
    <div class="list-hero">${pageHeader(
      t(`nav.accounts-${kind}`),
      t(`navDescriptions.accounts-${kind}`),
      `${exportMenuHtml("acc-export", t("accounts.export.button"), t("accounts.export.hint"))}<button type="button" class="btn-primary" id="acc-create-btn">${PLUS_ICON_SVG}<span>${t("accounts.create.button")}</span></button>`
    )}</div>
    ${note}${ACCOUNT_LISTS[kind].view()}
  `;
}

// ---- Экспорт списка счетов (CSV / XLSX): то, что показывает таблица — поиск, таб статуса, фильтры и сортировка,
// без учёта страницы. Одна строка на баланс (счёт × валюта). Перед выгрузкой — модалка с итогом. -----------------
function accExportLines(list) {
  const lines = list.filterLines();
  const tab = list.tabValue();
  if (tab) lines.unshift(`${t("accounts.columns.status")}: ${accEnum("status", tab)}`);
  return lines;
}

function openExportAccountsModal(kind, format) {
  const list = ACCOUNT_LISTS[kind];
  const x = t("accounts.export");
  const count = list.exportRows().length;
  const lines = accExportLines(list);
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle,
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(list.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); list.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportAccounts(kind, format); });
    },
  });
}

function exportAccounts(kind, format) {
  const x = t("accounts.export");
  const accounts = ACCOUNT_LISTS[kind].exportRows();
  const rows = [];
  accounts.forEach((a) => {
    const owner = kind === "virtual" ? (a.client && a.client.name) || "" : (a.provider && a.provider.name) || "";
    const base = [a.code, a.description || "", owner, accEnum("type", a.type), accEnum("status", a.status)];
    if (!a.balances.length) rows.push([...base, "", "", "", "", a.createdAt]);
    a.balances.forEach((b) => rows.push([...base, b.currency, b.total, b.hold, b.available, a.createdAt]));
  });
  const prefix = { virtual: "accounts", real: "real_accounts", correspondent: "correspondent_accounts" }[kind];
  exportTable(`${prefix}_${new Date().toISOString().slice(0, 10)}`, format, kind === "virtual" ? x.columnsClient : x.columnsProvider, rows);
  showToast(x.done(accounts.length));
}

function initAccounts(kind) {
  bindExportMenu("acc-export", (format) => openExportAccountsModal(kind, format));
  ACCOUNT_LISTS[kind].init();
  const createBtn = document.getElementById("acc-create-btn");
  if (createBtn) createBtn.addEventListener("click", () => openCreateAccountModal(kind));
}
// ---- Настройки vABS → Счета: одна страница, внутри вкладки "Реальные" и "Корреспондентские" -------------------------
// Экспорт и "Создать счёт" — в строке поиска и фильтров самой вкладки
function accBarActions() {
  return `<span class="filters-bar-end">${exportMenuHtml("acc-export", t("accounts.export.button"), t("accounts.export.hint"))}<button type="button" class="btn-primary" id="acc-create-btn">${PLUS_ICON_SVG}<span>${t("accounts.create.button")}</span></button></span>`;
}

function accAttachBarActions(kind) {
  bindExportMenu("acc-export", (format) => openExportAccountsModal(kind, format));
  const createBtn = document.getElementById("acc-create-btn");
  if (createBtn) createBtn.addEventListener("click", () => openCreateAccountModal(kind));
}

let vabsAccountsTab = "real";
const VABS_ACCOUNT_TABS = ["real", "correspondent"];

function vabsAccountsTabsBar() {
  return `<div class="cd-subtabs">${VABS_ACCOUNT_TABS.map((k) => `<button type="button" class="cd-subtab${vabsAccountsTab === k ? " is-active" : ""}" data-vb-acc-tab="${k}"><span>${t(`nav.accounts-${k}`)}</span><span class="quick-tab-count">${ACCOUNT_LISTS[k].count()}</span></button>`).join("")}</div>`;
}

function vabsAccountsContent() {
  const note = vabsAccountsTab === "correspondent" ? `<p class="table-cell-muted acc-note">${t("accounts.nostroNote")}</p>` : "";
  return `${note}${ACCOUNT_LISTS[vabsAccountsTab].view()}`;
}

function viewVabsAccounts() {
  // Прямая ссылка на вкладку: #/settings-vabs-accounts/real | correspondent
  const m = window.location.hash.match(/^#\/?settings-vabs-accounts\/(real|correspondent)$/);
  if (m) vabsAccountsTab = m[1];
  return `
    <div class="list-hero">${pageHeader(t("nav.settings-vabs-accounts"), t("navDescriptions.settings-vabs-accounts"))}</div>
    <div class="cd-tabs-wrap" id="vb-acc-tabs">${vabsAccountsTabsBar()}</div>
    <div id="vb-acc-content">${vabsAccountsContent()}</div>
  `;
}

function initVabsAccounts() {
  document.querySelectorAll("[data-vb-acc-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      vabsAccountsTab = btn.dataset.vbAccTab;
      document.getElementById("vb-acc-tabs").innerHTML = vabsAccountsTabsBar();
      document.getElementById("vb-acc-content").innerHTML = vabsAccountsContent();
      initVabsAccounts();
    });
  });
  ACCOUNT_LISTS[vabsAccountsTab].init();
}
// ---- Страница счёта ---------------------------------------------------------------------------------
// Реквизиты — вкладка только у реального/корреспондентского счёта: у
// виртуального своей вкладки с реквизитами теперь нет (по запросу).
function accDetailTabsFor(acc) {
  return acc.kind === "virtual" ? ["overview", "balances", "linked", "operations"] : ["overview", "balances", "requisites", "linked", "operations"];
}
let accountDetailTab = "overview";
let accountDetailKeepTab = false;
let accountBalancesNonZero = false;
function currentAccountRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^accounts-(virtual|real|correspondent)\/(.+)$/);
  return m ? { kind: m[1], id: decodeURIComponent(m[2]) } : null;
}

// Вкладка "Операции" — реальные бизнес-операции (VB_OPERATIONS, те же, что в
// "Настройки vABS → Операции" и на вкладке "Операции" карточки клиента,
// settings-vabs-ops.js/clients-users.js), отфильтрованные по счёту через
// virtualLegs/realLegs (у счёта — проводка внутри операции, см. leg.accountId).
// Раньше здесь были ПРОВОДКИ (ACCOUNT_TRANSACTIONS) — то есть более мелкая
// сущность, чем операция (у одной операции несколько проводок); эти проводки
// никуда не делись — на них по-прежнему строятся сами VB_OPERATIONS
// (settings-vabs.mock.js), просто в таблице теперь показываются операции, а
// не их отдельные проводки, как и просили. noCard/noDivider — тот же паттерн,
// что и у вкладки "Операции" карточки клиента (без карточки, список уже внутри
// вкладки детальной страницы).
function accOperationsForAccount(acc) {
  const legsKey = acc.kind === "virtual" ? "virtualLegs" : "realLegs";
  return VB_OPERATIONS.filter((op) => op[legsKey].some((l) => l.accountId === acc.id));
}

function buildAccountOperationsList(acc) {
  const dataGetter = () => accOperationsForAccount(acc);

  return createAccessList({
    key: `acc-ops-${acc.id}`,
    noCard: true,
    noDivider: true,
    // Кнопка экспорта — в строке поиска и фильтров, справа (а не отдельной строкой над табами)
    headerAction: () => `<span class="filters-bar-end">${exportMenuHtml("acc-ops-export", t("accounts.exportOps.button"), t("accounts.exportOps.hint"))}</span>`,
    attachHeaderAction: () => bindExportMenu("acc-ops-export", (format) => openExportAccountOpsModal(acc, format)),
    data: dataGetter,
    searchPlaceholder: () => vt("operations.search"),
    searchText: (op) => [op.id, op.name, op.description, op.externalOperationId].filter(Boolean).join(" "),
    tab: { get: (r) => r.status, values: VB_OP_STATUSES, label: (v) => accEnum("opStatus", v) },
    filters: [
      { id: "created", kind: "date", label: () => vt("filters.created"), get: (r) => r.createdDate },
      {
        id: "provider",
        kind: "multi",
        label: () => vt("filters.provider"),
        get: (r) => r.providerRefs.map((p) => p.id),
        options: () => [...new Map(dataGetter().flatMap((o) => o.providerRefs).map((p) => [p.id, p])).values()].map((p) => ({ value: p.id, label: p.name })),
      },
    ],
    columns: [
      { label: () => vbOpNameIdHeader(), html: (o) => vbOpNameIdCell(o, "data-acc-hash") },
      { label: () => vt("columns.status"), html: (o) => vbOpStatusBadge(o.status) },
      { label: () => vt("columns.externalId"), html: (o) => o.externalOperationId || "—" },
      { label: () => vt("columns.created"), sort: "created", html: (o) => dateTimeCell(o.createdAt) },
    ],
    defaultSort: (a, b) => b.createdDate - a.createdDate,
    sorts: { created: (a, b) => a.createdDate - b.createdDate },
    attachRows: (wrap) => {
      wrap.querySelectorAll("[data-acc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.accHash; }));
    },
  });
}

function accSummaryStrip(acc) {
  const s = t("accounts.detail.summary");
  const main = accMainBalance(acc);
  const money = (v) => (main ? accMoney(v, main.currency) : t("accounts.noValue"));
  const stat = (label, value) => `<div><div class="pd-hero-label">${label}</div><div class="pd-hero-stat-value">${value}</div></div>`;
  return `<div class="pd-hero acc-summary"><div class="pd-hero-stats">
    ${stat(s.available, money(main ? main.available : 0))}
    ${stat(s.hold, money(main ? main.hold : 0))}
    ${stat(s.total, money(main ? main.total : 0))}
  </div></div>`;
}

// Общий список допустимых действий (одинаковая логика и для меню-троеточия в
// шапке карточки, и для меню-троеточия в строке таблицы) — статусные переходы
// те же, что и раньше у кнопок, просто теперь пункты меню, а не кнопки подряд.
function accAvailableActions(acc) {
  const a = t("accounts.detail.actions");
  const out = [];
  if (!["CLOSED", "ARCHIVED"].includes(acc.status)) out.push({ action: "edit", label: a.edit, icon: EDIT_ICON_SVG });
  if (acc.status === "ACTIVE") out.push({ action: "freeze", label: a.freeze, icon: ICONS.lock });
  if (acc.status === "FROZEN" || acc.status === "DISABLED") out.push({ action: "activate", label: a.activate, icon: CHECK_ICON_SVG });
  if (["ACTIVE", "FROZEN", "DISABLED"].includes(acc.status)) out.push({ action: "close", label: a.close, icon: TRASH_ICON_SVG, danger: true });
  // Архивация/разархивация — те же ARCHIVE/ACTIVATE (AccountActionEnum): бэкенд не
  // ограничивает переходы между статусами, поэтому архивировать можно из любого
  // статуса, а разархивация возвращает счёт в ACTIVE.
  if (acc.status !== "ARCHIVED") out.push({ action: "archive", label: a.archive, icon: ICONS.box });
  else out.push({ action: "unarchive", label: a.unarchive, icon: CHECK_ICON_SVG });
  return out;
}

// Меню-троеточие в шапке карточки счёта — тот же компонент .client-detail-actions,
// что и на карточке платежа (operations-payment-detail.js); если действий нет
// (счёт в архиве) кнопку вообще не показываем, а не троеточие с пустым меню.
function accHeaderActionsMenu(acc) {
  const d = t("accounts.detail.actions");
  // Выгрузка в PDF доступна всегда, поэтому меню не бывает пустым (в том числе у счёта в архиве)
  const items = [{ action: "exportPdf", label: d.exportPdf, icon: DOWNLOAD_ICON_SVG }, ...accAvailableActions(acc)];
  return `
    <div class="client-detail-actions" id="acc-actions">
      <button type="button" class="client-detail-actions-btn" id="acc-actions-btn" title="${d.menu}">${KEBAB_ICON_SVG}</button>
      <div class="client-detail-actions-menu">${items
        .map((i) => `<button type="button" class="user-menu-item${i.danger ? " is-danger" : ""}" data-acc-action="${i.action}">${i.icon}<span>${i.label}</span></button>`)
        .join("")}</div>
    </div>
  `;
}

function accOwnerLine(acc) {
  return acc.kind === "virtual" ? pdEscape(acc.client.name) : pdEscape(acc.provider.name);
}

// Заголовок — "{вид} счёт {shortId}" (по образцу карточки платежа: "Платёж
// {shortId}", operations-payment-detail.js), не description: у счёта нет
// отдельного поля названия (см. шапку accounts.mock.js), поэтому раньше
// показывать здесь description как будто это имя было нечестно. Бейдж вида
// счёта из шапки убран — вид теперь и так назван в самом заголовке, статус
// остаётся единственным бейджем (как на карточке платежа).
function accDetailHeader(acc) {
  const d = t("accounts.detail");
  return `
    <div class="card client-detail-header cd-hero">
      <button type="button" class="client-detail-back" id="acc-back" title="${d.back}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg></button>
      <div class="client-detail-header-main">
        <div class="client-detail-title-row"><span class="page-title">${t(`accounts.kind.${acc.kind}`)} ${d.titleSuffix} ${acc.code}</span>${accStatusBadge(acc.status)}</div>
        <div class="client-detail-subtitle">
          <span class="inline-copy">ID: ${acc.code}${copyIconButton(acc.code)}</span><span class="client-detail-subtitle-sep">·</span>
          <span>${accOwnerLine(acc)}</span><span class="client-detail-subtitle-sep">·</span><span>${acc.createdAt}</span>
        </div>
      </div>
      <div class="pd-header-tools">${accHeaderActionsMenu(acc)}</div>
    </div>`;
}

function accBanners(acc) {
  const d = t("accounts.detail");
  let html = "";
  if (acc.restrictionReason) {
    html += `<div class="card client-block-card"><div class="detail-section-title">${d.restrictedTitle}</div><ul class="block-reasons-list"><li>${accEnum("restrictionReason", acc.restrictionReason)}</li>${acc.restrictionDetails ? `<li>${pdEscape(acc.restrictionDetails)}</li>` : ""}</ul></div>`;
  }
  if (acc.errorMessages && acc.errorMessages.length) {
    html += `<div class="card client-block-card"><div class="detail-section-title">${d.errorTitle}</div><ul class="block-reasons-list">${acc.errorMessages.map((m) => `<li>${pdEscape(m)}</li>`).join("")}</ul></div>`;
  }
  return html;
}

function accTabsBar(acc) {
  const d = t("accounts.detail.tabs");
  const opsCount = accOperationsForAccount(acc).length;
  return `<div class="cd-subtabs">${accDetailTabsFor(acc).map(
    (k) => `<button type="button" class="cd-subtab${accountDetailTab === k ? " is-active" : ""}" data-acc-tab="${k}"><span>${d[k]}</span>${k === "operations" ? `<span class="quick-tab-count">${opsCount}</span>` : ""}</button>`
  ).join("")}</div>`;
}

// ---- Вкладки страницы счёта ----------------------------------------------------------------------
// rails — значения того же PaymentSystemEnum, что и у платежей (paymentSystem
// в мок-данных платежей), поэтому подписи берём из общего paymentSystemLabel
// (operations-payments.js), а не из своего короткого словаря accounts.enums.rail
// (там раньше было только SWIFT/RU_WIRE — большинство рельсов подписывались
// голым кодом).
// У виртуального счёта своего поля rails в схеме нет — его рельсы задаются
// косвенно (depositDetailsSchema.rail привязанных реальных балансов), поэтому
// показываем объединение рельсов привязанных реальных/корреспондентских счетов.
function accRailsOf(acc) {
  // рельсы реального счёта = рельсы его наборов реквизитов (findRealAccountRails)
  if (acc.kind !== "virtual") return acc.depositSets && acc.depositSets.length ? [...new Set(acc.depositSets.map((s) => s.rail))] : acc.rails;
  const set = new Set();
  acc.linkedIds.forEach((id) => { const r = accFind("all", id); if (r) accRailsOf(r).forEach((x) => set.add(x)); });
  return [...set];
}

function accRailBadges(acc) {
  const rails = accRailsOf(acc);
  return rails.length ? `<div class="ac-badges">${rails.map((r) => `<span class="badge badge-neutral">${paymentSystemLabel(r)}</span>`).join("")}</div>` : t("accounts.noValue");
}

function accOverviewTab(acc) {
  const f = t("accounts.detail.fields");
  const sec = t("accounts.detail.sections");
  const parent = acc.parentId ? ACCOUNTS_VIRTUAL_MOCK.find((v) => v.id === acc.parentId) : null;
  const refs = acc.references || [];
  const isVirtual = acc.kind === "virtual";
  // Владелец — обычный параметр в "Основном": у виртуального — клиент (email у
  // физлица без ФИО, либо название компании), у реального/ностро — провайдер
  // (ссылка на его карточку в "Настройки vABS") и, если есть, клиент.
  const clientLink = (c) => (c.link ? `<button type="button" class="table-link" data-acc-hash="${c.link}">${pdEscape(c.name)}</button>` : pdEscape(c.name));
  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.id, acc.id)}
    ${detailField(f.kind, accKindBadge(acc.kind))}
    ${detailField(f.status, accStatusBadge(acc.status))}
    ${detailField(f.type, accEnum("type", acc.type))}
    ${detailField(f.ledger, accEnum("ledger", acc.ledgerType))}
    ${isVirtual ? detailField(f.client, clientLink(acc.client)) : detailField(f.provider, `<button type="button" class="table-link" data-acc-hash="#/settings-vabs-providers/${acc.provider.id}">${pdEscape(acc.provider.name)}</button>`)}
    ${!isVirtual && acc.client ? detailField(f.client, clientLink(acc.client)) : ""}
    ${!isVirtual ? copyableField(f.providerExt, acc.providerExternalId) : ""}
    ${detailField(f.rails, accRailBadges(acc))}
    ${detailField(f.description, acc.description ? pdEscape(acc.description) : t("accounts.noValue"))}
    ${acc.restrictionReason ? detailField(f.reason, accEnum("restrictionReason", acc.restrictionReason)) : ""}
    ${acc.restrictionDetails ? detailField(f.reasonDetails, pdEscape(acc.restrictionDetails)) : ""}
    ${detailField(f.created, acc.createdAt)}
    ${detailField(f.updated, acc.updatedAt)}
  </div>`;

  // Плоские секции в одном блоке (как на карточке клиента/платежа —
  // .profile-flat-block/flatSection, БЕЗ отдельных карточек на каждую секцию).
  return `<div class="profile-flat-block">
    ${flatSection(sec.main, main, ["CLOSED", "ARCHIVED"].includes(acc.status) ? null : "data-acc-edit-main")}
    ${refs.length ? flatSection(sec.references, `<div class="ac-badges">${refs.map((r) => `<span class="badge badge-neutral">${r.name}: ${pdEscape(r.value)}</span>`).join("")}</div>`) : ""}
  </div>`;
}

// Связь реальный баланс ↔ набор реквизитов — M:N: к балансу в валюте
// прикреплены все наборы, в валютах которых она есть (рельсы этих наборов)
function accBalanceSetsCell(acc, bal) {
  const sets = (acc.depositSets || []).filter((s) => s.currencies.includes(bal.currency));
  return sets.length ? `<div class="ac-badges">${sets.map((s) => `<span class="badge badge-neutral">${paymentSystemLabel(s.rail)}</span>`).join("")}</div>` : t("accounts.noValue");
}

function accBalancesTab(acc) {
  const b = t("accounts.detail.balances");
  const isReal = acc.kind !== "virtual";
  const rows = acc.balances.filter((x) => !accountBalancesNonZero || x.total > 0);
  const body = rows.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>${b.id}</th><th>${b.currency}</th><th>${b.available}</th><th>${b.hold}</th><th>${b.total}</th><th>${b.status}</th>${isReal ? `<th>${b.type}</th>` : ""}${isReal ? `<th>${b.requisites}</th>` : ""}<th>${b.description}</th><th></th></tr></thead>
        <tbody>${rows.map((x) => `<tr><td><span class="inline-copy">${pdShort(x.id)}${copyIconButton(x.id)}</span></td><td>${accCurrencyBadge(x.currency)}</td><td>${formatPaymentAmount(x.available)}</td><td>${formatPaymentAmount(x.hold)}</td><td>${formatPaymentAmount(x.total)}</td><td><span class="badge badge-success">${accEnum("status", x.status)}</span></td>${isReal ? `<td>${accEnum("balanceType", x.type)}</td>` : ""}${isReal ? `<td>${accBalanceSetsCell(acc, x)}</td>` : ""}<td>${x.description ? pdEscape(x.description) : t("accounts.noValue")}</td><td><button type="button" class="icon-btn" data-acc-balance-edit="${x.id}" title="${t("clientDetail.edit")}">${EDIT_ICON_SVG}</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="table-cell-muted">${b.empty}</div>`;
  return `<div class="profile-flat-block">${flatSection(
    t("accounts.detail.tabs.balances"),
    `<div class="acc-tab-head">${switchRowHtml("acc-nonzero", b.onlyNonZero, accountBalancesNonZero, { cls: "acc-nonzero" })}${exportMenuHtml("acc-bal-export", t("accounts.exportBalances.button"), t("accounts.exportBalances.hint"))}</div>${body}`
  )}</div>`;
}

// description баланса — реальное поле VabsRealBalance/VabsVirtualBalance;
// id — первичный ключ, его не редактируем (ID показывается в таблице только
// для чтения и копирования).
function accOpenBalanceEditModal(acc, balanceId) {
  const bal = acc.balances.find((x) => x.id === balanceId);
  if (!bal) return;
  const m = t("accounts.modals");
  const b = t("accounts.detail.balances");
  openModal({
    title: `${m.editBalanceTitle} · ${bal.currency}`,
    width: 480,
    bodyHtml: `<label class="filters-field"><span class="filters-field-label">${b.description}</span><input class="address-form-input" type="text" id="acc-bal-desc" value="${escapeAttr(bal.description || "")}" /></label>`,
    footerHtml: `<button type="button" class="btn-secondary" id="acc-cancel">${m.cancel}</button><button type="button" class="btn-primary" id="acc-submit">${m.save}</button>`,
    onMount: (el) => {
      el.querySelector("#acc-cancel").addEventListener("click", closeModal);
      el.querySelector("#acc-submit").addEventListener("click", () => {
        const description = el.querySelector("#acc-bal-desc").value.trim();
        closeModal();
        bal.description = description || null;
        accApply(acc, {});
      });
    },
  });
}

function accReqFields(pairs) {
  const rf = t("accounts.reqFields");
  return `<div class="profile-fields profile-fields-grid">${pairs.map(([k, v]) => copyableField(rf[k] || k, v)).join("")}</div>`;
}

// Изменить можно только реквизиты РЕАЛЬНОГО/корреспондентского счёта —
// requisites: VabsJSON! у VabsRealAccount редактируется реальной мутацией
// (vabsUpdateRealAccounts). У виртуального счёта (depositDetails) такой
// мутации нет вовсе (только создание вместе со счётом) — поэтому там кнопки
// "Изменить" нет, только копирование (см. шапку accounts.mock.js).
function accRequisitesTab(acc) {
  const r = t("accounts.detail.req");
  if (acc.kind === "virtual") {
    if (!acc.depositDetails.length) return `<div class="profile-flat-block">${flatSection(r.depositTitle, `<div class="table-cell-muted">${r.none}</div>`)}</div>`;
    return `<div class="profile-flat-block">${acc.depositDetails
      .map((d) => flatSection(`${r.depositTitle} · ${d.currency}${d.schema ? ` · ${accEnum("schema", d.schema)}` : ""}`, accReqFields(d.fields)))
      .join("")}</div>`;
  }
  // Наборы реквизитов: каждый — валюты + рельс + фиксированные поля схемы
  // рельса + ключ поиска (см. ACC_DEPOSIT_SCHEMAS в accounts.mock.js). Кнопка
  // "Изменить" у каждого набора — правятся значения полей и ключ поиска.
  if (!acc.depositSets.length) return `<div class="profile-flat-block">${flatSection(r.providerTitle, `<div class="table-cell-muted">${r.noneProvider}</div>`)}</div>`;
  return `<div class="profile-flat-block">${acc.depositSets
    .map((s) =>
      flatSection(
        `${s.currencies.join(", ")} · ${paymentSystemLabel(s.rail)}`,
        accReqFields([...s.fields, ["lookupKey", s.lookupKey]]),
        `data-acc-set-edit="${s.id}"`
      )
    )
    .join("")}</div>`;
}

function accOpenDepositSetEditModal(acc, setId) {
  const set = acc.depositSets.find((x) => x.id === setId);
  if (!set) return;
  const rf = t("accounts.reqFields");
  const m = t("accounts.modals");
  const c = t("accounts.create");
  openModal({
    title: `${m.editReqTitle} · ${set.currencies.join(", ")} · ${paymentSystemLabel(set.rail)}`,
    width: 520,
    bodyHtml: `${set.fields.map(([k, v], idx) => `<label class="filters-field"><span class="filters-field-label">${accDepositRequired(set.rail, k) ? pcReq(rf[k] || k) : rf[k] || k}</span><input class="address-form-input" type="text" data-acc-set-field="${idx}" value="${escapeAttr(v)}" /></label>`).join("")}
      <label class="filters-field"><span class="filters-field-label">${pcReq(rf.lookupKey)}</span><input class="address-form-input" type="text" id="acc-set-lookup" value="${escapeAttr(set.lookupKey)}" /><span class="table-cell-muted">${c.lookupKeyHint}</span></label>
      <div class="form-error" id="acc-modal-error" hidden>${c.errSetFields}</div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="acc-cancel">${m.cancel}</button><button type="button" class="btn-primary" id="acc-submit">${m.save}</button>`,
    onMount: (el) => {
      el.querySelector("#acc-cancel").addEventListener("click", closeModal);
      el.querySelector("#acc-submit").addEventListener("click", () => {
        const fields = set.fields.map(([k], idx) => [k, el.querySelector(`[data-acc-set-field="${idx}"]`).value.trim()]);
        const lookupKey = el.querySelector("#acc-set-lookup").value.trim();
        if (!lookupKey || fields.some(([k, v]) => accDepositRequired(set.rail, k) && !v)) { el.querySelector("#acc-modal-error").hidden = false; return; }
        closeModal();
        set.fields = fields;
        set.lookupKey = lookupKey;
        accApply(acc, {});
      });
    },
  });
}

function accLinkedTable(rows) {
  const c = t("accounts.detail.linked.columns");
  if (!rows.length) return `<div class="table-cell-muted">${t("accounts.detail.linked.none")}</div>`;
  // Колонка "владелец" зависит от вида строк: у виртуальных — клиент, у
  // реальных/корреспондентских — провайдер (accOwnerCell так и рисует).
  const ownerLabel = rows.every((a) => a.kind === "virtual") ? t("accounts.columns.client") : rows.every((a) => a.kind !== "virtual") ? t("accounts.columns.provider") : c.owner;
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>${c.account}</th><th>${c.kind}</th><th>${ownerLabel}</th><th>${c.status}</th><th>${c.balance}</th></tr></thead>
    <tbody>${rows.map((a) => `<tr><td>${accAccountCell(a)}</td><td>${accKindBadge(a.kind)}</td><td>${accOwnerCell(a)}</td><td>${accStatusBadge(a.status)}</td><td>${accBalanceCell(a)}</td></tr>`).join("")}</tbody></table></div>`;
}

// Что показываем, зависит от вида просматриваемого счёта — реальная схема
// вообще разводит это на две разные связи (подтверждено чтением схемы
// 24.09.2026): M2M virtualAccounts↔realAccounts (settlement-связь виртуальный
// ⇄ реальный/ностро) и ОТДЕЛЬНО tree-иерархия parent/children только среди
// виртуальных счетов. linkedIds/parentId в моке — честное упрощение обеих
// связей в один плоский список, не 1-в-1 копия схемы.
function accLinkedTab(acc) {
  const l = t("accounts.detail.linked");
  const byId = (ids) => ids.map((id) => accFind("all", id)).filter(Boolean);
  if (acc.kind === "virtual") {
    const parent = acc.parentId ? [ACCOUNTS_VIRTUAL_MOCK.find((v) => v.id === acc.parentId)].filter(Boolean) : [];
    const children = ACCOUNTS_VIRTUAL_MOCK.filter((v) => v.parentId === acc.id);
    return `<div class="profile-flat-block">
      ${parent.length ? flatSection(l.parentTitle, accLinkedTable(parent)) : ""}
      ${children.length ? flatSection(`${l.childrenTitle} · ${children.length}`, accLinkedTable(children)) : ""}
      ${flatSection(`${l.realTitle} · ${acc.linkedIds.length}`, accLinkedTable(byId(acc.linkedIds)))}
    </div>`;
  }
  return `<div class="profile-flat-block">${flatSection(`${l.virtualTitle} · ${acc.linkedIds.length}`, accLinkedTable(byId(acc.linkedIds)))}</div>`;
}

let accountOpsListCache = null;
function ensureAccountOperationsList(acc) {
  if (!accountOpsListCache || accountOpsListCache.accId !== acc.id) {
    accountOpsListCache = { accId: acc.id, list: buildAccountOperationsList(acc) };
  }
  return accountOpsListCache.list;
}

function accTabBody(acc) {
  // Виртуальный счёт без вкладки "Реквизиты" — защита на случай прямого
  // перехода со счёта другого вида, где эта вкладка была открыта.
  if (accountDetailTab === "requisites" && acc.kind === "virtual") return accOverviewTab(acc);
  if (accountDetailTab === "balances") return accBalancesTab(acc);
  if (accountDetailTab === "requisites") return accRequisitesTab(acc);
  if (accountDetailTab === "linked") return accLinkedTab(acc);
  if (accountDetailTab === "operations") return ensureAccountOperationsList(acc).view();
  return accOverviewTab(acc);
}

function viewAccountDetail(ref) {
  const acc = ref ? accFind(ref.kind, ref.id) : null;
  if (!acc) {
    return `${pageHeader(t("accounts.notFoundTitle"))}
      <div class="empty-state"><div class="empty-state-icon">${ICONS.box}</div>
      <div class="empty-state-title">${t("accounts.notFoundTitle")}</div><div class="empty-state-text">${t("accounts.notFoundText")}</div></div>`;
  }
  if (accountDetailKeepTab) accountDetailKeepTab = false;
  else { accountDetailTab = "overview"; accountBalancesNonZero = false; }

  return `<div id="acc-root">
    ${accDetailHeader(acc)}
    ${accBanners(acc)}
    ${accSummaryStrip(acc)}
    <div class="cd-tabs-wrap" id="acc-detail-tabs">${accTabsBar(acc)}</div>
    <div id="acc-content">${accTabBody(acc)}</div>
  </div>`;
}

function accAttachContent(scope, acc) {
  scope.querySelectorAll(".collapsible-card-head").forEach((btn) => btn.addEventListener("click", () => btn.closest(".collapsible-card").classList.toggle("is-collapsed")));
  scope.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => btn.addEventListener("click", () => copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn))));
  scope.querySelectorAll(".copy-target").forEach((el) => el.addEventListener("click", () => copyTextToClipboard(el.dataset.copyText).then(() => { el.classList.add("is-copied"); setTimeout(() => el.classList.remove("is-copied"), 900); })));
  scope.querySelectorAll("[data-acc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.accHash; }));
  scope.querySelectorAll("[data-acc-balance-edit]").forEach((btn) => btn.addEventListener("click", () => accOpenBalanceEditModal(acc, btn.dataset.accBalanceEdit)));
  const mainEdit = scope.querySelector("[data-acc-edit-main]");
  if (mainEdit) mainEdit.addEventListener("click", () => accOpenEditModal(acc));
  scope.querySelectorAll("[data-acc-set-edit]").forEach((btn) => btn.addEventListener("click", () => accOpenDepositSetEditModal(acc, btn.dataset.accSetEdit)));
  const nz = scope.querySelector("#acc-nonzero");
  if (nz) nz.addEventListener("change", () => { accountBalancesNonZero = nz.checked; accRefreshContent(acc); });
  if (accountDetailTab === "operations") ensureAccountOperationsList(acc).init();
  if (accountDetailTab === "balances") bindExportMenu("acc-bal-export", (format) => exportAccountBalances(acc, format));
}

// ---- Выгрузка балансов счёта (то, что видно в таблице: с учётом "только ненулевые") -------------------------
function exportAccountBalances(acc, format) {
  const x = t("accounts.exportBalances");
  const isReal = acc.kind !== "virtual";
  const list = acc.balances.filter((b) => !accountBalancesNonZero || b.total > 0);
  const rows = list.map((b) => [
    b.id, b.currency, accNetworkOf(b.currency) || "", b.available, b.hold, b.total, accEnum("status", b.status),
    ...(isReal ? [accEnum("balanceType", b.type), (acc.depositSets || []).filter((s) => s.currencies.includes(b.currency)).map((s) => paymentSystemLabel(s.rail)).join(", ")] : []),
    b.description || "",
  ]);
  exportTable(`balances_${acc.code}_${new Date().toISOString().slice(0, 10)}`, format, isReal ? x.columnsReal : x.columns, rows);
  showToast(x.done(rows.length));
}

// ---- Выгрузка операций по счёту: то, что показывает список (поиск, таб статуса, фильтры, сортировка). Одна строка на
// проводку этого счёта в операции. Перед выгрузкой — модалка с итогом. ------------------------------------------------
function openExportAccountOpsModal(acc, format) {
  const list = ensureAccountOperationsList(acc);
  const x = t("accounts.exportOps");
  const count = list.exportRows().length;
  const lines = list.filterLines();
  const tab = list.tabValue();
  if (tab) lines.unshift(`${vt("columns.status")}: ${accEnum("opStatus", tab)}`);
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle,
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(list.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); list.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportAccountOps(acc, format); });
    },
  });
}

function exportAccountOps(acc, format) {
  const x = t("accounts.exportOps");
  const legsKey = acc.kind === "virtual" ? "virtualLegs" : "realLegs";
  const ops = ensureAccountOperationsList(acc).exportRows();
  const rows = [];
  ops.forEach((o) => {
    const base = [o.id, o.name, o.description || "", accEnum("opStatus", o.status), o.externalOperationId || "", o.createdAt];
    const legs = o[legsKey].filter((l) => l.accountId === acc.id);
    if (!legs.length) rows.push([...base, "", "", "", "", ""]);
    legs.forEach((l) => rows.push([...base, l.id, l.currency, accEnum("transferType", l.transferType), l.amount, accEnum("opStatus", l.status)]));
  });
  exportTable(`account_operations_${acc.code}_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(ops.length));
}

function accRefreshContent(acc) {
  document.getElementById("acc-detail-tabs").innerHTML = accTabsBar(acc);
  const content = document.getElementById("acc-content");
  content.innerHTML = accTabBody(acc);
  bindAccTabs(acc);
  accAttachContent(content, acc);
}

function bindAccTabs(acc) {
  document.querySelectorAll("[data-acc-tab]").forEach((btn) => btn.addEventListener("click", () => { accountDetailTab = btn.dataset.accTab; accRefreshContent(acc); }));
}

function initAccountDetail(ref) {
  const acc = ref ? accFind(ref.kind, ref.id) : null;
  const root = document.getElementById("acc-root");
  if (!acc || !root) return;
  document.getElementById("acc-back").addEventListener("click", () => { window.location.hash = acc.kind === "virtual" ? "#/accounts-virtual" : `#/settings-vabs-accounts/${acc.kind}`; });
  bindAccTabs(acc);

  // Меню-троеточие в шапке — тот же паттерн открытия/закрытия по клику вне
  // меню, что и на карточке платежа (operations-payment-detail.js).
  const actionsWrap = document.getElementById("acc-actions");
  if (actionsWrap) {
    const handleOutsideClick = (e) => { if (!actionsWrap.contains(e.target)) closeActionsMenu(); };
    const closeActionsMenu = () => { actionsWrap.classList.remove("is-open"); document.removeEventListener("click", handleOutsideClick, true); };
    document.getElementById("acc-actions-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = actionsWrap.classList.toggle("is-open");
      if (isOpen) setTimeout(() => document.addEventListener("click", handleOutsideClick, true), 0);
      else document.removeEventListener("click", handleOutsideClick, true);
    });
  }

  root.querySelectorAll("[data-acc-action]").forEach((btn) => btn.addEventListener("click", () => { if (actionsWrap) actionsWrap.classList.remove("is-open"); accHandleAction(btn.dataset.accAction, acc); }));
  accAttachContent(root, acc);
}

// ---- Действия --------------------------------------------------------------------------------------------
function accApply(acc, changes) {
  Object.assign(acc, changes);
  acTouch(acc);
  accountDetailKeepTab = true;
  render();
}

// PDF карточки счёта: сводка, основное, балансы, реквизиты (у реального/корреспондентского), связи и последние 10 операций
function exportAccountPdf(acc) {
  const d = t("accounts.detail");
  const hm = t("headerMenu");
  const section = (title, html) => `<section class="pdf-section"><h2>${title}</h2>${html}</section>`;
  const ops = accOperationsForAccount(acc).slice().sort((a, b) => b.createdDate - a.createdDate).slice(0, 10);
  const opsHtml = ops.length
    ? `<table class="data-table"><thead><tr><th>${vt("columns.id")}</th><th>${vt("columns.name")}</th><th>${vt("columns.status")}</th><th>${vt("columns.created")}</th></tr></thead><tbody>${ops
        .map((o) => `<tr><td>${o.id}</td><td>${pdEscape(o.name)}</td><td>${accEnum("opStatus", o.status)}</td><td>${o.createdAt}</td></tr>`)
        .join("")}</tbody></table>`
    : `<div class="pdf-note">${hm.empty}</div>`;
  const name = `${t(`accounts.kind.${acc.kind}`)} ${d.titleSuffix} ${acc.code}`;
  const body = [
    accSummaryStrip(acc),
    accOverviewTab(acc),
    section(d.tabs.balances, accBalancesTab(acc)),
    acc.kind !== "virtual" ? section(d.tabs.requisites, accRequisitesTab(acc)) : "",
    section(d.tabs.linked, accLinkedTab(acc)),
    section(`${d.tabs.operations} (${hm.last10})`, opsHtml),
  ].join("");
  const meta = `${accEnum("status", acc.status)} · ID: ${acc.code} · ${accOwnerLine(acc)} · ${acc.createdAt}`;
  exPrintHtml(exPdfHtml(`${name} | ${acc.code}`, name, meta, body), `${name} | ${acc.code}`);
}

function accHandleAction(action, acc) {  const m = t("accounts.modals");
  const name = acc.code; // счёт не имеет отдельного поля названия — см. шапку accounts.mock.js
  if (action === "exportPdf") return exportAccountPdf(acc);
  if (action === "freeze") return accOpenFreezeModal(acc);
  if (action === "edit") return accOpenEditModal(acc);
  if (action === "activate") {
    return openConfirmModal({ title: m.activateTitle, text: m.activateText(pdEscape(name)), confirmLabel: t("accounts.detail.actions.activate"), cancelLabel: m.cancel, danger: false, onConfirm: () => accApply(acc, { status: "ACTIVE", restrictionReason: null, restrictionDetails: null }) });
  }
  if (action === "close") {
    const warn = accHasFunds(acc) ? `<br><br><span class="acc-warn">${m.closeWarn}</span>` : "";
    return openConfirmModal({ title: m.closeTitle, text: `${m.closeText(pdEscape(name))}${warn}`, confirmLabel: t("accounts.detail.actions.close"), cancelLabel: m.cancel, danger: true, onConfirm: () => requireAdmin2fa("account_close", () => accApply(acc, { status: "CLOSED" })) });
  }
  if (action === "unarchive") {
    return openConfirmModal({ title: m.unarchiveTitle, text: m.unarchiveText(pdEscape(name)), confirmLabel: t("accounts.detail.actions.unarchive"), cancelLabel: m.cancel, danger: false, onConfirm: () => accApply(acc, { status: "ACTIVE", restrictionReason: null, restrictionDetails: null }) });
  }
  if (action === "archive") {
    return openConfirmModal({ title: m.archiveTitle, text: m.archiveText(pdEscape(name)), confirmLabel: t("accounts.detail.actions.archive"), cancelLabel: m.cancel, danger: false, onConfirm: () => accApply(acc, { status: "ARCHIVED" }) });
  }
}

function accOpenFreezeModal(acc) {
  const m = t("accounts.modals");
  openModal({
    title: m.freezeTitle,
    width: 480,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${m.freezeText}</p>
      <label class="filters-field"><span class="filters-field-label">${m.reasonLabel}</span>
        <select class="address-form-input" id="acc-reason"><option value="">—</option>${ACC_RESTRICTION_REASONS.map((r) => `<option value="${r}">${accEnum("restrictionReason", r)}</option>`).join("")}</select></label>
      <label class="filters-field ac-field"><span class="filters-field-label">${m.reasonDetailsLabel}</span><textarea class="form-textarea" id="acc-reason-details" rows="3"></textarea></label>`,
    footerHtml: `<button type="button" class="btn-secondary" id="acc-cancel">${m.cancel}</button><button type="button" class="btn-primary" id="acc-submit">${t("accounts.detail.actions.freeze")}</button>`,
    onMount: (el) => {
      el.querySelector("#acc-cancel").addEventListener("click", closeModal);
      el.querySelector("#acc-submit").addEventListener("click", () => {
        // Причина необязательна: restrictionReason/restrictionDetails в
        // VabsUpdate*AccountInput и в сущности — nullable; если причина указана,
        // она проверяется по динамическому enum AccountRestrictionReasonEnum
        // (справочник значений — "Настройки vABS → Справочники").
        const reason = el.querySelector("#acc-reason").value;
        const details = el.querySelector("#acc-reason-details").value.trim();
        closeModal();
        accApply(acc, { status: "FROZEN", restrictionReason: reason || null, restrictionDetails: details || null });
      });
    },
  });
}

function accOpenEditModal(acc) {
  const m = t("accounts.modals");
  openModal({
    title: m.editTitle,
    width: 480,
    // Редактируемые основные параметры — ровно те, что принимает
    // VabsUpdate(Real|Virtual)AccountInput: description и ledgerType (status/
    // restriction меняются действиями заморозки/закрытия, requisites — отдельно).
    bodyHtml: `<label class="filters-field"><span class="filters-field-label">${m.descriptionLabel}</span><input class="address-form-input" type="text" id="acc-desc" value="${escapeAttr(acc.description || "")}" /></label>
      <label class="filters-field ac-field"><span class="filters-field-label">${m.ledgerLabel}</span>
        <select class="address-form-input" id="acc-ledger">${["ACTIVE", "PASSIVE"].map((v) => `<option value="${v}"${acc.ledgerType === v ? " selected" : ""}>${accEnum("ledger", v)}</option>`).join("")}</select></label>`,
    footerHtml: `<button type="button" class="btn-secondary" id="acc-cancel">${m.cancel}</button><button type="button" class="btn-primary" id="acc-submit">${m.save}</button>`,
    onMount: (el) => {
      el.querySelector("#acc-cancel").addEventListener("click", closeModal);
      el.querySelector("#acc-submit").addEventListener("click", () => {
        const description = el.querySelector("#acc-desc").value.trim();
        const ledgerType = el.querySelector("#acc-ledger").value;
        closeModal();
        accApply(acc, { description: description || null, ledgerType });
      });
    },
  });
}


// ==========================================================================
// ---- Создание счёта: степпер --------------------------------------------
// Основано на реальных мутациях создания (core-feature-dev_bank_core,
// schema.graphql):
// - VabsCreateVirtualAccountInput: category/client/type/ledgerType/description,
//   realAccounts[] (привязка ТОЛЬКО к реальным), virtualBalances[]. Своих
//   реквизитов у виртуального счёта нет — их выдаёт провайдер после создания.
// - VabsCreateRealAccountInput: provider/type/ledgerType, realBalances[],
//   virtualAccounts[] (привязка ТОЛЬКО к виртуальным), depositDetailsClientSets[]
//   — НАБОРЫ реквизитов: валюты (несколько) + схема рельса (фиксированный
//   набор полей) + lookupKey (обязательный "ключ поиска" входящего платежа).
//   Рельсы счёта не выбираются отдельно — это рельсы его наборов.
// - Баланс: валюта + description (VabsCreateRealBalanceInput/VirtualBalance).
//   Открывающей суммы ни одна мутация не принимает — баланс стартует с нуля.
// Категория и тег в мастере не спрашиваются.
// Клиент выбирается из выпадающего списка с поиском (все физлица и компании).
// ==========================================================================

const ACC_TYPE_OPTIONS_BY_KIND = {
  virtual: ["CLIENT", "SYSTEM", "SERVICE"],
  real: ["CLIENT", "EXTERNAL", "SYSTEM", "INTERNAL"],
  correspondent: ["NOSTRO"],
};

function acwEmptyState() {
  return {
    step: 1,
    kind: null,
    type: null,
    ledgerType: "ACTIVE",
    description: "",
    client: null,
    providerId: null,
    currencies: [],
    balanceDesc: {},
    linkedIds: [],
    depositSets: [], // [{ currencies: [], rail: null, fields: {}, lookupKey: "" }]
  };
}

let acwState = acwEmptyState();
let acwNewSeed = 90000;

// Шаги зависят от вида: реквизиты — только у реального/корреспондентского
function acwStepKeys() {
  return acwState.kind === "virtual" || !acwState.kind ? ["kind", "params", "owner", "balances", "summary"] : ["kind", "params", "owner", "balances", "requisites", "summary"];
}
function acwStepKey() {
  return acwStepKeys()[acwState.step - 1];
}

// ---- Мульти-выбор с поиском: панель рисуется в <body> (position: fixed), поэтому
// открывается ПОВЕРХ модалки и не обрезается её прокруткой -------------------------
const ACW_MS = {};
let acwMsOpenId = null;

function acwMsHtml(id, placeholder, cfg) {
  ACW_MS[id] = cfg;
  const sel = cfg.get();
  const labelOf = (v) => (cfg.options().find((o) => o.value === v) || { label: v }).label;
  const chips = sel.length ? sel.map((v) => `<span class="badge badge-neutral">${pdEscape(labelOf(v))}</span>`).join("") : `<span class="table-cell-muted">${placeholder}</span>`;
  return `<button type="button" class="pc-dropdown-trigger acw-ms-trigger" data-acw-ms="${id}"><span class="acw-ms-chips">${chips}</span><span class="pc-dropdown-chevron">${FILTER_GROUP_CHEVRON}</span></button>`;
}

function acwMsClose() {
  const p = document.getElementById("acw-ms-panel");
  if (p) p.remove();
  acwMsOpenId = null;
}

function acwMsReposition() {
  const panel = document.getElementById("acw-ms-panel");
  if (!panel) return;
  const trigger = document.querySelector(`[data-acw-ms="${acwMsOpenId}"]`);
  if (!trigger) return acwMsClose();
  const rect = trigger.getBoundingClientRect();
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.width = `${rect.width}px`;
}

function acwMsOpen(trigger, id, modalEl) {
  acwMsClose();
  const cfg = ACW_MS[id];
  if (!cfg) return;
  const c = t("accounts.create");
  const panel = document.createElement("div");
  panel.id = "acw-ms-panel";
  panel.className = "acw-ms-panel";
  panel.innerHTML = `<input class="address-form-input acw-ms-search" type="text" placeholder="${c.search}" autocomplete="off" /><div class="acw-ms-list"></div>`;
  document.body.appendChild(panel);
  acwMsOpenId = id;
  acwMsReposition();

  const listEl = panel.querySelector(".acw-ms-list");
  const draw = (q) => {
    const sel = cfg.get();
    const ql = (q || "").trim().toLowerCase();
    const opts = cfg.options().filter((o) => !ql || `${o.label} ${o.sub || ""}`.toLowerCase().includes(ql));
    listEl.innerHTML = opts.length
      ? opts.map((o) => `<label class="filter-checkbox-item"><input type="checkbox" value="${escapeAttr(o.value)}"${sel.includes(o.value) ? " checked" : ""} /><span class="filter-checkbox-box"></span><span>${pdEscape(o.label)}</span>${o.sub ? `<span class="table-cell-muted"> · ${pdEscape(o.sub)}</span>` : ""}</label>`).join("")
      : `<div class="table-cell-muted acw-ms-empty">${c.noMatches}</div>`;
  };
  draw("");
  const search = panel.querySelector(".acw-ms-search");
  search.addEventListener("input", () => draw(search.value));
  listEl.addEventListener("change", (e) => {
    const cb = e.target;
    if (!cb.matches("input[type=checkbox]")) return;
    const cur = cfg.get();
    if (cfg.single) {
      // одиночный выбор (клиент): выбор заменяет прежний и закрывает панель
      cfg.set(cb.checked ? [cb.value] : []);
      acwMsClose();
    } else {
      cfg.set(cb.checked ? (cur.includes(cb.value) ? cur : [...cur, cb.value]) : cur.filter((x) => x !== cb.value));
    }
    // панель живёт в <body>, перерисовка шага её не трогает; cfg.onChange — для
    // переиспользования компонента вне мастера счетов (например, ed-adj*
    // в eod.js), по умолчанию — перерисовка шага мастера счетов
    if (cfg.onChange) cfg.onChange(modalEl);
    else acwRenderStep(modalEl);
  });
  search.focus();
}

// Клик по триггеру открывает/закрывает панель; клик вне неё — закрывает
document.addEventListener("click", (e) => {
  if (!acwMsOpenId) return;
  if (e.target.closest("#acw-ms-panel")) return;
  const trig = e.target.closest("[data-acw-ms]");
  if (trig && trig.dataset.acwMs === acwMsOpenId) return; // переключение обработает сам триггер
  if (!trig) acwMsClose();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") acwMsClose(); });
window.addEventListener("scroll", () => acwMsReposition(), true);

function acwBindMs(modalEl) {
  modalEl.querySelectorAll("[data-acw-ms]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.acwMs;
      if (acwMsOpenId === id) acwMsClose();
      else acwMsOpen(btn, id, modalEl);
    });
  });
}

// ---- Шаг: вид счёта --------------------------------------------------------------
function acwStepKindHtml() {
  const c = t("accounts.create");
  const kinds = ["virtual", "real", "correspondent"];
  return `
    <div class="filters-field">
      <span class="filters-field-label">${pcReq(c.kindLabel)}</span>
      <div class="pc-direction-cards">
        ${kinds
          .map(
            (k) => `
          <button type="button" class="pc-direction-card${acwState.kind === k ? " is-active" : ""}" data-acw-kind="${k}">
            <div class="pc-direction-card-title">${t(`accounts.kind.${k}`)}</div>
            <div class="pc-direction-card-desc">${c.kindDesc[k]}</div>
          </button>`
          )
          .join("")}
      </div>
    </div>
    <div class="form-error" id="acw-error" hidden></div>
  `;
}

function acwBindStepKind(modalEl) {
  modalEl.querySelectorAll("[data-acw-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.acwKind;
      Object.assign(acwState, {
        kind,
        type: kind === "correspondent" ? "NOSTRO" : ACC_TYPE_OPTIONS_BY_KIND[kind][0],
        client: null,
        providerId: null,
        currencies: [],
        balanceDesc: {},
        linkedIds: [],
        depositSets: [],
      });
      acwRenderStep(modalEl);
    });
  });
}

// ---- Шаг: параметры --------------------------------------------------------------
function acwStepParamsHtml() {
  const c = t("accounts.create");
  const s = acwState;
  const typeOptions = ACC_TYPE_OPTIONS_BY_KIND[s.kind] || [];
  return `
    <label class="filters-field">
      <span class="filters-field-label">${pcReq(c.typeLabel)}</span>
      <select class="address-form-input" id="acw-type"${s.kind === "correspondent" ? " disabled" : ""}>
        ${typeOptions.map((opt) => `<option value="${opt}"${s.type === opt ? " selected" : ""}>${accEnum("type", opt)}</option>`).join("")}
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${c.ledgerLabel}</span>
      <select class="address-form-input" id="acw-ledger">
        <option value="ACTIVE"${s.ledgerType === "ACTIVE" ? " selected" : ""}>${accEnum("ledger", "ACTIVE")}</option>
        <option value="PASSIVE"${s.ledgerType === "PASSIVE" ? " selected" : ""}>${accEnum("ledger", "PASSIVE")}</option>
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${c.descriptionLabel}</span>
      <input class="address-form-input" type="text" id="acw-desc" value="${escapeAttr(s.description)}" />
    </label>
    <div class="form-error" id="acw-error" hidden></div>
  `;
}

function acwBindStepParams(modalEl) {
  modalEl.querySelector("#acw-type").addEventListener("change", (e) => { acwState.type = e.target.value; });
  modalEl.querySelector("#acw-ledger").addEventListener("change", (e) => { acwState.ledgerType = e.target.value; });
  modalEl.querySelector("#acw-desc").addEventListener("input", (e) => { acwState.description = e.target.value; });
}

// ---- Шаг: владелец / провайдер -----------------------------------------------------
function acwStepOwnerHtml() {
  const c = t("accounts.create");
  const s = acwState;
  if (s.kind === "virtual") {
    // Клиент — выпадающий список с поиском (любой клиент: и физлица, и компании)
    const clientCfg = {
      single: true,
      options: () => [
        ...CLIENTS_USERS_MOCK.map((u) => ({ value: u.id, label: u.fullName || u.email, sub: paymentClientTypeLabel("INDIVIDUAL") })),
        ...CLIENTS_COMPANIES_MOCK.map((co) => ({ value: co.id, label: co.name, sub: paymentClientTypeLabel("CORPORATE") })),
      ],
      get: () => (acwState.client ? [acwState.client.id] : []),
      set: (v) => { acwState.client = v.length ? paymentClientById(v[0]) : null; },
    };
    return `<div class="filters-field"><span class="filters-field-label">${pcReq(c.ownerClientLabel)}</span>${acwMsHtml("client", c.ownerClientPlaceholder, clientCfg)}</div><div class="form-error" id="acw-error" hidden></div>`;
  }
  const provider = s.providerId ? ACC_PROVIDERS.find((p) => p.id === s.providerId) : null;
  return `
    <div class="filters-field">
      <span class="filters-field-label">${pcReq(c.ownerProviderLabel)}</span>
      <div class="pc-dropdown" id="pc-dropdown-acwprovider">
        <button type="button" class="pc-dropdown-trigger" data-pc-dropdown-toggle="acwprovider">
          <span>${provider ? pdEscape(provider.name) : c.ownerProviderPlaceholder}</span>
          <span class="pc-dropdown-chevron">${FILTER_GROUP_CHEVRON}</span>
        </button>
        <div class="pc-dropdown-panel">
          ${ACC_PROVIDERS.map((p) => `<button type="button" class="pc-dropdown-option${s.providerId === p.id ? " is-selected" : ""}" data-acw-provider-pick="${p.id}"><div class="pc-dropdown-option-title">${pdEscape(p.name)}</div></button>`).join("")}
        </div>
      </div>
    </div>
    <div class="form-error" id="acw-error" hidden></div>
  `;
}

function acwBindStepOwner(modalEl) {
  if (acwState.kind === "virtual") {
    acwBindMs(modalEl);
    return;
  }
  modalEl.querySelectorAll("[data-acw-provider-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      acwState.providerId = btn.dataset.acwProviderPick;
      acwState.depositSets = []; // рельсы зависят от провайдера — наборы заводятся заново
      acwRenderStep(modalEl);
    });
  });
}

// ---- Шаг: балансы (валюта + описание) и связанные счета -------------------------
function acwCurrencyOptions() {
  return ACC_CURRENCY_LIST.map((cur) => ({ value: cur, label: cur, sub: accNetworkOf(cur) || "" }));
}

function acwLinkedOptions() {
  // только противоположный вид: у реального/корреспондентского — виртуальные,
  // у виртуального — реальные и корреспондентские
  const list = acwState.kind === "virtual" ? [...ACCOUNTS_REAL_MOCK, ...ACCOUNTS_NOSTRO_MOCK] : ACCOUNTS_VIRTUAL_MOCK;
  return list.map((a) => ({ value: a.id, label: a.code, sub: a.kind === "virtual" ? (a.client ? a.client.name : "") : `${a.provider.name} · ${t(`accounts.kind.${a.kind}`)}` }));
}

function acwStepBalancesHtml() {
  const c = t("accounts.create");
  const s = acwState;
  return `
    <div class="filters-field">
      <span class="filters-field-label">${pcReq(c.currenciesLabel)}</span>
      ${acwMsHtml("currencies", c.currenciesPlaceholder, { options: acwCurrencyOptions, get: () => acwState.currencies, set: (v) => { acwState.currencies = v; } })}
    </div>
    ${
      s.currencies.length
        ? `<div class="filters-field">
            <span class="filters-field-label">${c.balanceDescLabel}</span>
            <div class="acw-bal-rows">${s.currencies
              .map((cur) => `<div class="acw-req-row"><span class="badge badge-neutral acw-bal-cur">${cur}${accNetworkOf(cur) ? ` · ${accNetworkOf(cur)}` : ""}</span><input class="address-form-input" type="text" data-acw-bal-desc="${cur}" placeholder="${c.balanceDescPlaceholder}" value="${escapeAttr(s.balanceDesc[cur] || "")}" /></div>`)
              .join("")}</div>
          </div>`
        : ""
    }
    <div class="filters-field">
      <span class="filters-field-label">${s.kind === "virtual" ? c.linkedRealLabel : c.linkedVirtualLabel}</span>
      ${acwMsHtml("linked", c.linkedPlaceholder, { options: acwLinkedOptions, get: () => acwState.linkedIds, set: (v) => { acwState.linkedIds = v; } })}
    </div>
    <div class="form-error" id="acw-error" hidden></div>
  `;
}

function acwBindStepBalances(modalEl) {
  acwBindMs(modalEl);
  modalEl.querySelectorAll("[data-acw-bal-desc]").forEach((inp) => inp.addEventListener("input", () => { acwState.balanceDesc[inp.dataset.acwBalDesc] = inp.value; }));
}

// ---- Шаг: реквизиты (только реальный/корреспондентский) -----------------------------
// Набор = валюты + рельс + ФИКСИРОВАННЫЕ поля схемы рельса + ключ поиска.
function acwProviderRails() {
  const provider = ACC_PROVIDERS.find((p) => p.id === acwState.providerId);
  return provider ? provider.rails.filter((r) => ACC_DEPOSIT_SCHEMAS[r]) : [];
}

function acwStepRequisitesHtml() {
  const c = t("accounts.create");
  const rf = t("accounts.reqFields");
  const s = acwState;
  const rails = acwProviderRails();
  const setsHtml = s.depositSets.length
    ? s.depositSets
        .map((set, i) => {
          const sch = set.rail ? ACC_DEPOSIT_SCHEMAS[set.rail] : null;
          // без ограничения "валюта ↔ рельс": в реальной форме доступны любые валюты
          const curOpts = () => s.currencies.map((cur) => ({ value: cur, label: cur, sub: accNetworkOf(cur) || "" }));
          const groupsHtml = sch
            ? sch.groups
                .map(
                  (g) => `${g.title ? `<div class="acw-set-group-title">${g.title}</div>` : ""}<div class="acw-set-grid">${g.fields
                    .map((k) => `<label class="filters-field${k === "remittanceInformation" ? " acw-set-full" : ""}"><span class="filters-field-label">${pcReq(rf[k] || k)}</span><input class="address-form-input" type="text" data-acw-set-field="${i}:${k}" placeholder="${escapeAttr(rf[k] || k)}" value="${escapeAttr(set.fields[k] || "")}" /></label>`)
                    .join("")}</div>`
                )
                .join("")
            : "";
          return `
          <div class="pc-section acw-set">
            <div class="acw-set-head"><span class="acw-set-group-title">${c.setGeneral}</span><button type="button" class="icon-btn" data-acw-set-remove="${i}" title="${c.setRemove}">${TRASH_ICON_SVG}</button></div>
            <div class="acw-set-general">
              <div class="filters-field">
                <span class="filters-field-label">${pcReq(c.setCurrencies)}</span>
                ${acwMsHtml(`set-${i}`, c.currenciesPlaceholder, { options: curOpts, get: () => acwState.depositSets[i].currencies, set: (v) => { acwState.depositSets[i].currencies = v; } })}
              </div>
              <div class="filters-field">
                <span class="filters-field-label">${pcReq(c.setRail)}</span>
                <select class="address-form-input" data-acw-set-rail="${i}">
                  <option value="">${c.setRailPlaceholder}</option>
                  ${rails.map((r) => `<option value="${r}"${set.rail === r ? " selected" : ""}>${paymentSystemLabel(r)}</option>`).join("")}
                </select>
              </div>
              <div class="filters-field">
                <span class="filters-field-label">${pcReq(rf.lookupKey)}</span>
                <input class="address-form-input" type="text" data-acw-set-lookup="${i}" placeholder="${escapeAttr(rf.lookupKey)}" value="${escapeAttr(set.lookupKey)}" />
              </div>
            </div>
            ${groupsHtml}
          </div>`;
        })
        .join("")
    : `<div class="table-cell-muted">${c.setsEmpty}</div>`;
  return `
    <div class="filters-field">
      <span class="filters-field-label">${c.setsLabel}</span>
      <p class="table-cell-muted">${c.setsIntro}</p>
      <div class="acw-sets">${setsHtml}</div>
      ${rails.length ? `<button type="button" class="table-link" id="acw-set-add">${c.setAdd}</button>` : `<div class="table-cell-muted">${c.noRailsForProvider}</div>`}
    </div>
    <div class="form-error" id="acw-error" hidden></div>
  `;
}

function acwBindStepRequisites(modalEl) {
  acwBindMs(modalEl);
  const add = modalEl.querySelector("#acw-set-add");
  if (add) add.addEventListener("click", () => { acwState.depositSets.push({ currencies: [], rail: null, fields: {}, lookupKey: "" }); acwRenderStep(modalEl); });
  modalEl.querySelectorAll("[data-acw-set-remove]").forEach((btn) => btn.addEventListener("click", () => { acwState.depositSets.splice(+btn.dataset.acwSetRemove, 1); acwMsClose(); acwRenderStep(modalEl); }));
  modalEl.querySelectorAll("[data-acw-set-rail]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const set = acwState.depositSets[+sel.dataset.acwSetRail];
      set.rail = sel.value || null;
      set.fields = {};
      set.lookupKey = "";
      acwRenderStep(modalEl);
    });
  });
  modalEl.querySelectorAll("[data-acw-set-field]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const [i, k] = inp.dataset.acwSetField.split(":");
      const set = acwState.depositSets[+i];
      set.fields[k] = inp.value;
      // ключ поиска по умолчанию — значение поля-идентификатора схемы (номер счёта / телефон / адрес)
      const sch = ACC_DEPOSIT_SCHEMAS[set.rail];
      if (sch && sch.lookup === k && !set.lookupTouched) {
        set.lookupKey = inp.value;
        const lk = modalEl.querySelector(`[data-acw-set-lookup="${i}"]`);
        if (lk) lk.value = inp.value;
      }
    });
  });
  modalEl.querySelectorAll("[data-acw-set-lookup]").forEach((inp) => inp.addEventListener("input", () => {
    const set = acwState.depositSets[+inp.dataset.acwSetLookup];
    set.lookupKey = inp.value;
    set.lookupTouched = true;
  }));
}

// ---- Шаг: итог -----------------------------------------------------------------------
function acwStepSummaryHtml() {
  const c = t("accounts.create");
  const rf = t("accounts.reqFields");
  const s = acwState;
  const provider = s.providerId ? ACC_PROVIDERS.find((p) => p.id === s.providerId) : null;
  const row = (label, value) => `<div class="profile-field"><span class="profile-field-label">${label}</span><span class="profile-field-value">${value}</span></div>`;
  const balances = s.currencies.map((cur) => `${cur}${s.balanceDesc[cur] ? ` — ${pdEscape(s.balanceDesc[cur])}` : ""}`).join("<br>");
  const sets = s.depositSets.map((set) => `${set.currencies.join(", ")} · ${paymentSystemLabel(set.rail)} · ${rf.lookupKey}: ${pdEscape(set.lookupKey)}`).join("<br>");
  return `
    <div class="profile-fields profile-fields-grid">
      ${row(c.kindLabel, t(`accounts.kind.${s.kind}`))}
      ${row(c.typeLabel, accEnum("type", s.type))}
      ${row(c.ledgerLabel, accEnum("ledger", s.ledgerType))}
      ${row(c.descriptionLabel, s.description ? pdEscape(s.description) : t("accounts.noValue"))}
      ${s.kind === "virtual" ? row(c.ownerClientLabel, s.client ? pdEscape(s.client.name) : t("accounts.noValue")) : row(c.ownerProviderLabel, provider ? pdEscape(provider.name) : t("accounts.noValue"))}
      ${row(c.currenciesLabel, balances || t("accounts.noValue"))}
      ${row(c.linkedLabel, String(s.linkedIds.length))}
      ${s.kind !== "virtual" ? row(c.setsLabel, sets || t("accounts.noValue")) : ""}
    </div>
    <div class="form-error" id="acw-error" hidden></div>
  `;
}

// ---- Каркас степпера (тот же паттерн, что и мастер платежа) --------------------------
function acwStepperHtml() {
  const c = t("accounts.create");
  const steps = acwStepKeys().map((k, i) => ({ n: i + 1, label: c.steps[k] }));
  return `
    <div class="kyc-stepper">
      ${steps
        .map((st, idx) => {
          const cls = st.n < acwState.step ? "is-done" : st.n === acwState.step ? "is-current" : "is-pending";
          return `
            <div class="kyc-stepper-item">
              <div class="kyc-stepper-circle ${cls}">${st.n < acwState.step ? CHECK_ICON_SVG : `<span>${st.n}</span>`}</div>
              ${idx < steps.length - 1 ? `<div class="kyc-stepper-line${st.n < acwState.step ? " is-done" : ""}"></div>` : ""}
              <div class="kyc-stepper-label"><div class="kyc-stepper-title">${st.label}</div></div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function acwStepBodyHtml() {
  const key = acwStepKey();
  const inner =
    key === "kind" ? acwStepKindHtml()
    : key === "params" ? acwStepParamsHtml()
    : key === "owner" ? acwStepOwnerHtml()
    : key === "balances" ? acwStepBalancesHtml()
    : key === "requisites" ? acwStepRequisitesHtml()
    : acwStepSummaryHtml();
  return `<div class="pc-form-stack">${inner}</div>`;
}

function acwBindStep(modalEl) {
  const key = acwStepKey();
  if (key === "kind") acwBindStepKind(modalEl);
  else if (key === "params") acwBindStepParams(modalEl);
  else if (key === "owner") acwBindStepOwner(modalEl);
  else if (key === "balances") acwBindStepBalances(modalEl);
  else if (key === "requisites") acwBindStepRequisites(modalEl);
}

function acwFooterHtml() {
  const c = t("accounts.create");
  const isLast = acwState.step === acwStepKeys().length;
  const backBtn = acwState.step > 1 ? `<button type="button" class="btn-secondary" id="acw-back">${c.back}</button>` : `<button type="button" class="btn-secondary" id="acw-cancel">${c.cancel}</button>`;
  return `${backBtn}<button type="button" class="btn-primary" id="acw-next">${isLast ? c.create : c.next}</button>`;
}

function acwRenderStep(modalEl) {
  const root = modalEl.id === "app-modal" ? modalEl : document.getElementById("app-modal");
  root.querySelector(".modal-body").innerHTML = `${acwStepperHtml()}${acwStepBodyHtml()}`;
  root.querySelector(".modal-footer").innerHTML = acwFooterHtml();
  acwBindStepChrome(root);
  acwBindStep(root);
  acwMsReposition(); // открытая панель мульти-выбора остаётся привязана к своему триггеру
}

function acwBindStepChrome(modalEl) {
  const cancelBtn = modalEl.querySelector("#acw-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  const backBtn = modalEl.querySelector("#acw-back");
  if (backBtn) backBtn.addEventListener("click", () => { acwMsClose(); acwState.step -= 1; acwRenderStep(modalEl); });
  modalEl.querySelector("#acw-next").addEventListener("click", () => acwGoNext(modalEl));
}

function acwFail(modalEl, msg) {
  const errEl = modalEl.querySelector("#acw-error");
  if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
}

function acwValidateStep() {
  const c = t("accounts.create");
  const s = acwState;
  const key = acwStepKey();
  if (key === "kind") return s.kind ? null : c.errKind;
  if (key === "params") return s.type ? null : c.errType;
  if (key === "owner") {
    if (s.kind === "virtual") return s.client ? null : c.errClient; // client обязателен при любом типе (VabsCreateVirtualAccountInput.client: !)
    return s.providerId ? null : c.errProvider;
  }
  if (key === "balances") return s.currencies.length ? null : c.errCurrencies;
  if (key === "requisites") {
    for (const set of s.depositSets) {
      if (!set.rail) return c.errSetRail;
      if (!set.currencies.length) return c.errSetCurrencies;
      const sch = ACC_DEPOSIT_SCHEMAS[set.rail];
      if (sch.fields.some((k) => accDepositRequired(set.rail, k) && !(set.fields[k] || "").trim())) return c.errSetFields;
      if (!set.lookupKey.trim()) return c.errSetLookup;
    }
  }
  return null;
}

function acwGoNext(modalEl) {
  const err = acwValidateStep();
  if (err) return acwFail(modalEl, err);
  acwMsClose();
  if (acwState.step < acwStepKeys().length) {
    acwState.step += 1;
    acwRenderStep(modalEl);
    return;
  }
  acwSubmit();
}

// ---- Отправка: строка той же формы, что и остальные записи мока; связи —
// симметричные (как у генератора мока) ------------------------------------------------------
function acwSubmit() {
  const s = acwState;
  const now = new Date();
  const id = seedToPaymentUuid(acwNewSeed);
  const balances = accMakeBalances(s.currencies, acwNewSeed, { zero: true });
  balances.forEach((b) => { b.description = (s.balanceDesc[b.currency] || "").trim() || null; });
  acwNewSeed += 1;

  const base = {
    id,
    kind: s.kind,
    type: s.type,
    ledgerType: s.ledgerType,
    status: "ACTIVE",
    tag: null,
    description: s.description.trim() || null,
    balances,
    restrictionReason: null,
    restrictionDetails: null,
    references: [],
    errorMessages: [],
    linkedIds: [...s.linkedIds],
    createdDate: now,
    createdAt: formatDateTime(now),
    updatedDate: now,
    updatedAt: formatDateTime(now),
  };

  let row;
  if (s.kind === "virtual") {
    row = { ...base, client: s.client, category: "PRIMARY", depositDetails: [], parentId: null };
    ACCOUNTS_VIRTUAL_MOCK.push(row);
  } else {
    const provider = ACC_PROVIDERS.find((p) => p.id === s.providerId);
    const depositSets = s.depositSets.map((set, i) => ({
      id: seedToPaymentUuid(40000 + acwNewSeed * 10 + i),
      currencies: [...set.currencies],
      rail: set.rail,
      fields: ACC_DEPOSIT_SCHEMAS[set.rail].fields.map((k) => [k, (set.fields[k] || "").trim()]),
      lookupKey: set.lookupKey.trim(),
    }));
    row = {
      ...base,
      provider,
      providerExternalId: `EXT-${(acwNewSeed * 7919) % 90000 + 10000}`,
      rails: [...new Set(depositSets.map((x) => x.rail))],
      depositSets,
      client: null,
    };
    if (s.kind === "correspondent") ACCOUNTS_NOSTRO_MOCK.push(row);
    else ACCOUNTS_REAL_MOCK.push(row);
  }

  row.linkedIds.forEach((linkedId) => {
    const other = accFind("all", linkedId);
    if (other && !other.linkedIds.includes(row.id)) other.linkedIds.push(row.id);
  });
  ACCOUNT_TRANSACTIONS[row.id] = [];

  closeModal();
  window.location.hash = accHref(row);
}

function openCreateAccountModal(initialKind) {
  acwState = acwEmptyState();
  acwMsClose();
  if (initialKind) {
    acwState.kind = initialKind;
    acwState.type = initialKind === "correspondent" ? "NOSTRO" : ACC_TYPE_OPTIONS_BY_KIND[initialKind][0];
  }
  const c = t("accounts.create");
  openModal({
    title: c.title,
    width: 720,
    bodyHtml: `${acwStepperHtml()}${acwStepBodyHtml()}`,
    footerHtml: acwFooterHtml(),
    onMount: (modalEl) => {
      pcBindDropdowns(modalEl);
      acwBindStepChrome(modalEl);
      acwBindStep(modalEl);
    },
  });
}

