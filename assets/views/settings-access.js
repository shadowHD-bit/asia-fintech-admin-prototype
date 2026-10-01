/* ==========================================================================
   "Настройки → Роли и права": вкладки Роли / Разрешения / Администраторы,
   страницы роли и администратора, модалки действий.
   Спецификация: docs/settings-admins-roles-spec.md. Данные —
   assets/mock/settings-access.mock.js (модель сервиса ACL).
   Три списка построены на одной заготовке createAccessList (поиск, быстрые
   табы, боковая панель фильтров с применением по кнопке, чипы, сортировка,
   пагинация) — так же, как списки клиентов/платежей, но без копипасты.
   Все изменения — только через модалки и живут в моке на время сессии.
   Переиспользует хелперы из clients-users.js, operations-payment-detail.js
   (pdNow), components/modal.js.
   ========================================================================== */

let accessActiveTab = "roles";

// ---- Хелперы данных -------------------------------------------------------------------
function acRoleById(id) {
  return ACCESS_ROLES.find((r) => r.id === id) || null;
}

function acAdminById(id) {
  return ACCESS_ADMINS.find((a) => a.id === id) || null;
}

function acRolesOfAdmin(admin) {
  return admin.roleIds.map(acRoleById).filter(Boolean);
}

function acAdminsOfRole(role) {
  return ACCESS_ADMINS.filter((a) => a.roleIds.includes(role.id));
}

function acRoleStatusBadge(status) {
  const cls = status === "ACTIVE" ? "badge-success" : status === "DEPRECATED" ? "badge-warning" : "badge-neutral";
  return `<span class="badge ${cls}">${t(`access.enums.roleStatus.${status}`)}</span>`;
}

function acAdminStatusBadge(status) {
  const cls = { ACTIVE: "badge-success", INVITED: "badge-info", EXPIRED: "badge-warning", SUSPENDED: "badge-danger", INACTIVE: "badge-neutral" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${t(`access.enums.adminStatus.${status}`)}</span>`;
}

function acRoleTypeBadge(type) {
  return `<span class="badge badge-neutral">${t(`access.enums.roleType.${type}`)}</span>`;
}

function acRoleBadges(roleIds, max) {
  const roles = roleIds.map(acRoleById).filter(Boolean);
  const shown = roles.slice(0, max).map((r) => `<span class="badge badge-neutral">${r.name}</span>`).join("");
  const rest = roles.length > max ? `<span class="table-cell-muted">+${roles.length - max}</span>` : "";
  return `<div class="ac-badges">${shown}${rest}</div>`;
}

function acIsLastActiveSuper(admin) {
  if (admin.status !== "ACTIVE" || !admin.roleIds.includes("role-super")) return false;
  return ACCESS_ADMINS.filter((a) => a.status === "ACTIVE" && a.roleIds.includes("role-super")).length === 1;
}

function acIsSelf(admin) {
  return admin.email === CURRENT_ADMIN.email;
}

function acPlural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---- Заготовка списка -----------------------------------------------------------------
function createAccessList(cfg) {
  const key = cfg.key;
  const s = { search: "", tab: null, filters: {}, sortBy: null, sortDir: "asc", page: 1, pageSize: 10 };
  cfg.filters.forEach((f) => {
    s.filters[f.id] = f.kind === "date" ? { from: null, to: null } : [];
  });
  let draft = null;
  let expanded = null;
  let loadingTimer = null;
  const id = (suffix) => `al-${key}-${suffix}`;

  const cloneFilters = (src) => {
    const out = {};
    Object.keys(src).forEach((k) => {
      out[k] = Array.isArray(src[k]) ? [...src[k]] : { ...src[k] };
    });
    return out;
  };

  const filterActive = (f, values) => (f.kind === "date" ? !!(values.from || values.to) : values.length > 0);

  const matches = (row, ignoreTab) => {
    const q = s.search.trim().toLowerCase();
    if (q && !cfg.searchText(row).toLowerCase().includes(q)) return false;
    if (!ignoreTab && cfg.tab && s.tab && cfg.tab.get(row) !== s.tab) return false;
    for (const f of cfg.filters) {
      const val = s.filters[f.id];
      if (!filterActive(f, val)) continue;
      if (f.kind === "date") {
        const d = f.get(row);
        if (val.from && (!d || d < val.from)) return false;
        if (val.to && (!d || d > val.to)) return false;
      } else {
        const got = f.get(row);
        const arr = (Array.isArray(got) ? got : [got]).map(String);
        if (!arr.some((x) => val.includes(x))) return false;
      }
    }
    return true;
  };

  const filteredRows = () => cfg.data().filter((r) => matches(r));

  const sortedRows = (list) => {
    const cmp = s.sortBy ? cfg.sorts[s.sortBy] : cfg.defaultSort;
    const dir = s.sortBy && s.sortDir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => cmp(a, b) * dir);
  };

  const activeCount = () => cfg.filters.filter((f) => filterActive(f, s.filters[f.id])).length;

  const optionLabel = (f, v) => {
    const o = f.options().find((x) => String(x.value) === String(v));
    return o ? o.label : v;
  };

  // ---- Табы, кнопка фильтров, чипы -------------------------------------------------------
  const renderTabs = () => {
    if (!cfg.tab) return "";
    const base = cfg.data().filter((r) => matches(r, true));
    const count = (v) => (v ? base.filter((r) => cfg.tab.get(r) === v).length : base.length);
    const items = [{ value: null, label: t("access.common.allTab") }, ...cfg.tab.values.map((v) => ({ value: v, label: cfg.tab.label(v) }))];
    return `<div class="quick-tabs" id="${id("tabs")}">${items
      .map(
        (it) =>
          `<button type="button" class="quick-tab${s.tab === it.value ? " is-active" : ""}" data-tab="${it.value || ""}">${it.label}<span class="quick-tab-count">${count(it.value)}</span></button>`
      )
      .join("")}</div>`;
  };

  const renderTrigger = () => {
    const n = activeCount();
    return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h14M6 10h8M8.5 15.5h3"/></svg>
      <span>${t("access.common.filters")}</span>${n ? `<span class="filter-badge">${n}</span>` : ""}`;
  };

  const renderChips = () => {
    const chips = cfg.filters
      .filter((f) => filterActive(f, s.filters[f.id]))
      .map((f) => {
        const val = s.filters[f.id];
        const text = f.kind === "date" ? dateTriggerLabel(val.from, val.to) : multiSelectLabel(val, "", (v) => optionLabel(f, v));
        return `<span class="filter-chip">${f.label()}: ${text}<button type="button" class="filter-chip-remove" data-chip="${f.id}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg></button></span>`;
      });
    return `<div class="filter-chips" id="${id("chips")}">${chips.join("")}</div>`;
  };

  const renderBar = () => `
    <div class="filters-bar-compact">
      <div class="filters-search">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5.5"/><path d="m17 17-3.5-3.5"/></svg>
        <input type="text" id="${id("search")}" placeholder="${cfg.searchPlaceholder()}" value="${escapeAttr(s.search)}" />
        <button type="button" class="filters-search-clear" id="${id("search-clear")}"${s.search ? "" : " hidden"}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      ${cfg.filters.length ? `<button type="button" class="filter-trigger" id="${id("trigger")}">${renderTrigger()}</button>` : ""}
      ${cfg.headerAction ? cfg.headerAction() : ""}
    </div>`;

  // ---- Метрики ------------------------------------------------------------------------------
  const renderMetrics = () =>
    cfg.metrics
      ? `<div class="metrics-grid${cfg.metricsClass ? ` ${cfg.metricsClass}` : ""}" id="${id("metrics")}">${cfg.metrics(filteredRows())
          .map((m) => renderMetricCard(m.value, m.label, m.sub))
          .join("")}</div>`
      : "";

  // ---- Таблица --------------------------------------------------------------------------------
  const sortHeader = (col) => {
    const cls = col.tdClass ? ` class="${col.tdClass}"` : '';
    if (!col.sort) return `<th${cls}>${col.label()}</th>`;
    const active = s.sortBy === col.sort;
    const icon = active ? (s.sortDir === "asc" ? SORT_ICON_ASC : SORT_ICON_DESC) : SORT_ICON_NEUTRAL;
    return `<th${cls}><button type="button" class="th-sort${active ? " is-active" : ""}" data-sort="${col.sort}">${col.label()}<span class="th-sort-icon">${icon}</span></button></th>`;
  };

  const renderTable = () => {
    const rows = sortedRows(filteredRows());
    const totalPages = Math.max(1, Math.ceil(rows.length / s.pageSize));
    if (s.page > totalPages) s.page = totalPages;
    // cfg.noPager — все строки на одной странице без футера (например, правила маршрутизации: порядок строк важен);
    // cfg.rowAttrs(row) — доп. атрибуты <tr>; cfg.tableClass — доп. класс таблицы; cfg.tableNote() — заметка над таблицей
    const pageRows = cfg.noPager ? rows : rows.slice((s.page - 1) * s.pageSize, s.page * s.pageSize);

    if (!rows.length) {
      return `<div class="empty-state empty-state-centered">
        <img class="empty-state-logo" src="assets/images/logo-icon.svg" alt="" />
        <div class="empty-state-text-group"><div class="empty-state-title">${t("access.common.emptyTitle")}</div><div class="empty-state-text">${t("access.common.emptyText")}</div></div>
        <button type="button" class="btn-secondary" id="${id("empty-reset")}">${t("access.common.emptyReset")}</button>
      </div>`;
    }

    return `
      ${cfg.tableNote ? cfg.tableNote() : ""}
      <div class="table-scroll"><table class="data-table${cfg.tableClass ? ` ${cfg.tableClass}` : ""}">
        <thead><tr>${cfg.columns.map(sortHeader).join("")}</tr></thead>
        <tbody>${pageRows.map((r) => `<tr${cfg.rowAttrs ? ` ${cfg.rowAttrs(r)}` : ""}>${cfg.columns.map((c) => `<td${c.tdClass ? ` class="${c.tdClass}"` : ""}>${c.html(r)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
      ${cfg.noPager ? "" : `<div class="table-footer">
        <span class="table-footer-total">${t("access.common.total")(rows.length)}</span>
        <div class="pager">${renderPager(s.page, totalPages)}</div>
        <div class="table-footer-page-size"><span>${t("access.common.rowsPerPage")}</span>
          <select id="${id("page-size")}">${[10, 20, 50].map((n) => `<option value="${n}"${s.pageSize === n ? " selected" : ""}>${n}</option>`).join("")}</select>
        </div>
      </div>`}`;
  };

  const attachTable = () => {
    const wrap = document.getElementById(id("table"));
    if (!wrap) return;
    const emptyReset = document.getElementById(id("empty-reset"));
    if (emptyReset) emptyReset.addEventListener("click", resetAll);
    wrap.querySelectorAll(".pager-btn[data-page]").forEach((btn) => {
      if (btn.hasAttribute("disabled")) return;
      btn.addEventListener("click", () => {
        s.page = Number(btn.dataset.page);
        updateTable();
      });
    });
    const size = document.getElementById(id("page-size"));
    if (size) size.addEventListener("change", () => { s.pageSize = Number(size.value); s.page = 1; updateTable(); });
    wrap.querySelectorAll(".th-sort").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.sort;
        if (s.sortBy === k) s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
        else { s.sortBy = k; s.sortDir = "asc"; }
        updateTable();
      });
    });
    wrap.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => {
      btn.addEventListener("click", () => copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn)));
    });
    if (cfg.attachRows) cfg.attachRows(wrap);
  };

  function updateTable() {
    const wrap = document.getElementById(id("table"));
    if (!wrap) return;
    wrap.innerHTML = renderTableLoadingState();
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => {
      wrap.innerHTML = renderTable();
      attachTable();
      refreshMetrics();
    }, CLIENTS_USERS_LOADING_DELAY);
  }

  function refreshMetrics() {
    const el = document.getElementById(id("metrics"));
    if (el) el.outerHTML = renderMetrics();
  }

  function attachChrome() {
    const tabs = document.getElementById(id("tabs"));
    if (tabs) {
      tabs.querySelectorAll(".quick-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          s.tab = btn.dataset.tab || null;
          s.page = 1;
          updateTable();
          refreshChrome();
        });
      });
    }
    const chips = document.getElementById(id("chips"));
    if (chips) {
      chips.querySelectorAll(".filter-chip-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
          const f = cfg.filters.find((x) => x.id === btn.dataset.chip);
          s.filters[f.id] = f.kind === "date" ? { from: null, to: null } : [];
          s.page = 1;
          updateTable();
          refreshChrome();
        });
      });
    }
  }

  function refreshChrome() {
    const trigger = document.getElementById(id("trigger"));
    if (trigger) trigger.innerHTML = renderTrigger();
    const tabs = document.getElementById(id("tabs"));
    if (tabs) tabs.outerHTML = renderTabs();
    const chips = document.getElementById(id("chips"));
    if (chips) chips.outerHTML = renderChips();
    attachChrome();
  }

  function resetAll() {
    s.search = "";
    s.tab = null;
    cfg.filters.forEach((f) => { s.filters[f.id] = f.kind === "date" ? { from: null, to: null } : []; });
    s.page = 1;
    const input = document.getElementById(id("search"));
    if (input) input.value = "";
    const clear = document.getElementById(id("search-clear"));
    if (clear) clear.hidden = true;
    updateTable();
    refreshChrome();
  }

  // ---- Боковая панель фильтров (черновик, применяется по кнопке) ---------------------------
  const groupCount = (f) => (filterActive(f, draft[f.id]) ? (f.kind === "date" ? 1 : draft[f.id].length) : 0);

  const renderGroup = (f) => {
    const isOpen = expanded.has(f.id);
    const count = groupCount(f);
    const body =
      f.kind === "date"
        ? `<button type="button" class="drp-trigger" data-date-group="${f.id}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg><span>${dateTriggerLabel(draft[f.id].from, draft[f.id].to)}</span></button>`
        : checkboxOptionsHtml(f.options(), draft[f.id], f.id);
    return `<div class="filter-group${isOpen ? " is-expanded" : ""}" data-group-id="${f.id}">
      <button type="button" class="filter-group-head" data-group-toggle="${f.id}"><span class="filter-group-label">${f.label()}</span>${count ? `<span class="filter-group-badge">${count}</span>` : ""}<span class="filter-group-chevron">${FILTER_GROUP_CHEVRON}</span></button>
      <div class="filter-group-body">${body}</div></div>`;
  };

  const rerenderDrawerBody = () => {
    const body = document.getElementById(id("drawer-body"));
    if (!body) return;
    body.innerHTML = cfg.filters.map(renderGroup).join("");
    attachDrawerBody();
  };

  function attachDrawerBody() {
    document.querySelectorAll(`#${id("drawer-body")} [data-group-toggle]`).forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.dataset.groupToggle;
        if (expanded.has(g)) expanded.delete(g); else expanded.add(g);
        btn.closest(".filter-group").classList.toggle("is-expanded");
      });
    });
    document.querySelectorAll(`#${id("drawer-body")} input[type="checkbox"][data-group]`).forEach((input) => {
      input.addEventListener("change", () => {
        const arr = draft[input.dataset.group];
        const i = arr.indexOf(input.value);
        if (input.checked && i === -1) arr.push(input.value);
        if (!input.checked && i !== -1) arr.splice(i, 1);
        rerenderDrawerBody();
      });
    });
    document.querySelectorAll(`#${id("drawer-body")} [data-date-group]`).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const g = btn.dataset.dateGroup;
        openDateRangePicker({
          from: draft[g].from, to: draft[g].to, anchorEl: e.currentTarget,
          onApply: (from, to) => { draft[g] = { from, to }; rerenderDrawerBody(); },
        });
      });
    });
  }

  const onEscape = (e) => { if (e.key === "Escape") closeDrawer(); };

  function closeDrawer() {
    const wrap = document.getElementById(id("drawer-wrap"));
    if (!wrap) return;
    document.getElementById(id("overlay")).classList.remove("is-open");
    document.getElementById(id("drawer")).classList.remove("is-open");
    document.removeEventListener("keydown", onEscape);
    document.body.classList.remove("filters-drawer-open");
    setTimeout(() => wrap.remove(), 220);
  }

  function openDrawer() {
    draft = cloneFilters(s.filters);
    if (!expanded) {
      expanded = new Set();
      cfg.filters.forEach((f) => { if (filterActive(f, s.filters[f.id])) expanded.add(f.id); });
    }
    const wrap = document.createElement("div");
    wrap.id = id("drawer-wrap");
    wrap.innerHTML = `
      <div class="filters-drawer-overlay" id="${id("overlay")}"></div>
      <aside class="filters-drawer" id="${id("drawer")}">
        <div class="filters-drawer-header"><h2 class="filters-drawer-title">${t("access.common.drawerTitle")}</h2>
          <button type="button" class="filters-drawer-close" id="${id("drawer-close")}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg></button></div>
        <div class="filters-drawer-body" id="${id("drawer-body")}">${cfg.filters.map(renderGroup).join("")}</div>
        <div class="filters-drawer-footer"><button type="button" class="btn-secondary" id="${id("drawer-reset")}">${t("access.common.reset")}</button>
          <button type="button" class="btn-primary" id="${id("drawer-apply")}">${t("access.common.showResults")}</button></div>
      </aside>`;
    document.body.appendChild(wrap);
    attachDrawerBody();
    document.getElementById(id("drawer-close")).addEventListener("click", closeDrawer);
    document.getElementById(id("overlay")).addEventListener("click", closeDrawer);
    document.getElementById(id("drawer-reset")).addEventListener("click", () => {
      cfg.filters.forEach((f) => { s.filters[f.id] = f.kind === "date" ? { from: null, to: null } : []; });
      s.page = 1;
      draft = cloneFilters(s.filters);
      expanded = new Set();
      rerenderDrawerBody();
      updateTable();
      refreshChrome();
    });
    document.getElementById(id("drawer-apply")).addEventListener("click", () => {
      s.filters = cloneFilters(draft);
      s.page = 1;
      updateTable();
      refreshChrome();
      closeDrawer();
    });
    requestAnimationFrame(() => {
      document.getElementById(id("overlay")).classList.add("is-open");
      document.getElementById(id("drawer")).classList.add("is-open");
    });
    document.addEventListener("keydown", onEscape);
    document.body.classList.add("filters-drawer-open");
  }

  return {
    view() {
      // noCard — та же панель/таблица без внешней карточки-обёртки, для мест,
      // где список встроен в уже существующий контейнер (например, вкладка
      // "Счета" на карточке клиента — там своей карточки быть не должно).
      const inner = `
        ${renderTabs()}
        ${renderBar()}
        ${renderChips()}
        <div class="${cfg.noDivider ? "list-gap" : "list-divider"}"></div>
        <div id="${id("table")}">${renderTable()}</div>`;
      return `${renderMetrics()}${cfg.noCard ? inner : `<div class="card list-card">${inner}</div>`}`;
    },
    init() {
      const input = document.getElementById(id("search"));
      const clear = document.getElementById(id("search-clear"));
      const apply = () => { s.search = input.value; s.page = 1; clear.hidden = !input.value; updateTable(); refreshChrome(); };
      input.addEventListener("input", apply);
      clear.addEventListener("click", () => { input.value = ""; input.focus(); apply(); });
      const trigger = document.getElementById(id("trigger"));
      if (trigger) trigger.addEventListener("click", openDrawer);
      if (cfg.attachHeaderAction) cfg.attachHeaderAction();
      attachChrome();
      attachTable();
    },
    count: () => cfg.data().length,
    // Есть ли активные поиск/таб/фильтры — например, чтобы отключить перетаскивание строк, пока список неполный
    isFiltered: () => !!s.search.trim() || !!s.tab || activeCount() > 0,
    // Для экспорта: строки ровно как в таблице (поиск + таб + фильтры + сортировка, без пагинации), значение таба и
    // текстовое описание выбранных фильтров; openFilters открывает панель фильтров.
    exportRows: () => sortedRows(filteredRows()),
    tabValue: () => s.tab,
    filterLines() {
      const lines = [];
      if (s.search) lines.push(`${cfg.searchPlaceholder()}: «${escapeAttr(s.search)}»`);
      cfg.filters
        .filter((f) => filterActive(f, s.filters[f.id]))
        .forEach((f) => {
          const val = s.filters[f.id];
          lines.push(`${f.label()}: ${f.kind === "date" ? dateTriggerLabel(val.from, val.to) : multiSelectLabel(val, "", (v) => optionLabel(f, v))}`);
        });
      return lines;
    },
    openFilters: openDrawer,
    // Перерисовать таблицу после внешней мутации данных (не через поиск/фильтры/
    // пагинацию списка, а например действие в строке — статус счёта и т.п.).
    refresh: () => { updateTable(); refreshMetrics(); },
  };
}

// ---- Конфиги трёх списков --------------------------------------------------------------------
const AC_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const accessAdminsList = createAccessList({
  key: "admins",
  data: () => ACCESS_ADMINS,
  searchPlaceholder: () => t("access.admins.search"),
  searchText: (a) => `${a.name} ${a.email}`,
  tab: { get: (a) => a.status, values: ["ACTIVE", "INVITED", "EXPIRED", "SUSPENDED", "INACTIVE"], label: (v) => t(`access.enums.adminStatus.${v}`) },
  filters: [
    { id: "role", kind: "multi", label: () => t("access.admins.filters.role"), get: (a) => a.roleIds, options: () => ACCESS_ROLES.filter((r) => r.type === "ADMIN").map((r) => ({ value: r.id, label: r.name })) },
    { id: "identity", kind: "multi", label: () => t("access.admins.filters.identity"), get: (a) => a.hasIdentity, options: () => [{ value: "true", label: t("access.admins.identityYes") }, { value: "false", label: t("access.admins.identityNo") }] },
    { id: "created", kind: "date", label: () => t("access.admins.filters.created"), get: (a) => a.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: {
    name: (a, b) => a.name.localeCompare(b.name),
    email: (a, b) => a.email.localeCompare(b.email),
    status: (a, b) => a.status.localeCompare(b.status),
    created: (a, b) => a.createdDate - b.createdDate,
  },
  metrics: (list) => {
    const m = t("access.admins.metrics");
    const recent = new Date(MOCK_NOW.getTime() - AC_WEEK_MS);
    return [
      { value: list.filter((a) => a.status === "ACTIVE" && a.roleIds.includes("role-super")).length, label: m.supers },
      { value: list.filter((a) => a.status === "INVITED").length, label: m.waiting },
      { value: list.filter((a) => a.status === "SUSPENDED").length, label: m.suspended },
      { value: list.filter((a) => !a.hasIdentity).length, label: m.noIdentity },
      { value: list.filter((a) => a.createdDate >= recent).length, label: m.newRecent },
    ];
  },
  headerAction: () => accessBarActions(`<button type="button" class="btn-primary" id="ac-admin-invite">${PLUS_ICON_SVG}<span>${t("access.admins.invite")}</span></button>`),
  attachHeaderAction: () => accessAttachBarActions("ac-admin-invite", openInviteModal),
  columns: [
    { label: () => t("access.admins.columns.admin"), sort: "name", html: (a) => `<div class="identity-cell"><button type="button" class="table-link ac-admin-link" data-admin-id="${a.id}">${pdEscape(a.name)}</button><span class="table-cell-muted">${a.email}</span></div>` },
    { label: () => t("access.admins.columns.roles"), html: (a) => acRoleBadges(a.roleIds, 2) },
    { label: () => t("access.admins.columns.status"), sort: "status", html: (a) => acAdminStatusBadge(a.status) },
    { label: () => t("access.admins.columns.invited"), html: (a) => dateTimeCell(a.invitedAt) },
    { label: () => t("access.admins.columns.created"), sort: "created", html: (a) => dateTimeCell(a.createdAt) },
    { label: () => t("access.admins.columns.updated"), html: (a) => dateTimeCell(a.updatedAt) },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll(".ac-admin-link").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/settings-access/admin/${b.dataset.adminId}`; }));
  },
});

// Списки ролей и каталога живут в views/access-roles.js (загружается после этого файла), поэтому собираются лениво
const accessLists = () => ({ roles: accessRolesList, admins: accessAdminsList });

// ---- Экран с вкладками -----------------------------------------------------------------------
function renderAccessTabsBar() {
  return `<div class="cd-subtabs">${["roles", "admins"]
    .map(
      (k) =>
        `<button type="button" class="cd-subtab${accessActiveTab === k ? " is-active" : ""}" data-access-tab="${k}"><span>${t(`access.tabs.${k}`)}</span><span class="quick-tab-count">${accessLists()[k].count()}</span></button>`
    )
    .join("")}</div>`;
}

// Действия вкладки (экспорт и главное действие) — в строке поиска и фильтров самой вкладки
function accessBarActions(primaryHtml) {
  const x = t("accessList.export");
  return `<span class="filters-bar-end">${exportMenuHtml("ac-export", x.button, x.hint)}${primaryHtml}</span>`;
}

function accessAttachBarActions(primaryId, onPrimary) {
  bindExportMenu("ac-export", openExportAccessModal);
  const btn = primaryId ? document.getElementById(primaryId) : null;
  if (btn) btn.addEventListener("click", onPrimary);
}
// ---- Экспорт текущей вкладки (CSV / XLSX): то, что показывает таблица — поиск, таб, фильтры и сортировка, без учёта страницы ----
function openExportAccessModal(format) {
  const x = t("accessList.export");
  const list = accessLists()[accessActiveTab];
  const count = list.exportRows().length;
  const lines = list.filterLines();
  const tab = list.tabValue();
  if (tab) lines.unshift(`${t("accessList.export.status")}: ${accessActiveTab === "admins" ? t(`access.enums.adminStatus.${tab}`) : t(`access.enums.roleStatus.${tab}`)}`);
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle[accessActiveTab],
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(list.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${t("access.common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); list.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); exportAccessList(format); });
    },
  });
}

function exportAccessList(format) {
  const x = t("accessList.export");
  const list = accessLists()[accessActiveTab].exportRows();
  let rows;
  if (accessActiveTab === "roles") {
    rows = list.map(acmRoleExportRow);
  } else {
    rows = list.map((a) => [a.name, a.email, acRolesOfAdmin(a).map((r) => r.name).join(", "), t(`access.enums.adminStatus.${a.status}`), a.invitedAt, a.createdAt, a.updatedAt]);
  }
  exportTable(`access_${accessActiveTab}_${new Date().toISOString().slice(0, 10)}`, format, x.columns[accessActiveTab], rows);
  showToast(x.done[accessActiveTab](list.length));
}

function viewSettingsAccess() {
  // Прямая ссылка на вкладку: #/settings-access/roles | permissions | admins
  const m = window.location.hash.match(/^#\/?settings-access\/(roles|permissions|admins)$/);
  if (m) accessActiveTab = m[1] === "admins" ? "admins" : "roles";
  return `
    <div class="list-hero">${pageHeader(t("access.title"), t("navDescriptions.settings-access"))}</div>
    <div class="cd-tabs-wrap ac-tabs" id="ac-tabs">${renderAccessTabsBar()}</div>
    <div id="ac-tab-content">${accessLists()[accessActiveTab].view()}</div>
  `;
}

function initSettingsAccess() {
  document.querySelectorAll("[data-access-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      accessActiveTab = btn.dataset.accessTab;
      document.getElementById("ac-tabs").innerHTML = renderAccessTabsBar();
      document.getElementById("ac-tab-content").innerHTML = accessLists()[accessActiveTab].view();
      initSettingsAccess();
    });
  });
  accessLists()[accessActiveTab].init();
}
// ---- Маршруты деталей ------------------------------------------------------------------------
function currentAccessRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^settings-access\/(role|admin)\/(.+)$/);
  return m ? { kind: m[1], id: decodeURIComponent(m[2]) } : null;
}

function accessNotFound() {
  const a = t("access");
  return `${pageHeader(a.notFoundTitle)}
    <div class="empty-state"><div class="empty-state-icon">${ICONS.box}</div>
    <div class="empty-state-title">${a.notFoundTitle}</div><div class="empty-state-text">${a.notFoundText}</div></div>`;
}

function viewAccessDetail(ref) {
  if (ref.kind === "role") {
    const role = acRoleById(ref.id);
    return role ? viewRoleDetail(role) : accessNotFound();
  }
  const admin = acAdminById(ref.id);
  return admin ? viewAdminDetail(admin) : accessNotFound();
}

function initAccessDetail(ref) {
  const back = document.getElementById("ac-back");
  if (back) back.addEventListener("click", () => { window.location.hash = "#/settings-access"; });
  const root = document.getElementById("ac-root");
  if (!root) return;
  root.querySelectorAll(".collapsible-card-head").forEach((btn) => btn.addEventListener("click", () => btn.closest(".collapsible-card").classList.toggle("is-collapsed")));
  root.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => btn.addEventListener("click", () => copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn))));
  root.querySelectorAll(".copy-target").forEach((el) => el.addEventListener("click", () => copyTextToClipboard(el.dataset.copyText).then(() => { el.classList.add("is-copied"); setTimeout(() => el.classList.remove("is-copied"), 900); })));
  root.querySelectorAll("[data-ac-role-link]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/settings-access/role/${b.dataset.acRoleLink}`; }));
  root.querySelectorAll("[data-ac-admin-link]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/settings-access/admin/${b.dataset.acAdminLink}`; }));
  if (ref.kind === "role") attachRoleDetail(acRoleById(ref.id), root);
  else attachAdminDetail(acAdminById(ref.id), root);
}

// Страница роли (матрица доступа) и каталог прав — views/access-roles.js
// ---- Страница администратора ------------------------------------------------------------------
function acAdminActions(admin) {
  const ad = t("access.adminDetail.actions");
  const lastSuper = acIsLastActiveSuper(admin);
  const self = acIsSelf(admin);
  const item = (act, label, icon, danger) => ({ label, icon, danger, attrs: `data-ac-action="${act}"` });
  const primary = (act, label) => `<button type="button" class="btn-primary" data-ac-action="${act}">${label}</button>`;
  const del = !lastSuper && !self ? [item("delete", ad.delete, TRASH_ICON_SVG, true)] : [];
  const suspend = !lastSuper && !self ? [item("suspend", ad.suspend, ICONS.lock, true)] : [];
  let main = "";
  let items = [];
  switch (admin.status) {
    case "INVITED": items = [item("rename", ad.rename, EDIT_ICON_SVG), ...del]; break;
    case "EXPIRED": main = primary("resend", ad.resend); items = [...del]; break;
    case "ACTIVE": main = primary("roles", ad.roles); items = [item("rename", ad.rename, EDIT_ICON_SVG), ...suspend, ...del]; break;
    case "SUSPENDED":
    case "INACTIVE": main = primary("activate", ad.activate); items = [...del]; break;
    default: break;
  }
  return `${main}${items.length ? rowKebabMenu("ac-admin-menu", items) : ""}`;
}

// Страница администратора: голубая шапка со статусом, главное действие и меню «⋯», сводка, слева плоские секции
// (основное, роли, итоговый доступ), справа — страницы меню, которые открывают роли администратора
function viewAdminDetail(admin) {
  const a = t("access");
  const ad = a.adminDetail;
  const roles = acRolesOfAdmin(admin);
  const grants = acmEffectiveGrants(roles);
  const lastSuper = acIsLastActiveSuper(admin);
  const isPending = admin.status === "INVITED" || admin.status === "EXPIRED";
  const sectionsCount = Object.keys(grants).filter((c) => acmFeature(c)).length;

  // Реального письма нет — демо-ссылка на #/accept-invite/:id (views/login.js: viewAcceptInvite) заменяет его,
  // пока приглашение не принято (иначе ссылка уже не нужна — учётка есть, экран приглашения её не примет).
  const inviteLinkField =
    admin.status === "INVITED" && !admin.hasIdentity
      ? copyableField(ad.fields.inviteLink, `${window.location.origin}${window.location.pathname}#/accept-invite/${admin.id}`, `<a class="table-link" href="#/accept-invite/${admin.id}">${ad.inviteLinkOpen}</a>`)
      : "";

  const main = `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(ad.fields.name, admin.name)}
      ${copyableField(ad.fields.email, admin.email)}
      ${detailField(ad.fields.status, acAdminStatusBadge(admin.status))}
      ${detailField(ad.fields.identity, admin.hasIdentity ? a.admins.identityYes : a.admins.identityNo)}
      ${detailField(ad.fields.invited, admin.invitedAt)}
      ${copyableField("ID", admin.id)}
      ${detailField(ad.fields.created, admin.createdAt)}
      ${detailField(ad.fields.updated, admin.updatedAt)}
      ${inviteLinkField}
    </div>`;

  const rolesBody = `${isPending ? `<div class="table-cell-muted ac-rule-desc">${ad.pendingRolesHint}</div>` : ""}
    ${roles.length
      ? `<div class="acm-role-list">${roles.map((r) => `<div class="acm-role-row"><div><button type="button" class="table-link" data-ac-role-link="${r.id}">${r.name}</button><div class="table-cell-muted">${pdEscape(r.description)}</div></div><div class="ac-badges">${acRoleStatusBadge(r.status)}${r.isSystem ? `<span class="badge badge-info">${a.roles.systemBadge}</span>` : ""}</div></div>`).join("")}</div>`
      : `<div class="table-cell-muted">${ad.noRoles}</div>`}`;

  return `
    <div id="ac-root">
      <div class="card client-detail-header cd-hero">
        <button type="button" class="client-detail-back" id="ac-back" title="${ad.back}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg></button>
        <div class="client-detail-header-main">
          <div class="client-detail-title-row"><span class="page-title">${pdEscape(admin.name)}</span>${acAdminStatusBadge(admin.status)}</div>
          <div class="client-detail-subtitle"><span class="inline-copy">${admin.email}${copyIconButton(admin.email)}</span><span class="client-detail-subtitle-sep">·</span><span>${admin.createdAt}</span></div>
        </div>
        <div class="pd-header-tools">${acAdminActions(admin)}</div>
      </div>
      ${lastSuper ? `<div class="card client-block-card"><div class="table-cell-muted">${ad.lastSuperHint}</div></div>` : ""}
      ${admin.status === "SUSPENDED" && admin.suspensionReason ? `<div class="card client-block-card"><div class="detail-section-title">${ad.sections.reason}</div><ul class="block-reasons-list"><li>${pdEscape(admin.suspensionReason)}</li></ul></div>` : ""}
      <div class="client-detail-grid">
        <div class="client-detail-grid-main">
          <div class="profile-flat-block">
            ${flatSection(ad.sections.main, main)}
            ${flatSection(`${ad.sections.roles} · ${roles.length}`, rolesBody)}
            ${flatSection(`${ad.sections.access} · ${sectionsCount}`, acmAdminAccessHtml(roles, ad))}
          </div>
        </div>
        <div class="client-detail-grid-side">${acmPagesCardHtml(null, grants)}</div>
      </div>
    </div>`;
}

function attachAdminDetail(admin, root) {
  root.querySelectorAll("[data-ac-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.acAction;
      if (act === "rename") openAdminRenameModal(admin);
      if (act === "roles") openAdminRolesModal(admin);
      if (act === "suspend") openSuspendModal(admin);
      if (act === "activate") confirmActivateAdmin(admin);
      if (act === "resend") confirmResendInvitation(admin);
      if (act === "delete") confirmDeleteAdmin(admin);
    });
  });
}

// ---- Модалки ------------------------------------------------------------------------------------
function acTouch(entity) {
  const now = pdNow();
  entity.updatedDate = now;
  entity.updatedAt = formatDateTime(now);
  return now;
}

function acAssignableRoles(currentIds) {
  return ACCESS_ROLES.filter((r) => r.type === "ADMIN" && !r.contractOnly && (r.status === "ACTIVE" || currentIds.includes(r.id)));
}

// Выбор ролей: выпадающий список с поиском по названию роли; выбранные роли — чипами в поле
// texts { placeholder, search, empty } — подмена подписей, когда вместо ролей выбирают другие сущности; matchWidth — попап на всю ширину поля
function acRolePicker(root, boxId, initialIds, roles, texts, matchWidth) {
  const m = Object.assign({}, t("access.modals"), texts ? { rolesPlaceholder: texts.placeholder, rolesSearch: texts.search, rolesEmpty: texts.empty } : {});
  const state = { ids: [...initialIds] };
  const box = root.querySelector(`#${boxId}`);
  box.innerHTML = `<div class="ac-role-picker" tabindex="0"><div class="ac-role-chips"></div><span class="ac-role-caret">${ICONS.chevron}</span></div>`;
  const trigger = box.querySelector(".ac-role-picker");
  const chipsEl = box.querySelector(".ac-role-chips");
  const options = roles.map((r) => ({ value: r.id, label: `<span class="ac-rule-label">${pdEscape(r.name)}<span class="table-cell-muted">${pdEscape(r.description)}</span></span>`, searchText: texts ? `${r.name} ${r.description}` : r.name }));
  const draw = () => {
    const chips = state.ids.map((id) => roles.find((r) => r.id === id)).filter(Boolean)
      .map((r) => `<span class="ac-role-chip">${pdEscape(r.name)}<button type="button" class="ac-role-chip-x" data-x="${r.id}" aria-label="${t("access.common.delete")}">×</button></span>`).join("");
    chipsEl.innerHTML = chips || `<span class="ac-role-placeholder">${m.rolesPlaceholder}</span>`;
    chipsEl.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      state.ids = state.ids.filter((id) => id !== b.dataset.x);
      draw();
    }));
  };
  const open = () => openSelectDropdown({ anchorEl: trigger, options, selected: state.ids, searchPlaceholder: m.rolesSearch, emptyLabel: m.rolesEmpty, matchWidth, onChange: (ids) => { state.ids = ids; draw(); } });
  trigger.addEventListener("click", open);
  trigger.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  draw();
  return { ids: () => state.ids };
}
function openInviteModal() {
  const m = t("access.modals");
  const c = t("access.common");
  openModal({
    title: m.inviteTitle,
    width: 520,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${m.inviteText}</p>
      <label class="filters-field"><span class="filters-field-label">${m.nameLabel}</span><input class="address-form-input" type="text" id="ac-inv-name" /></label>
      <label class="filters-field ac-field"><span class="filters-field-label">${m.emailLabel}</span><input class="address-form-input" type="email" id="ac-inv-email" /></label>
      <div class="filters-field ac-field"><span class="filters-field-label">${m.rolesLabel}</span><div id="ac-inv-roles"></div></div>
      <div class="form-error" id="ac-modal-error" hidden></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="ac-cancel">${c.cancel}</button><button type="button" class="btn-primary" id="ac-submit">${m.inviteSubmit}</button>`,
    onMount: (el) => {
      const err = el.querySelector("#ac-modal-error");
      const fail = (msg) => { err.textContent = msg; err.hidden = false; };
      const picker = acRolePicker(el, "ac-inv-roles", [], acAssignableRoles([]));
      el.querySelector("#ac-cancel").addEventListener("click", closeModal);
      el.querySelector("#ac-submit").addEventListener("click", () => {
        const name = el.querySelector("#ac-inv-name").value.trim();
        const email = el.querySelector("#ac-inv-email").value.trim().toLowerCase();
        const roleIds = picker.ids();
        if (!name) return fail(m.errName);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(m.errEmail);
        if (ACCESS_ADMINS.some((a) => a.email.toLowerCase() === email)) return fail(m.errExists);
        if (!roleIds.length) return fail(m.errRoles);
        const now = pdNow();
        ACCESS_ADMINS.unshift({
          id: seedToPaymentUuid(Date.now() % 100000),
          name, email, status: "INVITED", roleIds,
          invitedDate: now, invitedAt: formatDateTime(now), suspensionReason: null, hasIdentity: false,
          createdDate: now, createdAt: formatDateTime(now), updatedDate: now, updatedAt: formatDateTime(now),
        });
        closeModal();
        accessActiveTab = "admins";
        render();
      });
    },
  });
}

function openAdminRenameModal(admin) {
  const m = t("access.modals");
  openPaymentTextModal({
    title: m.renameTitle, label: m.nameLabel, value: admin.name, requiredMsg: m.errName,
    submitLabel: t("access.common.save"), multiline: false,
    onSubmit: (name) => { admin.name = name; acTouch(admin); render(); },
  });
}

function openAdminRolesModal(admin) {
  const m = t("access.modals");
  const c = t("access.common");
  openModal({
    title: m.rolesTitle, width: 520,
    bodyHtml: `<div id="ac-roles-list"></div><div class="form-error" id="ac-modal-error" hidden>${m.errRoles}</div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="ac-cancel">${c.cancel}</button><button type="button" class="btn-primary" id="ac-submit">${c.save}</button>`,
    onMount: (el) => {
      const picker = acRolePicker(el, "ac-roles-list", admin.roleIds, acAssignableRoles(admin.roleIds));
      el.querySelector("#ac-cancel").addEventListener("click", closeModal);
      el.querySelector("#ac-submit").addEventListener("click", () => {
        const ids = picker.ids();
        if (!ids.length) { el.querySelector("#ac-modal-error").hidden = false; return; }
        if (admin.roleIds.includes("role-super") && !ids.includes("role-super") && acIsLastActiveSuper(admin)) {
          const err = el.querySelector("#ac-modal-error");
          err.textContent = m.errLastSuper; err.hidden = false; return;
        }
        admin.roleIds = ids; acTouch(admin); closeModal(); render();
      });
    },
  });
}

function openSuspendModal(admin) {
  const m = t("access.modals");
  openPaymentTextModal({
    title: m.suspendTitle, intro: m.suspendText, label: m.reasonLabel, requiredMsg: m.errReason,
    submitLabel: t("access.adminDetail.actions.suspend"), danger: true,
    onSubmit: (reason) => { admin.status = "SUSPENDED"; admin.suspensionReason = reason; acTouch(admin); render(); },
  });
}

function confirmActivateAdmin(admin) {
  const m = t("access.modals");
  openConfirmModal({
    title: m.activateTitle, text: m.activateText(admin.name), confirmLabel: t("access.adminDetail.actions.activate"),
    cancelLabel: t("access.common.cancel"), danger: false,
    onConfirm: () => { admin.status = "ACTIVE"; admin.suspensionReason = null; acTouch(admin); render(); },
  });
}

function confirmResendInvitation(admin) {
  const m = t("access.modals");
  openConfirmModal({
    title: m.resendTitle, text: m.resendText(admin.email), confirmLabel: t("access.adminDetail.actions.resend"),
    cancelLabel: t("access.common.cancel"), danger: false,
    onConfirm: () => { const now = acTouch(admin); admin.status = "INVITED"; admin.invitedDate = now; admin.invitedAt = formatDateTime(now); render(); },
  });
}

function confirmDeleteAdmin(admin) {
  const m = t("access.modals");
  openConfirmModal({
    title: m.deleteAdminTitle, text: m.deleteAdminText(admin.name, admin.email), confirmLabel: t("access.common.delete"),
    cancelLabel: t("access.common.cancel"), danger: true,
    onConfirm: () => {
      ACCESS_ADMINS.splice(ACCESS_ADMINS.indexOf(admin), 1);
      accessActiveTab = "admins";
      window.location.hash = "#/settings-access";
    },
  });
}






