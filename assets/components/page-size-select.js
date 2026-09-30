/* ==========================================================================
   Кастомный выпадающий список "Строк на странице" в футере таблиц.
   Нативный <select> остаётся в DOM (скрыт) — существующие обработчики "change"
   в views продолжают работать. Списки перерисовываются вместе с таблицей,
   поэтому за DOM следит MutationObserver и оборачивает новые селекты.
   ========================================================================== */

const PSS_CHEVRON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m6 8 4 4 4-4"/></svg>';

function pssClose() {
  document.querySelectorAll(".pss.is-open").forEach((el) => {
    el.classList.remove("is-open");
    const b = el.querySelector(".pss-btn");
    if (b) b.setAttribute("aria-expanded", "false");
  });
}

function pssEnhance(select) {
  if (select.dataset.pss) return;
  select.dataset.pss = "1";
  select.classList.add("pss-native");

  const wrap = document.createElement("div");
  wrap.className = "pss";
  const current = () => select.options[select.selectedIndex];
  wrap.innerHTML = `<button type="button" class="pss-btn" aria-haspopup="listbox" aria-expanded="false"><span class="pss-value">${current() ? current().textContent : ""}</span>${PSS_CHEVRON}</button><div class="pss-menu" role="listbox"></div>`;
  select.parentNode.insertBefore(wrap, select.nextSibling);

  const btn = wrap.querySelector(".pss-btn");
  const menu = wrap.querySelector(".pss-menu");
  const renderMenu = () => {
    menu.innerHTML = Array.from(select.options)
      .map((o) => `<button type="button" role="option" class="pss-option${o.value === select.value ? " is-selected" : ""}" data-value="${o.value}">${o.textContent}</button>`)
      .join("");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = wrap.classList.contains("is-open");
    pssClose();
    if (open) return;
    renderMenu();
    wrap.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
  });
  menu.addEventListener("click", (e) => {
    const opt = e.target.closest(".pss-option");
    if (!opt) return;
    e.stopPropagation();
    pssClose();
    if (select.value === opt.dataset.value) return;
    select.value = opt.dataset.value;
    wrap.querySelector(".pss-value").textContent = current().textContent;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function pssScan(root) {
  (root || document).querySelectorAll(".table-footer-page-size select").forEach(pssEnhance);
}

document.addEventListener("click", pssClose);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") pssClose(); });
new MutationObserver(() => pssScan(document)).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", () => pssScan(document));
