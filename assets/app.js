/* ==========================================================================
   Мини-роутер админ-панели.
   Без фреймворка и без сборки: hash-роутинг + рендер вьюх в контейнер.
   Работает прямо из file:// — важно для локальной отладки без сервера.
   Тексты берутся из assets/i18n.js через t('namespace.key').
   ========================================================================== */

if (window.mermaid) {
  mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
}

// ---- Иконки (inline SVG, без внешних иконок-шрифтов/CDN) -----------------
const ICONS = {
  home: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 10 3l7 6.5"/><path d="M5 8.5V17h10V8.5"/><path d="M8 17v-4.5h4V17"/></svg>`,
  clients: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="7" r="2.75"/><path d="M2.5 17c.4-3 2.4-4.8 5-4.8s4.6 1.8 5 4.8"/><circle cx="14.5" cy="6.5" r="2"/><path d="M13 12.3c2.2.2 3.7 1.9 4 4.7"/></svg>`,
  user: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="3"/><path d="M4 17c.6-3.6 2.9-5.5 6-5.5s5.4 1.9 6 5.5"/></svg>`,
  building: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="10" height="14" rx="1"/><path d="M8 7h.01M11 7h.01M8 10h.01M11 10h.01M8 13h.01M11 13h.01"/></svg>`,
  operations: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="15" height="10" rx="1.5"/><path d="M2.5 9.2h15"/><circle cx="14" cy="12.6" r="1"/></svg>`,
  payments: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="15" height="9" rx="1.5"/><circle cx="10" cy="10" r="2"/><path d="M5 8v4M15 8v4"/></svg>`,
  exchange: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10.5M14.5 7 11.5 4M14.5 7l-3 3"/><path d="M16 13H5.5M5.5 13l3-3M5.5 13l3 3"/></svg>`,
  otc: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6.5" r="2.3"/><circle cx="14" cy="6.5" r="2.3"/><path d="M2.5 15c0-2.2 1.6-3.6 3.5-3.6 1 0 1.8.3 2.4.9M17.5 15c0-2.2-1.6-3.6-3.5-3.6-1 0-1.8.3-2.4.9M7.5 16h5"/></svg>`,
  analytics: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V3"/><path d="M3 17h14"/><rect x="6" y="10.5" width="2.4" height="6.5" rx="0.4"/><rect x="10.2" y="7" width="2.4" height="10" rx="0.4"/><rect x="14.4" y="12.5" width="2.4" height="4.5" rx="0.4"/></svg>`,
  security: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5 16 5v4.7c0 4-2.6 6.8-6 8.3-3.4-1.5-6-4.3-6-8.3V5l6-2.5Z"/><path d="M7.5 10 9 11.5 12.5 8"/></svg>`,
  settings: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.6"/><path d="M10 3v1.6M10 15.4V17M17 10h-1.6M4.6 10H3M15 5l-1.2 1.2M6.2 13.8 5 15M15 15l-1.2-1.2M6.2 6.2 5 5"/></svg>`,
  box: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5 17 6v8l-7 3.5L3 14V6l7-3.5Z"/><path d="M3 6l7 3.5L17 6M10 9.5V17"/></svg>`,
  lock: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="9" width="11" height="7.5" rx="1.5"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9"/></svg>`,
  accounts: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="15" height="11" rx="1.6"/><path d="M2.5 8h15"/><path d="M13 12.5h2.5"/></svg>`,
  chevron: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 8 4 4 4-4"/></svg>`,
  calendar: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/></svg>`,
};

// ---- Флаги языков (inline SVG) ---------------------------------------------
const FLAG_ICONS = {
  ru: `<svg viewBox="0 0 20 14" width="100%" height="100%"><rect width="20" height="14" fill="#fff"/><rect y="4.67" width="20" height="9.33" fill="#0039A6"/><rect y="9.33" width="20" height="4.67" fill="#D52B1E"/></svg>`,
  en: `<svg viewBox="0 0 60 30" width="100%" height="100%"><rect width="60" height="30" fill="#00247d"/><g stroke="#fff" stroke-width="6"><path d="M0,0 L60,30 M60,0 L0,30"/></g><g stroke="#cf142b" stroke-width="2"><path d="M0,0 L60,30 M60,0 L0,30"/></g><g stroke="#fff" stroke-width="10"><path d="M30,0 V30 M0,15 H60"/></g><g stroke="#cf142b" stroke-width="6"><path d="M30,0 V30 M0,15 H60"/></g></svg>`,
};

// Компактный код языка в триггере переключателя (RU/EN) — не переводится
const LANG_CODES = {
  ru: "RU",
  en: "EN",
};

// ---- Конфиг навигации --------------------------------------------------------
// Дерево: пункт либо конечный (кликабельный, есть своя страница), либо
// родительский с children — тогда сам он раскрывает/сворачивает список
// вложенных пунктов и своей страницы не имеет.
const NAV_TREE = [
  { id: "home", icon: "home", section: "workspace" },
  {
    id: "clients",
    icon: "clients",
    children: [
      { id: "clients-users", icon: "user" },
      { id: "clients-companies", icon: "building" },
      { id: "clients-partners", icon: "exchange" },
    ],
  },
  {
    id: "analytics-dashboards",
    section: "analytics",
    icon: "analytics",
    children: [
      { id: "analytics-users", icon: "user" },
      { id: "analytics-operations", icon: "operations" },
      { id: "analytics-accounts", icon: "accounts" },
      { id: "analytics-eod", icon: "box" },
      { id: "analytics-events", icon: "security" },
      { id: "analytics-routing", icon: "exchange" },
    ],
  },
  {
    id: "operations",
    section: "finance",
    icon: "operations",
    children: [
      { id: "operations-payments", icon: "payments" },
      { id: "operations-crypto-payments", icon: "payments" },
      { id: "operations-exchanges", icon: "exchange" },
      { id: "operations-otc", icon: "otc" },
    ],
  },
  // Клиентам и админам в основном разделе — просто "Счета" (в БД это виртуальные). Реальные и корреспондентские счета —
  // служебные, живут в "Настройки системы".
  { id: "accounts-virtual", icon: "accounts" },
  {
    id: "eod",
    icon: "operations",
    children: [
      { id: "eod-dashboard", icon: "analytics" },
      { id: "eod-discrepancies", icon: "security" },
      { id: "eod-history", icon: "box" },
    ],
  },
  { id: "financial-reports", icon: "box" },
  {
    id: "security",
    section: "platform",
    icon: "security",
    children: [
      { id: "security-audit-logs", icon: "lock" },
      { id: "security-aml-checks", icon: "exchange" },
      { id: "security-system-access", icon: "lock" },
      { id: "twofa-policy", icon: "lock" },
    ],
  },
  {
    // Настройки, которыми пользуются часто и которые не затрагивают основу системы: роли, курсы,
    // маршрутизация, тарифы, санкционные списки, расписание операционного дня.
    id: "settings-operational",
    icon: "settings",
    children: [
      { id: "settings-access", icon: "security" },
      { id: "settings-rates", icon: "exchange" },
      { id: "settings-vabs-accounts", icon: "accounts" },
      {
        id: "settings-routing",
        icon: "payments",
        children: [
          { id: "settings-routing-rules", icon: "box" },
          { id: "settings-routing-settings", icon: "settings" },
          { id: "settings-routing-executions", icon: "operations" },
        ],
      },
      {
        id: "settings-tariffs",
        icon: "payments",
        children: [
          { id: "settings-tariffs-catalog", icon: "box" },
          { id: "settings-tariffs-operations", icon: "operations" },
          { id: "settings-tariffs-limits", icon: "security" },
          { id: "settings-tariffs-restrictions", icon: "lock" },
          { id: "settings-tariffs-commissions", icon: "payments" },
        ],
      },
      ...(TF_MASKS_ENABLED
        ? [
            {
              id: "settings-masks",
              icon: "security",
              children: [
                { id: "settings-masks-list", icon: "box" },
                { id: "settings-masks-templates", icon: "lock" },
                { id: "settings-masks-parameters", icon: "settings" },
                { id: "settings-masks-assignments", icon: "user" },
              ],
            },
          ]
        : []),
      {
        id: "settings-sanctions",
        icon: "lock",
        children: [
          { id: "settings-sanctions-individuals", icon: "user" },
          { id: "settings-sanctions-companies", icon: "building" },
        ],
      },
      {
        id: "settings-eod",
        icon: "operations",
        children: [
          { id: "settings-eod-day", icon: "settings" },
          { id: "settings-eod-reconciliation", icon: "security" },
        ],
      },
    ],
  },
  {
    // Конфигурация основы системы: правила проверки клиентов, скоринг транзакций, справочники и
    // интеграции ядра vABS. Меняется редко, ошибка задевает систему целиком.
    id: "settings-core",
    icon: "lock",
    children: [
      {
        id: "settings-verifications",
        icon: "security",
        children: [
          { id: "settings-verif-kyc", icon: "user" },
          { id: "settings-verif-kyb", icon: "building" },
          { id: "settings-verif-documents", icon: "box" },
          { id: "settings-verif-addresses", icon: "building" },
        ],
      },
      {
        id: "settings-kyt",
        icon: "security",
        children: [{ id: "settings-kyt-configs", icon: "box" }],
      },
      {
        id: "settings-vabs",
        icon: "settings",
        children: [
          { id: "settings-vabs-networks", icon: "exchange" },
          { id: "settings-vabs-currencies", icon: "payments" },
          { id: "settings-vabs-enums", icon: "box" },
          { id: "settings-vabs-operations", icon: "operations" },
          { id: "settings-vabs-providers", icon: "building" },
        ],
      },
    ],
  },
];

// Плоский индекс по id — включает и родителей, и детей, с обратной ссылкой
// на родителя (нужна для хлебных крошек: "Клиенты / Пользователи").
const NAV_INDEX = {};
(function buildNavIndex(items, parent) {
  items.forEach((item) => {
    NAV_INDEX[item.id] = { id: item.id, icon: item.icon, children: item.children, parent };
    if (item.children) buildNavIndex(item.children, NAV_INDEX[item.id]);
  });
})(NAV_TREE);

// Роутится только то, у чего нет children (у родителя своей страницы нет)
const LEAF_ROUTE_IDS = Object.keys(NAV_INDEX).filter((id) => !NAV_INDEX[id].children);

// Роуты вне сайдбара (открываются из шапки, не подсвечивают nav-item)
const EXTRA_ROUTE_IDS = ["profile", "logged-out", "login"];

const DEFAULT_ROUTE = "home";

// ---- Текущий администратор ---------------------------------------------------
// roleKey — ключ в I18N.roles, остальное — реальные данные, не переводится.
const CURRENT_ADMIN = {
  name: "Админ Тестовый",
  roleKey: "support",
  email: "admin@asiafin.tech",
  login: "a.testov",
  initials: "АТ",
  lastLogin: "18.09.2026, 09:42",
};

let currentLang = "ru";

// id раскрытых родительских пунктов сайдбара (кроме тех, что раскрыты
// автоматически, потому что внутри активный дочерний роут)
const expandedGroups = new Set();

// ---- Хелперы для навигации ----------------------------------------------------
function navLabel(item) {
  return t(`nav.${item.id}`);
}

// Название родителя — используется в хлебных крошках для вложенных пунктов
function navParentLabel(item) {
  return item.parent ? t(`nav.${item.parent.id}`) : null;
}

// ---- Рендер сайдбара ----------------------------------------------------------
function renderSidebar() {
  const nav = document.getElementById("sidebar-nav");
  let html = "";
  NAV_TREE.forEach((item) => {
    if (item.section) html += `<div class="sidebar-group-label">${t(`navSections.${item.section}`)}</div>`;
    html += renderNavNode(item);
  });
  nav.innerHTML = html;
}

// Для страниц деталей подсвечиваем и раскрываем пункт списка, из которого они открыты
function activeNavId(routeId = currentRouteId()) {
  if (routeId === "accounts-detail") {
    const r = currentAccountRef();
    return r ? (r.kind === "virtual" ? "accounts-virtual" : "settings-vabs-accounts") : routeId;
  }
  if (routeId === "settings-vabs-detail") {
    const r = vbRef();
    return r ? `settings-vabs-${r.kind}` : routeId;
  }
  if (routeId === "settings-verif-detail") {
    const r = vfRef();
    return r ? `settings-verif-${r.kind}` : routeId;
  }
  if (routeId === "kyt-detail") {
    const r = ktRef();
    return r ? (r.kind === "config" ? "settings-kyt-configs" : "security-aml-checks") : routeId;
  }
  if (routeId === "tariffs-detail") {
    const r = tfRef();
    const list = { tariff: "settings-tariffs-catalog", limit: "settings-tariffs-limits", commission: "settings-tariffs-commissions", mask: "settings-masks-list" };
    return r ? list[r.kind] : routeId;
  }
  if (routeId === "eod-detail") {
    const r = eodRef();
    return r ? (r.kind === "day" ? "eod-history" : "eod-discrepancies") : routeId;
  }
  if (routeId === "operations-payment-detail") {
    const r = currentPaymentRef();
    return r ? paymentListRouteId(r) : routeId;
  }
  if (routeId === "operations-otc-detail") return "operations-otc";
  if (routeId === "clients-partners-detail") return "clients-partners";
  if (routeId === "clients-partner-users-detail") return "clients-partners";
  if (routeId === "settings-routing-rule") return "settings-routing-rules";
  if (routeId === "settings-routing-execution") return "settings-routing-executions";
  return routeId;
}

function navHasActive(item, activeId) {
  return (item.children || []).some((c) => c.id === activeId || (c.children && navHasActive(c, activeId)));
}

function renderNavNode(item, depth = 0) {
  if (!item.children) {
    return renderNavRow(item, { clickable: true, indent: depth > 0, depth });
  }

  const hasActiveChild = navHasActive(item, activeNavId());
  const isExpanded = expandedGroups.has(item.id) || hasActiveChild;

  return `
    <div class="nav-group${isExpanded ? " is-expanded" : ""}">
      ${renderNavRow(item, { clickable: false, indent: depth > 0, depth, toggle: true, hasActiveChild })}
      <div class="nav-children">
        ${item.children.map((child) => renderNavNode(child, depth + 1)).join("")}
      </div>
    </div>
  `;
}

function renderNavRow(item, { clickable, indent, depth = 0, toggle, hasActiveChild }) {
  const classes = ["nav-item"];
  if (indent) classes.push("nav-item-child");
  if (depth >= 2) classes.push("nav-item-child-2");
  if (hasActiveChild) classes.push("has-active-child");

  const attrs = clickable ? `data-route="${item.id}"` : `data-toggle="${item.id}"`;

  return `
    <div class="${classes.join(" ")}" ${attrs}>
      <span class="nav-item-icon">${ICONS[item.icon] || ""}</span>
      <span class="nav-item-label">${navLabel(item)}</span>
      ${toggle ? `<span class="nav-item-chevron">${ICONS.chevron}</span>` : ""}
    </div>
  `;
}

// ---- Клики по сайдбару: делегирование, переживает перерисовку -------------------
function initSidebarNav() {
  const nav = document.getElementById("sidebar-nav");

  nav.addEventListener("click", (e) => {
    const toggleEl = e.target.closest("[data-toggle]");
    if (toggleEl) {
      const groupId = toggleEl.dataset.toggle;

      // Сайдбар свёрнут в иконки — сначала разворачиваем его целиком,
      // иначе раскрывать вложенные пункты некуда.
      if (document.getElementById("sidebar").classList.contains("is-collapsed")) {
        setSidebarCollapsed(false);
      }

      if (expandedGroups.has(groupId)) {
        expandedGroups.delete(groupId);
      } else {
        expandedGroups.add(groupId);
      }
      renderSidebar();
      return;
    }

    const routeEl = e.target.closest("[data-route]");
    if (routeEl) {
      window.location.hash = `#/${routeEl.dataset.route}`;
    }
  });
}

// ---- Статический текст шапки/сайдбара, не завязанный на роут ------------------
function renderStaticTexts() {
  // Название бренда — часть логотипа, не локализуется (см. i18n.js: brand.title больше не используется)
  document.getElementById("sidebar-brand-subtitle").textContent = t("brand.subtitle");
  document.getElementById("user-menu-profile-label").textContent = t("user.profile");
  document.getElementById("user-menu-logout-label").textContent = t("user.logout");
  document.getElementById("lang-dropdown-label").textContent = t("langSwitch.label");
  document.getElementById("navbar-home-btn").title = t("nav.home");

  document.getElementById("navbar-user-name").textContent = CURRENT_ADMIN.name;
  document.getElementById("navbar-user-role").textContent = CURRENT_ADMIN.email;
  document.getElementById("navbar-user-avatar").textContent = CURRENT_ADMIN.initials;
}

// ---- Переключатель языка (выпадающий список) -----------------------------------
function initLangSwitch() {
  const wrapper = document.getElementById("lang-dropdown");
  const currentLabel = document.getElementById("lang-dropdown-current");
  const currentFlag = document.getElementById("lang-dropdown-flag");

  wrapper.addEventListener("click", (e) => {
    const item = e.target.closest(".lang-dropdown-item");
    if (item) {
      e.stopPropagation();
      currentLang = item.dataset.lang;
      currentLabel.textContent = LANG_CODES[currentLang] || currentLang.toUpperCase();
      currentFlag.innerHTML = FLAG_ICONS[currentLang] || "";
      wrapper.querySelectorAll(".lang-dropdown-item").forEach((el) => {
        el.classList.toggle("is-active", el === item);
      });
      wrapper.classList.remove("is-open");

      // Язык сменился — перерисовываем всё, что зависит от текста.
      renderStaticTexts();
      renderSidebar();
      render();
      return;
    }
    wrapper.classList.toggle("is-open");
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      wrapper.classList.remove("is-open");
    }
  });
}

// ---- Меню профиля в шапке -------------------------------------------------------
function initUserMenu() {
  const wrapper = document.getElementById("navbar-user");

  wrapper.addEventListener("click", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (actionEl) {
      e.stopPropagation();
      wrapper.classList.remove("is-open");
      if (actionEl.dataset.action === "profile") {
        window.location.hash = "#/profile";
      } else if (actionEl.dataset.action === "logout") {
        window.location.hash = "#/login";
      }
      return;
    }
    wrapper.classList.toggle("is-open");
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      wrapper.classList.remove("is-open");
    }
  });
}

// ---- Кнопка "домой" в хедере -------------------------------------------------
function initHeaderHome() {
  document.getElementById("navbar-back-btn").addEventListener("click", (e) => {
    const r = e.currentTarget.dataset.route;
    if (r) window.location.hash = `#/${r}`;
  });
  document.getElementById("navbar-home-btn").addEventListener("click", () => {
    window.location.hash = `#/${DEFAULT_ROUTE}`;
  });
}

// ---- Документация раздела: плавающая кнопка вне канваса, открывает спеку на весь
// экран (см. section-docs.js: SECTION_DOCS). Пишется только по-русски, не зависит
// от переключателя языка интерфейса. Кнопка видна только там, где для текущего
// роута уже есть описание.
function sectionDocsFor(routeId) {
  return SECTION_DOCS[routeId] || null;
}

function updateDocsFab(routeId) {
  const btn = document.getElementById("docs-fab");
  const doc = sectionDocsFor(routeId);
  btn.classList.toggle("is-visible", !!doc);
  btn.title = "";
}

function openSectionDocsView() {
  const doc = sectionDocsFor(currentRouteId());
  if (!doc) return;
  document.getElementById("docs-view-eyebrow").textContent = SECTION_DOCS_COMMON.eyebrow;
  document.getElementById("docs-view-title").textContent = doc.title;
  document.getElementById("docs-view-body").innerHTML = `<p class="docs-view-intro">${doc.intro}</p>${doc.blocks
    .map((b) => `<div class="docs-view-block"><h2 class="docs-view-block-heading">${b.heading}</h2>${b.mermaid ? `<pre class="mermaid">${b.mermaid}</pre>` : `<div class="docs-view-block-text">${b.text}</div>`}</div>`)
    .join("")}`;
  document.getElementById("docs-view").classList.add("is-open");
  document.body.classList.add("docs-view-open");
  if (window.mermaid) mermaid.run({ nodes: document.querySelectorAll("#docs-view-body .mermaid") });
}

function closeSectionDocsView() {
  document.getElementById("docs-view").classList.remove("is-open");
  document.body.classList.remove("docs-view-open");
}

function initDocsFab() {
  document.getElementById("docs-fab").addEventListener("click", openSectionDocsView);
  document.getElementById("docs-view-close").addEventListener("click", closeSectionDocsView);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("docs-view").classList.contains("is-open")) closeSectionDocsView();
  });
}

// ---- Паттерн заголовка страницы: карточка на всю ширину -------------------------
// Путь раздела (родитель/название) теперь живёт в хлебных крошках в хедере,
// в самой карточке — только название раздела.
// subtitle — необязательное пояснение раздела под заголовком (везде, кроме Главной).
// actionsHtml — необязательный HTML для кнопок/фильтров справа от заголовка.
function pageHeader(title, subtitle, actionsHtml) {
  return `
    <div class="page-header">
      <div class="page-header-main">
        <h1 class="page-title">${title}</h1>
        ${subtitle ? `<p class="page-subtitle">${subtitle}</p>` : ""}
      </div>
      ${actionsHtml ? `<div class="page-header-actions">${actionsHtml}</div>` : ""}
    </div>
  `;
}

// ---- Хлебные крошки в хедере: родитель / название раздела ------------------------
function renderBreadcrumbs(routeId, navItem) {
  const el = document.getElementById("breadcrumbs");
  // Узкий экран: на карточках (есть родительский список) вместо крошек — кнопка "назад", на общих блоках — иконка "домой"
  const backBtn = document.getElementById("navbar-back-btn");
  backBtn.hidden = true;
  backBtn.dataset.route = "";
  document.querySelector(".navbar-left").classList.remove("has-back");

  if (routeId === "home" || routeId === "logged-out") {
    el.innerHTML = "";
    return;
  }

  const separator = `<svg class="breadcrumb-separator" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.5 5 5.5-5 5.5"/></svg>`;

  let parts; // { label, route? } — route задан → пункт кликабельный (кроме последнего)
  if (routeId === "profile") {
    parts = [{ label: t("profile.title") }];
  } else if (routeId === "clients-users-detail") {
    const user = CLIENTS_USERS_MOCK.find((u) => u.id === currentClientUserId());
    parts = [
      { label: navLabel(NAV_INDEX["clients"]) },
      { label: navLabel(NAV_INDEX["clients-users"]), route: "clients-users" },
      { label: user ? user.email : t("clientDetail.notFoundTitle") },
    ];
  } else if (routeId === "operations-payment-detail") {
    const ref = currentPaymentRef();
    const row = findPaymentRow(ref);
    const listId = paymentListRouteId(ref);
    parts = [
      { label: navLabel(NAV_INDEX["operations"]) },
      { label: navLabel(NAV_INDEX[listId]), route: listId },
      { label: row ? row.code : t("paymentDetail.notFoundTitle") },
    ];
  } else if (routeId === "operations-otc-detail") {
    const deal = otcDealById(currentOtcDealId());
    parts = [
      { label: navLabel(NAV_INDEX["operations"]) },
      { label: navLabel(NAV_INDEX["operations-otc"]), route: "operations-otc" },
      { label: deal ? deal.referenceNumber : t("operationsOtc.detail.notFoundTitle") },
    ];
  } else if (routeId === "settings-routing-rule") {
    const rrule = rgRuleRef() === "new" ? null : rgRuleById(rgRuleRef());
    parts = [
      { label: navLabel(NAV_INDEX["settings-operational"]) },
      { label: navLabel(NAV_INDEX["settings-routing"]) },
      { label: navLabel(NAV_INDEX["settings-routing-rules"]), route: "settings-routing-rules" },
      { label: rrule ? rrule.name : (rgRuleRef() === "new" ? t("routing.rule.newTitle") : t("vabs.common.notFoundTitle")) },
    ];
  } else if (routeId === "settings-routing-execution") {
    const ex = RG_EXECUTIONS.find((x) => x.id === rgExecutionRef());
    parts = [
      { label: navLabel(NAV_INDEX["settings-operational"]) },
      { label: navLabel(NAV_INDEX["settings-routing"]) },
      { label: navLabel(NAV_INDEX["settings-routing-executions"]), route: "settings-routing-executions" },
      { label: ex ? pdShort(ex.id) : t("vabs.common.notFoundTitle") },
    ];
  } else if (routeId === "clients-partners-detail") {
    const svc = pnById(pnRef());
    parts = [
      { label: navLabel(NAV_INDEX["clients"]) },
      { label: navLabel(NAV_INDEX["clients-partners"]), route: "clients-partners" },
      { label: svc ? svc.name : t("vabs.common.notFoundTitle") },
    ];
  } else if (routeId === "clients-partner-users-detail") {
    const pu = pnClientById(currentPartnerUserId());
    const svc = pu ? pnById(pu.serviceId) : null;
    parts = [
      { label: navLabel(NAV_INDEX["clients"]) },
      { label: navLabel(NAV_INDEX["clients-partners"]), route: "clients-partners" },
      { label: svc ? svc.name : t("vabs.common.notFoundTitle"), route: svc ? `clients-partners/${svc.id}` : undefined },
      { label: pu ? pu.name : t("vabs.common.notFoundTitle") },
    ];
  } else if (routeId === "tariffs-detail") {
    const ref = tfRef();
    const listId = { tariff: "settings-tariffs-catalog", limit: "settings-tariffs-limits", commission: "settings-tariffs-commissions", mask: "settings-masks-list" }[ref ? ref.kind : "tariff"];
    parts = [
      { label: navLabel(NAV_INDEX["settings-operational"]) },
      { label: navLabel(NAV_INDEX[listId].parent) },
      { label: navLabel(NAV_INDEX[listId]), route: listId },
      { label: tfEntityTitle(ref) },
    ];
  } else if (routeId === "eod-detail") {
    const ref = eodRef();
    const listId = ref && ref.kind === "discrepancy" ? "eod-discrepancies" : "eod-history";
    parts = [
      { label: navLabel(NAV_INDEX["eod"]) },
      { label: navLabel(NAV_INDEX[listId]), route: listId },
      { label: eodEntityTitle(ref) },
    ];
  } else if (routeId === "kyt-detail") {
    const ref = ktRef();
    const isConfig = ref && ref.kind === "config";
    const listId = isConfig ? "settings-kyt-configs" : "security-aml-checks";
    parts = [
      { label: navLabel(NAV_INDEX[isConfig ? "settings-core" : "security"]) },
      ...(isConfig ? [{ label: navLabel(NAV_INDEX["settings-kyt"]) }] : []),
      { label: navLabel(NAV_INDEX[listId]), route: listId },
      { label: ktEntityTitle(ref) },
    ];
  } else if (routeId === "settings-verif-detail") {
    const ref = vfRef();
    const listId = `settings-verif-${ref ? ref.kind : "kyc"}`;
    parts = [
      { label: navLabel(NAV_INDEX["settings-core"]) },
      { label: navLabel(NAV_INDEX["settings-verifications"]) },
      { label: navLabel(NAV_INDEX[listId]), route: listId },
      { label: vfEntityTitle(ref) },
    ];
  } else if (routeId === "settings-access-detail") {
    const ref = currentAccessRef();
    const entity = ref.kind === "role" ? acRoleById(ref.id) : acAdminById(ref.id);
    parts = [
      { label: navLabel(NAV_INDEX["settings-operational"]) },
      { label: navLabel(NAV_INDEX["settings-access"]), route: "settings-access" },
      { label: entity ? entity.name : t("access.notFoundTitle") },
    ];
  } else if (routeId === "settings-vabs-detail") {
    const ref = vbRef();
    const listId = `settings-vabs-${ref ? ref.kind : "networks"}`;
    parts = [
      { label: navLabel(NAV_INDEX["settings-core"]) },
      { label: navLabel(NAV_INDEX["settings-vabs"]) },
      { label: navLabel(NAV_INDEX[listId]), route: listId },
      { label: vbEntityTitle(ref) },
    ];
  } else if (routeId === "accounts-detail") {
    const ref = currentAccountRef();
    const acc = ref && accFind(ref.kind, ref.id);
    const listId = ref && ref.kind !== "virtual" ? "settings-vabs-accounts" : "accounts-virtual";
    // Счета клиентов — раздел верхнего уровня; реальные и корреспондентские — в операционных настройках
    parts = [
      ...(ref && ref.kind !== "virtual" ? [{ label: navLabel(NAV_INDEX[listId].parent) }] : []),
      { label: navLabel(NAV_INDEX[listId]), route: ref && ref.kind !== "virtual" ? `${listId}/${ref.kind}` : listId },
      { label: acc ? accTitle(acc) : t("accounts.notFoundTitle") },
    ];
  } else if (routeId === "security-audit-detail") {
    const row = AUDIT_LOGS_MOCK.find((r) => r.id === currentAuditId());
    parts = [
      { label: navLabel(NAV_INDEX["security"]) },
      { label: navLabel(NAV_INDEX["security-audit-logs"]), route: "security-audit-logs" },
      { label: row ? auEventTitle(row) : t("audit.notFoundTitle") },
    ];
  } else if (routeId === "clients-companies-detail") {
    const company = CLIENTS_COMPANIES_MOCK.find((c) => c.id === currentCompanyId());
    parts = [
      { label: navLabel(NAV_INDEX["clients"]) },
      { label: navLabel(NAV_INDEX["clients-companies"]), route: "clients-companies" },
      { label: company ? company.name : t("companyDetail.notFoundTitle") },
    ];
  } else if (navItem) {
    const chain = [];
    for (let p = navItem.parent; p; p = p.parent) chain.unshift({ label: navLabel(p) });
    parts = [...chain, { label: navLabel(navItem) }];
  } else {
    parts = [];
  }

  const backPart = [...parts].slice(0, -1).reverse().find((p) => p.route);
  if (backPart) {
    backBtn.hidden = false;
    backBtn.dataset.route = backPart.route;
    backBtn.title = t("login.back");
    document.querySelector(".navbar-left").classList.add("has-back");
  }

  el.innerHTML = parts
    .map((part, i) => {
      const isLast = i === parts.length - 1;
      if (!isLast && part.route) {
        return `<span class="breadcrumb-item breadcrumb-item-link" data-route="${part.route}">${part.label}</span>`;
      }
      return `<span class="breadcrumb-item${isLast ? " is-current" : ""}">${part.label}</span>`;
    })
    .join(separator);

  el.querySelectorAll(".breadcrumb-item-link").forEach((linkEl) => {
    linkEl.addEventListener("click", () => {
      window.location.hash = `#/${linkEl.dataset.route}`;
    });
  });
}

// ---- Вьюхи ------------------------------------------------------------------------
// viewHome()/initHome() — см. views/home-dashboard.js

function viewPlaceholder(item) {
  const label = navLabel(item);
  const description = t(`navDescriptions.${item.id}`);
  return `
    ${pageHeader(label, description)}
    <div class="empty-state">
      <div class="empty-state-icon">${ICONS.box}</div>
      <div class="empty-state-title">${t("placeholder.emptyTitle")}</div>
      <div class="empty-state-text">${t("placeholder.emptyText")(label)}</div>
    </div>
  `;
}

// Вкладки профиля администратора: "Профиль" и отдельная "Безопасность" (способы подтверждения, 2FA)
let profileTab = "profile";

function viewProfile() {
  const p = t("profile");
  const roleLabel = t(`roles.${CURRENT_ADMIN.roleKey}`);
  const rows = [
    [p.fields.name, pdEscape(CURRENT_ADMIN.name)],
    [p.fields.email, pdEscape(CURRENT_ADMIN.email)],
    [p.fields.role, pdEscape(roleLabel)],
  ];
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  // Супер-администраторы для связи: все аккаунты с ролью SUPER (статус не важен), кроме себя
  const supers = ACCESS_ADMINS.filter((a) => a.roleIds.includes("role-super") && a.email !== CURRENT_ADMIN.email);
  const contacts = supers.length
    ? supers.map((a) => `<div class="pf-contact"><span class="pf-contact-avatar">${pdEscape(initials(a.name))}</span><div class="pf-contact-main"><span class="pf-contact-name">${pdEscape(a.name)}</span><a class="table-link pf-contact-mail" href="mailto:${escapeAttr(a.email)}" title="${p.writeEmail}">${pdEscape(a.email)}</a></div></div>`).join("")
    : `<div class="table-cell-muted">${p.noContacts}</div>`;
  const logout = `<button type="button" class="btn-danger pf-logout" data-profile-logout>${t("user.logout")}</button>`;

  return `
    <div class="list-hero">
      ${pageHeader(p.title, "", logout)}
      <div class="pf-hero">
        <div class="profile-card-avatar pf-avatar">${CURRENT_ADMIN.initials}</div>
        <div class="pf-hero-meta"><div class="profile-card-name">${pdEscape(CURRENT_ADMIN.name)}</div><div class="profile-card-role">${pdEscape(roleLabel)}</div></div>
      </div>
    </div>
    <div class="cd-tabs-wrap pf-tabs"><div class="cd-subtabs">${["profile", "security"]
      .map((k) => `<button type="button" class="cd-subtab${profileTab === k ? " is-active" : ""}" data-pf-tab="${k}"><span>${p.tabs[k]}</span></button>`)
      .join("")}</div></div>
    <div class="profile-flat-block pf-page">
      ${
        profileTab === "security"
          ? profileSecurityHtml()
          : `${flatSection(p.sections.main, `<div class="profile-fields profile-fields-grid">${rows.map(([label, value]) => detailField(label, value)).join("")}</div>`)}
      ${flatSection(p.sections.contacts, `<div class="pf-contacts">${contacts}</div>`, null, p.contactsHint)}`
      }
    </div>
    <div class="pf-logout-bottom">${logout.replace("pf-logout", "pf-logout-btn")}</div>
  `;
}

// ---- Профиль → "Безопасность": способы подтверждения (2FA) администратора --------------------------------------------------
// Типы кода — как в auth-backend (TFAType: SMS | EMAIL | OTP); подключение/отключение в прототипе моделируется в памяти.
function profileSecurityHtml() {
  const s = t("twofa.profile");
  const m = admin2fa.methods;
  const badge = (on) => `<span class="badge ${on ? "badge-success" : "badge-neutral"}">${on ? s.statusOn : s.statusOff}</span>`;
  const row = (title, desc, on, actions) => `<div class="pf-2fa-row">
      <div class="pf-2fa-main"><div class="pf-2fa-title">${title} ${badge(on)}</div><div class="table-cell-muted">${desc}</div></div>
      <div class="pf-2fa-actions">${actions}</div>
    </div>`;
  const btn = (act, label, cls = "btn-secondary") => `<button type="button" class="${cls}" data-a2f-act="${act}">${label}</button>`;
  const body = `<div class="pf-2fa">
    ${row(t("twofa.methods.OTP"), s.otpDesc, m.OTP.enabled, m.OTP.enabled ? btn("otp-off", s.disconnect) : btn("otp-on", s.connect, "btn-primary"))}
    ${row(t("twofa.methods.EMAIL"), s.emailDesc, true, `<span title="${s.emailRequired}"><button type="button" class="btn-secondary" disabled>${s.disable}</button></span>`)}
  </div>`;
  return flatSection(s.title, body, null, s.desc) + profileRecoveryCodeHtml() + profilePasswordHtml();
}

// ---- Профиль → "Безопасность": резервный код (getRecoveryCode/disableAll2FA в auth-backend) -----------------------------
// Один код на экстренный случай, не альтернативный способ подтверждения: получается один раз, использование разом
// отключает все отключаемые способы подтверждения (кроме e-mail — он базовый) и стирает код, новый — только после этого.
function profileRecoveryCodeHtml() {
  const s = t("twofa.profile");
  const has = !!admin2fa.recoveryCode;
  const status = has ? s.recoveryStatusGot(formatDateTime(new Date(admin2fa.recoveryCodeObtainedAt))) : s.recoveryStatusNone;
  const action = has
    ? `<button type="button" class="btn-secondary" data-a2f-act="recovery-use">${s.recoveryUse}</button>`
    : `<button type="button" class="btn-primary" data-a2f-act="recovery-get">${s.recoveryGet}</button>`;
  const body = `<div class="pf-2fa"><div class="pf-2fa-row">
      <div class="pf-2fa-main"><div class="pf-2fa-title">${s.recoveryTitle}</div><div class="table-cell-muted">${status}</div></div>
      <div class="pf-2fa-actions">${action}</div>
    </div></div>`;
  return flatSection(s.recoveryTitle, body, null, s.recoveryDesc);
}

// ---- Профиль → "Безопасность": пароль. Смена — старый + новый + повтор; восстановление — ссылка на почту ----------------
function profilePasswordHtml() {
  const p = t("twofa.profile.password");
  const body = `<div class="pf-2fa">
    <div class="pf-2fa-row"><div class="pf-2fa-main"><div class="pf-2fa-title">${p.changeTitle}</div><div class="table-cell-muted">${p.changeDesc}</div></div>
      <div class="pf-2fa-actions"><button type="button" class="btn-secondary" data-pw-act="change">${p.changeBtn}</button></div></div>
    <div class="pf-2fa-row"><div class="pf-2fa-main"><div class="pf-2fa-title">${p.resetTitle}</div><div class="table-cell-muted">${p.resetDesc(CURRENT_ADMIN.email)}</div></div>
      <div class="pf-2fa-actions"><button type="button" class="btn-secondary" data-pw-act="reset">${p.resetBtn}</button></div></div>
  </div>`;
  return flatSection(p.title, body, null, p.desc);
}

// Капча тут — сверх схемы (ChangePasswordInput её не требует, в отличие от PasswordRecoveryInput.hCaptchaToken
// и SendCodeInput.captcha при регистрации/восстановлении), добавлена по прямому запросу: смена пароля — тоже
// момент, где стоит подтвердить, что действие делает человек, а не подобранный по словарю скрипт.
function openPasswordChangeModal() {
  const p = t("twofa.profile.password");
  const inp = (id, label, ac) => `<label class="login-field"><span class="login-label">${label}</span><input class="address-form-input login-input" id="${id}" type="password" autocomplete="${ac}" /></label>`;
  openModal({
    title: p.changeTitle,
    width: 440,
    bodyHtml: `<div class="login-form">${inp("pw-old", p.old, "current-password")}${inp("pw-new", p.new, "new-password")}${inp("pw-new2", p.repeat, "new-password")}${loginRulesHtml()}${loginCaptchaHtml()}<div class="form-error login-error" id="pw-error" hidden></div></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="pw-cancel">${p.cancel}</button><button type="button" class="btn-primary" id="pw-save">${p.save}</button>`,
    onMount: (el) => {
      el.querySelector("#pw-cancel").addEventListener("click", closeModal);
      loginBindRules(el, el.querySelector("#pw-new"));
      loginBindCaptcha();
      el.querySelector("#pw-save").addEventListener("click", () => {
        const v = (id) => el.querySelector(id).value;
        const fail = (m) => { const e = el.querySelector("#pw-error"); e.textContent = m; e.hidden = false; };
        if (!v("#pw-old")) return fail(p.errOld);
        const n = v("#pw-new");
        if (!loginPasswordValid(n)) return fail(t("login.recovery.errRules"));
        if (n === v("#pw-old")) return fail(p.errSame);
        if (n !== v("#pw-new2")) return fail(t("login.recovery.errMatch"));
        if (!el.querySelector("#login-captcha-box").classList.contains("is-done")) return fail(t("login.recovery.errCaptcha"));
        // как в бэкенде (confirmChangePassword): новый пароль применяется после кода подтверждения
        closeModal();
        openAdmin2faModal({ title: p.changeTitle, intro: p.codeIntro, remember: false, onSuccess: () => showToast(p.changedToast) });
      });
    },
  });
}

// Восстановление (startPasswordRecovery → confirmPasswordRecovery): код на почту, затем новый пароль
function openPasswordResetLinkModal() {
  const p = t("twofa.profile.password");
  openModal({
    title: p.resetTitle,
    width: 440,
    bodyHtml: `<p class="table-cell-muted">${p.resetConfirm(CURRENT_ADMIN.email)}</p>`,
    footerHtml: `<button type="button" class="btn-secondary" id="pw-cancel">${p.cancel}</button><button type="button" class="btn-primary" id="pw-send">${p.resetSend}</button>`,
    onMount: (el) => {
      el.querySelector("#pw-cancel").addEventListener("click", closeModal);
      el.querySelector("#pw-send").addEventListener("click", () => {
        closeModal();
        showToast(p.resetSentToast(CURRENT_ADMIN.email));
        openAdmin2faModal({ title: p.resetTitle, intro: p.resetCodeIntro(CURRENT_ADMIN.email), remember: false, onSuccess: openPasswordNewModal });
      });
    },
  });
}

function openPasswordNewModal() {
  const p = t("twofa.profile.password");
  const inp = (id, label) => `<label class="login-field"><span class="login-label">${label}</span><input class="address-form-input login-input" id="${id}" type="password" autocomplete="new-password" /></label>`;
  openModal({
    title: p.resetTitle,
    width: 440,
    bodyHtml: `<div class="login-form">${inp("pw-new", p.new)}${inp("pw-new2", p.repeat)}${loginRulesHtml()}${loginCaptchaHtml()}<div class="form-error login-error" id="pw-error" hidden></div></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="pw-cancel">${p.cancel}</button><button type="button" class="btn-primary" id="pw-save">${p.save}</button>`,
    onMount: (el) => {
      el.querySelector("#pw-cancel").addEventListener("click", closeModal);
      loginBindRules(el, el.querySelector("#pw-new"));
      loginBindCaptcha();
      el.querySelector("#pw-save").addEventListener("click", () => {
        const fail = (m) => { const e = el.querySelector("#pw-error"); e.textContent = m; e.hidden = false; };
        const n = el.querySelector("#pw-new").value;
        if (!loginPasswordValid(n)) return fail(t("login.recovery.errRules"));
        if (n !== el.querySelector("#pw-new2").value) return fail(t("login.recovery.errMatch"));
        if (!el.querySelector("#login-captcha-box").classList.contains("is-done")) return fail(t("login.recovery.errCaptcha"));
        closeModal();
        showToast(p.changedToast);
      });
    },
  });
}

function profileToggleMethod(method, on) {
  const s = t("twofa.profile");
  const others = ADMIN_2FA_METHODS.filter((x) => x !== method && admin2fa.methods[x].enabled).length;
  if (!on && others === 0) { showToast(s.lastMethod); return; }
  // включение и отключение способа подтверждается кодом; окно "запомнить" не используется
  openAdmin2faModal({
    title: `${t(`twofa.methods.${method}`)}: ${on ? s.enable : s.disable}`,
    intro: s.confirmIntro,
    remember: false,
    onSuccess: () => {
      admin2fa.methods[method].enabled = on;
      render();
      showToast(on ? s.connectedToast : s.disconnectedToast);
    },
  });
}

function initProfile() {
  document.querySelectorAll("[data-pf-tab]").forEach((b) => b.addEventListener("click", () => { profileTab = b.dataset.pfTab; render(); }));
  document.querySelectorAll("[data-a2f-act]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.a2fAct;
      if (act === "otp-on") openGaSetupModal(() => render());
      else if (act === "otp-off") profileToggleMethod("OTP", false);
      else if (act === "recovery-get") openRecoveryGetModal(() => render());
      else if (act === "recovery-use") openRecoveryUseModal(() => render());
    })
  );
  document.querySelectorAll("[data-profile-logout]").forEach((b) => b.addEventListener("click", () => { window.location.hash = "#/login"; }));
  document.querySelectorAll("[data-pw-act]").forEach((b) => b.addEventListener("click", () => (b.dataset.pwAct === "change" ? openPasswordChangeModal() : openPasswordResetLinkModal())));
}
function viewLoggedOut() {
  return `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-card-icon">${ICONS.lock}</div>
        <h1 class="auth-card-title">${t("auth.title")}</h1>
        <p class="auth-card-text">${t("auth.text")}</p>
        <button type="button" class="btn-primary" id="btn-login-again">${t("auth.button")}</button>
      </div>
    </div>
  `;
}

// ---- Роутер -------------------------------------------------------------------------
function currentRouteId() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (/^clients-users\/.+/.test(hash)) return "clients-users-detail";
  if (/^clients-companies\/.+/.test(hash)) return "clients-companies-detail";
  if (/^clients-partner-users\/.+/.test(hash)) return "clients-partner-users-detail";
  if (/^operations-otc\/.+/.test(hash)) return "operations-otc-detail";
  if (/^operations-(payments|exchanges)\/.+/.test(hash)) return "operations-payment-detail";
  if (/^settings-access\/(role|admin)\/.+/.test(hash)) return "settings-access-detail";
  if (/^settings-access\/(roles|permissions|admins)$/.test(hash)) return "settings-access";
  if (/^settings-rates\/(pairs|markups|individual|providers)$/.test(hash)) return "settings-rates";
  if (/^settings-routing-rules\/rule\/.+/.test(hash)) return "settings-routing-rule";
  if (/^settings-routing-executions\/.+/.test(hash)) return "settings-routing-execution";
  if (/^clients-partners\/.+/.test(hash)) return "clients-partners-detail";
  if (/^security-audit-logs\/.+/.test(hash)) return "security-audit-detail";
  if (/^accounts-(virtual|real|correspondent)\/.+/.test(hash)) return "accounts-detail";
  if (/^settings-vabs-accounts\/(real|correspondent)$/.test(hash)) return "settings-vabs-accounts";
  if (/^settings-vabs-(networks|currencies|enums|operations|providers)\/.+/.test(hash)) return "settings-vabs-detail";
  if (/^settings-verif-(kyc|kyb|documents)\/.+/.test(hash)) return "settings-verif-detail";
  if (/^(settings-kyt-configs|security-aml-checks)\/.+/.test(hash)) return "kyt-detail";
  if (/^eod-(days|discrepancies)\/.+/.test(hash)) return "eod-detail";
  if (/^settings-(tariffs-(catalog|limits|commissions|clients)|masks-list)\/.+/.test(hash) && (TF_MASKS_ENABLED || !hash.startsWith("settings-masks-list"))) return "tariffs-detail";
  if (/^accept-invite\/.+/.test(hash)) return "accept-invite";
  if (LEAF_ROUTE_IDS.includes(hash)) return hash;
  if (EXTRA_ROUTE_IDS.includes(hash)) return hash;
  return DEFAULT_ROUTE;
}

function render() {
  const routeId = currentRouteId();
  const navItem = NAV_INDEX[routeId];
  document.body.classList.toggle("is-auth", routeId === "login" || routeId === "accept-invite");

  // Сайдбар мог не знать, что открылся дочерний роут (переход по ссылке,
  // назад/вперёд в истории) — перерисовываем, чтобы нужная группа раскрылась.
  renderSidebar();

  // active state на конечных пунктах (для extra-роутов и родителей — не подсвечиваем)
  document.querySelectorAll(".nav-item[data-route]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.route === activeNavId(routeId));
  });

  renderBreadcrumbs(routeId, navItem);

  // контент
  const content = document.getElementById("view-container");
  if (routeId === "home") {
    content.innerHTML = viewHome();
    initHome();
  } else if (routeId === "profile") {
    content.innerHTML = viewProfile();
    initProfile();
  } else if (routeId === "logged-out") {
    content.innerHTML = viewLoggedOut();
    document.getElementById("btn-login-again").addEventListener("click", () => {
      window.location.hash = "#/login";
    });
  } else if (routeId === "login") {
    content.innerHTML = viewLogin();
    initLogin();
  } else if (routeId === "accept-invite") {
    const id = currentAcceptInviteId();
    content.innerHTML = viewAcceptInvite(id);
    initAcceptInvite(id);
  } else if (routeId === "clients-users") {
    content.innerHTML = viewClientsUsers();
    initClientsUsersView();
  } else if (routeId === "clients-users-detail") {
    content.innerHTML = viewClientDetail(currentClientUserId());
    initClientDetailView();
  } else if (routeId === "clients-companies") {
    content.innerHTML = viewClientsCompanies();
    initClientsCompaniesView();
  } else if (routeId === "clients-companies-detail") {
    content.innerHTML = viewCompanyDetail(currentCompanyId());
    initCompanyDetailView();
  } else if (routeId === "operations-payments") {
    content.innerHTML = viewOperationsPayments("fiat");
    initOperationsPaymentsView();
  } else if (routeId === "operations-crypto-payments") {
    content.innerHTML = viewOperationsPayments("crypto");
    initOperationsPaymentsView();
  } else if (routeId === "operations-otc") {
    content.innerHTML = viewOperationsOtc();
    initOperationsOtcView();
  } else if (routeId === "operations-otc-detail") {
    content.innerHTML = viewOtcDetail(currentOtcDealId());
    initOtcDetail();
  } else if (routeId === "financial-reports") {
    content.innerHTML = viewFinancialReports();
    initFinancialReports();
  } else if (routeId === "operations-exchanges") {
    content.innerHTML = viewOperationsExchanges();
    initOperationsExchangesView();
  } else if (routeId === "operations-payment-detail") {
    const ref = currentPaymentRef();
    content.innerHTML = viewPaymentDetail(ref);
    initPaymentDetailView(ref);
  } else if (routeId === "settings-access") {
    content.innerHTML = viewSettingsAccess();
    initSettingsAccess();
  } else if (routeId === "settings-routing-rules") {
    content.innerHTML = viewRoutingRules();
    initRoutingRules();
  } else if (routeId === "settings-routing-settings") {
    content.innerHTML = viewRoutingSettings();
    initRoutingSettings();
  } else if (routeId === "settings-routing-executions") {
    content.innerHTML = viewRoutingExecutions();
    initRoutingExecutions();
  } else if (routeId === "settings-routing-execution") {
    content.innerHTML = viewExecutionDetail(rgExecutionRef());
    initExecutionDetail();
  } else if (routeId === "analytics-routing") {
    content.innerHTML = viewAnalyticsRouting();
    initAnalyticsRouting();
  } else if (routeId === "settings-routing-rule") {
    const rid = rgRuleRef();
    content.innerHTML = viewRuleDetail(rid);
    initRuleDetail(rid);
  } else if (routeId === "settings-rates") {
    content.innerHTML = viewSettingsRates();
    initSettingsRates();
  } else if (routeId === "clients-partner-users-detail") {
    const id = currentPartnerUserId();
    content.innerHTML = viewPartnerUserDetail(id);
    initPartnerUserDetail(id);
  } else if (routeId === "clients-partners") {
    content.innerHTML = viewPartners();
    initPartners();
  } else if (routeId === "clients-partners-detail") {
    const id = pnRef();
    content.innerHTML = viewPartnerDetail(id);
    initPartnerDetail(id);
  } else if (routeId === "settings-access-detail") {
    const ref = currentAccessRef();
    content.innerHTML = viewAccessDetail(ref);
    initAccessDetail(ref);
  } else if (routeId === "accounts-virtual") {
    content.innerHTML = viewAccounts("virtual");
    initAccounts("virtual");
  } else if (routeId === "settings-vabs-accounts") {
    content.innerHTML = viewVabsAccounts();
    initVabsAccounts();
  } else if (routeId === "accounts-detail") {
    const ref = currentAccountRef();
    content.innerHTML = viewAccountDetail(ref);
    initAccountDetail(ref);
  } else if (routeId === "operations-otc-detail") {
    const deal = otcDealById(currentOtcDealId());
    parts = [
      { label: navLabel(NAV_INDEX["operations"]) },
      { label: navLabel(NAV_INDEX["operations-otc"]), route: "operations-otc" },
      { label: deal ? deal.referenceNumber : t("operationsOtc.detail.notFoundTitle") },
    ];
  } else if (routeId === "tariffs-detail") {
    const ref = tfRef();
    content.innerHTML = viewTariffsDetail(ref);
    initTariffsDetail(ref);
  } else if (TF_ROUTES[routeId]) {
    content.innerHTML = TF_ROUTES[routeId][0]();
    TF_ROUTES[routeId][1]();
  } else if (routeId === "eod-dashboard") {
    content.innerHTML = viewEodDashboard();
    initEodDashboard();
  } else if (routeId === "eod-history") {
    content.innerHTML = viewEodHistory();
    initEodHistory();
  } else if (routeId === "eod-discrepancies") {
    content.innerHTML = viewEodDiscrepancies();
    initEodDiscrepancies();
  } else if (routeId === "eod-detail") {
    const ref = eodRef();
    content.innerHTML = viewEodDetail(ref);
    initEodDetail(ref);
  } else if (routeId === "settings-eod-day") {
    content.innerHTML = viewEodSettingsDay();
    initEodSettingsDay();
  } else if (routeId === "settings-eod-reconciliation") {
    content.innerHTML = viewEodSettingsRecon();
    initEodSettingsRecon();
  } else if (routeId === "settings-kyt-configs") {
    content.innerHTML = viewKytConfigs();
    initKytConfigs();
  } else if (routeId === "security-aml-checks") {
    content.innerHTML = viewKytChecks();
    initKytChecks();
  } else if (routeId === "kyt-detail") {
    const ref = ktRef();
    content.innerHTML = viewKytDetail(ref);
    initKytDetail(ref);
  } else if (["settings-verif-kyc", "settings-verif-kyb", "settings-verif-documents", "settings-verif-addresses"].includes(routeId)) {
    const kind = routeId.replace("settings-verif-", "");
    content.innerHTML = viewVerifList(kind);
    initVerifList(kind);
  } else if (routeId === "settings-verif-detail") {
    const ref = vfRef();
    content.innerHTML = viewVerifDetail(ref);
    initVerifDetail(ref);
  } else if (routeId === "settings-sanctions-individuals" || routeId === "settings-sanctions-companies") {
    const kind = routeId.replace("settings-sanctions-", "");
    content.innerHTML = viewSanctions(kind);
    initSanctions(kind);
  } else if (routeId.startsWith("settings-vabs-") && routeId !== "settings-vabs-detail") {
    const kind = routeId.replace("settings-vabs-", "");
    content.innerHTML = viewVabsList(kind);
    initVabsList(kind);
  } else if (routeId === "settings-vabs-detail") {
    const ref = vbRef();
    content.innerHTML = viewVabsDetail(ref);
    initVabsDetail(ref);
  } else if (routeId === "analytics-users") {
    content.innerHTML = viewAnalyticsUsers();
    initAnalyticsUsers();
  } else if (routeId === "analytics-operations") {
    content.innerHTML = viewAnalyticsOperations();
    initAnalyticsOperations();
  } else if (routeId === "analytics-accounts") {
    content.innerHTML = viewAnalyticsAccounts();
    initAnalyticsAccounts();
  } else if (routeId === "analytics-eod") {
    content.innerHTML = viewAnalyticsEod();
    initAnalyticsEod();
  } else if (routeId === "analytics-events") {
    content.innerHTML = viewAnalyticsEvents();
    initAnalyticsEvents();
  } else if (routeId === "twofa-policy") {
    content.innerHTML = viewTwofaPolicy();
    initTwofaPolicy();
  } else if (routeId === "security-system-access") {
    content.innerHTML = viewSecuritySystemAccess();
    initSecuritySystemAccess();
  } else if (routeId === "security-audit-logs") {
    content.innerHTML = viewAuditLogs();
    initAuditLogs();
  } else if (routeId === "security-audit-detail") {
    content.innerHTML = viewAuditDetail(currentAuditId());
    initAuditDetail();
  } else {
    content.innerHTML = viewPlaceholder(navItem);
  }

  updateDocsFab(routeId);
  renderBottomNav();
  setMobileMenu(false);
}

// ---- Сворачивание сайдбара (состояние переживает перезагрузку страницы) --------
const SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed";
let sidebarCollapsed = false;

function setSidebarCollapsed(collapsed) {
  sidebarCollapsed = collapsed;
  document.getElementById("sidebar").classList.toggle("is-collapsed", collapsed);
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch (e) {
    // localStorage недоступен (приватный режим и т.п.) — не критично для прототипа
  }
}

function initSidebarCollapse() {
  try {
    sidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch (e) {
    sidebarCollapsed = false;
  }
  setSidebarCollapsed(sidebarCollapsed);

  document.getElementById("sidebar-collapse-btn").addEventListener("click", () => {
    setSidebarCollapsed(!sidebarCollapsed);
  });
}

// ---- Мобильная навигация: нижняя панель + полное меню шторкой ------------------------
// На узких экранах (см. @media в style.css) сайдбар превращается в шторку снизу,
// а основные разделы вынесены в нижнюю панель; "Меню" открывает шторку целиком.
const BOTTOM_NAV_IDS = ["home", "clients", "operations", "accounts"];

function navFirstLeaf(item) {
  return item.children ? navFirstLeaf(item.children[0]) : item.id;
}

function setMobileMenu(open) {
  document.body.classList.toggle("mobile-menu-open", open);
  const menuBtn = document.querySelector("#bottom-nav [data-bottom-menu]");
  if (menuBtn) menuBtn.classList.toggle("is-active", open);
}

function renderBottomNav() {
  const bar = document.getElementById("bottom-nav");
  if (!bar) return;
  const active = activeNavId();
  const items = BOTTOM_NAV_IDS.map((id) => NAV_TREE.find((n) => n.id === id)).filter(Boolean);
  bar.innerHTML =
    items
      .map((it) => {
        const isActive = it.id === active || navHasActive(it, active);
        return `<button type="button" class="bottom-nav-item${isActive ? " is-active" : ""}" data-bottom-route="${navFirstLeaf(it)}"><span class="bottom-nav-icon">${ICONS[it.icon] || ""}</span><span class="bottom-nav-label">${navLabel(it)}</span></button>`;
      })
      .join("") +
    `<button type="button" class="bottom-nav-item" data-bottom-menu><span class="bottom-nav-icon">${ICONS.menu || `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3.5 6h13M3.5 10h13M3.5 14h13"/></svg>`}</span><span class="bottom-nav-label">${t("bottomNav.menu")}</span></button>`;
}

function initBottomNav() {
  const bar = document.createElement("nav");
  bar.className = "bottom-nav";
  bar.id = "bottom-nav";
  const overlay = document.createElement("div");
  overlay.className = "mobile-menu-overlay";
  overlay.id = "mobile-menu-overlay";
  document.body.appendChild(overlay);
  document.body.appendChild(bar);
  bar.addEventListener("click", (e) => {
    const route = e.target.closest("[data-bottom-route]");
    if (route) { setMobileMenu(false); window.location.hash = `#/${route.dataset.bottomRoute}`; return; }
    if (e.target.closest("[data-bottom-menu]")) setMobileMenu(!document.body.classList.contains("mobile-menu-open"));
  });
  overlay.addEventListener("click", () => setMobileMenu(false));
  document.getElementById("sidebar-nav").addEventListener("click", (e) => { if (e.target.closest("[data-route]")) setMobileMenu(false); });
}
function init() {
  renderStaticTexts();
  renderSidebar();
  initSidebarNav();
  initLangSwitch();
  initUserMenu();
  initSidebarCollapse();
  initHeaderHome();
  initDocsFab();
  initBottomNav();

  if (!window.location.hash) {
    window.location.hash = `#/${DEFAULT_ROUTE}`;
  }

  render();
  window.addEventListener("hashchange", render);
}

document.addEventListener("DOMContentLoaded", init);











