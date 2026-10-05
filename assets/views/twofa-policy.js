/* ==========================================================================
   "Безопасность → Управление 2FA": для каких действий админки нужен код подтверждения.
   Действия сгруппированы по модулям админки (экспорт, создание, одобрение, отклонение и т.д.). 2FA включается для модуля
   целиком одним переключателем или отдельно для каждого действия. Вход в админку — первый модуль списка.
   Два таба: "Настройки" и "История изменений". Правки не применяются сразу: копятся в черновике, кнопка "Сохранить изменения"
   просит причину, после сохранения каждое изменённое значение попадает в историю (когда, кто, было, стало, комментарий).
   Каталог, состояние и окно запроса кода — components/admin-2fa.js. Прототип: политика и история живут в памяти вкладки,
   на бэкенде такого реестра в схеме нет.
   ========================================================================== */

let twofaSearch = "";
let twofaTab = "settings";
let twofaDraft = null; // { login, rememberMinutes, actions } — несохранённые правки

// Черновик живёт, пока открыта страница; при переходе на другой раздел сбрасывается
window.addEventListener("hashchange", () => {
  twofaDraft = null;
  twofaTab = "settings";
});

function twofaEnsureDraft() {
  if (!twofaDraft) twofaDraft = { login: admin2fa.policy.login.required, rememberMinutes: admin2fa.policy.rememberMinutes, actions: { ...admin2fa.policy.actions } };
  return twofaDraft;
}

function twofaReq(key) {
  return twofaEnsureDraft().actions[key] === true;
}

// ---- История изменений (только прототип) ------------------------------------------------------------------------------
// Запись: { id, date, adminEmail, kind: "action" | "login" | "remember", key, oldValue, newValue, comment }
const ADMIN_2FA_HISTORY = [];

function twofaSeedHistory() {
  if (ADMIN_2FA_HISTORY.length || typeof ACCESS_ADMINS === "undefined" || !ACCESS_ADMINS.length) return;
  const at = (days) => new Date(MOCK_NOW.getTime() - days * 24 * 60 * 60 * 1000);
  const seeds = [
    { days: 26, kind: "login", key: "login", oldValue: false, newValue: true, comment: "Вход в админку только с кодом — требование службы безопасности" },
    { days: 19, kind: "action", key: "client_password_reset", oldValue: false, newValue: true, comment: "Сброс пароля клиента — чувствительное действие" },
    { days: 12, kind: "action", key: "payment_approve", oldValue: false, newValue: true, comment: "Одобрение платежа меняет баланс, нужен код" },
    { days: 8, kind: "remember", key: "remember", oldValue: 15, newValue: 5, comment: "Сократили окно без повторного кода после аудита" },
    { days: 3, kind: "action", key: "users_export", oldValue: true, newValue: false, comment: "Экспорт пользователей стал слишком частым, код мешает работе поддержки" },
  ];
  seeds.forEach((s, i) => {
    ADMIN_2FA_HISTORY.push({ id: `tfh-${i + 1}`, date: at(s.days), adminEmail: ACCESS_ADMINS[i % ACCESS_ADMINS.length].email, kind: s.kind, key: s.key, oldValue: s.oldValue, newValue: s.newValue, comment: s.comment });
  });
}

function twofaSettingTitle(e) {
  if (e.kind === "login") return { title: tf2("login.required"), sub: tf2("login.title") };
  if (e.kind === "remember") return { title: tf2("confirmation.title"), sub: tf2("history.rememberSub") };
  const x = ADMIN_2FA_ACTIONS.find((a) => a.key === e.key);
  return { title: admin2faActionLabel(e.key), sub: x ? tf2(`actions.modules.${x.module}`) : "" };
}

function twofaValueText(e, value) {
  if (e.kind === "remember") return tf2("confirmation.minutes")(value);
  return tf2(value ? "history.values.on" : "history.values.off");
}

function twofaValueBadge(e, value) {
  const text = twofaValueText(e, value);
  if (e.kind === "remember") return `<span class="badge badge-neutral">${text}</span>`;
  return `<span class="badge ${value ? "badge-success" : "badge-neutral"}">${text}</span>`;
}

function twofaAdminCell(email) {
  const a = ACCESS_ADMINS.find((x) => x.email === email);
  const role = typeof eodCommentAuthorRole === "function" ? eodCommentAuthorRole(email) : "";
  const name = a ? `<button type="button" class="table-link" data-tf-admin="${a.id}">${pdEscape(a.name)}</button>` : pdEscape(email);
  return `<div class="identity-cell">${name}${role ? `<span class="table-cell-muted">${pdEscape(role)}</span>` : ""}</div>`;
}

const twofaHistoryList = createAccessList({
  key: "twofa-history",
  noDivider: false,
  data: () => ADMIN_2FA_HISTORY,
  searchPlaceholder: () => tf2("history.search"),
  searchText: (e) => { const s = twofaSettingTitle(e); return [s.title, s.sub, e.comment, e.adminEmail].filter(Boolean).join(" "); },
  filters: [
    { id: "date", kind: "date", label: () => tf2("history.filters.date"), get: (e) => e.date },
    { id: "admin", kind: "multi", label: () => tf2("history.filters.admin"), get: (e) => e.adminEmail, options: () => [...new Set(ADMIN_2FA_HISTORY.map((e) => e.adminEmail))].map((m) => { const a = ACCESS_ADMINS.find((x) => x.email === m); return { value: m, label: a ? a.name : m }; }) },
    { id: "kind", kind: "multi", label: () => tf2("history.filters.kind"), get: (e) => e.kind, options: () => ["login", "remember", "action"].map((v) => ({ value: v, label: tf2(`history.kinds.${v}`) })) },
  ],
  defaultSort: (a, b) => b.date - a.date,
  sorts: { date: (a, b) => a.date - b.date },
  columns: [
    { label: () => tf2("history.columns.date"), sort: "date", html: (e) => dateTimeCell(formatDateTime(e.date)) },
    { label: () => tf2("history.columns.who"), html: (e) => twofaAdminCell(e.adminEmail) },
    { label: () => tf2("history.columns.setting"), html: (e) => { const s = twofaSettingTitle(e); return `<div class="identity-cell"><span>${pdEscape(s.title)}</span>${s.sub ? `<span class="table-cell-muted">${pdEscape(s.sub)}</span>` : ""}</div>`; } },
    { label: () => tf2("history.columns.before"), html: (e) => twofaValueBadge(e, e.oldValue) },
    { label: () => tf2("history.columns.after"), html: (e) => twofaValueBadge(e, e.newValue) },
    { label: () => tf2("history.columns.comment"), html: (e) => `<div class="tf-hist-comment">${pdEscape(e.comment)}</div>` },
  ],
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-tf-admin]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/settings-access/admin/${b.dataset.tfAdmin}`; }));
  },
});

// ---- Различия черновика и действующей политики ---------------------------------------------------------------------------
function twofaChanges() {
  const d = twofaEnsureDraft();
  const p = admin2fa.policy;
  const list = [];
  if (d.login !== p.login.required) list.push({ kind: "login", key: "login", oldValue: p.login.required, newValue: d.login });
  if (d.rememberMinutes !== p.rememberMinutes) list.push({ kind: "remember", key: "remember", oldValue: p.rememberMinutes, newValue: d.rememberMinutes });
  ADMIN_2FA_ACTIONS.forEach((x) => {
    const was = p.actions[x.key] === true;
    if (d.actions[x.key] === true !== was) list.push({ kind: "action", key: x.key, oldValue: was, newValue: d.actions[x.key] === true });
  });
  return list;
}

function twofaApplyChanges(changes, comment) {
  const d = twofaEnsureDraft();
  const now = pdNow();
  changes.forEach((c, i) => {
    ADMIN_2FA_HISTORY.push({ id: `tfh-${ADMIN_2FA_HISTORY.length + 1}`, date: new Date(now.getTime() + i * 1000), adminEmail: CURRENT_ADMIN.email, kind: c.kind, key: c.key, oldValue: c.oldValue, newValue: c.newValue, comment });
  });
  admin2fa.policy.login.required = d.login;
  admin2fa.policy.rememberMinutes = d.rememberMinutes;
  admin2fa.policy.actions = { ...d.actions };
}

function twofaOpenSave() {
  const s = tf2("save");
  const changes = twofaChanges();
  if (!changes.length) return;
  vbOpenForm({
    title: s.modalTitle,
    intro: s.intro(changes.length),
    fieldsHtml: vbTextarea("tf-save-reason", s.reason, "", 3),
    submitLabel: s.submit,
    onSubmit: (el) => {
      const reason = el.querySelector("#tf-save-reason").value.trim();
      if (!reason) return s.errRequired;
      if (reason.length > 500) return s.errLength;
      closeModal();
      // изменение политики 2FA само защищено кодом (действие каталога "Изменение политики 2FA")
      requireAdmin2fa("twofa_policy_edit", () => {
        twofaApplyChanges(changes, reason);
        render();
        showToast(s.done);
      });
      return null;
    },
  });
}

// ---- Настройки ---------------------------------------------------------------------------------------------------------------
// Вход в админку — первый модуль списка: один переключатель "код при входе"
function twofaLoginModuleHtml(q) {
  const l = tf2("login");
  if (q && !`${l.title} ${l.required}`.toLowerCase().includes(q)) return "";
  return flatSection(l.title, switchRowHtml("tf-login-required", l.required, twofaEnsureDraft().login, { cls: "tf-act sa-freeze-row", hint: l.requiredHint }), null, l.desc);
}

// Модуль: переключатель "все действия модуля" в заголовке и по переключателю на каждое действие
function twofaModuleList(mod, list) {
  const a = tf2("actions");
  const all = ADMIN_2FA_ACTIONS.filter((x) => x.module === mod);
  const on = all.filter((x) => twofaReq(x.key)).length;
  const rows = list.map((x) => switchRowHtml(`tf-act-${x.key}`, admin2faActionLabel(x.key), twofaReq(x.key), { cls: "tf-act sa-freeze-row" })).join("");
  const head = `<span class="tf-module-head-right"><span class="tf-module-count table-cell-muted">${a.counter(on, all.length)}</span>${switchRowHtml(`tf-group-${mod}`, a.groupAll, on === all.length, { cls: "tf-group" })}</span>`;
  return flatSection(a.modules[mod], `<div class="tf-action-list">${rows}</div>`, null, null, head);
}

function twofaModulesHtml() {
  const q = twofaSearch.trim().toLowerCase();
  const modNames = tf2("actions.modules");
  const blocks = twofaLoginModuleHtml(q) + ADMIN_2FA_MODULES.map((mod) => {
    const list = ADMIN_2FA_ACTIONS.filter((x) => x.module === mod && (!q || admin2faActionLabel(x.key).toLowerCase().includes(q) || modNames[mod].toLowerCase().includes(q)));
    return list.length ? twofaModuleList(mod, list) : "";
  }).join("");
  return blocks || `<div class="table-cell-muted">${tf2("common.nothing")}</div>`;
}

// Подтверждение: как долго после ввода кода не запрашивать его повторно (только выбор срока, без подписи)
function twofaConfirmationSection() {
  const c = tf2("confirmation");
  const seg = [0, 5, 15, 30].map((n) => `<button type="button" class="filter-seg-btn${twofaEnsureDraft().rememberMinutes === n ? " is-active" : ""}" data-tf-remember="${n}">${c.minutes(n)}</button>`).join("");
  return flatSection(c.title, `<div class="tf-setting-row"><div class="filter-seg">${seg}</div></div>`, null, c.desc);
}

function twofaActionsSection() {
  const a = tf2("actions");
  const search = `<div class="filters-bar-compact"><div class="filters-search"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5.5"/><path d="m17 17-3.5-3.5"/></svg><input type="text" id="tf-search" placeholder="${a.search}" value="${escapeAttr(twofaSearch)}" /></div></div>`;
  return `<div class="tf-modules-head"><div class="detail-section-title">${a.title}</div><div class="profile-flat-section-desc">${a.desc}</div>${search}</div>
    <div id="tf-modules">${twofaModulesHtml()}</div>`;
}

function twofaSaveBarHtml() {
  const n = twofaChanges().length;
  if (!n) return "";
  const s = tf2("save");
  return `<div class="tf-savebar"><span class="tf-savebar-text">${s.bar(n)}</span>
    <span class="tf-savebar-actions"><button type="button" class="btn-secondary" id="tf-discard">${s.discard}</button><button type="button" class="btn-primary" id="tf-save">${s.save}</button></span></div>`;
}

function twofaTabsHtml() {
  const h = tf2("history");
  const tabs = [["settings", h.tabSettings], ["history", `${h.tab}`]];
  return `<div class="cd-tabs-wrap"><div class="cd-subtabs">${tabs
    .map(([id, label]) => `<button type="button" class="cd-subtab${twofaTab === id ? " is-active" : ""}" data-tf-tab="${id}"><span>${label}</span>${id === "history" ? `<span class="quick-tab-count">${ADMIN_2FA_HISTORY.length}</span>` : ""}</button>`)
    .join("")}</div></div>`;
}

function viewTwofaPolicy() {
  twofaSeedHistory();
  twofaEnsureDraft();
  const body =
    twofaTab === "history"
      ? twofaHistoryList.view()
      : `<div class="profile-flat-block tf-page">${twofaConfirmationSection()}</div>
         <div class="profile-flat-block tf-page tf-modules-block">${twofaActionsSection()}</div>
         ${twofaSaveBarHtml()}`;
  return `
    <div class="list-hero">${pageHeader(t("nav.twofa-policy"), t("navDescriptions.twofa-policy"), sectionHintBtn("tf-hint-btn", t("twofa.info")))}</div>
    ${twofaTabsHtml()}
    ${body}`;
}

function initTwofaPolicy() {
  document.querySelectorAll("[data-tf-tab]").forEach((b) => b.addEventListener("click", () => { twofaTab = b.dataset.tfTab; render(); }));
  if (twofaTab === "history") { twofaHistoryList.init(); return; }

  const touched = () => render();
  document.querySelectorAll("[data-tf-remember]").forEach((b) => b.addEventListener("click", () => { twofaEnsureDraft().rememberMinutes = Number(b.dataset.tfRemember); touched(); }));
  const discard = document.getElementById("tf-discard");
  if (discard) discard.addEventListener("click", () => { twofaDraft = null; render(); });
  const save = document.getElementById("tf-save");
  if (save) save.addEventListener("click", twofaOpenSave);

  const bindModules = () => {
    const loginReq = document.getElementById("tf-login-required");
    if (loginReq) loginReq.addEventListener("change", () => { twofaEnsureDraft().login = loginReq.checked; touched(); });
    ADMIN_2FA_ACTIONS.forEach((x) => {
      const el = document.getElementById(`tf-act-${x.key}`);
      if (el) el.addEventListener("change", () => { twofaEnsureDraft().actions[x.key] = el.checked; touched(); });
    });
    ADMIN_2FA_MODULES.forEach((mod) => {
      const el = document.getElementById(`tf-group-${mod}`);
      if (el) el.addEventListener("change", () => { ADMIN_2FA_ACTIONS.filter((x) => x.module === mod).forEach((x) => { twofaEnsureDraft().actions[x.key] = el.checked; }); touched(); });
    });
  };
  bindModules();
  const search = document.getElementById("tf-search");
  if (search)
    search.addEventListener("input", () => {
      twofaSearch = search.value;
      document.getElementById("tf-modules").innerHTML = twofaModulesHtml();
      bindModules();
    });
}


