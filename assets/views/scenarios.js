/* ==========================================================================
   "Сценарии": отдельная вкладка, где фиксируем пользовательские сценарии
   работы с админкой — название, раздел, описание и шаги (шаг может вести на
   экран: "Текст шага | #/route"). Список хранится в localStorage (если он
   недоступен — работает в памяти до перезагрузки). Начальный набор — сценарии,
   которые уже проработаны в прототипе. Тексты сценариев пишутся по-русски.
   ========================================================================== */

const SCENARIOS_KEY = "admin-scenarios-v1";

const SCENARIOS_SEED = [
  {
    id: "sc-eod-close", title: "Закрытие операционного дня", section: "Операционный день",
    description: "Ежедневное закрытие дня: запуск цепочки этапов, подтверждение сверки и проверка расхождений.",
    steps: [
      { text: "Открыть дашборд операционного дня и проверить активный день", hash: "#/eod-dashboard" },
      { text: "Нажать «Запустить закрытие дня» и подтвердить запуск", hash: "#/eod-dashboard" },
      { text: "Дождаться этапа «Сверка» и подтвердить его — при нерешённых расхождениях этап остаётся на подтверждении" },
      { text: "Разобрать расхождения дня и повторно подтвердить этап", hash: "#/eod-discrepancies" },
      { text: "Убедиться, что день закрыт и открылся следующий", hash: "#/eod-history" },
    ],
  },
  {
    id: "sc-eod-discrepancy", title: "Разбор расхождения сверки", section: "Операционный день",
    description: "Что делать с найденным расхождением по операции или балансу.",
    steps: [
      { text: "Открыть расхождение из списка и посмотреть ожидаемое, фактическое и разницу", hash: "#/eod-discrepancies" },
      { text: "Проверить операцию или снимок баланса на вкладке «Обзор»" },
      { text: "Выбрать действие в меню: принять расхождение, отложить решение или создать корректирующую транзакцию («Регулировка»)" },
      { text: "При необходимости оставить комментарий в боковой панели комментариев" },
    ],
  },
  {
    id: "sc-account-create", title: "Создание счёта", section: "Счета",
    description: "Пошаговое создание виртуального, реального или корреспондентского счёта.",
    steps: [
      { text: "Открыть список счетов и нажать «Создать»", hash: "#/accounts-virtual" },
      { text: "Выбрать вид счёта, задать параметры и владельца (у виртуального клиент обязателен)" },
      { text: "Добавить балансы по валютам; для реального — реквизиты по рельсам" },
      { text: "Проверить итог и создать счёт" },
    ],
  },
  {
    id: "sc-kyc-version", title: "Новая версия конфигурации KYC", section: "Настройки",
    description: "Выпуск новой версии конфига: сервер сам ставит версию +1 и деактивирует прежнюю.",
    steps: [
      { text: "Открыть конфигурации KYC и выбрать «Новая версия» у нужного конфига", hash: "#/settings-verif-kyc" },
      { text: "Проверить основные данные (сервис и уровень менять нельзя)" },
      { text: "Проверить шаги: тип, порядок, название, настройки провайдера" },
      { text: "Подтвердить создание — открывается карточка новой версии" },
    ],
  },
  {
    id: "sc-client-block", title: "Блокировка и разблокировка клиента", section: "Клиенты",
    description: "Клиент заблокирован, пока есть хотя бы одна причина блокировки.",
    steps: [
      { text: "Открыть карточку клиента, вкладка «Безопасность»", hash: "#/clients-users" },
      { text: "«Заблокировать» — указать причины по одной в строке" },
      { text: "«Снять блокировку» — отметить причины, которые нужно снять" },
      { text: "Причины EXPIRED_DOCUMENT и SUMSUB система снимет только при выполненных условиях" },
    ],
  },
];

let scNext = 1;
let scList = null;
let scFilter = "";

function scLoad() {
  if (scList) return scList;
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    if (raw) { scList = JSON.parse(raw); return scList; }
  } catch (e) { /* localStorage недоступен — работаем в памяти */ }
  scList = SCENARIOS_SEED.map((s) => JSON.parse(JSON.stringify(s)));
  return scList;
}

function scSave() {
  try { localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scList)); } catch (e) { /* не критично */ }
}

function scParseSteps(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [a, ...rest] = l.split("|");
    const hash = rest.join("|").trim();
    return hash.startsWith("#/") ? { text: a.trim(), hash } : { text: l };
  });
}

function scStepsToText(steps) {
  return steps.map((s) => (s.hash ? `${s.text} | ${s.hash}` : s.text)).join("\n");
}

function scStepHtml(s, i) {
  const link = s.hash ? `<button type="button" class="table-link sc-step-link" data-sc-hash="${escapeAttr(s.hash)}">${t("scenarios.open")} →</button>` : "";
  return `<li class="sc-step"><span class="sc-step-no">${i + 1}</span><span class="sc-step-text">${pdEscape(s.text)}</span>${link}</li>`;
}

function scItemHtml(sc) {
  return `<article class="sc-item">
    <header class="sc-item-head">
      <div><h3 class="sc-item-title">${pdEscape(sc.title)}</h3>${sc.section ? `<span class="badge badge-neutral">${pdEscape(sc.section)}</span>` : ""}</div>
      <div class="sc-item-tools"><button type="button" class="btn-secondary vb-row-btn" data-sc-edit="${sc.id}">${vt("common.edit")}</button><button type="button" class="btn-secondary vb-row-btn" data-sc-del="${sc.id}">${vt("common.delete")}</button></div>
    </header>
    ${sc.description ? `<p class="sc-item-desc">${pdEscape(sc.description)}</p>` : ""}
    <ol class="sc-steps">${sc.steps.map(scStepHtml).join("")}</ol>
  </article>`;
}

function viewScenarios() {
  const s = t("scenarios");
  const list = scLoad();
  const sections = [...new Set(list.map((x) => x.section).filter(Boolean))];
  const q = scFilter;
  const shown = list.filter((x) => !q || x.section === q);
  const chips = [`<button type="button" class="sc-chip${q ? "" : " is-active"}" data-sc-filter="">${s.all} · ${list.length}</button>`]
    .concat(sections.map((sec) => `<button type="button" class="sc-chip${q === sec ? " is-active" : ""}" data-sc-filter="${escapeAttr(sec)}">${pdEscape(sec)} · ${list.filter((x) => x.section === sec).length}</button>`))
    .join("");
  return `<div id="sc-root">
    ${pageHeader(t("nav.scenarios"), t("navDescriptions.scenarios"), `<button type="button" class="btn-primary" id="sc-add">+ ${s.add}</button>`)}
    <div class="sc-chips">${chips}</div>
    <div class="sc-list">${shown.length ? shown.map(scItemHtml).join("") : `<div class="table-cell-muted">${s.empty}</div>`}</div>
  </div>`;
}

function scOpenForm(sc) {
  const s = t("scenarios");
  const isEdit = !!sc;
  vbOpenForm({
    title: isEdit ? s.editTitle : s.addTitle,
    width: 620,
    intro: s.formIntro,
    fieldsHtml: `${vbInput("sc-title", `${s.fieldTitle} *`, isEdit ? sc.title : "")}${vbInput("sc-section", s.fieldSection, isEdit ? sc.section || "" : "", 'list="sc-sections"')}<datalist id="sc-sections">${[...new Set(scLoad().map((x) => x.section).filter(Boolean))].map((x) => `<option value="${escapeAttr(x)}"></option>`).join("")}</datalist>
      ${vbTextarea("sc-desc", s.fieldDesc, isEdit ? sc.description || "" : "", 3)}
      ${vbTextarea("sc-steps", `${s.fieldSteps} *`, isEdit ? scStepsToText(sc.steps) : "", 7)}<p class="table-cell-muted sl-hint">${s.stepsHint}</p>`,
    submitLabel: vt("common.save"),
    onSubmit: (el) => {
      const title = el.querySelector("#sc-title").value.trim();
      const steps = scParseSteps(el.querySelector("#sc-steps").value);
      if (!title) return s.errTitle;
      if (!steps.length) return s.errSteps;
      closeModal();
      const data = { title, section: el.querySelector("#sc-section").value.trim(), description: el.querySelector("#sc-desc").value.trim(), steps };
      if (isEdit) Object.assign(sc, data);
      else { scNext += 1; scLoad().push({ id: `sc-custom-${Date.now()}-${scNext}`, ...data }); }
      scSave();
      render();
      showToast(t("toast.scenarioSaved"));
      return null;
    },
  });
}

function initScenarios() {
  const root = document.getElementById("sc-root");
  if (!root) return;
  const add = root.querySelector("#sc-add");
  if (add) add.addEventListener("click", () => scOpenForm(null));
  root.querySelectorAll("[data-sc-filter]").forEach((b) => b.addEventListener("click", () => { scFilter = b.dataset.scFilter; render(); }));
  root.querySelectorAll("[data-sc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.scHash; }));
  root.querySelectorAll("[data-sc-edit]").forEach((b) => b.addEventListener("click", () => scOpenForm(scLoad().find((x) => x.id === b.dataset.scEdit))));
  root.querySelectorAll("[data-sc-del]").forEach((b) =>
    b.addEventListener("click", () => {
      const sc = scLoad().find((x) => x.id === b.dataset.scDel);
      vbConfirm({
        title: t("scenarios.delTitle"), text: t("scenarios.delText")(sc.title), confirmLabel: vt("common.delete"), danger: true,
        onConfirm: () => { scList = scLoad().filter((x) => x.id !== sc.id); if (scFilter && !scList.some((x) => x.section === scFilter)) scFilter = ""; scSave(); render(); showToast(t("toast.scenarioDeleted")); },
      });
    })
  );
}
