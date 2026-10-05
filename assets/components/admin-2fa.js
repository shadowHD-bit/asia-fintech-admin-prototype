/* ==========================================================================
   2FA администратора: способы подтверждения (профиль), политика "для каких действий нужен код" (Управление 2FA),
   доверенные окна по модулям, коды восстановления и смена устройства (rebind).

   Обновлено 05.10.2026 по справочнику "2FA в админ-панели" (сервисы 2fa/acl/gateway/auth-backend). Адаптация под
   прототип (осознанные упрощения):
   - "Область" (scope) из справочника — это МОДУЛЬ из "Управление 2FA" (twofa-policy.js, ADMIN_2FA_MODULES):
     в прототипе модули и так группируют действия и настраиваются отдельно, отдельного реестра не завели.
   - Доверенное окно (stepUpWindow) — одно на модуль, скользяще продлевается, живёт не дольше
     ADMIN_2FA_WINDOW_MAX_LIFETIME_MS с первого ввода кода. Открывается только действиями (requireAdmin2fa),
     вход в админку — отдельный, не связанный с окнами, сценарий (как и в справочнике).
   - Коды восстановления — набор из 10, принимаются везде, где принимается код способа подтверждения (вход,
     действие, отключение способа) — не отдельный "сбросить всё", как было до этого обновления.
   - EMAIL как базовый способ оставлен (хотя справочник описывает только TOTP + коды восстановления для
     админки) — осознанное решение не менять, см. feedback_* в памяти проекта.
   - Смена устройства (rebind) — свой мастер в 2 шага, 2FA не отключается ни на одном.
   ГРАНИЦЫ ПРОТОТИПА: мутаций подключения/отключения способов, админского реестра действий и самого сервиса 2fa в
   схеме нет — экран моделирует их, состояние живёт в памяти вкладки. Код подтверждения в прототипе — 000000.
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
// Доверенные окна (адаптация stepUpWindow из 2fa-справочника) — одно окно на МОДУЛЬ (ближайший в прототипе аналог
// "области"/scope из документа: модули и так настраиваются отдельно в "Управление 2FA" и перекрывают целые группы
// действий). Открывается после успешного подтверждения любого действия модуля, скользяще продлевается каждым
// следующим успешным действием того же модуля на policy.rememberMinutes, не дальше жёсткого потолка от момента
// первого ввода кода (ADMIN_2FA_WINDOW_MAX_LIFETIME_MS, как ADMIN_TFA_WINDOW_MAX_LIFETIME_SEC на бэкенде).
const ADMIN_2FA_WINDOW_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000;
// Алфавит кодов восстановления — без I/L/O/U (легко спутать с 1/0), как в справочнике.
const ADMIN_2FA_RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";
const ADMIN_2FA_RECOVERY_LOW_THRESHOLD = 2;

const admin2fa = {
  secret: "JBSWY3DPEHPK3PXP",
  // E-mail — базовый способ: код приходит на почту администратора, отключить его нельзя
  methods: { OTP: { enabled: false }, EMAIL: { enabled: true } },
  // Коды восстановления — набор из 10, выдаётся при подключении OTP и при каждой перегенерации, показывается один раз.
  // Принимаются везде, где принимается TOTP (вход, подтверждение любого действия, отключение 2FA) — не отдельный
  // инструмент "сбросить всё", а полноценная альтернатива коду приложения на случай утери устройства.
  recoveryCodes: [], // [{ code, usedAt }]
  recoveryCodesGeneratedAt: null,
  // Доверенные окна по модулям: module -> { confirmedAt, expiresAt, method }
  stepUpWindows: {},
  policy: {
    actions: {}, // key -> true/false; заполняется по умолчанию ниже
    rememberMinutes: 5, // срок скользящего окна подтверждения на модуль
    // Вход в админку — отдельно от действий: требовать ли код при входе и сколько дней помнить устройство
    login: { required: true, rememberDays: 30 },
  },
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

function admin2faModuleOf(actionKey) {
  const a = ADMIN_2FA_ACTIONS.find((x) => x.key === actionKey);
  return a ? a.module : null;
}

// ---- Коды восстановления: набор из 10, принимаются везде, где принимается TOTP --------------------------------------
function admin2faGenRecoveryCode() {
  let x = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const part = () => {
    let out = "";
    for (let i = 0; i < 5; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      out += ADMIN_2FA_RECOVERY_ALPHABET[x % ADMIN_2FA_RECOVERY_ALPHABET.length];
    }
    return out;
  };
  return `${part()}-${part()}`;
}

function admin2faGenRecoveryCodes(n) {
  return Array.from({ length: n || 10 }, () => ({ code: admin2faGenRecoveryCode(), usedAt: null }));
}

function admin2faRecoveryCodesLeft() {
  return admin2fa.recoveryCodes.filter((c) => !c.usedAt).length;
}

function admin2faRecoveryLow() {
  return admin2fa.recoveryCodes.length > 0 && admin2faRecoveryCodesLeft() <= ADMIN_2FA_RECOVERY_LOW_THRESHOLD;
}

// Нормализует и тратит код восстановления; возвращает true при успехе (код существовал и не был использован).
function admin2faConsumeRecoveryCode(value) {
  const norm = value.trim().toUpperCase().replace(/^([A-Z0-9]{5})-?([A-Z0-9]{5})$/, "$1-$2");
  const hit = admin2fa.recoveryCodes.find((c) => !c.usedAt && c.code === norm);
  if (!hit) return false;
  hit.usedAt = Date.now();
  return true;
}

// ---- Доверенные окна по модулям ---------------------------------------------------------------------------------------
function admin2faWindowOpen(module) {
  const w = admin2fa.stepUpWindows[module];
  if (!w) return false;
  const now = Date.now();
  return now < w.expiresAt && now - w.confirmedAt < ADMIN_2FA_WINDOW_MAX_LIFETIME_MS;
}

// Открывает/продлевает окно модуля: confirmedAt не меняется при продлении (пока не упёрлись в потолок), expiresAt — скользит.
function admin2faOpenWindow(module, method) {
  const now = Date.now();
  const existing = admin2fa.stepUpWindows[module];
  const stillFresh = existing && now - existing.confirmedAt < ADMIN_2FA_WINDOW_MAX_LIFETIME_MS;
  const confirmedAt = stillFresh ? existing.confirmedAt : now;
  const ttlMs = Math.max(admin2fa.policy.rememberMinutes, 1) * 60 * 1000;
  const expiresAt = Math.min(now + ttlMs, confirmedAt + ADMIN_2FA_WINDOW_MAX_LIFETIME_MS);
  admin2fa.stepUpWindows[module] = { confirmedAt, expiresAt, method };
}

function admin2faCloseWindow(module) {
  if (!admin2fa.stepUpWindows[module]) return false;
  delete admin2fa.stepUpWindows[module];
  return true;
}

function admin2faCloseAllWindows() {
  const n = Object.keys(admin2fa.stepUpWindows).length;
  admin2fa.stepUpWindows = {};
  return n;
}

function admin2faOpenWindowsList() {
  const now = Date.now();
  return Object.keys(admin2fa.stepUpWindows)
    .map((module) => ({ module, ...admin2fa.stepUpWindows[module] }))
    .filter((w) => now < w.expiresAt && now - w.confirmedAt < ADMIN_2FA_WINDOW_MAX_LIFETIME_MS);
}

// Выполнить действие; если для него включена 2FA (по флагам или вручную) и окно модуля не открыто — сначала окно
// запроса кода. Если открыто — продлеваем его тем же методом и выполняем действие сразу, без повторного кода.
function requireAdmin2fa(actionKey, run) {
  if (!admin2faRequired(actionKey)) return run();
  const module = admin2faModuleOf(actionKey);
  if (module && admin2faWindowOpen(module)) {
    admin2faOpenWindow(module, admin2fa.stepUpWindows[module].method);
    return run();
  }
  openAdmin2faModal({
    title: tf2("verify.title"),
    intro: tf2("verify.intro")(admin2faActionLabel(actionKey)),
    onSuccess: (method) => {
      if (module) admin2faOpenWindow(module, method);
      run();
    },
  });
}

// ---- Окно запроса кода ---------------------------------------------------------------------------------------------------
// opts: { title, intro, onSuccess(method), allowRecovery (по умолчанию true) }
// Код восстановления — равноправная альтернатива коду способа подтверждения (не выделяется отдельной "аварийной"
// модалкой): переключатель внизу формы меняет шестиячейковый ввод TOTP/EMAIL-кода на одно поле формата XXXXX-XXXXX.
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
  const canRecovery = opts.allowRecovery !== false && admin2faRecoveryCodesLeft() > 0;
  // Без выбора способа: всегда используем подключённый (OTP приоритетнее EMAIL, если подключены оба — не просим
  // администратора каждый раз решать, каким способом подтверждать, раз способ и так либо один, либо очевиден).
  const st = { method: methods.includes("OTP") ? "OTP" : methods[0], attempts: 3, sentAt: Date.now(), timer: null, useRecovery: false };
  const needsSend = () => st.method === "EMAIL";
  const hint = () => v.hint[st.method];
  const bodyHtml = () => `
    ${opts.intro ? `<p class="modal-confirm-text">${opts.intro}</p>` : ""}
    ${st.useRecovery
      ? `<label class="filters-field vb-field"><span class="filters-field-label">${v.recoveryCodeLabel}</span><input class="address-form-input" id="a2f-recovery-input" autocomplete="off" placeholder="${v.recoveryPlaceholder}" /></label>`
      : `<div class="filters-field vb-field"><span class="filters-field-label">${v.codeLabel}</span>
      <div class="login-otp" id="a2f-code">${[0, 1, 2, 3, 4, 5].map((i) => `<input class="address-form-input login-otp-cell" inputmode="numeric" maxlength="1" autocomplete="${i ? "off" : "one-time-code"}" data-otp="${i}" />`).join("")}</div></div>
    ${needsSend() ? "" : `<div class="table-cell-muted a2f-hint">${hint()}</div>`}
    ${needsSend() ? `<div class="a2f-resend table-cell-muted"><span id="a2f-resend-text"></span><button type="button" class="table-link a2f-send" id="a2f-send" hidden>${v.resendNow}</button></div>` : ""}`
    }
    ${canRecovery ? `<button type="button" class="table-link a2f-recovery-toggle" id="a2f-recovery-toggle">${st.useRecovery ? v.backToCode : v.useRecovery}</button>` : ""}
    <div class="form-error" id="a2f-err" hidden></div>`;
  openModal({
    title: opts.title || v.title,
    width: 440,
    bodyHtml: bodyHtml(),
    footerHtml: `<button type="button" class="btn-secondary" id="a2f-cancel">${v.cancel}</button><button type="button" class="btn-primary" id="a2f-ok" disabled>${v.confirm}</button>`,
    onMount: (el) => {
      const bind = () => {
        const ok = el.querySelector("#a2f-ok");
        const err = el.querySelector("#a2f-err");
        const toggle = el.querySelector("#a2f-recovery-toggle");
        if (toggle) toggle.addEventListener("click", () => { st.useRecovery = !st.useRecovery; el.querySelector(".modal-body").innerHTML = bodyHtml(); bind(); });

        const fail = () => {
          st.attempts -= 1;
          if (st.attempts <= 0) { closeModal(); showToast(v.locked); return; }
          err.textContent = st.useRecovery ? v.errRecoveryWrong(st.attempts) : v.wrong(st.attempts);
          err.hidden = false;
        };
        const succeed = (method) => {
          closeModal();
          if (opts.onSuccess) opts.onSuccess(method);
        };

        if (st.useRecovery) {
          const input = el.querySelector("#a2f-recovery-input");
          input.focus();
          ok.disabled = !input.value.trim();
          input.addEventListener("input", () => { err.hidden = true; ok.disabled = !input.value.trim(); });
          ok.addEventListener("click", () => {
            if (admin2faConsumeRecoveryCode(input.value)) { succeed("RECOVERY_CODE"); return; }
            fail();
            input.value = "";
            input.focus();
            ok.disabled = true;
          });
          return;
        }

        const cells = [...el.querySelectorAll(".login-otp-cell")];
        const codeVal = () => cells.map((x) => x.value).join("");
        cells[0].focus();
        const upd = () => { err.hidden = true; ok.disabled = codeVal().length < 6; };
        ok.disabled = codeVal().length < 6;
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
        });
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
          if (codeVal() === ADMIN_2FA_DEMO_CODE) { succeed("TOTP"); return; }
          fail();
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
        admin2fa.recoveryCodes = admin2faGenRecoveryCodes();
        admin2fa.recoveryCodesGeneratedAt = Date.now();
        closeModal();
        showToast(tf2("profile.connectedToast"));
        openRecoveryShowModal(admin2fa.recoveryCodes, onDone);
      });
    },
  });
}

// ---- Коды восстановления: показ набора (выдача/перегенерация) --------------------------------------------------------
// Набор уже сгенерирован в admin2fa.recoveryCodes к моменту вызова — эта модалка только показывает его один раз.
function openRecoveryShowModal(codes, onDone) {
  const r = tf2("recovery");
  openModal({
    title: r.showTitle,
    width: 480,
    bodyHtml: `<p class="modal-confirm-text">${r.showIntro}</p>
      <div class="a2f-codes">${codes.map((c) => `<code>${c.code}</code>`).join("")}</div>
      <p class="table-cell-muted">${r.showHint}</p>`,
    footerHtml: `<button type="button" class="btn-secondary" id="a2f-recovery-copy">${r.copy}</button><button type="button" class="btn-primary" id="a2f-recovery-done">${r.done}</button>`,
    closeOnOverlay: false,
    onMount: (el) => {
      el.querySelector("#a2f-recovery-copy").addEventListener("click", () => copyTextToClipboard(codes.map((c) => c.code).join("\n")).then(() => showToast(r.copied)));
      el.querySelector("#a2f-recovery-done").addEventListener("click", () => { closeModal(); if (onDone) onDone(); });
    },
  });
}

// Перевыпуск: подтверждается текущим способом (TOTP или ещё не истраченный код восстановления), старый набор
// аннулируется целиком (включая неиспользованные коды), новый не пересекается со старым.
function openRecoveryRegenerateModal(onDone) {
  const r = tf2("recovery");
  openAdmin2faModal({
    title: r.regenerateTitle,
    intro: admin2fa.recoveryCodes.length ? r.regenerateIntro : tf2("profile.confirmIntro"),
    onSuccess: () => {
      admin2fa.recoveryCodes = admin2faGenRecoveryCodes();
      admin2fa.recoveryCodesGeneratedAt = Date.now();
      showToast(r.regeneratedToast);
      openRecoveryShowModal(admin2fa.recoveryCodes, onDone);
    },
  });
}

// ---- Смена устройства (rebind) -----------------------------------------------------------------------------------------
// Один мастер, 2FA не отключается ни на одном шаге: шаг 1 подтверждает ВЛАДЕНИЕ текущим устройством (TOTP или код
// восстановления — равноправно, как и везде), шаг 2 подключает новое устройство его собственным кодом. Коды
// восстановления и открытые доверенные окна сохраняются. Если закрыть мастер на любом шаге — действует прежнее
// устройство, новый секрет просто отбрасывается (в реальной системе — истекает вместе с operationId за 10 минут).
function openRebindModal(onDone) {
  const rb = tf2("rebind");
  openAdmin2faModal({
    title: rb.step1Title,
    intro: rb.step1Intro,
    onSuccess: () => openRebindStep2(onDone),
  });
}

function openRebindStep2(onDone) {
  const rb = tf2("rebind");
  const newSecret = admin2faGenRecoveryCode().replace(/-/g, ""); // не формат recovery-кода, просто короткий случайный секрет для демо-QR
  openModal({
    title: rb.step2Title,
    width: 460,
    bodyHtml: `<div class="a2f-ga">
      <p class="modal-confirm-text">${rb.step2Intro}</p>
      <div class="a2f-qr-wrap">${admin2faQrSvg(newSecret)}</div>
      <div class="a2f-secret"><span class="table-cell-muted">${tf2("ga.orKey")}</span><div class="a2f-secret-row"><code>${newSecret}</code>${copyIconButton(newSecret)}</div></div>
      <p class="modal-confirm-text">${rb.step2Code}</p>
      ${otpCellsHtml("a2f-rebind-code")}
      <div class="form-error" id="a2f-rebind-err" hidden></div>
      <p class="table-cell-muted">${rb.cancelNote}</p>
    </div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="a2f-rebind-cancel">${tf2("verify.cancel")}</button><button type="button" class="btn-primary" id="a2f-rebind-ok" disabled>${rb.confirm}</button>`,
    onMount: (el) => {
      const ok = el.querySelector("#a2f-rebind-ok");
      const err = el.querySelector("#a2f-rebind-err");
      const otp = bindOtpCells(el, () => { err.hidden = true; ok.disabled = otp.value().length < 6; }, () => { if (!ok.disabled) ok.click(); });
      el.querySelector("#a2f-rebind-cancel").addEventListener("click", closeModal);
      el.querySelectorAll(".copy-icon-btn").forEach((b) => b.addEventListener("click", () => copyTextToClipboard(b.dataset.copyValue).then(() => flashCopied(b))));
      ok.addEventListener("click", () => {
        if (otp.value() !== ADMIN_2FA_DEMO_CODE) { err.textContent = tf2("verify.wrong")(2); err.hidden = false; otp.clear(); ok.disabled = true; return; }
        admin2fa.secret = newSecret;
        closeModal();
        showToast(rb.doneToast);
        if (onDone) onDone();
      });
    },
  });
}


