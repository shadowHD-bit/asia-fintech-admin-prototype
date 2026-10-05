/* ==========================================================================
   "Роли и права": роли, каталог прав и страница роли с матрицей доступа — по модели ACL из bb2.
   Роль выдаёт гранты "фича × уровень" (READ < WRITE < DELETE, каждый следующий включает предыдущие); денежные фичи помечены
   отдельно. Страница роли — матрица "раздел системы × READ / WRITE / DELETE" с поиском, фильтрами и панелью сохранения;
   справа — общая информация, пояснение к матрице и страницы бэк-офиса, которые роль открывает.
   Данные — mock/access-model.mock.js и mock/settings-access.mock.js. Списки построены на createAccessList (settings-access.js).
   Прототип: правки ролей живут в памяти вкладки; на бэкенде bb2 они сохраняются мутациями aclCreateRoles / aclUpdateRoles.
   ========================================================================== */

const am = (path) => t(`accessMatrix.${path}`);

// ---- Состояние страницы роли -------------------------------------------------------------------------------------------
let acmEdit = null; // { roleId, name, description, grants } — черновик правок роли
let acmFilters = { search: "", categories: [], access: [] };

window.addEventListener("hashchange", () => {
  // после создания роли открывается её страница сразу в режиме правки — черновик не сбрасываем
  if (acmEdit && window.location.hash.includes(`/role/${acmEdit.roleId}`)) return;
  acmEdit = null;
  acmFilters = { search: "", categories: [], access: [] };
});

// ---- Хелперы данных ------------------------------------------------------------------------------------------------------
function acmCategoryBadge(category) {
  const label = t(`accessMatrix.categories.${category}`) || category;
  return `<span class="acm-cat">${label}</span>`;
}

// Денежные разделы помечены плашкой «Деньги» (операции двигают деньги или меняют учётные остатки)
function acmMoneyBadge() {
  return `<span class="acm-money-tag" title="${am("moneyTip")}">${am("moneyTag")}</span>`;
}
function acmLevelName(level) {
  return t(`accessMatrix.levelName.${level}`) || level;
}

function acmDeclaredLevels(feature) {
  return ACM_LEVELS.filter((l) => feature.levels[l]);
}

function acmGrantedCount(role, level) {
  return Object.entries(role.grants || {}).filter(([code, lv]) => {
    const f = acmFeature(code);
    return f && f.levels[level] && acmLevelRank(lv) >= acmLevelRank(level);
  }).length;
}

function acmMoneyCount(role) {
  return Object.keys(role.grants || {}).filter((code) => acmFeature(code) && acmFeature(code).money).length;
}

function acmRolesGranting(code) {
  return ACCESS_ROLES.filter((r) => r.grants && r.grants[code]);
}

// Выдача уровня: включающая иерархия; отключение уровня опускает выдачу до ближайшего нижнего объявленного
function acmSetLevel(grants, feature, level, on) {
  const declared = acmDeclaredLevels(feature);
  if (on) {
    if (acmLevelRank(level) > acmLevelRank(grants[feature.code])) grants[feature.code] = level;
    return;
  }
  const lower = declared.filter((l) => acmLevelRank(l) < acmLevelRank(level));
  if (lower.length) grants[feature.code] = lower[lower.length - 1];
  else delete grants[feature.code];
}

// ---- Список ролей ---------------------------------------------------------------------------------------------------------
function acmIsEditable(role) {
  return role.type === "ADMIN" && !role.isSystem && !role.contractOnly;
}

const accessRolesList = createAccessList({
  key: "roles",
  data: () => ACCESS_ROLES,
  searchPlaceholder: () => am("roles.search"),
  searchText: (r) => `${r.name} ${r.description}`,
  tab: { get: (r) => r.status, values: ["ACTIVE", "DEPRECATED", "ARCHIVED"], label: (v) => t(`access.enums.roleStatus.${v}`) },
  filters: [
    { id: "type", kind: "multi", label: () => am("roles.filters.type"), get: (r) => r.type, options: () => ["ADMIN", "CLIENT"].map((v) => ({ value: v, label: t(`access.enums.roleType.${v}`) })) },
    { id: "system", kind: "multi", label: () => am("roles.filters.system"), get: (r) => r.isSystem, options: () => [{ value: "true", label: t("access.common.yes") }, { value: "false", label: t("access.common.no") }] },
    { id: "money", kind: "multi", label: () => am("roles.filters.money"), get: (r) => acmMoneyCount(r) > 0, options: () => [{ value: "true", label: am("roles.moneyFilter.yes") }, { value: "false", label: am("roles.moneyFilter.no") }] },
    { id: "created", kind: "date", label: () => am("roles.filters.created"), get: (r) => r.createdDate },
  ],
  defaultSort: (a, b) => (a.type === b.type ? a.createdDate - b.createdDate : a.type === "ADMIN" ? -1 : 1),
  sorts: {
    name: (a, b) => a.name.localeCompare(b.name),
    sections: (a, b) => Object.keys(a.grants || {}).length - Object.keys(b.grants || {}).length,
    created: (a, b) => a.createdDate - b.createdDate,
  },
  metrics: (list) => {
    const m = am("roles.metrics");
    return [
      { value: list.length, label: m.total },
      { value: list.filter((r) => r.type === "ADMIN").length, label: m.admin },
      { value: list.filter((r) => r.type === "CLIENT").length, label: m.client },
      { value: list.filter((r) => r.isSystem).length, label: m.system },
      { value: list.filter((r) => acmMoneyCount(r) > 0).length, label: m.money },
    ];
  },
  headerAction: () => accessBarActions(`<button type="button" class="btn-primary" id="ac-role-create">${PLUS_ICON_SVG}<span>${am("roles.create")}</span></button>`),
  attachHeaderAction: () => accessAttachBarActions("ac-role-create", () => openRoleFormModal(null)),
  columns: [
    { label: () => am("roles.columns.role"), sort: "name", html: (r) => `<div class="identity-cell"><button type="button" class="table-link ac-role-link" data-role-id="${r.id}">${r.name}</button><span class="table-cell-muted table-truncate table-truncate-wide">${pdEscape(r.description)}</span></div>` },
    { label: () => am("roles.columns.type"), html: (r) => acRoleTypeBadge(r.type) },
    { label: () => am("roles.columns.status"), html: (r) => acRoleStatusBadge(r.status) },
    { label: () => am("roles.columns.system"), html: (r) => (r.isSystem ? `<span class="badge badge-info">${t("access.roles.systemBadge")}</span>` : t("access.common.noValue")) },
    { label: () => am("roles.columns.admins"), html: (r) => (r.type === "ADMIN" ? acAdminsOfRole(r).length : t("access.common.noValue")) },
    { label: () => am("roles.columns.created"), sort: "created", html: (r) => dateTimeCell(r.createdAt) },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll(".ac-role-link").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/settings-access/role/${b.dataset.roleId}`; }));
  },
});

function acmRoleExportRow(r) {
  const admin = r.type === "ADMIN" && !r.contractOnly;
  return [r.name, r.description, t(`access.enums.roleType.${r.type}`), t(`access.enums.roleStatus.${r.status}`), r.isSystem ? t("access.common.yes") : t("access.common.no"), admin ? Object.keys(r.grants).length : "", admin ? acmMoneyCount(r) : "", r.type === "ADMIN" ? acAdminsOfRole(r).length : "", r.createdAt];
}

// ---- Каталог прав (фичи) --------------------------------------------------------------------------------------------------
// Карточка фичи: методы по уровням, роли с этим правом и страницы, которые она открывает
// ---- Страница роли: доступ по группам разделов ------------------------------------------------------------------------------
// Разделы системы собраны в группы по категориям (раскрывающиеся списки). У раздела три плашки уровней READ / WRITE / DELETE;
// в режиме правки плашки нажимаются, а в шапке группы одним нажатием выдаётся или снимается уровень на всю группу.
const ACM_CATEGORY_ORDER = ACM_CATEGORIES;
let acmOpenGroups = new Set();

function acmEditing(role) {
  return !!acmEdit && acmEdit.roleId === role.id;
}

function acmGrantsOf(role) {
  return acmEditing(role) ? acmEdit.grants : role.grants || {};
}

function acmFiltersActive() {
  return !!(acmFilters.search.trim() || acmFilters.categories.length || acmFilters.access.length);
}

function acmVisibleFeatures(grants) {
  const q = acmFilters.search.trim().toLowerCase();
  return ACM_FEATURES.filter((f) => {
    if (q && !`${f.title} ${f.code}`.toLowerCase().includes(q)) return false;
    if (acmFilters.categories.length && !acmFilters.categories.includes(f.category)) return false;
    const a = acmFilters.access;
    if (a.length) {
      const granted = !!grants[f.code];
      const ok = (a.includes("granted") && granted) || (a.includes("notGranted") && !granted) || (a.includes("money") && f.money);
      if (!ok) return false;
    }
    return true;
  });
}

const ACM_TICK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8.5 3 3 6-6.5"/></svg>`;
const ACM_CHEVRON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.5 5.5 5.5-5.5 5.5"/></svg>`;
const ACM_INFO_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M7.9 7.8a2.2 2.2 0 1 1 3.4 1.9c-.8.5-1.3 1-1.3 1.9"/><circle cx="10" cy="14.2" r=".4" fill="currentColor"/></svg>`;

// Плашка уровня у раздела: выдан / выдан через более высокий / не выдан / уровень не объявлен
function acmPillHtml(feature, level, grants, editing) {
  const cls = level.toLowerCase();
  if (!feature.levels[level]) return `<span class="acg-pill is-na"></span>`;
  const rank = acmLevelRank(grants[feature.code]);
  const on = rank >= acmLevelRank(level);
  const implied = on && rank > acmLevelRank(level);
  const state = `acg-pill acg-pill-${cls}${on ? " is-on" : ""}${implied ? " is-implied" : ""}`;
  if (!editing || implied) return `<span class="${state}"${implied ? ` title="${am("detail.impliedTip")}"` : ""}>${acmLevelName(level)}</span>`;
  return `<button type="button" class="${state}" data-acm-code="${feature.code}" data-acm-level="${level}">${acmLevelName(level)}</button>`;
}

// Подсказка у раздела: какие действия входят в каждый уровень
function acmActionsTip(feature) {
  return ACM_LEVELS.filter((l) => feature.levels[l]).map((l) => `${acmLevelName(l)}: ${feature.levels[l].join(", ")}`).join("&#10;");
}

function acmGroupHtml(category, features, grants, editing) {
  const all = ACM_FEATURES.filter((f) => f.category === category);
  const granted = all.filter((f) => grants[f.code]).length;
  const moneyGranted = all.filter((f) => f.money && grants[f.code]).length;
  const forced = acmFiltersActive();
  const open = forced || acmOpenGroups.has(category);
  const rows = features
    .map(
      (f) => `<div class="acg-row${f.money ? " is-money" : ""}${grants[f.code] ? " is-on" : ""}">
        <div class="acg-feature" title="${acmActionsTip(f)}"><span class="acg-title">${pdEscape(f.title)}${f.money ? acmMoneyBadge() : ""}</span><span class="acg-code">${f.code}</span></div>
        <div class="acg-pills">${ACM_LEVELS.map((l) => acmPillHtml(f, l, grants, editing)).join("")}</div>
      </div>`
    )
    .join("");
  return `<details class="acg" data-acg="${category}"${open ? " open" : ""}>
      <summary class="acg-head">
        <span class="acg-chev">${ACM_CHEVRON}</span>
        <span class="acg-name">${acmCategoryBadge(category)}</span>
        <span class="acg-count">${am("detail.groupCount")(granted, all.length)}</span>
        ${moneyGranted ? `<span class="acg-money-count">${am("moneyTag")} · ${moneyGranted}</span>` : ""}
      </summary>
      <div class="acg-body">${rows}</div>
    </details>`;
}

function acmGroupsHtml(role) {
  const grants = acmGrantsOf(role);
  const editing = acmEditing(role);
  const visible = acmVisibleFeatures(grants);
  const cats = ACM_CATEGORY_ORDER.filter((c) => visible.some((f) => f.category === c));
  if (!cats.length) return `<div class="table-cell-muted acm-empty">${am("detail.empty")}</div>`;
  return cats.map((c) => acmGroupHtml(c, visible.filter((f) => f.category === c), grants, editing)).join("");
}

// Нижняя панель правки: сколько разделов изменено относительно сохранённого состояния
function acmChangesText(role) {
  const before = role.grants || {};
  const after = acmEdit ? acmEdit.grants : before;
  const codes = new Set([...Object.keys(before), ...Object.keys(after)]);
  let n = 0;
  codes.forEach((c) => { if (before[c] !== after[c]) n += 1; });
  return n ? am("detail.changes")(n) : am("detail.noChanges");
}
function acmSummaryCounts(grants) {
  const count = (level) => ACM_FEATURES.filter((f) => f.levels[level] && acmLevelRank(grants[f.code]) >= acmLevelRank(level)).length;
  return { sections: Object.keys(grants).length, read: count("READ"), write: count("WRITE"), del: count("DELETE"), money: Object.keys(grants).filter((c) => acmFeature(c) && acmFeature(c).money).length };
}

function acmSummaryHtml(grants) {
  const s = acmSummaryCounts(grants);
  const d = am("detail.summary");
  return `<span>${d.sections}: <b>${s.sections}</b></span><span>READ: <b>${s.read}</b></span><span>WRITE: <b>${s.write}</b></span><span>DELETE: <b>${s.del}</b></span>${s.money ? `<span class="acm-summary-money">${am("moneyTag")}: <b>${s.money}</b></span>` : ""}`;
}

function acmFiltersBarHtml() {
  const d = am("detail");
  const catLabel = acmFilters.categories.length ? multiSelectLabel(acmFilters.categories, d.allCategories, (v) => t(`accessMatrix.categories.${v}`) || v) : d.allCategories;
  const accLabel = acmFilters.access.length ? multiSelectLabel(acmFilters.access, d.allAccess, (v) => d.access[v]) : d.allAccess;
  const chevron = `<svg class="acm-chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 8 4 4 4-4"/></svg>`;
  return `<div class="filters-bar-compact acm-filters">
      <div class="filters-search"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5.5"/><path d="m17 17-3.5-3.5"/></svg><input type="text" id="acm-search" placeholder="${d.search}" value="${escapeAttr(acmFilters.search)}" /></div>
      <button type="button" class="filter-trigger" id="acm-cat-trigger"><span>${catLabel}</span>${chevron}</button>
      <button type="button" class="filter-trigger" id="acm-access-trigger"><span>${accLabel}</span>${chevron}</button>
      ${acmFiltersActive() ? `<button type="button" class="btn-secondary" id="acm-reset">${d.reset}</button>` : ""}
    </div>`;
}

// Страницы бэк-офиса, которые открывает набор грантов (aclMyAccess.pages): пункт меню виден, когда закрыты все его разделы на READ
const ACM_SECTIONS = ACM_PAGE_GROUPS;

function acmPagesCardHtml(role, grantsOverride) {
  const d = am("detail");
  const grants = grantsOverride || acmGrantsOf(role);
  const visible = acmPageVisibility(grants);
  const top = ACM_PAGES.filter((p) => !p.parent);
  const seen = top.filter((p) => visible[p.code]).length;
  const body = ACM_SECTIONS.map((sec) => {
    const list = top.filter((p) => p.section === sec);
    if (!list.length) return "";
    const ok = list.filter((p) => visible[p.code]).length;
    return `<details class="acm-sec"><summary><span>${t(`nav.${sec}`)}</span><span class="table-cell-muted">${ok} / ${list.length}</span></summary>
      <ul class="acm-pages">${list
        .map((p) => {
          const tabs = ACM_PAGES.filter((x) => x.parent === p.code);
          const tabsOk = tabs.filter((x) => visible[x.code]).length;
          return `<li class="${visible[p.code] ? "is-on" : "is-off"}"><span class="acm-page-mark">${visible[p.code] ? ACM_TICK : ""}</span><span>${pdEscape(p.title)}</span>${tabs.length ? `<span class="table-cell-muted">${d.tabs(tabsOk, tabs.length)}</span>` : ""}</li>`;
        })
        .join("")}</ul></details>`;
  }).join("");
  const help = `<span class="acm-help" title="${d.pagesHelp(seen, top.length)}">?</span>`;
  return sectionCard(`${d.sections.pages} · ${seen} / ${top.length}${help}`, `<div id="acm-pages-body">${body}</div>`);
}

function acmInfoSection(role) {
  const d = am("detail");
  const a = t("access");
  return flatSection(
    d.sections.info,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(d.name, role.name)}
      ${detailField(d.type, acRoleTypeBadge(role.type))}
      ${detailField(d.status, acRoleStatusBadge(role.status))}
      ${detailField(d.applicable, role.applicableTypes.map((x) => a.enums.identityType[x]).join(", "))}
      ${role.templateCode ? detailField(d.template, role.templateCode) : detailField(d.template, a.common.noValue)}
      ${detailField(d.system, role.isSystem ? a.common.yes : a.common.no)}
      ${copyableField("ID", role.id)}
      ${detailField(d.created, role.createdAt)}
      ${detailField(d.updated, role.updatedAt)}
    </div>
    <div class="au-desc"><div class="filters-field-label">${d.description}</div><div>${role.description ? pdEscape(role.description) : a.common.noValue}</div></div>`
  );
}

function acmMatrixSection(role) {
  const d = am("detail");
  // «Редактировать» относится только к матрице доступа; параметры роли (название, описание, статус) — в меню «⋯» в шапке
  const edit = acmIsEditable(role) && !acmEditing(role) ? `<button type="button" class="btn-secondary" data-acm-action="edit">${d.edit}</button>` : "";
  return flatSection(
    d.sections.matrix,
    `${acmFiltersBarHtml()}<div class="acg-list" id="acm-groups">${acmGroupsHtml(role)}</div>`,
    null,
    null,
    edit
  );
}

function acmNoMatrixSection(role) {
  const info = role.type === "CLIENT" ? am("detail.clientRole") : am("detail.contractRole");
  return flatSection(info.title, `<p class="table-cell-muted acm-note-text">${info.text}</p>`);
}

function acmBarHtml(role) {
  const d = am("detail");
  return `<div class="acm-bar" id="acm-bar"><div class="acm-bar-summary" id="acm-bar-summary">${acmChangesText(role)}</div>
      <div class="acm-bar-actions"><button type="button" class="btn-secondary" id="acm-cancel">${d.cancel}</button><button type="button" class="btn-primary" id="acm-save">${d.save}</button></div></div>`;
}

// Кнопка «?» рядом с «⋯»: что означают уровни и метка денежных операций (текст подсказки)
function acmInfoButton() {
  const d = am("detail");
  const text = [...ACM_LEVELS.map((l) => `${acmLevelName(l)} — ${am(`levelDesc.${l}`)}`), "", d.legendText, "", d.moneyNote].join("&#10;");
  return `<button type="button" class="client-detail-actions-btn acm-info-btn" title="${text}" aria-label="${d.sections.legend}">${ACM_INFO_ICON}</button>`;
}

function viewRoleDetail(role) {
  const a = t("access");
  const d = am("detail");
  const editable = acmIsEditable(role);
  const editing = acmEditing(role);
  const hasMatrix = role.type === "ADMIN" && !role.contractOnly;
  const admins = role.type === "ADMIN" ? acAdminsOfRole(role) : [];

  const menu = editable && !editing
    ? `${acmInfoButton()}
       ${rowKebabMenu("acm-role-menu", [
         { label: d.kebab.params, icon: EDIT_ICON_SVG, attrs: 'data-acm-action="params"' },
         { label: d.kebab.duplicate, icon: COPY_ICON_SVG, attrs: 'data-acm-action="duplicate"' },
         { label: d.kebab.delete, icon: TRASH_ICON_SVG, danger: true, attrs: 'data-acm-action="delete"' },
       ])}`
    : hasMatrix
      ? acmInfoButton()
      : "";

  const assigned = role.type === "ADMIN"
    ? sectionCard(`${t("access.roleDetail.sections.assigned")} · ${admins.length}`, admins.length
        ? `<div class="pd-feed">${admins.map((ad) => `<div class="pd-party"><div><button type="button" class="table-link" data-ac-admin-link="${ad.id}">${pdEscape(ad.name)}</button><div class="table-cell-muted">${ad.email}</div></div>${acAdminStatusBadge(ad.status)}</div>`).join("")}</div>`
        : `<div class="table-cell-muted">${t("access.roleDetail.noAdmins")}</div>`)
    : "";

  return `
    <div id="ac-root">
      <div class="card client-detail-header cd-hero">
        <button type="button" class="client-detail-back" id="ac-back" title="${t("access.roleDetail.back")}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg></button>
        <div class="client-detail-header-main">
          <div class="client-detail-title-row">
            <span class="page-title">${editing ? `${d.editing}: ${pdEscape(role.name)}` : role.name}</span>${acRoleStatusBadge(role.status)}${acRoleTypeBadge(role.type)}
            ${role.isSystem ? `<span class="badge badge-info">${a.roles.systemBadge}</span>` : ""}
          </div>
          <div class="client-detail-subtitle"><span>${pdEscape(role.description)}</span></div>
        </div>
        <div class="pd-header-tools">${menu}</div>
      </div>
      <div class="client-detail-grid acm-grid">
        <div class="client-detail-grid-main">
          <div class="profile-flat-block">
            ${acmInfoSection(role)}
            ${hasMatrix ? acmMatrixSection(role) : acmNoMatrixSection(role)}
          </div>
        </div>
        <div class="client-detail-grid-side">
          ${hasMatrix ? `<div id="acm-pages">${acmPagesCardHtml(role)}</div>` : ""}
          ${assigned}
        </div>
      </div>
      ${editing ? acmBarHtml(role) : ""}
    </div>`;
}

// Точечное обновление при правках: без полной перерисовки страницы (не сбрасываются фокус и прокрутка)
function acmRefresh(role) {
  const groups = document.getElementById("acm-groups");
  if (groups) { groups.innerHTML = acmGroupsHtml(role); acmBindGroups(role); }
  const grants = acmGrantsOf(role);
  const barSummary = document.getElementById("acm-bar-summary");
  if (barSummary) barSummary.innerHTML = acmChangesText(role);
  const pages = document.getElementById("acm-pages");
  if (pages) {
    const open = [...pages.querySelectorAll("details")].map((x) => x.open);
    pages.innerHTML = acmPagesCardHtml(role);
    pages.querySelectorAll("details").forEach((x, i) => { x.open = !!open[i]; });
    pages.querySelectorAll(".collapsible-card-head").forEach((btn) => btn.addEventListener("click", () => btn.closest(".collapsible-card").classList.toggle("is-collapsed")));
  }
  acmRefreshTriggers();
}

function acmRefreshTriggers() {
  const d = am("detail");
  const cat = document.getElementById("acm-cat-trigger");
  const acc = document.getElementById("acm-access-trigger");
  const chevron = `<svg class="acm-chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 8 4 4 4-4"/></svg>`;
  if (cat) cat.innerHTML = `<span>${acmFilters.categories.length ? multiSelectLabel(acmFilters.categories, d.allCategories, (v) => t(`accessMatrix.categories.${v}`) || v) : d.allCategories}</span>${chevron}`;
  if (acc) acc.innerHTML = `<span>${acmFilters.access.length ? multiSelectLabel(acmFilters.access, d.allAccess, (v) => d.access[v]) : d.allAccess}</span>${chevron}`;
}

// Группа: запоминаем раскрытые; уровень группы — выдать всем или снять со всех
function acmToggleGroup(role, category, level) {
  const features = ACM_FEATURES.filter((f) => f.category === category && f.levels[level]);
  const allOn = features.every((f) => acmLevelRank(acmEdit.grants[f.code]) >= acmLevelRank(level));
  features.forEach((f) => acmSetLevel(acmEdit.grants, f, level, !allOn));
  acmRefresh(role);
}

function acmBindGroups(role) {
  document.querySelectorAll("#acm-groups details.acg").forEach((det) => {
    det.addEventListener("toggle", () => {
      if (acmFiltersActive()) return;
      if (det.open) acmOpenGroups.add(det.dataset.acg); else acmOpenGroups.delete(det.dataset.acg);
    });
  });
  if (!acmEditing(role)) return;
  document.querySelectorAll("#acm-groups button[data-acm-code]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const f = acmFeature(btn.dataset.acmCode);
      const level = btn.dataset.acmLevel;
      acmSetLevel(acmEdit.grants, f, level, !btn.classList.contains("is-on"));
      acmRefresh(role);
    });
  });
  document.querySelectorAll("#acm-groups button[data-acg-cat]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      acmToggleGroup(role, btn.dataset.acgCat, btn.dataset.acgLevel);
    });
  });
}

function acmSaveRole(role) {
  const d = am("detail");
  requireAdmin2fa("access_role_edit", () => {
    role.grants = { ...acmEdit.grants };
    acTouch(role);
    acmEdit = null;
    render();
    showToast(d.saved);
  });
}

// Параметры роли — название, описание и статус (меню «⋯» в шапке)
function openRoleParamsModal(role) {
  const m = t("access.modals");
  const c = t("access.common");
  const statuses = ["ACTIVE", "DEPRECATED", "ARCHIVED"];
  openModal({
    title: m.roleEditTitle,
    width: 480,
    bodyHtml: `<div class="modal-form">
      <label class="filters-field"><span class="filters-field-label">${m.roleNameLabel}<span class="req-star">*</span></span><input class="address-form-input" type="text" id="ac-role-name" maxlength="200" value="${escapeAttr(role.name)}" /></label>
      <label class="filters-field ac-field"><span class="filters-field-label">${m.roleDescLabel}</span><textarea class="form-textarea" id="ac-role-desc" rows="3" maxlength="200">${pdEscape(role.description)}</textarea></label>
      <label class="filters-field ac-field"><span class="filters-field-label">${m.roleStatusLabel}</span><select class="address-form-input" id="ac-role-status">${statuses.map((s) => `<option value="${s}"${role.status === s ? " selected" : ""}>${t(`access.enums.roleStatus.${s}`)}</option>`).join("")}</select></label>
      <div class="form-error" id="ac-modal-error" hidden></div>
    </div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="ac-cancel">${c.cancel}</button><button type="button" class="btn-primary" id="ac-submit">${c.save}</button>`,
    onMount: (el) => {
      const err = el.querySelector("#ac-modal-error");
      const fail = (msg) => { err.textContent = msg; err.hidden = false; };
      el.querySelector("#ac-cancel").addEventListener("click", closeModal);
      el.querySelector("#ac-submit").addEventListener("click", () => {
        const name = el.querySelector("#ac-role-name").value.trim();
        const description = el.querySelector("#ac-role-desc").value.trim();
        const status = el.querySelector("#ac-role-status").value;
        if (!name) return fail(m.errRoleName);
        if (ACCESS_ROLES.some((r) => r !== role && r.name.toLowerCase() === name.toLowerCase())) return fail(m.errRoleExists);
        closeModal();
        requireAdmin2fa("access_role_edit", () => {
          Object.assign(role, { name, description, status });
          acTouch(role);
          render();
          showToast(am("detail.paramsSaved"));
        });
      });
    },
  });
}
function attachRoleDetail(role, root) {
  root.querySelectorAll("[data-acm-action]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const act = btn.dataset.acmAction;
      if (act === "edit") { acmEdit = { roleId: role.id, grants: { ...role.grants } }; render(); }
      if (act === "params") openRoleParamsModal(role);
      if (act === "duplicate") openRoleFormModal(role);
      if (act === "delete") confirmDeleteRole(role);
    })
  );
  if (role.type !== "ADMIN" || role.contractOnly) return;

  const search = document.getElementById("acm-search");
  if (search) search.addEventListener("input", () => { acmFilters.search = search.value; acmRefresh(role); acmRefreshReset(); });
  const openMulti = (triggerId, key, options) => {
    const trigger = document.getElementById(triggerId);
    if (!trigger) return;
    trigger.addEventListener("click", () => openSelectDropdown({ anchorEl: trigger, options, selected: acmFilters[key], onChange: (v) => { acmFilters[key] = v; acmRefresh(role); acmRefreshReset(); } }));
  };
  const d = am("detail");
  openMulti("acm-cat-trigger", "categories", ACM_CATEGORY_ORDER.map((c) => ({ value: c, label: t(`accessMatrix.categories.${c}`) || c })));
  openMulti("acm-access-trigger", "access", ["granted", "notGranted", "money"].map((v) => ({ value: v, label: d.access[v] })));
  const reset = document.getElementById("acm-reset");
  if (reset) reset.addEventListener("click", () => { acmFilters = { search: "", categories: [], access: [] }; render(); });
  acmBindGroups(role);

  if (acmEditing(role)) {
    document.getElementById("acm-cancel").addEventListener("click", () => { acmEdit = null; render(); });
    document.getElementById("acm-save").addEventListener("click", () => acmSaveRole(role));
  }
}

// Кнопка «Сбросить» появляется и пропадает вместе с фильтрами
function acmRefreshReset() {
  const bar = document.querySelector(".acm-filters");
  if (!bar) return;
  const btn = document.getElementById("acm-reset");
  if (acmFiltersActive() && !btn) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn-secondary"; b.id = "acm-reset"; b.textContent = am("detail.reset");
    b.addEventListener("click", () => { acmFilters = { search: "", categories: [], access: [] }; render(); });
    bar.appendChild(b);
  } else if (!acmFiltersActive() && btn) btn.remove();
}

// ---- Создание / дублирование роли, удаление ----------------------------------------------------------------------------------
// Создание роли: сначала выбор «новая» или «на основе существующей», затем окно с параметрами.
// Из меню «⋯» роли («Дублировать») открывается сразу второй шаг с выбранной ролью-основой.
function openRoleFormModal(baseRole) {
  if (baseRole) openRoleParamsStep("based", baseRole);
  else openRoleChoiceStep();
}

function openRoleChoiceStep() {
  const d = am("detail.form");
  const card = (id, icon, title, text) => `<button type="button" class="acm-choice" id="${id}"><span class="acm-choice-icon">${icon}</span><span class="acm-choice-title">${title}</span><span class="acm-choice-text">${text}</span></button>`;
  openModal({
    title: d.choiceTitle,
    width: 560,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${d.choiceText}</p>
      <div class="acm-choice-grid">${card("acm-choice-new", PLUS_ICON_SVG, d.newTitle, d.newText)}${card("acm-choice-based", COPY_ICON_SVG, d.basedTitle, d.basedText)}</div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="ac-cancel">${t("access.common.cancel")}</button>`,
    onMount: (el) => {
      el.querySelector("#ac-cancel").addEventListener("click", closeModal);
      el.querySelector("#acm-choice-new").addEventListener("click", () => { closeModal(); openRoleParamsStep("new", null, true); });
      el.querySelector("#acm-choice-based").addEventListener("click", () => { closeModal(); openRoleParamsStep("based", null, true); });
    },
  });
}

function openRoleParamsStep(mode, baseRole, canGoBack) {
  const m = t("access.modals");
  const c = t("access.common");
  const d = am("detail.form");
  const bases = ACCESS_ROLES.filter((r) => r.type === "ADMIN" && !r.contractOnly);
  const baseOptions = bases.map((r) => ({ value: r.id, label: `${r.name}${r.isSystem ? ` (${t("access.roles.systemBadge")})` : ""}` }));
  openModal({
    title: mode === "new" ? d.newParamsTitle : d.basedParamsTitle,
    width: 480,
    bodyHtml: `<div class="modal-form">
      ${mode === "based" ? vbSelect("ac-role-base", d.baseLabel, baseOptions, baseRole ? baseRole.id : baseOptions[0].value) : ""}
      <label class="filters-field ac-field"><span class="filters-field-label">${m.roleNameLabel}<span class="req-star">*</span></span><input class="address-form-input" type="text" id="ac-role-name" maxlength="200" value="" /></label>
      <label class="filters-field ac-field"><span class="filters-field-label">${m.roleDescLabel}</span><textarea class="form-textarea" id="ac-role-desc" rows="3" maxlength="200"></textarea></label>
      <div class="form-error" id="ac-modal-error" hidden></div>
    </div>`,
    footerHtml: `${canGoBack ? `<button type="button" class="btn-secondary" id="ac-back-step">${d.back}</button>` : `<button type="button" class="btn-secondary" id="ac-cancel">${c.cancel}</button>`}<button type="button" class="btn-primary" id="ac-submit">${c.create}</button>`,
    onMount: (el) => {
      const err = el.querySelector("#ac-modal-error");
      const fail = (msg) => { err.textContent = msg; err.hidden = false; };
      const cancel = el.querySelector("#ac-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const back = el.querySelector("#ac-back-step");
      if (back) back.addEventListener("click", () => { closeModal(); openRoleChoiceStep(); });
      const nameInput = el.querySelector("#ac-role-name");
      if (nameInput) nameInput.focus();
      el.querySelector("#ac-submit").addEventListener("click", () => {
        const name = nameInput.value.trim();
        const description = el.querySelector("#ac-role-desc").value.trim();
        if (!name) return fail(m.errRoleName);
        if (ACCESS_ROLES.some((r) => r.name.toLowerCase() === name.toLowerCase())) return fail(m.errRoleExists);
        const base = mode === "based" ? ACCESS_ROLES.find((r) => r.id === el.querySelector("#ac-role-base").value) : null;
        const grants = base ? { ...base.grants } : {};
        const now = pdNow();
        const created = {
          id: `role-new-${now.getTime()}`, name, description, type: "ADMIN", status: "ACTIVE", isSystem: false, applicableTypes: ["ADMIN"], grants,
          templateCode: base ? base.name : null,
          createdDate: now, createdAt: formatDateTime(now), updatedDate: now, updatedAt: formatDateTime(now),
        };
        ACCESS_ROLES.push(created);
        closeModal();
        acmEdit = { roleId: created.id, grants: { ...grants } };
        window.location.hash = `#/settings-access/role/${created.id}`;
      });
    },
  });
}
function confirmDeleteRole(role) {
  const m = t("access.modals");
  const assigned = acAdminsOfRole(role).length;
  openConfirmModal({
    title: m.deleteRoleTitle, text: m.deleteRoleText(role.name, assigned), confirmLabel: t("access.common.delete"),
    cancelLabel: t("access.common.cancel"), danger: true,
    onConfirm: () => {
      ACCESS_ADMINS.forEach((a) => { a.roleIds = a.roleIds.filter((id) => id !== role.id); });
      ACCESS_ROLES.splice(ACCESS_ROLES.indexOf(role), 1);
      accessActiveTab = "roles";
      window.location.hash = "#/settings-access";
    },
  });
}

// ---- Страница администратора: итоговый доступ по его ролям (внутренность плоской секции) --------------------------------------
function acmAdminAccessHtml(roles, ad) {
  const grants = acmEffectiveGrants(roles);
  const codes = Object.keys(grants).filter((c) => acmFeature(c));
  if (!codes.length) return `<div class="table-cell-muted">${ad.noAccess}</div>`;
  const byCategory = {};
  codes.forEach((c) => { (byCategory[acmFeature(c).category] = byCategory[acmFeature(c).category] || []).push(c); });
  return ACM_CATEGORIES.filter((cat) => byCategory[cat])
    .map((cat) => `<div class="ac-domain"><div class="ac-domain-title">${t(`accessMatrix.categories.${cat}`) || cat} · ${byCategory[cat].length}</div>
      <div class="ac-badges">${byCategory[cat].map((c) => { const f = acmFeature(c); return `<span class="badge ${f.money ? "badge-warning" : "badge-neutral"}" title="${f.code}">${pdEscape(f.title)} · ${acmLevelName(grants[c])}</span>`; }).join("")}</div></div>`)
    .join("");
}


