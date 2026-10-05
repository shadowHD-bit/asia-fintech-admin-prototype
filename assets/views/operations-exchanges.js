/* ==========================================================================
   Вьюха "Операции → Обмены" (список).
   Отдельной ручки для обменов НЕТ (проверено чтением бэкенда 21.09.2026) —
   это `payments`/`FindPaymentsInput` с `paymentSystems: [EXCHANGE]`, тип
   строки `ExchangePaymentType extends CommonPaymentType`.

   Уточнено повторным чтением 24.09.2026 (см. подробный комментарий в шапке
   assets/mock/operations-exchanges.mock.js): обмен — это ОДИН и тот же
   клиент, конвертирующий между двумя своими же счетами, а не перевод другому
   клиенту (recipientClientId в реальном сервисе обязан совпадать с
   senderClientId). Поэтому здесь нет отдельных колонок отправитель/
   получатель — только "Клиент"; нет и колонки "Направление" — она всегда
   BOTH (обе стороны наши), делить по ней бессмысленно; нет фильтра/колонки
   "Платёжная система" (она всегда EXCHANGE).

   Переиспользует хелперы из views/clients-users.js и views/operations-payments.js
   (paymentStatusLabel, paymentClientCellHtml, paymentClientTypeLabel,
   paymentStatusBadgeClass, formatPaymentAmount, dateTimeCell, renderPager,
   checkboxOptionsHtml, FILTER_GROUP_CHEVRON и т.д.) — они уже в общей области
   видимости. Как и у платежей: сортировки в реальной ручке нет — её нет и тут.
   ========================================================================== */

const operationsExchangesState = {
  search: "",
  sourceCurrencies: [],
  targetCurrencies: [],
  statuses: [],
  createdFrom: null,
  createdTo: null,
  settledFrom: null,
  settledTo: null,
  sortBy: null, // 'sourceAmount' | 'targetAmount' | 'rate' | 'createdAt' | 'settledAt'
  sortDir: "desc",
  page: 1,
  pageSize: 10,
};

// ---- Фильтрация -------------------------------------------------------------------
// Поиск — только по ID (как и у платежей): sender/recipient у обмена теперь
// один и тот же клиент (см. operations-exchanges.mock.js), а purposeOfPayment
// у обмена всегда пуст (CreateExchangePaymentInput не принимает это поле) —
// искать по ним нечего.
function matchesExchangeFilters(row, { ignoreStatus } = {}) {
  const s = operationsExchangesState;
  const search = s.search.trim().toLowerCase();

  if (search && !row.id.toLowerCase().includes(search)) return false;
  if (s.sourceCurrencies.length && !s.sourceCurrencies.includes(row.sourceCurrency)) return false;
  if (s.targetCurrencies.length && !s.targetCurrencies.includes(row.targetCurrency)) return false;
  if (!ignoreStatus && s.statuses.length && !s.statuses.includes(row.status)) return false;
  if (s.createdFrom && row.createdDate < s.createdFrom) return false;
  if (s.createdTo && row.createdDate > s.createdTo) return false;
  if (s.settledFrom && (!row.settledDate || row.settledDate < s.settledFrom)) return false;
  if (s.settledTo && (!row.settledDate || row.settledDate > s.settledTo)) return false;
  return true;
}

function getFilteredOperationsExchanges() {
  return OPERATIONS_EXCHANGES_MOCK.filter((row) => matchesExchangeFilters(row));
}

// Как и у платежей: в реальной ручке поля сортировки нет — сортировка только
// на клиенте поверх мока. По умолчанию — новые сверху. settledAt — не
// зачисленные (settledDate === null) всегда в конце, независимо от направления.
function getSortedOperationsExchanges(list) {
  const { sortBy, sortDir } = operationsExchangesState;
  if (!sortBy) return [...list].sort((a, b) => b.createdDate - a.createdDate);
  const dir = sortDir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sortBy === "sourceAmount") return (a.sourceAmount - b.sourceAmount) * dir;
    if (sortBy === "targetAmount") return (a.targetAmount - b.targetAmount) * dir;
    if (sortBy === "rate") return (a.exchangeRate - b.exchangeRate) * dir;
    if (sortBy === "settledAt") {
      if (!a.settledDate && !b.settledDate) return 0;
      if (!a.settledDate) return 1;
      if (!b.settledDate) return -1;
      return (a.settledDate - b.settledDate) * dir;
    }
    return (a.createdDate - b.createdDate) * dir;
  });
}

function exchangesSortableHeader(key, label) {
  const s = operationsExchangesState;
  const active = s.sortBy === key;
  const icon = active ? (s.sortDir === "asc" ? SORT_ICON_ASC : SORT_ICON_DESC) : SORT_ICON_NEUTRAL;
  return `<th><button type="button" class="th-sort${active ? " is-active" : ""}" data-sort="${key}">${label}<span class="th-sort-icon">${icon}</span></button></th>`;
}

function quickExchangeStatusTabCount(status) {
  const matching = OPERATIONS_EXCHANGES_MOCK.filter((row) => matchesExchangeFilters(row, { ignoreStatus: true }));
  if (!status) return matching.length;
  return matching.filter((row) => row.status === status).length;
}

// ---- Карточки-метрики: срезы, которых нет на быстрых табах статуса --------------
const EXCHANGES_METRICS_WINDOW_DAYS = 7;

// incoming/outgoing убраны — direction у обмена теперь всегда "BOTH" (обе
// стороны один и тот же клиент, см. operations-exchanges.mock.js), делить по
// нему было бы бессмысленно. onReview — реальный статус ожидания апрува
// админа (внутренняя ликвидность, ExchangeSettlementService.onAdminApproval).
function computeExchangeMetrics() {
  const list = getFilteredOperationsExchanges();
  const recentThreshold = new Date(MOCK_NOW.getTime() - EXCHANGES_METRICS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    favorite: list.filter((r) => r.isFavorite).length,
    samePair: list.filter((r) => r.sourceCurrency === r.targetCurrency).length,
    onReview: list.filter((r) => r.status === "ON_REVIEW").length,
    successful: list.filter((r) => r.status === "SUCCESSFUL").length,
    newRecent: list.filter((r) => r.createdDate >= recentThreshold).length,
  };
}

function renderExchangeMetricsCards() {
  const m = computeExchangeMetrics();
  const cd = t("operationsExchanges.metrics");
  return `
    <div class="metrics-grid" id="oe-metrics">
      ${renderMetricCard(m.favorite, cd.favorite)}
      ${renderMetricCard(m.samePair, cd.samePair)}
      ${renderMetricCard(m.onReview, cd.onReview)}
      ${renderMetricCard(m.successful, cd.successful)}
      ${renderMetricCard(m.newRecent, cd.newRecent)}
    </div>
  `;
}

function refreshExchangeMetrics() {
  const el = document.getElementById("oe-metrics");
  if (el) el.outerHTML = renderExchangeMetricsCards();
}

// ---- Быстрые табы статуса ----------------------------------------------------------
function renderQuickExchangeStatusTabs() {
  const s = operationsExchangesState;
  const isAllActive = s.statuses.length === 0;
  const tabsHtml = [
    `<button type="button" class="quick-tab${isAllActive ? " is-active" : ""}" data-quick-status="">${t("operationsExchanges.filters.allTab")}<span class="quick-tab-count">${quickExchangeStatusTabCount(null)}</span></button>`,
    ...QUICK_PAYMENT_STATUS_TABS.map((st) => {
      const isActive = s.statuses.length === 1 && s.statuses[0] === st;
      return `<button type="button" class="quick-tab${isActive ? " is-active" : ""}" data-quick-status="${st}">${paymentStatusLabel(st)}<span class="quick-tab-count">${quickExchangeStatusTabCount(st)}</span></button>`;
    }),
  ].join("");
  return `<div class="quick-tabs" id="oe-quick-tabs">${tabsHtml}</div>`;
}

function attachQuickExchangeStatusTabsHandlers() {
  const wrap = document.getElementById("oe-quick-tabs");
  if (!wrap) return;
  wrap.querySelectorAll(".quick-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      operationsExchangesState.statuses = btn.dataset.quickStatus ? [btn.dataset.quickStatus] : [];
      operationsExchangesState.page = 1;
      updateOperationsExchangesTable();
      refreshExchangesFiltersChrome();
    });
  });
}

// ---- Кнопка «Фильтры» + чипы --------------------------------------------------------
function activeExchangesFilterCount() {
  const s = operationsExchangesState;
  let n = 0;
  if (s.sourceCurrencies.length) n++;
  if (s.targetCurrencies.length) n++;
  if (s.createdFrom || s.createdTo) n++;
  if (s.settledFrom || s.settledTo) n++;
  return n;
}

function sourceCurrencyFilterLabel(values) {
  return multiSelectLabel(values, t("operationsExchanges.filters.allCurrencies"), (v) => v);
}

function targetCurrencyFilterLabel(values) {
  return multiSelectLabel(values, t("operationsExchanges.filters.allCurrencies"), (v) => v);
}

function renderExchangesFilterTriggerContent() {
  const f = t("operationsExchanges.filters");
  const count = activeExchangesFilterCount();
  return `
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h14M6 10h8M8.5 15.5h3"/></svg>
    <span>${f.filterButton}</span>
    ${count ? `<span class="filter-badge">${count}</span>` : ""}
  `;
}

function renderExchangesFilterChips() {
  const s = operationsExchangesState;
  const f = t("operationsExchanges.filters");
  const chips = [];

  if (s.sourceCurrencies.length) chips.push({ key: "sourceCurrency", label: `${f.sourceCurrency}: ${sourceCurrencyFilterLabel(s.sourceCurrencies)}` });
  if (s.targetCurrencies.length) chips.push({ key: "targetCurrency", label: `${f.targetCurrency}: ${targetCurrencyFilterLabel(s.targetCurrencies)}` });
  if (s.createdFrom || s.createdTo) chips.push({ key: "createdAt", label: `${f.createdAt}: ${dateTriggerLabel(s.createdFrom, s.createdTo)}` });
  if (s.settledFrom || s.settledTo) chips.push({ key: "settledAt", label: `${f.settledAt}: ${dateTriggerLabel(s.settledFrom, s.settledTo)}` });

  if (!chips.length) return `<div class="filter-chips" id="oe-filter-chips"></div>`;

  return `
    <div class="filter-chips" id="oe-filter-chips">
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

function clearExchangesFilterDimension(key) {
  const s = operationsExchangesState;
  if (key === "sourceCurrency") s.sourceCurrencies = [];
  else if (key === "targetCurrency") s.targetCurrencies = [];
  else if (key === "createdAt") { s.createdFrom = null; s.createdTo = null; }
  else if (key === "settledAt") { s.settledFrom = null; s.settledTo = null; }
  s.page = 1;
  updateOperationsExchangesTable();
  refreshExchangesFiltersChrome();
}

function attachExchangesFilterChipsHandlers() {
  const wrap = document.getElementById("oe-filter-chips");
  if (!wrap) return;
  wrap.querySelectorAll(".filter-chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => clearExchangesFilterDimension(btn.dataset.chip));
  });
}

function renderOperationsExchangesFilters() {
  const f = t("operationsExchanges.filters");
  const hasSearch = operationsExchangesState.search.length > 0;

  return `
    ${renderQuickExchangeStatusTabs()}
    <div class="filters-bar-compact">
      <div class="filters-search">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5.5"/><path d="m17 17-3.5-3.5"/></svg>
        <input type="text" id="oe-filter-search" placeholder="${f.searchPlaceholder}" value="${operationsExchangesState.search}" />
        <button type="button" class="filters-search-clear" id="oe-filter-search-clear"${hasSearch ? "" : " hidden"}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <button type="button" class="filter-trigger" id="oe-filter-trigger">${renderExchangesFilterTriggerContent()}</button>
    </div>
    ${renderExchangesFilterChips()}
  `;
}

function attachOperationsExchangesFilterHandlers() {
  const searchEl = document.getElementById("oe-filter-search");
  const clearBtn = document.getElementById("oe-filter-search-clear");

  const applySearch = () => {
    operationsExchangesState.search = searchEl.value;
    operationsExchangesState.page = 1;
    clearBtn.hidden = searchEl.value.length === 0;
    updateOperationsExchangesTable();
  };

  searchEl.addEventListener("input", applySearch);

  clearBtn.addEventListener("click", () => {
    searchEl.value = "";
    searchEl.focus();
    applySearch();
  });

  document.getElementById("oe-filter-trigger").addEventListener("click", openExchangesFiltersDrawer);

  attachQuickExchangeStatusTabsHandlers();
  attachExchangesFilterChipsHandlers();
}

function refreshExchangesFiltersChrome() {
  const triggerBtn = document.getElementById("oe-filter-trigger");
  if (triggerBtn) triggerBtn.innerHTML = renderExchangesFilterTriggerContent();

  const quickWrap = document.getElementById("oe-quick-tabs");
  if (quickWrap) {
    quickWrap.outerHTML = renderQuickExchangeStatusTabs();
    attachQuickExchangeStatusTabsHandlers();
  }

  const chipsWrap = document.getElementById("oe-filter-chips");
  if (chipsWrap) {
    chipsWrap.outerHTML = renderExchangesFilterChips();
    attachExchangesFilterChipsHandlers();
  }

  refreshExchangeMetrics();
}

function resetOperationsExchangesFilters() {
  const s = operationsExchangesState;
  s.sourceCurrencies = [];
  s.targetCurrencies = [];
  s.createdFrom = null;
  s.createdTo = null;
  s.settledFrom = null;
  s.settledTo = null;
  s.page = 1;
  updateOperationsExchangesTable();
}

function resetAllOperationsExchangesFilters() {
  operationsExchangesState.search = "";
  const searchEl = document.getElementById("oe-filter-search");
  if (searchEl) searchEl.value = "";
  const clearBtn = document.getElementById("oe-filter-search-clear");
  if (clearBtn) clearBtn.hidden = true;
  resetOperationsExchangesFilters();
  refreshExchangesFiltersChrome();
}

// ---- Боковая панель «Фильтры» -------------------------------------------------------
const EXCHANGES_FILTER_GROUP_DEFS = [
  { id: "sourceCurrency", labelKey: "sourceCurrency" },
  { id: "targetCurrency", labelKey: "targetCurrency" },
  { id: "createdAt", labelKey: "createdAt" },
  { id: "settledAt", labelKey: "settledAt" },
];

let oeFilterDraft = null;

function cloneExchangesFilterDraft(s) {
  return {
    sourceCurrencies: [...s.sourceCurrencies],
    targetCurrencies: [...s.targetCurrencies],
    createdFrom: s.createdFrom,
    createdTo: s.createdTo,
    settledFrom: s.settledFrom,
    settledTo: s.settledTo,
  };
}

function exchangesFilterGroupActiveCount(groupId) {
  const d = oeFilterDraft;
  if (groupId === "sourceCurrency") return d.sourceCurrencies.length;
  if (groupId === "targetCurrency") return d.targetCurrencies.length;
  if (groupId === "createdAt") return d.createdFrom || d.createdTo ? 1 : 0;
  if (groupId === "settledAt") return d.settledFrom || d.settledTo ? 1 : 0;
  return 0;
}

function exchangesFilterGroupBodyHtml(groupId) {
  const d = oeFilterDraft;
  if (groupId === "sourceCurrency") return checkboxOptionsHtml(PAYMENT_CURRENCY_OPTIONS.map((v) => ({ value: v, label: v })), d.sourceCurrencies, groupId);
  if (groupId === "targetCurrency") return checkboxOptionsHtml(PAYMENT_CURRENCY_OPTIONS.map((v) => ({ value: v, label: v })), d.targetCurrencies, groupId);
  if (groupId === "createdAt") {
    return `
      <button type="button" class="drp-trigger" id="oe-drawer-created-trigger">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>
        <span>${dateTriggerLabel(d.createdFrom, d.createdTo)}</span>
      </button>
    `;
  }
  if (groupId === "settledAt") {
    return `
      <button type="button" class="drp-trigger" id="oe-drawer-settled-trigger">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>
        <span>${dateTriggerLabel(d.settledFrom, d.settledTo)}</span>
      </button>
    `;
  }
  return "";
}

let oeExpandedFilterGroups = null;

function ensureExchangesExpandedGroupsInit() {
  if (oeExpandedFilterGroups) return;
  oeExpandedFilterGroups = new Set();
  EXCHANGES_FILTER_GROUP_DEFS.forEach((g) => {
    if (exchangesFilterGroupActiveCount(g.id) > 0) oeExpandedFilterGroups.add(g.id);
  });
}

function renderExchangesFilterGroup(groupId) {
  const f = t("operationsExchanges.filters");
  const label = f[EXCHANGES_FILTER_GROUP_DEFS.find((g) => g.id === groupId).labelKey];
  const count = exchangesFilterGroupActiveCount(groupId);
  const expanded = oeExpandedFilterGroups.has(groupId);

  return `
    <div class="filter-group${expanded ? " is-expanded" : ""}" data-group-id="${groupId}">
      <button type="button" class="filter-group-head" data-group-toggle="${groupId}">
        <span class="filter-group-label">${label}</span>
        ${count ? `<span class="filter-group-badge">${count}</span>` : ""}
        <span class="filter-group-chevron">${FILTER_GROUP_CHEVRON}</span>
      </button>
      <div class="filter-group-body">${exchangesFilterGroupBodyHtml(groupId)}</div>
    </div>
  `;
}

function renderExchangesFiltersDrawerBody() {
  return EXCHANGES_FILTER_GROUP_DEFS.map((g) => renderExchangesFilterGroup(g.id)).join("");
}

function renderExchangesFiltersDrawer() {
  const f = t("operationsExchanges.filters");
  return `
    <div class="filters-drawer-overlay" id="oe-filters-overlay"></div>
    <aside class="filters-drawer" id="oe-filters-drawer">
      <div class="filters-drawer-header">
        <h2 class="filters-drawer-title">${f.drawerTitle}</h2>
        <button type="button" class="filters-drawer-close" id="oe-filters-drawer-close">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <div class="filters-drawer-body" id="oe-filters-drawer-body">${renderExchangesFiltersDrawerBody()}</div>
      <div class="filters-drawer-footer">
        <button type="button" class="btn-secondary" id="oe-drawer-reset">${f.reset}</button>
        <button type="button" class="btn-primary" id="oe-drawer-apply">${f.showResults}</button>
      </div>
    </aside>
  `;
}

function rerenderExchangesFiltersDrawerBody() {
  const bodyEl = document.getElementById("oe-filters-drawer-body");
  if (!bodyEl) return;
  bodyEl.innerHTML = renderExchangesFiltersDrawerBody();
  attachExchangesFiltersDrawerBodyHandlers();
}

function attachExchangesFiltersDrawerBodyHandlers() {
  const d = oeFilterDraft;

  document.querySelectorAll("[data-group-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const groupId = btn.dataset.groupToggle;
      if (oeExpandedFilterGroups.has(groupId)) oeExpandedFilterGroups.delete(groupId);
      else oeExpandedFilterGroups.add(groupId);
      btn.closest(".filter-group").classList.toggle("is-expanded");
    });
  });

  document.querySelectorAll('#oe-filters-drawer-body input[type="checkbox"][data-group]').forEach((input) => {
    input.addEventListener("change", () => {
      const groupId = input.dataset.group;
      const arr = groupId === "sourceCurrency" ? d.sourceCurrencies : d.targetCurrencies;
      const idx = arr.indexOf(input.value);
      if (input.checked && idx === -1) arr.push(input.value);
      if (!input.checked && idx !== -1) arr.splice(idx, 1);
      rerenderExchangesFiltersDrawerBody();
    });
  });

  const createdTrigger = document.getElementById("oe-drawer-created-trigger");
  if (createdTrigger) {
    createdTrigger.addEventListener("click", (e) => {
      openDateRangePicker({
        from: d.createdFrom,
        to: d.createdTo,
        anchorEl: e.currentTarget,
        onApply: (from, to) => {
          d.createdFrom = from;
          d.createdTo = to;
          rerenderExchangesFiltersDrawerBody();
        },
      });
    });
  }

  const settledTrigger = document.getElementById("oe-drawer-settled-trigger");
  if (settledTrigger) {
    settledTrigger.addEventListener("click", (e) => {
      openDateRangePicker({
        from: d.settledFrom,
        to: d.settledTo,
        anchorEl: e.currentTarget,
        onApply: (from, to) => {
          d.settledFrom = from;
          d.settledTo = to;
          rerenderExchangesFiltersDrawerBody();
        },
      });
    });
  }
}

function attachExchangesFiltersDrawerChromeHandlers() {
  const resetBtn = document.getElementById("oe-drawer-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetOperationsExchangesFilters();
      oeFilterDraft = cloneExchangesFilterDraft(operationsExchangesState);
      oeExpandedFilterGroups = new Set();
      rerenderExchangesFiltersDrawerBody();
      refreshExchangesFiltersChrome();
    });
  }

  const applyBtn = document.getElementById("oe-drawer-apply");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      Object.assign(operationsExchangesState, cloneExchangesFilterDraft(oeFilterDraft));
      operationsExchangesState.page = 1;
      updateOperationsExchangesTable();
      refreshExchangesFiltersChrome();
      closeExchangesFiltersDrawer();
    });
  }

  const closeBtn = document.getElementById("oe-filters-drawer-close");
  if (closeBtn) closeBtn.addEventListener("click", closeExchangesFiltersDrawer);

  const overlay = document.getElementById("oe-filters-overlay");
  if (overlay) overlay.addEventListener("click", closeExchangesFiltersDrawer);
}

function handleExchangesFiltersDrawerEscape(e) {
  if (e.key === "Escape") closeExchangesFiltersDrawer();
}

function openExchangesFiltersDrawer() {
  oeFilterDraft = cloneExchangesFilterDraft(operationsExchangesState);
  ensureExchangesExpandedGroupsInit();

  const wrap = document.createElement("div");
  wrap.id = "oe-filters-drawer-wrap";
  wrap.innerHTML = renderExchangesFiltersDrawer();
  document.body.appendChild(wrap);

  attachExchangesFiltersDrawerChromeHandlers();
  attachExchangesFiltersDrawerBodyHandlers();

  requestAnimationFrame(() => {
    const overlay = document.getElementById("oe-filters-overlay");
    const drawer = document.getElementById("oe-filters-drawer");
    if (overlay) overlay.classList.add("is-open");
    if (drawer) drawer.classList.add("is-open");
  });

  document.addEventListener("keydown", handleExchangesFiltersDrawerEscape);
  document.body.classList.add("filters-drawer-open");
}

function closeExchangesFiltersDrawer() {
  const wrap = document.getElementById("oe-filters-drawer-wrap");
  if (!wrap) return;
  const overlay = document.getElementById("oe-filters-overlay");
  const drawer = document.getElementById("oe-filters-drawer");
  if (overlay) overlay.classList.remove("is-open");
  if (drawer) drawer.classList.remove("is-open");
  document.removeEventListener("keydown", handleExchangesFiltersDrawerEscape);
  document.body.classList.remove("filters-drawer-open");
  setTimeout(() => wrap.remove(), 220);
}

// ---- Массовые действия и действия в строке (как у платежей) ---------------------
// Одобрить/отклонить — та же мутация статуса, что и на карточке платежа
// (setPaymentStatus, operations-payment-detail.js) — обмен это тот же платёж
// (paymentSystem: EXCHANGE), общая логика статусов и там, и там одна.
let exchangesSelectedIds = new Set();

function exchangeRowFind(id) {
  return OPERATIONS_EXCHANGES_MOCK.find((r) => r.id === id) || null;
}

// Три точки в конце строки: "Перейти в vABS" — всегда, "Одобрить"/"Отклонить" —
// только для не финального статуса (см. PAYMENT_NON_FINAL_STATUSES).
function exchangeRowActionsMenu(row) {
  const a = t("paymentDetail.actions");
  const nonFinal = PAYMENT_NON_FINAL_STATUSES.includes(row.status);
  const items = [
    { label: a.goToOperation, icon: ARROW_RIGHT_ICON_SVG, attrs: `data-exchange-row-action="goToOperation:${row.id}"` },
    { label: a.exportPdf, icon: DOWNLOAD_ICON_SVG, attrs: `data-exchange-row-action="exportPdf:${row.id}"` },
  ];
  if (nonFinal) {
    items.push({ label: a.approve, icon: CHECK_ICON_SVG, attrs: `data-exchange-row-action="approve:${row.id}"` });
    items.push({ label: a.decline, icon: PAY_DECLINE_ICON_SVG, attrs: `data-exchange-row-action="decline:${row.id}"`, danger: true });
  }
  return rowKebabMenu(`exch-${row.id}`, items);
}

function openExchangeRowApproveModal(row) {
  const m = t("paymentDetail.modals");
  openConfirmModal({
    title: m.approveTitle,
    text: m.approveText(formatPaymentAmount(row.sourceAmount), row.sourceCurrency, row.recipientClientName || pdShort(row.recipientClientId)),
    confirmLabel: t("paymentDetail.actions.approve"),
    cancelLabel: t("paymentDetail.common.cancel"),
    danger: false,
    onConfirm: () => {
      setPaymentStatus(row, "SUCCESSFUL");
      updateOperationsExchangesTable();
    },
  });
}

function openExchangeRowDeclineModal(row) {
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
      updateOperationsExchangesTable();
    },
  });
}

function exchangesPageRowIds() {
  const wrap = document.getElementById("operations-exchanges-table-wrap");
  if (!wrap) return [];
  return [...wrap.querySelectorAll("[data-exchange-checkbox]")].map((cb) => cb.dataset.exchangeCheckbox);
}

function renderExchangesBulkBar() {
  const count = exchangesSelectedIds.size;
  if (!count) return "";
  const b = t("operationsExchanges.bulk");
  return `
    <div class="table-bulk-bar" id="oe-bulk-bar-inner">
      <span class="table-bulk-count">${b.selectedCount(count)}</span>
      <button type="button" class="btn-secondary" id="oe-bulk-approve">${CHECK_ICON_SVG}<span>${b.approve}</span></button>
      <button type="button" class="btn-secondary" id="oe-bulk-decline">${PAY_DECLINE_ICON_SVG}<span>${b.decline}</span></button>
      <button type="button" class="table-link" id="oe-bulk-clear">${b.clear}</button>
    </div>
  `;
}

function refreshExchangesBulkBar() {
  const el = document.getElementById("oe-bulk-bar");
  if (!el) return;
  el.innerHTML = renderExchangesBulkBar();
  attachExchangesBulkBarHandlers();
  const selectAll = document.getElementById("oe-select-all");
  if (selectAll) {
    const pageIds = exchangesPageRowIds();
    const selectedOnPage = pageIds.filter((id) => exchangesSelectedIds.has(id));
    selectAll.checked = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
    selectAll.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
  }
}

function attachExchangesBulkBarHandlers() {
  const approveBtn = document.getElementById("oe-bulk-approve");
  if (approveBtn) approveBtn.addEventListener("click", openExchangesBulkApproveModal);
  const declineBtn = document.getElementById("oe-bulk-decline");
  if (declineBtn) declineBtn.addEventListener("click", openExchangesBulkDeclineModal);
  const clearBtn = document.getElementById("oe-bulk-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      exchangesSelectedIds.clear();
      updateOperationsExchangesTable();
    });
  }
}

// Массовые действия — только подтверждение, без причины (как и у платежей):
// текст модалки честно предупреждает, что из выделенных реально изменятся
// только операции не в конечном статусе.
function openExchangesBulkApproveModal() {
  const b = t("operationsExchanges.bulk");
  const rows = [...exchangesSelectedIds].map(exchangeRowFind).filter(Boolean);
  const eligible = rows.filter((r) => PAYMENT_NON_FINAL_STATUSES.includes(r.status));
  openConfirmModal({
    title: b.approveTitle,
    text: b.approveText(rows.length, eligible.length),
    confirmLabel: t("paymentDetail.actions.approve"),
    cancelLabel: t("paymentDetail.common.cancel"),
    danger: false,
    onConfirm: () => {
      eligible.forEach((r) => setPaymentStatus(r, "SUCCESSFUL"));
      exchangesSelectedIds.clear();
      updateOperationsExchangesTable();
    },
  });
}

function openExchangesBulkDeclineModal() {
  const b = t("operationsExchanges.bulk");
  const rows = [...exchangesSelectedIds].map(exchangeRowFind).filter(Boolean);
  const eligible = rows.filter((r) => PAYMENT_NON_FINAL_STATUSES.includes(r.status));
  openConfirmModal({
    title: b.declineTitle,
    text: b.declineText(rows.length, eligible.length),
    confirmLabel: t("paymentDetail.actions.decline"),
    cancelLabel: t("paymentDetail.common.cancel"),
    danger: true,
    onConfirm: () => {
      eligible.forEach((r) => setPaymentStatus(r, "DECLINED"));
      exchangesSelectedIds.clear();
      updateOperationsExchangesTable();
    },
  });
}

// ---- Таблица ------------------------------------------------------------------------
// Одна колонка "Клиент" вместо отправитель/получатель — это один и тот же
// клиент (см. шапку operations-exchanges.mock.js); paymentClientCellHtml(row,
// side) читает row["sideClientId"] и т.п. — раньше здесь по ошибке
// передавались голые id/type вместо (row, side), колонки были битые.
function exchangeAmountCellHtml(row) {
  return `${formatPaymentAmount(row.sourceAmount)} ${row.sourceCurrency} → ${formatPaymentAmount(row.targetAmount)} ${row.targetCurrency}`;
}

function renderOperationsExchangesRow(row) {
  return `
    <tr>
      <td>
        <input type="checkbox" class="op-row-checkbox" data-exchange-checkbox="${row.id}"${exchangesSelectedIds.has(row.id) ? " checked" : ""} />
      </td>
      <td>
        <div class="identity-cell">
          <div class="identity-cell-primary">
            <button type="button" class="table-link payment-link" data-payment-id="${row.id}">${t("operationsExchanges.columns.amount")}</button>
          </div>
          <div class="identity-cell-sub">
            <span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>
            <button type="button" class="id-copy" data-copy-value="${row.code}" title="${t("clientsUsers.copy")}">
              <span class="id-copy-label">${row.code}</span>
              ${COPY_ICON_SVG}
            </button>
          </div>
        </div>
      </td>
      <td class="nowrap">${exchangeAmountCellHtml(row)}</td>
      <td>
        <div class="payment-client-block">
          ${paymentClientCellHtml(row, "sender", { noAccount: true })}
        </div>
      </td>
      <td>${row.exchangeRate}</td>
      <td><span class="badge ${paymentStatusBadgeClass(row.status)}">${paymentStatusLabel(row.status)}</span></td>
      <td>${dateTimeCell(row.createdAt)}</td>
      <td>${row.settledAt ? dateTimeCell(row.settledAt) : `<span class="table-cell-muted">${t("operationsExchanges.noValue")}</span>`}</td>
      <td>${exchangeRowActionsMenu(row)}</td>
    </tr>
  `;
}

function renderOperationsExchangesTableSection() {
  const cols = t("operationsExchanges.columns");
  const pag = t("operationsExchanges.pagination");
  const filtered = getSortedOperationsExchanges(getFilteredOperationsExchanges());
  const totalPages = Math.max(1, Math.ceil(filtered.length / operationsExchangesState.pageSize));

  if (operationsExchangesState.page > totalPages) operationsExchangesState.page = totalPages;
  const page = operationsExchangesState.page;

  const start = (page - 1) * operationsExchangesState.pageSize;
  const pageRows = filtered.slice(start, start + operationsExchangesState.pageSize);

  if (filtered.length === 0) {
    const empty = t("operationsExchanges.emptyState");
    return `
      <div class="empty-state empty-state-centered">
        <img class="empty-state-logo" src="assets/images/logo-icon.svg" alt="" />
        <div class="empty-state-text-group">
          <div class="empty-state-title">${empty.title}</div>
          <div class="empty-state-text">${empty.text}</div>
        </div>
        <button type="button" class="btn-secondary" id="oe-empty-reset">${empty.resetButton}</button>
      </div>
    `;
  }

  const pageButtons = renderPager(page, totalPages);
  const pageIds = pageRows.map((r) => r.id);
  const selectedOnPage = pageIds.filter((id) => exchangesSelectedIds.has(id));
  const allPageSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;

  return `
    <div class="table-bulk-bar-wrap" id="oe-bulk-bar">${renderExchangesBulkBar()}</div>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="oe-select-all"${allPageSelected ? " checked" : ""} /></th>
            <th>${cols.amount}</th>
            ${exchangesSortableHeader("sourceAmount", cols.sum)}
            <th>${cols.client}</th>
            ${exchangesSortableHeader("rate", cols.rate)}
            <th>${cols.status}</th>
            ${exchangesSortableHeader("createdAt", cols.createdAt)}
            ${exchangesSortableHeader("settledAt", cols.settledAt)}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${pageRows.map(renderOperationsExchangesRow).join("")}
        </tbody>
      </table>
    </div>

    <div class="table-footer">
      <span class="table-footer-total">${pag.total(filtered.length)}</span>
      <div class="pager">${pageButtons}</div>
      <div class="table-footer-page-size">
        <span>${pag.rowsPerPage}</span>
        <select id="oe-page-size">
          ${[10, 20, 50]
            .map((n) => `<option value="${n}"${operationsExchangesState.pageSize === n ? " selected" : ""}>${n}</option>`)
            .join("")}
        </select>
      </div>
    </div>
  `;
}

let operationsExchangesLoadingTimer = null;

function updateOperationsExchangesTable() {
  const wrap = document.getElementById("operations-exchanges-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = renderTableLoadingState();
  clearTimeout(operationsExchangesLoadingTimer);
  operationsExchangesLoadingTimer = setTimeout(() => {
    wrap.innerHTML = renderOperationsExchangesTableSection();
    attachOperationsExchangesTableHandlers();
    refreshExchangeMetrics();
  }, CLIENTS_USERS_LOADING_DELAY);
}

function attachOperationsExchangesTableHandlers() {
  const wrap = document.getElementById("operations-exchanges-table-wrap");
  if (!wrap) return;

  const emptyResetBtn = document.getElementById("oe-empty-reset");
  if (emptyResetBtn) emptyResetBtn.addEventListener("click", resetAllOperationsExchangesFilters);

  wrap.querySelectorAll(".pager-btn[data-page]").forEach((btn) => {
    if (btn.hasAttribute("disabled")) return;
    btn.addEventListener("click", () => {
      operationsExchangesState.page = Number(btn.dataset.page);
      updateOperationsExchangesTable();
    });
  });

  const pageSizeSelect = document.getElementById("oe-page-size");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", () => {
      operationsExchangesState.pageSize = Number(pageSizeSelect.value);
      operationsExchangesState.page = 1;
      updateOperationsExchangesTable();
    });
  }

  wrap.querySelectorAll(".th-sort").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = operationsExchangesState;
      const key = btn.dataset.sort;
      if (s.sortBy === key) s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
      else {
        s.sortBy = key;
        s.sortDir = "asc";
      }
      updateOperationsExchangesTable();
    });
  });

  wrap.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn));
    });
  });

  wrap.querySelectorAll(".payment-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = `#/operations-exchanges/${btn.dataset.paymentId}`;
    });
  });

  wrap.querySelectorAll("[data-party-hash]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = btn.dataset.partyHash;
    });
  });

  // ---- Выделение строк -------------------------------------------------------
  wrap.querySelectorAll("[data-exchange-checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) exchangesSelectedIds.add(cb.dataset.exchangeCheckbox);
      else exchangesSelectedIds.delete(cb.dataset.exchangeCheckbox);
      refreshExchangesBulkBar();
    });
  });

  const selectAll = document.getElementById("oe-select-all");
  if (selectAll) {
    const pageIds = exchangesPageRowIds();
    const selectedOnPage = pageIds.filter((id) => exchangesSelectedIds.has(id));
    selectAll.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
    selectAll.addEventListener("change", () => {
      const ids = exchangesPageRowIds();
      if (selectAll.checked) ids.forEach((id) => exchangesSelectedIds.add(id));
      else ids.forEach((id) => exchangesSelectedIds.delete(id));
      wrap.querySelectorAll("[data-exchange-checkbox]").forEach((cb) => {
        cb.checked = exchangesSelectedIds.has(cb.dataset.exchangeCheckbox);
      });
      selectAll.indeterminate = false;
      refreshExchangesBulkBar();
    });
  }

  attachExchangesBulkBarHandlers();

  // ---- Действия в строке (три точки): перейти в vABS / одобрить / отклонить --
  wrap.querySelectorAll("[data-exchange-row-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [action, id] = btn.dataset.exchangeRowAction.split(":");
      const row = exchangeRowFind(id);
      if (!row) return;
      if (action === "goToOperation") window.location.hash = `#/settings-vabs-operations/${row.id}`;
      else if (action === "exportPdf") exportPaymentPdf(row, { section: "exchanges", id: row.id }, getPaymentDetailExtras(row));
      else if (action === "approve") openExchangeRowApproveModal(row);
      else if (action === "decline") openExchangeRowDeclineModal(row);
    });
  });
}

function viewOperationsExchanges() {
  const heroActions = `<span class="filters-bar-end">${sectionHintBtn("oe-hint-btn", t("operationsExchanges.info"))}${exportMenuHtml("oe-export", t("operationsExchanges.export.button"), t("operationsExchanges.export.hint"))}<button type="button" class="btn-primary" id="oe-create-btn">${PLUS_ICON_SVG}<span>${t("operationsExchanges.create.button")}</span></button></span>`;
  return `
    <div class="list-hero">${pageHeader(t("nav.operations-exchanges"), t("navDescriptions.operations-exchanges"), heroActions)}</div>
    ${renderExchangeMetricsCards()}
    <div class="card list-card">
      ${renderOperationsExchangesFilters()}
      <div class="list-divider"></div>
      <div id="operations-exchanges-table-wrap">${renderOperationsExchangesTableSection()}</div>
    </div>
  `;
}

// ---- Экспорт списка обменов (CSV / XLSX): то, что показывает таблица — поиск, быстрые табы статуса, фильтры панели
// и сортировка, без учёта страницы. Перед выгрузкой — модалка с итогом. ---------------------------------------------
function exchangesExportFilterLines() {
  const s = operationsExchangesState;
  const f = t("operationsExchanges.filters");
  const lines = [];
  if (s.search) lines.push(`${f.searchPlaceholder}: «${pdEscape(s.search)}»`);
  if (s.statuses.length) lines.push(`${t("operationsExchanges.export.status")}: ${s.statuses.map(paymentStatusLabel).join(", ")}`);
  if (s.sourceCurrencies.length) lines.push(`${f.sourceCurrency}: ${sourceCurrencyFilterLabel(s.sourceCurrencies)}`);
  if (s.targetCurrencies.length) lines.push(`${f.targetCurrency}: ${targetCurrencyFilterLabel(s.targetCurrencies)}`);
  if (s.createdFrom || s.createdTo) lines.push(`${f.createdAt}: ${dateTriggerLabel(s.createdFrom, s.createdTo)}`);
  if (s.settledFrom || s.settledTo) lines.push(`${f.settledAt}: ${dateTriggerLabel(s.settledFrom, s.settledTo)}`);
  return lines;
}

function openExportExchangesModal(format) {
  const x = t("operationsExchanges.export");
  const count = getFilteredOperationsExchanges().length;
  const total = OPERATIONS_EXCHANGES_MOCK.length;
  const lines = exchangesExportFilterLines();
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
      if (flt) flt.addEventListener("click", () => { closeModal(); openExchangesFiltersDrawer(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportOperationsExchanges(format); });
    },
  });
}

function exportOperationsExchanges(format) {
  const x = t("operationsExchanges.export");
  const rows = getSortedOperationsExchanges(getFilteredOperationsExchanges()).map((r) => [
    r.code, r.senderClientName || "", r.sourceAmount, r.sourceCurrency, r.targetAmount, r.targetCurrency, r.exchangeRate,
    r.feeAmount, r.feeCurrency, paymentStatusLabel(r.status), r.createdAt, r.settledAt || "",
  ]);
  exportTable(`exchanges_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(rows.length));
}

// ---- Мастер создания обмена -------------------------------------------------------------------------------------
// Реальная модель (exchange-payments.service.ts, см. шапку файла): один и тот же клиент конвертирует между двумя
// своими счетами — recipientClientId обязан совпадать с senderClientId, поэтому в мастере только ОДИН клиент, а не
// отправитель/получатель, как у обычного платежа. Комиссия — только банковский спред (0.8% от source, берётся до
// конвертации), provider- и target-комиссии всегда 0 (то же допущение, что и в самом моке). Курс — по умолчанию
// подставляем оценку по FX_TO_BASE (mock/fx-rates.mock.js, та же таблица уже используется для "Общего баланса" в
// карточке клиента), администратор может поправить вручную — своей ручки на обмены в бэкенде нет вовсе (это платёж
// с paymentSystem=EXCHANGE), отдельного "официального" курса на конкретную сделку в схеме тоже нет.
let ecState = null;
function ecEmptyState() {
  return { step: 1, client: null, sourceAccount: null, sourceAmount: "", targetAccount: null, rate: "", rateTouched: false };
}

// Счета клиента — та же выборка, что и в мастере создания платежа (pcAccountOptionsForClient,
// ACCOUNTS_VIRTUAL_MOCK: одна опция на пару счёт+валюта). Счёт списания и счёт зачисления должны
// быть в разных валютах — иначе это не обмен (ensureQuoteConsistency, payments.service.ts, см. шапку
// файла), поэтому в списке зачисления счета с уже выбранной валютой списания скрыты.
function ecAccountOptions(clientId, excludeCurrency) {
  const options = pcAccountOptionsForClient(clientId);
  return excludeCurrency ? options.filter((o) => o.currency !== excludeCurrency) : options;
}

function ecSuggestedRate(source, target) {
  if (!source || !target || !FX_TO_BASE[source] || !FX_TO_BASE[target]) return null;
  return +(FX_TO_BASE[source] / FX_TO_BASE[target]).toFixed(4);
}

function ecFee() {
  const amount = parseFloat(String(ecState.sourceAmount).replace(",", ".")) || 0;
  return +(amount * 0.008).toFixed(2);
}

function ecRate() {
  const r = parseFloat(String(ecState.rate).replace(",", "."));
  if (r > 0) return r;
  const source = ecState.sourceAccount && ecState.sourceAccount.currency;
  const target = ecState.targetAccount && ecState.targetAccount.currency;
  return ecSuggestedRate(source, target) || 1;
}

function ecStepperHtml() {
  const c = t("operationsExchanges.create");
  const steps = [
    { n: 1, label: c.steps.client },
    { n: 2, label: c.steps.exchange },
    { n: 3, label: c.steps.summary },
  ];
  return `
    <div class="kyc-stepper">
      ${steps
        .map((s, idx) => {
          const cls = s.n < ecState.step ? "is-done" : s.n === ecState.step ? "is-current" : "is-pending";
          return `
            <div class="kyc-stepper-item">
              <div class="kyc-stepper-circle ${cls}">${s.n < ecState.step ? CHECK_ICON_SVG : `<span>${s.n}</span>`}</div>
              ${idx < steps.length - 1 ? `<div class="kyc-stepper-line${s.n < ecState.step ? " is-done" : ""}"></div>` : ""}
              <div class="kyc-stepper-label"><div class="kyc-stepper-title">${s.label}</div></div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function ecStepBodyHtml() {
  const c = t("operationsExchanges.create");
  if (ecState.step === 1) {
    return `${pcClientPickerHtml("ec", c.client, t("operationsPayments.create.pickClient"), ecState.client, null)}<div class="form-error" id="ec-error" hidden></div>`;
  }
  if (ecState.step === 2) {
    const sourceOptions = ecState.client ? ecAccountOptions(ecState.client.id) : [];
    const targetOptions = ecState.client ? ecAccountOptions(ecState.client.id, ecState.sourceAccount && ecState.sourceAccount.currency) : [];
    const source = ecState.sourceAccount && ecState.sourceAccount.currency;
    const target = ecState.targetAccount && ecState.targetAccount.currency;
    return `
      <div class="modal-form">
      <div class="profile-fields-grid profile-fields-grid-2">
        <div class="filters-field"><span class="filters-field-label">${c.sourceAccount}<span class="req-star">*</span></span>${pcAccountDropdownHtml("ec-source", sourceOptions, ecState.sourceAccount)}</div>
        <label class="filters-field"><span class="filters-field-label">${c.sourceAmount}<span class="req-star">*</span></span><input class="address-form-input" id="ec-sourceAmount" inputmode="decimal" value="${escapeAttr(ecState.sourceAmount)}" placeholder="0.00" /></label>
      </div>
      <div class="filters-field"><span class="filters-field-label">${c.targetAccount}<span class="req-star">*</span></span>${pcAccountDropdownHtml("ec-target", targetOptions, ecState.targetAccount)}</div>
      ${ecState.sourceAccount && !targetOptions.length ? `<p class="table-cell-muted">${c.noOtherAccount}</p>` : ""}
      <label class="filters-field"><span class="filters-field-label">${c.rate}</span><input class="address-form-input" id="ec-rate" inputmode="decimal" value="${escapeAttr(String(ecState.rate || ecSuggestedRate(source, target) || ""))}" placeholder="${ecSuggestedRate(source, target) || ""}" /></label>
      <p class="table-cell-muted">${c.rateHint}</p>
      <div class="form-error" id="ec-error" hidden></div>
      </div>
    `;
  }
  const fee = ecFee();
  const amount = parseFloat(String(ecState.sourceAmount).replace(",", ".")) || 0;
  const rate = ecRate();
  const sourceCurrency = ecState.sourceAccount.currency;
  const targetCurrency = ecState.targetAccount.currency;
  const targetAmount = +((amount - fee) * rate).toFixed(2);
  const total = +(amount + fee).toFixed(2);
  return `
    <div class="profile-fields profile-fields-grid">
      ${detailField(c.client, ecState.client ? pdEscape(ecState.client.name) : "—")}
      ${detailField(c.sourceAccount, `${sourceCurrency} - ...${ecState.sourceAccount.accountId.slice(-6)}`)}
      ${detailField(c.sourceAmount, `${formatPaymentAmount(amount)} ${sourceCurrency}`)}
      ${detailField(c.fee, `${formatPaymentAmount(fee)} ${sourceCurrency}`)}
      ${detailField(c.rate, `1 ${sourceCurrency} = ${rate} ${targetCurrency}`)}
      ${detailField(c.targetAccount, `${targetCurrency} - ...${ecState.targetAccount.accountId.slice(-6)}`)}
      ${detailField(c.targetAmount, `${formatPaymentAmount(targetAmount)} ${targetCurrency}`)}
      ${detailField(c.total, `${formatPaymentAmount(total)} ${sourceCurrency}`)}
    </div>
    <p class="table-cell-muted">${c.summaryHint}</p>
  `;
}

function ecFooterHtml() {
  const c = t("operationsExchanges.create");
  if (ecState.step === 3) {
    return `<button type="button" class="btn-secondary" id="ec-back">${c.back}</button><button type="button" class="btn-secondary" id="ec-save-draft">${c.saveDraft}</button><button type="button" class="btn-primary" id="ec-next">${c.submit}</button>`;
  }
  const backBtn = ecState.step > 1 ? `<button type="button" class="btn-secondary" id="ec-back">${c.back}</button>` : `<button type="button" class="btn-secondary" id="ec-cancel">${c.cancel}</button>`;
  return `${backBtn}<button type="button" class="btn-primary" id="ec-next">${c.next}</button>`;
}

function ecRenderStep(modalEl) {
  modalEl.querySelector(".modal-body").innerHTML = `${ecStepperHtml()}${ecStepBodyHtml()}`;
  modalEl.querySelector(".modal-footer").innerHTML = ecFooterHtml();
  ecBindStepChrome(modalEl);
  ecBindStep(modalEl);
}

function ecBindStep(modalEl) {
  if (ecState.step === 1) {
    attachPcClientPicker(modalEl, "ec", (client) => {
      ecState.client = client;
      ecState.sourceAccount = null;
      ecState.targetAccount = null;
      ecRenderStep(modalEl);
    });
  }
  if (ecState.step === 2) {
    mfSetOnChange(pcAccountSelectId("ec-source"), (value) => {
      const [accountId, currency] = value.split(":");
      ecState.sourceAccount = { accountId, currency, label: `${currency} - ...${accountId.slice(-6)}` };
      if (ecState.targetAccount && ecState.targetAccount.currency === currency) ecState.targetAccount = null;
      ecRenderStep(modalEl);
    });
    mfSetOnChange(pcAccountSelectId("ec-target"), (value) => {
      const [accountId, currency] = value.split(":");
      ecState.targetAccount = { accountId, currency, label: `${currency} - ...${accountId.slice(-6)}` };
      ecRenderStep(modalEl);
    });
    modalEl.querySelectorAll(`[data-pc-account-open]`).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const accountId = btn.dataset.pcAccountOpen;
        closeModal();
        window.location.hash = `#/accounts-virtual/${accountId}`;
      });
    });
    modalEl.querySelector("#ec-sourceAmount").addEventListener("input", (e) => { ecState.sourceAmount = e.target.value; });
    modalEl.querySelector("#ec-rate").addEventListener("input", (e) => { ecState.rate = e.target.value; ecState.rateTouched = true; });
  }
}

function ecBindStepChrome(modalEl) {
  const cancelBtn = modalEl.querySelector("#ec-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  const backBtn = modalEl.querySelector("#ec-back");
  if (backBtn) backBtn.addEventListener("click", () => { ecState.step -= 1; ecRenderStep(modalEl); });
  const saveDraftBtn = modalEl.querySelector("#ec-save-draft");
  if (saveDraftBtn) saveDraftBtn.addEventListener("click", () => ecFinish(false));
  modalEl.querySelector("#ec-next").addEventListener("click", () => ecGoNext(modalEl));
}

function ecGoNext(modalEl) {
  const c = t("operationsExchanges.create");
  const errEl = modalEl.querySelector("#ec-error");
  const fail = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };

  if (ecState.step === 1) {
    if (!ecState.client) return fail(c.errClient);
    ecState.step = 2;
    return ecRenderStep(modalEl);
  }
  if (ecState.step === 2) {
    if (!ecState.sourceAccount) return fail(c.errSourceAccount);
    if (!ecState.targetAccount) return fail(c.errTargetAccount);
    const amount = parseFloat(String(ecState.sourceAmount).replace(",", "."));
    if (!(amount > 0)) return fail(c.errAmount);
    if (ecState.sourceAccount.currency === ecState.targetAccount.currency) return fail(c.errSameCurrency);
    ecState.step = 3;
    return ecRenderStep(modalEl);
  }
  ecFinish(true);
}

let exchangeCreateSeq = 90000;

function ecFinish(alsoSend) {
  const c = t("operationsExchanges.create");
  exchangeCreateSeq += 1;
  const seed = exchangeCreateSeq;
  const now = pdNow();
  const amount = parseFloat(String(ecState.sourceAmount).replace(",", ".")) || 0;
  const fee = ecFee();
  const rate = ecRate();
  const targetAmount = +((amount - fee) * rate).toFixed(2);
  const totalAmount = +(amount + fee).toFixed(2);
  const status = alsoSend ? "PROCESSING" : "DRAFT";
  const row = {
    id: seedToPaymentUuid(seed),
    code: entityCode("EXC", seed),
    createdDate: now, updatedDate: now, createdAt: formatDateTime(now), updatedAt: formatDateTime(now),
    settledDate: null, settledAt: null,
    direction: "BOTH",
    paymentSystem: "EXCHANGE",
    status,
    previousStatus: null,
    isFavorite: false,
    senderClientId: ecState.client.id, senderClientType: ecState.client.type, senderClientName: ecState.client.name, senderClientLink: paymentClientLink(ecState.client),
    senderAccountId: ecState.sourceAccount.accountId,
    recipientClientId: ecState.client.id, recipientClientType: ecState.client.type, recipientClientName: ecState.client.name, recipientClientLink: paymentClientLink(ecState.client),
    recipientAccountId: ecState.targetAccount.accountId,
    sourceAmount: amount, sourceCurrency: ecState.sourceAccount.currency,
    targetAmount, targetCurrency: ecState.targetAccount.currency,
    exchangeRate: rate,
    feeAmount: fee, feeCurrency: ecState.sourceAccount.currency,
    totalAmount, totalCurrency: ecState.sourceAccount.currency,
    purposeOfPayment: null, sourceOfFunds: null, note: null,
  };
  OPERATIONS_EXCHANGES_MOCK.unshift(row);
  closeModal();
  showToast(c.done);
  window.location.hash = `#/operations-exchanges/${row.id}`;
}

function openCreateExchangeModal() {
  ecState = ecEmptyState();
  const c = t("operationsExchanges.create");
  openModal({
    title: c.title,
    width: 560,
    bodyHtml: `${ecStepperHtml()}${ecStepBodyHtml()}`,
    footerHtml: ecFooterHtml(),
    onMount: (modalEl) => {
      ecBindStepChrome(modalEl);
      ecBindStep(modalEl);
    },
  });
}

function initOperationsExchangesView() {
  bindExportMenu("oe-export", openExportExchangesModal);
  attachOperationsExchangesFilterHandlers();
  attachOperationsExchangesTableHandlers();
  const createBtn = document.getElementById("oe-create-btn");
  if (createBtn) createBtn.addEventListener("click", openCreateExchangeModal);
}


