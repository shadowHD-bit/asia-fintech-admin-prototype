/* ==========================================================================
   Единые подсказки: тёмный фон, белый текст (.js-tooltip). Нативные подсказки браузера (атрибут title) заменяются
   на ту же кастомную: при первом наведении title переносится в data-tt, чтобы браузер не показывал свою.
   Элементы .has-tooltip[data-tooltip] обрабатываются своими обработчиками (см. clients-companies.js).
   ========================================================================== */
(function () {
  let tipEl = null;
  let anchor = null;

  function hide() {
    if (tipEl) { tipEl.remove(); tipEl = null; }
    anchor = null;
  }

  function show(target, text) {
    hide();
    anchor = target;
    tipEl = document.createElement("div");
    tipEl.className = "js-tooltip";
    tipEl.textContent = text;
    document.body.appendChild(tipEl);
    const a = target.getBoundingClientRect();
    const r = tipEl.getBoundingClientRect();
    let top = a.top - r.height - 6;
    if (top < 4) top = a.bottom + 6;
    let left = a.left + a.width / 2 - r.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));
    tipEl.style.top = `${top}px`;
    tipEl.style.left = `${left}px`;
  }

  // SVG-подсказки (<title> внутри узла, например пузыри на карте главной): переносим текст в data-tt и убираем <title>
  function liftSvgTitle(node) {
    while (node && node.ownerSVGElement) {
      const title = Array.from(node.children || []).find((c) => c.tagName && c.tagName.toLowerCase() === "title");
      if (title) {
        node.dataset.tt = title.textContent;
        title.remove();
        return;
      }
      node = node.parentNode;
    }
  }

  document.addEventListener("mouseover", (e) => {
    liftSvgTitle(e.target);
    // .has-tooltip[data-tooltip] (например код деятельности внутри поля с копированием) управляет своей
    // подсказкой сам — иначе рядом всплывает ещё и title родителя ("Скопировать"), обрезанный второй подсказкой.
    if (e.target.closest && e.target.closest(".has-tooltip")) { hide(); return; }
    const el = e.target.closest ? e.target.closest("[title], [data-tt]") : null;
    if (!el || el.closest(".ed-step-help") || el === anchor) return;
    if (el.hasAttribute("title")) {
      const text = el.getAttribute("title");
      el.removeAttribute("title");
      if (text) el.dataset.tt = text;
    }
    if (el.dataset.tt) show(el, el.dataset.tt);
  });
  document.addEventListener("mouseout", (e) => {
    if (anchor && !anchor.contains(e.relatedTarget)) hide();
  });
  ["click", "scroll", "keydown"].forEach((ev) => document.addEventListener(ev, hide, true));
  window.addEventListener("hashchange", hide);
})();