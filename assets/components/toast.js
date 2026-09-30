/* ==========================================================================
   Тосты: короткие уведомления о выполненных действиях, сверху справа. showToast(text, { type, ttl }).
   type — "success" (по умолчанию) | "error" | "info"; ttl — мс до автозакрытия.
   ========================================================================== */
function showToast(text, opts) {
  const o = opts || {};
  let box = document.getElementById("toast-stack");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-stack";
    box.className = "toast-stack";
    document.body.appendChild(box);
  }
  const type = o.type || "success";
  const icon = type === "error"
    ? `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v4.5M10 13.4v.1"/></svg>`
    : type === "info"
      ? `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 9.2v4.3M10 6.6v.1"/></svg>`
      : `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="m6.6 10.3 2.3 2.3 4.5-4.9"/></svg>`;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text"></span><button type="button" class="toast-close" aria-label="close"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 8 8M14 6l-8 8"/></svg></button>`;
  el.querySelector(".toast-text").textContent = text;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-open"));
  const close = () => {
    el.classList.remove("is-open");
    setTimeout(() => el.remove(), 250);
  };
  el.querySelector(".toast-close").addEventListener("click", close);
  setTimeout(close, o.ttl || 4200);
}