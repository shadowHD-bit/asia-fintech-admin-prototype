/* ==========================================================================
   Вьюхи "Клиенты → Пользователи" (список) и карточка клиента.
   Данные — assets/mock/clients-users.mock.js. Фильтры/сортировка/пагинация —
   на клиенте, поверх моков; когда подключим реальный запрос `users`, здесь же
   заменится источник данных, разметка не изменится.
   ========================================================================== */

const clientsUsersState = {
  search: "",
  countryIds: [],
  statuses: [],
  kycLevels: [],
  createdFrom: null,
  createdTo: null,
  accountStatuses: [], // 'ACTIVE' | 'BLOCKED' (производное от blockReasons)
  noPhone: false,
  sortBy: null, // 'identity' | 'fullName' | 'createdAt' | 'updatedAt'
  sortDir: "asc",
  page: 1,
  pageSize: 10,
};

// Какие группы фильтров развёрнуты в боковой панели — переживает перерисовку
// панели (но не переход между страницами/вкладками). Заполняется автоматически
// при первом открытии: группы с активными значениями раскрыты, остальные нет.
let cuExpandedFilterGroups = null;

// ---- Карточка клиента: табы по данным, которые реально есть в findUser ----------
// Верхнего ряда (…) нет намеренно — под ними нет запроса, показывать пустые
// заглушки на пустом месте не стали. "Документы" по той же причине убраны из
// второго ряда — этого поля тоже нет в findUser. "Адреса" не отдельная вкладка —
// переехали вниз "Уровни KYC", отдельно держать смысла не было. "Счета", "Операции",
// "Тарифы" и "KYT" — реальные запросы есть (vabsVirtualAccounts/vabsRealAccounts/
// vabsVirtualTransactions/vabsRealTransactions — docs/accounts-spec.md; клиент
// тарифа — TF_CLIENTS/settings-tariffs-clients.js; KYT — KYT_TRANSACTIONS/
// security-kyt.mock.js, у каждой записи client.id — тот же id, что у findUser),
// поэтому вкладки добавлены как отдельные, на одном уровне с "Основное"/"KYC".
const CLIENT_DETAIL_SUB_TABS = ["main", "kycLevels", "risk", "companies", "accounts", "operations", "tariff", "kyt", "security", "auditLog"];

const CD_TAB_ICONS = {
  security: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="12" height="8" rx="1.8"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/><path d="M10 12.5v1.6"/></svg>`,
  auditLog: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3.5h9l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z"/><path d="M13 3.5V7h3.5"/><path d="M6 10h5M6 13h5"/></svg>`,
  main: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="3"/><path d="M4 17c.6-3.6 2.9-5.5 6-5.5s5.4 1.9 6 5.5"/></svg>`,
  kycLevels: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V3"/><path d="M3 17h14"/><rect x="6" y="10.5" width="2.2" height="6.5" rx="0.4"/><rect x="10" y="7" width="2.2" height="10" rx="0.4"/><rect x="14" y="12.5" width="2.2" height="4.5" rx="0.4"/></svg>`,
  accounts: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="15" height="11" rx="1.5"/><path d="M2.5 8.5h15"/><path d="M5.5 12h3"/></svg>`,
  operations: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h14M3 10h10M3 14h6"/></svg>`,
  tariff: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5h8l6 6-9.5 9.5-6-6v-8Z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>`,
  kyt: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5 17 6v5.5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V6l7-3.5Z"/><path d="m7 10 2 2 4-4.5"/></svg>`,
  companies: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="10" height="14" rx="1"/><path d="M8 7h.01M11 7h.01M8 10h.01M11 10h.01M8 13h.01M11 13h.01"/></svg>`,
  risk: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 3 6v4.5c0 4 3 7 7 8.5 4-1.5 7-4.5 7-8.5V6l-7-3Z"/><path d="M10 8v4"/><circle cx="10" cy="14.3" r="0.15" fill="currentColor" stroke-width="1.2"/></svg>`,
};

// Сбрасывается при каждом открытии карточки (см. initClientDetailView) —
// заходим всегда на "Основное", это ожидаемое поведение.
const clientDetailState = { subTab: "main" };

function kycStatusLabel(status) {
  return t(`kycStatus.${status}`);
}

function kycLevelLabel(rawName) {
  return t(`kycLevel.${rawName}`);
}

function statusBadgeClass(status) {
  if (status === "SUCCESSFUL") return "badge-success";
  if (status === "REJECTED" || status === "REJECTED_RETRY") return "badge-danger";
  if (status === "PROCESSING" || status === "PENDING" || status === "REQUIRES_REVIEW") return "badge-warning";
  return "badge-neutral";
}

// VerificationCheckStatusEnum — независимая от статуса шага KYC сущность (см. query
// verificationChecks), поэтому свой badge-маппинг, а не переиспользование statusBadgeClass.
function checkStatusBadgeClass(status) {
  if (status === "PASSED") return "badge-success";
  if (status === "FAILED" || status === "ERROR") return "badge-danger";
  return "badge-warning"; // RUNNING
}

function checkStatusLabel(status) {
  return t(`clientDetail.checkStatus.${status}`);
}

// ---- Копирование в буфер (с фолбэком для file:// / небезопасного контекста) -----
function fallbackCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

function copyTextToClipboard(text) {
  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

// Единое поведение для ВСЕХ кнопок копирования (id/email/телефон): иконка на
// мгновение меняется на галочку и зеленеет, потом возвращается как была.
function flashCopied(btnEl) {
  const svgEl = btnEl.querySelector("svg");
  if (!svgEl) return;
  const originalSvg = svgEl.outerHTML;
  btnEl.classList.add("is-copied");
  svgEl.outerHTML = CHECK_ICON_SVG;
  setTimeout(() => {
    btnEl.classList.remove("is-copied");
    const currentSvg = btnEl.querySelector("svg");
    if (currentSvg) currentSvg.outerHTML = originalSvg;
  }, 1200);
}

// ---- Фильтрация / сортировка -----------------------------------------------------
// ignoreStatus нужен для подсчёта агрегатов по статусу на быстрых табах — там
// нужно применить все ОСТАЛЬНЫЕ активные фильтры, но не сам статус.
function matchesUserFilters(row, { ignoreStatus } = {}) {
  const s = clientsUsersState;
  const search = s.search.trim().toLowerCase();

  if (search) {
    const haystack = `${row.fullName} ${row.email || ""} ${row.phone || ""} ${row.id} ${row.code || ""}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (s.countryIds.length && !s.countryIds.includes(row.residenceCountryId)) return false;
  if (!ignoreStatus && s.statuses.length && !s.statuses.includes(row.kycStatus)) return false;
  if (s.kycLevels.length && !s.kycLevels.includes(row.kycConfigName)) return false;
  if (s.createdFrom && row.createdDate < s.createdFrom) return false;
  if (s.createdTo && row.createdDate > s.createdTo) return false;
  if (s.accountStatuses.length && !s.accountStatuses.includes(userAccountStatus(row))) return false;
  if (s.noPhone && row.phone) return false;
  return true;
}

// Статус аккаунта: заблокирован, пока есть хотя бы одна причина блокировки (blockReasons)
function userAccountStatus(row) {
  return row.blockReasons && row.blockReasons.length ? "BLOCKED" : "ACTIVE";
}

function getFilteredClientsUsers() {
  return CLIENTS_USERS_MOCK.filter((row) => matchesUserFilters(row));
}

// Количество пользователей по статусу (или всего, для status === null) среди
// тех, что проходят остальные активные фильтры — показывается в кружке на
// быстрых табах.
function quickStatusTabCount(status) {
  const matching = CLIENTS_USERS_MOCK.filter((row) => matchesUserFilters(row, { ignoreStatus: true }));
  if (!status) return matching.length;
  return matching.filter((row) => row.kycStatus === status).length;
}

function sortClientsUsers(list) {
  const { sortBy, sortDir } = clientsUsersState;
  if (!sortBy) return list;
  const dir = sortDir === "asc" ? 1 : -1;

  return [...list].sort((a, b) => {
    if (sortBy === "createdAt") return (a.createdDate - b.createdDate) * dir;
    if (sortBy === "updatedAt") return (a.updatedDate - b.updatedDate) * dir;

    const va = sortBy === "identity" ? (a.email || a.phone || "") : a.fullName;
    const vb = sortBy === "identity" ? (b.email || b.phone || "") : b.fullName;
    return va.toLowerCase().localeCompare(vb.toLowerCase()) * dir;
  });
}

// ---- Фильтры ----------------------------------------------------------------------
function dateTriggerLabel(from, to) {
  if (from && to) return `${formatDMY(from)} — ${formatDMY(to)}`;
  return t("dateRangePicker.placeholder");
}

// Общий рендер поля с датой-триггером + подписью — переиспользуется в
// clients-companies.js (попап-фильтры там пока не переделаны).
function renderDateTrigger(triggerId, labelId, label, from, to) {
  return `
    <div class="filters-field">
      <label class="filters-field-label">${label}</label>
      <button type="button" class="drp-trigger" id="${triggerId}">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>
        <span id="${labelId}">${dateTriggerLabel(from, to)}</span>
      </button>
    </div>
  `;
}

function activeFilterCount() {
  const s = clientsUsersState;
  let n = 0;
  if (s.countryIds.length) n++;
  if (s.statuses.length) n++;
  if (s.kycLevels.length) n++;
  if (s.createdFrom || s.createdTo) n++;
  if (s.accountStatuses.length) n++;
  if (s.noPhone) n++;
  return n;
}

// Мультивыбор в кнопке-триггере/чипе: пусто → "Все ...", один → его название,
// несколько → "Название +N", чтобы не распирало кнопку длинным списком.
// Общая утилита — переиспользуется в clients-companies.js.
function multiSelectLabel(values, allLabel, labelFn) {
  if (values.length === 0) return allLabel;
  if (values.length === 1) return labelFn(values[0]);
  return `${labelFn(values[0])} +${values.length - 1}`;
}

function countryLabel(id) {
  const c = findCountry(id);
  return c ? c.name : id;
}

function countryFilterLabel(ids) {
  return multiSelectLabel(ids, t("clientsUsers.filters.allCountries"), countryLabel);
}

function kycLevelFilterLabel(levels) {
  return multiSelectLabel(levels, t("clientsUsers.filters.allLevels"), kycLevelLabel);
}

// ---- Кнопка «Фильтры» с бейджем количества активных фильтров --------------------
function renderFilterTriggerContent() {
  const f = t("clientsUsers.filters");
  const count = activeFilterCount();
  return `
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h14M6 10h8M8.5 15.5h3"/></svg>
    <span>${f.filterButton}</span>
    ${count ? `<span class="filter-badge">${count}</span>` : ""}
  `;
}

// ---- Быстрые табы статуса KYC — шорткаты поверх мультивыбора в панели -----------
const QUICK_STATUS_TABS = ["REQUIRES_REVIEW", "PENDING", "PROCESSING", "REJECTED", "NOT_CONNECTED"];

function renderQuickStatusTabs() {
  const s = clientsUsersState;
  const isAllActive = s.statuses.length === 0;
  const tabsHtml = [
    `<button type="button" class="quick-tab${isAllActive ? " is-active" : ""}" data-quick-status="">${t("clientsUsers.filters.allTab")}<span class="quick-tab-count">${quickStatusTabCount(null)}</span></button>`,
    ...QUICK_STATUS_TABS.map((st) => {
      const isActive = s.statuses.length === 1 && s.statuses[0] === st;
      return `<button type="button" class="quick-tab${isActive ? " is-active" : ""}" data-quick-status="${st}">${kycStatusLabel(st)}<span class="quick-tab-count">${quickStatusTabCount(st)}</span></button>`;
    }),
  ].join("");
  return `<div class="quick-tabs" id="cu-quick-tabs">${tabsHtml}</div>`;
}

function attachQuickStatusTabsHandlers() {
  const wrap = document.getElementById("cu-quick-tabs");
  if (!wrap) return;
  wrap.querySelectorAll(".quick-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      clientsUsersState.statuses = btn.dataset.quickStatus ? [btn.dataset.quickStatus] : [];
      clientsUsersState.page = 1;
      updateClientsUsersTable();
      refreshFiltersChrome();
    });
  });
}

// ---- Чипы активных фильтров под строкой поиска ------------------------------------
function renderFilterChips() {
  const s = clientsUsersState;
  const f = t("clientsUsers.filters");
  const chips = [];

  if (s.countryIds.length) chips.push({ key: "country", label: `${f.country}: ${countryFilterLabel(s.countryIds)}` });
  // Статус KYC чипом не дублируется — он уже виден и снимается быстрыми
  // табами над строкой поиска (см. renderQuickStatusTabs).
  if (s.accountStatuses.length) chips.push({ key: "accountStatus", label: `${f.accountStatus}: ${s.accountStatuses.map((v) => f.accountStatuses[v]).join(", ")}` });
  if (s.statuses.length > 1) chips.push({ key: "status", label: `${f.status}: ${s.statuses.map(kycStatusLabel).join(", ")}` });
  if (s.noPhone) chips.push({ key: "noPhone", label: f.noPhone });
  if (s.kycLevels.length) chips.push({ key: "level", label: `${f.level}: ${kycLevelFilterLabel(s.kycLevels)}` });
  if (s.createdFrom || s.createdTo) chips.push({ key: "createdAt", label: `${f.createdAt}: ${dateTriggerLabel(s.createdFrom, s.createdTo)}` });

  if (!chips.length) return `<div class="filter-chips" id="cu-filter-chips"></div>`;

  return `
    <div class="filter-chips" id="cu-filter-chips">
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

function clearFilterDimension(key) {
  const s = clientsUsersState;
  if (key === "country") s.countryIds = [];
  else if (key === "status") s.statuses = [];
  else if (key === "level") s.kycLevels = [];
  else if (key === "createdAt") { s.createdFrom = null; s.createdTo = null; }
  else if (key === "accountStatus") s.accountStatuses = [];
  else if (key === "noPhone") s.noPhone = false;
  s.page = 1;
  updateClientsUsersTable();
  refreshFiltersChrome();
}

function attachFilterChipsHandlers() {
  const wrap = document.getElementById("cu-filter-chips");
  if (!wrap) return;
  wrap.querySelectorAll(".filter-chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => clearFilterDimension(btn.dataset.chip));
  });
}

// ---- Компактная строка: быстрые табы + поиск + кнопка «Фильтры» + чипы ----------
function renderClientsUsersFilters() {
  const f = t("clientsUsers.filters");
  const hasSearch = clientsUsersState.search.length > 0;

  return `
    ${renderQuickStatusTabs()}
    <div class="filters-bar-compact">
      <div class="filters-search">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5.5"/><path d="m17 17-3.5-3.5"/></svg>
        <input type="text" id="cu-filter-search" placeholder="${f.searchPlaceholder}" value="${clientsUsersState.search}" />
        <button type="button" class="filters-search-clear" id="cu-filter-search-clear"${hasSearch ? "" : " hidden"}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <button type="button" class="filter-trigger" id="cu-filter-trigger">${renderFilterTriggerContent()}</button>
    </div>
    ${renderFilterChips()}
  `;
}

function attachClientsUsersFilterHandlers() {
  const searchEl = document.getElementById("cu-filter-search");
  const clearBtn = document.getElementById("cu-filter-search-clear");

  const applySearch = () => {
    clientsUsersState.search = searchEl.value;
    clientsUsersState.page = 1;
    clearBtn.hidden = searchEl.value.length === 0;
    updateClientsUsersTable();
  };

  searchEl.addEventListener("input", applySearch);

  clearBtn.addEventListener("click", () => {
    searchEl.value = "";
    searchEl.focus();
    applySearch();
  });

  document.getElementById("cu-filter-trigger").addEventListener("click", openFiltersDrawer);

  attachQuickStatusTabsHandlers();
  attachFilterChipsHandlers();
}

// Обновляет всё, что показывает текущее состояние фильтров ВНЕ панели: бейдж
// на кнопке, быстрые табы статуса и чипы — вызывается после любого изменения
// фильтров, откуда бы оно ни пришло (панель, чипы, быстрые табы, сброс).
function refreshFiltersChrome() {
  const triggerBtn = document.getElementById("cu-filter-trigger");
  if (triggerBtn) triggerBtn.innerHTML = renderFilterTriggerContent();

  const quickWrap = document.getElementById("cu-quick-tabs");
  if (quickWrap) {
    quickWrap.outerHTML = renderQuickStatusTabs();
    attachQuickStatusTabsHandlers();
  }

  const chipsWrap = document.getElementById("cu-filter-chips");
  if (chipsWrap) {
    chipsWrap.outerHTML = renderFilterChips();
    attachFilterChipsHandlers();
  }
}

// Сбрасывает все фильтры (кроме поиска — им управляет resetAllClientsUsersFilters).
function resetClientsUsersFilters() {
  const s = clientsUsersState;
  s.countryIds = [];
  s.statuses = [];
  s.kycLevels = [];
  s.createdFrom = null;
  s.createdTo = null;
  s.accountStatuses = [];
  s.noPhone = false;
  s.page = 1;
  updateClientsUsersTable();
}

// Полный сброс — фильтры и поиск. Кнопка в пустом состоянии таблицы.
function resetAllClientsUsersFilters() {
  clientsUsersState.search = "";
  const searchEl = document.getElementById("cu-filter-search");
  if (searchEl) searchEl.value = "";
  const clearBtn = document.getElementById("cu-filter-search-clear");
  if (clearBtn) clearBtn.hidden = true;
  resetClientsUsersFilters();
  refreshFiltersChrome();
}

// ---- Боковая панель «Фильтры»: аккордеон групп вместо попапа --------------------
// По клику на "Фильтры" вместо маленького попапа теперь выезжает справа полноразмерная
// панель с группами-аккордеонами (страна/уровень/риск — чекбоксы прямо в панели,
// без вложенного попапа; даты — через уже существующий date-range-picker).
// Статуса KYC здесь нет — он вынесен наружу быстрыми табами над строкой поиска
// (см. renderQuickStatusTabs), дублировать его в панели не нужно.
const FILTER_GROUP_DEFS = [
  { id: "accountStatus", labelKey: "accountStatus" },
  { id: "kycStatus", labelKey: "status" },
  { id: "country", labelKey: "country" },
  { id: "level", labelKey: "level" },
  { id: "createdAt", labelKey: "createdAt" },
];

// Панель работает с ЧЕРНОВИКОМ (cuFilterDraft), а не напрямую с clientsUsersState —
// изменения (чекбоксы/даты) копятся в черновике и применяются к таблице только
// по кнопке "Показать результаты". Чипы и быстрые табы вне панели по-прежнему
// применяются мгновенно (это однокликовые действия, не требуют подтверждения).
let cuFilterDraft = null;

function cloneFilterDraft(s) {
  return {
    countryIds: [...s.countryIds],
    statuses: [...s.statuses],
    kycLevels: [...s.kycLevels],
    createdFrom: s.createdFrom,
    createdTo: s.createdTo,
    accountStatuses: [...s.accountStatuses],
    noPhone: s.noPhone,
  };
}

function filterGroupActiveCount(groupId) {
  const d = cuFilterDraft;
  if (groupId === "country") return d.countryIds.length;
  if (groupId === "level") return d.kycLevels.length;
  if (groupId === "createdAt") return d.createdFrom || d.createdTo ? 1 : 0;
  if (groupId === "accountStatus") return d.accountStatuses.length;
  if (groupId === "kycStatus") return d.statuses.length;
  return 0;
}

function checkboxOptionsHtml(options, selected, groupId) {
  return options
    .map(
      (opt) => `
        <label class="filter-checkbox-item">
          <input type="checkbox" data-group="${groupId}" value="${escapeAttr(opt.value)}"${selected.includes(opt.value) ? " checked" : ""} />
          <span class="filter-checkbox-box"></span>
          <span>${opt.label}</span>
        </label>
      `
    )
    .join("");
}

function filterGroupBodyHtml(groupId) {
  const d = cuFilterDraft;
  if (groupId === "country") return checkboxOptionsHtml(COUNTRY_OPTIONS.map((c) => ({ value: c.id, label: c.name })), d.countryIds, groupId);
  if (groupId === "level") return checkboxOptionsHtml(KYC_CONFIG_NAMES.map((name) => ({ value: name, label: kycLevelLabel(name) })), d.kycLevels, groupId);
  if (groupId === "createdAt") {
    return `
      <button type="button" class="drp-trigger" id="cu-drawer-created-trigger">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>
        <span>${dateTriggerLabel(d.createdFrom, d.createdTo)}</span>
      </button>
    `;
  }
  if (groupId === "accountStatus") return checkboxOptionsHtml(["ACTIVE", "BLOCKED"].map((v) => ({ value: v, label: t("clientsUsers.filters.accountStatuses")[v] })), d.accountStatuses, groupId);
  if (groupId === "kycStatus") return checkboxOptionsHtml(Object.keys(t("kycStatus")).map((v) => ({ value: v, label: kycStatusLabel(v) })), d.statuses, groupId);
  return "";
}

// cuExpandedFilterGroups объявлен в начале файла (переживает перерисовку панели),
// инициализируется один раз при первом открытии (группы с активными значениями
// раскрыты, остальные нет).
function ensureExpandedGroupsInit() {
  if (cuExpandedFilterGroups) return;
  cuExpandedFilterGroups = new Set();
  FILTER_GROUP_DEFS.forEach((g) => {
    if (filterGroupActiveCount(g.id) > 0) cuExpandedFilterGroups.add(g.id);
  });
}

const FILTER_GROUP_CHEVRON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 8 4 4 4-4"/></svg>`;

function renderFilterGroup(groupId) {
  const f = t("clientsUsers.filters");
  const label = f[FILTER_GROUP_DEFS.find((g) => g.id === groupId).labelKey];
  const count = filterGroupActiveCount(groupId);
  const expanded = cuExpandedFilterGroups.has(groupId);

  return `
    <div class="filter-group${expanded ? " is-expanded" : ""}" data-group-id="${groupId}">
      <button type="button" class="filter-group-head" data-group-toggle="${groupId}">
        <span class="filter-group-label">${label}</span>
        ${count ? `<span class="filter-group-badge">${count}</span>` : ""}
        <span class="filter-group-chevron">${FILTER_GROUP_CHEVRON}</span>
      </button>
      <div class="filter-group-body">${filterGroupBodyHtml(groupId)}</div>
    </div>
  `;
}

function renderFiltersDrawerBody() {
  const d = cuFilterDraft;
  const phoneRow = `<div class="filter-switch-standalone">${switchRowHtml("cu-drawer-nophone", t("clientsUsers.filters.noPhone"), d.noPhone)}</div>`;
  return FILTER_GROUP_DEFS.map((g) => renderFilterGroup(g.id)).join("") + phoneRow;
}

function renderFiltersDrawer() {
  const f = t("clientsUsers.filters");
  return `
    <div class="filters-drawer-overlay" id="cu-filters-overlay"></div>
    <aside class="filters-drawer" id="cu-filters-drawer">
      <div class="filters-drawer-header">
        <h2 class="filters-drawer-title">${f.drawerTitle}</h2>
        <button type="button" class="filters-drawer-close" id="cu-filters-drawer-close">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <div class="filters-drawer-body" id="cu-filters-drawer-body">${renderFiltersDrawerBody()}</div>
      <div class="filters-drawer-footer">
        <button type="button" class="btn-secondary" id="cu-drawer-reset">${f.reset}</button>
        <button type="button" class="btn-primary" id="cu-drawer-apply">${f.showResults}</button>
      </div>
    </aside>
  `;
}

// Перерисовывает только тело панели (список групп) — используется после любого
// изменения черновика; состояние "развёрнуто" не теряется, т.к. хранится
// отдельно в cuExpandedFilterGroups.
function rerenderFiltersDrawerBody() {
  const bodyEl = document.getElementById("cu-filters-drawer-body");
  if (!bodyEl) return;
  bodyEl.innerHTML = renderFiltersDrawerBody();
  attachFiltersDrawerBodyHandlers();
}

// Обработчики ВНУТРИ тела панели — перевешиваются при каждой перерисовке тела
// (старые узлы вместе со своими обработчиками просто уничтожаются). Меняют
// только черновик (cuFilterDraft) — таблица и всё вне панели не трогаются.
function attachFiltersDrawerBodyHandlers() {
  const d = cuFilterDraft;

  document.querySelectorAll("[data-group-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const groupId = btn.dataset.groupToggle;
      if (cuExpandedFilterGroups.has(groupId)) cuExpandedFilterGroups.delete(groupId);
      else cuExpandedFilterGroups.add(groupId);
      btn.closest(".filter-group").classList.toggle("is-expanded");
    });
  });

  document.querySelectorAll('#cu-filters-drawer-body input[type="checkbox"][data-group]').forEach((input) => {
    input.addEventListener("change", () => {
      const groupId = input.dataset.group;
      const arr = groupId === "country" ? d.countryIds : groupId === "level" ? d.kycLevels : groupId === "accountStatus" ? d.accountStatuses : groupId === "kycStatus" ? d.statuses : [];
      const idx = arr.indexOf(input.value);
      if (input.checked && idx === -1) arr.push(input.value);
      if (!input.checked && idx !== -1) arr.splice(idx, 1);
      rerenderFiltersDrawerBody();
    });
  });

  const createdTrigger = document.getElementById("cu-drawer-created-trigger");
  if (createdTrigger) {
    createdTrigger.addEventListener("click", (e) => {
      openDateRangePicker({
        from: d.createdFrom,
        to: d.createdTo,
        anchorEl: e.currentTarget,
        onApply: (from, to) => {
          d.createdFrom = from;
          d.createdTo = to;
          rerenderFiltersDrawerBody();
        },
      });
    });
  }

  const phoneSwitch = document.getElementById("cu-drawer-nophone");
  if (phoneSwitch) {
    phoneSwitch.addEventListener("change", () => {
      d.noPhone = phoneSwitch.checked;
      rerenderFiltersDrawerBody();
    });
  }
}

// Обработчики ВНЕ тела панели (сброс, применить, закрытие) — вешаются один раз
// при открытии панели, т.к. эти узлы не перерисовываются.
function attachFiltersDrawerChromeHandlers() {
  const resetBtn = document.getElementById("cu-drawer-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      // Сброс — не черновик: сразу очищает и черновик, и применённые фильтры,
      // сразу обновляет таблицу (это ожидаемое поведение кнопки "Сбросить").
      resetClientsUsersFilters();
      cuFilterDraft = cloneFilterDraft(clientsUsersState);
      cuExpandedFilterGroups = new Set();
      rerenderFiltersDrawerBody();
      refreshFiltersChrome();
    });
  }

  const applyBtn = document.getElementById("cu-drawer-apply");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      Object.assign(clientsUsersState, cloneFilterDraft(cuFilterDraft));
      clientsUsersState.page = 1;
      updateClientsUsersTable();
      refreshFiltersChrome();
      closeFiltersDrawer();
    });
  }

  const closeBtn = document.getElementById("cu-filters-drawer-close");
  if (closeBtn) closeBtn.addEventListener("click", closeFiltersDrawer);

  const overlay = document.getElementById("cu-filters-overlay");
  if (overlay) overlay.addEventListener("click", closeFiltersDrawer);
}

function handleFiltersDrawerEscape(e) {
  if (e.key === "Escape") closeFiltersDrawer();
}

// Открытие панели заводит новый черновик от текущего применённого состояния —
// незакоммиченные правки (закрыли без "Показать результаты") просто выбрасываются
// вместе с этим объектом, откатывать вручную ничего не нужно.
function openFiltersDrawer() {
  cuFilterDraft = cloneFilterDraft(clientsUsersState);
  ensureExpandedGroupsInit();

  const wrap = document.createElement("div");
  wrap.id = "cu-filters-drawer-wrap";
  wrap.innerHTML = renderFiltersDrawer();
  document.body.appendChild(wrap);

  attachFiltersDrawerChromeHandlers();
  attachFiltersDrawerBodyHandlers();

  // Класс is-open добавляем следующим кадром — иначе CSS-transition не сыграет
  requestAnimationFrame(() => {
    const overlay = document.getElementById("cu-filters-overlay");
    const drawer = document.getElementById("cu-filters-drawer");
    if (overlay) overlay.classList.add("is-open");
    if (drawer) drawer.classList.add("is-open");
  });

  document.addEventListener("keydown", handleFiltersDrawerEscape);
  document.body.classList.add("filters-drawer-open");
}

function closeFiltersDrawer() {
  const wrap = document.getElementById("cu-filters-drawer-wrap");
  if (!wrap) return;
  const overlay = document.getElementById("cu-filters-overlay");
  const drawer = document.getElementById("cu-filters-drawer");
  if (overlay) overlay.classList.remove("is-open");
  if (drawer) drawer.classList.remove("is-open");
  document.removeEventListener("keydown", handleFiltersDrawerEscape);
  document.body.classList.remove("filters-drawer-open");
  setTimeout(() => wrap.remove(), 220);
}

// ---- Таблица ------------------------------------------------------------------------
const SORT_ICON_NEUTRAL = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m3 4.5 3-3 3 3M3 7.5l3 3 3-3"/></svg>`;
const SORT_ICON_ASC = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 3-3 3 3"/></svg>`;
const SORT_ICON_DESC = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 5 3 3 3-3"/></svg>`;

// Сортируемые колонки всегда показывают иконку — иначе непонятно, что по ним
// вообще можно сортировать. Нейтральная (две стрелки) — не активна; одна
// стрелка + акцентный цвет — текущая сортировка и её направление.
function sortableHeader(key, label) {
  const active = clientsUsersState.sortBy === key;
  const icon = active ? (clientsUsersState.sortDir === "asc" ? SORT_ICON_ASC : SORT_ICON_DESC) : SORT_ICON_NEUTRAL;
  return `<th><button type="button" class="th-sort${active ? " is-active" : ""}" data-sort="${key}">${label}<span class="th-sort-icon">${icon}</span></button></th>`;
}

// dd.mm.yy HH:MM → дата крупнее сверху, время мельче и приглушённым цветом снизу
function dateTimeCell(value) {
  const [datePart, timePart] = value.split(" ");
  return `<div class="dt-cell"><span class="dt-date">${datePart}</span><span class="dt-time">${timePart}</span></div>`;
}

const COPY_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7.5" y="7.5" width="9" height="9" rx="1.3"/><path d="M12.5 7.5V5.3a1.3 1.3 0 0 0-1.3-1.3H4.8a1.3 1.3 0 0 0-1.3 1.3v6.4a1.3 1.3 0 0 0 1.3 1.3h2.2"/></svg>`;
const CHECK_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 10.3 3.3 3.3 7.7-8.2"/></svg>`;
const EDIT_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 3.7 16.3 7.2 6.9 16.6 3 17.5l.9-3.9 8.9-9.9Z"/><path d="M11.3 5.2 14.8 8.7"/></svg>`;
const TRASH_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6M8.5 9.5v5M11.5 9.5v5"/><path d="M5.5 6 6.2 16a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4L14.5 6"/></svg>`;
const KEBAB_ICON_SVG = `<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="4.5" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="10" cy="15.5" r="1.6"/></svg>`;
const KEY_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="13" r="3"/><path d="M9.2 10.8 15.5 4.5M13 7l1.7 1.7M15.5 4.5 17.5 6.5"/></svg>`;
const INFO_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 9.2v4.3"/><circle cx="10" cy="6.8" r="0.15" fill="currentColor" stroke-width="1.2"/></svg>`;
const ARROW_RIGHT_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M11 5l5 5-5 5"/></svg>`;

// ---- Меню "три точки" в строке таблицы/списка — всегда видимая кнопка, выпадающий
// список пунктов. items: [{ label, icon, attrs, danger }]. Открытие/закрытие —
// один делегированный обработчик на всю страницу (initRowKebabDelegation, вызван
// один раз на уровне модуля), поэтому не нужно перевешивать его при каждой
// перерисовке строк — сами пункты меню (клики по data-атрибутам) навешиваются
// как обычно, в attachClientDetailContentHandlers/attachRows.
function rowKebabMenu(menuId, items) {
  return `
    <div class="row-kebab" data-row-kebab="${menuId}">
      <button type="button" class="row-kebab-btn" data-row-kebab-btn>${KEBAB_ICON_SVG}</button>
      <div class="row-kebab-menu">
        ${items.map((i) => `<button type="button" class="user-menu-item${i.danger ? " is-danger" : ""}" ${i.attrs}>${i.icon}<span>${i.label}</span></button>`).join("")}
      </div>
    </div>
  `;
}

// Меню внутри прокручиваемой таблицы (.table-scroll) иначе обрезалось бы её
// overflow и добавляло ей собственный скролл — position:fixed с координатами от
// getBoundingClientRect() выводит меню поверх всего, вне зависимости от того,
// в каком скролл-контейнере лежит кнопка.
function closeAllRowKebabs() {
  document.querySelectorAll(".row-kebab.is-open").forEach((el) => {
    el.classList.remove("is-open");
    const menu = el.querySelector(".row-kebab-menu");
    if (menu) menu.style.cssText = "";
  });
}

function initRowKebabDelegation() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-row-kebab-btn]");
    if (btn) {
      const wrap = btn.closest(".row-kebab");
      const menu = wrap.querySelector(".row-kebab-menu");
      const wasOpen = wrap.classList.contains("is-open");
      closeAllRowKebabs();
      if (!wasOpen) {
        wrap.classList.add("is-open");
        const rect = btn.getBoundingClientRect();
        const menuWidth = menu.offsetWidth || 200;
        const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
        menu.style.position = "fixed";
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${left}px`;
        menu.style.right = "auto";
      }
      return;
    }
    if (!e.target.closest(".row-kebab-menu")) closeAllRowKebabs();
  });
  window.addEventListener("scroll", closeAllRowKebabs, true);
}
initRowKebabDelegation();

const DOCUMENT_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h6l3 3V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M12 2.5V6h3M7 10h6M7 13h6"/></svg>`;
const PLUS_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v12M4 10h12"/></svg>`;
const EYE_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10s2.8-5.5 8-5.5S18 10 18 10s-2.8 5.5-8 5.5S2 10 2 10Z"/><circle cx="10" cy="10" r="2.2"/></svg>`;

// ---- Карточка-секция со сворачиванием по клику на заголовок ---------------------
// headRight — необязательный текст справа от заголовка внутри той же кнопки-шапки (дата обновления, сумма и т.п.)
function sectionCard(title, contentHtml, extraClass, headRight) {
  return `
    <div class="card collapsible-card${extraClass ? ` ${extraClass}` : ""}">
      <button type="button" class="collapsible-card-head" data-collapse-toggle>
        <span class="collapsible-card-head-main">
          <span class="detail-section-title">${title}</span>
          ${headRight ? `<span class="profile-kyc-updated">${headRight}</span>` : ""}
        </span>
        <span class="collapsible-card-chevron">${ICONS.chevron}</span>
      </button>
      <div class="collapsible-card-body">${contentHtml}</div>
    </div>
  `;
}

// Иконка-кнопка копирования рядом со значением (email/телефон) — без текста
function copyIconButton(value) {
  return `<button type="button" class="copy-icon-btn" data-copy-value="${value}" title="${t("clientsUsers.copy")}">${COPY_ICON_SVG}</button>`;
}

function renderClientsUsersRow(row) {
  const country = findCountry(row.residenceCountryId);
  // Пришёл через партнёра open banking (см. pnClientByInternal, mock/partners.mock.js) — связь по internalId,
  // ортогональна user.service (белый лейбл ASIA_FINTECH/BITBANKER/...). Есть связка — показываем партнёра.
  const pc = pnClientByInternal("user", row.id);
  const svc = pc ? pnById(pc.serviceId) : null;

  return `
    <tr>
      <td>
        <div class="identity-cell">
          <div class="identity-cell-primary">
            <button type="button" class="table-link identity-link" data-user-id="${row.id}">${row.email}</button>
            ${copyIconButton(row.email)}
          </div>
          <div class="identity-cell-sub">
            <span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>
            <button type="button" class="id-copy" data-copy-value="${row.code}" title="${t("clientsUsers.copy")}">
              <span class="id-copy-label">${row.code}</span>
              ${COPY_ICON_SVG}
            </button>
          </div>
          ${svc ? `<div class="identity-cell-sub"><span class="identity-cell-tag">${t("clientsUsers.partnerTag")}</span>${vbLink(`#/clients-partners/${svc.id}`, pdEscape(svc.name))}</div>` : ""}
        </div>
      </td>
      <td>${(() => { const b = !!(row.blockReasons && row.blockReasons.length); const l = t(b ? "clientDetail.blocked" : "clientDetail.active"); return `<span class="user-name-cell"><span class="status-dot ${b ? "is-blocked" : "is-active"}" title="${l}" aria-label="${l}"></span><span>${row.fullName}</span></span>`; })()}</td>
      <td>
        ${
          row.phone
            ? `<div class="inline-copy"><span>${row.phone}</span>${copyIconButton(row.phone)}</div>`
            : "—"
        }
      </td>
      <td>
        ${
          country
            ? `<span class="table-country"><span class="flag-icon">${country.flag}</span>${country.name}</span>`
            : "—"
        }
      </td>
      <td>
        <div class="identity-cell">
          <span class="badge ${statusBadgeClass(row.kycStatus)}">${kycStatusLabel(row.kycStatus)}</span>
          <span class="table-cell-muted">${kycLevelLabel(row.kycConfigName)}</span>
        </div>
      </td>
      <td>${dateTimeCell(row.createdAt)}</td>
      <td>${dateTimeCell(row.updatedAt)}</td>
      <td>${rowKebabMenu(`cu-row-${row.id}`, [{ label: t("headerMenu.exportCard"), icon: DOWNLOAD_ICON_SVG, attrs: `data-cu-pdf="${row.id}"` }])}</td>
    </tr>
  `;
}

function renderClientsUsersTableSection() {
  const cols = t("clientsUsers.columns");
  const pag = t("clientsUsers.pagination");
  const filtered = sortClientsUsers(getFilteredClientsUsers());
  const totalPages = Math.max(1, Math.ceil(filtered.length / clientsUsersState.pageSize));

  if (clientsUsersState.page > totalPages) clientsUsersState.page = totalPages;
  const page = clientsUsersState.page;

  const start = (page - 1) * clientsUsersState.pageSize;
  const pageRows = filtered.slice(start, start + clientsUsersState.pageSize);

  if (filtered.length === 0) {
    const empty = t("clientsUsers.emptyState");
    return `
      <div class="empty-state empty-state-centered">
        <img class="empty-state-logo" src="assets/images/logo-icon.svg" alt="" />
        <div class="empty-state-text-group">
          <div class="empty-state-title">${empty.title}</div>
          <div class="empty-state-text">${empty.text}</div>
        </div>
        <button type="button" class="btn-secondary" id="cu-empty-reset">${empty.resetButton}</button>
      </div>
    `;
  }

  const pageButtons = renderPager(page, totalPages);

  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            ${sortableHeader("identity", cols.identity)}
            ${sortableHeader("fullName", cols.fullName)}
            <th>${cols.phone}</th>
            <th>${cols.country}</th>
            <th>${cols.kycStatus}</th>
            ${sortableHeader("createdAt", cols.createdAt)}
            ${sortableHeader("updatedAt", cols.updatedAt)}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${pageRows.map(renderClientsUsersRow).join("")}
        </tbody>
      </table>
    </div>

    <div class="table-footer">
      <span class="table-footer-total">${pag.total(filtered.length)}</span>
      <div class="pager">${pageButtons}</div>
      <div class="table-footer-page-size">
        <span>${pag.rowsPerPage}</span>
        <select id="cu-page-size">
          ${[10, 20, 50]
            .map((n) => `<option value="${n}"${clientsUsersState.pageSize === n ? " selected" : ""}>${n}</option>`)
            .join("")}
        </select>
      </div>
    </div>
  `;
}

// Первая/последняя всегда видны, вокруг текущей — до 2 соседей, остальное — многоточие
function renderPager(page, totalPages) {
  const pages = [];
  const add = (p) => pages.push(p);

  add(1);
  if (page > 3) add("…");
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) add(p);
  if (page < totalPages - 2) add("…");
  if (totalPages > 1) add(totalPages);

  const prevDisabled = page <= 1 ? " disabled" : "";
  const nextDisabled = page >= totalPages ? " disabled" : "";

  return `
    <button type="button" class="pager-btn pager-nav" data-page="${page - 1}"${prevDisabled}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg>
    </button>
    ${pages
      .map((p) =>
        p === "…"
          ? `<span class="pager-ellipsis">…</span>`
          : `<button type="button" class="pager-btn${p === page ? " is-active" : ""}" data-page="${p}">${p}</button>`
      )
      .join("")}
    <button type="button" class="pager-btn pager-nav" data-page="${page + 1}"${nextDisabled}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.5 5 5.5-5 5.5"/></svg>
    </button>
  `;
}

// Короткая эмуляция загрузки при поиске/фильтрах/сортировке/пагинации —
// имитирует поход за данными на сервер, чтобы прототип не выглядел мгновенно
// "телепортирующимся" между состояниями. clearTimeout — дебаунс при быстром вводе.
let clientsUsersLoadingTimer = null;
const CLIENTS_USERS_LOADING_DELAY = 350;

function renderTableLoadingState() {
  return `<div class="table-loading"><span class="spinner"></span></div>`;
}

function updateClientsUsersTable() {
  const wrap = document.getElementById("clients-users-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = renderTableLoadingState();
  clearTimeout(clientsUsersLoadingTimer);
  clientsUsersLoadingTimer = setTimeout(() => {
    wrap.innerHTML = renderClientsUsersTableSection();
    attachClientsUsersTableHandlers();
    refreshUserMetrics();
  }, CLIENTS_USERS_LOADING_DELAY);
}

// ---- Карточки-метрики над таблицей: агрегаты по текущей выборке (с учётом
// активных фильтров), которые НЕ дублируют то, что уже видно на быстрых
// табах статуса — те дают разбивку по kycStatus, здесь — другие срезы:
// динамика регистраций, максимальный уровень KYC, комплаенс-флаги, охват
// контактных данных. ---------------------------------------------------------
const USER_METRICS_WINDOW_DAYS = 7;

function computeUserMetrics() {
  const list = getFilteredClientsUsers();
  const recentThreshold = new Date(MOCK_NOW.getTime() - USER_METRICS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return {
    newRecent: list.filter((u) => u.createdDate >= recentThreshold).length,
    maxLevel: list.filter((u) => u.kycLevel === 3).length,
    blocked: list.filter((u) => u.blockReasons && u.blockReasons.length).length,
    review: list.filter((u) => u.kycStatus === "REQUIRES_REVIEW").length,
    noPhone: list.filter((u) => !u.phone).length,
  };
}

function renderMetricCard(value, label, subHtml) {
  return `
    <div class="metric-card">
      <div class="metric-value">${value}</div>
      <div class="metric-label">${label}</div>
      ${subHtml ? `<div class="metric-sub">${subHtml}</div>` : ""}
    </div>
  `;
}

function renderUserMetricsCards() {
  const m = computeUserMetrics();
  const cd = t("clientsUsers.metrics");
  return `
    <div class="metrics-grid" id="cu-metrics">
      ${renderMetricCard(m.newRecent, cd.newRecent)}
      ${renderMetricCard(m.maxLevel, cd.maxLevel)}
      ${renderMetricCard(m.blocked, cd.blocked)}
      ${renderMetricCard(m.review, cd.review)}
      ${renderMetricCard(m.noPhone, cd.noPhone)}
    </div>
  `;
}

function refreshUserMetrics() {
  const el = document.getElementById("cu-metrics");
  if (el) el.outerHTML = renderUserMetricsCards();
}

function attachClientsUsersTableHandlers() {
  document.querySelectorAll("[data-cu-pdf]").forEach((b) =>
    b.addEventListener("click", () => {
      const user = CLIENTS_USERS_MOCK.find((u) => u.id === b.dataset.cuPdf);
      if (user) exportClientCardPdf(user, "user");
    })
  );
  const wrap = document.getElementById("clients-users-table-wrap");
  if (!wrap) return;

  const emptyResetBtn = document.getElementById("cu-empty-reset");
  if (emptyResetBtn) emptyResetBtn.addEventListener("click", resetAllClientsUsersFilters);

  wrap.querySelectorAll(".pager-btn[data-page]").forEach((btn) => {
    if (btn.hasAttribute("disabled")) return;
    btn.addEventListener("click", () => {
      clientsUsersState.page = Number(btn.dataset.page);
      updateClientsUsersTable();
    });
  });

  const pageSizeSelect = document.getElementById("cu-page-size");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", () => {
      clientsUsersState.pageSize = Number(pageSizeSelect.value);
      clientsUsersState.page = 1;
      updateClientsUsersTable();
    });
  }

  wrap.querySelectorAll(".th-sort").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (clientsUsersState.sortBy === key) {
        clientsUsersState.sortDir = clientsUsersState.sortDir === "asc" ? "desc" : "asc";
      } else {
        clientsUsersState.sortBy = key;
        clientsUsersState.sortDir = "asc";
      }
      updateClientsUsersTable();
    });
  });

  wrap.querySelectorAll(".identity-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = `#/clients-users/${btn.dataset.userId}`;
    });
  });

  wrap.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn));
    });
  });
}

// Экспорт — ровно то, что сейчас показывает таблица: все фильтры, поиск и сортировка, без учёта страницы
function usersExportFilterLines() {
  const s = clientsUsersState;
  const f = t("clientsUsers.filters");
  const lines = [];
  if (s.search) lines.push(`${f.searchPlaceholder}: «${pdEscape(s.search)}»`);
  if (s.statuses.length) lines.push(`${t("clientsUsers.export.status")}: ${s.statuses.map(kycStatusLabel).join(", ")}`);
  if (s.accountStatuses.length) lines.push(`${f.accountStatus}: ${s.accountStatuses.map((v) => f.accountStatuses[v]).join(", ")}`);
  if (s.noPhone) lines.push(f.noPhone);
  if (s.countryIds.length) lines.push(`${f.country}: ${countryFilterLabel(s.countryIds)}`);
  if (s.kycLevels.length) lines.push(`${f.level}: ${kycLevelFilterLabel(s.kycLevels)}`);
  if (s.createdFrom || s.createdTo) lines.push(`${f.createdAt}: ${dateTriggerLabel(s.createdFrom, s.createdTo)}`);
  return lines;
}

// Перед выгрузкой показываем, что именно уйдёт в файл: все записи или выборка по фильтрам
function openExportUsersModal(format) {
  const x = t("clientsUsers.export");
  const count = getFilteredClientsUsers().length;
  const total = CLIENTS_USERS_MOCK.length;
  const lines = usersExportFilterLines();
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
      if (flt) flt.addEventListener("click", () => { closeModal(); openFiltersDrawer(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportClientsUsers(format); });
    },
  });
}

function exportClientsUsers(format) {
  const x = t("clientsUsers.export");
  const rows = sortClientsUsers(getFilteredClientsUsers().slice()).map((r) => {
    const country = findCountry(r.residenceCountryId);
    return [r.email, r.code, r.fullName, r.phone || "", country ? country.name : "", kycStatusLabel(r.kycStatus), kycLevelLabel(r.kycConfigName), r.createdAt, r.updatedAt];
  });
  exportTable(`users_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(rows.length));
}

function viewClientsUsers() {
  const heroActions = `<span class="filters-bar-end">${exportMenuHtml("cu-export", t("clientsUsers.export.button"), t("clientsUsers.export.hint"))}<button type="button" class="btn-primary" id="cu-add">${PLUS_ICON_SVG}<span>${t("clientsUsers.create.button")}</span></button></span>`;
  return `
    <div class="list-hero">${pageHeader(t("nav.clients-users"), t("navDescriptions.clients-users"), heroActions)}</div>
    ${renderUserMetricsCards()}
    <div class="card list-card">
      ${renderClientsUsersFilters()}
      <div class="list-divider"></div>
      <div id="clients-users-table-wrap">${renderClientsUsersTableSection()}</div>
    </div>
  `;
}

// Вызывается один раз сразу после вставки viewClientsUsers() в DOM (см. render() в app.js)
function initClientsUsersView() {
  bindExportMenu("cu-export", openExportUsersModal);
  attachClientsUsersFilterHandlers();
  attachClientsUsersTableHandlers();
  const addBtn = document.getElementById("cu-add");
  if (addBtn) addBtn.addEventListener("click", openUserCreateWizard);
}

// ---- Карточка клиента (минимальная — раскрывать по мере готовности бэкенда) ------
function currentClientUserId() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const m = hash.match(/^clients-users\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function detailField(label, valueHtml) {
  return `
    <div class="profile-field">
      <span class="profile-field-label">${label}</span>
      <span class="profile-field-value">${valueHtml}</span>
    </div>
  `;
}

// ---- Аватар-кружок с инициалами в заголовке карточки клиента/компании — тот же приём, что у
// администратора в шапке (navbar-user-avatar). Для компании берутся первые буквы первых двух слов
// названия — с кавычками и организационно-правовой формой выходит грубо, но узнаваемо.
function pdInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function cdAvatar(name) {
  return `<span class="cd-avatar" aria-hidden="true">${pdEscape(pdInitials(name))}</span>`;
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Копируется только по клику на само значение (не на всю строку/лейбл),
// и hover-подсветка — только на значении. Рядом на мгновение показывается
// "✓ Скопировано". displayHtml может быть сложнее rawValue (например флаг +
// название страны) — копируется именно rawValue (чистый текст).
function copyableField(label, rawValue, displayHtml) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return detailField(label, displayHtml != null ? displayHtml : "—");
  }
  return `
    <div class="profile-field">
      <span class="profile-field-label">${label}</span>
      <span class="profile-field-value-wrap copy-target" data-copy-text="${escapeAttr(rawValue)}" title="${t("clientsUsers.copy")}">
        <span class="profile-field-value">${displayHtml != null ? displayHtml : rawValue}</span>
        <span class="copied-flag">✓ ${t("clientsUsers.copied")}</span>
      </span>
    </div>
  `;
}

function countryValue(id) {
  const c = findCountry(id);
  return c ? `<span class="table-country"><span class="flag-icon">${c.flag}</span>${c.name}</span>` : "—";
}

function countryName(id) {
  const c = findCountry(id);
  return c ? c.name : null;
}

function genderLabel(gender) {
  return gender ? t(`clientDetail.gender.${gender}`) : "—";
}

function formatBirthDate(date) {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

// Внутренний/внешний клиент — по полю service (общий identity-бэкенд обслуживает несколько white-label сервисов,
// см. SERVICE_VALUES_ALL): значения ASIA_FINTECH* — свой сервис, остальное (BITBANKER, FCB и т.д.) — чужой.
function isExternalService(service) {
  return !!service && !service.startsWith("ASIA_FINTECH");
}

// Заголовок карточки клиента: ФИО (если не указано — email) и статус блокировки
// рядом, ниже — email (если в заголовке не он), ID и телефон (если указан).
function renderClientDetailHeader(user) {
  const cd = t("clientDetail");
  const isBlocked = !!(user.blockReasons && user.blockReasons.length);
  const titleIsEmail = !user.fullName;
  const isExternal = isExternalService(user.service);

  const subtitleParts = [
    titleIsEmail ? null : `<span class="inline-copy">${user.email}${copyIconButton(user.email)}</span>`,
    `<span class="inline-copy">ID: ${user.code}${copyIconButton(user.code)}</span>`,
    user.phone ? `<span class="inline-copy">${user.phone}${copyIconButton(user.phone)}</span>` : null,
  ].filter(Boolean);

  return `
    <div class="card client-detail-header cd-hero">
      <button type="button" class="client-detail-back" id="cd-back" title="${cd.backToList}">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg>
      </button>
      ${cdAvatar(titleIsEmail ? user.email : user.fullName)}
      <div class="client-detail-header-main">
        <div class="client-detail-title-row">
          <span class="page-title">${titleIsEmail ? user.email : user.fullName}</span>
          <span class="badge ${isBlocked ? "badge-danger" : "badge-success"}">${isBlocked ? cd.blocked : cd.active}</span>
          <span class="badge badge-neutral">${isExternal ? cd.externalClient : cd.internalClient}</span>
        </div>
        <div class="client-detail-subtitle">
          ${subtitleParts.join(`<span class="client-detail-subtitle-sep">·</span>`)}
        </div>
        ${renderClientHeroPills(user, "user")}
      </div>
      ${renderClientHeaderMenu(user, "user")}
    </div>
  `;
}

// ---- Блок "Компании": привязанные компании (CompanyMember: user ↔ company) ------
// ---- Общий баланс клиента в базовой валюте (USD): сумма остатков по всем его счетам, отдельно
// фиат и крипта ----------------------------------------------------------------------------------
// Считается отдельно для пользователя и для компании (getClientVirtualAccounts берёт счета по
// client.id). Счёт клиента — либо целиком крипто-кошелёк (tag CUSTOMER_CRYPTO_WALLET, валюта
// всегда USDT), либо целиком фиатный (см. accounts.mock.js) — счета этих двух видов не смешиваются,
// поэтому делим по tag счёта, не по валюте баланса. Курсы — условная таблица FX_TO_BASE (см.
// mock/fx-rates.mock.js); валюты без курса в сумму не входят и перечисляются в примечании.
function clientTotalBalanceBase(entity, crypto) {
  const accounts = getClientVirtualAccounts(entity).filter((a) => (a.tag === "CUSTOMER_CRYPTO_WALLET") === !!crypto);
  let total = 0, hold = 0;
  const skipped = new Set();
  accounts.forEach((a) => {
    a.balances.forEach((b) => {
      const rate = FX_TO_BASE[b.currency];
      if (rate == null) { skipped.add(b.currency); return; }
      total += b.total * rate;
      hold += b.hold * rate;
    });
  });
  return { total, hold, available: total - hold, accounts: accounts.length, skipped: [...skipped] };
}

function renderTotalBalanceCard(entity, kind) {
  const b = t("clientBalance");
  const block = (label, s) => `
    <div class="balance-card-block">
      <div class="balance-card-block-label">${label}</div>
      <div class="balance-card-value balance-card-value-sm">${formatPaymentAmount(s.total)} <span class="balance-card-cur">${BASE_CURRENCY}</span></div>
      <div class="balance-card-sub">
        <span>${b.available}: <strong>${formatPaymentAmount(s.available)}</strong></span>
        <span>${b.hold}: <strong>${formatPaymentAmount(s.hold)}</strong></span>
      </div>
      <div class="balance-card-note">${b.accounts(s.accounts)}${s.skipped.length ? ` · ${b.noRate(s.skipped.join(", "))}` : ""}</div>
    </div>
  `;
  const moreAttr = kind === "company" ? `data-co-sub-tab="accounts"` : `data-sub-tab="accounts"`;
  const content = `
    <div class="balance-card-split">
      ${block(b.fiat, clientTotalBalanceBase(entity, false))}
      ${block(b.crypto, clientTotalBalanceBase(entity, true))}
    </div>
    <div class="card-more-link"><button type="button" class="table-link" ${moreAttr}>${t("clientDetail.viewMore")} →</button></div>
  `;
  return sectionCard(b.title, content, "balance-card", b.inBase(BASE_CURRENCY));
}

function renderCompaniesCard(user) {
  const cd = t("clientDetail");
  const list = user.linkedCompanies.length
    ? `<div class="linked-companies-list">
        ${user.linkedCompanies
          .map(
            (c) => `
              <div class="linked-company-row">
                <span class="linked-company-icon">${ICONS.building}</span>
                <div class="linked-company-info">
                  <button type="button" class="table-link linked-company-name" data-company-id="${c.id}">${c.name}</button>
                  <div class="linked-company-badges">
                    ${c.kybStatus ? `<span class="badge ${statusBadgeClass(c.kybStatus)}">${kybStatusLabel(c.kybStatus)}</span>` : ""}
                    ${c.scoringRiskLevel ? `<span class="badge badge-neutral">${t(`scoringRisk.${c.scoringRiskLevel}`)}</span>` : ""}
                  </div>
                </div>
              </div>
            `
          )
          .join("")}
      </div>`
    : `<div class="table-cell-muted">${cd.noCompanies}</div>`;
  const content = `${list}<div class="card-more-link"><button type="button" class="table-link" data-sub-tab="companies">${cd.viewMore} →</button></div>`;

  return sectionCard(cd.sections.companies, content);
}

// ---- Плоская секция внутри одной карточки: заголовок (+ "Изменить") и разделитель
// сверху (кроме первой). Несколько секций подряд визуально не дробятся на отдельные
// карточки — как в остальных полях детальной страницы. description — короткая
// подпись под заголовком, что именно в блоке (необязательна). ----------------------
// headRight — необязательная разметка справа в строке заголовка (например ссылка "Все →")
function flatSection(title, bodyHtml, editAttr, description, headRight) {
  return `
    <div class="profile-flat-section">
      <div class="profile-flat-section-head">
        <span class="detail-section-title">${title}</span>
        ${editAttr ? `<button type="button" class="profile-flat-edit" ${editAttr}>${EDIT_ICON_SVG}<span>${t("clientDetail.edit")}</span></button>` : ""}
        ${headRight || ""}
      </div>
      ${description ? `<div class="profile-flat-section-desc">${description}</div>` : ""}
      ${bodyHtml}
    </div>
  `;
}

// ---- Панель статуса KYC (боковая колонка): статус, уровень, переход на вкладку KYC ---
function renderKycStatusCard(user) {
  const cd = t("clientDetail");
  if (user.kycLevel == null) return "";
  const dots = [1, 2, 3]
    .map((lvl) => `<span class="profile-kyc-dot${lvl <= user.kycLevel ? " is-filled" : ""}"></span>`)
    .join("");

  const content = `
    <span class="badge ${statusBadgeClass(user.kycStatus)}">${kycStatusLabel(user.kycStatus)}</span>
    <div class="profile-kyc-level">
      <span class="profile-kyc-dots">${dots}</span>
      <span>${kycLevelLabel(user.kycConfigName)}</span>
    </div>
    <div class="card-more-link"><button type="button" class="table-link" data-sub-tab="kycLevels">${cd.viewMore} →</button></div>
  `;
  return sectionCard(cd.sections.kyc, content, "profile-kyc-card", `${cd.kycUpdatedLabel} ${user.updatedAt}`);
}

// ---- Панель "Риск и скоринг" (боковая колонка) — personal.scoringProfile: итоговый балл, уровень риска
// и флаги проверки (PEP, гражданин США, член семьи PEP, санкционные списки, негативные публикации).
// Поле реальное (см. mock/clients-users.mock.js), просто не было своего места в интерфейсе — здесь и на
// вкладке "Риск и скоринг" (renderClientDetailRiskTab) выводится впервые.
function renderRiskScoringCard(user) {
  const cd = t("clientDetail");
  const p = user.scoringProfile;
  if (!p) return "";
  const level = p.scoringRiskLevel ? `<span class="badge ${riskLevelBadgeClass(p.scoringRiskLevel)}">${riskLevelLabel(p.scoringRiskLevel)}</span>` : `<span class="badge badge-neutral">${cd.riskTab.noLevel}</span>`;
  const flagsOn = ["isPep", "isUsa", "isFamilyMemberPep", "sanctionList", "adverseMedia"].filter((k) => p[k]);
  const content = `
    ${level}
    ${flagsOn.length ? `<div class="profile-kyc-level"><span>${flagsOn.map((k) => cd.riskTab.flags[k]).join(", ")}</span></div>` : `<div class="profile-kyc-level"><span class="table-cell-muted">${cd.riskTab.noFlags}</span></div>`}
    <div class="card-more-link"><button type="button" class="table-link" data-sub-tab="risk">${cd.viewMore} →</button></div>
  `;
  return sectionCard(cd.sections.risk, content, "profile-kyc-card", p.totalScore != null ? `${cd.riskTab.score}: ${p.totalScore}` : "");
}

// ---- Формы редактирования (только мок: правки живут в памяти вкладки) ------------
function personalEditFormBodyHtml(user) {
  const cd = t("clientDetail");
  const countrySelect = (field, value) => `
    <select class="address-form-input" data-field="${field}">
      <option value=""${!value ? " selected" : ""}>—</option>
      ${COUNTRY_OPTIONS.map((c) => `<option value="${c.id}"${value === c.id ? " selected" : ""}>${c.name}</option>`).join("")}
    </select>`;

  return `
    <div class="address-form-grid">
      <label class="filters-field"><span class="filters-field-label">${cd.fields.lastName}</span><input class="address-form-input" type="text" data-field="lastName" value="${escapeAttr(user.lastName || "")}" /></label>
      <label class="filters-field"><span class="filters-field-label">${cd.fields.firstName}</span><input class="address-form-input" type="text" data-field="firstName" value="${escapeAttr(user.firstName || "")}" /></label>
      <label class="filters-field"><span class="filters-field-label">${cd.fields.middleName}</span><input class="address-form-input" type="text" data-field="middleName" value="${escapeAttr(user.middleName || "")}" /></label>
      <label class="filters-field">
        <span class="filters-field-label">${cd.fields.gender}</span>
        <select class="address-form-input" data-field="gender">
          <option value=""${!user.gender ? " selected" : ""}>—</option>
          <option value="MALE"${user.gender === "MALE" ? " selected" : ""}>${genderLabel("MALE")}</option>
          <option value="FEMALE"${user.gender === "FEMALE" ? " selected" : ""}>${genderLabel("FEMALE")}</option>
        </select>
      </label>
      <label class="filters-field"><span class="filters-field-label">${cd.fields.birthDate}</span><input class="address-form-input" type="text" data-field="birthDate" placeholder="ДД.ММ.ГГГГ" value="${user.birthDate ? formatBirthDate(user.birthDate) : ""}" /></label>
      <label class="filters-field"><span class="filters-field-label">${cd.fields.placeOfBirth}</span>${countrySelect("placeOfBirthCountryId", user.placeOfBirthCountryId)}</label>
      <label class="filters-field"><span class="filters-field-label">${cd.fields.nationality}</span>${countrySelect("nationalityCountryId", user.nationalityCountryId)}</label>
      <label class="filters-field"><span class="filters-field-label">${cd.fields.country}</span>${countrySelect("residenceCountryId", user.residenceCountryId)}</label>
    </div>
    <div class="form-error" id="cu-edit-error" hidden></div>
  `;
}

function openPersonalEditModal(user) {
  const cd = t("clientDetail");
  openModal({
    title: cd.editPersonalTitle,
    width: 560,
    bodyHtml: personalEditFormBodyHtml(user),
    footerHtml: `
      <button type="button" class="btn-secondary" id="cu-edit-cancel">${cd.cancel}</button>
      <button type="button" class="btn-primary" id="cu-edit-save">${cd.save}</button>
    `,
    onMount: (modalEl) => {
      const err = modalEl.querySelector("#cu-edit-error");
      modalEl.querySelector("#cu-edit-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#cu-edit-save").addEventListener("click", () => {
        const getVal = (field) => modalEl.querySelector(`[data-field="${field}"]`).value.trim();
        const lastName = getVal("lastName");
        const firstName = getVal("firstName");
        const middleName = getVal("middleName");
        const birthDateRaw = getVal("birthDate");
        let birthDate = user.birthDate;
        if (birthDateRaw) {
          const m = birthDateRaw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
          const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
          if (!m || d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) {
            err.textContent = cd.errBirthDate;
            err.hidden = false;
            return;
          }
          birthDate = d;
        }
        user.lastName = lastName || null;
        user.firstName = firstName || null;
        user.middleName = middleName || null;
        user.fullName = [lastName, firstName, middleName].filter(Boolean).join(" ") || null;
        user.gender = getVal("gender") || null;
        user.birthDate = birthDate;
        user.placeOfBirthCountryId = getVal("placeOfBirthCountryId") || null;
        user.nationalityCountryId = getVal("nationalityCountryId") || null;
        user.residenceCountryId = getVal("residenceCountryId") || null;
        closeModal();
        render();
      });
    },
  });
}

function contactsEditFormBodyHtml(user) {
  const cd = t("clientDetail");
  return `
    <div class="address-form-grid">
      <label class="filters-field"><span class="filters-field-label">${cd.fields.email}</span><input class="address-form-input" type="email" data-field="email" value="${escapeAttr(user.email || "")}" /></label>
      <label class="filters-field"><span class="filters-field-label">${cd.fields.phone}</span><input class="address-form-input" type="text" data-field="phone" value="${escapeAttr(user.phone || "")}" /></label>
      <label class="filters-field"><span class="filters-field-label">${cd.fields.phoneSbp}</span><input class="address-form-input" type="text" data-field="phoneSbp" value="${escapeAttr(user.phoneSbp || "")}" /></label>
    </div>
    <div class="form-error" id="cu-edit-error" hidden></div>
  `;
}

function openContactsEditModal(user) {
  const cd = t("clientDetail");
  openModal({
    title: cd.editContactsTitle,
    width: 480,
    bodyHtml: contactsEditFormBodyHtml(user),
    footerHtml: `
      <button type="button" class="btn-secondary" id="cu-edit-cancel">${cd.cancel}</button>
      <button type="button" class="btn-primary" id="cu-edit-save">${cd.save}</button>
    `,
    onMount: (modalEl) => {
      const err = modalEl.querySelector("#cu-edit-error");
      modalEl.querySelector("#cu-edit-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#cu-edit-save").addEventListener("click", () => {
        const getVal = (field) => modalEl.querySelector(`[data-field="${field}"]`).value.trim();
        const email = getVal("email");
        if (!email) {
          err.textContent = cd.errEmail;
          err.hidden = false;
          return;
        }
        user.email = email;
        user.phone = getVal("phone") || null;
        user.phoneSbp = getVal("phoneSbp") || null;
        closeModal();
        render();
      });
    },
  });
}

// ---- Содержимое вкладки "Основное" -----------------------------------------------
function renderClientDetailMainTab(user) {
  const cd = t("clientDetail");

  const personalSection = flatSection(
    cd.sections.personal,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(cd.fields.lastName, user.lastName)}
      ${copyableField(cd.fields.firstName, user.firstName)}
      ${copyableField(cd.fields.middleName, user.middleName)}
      ${copyableField(cd.fields.gender, user.gender ? genderLabel(user.gender) : null)}
      ${copyableField(cd.fields.birthDate, user.birthDate ? formatBirthDate(user.birthDate) : null)}
      ${copyableField(cd.fields.placeOfBirth, countryName(user.placeOfBirthCountryId), countryValue(user.placeOfBirthCountryId))}
      ${copyableField(cd.fields.nationality, countryName(user.nationalityCountryId), countryValue(user.nationalityCountryId))}
      ${copyableField(cd.fields.country, countryName(user.residenceCountryId), countryValue(user.residenceCountryId))}
    </div>`,
    `data-edit-personal`,
    cd.sectionDesc.personal
  );

  const identificationSection = flatSection(
    cd.sections.identification,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(cd.fields.tin, user.tin)}
    </div>`,
    null,
    cd.sectionDesc.identification
  );

  const contactsSection = flatSection(
    cd.sections.contacts,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(cd.fields.email, user.email)}
      ${copyableField(cd.fields.phone, user.phone)}
      ${copyableField(cd.fields.phoneSbp, user.phoneSbp)}
    </div>`,
    `data-edit-contacts`,
    cd.sectionDesc.contacts
  );

  // Партнёрский сервис (open banking, ExternalServiceClientEntity) — ортогонально полю service (белый лейбл
  // ASIA_FINTECH/BITBANKER/...) выше; см. pnClientByInternal, mock/partners.mock.js.
  const partnerLink = pnClientByInternal("user", user.id);
  const partnerSvc = partnerLink ? pnById(partnerLink.serviceId) : null;
  const systemSection = flatSection(
    cd.sections.system,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(cd.fields.service, user.service)}
      ${detailField(cd.fields.partnerService, partnerSvc ? vbLink(`#/clients-partners/${partnerSvc.id}`, pdEscape(partnerSvc.name)) : "—")}
      ${copyableField(cd.fields.createdAt, user.createdAt)}
      ${copyableField(cd.fields.updatedAt, user.updatedAt)}
    </div>`,
    null,
    cd.sectionDesc.system
  );

  return `
    <div class="client-detail-grid">
      <div class="client-detail-grid-main">
        <div class="profile-flat-block">
          ${personalSection}
          ${identificationSection}
          ${contactsSection}
          ${systemSection}
        </div>
      </div>
      <div class="client-detail-grid-side">
        ${renderTotalBalanceCard(user, "user")}
        ${renderKycStatusCard(user)}
        ${renderRiskScoringCard(user)}
        ${renderCompaniesCard(user)}
      </div>
    </div>
  `;
}

// ---- Степпер по уровням KYC (1 → 2 → 3), с адресами внизу той же вкладки --------
const KYC_STEPPER_ICON_PIN = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17.5S16 12.5 16 8a6 6 0 1 0-12 0c0 4.5 6 9.5 6 9.5Z"/><circle cx="10" cy="8" r="2"/></svg>`;

function renderKycLevelStepper(user) {
  if (user.kycLevel == null) return "";

  const nodesHtml = [1, 2, 3]
    .map((lvl, idx) => {
      const entry = user.kycLevelStatuses.find((l) => l.level === lvl);
      const isDone = entry && entry.status === "SUCCESSFUL";
      const isCurrent = user.kycLevel === lvl;
      const nodeClass = isDone ? "is-done" : isCurrent ? "is-current" : "is-pending";

      // Линия соединения — абсолютно спозиционирована от центра этого кружка до центра
      // следующего (left: 50% + width: 100% при равных по ширине .kyc-stepper-item),
      // а не в общем ряду с кружком — иначе кружок с линией сдвигается влево и подпись
      // под ним перестаёт быть отцентрована под самим кружком.
      return `
        <div class="kyc-stepper-item">
          <div class="kyc-stepper-circle ${nodeClass}">${isDone ? CHECK_ICON_SVG : `<span>${lvl}</span>`}</div>
          ${idx < 2 ? `<div class="kyc-stepper-line${isDone ? " is-done" : ""}"></div>` : ""}
          <div class="kyc-stepper-label">
            <div class="kyc-stepper-title">${isCurrent ? `<span class="table-link">${kycLevelLabel(user.kycConfigName)}</span>` : `Level ${lvl}`}</div>
            ${entry ? `<span class="badge ${statusBadgeClass(entry.status)}">${kycStatusLabel(entry.status)}</span>` : `<span class="table-cell-muted">—</span>`}
          </div>
        </div>
      `;
    })
    .join("");

  return `<div class="kyc-stepper">${nodesHtml}</div>`;
}

// ---- Адреса: список + добавление/редактирование/удаление (мок, без бэкенда) -----
const ADDRESS_CATEGORIES = ["birth_place", "residential"];

// Категория + действия — отдельной верхней строкой (короткий текст, не съезжает),
// флаг+адрес — отдельной строкой ниже на всю ширину, с переносом при нехватке места.
function addressRowHtml(addr, idx) {
  const cd = t("clientDetail");
  return `
    <div class="address-row">
      <div class="address-row-head">
        <span class="address-row-category">${t(`clientDetail.addressCategory.${addr.category}`)}</span>
        ${rowKebabMenu(`addr-${idx}`, [
          { label: cd.editAddress, icon: EDIT_ICON_SVG, attrs: `data-address-edit="${idx}"` },
          { label: cd.deleteAddress, icon: TRASH_ICON_SVG, attrs: `data-address-delete="${idx}"`, danger: true },
        ])}
      </div>
      <div class="address-row-value">
        <span class="address-row-icon">${KYC_STEPPER_ICON_PIN}</span>
        ${countryValue(addr.countryId)}${addr.city ? `, ${addr.city}` : ""}${addr.street ? `, ${addr.street}` : ""}${addr.postalCode ? `, ${addr.postalCode}` : ""}
      </div>
    </div>
  `;
}

// Форма добавления/редактирования — только в модалке (см. openAddressModal),
// инлайн-версии в карточке больше нет.
function addressFormBodyHtml(addr) {
  const cd = t("clientDetail");
  return `
    <div class="address-form-grid">
      <label class="filters-field">
        <span class="filters-field-label">${cd.category}</span>
        <select class="address-form-input" data-field="category">
          ${ADDRESS_CATEGORIES.map((c) => `<option value="${c}"${addr.category === c ? " selected" : ""}>${t(`clientDetail.addressCategory.${c}`)}</option>`).join("")}
        </select>
      </label>
      <label class="filters-field">
        <span class="filters-field-label">${cd.country}</span>
        <select class="address-form-input" data-field="countryId">
          <option value=""${!addr.countryId ? " selected" : ""}>—</option>
          ${COUNTRY_OPTIONS.map((c) => `<option value="${c.id}"${addr.countryId === c.id ? " selected" : ""}>${c.name}</option>`).join("")}
        </select>
      </label>
      <label class="filters-field">
        <span class="filters-field-label">${cd.city}</span>
        <input class="address-form-input" type="text" data-field="city" value="${escapeAttr(addr.city || "")}" />
      </label>
      <label class="filters-field">
        <span class="filters-field-label">${cd.street}</span>
        <input class="address-form-input" type="text" data-field="street" value="${escapeAttr(addr.street || "")}" />
      </label>
      <label class="filters-field">
        <span class="filters-field-label">${cd.postalCode}</span>
        <input class="address-form-input" type="text" data-field="postalCode" value="${escapeAttr(addr.postalCode || "")}" />
      </label>
    </div>
  `;
}

// index == null → добавление новой записи, иначе — редактирование user.addresses[index]
function openAddressModal(user, index) {
  const cd = t("clientDetail");
  const addr = index != null ? user.addresses[index] : { category: "residential", countryId: "", city: "", street: "", postalCode: "" };

  openModal({
    title: index != null ? cd.editAddress : cd.addAddress,
    width: 480,
    bodyHtml: addressFormBodyHtml(addr),
    footerHtml: `
      <button type="button" class="btn-secondary" id="address-modal-cancel">${cd.cancel}</button>
      <button type="button" class="btn-primary" id="address-modal-save">${cd.save}</button>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector("#address-modal-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#address-modal-save").addEventListener("click", () => {
        const getVal = (field) => modalEl.querySelector(`[data-field="${field}"]`).value;
        const newAddr = {
          category: getVal("category"),
          countryId: getVal("countryId") || null,
          city: getVal("city") || null,
          street: getVal("street") || null,
          postalCode: getVal("postalCode") || null,
        };
        if (index == null) user.addresses.push(newAddr);
        else user.addresses[index] = newAddr;
        closeModal();
        updateClientDetailView(user);
      });
    },
  });
}

function confirmDeleteAddress(user, index) {
  const cd = t("clientDetail");
  openConfirmModal({
    title: cd.deleteAddress,
    text: cd.deleteAddressConfirm,
    confirmLabel: cd.deleteAddress,
    cancelLabel: cd.cancel,
    danger: true,
    onConfirm: () => {
      user.addresses.splice(index, 1);
      updateClientDetailView(user);
    },
  });
}

function renderAddressesCard(user) {
  const cd = t("clientDetail");

  const bodyHtml = user.addresses.length
    ? user.addresses.map((a, i) => addressRowHtml(a, i)).join("")
    : `<div class="table-cell-muted">${cd.noAddresses}</div>`;

  return `
    <div class="profile-flat-section">
      <div class="profile-flat-section-head">
        <span class="detail-section-title">${cd.sections.addresses}</span>
        <button type="button" class="profile-flat-edit" id="cd-address-add">${PLUS_ICON_SVG}<span>${cd.addAddress}</span></button>
      </div>
      <div class="profile-flat-section-desc">${cd.sectionDesc.addresses}</div>
      ${bodyHtml}
    </div>
  `;
}

function attachAddressHandlers(user) {
  const addBtn = document.getElementById("cd-address-add");
  if (addBtn) addBtn.addEventListener("click", () => openAddressModal(user, null));

  document.querySelectorAll("[data-address-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openAddressModal(user, Number(btn.dataset.addressEdit)));
  });

  document.querySelectorAll("[data-address-delete]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteAddress(user, Number(btn.dataset.addressDelete)));
  });
}

// ---- Документы верификации (DocumentType, apps/identity/src/documents) -----------
// status — прямое поле бэка (DocumentStatusEnum), меняется только через "Изменить";
// действий на документе всего два реальных: изменить (updateDocument) и добавить
// новый (createDocument, по шагам — Тип документа → Файлы → Детали). Отдельного
// "удалить документ"/"отправить повторно" в UI нет — там, где на бэке нет прямого
// аналога (см. deleteDocument — есть, но здесь сознательно не выводим отдельной
// кнопкой: удаление документа целиком не то же самое, что снять файл при редактировании).
function documentStatusInfo(doc) {
  const cd = t("clientDetail");
  const cls = doc.status === "APPROVED" ? "badge-success" : doc.status === "NOT_REVIEWED" ? "badge-warning" : "badge-danger";
  return { label: cd.documentStatus[doc.status], cls };
}

function formatFileSize(bytes) {
  const kb = Number(bytes) / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function documentFileRowHtml(file, idx) {
  const cd = t("clientDetail");
  const isImage = file.mimetype.startsWith("image/");
  return `
    <div class="doc-file-row">
      <div class="doc-file-thumb">${isImage ? `<img src="${file.url}" alt="" />` : DOCUMENT_ICON_SVG}</div>
      <div class="doc-file-meta">
        <div><span class="doc-file-meta-label">${cd.fileNameLabel}:</span> ${file.originalName}</div>
        <div><span class="doc-file-meta-label">${cd.fileTypeLabel}:</span> ${(file.mimetype.split("/")[1] || file.mimetype).toUpperCase()}</div>
        <div><span class="doc-file-meta-label">${cd.fileSizeLabel}:</span> ${formatFileSize(file.size)}</div>
      </div>
      <div class="doc-file-actions">
        <a class="icon-btn" href="${file.url}" target="_blank" rel="noopener" title="${cd.openOriginal}">${EYE_ICON_SVG}</a>
        <button type="button" class="icon-btn icon-btn-danger" data-file-remove="${idx}" title="${cd.deleteAddress}">${TRASH_ICON_SVG}</button>
      </div>
    </div>
  `;
}

function renderDocumentsCard(user) {
  const cd = t("clientDetail");

  const bodyHtml = user.documents.length
    ? `<div class="documents-list">
        ${user.documents
          .map((d) => {
            const info = documentStatusInfo(d);
            const fileSummary = d.files.length === 1 ? d.files[0].originalName : `${d.files.length} ${cd.filesLabel}`;
            return `
              <div class="document-row">
                <span class="document-row-icon">${DOCUMENT_ICON_SVG}</span>
                <div class="document-row-info">
                  <span class="document-row-name">${d.config.name}${!d.isActive ? `<span class="badge badge-neutral document-row-inactive">${cd.documentInactiveLabel}</span>` : ""}</span>
                  <span class="document-row-file">${fileSummary}</span>
                </div>
                <span class="badge ${info.cls}">${info.label}</span>
                ${rowKebabMenu(`doc-${d.id}`, [{ label: cd.documentEdit, icon: EDIT_ICON_SVG, attrs: `data-doc-edit="${d.id}"` }])}
              </div>
            `;
          })
          .join("")}
      </div>`
    : `<div class="table-cell-muted">${cd.noDocuments}</div>`;

  return `
    <div class="profile-flat-section">
      <div class="profile-flat-section-head">
        <span class="detail-section-title">${cd.sections.documents}</span>
        <button type="button" class="profile-flat-edit" id="cd-document-add">${PLUS_ICON_SVG}<span>${cd.addDocument}</span></button>
      </div>
      <div class="profile-flat-section-desc">${cd.sectionDesc.documents}</div>
      ${bodyHtml}
    </div>
  `;
}

// ---- Редактирование документа: статус, активность, причины отклонения, файлы ----
function openDocumentEditModal(user, doc) {
  const cd = t("clientDetail");
  let workingFiles = doc.files.map((f) => ({ ...f }));

  const bodyHtml = `
    <div class="doc-edit-top">
      <label class="switch"><input type="checkbox" id="cu-doc-active" ${doc.isActive ? "checked" : ""} /><span class="switch-track"><span class="switch-thumb"></span></span></label>
      <span class="doc-edit-active-label">${cd.documentActiveLabel}</span>
    </div>
    <div class="doc-edit-meta">
      <span>${cd.fields.createdAt}: ${formatDateTime(doc.createdAt)}</span>
      <span class="doc-edit-meta-sep">·</span>
      <span>${cd.fields.updatedAt}: ${formatDateTime(doc.updatedAt)}</span>
    </div>
    <label class="filters-field">
      <span class="filters-field-label">${cd.documentStatusLabel} *</span>
      <select class="address-form-input" id="cu-doc-status">
        ${DOCUMENT_STATUSES.map((s) => `<option value="${s}"${doc.status === s ? " selected" : ""}>${cd.documentStatus[s]}</option>`).join("")}
      </select>
    </label>
    <div class="filters-field">
      <span class="filters-field-label">${cd.rejectTagsLabel}</span>
      <div class="doc-reject-tags" id="cu-doc-tags">
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
      <span class="filters-field-label">${cd.additionalReasonsLabel}</span>
      <textarea class="form-textarea" id="cu-doc-reasons" rows="2">${pdEscape(doc.externalRejectReasons || "")}</textarea>
    </label>
    <div class="filters-field">
      <span class="filters-field-label">${cd.attachFilesLabel} *</span>
      <div class="doc-files-list" id="cu-doc-files">${workingFiles.map((f, i) => documentFileRowHtml(f, i)).join("")}</div>
      <button type="button" class="doc-upload-zone" id="cu-doc-upload">
        ${PLUS_ICON_SVG}<span>${cd.uploadFile}</span><span class="doc-upload-hint">${cd.uploadHint}</span>
      </button>
    </div>
  `;

  openModal({
    title: doc.config.name,
    width: 560,
    bodyHtml,
    footerHtml: `
      <button type="button" class="btn-secondary" id="cu-edit-cancel">${cd.cancel}</button>
      <button type="button" class="btn-primary" id="cu-edit-save">${cd.save}</button>
    `,
    onMount: (modalEl) => {
      const filesWrap = modalEl.querySelector("#cu-doc-files");

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

      modalEl.querySelector("#cu-doc-upload").addEventListener("click", () => {
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

      modalEl.querySelector("#cu-edit-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#cu-edit-save").addEventListener("click", () => {
        doc.isActive = modalEl.querySelector("#cu-doc-active").checked;
        doc.status = modalEl.querySelector("#cu-doc-status").value;
        doc.rejectTags = Array.from(modalEl.querySelectorAll("#cu-doc-tags input:checked")).map((el) => el.value);
        doc.externalRejectReasons = modalEl.querySelector("#cu-doc-reasons").value.trim() || null;
        doc.files = workingFiles;
        doc.updatedAt = new Date();
        closeModal();
        updateClientDetailView(user);
      });
    },
  });
}

// ---- Добавление документа по шагам: Тип документа → Файлы → Детали (createDocument) ---
function documentWizardStepperHtml(currentStep) {
  const cd = t("clientDetail");
  const steps = [
    { n: 1, label: cd.wizard.docType, icon: DOCUMENT_ICON_SVG },
    { n: 2, label: cd.wizard.attachFiles, icon: PLUS_ICON_SVG },
    { n: 3, label: cd.wizard.details, icon: CHECK_ICON_SVG },
  ];
  return `
    <div class="kyc-stepper doc-wizard-stepper">
      ${steps
        .map((s, idx) => {
          const cls = s.n < currentStep ? "is-done" : s.n === currentStep ? "is-current" : "is-pending";
          return `
            <div class="kyc-stepper-item">
              <div class="kyc-stepper-circle ${cls}">${s.n < currentStep ? CHECK_ICON_SVG : s.icon}</div>
              ${idx < steps.length - 1 ? `<div class="kyc-stepper-line${s.n < currentStep ? " is-done" : ""}"></div>` : ""}
              <div class="kyc-stepper-label"><div class="kyc-stepper-title">${s.label}</div></div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function openDocumentAddWizard(user) {
  const cd = t("clientDetail");
  const state = { step: 1, countryId: "", configId: "", isActive: true, files: [] };

  const availableConfigs = () =>
    DOCUMENT_CONFIGS.filter((c) => !c.countryIds || (state.countryId && c.countryIds.includes(state.countryId)));

  function stepBodyHtml() {
    if (state.step === 1) {
      return `
        <label class="filters-field">
          <span class="filters-field-label">${cd.wizard.country}</span>
          <select class="address-form-input" id="dw-country">
            <option value=""${!state.countryId ? " selected" : ""}>—</option>
            ${COUNTRY_OPTIONS.map((c) => `<option value="${c.id}"${state.countryId === c.id ? " selected" : ""}>${c.name}</option>`).join("")}
          </select>
        </label>
        <label class="filters-field">
          <span class="filters-field-label">${cd.wizard.document}</span>
          <select class="address-form-input" id="dw-config">
            <option value=""${!state.configId ? " selected" : ""}>—</option>
            ${availableConfigs()
              .map((c) => `<option value="${c.id}"${state.configId === c.id ? " selected" : ""}>${c.name}</option>`)
              .join("")}
          </select>
        </label>
        <div class="form-error" id="dw-error" hidden></div>
      `;
    }
    if (state.step === 2) {
      return `
        <div class="doc-files-list" id="dw-files">${state.files.map((f, i) => documentFileRowHtml(f, i)).join("")}</div>
        <button type="button" class="doc-upload-zone" id="dw-upload">
          ${PLUS_ICON_SVG}<span>${cd.uploadFile}</span><span class="doc-upload-hint">${cd.uploadHint}</span>
        </button>
        <div class="form-error" id="dw-error" hidden></div>
      `;
    }
    const cfg = DOCUMENT_CONFIGS.find((c) => c.id === state.configId);
    const country = findCountry(state.countryId);
    return `
      <div class="profile-fields">
        ${detailField(cd.wizard.document, cfg ? cfg.name : "—")}
        ${detailField(cd.wizard.country, country ? country.name : "—")}
        ${detailField(cd.attachFilesLabel, String(state.files.length))}
      </div>
      <div class="doc-edit-top">
        <label class="switch"><input type="checkbox" id="dw-active" ${state.isActive ? "checked" : ""} /><span class="switch-track"><span class="switch-thumb"></span></span></label>
        <span class="doc-edit-active-label">${cd.documentActiveLabel}</span>
      </div>
    `;
  }

  function footerHtmlFor() {
    const backBtn =
      state.step > 1
        ? `<button type="button" class="btn-secondary" id="dw-back">${cd.wizard.back}</button>`
        : `<button type="button" class="btn-secondary" id="dw-cancel">${cd.cancel}</button>`;
    const nextLabel = state.step === 3 ? cd.wizard.create : cd.wizard.continue;
    return `${backBtn}<button type="button" class="btn-primary" id="dw-next">${nextLabel}</button>`;
  }

  function render(modalEl) {
    modalEl.querySelector(".modal-body").innerHTML = `${documentWizardStepperHtml(state.step)}${stepBodyHtml()}`;
    modalEl.querySelector(".modal-footer").innerHTML = footerHtmlFor();
    bind(modalEl);
  }

  function bind(modalEl) {
    if (state.step === 1) {
      const countrySelect = modalEl.querySelector("#dw-country");
      countrySelect.addEventListener("change", (e) => {
        state.countryId = e.target.value;
        state.configId = "";
        render(modalEl);
      });
      modalEl.querySelector("#dw-config").addEventListener("change", (e) => {
        state.configId = e.target.value;
      });
    }
    if (state.step === 2) {
      const filesWrap = modalEl.querySelector("#dw-files");
      const bindRemove = () => {
        filesWrap.querySelectorAll("[data-file-remove]").forEach((btn) => {
          btn.addEventListener("click", () => {
            state.files.splice(Number(btn.dataset.fileRemove), 1);
            rerenderFiles();
          });
        });
      };
      const rerenderFiles = () => {
        filesWrap.innerHTML = state.files.map((f, i) => documentFileRowHtml(f, i)).join("");
        bindRemove();
      };
      bindRemove();
      modalEl.querySelector("#dw-upload").addEventListener("click", () => {
        const newId = `new${state.files.length + 1}-${Date.now()}`;
        state.files.push({
          id: newId,
          url: `https://picsum.photos/seed/${newId}/480/320`,
          mimetype: "image/png",
          originalName: `upload_${state.files.length + 1}.png`,
          size: String(150000 + Math.round(Math.random() * 200000)),
        });
        rerenderFiles();
      });
    }
    if (state.step === 3) {
      modalEl.querySelector("#dw-active").addEventListener("change", (e) => {
        state.isActive = e.target.checked;
      });
    }

    const cancelBtn = modalEl.querySelector("#dw-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    const backBtn = modalEl.querySelector("#dw-back");
    if (backBtn) backBtn.addEventListener("click", () => { state.step -= 1; render(modalEl); });

    modalEl.querySelector("#dw-next").addEventListener("click", () => {
      const err = modalEl.querySelector("#dw-error");
      if (state.step === 1 && !state.configId) {
        err.textContent = cd.wizard.errDocRequired;
        err.hidden = false;
        return;
      }
      if (state.step === 2 && state.files.length === 0) {
        err.textContent = cd.wizard.errFilesRequired;
        err.hidden = false;
        return;
      }
      if (state.step < 3) {
        state.step += 1;
        render(modalEl);
        return;
      }

      const cfg = DOCUMENT_CONFIGS.find((c) => c.id === state.configId);
      const now = new Date();
      user.documents.push({
        id: `d-new-${Date.now()}`,
        config: cfg,
        countryId: state.countryId || null,
        status: "NOT_REVIEWED",
        isActive: state.isActive,
        rejectTags: [],
        externalRejectReasons: null,
        createdAt: now,
        updatedAt: now,
        files: state.files,
      });
      closeModal();
      updateClientDetailView(user);
    });
  }

  openModal({
    title: cd.addDocumentTitle,
    width: 480,
    bodyHtml: `${documentWizardStepperHtml(1)}${stepBodyHtml()}`,
    footerHtml: footerHtmlFor(),
    onMount: (modalEl) => bind(modalEl),
  });
}

// ---- Создание клиента (физлицо) — по шагам, тот же степпер, что и у мастера добавления документа
// (documentWizardStepperHtml выше). Поля — как в CreateUserInput/PersonalInput (identity/schema.graphql:
// registerUser — админский сценарий создания клиента из бэк-офиса, admin-flow, подтверждён и в ACL
// (identity-users-admin), и в security-logs (docs/features/security-logs/events.md: "Регистрация нового
// клиента через admin-flow")). Email обязателен по факту сервиса (UsersService.registerUserByAdmin: без
// personal.email — ошибка "Email was not provided"), фамилия/имя — тем же продуктовым решением, что и у
// email в моке пользователей ("всегда заполняется на создании"). service — обязательное поле (String!),
// у нас закрытый список SERVICE_OPTIONS. Документы/адреса — не создаём тут же (в реальном флоу это
// отдельные шаги, для них уже есть отдельные мастер/формы в карточке клиента) — новый клиент заводится
// с пустым KYC (kycStatus NOT_CONNECTED, kycLevel null), как и часть реальных записей.
let userCreateSeq = 900;

function ucStepperHtml(step) {
  const c = t("clientsUsers.create");
  const steps = [
    { n: 1, label: c.steps.main },
    { n: 2, label: c.steps.contacts },
    { n: 3, label: c.steps.summary },
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

function openUserCreateWizard() {
  const c = t("clientsUsers.create");
  const state = {
    step: 1,
    lastName: "", firstName: "", middleName: "", gender: "MALE", service: SERVICE_OPTIONS[0],
    birthDate: "", nationalityCountryId: "", placeOfBirthCountryId: "", residenceCountryId: "",
    email: "", phone: "",
  };

  const countrySelect = (id, label, value) => `
    <label class="filters-field">
      <span class="filters-field-label">${label}</span>
      <select class="address-form-input" id="${id}">
        <option value=""${!value ? " selected" : ""}>—</option>
        ${COUNTRY_OPTIONS.map((x) => `<option value="${x.id}"${value === x.id ? " selected" : ""}>${x.name}</option>`).join("")}
      </select>
    </label>`;

  function stepBodyHtml() {
    if (state.step === 1) {
      return `
        <label class="filters-field"><span class="filters-field-label">${c.lastName} *</span><input class="address-form-input" id="uc-lastName" value="${escapeAttr(state.lastName)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.firstName} *</span><input class="address-form-input" id="uc-firstName" value="${escapeAttr(state.firstName)}" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.middleName}</span><input class="address-form-input" id="uc-middleName" value="${escapeAttr(state.middleName)}" /></label>
        <label class="filters-field">
          <span class="filters-field-label">${c.gender}</span>
          <select class="address-form-input" id="uc-gender">
            ${["MALE", "FEMALE"].map((g) => `<option value="${g}"${state.gender === g ? " selected" : ""}>${c.genderOptions[g]}</option>`).join("")}
          </select>
        </label>
        <label class="filters-field">
          <span class="filters-field-label">${c.service}</span>
          <select class="address-form-input" id="uc-service">
            ${SERVICE_OPTIONS.map((s) => `<option value="${s}"${state.service === s ? " selected" : ""}>${s}</option>`).join("")}
          </select>
        </label>
        <div class="form-error" id="uc-error" hidden></div>
      `;
    }
    if (state.step === 2) {
      return `
        <label class="filters-field"><span class="filters-field-label">${c.email} *</span><input class="address-form-input" type="email" id="uc-email" value="${escapeAttr(state.email)}" placeholder="name@company.com" /></label>
        <label class="filters-field"><span class="filters-field-label">${c.phone}</span><input class="address-form-input" id="uc-phone" value="${escapeAttr(state.phone)}" placeholder="+7..." /></label>
        <label class="filters-field"><span class="filters-field-label">${c.birthDate}</span><input class="address-form-input" type="date" id="uc-birthDate" value="${state.birthDate}" /></label>
        ${countrySelect("uc-residence", c.country, state.residenceCountryId)}
        ${countrySelect("uc-nationality", c.nationality, state.nationalityCountryId)}
        ${countrySelect("uc-birthCountry", c.placeOfBirth, state.placeOfBirthCountryId)}
        <div class="form-error" id="uc-error" hidden></div>
      `;
    }
    const nationality = findCountry(state.nationalityCountryId);
    const residence = findCountry(state.residenceCountryId);
    return `
      <div class="profile-fields profile-fields-grid">
        ${detailField(c.lastName, pdEscape(state.lastName))}
        ${detailField(c.firstName, pdEscape(state.firstName))}
        ${detailField(c.email, pdEscape(state.email))}
        ${detailField(c.phone, state.phone ? pdEscape(state.phone) : "—")}
        ${detailField(c.service, state.service)}
        ${detailField(c.country, residence ? residence.name : "—")}
        ${detailField(c.nationality, nationality ? nationality.name : "—")}
      </div>
      <p class="table-cell-muted">${c.summaryHint}</p>
    `;
  }

  function footerHtmlFor() {
    const backBtn =
      state.step > 1
        ? `<button type="button" class="btn-secondary" id="uc-back">${c.back}</button>`
        : `<button type="button" class="btn-secondary" id="uc-cancel">${c.cancel}</button>`;
    const nextLabel = state.step === 3 ? c.create : c.next;
    return `${backBtn}<button type="button" class="btn-primary" id="uc-next">${nextLabel}</button>`;
  }

  function render(modalEl) {
    modalEl.querySelector(".modal-body").innerHTML = `${ucStepperHtml(state.step)}${stepBodyHtml()}`;
    modalEl.querySelector(".modal-footer").innerHTML = footerHtmlFor();
    bind(modalEl);
  }

  function readStep1(modalEl) {
    state.lastName = modalEl.querySelector("#uc-lastName").value.trim();
    state.firstName = modalEl.querySelector("#uc-firstName").value.trim();
    state.middleName = modalEl.querySelector("#uc-middleName").value.trim();
    state.gender = modalEl.querySelector("#uc-gender").value;
    state.service = modalEl.querySelector("#uc-service").value;
  }
  function readStep2(modalEl) {
    state.email = modalEl.querySelector("#uc-email").value.trim();
    state.phone = modalEl.querySelector("#uc-phone").value.trim();
    state.birthDate = modalEl.querySelector("#uc-birthDate").value;
    state.residenceCountryId = modalEl.querySelector("#uc-residence").value;
    state.nationalityCountryId = modalEl.querySelector("#uc-nationality").value;
    state.placeOfBirthCountryId = modalEl.querySelector("#uc-birthCountry").value;
  }

  function bind(modalEl) {
    const cancelBtn = modalEl.querySelector("#uc-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    const backBtn = modalEl.querySelector("#uc-back");
    if (backBtn)
      backBtn.addEventListener("click", () => {
        if (state.step === 2) readStep2(modalEl);
        state.step -= 1;
        render(modalEl);
      });

    modalEl.querySelector("#uc-next").addEventListener("click", () => {
      const err = modalEl.querySelector("#uc-error");
      const fail = (msg) => {
        err.textContent = msg;
        err.hidden = false;
      };

      if (state.step === 1) {
        readStep1(modalEl);
        if (!state.lastName) return fail(c.errLastName);
        if (!state.firstName) return fail(c.errFirstName);
        state.step = 2;
        render(modalEl);
        return;
      }
      if (state.step === 2) {
        readStep2(modalEl);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) return fail(c.errEmail);
        state.step = 3;
        render(modalEl);
        return;
      }

      // Создание — тот же формат id/code, что у остальных записей мока (entityCode, mock/clients-users.mock.js)
      userCreateSeq += 1;
      const seed = userCreateSeq;
      const now = pdNow();
      const birthDate = state.birthDate ? new Date(state.birthDate) : new Date(1990, 0, 1);
      const newUser = {
        id: `${seed.toString(16).padStart(4, "0")}${(seed * 97).toString(16)}_${(seed * 13).toString(16)}`,
        code: entityCode("USR", seed),
        createdDate: now, updatedDate: now, createdAt: formatDateTime(now), updatedAt: formatDateTime(now),
        service: state.service,
        fullName: `${state.lastName} ${state.firstName}${state.middleName ? ` ${state.middleName}` : ""}`,
        firstName: state.firstName, lastName: state.lastName, middleName: state.middleName || null,
        email: state.email, phone: state.phone || null, phoneSbp: null,
        gender: state.gender, birthDate,
        tin: null,
        placeOfBirthCountryId: state.placeOfBirthCountryId || null,
        nationalityCountryId: state.nationalityCountryId || null,
        residenceCountryId: state.residenceCountryId || null,
        addresses: [],
        kycConfigName: null, kycLevel: null, kycStatus: "NOT_CONNECTED",
        kycLevelStatuses: [], kycStepStatuses: [], verificationChecks: [],
        blockReasons: null, scoringProfile: null, linkedCompanies: [], documents: [],
      };
      CLIENTS_USERS_MOCK.unshift(newUser);
      closeModal();
      showToast(c.done);
      window.location.hash = `#/clients-users/${newUser.id}`;
    });
  }

  openModal({
    title: c.title,
    width: 560,
    bodyHtml: `${ucStepperHtml(1)}${stepBodyHtml()}`,
    footerHtml: footerHtmlFor(),
    onMount: (modalEl) => bind(modalEl),
  });
}

// ---- Содержимое вкладки "KYC": слева степпер уровней + инфо (плоско, как в
// "Основном"), ниже — Адреса и Документы; справа — карточка "Проверки"
// (verificationChecks) с деталями по кнопке -----------------------------------------
function renderClientDetailKycTab(user) {
  const cd = t("clientDetail");
  // Степпер уже несёт всю нужную инфу: уровень (кружки + ссылка на текущий конфиг
  // внутри renderKycLevelStepper) и статус (бейдж под каждым уровнем) — отдельный
  // список полей под ним был бы чистым дублированием, поэтому его тут нет.
  return `
    <div class="client-detail-grid">
      <div class="client-detail-grid-main">
        <div class="profile-flat-block">
          <div class="profile-flat-section">
            <div class="kyc-actions-row">
              <button type="button" class="profile-flat-edit" id="cd-kyc-status-change">${EDIT_ICON_SVG}<span>${cd.kycChangeStatus}</span></button>
            </div>
            ${renderKycLevelStepper(user)}
          </div>
          ${renderAddressesCard(user)}
          ${renderDocumentsCard(user)}
        </div>
      </div>
      <div class="client-detail-grid-side">
        ${renderChecksCard(user)}
      </div>
    </div>
  `;
}

// ---- Вкладка "Счета" — те же записи, что в общем разделе "Счета" (ACCOUNTS_VIRTUAL_MOCK/
// ACCOUNTS_REAL_MOCK, assets/mock/accounts.mock.js: accClientRef уже линкует часть счетов
// на конкретных клиентов при генерации мока), просто отфильтрованные по этому клиенту —
// один и тот же счёт, одна и та же ссылка на страницу счёта (accHref). Поиск/фильтры/
// пагинация — общая заготовка createAccessList (views/settings-access.js), та же, на
// которой стоит весь остальной список "Счета" — namespace прежний: cfg.noCard убирает
// внешнюю карточку (здесь список уже внутри карточки клиента, своя обёртка не нужна).
// В API нет метода удаления счёта (docs/accounts-spec.md, п.9) — только смена статуса:
// заморозить (ACTIVE→FROZEN), закрыть (→CLOSED), разморозить/активировать (→ACTIVE).
const SNOWFLAKE_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5v15M4 5.5l12 9M16 5.5 4 14.5"/><path d="m7.3 4 2.7-1.5L12.7 4M7.3 16l2.7 1.5L12.7 16M4 8l-1.5 2L4 12M16 8l1.5 2L16 12"/></svg>`;
const LOCK_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9"/></svg>`;
const PLAY_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5v11l9-5.5-9-5.5Z"/></svg>`;

function getClientVirtualAccounts(user) {
  return ACCOUNTS_VIRTUAL_MOCK.filter((a) => a.client && a.client.id === user.id);
}

function getClientRealAccounts(user) {
  return ACCOUNTS_REAL_MOCK.filter((a) => a.client && a.client.id === user.id);
}

// Под ID — описание счёта (свободный текст из схемы), если оно есть
function vabsAccountIdCell(acc) {
  return `<div class="identity-cell">
    <div class="identity-cell-primary">
      <button type="button" class="table-link" data-acc-hash="${accHref(acc)}">${acc.code}</button>
      ${copyIconButton(acc.code)}
    </div>
    ${acc.description ? `<span class="table-cell-muted">${pdEscape(acc.description)}</span>` : ""}
  </div>`;
}

function vabsAccountBalanceCell(balances) {
  if (!balances.length) return `<span class="table-cell-muted">—</span>`;
  const main = [...balances].sort((a, b) => b.total - a.total)[0];
  return `${formatPaymentAmount(main.total)} ${main.currency}`;
}

function vabsAccountCurrenciesCell(balances) {
  if (!balances.length) return `<span class="table-cell-muted">—</span>`;
  const codes = balances.map((b) => b.currency);
  if (codes.length <= 2) return codes.join(", ");
  // Полный список — в кастомном тултипе (attachCustomTooltips вешается в attachRows списка счетов)
  return `<span class="has-tooltip" data-tooltip="${escapeAttr(codes.join(", "))}">${codes.slice(0, 2).join(", ")}, +${codes.length - 2}</span>`;
}

function vabsAccountActionsMenu(acc) {
  const cd = t("clientDetail");
  const items = [];
  if (acc.status === "ACTIVE") items.push({ label: cd.accFreeze, icon: SNOWFLAKE_ICON_SVG, attrs: `data-acc-action="freeze:${acc.id}"` });
  if (["ACTIVE", "FROZEN", "DISABLED"].includes(acc.status)) items.push({ label: cd.accClose, icon: LOCK_ICON_SVG, attrs: `data-acc-action="close:${acc.id}"`, danger: true });
  if (["FROZEN", "DISABLED"].includes(acc.status)) items.push({ label: cd.accActivate, icon: PLAY_ICON_SVG, attrs: `data-acc-action="activate:${acc.id}"` });
  return items.length ? rowKebabMenu(`acc-${acc.id}`, items) : "";
}

// Кэш инстансов createAccessList на текущего открытого клиента — пересоздаются
// только при смене клиента, иначе поиск/фильтры сбрасывались бы на каждый рендер.
let clientAccountsListsCache = null;

function buildClientAccountsList(kind, user) {
  const cd = t("clientDetail");
  const dataGetter = kind === "virtual" ? () => getClientVirtualAccounts(user) : () => getClientRealAccounts(user);

  const list = createAccessList({
    key: `cd-acc-${kind}-${user.id}`,
    noCard: true,
    noDivider: true,
    data: dataGetter,
    searchPlaceholder: () => cd.accSearchPlaceholder,
    searchText: (a) => a.id,
    filters: [
      {
        id: "status",
        kind: "multi",
        label: () => cd.accColumns.status,
        get: (a) => a.status,
        options: () => ACC_STATUSES.map((s) => ({ value: s, label: accEnum("status", s) })),
      },
      {
        id: "currency",
        kind: "multi",
        label: () => cd.accColumns.currencies,
        get: (a) => a.balances.map((b) => b.currency),
        options: () => [...new Set(dataGetter().flatMap((a) => a.balances.map((b) => b.currency)))].map((c) => ({ value: c, label: c })),
      },
    ],
    columns: [
      { label: () => cd.accColumns.id, html: (a) => vabsAccountIdCell(a) },
      { label: () => cd.accColumns.balance, html: (a) => vabsAccountBalanceCell(a.balances) },
      { label: () => cd.accColumns.currencies, html: (a) => vabsAccountCurrenciesCell(a.balances) },
      { label: () => cd.accColumns.status, html: (a) => accStatusBadge(a.status) },
      { label: () => "", html: (a) => vabsAccountActionsMenu(a) },
    ],
    defaultSort: (a, b) => b.createdDate - a.createdDate,
    sorts: {},
    attachRows: (wrap) => {
      wrap.querySelectorAll("[data-acc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.accHash; }));
      attachCustomTooltips(wrap);
      wrap.querySelectorAll("[data-acc-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const [action, accId] = btn.dataset.accAction.split(":");
          const acc = dataGetter().find((a) => a.id === accId);
          if (!acc) return;
          if (action === "freeze") acc.status = "FROZEN";
          else if (action === "close") acc.status = "CLOSED";
          else if (action === "activate") acc.status = "ACTIVE";
          list.refresh();
        });
      });
    },
  });

  return list;
}

function ensureClientAccountsLists(user) {
  if (!clientAccountsListsCache || clientAccountsListsCache.userId !== user.id) {
    clientAccountsListsCache = {
      userId: user.id,
      virtual: buildClientAccountsList("virtual", user),
    };
  }
  return clientAccountsListsCache;
}

// Вкладка "Счета": клиенту показываем только его счета (в БД это виртуальные счета) — без
// слов "виртуальные/реальные": для клиента других счетов не существует. Выгрузка — все счета клиента.
function renderClientDetailAccountsTab(entity, kind = "user") {
  const cd = t("clientDetail");
  const lists = ensureClientAccountsLists(entity);
  return `
    <div class="acc-list-block">
      <div class="acc-tab-head">
        <div class="profile-flat-section-desc">${cd.accTabDesc[kind]}</div>
        ${exportMenuHtml("cd-acc-export", cd.accExport.button, cd.accExport.hint[kind])}
      </div>
      ${lists.virtual.view()}
    </div>
  `;
}

function getClientExportAccounts(entity) {
  return getClientVirtualAccounts(entity);
}

// Одна строка на баланс (счёт × валюта): в таблице удобнее фильтровать и суммировать
function exportClientAccounts(entity, kind, format) {
  const x = t("clientDetail.accExport");
  const accounts = getClientExportAccounts(entity);
  const rows = [];
  accounts.forEach((a) => {
    const base = [a.code, a.description || "", accEnum("status", a.status)];
    const tail = [a.createdAt];
    if (!a.balances.length) rows.push([...base, "", "", "", "", ...tail]);
    a.balances.forEach((b) => rows.push([...base, b.currency, b.total, b.hold, b.available, ...tail]));
  });
  exportTable(`accounts_${entity.code}_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(accounts.length));
}

function bindClientAccountsExport(entity, kind) {
  bindExportMenu("cd-acc-export", (format) => exportClientAccounts(entity, kind, format));
}

// ---- Вкладка "Операции" — та же таблица, что и на страницах "Операции → Платежи/Крипто/Обмены/ОТС", только
// отфильтрованная по этому клиенту (отправитель/получатель платежа, сторона обмена, продавец/покупатель ОТС-сделки),
// с разбивкой на такие же вкладки по виду операции. Ячейки — те же функции, что и в самих разделах (operations-
// payments.js/operations-exchanges.js/operations-otc.js), поэтому вид строк один в один; чекбоксы массового
// выделения и объёмные модалки одобрения/отклонения здесь не нужны — для них есть карточка самой операции
// (переход по клику, как и в основных разделах).
function csClientPayments(entity) {
  return OPERATIONS_PAYMENTS_MOCK.filter((r) => r.senderClientId === entity.id || r.recipientClientId === entity.id);
}
function csClientExchanges(entity) {
  return OPERATIONS_EXCHANGES_MOCK.filter((r) => r.senderClientId === entity.id);
}
// ОТС-сделки — только у физлиц (VabsOtcDeal: sellerUserId/buyerUserId из identity, у компаний своих сделок нет)
function csClientOtcDeals(entity) {
  return OTC_DEALS_MOCK.filter((d) => d.sellerUserId === entity.id || d.buyerUserId === entity.id);
}
function getClientOperations(entity) {
  return [...csClientPayments(entity), ...csClientExchanges(entity), ...csClientOtcDeals(entity)];
}

// Единая сводка по операции для мест, где нужна ОДНА строка независимо от вида (пилюля в шапке — счётчик,
// печать карточки в PDF): вид определяем по форме записи — своих полей у трёх видов нет, зато есть уникальные
// (referenceNumber — только у ОТС, exchangeRate — только у обмена).
function csOpSummary(row, entity) {
  const cd = t("clientDetail.opsTabs");
  if (row.referenceNumber !== undefined) {
    return { id: row.id, kind: cd.otc, amount: `${row.amount} ${row.baseCurrencyTicker} → ${row.cost} ${row.quoteCurrencyTicker}`, status: otcEnum("status", row.status), createdAt: row.createdAt, createdDate: row.createdDate };
  }
  if (row.exchangeRate !== undefined) {
    return { id: row.id, kind: cd.exchanges, amount: `${row.sourceAmount} ${row.sourceCurrency} → ${row.targetAmount} ${row.targetCurrency}`, status: paymentStatusLabel(row.status), createdAt: row.createdAt, createdDate: row.createdDate };
  }
  return { id: row.id, kind: cd[isCryptoPayment(row) ? "crypto" : "fiat"], amount: `${row.sourceAmount} ${row.sourceCurrency}`, status: paymentStatusLabel(row.status), createdAt: row.createdAt, createdDate: row.createdDate };
}

const CS_OPS_KINDS = ["fiat", "crypto", "exchanges", "otc"];
let csOpsSubTab = "fiat";
let clientOpsListsCache = null;

function csPaymentAmountHtml(row) {
  const isExchangeAmount = row.sourceCurrency !== row.targetCurrency;
  const amountHtml = isExchangeAmount
    ? `${formatPaymentAmount(row.sourceAmount)} ${row.sourceCurrency} → ${formatPaymentAmount(row.targetAmount)} ${row.targetCurrency}`
    : `${formatPaymentAmount(row.sourceAmount)} ${row.sourceCurrency}`;
  return `${amountHtml}${row.cryptoWallet ? ` <span class="badge badge-neutral">${row.cryptoWallet.networkName}</span>` : ""}`;
}

function buildClientPaymentsList(entity, crypto) {
  const dataGetter = () => csClientPayments(entity).filter((r) => isCryptoPayment(r) === crypto);
  const cols = () => t("operationsPayments.columns");
  return createAccessList({
    key: `cd-pay-${crypto ? "crypto" : "fiat"}-${entity.id}`,
    noCard: true,
    noDivider: true,
    data: dataGetter,
    searchPlaceholder: () => t("clientDetail.opsSearch"),
    searchText: (r) => [r.id, r.senderClientName, r.recipientClientName, r.externalOperationId].filter(Boolean).join(" "),
    filters: [
      { id: "status", kind: "multi", label: () => cols().status, get: (r) => r.status, options: () => Object.keys(t("paymentStatus")).map((v) => ({ value: v, label: t(`paymentStatus.${v}`) })) },
      { id: "created", kind: "date", label: () => t("clientDetail.opsFilters.created"), get: (r) => r.createdDate },
    ],
    columns: [
      { label: () => cols().directionSystem, html: (r) => paymentOperationCellHtml(r) },
      { label: () => cols().parties, html: (r) => paymentPartiesCellHtml(r) },
      { label: () => cols().amount, html: (r) => csPaymentAmountHtml(r) },
      { label: () => cols().riskLevel, html: (r) => paymentRiskLevelCellHtml(r) },
      { label: () => cols().status, html: (r) => `<span class="badge ${paymentStatusBadgeClass(r.status)}">${paymentStatusLabel(r.status)}</span>` },
      { label: () => cols().createdAt, sort: "created", html: (r) => dateTimeCell(r.createdAt) },
      { label: () => cols().settledAt, html: (r) => (r.settledAt ? dateTimeCell(r.settledAt) : `<span class="table-cell-muted">${t("operationsPayments.noValue")}</span>`) },
    ],
    defaultSort: (a, b) => b.createdDate - a.createdDate,
    sorts: { created: (a, b) => a.createdDate - b.createdDate },
    attachRows: (wrap) => {
      wrap.querySelectorAll(".payment-link").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/operations-payments/${b.dataset.paymentId}`; }));
      wrap.querySelectorAll("[data-party-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.partyHash; }));
      wrap.querySelectorAll(".id-copy, .copy-icon-btn").forEach((b) => b.addEventListener("click", () => copyTextToClipboard(b.dataset.copyValue).then(() => flashCopied(b))));
    },
  });
}

// Обмен — один и тот же клиент по обе стороны (см. комментарий в operations-exchanges.js), поэтому
// колонка одна — "Клиент", а не отправитель/получатель.
function buildClientExchangesList(entity) {
  const dataGetter = () => csClientExchanges(entity);
  const cols = () => t("operationsExchanges.columns");
  return createAccessList({
    key: `cd-exch-${entity.id}`,
    noCard: true,
    noDivider: true,
    data: dataGetter,
    searchPlaceholder: () => t("clientDetail.opsSearch"),
    searchText: (r) => [r.id, r.senderClientName].filter(Boolean).join(" "),
    filters: [
      { id: "status", kind: "multi", label: () => cols().status, get: (r) => r.status, options: () => Object.keys(t("paymentStatus")).map((v) => ({ value: v, label: t(`paymentStatus.${v}`) })) },
      { id: "created", kind: "date", label: () => t("clientDetail.opsFilters.created"), get: (r) => r.createdDate },
    ],
    columns: [
      {
        label: () => cols().amount,
        html: (r) => `<div class="identity-cell"><div class="identity-cell-primary"><button type="button" class="table-link payment-link" data-payment-id="${r.id}">${cols().amount}</button></div><div class="identity-cell-sub"><span class="identity-cell-tag">${t("clientsUsers.idTag")}</span><button type="button" class="id-copy" data-copy-value="${r.code}" title="${t("clientsUsers.copy")}"><span class="id-copy-label">${r.code}</span>${COPY_ICON_SVG}</button></div></div>`,
      },
      { label: () => cols().sum, html: (r) => exchangeAmountCellHtml(r) },
      { label: () => cols().client, html: (r) => paymentClientCellHtml(r, "sender", { noAccount: true }) },
      { label: () => cols().rate, html: (r) => r.exchangeRate },
      { label: () => cols().status, html: (r) => `<span class="badge ${paymentStatusBadgeClass(r.status)}">${paymentStatusLabel(r.status)}</span>` },
      { label: () => cols().createdAt, sort: "created", html: (r) => dateTimeCell(r.createdAt) },
      { label: () => cols().settledAt, html: (r) => (r.settledAt ? dateTimeCell(r.settledAt) : `<span class="table-cell-muted">${t("operationsExchanges.noValue")}</span>`) },
    ],
    defaultSort: (a, b) => b.createdDate - a.createdDate,
    sorts: { created: (a, b) => a.createdDate - b.createdDate },
    attachRows: (wrap) => {
      wrap.querySelectorAll(".payment-link").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/operations-exchanges/${b.dataset.paymentId}`; }));
      wrap.querySelectorAll("[data-party-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.partyHash; }));
      wrap.querySelectorAll(".id-copy, .copy-icon-btn").forEach((b) => b.addEventListener("click", () => copyTextToClipboard(b.dataset.copyValue).then(() => flashCopied(b))));
    },
  });
}

// Продавца/покупателя тут не показываем оба сразу (в общем списке ОТС — да) — один из них всегда этот
// самый клиент, полезнее его роль в сделке и вторая сторона (контрагент).
function buildClientOtcList(entity) {
  const dataGetter = () => csClientOtcDeals(entity);
  return createAccessList({
    key: `cd-otc-${entity.id}`,
    noCard: true,
    noDivider: true,
    data: dataGetter,
    searchPlaceholder: () => ot("search"),
    searchText: (d) => [d.referenceNumber, d.id, d.sellerEmail, d.buyerEmail, d.comment, d.paymentId].filter(Boolean).join(" "),
    filters: [
      { id: "status", kind: "multi", label: () => ot("filters.status"), get: (d) => d.status, options: () => OTC_DEAL_STATUSES.map((v) => ({ value: v, label: otcEnum("status", v) })) },
      { id: "created", kind: "date", label: () => ot("filters.created"), get: (d) => d.createdDate },
    ],
    defaultSort: (a, b) => b.createdDate - a.createdDate,
    sorts: { created: (a, b) => a.createdDate - b.createdDate },
    columns: [
      { label: () => ot("columns.deal"), html: otcDealCell },
      { label: () => ot("columns.type"), html: (d) => `<span class="badge badge-neutral">${otcEnum("type", d.type)}</span>` },
      { label: () => t("clientDetail.opsColumns.role"), html: (d) => (d.sellerUserId === entity.id ? ot("roles.seller") : ot("roles.buyer")) },
      {
        label: () => t("clientDetail.opsColumns.counterparty"),
        html: (d) => (d.sellerUserId === entity.id ? otcPartyCell(d.buyerUserId, d.buyerName, d.buyerEmail) : otcPartyCell(d.sellerUserId, d.sellerName, d.sellerEmail)),
      },
      { label: () => ot("columns.amount"), html: (d) => `<div class="identity-cell"><span class="otc-deal-line">${otcAmountLine(d.amount, d.baseCurrencyTicker, d.baseNetworkName)}<span class="otc-arrow">→</span>${otcAmountLine(d.cost, d.quoteCurrencyTicker, d.quoteNetworkName)}</span><span class="table-cell-muted">${otcPriceText(d)}</span></div>` },
      { label: () => ot("columns.status"), html: otcStatusCell },
      { label: () => ot("columns.created"), sort: "created", html: (d) => dateTimeCell(d.createdAt) },
    ],
    attachRows: (wrap) => {
      wrap.querySelectorAll("[data-otc-open]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/operations-otc/${b.dataset.otcOpen}`; }));
      wrap.querySelectorAll("[data-otc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.otcHash; }));
      wrap.querySelectorAll(".id-copy, .copy-icon-btn").forEach((b) => b.addEventListener("click", () => copyTextToClipboard(b.dataset.copyValue).then(() => flashCopied(b))));
    },
  });
}

function ensureClientOpsLists(entity) {
  if (!clientOpsListsCache || clientOpsListsCache.entityId !== entity.id) {
    csOpsSubTab = "fiat";
    clientOpsListsCache = {
      entityId: entity.id,
      fiat: buildClientPaymentsList(entity, false),
      crypto: buildClientPaymentsList(entity, true),
      exchanges: buildClientExchangesList(entity),
      otc: buildClientOtcList(entity),
    };
  }
  return clientOpsListsCache;
}

function renderClientDetailOperationsTab(entity, kind = "user") {
  const cd = t("clientDetail");
  const counts = {
    fiat: csClientPayments(entity).filter((r) => !isCryptoPayment(r)).length,
    crypto: csClientPayments(entity).filter(isCryptoPayment).length,
    exchanges: csClientExchanges(entity).length,
    otc: csClientOtcDeals(entity).length,
  };
  return `
    <div class="acc-list-block">
      <div class="acc-tab-head">
        <div>
          <div class="acc-list-heading">${cd.opSectionTitle}</div>
          <div class="profile-flat-section-desc">${cd.opSectionDesc}</div>
        </div>
        ${exportMenuHtml("cd-ops-export", cd.opExport.button, cd.opExport.hint[kind])}
      </div>
      <div class="quick-tabs">${CS_OPS_KINDS.map((k) => `<button type="button" class="quick-tab${csOpsSubTab === k ? " is-active" : ""}" data-cs-ops-tab="${k}">${cd.opsTabs[k]}<span class="quick-tab-count">${counts[k]}</span></button>`).join("")}</div>
      <div id="cs-ops-body">${ensureClientOpsLists(entity)[csOpsSubTab].view()}</div>
    </div>
  `;
}

// Выгружается активная вкладка целиком (фильтры и поиск списка не учитываются), одна строка — одна операция;
// у каждого вида операций свой набор колонок — как и в соответствующем разделе "Операции".
function exportClientOps(entity, kindTab, format) {
  const x = t("clientDetail.opExport");
  let cols, rows, count;
  if (kindTab === "fiat" || kindTab === "crypto") {
    const pc = t("operationsPayments.columns");
    const list = csClientPayments(entity).filter((r) => isCryptoPayment(r) === (kindTab === "crypto"));
    cols = ["ID", pc.parties, pc.amount, pc.status, pc.createdAt, pc.settledAt];
    rows = list.map((r) => [r.id, `${r.senderClientName || "—"} → ${r.recipientClientName || "—"}`, `${r.sourceAmount} ${r.sourceCurrency}`, paymentStatusLabel(r.status), r.createdAt, r.settledAt || ""]);
    count = list.length;
  } else if (kindTab === "exchanges") {
    const ec = t("operationsExchanges.columns");
    const list = csClientExchanges(entity);
    cols = ["ID", ec.client, ec.sum, ec.rate, ec.status, ec.createdAt, ec.settledAt];
    rows = list.map((r) => [r.id, r.senderClientName || "—", `${r.sourceAmount} ${r.sourceCurrency} → ${r.targetAmount} ${r.targetCurrency}`, r.exchangeRate, paymentStatusLabel(r.status), r.createdAt, r.settledAt || ""]);
    count = list.length;
  } else {
    const oc = ot("columns");
    const list = csClientOtcDeals(entity);
    cols = [oc.deal, oc.type, t("clientDetail.opsColumns.role"), t("clientDetail.opsColumns.counterparty"), oc.amount, oc.status, oc.created];
    rows = list.map((d) => [
      d.referenceNumber,
      otcEnum("type", d.type),
      d.sellerUserId === entity.id ? ot("roles.seller") : ot("roles.buyer"),
      d.sellerUserId === entity.id ? d.buyerName : d.sellerName,
      `${d.amount} ${d.baseCurrencyTicker} → ${d.cost} ${d.quoteCurrencyTicker}`,
      otcEnum("status", d.status),
      d.createdAt,
    ]);
    count = list.length;
  }
  exportTable(`operations_${kindTab}_${entity.id.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}`, format, cols, rows);
  showToast(x.done(count));
}

function attachClientOperationsTab(scope, entity, refresh) {
  scope.querySelectorAll("[data-cs-ops-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      csOpsSubTab = btn.dataset.csOpsTab;
      refresh();
    });
  });
  ensureClientOpsLists(entity)[csOpsSubTab].init();
  bindExportMenu("cd-ops-export", (format) => exportClientOps(entity, csOpsSubTab, format));
}

// ---- Вкладка "Тариф" — данные из того же TF_CLIENTS/settings-tariffs.mock.js
// (тот же id, что у CLIENTS_USERS_MOCK), но своя, плоская (без карточек) вёрстка:
// общая инфо + две отдельные таблицы — Лимиты и Комиссии. Без cross-join по
// валюте (одна операция может иметь лимит/комиссию в разных валютах — сводить
// их в одну строку только усложняло бы) — каждая таблица прямая проекция своей
// реальной сущности (tariffLimits / tariffCommissions), как в запросах.
function tfClientLimitRows(client, tariff) {
  const ops = tfTariffOpsOf(tariff.id).map((x) => tfOperationById(x.operationId)).filter(Boolean);
  const rows = [];
  ops.forEach((op) => (tfLimitsFor(client, op.name) || []).forEach((limit) => rows.push({ operation: op, limit })));
  return rows;
}

function tfClientCommissionRows(client, tariff) {
  const ops = tfTariffOpsOf(tariff.id).map((x) => tfOperationById(x.operationId)).filter(Boolean);
  const rows = [];
  ops.forEach((op) => (tfCommissionsFor(client, op.name) || []).forEach((commission) => rows.push({ operation: op, commission })));
  return rows;
}

// Клик по операции — переход в раздел "Настройки → Тарифы → Операции" (просмотр,
// без открытия формы редактирования). У операции нет отдельного адреса на одну
// запись (только список + форма), поэтому ведём на список — честнее, чем открывать
// форму редактирования, которую явно попросили убрать.
function tfOperationCell(operation) {
  return `<button type="button" class="table-link tf-op-link" data-acc-hash="#/settings-tariffs-operations">
    <span>${pdEscape(operation.name)}</span>${operation.description ? `<span class="table-cell-muted">${pdEscape(operation.description)}</span>` : ""}
  </button>`;
}

function tfLimitRowHtml({ operation, limit }) {
  const cur = limit.currencyTicker;
  return `
    <tr>
      <td>${tfOperationCell(operation)}</td>
      <td>${pdEscape(cur)}</td>
      <td>${tfNum(limit.min)}</td>
      <td>${tfNum(limit.max)}</td>
      <td>${tfNum(limit.daily)}</td>
      <td>${tfNum(limit.weekly)}</td>
      <td>${tfNum(limit.monthly)}</td>
      <td>${tfNum(limit.annual)}</td>
      <td><button type="button" class="icon-btn" data-acc-hash="#/settings-tariffs-limits/${limit.id}" title="${tf("clients.detail.openCard")}">${ARROW_RIGHT_ICON_SVG}</button></td>
    </tr>
  `;
}

function renderTariffLimitsTable(client, tariff) {
  const cd = t("clientDetail");
  const f = tf("fields");
  const rows = tfClientLimitRows(client, tariff);
  const bodyHtml = rows.length
    ? `<div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>${f.operation}</th><th>${f.currency}</th><th>${f.min}</th><th>${f.max}</th><th>${f.daily}</th><th>${f.weekly}</th><th>${f.monthly}</th><th>${f.annual}</th><th></th></tr></thead>
          <tbody>${rows.map(tfLimitRowHtml).join("")}</tbody>
        </table>
      </div>`
    : `<div class="table-cell-muted">${cd.tariffNoOperations}</div>`;

  return `<div class="tf-table-head"><div class="detail-section-title">${cd.tariffLimitsGroup}</div><div class="profile-flat-section-desc">${cd.tariffLimitsGroupDesc}</div></div>${bodyHtml}`;
}

// Показываем только первый по order фактор (обычно он и есть основная комиссия);
// ступенчатые факторы отдельно не разворачиваем — см. переписку.
function tfCommissionMainFactor(commission) {
  if (!commission.factors.length) return null;
  return [...commission.factors].sort((a, b) => a.order - b.order)[0];
}

function tfCommissionRowHtml({ operation, commission }) {
  const main = tfCommissionMainFactor(commission);
  const percent = main && main.percent != null ? `${main.percent} %` : "—";
  const fixed = main && main.fixed != null ? tfNum(main.fixed) : "—";

  return `
    <tr>
      <td>${tfOperationCell(operation)}</td>
      <td>${pdEscape(commission.currencyTicker)}</td>
      <td>${percent}</td>
      <td>${fixed}</td>
      <td><button type="button" class="icon-btn" data-acc-hash="#/settings-tariffs-commissions/${commission.id}" title="${tf("clients.detail.openCard")}">${ARROW_RIGHT_ICON_SVG}</button></td>
    </tr>
  `;
}

function renderTariffCommissionsTable(client, tariff) {
  const cd = t("clientDetail");
  const f = tf("fields");
  const rows = tfClientCommissionRows(client, tariff);
  const bodyHtml = rows.length
    ? `<div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>${f.operation}</th><th>${f.currency}</th><th>${f.percent}</th><th>${f.fixed}</th><th></th></tr></thead>
          <tbody>${rows.map((row) => tfCommissionRowHtml(row)).join("")}</tbody>
        </table>
      </div>`
    : `<div class="table-cell-muted">${cd.tariffNoOperations}</div>`;

  return `<div class="tf-table-head"><div class="detail-section-title">${cd.tariffCommissionGroup}</div><div class="profile-flat-section-desc">${cd.tariffCommissionGroupDesc}</div></div>${bodyHtml}`;
}

function renderClientDetailTariffTab(user) {
  const cd = t("clientDetail");
  const f = tf("fields");
  const c = tfClientById(user.id);
  if (!c) {
    return `
      <div class="acc-list-block">
        <div class="acc-list-heading">${cd.tariffSectionTitle}</div>
        <div class="profile-flat-section-desc">${cd.tariffSectionDesc}</div>
        <div class="table-cell-muted">${cd.tariffNotFound}</div>
      </div>
    `;
  }
  const tariff = tfTariffById(c.tariffId);

  return `
    <div class="acc-list-block">
      <div class="acc-list-heading">${cd.tariffSectionTitle}</div>
      <div class="profile-flat-section-desc">${cd.tariffSectionDesc}</div>
      <div class="profile-fields profile-fields-grid profile-fields-grid-3">
        ${detailField(f.tariff, `<a class="table-link" href="#/settings-tariffs-catalog/${tariff.id}">${pdEscape(tariff.name)}</a>`)}
        ${detailField(f.updated, pdEscape(tariff.updatedAt))}
        ${detailField(f.billing, tfDate(c.billingPeriod))}
        ${detailField(f.description, tariff.description ? pdEscape(tariff.description) : "—")}
      </div>
    </div>
    <div class="acc-list-block">
      ${renderTariffLimitsTable(c, tariff)}
    </div>
    <div class="acc-list-block">
      ${renderTariffCommissionsTable(c, tariff)}
    </div>
  `;
}

// ---- Вкладка "KYT" — AML/KYT-проверки этого клиента (KYT_TRANSACTIONS, тот же
// список, что и "Безопасность → AML-проверки", отфильтрованный по client.id).
// Колонки/фильтры/детальная страница — переиспользованы из security-kyt.js один
// в один, ничего своего не придумываю.
function getClientKytChecks(user) {
  return KYT_TRANSACTIONS.filter((x) => x.client && x.client.id === user.id);
}

let clientKytListCache = null;

function buildClientKytList(user) {
  const dataGetter = () => getClientKytChecks(user);

  return createAccessList({
    key: `cd-kyt-${user.id}`,
    noCard: true,
    noDivider: true,
    data: dataGetter,
    searchPlaceholder: () => kt("checks.search"),
    searchText: (x) => [x.id, x.trackerId, x.data.address, x.data.transaction].filter(Boolean).join(" "),
    tab: { get: (x) => x.status, values: KYT_STATUSES, label: (v) => ktStatusLabel(v) },
    filters: [
      { id: "created", kind: "date", label: () => kt("filters.created"), get: (x) => x.createdDate },
      { id: "config", kind: "multi", label: () => kt("filters.config"), get: (x) => x.configId, options: () => [...new Map(dataGetter().map((x) => [x.configId, x.configId])).keys()].map((id) => ({ value: id, label: ktCfgLabel(ktConfigById(id)) })) },
      { id: "risk", kind: "multi", label: () => kt("filters.risk"), get: (x) => x.steps[0].riskClass || "", options: () => KYT_RISK_CLASSES.map((v) => ({ value: v, label: kt(`enums.risk.${v}`) })) },
    ],
    defaultSort: (a, b) => b.createdDate - a.createdDate,
    sorts: { created: (a, b) => a.createdDate - b.createdDate, updated: (a, b) => a.updatedDate - b.updatedDate },
    columns: [
      { label: () => kt("columns.id"), html: (x) => `<div class="identity-cell-primary">${vbLink(`#/security-aml-checks/${x.id}`, pdShort(x.id))}${copyIconButton(x.id)}</div>` },
      { label: () => kt("columns.config"), html: (x) => { const c = ktConfigById(x.configId); return c ? vbLink(`#/settings-kyt-configs/${c.id}`, pdEscape(c.name)) : "—"; } },
      { label: () => kt("columns.created"), sort: "created", html: (x) => dateTimeCell(x.createdAt) },
      { label: () => kt("columns.updated"), sort: "updated", html: (x) => dateTimeCell(x.updatedAt) },
      { label: () => kt("columns.status"), html: (x) => ktStatusBadge(x.status) },
      { label: () => kt("columns.totalScore"), html: (x) => (x.totalScore === null ? "—" : x.totalScore) },
      { label: () => kt("columns.trackerId"), html: (x) => (x.trackerId ? `<span class="vb-mono">${pdEscape(x.trackerId)}</span>` : "—") },
      { label: () => kt("columns.error"), html: (x) => slTrunc(x.errorMessage, true) },
    ],
    attachRows: vbAttachRows,
  });
}

function ensureClientKytList(user) {
  if (!clientKytListCache || clientKytListCache.userId !== user.id) {
    clientKytListCache = { userId: user.id, list: buildClientKytList(user) };
  }
  return clientKytListCache.list;
}

function renderClientDetailKytTab(user) {
  const cd = t("clientDetail");
  return `
    <div class="acc-list-block">
      <div class="acc-list-heading">${cd.kytSectionTitle}</div>
      <div class="profile-flat-section-desc">${cd.kytSectionDesc}</div>
      ${ensureClientKytList(user).view()}
    </div>
  `;
}

// ---- Вкладка "Компании" — обратная сторона вкладки "Сотрудники" на карточке компании (clients-companies.js):
// то же ребро CompanyMember (type/accessRoles/positions/share), только строкой идёт компания, а не человек.
// Действия (изменить/удалить) переиспользуют coOpenEditEmployeeModal/coConfirmRemoveEmployee один в один —
// это тот же member-объект, просто открыт с другой стороны.
function companiesOfUser(user) {
  return CLIENTS_COMPANIES_MOCK.filter((c) => (c.members || []).some((m) => m.userId === user.id)).map((company) => ({
    company,
    member: company.members.find((m) => m.userId === user.id),
  }));
}

function renderClientDetailCompaniesTab(user) {
  const e = t("companyDetail.employees");
  const ct = t("clientDetail.companiesTab");
  const pairs = companiesOfUser(user);
  const rows = pairs.map(({ company, member }) => [
    `<div class="identity-cell"><button type="button" class="table-link" data-company-id="${company.id}">${pdEscape(company.name)}</button>${company.currentKYBLevelStatusV2 ? `<div class="table-cell-muted">${kybStatusLabel(company.currentKYBLevelStatusV2.status)}</div>` : ""}</div>`,
    e.type[member.type] || member.type,
    coAccessRoleBadges(member),
    member.positions.length ? pdEscape(member.positions.join(", ")) : e.noPositions,
    member.share != null ? `${member.share}%` : e.noShare,
    rowKebabMenu(`ucomp-${member.id}`, [
      { label: e.edit, icon: EDIT_ICON_SVG, attrs: `data-ucomp-edit="${escapeAttr(member.id)}"` },
      { label: e.remove, icon: TRASH_ICON_SVG, attrs: `data-ucomp-remove="${escapeAttr(member.id)}"`, danger: true },
    ]),
  ]);
  const table = vbMiniTable([ct.columnCompany, e.columns.type, e.columns.access, e.columns.positions, e.columns.share, ""], rows, ct.empty);
  const addBtn = `<button type="button" class="profile-flat-edit" id="ucomp-add">${PLUS_ICON_SVG}<span>${ct.add}</span></button>`;
  return `<div class="profile-flat-block">${flatSection(`${ct.title} · ${pairs.length}`, table, null, ct.desc, addBtn)}</div>`;
}

function ucompCandidateOptions(user, query) {
  const q = query.trim().toLowerCase();
  const memberCompanyIds = new Set(companiesOfUser(user).map((p) => p.company.id));
  const list = CLIENTS_COMPANIES_MOCK.filter((c) => !memberCompanyIds.has(c.id));
  const filtered = !q ? list.slice(0, 20) : list.filter((c) => c.name.toLowerCase().includes(q));
  return filtered.slice(0, 20);
}

function ucompCandidateListHtml(user, query) {
  const ct = t("clientDetail.companiesTab");
  const options = ucompCandidateOptions(user, query);
  if (!options.length) return `<div class="table-cell-muted filter-search-empty">${ct.pickCompanyEmpty}</div>`;
  return options.map((c) => `<button type="button" class="filter-search-item" data-ucomp-pick="${c.id}">${pdEscape(c.name)}</button>`).join("");
}

function openAddToCompanyModal(user) {
  const e = t("companyDetail.employees");
  const ct = t("clientDetail.companiesTab");
  const state = { company: null };
  const draftMember = () => coMakeMember(state.company.id, user, { type: "director", accessRoles: [], positions: [], share: null });

  openModal({
    title: ct.add,
    width: 480,
    bodyHtml: `
      <div class="filters-field">
        <span class="filters-field-label">${ct.pickCompanyTitle}</span>
        <div class="pc-client-picker">
          <div class="pc-client-search" id="ucomp-pick-search-wrap">
            <input type="text" class="address-form-input" id="ucomp-pick-search" placeholder="${ct.pickCompanySearch}" autocomplete="off" />
            <div class="filter-search-list pc-client-list" id="ucomp-pick-list">${ucompCandidateListHtml(user, "")}</div>
          </div>
        </div>
      </div>
    `,
    footerHtml: `<button type="button" class="btn-secondary" id="ucomp-cancel">${e.cancel}</button><button type="button" class="btn-primary" id="ucomp-save" disabled>${e.save}</button>`,
    onMount: (el) => {
      el.querySelector("#ucomp-cancel").addEventListener("click", closeModal);
      const searchInput = el.querySelector("#ucomp-pick-search");
      const listEl = el.querySelector("#ucomp-pick-list");
      const bindPicks = () => {
        listEl.querySelectorAll("[data-ucomp-pick]").forEach((btn) => {
          btn.addEventListener("click", () => {
            state.company = CLIENTS_COMPANIES_MOCK.find((c) => c.id === btn.dataset.ucompPick);
            if (!state.company) return;
            el.querySelector(".modal-body").innerHTML = `<p class="modal-confirm-text">${pdEscape(state.company.name)}</p>${coEmployeeFieldsHtml(draftMember())}`;
            el.querySelector("#ucomp-save").disabled = false;
          });
        });
      };
      searchInput.addEventListener("input", () => {
        listEl.innerHTML = ucompCandidateListHtml(user, searchInput.value);
        bindPicks();
      });
      bindPicks();
      el.querySelector("#ucomp-save").addEventListener("click", () => {
        if (!state.company) return;
        const data = coReadEmployeeForm(el);
        closeModal();
        requireAdmin2fa("company_member_manage", () => {
          state.company.members.push(coMakeMember(state.company.id, user, data));
          showToast(e.addedToast);
          updateClientDetailView(user);
        });
      });
    },
  });
}

// ---- Вкладка "Риск и скоринг" — personal.scoringProfile целиком: уровень, итоговый балл и все флаги
// проверки (не только включённые, как в боковой карточке) — реальные поля, см. renderRiskScoringCard.
function renderClientDetailRiskTab(user) {
  const cd = t("clientDetail");
  const rt = cd.riskTab;
  const p = user.scoringProfile;
  if (!p) return `<div class="profile-flat-block">${flatSection(rt.title, `<div class="table-cell-muted">${rt.noLevel}</div>`, null, rt.desc)}</div>`;
  const body = `
    <div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${detailField(rt.level, p.scoringRiskLevel ? `<span class="badge ${riskLevelBadgeClass(p.scoringRiskLevel)}">${riskLevelLabel(p.scoringRiskLevel)}</span>` : rt.noLevel)}
      ${detailField(rt.score, p.totalScore != null ? String(p.totalScore) : "—")}
    </div>
    <div class="risk-flags-heading">${rt.flagsTitle}</div>
    <div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${["isPep", "isUsa", "isFamilyMemberPep", "sanctionList", "adverseMedia"].map((k) => detailField(rt.flags[k], `<span class="badge ${p[k] ? "badge-danger" : "badge-neutral"}">${p[k] ? rt.flagYes : rt.flagNo}</span>`)).join("")}
    </div>
  `;
  return `<div class="profile-flat-block">${flatSection(rt.title, body, null, rt.desc)}</div>`;
}

// ---- Изменение статуса KYC (mutation resetKYCLevelTo): сброс клиента на выбранный
// уровень/шаг с указанным статусом + обязательная причина и необязательный комментарий.
function openKycStatusChangeModal(user) {
  const cd = t("clientDetail");
  const rejectStatuses = ["REJECTED", "REJECTED_RETRY"];

  const stepsForLevel = (level) => KYC_STEPS_BY_LEVEL[level] || [];

  function stepOptionsHtml(level) {
    return stepsForLevel(level)
      .map((s) => `<option value="${s.step}">${s.name}</option>`)
      .join("");
  }

  const bodyHtml = `
    <p class="modal-confirm-text pd-modal-intro">${cd.kycChangeStatusHint}</p>
    <label class="filters-field">
      <span class="filters-field-label">${cd.kycTargetLevel}</span>
      <select class="address-form-input" id="cu-kyc-level">
        ${KYC_CONFIG_NAMES.filter((name) => KYC_LEVEL_BY_CONFIG_NAME[name] != null)
          .map((name) => `<option value="${name}"${user.kycConfigName === name ? " selected" : ""}>${kycLevelLabel(name)}</option>`)
          .join("")}
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cd.kycTargetStep}</span>
      <select class="address-form-input" id="cu-kyc-step">
        ${stepOptionsHtml(KYC_LEVEL_BY_CONFIG_NAME[user.kycConfigName] || 1)}
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cd.kycTargetStatus}</span>
      <select class="address-form-input" id="cu-kyc-status">
        ${rejectStatuses.map((s) => `<option value="${s}">${cd.kycRejectStatus[s]}</option>`).join("")}
      </select>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cd.kycRejectReason} *</span>
      <textarea class="form-textarea" id="cu-kyc-reason" rows="2"></textarea>
    </label>
    <label class="filters-field">
      <span class="filters-field-label">${cd.kycComment}</span>
      <textarea class="form-textarea" id="cu-kyc-comment" rows="2"></textarea>
    </label>
    <div class="form-error" id="cu-edit-error" hidden></div>
  `;

  openModal({
    title: cd.kycChangeStatusTitle,
    width: 480,
    bodyHtml,
    footerHtml: `
      <button type="button" class="btn-secondary" id="cu-edit-cancel">${cd.cancel}</button>
      <button type="button" class="btn-primary" id="cu-edit-save">${cd.save}</button>
    `,
    onMount: (modalEl) => {
      const err = modalEl.querySelector("#cu-edit-error");
      const levelSelect = modalEl.querySelector("#cu-kyc-level");
      const stepSelect = modalEl.querySelector("#cu-kyc-step");

      levelSelect.addEventListener("change", () => {
        stepSelect.innerHTML = stepOptionsHtml(KYC_LEVEL_BY_CONFIG_NAME[levelSelect.value]);
      });

      modalEl.querySelector("#cu-edit-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#cu-edit-save").addEventListener("click", () => {
        const reason = modalEl.querySelector("#cu-kyc-reason").value.trim();
        if (!reason) {
          err.textContent = cd.errRejectReason;
          err.hidden = false;
          return;
        }

        const targetConfigName = levelSelect.value;
        const targetLevel = KYC_LEVEL_BY_CONFIG_NAME[targetConfigName];
        const targetStepCode = stepSelect.value;
        const targetStatus = modalEl.querySelector("#cu-kyc-status").value;
        const comment = modalEl.querySelector("#cu-kyc-comment").value.trim() || null;

        user.kycConfigName = targetConfigName;
        user.kycLevel = targetLevel;
        user.kycStatus = targetStatus;
        user.kycLevelStatuses = [1, 2, 3]
          .filter((lvl) => lvl <= targetLevel)
          .map((lvl) => ({ level: lvl, name: `Level ${lvl}`, status: lvl < targetLevel ? "SUCCESSFUL" : targetStatus }));

        const steps = stepsForLevel(targetLevel);
        const pivotIdx = Math.max(0, steps.findIndex((s) => s.step === targetStepCode));
        user.kycStepStatuses = steps.map((s, idx) => ({
          step: s.step,
          name: s.name,
          status: idx < pivotIdx ? "SUCCESSFUL" : idx === pivotIdx ? targetStatus : "NOT_CONNECTED",
          executedAt: idx <= pivotIdx ? new Date() : null,
          processedAt: idx === pivotIdx ? new Date() : null,
          rejectionReason: idx === pivotIdx ? reason : null,
          comment: idx === pivotIdx ? comment : null,
        }));

        closeModal();
        updateClientDetailView(user);
      });
    },
  });
}

// VerificationCheckStatusEnum → цвет точки статуса (свой набор, не переиспользует
// checkStatusBadgeClass — тут точка+текст, не бейдж-пилюля).
function checkStatusDotClass(status) {
  if (status === "PASSED") return "is-success";
  if (status === "FAILED" || status === "ERROR") return "is-danger";
  return "is-pending"; // RUNNING
}

// YYYY-MM-DD HH:MM — компактный формат для строки проверки (короче общего dd.mm.yy).
function formatCheckDateTime(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

// ---- Карточка "Проверки" (query verificationChecks, clientIds: [user.id]) — отдельная
// от шагов KYC сущность: технические вызовы провайдеров/самопроверок. Детали (запрос/
// ответ провайдера) не показываем инлайн — только по кнопке-иконке.
function renderChecksCard(user) {
  const cd = t("clientDetail");
  const checks = user.verificationChecks || [];

  const content = checks.length
    ? `<div class="checks-list">
        ${checks
          .map(
            (c) => `
              <div class="check-row">
                <div class="check-row-main">
                  <span class="check-row-name">${c.name}</span>
                  <span class="check-row-meta">${c.checkType} · ${formatCheckDateTime(c.createdAt)}</span>
                </div>
                <span class="check-row-status">
                  <span class="check-row-dot ${checkStatusDotClass(c.status)}"></span>
                  <span class="check-row-status-text">${checkStatusLabel(c.status)}</span>
                </span>
                <button type="button" class="check-row-info-btn" data-check-info="${c.id}" title="${cd.getCheckInfo}">${INFO_ICON_SVG}</button>
              </div>
            `
          )
          .join("")}
      </div>`
    : `<div class="table-cell-muted">${cd.noChecks}</div>`;

  return sectionCard(checks.length ? `${cd.sections.checks} (${checks.length})` : cd.sections.checks, content);
}

function openCheckDetailsModal(check) {
  const cd = t("clientDetail");
  const rows = [
    [cd.checkFields.provider, check.provider],
    [cd.checkFields.checkType, check.checkType],
    [cd.checkFields.status, `<span class="badge ${checkStatusBadgeClass(check.status)}">${checkStatusLabel(check.status)}</span>`],
    [cd.checkFields.createdAt, formatDateTime(check.createdAt)],
    [cd.checkFields.updatedAt, formatDateTime(check.updatedAt)],
  ];
  if (check.errorMessage) rows.push([cd.checkFields.errorMessage, check.errorMessage]);
  if (check.verificationMessage) rows.push([cd.checkFields.verificationMessage, check.verificationMessage]);

  const bodyHtml = `
    <div class="profile-fields">${rows.map(([label, value]) => detailField(label, value)).join("")}</div>
    <div class="detail-section-title">${cd.checkFields.request}</div>
    <pre class="pd-json">${pdEscape(JSON.stringify(check.request, null, 2))}</pre>
    <div class="detail-section-title">${cd.checkFields.response}</div>
    <pre class="pd-json">${pdEscape(JSON.stringify(check.response, null, 2))}</pre>
  `;

  openModal({
    title: cd.checkDetailsTitle,
    width: 560,
    bodyHtml,
    footerHtml: `<button type="button" class="btn-secondary" id="cu-check-close">${cd.close}</button>`,
    onMount: (modalEl) => {
      modalEl.querySelector("#cu-check-close").addEventListener("click", closeModal);
    },
  });
}

// ---- Вкладка "Безопасность" (физлицо и компания) ----------------------------------
// Блокировка — как в реальном API: blockUser/unblockUser (и blockCompany/
// unblockCompany) принимают { id, reasons: [String!]! }. Клиент заблокирован, пока
// в blockReasons есть хотя бы одна причина: блок добавляет причины (union),
// разблокировка убирает указанные (difference); пустой список причин ядро отклоняет.
// Смена пароля — только у физлица (у компании пароля нет).
function csIsBlocked(entity) {
  return !!(entity.blockReasons && entity.blockReasons.length);
}

function renderClientDetailSecurityTab(entity, kind) {
  const s = t("cSecurity");
  const blocked = csIsBlocked(entity);
  const blockBlock = flatSection(
    s.blockTitle,
    `<div class="cs-actions cs-actions-first">
       ${blocked ? `<button type="button" class="btn-primary" data-cs-unblock>${s.unblock}</button>` : `<button type="button" class="btn-danger" data-cs-block>${s.block}</button>`}
     </div>`,
    null,
    s.blockDesc[kind]
  );
  const passwordBlock =
    kind === "user"
      ? flatSection(s.passwordTitle, `<div class="cs-actions"><button type="button" class="btn-secondary" data-cs-reset>${KEY_ICON_SVG}<span>${s.resetPassword}</span></button></div>`, null, s.passwordDesc)
      : "";
  return `<div class="profile-flat-block cs-page">${blockBlock}${olSectionHtml(entity, kind)}${csSessionsSectionHtml(entity)}${passwordBlock}</div>`;
}

function csUpdateHeaderBadge(entity, kind) {
  const badge = document.querySelector(".client-detail-title-row .badge");
  if (!badge) return;
  const labels = t(kind === "user" ? "clientDetail" : "companyDetail");
  const blocked = csIsBlocked(entity);
  badge.className = `badge ${blocked ? "badge-danger" : "badge-success"}`;
  badge.textContent = blocked ? labels.blocked : labels.active;
}

// Блокировка/разблокировка — просто подтверждение. В API blockUser требует хотя бы
// одну причину, поэтому уходит фиксированная админская; снятие убирает все причины.
const CS_ADMIN_BLOCK_REASON = "Заблокирован администратором";

// Как назвать клиента в подтверждении: у физлица имя (иначе email), у компании — название
function csEntityLabel(entity, kind) {
  return pdEscape(kind === "user" ? entity.fullName || entity.email : entity.name);
}

function csOpenBlockModal(entity, kind, refresh) {
  const s = t("cSecurity");
  vbConfirm({
    title: s.blockConfirmTitle[kind], text: s.blockConfirmText[kind](csEntityLabel(entity, kind)), confirmLabel: s.block, danger: true,
    onConfirm: () => requireAdmin2fa("client_block", () => {
      entity.blockReasons = [CS_ADMIN_BLOCK_REASON];
      csUpdateHeaderBadge(entity, kind);
      refresh();
      showToast(t("toast.blocked")[kind]);
    }),
  });
}

function csOpenUnblockModal(entity, kind, refresh) {
  const s = t("cSecurity");
  vbConfirm({
    title: s.unblockConfirmTitle[kind], text: s.unblockConfirmText[kind](csEntityLabel(entity, kind)), confirmLabel: s.unblock, danger: false,
    onConfirm: () => requireAdmin2fa("client_unblock", () => {
      entity.blockReasons = null;
      csUpdateHeaderBadge(entity, kind);
      refresh();
      showToast(t("toast.unblocked")[kind]);
    }),
  });
}
// ---- Блокировка операций на срок (kyt: lockUserOperations / unlockUserOperations) ------
// Реальный контракт: lockUserOperations(clientId, durationMinutes?, reason?, scopes?) —
// срок только конечный (blockedUntil = now + durationMinutes; без срока берётся
// AUTO_LOCK_NEW_DEVICE_MINUTES из env, не "бессрочно"), reason по умолчанию
// ADMIN_MANUAL, scopes пусты = блокируются все типы операций;
// unlockUserOperations(clientId) снимает в любой момент. Дата окончания
// пересчитывается в минуты. Режима "до снятия" в API нет — его нет и здесь;
// scopes (типы операций) не выбираются: блокируются все типы.
function olNow() {
  return new Date(MOCK_NOW.getTime() + (typeof paymentActionTick === "number" ? paymentActionTick : 0) * 60000);
}

function olActive(entity) {
  const l = entity.operationsLock;
  return l && l.until > olNow() ? l : null;
}

function olRemaining(until) {
  const min = Math.max(1, Math.ceil((until - olNow()) / 60000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return [d ? `${d} ${t("opLock.d")}` : "", h ? `${h} ${t("opLock.h")}` : "", !d && m ? `${m} ${t("opLock.m")}` : ""].filter(Boolean).join(" ");
}

function olSectionHtml(entity, kind) {
  const s = t("opLock");
  const l = olActive(entity);
  const body = l
    ? `<div class="profile-fields profile-fields-grid">
        ${detailField(s.statusLabel, `<span class="badge badge-warning">${s.locked}</span>`)}
        ${detailField(s.until, formatDateTime(l.until))}
        ${detailField(s.remaining, olRemaining(l.until))}
        ${detailField(s.by, pdEscape(l.createdBy))}
        ${detailField(s.created, formatDateTime(l.createdAt))}
      </div>
      <div class="cs-actions"><button type="button" class="btn-primary" data-ol-unlock>${s.unlock}</button></div>`
    : `<div class="cs-actions cs-actions-first"><button type="button" class="btn-danger" data-ol-lock>${s.lock}</button></div>`;
  return flatSection(s.title, body, null, s.desc[kind]);
}

function olConfirmUnlock(entity, kind, refresh) {
  const s = t("opLock");
  vbConfirm({
    title: s.unlockTitle, text: s.unlockText[kind], confirmLabel: s.unlock, danger: false,
    onConfirm: () => { entity.operationsLock = null; refresh(); showToast(t("toast.opsUnlocked")[kind]); },
  });
}

function olOpenLockModal(entity, kind, refresh) {
  const s = t("opLock");
  const st = { mode: "duration", amount: "", unit: "60", until: "" };
  const card = (id, title, desc) => `<button type="button" class="pc-direction-card${st.mode === id ? " is-active" : ""}" data-ol-mode="${id}"><div class="pc-direction-card-title">${title}</div><div class="pc-direction-card-desc">${desc}</div></button>`;
  const chip = (attr, val, label, on) => `<button type="button" class="sc-chip${on ? " is-active" : ""}" ${attr}="${val}">${label}</button>`;
  const fields = () =>
    st.mode === "duration"
      ? `<div class="ol-duration">${vbInput("ol-amount", s.amount, st.amount, 'inputmode="numeric"')}<div class="sc-chips">${chip("data-ol-unit", "1", s.unitMin, st.unit === "1")}${chip("data-ol-unit", "60", s.unitHour, st.unit === "60")}${chip("data-ol-unit", "1440", s.unitDay, st.unit === "1440")}</div></div>`
      : `<label class="filters-field vb-field"><span class="filters-field-label">${s.untilField}</span><input class="address-form-input" type="datetime-local" id="ol-until" value="${st.until}" /></label>`;
  const body = () => `
    <p class="modal-confirm-text pd-modal-intro">${s.lockIntro}</p>
    <div class="pc-direction-cards ol-cards">${card("duration", s.modeDuration, s.modeDurationDesc)}${card("until", s.modeUntil, s.modeUntilDesc)}</div>
    <div class="ol-period">${fields()}</div>
    <div class="form-error" id="ol-error" hidden></div>`;
  openModal({
    title: s.lockTitle, width: 600,
    bodyHtml: `<div id="ol-body">${body()}</div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="ol-cancel">${vt("common.cancel")}</button><button type="button" class="btn-danger" id="ol-submit">${s.lock}</button>`,
    onMount: (el) => {
      const box = el.querySelector("#ol-body");
      const rerender = () => { box.innerHTML = body(); bind(); };
      const bind = () => {
        box.querySelectorAll("[data-ol-mode]").forEach((b) => b.addEventListener("click", () => { st.mode = b.dataset.olMode; rerender(); }));
        box.querySelectorAll("[data-ol-unit]").forEach((b) => b.addEventListener("click", () => { st.unit = b.dataset.olUnit; rerender(); }));
        const a = box.querySelector("#ol-amount"); if (a) a.addEventListener("input", (e) => { st.amount = e.target.value; });
        const u = box.querySelector("#ol-until"); if (u) u.addEventListener("input", (e) => { st.until = e.target.value; });
      };
      bind();
      el.querySelector("#ol-cancel").addEventListener("click", closeModal);
      el.querySelector("#ol-submit").addEventListener("click", () => {
        const fail = (m) => { const e = box.querySelector("#ol-error"); e.textContent = m; e.hidden = false; };
        // как в lockUserOperations: срок уходит в минутах (durationMinutes ≥ 1)
        let minutes;
        if (st.mode === "duration") {
          if (!/^\d+$/.test(st.amount.trim()) || Number(st.amount) < 1) return fail(s.errAmount);
          minutes = Number(st.amount) * Number(st.unit);
        } else {
          const d = st.until ? new Date(st.until) : null;
          if (!d || Number.isNaN(d.getTime()) || d <= olNow()) return fail(s.errUntil);
          minutes = Math.max(1, Math.ceil((d - olNow()) / 60000));
        }
        closeModal();
        entity.operationsLock = { until: new Date(olNow().getTime() + minutes * 60000), reason: "ADMIN_MANUAL", createdBy: CURRENT_ADMIN.name, createdAt: olNow() };
        refresh();
        showToast(t("toast.opsLocked")[kind]);
      });
    },
  });
}
// ---- Сессии клиента (вкладка "Безопасность") ---------------------------------------------------------------
// Реальный auth-backend отдаёт только сессии ТЕКУЩЕГО пользователя (getMyActiveSessions: sessionId, ipAddress,
// userAgent, geoLocation, createdAt) и logout — своей же сессии (по refreshToken, fromOther, fromAll). Ручки
// "получить/завершить сессии произвольного клиента" в схеме нет (см. также security-system-access.js — там по
// той же причине массовое завершение сессий смоделировано, а не вызывает реальную мутацию). Ниже — тот же
// допущение прототипа, но по одному клиенту: список детерминирован от entity.id, "завершённые" сессии просто
// не показываются повторно (entity._csKilledSessionIds), без реального бэкенда — сохранять их негде и незачем.
const CS_SESSION_DEVICES = [
  { label: "Chrome · macOS" },
  { label: "Safari · iPhone" },
  { label: "Edge · Windows" },
  { label: "Chrome · Android" },
];
const CS_SESSION_PLACES = [
  ["Кыргызстан", "Бишкек"], ["Казахстан", "Алматы"], ["Россия", "Москва"], ["Узбекистан", "Ташкент"],
];

function csSessionsOf(entity) {
  const killed = entity._csKilledSessionIds || [];
  const h = paymentStableHash(entity.id);
  const count = 1 + (h % 3);
  return Array.from({ length: count })
    .map((_, i) => {
      const seed = h + i * 97 + 1;
      const device = CS_SESSION_DEVICES[seed % CS_SESSION_DEVICES.length];
      const place = CS_SESSION_PLACES[seed % CS_SESSION_PLACES.length];
      const createdDate = new Date(MOCK_NOW.getTime() - ((seed % 20) * 8 + i * 3) * 3600 * 1000);
      return {
        id: seedToPaymentUuid(h + i * 13 + 500000),
        device: device.label,
        ipAddress: `${100 + ((seed * 7) % 120)}.${(seed * 13) % 250}.${(seed * 29) % 250}.${1 + ((seed * 3) % 250)}`,
        place,
        createdDate,
        createdAt: formatDateTime(createdDate),
      };
    })
    .filter((sess) => !killed.includes(sess.id));
}

function csSessionsSectionHtml(entity) {
  const s = t("cSecurity");
  const sessions = csSessionsOf(entity).sort((a, b) => b.createdDate - a.createdDate);
  const rows = sessions.map((sess) => [
    sess.device,
    `<span class="vb-mono">${sess.ipAddress}</span>`,
    `${sess.place[1]}, ${sess.place[0]}`,
    sess.createdAt,
    rowKebabMenu(`cs-sess-${sess.id}`, [{ label: s.sessionKill, icon: LOCK_ICON_SVG, attrs: `data-cs-kill-session="${sess.id}"`, danger: true }]),
  ]);
  const table = vbMiniTable([s.sessionsColumns.device, s.sessionsColumns.ip, s.sessionsColumns.place, s.sessionsColumns.created, ""], rows, s.sessionsEmpty);
  const killAll = sessions.length ? `<div class="cs-actions"><button type="button" class="btn-danger" data-cs-kill-all-sessions>${s.sessionKillAll}</button></div>` : "";
  return flatSection(s.sessionsTitle, `${table}${killAll}`, null, s.sessionsDesc);
}

function csOpenKillSessionModal(entity, session, refresh) {
  const s = t("cSecurity");
  vbConfirm({
    title: s.sessionKillTitle, text: s.sessionKillText(session.device), confirmLabel: s.sessionKill, danger: true,
    onConfirm: () => requireAdmin2fa("client_sessions_kill", () => {
      entity._csKilledSessionIds = [...(entity._csKilledSessionIds || []), session.id];
      refresh();
      showToast(t("toast.sessionEnded"));
    }),
  });
}

function csOpenKillAllSessionsModal(entity, refresh) {
  const s = t("cSecurity");
  const sessions = csSessionsOf(entity);
  vbConfirm({
    title: s.sessionKillAllTitle, text: s.sessionKillAllText(sessions.length), confirmLabel: s.sessionKillAll, danger: true,
    onConfirm: () => requireAdmin2fa("client_sessions_kill", () => {
      entity._csKilledSessionIds = [...(entity._csKilledSessionIds || []), ...sessions.map((sess) => sess.id)];
      refresh();
      showToast(t("toast.sessionsEnded"));
    }),
  });
}
// "Сбросить пароль" — админское действие: клиенту уходит письмо со ссылкой на
// восстановление. В реальном auth-backend есть только клиентский процесс
// (startPasswordRecovery → confirmPasswordRecovery с 2FA), а мутации "админ
// запускает сброс" не найдено — поэтому здесь это имитация для прототипа.
// ---- Меню "три точки" в шапке карточки клиента и компании: выгрузка карточки в PDF
// и функции безопасности (те же действия, что на вкладке "Безопасность"). Состав пунктов
// зависит от состояния (заблокирован/нет, операции заблокированы/нет), поэтому меню
// перерисовывается после каждого действия. ------------------------------------------
const DOWNLOAD_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14v2h12v-2"/></svg>`;

function clientHeaderMenuItems(entity, kind) {
  const hm = t("headerMenu");
  const items = [{ label: hm.exportCard, icon: DOWNLOAD_ICON_SVG, attrs: 'data-cdm="pdf"' }];
  items.push(
    olActive(entity)
      ? { label: t("opLock.unlock"), icon: PLAY_ICON_SVG, attrs: 'data-cdm="ol-unlock"' }
      : { label: t("opLock.lock"), icon: LOCK_ICON_SVG, attrs: 'data-cdm="ol-lock"', danger: true }
  );
  items.push(
    csIsBlocked(entity)
      ? { label: t("cSecurity.unblock"), icon: PLAY_ICON_SVG, attrs: 'data-cdm="unblock"' }
      : { label: t("cSecurity.block"), icon: LOCK_ICON_SVG, attrs: 'data-cdm="block"', danger: true }
  );
  if (kind === "user") items.push({ label: t("cSecurity.resetPassword"), icon: KEY_ICON_SVG, attrs: 'data-cdm="reset"' });
  return items;
}

function renderClientHeaderMenu(entity, kind) {
  return `<div class="cd-header-menu" id="cd-header-menu">${rowKebabMenu("cd-head", clientHeaderMenuItems(entity, kind))}</div>`;
}

// ---- Hero-шапка карточки: скруглённый блок с голубым градиентом, растворяющимся в белый (тот же
// приём, что и на главной), внутри — имя, статус и "пилюли" с ключевыми цифрами; клик по пилюле
// открывает соответствующую вкладку. ------------------------------------------------------------
function renderClientHeroPills(entity, kind) {
  const hm = t("headerMenu");
  const pills = [];
  if (kind === "user") {
    pills.push({ tab: "kycLevels", html: `KYC <strong>${kycStatusLabel(entity.kycStatus)}</strong>` });
  } else {
    const kyb = entity.currentKYBLevelStatusV2;
    if (kyb) pills.push({ tab: "kyb", html: `KYB <strong>${kybStatusLabel(kyb.status)}</strong>` });
  }
  pills.push({ tab: "accounts", html: `<strong>${getClientVirtualAccounts(entity).length}</strong> ${hm.pillAccounts}` });
  pills.push({ tab: "operations", html: `<strong>${getClientOperations(entity).length}</strong> ${hm.pillOperations}` });
  return `<div class="hm-pills cd-hero-pills">${pills.map((p) => `<button type="button" class="hm-pill" data-hero-tab="${p.tab}">${p.html}</button>`).join("")}</div>`;
}

function bindClientHeroPills(setTab) {
  document.querySelectorAll(".cd-hero-pills [data-hero-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.heroTab)));
}

function bindClientHeaderMenu(entity, kind, refresh) {  const box = document.getElementById("cd-header-menu");
  if (!box) return;
  const after = () => {
    refresh();
    box.innerHTML = rowKebabMenu("cd-head", clientHeaderMenuItems(entity, kind));
  };
  box.addEventListener("click", (e) => {
    const item = e.target.closest("[data-cdm]");
    if (!item) return;
    closeAllRowKebabs();
    const action = item.dataset.cdm;
    if (action === "pdf") exportClientCardPdf(entity, kind);
    else if (action === "block") csOpenBlockModal(entity, kind, after);
    else if (action === "unblock") csOpenUnblockModal(entity, kind, after);
    else if (action === "reset") csOpenResetModal(entity);
    else if (action === "ol-lock") olOpenLockModal(entity, kind, after);
    else if (action === "ol-unlock") olConfirmUnlock(entity, kind, after);
  });
}

// PDF без библиотек: собираем печатную версию карточки (шапка + вкладка "Основное") в скрытом
// iframe с теми же стилями и открываем системный диалог печати — там "Сохранить как PDF".
// Заголовок страницы на время печати становится именем файла.
// Содержимое PDF: все вкладки карточки, где есть что печатать. Счета и операции — статичные
// таблицы (списки с фильтрами в печать не годятся), операции — только последние 10.
function clientCardPdfBody(entity, kind) {
  const hm = t("headerMenu");
  const cd = t("clientDetail");
  const tabs = t(kind === "user" ? "clientDetail" : "companyDetail").subTabs;
  const section = (title, html) => `<section class="pdf-section"><h2>${title}</h2>${html}</section>`;
  const empty = `<div class="pdf-note">${hm.empty}</div>`;

  const accounts = getClientVirtualAccounts(entity);
  const accHtml = accounts.length
    ? `<table class="data-table"><thead><tr><th>${cd.accColumns.id}</th><th>${t("accounts.detail.fields.description")}</th><th>${cd.accColumns.balance}</th><th>${cd.accColumns.status}</th></tr></thead><tbody>${accounts
        .map((a) => `<tr><td>${a.code}</td><td>${a.description ? pdEscape(a.description) : "—"}</td><td>${a.balances.length ? a.balances.map((b) => `${formatPaymentAmount(b.total)} ${b.currency}`).join("<br>") : "—"}</td><td>${accEnum("status", a.status)}</td></tr>`)
        .join("")}</tbody></table>`
    : empty;

  const ops = getClientOperations(entity).map((o) => csOpSummary(o, entity)).sort((a, b) => b.createdDate - a.createdDate).slice(0, 10);
  const opsHtml = ops.length
    ? `<table class="data-table"><thead><tr><th>ID</th><th>${t("clientDetail.opsColumns.kind")}</th><th>${t("operationsPayments.columns").amount}</th><th>${t("operationsPayments.columns").status}</th><th>${t("operationsPayments.columns").createdAt}</th></tr></thead><tbody>${ops
        .map((o) => `<tr><td>${pdShort(o.id)}</td><td>${o.kind}</td><td>${o.amount}</td><td>${o.status}</td><td>${o.createdAt}</td></tr>`)
        .join("")}</tbody></table>`
    : empty;

  const parts = [];
  parts.push(kind === "user" ? renderClientDetailMainTab(entity) : renderCompanyDetailMainTab(entity));
  parts.push(section(kind === "user" ? tabs.kycLevels : tabs.kyb, kind === "user" ? renderClientDetailKycTab(entity) : renderCompanyDetailKybTab(entity)));
  parts.push(section(tabs.accounts, accHtml));
  parts.push(section(`${tabs.operations} (${hm.last10})`, opsHtml));
  parts.push(section(tabs.tariff, renderClientDetailTariffTab(entity)));
  return parts.join("");
}

function exportClientCardPdf(entity, kind) {
  const hm = t("headerMenu");
  const name = kind === "user" ? entity.fullName || entity.email : entity.name;
  const body = clientCardPdfBody(entity, kind);
  const status = t(kind === "user" ? "clientDetail" : "companyDetail")[csIsBlocked(entity) ? "blocked" : "active"];
  const fileTitle = `${kind === "user" ? hm.cardUser : hm.cardCompany} | ${name}`;
  exPrintHtml(exPdfHtml(fileTitle, name, `${status} · ID: ${entity.code}`, body), fileTitle);
}

function csOpenResetModal(user) {
  const s = t("cSecurity");
  vbConfirm({
    title: s.resetTitle,
    text: s.resetText(user.email),
    confirmLabel: s.resetPassword,
    danger: true,
    onConfirm: () => requireAdmin2fa("client_password_reset", () => showToast(t("toast.passwordReset")(user.email))),
  });
}

function bindClientSecurityTab(scope, entity, kind, refresh) {
  const on = (sel, fn) => { const b = scope.querySelector(sel); if (b) b.addEventListener("click", fn); };
  on("[data-cs-block]", () => csOpenBlockModal(entity, kind, refresh));
  on("[data-cs-unblock]", () => csOpenUnblockModal(entity, kind, refresh));
  on("[data-cs-reset]", () => csOpenResetModal(entity));
  on("[data-ol-lock]", () => olOpenLockModal(entity, kind, refresh));
  on("[data-ol-unlock]", () => olConfirmUnlock(entity, kind, refresh));
  on("[data-cs-kill-all-sessions]", () => csOpenKillAllSessionsModal(entity, refresh));
  scope.querySelectorAll("[data-cs-kill-session]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const session = csSessionsOf(entity).find((sess) => sess.id === btn.dataset.csKillSession);
      if (session) csOpenKillSessionModal(entity, session, refresh);
    });
  });
}

// ---- Вкладка "Журнал событий" (физлицо и компания) — та же таблица, что и "Безопасность → Аудит-логи"
// (security-audit-logs.js: auditLogsList), только по записям этого клиента: где он сам актор
// (actor.type === "USER" — актором аудит-лога бывает только физлицо, не компания) или затронутая
// сущность (affectedEntity.id/ownerId — действия админов над ним самим или над его платежами; владельцем
// платежа/счёта в affectedEntity.ownerId бывает и компания, см. operations-payments.mock.js). У компании
// поэтому актором в её же журнале не будет ни одной записи — только события, где она затронутая сторона.
function csClientAuditLogs(entity) {
  return AUDIT_LOGS_MOCK.filter(
    (r) => (r.actor.type === "USER" && r.actor.id === entity.id) || (r.affectedEntity && (r.affectedEntity.id === entity.id || r.affectedEntity.ownerId === entity.id))
  );
}

let clientAuditListCache = null;

function buildClientAuditList(entity) {
  const dataGetter = () => csClientAuditLogs(entity);
  return createAccessList({
    key: `cd-audit-${entity.id}`,
    noCard: true,
    noDivider: true,
    data: dataGetter,
    searchPlaceholder: () => t("audit.search"),
    searchText: (r) =>
      [r.correlationId, r.actor.id, r.actor.snapshot && r.actor.snapshot.email, r.actor.snapshot && r.actor.snapshot.name, r.source, r.affectedEntity && r.affectedEntity.id, r.context.ipAddress, r.context.origin, r.auditTargetId]
        .filter(Boolean)
        .join(" "),
    filters: [
      { id: "created", kind: "date", label: () => t("audit.filters.period"), get: (r) => r.createdDate },
      { id: "actorType", kind: "multi", label: () => t("audit.columns.actor"), get: (r) => r.actor.type, options: () => ["USER", "ADMIN", "SYSTEM"].map((v) => ({ value: v, label: t(`audit.tabs.${v}`) })) },
      { id: "category", kind: "multi", label: () => t("audit.filters.category"), get: (r) => (r.event ? r.event.category : ""), options: () => [...new Set(dataGetter().map((r) => r.event && r.event.category).filter(Boolean))].map((v) => ({ value: v, label: auEnum("category", v) })) },
      { id: "severity", kind: "multi", label: () => t("audit.filters.severity"), get: (r) => (r.event ? r.event.severity : ""), options: () => ["INFO", "WARNING", "CRITICAL"].map((v) => ({ value: v, label: auEnum("severity", v) })) },
      { id: "result", kind: "multi", label: () => t("audit.filters.result"), get: (r) => r.result.status, options: () => ["SUCCESS", "FAILURE"].map((v) => ({ value: v, label: auEnum("result", v) })) },
    ],
    defaultSort: (a, b) => b.createdDate - a.createdDate,
    sorts: {},
    columns: [
      { label: () => t("audit.columns.event"), html: (r) => `<div class="identity-cell"><div class="identity-cell-primary"><button type="button" class="table-link au-link" data-audit-id="${r.id}">${r.event && r.event.action !== "UNKNOWN" ? auEnum("action", r.event.action) : t("audit.notDescribed")}</button></div><div class="identity-cell-sub"><span class="identity-cell-tag">${t("clientsUsers.idTag")}</span>${vbCodeCell(r.code)}</div></div>` },
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
          const sub = r.actor.type === "USER" ? s.email || "" : "";
          return `<div class="identity-cell"><span class="au-actor-line"><span>${pdEscape(auActorLabel(r))}</span>${r.actor.type !== "USER" ? auActorTypeBadge(r.actor.type) : ""}</span>${sub ? `<span class="table-cell-muted">${pdEscape(sub)}</span>` : ""}</div>`;
        },
      },
      { label: () => t("audit.columns.severity"), html: (r) => (r.event ? auSeverityBadge(r.event.severity) : t("audit.common.noValue")) },
      { label: () => t("audit.columns.result"), html: (r) => auResultBadge(r.result.status) },
      { label: () => t("audit.columns.correlation"), html: (r) => `<span class="au-inline-copy vb-mono">${auShortId(r.correlationId)}${copyIconButton(r.correlationId)}</span>` },
    ],
    attachRows: (wrap) => {
      wrap.querySelectorAll(".au-link").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/security-audit-logs/${b.dataset.auditId}`; }));
      wrap.querySelectorAll(".id-copy, .copy-icon-btn").forEach((b) => b.addEventListener("click", () => copyTextToClipboard(b.dataset.copyValue).then(() => flashCopied(b))));
    },
  });
}

function ensureClientAuditList(entity) {
  if (!clientAuditListCache || clientAuditListCache.entityId !== entity.id) {
    clientAuditListCache = { entityId: entity.id, list: buildClientAuditList(entity) };
  }
  return clientAuditListCache.list;
}

function renderClientDetailAuditTab(entity) {
  const cd = t("clientDetail");
  return `
    <div class="acc-list-block">
      <div class="acc-tab-head">
        <div>
          <div class="acc-list-heading">${cd.auditSectionTitle}</div>
          <div class="profile-flat-section-desc">${cd.auditSectionDesc}</div>
        </div>
        ${exportMenuHtml("cd-audit-export", cd.auditExport.button, cd.auditExport.hint)}
      </div>
      ${ensureClientAuditList(entity).view()}
    </div>
  `;
}

// Выгружаются записи с учётом поиска/вкладки/фильтров этого списка — те же колонки, что и в общем экспорте
// аудит-логов (exportAuditLogs, security-audit-logs.js)
function exportClientAuditLogs(entity, format) {
  const x = t("audit.export");
  const list = ensureClientAuditList(entity).exportRows();
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
  exportTable(`audit_logs_${entity.code}_${new Date().toISOString().slice(0, 10)}`, format, x.columns, rows);
  showToast(x.done(list.length));
}

// ---- Табы: верхний ряд (Общее/Тарифы/…) + второй ряд под "Общее" ----------------
function renderClientDetailTabsBar() {
  return `
    <div class="cd-subtabs">
      ${CLIENT_DETAIL_SUB_TABS.map(
        (id) => `
          <button type="button" class="cd-subtab${clientDetailState.subTab === id ? " is-active" : ""}" data-sub-tab="${id}">
            <span class="cd-subtab-icon">${CD_TAB_ICONS[id]}</span>
            <span>${t(`clientDetail.subTabs.${id}`)}</span>
          </button>
        `
      ).join("")}
    </div>
  `;
}

function renderClientDetailBody(user) {
  if (clientDetailState.subTab === "kycLevels") return renderClientDetailKycTab(user);
  if (clientDetailState.subTab === "risk") return renderClientDetailRiskTab(user);
  if (clientDetailState.subTab === "companies") return renderClientDetailCompaniesTab(user);
  if (clientDetailState.subTab === "accounts") return renderClientDetailAccountsTab(user, "user");
  if (clientDetailState.subTab === "operations") return renderClientDetailOperationsTab(user, "user");
  if (clientDetailState.subTab === "tariff") return renderClientDetailTariffTab(user);
  if (clientDetailState.subTab === "kyt") return renderClientDetailKytTab(user);
  if (clientDetailState.subTab === "security") return renderClientDetailSecurityTab(user, "user");
  if (clientDetailState.subTab === "auditLog") return renderClientDetailAuditTab(user);
  return renderClientDetailMainTab(user);
}

function viewClientDetail(userId) {
  const cd = t("clientDetail");
  const user = CLIENTS_USERS_MOCK.find((u) => u.id === userId);

  if (!user) {
    return `
      ${pageHeader(cd.notFoundTitle)}
      <div class="empty-state">
        <div class="empty-state-icon">${ICONS.box}</div>
        <div class="empty-state-title">${cd.notFoundTitle}</div>
        <div class="empty-state-text">${cd.notFoundText}</div>
      </div>
    `;
  }

  // Заходим на карточку клиента всегда с "Основное" — не запоминаем между
  // разными клиентами, это ожидаемое поведение. Инстансы списков "Счета"
  // (clientAccountsListsCache) сами пересоздаются при смене userId — см.
  // ensureClientAccountsLists.
  clientDetailState.subTab = "main";

  return `
    ${renderClientDetailHeader(user)}

    <div class="cd-tabs-wrap" id="cd-tabs-wrap">${renderClientDetailTabsBar()}</div>

    <div id="cd-content">${renderClientDetailBody(user)}</div>
  `;
}

function updateClientDetailView(user) {
  const tabsWrap = document.getElementById("cd-tabs-wrap");
  const content = document.getElementById("cd-content");
  if (tabsWrap) tabsWrap.innerHTML = renderClientDetailTabsBar();
  if (content) content.innerHTML = renderClientDetailBody(user);
  attachClientDetailTabHandlers(user);
  attachClientDetailContentHandlers(user);
}

function attachClientDetailTabHandlers(user) {
  document.querySelectorAll("[data-sub-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      clientDetailState.subTab = btn.dataset.subTab;
      updateClientDetailView(user);
    });
  });
}

// Копирование и сворачивание внутри контента вкладки (#cd-content) + управление
// адресами. Перевешивается при каждом переключении вкладки, т.к. #cd-content
// каждый раз перерисовывается целиком — намеренно НЕ трогает шапку (у неё
// отдельный, привязанный один раз обработчик, см. attachClientDetailHeaderHandlers),
// иначе при каждом переключении вкладки на кнопку копирования в шапке навешивался
// бы ещё один обработчик поверх уже существующего.
function attachClientDetailContentHandlers(user) {
  const content = document.getElementById("cd-content");
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

  const editPersonalBtn = content.querySelector("[data-edit-personal]");
  if (editPersonalBtn) editPersonalBtn.addEventListener("click", () => openPersonalEditModal(user));
  const editContactsBtn = content.querySelector("[data-edit-contacts]");
  if (editContactsBtn) editContactsBtn.addEventListener("click", () => openContactsEditModal(user));

  content.querySelectorAll("[data-check-info]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const check = (user.verificationChecks || []).find((c) => c.id === btn.dataset.checkInfo);
      if (check) openCheckDetailsModal(check);
    });
  });

  content.querySelectorAll("[data-doc-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const doc = (user.documents || []).find((d) => d.id === btn.dataset.docEdit);
      if (doc) openDocumentEditModal(user, doc);
    });
  });

  const addDocBtn = content.querySelector("#cd-document-add");
  if (addDocBtn) addDocBtn.addEventListener("click", () => openDocumentAddWizard(user));

  const kycStatusChangeBtn = content.querySelector("#cd-kyc-status-change");
  if (kycStatusChangeBtn) kycStatusChangeBtn.addEventListener("click", () => openKycStatusChangeModal(user));

  content.querySelectorAll("[data-company-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = `#/clients-companies/${btn.dataset.companyId}`;
    });
  });

  const addToCompanyBtn = content.querySelector("#ucomp-add");
  if (addToCompanyBtn) addToCompanyBtn.addEventListener("click", () => openAddToCompanyModal(user));

  content.querySelectorAll("[data-ucomp-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pair = companiesOfUser(user).find((p) => p.member.id === btn.dataset.ucompEdit);
      if (pair) coOpenEditEmployeeModal(pair.company, pair.member, () => updateClientDetailView(user));
    });
  });

  content.querySelectorAll("[data-ucomp-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pair = companiesOfUser(user).find((p) => p.member.id === btn.dataset.ucompRemove);
      if (pair) coConfirmRemoveEmployee(pair.company, pair.member, () => updateClientDetailView(user));
    });
  });

  if (clientDetailState.subTab === "accounts") {
    const lists = ensureClientAccountsLists(user);
    lists.virtual.init();
    bindClientAccountsExport(user, "user");
  }

  if (clientDetailState.subTab === "operations") {
    attachClientOperationsTab(content, user, () => updateClientDetailView(user));
  }

  if (clientDetailState.subTab === "tariff") {
    content.querySelectorAll("[data-acc-hash]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.hash = btn.dataset.accHash;
      });
    });
  }

  if (clientDetailState.subTab === "kyt") {
    ensureClientKytList(user).init();
  }

  if (clientDetailState.subTab === "security") bindClientSecurityTab(content, user, "user", () => updateClientDetailView(user));

  if (clientDetailState.subTab === "auditLog") {
    ensureClientAuditList(user).init();
    bindExportMenu("cd-audit-export", (format) => exportClientAuditLogs(user, format));
  }

  if (user) attachAddressHandlers(user);
}

// Кнопки в шапке карточки клиента (копирование телефона, меню действий)
// рендерятся один раз и не перерисовываются при переключении вкладок, поэтому и
// обработчик вешается один раз здесь, а не в attachClientDetailContentHandlers.
function attachClientDetailHeaderHandlers(user) {
  document.querySelectorAll(".client-detail-header .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn));
    });
  });
}

function initClientDetailView() {
  const backBtn = document.getElementById("cd-back");
  if (backBtn) backBtn.addEventListener("click", () => { window.location.hash = "#/clients-users"; });

  const user = CLIENTS_USERS_MOCK.find((u) => u.id === currentClientUserId());
  if (!user) return;

  attachClientDetailHeaderHandlers(user);
  bindClientHeaderMenu(user, "user", () => updateClientDetailView(user));
  bindClientHeroPills((tab) => { clientDetailState.subTab = tab; updateClientDetailView(user); });
  attachClientDetailTabHandlers(user);
  attachClientDetailContentHandlers(user);
}
