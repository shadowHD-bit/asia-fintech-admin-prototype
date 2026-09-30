/* ==========================================================================
   "Безопасность → Доступ к системе": аварийные меры, действующие на всех пользователей сразу. Оформление — как вкладка
   "Безопасность" клиента (.cs-page: плоские секции с кнопками действий и описанием).
   1) Сессии — принудительно завершить сессии клиентов / администраторов / всех (кроме своей).
   2) Технические работы — клиентам вместо сайта и приложения показывается страница с текстом; текст вводится в модалке при включении.
   3) Аварийные ограничения — точечная приостановка регистрации, входа, платежей, обменов, крипто-выводов.
   ГРАНИЦЫ ПРОТОТИПА: в auth-backend есть только сессии текущего пользователя (getMyActiveSessions, logout) — админской
   мутации "завершить все сессии" и режима технических работ в схеме нет; экран моделирует эти функции, состояние живёт
   в памяти вкладки. Для реализации нужны новые ручки на бэкенде.
   ========================================================================== */

const secCtl = {
  maintenance: { on: false, message: "Мы проводим технические работы. Скоро всё заработает — спасибо за терпение." },
  freezes: { registration: false, clientLogin: false, payments: false, exchanges: false, otcDeals: false, cryptoWithdrawals: false },
};

const SEC_FREEZE_KEYS = ["registration", "clientLogin", "payments", "exchanges", "otcDeals", "cryptoWithdrawals"];

function sa(path) {
  return t(`sysAccess.${path}`);
}

const secTextarea = (id, label, value) =>
  `<label class="filters-field vb-field"><span class="filters-field-label">${label}</span><textarea class="form-textarea" id="${id}" rows="4">${pdEscape(value || "")}</textarea></label>`;

// ---- Сессии ------------------------------------------------------------------------------------------------
function secOpenKillModal(scope) {
  const m = sa("sessions");
  vbOpenForm({
    title: m.kill[scope],
    intro: m.intro[scope],
    fieldsHtml: secTextarea("sa-reason", m.reason, ""),
    submitLabel: m.kill[scope],
    danger: true,
    onSubmit: (el) => {
      if (!el.querySelector("#sa-reason").value.trim()) return m.reasonRequired;
      closeModal();
      requireAdmin2fa("security_sessions_kill", () => showToast(m.done));
      return null;
    },
  });
}

function secSessionsSection() {
  const m = sa("sessions");
  const btn = (scope, danger) => `<button type="button" class="${danger ? "btn-danger" : "btn-secondary"}" data-sa-kill="${scope}">${m.kill[scope]}</button>`;
  return flatSection(m.title, `<div class="cs-actions cs-actions-first">${btn("clients")}${btn("admins")}${btn("all", true)}</div><p class="table-cell-muted sa-note">${m.note}</p>`, null, m.desc);
}

// ---- Технические работы ---------------------------------------------------------------------------------------
function secMaintenanceSection() {
  const m = sa("maintenance");
  const c = secCtl.maintenance;
  // Как блок "Блокировка операций" на вкладке "Безопасность" клиента: пока не включено — только кнопка; включено — параметры и кнопка снятия
  const body = c.on
    ? `<div class="profile-fields profile-fields-grid">
        ${detailField(m.stateLabel, `<span class="badge badge-warning">${m.statusOn}</span>`)}
        ${detailField(m.messageLabel, pdEscape(c.message))}
      </div>
      <div class="cs-actions"><button type="button" class="btn-primary" data-sa-maint="off">${m.disableButton}</button></div>`
    : `<div class="cs-actions cs-actions-first"><button type="button" class="btn-danger" data-sa-maint="on">${m.enableButton}</button></div>`;
  return flatSection(m.title, body, null, m.desc);
}
function secOpenMaintenanceOn() {
  const m = sa("maintenance");
  vbOpenForm({
    title: m.enableButton,
    intro: m.enableIntro,
    fieldsHtml: secTextarea("sa-msg", m.messageLabel, secCtl.maintenance.message),
    submitLabel: m.enableConfirm,
    danger: true,
    onSubmit: (el) => {
      const text = el.querySelector("#sa-msg").value.trim();
      if (!text) return m.messageRequired;
      closeModal();
      requireAdmin2fa("security_maintenance", () => {
        secCtl.maintenance = { on: true, message: text };
        render();
        showToast(m.on);
      });
      return null;
    },
  });
}

function secConfirmMaintenanceOff() {
  const m = sa("maintenance");
  vbConfirm({
    title: m.disableTitle,
    text: m.disableText,
    confirmLabel: m.disableConfirm,
    danger: false,
    onConfirm: () => requireAdmin2fa("security_maintenance", () => {
      secCtl.maintenance.on = false;
      render();
      showToast(m.off);
    }),
  });
}

// ---- Аварийные ограничения ---------------------------------------------------------------------------------------
function secFreezesSection() {
  const m = sa("freezes");
  const rows = SEC_FREEZE_KEYS.map((k) => switchRowHtml(`sa-freeze-${k}`, m.items[k][0], secCtl.freezes[k], { cls: "sa-freeze-row", hint: m.items[k][1] })).join("");
  return flatSection(m.title, `<div class="sa-freezes">${rows}</div>`, null, m.desc);
}

function viewSecuritySystemAccess() {
  return `
    <div class="list-hero">${pageHeader(t("nav.security-system-access"), t("navDescriptions.security-system-access"))}</div>
    <div class="profile-flat-block cs-page sa-page">
      ${secSessionsSection()}
      ${secMaintenanceSection()}
      ${secFreezesSection()}
    </div>`;
}

function initSecuritySystemAccess() {
  const root = document.querySelector(".sa-page");
  if (!root) return;
  root.querySelectorAll("[data-sa-kill]").forEach((b) => b.addEventListener("click", () => secOpenKillModal(b.dataset.saKill)));
  root.querySelectorAll("[data-sa-maint]").forEach((b) =>
    b.addEventListener("click", () => (b.dataset.saMaint === "on" ? secOpenMaintenanceOn() : secConfirmMaintenanceOff()))
  );

  const f = sa("freezes");
  SEC_FREEZE_KEYS.forEach((k) => {
    const el = document.getElementById(`sa-freeze-${k}`);
    if (!el) return;
    el.addEventListener("change", () => {
      const wantOn = el.checked;
      el.checked = !wantOn; // применяем только после подтверждения
      const apply = () => requireAdmin2fa("security_freeze", () => {
        secCtl.freezes[k] = wantOn;
        render();
        showToast(wantOn ? f.enabledToast : f.disabledToast);
      });
      if (!wantOn) return apply();
      vbConfirm({ title: f.enableTitle, text: f.enableText(f.items[k][0]), confirmLabel: f.enableConfirm, danger: true, onConfirm: apply });
    });
  });
}
