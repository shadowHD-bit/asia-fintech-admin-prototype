/* ==========================================================================
   2FA администратора: способы подтверждения (профиль), политика "для каких действий нужен код" (Управление 2FA) и окно
   запроса кода на конкретном действии — requireAdmin2fa(actionKey, run).

   Модель по бэкенду auth-backend: типы кода TFAType = SMS | EMAIL | OTP (приложение-аутентификатор, у нас "Google
   Authenticator"), отправка кода sendTFACode(type), проверка — Verify2FAInput (tfaVerifyData) в чувствительных мутациях.
   ГРАНИЦЫ ПРОТОТИПА: мутаций подключения/отключения способов и админского реестра "какие действия требуют 2FA" в схеме
   нет — экран моделирует их, состояние живёт в памяти вкладки. Код подтверждения в прототипе — 000000.
   ========================================================================== */

const ADMIN_2FA_DEMO_CODE = "000000"; // в прототипе принимается везде
// SMS в админке не используем: у администратора в системе нет телефона (в auth-backend тип SMS есть, но для админов он не применим)
const ADMIN_2FA_METHODS = ["OTP", "EMAIL"];

// Модули админки в порядке отображения и действия по каждому: экспорт, создание, одобрение, отклонение и т.д.
// Политика: 2FA включается для модуля целиком или для отдельных действий (policy.actions). Поле flags — только начальные значения
// по умолчанию (чувствительные действия включены), в логике и интерфейсе не участвует. Ключи — с подчёркиванием (ключи i18n).
const ADMIN_2FA_MODULES = ["clients", "payments", "crypto", "exchanges", "otc", "accounts", "eod", "audit", "security", "settings"];
const ADMIN_2FA_ACTIONS = [
  { key: "users_export", module: "clients", flags: ["DATA_EXPORT"] },
  { key: "companies_export", module: "clients", flags: ["DATA_EXPORT"] },
  { key: "client_card_pdf", module: "clients", flags: ["DATA_EXPORT"] },
  { key: "client_block", module: "clients", flags: ["CLIENT_DATA"] },
  { key: "client_unblock", module: "clients", flags: ["CLIENT_DATA"] },
  { key: "client_ops_lock", module: "clients", flags: ["CLIENT_DATA"] },
  { key: "client_password_reset", module: "clients", flags: ["CLIENT_DATA", "ACCESS_CONTROL"] },
  { key: "client_sessions_kill", module: "clients", flags: ["CLIENT_DATA", "ACCESS_CONTROL"] },
  { key: "client_kyc_change", module: "clients", flags: ["CLIENT_DATA"] },
  { key: "client_edit", module: "clients", flags: ["CLIENT_DATA"] },
  { key: "company_member_manage", module: "clients", flags: ["CLIENT_DATA", "ACCESS_CONTROL"] },
  { key: "partner_manage", module: "clients", flags: ["ACCESS_CONTROL"] },

  { key: "payments_export", module: "payments", flags: ["DATA_EXPORT"] },
  { key: "payment_pdf", module: "payments", flags: ["DATA_EXPORT"] },
  { key: "payment_create", module: "payments", flags: ["FINANCIAL"] },
  { key: "payment_approve", module: "payments", flags: ["FINANCIAL", "IRREVERSIBLE"] },
  { key: "payment_decline", module: "payments", flags: ["FINANCIAL"] },
  { key: "payment_request_info", module: "payments", flags: [] },

  { key: "crypto_export", module: "crypto", flags: ["DATA_EXPORT"] },
  { key: "crypto_withdraw_create", module: "crypto", flags: ["FINANCIAL", "IRREVERSIBLE"] },
  { key: "crypto_transfer_create", module: "crypto", flags: ["FINANCIAL"] },

  { key: "exchanges_export", module: "exchanges", flags: ["DATA_EXPORT"] },
  { key: "exchange_approve", module: "exchanges", flags: ["FINANCIAL", "IRREVERSIBLE"] },
  { key: "exchange_decline", module: "exchanges", flags: ["FINANCIAL"] },
  { key: "exchange_rate_change", module: "exchanges", flags: ["FINANCIAL"] },

  { key: "otc_export", module: "otc", flags: ["DATA_EXPORT"] },
  { key: "otc_deal_pdf", module: "otc", flags: ["DATA_EXPORT"] },
  { key: "otc_force_cancel", module: "otc", flags: ["FINANCIAL", "IRREVERSIBLE"] },

  { key: "accounts_export", module: "accounts", flags: ["DATA_EXPORT"] },
  { key: "account_create", module: "accounts", flags: [] },
  { key: "account_edit", module: "accounts", flags: [] },
  { key: "account_freeze", module: "accounts", flags: ["FINANCIAL"] },
  { key: "account_close", module: "accounts", flags: ["FINANCIAL", "IRREVERSIBLE"] },
  { key: "account_archive", module: "accounts", flags: [] },

  { key: "eod_close_start", module: "eod", flags: ["FINANCIAL", "SYSTEM", "IRREVERSIBLE"] },
  { key: "eod_stage_approve", module: "eod", flags: ["FINANCIAL", "SYSTEM"] },
  { key: "eod_discrepancy_resolve", module: "eod", flags: ["FINANCIAL"] },
  { key: "eod_adjustment_create", module: "eod", flags: ["FINANCIAL", "IRREVERSIBLE"] },
  { key: "eod_export", module: "eod", flags: ["DATA_EXPORT"] },

  { key: "audit_export", module: "audit", flags: ["DATA_EXPORT"] },
  { key: "audit_pdf", module: "audit", flags: ["DATA_EXPORT"] },

  { key: "security_sessions_kill", module: "security", flags: ["MASS", "SYSTEM", "ACCESS_CONTROL"] },
  { key: "security_maintenance", module: "security", flags: ["SYSTEM", "MASS"] },
  { key: "security_freeze", module: "security", flags: ["SYSTEM", "MASS"] },
  { key: "twofa_policy_edit", module: "security", flags: ["ACCESS_CONTROL", "SYSTEM"] },

  { key: "tariff_change", module: "settings", flags: ["FINANCIAL", "MASS"] },
  { key: "rates_markup_change", module: "settings", flags: ["FINANCIAL"] },
  { key: "routing_manage", module: "settings", flags: ["FINANCIAL", "SYSTEM"] },
  
  { key: "kyc_config_create", module: "settings", flags: ["SYSTEM"] },
  { key: "sanctions_import", module: "settings", flags: ["SYSTEM", "MASS"] },
  { key: "access_role_edit", module: "settings", flags: ["ACCESS_CONTROL"] },
  { key: "access_admin_manage", module: "settings", flags: ["ACCESS_CONTROL"] },
];
const admin2fa = {
  secret: "JBSWY3DPEHPK3PXP",
  // E-mail — базовый способ: код приходит на почту администратора, отключить его нельзя
  methods: { OTP: { enabled: false }, EMAIL: { enabled: true } },
  // Резервный код — как в auth-backend (getRecoveryCode/disableAll2FA): ОДИН код, выдаётся один раз, использование
  // отключает разом все способы подтверждения и стирает код; новый можно получить только после этого. Не альтернативный
  // способ подтверждения (в отличие от старой модели набора кодов) — используется только для экстренного сброса.
  recoveryCode: null, // сам код, известен, пока не использован (в реальной системе после выдачи хранится только хеш)
  recoveryCodeObtainedAt: null,
  policy: {
    actions: {}, // key -> true/false; заполняется по умолчанию ниже
    rememberMinutes: 5,
    // Вход в админку — отдельно от действий: требовать ли код при входе и сколько дней помнить устройство
    login: { required: true, rememberDays: 30 },
  },
  lastConfirmedAt: 0,
};

function tf2(path) {
  return t(`twofa.${path}`);
}

function admin2faActionLabel(key) {
  return t(`twofa.actions.items.${key}`);
}

function admin2faEnabledMethods() {
  return ADMIN_2FA_METHODS.filter((m) => admin2fa.methods[m].enabled);
}

// По умолчанию включены финансовые, необратимые, массовые, системные и связанные с доступом действия
ADMIN_2FA_ACTIONS.forEach((a) => {
  admin2fa.policy.actions[a.key] = a.flags.some((f) => ["FINANCIAL", "IRREVERSIBLE", "MASS", "SYSTEM", "ACCESS_CONTROL"].includes(f));
});

function admin2faRequired(key) {
  return admin2fa.policy.actions[key] === true;
}

function admin2faRecentlyConfirmed() {
  const mins = admin2fa.policy.rememberMinutes;
  return mins > 0 && Date.now() - admin2fa.lastConfirmedAt < mins * 60 * 1000;
}

// Выполнить действие; если для него включена 2FA (по флагам или вручную) — сначала окно запроса кода.
// Не везде: только там, где действие в каталоге и для него код требуется по политике.
function requireAdmin2fa(actionKey, run) {
  if (!admin2faRequired(actionKey) || admin2faRecentlyConfirmed()) return run();
  openAdmin2faModal({ title: tf2("verify.title"), intro: tf2("verify.intro")(admin2faActionLabel(actionKey)), onSuccess: run });
}

// ---- Окно запроса кода ---------------------------------------------------------------------------------------------------
// opts: { title, intro, onSuccess, remember (по умолчанию true), preview }
function openAdmin2faModal(opts) {
  const v = tf2("verify");
  const methods = admin2faEnabledMethods();
  if (!methods.length) {
    openModal({
      title: v.noMethod,
      width: 440,
      bodyHtml: `<p class="modal-confirm-text">${v.noMethodText}</p>`,
      footerHtml: `<button type="button" class="btn-secondary" id="a2f-cancel">${v.cancel}</button><button type="button" class="btn-primary" id="a2f-profile">${v.toProfile}</button>`,
      onMount: (el) => {
        el.querySelector("#a2f-cancel").addEventListener("click", closeModal);
        el.querySelector("#a2f-profile").addEventListener("click", () => { closeModal(); window.location.hash = "#/profile"; });
      },
    });
    return;
  }
  const st = { method: methods[0], attempts: 3, sentAt: Date.now(), timer: null };
  const needsSend = () => st.method === "EMAIL";
  const hint = () => v.hint[st.method];
  const bodyHtml = () => `
    ${opts.intro ? `<p class="modal-confirm-text">${opts.intro}</p>` : ""}
    ${methods.length > 1 ? `<div class="sc-chips a2f-methods">${methods.map((m) => `<button type="button" class="sc-chip${st.method === m ? " is-active" : ""}" data-a2f-method="${m}">${tf2(`methods.${m}`)}</button>`).join("")}</div>` : ""}
    <div class="filters-field vb-field"><span class="filters-field-label">${v.codeLabel}</span>
      <div class="login-otp" id="a2f-code">${[0, 1, 2, 3, 4, 5].map((i) => `<input class="address-form-input login-otp-cell" inputmode="numeric" maxlength="1" autocomplete="${i ? "off" : "one-time-code"}" data-otp="${i}" />`).join("")}</div></div>
    ${needsSend() ? "" : `<div class="table-cell-muted a2f-hint">${hint()}</div>`}
    ${needsSend() ? `<div class="a2f-resend table-cell-muted"><span id="a2f-resend-text"></span><button type="button" class="table-link a2f-send" id="a2f-send" hidden>${v.resendNow}</button></div>` : ""}
    <div class="form-error" id="a2f-err" hidden></div>`;
  openModal({
    title: opts.title || v.title,
    width: 440,
    bodyHtml: bodyHtml(),
    footerHtml: `<button type="button" class="btn-secondary" id="a2f-cancel">${v.cancel}</button><button type="button" class="btn-primary" id="a2f-ok" disabled>${v.confirm}</button>`,
    onMount: (el) => {
      const bind = () => {
        const cells = [...el.querySelectorAll(".login-otp-cell")];
        const codeVal = () => cells.map((x) => x.value).join("");
        const ok = el.querySelector("#a2f-ok");
        const err = el.querySelector("#a2f-err");
        cells[0].focus();
        const upd = () => { err.hidden = true; ok.disabled = codeVal().length < 6; };
        cells.forEach((cell, i) => {
          cell.addEventListener("input", () => { cell.value = cell.value.replace(/\D/g, "").slice(-1); if (cell.value && cells[i + 1]) cells[i + 1].focus(); upd(); });
          cell.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !ok.disabled) ok.click();
            else if (e.key === "Backspace" && !cell.value && cells[i - 1]) { cells[i - 1].value = ""; cells[i - 1].focus(); upd(); }
            else if (e.key === "ArrowLeft" && cells[i - 1]) cells[i - 1].focus();
            else if (e.key === "ArrowRight" && cells[i + 1]) cells[i + 1].focus();
          });
          cell.addEventListener("paste", (e) => {
            const d = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
            if (!d) return;
            e.preventDefault();
            d.split("").forEach((ch, k) => { cells[k].value = ch; });
            cells[Math.min(d.length, 5)].focus();
            upd();
          });
        });        el.querySelectorAll("[data-a2f-method]").forEach((b) =>
          b.addEventListener("click", () => { st.method = b.dataset.a2fMethod; el.querySelector(".modal-body").innerHTML = bodyHtml(); bind(); })
        );
        const send = el.querySelector("#a2f-send");
        // повторная отправка — не чаще раза в минуту
        clearInterval(st.timer);
        if (send) {
          const txt = el.querySelector("#a2f-resend-text");
          const tick = () => {
            if (!document.body.contains(send)) return clearInterval(st.timer);
            const left = 60 - Math.floor((Date.now() - st.sentAt) / 1000);
            if (left > 0) { txt.textContent = v.resendIn(left); send.hidden = true; }
            else { txt.textContent = ""; send.hidden = false; clearInterval(st.timer); }
          };
          st.timer = setInterval(tick, 1000);
          tick();
          send.addEventListener("click", () => { st.sentAt = Date.now(); showToast(v.sent); st.timer = setInterval(tick, 1000); tick(); });
        }
        ok.addEventListener("click", () => {
          if (codeVal() === ADMIN_2FA_DEMO_CODE) {
            if (opts.remember !== false) admin2fa.lastConfirmedAt = Date.now();
            closeModal();
            if (opts.onSuccess) opts.onSuccess();
            return;
          }
          st.attempts -= 1;
          if (st.attempts <= 0) { closeModal(); showToast(v.locked); return; }
          err.textContent = v.wrong(st.attempts);
          err.hidden = false;
          cells.forEach((x) => { x.value = ""; });
          cells[0].focus();
          ok.disabled = true;
        });
      };
      el.querySelector("#a2f-cancel").addEventListener("click", closeModal);
      bind();
    },
  });
}

// ---- Подключение Google Authenticator --------------------------------------------------------------------------------------
function admin2faQrSvg(seed) {
  const N = 25;
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const cells = [];
  const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      let on;
      if (finder(r, c)) {
        const lr = r < 7 ? r : r - (N - 7);
        const lc = c < 7 ? c : c - (N - 7);
        on = lr === 0 || lr === 6 || lc === 0 || lc === 6 || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
      } else {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        on = (x >>> 24) % 2 === 0;
      }
      if (on) cells.push(`<rect x="${c}" y="${r}" width="1" height="1"/>`);
    }
  }
  return `<svg class="a2f-qr" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" fill="#1f2340">${cells.join("")}</svg>`;
}

// 6 отдельных ячеек кода: автопереход, Backspace, стрелки, вставка целиком
function otpCellsHtml(id) {
  return `<div class="login-otp" id="${id}">${[0, 1, 2, 3, 4, 5].map((i) => `<input class="address-form-input login-otp-cell" inputmode="numeric" maxlength="1" autocomplete="off" data-otp="${i}" />`).join("")}</div>`;
}

function bindOtpCells(root, onChange, onEnter) {
  const cells = [...root.querySelectorAll(".login-otp-cell")];
  cells.forEach((cell, i) => {
    cell.addEventListener("input", () => { cell.value = cell.value.replace(/\D/g, "").slice(-1); if (cell.value && cells[i + 1]) cells[i + 1].focus(); onChange(); });
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onEnter();
      else if (e.key === "Backspace" && !cell.value && cells[i - 1]) { cells[i - 1].value = ""; cells[i - 1].focus(); onChange(); }
      else if (e.key === "ArrowLeft" && cells[i - 1]) cells[i - 1].focus();
      else if (e.key === "ArrowRight" && cells[i + 1]) cells[i + 1].focus();
    });
    cell.addEventListener("paste", (e) => {
      const d = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (!d) return;
      e.preventDefault();
      d.split("").forEach((ch, k) => { cells[k].value = ch; });
      cells[Math.min(d.length, 5)].focus();
      onChange();
    });
  });
  return { value: () => cells.map((x) => x.value).join(""), clear: () => { cells.forEach((x) => { x.value = ""; }); cells[0].focus(); } };
}

function openGaSetupModal(onDone) {
  const g = tf2("ga");
  openModal({
    title: g.title,
    width: 460,
    bodyHtml: `<div class="a2f-ga">
      <p class="modal-confirm-text">${g.step1}</p>
      <div class="a2f-qr-wrap">${admin2faQrSvg(admin2fa.secret)}</div>
      <div class="a2f-secret"><span class="table-cell-muted">${g.orKey}</span><div class="a2f-secret-row"><code>${admin2fa.secret}</code>${copyIconButton(admin2fa.secret)}</div></div>
      <p class="modal-confirm-text">${g.step2}</p>
      ${otpCellsHtml("a2f-ga-code")}
      <div class="form-error" id="a2f-ga-err" hidden></div>
    </div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="a2f-ga-cancel">${tf2("verify.cancel")}</button><button type="button" class="btn-primary" id="a2f-ga-ok" disabled>${g.confirm}</button>`,
    onMount: (el) => {
      const ok = el.querySelector("#a2f-ga-ok");
      const err = el.querySelector("#a2f-ga-err");
      const otp = bindOtpCells(el, () => { err.hidden = true; ok.disabled = otp.value().length < 6; }, () => { if (!ok.disabled) ok.click(); });
      el.querySelector("#a2f-ga-cancel").addEventListener("click", closeModal);
      el.querySelectorAll(".copy-icon-btn").forEach((b) => b.addEventListener("click", () => copyTextToClipboard(b.dataset.copyValue).then(() => flashCopied(b))));
      ok.addEventListener("click", () => {
        if (otp.value() !== ADMIN_2FA_DEMO_CODE) { err.textContent = tf2("verify.wrong")(2); err.hidden = false; otp.clear(); ok.disabled = true; return; }
        admin2fa.methods.OTP.enabled = true;
        closeModal();
        showToast(tf2("profile.connectedToast"));
        if (onDone) onDone();
      });
    },
  });
}

// ---- Резервный код (getRecoveryCode / disableAll2FA) ---------------------------------------------------------------------
// 20 случайных байт → base32 (32 символа), как в auth-backend; в прототипе — детерминированно от текущего времени.
function admin2faGenRecoveryCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let x = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  let out = "";
  for (let i = 0; i < 32; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out += alphabet[x % alphabet.length];
  }
  return out;
}

// Получить код: подтверждается текущим способом (как обычное чувствительное действие), затем показывается один раз.
function openRecoveryGetModal(onDone) {
  const r = tf2("recovery");
  openAdmin2faModal({
    title: r.getTitle,
    intro: tf2("profile.confirmIntro"),
    remember: false,
    onSuccess: () => {
      const code = admin2faGenRecoveryCode();
      admin2fa.recoveryCode = code;
      admin2fa.recoveryCodeObtainedAt = Date.now();
      showToast(r.gotToast);
      openModal({
        title: r.getTitle,
        width: 520,
        bodyHtml: `<p class="modal-confirm-text">${r.getIntro}</p><div class="pn-secret"><span class="vb-mono" id="a2f-recovery-value">${pdEscape(code)}</span></div><p class="table-cell-muted">${r.getHint}</p>`,
        footerHtml: `<button type="button" class="btn-secondary" id="a2f-recovery-copy">${r.copy}</button><button type="button" class="btn-primary" id="a2f-recovery-done">${r.done}</button>`,
        closeOnOverlay: false,
        onMount: (el) => {
          el.querySelector("#a2f-recovery-copy").addEventListener("click", () => copyTextToClipboard(code).then(() => showToast(r.copied)));
          el.querySelector("#a2f-recovery-done").addEventListener("click", () => { closeModal(); if (onDone) onDone(); });
        },
      });
    },
  });
}

// Использовать код: вводится сам резервный код (не код из способа подтверждения) — по успеху отключаются разом все
// отключаемые способы (E-mail — базовый, не отключается и в реальной системе не входит в этот сброс), код стирается.
function openRecoveryUseModal(onDone) {
  const r = tf2("recovery");
  openModal({
    title: r.useTitle,
    width: 440,
    bodyHtml: `<p class="modal-confirm-text">${r.useIntro}</p>
      <label class="filters-field vb-field"><span class="filters-field-label">${r.codeLabel}</span><input class="address-form-input" id="a2f-recovery-input" autocomplete="off" /></label>
      <div class="form-error" id="a2f-recovery-err" hidden></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="a2f-recovery-cancel">${r.cancel}</button><button type="button" class="btn-danger" id="a2f-recovery-ok">${r.confirm}</button>`,
    onMount: (el) => {
      const input = el.querySelector("#a2f-recovery-input");
      const err = el.querySelector("#a2f-recovery-err");
      input.focus();
      el.querySelector("#a2f-recovery-cancel").addEventListener("click", closeModal);
      el.querySelector("#a2f-recovery-ok").addEventListener("click", () => {
        const val = input.value.trim().toUpperCase();
        if (!val) { err.textContent = r.errCode; err.hidden = false; return; }
        if (val !== admin2fa.recoveryCode) { err.textContent = r.errWrong; err.hidden = false; return; }
        admin2fa.methods.OTP.enabled = false;
        admin2fa.recoveryCode = null;
        admin2fa.recoveryCodeObtainedAt = null;
        closeModal();
        showToast(r.usedToast);
        if (onDone) onDone();
      });
    },
  });
}






