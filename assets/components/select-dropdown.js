/* ==========================================================================
   Переиспользуемый кастомный select — попап со списком опций и чекбоксами.
   Мультивыбор: клик по опции переключает её, попап остаётся открытым, при
   каждом переключении зовётся onChange(newSelectedValues). Закрывается по
   клику вне попапа (или кнопкой "Готово"). Один инстанс за раз, паттерн
   идентичен date-range-picker.js.
   ========================================================================== */

let selectDropdownState = null; // { anchorEl, options: [{value,label}], selected: string[], onChange }

function positionPopoverNearAnchor(popoverEl, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const top = rect.bottom + 6;
  let left = rect.left;
  const maxLeft = window.innerWidth - popoverEl.offsetWidth - 12;
  if (left > maxLeft) left = Math.max(12, maxLeft);
  popoverEl.style.top = `${top}px`;
  popoverEl.style.left = `${left}px`;
}

// position:fixed попапы считают координаты один раз при открытии — при скролле
// страницы якорь (кнопка) уезжает, а попап нет. Держим их синхронизированными,
// пока попап открыт; вызывающий код обязан снять слушатели через
// unwatchPopoverReposition при закрытии (иначе накопятся зомби-обработчики).
function watchPopoverReposition(popoverEl, anchorEl) {
  const handler = () => {
    if (!document.body.contains(popoverEl)) {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
      return;
    }
    positionPopoverNearAnchor(popoverEl, anchorEl);
  };
  window.addEventListener("scroll", handler, true);
  window.addEventListener("resize", handler);
  return handler;
}

function unwatchPopoverReposition(handler) {
  if (!handler) return;
  window.removeEventListener("scroll", handler, true);
  window.removeEventListener("resize", handler);
}

let selectDropdownRepositionHandler = null;

// searchPlaceholder — если задан, сверху появляется строка поиска по названию (option.searchText или label); emptyLabel — текст, когда ничего не найдено
// matchWidth — попап той же ширины, что и кнопка-якорь (для полей на всю ширину формы)
function openSelectDropdown({ anchorEl, options, selected, onChange, doneLabel, searchPlaceholder, emptyLabel, matchWidth }) {
  closeSelectDropdown();
  selectDropdownState = { anchorEl, options, selected: selected || [], onChange, doneLabel, searchPlaceholder, emptyLabel, query: "" };
  renderSelectDropdown();
  const popoverEl = document.getElementById("select-dropdown-popover");
  if (matchWidth) popoverEl.style.width = `${anchorEl.getBoundingClientRect().width}px`;
  positionPopoverNearAnchor(popoverEl, anchorEl);
  selectDropdownRepositionHandler = watchPopoverReposition(popoverEl, anchorEl);
  setTimeout(() => document.addEventListener("click", handleSelectDropdownOutsideClick, true), 0);
}

function closeSelectDropdown() {
  const el = document.getElementById("select-dropdown-popover");
  if (el) el.remove();
  selectDropdownState = null;
  unwatchPopoverReposition(selectDropdownRepositionHandler);
  selectDropdownRepositionHandler = null;
  document.removeEventListener("click", handleSelectDropdownOutsideClick, true);
}

function handleSelectDropdownOutsideClick(e) {
  if (!selectDropdownState) return;
  const popover = document.getElementById("select-dropdown-popover");
  if (popover && (popover.contains(e.target) || (selectDropdownState.anchorEl && selectDropdownState.anchorEl.contains(e.target)))) return;
  closeSelectDropdown();
}

function renderSelectDropdown() {
  let el = document.getElementById("select-dropdown-popover");
  if (!el) {
    el = document.createElement("div");
    el.id = "select-dropdown-popover";
    el.className = "select-dropdown-popover";
    document.body.appendChild(el);
  }

  const checkSvg = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8.5 3 3 6-6.5"/></svg>`;
  const { options, selected, doneLabel, searchPlaceholder, emptyLabel } = selectDropdownState;
  const q = (selectDropdownState.query || "").trim().toLowerCase();
  const shown = q ? options.filter((o) => String(o.searchText || o.label).toLowerCase().includes(q)) : options;

  const itemsHtml = shown.length
    ? shown
        .map((opt) => {
          const isChecked = selected.includes(opt.value);
          return `
        <button type="button" class="select-dropdown-item${isChecked ? " is-active" : ""}" data-value="${opt.value}">
          <span class="select-checkbox${isChecked ? " is-checked" : ""}">${isChecked ? checkSvg : ""}</span>
          <span>${opt.label}</span>
        </button>
      `;
        })
        .join("")
    : `<div class="select-dropdown-empty">${emptyLabel || ""}</div>`;

  const footer = doneLabel ? `<div class="select-dropdown-footer"><button type="button" class="btn-secondary" id="select-dropdown-done">${doneLabel}</button></div>` : "";

  if (searchPlaceholder) {
    // строка поиска остаётся на месте (не перерисовывается, чтобы не терять фокус), обновляется только список
    if (!el.querySelector(".select-dropdown-search")) {
      el.innerHTML = `<div class="select-dropdown-search"><input type="text" class="address-form-input" placeholder="${searchPlaceholder}" autocomplete="off" /></div><div class="select-dropdown-list"></div>${footer}`;
      const input = el.querySelector(".select-dropdown-search input");
      input.addEventListener("input", () => {
        if (!selectDropdownState) return;
        selectDropdownState.query = input.value;
        renderSelectDropdown();
      });
      input.focus();
    }
    el.querySelector(".select-dropdown-list").innerHTML = itemsHtml;
  } else {
    el.innerHTML = `${itemsHtml}${footer}`;
  }

  el.querySelectorAll(".select-dropdown-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.value;
      const s = selectDropdownState;
      s.selected = s.selected.includes(value) ? s.selected.filter((v) => v !== value) : [...s.selected, value];
      const onChange = s.onChange;
      renderSelectDropdown();
      onChange(s.selected);
    });
  });

  const doneBtn = el.querySelector("#select-dropdown-done");
  if (doneBtn) doneBtn.addEventListener("click", () => closeSelectDropdown());
}
