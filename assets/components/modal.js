/* ==========================================================================
   Универсальное модальное окно — overlay + центрированная карточка.
   Стандартный способ показывать формы добавления/редактирования и
   подтверждения удаления во всём приложении: инлайн-формы/window.confirm
   для таких действий больше не используются, только модалки.
   ========================================================================== */

let modalKeydownHandler = null;

// title — заголовок; bodyHtml — содержимое; footerHtml — кнопки (необязательно);
// width — макс. ширина в px (по умолчанию 480); onMount(modalEl) — вызывается
// после вставки в DOM, там же вешаются обработчики на кнопки внутри модалки.
function openModal({ title, bodyHtml, footerHtml, width, onMount, closeOnOverlay = true }) {
  closeModal();
  // Прежняя модалка убирается из DOM сразу (closeModal делает это с задержкой под
  // анимацию), иначе при переходе форма → подтверждение элементы с одинаковыми
  // id перепутаются.
  const previous = document.getElementById("app-modal-wrap");
  if (previous) previous.remove();

  const wrap = document.createElement("div");
  wrap.id = "app-modal-wrap";
  wrap.innerHTML = `
    <div class="modal-overlay" id="app-modal-overlay"></div>
    <div class="modal-scroll">
      <div class="modal" id="app-modal"${width ? ` style="max-width:${width}px"` : ""}>
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button type="button" class="modal-close" id="app-modal-close">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
          </button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ""}
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  // Класс is-open добавляем следующим кадром — иначе CSS-transition не сыграет
  requestAnimationFrame(() => {
    const overlay = document.getElementById("app-modal-overlay");
    const modal = document.getElementById("app-modal");
    if (overlay) overlay.classList.add("is-open");
    if (modal) modal.classList.add("is-open");
  });

  document.getElementById("app-modal-close").addEventListener("click", closeModal);
  if (closeOnOverlay) {
    document.getElementById("app-modal-overlay").addEventListener("click", closeModal);
  }

  modalKeydownHandler = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", modalKeydownHandler);
  document.body.classList.add("modal-open");

  if (onMount) onMount(document.getElementById("app-modal"));
}

function closeModal() {
  const wrap = document.getElementById("app-modal-wrap");
  if (!wrap) return;
  const overlay = document.getElementById("app-modal-overlay");
  const modal = document.getElementById("app-modal");
  if (overlay) overlay.classList.remove("is-open");
  if (modal) modal.classList.remove("is-open");
  if (modalKeydownHandler) document.removeEventListener("keydown", modalKeydownHandler);
  modalKeydownHandler = null;
  document.body.classList.remove("modal-open");
  setTimeout(() => wrap.remove(), 180);
}

// ---- Модалка подтверждения (удаление и другие необратимые действия) -------------
function openConfirmModal({ title, text, confirmLabel, cancelLabel, danger, onConfirm }) {
  openModal({
    title,
    width: 400,
    bodyHtml: `<p class="modal-confirm-text">${text}</p>`,
    footerHtml: `
      <button type="button" class="btn-secondary" id="app-modal-cancel">${cancelLabel}</button>
      <button type="button" class="${danger ? "btn-danger" : "btn-primary"}" id="app-modal-confirm">${confirmLabel}</button>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector("#app-modal-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#app-modal-confirm").addEventListener("click", () => {
        closeModal();
        onConfirm();
      });
    },
  });
}
