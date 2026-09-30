/* ==========================================================================
   Вход в бэк-офис: логотип, форма "почта + пароль", ниже "Забыли пароль?" и восстановление пароля.
   Бэкенд (auth-backend): signIn проверяет учётные данные и возвращает включённые типы кода (TFAType), sendTFACode
   отправляет код, восстановление — startPasswordRecovery → confirmPasswordRecovery с кодом подтверждения. Экран
   моделирует этот сценарий: учётные данные проверяются по профилю текущего администратора, код — 000000.
   Полноэкранный режим: на маршруте "login" скрыты боковое меню и верхняя панель (body.is-auth).
   ========================================================================== */

const loginState = { step: "login", email: "", error: "", showPassword: false };

function lg(path) {
  return t(`login.${path}`);
}

function loginBrandHtml() {
  return `<div class="login-brand">
    <img class="login-brand-mark" src="assets/images/logo-icon.svg" alt="Asia Fintech" />
    <div class="login-brand-title"><span class="brand-word">Asia</span> <span class="brand-word-accent">Fintech</span></div>
    <div class="login-brand-sub">${lg("brandSub")}</div>
  </div>`;
}

const EYE_ON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10s2.8-5.5 8-5.5S18 10 18 10s-2.8 5.5-8 5.5S2 10 2 10Z"/><circle cx="10" cy="10" r="2.2"/></svg>`;

function loginField(id, label, type, value, extra = "") {
  return `<label class="login-field"><span class="login-label">${label}</span><input class="address-form-input login-input" id="${id}" type="${type}" value="${escapeAttr(value)}" ${extra} /></label>`;
}

function loginPasswordField(id, label, value) {
  return `<label class="login-field"><span class="login-label">${label}</span>
    <span class="login-pass"><input class="address-form-input login-input" id="${id}" type="${loginState.showPassword ? "text" : "password"}" value="${escapeAttr(value)}" autocomplete="current-password" />
    <button type="button" class="login-eye" data-login-eye title="${lg("showPassword")}">${EYE_ON}</button></span></label>`;
}

// Заглушка hCaptcha (в схеме — hCaptchaToken в PasswordRecoveryInput); настоящая проверка не выполняется
function loginCaptchaHtml() {
  return `<div class="login-captcha" id="login-captcha"><button type="button" class="login-captcha-box" id="login-captcha-box" role="checkbox" aria-checked="false"></button><span class="login-captcha-label">${lg("recovery.captcha")}</span><span class="login-captcha-brand">hCaptcha<br /><small>${lg("recovery.captchaStub")}</small></span></div>`;
}

function loginErrorHtml() {
  return `<div class="form-error login-error" id="login-error"${loginState.error ? "" : " hidden"}>${loginState.error}</div>`;
}

// Кнопка "назад" — иконка в левом верхнем углу карточки
function loginBackHtml(to) {
  return `<button type="button" class="login-back" data-login-go="${to}" title="${lg("back")}" aria-label="${lg("back")}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 4.5 6.5 10l6 5.5"/></svg></button>`;
}

function loginStepHtml() {
  const s = loginState;
  if (s.step === "login") {
    return `<h1 class="login-title">${lg("title")}</h1>
      <p class="login-sub">${lg("subtitle")}</p>
      <form class="login-form" id="login-form" novalidate>
        ${loginField("login-email", lg("email"), "email", s.email || CURRENT_ADMIN.email, 'autocomplete="username" placeholder="name@company.com"')}
        ${loginPasswordField("login-password", lg("password"), "")}
        ${loginErrorHtml()}
        <button type="submit" class="btn-primary login-submit">${lg("submit")}</button>
      </form>
      <button type="button" class="table-link login-forgot" data-login-go="recovery-email">${lg("forgot")}</button>`;
  }
  if (s.step === "recovery-email") {
    return `${loginBackHtml("login")}<h1 class="login-title">${lg("recovery.title")}</h1>
      <p class="login-sub">${lg("recovery.emailIntro")}</p>
      <form class="login-form" id="login-form" novalidate>
        ${loginField("login-email", lg("email"), "email", s.email || CURRENT_ADMIN.email, 'autocomplete="username"')}
        ${loginErrorHtml()}
        <button type="submit" class="btn-primary login-submit">${lg("recovery.send")}</button>
      </form>`;
  }
  if (s.step === "recovery-code") {
    return `${loginBackHtml("recovery-email")}<h1 class="login-title">${lg("recovery.title")}</h1>
      <p class="login-sub">${lg("recovery.codeIntro")(pdEscape(s.email))}</p>
      <form class="login-form" id="login-form" novalidate>
        <div class="login-field"><span class="login-label">${lg("recovery.code")}</span><div class="login-otp" id="login-otp">${[0, 1, 2, 3, 4, 5].map((i) => `<input class="address-form-input login-otp-cell" inputmode="numeric" maxlength="1" autocomplete="${i ? "off" : "one-time-code"}" data-otp="${i}" />`).join("")}</div></div>
        <div class="login-resend table-cell-muted"><span id="login-resend-text"></span><button type="button" class="table-link" id="login-resend" hidden>${lg("recovery.resend")}</button></div>
        ${loginErrorHtml()}
        <button type="submit" class="btn-primary login-submit">${lg("recovery.next")}</button>
      </form>`;
  }
  if (s.step === "recovery-password") {
    return `${loginBackHtml("recovery-code")}<h1 class="login-title">${lg("recovery.newTitle")}</h1>
      <p class="login-sub">${lg("recovery.newIntro")}</p>
      <form class="login-form" id="login-form" novalidate>
        ${loginPasswordField("login-new", lg("recovery.newPassword"), "")}
        ${loginField("login-new2", lg("recovery.repeatPassword"), "password", "", 'autocomplete="new-password"')}
        ${loginRulesHtml()}
        ${loginCaptchaHtml()}
        ${loginErrorHtml()}
        <button type="submit" class="btn-primary login-submit">${lg("recovery.save")}</button>
      </form>`;
  }  return `<div class="login-done-icon">${ICONS.lock}</div>
    <h1 class="login-title">${lg("recovery.doneTitle")}</h1>
    <p class="login-sub">${lg("recovery.doneText")}</p>
    <button type="button" class="btn-primary login-submit" data-login-go="login">${lg("recovery.toLogin")}</button>`;
}

function viewLogin() {
  loginState.step = "login";
  loginState.error = "";
  return `<div class="login-page"><div class="login-card">${loginBrandHtml()}<div id="login-body">${loginStepHtml()}</div></div></div>`;
}

function loginRenderBody() {
  const body = document.getElementById("login-body");
  if (!body) return;
  body.innerHTML = loginStepHtml();
  loginBind();
}

// Правило из auth-backend (PasswordRecoveryInput): 8–64 символа, заглавная, строчная, цифра и спецсимвол
const loginPasswordValid = (p) => /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!"#$%&'()*+,./;<=>?@[\\\]^`{|}~-])[a-zA-Z0-9!"#$%&'()*+,./;<=>?@[\\\]^`{|}~-]{8,64}$/.test(p);
const LOGIN_PW_RULES = {
  len: (p) => p.length >= 8 && p.length <= 64,
  upper: (p) => /[A-Z]/.test(p),
  lower: (p) => /[a-z]/.test(p),
  digit: (p) => /\d/.test(p),
  special: (p) => /[!"#$%&'()*+,./;<=>?@[\\\]^`{|}~-]/.test(p),
};

// Список требований к паролю: пункты отмечаются по мере ввода
function loginRulesHtml() {
  const r = lg("recovery.ruleItems");
  return `<ul class="pw-rules">${Object.keys(LOGIN_PW_RULES).map((k) => `<li data-pw-rule="${k}"><span class="pw-rule-mark"></span>${r[k]}</li>`).join("")}</ul>`;
}

function loginBindRules(root, input) {
  if (!input) return;
  const upd = () => root.querySelectorAll("[data-pw-rule]").forEach((li) => li.classList.toggle("is-ok", LOGIN_PW_RULES[li.dataset.pwRule](input.value)));
  input.addEventListener("input", upd);
  upd();
}

const loginValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function loginBind() {
  const s = loginState;
  const fail = (msg) => { s.error = msg; const el = document.getElementById("login-error"); if (el) { el.textContent = msg; el.hidden = false; } };
  document.querySelectorAll("[data-login-go]").forEach((b) => b.addEventListener("click", () => { s.step = b.dataset.loginGo; s.error = ""; loginRenderBody(); }));
  document.querySelectorAll("[data-login-eye]").forEach((b) =>
    b.addEventListener("click", () => {
      s.showPassword = !s.showPassword;
      document.querySelectorAll(".login-pass input").forEach((i) => { i.type = s.showPassword ? "text" : "password"; });
    })
  );
  loginBindOtp();
  loginBindCaptcha();
  loginBindRules(document, document.getElementById("login-new"));
  const form = document.getElementById("login-form");
  if (!form) return;
  const first = form.querySelector("input:not(.login-otp-cell)");
  if (first) first.focus();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (s.step === "login") {
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;
      s.email = email;
      if (!loginValidEmail(email)) return fail(lg("errEmail"));
      if (!password) return fail(lg("errPassword"));
      // Учётные данные — по профилю текущего администратора (в прототипе пароль любой непустой)
      if (email.toLowerCase() !== CURRENT_ADMIN.email.toLowerCase()) return fail(lg("errCredentials"));
      const goHome = () => { window.location.hash = `#/${DEFAULT_ROUTE}`; };
      // Код при входе — по политике "Управление 2FA → Вход в админку"
      if (admin2fa.policy.login.required) openAdmin2faModal({ title: lg("confirmTitle"), intro: lg("confirmIntro"), remember: false, onSuccess: goHome });
      else goHome();
    } else if (s.step === "recovery-email") {
      const email = document.getElementById("login-email").value.trim();
      s.email = email;
      if (!loginValidEmail(email)) return fail(lg("errEmail"));
      // Как в бэкенде (startPasswordRecovery): для неизвестной почты — ошибка "пользователь не найден"
      if (email.toLowerCase() !== CURRENT_ADMIN.email.toLowerCase()) return fail(lg("recovery.errNotFound"));
      s.step = "recovery-code";
      s.error = "";
      loginRenderBody();
      showToast(lg("recovery.sentToast"));
    } else if (s.step === "recovery-code") {
      const code = [...document.querySelectorAll(".login-otp-cell")].map((i) => i.value).join("");
      if (code !== ADMIN_2FA_DEMO_CODE) return fail(lg("recovery.errCode"));
      s.step = "recovery-password";
      s.error = "";
      loginRenderBody();
    } else if (s.step === "recovery-password") {
      const p1 = document.getElementById("login-new").value;
      const p2 = document.getElementById("login-new2").value;
      if (!loginPasswordValid(p1)) return fail(lg("recovery.errRules"));
      if (p1 !== p2) return fail(lg("recovery.errMatch"));
      if (!document.getElementById("login-captcha-box").classList.contains("is-done")) return fail(lg("recovery.errCaptcha"));
      s.step = "recovery-done";
      s.error = "";
      loginRenderBody();
    }  });
}

function loginBindCaptcha() {
  const box = document.getElementById("login-captcha-box");
  if (!box) return;
  box.addEventListener("click", () => {
    if (box.dataset.state) return;
    box.dataset.state = "loading";
    box.classList.add("is-loading");
    setTimeout(() => { box.classList.remove("is-loading"); box.classList.add("is-done"); box.dataset.state = "done"; box.setAttribute("aria-checked", "true"); }, 900);
  });
}

function loginBindOtp() {
  const cells = [...document.querySelectorAll(".login-otp-cell")];
  if (!cells.length) return;
  cells.forEach((c, i) => {
    c.addEventListener("input", () => {
      c.value = c.value.replace(/\D/g, "").slice(-1);
      if (c.value && cells[i + 1]) cells[i + 1].focus();
    });
    c.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !c.value && cells[i - 1]) { cells[i - 1].focus(); cells[i - 1].value = ""; }
      else if (e.key === "ArrowLeft" && cells[i - 1]) cells[i - 1].focus();
      else if (e.key === "ArrowRight" && cells[i + 1]) cells[i + 1].focus();
    });
    c.addEventListener("paste", (e) => {
      const d = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (!d) return;
      e.preventDefault();
      d.split("").forEach((ch, k) => { cells[k].value = ch; });
      cells[Math.min(d.length, 5)].focus();
    });
  });
  cells[0].focus();
  // повторная отправка кода — доступна через минуту
  let left = 60;
  const text = document.getElementById("login-resend-text");
  const btn = document.getElementById("login-resend");
  const tick = () => {
    if (!document.getElementById("login-resend-text")) return clearInterval(timer);
    if (left > 0) { text.textContent = lg("recovery.resendIn")(left); btn.hidden = true; left -= 1; }
    else { text.textContent = ""; btn.hidden = false; clearInterval(timer); }
  };
  const timer = setInterval(tick, 1000);
  tick();
  btn.addEventListener("click", () => { showToast(lg("recovery.sentToast")); left = 60; btn.hidden = true; const t2 = setInterval(() => { if (!document.getElementById("login-resend-text")) return clearInterval(t2); if (left > 0) { text.textContent = lg("recovery.resendIn")(left); left -= 1; } else { text.textContent = ""; btn.hidden = false; clearInterval(t2); } }, 1000); });
}

// Фон: сетка точек с медленной волной
let loginBgRaf = 0;
function loginStartBg() {
  const page = document.querySelector(".login-page");
  if (!page) return;
  const cv = document.createElement("canvas");
  cv.className = "login-bg";
  page.prepend(cv);
  const ctx = cv.getContext("2d");
  const gap = 16;
  const fit = () => { cv.width = page.clientWidth; cv.height = page.clientHeight; };
  fit();
  window.addEventListener("resize", fit);
  const draw = (ms) => {
    if (!document.body.contains(cv)) { window.removeEventListener("resize", fit); return; }
    const w = cv.width, h = cv.height, tm = ms / 1000;
    ctx.clearRect(0, 0, w, h);
    // точки в шестиугольной решётке; видны только внутри шестиугольника вокруг формы
    const card = page.querySelector(".login-card");
    const cx = w / 2, cy = h / 2;
    const R = Math.min(Math.max(card ? card.offsetHeight : 500, 500) * 1.3, Math.min(w, h) * 0.85 + 120);
    const rowH = gap * 0.866;
    for (let row = 0, y = cy - R; y <= cy + R; row++, y += rowH) {
      for (let x = cx - R - gap + (row % 2 ? gap / 2 : 0); x <= cx + R + gap; x += gap) {
        const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        const d = Math.max(dx / (R * 0.866), (dy + dx / 1.732) / R);
        if (d >= 1) continue;
        const v = (Math.sin(x * 0.02 + tm * 0.9) + Math.sin(y * 0.025 - tm * 0.7) + Math.sin((x + y) * 0.012 + tm * 0.5)) / 3;
        const k = (v + 1) / 2;
        const edge = 1 - Math.pow(d, 3);
        ctx.fillStyle = `rgba(31,95,209,${(0.06 + k * 0.24) * edge})`;
        ctx.beginPath();
        ctx.arc(x, y, (0.7 + k * 1.0) * (0.6 + 0.4 * edge), 0, 6.283);
        ctx.fill();
      }
    }
    loginBgRaf = requestAnimationFrame(draw);
  };
  cancelAnimationFrame(loginBgRaf);
  loginBgRaf = requestAnimationFrame(draw);
}

function initLogin() {
  loginBind();
  loginStartBg();
}

// ---- Принятие приглашения администратора (#/accept-invite/:adminId) -----------------------------------------
// Демо-аналог реального signUp/registerIdentity (auth-backend): код из письма, затем новый пароль — с капчей,
// как и требует UserInput.captcha/SendCodeInput.captcha при регистрации. Реального письма нет: демо-ссылку на
// этот экран можно скопировать на карточке администратора (Настройки → Доступ → Администраторы), пока он ещё
// не принял приглашение (status INVITED, hasIdentity: false).
const inviteState = { step: "code", error: "", showPassword: false };

function currentAcceptInviteId() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^accept-invite\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function ivErrorHtml() {
  return `<div class="form-error login-error" id="invite-error"${inviteState.error ? "" : " hidden"}>${inviteState.error}</div>`;
}

function ivPasswordField(id, label, value) {
  return `<label class="login-field"><span class="login-label">${label}</span>
    <span class="login-pass"><input class="address-form-input login-input" id="${id}" type="${inviteState.showPassword ? "text" : "password"}" value="${escapeAttr(value)}" autocomplete="new-password" />
    <button type="button" class="login-eye" data-login-eye title="${lg("showPassword")}">${EYE_ON}</button></span></label>`;
}

function ivStepHtml(admin) {
  const iv = lg("invite");
  if (inviteState.step === "code") {
    return `<h1 class="login-title">${iv.title}</h1>
      <p class="login-sub">${iv.codeIntro(pdEscape(admin.email))}</p>
      <form class="login-form" id="invite-form" novalidate>
        <div class="login-field"><span class="login-label">${lg("recovery.code")}</span><div class="login-otp" id="login-otp">${[0, 1, 2, 3, 4, 5].map((i) => `<input class="address-form-input login-otp-cell" inputmode="numeric" maxlength="1" autocomplete="${i ? "off" : "one-time-code"}" data-otp="${i}" />`).join("")}</div></div>
        <div class="login-resend table-cell-muted"><span id="login-resend-text"></span><button type="button" class="table-link" id="login-resend" hidden>${lg("recovery.resend")}</button></div>
        ${ivErrorHtml()}
        <button type="submit" class="btn-primary login-submit">${lg("recovery.next")}</button>
      </form>`;
  }
  if (inviteState.step === "password") {
    return `<h1 class="login-title">${iv.passwordTitle}</h1>
      <p class="login-sub">${iv.passwordIntro}</p>
      <form class="login-form" id="invite-form" novalidate>
        ${ivPasswordField("invite-new", lg("recovery.newPassword"), "")}
        ${loginField("invite-new2", lg("recovery.repeatPassword"), "password", "", 'autocomplete="new-password"')}
        ${loginRulesHtml()}
        ${loginCaptchaHtml()}
        ${ivErrorHtml()}
        <button type="submit" class="btn-primary login-submit">${iv.save}</button>
      </form>`;
  }
  return `<div class="login-done-icon">${ICONS.lock}</div>
    <h1 class="login-title">${iv.doneTitle}</h1>
    <p class="login-sub">${iv.doneText}</p>
    <button type="button" class="btn-primary login-submit" data-iv-go="login">${lg("recovery.toLogin")}</button>`;
}

// Приглашение "живо", пока не принято: status INVITED и hasIdentity ещё false. EXPIRED — уже нет
// (для него в карточке администратора есть отдельное действие "Отправить приглашение повторно").
function ivValidAdmin(admin) {
  return admin && admin.status === "INVITED" && !admin.hasIdentity;
}

function viewAcceptInvite(id) {
  inviteState.step = "code";
  inviteState.error = "";
  inviteState.showPassword = false;
  const admin = ACCESS_ADMINS.find((a) => a.id === id);
  if (!ivValidAdmin(admin)) {
    const iv = lg("invite");
    return `<div class="login-page"><div class="login-card">${loginBrandHtml()}
      <div class="login-done-icon">${ICONS.lock}</div>
      <h1 class="login-title">${iv.invalidTitle}</h1>
      <p class="login-sub">${iv.invalidText}</p>
      <button type="button" class="btn-primary login-submit" data-iv-go="login">${lg("recovery.toLogin")}</button>
    </div></div>`;
  }
  return `<div class="login-page"><div class="login-card">${loginBrandHtml()}<div id="invite-body">${ivStepHtml(admin)}</div></div></div>`;
}

function ivRenderBody(admin) {
  const body = document.getElementById("invite-body");
  if (!body) return;
  body.innerHTML = ivStepHtml(admin);
  ivBind(admin);
}

function ivBind(admin) {
  const fail = (msg) => { inviteState.error = msg; const el = document.getElementById("invite-error"); if (el) { el.textContent = msg; el.hidden = false; } };
  document.querySelectorAll("[data-iv-go]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/${b.dataset.ivGo}`; }));
  document.querySelectorAll("[data-login-eye]").forEach((b) =>
    b.addEventListener("click", () => {
      inviteState.showPassword = !inviteState.showPassword;
      document.querySelectorAll(".login-pass input").forEach((i) => { i.type = inviteState.showPassword ? "text" : "password"; });
    })
  );
  loginBindOtp();
  loginBindCaptcha();
  loginBindRules(document, document.getElementById("invite-new"));
  const form = document.getElementById("invite-form");
  if (!form) return;
  const first = form.querySelector("input:not(.login-otp-cell)");
  if (first) first.focus();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (inviteState.step === "code") {
      const code = [...document.querySelectorAll(".login-otp-cell")].map((i) => i.value).join("");
      if (code !== ADMIN_2FA_DEMO_CODE) return fail(lg("recovery.errCode"));
      inviteState.step = "password";
      inviteState.error = "";
      ivRenderBody(admin);
    } else if (inviteState.step === "password") {
      const p1 = document.getElementById("invite-new").value;
      const p2 = document.getElementById("invite-new2").value;
      if (!loginPasswordValid(p1)) return fail(lg("recovery.errRules"));
      if (p1 !== p2) return fail(lg("recovery.errMatch"));
      if (!document.getElementById("login-captcha-box").classList.contains("is-done")) return fail(lg("recovery.errCaptcha"));
      admin.hasIdentity = true;
      admin.status = "ACTIVE";
      acTouch(admin);
      inviteState.step = "done";
      inviteState.error = "";
      ivRenderBody(admin);
    }
  });
}

function initAcceptInvite(id) {
  const admin = ACCESS_ADMINS.find((a) => a.id === id);
  if (!ivValidAdmin(admin)) {
    document.querySelectorAll("[data-iv-go]").forEach((b) => b.addEventListener("click", () => { window.location.hash = `#/${b.dataset.ivGo}`; }));
    return;
  }
  ivBind(admin);
  loginStartBg();
}











