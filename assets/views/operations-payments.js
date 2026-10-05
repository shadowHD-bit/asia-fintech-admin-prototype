/* ==========================================================================
   Вьюха "Операции → Платежи" (список).
   Данные — assets/mock/operations-payments.mock.js, схема сверена чтением
   бэкенда 21.09.2026 (`payments`/`FindPaymentsInput`/`CommonPaymentType`,
   core-feature-dev_bank_core) — см. подробный комментарий в начале мок-файла.
   Переиспользует хелперы из views/clients-users.js и views/clients-companies.js
   (dateTimeCell, renderPager, checkboxOptionsHtml, FILTER_GROUP_CHEVRON,
   openModal и т.д.) — они уже в общей области видимости.

   Важное отличие от Клиентов/Компаний: в FindPaymentsInput НЕТ ни поля для
   сортировки, ни фильтра по сумме — поэтому здесь тоже нет ни сортируемых
   колонок, ни диапазона суммы в фильтрах. Не добавляем того, чего не
   отдаёт реальная ручка.
   ========================================================================== */

const operationsPaymentsState = {
  search: "",
  directions: [],
  paymentSystems: [],
  networks: [], // только криптоплатежи: сеть (cryptoWallet.networkName)
  currencies: [],
  statuses: [],
  senderClientIds: [],
  recipientClientIds: [],
  createdFrom: null,
  createdTo: null,
  settledFrom: null,
  settledTo: null,
  sortBy: null, // 'amount' | 'createdAt' | 'updatedAt'
  sortDir: "desc",
  page: 1,
  pageSize: 10,
};

// ---- Фиатные / крипто-платежи: один и тот же экран на двух маршрутах ---------------------------
// Крипто-платёж — рельс CRYPTO_WALLET (CRYPTO_ACQUIRING пока не рассматриваем), остальное — фиат. Отдельного
// признака "крипто" в API нет — он выводится из рельса (paymentSystem).
let paymentsListKind = "fiat"; // "fiat" | "crypto"

function isCryptoPayment(row) {
  return row.paymentSystem === "CRYPTO_WALLET";
}

function paymentsDataset() {
  return OPERATIONS_PAYMENTS_MOCK.filter((r) => isCryptoPayment(r) === (paymentsListKind === "crypto"));
}

// Маршрут списка, к которому относится платёж (для подсветки в сайдбаре и хлебных крошек)
function paymentListRouteId(ref) {
  if (ref.section === "payments") {
    const row = findPaymentRow(ref);
    if (row && isCryptoPayment(row)) return "operations-crypto-payments";
  }
  return `operations-${ref.section}`;
}

// Выделение строк для массовых действий — id-шники платежей, живёт независимо
// от пагинации/фильтров (не сбрасывается при смене страницы).
let paymentsSelectedIds = new Set();

// Статусы, для которых допустимы "Одобрить"/"Отклонить" — тот же набор, что
// и в шапке карточки платежа (canReview, operations-payment-detail.js):
// DRAFT/PROCESSING/ON_REVIEW/NEED_ACTION не финальны, SUCCESSFUL/REFUNDED/
// DECLINED — финальны (PaymentStatusEnum, common-payments-plugin).
const PAYMENT_NON_FINAL_STATUSES = ["DRAFT", "PROCESSING", "ON_REVIEW", "NEED_ACTION"];

function paymentStatusLabel(status) {
  return t(`paymentStatus.${status}`);
}

function paymentDirectionLabel(direction) {
  return t(`paymentDirection.${direction}`);
}

// "Поток" платежа: входящий / исходящий / внутренний. Фиат: direction INCOMING/OUTGOING, а BOTH — внутренние
// рельсы (INNER/OTC и т.п., обе стороны наши). Крипто (CRYPTO_WALLET): по типу операции — ввод = внешний входящий,
// вывод = внешний исходящий, перевод между клиентами = внутренний. Внешние называются "внешними" в противовес внутренним.
const PAYMENT_FLOW_OPTIONS = ["INCOMING", "OUTGOING", "INTERNAL"];

function paymentFlow(row) {
  if (row.cryptoOperationType) {
    return { CUSTOMER_DEPOSIT: "INCOMING", CUSTOMER_WITHDRAWAL: "OUTGOING", CUSTOMER_TRANSFER: "INTERNAL" }[row.cryptoOperationType] || "INTERNAL";
  }
  return row.direction === "BOTH" || PAYMENT_BOTH_INTERNAL_SYSTEMS.includes(row.paymentSystem) ? "INTERNAL" : row.direction;
}

function paymentFlowLabel(flow) {
  return t(`operationsPayments.${paymentsListKind === "crypto" ? "flowCrypto" : "flow"}.${flow}`);
}

// row (если передан) определяет вид платежа сам — на карточке платежа списка-контекста нет
function paymentFlowOneLabel(flow, row) {
  const crypto = row ? isCryptoPayment(row) : paymentsListKind === "crypto";
  return t(`operationsPayments.${crypto ? "flowOneCrypto" : "flowOne"}.${flow}`);
}

function paymentSystemLabel(system) {
  return t(`paymentSystem.${system}`);
}

function paymentClientTypeLabel(type) {
  return t(`paymentClientType.${type}`);
}

function paymentStatusBadgeClass(status) {
  if (status === "SUCCESSFUL") return "badge-success";
  if (status === "DECLINED") return "badge-danger";
  if (status === "REFUNDED") return "badge-info";
  if (status === "PROCESSING" || status === "ON_REVIEW" || status === "NEED_ACTION") return "badge-warning";
  return "badge-neutral"; // DRAFT
}

function formatPaymentAmount(n) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Фильтрация -------------------------------------------------------------------
// Поиск в строке — только по ID платежа (раньше искал ещё и по отправителю/
// получателю/назначению, что не давало точного попадания в длинном списке);
// отправитель/получатель — отдельные фильтры-мультиселекты с поиском по имени
// в панели фильтров (paymentPartyFilterListHtml).
function matchesPaymentFilters(row, { ignoreStatus } = {}) {
  const s = operationsPaymentsState;
  const search = s.search.trim().toLowerCase();

  if (search && !row.id.toLowerCase().includes(search)) return false;
  if (s.directions.length && !s.directions.includes(paymentFlow(row))) return false;
  if (s.paymentSystems.length && !s.paymentSystems.includes(row.paymentSystem)) return false;
  if (s.networks.length && !s.networks.includes(row.cryptoWallet && row.cryptoWallet.networkName)) return false;
  if (s.currencies.length && !s.currencies.includes(row.sourceCurrency)) return false;
  if (s.senderClientIds.length && !s.senderClientIds.includes(row.senderClientId)) return false;
  if (s.recipientClientIds.length && !s.recipientClientIds.includes(row.recipientClientId)) return false;
  if (!ignoreStatus && s.statuses.length && !s.statuses.includes(row.status)) return false;
  if (s.createdFrom && row.createdDate < s.createdFrom) return false;
  if (s.createdTo && row.createdDate > s.createdTo) return false;
  if (s.settledFrom && (!row.settledDate || row.settledDate < s.settledFrom)) return false;
  if (s.settledTo && (!row.settledDate || row.settledDate > s.settledTo)) return false;
  return true;
}

function getFilteredOperationsPayments() {
  return paymentsDataset().filter((row) => matchesPaymentFilters(row));
}

// ВНИМАНИЕ: в реальном FindPaymentsInput поля сортировки НЕТ (проверено) —
// сортировка ниже работает только на клиенте поверх мока; для реальной ручки
// потребуется добавить sort в инпут на бэкенде. По умолчанию — новые сверху.
function getSortedOperationsPayments(list) {
  const { sortBy, sortDir } = operationsPaymentsState;
  if (!sortBy) return [...list].sort((a, b) => b.createdDate - a.createdDate);
  const dir = sortDir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sortBy === "amount") return (a.sourceAmount - b.sourceAmount) * dir;
    // Не зачисленные (settledDate === null) — всегда в конце, независимо от направления сортировки.
    if (sortBy === "settledAt") {
      if (!a.settledDate && !b.settledDate) return 0;
      if (!a.settledDate) return 1;
      if (!b.settledDate) return -1;
      return (a.settledDate - b.settledDate) * dir;
    }
    return (a.createdDate - b.createdDate) * dir;
  });
}

function paymentsSortableHeader(key, label) {
  const s = operationsPaymentsState;
  const active = s.sortBy === key;
  const icon = active ? (s.sortDir === "asc" ? SORT_ICON_ASC : SORT_ICON_DESC) : SORT_ICON_NEUTRAL;
  return `<th><button type="button" class="th-sort${active ? " is-active" : ""}" data-sort="${key}">${label}<span class="th-sort-icon">${icon}</span></button></th>`;
}

function quickPaymentStatusTabCount(status) {
  const matching = paymentsDataset().filter((row) => matchesPaymentFilters(row, { ignoreStatus: true }));
  if (!status) return matching.length;
  return matching.filter((row) => row.status === status).length;
}

// ---- Быстрые табы статуса ----------------------------------------------------------
const QUICK_PAYMENT_STATUS_TABS = ["SUCCESSFUL", "PROCESSING", "ON_REVIEW", "DECLINED", "REFUNDED"];

function renderQuickPaymentStatusTabs() {
  const s = operationsPaymentsState;
  const isAllActive = s.statuses.length === 0;
  const tabsHtml = [
    `<button type="button" class="quick-tab${isAllActive ? " is-active" : ""}" data-quick-status="">${t("operationsPayments.filters.allTab")}<span class="quick-tab-count">${quickPaymentStatusTabCount(null)}</span></button>`,
    ...QUICK_PAYMENT_STATUS_TABS.map((st) => {
      const isActive = s.statuses.length === 1 && s.statuses[0] === st;
      return `<button type="button" class="quick-tab${isActive ? " is-active" : ""}" data-quick-status="${st}">${paymentStatusLabel(st)}<span class="quick-tab-count">${quickPaymentStatusTabCount(st)}</span></button>`;
    }),
  ].join("");
  return `<div class="quick-tabs" id="op-quick-tabs">${tabsHtml}</div>`;
}

function attachQuickPaymentStatusTabsHandlers() {
  const wrap = document.getElementById("op-quick-tabs");
  if (!wrap) return;
  wrap.querySelectorAll(".quick-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      operationsPaymentsState.statuses = btn.dataset.quickStatus ? [btn.dataset.quickStatus] : [];
      operationsPaymentsState.page = 1;
      updateOperationsPaymentsTable();
      refreshPaymentsFiltersChrome();
    });
  });
}

// ---- Кнопка «Фильтры» + чипы --------------------------------------------------------
function activePaymentsFilterCount() {
  const s = operationsPaymentsState;
  let n = 0;
  if (s.directions.length) n++;
  if (s.paymentSystems.length) n++;
  if (s.networks.length) n++;
  if (s.currencies.length) n++;
  if (s.senderClientIds.length) n++;
  if (s.recipientClientIds.length) n++;
  if (s.createdFrom || s.createdTo) n++;
  if (s.settledFrom || s.settledTo) n++;
  return n;
}

function directionFilterLabel(values) {
  return multiSelectLabel(values, t("operationsPayments.filters.allDirections"), paymentFlowLabel);
}

function paymentSystemFilterLabel(values) {
  return multiSelectLabel(values, t("operationsPayments.filters.allSystems"), paymentSystemLabel);
}

function currencyFilterLabel(values) {
  return multiSelectLabel(values, t("operationsPayments.filters.allCurrencies"), (v) => v);
}

// ---- Отправитель/получатель — фильтр-мультиселект с поиском по имени -------------
// Опции — только реально наши клиенты (clientId есть), уникальные по id;
// внешнюю сторону (см. paymentExternalPartyRef в моке) фильтром выбрать нельзя —
// это не устойчивая сущность, у каждого платежа она генерируется заново.
function paymentPartyOptions(side) {
  const map = new Map();
  paymentsDataset().forEach((r) => {
    const id = r[`${side}ClientId`];
    const name = r[`${side}ClientName`];
    if (id && name && !map.has(id)) map.set(id, name);
  });
  return [...map.entries()].map(([id, name]) => ({ value: id, label: name }));
}

function paymentPartyNameById(side, id) {
  const found = OPERATIONS_PAYMENTS_MOCK.find((r) => r[`${side}ClientId`] === id);
  return found ? found[`${side}ClientName`] : id;
}

function senderFilterLabel(values) {
  return multiSelectLabel(values, "", (id) => paymentPartyNameById("sender", id));
}

function recipientFilterLabel(values) {
  return multiSelectLabel(values, "", (id) => paymentPartyNameById("recipient", id));
}

function renderPaymentsFilterTriggerContent() {
  const f = t("operationsPayments.filters");
  const count = activePaymentsFilterCount();
  return `
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h14M6 10h8M8.5 15.5h3"/></svg>
    <span>${f.filterButton}</span>
    ${count ? `<span class="filter-badge">${count}</span>` : ""}
  `;
}

function renderPaymentsFilterChips() {
  const s = operationsPaymentsState;
  const f = t("operationsPayments.filters");
  const chips = [];

  if (s.directions.length) chips.push({ key: "direction", label: `${f.direction}: ${directionFilterLabel(s.directions)}` });
  if (s.paymentSystems.length) chips.push({ key: "paymentSystem", label: `${f.paymentSystem}: ${paymentSystemFilterLabel(s.paymentSystems)}` });
  if (s.networks.length) chips.push({ key: "network", label: `${f.network}: ${s.networks.join(", ")}` });
  if (s.currencies.length) chips.push({ key: "currency", label: `${f.currency}: ${currencyFilterLabel(s.currencies)}` });
  if (s.senderClientIds.length) chips.push({ key: "sender", label: `${f.sender}: ${senderFilterLabel(s.senderClientIds)}` });
  if (s.recipientClientIds.length) chips.push({ key: "recipient", label: `${f.recipient}: ${recipientFilterLabel(s.recipientClientIds)}` });
  if (s.createdFrom || s.createdTo) chips.push({ key: "createdAt", label: `${f.createdAt}: ${dateTriggerLabel(s.createdFrom, s.createdTo)}` });
  if (s.settledFrom || s.settledTo) chips.push({ key: "settledAt", label: `${f.settledAt}: ${dateTriggerLabel(s.settledFrom, s.settledTo)}` });

  if (!chips.length) return `<div class="filter-chips" id="op-filter-chips"></div>`;

  return `
    <div class="filter-chips" id="op-filter-chips">
      ${chips
        .map(
          (c) => `
            <span class="filter-chip">
              ${c.label}
              <button type="button" class="filter-chip-remove" data-chip="${c.key}">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
              </button>
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function clearPaymentsFilterDimension(key) {
  const s = operationsPaymentsState;
  if (key === "direction") s.directions = [];
  else if (key === "paymentSystem") s.paymentSystems = [];
  else if (key === "network") s.networks = [];
  else if (key === "currency") s.currencies = [];
  else if (key === "sender") s.senderClientIds = [];
  else if (key === "recipient") s.recipientClientIds = [];
  else if (key === "createdAt") { s.createdFrom = null; s.createdTo = null; }
  else if (key === "settledAt") { s.settledFrom = null; s.settledTo = null; }
  s.page = 1;
  updateOperationsPaymentsTable();
  refreshPaymentsFiltersChrome();
}

function attachPaymentsFilterChipsHandlers() {
  const wrap = document.getElementById("op-filter-chips");
  if (!wrap) return;
  wrap.querySelectorAll(".filter-chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => clearPaymentsFilterDimension(btn.dataset.chip));
  });
}

function renderOperationsPaymentsFilters() {
  const f = t("operationsPayments.filters");
  const hasSearch = operationsPaymentsState.search.length > 0;

  return `
    ${renderQuickPaymentStatusTabs()}
    <div class="filters-bar-compact">
      <div class="filters-search">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5.5"/><path d="m17 17-3.5-3.5"/></svg>
        <input type="text" id="op-filter-search" placeholder="${f.searchPlaceholder}" value="${operationsPaymentsState.search}" />
        <button type="button" class="filters-search-clear" id="op-filter-search-clear"${hasSearch ? "" : " hidden"}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <button type="button" class="filter-trigger" id="op-filter-trigger">${renderPaymentsFilterTriggerContent()}</button>
    </div>
    ${renderPaymentsFilterChips()}
  `;
}

function attachOperationsPaymentsFilterHandlers() {
  const searchEl = document.getElementById("op-filter-search");
  const clearBtn = document.getElementById("op-filter-search-clear");

  const applySearch = () => {
    operationsPaymentsState.search = searchEl.value;
    operationsPaymentsState.page = 1;
    clearBtn.hidden = searchEl.value.length === 0;
    updateOperationsPaymentsTable();
  };

  searchEl.addEventListener("input", applySearch);

  clearBtn.addEventListener("click", () => {
    searchEl.value = "";
    searchEl.focus();
    applySearch();
  });

  document.getElementById("op-filter-trigger").addEventListener("click", openPaymentsFiltersDrawer);

  attachQuickPaymentStatusTabsHandlers();
  attachPaymentsFilterChipsHandlers();
}

function refreshPaymentsFiltersChrome() {
  const triggerBtn = document.getElementById("op-filter-trigger");
  if (triggerBtn) triggerBtn.innerHTML = renderPaymentsFilterTriggerContent();

  const quickWrap = document.getElementById("op-quick-tabs");
  if (quickWrap) {
    quickWrap.outerHTML = renderQuickPaymentStatusTabs();
    attachQuickPaymentStatusTabsHandlers();
  }

  const chipsWrap = document.getElementById("op-filter-chips");
  if (chipsWrap) {
    chipsWrap.outerHTML = renderPaymentsFilterChips();
    attachPaymentsFilterChipsHandlers();
  }

  refreshPaymentMetrics();
}

function resetOperationsPaymentsFilters() {
  const s = operationsPaymentsState;
  s.directions = [];
  s.paymentSystems = [];
  s.networks = [];
  s.currencies = [];
  s.senderClientIds = [];
  s.recipientClientIds = [];
  s.createdFrom = null;
  s.createdTo = null;
  s.settledFrom = null;
  s.settledTo = null;
  s.page = 1;
  updateOperationsPaymentsTable();
}

function resetAllOperationsPaymentsFilters() {
  operationsPaymentsState.search = "";
  const searchEl = document.getElementById("op-filter-search");
  if (searchEl) searchEl.value = "";
  const clearBtn = document.getElementById("op-filter-search-clear");
  if (clearBtn) clearBtn.hidden = true;
  resetOperationsPaymentsFilters();
  refreshPaymentsFiltersChrome();
}

// ---- Боковая панель «Фильтры» — тот же паттерн, что у пользователей/компаний:
// аккордеон групп + черновик, применяемый только по кнопке "Показать результаты".
// Статуса здесь нет — он вынесен наружу быстрыми табами. ---------------------------
// Набор групп зависит от списка: у фиата — платёжная система и валюта (без крипто-рельса и USDT), у крипто рельс и валюта
// одни (CRYPTO_WALLET / USDT), поэтому вместо них — сеть.
function paymentsFilterGroupDefs() {
  const crypto = paymentsListKind === "crypto";
  return [
    { id: "direction", labelKey: "direction" },
    ...(crypto ? [{ id: "network", labelKey: "network" }] : [{ id: "paymentSystem", labelKey: "paymentSystem" }, { id: "currency", labelKey: "currency" }]),
    { id: "sender", labelKey: "sender" },
    { id: "recipient", labelKey: "recipient" },
    { id: "createdAt", labelKey: "createdAt" },
    { id: "settledAt", labelKey: "settledAt" },
  ];
}

let opFilterDraft = null;

function clonePaymentsFilterDraft(s) {
  return {
    directions: [...s.directions],
    paymentSystems: [...s.paymentSystems],
    networks: [...s.networks],
    currencies: [...s.currencies],
    senderClientIds: [...s.senderClientIds],
    recipientClientIds: [...s.recipientClientIds],
    createdFrom: s.createdFrom,
    createdTo: s.createdTo,
    settledFrom: s.settledFrom,
    settledTo: s.settledTo,
  };
}

function paymentsFilterGroupActiveCount(groupId) {
  const d = opFilterDraft;
  if (groupId === "direction") return d.directions.length;
  if (groupId === "paymentSystem") return d.paymentSystems.length;
  if (groupId === "network") return d.networks.length;
  if (groupId === "currency") return d.currencies.length;
  if (groupId === "sender") return d.senderClientIds.length;
  if (groupId === "recipient") return d.recipientClientIds.length;
  if (groupId === "createdAt") return d.createdFrom || d.createdTo ? 1 : 0;
  if (groupId === "settledAt") return d.settledFrom || d.settledTo ? 1 : 0;
  return 0;
}

// Отправитель/получатель — поиск по имени с живым фильтром списка (см.
// paymentPartyFilterListHtml/attachPartySearchHandlers) вместо статичного
// списка чекбоксов на все значения сразу: вариантов может быть много
// (по числу разных клиентов в платежах), в отличие от закрытых enum'ов
// направления/системы/валюты.
function paymentPartyFilterListHtml(side, query, selected) {
  const q = (query || "").trim().toLowerCase();
  const options = paymentPartyOptions(side).filter((o) => !q || o.label.toLowerCase().includes(q));
  if (!options.length) return `<div class="table-cell-muted filter-search-empty">${t("operationsPayments.filters.noMatches")}</div>`;
  return checkboxOptionsHtml(options, selected, side === "sender" ? "sender" : "recipient");
}

function paymentPartyFilterBodyHtml(side, selected) {
  return `
    <div class="filter-search-box">
      <input type="text" class="address-form-input" id="op-drawer-${side}-search" placeholder="${t("operationsPayments.filters.partySearchPlaceholder")}" />
    </div>
    <div class="filter-search-list" id="op-drawer-${side}-list">${paymentPartyFilterListHtml(side, "", selected)}</div>
  `;
}

function paymentsFilterGroupBodyHtml(groupId) {
  const d = opFilterDraft;
  if (groupId === "direction") return checkboxOptionsHtml(PAYMENT_FLOW_OPTIONS.map((v) => ({ value: v, label: paymentFlowLabel(v) })), d.directions, groupId);
  if (groupId === "paymentSystem") return checkboxOptionsHtml(PAYMENT_SYSTEM_ALL_OPTIONS.filter((v) => !v.startsWith("CRYPTO")).map((v) => ({ value: v, label: paymentSystemLabel(v) })), d.paymentSystems, groupId);
  if (groupId === "network") return checkboxOptionsHtml(PAYMENT_CRYPTO_NETWORKS.map((v) => ({ value: v, label: v })), d.networks, groupId);
  if (groupId === "currency") return checkboxOptionsHtml(PAYMENT_CURRENCY_OPTIONS.filter((v) => v !== "USDT").map((v) => ({ value: v, label: v })), d.currencies, groupId);
  if (groupId === "sender") return paymentPartyFilterBodyHtml("sender", d.senderClientIds);
  if (groupId === "recipient") return paymentPartyFilterBodyHtml("recipient", d.recipientClientIds);
  if (groupId === "createdAt") {
    return `
      <button type="button" class="drp-trigger" id="op-drawer-created-trigger">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>
        <span>${dateTriggerLabel(d.createdFrom, d.createdTo)}</span>
      </button>
    `;
  }
  if (groupId === "settledAt") {
    return `
      <button type="button" class="drp-trigger" id="op-drawer-settled-trigger">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>
        <span>${dateTriggerLabel(d.settledFrom, d.settledTo)}</span>
      </button>
    `;
  }
  return "";
}

let opExpandedFilterGroups = null;

function ensurePaymentsExpandedGroupsInit() {
  if (opExpandedFilterGroups) return;
  opExpandedFilterGroups = new Set();
  paymentsFilterGroupDefs().forEach((g) => {
    if (paymentsFilterGroupActiveCount(g.id) > 0) opExpandedFilterGroups.add(g.id);
  });
}

function renderPaymentsFilterGroup(groupId) {
  const f = t("operationsPayments.filters");
  const label = f[paymentsFilterGroupDefs().find((g) => g.id === groupId).labelKey];
  const count = paymentsFilterGroupActiveCount(groupId);
  const expanded = opExpandedFilterGroups.has(groupId);

  return `
    <div class="filter-group${expanded ? " is-expanded" : ""}" data-group-id="${groupId}">
      <button type="button" class="filter-group-head" data-group-toggle="${groupId}">
        <span class="filter-group-label">${label}</span>
        ${count ? `<span class="filter-group-badge">${count}</span>` : ""}
        <span class="filter-group-chevron">${FILTER_GROUP_CHEVRON}</span>
      </button>
      <div class="filter-group-body">${paymentsFilterGroupBodyHtml(groupId)}</div>
    </div>
  `;
}

function renderPaymentsFiltersDrawerBody() {
  return paymentsFilterGroupDefs().map((g) => renderPaymentsFilterGroup(g.id)).join("");
}

function renderPaymentsFiltersDrawer() {
  const f = t("operationsPayments.filters");
  return `
    <div class="filters-drawer-overlay" id="op-filters-overlay"></div>
    <aside class="filters-drawer" id="op-filters-drawer">
      <div class="filters-drawer-header">
        <h2 class="filters-drawer-title">${f.drawerTitle}</h2>
        <button type="button" class="filters-drawer-close" id="op-filters-drawer-close">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <div class="filters-drawer-body" id="op-filters-drawer-body">${renderPaymentsFiltersDrawerBody()}</div>
      <div class="filters-drawer-footer">
        <button type="button" class="btn-secondary" id="op-drawer-reset">${f.reset}</button>
        <button type="button" class="btn-primary" id="op-drawer-apply">${f.showResults}</button>
      </div>
    </aside>
  `;
}

function rerenderPaymentsFiltersDrawerBody() {
  const bodyEl = document.getElementById("op-filters-drawer-body");
  if (!bodyEl) return;
  bodyEl.innerHTML = renderPaymentsFiltersDrawerBody();
  attachPaymentsFiltersDrawerBodyHandlers();
}

function attachPaymentsFiltersDrawerBodyHandlers() {
  const d = opFilterDraft;

  document.querySelectorAll("[data-group-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const groupId = btn.dataset.groupToggle;
      if (opExpandedFilterGroups.has(groupId)) opExpandedFilterGroups.delete(groupId);
      else opExpandedFilterGroups.add(groupId);
      btn.closest(".filter-group").classList.toggle("is-expanded");
    });
  });

  // Чекбоксы внутри списков отправителя/получателя (.filter-search-list) — не
  // сюда: у них своя привязка (attachPartySearchHandlers), потому что список
  // ещё и живьём перерисовывается при вводе текста поиска.
  document.querySelectorAll('#op-filters-drawer-body input[type="checkbox"][data-group]').forEach((input) => {
    if (input.closest(".filter-search-list")) return;
    input.addEventListener("change", () => {
      const groupId = input.dataset.group;
      const arr = groupId === "direction" ? d.directions : groupId === "paymentSystem" ? d.paymentSystems : groupId === "network" ? d.networks : d.currencies;
      const idx = arr.indexOf(input.value);
      if (input.checked && idx === -1) arr.push(input.value);
      if (!input.checked && idx !== -1) arr.splice(idx, 1);
      rerenderPaymentsFiltersDrawerBody();
    });
  });

  attachPartySearchHandlers();

  const createdTrigger = document.getElementById("op-drawer-created-trigger");
  if (createdTrigger) {
    createdTrigger.addEventListener("click", (e) => {
      openDateRangePicker({
        from: d.createdFrom,
        to: d.createdTo,
        anchorEl: e.currentTarget,
        onApply: (from, to) => {
          d.createdFrom = from;
          d.createdTo = to;
          rerenderPaymentsFiltersDrawerBody();
        },
      });
    });
  }

  const settledTrigger = document.getElementById("op-drawer-settled-trigger");
  if (settledTrigger) {
    settledTrigger.addEventListener("click", (e) => {
      openDateRangePicker({
        from: d.settledFrom,
        to: d.settledTo,
        anchorEl: e.currentTarget,
        onApply: (from, to) => {
          d.settledFrom = from;
          d.settledTo = to;
          rerenderPaymentsFiltersDrawerBody();
        },
      });
    });
  }
}

// Поиск по имени в фильтрах "Отправитель"/"Получатель": при вводе текста
// перерисовывается ТОЛЬКО список результатов (.filter-search-list), а не вся
// панель — иначе поле поиска пересоздавалось бы на каждую нажатую клавишу и
// теряло фокус/курсор. Клик по чекбоксу внутри списка — обычная полная
// перерисовка панели (rerenderPaymentsFiltersDrawerBody), фокус тут не важен.
function attachPartySearchHandlers() {
  ["sender", "recipient"].forEach((side) => {
    const input = document.getElementById(`op-drawer-${side}-search`);
    const listEl = document.getElementById(`op-drawer-${side}-list`);
    if (!input || !listEl) return;

    const bindListCheckboxes = () => {
      listEl.querySelectorAll('input[type="checkbox"][data-group]').forEach((cb) => {
        cb.addEventListener("change", () => {
          const arr = side === "sender" ? opFilterDraft.senderClientIds : opFilterDraft.recipientClientIds;
          const idx = arr.indexOf(cb.value);
          if (cb.checked && idx === -1) arr.push(cb.value);
          if (!cb.checked && idx !== -1) arr.splice(idx, 1);
          rerenderPaymentsFiltersDrawerBody();
        });
      });
    };

    bindListCheckboxes();
    input.addEventListener("input", () => {
      const selected = side === "sender" ? opFilterDraft.senderClientIds : opFilterDraft.recipientClientIds;
      listEl.innerHTML = paymentPartyFilterListHtml(side, input.value, selected);
      bindListCheckboxes();
    });
  });
}

function attachPaymentsFiltersDrawerChromeHandlers() {
  const resetBtn = document.getElementById("op-drawer-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetOperationsPaymentsFilters();
      opFilterDraft = clonePaymentsFilterDraft(operationsPaymentsState);
      opExpandedFilterGroups = new Set();
      rerenderPaymentsFiltersDrawerBody();
      refreshPaymentsFiltersChrome();
    });
  }

  const applyBtn = document.getElementById("op-drawer-apply");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      Object.assign(operationsPaymentsState, clonePaymentsFilterDraft(opFilterDraft));
      operationsPaymentsState.page = 1;
      updateOperationsPaymentsTable();
      refreshPaymentsFiltersChrome();
      closePaymentsFiltersDrawer();
    });
  }

  const closeBtn = document.getElementById("op-filters-drawer-close");
  if (closeBtn) closeBtn.addEventListener("click", closePaymentsFiltersDrawer);

  const overlay = document.getElementById("op-filters-overlay");
  if (overlay) overlay.addEventListener("click", closePaymentsFiltersDrawer);
}

function handlePaymentsFiltersDrawerEscape(e) {
  if (e.key === "Escape") closePaymentsFiltersDrawer();
}

function openPaymentsFiltersDrawer() {
  opFilterDraft = clonePaymentsFilterDraft(operationsPaymentsState);
  ensurePaymentsExpandedGroupsInit();

  const wrap = document.createElement("div");
  wrap.id = "op-filters-drawer-wrap";
  wrap.innerHTML = renderPaymentsFiltersDrawer();
  document.body.appendChild(wrap);

  attachPaymentsFiltersDrawerChromeHandlers();
  attachPaymentsFiltersDrawerBodyHandlers();

  requestAnimationFrame(() => {
    const overlay = document.getElementById("op-filters-overlay");
    const drawer = document.getElementById("op-filters-drawer");
    if (overlay) overlay.classList.add("is-open");
    if (drawer) drawer.classList.add("is-open");
  });

  document.addEventListener("keydown", handlePaymentsFiltersDrawerEscape);
  document.body.classList.add("filters-drawer-open");
}

function closePaymentsFiltersDrawer() {
  const wrap = document.getElementById("op-filters-drawer-wrap");
  if (!wrap) return;
  const overlay = document.getElementById("op-filters-overlay");
  const drawer = document.getElementById("op-filters-drawer");
  if (overlay) overlay.classList.remove("is-open");
  if (drawer) drawer.classList.remove("is-open");
  document.removeEventListener("keydown", handlePaymentsFiltersDrawerEscape);
  document.body.classList.remove("filters-drawer-open");
  setTimeout(() => wrap.remove(), 220);
}

// ---- Таблица ------------------------------------------------------------------------
// Вместо голого id — имя клиента (email, если ФИО не указано — тот же фолбэк,
// что и на карточке клиента). Когда clientId есть (наш клиент, см.
// PAYMENT_BOTH_INTERNAL_SYSTEMS в моке) — имя кликабельно, ведёт на карточку.
// Когда clientId нет (сторона вне системы — почти всегда так на внешних
// рельсах) — clientType всё равно может быть известен (как в реальном коде,
// ach-payments.service.ts и аналоги: `sender: { clientType }` без clientId), и
// имя берём из paymentExternalPartyRef (аналог данных из реквизитов платежа) —
// просто текстом, без ссылки: перейти на карточку всё равно некуда, это не наш
// клиент. Риск — отдельной колонкой (paymentRiskCellHtml), не здесь.
// ---- Счёт внутреннего клиента, с которого/на который выполнен платёж ---------------------------------------
// Это счёт клиента в нашей системе (ACCOUNTS_VIRTUAL_MOCK): по клику — переход в раздел "Счета" на этот счёт. Берём явный
// senderAccountId/recipientAccountId, если он указывает на реальный счёт (создание вручную), иначе счёт клиента в валюте
// платежа; если у клиента такого счёта в моках ещё нет — заводим его (ensureClientAccount), чтобы ссылка всегда вела на
// существующую карточку счёта. Только у внутренней стороны (у внешней нет clientId).
function paymentStableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0;
  return h;
}

function ensureClientAccount(clientId, currency) {
  const found = ACCOUNTS_VIRTUAL_MOCK.find((a) => a.client && a.client.id === clientId && a.type === "CLIENT" && a.balances.some((b) => b.currency === currency));
  if (found) return found;
  const client = paymentClientById(clientId);
  if (!client) return null;
  const seed = paymentStableHash(`${clientId}:${currency}`);
  const createdDate = new Date(MOCK_NOW.getTime() - (30 + (seed % 200)) * 24 * 60 * 60 * 1000);
  const crypto = currency === "USDT";
  const acc = {
    id: seedToPaymentUuid(seed),
    kind: "virtual",
    client: { id: client.id, name: client.name, legalType: client.type === "CORPORATE" ? "CORPORATE" : "INDIVIDUAL", link: paymentClientLink(client) },
    type: "CLIENT",
    category: "PRIMARY",
    ledgerType: "ACTIVE",
    status: "ACTIVE",
    tag: crypto ? "CUSTOMER_CRYPTO_WALLET" : "CUSTOMER_FIAT_ACCOUNT",
    description: crypto ? "Крипто-кошелёк" : "Основной счёт",
    balances: accMakeBalances([currency], seed % 997, { zero: false, big: false }),
    restrictionReason: null,
    restrictionDetails: null,
    references: [],
    errorMessages: [],
    depositDetails: [],
    parentId: null,
    linkedIds: [],
    createdDate,
    createdAt: formatDateTime(createdDate),
    updatedDate: createdDate,
    updatedAt: formatDateTime(createdDate),
  };
  ACCOUNTS_VIRTUAL_MOCK.push(acc);
  return acc;
}

function paymentInternalAccount(row, side) {
  const clientId = row[`${side}ClientId`];
  if (!clientId) return null;
  const currency = side === "sender" ? row.sourceCurrency : row.targetCurrency;
  const explicit = row[`${side}AccountId`];
  const acc = (explicit && ACCOUNTS_VIRTUAL_MOCK.find((a) => a.id === explicit)) || ensureClientAccount(clientId, currency);
  return acc ? { id: acc.id, code: acc.code, currency, href: accHref(acc) } : null;
}

function paymentAccountLineHtml(acc, withCurrency) {
  if (!acc) return "";
  const label = acc.href ? `<button type="button" class="table-link" data-party-hash="${acc.href}">${acc.code}</button>` : `<span>${acc.code}</span>`;
  return `<div class="payment-account-line"><span class="identity-cell-tag">${t("paymentDetail.fields.accountNumber")}</span>${withCurrency ? `<span class="table-cell-muted">${acc.currency}</span>` : ""}${label}${copyIconButton(acc.code)}</div>`;
}

function paymentClientCellHtml(row, side, opts = {}) {  const clientId = row[`${side}ClientId`];
  const clientType = row[`${side}ClientType`];
  const name = row[`${side}ClientName`] || (clientId ? pdShort(clientId) : null);
  const link = row[`${side}ClientLink`];

  // Крипто: внешняя сторона — адрес в сети. Та же раскладка, что у клиента (бейдж + значение), поэтому строки выровнены;
  // адрес сокращён (полный — в копировании и в карточке платежа).
  const cw = row.cryptoWallet;
  const externalAddress = cw && !clientId ? (side === "sender" ? (row.cryptoOperationType === "CUSTOMER_DEPOSIT" ? cw.addressFrom : null) : (row.cryptoOperationType === "CUSTOMER_WITHDRAWAL" ? cw.addressTo : null)) : null;
  if (externalAddress) {
    return `
    <div class="payment-client-cell">
      <span class="badge badge-neutral">${t("paymentDetail.crypto.externalAddress")}</span>
      <span class="payment-address inline-copy"><span class="payment-address-text" title="${escapeAttr(externalAddress)}">${cwShort(externalAddress)}</span>${copyIconButton(externalAddress)}</span>
    </div>`;
  }

  // Имени может не быть даже у внешней стороны с известным типом (SBP/
  // CARD_NUMBER — в схеме нет поля имени вообще, см. paymentExternalPartyRef).
  // Тип всё равно показываем бейджем, а вместо имени — честная заглушка.
  if (!name && !clientType) return `<span class="table-cell-muted">${t("operationsPayments.noValue")}</span>`;

  const accountHtml = ""; // номер счёта в таблице платежей не показываем (он есть в карточке платежа)
  const mainHtml = `
    <div class="payment-client-cell">
      ${clientType ? `<span class="badge badge-neutral">${paymentClientTypeLabel(clientType)}</span>` : ""}
      ${
        clientId
          ? `<button type="button" class="table-link" data-party-hash="${link}">${pdEscape(name)}</button>`
          : name
            ? `<span>${pdEscape(name)}</span>`
            : `<span class="table-cell-muted">${t("operationsPayments.noValue")}</span>`
      }
    </div>
  `;
  return accountHtml ? `<div class="payment-client-block">${mainHtml}${accountHtml}</div>` : mainHtml;
}

// Риск — скоринг самого ПЛАТЕЖА, не отправителя/получателя (исправлено:
// раньше здесь ошибочно показывались два риска клиентов-сторон). По коду
// (core-feature-dev_bank_core, payments-accounting.service.ts) при обработке
// платежа вызывается processScoringEvent, а результат — { finalDecision,
// normalizedScore, riskLevel: { name, level } } — пишется в payment.metadata.
// scoringResult, то есть это ОДНА оценка на весь платёж целиком. Ровно та же
// сущность, что уже честно смоделирована для карточки платежа — extras.scoring
// (operations-payment-details.mock.js), здесь просто переиспользуется. Когда
// scoring ещё не посчитан (extras.scoring === null) — нейтральный бейдж
// "Не оценён" вместо прочерка (это UI-плейсхолдер, не значение бэкенда — сам
// riskLevel.level у реального processScoringEvent — свободная строка, не
// закрытый enum, никакого NOT_SCORED там нет).
function paymentRiskLevelCellHtml(row) {
  const scoring = getPaymentDetailExtras(row).scoring;
  if (!scoring) return `<span class="badge badge-neutral">${t("operationsPayments.riskNotScored")}</span>`;
  return `<span class="badge ${riskLevelBadgeClass(scoring.riskLevel.name)}">${riskLevelLabel(scoring.riskLevel.name)}</span>`;
}

// Направление + платёжная система — одной колонкой: бейдж направления сверху,
// платёжная система под ним мелким серым текстом, вместо двух отдельных колонок.
// Операция и ID — одной колонкой: сверху бейдж направления (входящий/исходящий/внутренний; у крипто — внешний/внутренний),
// ниже ссылка на карточку по типу операции (у крипто ввод/вывод/перевод, у фиата платёжная система), затем ID с
// копированием — как идентификатор под именем в списках клиентов.
function paymentOperationCellHtml(row) {
  const flow = paymentFlow(row);
  const title = row.cryptoOperationType ? t(`operationsPayments.cryptoOperation.${row.cryptoOperationType}`) : paymentSystemLabel(row.paymentSystem);
  return `
    <div class="identity-cell">
      <div class="identity-cell-primary payment-op-line">
        <button type="button" class="table-link payment-link" data-payment-id="${row.id}">${title}</button>
        <span class="badge ${flow === "INCOMING" ? "badge-success" : "badge-neutral"}">${paymentFlowOneLabel(flow, row)}</span>
      </div>
      <div class="identity-cell-sub">
        <span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>
        <button type="button" class="id-copy" data-copy-value="${row.code}" title="${t("clientsUsers.copy")}">
          <span class="id-copy-label">${row.code}</span>
          ${COPY_ICON_SVG}
        </button>
      </div>
    </div>
  `;
}

function paymentDirectionSystemCellHtml(row) {  return `
    <div class="payment-direction-cell">
      <span class="badge ${paymentFlow(row) === "INCOMING" ? "badge-success" : "badge-neutral"}">${paymentFlowOneLabel(paymentFlow(row), row)}</span>
      <span class="table-cell-muted">${row.cryptoOperationType ? t(`operationsPayments.cryptoOperation.${row.cryptoOperationType}`) : paymentSystemLabel(row.paymentSystem)}</span>
    </div>
  `;
}

// Отправитель и получатель — одной колонкой, в три строки: отправитель сверху,
// стрелка вниз посередине, получатель снизу (вместо строки со стрелкой
// вбок) — так виднее направление движения денег между конкретными клиентами,
// а не только INCOMING/OUTGOING бейдж рядом.
const PAYMENT_PARTIES_ARROW_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v12M5 11l5 5 5-5"/></svg>`;

function paymentPartiesCellHtml(row) {
  return `
    <div class="payment-parties-cell">
      ${paymentClientCellHtml(row, "sender")}
      <span class="payment-parties-arrow">${PAYMENT_PARTIES_ARROW_SVG}</span>
      ${paymentClientCellHtml(row, "recipient")}
    </div>
  `;
}

// ---- Массовые действия и действия в строке ---------------------------------------
// Одобрить/отклонить — та же мутация статуса, что и на карточке платежа
// (setPaymentStatus, operations-payment-detail.js), но без перехода на
// карточку: подтверждение и обновление — прямо в списке.
const PAY_DECLINE_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>`;

function paymentRowFind(id) {
  return OPERATIONS_PAYMENTS_MOCK.find((r) => r.id === id) || null;
}

// Три точки в конце строки: "Перейти в vABS" — всегда, "Одобрить"/"Отклонить" —
// только для не финального статуса (см. PAYMENT_NON_FINAL_STATUSES).
function paymentRowActionsMenu(row) {
  const a = t("paymentDetail.actions");
  const nonFinal = PAYMENT_NON_FINAL_STATUSES.includes(row.status);
  const items = [
    { label: a.goToOperation, icon: ARROW_RIGHT_ICON_SVG, attrs: `data-payment-row-action="goToOperation:${row.id}"` },
    { label: a.exportPdf, icon: DOWNLOAD_ICON_SVG, attrs: `data-payment-row-action="exportPdf:${row.id}"` },
  ];
  if (nonFinal) {
    items.push({ label: a.approve, icon: CHECK_ICON_SVG, attrs: `data-payment-row-action="approve:${row.id}"` });
    items.push({ label: a.decline, icon: PAY_DECLINE_ICON_SVG, attrs: `data-payment-row-action="decline:${row.id}"`, danger: true });
  }
  return rowKebabMenu(`pay-${row.id}`, items);
}

function openPaymentRowApproveModal(row) {
  const m = t("paymentDetail.modals");
  openConfirmModal({
    title: m.approveTitle,
    text: m.approveText(formatPaymentAmount(row.sourceAmount), row.sourceCurrency, row.recipientClientName || ""),
    confirmLabel: t("paymentDetail.actions.approve"),
    cancelLabel: t("paymentDetail.common.cancel"),
    danger: false,
    onConfirm: () => requireAdmin2fa("payment_approve", () => {
      setPaymentStatus(row, "SUCCESSFUL");
      updateOperationsPaymentsTable();
    }),
  });
}

function openPaymentRowDeclineModal(row) {
  const m = t("paymentDetail.modals");
  openPaymentTextModal({
    title: m.declineTitle,
    intro: m.declineText,
    label: m.reasonLabel,
    requiredMsg: m.reasonRequired,
    submitLabel: t("paymentDetail.actions.decline"),
    danger: true,
    onSubmit: (reason) => {
      addPaymentComment(getPaymentDetailExtras(row), m.declineCommentPrefix + reason);
      setPaymentStatus(row, "DECLINED");
      updateOperationsPaymentsTable();
    },
  });
}

// ---- Выделение строк и массовые действия -----------------------------------------
function paymentsPageRowIds() {
  const wrap = document.getElementById("operations-payments-table-wrap");
  if (!wrap) return [];
  return [...wrap.querySelectorAll("[data-payment-checkbox]")].map((cb) => cb.dataset.paymentCheckbox);
}

function renderPaymentsBulkBar() {
  const count = paymentsSelectedIds.size;
  if (!count) return "";
  const b = t("operationsPayments.bulk");
  return `
    <div class="table-bulk-bar" id="op-bulk-bar-inner">
      <span class="table-bulk-count">${b.selectedCount(count)}</span>
      <button type="button" class="btn-secondary" id="op-bulk-approve">${CHECK_ICON_SVG}<span>${b.approve}</span></button>
      <button type="button" class="btn-secondary" id="op-bulk-decline">${PAY_DECLINE_ICON_SVG}<span>${b.decline}</span></button>
      <button type="button" class="table-link" id="op-bulk-clear">${b.clear}</button>
    </div>
  `;
}

function refreshPaymentsBulkBar() {
  const el = document.getElementById("op-bulk-bar");
  if (!el) return;
  el.innerHTML = renderPaymentsBulkBar();
  attachPaymentsBulkBarHandlers();
  const selectAll = document.getElementById("op-select-all");
  if (selectAll) {
    const pageIds = paymentsPageRowIds();
    const selectedOnPage = pageIds.filter((id) => paymentsSelectedIds.has(id));
    selectAll.checked = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
    selectAll.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
  }
}

function attachPaymentsBulkBarHandlers() {
  const approveBtn = document.getElementById("op-bulk-approve");
  if (approveBtn) approveBtn.addEventListener("click", openPaymentsBulkApproveModal);
  const declineBtn = document.getElementById("op-bulk-decline");
  if (declineBtn) declineBtn.addEventListener("click", openPaymentsBulkDeclineModal);
  const clearBtn = document.getElementById("op-bulk-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      paymentsSelectedIds.clear();
      updateOperationsPaymentsTable();
    });
  }
}

// Массовые действия — только подтверждение, без причины (в отличие от
// одиночного отклонения на карточке): текст модалки честно предупреждает,
// что из выделенных реально изменятся только операции не в конечном статусе.
function openPaymentsBulkApproveModal() {
  const b = t("operationsPayments.bulk");
  const rows = [...paymentsSelectedIds].map(paymentRowFind).filter(Boolean);
  const eligible = rows.filter((r) => PAYMENT_NON_FINAL_STATUSES.includes(r.status));
  openConfirmModal({
    title: b.approveTitle,
    text: b.approveText(rows.length, eligible.length),
    confirmLabel: t("paymentDetail.actions.approve"),
    cancelLabel: t("paymentDetail.common.cancel"),
    danger: false,
    onConfirm: () => {
      eligible.forEach((r) => setPaymentStatus(r, "SUCCESSFUL"));
      paymentsSelectedIds.clear();
      updateOperationsPaymentsTable();
    },
  });
}

function openPaymentsBulkDeclineModal() {
  const b = t("operationsPayments.bulk");
  const rows = [...paymentsSelectedIds].map(paymentRowFind).filter(Boolean);
  const eligible = rows.filter((r) => PAYMENT_NON_FINAL_STATUSES.includes(r.status));
  openConfirmModal({
    title: b.declineTitle,
    text: b.declineText(rows.length, eligible.length),
    confirmLabel: t("paymentDetail.actions.decline"),
    cancelLabel: t("paymentDetail.common.cancel"),
    danger: true,
    onConfirm: () => {
      eligible.forEach((r) => setPaymentStatus(r, "DECLINED"));
      paymentsSelectedIds.clear();
      updateOperationsPaymentsTable();
    },
  });
}

function renderOperationsPaymentsRow(row) {
  const isExchangeAmount = row.sourceCurrency !== row.targetCurrency;
  // Сумма и валюта — одной ячейкой (сумма + код валюты рядом), вместо двух
  // отдельных колонок.
  const amountHtml = isExchangeAmount
    ? `${formatPaymentAmount(row.sourceAmount)} ${row.sourceCurrency} → ${formatPaymentAmount(row.targetAmount)} ${row.targetCurrency}`
    : `${formatPaymentAmount(row.sourceAmount)} ${row.sourceCurrency}`;

  return `
    <tr>
      <td>
        <input type="checkbox" class="op-row-checkbox" data-payment-checkbox="${row.id}"${paymentsSelectedIds.has(row.id) ? " checked" : ""} />
      </td>
      <td>${paymentOperationCellHtml(row)}</td>
      <td>${paymentPartiesCellHtml(row)}</td>
      <td>${amountHtml}${row.cryptoWallet ? ` <span class="badge badge-neutral">${row.cryptoWallet.networkName}</span>` : ""}</td>
      <td>${paymentRiskLevelCellHtml(row)}</td>
      <td><span class="badge ${paymentStatusBadgeClass(row.status)}">${paymentStatusLabel(row.status)}</span></td>
      <td>${dateTimeCell(row.createdAt)}</td>
      <td>${row.settledAt ? dateTimeCell(row.settledAt) : `<span class="table-cell-muted">${t("operationsPayments.noValue")}</span>`}</td>
      <td>${paymentRowActionsMenu(row)}</td>
    </tr>
  `;
}

function renderOperationsPaymentsTableSection() {
  const cols = t("operationsPayments.columns");
  const pag = t("operationsPayments.pagination");
  const filtered = getSortedOperationsPayments(getFilteredOperationsPayments());
  const totalPages = Math.max(1, Math.ceil(filtered.length / operationsPaymentsState.pageSize));

  if (operationsPaymentsState.page > totalPages) operationsPaymentsState.page = totalPages;
  const page = operationsPaymentsState.page;

  const start = (page - 1) * operationsPaymentsState.pageSize;
  const pageRows = filtered.slice(start, start + operationsPaymentsState.pageSize);

  if (filtered.length === 0) {
    const empty = t("operationsPayments.emptyState");
    return `
      <div class="empty-state empty-state-centered">
        <img class="empty-state-logo" src="assets/images/logo-icon.svg" alt="" />
        <div class="empty-state-text-group">
          <div class="empty-state-title">${empty.title}</div>
          <div class="empty-state-text">${empty.text}</div>
        </div>
        <button type="button" class="btn-secondary" id="op-empty-reset">${empty.resetButton}</button>
      </div>
    `;
  }

  const pageButtons = renderPager(page, totalPages);
  const pageIds = pageRows.map((r) => r.id);
  const selectedOnPage = pageIds.filter((id) => paymentsSelectedIds.has(id));
  const allPageSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;

  return `
    <div class="table-bulk-bar-wrap" id="op-bulk-bar">${renderPaymentsBulkBar()}</div>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="op-select-all"${allPageSelected ? " checked" : ""} /></th>
            <th>${cols.directionSystem}</th>
            <th>${cols.parties}</th>
            ${paymentsSortableHeader("amount", cols.amount)}
            <th>${cols.riskLevel}</th>
            <th>${cols.status}</th>
            ${paymentsSortableHeader("createdAt", cols.createdAt)}
            ${paymentsSortableHeader("settledAt", cols.settledAt)}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${pageRows.map(renderOperationsPaymentsRow).join("")}
        </tbody>
      </table>
    </div>

    <div class="table-footer">
      <span class="table-footer-total">${pag.total(filtered.length)}</span>
      <div class="pager">${pageButtons}</div>
      <div class="table-footer-page-size">
        <span>${pag.rowsPerPage}</span>
        <select id="op-page-size">
          ${[10, 20, 50]
            .map((n) => `<option value="${n}"${operationsPaymentsState.pageSize === n ? " selected" : ""}>${n}</option>`)
            .join("")}
        </select>
      </div>
    </div>
  `;
}

let operationsPaymentsLoadingTimer = null;

function updateOperationsPaymentsTable() {
  const wrap = document.getElementById("operations-payments-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = renderTableLoadingState();
  clearTimeout(operationsPaymentsLoadingTimer);
  operationsPaymentsLoadingTimer = setTimeout(() => {
    wrap.innerHTML = renderOperationsPaymentsTableSection();
    attachOperationsPaymentsTableHandlers();
    refreshPaymentMetrics();
  }, CLIENTS_USERS_LOADING_DELAY);
}

// ---- Карточки-метрики: срезы, которых нет на быстрых табах статуса --------------
const PAYMENTS_METRICS_WINDOW_DAYS = 7;

// PAYMENT_HIGH_RISK_LEVELS — тот же хвост ScoringRiskLevelEnum, что и riskLevelBadgeClass
// в clients-companies.js красит в опасные цвета (жёлтый средний не считаем "высоким").
const PAYMENT_HIGH_RISK_LEVELS = ["HIGH_RISK", "VERY_HIGH_RISK", "PROHIBITED_RISK"];

function computePaymentMetrics() {
  const list = getFilteredOperationsPayments();
  const recentThreshold = new Date(MOCK_NOW.getTime() - PAYMENTS_METRICS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    incoming: list.filter((r) => paymentFlow(r) === "INCOMING").length,
    outgoing: list.filter((r) => paymentFlow(r) === "OUTGOING").length,
    favorite: list.filter((r) => r.isFavorite).length,
    // Раньше здесь была метрика "без отправителя/получателя" — с учётом реальной
    // логики (одна сторона вне системы — это норма почти для всех внешних
    // рельсов, не пробел в данных) она перестала быть информативной, заменена
    // на более осмысленную для комплаенса: платежи с высоким скорингом риска
    // (риск самого платежа, extras.scoring — см. paymentRiskLevelCellHtml).
    highRisk: list.filter((r) => {
      const scoring = getPaymentDetailExtras(r).scoring;
      return scoring && PAYMENT_HIGH_RISK_LEVELS.includes(scoring.riskLevel.name);
    }).length,
    newRecent: list.filter((r) => r.createdDate >= recentThreshold).length,
  };
}

function renderPaymentMetricsCards() {
  const m = computePaymentMetrics();
  const cd = t("operationsPayments.metrics");
  return `
    <div class="metrics-grid" id="op-metrics">
      ${renderMetricCard(m.incoming, cd.incoming)}
      ${renderMetricCard(m.outgoing, cd.outgoing)}
      ${renderMetricCard(m.favorite, cd.favorite)}
      ${renderMetricCard(m.highRisk, cd.highRisk)}
      ${renderMetricCard(m.newRecent, cd.newRecent)}
    </div>
  `;
}

function refreshPaymentMetrics() {
  const el = document.getElementById("op-metrics");
  if (el) el.outerHTML = renderPaymentMetricsCards();
}

function attachOperationsPaymentsTableHandlers() {
  const wrap = document.getElementById("operations-payments-table-wrap");
  if (!wrap) return;

  const emptyResetBtn = document.getElementById("op-empty-reset");
  if (emptyResetBtn) emptyResetBtn.addEventListener("click", resetAllOperationsPaymentsFilters);

  wrap.querySelectorAll(".pager-btn[data-page]").forEach((btn) => {
    if (btn.hasAttribute("disabled")) return;
    btn.addEventListener("click", () => {
      operationsPaymentsState.page = Number(btn.dataset.page);
      updateOperationsPaymentsTable();
    });
  });

  const pageSizeSelect = document.getElementById("op-page-size");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", () => {
      operationsPaymentsState.pageSize = Number(pageSizeSelect.value);
      operationsPaymentsState.page = 1;
      updateOperationsPaymentsTable();
    });
  }

  wrap.querySelectorAll(".th-sort").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = operationsPaymentsState;
      const key = btn.dataset.sort;
      if (s.sortBy === key) s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
      else {
        s.sortBy = key;
        s.sortDir = "asc";
      }
      updateOperationsPaymentsTable();
    });
  });

  wrap.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn));
    });
  });

  wrap.querySelectorAll(".payment-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = `#/operations-payments/${btn.dataset.paymentId}`;
    });
  });

  wrap.querySelectorAll("[data-party-hash]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = btn.dataset.partyHash;
    });
  });

  // ---- Выделение строк -------------------------------------------------------
  wrap.querySelectorAll("[data-payment-checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) paymentsSelectedIds.add(cb.dataset.paymentCheckbox);
      else paymentsSelectedIds.delete(cb.dataset.paymentCheckbox);
      refreshPaymentsBulkBar();
    });
  });

  const selectAll = document.getElementById("op-select-all");
  if (selectAll) {
    const pageIds = paymentsPageRowIds();
    const selectedOnPage = pageIds.filter((id) => paymentsSelectedIds.has(id));
    selectAll.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
    selectAll.addEventListener("change", () => {
      const ids = paymentsPageRowIds();
      if (selectAll.checked) ids.forEach((id) => paymentsSelectedIds.add(id));
      else ids.forEach((id) => paymentsSelectedIds.delete(id));
      wrap.querySelectorAll("[data-payment-checkbox]").forEach((cb) => {
        cb.checked = paymentsSelectedIds.has(cb.dataset.paymentCheckbox);
      });
      selectAll.indeterminate = false;
      refreshPaymentsBulkBar();
    });
  }

  attachPaymentsBulkBarHandlers();

  // ---- Действия в строке (три точки): перейти в vABS / одобрить / отклонить --
  wrap.querySelectorAll("[data-payment-row-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [action, id] = btn.dataset.paymentRowAction.split(":");
      const row = paymentRowFind(id);
      if (!row) return;
      if (action === "goToOperation") window.location.hash = `#/settings-vabs-operations/${row.id}`;
      else if (action === "exportPdf") exportPaymentPdf(row, { section: "payments", id: row.id }, getPaymentDetailExtras(row));
      else if (action === "approve") openPaymentRowApproveModal(row);
      else if (action === "decline") openPaymentRowDeclineModal(row);
    });
  });
}

// ---- Создание платежа -------------------------------------------------------------
// Реальный механизм: у каждого рельса — своя пара админских мутаций
// prepare<Rail>Payment(input, clientId, bankFee?, providerFee?) / send<Rail>Payment
// (без @GqlCurrentUser — clientId передаётся явно, значит это платёж "от
// имени клиента", создаваемый админом; статус после prepare всегда DRAFT,
// скоринг считается не здесь, а при send — подтверждено чтением resolver/
// service-слоя 24.09.2026, см. swift/wire/ach/sbp/inner-payments.resolver.ts).
// Поддержаны только самые частые рельсы: SWIFT/WIRE/ACH (CreateBasePaymentInput),
// SBP и INNER — CARD_NUMBER/crypto/otc/cash сознательно не стали делать сразу.
//
// Шаги мастера и порядок полей — по образцу реального интерфейса (референс-
// скриншоты 24.09.2026): сначала "Направление платежа" (Внутренний/Входящий/
// Исходящий) определяет РОЛИ, а не рельс — Платёжная система выбирается уже на
// шаге той стороны, которая внешняя (не наш клиент): Входящий → внешний
// отправитель, Исходящий → внешний получатель, Внутренний → обе стороны наши
// клиенты, рельса нет вовсе (CreateInnerPaymentInput). "Провайдер" (провайдер +
// ID транзакции) показан только на шаге внешнего отправителя (Входящий) —
// по аналогии с createIncoming<Rail>PaymentForProvider (запись входящего
// платежа от провайдера); отдельно подтверждённого поля DTO под него в
// исследованном коде не было, поэтому это осторожное расширение по аналогии,
// а не 1:1 подтверждённое поле.
const PAYMENT_CREATE_RAILS = ["SWIFT", "WIRE", "ACH", "SBP"];

function pcEmptyState() {
  return {
    step: 1,
    direction: "OUTGOING", // "OUTGOING" | "INCOMING" | "INNER" — роли сторон, не рельс
    rail: null, // выбирается на шаге внешней стороны (после выбора типа клиента); не используется при INNER

    // "наша" сторона — отправитель при OUTGOING/INNER, получатель при INCOMING/INNER.
    // Тип клиента не предзаполнен — форма клиента/счёта открывается только
    // после явного выбора карточки.
    senderClientType: null,
    sender: null, // {id, type, name}
    senderAccount: null, // {accountId, currency, label}
    recipientClientType: null,
    recipientClient: null, // только для INNER — второй наш клиент
    recipientAccount: null,

    // внешняя сторона (не наш клиент) — отправитель при INCOMING, получатель при OUTGOING
    extClientType: null,
    extFirstName: "",
    extLastName: "",
    extEmail: "",
    extBankCode: "",
    extAccountNumber: "",
    bankCountry: "",
    bankCity: "",
    bankName: "",
    bankPostal: "",
    bankAddress: "",
    addrCountry: "",
    addrCity: "",
    addrPostal: "",
    addrLine1: "",
    accountType: "CHECKING", // WIRE/ACH
    sbpBankId: "",
    sbpBankBic: "",
    intermName: "",
    intermCode: "",
    intermCountry: "",
    intermCity: "",
    intermAddress: "",
    intermPostal: "",
    purposeOfPayment: "",
    sourceOfFunds: "",

    // "Провайдер" — только для Входящего (см. комментарий выше)
    providerId: "",
    providerTxId: "",

    amount: "",
    attachments: [], // {id, customFileName, fileName, sizeKb}
    showDetails: false,
  };
}
let pcState = pcEmptyState();

// Сторона считается "нашей" (простая форма: тип клиента + выбор клиента +
// выбор счёта), если направление делает её внутренней. Внешняя сторона —
// полная форма реквизитов (рельс/банк/адрес).
function pcSenderIsInternal() {
  return pcState.direction === "OUTGOING" || pcState.direction === "INNER";
}
function pcRecipientIsInternal() {
  return pcState.direction === "INCOMING" || pcState.direction === "INNER";
}

// Только у части клиентов из CLIENTS_USERS_MOCK/CLIENTS_COMPANIES_MOCK в
// ACCOUNTS_VIRTUAL_MOCK реально есть счёт — без этого фильтра пришлось бы
// перебирать клиентов в поиске, пока не найдётся тот, у кого он есть. Форма
// создания платежа всё равно требует счёт, поэтому в поиск попадают только
// клиенты, у которых он реально есть.
let pcClientsWithAccountsCache = null;
function pcClientsWithAccounts() {
  if (!pcClientsWithAccountsCache) {
    pcClientsWithAccountsCache = new Set();
    ACCOUNTS_VIRTUAL_MOCK.forEach((a) => {
      if (a.client && a.type === "CLIENT" && a.status === "ACTIVE") pcClientsWithAccountsCache.add(a.client.id);
    });
  }
  return pcClientsWithAccountsCache;
}

// Поиск клиента по имени/ID среди клиентов с реальным счётом (не только тех,
// что уже встречались в платежах — иначе только что заведённого клиента было
// бы не найти); typeFilter сужает до физ- или юрлиц (по карточке "Тип клиента").
function paymentClientSearchOptions(query, typeFilter) {
  const q = query.trim().toLowerCase();
  const withAccounts = pcClientsWithAccounts();
  const users = CLIENTS_USERS_MOCK.filter((u) => withAccounts.has(u.id)).map((u) => ({ id: u.id, type: "INDIVIDUAL", name: u.fullName || u.email }));
  const companies = CLIENTS_COMPANIES_MOCK.filter((c) => withAccounts.has(c.id)).map((c) => ({ id: c.id, type: "CORPORATE", name: c.name }));
  const all = typeFilter === "CORPORATE" ? companies : typeFilter === "INDIVIDUAL" ? users : [...users, ...companies];
  const filtered = q ? all.filter((x) => x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q)) : all;
  return filtered.slice(0, 30);
}

function paymentClientById(id) {
  const u = CLIENTS_USERS_MOCK.find((x) => x.id === id);
  if (u) return { id: u.id, type: "INDIVIDUAL", name: u.fullName || u.email };
  const c = CLIENTS_COMPANIES_MOCK.find((x) => x.id === id);
  if (c) return { id: c.id, type: "CORPORATE", name: c.name };
  return null;
}

function paymentClientLink(client) {
  if (!client || !client.id) return null;
  return client.type === "CORPORATE" ? `#/clients-companies/${client.id}` : `#/clients-users/${client.id}`;
}

// Счета клиента — реальный ACCOUNTS_VIRTUAL_MOCK (client.id/balances по
// валютам, accounts.mock.js), а не свободный текст: одна опция на пару
// (счёт, валюта), подпись "ВАЛЮТА - ...последние_цифры_id" как в референсе.
function pcAccountOptionsForClient(clientId) {
  if (!clientId) return [];
  const accounts = ACCOUNTS_VIRTUAL_MOCK.filter((a) => a.client && a.client.id === clientId && a.type === "CLIENT" && a.status === "ACTIVE");
  const options = [];
  accounts.forEach((a) => {
    a.balances.forEach((b) => {
      options.push({ value: `${a.id}:${b.currency}`, accountId: a.id, currency: b.currency, label: `${b.currency} - ...${a.id.slice(-6)}` });
    });
  });
  return options;
}

function pcClientListHtml(query, typeFilter) {
  const options = paymentClientSearchOptions(query, typeFilter);
  if (!options.length) return `<div class="table-cell-muted filter-search-empty">${t("operationsPayments.filters.noMatches")}</div>`;
  return options
    .map((o) => `<button type="button" class="filter-search-item" data-pc-pick="${o.id}">${pdEscape(o.name)}<span class="table-cell-muted"> · ${paymentClientTypeLabel(o.type)}</span></button>`)
    .join("");
}

function pcClientChipInnerHtml(client) {
  const c = t("operationsPayments.create");
  return `<span class="badge badge-neutral">${paymentClientTypeLabel(client.type)}</span><span>${pdEscape(client.name)}</span><button type="button" class="table-link" data-pc-change>${c.senderChange}</button>`;
}

function pcClientPickerHtml(pickerId, label, placeholder, selected, typeFilter) {
  return `
    <div class="filters-field">
      <span class="filters-field-label">${label}</span>
      <div class="pc-client-picker">
        <div class="pc-client-search" id="pc-${pickerId}-search-wrap"${selected ? " hidden" : ""}>
          <input type="text" class="address-form-input" id="pc-${pickerId}-search" placeholder="${placeholder}" autocomplete="off" />
          <div class="filter-search-list pc-client-list" id="pc-${pickerId}-list">${pcClientListHtml("", typeFilter)}</div>
        </div>
        <div class="pc-client-chip" id="pc-${pickerId}-chip"${selected ? "" : " hidden"}>${selected ? pcClientChipInnerHtml(selected) : ""}</div>
      </div>
    </div>
  `;
}

// onSelect всегда полностью перерисовывает шаг (pcRenderStep) — смена клиента
// должна пересобрать список его счетов, поэтому точечный патч чипа тут не
// подходит (в отличие от обычных поисков-фильтров в списке).
function attachPcClientPicker(modalEl, pickerId, onSelect, getTypeFilter) {
  const searchInput = modalEl.querySelector(`#pc-${pickerId}-search`);
  const listEl = modalEl.querySelector(`#pc-${pickerId}-list`);
  const chipEl = modalEl.querySelector(`#pc-${pickerId}-chip`);
  if (!searchInput || !listEl) return;

  const bindPicks = () => {
    listEl.querySelectorAll("[data-pc-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const client = paymentClientById(btn.dataset.pcPick);
        if (!client) return;
        onSelect(client);
      });
    });
  };

  const bindChangeBtn = () => {
    const changeBtn = chipEl.querySelector("[data-pc-change]");
    if (changeBtn) changeBtn.addEventListener("click", () => onSelect(null));
  };

  searchInput.addEventListener("input", () => {
    listEl.innerHTML = pcClientListHtml(searchInput.value, getTypeFilter ? getTypeFilter() : null);
    bindPicks();
  });

  bindPicks();
  bindChangeBtn();
}

// ---- Шаг 1: Направление платежа — определяет РОЛИ сторон (не рельс). Три
// карточки с заголовком и описанием, что это за платёж (а не голый select). -----
const PC_DIRECTION_CARDS = ["INNER", "INCOMING", "OUTGOING"];
function pcStepDirectionHtml() {
  const c = t("operationsPayments.create");
  const s = pcState;
  const titleKey = { INNER: "directionInner", INCOMING: "directionIncoming", OUTGOING: "directionOutgoing" };
  const descKey = { INNER: "directionInnerDesc", INCOMING: "directionIncomingDesc", OUTGOING: "directionOutgoingDesc" };
  return `
    <p class="modal-confirm-text pd-modal-intro">${c.intro}</p>
    <div class="filters-field">
      <span class="filters-field-label">${pcReq(c.directionLabel)}</span>
      <div class="pc-direction-cards">
        ${PC_DIRECTION_CARDS.map(
          (d) => `
          <button type="button" class="pc-direction-card${s.direction === d ? " is-active" : ""}" data-pc-direction="${d}">
            <div class="pc-direction-card-title">${c[titleKey[d]]}</div>
            <div class="pc-direction-card-desc">${c[descKey[d]]}</div>
          </button>`
        ).join("")}
      </div>
    </div>
  `;
}

function pcBindStepDirection(modalEl) {
  modalEl.querySelectorAll("[data-pc-direction]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pcState.direction = btn.dataset.pcDirection;
      // Сброс сторон при смене направления — иначе, например, при переключении
      // Исходящий → Внутренний остались бы невалидные внешние реквизиты.
      Object.assign(pcState, {
        sender: null, senderAccount: null, recipientClient: null, recipientAccount: null,
        extFirstName: "", extLastName: "", extEmail: "", extBankCode: "", extAccountNumber: "",
        bankCountry: "", bankCity: "", bankName: "", bankPostal: "", bankAddress: "",
        addrCountry: "", addrCity: "", addrPostal: "", addrLine1: "",
        sbpBankId: "", sbpBankBic: "",
        intermName: "", intermCode: "", intermCountry: "", intermCity: "", intermAddress: "", intermPostal: "",
        purposeOfPayment: "", sourceOfFunds: "", providerId: "", providerTxId: "",
      });
      pcRenderStep(modalEl);
    });
  });
}

// Метка обязательного поля — красная звёздочка, как в референсе.
function pcReq(label) {
  return `${label}<span class="pc-required">*</span>`;
}

// Выпадающий список счетов клиента вместо select: триггер показывает
// выбранный счёт (или плейсхолдер), в открытой панели — валюта + id
// (кликабелен — открывает карточку счёта, закрывая модалку); клик по
// остальной части строки выбирает счёт для платежа. Счета клиента в этой
// форме всегда из ACCOUNTS_VIRTUAL_MOCK (accHref даёт #/accounts-virtual/:id,
// accounts.js).
function pcAccountDropdownHtml(side, options, selected) {
  const c = t("operationsPayments.create");
  const triggerLabel = selected ? selected.label : c.accountPlaceholder;
  return `
    <div class="pc-dropdown" id="pc-dropdown-${side}-account">
      <button type="button" class="pc-dropdown-trigger" data-pc-dropdown-toggle="${side}-account">
        <span>${pdEscape(triggerLabel)}</span>
        <span class="pc-dropdown-chevron">${FILTER_GROUP_CHEVRON}</span>
      </button>
      <div class="pc-dropdown-panel">
        ${
          options.length
            ? options
                .map((o) => {
                  const isSelected = selected && selected.accountId === o.accountId && selected.currency === o.currency;
                  return `
                    <div class="pc-account-item${isSelected ? " is-selected" : ""}" data-pc-account-pick="${side}:${o.value}">
                      <span class="badge badge-neutral">${o.currency}</span>
                      <button type="button" class="table-link" data-pc-account-open="${o.accountId}">${(ACCOUNTS_VIRTUAL_MOCK.find((a) => a.id === o.accountId) || {}).code || pdShort(o.accountId)}</button>
                      ${isSelected ? `<span class="pc-account-item-check">${CHECK_ICON_SVG}</span>` : ""}
                    </div>`;
                })
                .join("")
            : `<div class="table-cell-muted" style="padding: var(--space-2) var(--space-3);">${c.notSpecified}</div>`
        }
      </div>
    </div>
  `;
}

// Тип клиента — карточками (физ/юр), а не радио: переиспользуется и "нашей"
// стороной, и внешней. name — префикс data-атрибута, чтобы отличать, какая
// именно группа карточек кликнута (sender/recipient/ext).
function pcClientTypeCardsHtml(name, selected) {
  const c = t("operationsPayments.create");
  return `
    <div class="filters-field">
      <span class="filters-field-label">${pcReq(c.clientType)}</span>
      <div class="pc-direction-cards">
        <button type="button" class="pc-direction-card${selected === "INDIVIDUAL" ? " is-active" : ""}" data-pc-clienttype="${name}:INDIVIDUAL">
          <div class="pc-direction-card-title">${t("paymentClientType.INDIVIDUAL")}</div>
          <div class="pc-direction-card-desc">${c.clientTypeIndividualDesc}</div>
        </button>
        <button type="button" class="pc-direction-card${selected === "CORPORATE" ? " is-active" : ""}" data-pc-clienttype="${name}:CORPORATE">
          <div class="pc-direction-card-title">${t("paymentClientType.CORPORATE")}</div>
          <div class="pc-direction-card-desc">${c.clientTypeCorporateDesc}</div>
        </button>
      </div>
    </div>
  `;
}

function pcBindClientTypeCards(modalEl, name, onPick) {
  modalEl.querySelectorAll(`[data-pc-clienttype^="${name}:"]`).forEach((btn) => {
    btn.addEventListener("click", () => {
      const [, value] = btn.dataset.pcClienttype.split(":");
      onPick(value);
    });
  });
}

// ---- Простая форма "нашей" стороны: тип клиента → клиент → счёт, каждый
// следующий блок появляется только после выбора предыдущего. --------------------
function pcSimplePartyHtml(side) {
  const c = t("operationsPayments.create");
  const s = pcState;
  const clientTypeKey = side === "sender" ? "senderClientType" : "recipientClientType";
  const clientKey = side === "sender" ? "sender" : "recipientClient";
  const accountKey = side === "sender" ? "senderAccount" : "recipientAccount";
  const clientType = s[clientTypeKey];
  const client = s[clientKey];
  const account = s[accountKey];
  const accountOptions = client ? pcAccountOptionsForClient(client.id) : [];
  return `
    ${pcClientTypeCardsHtml(side, clientType)}
    ${
      clientType
        ? `<div class="profile-fields-grid profile-fields-grid-2">
            ${pcClientPickerHtml(side, pcReq(side === "sender" ? c.sender : c.recipientClient), c.senderPlaceholder, client, clientType)}
            ${
              client
                ? `<div class="filters-field">
                    <span class="filters-field-label">${pcReq(side === "sender" ? c.senderAccountId : c.recipientAccountId)}</span>
                    ${pcAccountDropdownHtml(side, accountOptions, account)}
                  </div>`
                : ""
            }
          </div>`
        : ""
    }
  `;
}

function pcBindSimpleParty(modalEl, side) {
  const clientTypeKey = side === "sender" ? "senderClientType" : "recipientClientType";
  const clientKey = side === "sender" ? "sender" : "recipientClient";
  const accountKey = side === "sender" ? "senderAccount" : "recipientAccount";

  pcBindClientTypeCards(modalEl, side, (value) => {
    pcState[clientTypeKey] = value;
    pcState[clientKey] = null;
    pcState[accountKey] = null;
    pcRenderStep(modalEl);
  });

  attachPcClientPicker(
    modalEl,
    side,
    (client) => {
      pcState[clientKey] = client;
      pcState[accountKey] = null;
      pcRenderStep(modalEl);
    },
    () => pcState[clientTypeKey]
  );

  modalEl.querySelectorAll(`[data-pc-account-open]`).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const accountId = btn.dataset.pcAccountOpen;
      closeModal();
      window.location.hash = `#/accounts-virtual/${accountId}`;
    });
  });

  modalEl.querySelectorAll(`[data-pc-account-pick^="${side}:"]`).forEach((row) => {
    row.addEventListener("click", () => {
      const [, accountId, currency] = row.dataset.pcAccountPick.split(":");
      pcState[accountKey] = { accountId, currency, label: `${currency} - ...${accountId.slice(-6)}` };
      pcRenderStep(modalEl);
    });
  });
}

// ---- Полная форма внешней стороны: тип клиента, рельс, [провайдер],
// банк/адрес получателя/отправителя, назначение/источник средств, корр.банк
// (только SWIFT). ------------------------------------------------------------------
// Рельс — выпадающий список с описанием на каждый пункт (не голый select).
function pcRailDropdownHtml() {
  const c = t("operationsPayments.create");
  const s = pcState;
  const descKey = { SWIFT: "railSwiftDesc", WIRE: "railWireDesc", ACH: "railAchDesc", SBP: "railSbpDesc" };
  return `
    <div class="filters-field">
      <span class="filters-field-label">${pcReq(c.rail)}</span>
      <div class="pc-dropdown" id="pc-dropdown-rail">
        <button type="button" class="pc-dropdown-trigger" data-pc-dropdown-toggle="rail">
          <span>${s.rail ? paymentSystemLabel(s.rail) : c.railPlaceholder}</span>
          <span class="pc-dropdown-chevron">${FILTER_GROUP_CHEVRON}</span>
        </button>
        <div class="pc-dropdown-panel">
          ${PAYMENT_CREATE_RAILS.map(
            (r) => `
              <button type="button" class="pc-dropdown-option${s.rail === r ? " is-selected" : ""}" data-pc-rail-pick="${r}">
                <div class="pc-dropdown-option-title">${paymentSystemLabel(r)}</div>
                <div class="pc-dropdown-option-desc">${c[descKey[r]]}</div>
              </button>`
          ).join("")}
        </div>
      </div>
    </div>
  `;
}

// Тип клиента → рельс → остальные поля — каждый следующий блок появляется
// только после выбора предыдущего.
function pcExternalPartyHtml(showProvider) {
  const c = t("operationsPayments.create");
  const en = t("paymentDetail.enums");
  const s = pcState;
  if (!s.extClientType) {
    return `${pcClientTypeCardsHtml("ext", s.extClientType)}<div class="form-error" id="pc-error" hidden></div>`;
  }
  if (!s.rail) {
    return `${pcClientTypeCardsHtml("ext", s.extClientType)}${pcRailDropdownHtml()}<div class="form-error" id="pc-error" hidden></div>`;
  }
  return `
    ${pcClientTypeCardsHtml("ext", s.extClientType)}
    ${pcRailDropdownHtml()}
    ${
      showProvider
        ? `
    <div class="pc-section">
      <div class="pc-section-title">${c.providerSection}</div>
      <div class="profile-fields-grid profile-fields-grid-2">
        <label class="filters-field"><span class="filters-field-label">${c.provider}</span>
          <select class="address-form-input" id="pc-providerId">
            <option value="">—</option>
            ${ACC_PROVIDERS.map((p) => `<option value="${p.id}"${s.providerId === p.id ? " selected" : ""}>${p.name}</option>`).join("")}
          </select>
        </label>
        <label class="filters-field"><span class="filters-field-label">${c.providerTxId}</span><input type="text" class="address-form-input" id="pc-providerTxId" value="${escapeAttr(s.providerTxId)}" /></label>
      </div>
    </div>`
        : ""
    }
    ${
      s.rail === "SBP"
        ? `
    <div class="pc-section">
      <div class="pc-section-title">${c.bankSection}</div>
      <div class="profile-fields-grid profile-fields-grid-2">
        <label class="filters-field"><span class="filters-field-label">${pcReq(c.sbpBankId)}</span><input type="text" class="address-form-input" id="pc-sbp-bankId" value="${escapeAttr(s.sbpBankId)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.sbpBankBic}</span><input type="text" class="address-form-input" id="pc-sbp-bic" value="${escapeAttr(s.sbpBankBic)}" /></label>
      </div>
    </div>`
        : `
    ${
      s.rail !== "SWIFT"
        ? `<label class="filters-field"><span class="filters-field-label">${pcReq(c.accountType)}</span>
            <select class="address-form-input" id="pc-accountType">
              <option value="CHECKING"${s.accountType === "CHECKING" ? " selected" : ""}>CHECKING</option>
              <option value="SAVINGS"${s.accountType === "SAVINGS" ? " selected" : ""}>SAVINGS</option>
            </select>
          </label>`
        : ""
    }
    <div class="pc-section">
      <div class="pc-section-title">${c.bankSection}</div>
      <div class="profile-fields-grid profile-fields-grid-3">
        <label class="filters-field"><span class="filters-field-label">${pcReq(c.bankCode)}</span><input type="text" class="address-form-input" id="pc-ext-bankCode" value="${escapeAttr(s.extBankCode)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${pcReq(c.accountNumber)}</span><input type="text" class="address-form-input" id="pc-ext-accountNumber" value="${escapeAttr(s.extAccountNumber)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${pcReq(c.bankCountry)}</span>
          <select class="address-form-input" id="pc-bank-country">
            <option value="">—</option>
            ${COUNTRY_OPTIONS.map((co) => `<option value="${co.id}"${s.bankCountry === co.id ? " selected" : ""}>${co.name}</option>`).join("")}
          </select>
        </label>
        <label class="filters-field"><span class="filters-field-label">${c.bankCity}</span><input type="text" class="address-form-input" id="pc-bank-city" value="${escapeAttr(s.bankCity)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${pcReq(c.bankName)}</span><input type="text" class="address-form-input" id="pc-bank-name" value="${escapeAttr(s.bankName)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.postalCode}</span><input type="text" class="address-form-input" id="pc-bank-postal" value="${escapeAttr(s.bankPostal)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.addressLine1}</span><input type="text" class="address-form-input" id="pc-bank-address" value="${escapeAttr(s.bankAddress)}" /></label>
      </div>
    </div>

    <div class="pc-section">
      <div class="pc-section-title">${c.recipientSection}</div>
      <div class="profile-fields-grid profile-fields-grid-3">
        <label class="filters-field"><span class="filters-field-label">${pcReq(c.firstName)}</span><input type="text" class="address-form-input" id="pc-ext-firstName" value="${escapeAttr(s.extFirstName)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.lastName}</span><input type="text" class="address-form-input" id="pc-ext-lastName" value="${escapeAttr(s.extLastName)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.email}</span><input type="text" class="address-form-input" id="pc-ext-email" value="${escapeAttr(s.extEmail)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${pcReq(c.country)}</span>
          <select class="address-form-input" id="pc-addr-country">
            <option value="">—</option>
            ${COUNTRY_OPTIONS.map((co) => `<option value="${co.id}"${s.addrCountry === co.id ? " selected" : ""}>${co.name}</option>`).join("")}
          </select>
        </label>
        <label class="filters-field"><span class="filters-field-label">${c.city}</span><input type="text" class="address-form-input" id="pc-addr-city" value="${escapeAttr(s.addrCity)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.postalCode}</span><input type="text" class="address-form-input" id="pc-addr-postal" value="${escapeAttr(s.addrPostal)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${pcReq(c.addressLine1)}</span><input type="text" class="address-form-input" id="pc-addr-line1" value="${escapeAttr(s.addrLine1)}" /></label>
      </div>
    </div>

    <div class="pc-section">
      <div class="profile-fields-grid profile-fields-grid-2">
        <label class="filters-field"><span class="filters-field-label">${pcReq(c.purposeOfPayment)}</span><input type="text" class="address-form-input" id="pc-purpose" value="${escapeAttr(s.purposeOfPayment)}" /></label>
        <label class="filters-field">
          <span class="filters-field-label">${c.sourceOfFunds}</span>
          <select class="address-form-input" id="pc-sourceOfFunds">
            <option value="">${c.sourceOfFundsPlaceholder}</option>
            ${PAYMENT_SOURCE_OF_FUNDS_OPTIONS.map((v) => `<option value="${v}"${s.sourceOfFunds === v ? " selected" : ""}>${en.sourceOfFunds[v]}</option>`).join("")}
          </select>
        </label>
      </div>
    </div>

    ${
      s.rail === "SWIFT"
        ? `
    <div class="pc-section">
      <div class="pc-section-title">${c.intermediarySection}</div>
      <div class="profile-fields-grid profile-fields-grid-3">
        <label class="filters-field"><span class="filters-field-label">${c.intermediaryBankCode}</span><input type="text" class="address-form-input" id="pc-interm-code" value="${escapeAttr(s.intermCode)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.intermediaryBankName}</span><input type="text" class="address-form-input" id="pc-interm-name" value="${escapeAttr(s.intermName)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.bankCountry}</span>
          <select class="address-form-input" id="pc-interm-country">
            <option value="">—</option>
            ${COUNTRY_OPTIONS.map((co) => `<option value="${co.id}"${s.intermCountry === co.id ? " selected" : ""}>${co.name}</option>`).join("")}
          </select>
        </label>
        <label class="filters-field"><span class="filters-field-label">${c.bankCity}</span><input type="text" class="address-form-input" id="pc-interm-city" value="${escapeAttr(s.intermCity)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.addressLine1}</span><input type="text" class="address-form-input" id="pc-interm-address" value="${escapeAttr(s.intermAddress)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.postalCode}</span><input type="text" class="address-form-input" id="pc-interm-postal" value="${escapeAttr(s.intermPostal)}" /></label>
      </div>
    </div>`
        : ""
    }`
    }
    <div class="form-error" id="pc-error" hidden></div>
  `;
}

function pcBindExternalParty(modalEl) {
  const bindText = (id, key) => {
    const el = modalEl.querySelector(`#${id}`);
    if (el) el.addEventListener("input", () => { pcState[key] = el.value; });
  };
  const bindSelect = (id, key, rerender) => {
    const el = modalEl.querySelector(`#${id}`);
    if (el) el.addEventListener("change", () => { pcState[key] = el.value; if (rerender) pcRenderStep(modalEl); });
  };

  pcBindClientTypeCards(modalEl, "ext", (value) => {
    pcState.extClientType = value;
    pcRenderStep(modalEl);
  });
  modalEl.querySelectorAll("[data-pc-rail-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pcState.rail = btn.dataset.pcRailPick;
      pcRenderStep(modalEl);
    });
  });
  bindSelect("pc-providerId", "providerId");
  bindText("pc-providerTxId", "providerTxId");
  bindText("pc-sbp-bankId", "sbpBankId");
  bindText("pc-sbp-bic", "sbpBankBic");
  bindSelect("pc-accountType", "accountType");
  bindText("pc-ext-bankCode", "extBankCode");
  bindText("pc-ext-accountNumber", "extAccountNumber");
  bindSelect("pc-bank-country", "bankCountry");
  bindText("pc-bank-city", "bankCity");
  bindText("pc-bank-name", "bankName");
  bindText("pc-bank-postal", "bankPostal");
  bindText("pc-bank-address", "bankAddress");
  bindText("pc-ext-firstName", "extFirstName");
  bindText("pc-ext-lastName", "extLastName");
  bindText("pc-ext-email", "extEmail");
  bindSelect("pc-addr-country", "addrCountry");
  bindText("pc-addr-city", "addrCity");
  bindText("pc-addr-postal", "addrPostal");
  bindText("pc-addr-line1", "addrLine1");
  bindText("pc-purpose", "purposeOfPayment");
  bindSelect("pc-sourceOfFunds", "sourceOfFunds");
  bindText("pc-interm-code", "intermCode");
  bindText("pc-interm-name", "intermName");
  bindSelect("pc-interm-country", "intermCountry");
  bindText("pc-interm-city", "intermCity");
  bindText("pc-interm-address", "intermAddress");
  bindText("pc-interm-postal", "intermPostal");
}

// ---- Шаг 2/3: "Информация об отправителе"/"Информация о получателе" — форма
// зависит от того, внутренняя эта сторона или внешняя (см. pcSenderIsInternal/
// pcRecipientIsInternal). -----------------------------------------------------------
function pcStepSenderHtml() {
  return pcSenderIsInternal() ? pcSimplePartyHtml("sender") : pcExternalPartyHtml(pcState.direction === "INCOMING");
}
function pcStepRecipientHtml() {
  return pcRecipientIsInternal() ? pcSimplePartyHtml("recipient") : pcExternalPartyHtml(false);
}
function pcBindStepSender(modalEl) {
  if (pcSenderIsInternal()) pcBindSimpleParty(modalEl, "sender");
  else pcBindExternalParty(modalEl);
}
function pcBindStepRecipient(modalEl) {
  if (pcRecipientIsInternal()) pcBindSimpleParty(modalEl, "recipient");
  else pcBindExternalParty(modalEl);
}

function pcValidateExternalParty() {
  const c = t("operationsPayments.create");
  const s = pcState;
  if (!s.extClientType) return c.errClientType;
  if (!s.rail) return c.errRail;
  if (s.rail === "SBP") {
    if (!s.sbpBankId.trim()) return c.errSbpBankId;
    return null;
  }
  if (!s.extBankCode.trim()) return c.errBankCode;
  if (!s.extAccountNumber.trim()) return c.errAccountNumber;
  if (!s.bankName.trim()) return c.errBankName;
  if (!s.addrCountry) return c.errCountry;
  if (!s.extFirstName.trim()) return c.errAccountHolderName;
  if (!s.purposeOfPayment.trim()) return c.errPurpose;
  return null;
}
function pcValidateStepSender() {
  const c = t("operationsPayments.create");
  const s = pcState;
  if (pcSenderIsInternal()) {
    if (!s.senderClientType) return c.errClientType;
    if (!s.sender) return c.errSender;
    if (!s.senderAccount) return c.errSenderAccount;
    return null;
  }
  return pcValidateExternalParty();
}
function pcValidateStepRecipient() {
  const c = t("operationsPayments.create");
  const s = pcState;
  if (pcRecipientIsInternal()) {
    if (!s.recipientClientType) return c.errClientType;
    if (!s.recipientClient) return c.errRecipientClient;
    if (!s.recipientAccount) return c.errRecipientAccount;
    return null;
  }
  return pcValidateExternalParty();
}

// ---- Шаг 4: Количество — сумма отправки редактируется, комиссии и сумма
// получения — расчётные (обновляются на лету без полной перерисовки шага,
// чтобы не терять фокус в поле суммы). Валюта — из выбранного счёта "нашей"
// стороны (в этой форме нет отдельного шага конвертации/quoteId). ---------------
function pcCurrentCurrency() {
  const s = pcState;
  if (pcSenderIsInternal() && s.senderAccount) return s.senderAccount.currency;
  if (pcRecipientIsInternal() && s.recipientAccount) return s.recipientAccount.currency;
  return "USD";
}
function pcComputedFees(amount) {
  const serviceFee = +(amount * 0.005).toFixed(2);
  const providerFee = pcState.direction === "INNER" ? 0 : +(amount * 0.005).toFixed(2);
  const amountReceive = +(amount - serviceFee - providerFee).toFixed(2);
  return { serviceFee, providerFee, amountReceive };
}
function pcStepAmountHtml() {
  const c = t("operationsPayments.create");
  const s = pcState;
  const amount = parseFloat(String(s.amount).replace(",", ".")) || 0;
  const { serviceFee, providerFee, amountReceive } = pcComputedFees(amount);
  const currency = pcCurrentCurrency();
  return `
    <div class="profile-fields-grid profile-fields-grid-2">
      <label class="filters-field"><span class="filters-field-label">${pcReq(c.amount)}</span>
        <div class="pc-amount-input"><input type="number" min="0" step="0.01" class="address-form-input" id="pc-amount" value="${escapeAttr(s.amount)}" /><span class="pc-amount-currency">${currency}</span></div>
      </label>
      <div></div>
      <label class="filters-field"><span class="filters-field-label">${c.bankFee}</span><div class="pc-amount-input"><input type="text" class="address-form-input" value="${serviceFee}" disabled /><span class="pc-amount-currency">${currency}</span></div></label>
      ${s.direction !== "INNER" ? `<label class="filters-field"><span class="filters-field-label">${c.providerFee}</span><div class="pc-amount-input"><input type="text" class="address-form-input" value="${providerFee}" disabled /><span class="pc-amount-currency">${currency}</span></div></label>` : ""}
      <label class="filters-field"><span class="filters-field-label">${c.amountReceive}</span><div class="pc-amount-input"><input type="text" class="address-form-input" value="${amountReceive}" disabled /><span class="pc-amount-currency">${currency}</span></div></label>
    </div>
    <div class="form-error" id="pc-error" hidden></div>
  `;
}
function pcBindStepAmount(modalEl) {
  const amountEl = modalEl.querySelector("#pc-amount");
  const feeEls = [...modalEl.querySelectorAll(".pc-amount-input input[disabled]")];
  amountEl.addEventListener("input", () => {
    pcState.amount = amountEl.value;
    const amount = parseFloat(amountEl.value.replace(",", ".")) || 0;
    const { serviceFee, providerFee, amountReceive } = pcComputedFees(amount);
    const values = pcState.direction === "INNER" ? [serviceFee, amountReceive] : [serviceFee, providerFee, amountReceive];
    feeEls.forEach((el, i) => { el.value = values[i]; });
  });
}
function pcValidateStepAmount() {
  const c = t("operationsPayments.create");
  const amount = parseFloat(String(pcState.amount).replace(",", "."));
  if (!amount || amount <= 0) return c.errAmount;
  return null;
}

// ---- Шаг 5: Краткое содержание — отправитель→получатель, суммы, сворачиваемые
// детали всех реквизитов, вложения (attachments: AttachmentInput[] — реальное
// поле CreateCommonPaymentInput), кнопки "Сохранить черновик"/"Создать". --------
function pcAttachmentsListHtml() {
  const c = t("operationsPayments.create");
  if (!pcState.attachments.length) return `<div class="table-cell-muted">${c.noAttachments}</div>`;
  return `<div class="documents-list">${pcState.attachments
    .map((f, idx) => pdAttachmentRowHtml(f, `<button type="button" class="icon-btn icon-btn-danger" data-pc-attach-remove="${idx}">${TRASH_ICON_SVG}</button>`))
    .join("")}</div>`;
}

function pcSummaryPartyName(side) {
  const c = t("operationsPayments.create");
  const s = pcState;
  const isInternal = side === "sender" ? pcSenderIsInternal() : pcRecipientIsInternal();
  if (isInternal) {
    const client = side === "sender" ? s.sender : s.recipientClient;
    return client ? client.name : c.notSpecified;
  }
  const name = [s.extFirstName, s.extLastName].filter(Boolean).join(" ");
  return name || c.notSpecified;
}

function pcCountryName(id) {
  if (!id) return null;
  const found = COUNTRY_OPTIONS.find((x) => x.id === id);
  return found ? found.name : id;
}

function pcStepSummaryHtml() {
  const c = t("operationsPayments.create");
  const s = pcState;
  const amount = parseFloat(String(s.amount).replace(",", ".")) || 0;
  const { serviceFee, providerFee, amountReceive } = pcComputedFees(amount);
  const currency = pcCurrentCurrency();

  const detailRows = [];
  if (pcSenderIsInternal() && s.senderAccount) detailRows.push([c.senderAccountId, s.senderAccount.label]);
  if (pcRecipientIsInternal() && s.recipientAccount) detailRows.push([c.recipientAccountId, s.recipientAccount.label]);
  if (!pcSenderIsInternal() || !pcRecipientIsInternal()) {
    detailRows.push(
      [c.bankCode, s.extBankCode],
      [c.accountNumber, s.extAccountNumber],
      [c.bankName, s.bankName],
      [c.bankCountry, pcCountryName(s.bankCountry)],
      [c.bankCity, s.bankCity],
      [c.postalCode, s.bankPostal],
      [c.addressLine1, s.bankAddress],
      [c.country, pcCountryName(s.addrCountry)],
      [c.city, s.addrCity],
      [c.addressLine1, s.addrLine1],
      [c.email, s.extEmail]
    );
    if (s.rail === "SWIFT" && (s.intermName || s.intermCode)) detailRows.push([c.intermediaryBankName, s.intermName], [c.intermediaryBankCode, s.intermCode]);
    if (s.providerId) detailRows.push([c.provider, (ACC_PROVIDERS.find((p) => p.id === s.providerId) || {}).name], [c.providerTxId, s.providerTxId]);
  }

  return `
    <p class="modal-confirm-text pd-modal-intro">${c.summaryIntro}</p>
    <div class="pd-parties-row">
      <div class="pd-party-box"><div class="pd-party-box-label">${c.sender}</div><div class="pd-party-box-main">${pdEscape(pcSummaryPartyName("sender"))}</div></div>
      <div class="pd-parties-arrow">${PD_ARROW_ICON}</div>
      <div class="pd-party-box"><div class="pd-party-box-label">${c.recipientSection}</div><div class="pd-party-box-main">${pdEscape(pcSummaryPartyName("recipient"))}</div></div>
    </div>
    <div class="profile-fields-grid profile-fields-grid-2">
      ${detailField(c.rail, s.direction === "INNER" ? paymentSystemLabel("INNER") : paymentSystemLabel(s.rail))}
      ${detailField(c.amount, `${amount} ${currency}`)}
      ${detailField(c.bankFee, `${serviceFee} ${currency}`)}
      ${s.direction !== "INNER" ? detailField(c.providerFee, `${providerFee} ${currency}`) : ""}
      ${detailField(c.amountReceive, `${amountReceive} ${currency}`)}
    </div>
    ${
      detailRows.length
        ? `<button type="button" class="table-link" id="pc-toggle-details">${s.showDetails ? c.hideDetails : c.showDetails}</button>
      ${s.showDetails ? `<div class="profile-fields-grid profile-fields-grid-3">${detailRows.map(([label, value]) => detailField(label, value || c.notSpecified)).join("")}</div>` : ""}`
        : ""
    }
    <div class="pd-req-subtitle">${c.attachmentsTitle}</div>
    <label class="pc-dropzone" id="pc-dropzone" for="pc-attach-file">${c.dropzoneHint}</label>
    <input type="file" id="pc-attach-file" hidden />
    <div id="pc-attachments-list">${pcAttachmentsListHtml()}</div>
    <div class="form-error" id="pc-error" hidden></div>
  `;
}

function pcBindStepSummary(modalEl) {
  const toggleBtn = modalEl.querySelector("#pc-toggle-details");
  if (toggleBtn) toggleBtn.addEventListener("click", () => { pcState.showDetails = !pcState.showDetails; pcRenderStep(modalEl); });

  const listEl = modalEl.querySelector("#pc-attachments-list");
  const fileInput = modalEl.querySelector("#pc-attach-file");
  const dropzone = modalEl.querySelector("#pc-dropzone");
  const addFile = (file) => {
    if (!file) return;
    pcState.attachments.push({
      id: `at-new-${Date.now()}`,
      customFileName: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      // Реальный object URL — превью для картинок и скачивание любого файла.
      url: URL.createObjectURL(file),
    });
    listEl.innerHTML = pcAttachmentsListHtml();
    bindRemove();
  };
  const bindRemove = () => {
    listEl.querySelectorAll("[data-pc-attach-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pcState.attachments.splice(Number(btn.dataset.pcAttachRemove), 1);
        listEl.innerHTML = pcAttachmentsListHtml();
        bindRemove();
      });
    });
  };
  bindRemove();

  fileInput.addEventListener("change", () => { addFile(fileInput.files[0]); fileInput.value = ""; });
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("is-dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    addFile(e.dataTransfer.files[0]);
  });
}

// ---- Степпер (заголовок шагов) — тот же паттерн, что и в мастере добавления
// документа клиента (documentWizardStepperHtml, clients-users.js), 5 шагов. ------
function pcStepperHtml() {
  const c = t("operationsPayments.create");
  const steps = [
    { n: 1, label: c.steps.direction },
    { n: 2, label: c.steps.sender },
    { n: 3, label: c.steps.recipient },
    { n: 4, label: c.steps.amount },
    { n: 5, label: c.steps.summary },
  ];
  return `
    <div class="kyc-stepper">
      ${steps
        .map((st, idx) => {
          const cls = st.n < pcState.step ? "is-done" : st.n === pcState.step ? "is-current" : "is-pending";
          return `
            <div class="kyc-stepper-item">
              <div class="kyc-stepper-circle ${cls}">${st.n < pcState.step ? CHECK_ICON_SVG : `<span>${st.n}</span>`}</div>
              ${idx < steps.length - 1 ? `<div class="kyc-stepper-line${st.n < pcState.step ? " is-done" : ""}"></div>` : ""}
              <div class="kyc-stepper-label"><div class="kyc-stepper-title">${st.label}</div></div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function pcStepBodyHtml() {
  const inner =
    pcState.step === 1
      ? pcStepDirectionHtml()
      : pcState.step === 2
        ? pcStepSenderHtml()
        : pcState.step === 3
          ? pcStepRecipientHtml()
          : pcState.step === 4
            ? pcStepAmountHtml()
            : pcStepSummaryHtml();
  return `<div class="pc-form-stack">${inner}</div>`;
}

function pcBindStep(modalEl) {
  if (pcState.step === 1) pcBindStepDirection(modalEl);
  else if (pcState.step === 2) pcBindStepSender(modalEl);
  else if (pcState.step === 3) pcBindStepRecipient(modalEl);
  else if (pcState.step === 4) pcBindStepAmount(modalEl);
  else pcBindStepSummary(modalEl);
}

function pcFooterHtml() {
  const c = t("operationsPayments.create");
  if (pcState.step === 5) {
    return `<button type="button" class="btn-secondary" id="pc-back">${c.back}</button><button type="button" class="btn-secondary" id="pc-save-draft">${c.saveDraft}</button><button type="button" class="btn-primary" id="pc-next">${c.submit}</button>`;
  }
  const backBtn =
    pcState.step > 1
      ? `<button type="button" class="btn-secondary" id="pc-back">${c.back}</button>`
      : `<button type="button" class="btn-secondary" id="pc-cancel">${c.cancel}</button>`;
  return `${backBtn}<button type="button" class="btn-primary" id="pc-next">${c.next}</button>`;
}

function pcRenderStep(modalEl) {
  modalEl.querySelector(".modal-body").innerHTML = `${pcStepperHtml()}${pcStepBodyHtml()}`;
  modalEl.querySelector(".modal-footer").innerHTML = pcFooterHtml();
  pcBindStepChrome(modalEl);
  pcBindStep(modalEl);
}

function pcBindStepChrome(modalEl) {
  const cancelBtn = modalEl.querySelector("#pc-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  const backBtn = modalEl.querySelector("#pc-back");
  if (backBtn) backBtn.addEventListener("click", () => { pcState.step -= 1; pcRenderStep(modalEl); });
  const saveDraftBtn = modalEl.querySelector("#pc-save-draft");
  if (saveDraftBtn) saveDraftBtn.addEventListener("click", () => pcFinish(false));
  modalEl.querySelector("#pc-next").addEventListener("click", () => pcGoNext(modalEl));
}

function pcGoNext(modalEl) {
  const errEl = modalEl.querySelector("#pc-error");
  const fail = (msg) => {
    if (errEl) {
      errEl.textContent = msg;
      errEl.hidden = false;
    }
  };

  if (pcState.step === 2) {
    const err = pcValidateStepSender();
    if (err) return fail(err);
  } else if (pcState.step === 3) {
    const err = pcValidateStepRecipient();
    if (err) return fail(err);
  } else if (pcState.step === 4) {
    const err = pcValidateStepAmount();
    if (err) return fail(err);
  }

  if (pcState.step < 5) {
    pcState.step += 1;
    pcRenderStep(modalEl);
    return;
  }

  pcFinish(true);
}

function pcFinish(alsoSend) {
  submitCreatePayment(alsoSend);
  closeModal();
  window.location.hash = `#/operations-payments/${pcLastCreatedId}`;
}

let paymentCreateSeed = 90000;
let pcLastCreatedId = null;

// Строит запись мока в том же формате, что и остальные строки
// OPERATIONS_PAYMENTS_MOCK — _manual/_manualRail даёт понять
// getPaymentDetailExtras, что реквизиты брать из формы, а не генерировать по
// хешу id (см. buildManualPaymentExtras, operations-payment-details.mock.js).
// status/previousStatus — DRAFT для "Сохранить черновик" и PROCESSING (с
// previousStatus=DRAFT) для "Создать" — тот же переход, что и prepare→send.
function buildManualPaymentRow({ rail, direction, amount, currency, purposeOfPayment, sourceOfFunds, senderClient, recipientClient, manualRail, status }) {
  paymentCreateSeed += 1;
  const id = seedToPaymentUuid(paymentCreateSeed);
  const now = pdNow();
  const feeAmount = +(amount * 0.01).toFixed(2); // 0.5% сервис + 0.5% провайдер — как на шаге "Количество"
  const totalAmount = +(amount + feeAmount).toFixed(2);
  return {
    id,
    code: entityCode(rail === "CRYPTO_WALLET" ? "CRY" : "PAY", paymentCreateSeed),
    createdDate: now,
    updatedDate: now,
    createdAt: formatDateTime(now),
    updatedAt: formatDateTime(now),
    settledDate: null,
    settledAt: null,
    direction: direction === "INNER" ? "BOTH" : direction,
    paymentSystem: rail,
    status,
    previousStatus: status === "PROCESSING" ? "DRAFT" : null,
    isFavorite: false,
    sourceOfFunds: sourceOfFunds || null,
    senderClientId: (senderClient && senderClient.id) || null,
    senderClientType: senderClient ? senderClient.type : null,
    senderClientName: senderClient ? senderClient.name : null,
    senderClientLink: paymentClientLink(senderClient),
    recipientClientId: (recipientClient && recipientClient.id) || null,
    recipientClientType: recipientClient ? recipientClient.type : null,
    recipientClientName: recipientClient ? recipientClient.name : null,
    recipientClientLink: paymentClientLink(recipientClient),
    sourceAmount: amount,
    sourceCurrency: currency,
    targetAmount: amount,
    targetCurrency: currency,
    exchangeRate: 1,
    feeAmount,
    feeCurrency: currency,
    totalAmount,
    totalCurrency: currency,
    purposeOfPayment: purposeOfPayment || null,
    _manual: true,
    _manualRail: manualRail,
  };
}

function submitCreatePayment(alsoSend) {
  const s = pcState;
  const amount = parseFloat(String(s.amount).replace(",", ".")) || 0;
  const currency = pcCurrentCurrency();
  const extParty = { type: s.extClientType, name: [s.extFirstName, s.extLastName].filter(Boolean).join(" ") || null };

  let senderClient, recipientClient, manualRail;
  let purposeOfPayment = null;
  let sourceOfFunds = null;

  if (s.direction === "INNER") {
    senderClient = s.sender;
    recipientClient = s.recipientClient;
    manualRail = {
      kind: "inner",
      senderClient: { accountId: s.senderAccount ? s.senderAccount.accountId : null, email: null, phoneNumber: null },
      recipientClient: { accountId: s.recipientAccount ? s.recipientAccount.accountId : null, email: null, phoneNumber: null },
    };
  } else {
    purposeOfPayment = s.purposeOfPayment || null;
    sourceOfFunds = s.sourceOfFunds || null;
    const internalClient = s.direction === "OUTGOING" ? s.sender : s.recipientClient;
    const internalAccount = s.direction === "OUTGOING" ? s.senderAccount : s.recipientAccount;
    senderClient = s.direction === "OUTGOING" ? s.sender : extParty;
    recipientClient = s.direction === "OUTGOING" ? extParty : s.recipientClient;

    if (s.rail === "SBP") {
      manualRail = {
        kind: "sbp",
        internal: { accountHolderName: internalClient ? internalClient.name : null, accountNumber: internalAccount ? internalAccount.accountId : null },
        external: { bankId: s.sbpBankId, bankBic: s.sbpBankBic || null, clientType: s.extClientType },
      };
    } else {
      manualRail = {
        kind: "base",
        accountType: s.rail === "SWIFT" ? null : s.accountType,
        internal: { accountHolderName: internalClient ? internalClient.name : null, accountNumber: internalAccount ? internalAccount.accountId : null, bankName: pick(PAYMENT_MOCK_BANKS, paymentHash(internalClient ? internalClient.id : "manual-payment")).name },
        external: {
          firstName: s.extFirstName || null,
          lastName: s.extLastName || null,
          middleName: null,
          accountHolderName: extParty.name,
          clientType: s.extClientType,
          bankCode: s.extBankCode,
          accountNumber: s.extAccountNumber,
          branchCode: null,
          bankName: s.bankName,
          country: pcCountryName(s.bankCountry),
          city: s.bankCity || null,
          addressLine: s.bankAddress || null,
          postalCode: s.bankPostal || null,
        },
        intermediaryBank: s.rail === "SWIFT" && (s.intermName || s.intermCode) ? { name: s.intermName || null, bankCode: s.intermCode || null } : null,
      };
    }
  }

  const row = buildManualPaymentRow({
    rail: s.direction === "INNER" ? "INNER" : s.rail,
    direction: s.direction,
    amount,
    currency,
    purposeOfPayment,
    sourceOfFunds,
    senderClient,
    recipientClient,
    manualRail,
    status: alsoSend ? "PROCESSING" : "DRAFT",
  });
  row.attachments = s.attachments;

  OPERATIONS_PAYMENTS_MOCK.unshift(row);
  pcLastCreatedId = row.id;
}

// Открытие/закрытие любого .pc-dropdown (рельс, счёт) — один делегированный
// обработчик на всю модалку, навешан один раз при монтировании: pcRenderStep
// заменяет только innerHTML .modal-body/.modal-footer, сам modalEl не
// пересоздаётся, поэтому обработчик переживает переключение шагов (тот же
// принцип, что и initRowKebabDelegation в clients-users.js).
function pcBindDropdowns(modalEl) {
  modalEl.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-pc-dropdown-toggle]");
    if (toggleBtn) {
      const wrap = modalEl.querySelector(`#pc-dropdown-${toggleBtn.dataset.pcDropdownToggle}`);
      if (!wrap) return;
      const wasOpen = wrap.classList.contains("is-open");
      modalEl.querySelectorAll(".pc-dropdown.is-open").forEach((el) => el.classList.remove("is-open"));
      if (!wasOpen) wrap.classList.add("is-open");
      return;
    }
    if (!e.target.closest(".pc-dropdown-panel")) {
      modalEl.querySelectorAll(".pc-dropdown.is-open").forEach((el) => el.classList.remove("is-open"));
    }
  });
}

function openCreatePaymentModal() {
  pcState = pcEmptyState();
  const c = t("operationsPayments.create");
  openModal({
    title: c.title,
    width: 720,
    bodyHtml: `${pcStepperHtml()}${pcStepBodyHtml()}`,
    footerHtml: pcFooterHtml(),
    onMount: (modalEl) => {
      pcBindDropdowns(modalEl);
      pcBindStepChrome(modalEl);
      pcBindStep(modalEl);
    },
  });
}

// ---- Мастер создания КРИПТОплатежа (рельс CRYPTO_WALLET) ----------------------------------------------
// Отличается от фиатного: нет рельса/банка/адреса/назначения — вместо них операция (вывод во внешний кошелёк или
// перевод между клиентами), счёт USDT, сеть и адрес получателя (внешний крипто-адрес, а не клиент) и комиссия сети.
// Ввод (CUSTOMER_DEPOSIT) вручную не создаём: он приходит из сети. Комиссии сети — условные значения прототипа.
const CW_NETWORK_FEE = { TRON: 1, ETHEREUM: 5 }; // сети из справочника vABS

function cwAddressValid(network, address) {
  const a = String(address || "").trim();
  return network === "TRON" ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) : /^0x[0-9a-fA-F]{40}$/.test(a);
}

let cwState = null;
function cwEmptyState() {
  return { step: 1, op: "WITHDRAWAL", senderId: "", senderAcc: "", recipientId: "", recipientAcc: "", network: "TRON", address: "", tag: "", amount: "" };
}

// Клиенты, у которых есть активный счёт с USDT (без него платёж не создать)
function cwClients() {
  const ids = new Set();
  ACCOUNTS_VIRTUAL_MOCK.forEach((a) => {
    if (a.client && a.type === "CLIENT" && a.status === "ACTIVE" && a.balances.some((b) => b.currency === "USDT")) ids.add(a.client.id);
  });
  return [...ids].map(paymentClientById).filter(Boolean);
}

function cwAccounts(clientId) {
  if (!clientId) return [];
  return ACCOUNTS_VIRTUAL_MOCK.filter((a) => a.client && a.client.id === clientId && a.type === "CLIENT" && a.status === "ACTIVE").flatMap((a) =>
    a.balances.filter((b) => b.currency === "USDT").map((b) => ({ value: a.id, available: b.available, label: `USDT - ...${a.id.slice(-6)}` }))
  );
}

function cwDropdownField(id, label, options, selected, placeholder, emptyText) {
  const sel = options.find((o) => o.value === selected);
  const items = options.length
    ? options
        .map((o) => `<div class="pc-account-item${o.value === selected ? " is-selected" : ""}" data-cw-pick="${id}:${escapeAttr(o.value)}"><span>${pdEscape(o.label)}</span>${o.value === selected ? `<span class="pc-account-item-check">${CHECK_ICON_SVG}</span>` : ""}</div>`)
        .join("")
    : `<div class="table-cell-muted" style="padding: var(--space-2) var(--space-3);">${emptyText || ""}</div>`;
  return `
    <div class="filters-field vb-field">
      <span class="filters-field-label">${label}</span>
      <div class="pc-dropdown" id="pc-dropdown-cw-${id}">
        <button type="button" class="pc-dropdown-trigger" data-pc-dropdown-toggle="cw-${id}"><span>${pdEscape(sel ? sel.label : placeholder)}</span><span class="pc-dropdown-chevron">${FILTER_GROUP_CHEVRON}</span></button>
        <div class="pc-dropdown-panel">${items}</div>
      </div>
    </div>`;
}

function cwFee() {
  return cwState.op === "WITHDRAWAL" ? CW_NETWORK_FEE[cwState.network] || 0 : 0;
}

function cwAmount() {
  return parseFloat(String(cwState.amount).replace(",", ".")) || 0;
}

function cwStepperHtml() {
  const c = t("operationsPayments.cryptoCreate");
  const steps = [c.steps.operation, c.steps.sender, c.steps.recipient, c.steps.amount, c.steps.summary];
  return `<div class="kyc-stepper">${steps
    .map((label, idx) => {
      const n = idx + 1;
      const cls = n < cwState.step ? "is-done" : n === cwState.step ? "is-current" : "is-pending";
      return `<div class="kyc-stepper-item"><div class="kyc-stepper-circle ${cls}">${n < cwState.step ? CHECK_ICON_SVG : `<span>${n}</span>`}</div>${idx < steps.length - 1 ? `<div class="kyc-stepper-line${n < cwState.step ? " is-done" : ""}"></div>` : ""}<div class="kyc-stepper-label"><div class="kyc-stepper-title">${label}</div></div></div>`;
    })
    .join("")}</div>`;
}

function cwStepHtml() {
  const c = t("operationsPayments.cryptoCreate");
  const s = cwState;
  const clients = cwClients().map((x) => ({ value: x.id, label: x.name }));
  if (s.step === 1) {
    const card = (op, title, desc) => `<button type="button" class="pc-direction-card${s.op === op ? " is-active" : ""}" data-cw-op="${op}"><div class="pc-direction-card-title">${title}</div><div class="pc-direction-card-desc">${desc}</div></button>`;
    return `<div class="pc-direction-cards">${card("WITHDRAWAL", c.opWithdrawal, c.opWithdrawalDesc)}${card("TRANSFER", c.opTransfer, c.opTransferDesc)}</div>`;
  }
  if (s.step === 2) {
    const accs = cwAccounts(s.senderId);
    const acc = accs.find((a) => a.value === s.senderAcc);
    return `${cwDropdownField("senderId", c.client, clients, s.senderId, c.pick)}
      ${cwDropdownField("senderAcc", c.account, accs, s.senderAcc, c.pick, s.senderId ? c.noAccounts : "")}
      ${acc ? `<div class="table-cell-muted">${c.available}: ${formatPaymentAmount(acc.available)} USDT</div>` : ""}`;
  }
  if (s.step === 3) {
    if (s.op === "WITHDRAWAL") {
      const nets = Object.keys(CW_NETWORK_FEE).map((n) => ({ value: n, label: n }));
      return `${cwDropdownField("network", c.network, nets, s.network, c.pick)}
        ${vbInput("cw-address", c.address, s.address)}<div class="table-cell-muted">${c.addressHint}</div>
        ${vbInput("cw-tag", c.tag, s.tag)}<div class="table-cell-muted">${c.tagHint}</div>`;
    }
    const others = clients.filter((x) => x.value !== s.senderId);
    const accs = cwAccounts(s.recipientId);
    return `${cwDropdownField("recipientId", c.recipientClient, others, s.recipientId, c.pick)}
      ${cwDropdownField("recipientAcc", c.recipientAccount, accs, s.recipientAcc, c.pick, s.recipientId ? c.noAccounts : "")}`;
  }
  if (s.step === 4) {
    const acc = cwAccounts(s.senderId).find((a) => a.value === s.senderAcc);
    const fee = cwFee();
    return `${vbInput("cw-amount", c.amount, s.amount)}
      ${acc ? `<div class="table-cell-muted">${c.available}: ${formatPaymentAmount(acc.available)} USDT</div>` : ""}
      ${s.op === "WITHDRAWAL" ? `<div class="detail-row"><span class="table-cell-muted">${c.networkFee} (${s.network})</span> <strong>${formatPaymentAmount(fee)} USDT</strong></div>` : ""}
      <div class="detail-row"><span class="table-cell-muted">${c.total}</span> <strong id="cw-total">${formatPaymentAmount(cwAmount() + fee)} USDT</strong></div>`;
  }
  const sender = paymentClientById(s.senderId);
  const recipient = s.op === "TRANSFER" ? paymentClientById(s.recipientId) : null;
  const rows = [
    [c.summaryOperation, s.op === "WITHDRAWAL" ? c.opWithdrawal : c.opTransfer],
    [c.summarySender, sender ? sender.name : "—"],
    s.op === "WITHDRAWAL" ? [c.summaryNetwork, s.network] : null,
    [c.summaryRecipient, s.op === "WITHDRAWAL" ? c.summaryAddress : recipient ? recipient.name : "—"],
    s.op === "WITHDRAWAL" ? [c.summaryAddress, s.address.trim() + (s.tag.trim() ? ` · ${s.tag.trim()}` : "")] : null,
    [c.summaryAmount, `${formatPaymentAmount(cwAmount())} USDT`],
    [c.summaryFee, `${formatPaymentAmount(cwFee())} USDT`],
    [c.summaryTotal, `${formatPaymentAmount(cwAmount() + cwFee())} USDT`],
  ].filter(Boolean);
  return `<div class="profile-fields profile-fields-grid">${rows.map(([l, v]) => detailField(l, pdEscape(v))).join("")}</div>`;
}

function cwFooterHtml() {
  const c = t("operationsPayments.cryptoCreate");
  const back = cwState.step > 1 ? `<button type="button" class="btn-secondary" id="cw-back">${c.back}</button>` : `<button type="button" class="btn-secondary" id="cw-cancel">${c.cancel}</button>`;
  return `${back}<button type="button" class="btn-primary" id="cw-next">${cwState.step === 5 ? c.submit : c.next}</button>`;
}

function cwValidate() {
  const c = t("operationsPayments.cryptoCreate");
  const s = cwState;
  if (s.step === 2) {
    if (!s.senderId) return c.errClient;
    if (!s.senderAcc) return c.errAccount;
  } else if (s.step === 3) {
    if (s.op === "WITHDRAWAL") {
      if (!s.network) return c.errNetwork;
      if (!cwAddressValid(s.network, s.address)) return c.errAddress;
    } else {
      if (!s.recipientId) return c.errClient;
      if (s.recipientId === s.senderId) return c.errSame;
      if (!s.recipientAcc) return c.errAccount;
    }
  } else if (s.step === 4) {
    const amount = cwAmount();
    if (!(amount > 0)) return c.errAmount;
    const acc = cwAccounts(s.senderId).find((a) => a.value === s.senderAcc);
    if (acc && amount + cwFee() > acc.available) return c.errBalance;
  }
  return null;
}

function cwSubmit() {
  const s = cwState;
  const amount = cwAmount();
  const fee = cwFee();
  paymentCreateSeed += 1;
  const now = pdNow();
  const senderClient = paymentClientById(s.senderId);
  const recipientClient = s.op === "TRANSFER" ? paymentClientById(s.recipientId) : null;
  const withdrawal = s.op === "WITHDRAWAL";
  const cryptoWallet = {
    networkName: withdrawal ? s.network : "TRON",
    currencyTicker: "USDT",
    hash: null, // хеш появится после отправки транзакции в сеть
    addressFrom: withdrawal ? cwAddress(s.network, paymentCreateSeed) : null,
    addressFromTag: null,
    addressTo: withdrawal ? s.address.trim() : null,
    addressToTag: withdrawal ? s.tag.trim() || null : null,
  };
  const cryptoOperationType = withdrawal ? "CUSTOMER_WITHDRAWAL" : "CUSTOMER_TRANSFER";
  const row = {
    id: seedToPaymentUuid(paymentCreateSeed),
    code: entityCode("CRY", paymentCreateSeed),
    createdDate: now, updatedDate: now, createdAt: formatDateTime(now), updatedAt: formatDateTime(now),
    settledDate: null, settledAt: null,
    direction: withdrawal ? "OUTGOING" : "BOTH",
    paymentSystem: "CRYPTO_WALLET",
    cryptoOperationType,
    cryptoWallet,
    status: "PROCESSING",
    previousStatus: null,
    isFavorite: false,
    sourceOfFunds: null,
    senderClientId: senderClient.id, senderClientType: senderClient.type, senderClientName: senderClient.name, senderClientLink: paymentClientLink(senderClient),
    recipientClientId: recipientClient ? recipientClient.id : null,
    recipientClientType: recipientClient ? recipientClient.type : null,
    recipientClientName: recipientClient ? recipientClient.name : cwShort(cryptoWallet.addressTo),
    recipientClientLink: paymentClientLink(recipientClient),
    sourceAmount: amount, sourceCurrency: "USDT", targetAmount: amount, targetCurrency: "USDT", exchangeRate: 1,
    feeAmount: fee, feeCurrency: "USDT", totalAmount: +(amount + fee).toFixed(2), totalCurrency: "USDT",
    purposeOfPayment: null,
    attachments: [],
    _manual: true,
    _manualRail: { kind: "crypto", operationType: cryptoOperationType, ...cryptoWallet },
  };
  OPERATIONS_PAYMENTS_MOCK.unshift(row);
  return row.id;
}

function cwRenderStep(modalEl) {
  const body = modalEl.querySelector(".modal-body");
  body.innerHTML = `${cwStepperHtml()}<div class="pc-form-stack">${cwStepHtml()}<div class="form-error" id="cw-error" hidden></div></div>`;
  modalEl.querySelector(".modal-footer").innerHTML = cwFooterHtml();
  cwBind(modalEl);
}

function cwBind(modalEl) {
  const s = cwState;
  const fail = (msg) => { const el = modalEl.querySelector("#cw-error"); if (el) { el.textContent = msg; el.hidden = false; } };
  modalEl.querySelectorAll("[data-cw-op]").forEach((b) => b.addEventListener("click", () => { s.op = b.dataset.cwOp; cwRenderStep(modalEl); }));
  modalEl.querySelectorAll("[data-cw-pick]").forEach((row) =>
    row.addEventListener("click", () => {
      const raw = row.dataset.cwPick;
      const i = raw.indexOf(":");
      const key = raw.slice(0, i);
      const val = raw.slice(i + 1);
      s[key] = val;
      if (key === "senderId") s.senderAcc = "";
      if (key === "recipientId") s.recipientAcc = "";
      cwRenderStep(modalEl);
    })
  );
  const bindInput = (id, key) => {
    const el = modalEl.querySelector(`#${id}`);
    if (!el) return;
    el.addEventListener("input", () => {
      s[key] = el.value;
      const total = modalEl.querySelector("#cw-total");
      if (total) total.textContent = `${formatPaymentAmount(cwAmount() + cwFee())} USDT`;
    });
  };
  bindInput("cw-address", "address");
  bindInput("cw-tag", "tag");
  bindInput("cw-amount", "amount");
  const cancel = modalEl.querySelector("#cw-cancel");
  if (cancel) cancel.addEventListener("click", closeModal);
  const back = modalEl.querySelector("#cw-back");
  if (back) back.addEventListener("click", () => { s.step -= 1; cwRenderStep(modalEl); });
  modalEl.querySelector("#cw-next").addEventListener("click", () => {
    const err = cwValidate();
    if (err) return fail(err);
    if (s.step < 5) { s.step += 1; cwRenderStep(modalEl); return; }
    // Вывод во внешний кошелёк — с кодом подтверждения (если включено политикой); перевод между клиентами — без
    const finish = () => {
      const id = cwSubmit();
      closeModal();
      window.location.hash = `#/operations-payments/${id}`;
    };
    if (s.op === "WITHDRAWAL") requireAdmin2fa("crypto_withdraw_create", finish);
    else finish();
  });
}

function openCreateCryptoPaymentModal() {
  cwState = cwEmptyState();
  openModal({
    title: t("operationsPayments.cryptoCreate.title"),
    width: 720,
    bodyHtml: `${cwStepperHtml()}<div class="pc-form-stack">${cwStepHtml()}<div class="form-error" id="cw-error" hidden></div></div>`,
    footerHtml: cwFooterHtml(),
    onMount: (modalEl) => {
      pcBindDropdowns(modalEl);
      cwBind(modalEl);
    },
  });
}

function viewOperationsPayments(kind = "fiat") {  // Фильтры/поиск живут в одном состоянии на оба списка — при переключении фиат ↔ крипто сбрасываем их
  if (kind !== paymentsListKind) {
    paymentsListKind = kind;
    const s = operationsPaymentsState;
    Object.assign(s, { search: "", directions: [], paymentSystems: [], networks: [], currencies: [], statuses: [], senderClientIds: [], recipientClientIds: [], createdFrom: null, createdTo: null, settledFrom: null, settledTo: null, sortBy: null, page: 1 });
    paymentsSelectedIds = new Set();
  }
  const navKey = kind === "crypto" ? "operations-crypto-payments" : "operations-payments";
  return `
    <div class="list-hero">${pageHeader(
      t(`nav.${navKey}`),
      t(`navDescriptions.${navKey}`),
      `${sectionHintBtn("op-payments-hint-btn", t("operationsPayments.info"))}${exportMenuHtml("op-export", t("operationsPayments.export.button"), t("operationsPayments.export.hint"))}<button type="button" class="btn-primary" id="op-create-btn">${PLUS_ICON_SVG}<span>${t("operationsPayments.create.button")}</span></button>`
    )}</div>
    ${renderPaymentMetricsCards()}
    <div class="card list-card">
      ${renderOperationsPaymentsFilters()}
      <div class="list-divider"></div>
      <div id="operations-payments-table-wrap">${renderOperationsPaymentsTableSection()}</div>
    </div>
  `;
}

// ---- Экспорт списка платежей (CSV / XLSX): то, что показывает таблица — поиск, быстрые табы статуса,
// фильтры панели и сортировка, без учёта страницы. Перед выгрузкой — модалка с итогом. ----------
function paymentsExportFilterLines() {
  const s = operationsPaymentsState;
  const f = t("operationsPayments.filters");
  const lines = [];
  if (s.search) lines.push(`${f.searchPlaceholder}: «${pdEscape(s.search)}»`);
  if (s.statuses.length) lines.push(`${t("operationsPayments.export.status")}: ${s.statuses.map(paymentStatusLabel).join(", ")}`);
  if (s.directions.length) lines.push(`${f.direction}: ${directionFilterLabel(s.directions)}`);
  if (s.paymentSystems.length) lines.push(`${f.paymentSystem}: ${paymentSystemFilterLabel(s.paymentSystems)}`);
  if (s.networks.length) lines.push(`${f.network}: ${s.networks.join(", ")}`);
  if (s.currencies.length) lines.push(`${f.currency}: ${currencyFilterLabel(s.currencies)}`);
  if (s.senderClientIds.length) lines.push(`${f.sender}: ${senderFilterLabel(s.senderClientIds)}`);
  if (s.recipientClientIds.length) lines.push(`${f.recipient}: ${recipientFilterLabel(s.recipientClientIds)}`);
  if (s.createdFrom || s.createdTo) lines.push(`${f.createdAt}: ${dateTriggerLabel(s.createdFrom, s.createdTo)}`);
  if (s.settledFrom || s.settledTo) lines.push(`${f.settledAt}: ${dateTriggerLabel(s.settledFrom, s.settledTo)}`);
  return lines;
}

function openExportPaymentsModal(format) {
  const x = t("operationsPayments.export");
  const count = getFilteredOperationsPayments().length;
  const total = paymentsDataset().length;
  const lines = paymentsExportFilterLines();
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle,
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(total)}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); openPaymentsFiltersDrawer(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportOperationsPayments(format); });
    },
  });
}

function exportOperationsPayments(format) {
  const x = t("operationsPayments.export");
  const rows = getSortedOperationsPayments(getFilteredOperationsPayments()).map((r) => [
    r.code, paymentFlowOneLabel(paymentFlow(r), r), paymentSystemLabel(r.paymentSystem), r.senderClientName || "", r.recipientClientName || "",
    r.sourceAmount, r.sourceCurrency, r.targetAmount, r.targetCurrency, r.exchangeRate, r.feeAmount, r.feeCurrency, r.totalAmount,
    paymentStatusLabel(r.status), r.purposeOfPayment || "", r.createdAt, r.settledAt || "",
  ]);
  exportTable(`${paymentsListKind === "crypto" ? "crypto_payments" : "payments"}_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(rows.length));
}

function initOperationsPaymentsView() {
  bindExportMenu("op-export", openExportPaymentsModal);
  attachOperationsPaymentsFilterHandlers();
  attachOperationsPaymentsTableHandlers();
  const createBtn = document.getElementById("op-create-btn");
  if (createBtn) createBtn.addEventListener("click", () => (paymentsListKind === "crypto" ? openCreateCryptoPaymentModal() : openCreatePaymentModal()));
}



