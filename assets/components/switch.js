/* ==========================================================================
   Единый переключатель (тогл) для булевых настроек: тёмная дорожка во включённом состоянии, белый бегунок.
   switchRowHtml(id, label, checked, { cls, hint, attrs }) — строка "тогл + подпись". Сам <input type="checkbox" id> остаётся
   в разметке, поэтому обработчики "change" по id работают как у обычного чекбокса.
   ========================================================================== */
function switchRowHtml(id, label, checked, opts = {}) {
  return `<label class="switch-row${opts.cls ? ` ${opts.cls}` : ""}"><span class="switch"><input type="checkbox" id="${id}"${checked ? " checked" : ""}${opts.attrs ? ` ${opts.attrs}` : ""} /><span class="switch-track"><span class="switch-thumb"></span></span></span><span class="switch-row-label">${label}${opts.hint ? `<span class="table-cell-muted ed-check-hint">${opts.hint}</span>` : ""}</span></label>`;
}