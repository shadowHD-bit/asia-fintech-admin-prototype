/* ==========================================================================
   Вьюха "Клиенты → Компании" (список).
   Данные — assets/mock/clients-companies.mock.js. Форма строки сверена с
   реальным JSON-ответом `companies` (получен от пользователя 21.09.2026) —
   см. подробный комментарий в начале мок-файла. Переиспользует хелперы из
   views/clients-users.js (copyIconButton, dateTimeCell, renderPager, паттерн
   sortableHeader, попапы select-dropdown/date-range-picker) — они уже в общей
   области видимости.
   Сортировка ограничена реальным SortCompanyField: CREATED_AT | NAME | UPDATED_AT
   — по остальным колонкам сортировки нет ни у бэкенда, ни здесь.
   ========================================================================== */

const clientsCompaniesState = {
  search: "",
  accountStatuses: [], // 'ACTIVE' | 'BLOCKED' (производное от blockReasons)
  phone: "", // '' (любой) | 'set' | 'unset'
  kybStatuses: [],
  riskLevels: [],
  createdFrom: null,
  createdTo: null,
  updatedFrom: null,
  updatedTo: null,
  sortBy: null, // 'name' | 'createdAt' | 'updatedAt'
  sortDir: "asc",
  page: 1,
  pageSize: 10,
};

function kybStatusLabel(status) {
  return t(`kycStatus.${status}`);
}

function riskLevelLabel(level) {
  return t(`scoringRisk.${level}`);
}

// ScoringRiskLevelEnum (5 значений) — цветовая шкала по нарастанию тяжести:
// зелёный → жёлтый → розовый → насыщенный красный → чёрный (запрещённый).
function riskLevelBadgeClass(level) {
  if (level === "LOW_RISK") return "badge-success";
  if (level === "MEDIUM_RISK") return "badge-warning";
  if (level === "HIGH_RISK") return "badge-danger";
  if (level === "VERY_HIGH_RISK") return "badge-danger-strong";
  if (level === "PROHIBITED_RISK") return "badge-critical";
  return "badge-neutral";
}

// Статус компании: заблокирована, пока есть хотя бы одна причина блокировки (blockReasons)
function companyAccountStatus(row) {
  return row.blockReasons && row.blockReasons.length ? "BLOCKED" : "ACTIVE";
}

// ---- Фильтрация / сортировка -----------------------------------------------------
// ignoreStatus — для счётчиков на быстрых табах: применяем все остальные фильтры, но не сам статус KYB
function getFilteredClientsCompanies({ ignoreStatus } = {}) {
  const s = clientsCompaniesState;
  const search = s.search.trim().toLowerCase();

  return CLIENTS_COMPANIES_MOCK.filter((row) => {
    if (search) {
      const haystack = `${row.name} ${row.registeredBusinessName || ""} ${row.registrationNumber || ""} ${row.businessEmail || ""} ${row.businessPhone || ""} ${row.id} ${row.code || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (s.accountStatuses.length && !s.accountStatuses.includes(companyAccountStatus(row))) return false;
    if (s.phone === "set" && !row.businessPhone) return false;
    if (s.phone === "unset" && row.businessPhone) return false;
    if (!ignoreStatus && s.kybStatuses.length && !s.kybStatuses.includes(row.currentKYBLevelStatusV2 && row.currentKYBLevelStatusV2.status)) return false;
    if (s.riskLevels.length && !s.riskLevels.includes(row.scoringRiskLevel)) return false;
    if (s.createdFrom && row.createdDate < s.createdFrom) return false;
    if (s.createdTo && row.createdDate > s.createdTo) return false;
    if (s.updatedFrom && row.updatedDate < s.updatedFrom) return false;
    if (s.updatedTo && row.updatedDate > s.updatedTo) return false;
    return true;
  });
}

function sortClientsCompanies(list) {
  const { sortBy, sortDir } = clientsCompaniesState;
  if (!sortBy) return list;
  const dir = sortDir === "asc" ? 1 : -1;

  return [...list].sort((a, b) => {
    if (sortBy === "createdAt") return (a.createdDate - b.createdDate) * dir;
    if (sortBy === "updatedAt") return (a.updatedDate - b.updatedDate) * dir;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * dir;
  });
}

// ---- Фильтры ----------------------------------------------------------------------
function activeCompaniesFilterCount() {
  const s = clientsCompaniesState;
  let n = 0;
  if (s.accountStatuses.length) n++;
  if (s.phone) n++;
  if (s.kybStatuses.length) n++;
  if (s.riskLevels.length) n++;
  if (s.createdFrom || s.createdTo) n++;
  if (s.updatedFrom || s.updatedTo) n++;
  return n;
}

function kybStatusFilterLabel(values) {
  return multiSelectLabel(values, t("clientsCompanies.filters.allStatuses"), kybStatusLabel);
}

function riskLevelFilterLabel(values) {
  return multiSelectLabel(values, t("clientsCompanies.filters.allLevels"), riskLevelLabel);
}

function renderCompaniesFilterTriggerContent() {
  const f = t("clientsCompanies.filters");
  const count = activeCompaniesFilterCount();
  return `
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h14M6 10h8M8.5 15.5h3"/></svg>
    <span>${f.filterButton}</span>
    ${count ? `<span class="filter-badge">${count}</span>` : ""}
  `;
}

// ---- Быстрые табы статуса KYB — тот же паттерн, что и у пользователей -----------
const QUICK_KYB_STATUS_TABS = ["REQUIRES_REVIEW", "PENDING", "PROCESSING", "REJECTED", "NOT_CONNECTED"];

function quickKybTabCount(status) {
  const matching = getFilteredClientsCompanies({ ignoreStatus: true });
  if (!status) return matching.length;
  return matching.filter((c) => c.currentKYBLevelStatusV2 && c.currentKYBLevelStatusV2.status === status).length;
}

function renderQuickKybStatusTabs() {
  const s = clientsCompaniesState;
  const isAllActive = s.kybStatuses.length === 0;
  const tabsHtml = [
    `<button type="button" class="quick-tab${isAllActive ? " is-active" : ""}" data-quick-status="">${t("clientsCompanies.filters.allTab")}<span class="quick-tab-count">${quickKybTabCount(null)}</span></button>`,
    ...QUICK_KYB_STATUS_TABS.map((st) => {
      const isActive = s.kybStatuses.length === 1 && s.kybStatuses[0] === st;
      return `<button type="button" class="quick-tab${isActive ? " is-active" : ""}" data-quick-status="${st}">${kybStatusLabel(st)}<span class="quick-tab-count">${quickKybTabCount(st)}</span></button>`;
    }),
  ].join("");
  return `<div class="quick-tabs" id="cc-quick-tabs">${tabsHtml}</div>`;
}

function attachQuickKybStatusTabsHandlers() {
  const wrap = document.getElementById("cc-quick-tabs");
  if (!wrap) return;
  wrap.querySelectorAll(".quick-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      clientsCompaniesState.kybStatuses = btn.dataset.quickStatus ? [btn.dataset.quickStatus] : [];
      clientsCompaniesState.page = 1;
      updateClientsCompaniesTable();
      refreshCompaniesFiltersChrome();
    });
  });
}

// ---- Чипы активных фильтров под строкой поиска ------------------------------------
function renderCompaniesFilterChips() {
  const s = clientsCompaniesState;
  const f = t("clientsCompanies.filters");
  const chips = [];

  if (s.accountStatuses.length) chips.push({ key: "accountStatus", label: `${f.accountStatus}: ${s.accountStatuses.map((v) => f.accountStatuses[v]).join(", ")}` });
  if (s.phone) chips.push({ key: "phone", label: `${f.phone}: ${f.phoneStates[s.phone]}` });
  if (s.kybStatuses.length) chips.push({ key: "kybStatus", label: `${f.kybStatus}: ${kybStatusFilterLabel(s.kybStatuses)}` });
  if (s.riskLevels.length) chips.push({ key: "riskLevel", label: `${f.riskLevel}: ${riskLevelFilterLabel(s.riskLevels)}` });
  if (s.createdFrom || s.createdTo) chips.push({ key: "createdAt", label: `${f.createdAt}: ${dateTriggerLabel(s.createdFrom, s.createdTo)}` });
  if (s.updatedFrom || s.updatedTo) chips.push({ key: "updatedAt", label: `${f.updatedAt}: ${dateTriggerLabel(s.updatedFrom, s.updatedTo)}` });

  if (!chips.length) return `<div class="filter-chips" id="cc-filter-chips"></div>`;

  return `
    <div class="filter-chips" id="cc-filter-chips">
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

function clearCompaniesFilterDimension(key) {
  const s = clientsCompaniesState;
  if (key === "accountStatus") s.accountStatuses = [];
  else if (key === "phone") s.phone = "";
  else if (key === "kybStatus") s.kybStatuses = [];
  else if (key === "riskLevel") s.riskLevels = [];
  else if (key === "createdAt") { s.createdFrom = null; s.createdTo = null; }
  else if (key === "updatedAt") { s.updatedFrom = null; s.updatedTo = null; }
  s.page = 1;
  updateClientsCompaniesTable();
  refreshCompaniesFiltersChrome();
}

function attachCompaniesFilterChipsHandlers() {
  const wrap = document.getElementById("cc-filter-chips");
  if (!wrap) return;
  wrap.querySelectorAll(".filter-chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => clearCompaniesFilterDimension(btn.dataset.chip));
  });
}

function renderClientsCompaniesFilters() {
  const f = t("clientsCompanies.filters");
  const hasSearch = clientsCompaniesState.search.length > 0;

  return `
    ${renderQuickKybStatusTabs()}
    <div class="filters-bar-compact">
      <div class="filters-search">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5.5"/><path d="m17 17-3.5-3.5"/></svg>
        <input type="text" id="cc-filter-search" placeholder="${f.searchPlaceholder}" value="${clientsCompaniesState.search}" />
        <button type="button" class="filters-search-clear" id="cc-filter-search-clear"${hasSearch ? "" : " hidden"}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <button type="button" class="filter-trigger" id="cc-filter-trigger">${renderCompaniesFilterTriggerContent()}</button>
    </div>
    ${renderCompaniesFilterChips()}
  `;
}

function attachClientsCompaniesFilterHandlers() {
  const searchEl = document.getElementById("cc-filter-search");
  const clearBtn = document.getElementById("cc-filter-search-clear");

  const applySearch = () => {
    clientsCompaniesState.search = searchEl.value;
    clientsCompaniesState.page = 1;
    clearBtn.hidden = searchEl.value.length === 0;
    updateClientsCompaniesTable();
    refreshCompaniesFiltersChrome();
  };

  searchEl.addEventListener("input", applySearch);

  clearBtn.addEventListener("click", () => {
    searchEl.value = "";
    searchEl.focus();
    applySearch();
  });

  document.getElementById("cc-filter-trigger").addEventListener("click", openCompaniesFiltersDrawer);

  attachQuickKybStatusTabsHandlers();
  attachCompaniesFilterChipsHandlers();
}

// Обновляет всё вне панели, что отражает текущее применённое состояние: бейдж
// на кнопке, быстрые табы и чипы.
function refreshCompaniesFiltersChrome() {
  const triggerBtn = document.getElementById("cc-filter-trigger");
  if (triggerBtn) triggerBtn.innerHTML = renderCompaniesFilterTriggerContent();

  const quickWrap = document.getElementById("cc-quick-tabs");
  if (quickWrap) {
    quickWrap.outerHTML = renderQuickKybStatusTabs();
    attachQuickKybStatusTabsHandlers();
  }

  const chipsWrap = document.getElementById("cc-filter-chips");
  if (chipsWrap) {
    chipsWrap.outerHTML = renderCompaniesFilterChips();
    attachCompaniesFilterChipsHandlers();
  }
}

function resetClientsCompaniesFilters() {
  const s = clientsCompaniesState;
  s.accountStatuses = [];
  s.phone = "";
  s.kybStatuses = [];
  s.riskLevels = [];
  s.createdFrom = null;
  s.createdTo = null;
  s.updatedFrom = null;
  s.updatedTo = null;
  s.page = 1;
  updateClientsCompaniesTable();
}

function resetAllClientsCompaniesFilters() {
  clientsCompaniesState.search = "";
  const searchEl = document.getElementById("cc-filter-search");
  if (searchEl) searchEl.value = "";
  const clearBtn = document.getElementById("cc-filter-search-clear");
  if (clearBtn) clearBtn.hidden = true;
  resetClientsCompaniesFilters();
  refreshCompaniesFiltersChrome();
}

// ---- Боковая панель «Фильтры» — тот же паттерн, что и у пользователей: аккордеон
// групп + черновик, применяемый только по кнопке "Показать результаты" -----------
const COMPANIES_FILTER_GROUP_DEFS = [
  { id: "accountStatus", labelKey: "accountStatus" },
  { id: "kybStatus", labelKey: "kybStatus" },
  { id: "riskLevel", labelKey: "riskLevel" },
  { id: "createdAt", labelKey: "createdAt" },
  { id: "updatedAt", labelKey: "updatedAt" },
];

let ccFilterDraft = null;

function cloneCompaniesFilterDraft(s) {
  return {
    accountStatuses: [...s.accountStatuses],
    phone: s.phone,
    kybStatuses: [...s.kybStatuses],
    riskLevels: [...s.riskLevels],
    createdFrom: s.createdFrom,
    createdTo: s.createdTo,
    updatedFrom: s.updatedFrom,
    updatedTo: s.updatedTo,
  };
}

function companiesFilterGroupActiveCount(groupId) {
  const d = ccFilterDraft;
  if (groupId === "accountStatus") return d.accountStatuses.length;
  if (groupId === "kybStatus") return d.kybStatuses.length;
  if (groupId === "riskLevel") return d.riskLevels.length;
  if (groupId === "createdAt") return d.createdFrom || d.createdTo ? 1 : 0;
  if (groupId === "updatedAt") return d.updatedFrom || d.updatedTo ? 1 : 0;
  return 0;
}

function companiesFilterGroupBodyHtml(groupId) {
  const d = ccFilterDraft;
  if (groupId === "accountStatus") return checkboxOptionsHtml(["ACTIVE", "BLOCKED"].map((v) => ({ value: v, label: t("clientsCompanies.filters.accountStatuses")[v] })), d.accountStatuses, groupId);
  if (groupId === "kybStatus") return checkboxOptionsHtml(KYB_STATUS_OPTIONS.map((st) => ({ value: st, label: kybStatusLabel(st) })), d.kybStatuses, groupId);
  if (groupId === "riskLevel") return checkboxOptionsHtml(SCORING_RISK_LEVELS.map((lvl) => ({ value: lvl, label: riskLevelLabel(lvl) })), d.riskLevels, groupId);
  if (groupId === "createdAt") {
    return `
      <button type="button" class="drp-trigger" id="cc-drawer-created-trigger">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>
        <span>${dateTriggerLabel(d.createdFrom, d.createdTo)}</span>
      </button>
    `;
  }
  if (groupId === "updatedAt") {
    return `
      <button type="button" class="drp-trigger" id="cc-drawer-updated-trigger">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>
        <span>${dateTriggerLabel(d.updatedFrom, d.updatedTo)}</span>
      </button>
    `;
  }
  return "";
}

let ccExpandedFilterGroups = null;

function ensureCompaniesExpandedGroupsInit() {
  if (ccExpandedFilterGroups) return;
  ccExpandedFilterGroups = new Set();
  COMPANIES_FILTER_GROUP_DEFS.forEach((g) => {
    if (companiesFilterGroupActiveCount(g.id) > 0) ccExpandedFilterGroups.add(g.id);
  });
}

function renderCompaniesFilterGroup(groupId) {
  const f = t("clientsCompanies.filters");
  const label = f[COMPANIES_FILTER_GROUP_DEFS.find((g) => g.id === groupId).labelKey];
  const count = companiesFilterGroupActiveCount(groupId);
  const expanded = ccExpandedFilterGroups.has(groupId);

  return `
    <div class="filter-group${expanded ? " is-expanded" : ""}" data-group-id="${groupId}">
      <button type="button" class="filter-group-head" data-group-toggle="${groupId}">
        <span class="filter-group-label">${label}</span>
        ${count ? `<span class="filter-group-badge">${count}</span>` : ""}
        <span class="filter-group-chevron">${FILTER_GROUP_CHEVRON}</span>
      </button>
      <div class="filter-group-body">${companiesFilterGroupBodyHtml(groupId)}</div>
    </div>
  `;
}

function renderCompaniesFiltersDrawerBody() {
  const f = t("clientsCompanies.filters");
  const d = ccFilterDraft;
  const seg = ["", "set", "unset"].map((v) => `<button type="button" class="filter-seg-btn${d.phone === v ? " is-active" : ""}" data-phone="${v}">${f.phoneStates[v || "any"]}</button>`).join("");
  const phoneRow = `<div class="filter-seg-row"><span class="filter-group-label">${f.phone}</span><div class="filter-seg">${seg}</div></div>`;
  return COMPANIES_FILTER_GROUP_DEFS.map((g) => renderCompaniesFilterGroup(g.id)).join("") + phoneRow;
}

function renderCompaniesFiltersDrawer() {
  const f = t("clientsCompanies.filters");
  return `
    <div class="filters-drawer-overlay" id="cc-filters-overlay"></div>
    <aside class="filters-drawer" id="cc-filters-drawer">
      <div class="filters-drawer-header">
        <h2 class="filters-drawer-title">${f.drawerTitle}</h2>
        <button type="button" class="filters-drawer-close" id="cc-filters-drawer-close">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <div class="filters-drawer-body" id="cc-filters-drawer-body">${renderCompaniesFiltersDrawerBody()}</div>
      <div class="filters-drawer-footer">
        <button type="button" class="btn-secondary" id="cc-drawer-reset">${f.reset}</button>
        <button type="button" class="btn-primary" id="cc-drawer-apply">${f.showResults}</button>
      </div>
    </aside>
  `;
}

function rerenderCompaniesFiltersDrawerBody() {
  const bodyEl = document.getElementById("cc-filters-drawer-body");
  if (!bodyEl) return;
  bodyEl.innerHTML = renderCompaniesFiltersDrawerBody();
  attachCompaniesFiltersDrawerBodyHandlers();
}

function attachCompaniesFiltersDrawerBodyHandlers() {
  const d = ccFilterDraft;

  document.querySelectorAll("[data-group-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const groupId = btn.dataset.groupToggle;
      if (ccExpandedFilterGroups.has(groupId)) ccExpandedFilterGroups.delete(groupId);
      else ccExpandedFilterGroups.add(groupId);
      btn.closest(".filter-group").classList.toggle("is-expanded");
    });
  });

  document.querySelectorAll('#cc-filters-drawer-body input[type="checkbox"][data-group]').forEach((input) => {
    input.addEventListener("change", () => {
      const groupId = input.dataset.group;
      const arr = groupId === "accountStatus" ? d.accountStatuses : groupId === "kybStatus" ? d.kybStatuses : d.riskLevels;
      const idx = arr.indexOf(input.value);
      if (input.checked && idx === -1) arr.push(input.value);
      if (!input.checked && idx !== -1) arr.splice(idx, 1);
      rerenderCompaniesFiltersDrawerBody();
    });
  });

  document.querySelectorAll("#cc-filters-drawer-body [data-phone]").forEach((btn) => {
    btn.addEventListener("click", () => {
      d.phone = btn.dataset.phone;
      rerenderCompaniesFiltersDrawerBody();
    });
  });

  const createdTrigger = document.getElementById("cc-drawer-created-trigger");
  if (createdTrigger) {
    createdTrigger.addEventListener("click", (e) => {
      openDateRangePicker({
        from: d.createdFrom,
        to: d.createdTo,
        anchorEl: e.currentTarget,
        onApply: (from, to) => {
          d.createdFrom = from;
          d.createdTo = to;
          rerenderCompaniesFiltersDrawerBody();
        },
      });
    });
  }

  const updatedTrigger = document.getElementById("cc-drawer-updated-trigger");
  if (updatedTrigger) {
    updatedTrigger.addEventListener("click", (e) => {
      openDateRangePicker({
        from: d.updatedFrom,
        to: d.updatedTo,
        anchorEl: e.currentTarget,
        onApply: (from, to) => {
          d.updatedFrom = from;
          d.updatedTo = to;
          rerenderCompaniesFiltersDrawerBody();
        },
      });
    });
  }
}

function attachCompaniesFiltersDrawerChromeHandlers() {
  const resetBtn = document.getElementById("cc-drawer-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetClientsCompaniesFilters();
      ccFilterDraft = cloneCompaniesFilterDraft(clientsCompaniesState);
      ccExpandedFilterGroups = new Set();
      rerenderCompaniesFiltersDrawerBody();
      refreshCompaniesFiltersChrome();
    });
  }

  const applyBtn = document.getElementById("cc-drawer-apply");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      Object.assign(clientsCompaniesState, cloneCompaniesFilterDraft(ccFilterDraft));
      clientsCompaniesState.page = 1;
      updateClientsCompaniesTable();
      refreshCompaniesFiltersChrome();
      closeCompaniesFiltersDrawer();
    });
  }

  const closeBtn = document.getElementById("cc-filters-drawer-close");
  if (closeBtn) closeBtn.addEventListener("click", closeCompaniesFiltersDrawer);

  const overlay = document.getElementById("cc-filters-overlay");
  if (overlay) overlay.addEventListener("click", closeCompaniesFiltersDrawer);
}

function handleCompaniesFiltersDrawerEscape(e) {
  if (e.key === "Escape") closeCompaniesFiltersDrawer();
}

function openCompaniesFiltersDrawer() {
  ccFilterDraft = cloneCompaniesFilterDraft(clientsCompaniesState);
  ensureCompaniesExpandedGroupsInit();

  const wrap = document.createElement("div");
  wrap.id = "cc-filters-drawer-wrap";
  wrap.innerHTML = renderCompaniesFiltersDrawer();
  document.body.appendChild(wrap);

  attachCompaniesFiltersDrawerChromeHandlers();
  attachCompaniesFiltersDrawerBodyHandlers();

  requestAnimationFrame(() => {
    const overlay = document.getElementById("cc-filters-overlay");
    const drawer = document.getElementById("cc-filters-drawer");
    if (overlay) overlay.classList.add("is-open");
    if (drawer) drawer.classList.add("is-open");
  });

  document.addEventListener("keydown", handleCompaniesFiltersDrawerEscape);
  document.body.classList.add("filters-drawer-open");
}

function closeCompaniesFiltersDrawer() {
  const wrap = document.getElementById("cc-filters-drawer-wrap");
  if (!wrap) return;
  const overlay = document.getElementById("cc-filters-overlay");
  const drawer = document.getElementById("cc-filters-drawer");
  if (overlay) overlay.classList.remove("is-open");
  if (drawer) drawer.classList.remove("is-open");
  document.removeEventListener("keydown", handleCompaniesFiltersDrawerEscape);
  document.body.classList.remove("filters-drawer-open");
  setTimeout(() => wrap.remove(), 220);
}

// ---- Таблица ------------------------------------------------------------------------
function companiesSortableHeader(key, label) {
  const active = clientsCompaniesState.sortBy === key;
  const icon = active ? (clientsCompaniesState.sortDir === "asc" ? SORT_ICON_ASC : SORT_ICON_DESC) : SORT_ICON_NEUTRAL;
  return `<th><button type="button" class="th-sort${active ? " is-active" : ""}" data-sort="${key}">${label}<span class="th-sort-icon">${icon}</span></button></th>`;
}

function companyKybBadgeClass(status) {
  return statusBadgeClass(status);
}

// ---- Кастомный тултип для усечённых названий (.has-tooltip[data-tooltip]) -------
// Живёт в document.body (fixed), а не внутри ячейки — иначе его бы обрезал
// overflow:hidden самой усечённой ячейки и overflow-x:auto у .table-scroll.
let customTooltipEl = null;

function showCustomTooltip(anchorEl) {
  hideCustomTooltip();
  const text = anchorEl.dataset.tooltip;
  if (!text) return;

  const el = document.createElement("div");
  el.className = "js-tooltip";
  el.textContent = text;
  document.body.appendChild(el);
  customTooltipEl = el;

  const anchorRect = anchorEl.getBoundingClientRect();
  const tipRect = el.getBoundingClientRect();

  let top = anchorRect.top - tipRect.height - 6;
  if (top < 4) top = anchorRect.bottom + 6;

  let left = anchorRect.left;
  const maxLeft = window.innerWidth - tipRect.width - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);

  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

function hideCustomTooltip() {
  if (customTooltipEl) {
    customTooltipEl.remove();
    customTooltipEl = null;
  }
}

// Клик по имени компании (см. .identity-link ниже) уходит на другую страницу
// без mouseleave — тултип, оставшийся от наведения, иначе повисает поверх
// уже сменившегося контента. Слушатель вешается один раз при загрузке скрипта.
window.addEventListener("hashchange", hideCustomTooltip);

function attachCustomTooltips(root) {
  root.querySelectorAll(".has-tooltip").forEach((el) => {
    el.addEventListener("mouseenter", () => showCustomTooltip(el));
    el.addEventListener("mouseleave", hideCustomTooltip);
  });
}

function renderClientsCompaniesRow(row) {
  const noValue = t("clientsCompanies.noValue");
  const kyb = row.currentKYBLevelStatusV2;

  return `
    <tr>
      <td>
        <div class="identity-cell">
          <div class="identity-cell-primary">
            ${(() => { const b = companyAccountStatus(row) === "BLOCKED"; const l = t(b ? "companyDetail.blocked" : "companyDetail.active"); return `<span class="status-dot ${b ? "is-blocked" : "is-active"}" title="${l}" aria-label="${l}"></span>`; })()}
            <button type="button" class="table-link identity-link" data-company-id="${row.id}">
              <span class="table-truncate has-tooltip" data-tooltip="${escapeAttr(row.name)}">${row.name}</span>
            </button>
            ${copyIconButton(row.name)}
          </div>
          <div class="identity-cell-sub">
            <span class="identity-cell-tag">${t("clientsCompanies.idTag")}</span>
            <button type="button" class="id-copy" data-copy-value="${row.code}" title="${t("clientsCompanies.copy")}">
              <span class="id-copy-label">${row.code}</span>
              ${COPY_ICON_SVG}
            </button>
          </div>
          ${
            row.registrationNumber
              ? `<div class="identity-cell-sub">
                  <span class="identity-cell-tag">${t("clientsCompanies.regNumberTag")}</span>
                  <button type="button" class="id-copy" data-copy-value="${row.registrationNumber}" title="${t("clientsCompanies.copy")}">
                    <span class="id-copy-label">${row.registrationNumber}</span>
                    ${COPY_ICON_SVG}
                  </button>
                </div>`
              : ""
          }
        </div>
      </td>
      <td>
        ${
          row.registeredBusinessName
            ? `<div class="inline-copy inline-copy-wrap"><span class="table-clamp-2 has-tooltip" data-tooltip="${escapeAttr(row.registeredBusinessName)}">${row.registeredBusinessName}</span>${copyIconButton(row.registeredBusinessName)}</div>`
            : noValue
        }
      </td>
      <td>
        ${
          row.businessEmail
            ? `<div class="inline-copy"><span>${row.businessEmail}</span>${copyIconButton(row.businessEmail)}</div>`
            : noValue
        }
      </td>
      <td>
        ${
          row.businessPhone
            ? `<div class="inline-copy"><span>${row.businessPhone}</span>${copyIconButton(row.businessPhone)}</div>`
            : noValue
        }
      </td>
      <td>${kyb ? `<span class="badge ${companyKybBadgeClass(kyb.status)}" title="${kyb.kybConfig.name || ""}">${kybStatusLabel(kyb.status)}</span>` : noValue}</td>
      <td>${row.scoringRiskLevel ? `<span class="badge ${riskLevelBadgeClass(row.scoringRiskLevel)}">${riskLevelLabel(row.scoringRiskLevel)}</span>` : noValue}</td>
      <td>${dateTimeCell(row.createdAt)}</td>
      <td>${dateTimeCell(row.updatedAt)}</td>
      <td>${rowKebabMenu(`cc-row-${row.id}`, [{ label: t("headerMenu.exportCard"), icon: DOWNLOAD_ICON_SVG, attrs: `data-cc-pdf="${row.id}"` }])}</td>
    </tr>
  `;
}

function renderClientsCompaniesTableSection() {
  const cols = t("clientsCompanies.columns");
  const pag = t("clientsCompanies.pagination");
  const filtered = sortClientsCompanies(getFilteredClientsCompanies());
  const totalPages = Math.max(1, Math.ceil(filtered.length / clientsCompaniesState.pageSize));

  if (clientsCompaniesState.page > totalPages) clientsCompaniesState.page = totalPages;
  const page = clientsCompaniesState.page;

  const start = (page - 1) * clientsCompaniesState.pageSize;
  const pageRows = filtered.slice(start, start + clientsCompaniesState.pageSize);

  if (filtered.length === 0) {
    const empty = t("clientsCompanies.emptyState");
    return `
      <div class="empty-state empty-state-centered">
        <img class="empty-state-logo" src="assets/images/logo-icon.svg" alt="" />
        <div class="empty-state-text-group">
          <div class="empty-state-title">${empty.title}</div>
          <div class="empty-state-text">${empty.text}</div>
        </div>
        <button type="button" class="btn-secondary" id="cc-empty-reset">${empty.resetButton}</button>
      </div>
    `;
  }

  const pageButtons = renderPager(page, totalPages);

  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            ${companiesSortableHeader("name", cols.client)}
            <th>${cols.registeredBusinessName}</th>
            <th>${cols.email}</th>
            <th>${cols.phone}</th>
            <th>${cols.kybStatus}</th>
            <th>${cols.riskLevel}</th>
            ${companiesSortableHeader("createdAt", cols.createdAt)}
            ${companiesSortableHeader("updatedAt", cols.updatedAt)}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${pageRows.map(renderClientsCompaniesRow).join("")}
        </tbody>
      </table>
    </div>

    <div class="table-footer">
      <span class="table-footer-total">${pag.total(filtered.length)}</span>
      <div class="pager">${pageButtons}</div>
      <div class="table-footer-page-size">
        <span>${pag.rowsPerPage}</span>
        <select id="cc-page-size">
          ${[10, 20, 50]
            .map((n) => `<option value="${n}"${clientsCompaniesState.pageSize === n ? " selected" : ""}>${n}</option>`)
            .join("")}
        </select>
      </div>
    </div>
  `;
}

let clientsCompaniesLoadingTimer = null;

function updateClientsCompaniesTable() {
  const wrap = document.getElementById("clients-companies-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = renderTableLoadingState();
  clearTimeout(clientsCompaniesLoadingTimer);
  clientsCompaniesLoadingTimer = setTimeout(() => {
    wrap.innerHTML = renderClientsCompaniesTableSection();
    attachClientsCompaniesTableHandlers();
    refreshCompanyMetrics();
  }, CLIENTS_USERS_LOADING_DELAY);
}

// ---- Карточки-метрики над таблицей: агрегаты по текущей выборке, которые НЕ
// дублируют быстрые табы статуса KYB (те уже дают разбивку по currentKYBLevelStatusV2.status) —
// здесь другие срезы: динамика регистраций, уровень риска, полнота данных.
function computeCompanyMetrics() {
  const list = getFilteredClientsCompanies();
  const recentThreshold = new Date(MOCK_NOW.getTime() - USER_METRICS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return {
    newRecent: list.filter((c) => c.createdDate >= recentThreshold).length,
    blocked: list.filter((c) => c.blockReasons && c.blockReasons.length).length,
    highRisk: list.filter((c) => ["HIGH_RISK", "VERY_HIGH_RISK", "PROHIBITED_RISK"].includes(c.scoringRiskLevel)).length,
    noEmail: list.filter((c) => !c.businessEmail).length,
    noRegisteredName: list.filter((c) => !c.registeredBusinessName).length,
  };
}

function renderCompanyMetricsCards() {
  const m = computeCompanyMetrics();
  const cd = t("clientsCompanies.metrics");
  return `
    <div class="metrics-grid" id="cc-metrics">
      ${renderMetricCard(m.newRecent, cd.newRecent)}
      ${renderMetricCard(m.blocked, cd.blocked)}
      ${renderMetricCard(m.highRisk, cd.highRisk)}
      ${renderMetricCard(m.noEmail, cd.noEmail)}
      ${renderMetricCard(m.noRegisteredName, cd.noRegisteredName)}
    </div>
  `;
}

function refreshCompanyMetrics() {
  const el = document.getElementById("cc-metrics");
  if (el) el.outerHTML = renderCompanyMetricsCards();
}

function attachClientsCompaniesTableHandlers() {
  document.querySelectorAll("[data-cc-pdf]").forEach((b) =>
    b.addEventListener("click", () => {
      const company = CLIENTS_COMPANIES_MOCK.find((c) => c.id === b.dataset.ccPdf);
      if (company) exportClientCardPdf(company, "company");
    })
  );
  const wrap = document.getElementById("clients-companies-table-wrap");
  if (!wrap) return;

  const emptyResetBtn = document.getElementById("cc-empty-reset");
  if (emptyResetBtn) emptyResetBtn.addEventListener("click", resetAllClientsCompaniesFilters);

  wrap.querySelectorAll(".pager-btn[data-page]").forEach((btn) => {
    if (btn.hasAttribute("disabled")) return;
    btn.addEventListener("click", () => {
      clientsCompaniesState.page = Number(btn.dataset.page);
      updateClientsCompaniesTable();
    });
  });

  const pageSizeSelect = document.getElementById("cc-page-size");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", () => {
      clientsCompaniesState.pageSize = Number(pageSizeSelect.value);
      clientsCompaniesState.page = 1;
      updateClientsCompaniesTable();
    });
  }

  wrap.querySelectorAll(".th-sort").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (clientsCompaniesState.sortBy === key) {
        clientsCompaniesState.sortDir = clientsCompaniesState.sortDir === "asc" ? "desc" : "asc";
      } else {
        clientsCompaniesState.sortBy = key;
        clientsCompaniesState.sortDir = "asc";
      }
      updateClientsCompaniesTable();
    });
  });

  wrap.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn));
    });
  });

  wrap.querySelectorAll(".identity-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = `#/clients-companies/${btn.dataset.companyId}`;
    });
  });

  attachCustomTooltips(wrap);
}

function viewClientsCompanies() {
  const heroActions = `<span class="filters-bar-end">${exportMenuHtml("cc-export", t("clientsCompanies.export.button"), t("clientsCompanies.export.hint"))}<button type="button" class="btn-primary" id="cc-add">${PLUS_ICON_SVG}<span>${t("clientsCompanies.create.button")}</span></button></span>`;
  return `
    <div class="list-hero">${pageHeader(t("nav.clients-companies"), t("navDescriptions.clients-companies"), heroActions)}</div>
    ${renderCompanyMetricsCards()}
    <div class="card list-card">
      ${renderClientsCompaniesFilters()}
      <div class="list-divider"></div>
      <div id="clients-companies-table-wrap">${renderClientsCompaniesTableSection()}</div>
    </div>
  `;
}

// ---- Экспорт списка компаний (CSV / XLSX) — ровно то, что показывает таблица: поиск, быстрые
// табы, фильтры панели и сортировка, без учёта страницы. Перед выгрузкой — модалка с итогом.
function companiesExportFilterLines() {
  const s = clientsCompaniesState;
  const f = t("clientsCompanies.filters");
  const lines = [];
  if (s.search) lines.push(`${f.searchPlaceholder}: «${pdEscape(s.search)}»`);
  if (s.accountStatuses.length) lines.push(`${f.accountStatus}: ${s.accountStatuses.map((v) => f.accountStatuses[v]).join(", ")}`);
  if (s.kybStatuses.length) lines.push(`${f.kybStatus}: ${kybStatusFilterLabel(s.kybStatuses)}`);
  if (s.riskLevels.length) lines.push(`${f.riskLevel}: ${riskLevelFilterLabel(s.riskLevels)}`);
  if (s.phone) lines.push(`${f.phone}: ${f.phoneStates[s.phone]}`);
  if (s.createdFrom || s.createdTo) lines.push(`${f.createdAt}: ${dateTriggerLabel(s.createdFrom, s.createdTo)}`);
  if (s.updatedFrom || s.updatedTo) lines.push(`${f.updatedAt}: ${dateTriggerLabel(s.updatedFrom, s.updatedTo)}`);
  return lines;
}

function openExportCompaniesModal(format) {
  const x = t("clientsCompanies.export");
  const count = getFilteredClientsCompanies().length;
  const total = CLIENTS_COMPANIES_MOCK.length;
  const lines = companiesExportFilterLines();
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
      if (flt) flt.addEventListener("click", () => { closeModal(); openCompaniesFiltersDrawer(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportClientsCompanies(format); });
    },
  });
}

function exportClientsCompanies(format) {
  const x = t("clientsCompanies.export");
  const f = t("clientsCompanies.filters");
  const rows = sortClientsCompanies(getFilteredClientsCompanies().slice()).map((r) => {
    const kyb = r.currentKYBLevelStatusV2;
    return [
      r.name, r.code, r.registrationNumber || "", r.registeredBusinessName || "", r.businessEmail || "", r.businessPhone || "",
      f.accountStatuses[companyAccountStatus(r)], kyb ? kybStatusLabel(kyb.status) : "", r.scoringRiskLevel ? riskLevelLabel(r.scoringRiskLevel) : "",
      r.createdAt, r.updatedAt,
    ];
  });
  exportTable(`companies_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(rows.length));
}

function initClientsCompaniesView() {
  bindExportMenu("cc-export", openExportCompaniesModal);
  attachClientsCompaniesFilterHandlers();
  attachClientsCompaniesTableHandlers();
  const addBtn = document.getElementById("cc-add");
  if (addBtn) addBtn.addEventListener("click", openCompanyCreateWizard);
}

// ---- Создание компании — по шагам, тот же степпер, что и у мастеров в clients-users.js. Поля — как в
// CreateCompanyInput (companies/schema.graphql: createCompany/createCompanies — админский сценарий, подтверждён
// и в ACL (companies-companies-admin), и в apps/companies/docs/HOW_IT_WORKS.md: "Создание из бек-офиса (полная
// анкета с участниками)"). registrant — реальное обязательное поле (CreateCompanyRegistrantInput!, id: ID! —
// СУЩЕСТВУЮЩИЙ пользователь, не создаётся тут же), поэтому первый шаг — выбор уже заведённого физлица из
// CLIENTS_USERS_MOCK, как и должно быть по схеме. name — тем же продуктовым решением, что и у email пользователя,
// всегда заполняется на создании. Документы/адреса/финансовые поля — не создаём тут же (для них уже есть отдельные
// формы в карточке компании), компания заводится без KYB (currentKYBLevelStatusV2 null), как и часть реальных записей.
let companyCreateSeq = 900;

function ccRegistrantOptions(query) {
  const q = query.trim().toLowerCase();
  const list = !q ? CLIENTS_USERS_MOCK.slice(0, 20) : CLIENTS_USERS_MOCK.filter((u) => (u.fullName || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  return list.slice(0, 20);
}

function ccRegistrantListHtml(query) {
  const c = t("clientsCompanies.create");
  const options = ccRegistrantOptions(query);
  if (!options.length) return `<div class="table-cell-muted filter-search-empty">${c.registrantEmpty}</div>`;
  return options.map((u) => `<button type="button" class="filter-search-item" data-cc-registrant-pick="${u.id}">${pdEscape(u.fullName || u.email)}<span class="table-cell-muted"> · ${pdEscape(u.email)}</span></button>`).join("");
}

function ccRegistrantChipHtml(user) {
  const c = t("clientsCompanies.create");
  return `<span>${pdEscape(user.fullName || user.email)}</span><span class="table-cell-muted">${pdEscape(user.email)}</span><button type="button" class="table-link" data-cc-registrant-change>${c.change}</button>`;
}

function ccStepperHtml(step) {
  const c = t("clientsCompanies.create");
  const steps = [
    { n: 1, label: c.steps.registrant },
    { n: 2, label: c.steps.main },
    { n: 3, label: c.steps.contacts },
    { n: 4, label: c.steps.summary },
  ];
  return `
    <div class="kyc-stepper">
      ${steps
        .map((s, idx) => {
          const cls = s.n < step ? "is-done" : s.n === step ? "is-current" : "is-pending";
          return `
            <div class="kyc-stepper-item">
              <div class="kyc-stepper-circle ${cls}">${s.n < step ? CHECK_ICON_SVG : `<span>${s.n}</span>`}</div>
              ${idx < steps.length - 1 ? `<div class="kyc-stepper-line${s.n < step ? " is-done" : ""}"></div>` : ""}
              <div class="kyc-stepper-label"><div class="kyc-stepper-title">${s.label}</div></div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function openCompanyCreateWizard() {
  const c = t("clientsCompanies.create");
  const state = {
    step: 1,
    registrant: null,
    name: "", registeredBusinessName: "", tradingName: "", companyTypeName: COMPANY_TYPE_NAMES[0],
    countryOfIncorporationId: "", dateOfIncorporation: "", ownership: "PRIVATE",
    businessEmail: "", businessPhone: "", website: "", registrationNumber: "", taxNumber: "",
    businessActivityCode: BUSINESS_ACTIVITY_CODES[0].code, employees: COMPANY_EMPLOYEE_BUCKETS[0],
  };

  function stepBodyHtml() {
    if (state.step === 1) {
      return `
        <div class="filters-field">
          <span class="filters-field-label">${c.registrant} *</span>
          <p class="table-cell-muted" style="margin:0 0 var(--space-2)">${c.registrantHint}</p>
          <div class="pc-client-picker">
            <div class="pc-client-search" id="cc-registrant-search-wrap"${state.registrant ? " hidden" : ""}>
              <input type="text" class="address-form-input" id="cc-registrant-search" placeholder="${c.registrantSearch}" autocomplete="off" />
              <div class="filter-search-list pc-client-list" id="cc-registrant-list">${ccRegistrantListHtml("")}</div>
            </div>
            <div class="pc-client-chip" id="cc-registrant-chip"${state.registrant ? "" : " hidden"}>${state.registrant ? ccRegistrantChipHtml(state.registrant) : ""}</div>
          </div>
        </div>
        <div class="form-error" id="cc-error" hidden></div>
      `;
    }
    if (state.step === 2) {
      return `
        <label class="filters-field"><span class="filters-field-label">${c.name} *</span><input class="address-form-input" id="cc-name" value="${escapeAttr(state.name)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.registeredBusinessName}</span><input class="address-form-input" id="cc-regName" value="${escapeAttr(state.registeredBusinessName)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.tradingName}</span><input class="address-form-input" id="cc-tradingName" value="${escapeAttr(state.tradingName)}" /></label>
        <label class="filters-field">
          <span class="filters-field-label">${c.companyType}</span>
          <select class="address-form-input" id="cc-companyType">
            ${COMPANY_TYPE_NAMES.map((x) => `<option value="${x}"${state.companyTypeName === x ? " selected" : ""}>${x}</option>`).join("")}
          </select>
        </label>
        <label class="filters-field">
          <span class="filters-field-label">${c.country}</span>
          <select class="address-form-input" id="cc-country">
            <option value=""${!state.countryOfIncorporationId ? " selected" : ""}>—</option>
            ${COUNTRY_OPTIONS.map((x) => `<option value="${x.id}"${state.countryOfIncorporationId === x.id ? " selected" : ""}>${x.name}</option>`).join("")}
          </select>
        </label>
        <label class="filters-field"><span class="filters-field-label">${c.dateOfIncorporation}</span><input class="address-form-input" type="date" id="cc-dateOfIncorporation" value="${state.dateOfIncorporation}" /></label>
        <label class="filters-field">
          <span class="filters-field-label">${c.ownership}</span>
          <select class="address-form-input" id="cc-ownership">
            ${COMPANY_OWNERSHIP_STRUCTURES.map((x) => `<option value="${x}"${state.ownership === x ? " selected" : ""}>${c.ownershipOptions[x]}</option>`).join("")}
          </select>
        </label>
        <div class="form-error" id="cc-error" hidden></div>
      `;
    }
    if (state.step === 3) {
      return `
        <label class="filters-field"><span class="filters-field-label">${c.businessEmail}</span><input class="address-form-input" type="email" id="cc-businessEmail" value="${escapeAttr(state.businessEmail)}" placeholder="office@company.com" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.businessPhone}</span><input class="address-form-input" id="cc-businessPhone" value="${escapeAttr(state.businessPhone)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.website}</span><input class="address-form-input" id="cc-website" value="${escapeAttr(state.website)}" placeholder="https://" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.registrationNumber}</span><input class="address-form-input" id="cc-registrationNumber" value="${escapeAttr(state.registrationNumber)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.taxNumber}</span><input class="address-form-input" id="cc-taxNumber" value="${escapeAttr(state.taxNumber)}" /></label>
        <label class="filters-field">
          <span class="filters-field-label">${c.businessActivity}</span>
          <select class="address-form-input" id="cc-businessActivity">
            ${BUSINESS_ACTIVITY_CODES.map((x) => `<option value="${x.code}"${state.businessActivityCode === x.code ? " selected" : ""}>${x.code} — ${x.name}</option>`).join("")}
          </select>
        </label>
        <label class="filters-field">
          <span class="filters-field-label">${c.employees}</span>
          <select class="address-form-input" id="cc-employees">
            ${COMPANY_EMPLOYEE_BUCKETS.map((x) => `<option value="${x}"${state.employees === x ? " selected" : ""}>${x}</option>`).join("")}
          </select>
        </label>
        <div class="form-error" id="cc-error" hidden></div>
      `;
    }
    const country = findCountry(state.countryOfIncorporationId);
    const activity = BUSINESS_ACTIVITY_CODES.find((x) => x.code === state.businessActivityCode);
    return `
      <div class="profile-fields profile-fields-grid">
        ${detailField(c.registrant, state.registrant ? pdEscape(state.registrant.fullName || state.registrant.email) : "—")}
        ${detailField(c.name, pdEscape(state.name))}
        ${detailField(c.companyType, state.companyTypeName)}
        ${detailField(c.country, country ? country.name : "—")}
        ${detailField(c.businessEmail, state.businessEmail ? pdEscape(state.businessEmail) : "—")}
        ${detailField(c.businessActivity, activity ? `${activity.code} — ${activity.name}` : "—")}
      </div>
      <p class="table-cell-muted">${c.summaryHint}</p>
    `;
  }

  function footerHtmlFor() {
    const backBtn =
      state.step > 1
        ? `<button type="button" class="btn-secondary" id="cc-back">${c.back}</button>`
        : `<button type="button" class="btn-secondary" id="cc-cancel">${c.cancel}</button>`;
    const nextLabel = state.step === 4 ? c.create : c.next;
    return `${backBtn}<button type="button" class="btn-primary" id="cc-next">${nextLabel}</button>`;
  }

  function render(modalEl) {
    modalEl.querySelector(".modal-body").innerHTML = `${ccStepperHtml(state.step)}${stepBodyHtml()}`;
    modalEl.querySelector(".modal-footer").innerHTML = footerHtmlFor();
    bind(modalEl);
  }

  function readStep2(modalEl) {
    state.name = modalEl.querySelector("#cc-name").value.trim();
    state.registeredBusinessName = modalEl.querySelector("#cc-regName").value.trim();
    state.tradingName = modalEl.querySelector("#cc-tradingName").value.trim();
    state.companyTypeName = modalEl.querySelector("#cc-companyType").value;
    state.countryOfIncorporationId = modalEl.querySelector("#cc-country").value;
    state.dateOfIncorporation = modalEl.querySelector("#cc-dateOfIncorporation").value;
    state.ownership = modalEl.querySelector("#cc-ownership").value;
  }
  function readStep3(modalEl) {
    state.businessEmail = modalEl.querySelector("#cc-businessEmail").value.trim();
    state.businessPhone = modalEl.querySelector("#cc-businessPhone").value.trim();
    state.website = modalEl.querySelector("#cc-website").value.trim();
    state.registrationNumber = modalEl.querySelector("#cc-registrationNumber").value.trim();
    state.taxNumber = modalEl.querySelector("#cc-taxNumber").value.trim();
    state.businessActivityCode = modalEl.querySelector("#cc-businessActivity").value;
    state.employees = modalEl.querySelector("#cc-employees").value;
  }

  function bindRegistrantPicker(modalEl) {
    const searchInput = modalEl.querySelector("#cc-registrant-search");
    const listEl = modalEl.querySelector("#cc-registrant-list");
    if (!searchInput || !listEl) return;
    const bindPicks = () => {
      listEl.querySelectorAll("[data-cc-registrant-pick]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const user = CLIENTS_USERS_MOCK.find((u) => u.id === btn.dataset.ccRegistrantPick);
          if (!user) return;
          state.registrant = user;
          render(modalEl);
        });
      });
    };
    bindPicks();
    searchInput.addEventListener("input", () => {
      listEl.innerHTML = ccRegistrantListHtml(searchInput.value);
      bindPicks();
    });
    const chipEl = modalEl.querySelector("#cc-registrant-chip");
    const changeBtn = chipEl ? chipEl.querySelector("[data-cc-registrant-change]") : null;
    if (changeBtn) changeBtn.addEventListener("click", () => { state.registrant = null; render(modalEl); });
  }

  function bind(modalEl) {
    if (state.step === 1) bindRegistrantPicker(modalEl);
    const cancelBtn = modalEl.querySelector("#cc-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    const backBtn = modalEl.querySelector("#cc-back");
    if (backBtn)
      backBtn.addEventListener("click", () => {
        if (state.step === 2) readStep2(modalEl);
        if (state.step === 3) readStep3(modalEl);
        state.step -= 1;
        render(modalEl);
      });

    modalEl.querySelector("#cc-next").addEventListener("click", () => {
      const err = modalEl.querySelector("#cc-error");
      const fail = (msg) => {
        err.textContent = msg;
        err.hidden = false;
      };

      if (state.step === 1) {
        if (!state.registrant) return fail(c.errRegistrant);
        state.step = 2;
        render(modalEl);
        return;
      }
      if (state.step === 2) {
        readStep2(modalEl);
        if (!state.name) return fail(c.errName);
        state.step = 3;
        render(modalEl);
        return;
      }
      if (state.step === 3) {
        readStep3(modalEl);
        state.step = 4;
        render(modalEl);
        return;
      }

      // Создание — тот же формат id/code, что у остальных записей мока (seedToUuid/entityCode, mock/clients-companies.mock.js)
      companyCreateSeq += 1;
      const seed = companyCreateSeq;
      const now = pdNow();
      const activity = BUSINESS_ACTIVITY_CODES.find((x) => x.code === state.businessActivityCode);
      const newCompany = {
        id: seedToUuid(seed),
        code: entityCode("CMP", seed),
        createdDate: now, updatedDate: now, createdAt: formatCompanyDateTime(now), updatedAt: formatCompanyDateTime(now),
        service: COMPANY_SERVICE_OPTIONS[0],
        name: state.name,
        registeredBusinessName: state.registeredBusinessName || null,
        tradingName: state.tradingName || null,
        type: null,
        countryOfIncorporationId: state.countryOfIncorporationId || null,
        companyTypeName: state.companyTypeName,
        companyOwnershipStructure: state.ownership,
        businessActivities: activity ? [activity] : [],
        registrationNumber: state.registrationNumber || null,
        businessEmail: state.businessEmail || null,
        businessPhone: state.businessPhone || null,
        website: state.website || null,
        faxNumber: null,
        taxNumber: state.taxNumber || null,
        dateOfIncorporation: state.dateOfIncorporation ? new Date(state.dateOfIncorporation) : null,
        dateOfIncorporationLabel: state.dateOfIncorporation ? formatBirthDateCompanies(new Date(state.dateOfIncorporation)) : null,
        totalNumberOfEmployees: state.employees,
        paidUpShareCapital: null,
        annualTurnover: null,
        sourceOfWealth: [],
        sourceOfFundsV2: [],
        detailsSourceOfWealth: [],
        incomingPaymentsByCountries: [],
        outgoingPaymentsByCountries: [],
        documents: [],
        addresses: [],
        additionalInfos: [],
        kybLevel: null,
        kybConfigName: null,
        kybLevelStatuses: [],
        kybStepStatuses: [],
        verificationChecks: [],
        currentKYBLevelStatusV2: null,
        scoringRiskLevel: null,
        blockReasons: null,
        members: [{ id: state.registrant.id, name: state.registrant.fullName || state.registrant.email, kycStatus: state.registrant.kycStatus, kycLevel: state.registrant.kycLevel }],
        registrant: { id: state.registrant.id, name: state.registrant.fullName || state.registrant.email },
      };
      CLIENTS_COMPANIES_MOCK.unshift(newCompany);
      if (!state.registrant.linkedCompanies.some((l) => l.id === newCompany.id)) {
        state.registrant.linkedCompanies.unshift({ id: newCompany.id, name: newCompany.name, kybStatus: null, scoringRiskLevel: null });
      }
      closeModal();
      showToast(c.done);
      window.location.hash = `#/clients-companies/${newCompany.id}`;
    });
  }

  openModal({
    title: c.title,
    width: 560,
    bodyHtml: `${ccStepperHtml(1)}${stepBodyHtml()}`,
    footerHtml: footerHtmlFor(),
    onMount: (modalEl) => bind(modalEl),
  });
}

// ---- Карточка компании — тот же стиль и те же переиспользуемые кирпичи, что
// и у карточки пользователя (clients-users.js: flatSection/sectionCard/степпер/
// карточка "Проверки"/createAccessList-списки Счетов, Операций, Тарифа — вкладки
// "Счета"/"Операции"/"Тариф" переиспользуются 1-в-1, функции там уже общие по
// id клиента, не завязаны конкретно на пользователя). Поля основной вкладки и
// вкладки KYB сверены с реальным запросом `company` (получен от пользователя
// 23.09.2026) — детали по каждому новому полю см. в комментариях мок-файла.
const COMPANY_DETAIL_SUB_TABS = ["main", "kyb", "accounts", "operations", "tariff", "security", "auditLog"];

const CO_TAB_ICONS = {
  main: CD_TAB_ICONS.main,
  kyb: CD_TAB_ICONS.kycLevels,
  accounts: CD_TAB_ICONS.accounts,
  operations: CD_TAB_ICONS.operations,
  tariff: CD_TAB_ICONS.tariff,
  security: CD_TAB_ICONS.security,
  auditLog: CD_TAB_ICONS.auditLog,
};

// Сбрасывается при каждом открытии карточки (см. initCompanyDetailView) — заходим
// всегда на "Основное".
const companyDetailState = { subTab: "main" };

function currentCompanyId() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const m = hash.match(/^clients-companies\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function companyAdditionalInfo(company, key) {
  const rec = (company.additionalInfos || []).find((a) => a.key === key);
  return rec ? rec.value : null;
}

// ---- Заголовок карточки — тот же паттерн, что и у пользователя (client-detail-header):
// название + статус блокировки, ниже ID с копированием.
function renderCompanyDetailHeader(company) {
  const cod = t("companyDetail");
  const isBlocked = !!(company.blockReasons && company.blockReasons.length);

  return `
    <div class="card client-detail-header cd-hero">
      <button type="button" class="client-detail-back" id="cd-company-back" title="${cod.backToList}">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg>
      </button>
      ${cdAvatar(company.name)}
      <div class="client-detail-header-main">
        <div class="client-detail-title-row">
          <span class="page-title">${company.name}</span>
          <span class="badge ${isBlocked ? "badge-danger" : "badge-success"}">${isBlocked ? cod.blocked : cod.active}</span>
        </div>
        <div class="client-detail-subtitle">
          <span class="inline-copy">ID: ${company.code}${copyIconButton(company.code)}</span>
          ${company.registrationNumber ? `<span class="client-detail-subtitle-sep">·</span><span class="inline-copy">${cod.headerRegNumber}: ${company.registrationNumber}${copyIconButton(company.registrationNumber)}</span>` : ""}
          <span class="client-detail-subtitle-sep">·</span><span>${cod.headerCreated}: ${company.createdAt}</span>
        </div>
        ${renderClientHeroPills(company, "company")}
      </div>
      ${renderClientHeaderMenu(company, "company")}
    </div>
  `;
}

// ---- Боковая карточка "Участники компании" — реальный запрос `company` списка
// участников не отдаёт вовсе (только registrant{id}), поэтому строим то же
// ребро user↔company, что уже есть на карточке пользователя (linkedCompanies),
// просто в обратную сторону — см. подробный комментарий в мок-файле.
function renderCompanyMembersCard(company) {
  const cod = t("companyDetail");
  const members = company.members || [];

  const content = members.length
    ? `<div class="linked-companies-list">
        ${members
          .map(
            (m) => `
              <div class="linked-company-row">
                <span class="linked-company-icon">${ICONS.user}</span>
                <div class="linked-company-info">
                  <button type="button" class="table-link linked-company-name" data-member-id="${m.id}">${pdEscape(m.name)}</button>
                  <div class="linked-company-badges">
                    ${m.id === company.registrant.id ? `<span class="badge badge-neutral">${cod.registrantTag}</span>` : ""}
                    ${m.kycStatus ? `<span class="badge ${statusBadgeClass(m.kycStatus)}">${kycStatusLabel(m.kycStatus)}</span>` : ""}
                  </div>
                </div>
              </div>
            `
          )
          .join("")}
      </div>`
    : `<div class="table-cell-muted">${cod.noMembers}</div>`;

  return sectionCard(cod.sections.members, content);
}

// ---- Боковая карточка "KYB" на "Основном" — тот же паттерн, что и renderKycStatusCard
// у пользователя (краткая сводка: бейдж статуса + точки по уровню), подробности
// (шаги, конфигурация, проверки, изменение статуса) — только на вкладке KYB.
function renderCompanyKybStatusCard(company) {
  const cod = t("companyDetail");
  if (company.kybLevel == null) return "";

  const dots = [1, 2, 3].map((lvl) => `<span class="profile-kyc-dot${lvl <= company.kybLevel ? " is-filled" : ""}"></span>`).join("");
  const status = company.currentKYBLevelStatusV2 ? company.currentKYBLevelStatusV2.status : null;

  return `
    <div class="card profile-kyc-card">
      <div class="profile-kyc-card-head">
        <span class="detail-section-title">${cod.sections.kyb}</span>
        <span class="profile-kyc-updated">${cod.kybUpdatedLabel} ${company.updatedAt}</span>
      </div>
      ${status ? `<span class="badge ${statusBadgeClass(status)}">${kybStatusLabel(status)}</span>` : ""}
      <div class="profile-kyc-level">
        <span class="profile-kyc-dots">${dots}</span>
        <span>${KYB_CONFIG_NAMES[company.kybLevel - 1]}</span>
      </div>
    </div>
  `;
}

function formatCompanyMoney(m) {
  if (!m) return "—";
  return `${Number(m.amount).toLocaleString("ru-RU")} ${m.currency.ticker}`;
}

// Карточка "Годовой оборот"/"Оплаченный уставный капитал"/строка detailsSourceOfWealth —
// копируемая (клик по значению копирует "84 125 EUR"), тот же .copy-target/.copied-flag
// паттерн, что и у обычных полей (copyableField), просто своя вёрстка карточки.
function financeCard(label, m) {
  if (!m) return `<div class="finance-card"><span class="finance-card-label">${label}</span><span class="finance-card-value">—</span></div>`;
  const raw = `${m.amount} ${m.currency.ticker}`;
  const display = formatCompanyMoney(m);
  return `
    <div class="finance-card">
      <span class="finance-card-label">${label}</span>
      <span class="finance-card-value-wrap copy-target" data-copy-text="${escapeAttr(raw)}">
        <span class="finance-card-icon">${pdEscape(m.currency.symbol || m.currency.ticker[0])}</span>
        <span class="profile-field-value finance-card-value">${display}</span>
        <span class="copied-flag">✓ ${t("clientsUsers.copied")}</span>
      </span>
    </div>
  `;
}

// ---- Входящие/исходящие платежи по странам (incomingPaymentsByCountries/
// outgoingPaymentsByCountries) — реальные поля, подтверждены пасенным запросом
// `company` (businessActivity{item{code,name}}, country{item{name}}, percentage).
// "Total: N lines" — литерально нетранслируемая строка из реального экрана
// (взято с эталонного скриншота 23.09.2026, а не придумано).
function paymentDirectionField(company, direction) {
  return direction === "incoming" ? company.incomingPaymentsByCountries : company.outgoingPaymentsByCountries;
}

function paymentRowHtml(row, idx, direction) {
  const cod = t("companyDetail");
  return `
    <tr>
      <td>${countryValue(row.countryId)}</td>
      <td>${row.percentage}%</td>
      <td>${pdEscape(row.businessActivity.code)}: ${pdEscape(row.businessActivity.name)}</td>
      <td><button type="button" class="icon-btn icon-btn-danger" data-payment-delete="${direction}:${idx}" title="${cod.deletePaymentRow}">${TRASH_ICON_SVG}</button></td>
    </tr>
  `;
}

function renderPaymentsByCountryBlock(company, direction) {
  const cod = t("companyDetail");
  const rows = paymentDirectionField(company, direction);
  const title = direction === "incoming" ? cod.paymentsIncomingTitle : cod.paymentsOutgoingTitle;
  const desc = direction === "incoming" ? cod.paymentsIncomingDesc : cod.paymentsOutgoingDesc;
  const cols = cod.paymentColumns;

  const tableHtml = rows.length
    ? `<div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>${cols.country}</th><th>${cols.percentage}</th><th>${cols.businessActivity}</th><th></th></tr></thead>
          <tbody>${rows.map((r, i) => paymentRowHtml(r, i, direction)).join("")}</tbody>
        </table>
      </div>
      <div class="table-footer-total">Total: ${rows.length} lines</div>`
    : "";

  return `
    <div class="acc-list-block">
      <div class="acc-list-heading">${title}</div>
      <div class="profile-flat-section-desc">${desc}</div>
      <button type="button" class="profile-flat-edit" data-payment-add="${direction}">${PLUS_ICON_SVG}<span>${cod.addPaymentRow}</span></button>
      ${tableHtml}
    </div>
  `;
}

function openAddPaymentRowModal(company, direction) {
  const cod = t("companyDetail");

  const bodyHtml = `
    <label class="filters-field">
      <span class="filters-field-label">${cod.paymentColumns.country} *</span>
      <select class="address-form-input" id="co-payment-country">
        <option value="">—</option>
        ${COUNTRY_OPTIONS.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cod.paymentColumns.percentage} *</span>
      <input class="address-form-input" type="number" min="1" max="100" id="co-payment-percentage" placeholder="0–100" />
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cod.businessActivityIdLabel} *</span>
      <select class="address-form-input" id="co-payment-activity">
        <option value="">—</option>
        ${BUSINESS_ACTIVITY_CODES.map((a) => `<option value="${a.code}">${a.code}: ${a.name}</option>`).join("")}
      </select>
    </label>
    <div class="form-error" id="co-payment-error" hidden></div>
  `;

  openModal({
    title: direction === "incoming" ? cod.addPaymentRowTitleIncoming : cod.addPaymentRowTitleOutgoing,
    width: 480,
    bodyHtml,
    footerHtml: `
      <button type="button" class="btn-secondary" id="co-payment-cancel">${cod.cancel}</button>
      <button type="button" class="btn-primary" id="co-payment-save">${cod.addPaymentRow}</button>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector("#co-payment-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#co-payment-save").addEventListener("click", () => {
        const err = modalEl.querySelector("#co-payment-error");
        const countryId = modalEl.querySelector("#co-payment-country").value;
        const activityCode = modalEl.querySelector("#co-payment-activity").value;
        const percentage = Number(modalEl.querySelector("#co-payment-percentage").value);

        if (!countryId) {
          err.textContent = cod.errCountryRequired;
          err.hidden = false;
          return;
        }
        if (!activityCode) {
          err.textContent = cod.errBusinessActivityRequired;
          err.hidden = false;
          return;
        }
        if (!percentage || percentage < 1 || percentage > 100) {
          err.textContent = cod.errPercentageRequired;
          err.hidden = false;
          return;
        }

        const activity = BUSINESS_ACTIVITY_CODES.find((a) => a.code === activityCode);
        paymentDirectionField(company, direction).push({ countryId, businessActivity: activity, percentage });
        closeModal();
        updateCompanyDetailView(company);
      });
    },
  });
}

function confirmDeletePaymentRow(company, direction, idx) {
  const cod = t("companyDetail");
  openConfirmModal({
    title: cod.deletePaymentRow,
    text: cod.deletePaymentRowConfirm,
    confirmLabel: cod.deletePaymentRow,
    cancelLabel: cod.cancel,
    danger: true,
    onConfirm: () => {
      paymentDirectionField(company, direction).splice(idx, 1);
      updateCompanyDetailView(company);
    },
  });
}

function attachPaymentsByCountryHandlers(company) {
  document.querySelectorAll("[data-payment-add]").forEach((btn) => {
    btn.addEventListener("click", () => openAddPaymentRowModal(company, btn.dataset.paymentAdd));
  });
  document.querySelectorAll("[data-payment-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [direction, idx] = btn.dataset.paymentDelete.split(":");
      confirmDeletePaymentRow(company, direction, Number(idx));
    });
  });
}

// ---- Вкладка "Основное" — flat-секции в том же стиле, что и у пользователя
// (flatSection: заголовок + подпись, без карточек-боксов). taxNumber/website/
// faxNumber/dateOfIncorporation — реальные плоские поля Company (подтверждены
// чтением company-info.type.ts/common-company.entity.ts 23.09.2026); paidUpShareCapital/
// annualTurnover/totalNumberOfEmployees вынесены в отдельную секцию "Финансовые
// показатели" — тот же источник, там же подтверждена форма FinancialAmountType.
function renderCompanyDetailMainTab(company) {
  const cod = t("companyDetail");
  const f = cod.fields;

  const activityBadges = (company.businessActivities || [])
    .map((a) => `<span class="badge badge-neutral has-tooltip" data-tooltip="${escapeAttr(a.name)}">${pdEscape(a.code)}</span>`)
    .join(" ");

  const generalSection = flatSection(
    cod.sections.general,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(f.countryOfIncorporation, countryName(company.countryOfIncorporationId), countryValue(company.countryOfIncorporationId))}
      ${copyableField(f.companyType, company.companyTypeName)}
      ${copyableField(f.registeredBusinessName, company.registeredBusinessName)}
      ${copyableField(f.ownershipStructure, cod.ownershipStructure[company.companyOwnershipStructure] || company.companyOwnershipStructure)}
      ${copyableField(f.businessActivities, (company.businessActivities || []).map((a) => a.code).join(", "), activityBadges || "—")}
      ${copyableField(f.registrationNumber, company.registrationNumber)}
      ${copyableField(f.taxNumber, company.taxNumber)}
      ${copyableField(f.dateOfIncorporation, company.dateOfIncorporation ? company.dateOfIncorporationLabel : null)}
      ${company.website ? copyableField(f.website, company.website, `<a class="table-link" href="${escapeAttr(company.website)}" target="_blank" rel="noopener">${pdEscape(company.website)}</a>`) : detailField(f.website, "—")}
      ${copyableField(f.faxNumber, company.faxNumber)}
    </div>`,
    null,
    cod.sectionDesc.general
  );

  // Карточки: оборот + капитал всегда, плюс по одной карточке на каждую запись
  // detailsSourceOfWealth (реальное поле — разбивка суммы по конкретному источнику
  // богатства, подтверждено пасенным запросом `company`).
  const sourceOfWealthCards = (company.detailsSourceOfWealth || [])
    .map((d) => financeCard(cod.sourceOfWealthValues[d.sourceOfWealth] || d.sourceOfWealth, { amount: d.amount, currency: d.currency }))
    .join("");

  const sourceOfWealthText = (company.sourceOfWealth || []).map((k) => cod.sourceOfWealthValues[k] || k).join(", ") || "—";
  const sourceOfFundsText = (company.sourceOfFundsV2 || []).map((s) => cod.sourceOfFundsValues[s.key] || s.key).join(", ") || "—";

  const financeSection = flatSection(
    cod.sections.finance,
    `<div class="finance-cards">
      ${financeCard(f.annualTurnover, company.annualTurnover)}
      ${financeCard(f.paidUpShareCapital, company.paidUpShareCapital)}
      ${sourceOfWealthCards}
    </div>
    <div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(f.totalNumberOfEmployees, company.totalNumberOfEmployees)}
      ${copyableField(cod.sourceOfWealthLabel, sourceOfWealthText !== "—" ? sourceOfWealthText : null)}
      ${copyableField(cod.sourceOfFundsLabel, sourceOfFundsText !== "—" ? sourceOfFundsText : null)}
    </div>`,
    null,
    cod.sectionDesc.finance
  );

  const contactsSection = flatSection(
    cod.sections.contacts,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(f.email, company.businessEmail)}
      ${copyableField(f.tradingName, company.tradingName)}
    </div>`,
    null,
    cod.sectionDesc.contacts
  );

  const additionalSection = flatSection(
    cod.sections.additional,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(f.onboardingStep, companyAdditionalInfo(company, "companyOnboardingStep"))}
      ${copyableField(f.branchesWithinCountry, companyAdditionalInfo(company, "companyBranchesWithinCountry"))}
      ${copyableField(f.branchesOutsideCountry, companyAdditionalInfo(company, "companyBranchesOutsideCountry"))}
    </div>`,
    null,
    cod.sectionDesc.additional
  );

  const systemSection = flatSection(
    cod.sections.system,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(f.service, company.service)}
      ${copyableField(f.createdAt, company.createdAt)}
      ${copyableField(f.updatedAt, company.updatedAt)}
    </div>`,
    null,
    cod.sectionDesc.system
  );

  return `
    <div class="client-detail-grid">
      <div class="client-detail-grid-main">
        <div class="profile-flat-block">
          ${generalSection}
          ${financeSection}
          ${contactsSection}
          ${additionalSection}
          ${systemSection}
        </div>
        ${renderPaymentsByCountryBlock(company, "incoming")}
        ${renderPaymentsByCountryBlock(company, "outgoing")}
      </div>
      <div class="client-detail-grid-side">
        ${renderTotalBalanceCard(company, "company")}
        ${renderCompanyKybStatusCard(company)}
        ${renderCompanyMembersCard(company)}
      </div>
    </div>
  `;
}

// ---- Степпер (переиспользует ту же визуальную "кирпичную" разметку .kyc-stepper,
// что и у уровней KYC пользователя) — здесь используется дважды: для уровней KYB
// (1→2→3) и для шагов ВНУТРИ текущего уровня (SCREENING→ADMIN→OPEN_ACCOUNT и т.п.),
// поэтому вынесен в общую функцию, принимающую готовый список узлов.
function renderGenericStepper(nodes) {
  const nodesHtml = nodes
    .map((n, idx) => {
      const nodeClass = n.done ? "is-done" : n.current ? "is-current" : "is-pending";
      return `
        <div class="kyc-stepper-item">
          <div class="kyc-stepper-circle ${nodeClass}">${n.done ? CHECK_ICON_SVG : `<span>${idx + 1}</span>`}</div>
          ${idx < nodes.length - 1 ? `<div class="kyc-stepper-line${n.done ? " is-done" : ""}"></div>` : ""}
          <div class="kyc-stepper-label">
            <div class="kyc-stepper-title">${n.titleHtml}</div>
            ${n.status ? `<span class="badge ${statusBadgeClass(n.status)}">${kybStatusLabel(n.status)}</span>` : `<span class="table-cell-muted">—</span>`}
          </div>
        </div>
      `;
    })
    .join("");
  return `<div class="kyc-stepper">${nodesHtml}</div>`;
}

function renderKybLevelStepper(company) {
  if (company.kybLevel == null) return `<div class="table-cell-muted">${t("companyDetail").noKyb}</div>`;

  const nodes = [1, 2, 3].map((lvl) => {
    const entry = company.kybLevelStatuses.find((l) => l.level === lvl);
    const isDone = entry && entry.status === "SUCCESSFUL";
    const isCurrent = company.kybLevel === lvl;
    return {
      done: isDone,
      current: isCurrent,
      status: entry ? entry.status : null,
      // Конфигурация — настоящая ссылка (в отличие от статичного текста у
      // пользователя): страницы конфигураций уровней в "Настройки → KYC" одна
      // на все уровни (списком, без отдельного адреса на конкретный уровень) —
      // ведём туда, честнее, чем никуда.
      titleHtml: isCurrent ? `<a class="table-link" href="#/settings-verif-kyc">${KYB_CONFIG_NAMES[lvl - 1]}</a>` : `KYB L${lvl}`,
    };
  });

  return renderGenericStepper(nodes);
}

function renderKybStepsStepper(company) {
  const steps = company.kybStepStatuses || [];
  if (!steps.length) return `<div class="table-cell-muted">${t("companyDetail").noKybSteps}</div>`;

  const nodes = steps.map((s) => ({
    done: s.status === "SUCCESSFUL",
    current: s.status !== "SUCCESSFUL" && s.status !== "NOT_CONNECTED",
    status: s.status,
    titleHtml: s.name,
  }));

  return renderGenericStepper(nodes);
}

// ---- Адреса компании — тот же Address/AddressClientUnion (Company | User), что и
// у пользователя (apps/addresses/src/address, company.addresses — реальное
// resolveField в companies.resolver.ts), но со своими категориями (REGISTERED/
// OPERATIONAL — реальные строки из companyAddressesRequiredCategories, см. мок) —
// поэтому логику формы/списка не переиспользуем 1-в-1 из clients-users.js
// (там ADDRESS_CATEGORIES = birth_place/residential), а зеркалим отдельно.
function companyAddressRowHtml(addr, idx) {
  const cod = t("companyDetail");
  return `
    <div class="address-row">
      <div class="address-row-head">
        <span class="address-row-category">${cod.addressCategory[addr.category] || addr.category}</span>
        ${rowKebabMenu(`co-addr-${idx}`, [
          { label: cod.editAddress, icon: EDIT_ICON_SVG, attrs: `data-co-address-edit="${idx}"` },
          { label: cod.deleteAddress, icon: TRASH_ICON_SVG, attrs: `data-co-address-delete="${idx}"`, danger: true },
        ])}
      </div>
      <div class="address-row-value">
        <span class="address-row-icon">${KYC_STEPPER_ICON_PIN}</span>
        ${countryValue(addr.countryId)}${addr.city ? `, ${addr.city}` : ""}${addr.street ? `, ${addr.street}` : ""}${addr.postalCode ? `, ${addr.postalCode}` : ""}
      </div>
    </div>
  `;
}

function companyAddressFormBodyHtml(addr) {
  const cod = t("companyDetail");
  return `
    <div class="address-form-grid">
      <label class="filters-field">
        <span class="filters-field-label">${cod.category}</span>
        <select class="address-form-input" data-field="category">
          ${COMPANY_ADDRESS_CATEGORIES.map((c) => `<option value="${c}"${addr.category === c ? " selected" : ""}>${cod.addressCategory[c]}</option>`).join("")}
        </select>
      </label>
      <label class="filters-field">
        <span class="filters-field-label">${cod.country}</span>
        <select class="address-form-input" data-field="countryId">
          <option value=""${!addr.countryId ? " selected" : ""}>—</option>
          ${COUNTRY_OPTIONS.map((c) => `<option value="${c.id}"${addr.countryId === c.id ? " selected" : ""}>${c.name}</option>`).join("")}
        </select>
      </label>
      <label class="filters-field">
        <span class="filters-field-label">${cod.city}</span>
        <input class="address-form-input" type="text" data-field="city" value="${escapeAttr(addr.city || "")}" />
      </label>
      <label class="filters-field">
        <span class="filters-field-label">${cod.street}</span>
        <input class="address-form-input" type="text" data-field="street" value="${escapeAttr(addr.street || "")}" />
      </label>
      <label class="filters-field">
        <span class="filters-field-label">${cod.postalCode}</span>
        <input class="address-form-input" type="text" data-field="postalCode" value="${escapeAttr(addr.postalCode || "")}" />
      </label>
    </div>
  `;
}

function openCompanyAddressModal(company, index) {
  const cod = t("companyDetail");
  const addr = index != null ? company.addresses[index] : { category: "OPERATIONAL", countryId: "", city: "", street: "", postalCode: "" };

  openModal({
    title: index != null ? cod.editAddress : cod.addAddress,
    width: 480,
    bodyHtml: companyAddressFormBodyHtml(addr),
    footerHtml: `
      <button type="button" class="btn-secondary" id="co-address-cancel">${cod.cancel}</button>
      <button type="button" class="btn-primary" id="co-address-save">${cod.save}</button>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector("#co-address-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#co-address-save").addEventListener("click", () => {
        const getVal = (field) => modalEl.querySelector(`[data-field="${field}"]`).value;
        const newAddr = {
          category: getVal("category"),
          countryId: getVal("countryId") || null,
          city: getVal("city") || null,
          street: getVal("street") || null,
          postalCode: getVal("postalCode") || null,
        };
        if (index == null) company.addresses.push(newAddr);
        else company.addresses[index] = newAddr;
        closeModal();
        updateCompanyDetailView(company);
      });
    },
  });
}

function confirmDeleteCompanyAddress(company, index) {
  const cod = t("companyDetail");
  openConfirmModal({
    title: cod.deleteAddress,
    text: cod.deleteAddressConfirm,
    confirmLabel: cod.deleteAddress,
    cancelLabel: cod.cancel,
    danger: true,
    onConfirm: () => {
      company.addresses.splice(index, 1);
      updateCompanyDetailView(company);
    },
  });
}

function renderCompanyAddressesCard(company) {
  const cod = t("companyDetail");
  const bodyHtml = company.addresses.length
    ? company.addresses.map((a, i) => companyAddressRowHtml(a, i)).join("")
    : `<div class="table-cell-muted">${cod.noAddresses}</div>`;

  return `
    <div class="profile-flat-section">
      <div class="profile-flat-section-head">
        <span class="detail-section-title">${cod.sections.addresses}</span>
        <button type="button" class="profile-flat-edit" id="co-address-add">${PLUS_ICON_SVG}<span>${cod.addAddress}</span></button>
      </div>
      <div class="profile-flat-section-desc">${cod.sectionDesc.addresses}</div>
      ${bodyHtml}
    </div>
  `;
}

function attachCompanyAddressHandlers(company) {
  const addBtn = document.getElementById("co-address-add");
  if (addBtn) addBtn.addEventListener("click", () => openCompanyAddressModal(company, null));

  document.querySelectorAll("[data-co-address-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openCompanyAddressModal(company, Number(btn.dataset.coAddressEdit)));
  });

  document.querySelectorAll("[data-co-address-delete]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteCompanyAddress(company, Number(btn.dataset.coAddressDelete)));
  });
}

// ---- Документы компании — та же сущность DocumentType, что и у пользователя
// (apps/identity/src/documents, clientType=CORPORATE вместо INDIVIDUAL — см.
// комментарий у COMPANY_DOCUMENT_CONFIGS в мок-файле), status/isActive/rejectTags —
// один в один, поэтому редактирование зеркалит openDocumentEditModal у
// пользователя. Добавление — упрощённая одношаговая форма вместо 3-шагового
// визарда (тип → файлы → детали) у пользователя: те же поля в итоге сохраняются
// (config/status/isActive/файлы), просто без пошагового UI — экономия кода без
// потери сути.
function companyDocumentStatusInfo(doc) {
  const cod = t("companyDetail");
  const cls = doc.status === "APPROVED" ? "badge-success" : doc.status === "NOT_REVIEWED" ? "badge-warning" : "badge-danger";
  return { label: cod.documentStatus[doc.status], cls };
}

function renderCompanyDocumentsCard(company) {
  const cod = t("companyDetail");

  const bodyHtml = company.documents.length
    ? `<div class="documents-list">
        ${company.documents
          .map((d) => {
            const info = companyDocumentStatusInfo(d);
            const fileSummary = d.files.length === 1 ? d.files[0].originalName : `${d.files.length} ${cod.filesLabel}`;
            return `
              <div class="document-row">
                <span class="document-row-icon">${DOCUMENT_ICON_SVG}</span>
                <div class="document-row-info">
                  <span class="document-row-name">${d.config.name}${!d.isActive ? `<span class="badge badge-neutral document-row-inactive">${cod.documentInactiveLabel}</span>` : ""}</span>
                  <span class="document-row-file">${fileSummary}</span>
                </div>
                <span class="badge ${info.cls}">${info.label}</span>
                ${rowKebabMenu(`co-doc-${d.id}`, [{ label: cod.documentEdit, icon: EDIT_ICON_SVG, attrs: `data-co-doc-edit="${d.id}"` }])}
              </div>
            `;
          })
          .join("")}
      </div>`
    : `<div class="table-cell-muted">${cod.noDocuments}</div>`;

  return `
    <div class="profile-flat-section">
      <div class="profile-flat-section-head">
        <span class="detail-section-title">${cod.sections.documents}</span>
        <button type="button" class="profile-flat-edit" id="co-document-add">${PLUS_ICON_SVG}<span>${cod.addDocument}</span></button>
      </div>
      <div class="profile-flat-section-desc">${cod.sectionDesc.documents}</div>
      ${bodyHtml}
    </div>
  `;
}

function openCompanyDocumentEditModal(company, doc) {
  const cod = t("companyDetail");
  let workingFiles = doc.files.map((f) => ({ ...f }));

  const bodyHtml = `
    <div class="doc-edit-top">
      <label class="switch"><input type="checkbox" id="co-doc-active" ${doc.isActive ? "checked" : ""} /><span class="switch-track"><span class="switch-thumb"></span></span></label>
      <span class="doc-edit-active-label">${cod.documentActiveLabel}</span>
    </div>
    <div class="doc-edit-meta">
      <span>${cod.fields.createdAt}: ${formatDateTime(doc.createdAt)}</span>
      <span class="doc-edit-meta-sep">·</span>
      <span>${cod.fields.updatedAt}: ${formatDateTime(doc.updatedAt)}</span>
    </div>
    <label class="filters-field">
      <span class="filters-field-label">${cod.documentStatusLabel} *</span>
      <select class="address-form-input" id="co-doc-status">
        ${DOCUMENT_STATUSES.map((s) => `<option value="${s}"${doc.status === s ? " selected" : ""}>${cod.documentStatus[s]}</option>`).join("")}
      </select>
    </label>
    <div class="filters-field">
      <span class="filters-field-label">${cod.rejectTagsLabel}</span>
      <div class="doc-reject-tags" id="co-doc-tags">
        ${DOCUMENT_REJECT_TAGS.map(
          (tag) => `
          <label class="doc-reject-tag">
            <input type="checkbox" value="${escapeAttr(tag)}"${doc.rejectTags.includes(tag) ? " checked" : ""} />
            <span>${tag}</span>
          </label>`
        ).join("")}
      </div>
    </div>
    <label class="filters-field">
      <span class="filters-field-label">${cod.additionalReasonsLabel}</span>
      <textarea class="form-textarea" id="co-doc-reasons" rows="2">${pdEscape(doc.externalRejectReasons || "")}</textarea>
    </label>
    <div class="filters-field">
      <span class="filters-field-label">${cod.attachFilesLabel} *</span>
      <div class="doc-files-list" id="co-doc-files">${workingFiles.map((f, i) => documentFileRowHtml(f, i)).join("")}</div>
      <button type="button" class="doc-upload-zone" id="co-doc-upload">
        ${PLUS_ICON_SVG}<span>${cod.uploadFile}</span><span class="doc-upload-hint">${cod.uploadHint}</span>
      </button>
    </div>
  `;

  openModal({
    title: doc.config.name,
    width: 560,
    bodyHtml,
    footerHtml: `
      <button type="button" class="btn-secondary" id="co-doc-edit-cancel">${cod.cancel}</button>
      <button type="button" class="btn-primary" id="co-doc-edit-save">${cod.save}</button>
    `,
    onMount: (modalEl) => {
      const filesWrap = modalEl.querySelector("#co-doc-files");

      const bindFileRemove = () => {
        filesWrap.querySelectorAll("[data-file-remove]").forEach((btn) => {
          btn.addEventListener("click", () => {
            workingFiles.splice(Number(btn.dataset.fileRemove), 1);
            renderFiles();
          });
        });
      };
      const renderFiles = () => {
        filesWrap.innerHTML = workingFiles.map((f, i) => documentFileRowHtml(f, i)).join("");
        bindFileRemove();
      };
      bindFileRemove();

      modalEl.querySelector("#co-doc-upload").addEventListener("click", () => {
        const newId = `${doc.id}-new${workingFiles.length + 1}-${Date.now()}`;
        workingFiles.push({
          id: newId,
          url: `https://picsum.photos/seed/${newId}/480/320`,
          mimetype: "image/png",
          originalName: `upload_${workingFiles.length + 1}.png`,
          size: String(150000 + Math.round(Math.random() * 200000)),
        });
        renderFiles();
      });

      modalEl.querySelector("#co-doc-edit-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#co-doc-edit-save").addEventListener("click", () => {
        doc.isActive = modalEl.querySelector("#co-doc-active").checked;
        doc.status = modalEl.querySelector("#co-doc-status").value;
        doc.rejectTags = Array.from(modalEl.querySelectorAll("#co-doc-tags input:checked")).map((el) => el.value);
        doc.externalRejectReasons = modalEl.querySelector("#co-doc-reasons").value.trim() || null;
        doc.files = workingFiles;
        doc.updatedAt = new Date();
        closeModal();
        updateCompanyDetailView(company);
      });
    },
  });
}

function openCompanyDocumentAddModal(company) {
  const cod = t("companyDetail");
  let workingFiles = [];

  const bodyHtml = `
    <label class="filters-field">
      <span class="filters-field-label">${cod.documentTypeLabel} *</span>
      <select class="address-form-input" id="co-doc-config">
        ${COMPANY_DOCUMENT_CONFIGS.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cod.documentStatusLabel}</span>
      <select class="address-form-input" id="co-doc-add-status">
        ${DOCUMENT_STATUSES.map((s) => `<option value="${s}">${cod.documentStatus[s]}</option>`).join("")}
      </select>
    </label>
    <div class="doc-edit-top">
      <label class="switch"><input type="checkbox" id="co-doc-add-active" checked /><span class="switch-track"><span class="switch-thumb"></span></span></label>
      <span class="doc-edit-active-label">${cod.documentActiveLabel}</span>
    </div>
    <div class="filters-field">
      <span class="filters-field-label">${cod.attachFilesLabel} *</span>
      <div class="doc-files-list" id="co-doc-add-files"></div>
      <button type="button" class="doc-upload-zone" id="co-doc-add-upload">
        ${PLUS_ICON_SVG}<span>${cod.uploadFile}</span><span class="doc-upload-hint">${cod.uploadHint}</span>
      </button>
    </div>
    <div class="form-error" id="co-doc-add-error" hidden></div>
  `;

  openModal({
    title: cod.addDocumentTitle,
    width: 480,
    bodyHtml,
    footerHtml: `
      <button type="button" class="btn-secondary" id="co-doc-add-cancel">${cod.cancel}</button>
      <button type="button" class="btn-primary" id="co-doc-add-save">${cod.save}</button>
    `,
    onMount: (modalEl) => {
      const filesWrap = modalEl.querySelector("#co-doc-add-files");

      const bindFileRemove = () => {
        filesWrap.querySelectorAll("[data-file-remove]").forEach((btn) => {
          btn.addEventListener("click", () => {
            workingFiles.splice(Number(btn.dataset.fileRemove), 1);
            renderFiles();
          });
        });
      };
      const renderFiles = () => {
        filesWrap.innerHTML = workingFiles.map((f, i) => documentFileRowHtml(f, i)).join("");
        bindFileRemove();
      };

      modalEl.querySelector("#co-doc-add-upload").addEventListener("click", () => {
        const newId = `newdoc-${Date.now()}`;
        workingFiles.push({
          id: newId,
          url: `https://picsum.photos/seed/${newId}/480/320`,
          mimetype: "image/png",
          originalName: `upload_${workingFiles.length + 1}.png`,
          size: String(150000 + Math.round(Math.random() * 200000)),
        });
        renderFiles();
      });

      modalEl.querySelector("#co-doc-add-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#co-doc-add-save").addEventListener("click", () => {
        const err = modalEl.querySelector("#co-doc-add-error");
        if (!workingFiles.length) {
          err.textContent = cod.errFilesRequired;
          err.hidden = false;
          return;
        }
        const cfg = COMPANY_DOCUMENT_CONFIGS.find((c) => c.id === modalEl.querySelector("#co-doc-config").value);
        const now = new Date();
        company.documents.push({
          id: `cdnew-${Date.now()}`,
          config: cfg,
          countryId: company.countryOfIncorporationId,
          status: modalEl.querySelector("#co-doc-add-status").value,
          isActive: modalEl.querySelector("#co-doc-add-active").checked,
          rejectTags: [],
          externalRejectReasons: null,
          createdAt: now,
          updatedAt: now,
          files: workingFiles,
        });
        closeModal();
        updateCompanyDetailView(company);
      });
    },
  });
}

// ---- Вкладка "KYB" — уровни + шаги текущего уровня степпером, адреса и документы
// компании (та же реальная сущность, что и у пользователя, см. комментарии выше),
// "Проверки" сбоку (renderChecksCard — та же функция, что и на карточке
// пользователя: полностью общая, читает company.verificationChecks так же, как
// читала user.verificationChecks), изменение статуса шага с причиной — тот же
// паттерн, что resetKYCLevelTo у пользователя.
function renderCompanyDetailKybTab(company) {
  const cod = t("companyDetail");
  return `
    <div class="client-detail-grid">
      <div class="client-detail-grid-main">
        <div class="profile-flat-block">
          <div class="profile-flat-section">
            <div class="profile-flat-section-head">
              <span class="detail-section-title">${cod.kybLevelsTitle}</span>
              <button type="button" class="profile-flat-edit" id="cd-kyb-status-change">${EDIT_ICON_SVG}<span>${cod.kybChangeStatus}</span></button>
            </div>
            ${renderKybLevelStepper(company)}
          </div>
          ${flatSection(cod.kybStepsTitle, renderKybStepsStepper(company), null, cod.kybStepsDesc)}
          ${renderCompanyAddressesCard(company)}
          ${renderCompanyDocumentsCard(company)}
        </div>
      </div>
      <div class="client-detail-grid-side">
        ${renderChecksCard(company)}
      </div>
    </div>
  `;
}

// ---- Изменение статуса KYB: сброс компании на выбранный уровень/шаг с указанным
// статусом — тот же паттерн, что и openKycStatusChangeModal у пользователя (см.
// clients-users.js), только над company.kybLevel*/kybStepStatuses и шагами из
// KYB_STEPS_BY_LEVEL вместо KYC_STEPS_BY_LEVEL.
function openKybStatusChangeModal(company) {
  const cod = t("companyDetail");
  const rejectStatuses = ["REJECTED", "REJECTED_RETRY"];

  const stepsForLevel = (level) => KYB_STEPS_BY_LEVEL[level] || [];

  function stepOptionsHtml(level) {
    return stepsForLevel(level)
      .map((s) => `<option value="${s.step}">${s.name}</option>`)
      .join("");
  }

  const currentLevel = company.kybLevel || 1;

  const bodyHtml = `
    <p class="modal-confirm-text pd-modal-intro">${cod.kybChangeStatusHint}</p>
    <label class="filters-field">
      <span class="filters-field-label">${cod.kybTargetLevel}</span>
      <select class="address-form-input" id="co-kyb-level">
        ${[1, 2, 3].map((lvl) => `<option value="${lvl}"${currentLevel === lvl ? " selected" : ""}>${KYB_CONFIG_NAMES[lvl - 1]}</option>`).join("")}
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cod.kybTargetStep}</span>
      <select class="address-form-input" id="co-kyb-step">
        ${stepOptionsHtml(currentLevel)}
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cod.kybTargetStatus}</span>
      <select class="address-form-input" id="co-kyb-status">
        ${rejectStatuses.map((s) => `<option value="${s}">${cod.kybRejectStatus[s]}</option>`).join("")}
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cod.kybRejectReason} *</span>
      <textarea class="form-textarea" id="co-kyb-reason" rows="2"></textarea>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cod.kybComment}</span>
      <textarea class="form-textarea" id="co-kyb-comment" rows="2"></textarea>
    </label>
    <div class="form-error" id="co-kyb-error" hidden></div>
  `;

  openModal({
    title: cod.kybChangeStatusTitle,
    width: 480,
    bodyHtml,
    footerHtml: `
      <button type="button" class="btn-secondary" id="co-kyb-cancel">${cod.cancel}</button>
      <button type="button" class="btn-primary" id="co-kyb-save">${cod.save}</button>
    `,
    onMount: (modalEl) => {
      const err = modalEl.querySelector("#co-kyb-error");
      const levelSelect = modalEl.querySelector("#co-kyb-level");
      const stepSelect = modalEl.querySelector("#co-kyb-step");

      levelSelect.addEventListener("change", () => {
        stepSelect.innerHTML = stepOptionsHtml(Number(levelSelect.value));
      });

      modalEl.querySelector("#co-kyb-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#co-kyb-save").addEventListener("click", () => {
        const reason = modalEl.querySelector("#co-kyb-reason").value.trim();
        if (!reason) {
          err.textContent = cod.errRejectReason;
          err.hidden = false;
          return;
        }

        const targetLevel = Number(levelSelect.value);
        const targetStepCode = stepSelect.value;
        const targetStatus = modalEl.querySelector("#co-kyb-status").value;
        const comment = modalEl.querySelector("#co-kyb-comment").value.trim() || null;

        company.kybLevel = targetLevel;
        company.kybConfigName = KYB_CONFIG_NAMES[targetLevel - 1];
        company.currentKYBLevelStatusV2 = {
          status: targetStatus,
          currentStep: { status: targetStatus },
          kybConfig: { id: `kc-${targetLevel}`, name: company.kybConfigName },
        };
        company.kybLevelStatuses = [1, 2, 3]
          .filter((lvl) => lvl <= targetLevel)
          .map((lvl) => ({ level: lvl, status: lvl < targetLevel ? "SUCCESSFUL" : targetStatus }));

        const steps = stepsForLevel(targetLevel);
        const pivotIdx = Math.max(0, steps.findIndex((s) => s.step === targetStepCode));
        company.kybStepStatuses = steps.map((s, idx) => ({
          step: s.step,
          name: s.name,
          status: idx < pivotIdx ? "SUCCESSFUL" : idx === pivotIdx ? targetStatus : "NOT_CONNECTED",
          rejectionReason: idx === pivotIdx ? reason : null,
          comment: idx === pivotIdx ? comment : null,
        }));

        closeModal();
        updateCompanyDetailView(company);
      });
    },
  });
}

// ---- Табы + диспетчер тела вкладки ------------------------------------------------
function renderCompanyDetailTabsBar() {
  return `
    <div class="cd-subtabs">
      ${COMPANY_DETAIL_SUB_TABS.map(
        (id) => `
          <button type="button" class="cd-subtab${companyDetailState.subTab === id ? " is-active" : ""}" data-co-sub-tab="${id}">
            <span class="cd-subtab-icon">${CO_TAB_ICONS[id]}</span>
            <span>${t(`companyDetail.subTabs.${id}`)}</span>
          </button>
        `
      ).join("")}
    </div>
  `;
}

function renderCompanyDetailBody(company) {
  if (companyDetailState.subTab === "kyb") return renderCompanyDetailKybTab(company);
  // Счета/Операции/Тариф — те же функции, что и на карточке пользователя
  // (clients-users.js): они завязаны только на id клиента, не на конкретный тип
  // (физлицо/компания), поэтому переиспользуются один в один.
  if (companyDetailState.subTab === "accounts") return renderClientDetailAccountsTab(company, "company");
  if (companyDetailState.subTab === "operations") return renderClientDetailOperationsTab(company, "company");
  if (companyDetailState.subTab === "tariff") return renderClientDetailTariffTab(company);
  if (companyDetailState.subTab === "security") return renderClientDetailSecurityTab(company, "company");
  if (companyDetailState.subTab === "auditLog") return renderClientDetailAuditTab(company);
  return renderCompanyDetailMainTab(company);
}

function viewCompanyDetail(companyId) {
  const cod = t("companyDetail");
  const company = CLIENTS_COMPANIES_MOCK.find((c) => c.id === companyId);

  if (!company) {
    return `
      ${pageHeader(cod.notFoundTitle)}
      <div class="empty-state">
        <div class="empty-state-icon">${ICONS.box}</div>
        <div class="empty-state-title">${cod.notFoundTitle}</div>
        <div class="empty-state-text">${cod.notFoundText}</div>
      </div>
    `;
  }

  companyDetailState.subTab = "main";

  return `
    ${renderCompanyDetailHeader(company)}

    <div class="cd-tabs-wrap" id="co-tabs-wrap">${renderCompanyDetailTabsBar()}</div>

    <div id="company-detail-content">${renderCompanyDetailBody(company)}</div>
  `;
}

function updateCompanyDetailView(company) {
  const tabsWrap = document.getElementById("co-tabs-wrap");
  const content = document.getElementById("company-detail-content");
  if (tabsWrap) tabsWrap.innerHTML = renderCompanyDetailTabsBar();
  if (content) content.innerHTML = renderCompanyDetailBody(company);
  attachCompanyDetailTabHandlers(company);
  attachCompanyDetailContentHandlers(company);
}

function attachCompanyDetailTabHandlers(company) {
  document.querySelectorAll("[data-co-sub-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      companyDetailState.subTab = btn.dataset.coSubTab;
      updateCompanyDetailView(company);
    });
  });
}

function attachCompanyDetailContentHandlers(company) {
  const content = document.getElementById("company-detail-content");
  if (!content) return;

  content.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn));
    });
  });

  content.querySelectorAll(".copy-target").forEach((el) => {
    el.addEventListener("click", () => {
      copyTextToClipboard(el.dataset.copyText).then(() => {
        el.classList.add("is-copied");
        setTimeout(() => el.classList.remove("is-copied"), 900);
      });
    });
  });

  content.querySelectorAll(".collapsible-card-head").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".collapsible-card").classList.toggle("is-collapsed");
    });
  });

  content.querySelectorAll("[data-member-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = `#/clients-users/${btn.dataset.memberId}`;
    });
  });

  content.querySelectorAll("[data-check-info]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const check = (company.verificationChecks || []).find((c) => c.id === btn.dataset.checkInfo);
      if (check) openCheckDetailsModal(check);
    });
  });

  const kybStatusChangeBtn = content.querySelector("#cd-kyb-status-change");
  if (kybStatusChangeBtn) kybStatusChangeBtn.addEventListener("click", () => openKybStatusChangeModal(company));

  content.querySelectorAll("[data-co-doc-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const doc = (company.documents || []).find((d) => d.id === btn.dataset.coDocEdit);
      if (doc) openCompanyDocumentEditModal(company, doc);
    });
  });

  const addDocBtn = content.querySelector("#co-document-add");
  if (addDocBtn) addDocBtn.addEventListener("click", () => openCompanyDocumentAddModal(company));

  if (companyDetailState.subTab === "accounts") {
    const lists = ensureClientAccountsLists(company);
    lists.virtual.init();
    bindClientAccountsExport(company, "company");
  }

  if (companyDetailState.subTab === "operations") {
    attachClientOperationsTab(content, company, () => updateCompanyDetailView(company));
  }

  if (companyDetailState.subTab === "tariff") {
    content.querySelectorAll("[data-acc-hash]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.hash = btn.dataset.accHash;
      });
    });
  }

  if (companyDetailState.subTab === "security") bindClientSecurityTab(content, company, "company", () => updateCompanyDetailView(company));

  if (companyDetailState.subTab === "auditLog") {
    ensureClientAuditList(company).init();
    bindExportMenu("cd-audit-export", (format) => exportClientAuditLogs(company, format));
  }

  attachCompanyAddressHandlers(company);
  attachPaymentsByCountryHandlers(company);
  attachCustomTooltips(content);
}

function initCompanyDetailView() {
  const backBtn = document.getElementById("cd-company-back");
  if (backBtn) backBtn.addEventListener("click", () => { window.location.hash = "#/clients-companies"; });

  const company = CLIENTS_COMPANIES_MOCK.find((c) => c.id === currentCompanyId());
  if (!company) return;

  document.querySelectorAll(".client-detail-header .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn));
    });
  });

  bindClientHeaderMenu(company, "company", () => updateCompanyDetailView(company));
  bindClientHeroPills((tab) => { companyDetailState.subTab = tab; updateCompanyDetailView(company); });
  attachCompanyDetailTabHandlers(company);
  attachCompanyDetailContentHandlers(company);
}
