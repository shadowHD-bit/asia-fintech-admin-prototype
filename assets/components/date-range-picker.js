/* ==========================================================================
   Переиспользуемый date-range picker (пресеты + два месяца + диапазон).
   Ничего не знает про конкретную страницу — вызывающий код передаёт текущие
   from/to и onApply(from, to). from/to внутри — объекты Date или null.
   Один попап на страницу (открыт максимум один инстанс за раз).
   ========================================================================== */

let drpState = null; // { pendingFrom, pendingTo, viewMonth, anchorEl, onApply }

function drpIsSameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function drpStartOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function drpEndOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function drpStartOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function drpAddMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function formatDMY(d) {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function drpDaysGrid(monthDate) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const mondayIndex = (first.getDay() + 6) % 7;
  const cursor = new Date(y, m, 1 - mondayIndex);
  const cells = [];
  while (true) {
    cells.push({ date: new Date(cursor), inMonth: cursor.getMonth() === m });
    const isSunday = (cursor.getDay() + 6) % 7 === 6;
    if (cursor >= last && isSunday) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

const DRP_PRESETS = [
  ["today", () => { const d = MOCK_NOW; return [drpStartOfDay(d), drpEndOfDay(d)]; }],
  ["yesterday", () => { const d = new Date(MOCK_NOW); d.setDate(d.getDate() - 1); return [drpStartOfDay(d), drpEndOfDay(d)]; }],
  ["week", () => { const from = new Date(MOCK_NOW); from.setDate(from.getDate() - 6); return [drpStartOfDay(from), drpEndOfDay(MOCK_NOW)]; }],
  ["month", () => [drpStartOfDay(drpStartOfMonth(MOCK_NOW)), drpEndOfDay(MOCK_NOW)]],
  ["quarter", () => { const q = Math.floor(MOCK_NOW.getMonth() / 3); const from = new Date(MOCK_NOW.getFullYear(), q * 3, 1); return [drpStartOfDay(from), drpEndOfDay(MOCK_NOW)]; }],
  ["year", () => [drpStartOfDay(new Date(MOCK_NOW.getFullYear(), 0, 1)), drpEndOfDay(MOCK_NOW)]],
  ["lastMonth", () => {
    const from = new Date(MOCK_NOW.getFullYear(), MOCK_NOW.getMonth() - 1, 1);
    const to = new Date(MOCK_NOW.getFullYear(), MOCK_NOW.getMonth(), 0);
    return [drpStartOfDay(from), drpEndOfDay(to)];
  }],
];

let drpRepositionHandler = null;

function openDateRangePicker({ from, to, anchorEl, onApply }) {
  closeDateRangePicker();
  drpState = {
    pendingFrom: from || null,
    pendingTo: to || null,
    viewMonth: drpStartOfMonth(from || MOCK_NOW),
    anchorEl,
    onApply,
  };
  renderDrpPopover();
  positionDrpPopover();
  drpRepositionHandler = watchPopoverReposition(document.getElementById("drp-popover"), anchorEl);
  setTimeout(() => document.addEventListener("click", handleDrpOutsideClick, true), 0);
}

function closeDateRangePicker() {
  const el = document.getElementById("drp-popover");
  if (el) el.remove();
  drpState = null;
  unwatchPopoverReposition(drpRepositionHandler);
  drpRepositionHandler = null;
  document.removeEventListener("click", handleDrpOutsideClick, true);
}

function handleDrpOutsideClick(e) {
  if (!drpState) return;
  const popover = document.getElementById("drp-popover");
  if (popover && (popover.contains(e.target) || (drpState.anchorEl && drpState.anchorEl.contains(e.target)))) return;
  closeDateRangePicker();
}

function positionDrpPopover() {
  const popover = document.getElementById("drp-popover");
  if (!popover || !drpState || !drpState.anchorEl) return;
  positionPopoverNearAnchor(popover, drpState.anchorEl); // см. select-dropdown.js
}

function drpDayCellHtml(cell) {
  const classes = ["drp-day"];
  if (!cell.inMonth) classes.push("is-outside");
  const isFrom = drpIsSameDay(cell.date, drpState.pendingFrom);
  const isTo = drpIsSameDay(cell.date, drpState.pendingTo);
  if (isFrom || isTo) classes.push("is-endpoint");
  if (drpState.pendingFrom && drpState.pendingTo && cell.date > drpState.pendingFrom && cell.date < drpState.pendingTo) {
    classes.push("is-in-range");
  }
  if (drpIsSameDay(cell.date, MOCK_NOW)) classes.push("is-today");
  return `<button type="button" class="${classes.join(" ")}" data-time="${cell.date.getTime()}">${cell.date.getDate()}</button>`;
}

function drpMonthHtml(monthDate, { showPrev, showNext }) {
  const months = t("dateRangePicker.months");
  const weekdays = t("dateRangePicker.weekdays");
  const prevBtn = showPrev
    ? `<button type="button" class="drp-nav-btn" id="drp-prev"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg></button>`
    : `<span class="drp-nav-spacer"></span>`;
  const nextBtn = showNext
    ? `<button type="button" class="drp-nav-btn" id="drp-next"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.5 5 5.5-5 5.5"/></svg></button>`
    : `<span class="drp-nav-spacer"></span>`;

  return `
    <div class="drp-month">
      <div class="drp-month-header">
        ${prevBtn}
        <span class="drp-month-title">${months[monthDate.getMonth()]} ${monthDate.getFullYear()}</span>
        ${nextBtn}
      </div>
      <div class="drp-weekdays">${weekdays.map((w) => `<span>${w}</span>`).join("")}</div>
      <div class="drp-days">${drpDaysGrid(monthDate).map(drpDayCellHtml).join("")}</div>
    </div>
  `;
}

function drpFooterRangeText() {
  if (drpState.pendingFrom && drpState.pendingTo) {
    return `${formatDMY(drpState.pendingFrom)} — ${formatDMY(drpState.pendingTo)}`;
  }
  if (drpState.pendingFrom) return formatDMY(drpState.pendingFrom);
  return t("dateRangePicker.placeholder");
}

function renderDrpPopover() {
  let el = document.getElementById("drp-popover");
  if (!el) {
    el = document.createElement("div");
    el.id = "drp-popover";
    el.className = "drp-popover";
    document.body.appendChild(el);
  }

  const leftMonth = drpState.viewMonth;
  const rightMonth = drpAddMonths(leftMonth, 1);

  el.innerHTML = `
    <div class="drp-body">
      <div class="drp-presets">
        ${DRP_PRESETS.map(([id]) => `<button type="button" class="drp-preset" data-preset="${id}">${t(`dateRangePicker.presets.${id}`)}</button>`).join("")}
      </div>
      <div class="drp-calendars">
        ${drpMonthHtml(leftMonth, { showPrev: true, showNext: false })}
        ${drpMonthHtml(rightMonth, { showPrev: false, showNext: true })}
      </div>
    </div>
    <div class="drp-footer">
      <span class="drp-footer-range">${drpFooterRangeText()}</span>
      <div class="drp-footer-actions">
        <button type="button" class="btn-secondary" id="drp-reset">${t("dateRangePicker.reset")}</button>
        <button type="button" class="btn-primary" id="drp-apply">${t("dateRangePicker.apply")}</button>
      </div>
    </div>
  `;

  attachDrpHandlers(el);
}

function attachDrpHandlers(el) {
  el.querySelectorAll(".drp-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [, compute] = DRP_PRESETS.find(([id]) => id === btn.dataset.preset);
      const [from, to] = compute();
      drpState.pendingFrom = from;
      drpState.pendingTo = to;
      drpState.viewMonth = drpStartOfMonth(from);
      renderDrpPopover();
    });
  });

  el.querySelectorAll(".drp-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      const clicked = new Date(Number(btn.dataset.time));
      if (!drpState.pendingFrom || drpState.pendingTo) {
        drpState.pendingFrom = clicked;
        drpState.pendingTo = null;
      } else if (clicked < drpState.pendingFrom) {
        drpState.pendingTo = drpState.pendingFrom;
        drpState.pendingFrom = clicked;
      } else {
        drpState.pendingTo = clicked;
      }
      renderDrpPopover();
    });
  });

  const prevBtn = el.querySelector("#drp-prev");
  if (prevBtn) prevBtn.addEventListener("click", () => { drpState.viewMonth = drpAddMonths(drpState.viewMonth, -1); renderDrpPopover(); });

  const nextBtn = el.querySelector("#drp-next");
  if (nextBtn) nextBtn.addEventListener("click", () => { drpState.viewMonth = drpAddMonths(drpState.viewMonth, 1); renderDrpPopover(); });

  el.querySelector("#drp-reset").addEventListener("click", () => {
    drpState.pendingFrom = null;
    drpState.pendingTo = null;
    renderDrpPopover();
  });

  el.querySelector("#drp-apply").addEventListener("click", () => {
    const from = drpState.pendingFrom ? drpStartOfDay(drpState.pendingFrom) : null;
    const to = drpState.pendingTo
      ? drpEndOfDay(drpState.pendingTo)
      : drpState.pendingFrom
        ? drpEndOfDay(drpState.pendingFrom)
        : null;
    const onApply = drpState.onApply;
    closeDateRangePicker();
    onApply(from, to);
  });
}
