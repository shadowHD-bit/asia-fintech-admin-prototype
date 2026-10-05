/* ==========================================================================
   "Настройки → Бухгалтерия → План счетов" (Chart of Accounts).

   ДОПУЩЕНИЕ ПРОТОТИПА: раздел построен по FRD (research-gl-coa.md,
   general-ledger-i-chart-of-accounts.md); сам экран (дерево, карточка,
   CRUD) — проект будущей фичи, но привязка к реальным ВА/РА (через `tag`)
   и финансовые отчёты в реальном бэкенде есть — см. комментарий в
   mock/accounting-coa.mock.js. БЕЗ ОТДЕЛЬНОЙ ГЛАВНОЙ КНИГИ (05.10.2026) —
   остатки и "проводки" счёта (блок "Проводки" ниже) — это проводки его
   привязанных по тегу ВА/РА (coaBalancesByCurrency/coaEntriesForAccount,
   mock/accounting-coa.mock.js), а не записи отдельного журнала. Следующий
   шаг плана раздела "Бухгалтерия" — отчёты (financial-reports.js) поверх
   этого же read-слоя.

   Создание/редактирование счёта и смена статуса — без кода 2FA: в
   соседнем, ближайшем по сути разделе ("Настройки → vABS → Сети/Валюты",
   settings-vabs.js, vbOpenNetworkForm/vbToggleStatus) те же операции
   тоже защищены только диалогом подтверждения, без 2FA — для
   единообразия здесь сделано так же.

   Список — createAccessList (как везде); карточка счёта — тот же
   паттерн, что и карточка сети/валюты в settings-vabs.js (vbDetailHeader
   + flatSection/sectionCard).
   ========================================================================== */

function co(path) {
  return t(`accountingCoa.${path}`);
}

function coaRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^accounting-coa\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function coaStatusBadge(status) {
  const cls = { ACTIVE: "badge-success", INACTIVE: "badge-warning", ARCHIVED: "badge-neutral" }[status] || "badge-neutral";
  return `<span class="badge ${cls}">${co(`status.${status}`)}</span>`;
}

function coaCategoryBadge(category) {
  const cls = { ASSETS: "badge-info", LIABILITIES: "badge-warning", EQUITY: "badge-neutral", INCOME: "badge-success", EXPENSES: "badge-danger" }[category] || "badge-neutral";
  return `<span class="badge ${cls}">${co(`category.${category}`)}</span>`;
}

function coaFormatMoney(n, currency) {
  if (n == null) return `<span class="table-cell-muted">—</span>`;
  const txt = n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return currency ? `${txt} ${currency}` : txt;
}

// Остаток — реальная разбивка по валютам из проводок ВА/РА (coaBalancesByCurrency, mock/accounting-coa.mock.js), не
// одно число: валюты разных типов не складываются в одну сумму (та же логика, что в карточке "Объём на
// счетах" на главной). Для группы это тоже честная разбивка — сумма потомков по каждой валюте отдельно.
function coaBalanceDisplay(a) {
  const byCur = coaBalancesByCurrency(a);
  const list = Object.keys(byCur);
  if (!list.length) return `<span class="table-cell-muted" title="${escapeAttr(co("detail.noEntries"))}">—</span>`;
  return list.map((cur) => coaFormatMoney(byCur[cur], cur)).join(", ");
}

// Таблица привязанных ВА/РА — реальные записи mock/accounts.mock.js с этим же .tag (coaLinkedAccounts),
// не абстрактные "измерения". Несколько строк — нормально: один тег стоит у многих клиентских счетов.
function coaLinkedAccountsTable(a) {
  const linked = coaLinkedAccounts(a);
  return vbMiniTable(
    [co("columns.code"), co("fields.client"), co("columns.balance"), co("columns.status"), ""],
    linked.map((acc) => [
      `<button type="button" class="table-link" data-coa-acc-hash="#/accounts-${acc.kind}/${acc.id}">${pdEscape(acc.code)}</button>`,
      acc.client ? pdEscape(acc.client.name) : `<span class="table-cell-muted">${co("detail.noClient")}</span>`,
      acc.balances && acc.balances.length ? acc.balances.map((b) => coaFormatMoney(b.total, b.currency)).join(", ") : "—",
      accStatusBadge(acc.status),
      `<button type="button" class="table-link" data-coa-unlink="${acc.kind}:${acc.id}">${co("actions.unlink")}</button>`,
    ]),
    co("detail.noLinkedAccounts")
  );
}

// Дерево: группы сворачиваются/разворачиваются (состояние — в coaCollapsed, по коду счёта), с
// вертикальными направляющими линиями по глубине (align-self:stretch тянет border-left на всю
// высоту строки — надёжнее, чем абсолютное позиционирование под произвольную высоту <tr>).
const coaCollapsed = new Set();

function coaIsVisible(a) {
  let cur = a;
  while (cur.parentCode) {
    cur = coaByCode(cur.parentCode);
    if (coaCollapsed.has(cur.code)) return false;
  }
  return true;
}

// Направляющие линии дерева — через background-image самой строки, а не вложенными DOM-элементами
// с align-self:stretch: тех было видно по-разному в зависимости от высоты других колонок в той же
// строке (их высота определяет высоту <tr>, а мой блок внутри неё мог оказаться по центру/сверху/снизу
// в зависимости от vertical-align — отсюда "хвосты" линий сверху/снизу на скриншотах). background-image
// всегда укладывается строго в границы элемента независимо от содержимого — без этой неоднозначности.
const COA_TREE_COL_PX = 18;

// Был ли счёт последним ребёнком среди своих братьев — после него линия на его уровне не продолжается
// (веткам ниже уже неоткуда расти).
function coaIsLastChild(a) {
  const siblings = a.parentCode ? coaChildren(a.parentCode) : COA_ACCOUNTS.filter((x) => !x.parentCode);
  return siblings[siblings.length - 1] === a;
}

// Для предков — сплошная линия на всю высоту строки, если у этого предка есть ещё братья ниже (иначе —
// ничего, веткам неоткуда расти). Для самого узла — верхняя половина всегда (идёт от родителя), нижняя
// половина — только если есть ещё соседи ниже (иначе обрываем ровно на уголке — см. скриншот с 4130/4200).
// Важно: сама высота линии теперь считается на настоящей <td> через background-image (coaNameCellStyle),
// а не на вложенном элементе — поэтому деление на половинки здесь уже не ломает стык между строками,
// как ломало раньше (та проблема была в другом месте и уже исправлена).
function coaTreeStyle(a) {
  const ancestors = [];
  let cur = a;
  while (cur.parentCode) {
    cur = coaByCode(cur.parentCode);
    ancestors.unshift(cur);
  }
  if (!ancestors.length) return { style: "", indent: 0 };

  const images = [], positions = [], sizes = [];
  const line = (x, sizeY = "100%", posY = "0") => { images.push("linear-gradient(var(--color-border), var(--color-border))"); positions.push(`${x}px ${posY}`); sizes.push(`1px ${sizeY}`); };
  const tick = (x) => { images.push("linear-gradient(var(--color-border), var(--color-border))"); positions.push(`${x}px 50%`); sizes.push(`10px 1px`); };

  ancestors.forEach((anc, i) => {
    if (!coaIsLastChild(anc)) line(i * COA_TREE_COL_PX + 8);
  });
  const ownX = ancestors.length * COA_TREE_COL_PX + 8;
  line(ownX, "50%", "0");
  // position-Y в процентах — это НЕ "отступ в % высоты контейнера", а (высота_контейнера − высота_фона) × X%.
  // Для слоя высотой 50% и position:50% реальный отступ — 25%, а не 50% (не достаёт до низа строки — тот самый
  // разрыв). Чтобы нижняя половина реально начиналась с середины и шла до низа, position должен быть 100%.
  if (!coaIsLastChild(a)) line(ownX, "50%", "100%");
  tick(ownX);

  const style = `background-image:${images.join(",")};background-position:${positions.join(",")};background-size:${sizes.join(",")};background-repeat:no-repeat;`;
  return { style, indent: (ancestors.length + 1) * COA_TREE_COL_PX };
}

// Линии — background-image НАПРЯМУЮ на настоящей <td> (через tdStyle, см. createAccessList), не на вложенном
// элементе: фон табличной ячейки гарантированно укладывается ровно в её отрисованную высоту безо всяких "может
// быть, а может и нет" — в отличие от процентной высоты/position:absolute на дочернем блоке, где на стыках
// соседних строк всё равно оставались разрывы в 1-2px (пробовал оба варианта, оба тёкли).
function coaNameCellStyle(a) {
  return coaTreeStyle(a).style;
}

function coaNameCell(a) {
  const { indent } = coaTreeStyle(a);
  const toggle =
    a.nodeType === "GROUP"
      ? `<button type="button" class="coa-tree-toggle${coaCollapsed.has(a.code) ? " is-collapsed" : ""}" data-coa-toggle="${a.code}">${ICONS.chevron}</button>`
      : `<span class="coa-tree-toggle is-spacer"></span>`;
  const codeLink = `<button type="button" class="table-link" data-coa-hash="#/accounting-coa/${a.id}">${pdEscape(a.code)} · ${pdEscape(a.name)}</button>`;
  const systemBadge = a.isSystem ? `<span class="badge badge-neutral coa-tree-system-badge">${co("fields.isSystem")}</span>` : "";
  return `<span class="coa-tree-content" style="padding-left:${indent}px">${toggle}${codeLink}${systemBadge}</span>`;
}

const coaList = createAccessList({
  key: "coa",
  data: () => COA_ACCOUNTS,
  searchPlaceholder: () => co("search"),
  searchText: (a) => `${a.code} ${a.name}`,
  // Без вкладок по категории: это дерево с родителями и детьми, фильтр "показать только Активы" разорвал бы
  // иерархию (скрыл бы корень без потомков или потомков без корня) — категория и так видна в колонке и в фильтре.
  tableClass: "coa-table",
  filters: [
    { id: "nodeType", kind: "multi", label: () => co("fields.nodeType"), get: (r) => r.nodeType, options: () => ["GROUP", "ANALYTICAL", "TECHNICAL"].map((v) => ({ value: v, label: co(`nodeType.${v}`) })) },
    { id: "status", kind: "multi", label: () => co("fields.status"), get: (r) => r.status, options: () => ["ACTIVE", "INACTIVE", "ARCHIVED"].map((v) => ({ value: v, label: co(`status.${v}`) })) },
    { id: "allowManual", kind: "multi", label: () => co("fields.allowManual"), get: (r) => (r.allowManualEntry ? "yes" : "no"), options: () => [{ value: "yes", label: co("yes") }, { value: "no", label: co("no") }] },
  ],
  defaultSort: (a, b) => a.code.localeCompare(b.code),
  sorts: { code: (a, b) => a.code.localeCompare(b.code), created: (a, b) => a.createdDate - b.createdDate },
  // Метрики — по полному плану счетов (COA_ACCOUNTS), не по видимым после сворачивания строкам: иначе цифры
  // "Всего"/"Групп" и т.п. менялись бы от того, что просто свёрнуто на экране, а не удалено из плана
  metrics: () => [
    { value: COA_ACCOUNTS.length, label: co("metrics.total") },
    { value: COA_ACCOUNTS.filter((a) => a.nodeType === "ANALYTICAL").length, label: co("metrics.analytical") },
    { value: COA_ACCOUNTS.filter((a) => a.nodeType === "GROUP").length, label: co("metrics.groups") },
    { value: COA_ACCOUNTS.filter((a) => a.nodeType === "TECHNICAL").length, label: co("metrics.technical") },
  ],
  columns: [
    { label: () => co("columns.code"), sort: "code", html: coaNameCell, tdClass: "coa-name-td", tdStyle: coaNameCellStyle },
    { label: () => co("columns.normalBalance"), html: (a) => co(`normalBalance.${a.normalBalance}`) },
    { label: () => co("columns.nodeType"), html: (a) => co(`nodeType.${a.nodeType}`) },
    { label: () => co("columns.balance"), html: coaBalanceDisplay },
    { label: () => co("columns.allowManual"), html: (a) => (a.allowManualEntry ? `<span class="coa-bool-icon">${CHECK_ICON_SVG}</span>` : `<span class="table-cell-muted">—</span>`) },
    { label: () => co("columns.status"), html: (a) => coaStatusBadge(a.status) },
    { label: () => co("columns.created"), sort: "created", html: (a) => dateTimeCell(a.createdAt) },
  ],
  // Единым списком, без пагинации — это план счетов целиком, его смысл в том, чтобы видеть всю иерархию сразу
  noPager: true,
  // Сворачивание веток — после поиска/табов/фильтров/сортировки, но до рендера строк (см. rowFilter в createAccessList)
  rowFilter: (rows) => rows.filter(coaIsVisible),
  attachRows: (wrap) => {
    wrap.querySelectorAll("[data-coa-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.coaHash; }));
    wrap.querySelectorAll("[data-coa-toggle]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = b.dataset.coaToggle;
        if (coaCollapsed.has(code)) coaCollapsed.delete(code);
        else coaCollapsed.add(code);
        coaList.refresh();
      });
    });
  },
});

// В выгрузке — та же разбивка по валютам, что и на экране (а не одно число без единицы измерения)
function coaExportBalance(a) {
  const byCur = coaBalancesByCurrency(a);
  return Object.keys(byCur).map((cur) => `${byCur[cur]} ${cur}`).join("; ");
}

function coaDoExport(format) {
  exportTable(
    "chart-of-accounts",
    format,
    [co("columns.code"), co("fields.name"), co("fields.category"), co("columns.normalBalance"), co("columns.nodeType"), co("columns.balance"), co("columns.status")],
    COA_ACCOUNTS.map((a) => [a.code, a.name, co(`category.${a.category}`), co(`normalBalance.${a.normalBalance}`), co(`nodeType.${a.nodeType}`), coaExportBalance(a), co(`status.${a.status}`)])
  );
  showToast(co("export.done"));
}

function viewAccountingCoa() {
  const heroActions = `<span class="filters-bar-end">${sectionHintBtn("coa-hint-btn", co("info"))}<span class="hdr-desktop-only">${exportMenuHtml("coa-export", co("export.button"), co("export.hint"))}</span><button type="button" class="btn-primary hdr-desktop-only" id="coa-add">${PLUS_ICON_SVG}<span>${co("add")}</span></button>${hdrActionsKebab("coa-hdr-km", [{ id: "coa-export-csv", label: `${co("export.button")} CSV` }, { id: "coa-export-xlsx", label: `${co("export.button")} XLSX` }, { id: "coa-add-m", icon: PLUS_ICON_SVG, label: co("add") }])}</span>`;
  return `<div class="list-hero">${pageHeader(t("nav.accounting-coa"), t("navDescriptions.accounting-coa"), heroActions)}</div>${coaList.view()}`;
}

function initAccountingCoa() {
  coaList.init();
  bindExportMenu("coa-export", coaDoExport);
  document.getElementById("coa-add")?.addEventListener("click", () => coaOpenForm(null));
  document.getElementById("coa-export-csv")?.addEventListener("click", () => { closeAllRowKebabs(); coaDoExport("csv"); });
  document.getElementById("coa-export-xlsx")?.addEventListener("click", () => { closeAllRowKebabs(); coaDoExport("xlsx"); });
  document.getElementById("coa-add-m")?.addEventListener("click", () => { closeAllRowKebabs(); coaOpenForm(null); });
}

// ---- Форма создания/редактирования счёта --------------------------------------------------------
function coaParentOptions(editing) {
  return COA_ACCOUNTS.filter((a) => a.nodeType === "GROUP" && a.status === "ACTIVE" && a !== editing).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
}

function coaTagOptions(editing) {
  const taken = new Set(COA_ACCOUNTS.filter((a) => a !== editing && a.tag).map((a) => a.tag));
  return [{ value: "", label: co("form.tagNone") }, ...coaKnownTags().filter((tg) => !taken.has(tg) || (editing && editing.tag === tg)).map((tg) => ({ value: tg, label: tg }))];
}

function coaOpenForm(account, presetParentCode) {
  const f = co("fields");
  const m = co("form");
  const isEdit = !!account;
  const parentOptions = coaParentOptions(account);
  const defaultParent = presetParentCode && parentOptions.some((o) => o.value === presetParentCode) ? presetParentCode : parentOptions[0] ? parentOptions[0].value : "";
  const html = `
    ${vbInput("coa-code", `${f.code} *`, isEdit ? account.code : "", isEdit ? "disabled" : "")}
    ${vbInput("coa-name", `${f.name} *`, isEdit ? account.name : "")}
    ${vbTextarea("coa-desc", f.description, isEdit ? account.description || "" : "", 2)}
    ${isEdit ? "" : vbSelect("coa-parent", `${f.parent} *`, parentOptions, defaultParent)}
    ${vbSelect("coa-nodeType", f.nodeType, ["ANALYTICAL", "GROUP", "TECHNICAL"].map((v) => ({ value: v, label: co(`nodeType.${v}`) })), isEdit ? account.nodeType : "ANALYTICAL", isEdit ? "disabled" : "")}
    ${vbSelect("coa-currency", f.currency, [{ value: "", label: f.currencyAny }, ...["EUR", "USD", "GBP"].map((c) => ({ value: c, label: c }))], isEdit ? account.currency || "" : "", isEdit ? "disabled" : "")}
    <label class="filters-field vb-field"><span class="filters-field-label"><input type="checkbox" id="coa-allowManual"${isEdit ? (account.allowManualEntry ? " checked" : "") : ""} /> ${f.allowManual}</span></label>
    ${vbSelect("coa-tag", f.tag, coaTagOptions(account), isEdit ? account.tag || "" : "")}
    <p class="table-cell-muted">${m.tagHint}</p>
  `;
  vbOpenForm({
    title: isEdit ? m.editTitle : m.addTitle,
    width: 560,
    intro: isEdit ? m.editIntro : m.createIntro,
    fieldsHtml: html,
    submitLabel: isEdit ? co("actions.save") : co("actions.create"),
    onSubmit: (el) => {
      const code = el.querySelector("#coa-code").value.trim();
      const name = el.querySelector("#coa-name").value.trim();
      const description = el.querySelector("#coa-desc").value.trim() || null;
      const nodeType = el.querySelector("#coa-nodeType").value;
      const currency = el.querySelector("#coa-currency").value || null;
      const allowManualEntry = el.querySelector("#coa-allowManual").checked;
      const tag = (nodeType === "GROUP" ? "" : el.querySelector("#coa-tag").value) || null;

      if (!name) return m.errName;
      if (COA_ACCOUNTS.some((a) => a !== account && a.name.toLowerCase() === name.toLowerCase())) return m.errNameExists;
      if (tag && COA_ACCOUNTS.some((a) => a !== account && a.tag === tag)) return m.errTagInUse;

      if (!isEdit) {
        if (!/^\d{4,6}$/.test(code)) return m.errCodeFormat;
        if (coaByCode(code)) return m.errCodeExists;
        const parentCode = el.querySelector("#coa-parent").value;
        const parent = coaByCode(parentCode);
        if (!parent) return m.errParent;
        if (parent.status !== "ACTIVE") return m.errParentInactive;
        if (coaDepth(parent) >= 2) return m.errDepth;
        closeModal();
        const now = pdNow();
        COA_ACCOUNTS.push(
          coaStamp(
            {
              id: seedToPaymentUuid(Date.now() % 100000 + 60000),
              code,
              name,
              category: parent.category,
              normalBalance: parent.normalBalance,
              nodeType,
              parentCode,
              currency,
              isSystem: false,
              isTechnical: nodeType === "TECHNICAL",
              allowManualEntry,
              tag,
              balance: nodeType === "GROUP" ? null : 0,
              description,
              status: "ACTIVE",
              alertThreshold: null,
            },
            now
          )
        );
        render();
        return null;
      }

      closeModal();
      Object.assign(account, { name, description, allowManualEntry, tag });
      coaStamp(account, account.createdDate, pdNow());
      render();
      return null;
    },
  });
}

// ---- Привязка существующего ВА/РА к счёту (установка/снятие .tag) --------------------------------
function coaOpenLinkForm(a) {
  const candidates = coaAllAccountInstances().filter((x) => x.tag !== a.tag);
  if (!candidates.length) { showToast(co("actions.noCandidates")); return; }
  const options = candidates.map((x) => ({ value: `${x.kind}:${x.id}`, label: `${x.code} · ${x.client ? x.client.name : x.description || x.kind}${x.tag ? ` (${x.tag})` : ""}` }));
  vbOpenForm({
    title: co("actions.linkTitle"),
    width: 520,
    intro: co("actions.linkIntro")(a.tag),
    fieldsHtml: vbSelect("coa-link-acc", co("fields.account"), options, options[0].value),
    submitLabel: co("actions.link"),
    onSubmit: (el) => {
      const [kind, accId] = el.querySelector("#coa-link-acc").value.split(":");
      const acc = coaFindAccountInstance(kind, accId);
      if (!acc) return co("actions.errNotFound");
      closeModal();
      acc.tag = a.tag;
      render();
      showToast(co("actions.linkedToast"));
      return null;
    },
  });
}

// ---- Карточка счёта -------------------------------------------------------------------------------
function coaDetailActions(a) {
  const items = [];
  if (!a.isSystem) {
    if (a.status === "ACTIVE") items.push(vbActionItem("deactivate", co("actions.deactivate"), ICONS.lock));
    if (a.status === "INACTIVE") {
      items.push(vbActionItem("activate", co("actions.activate"), CHECK_ICON_SVG));
      items.push(vbActionItem("archive", co("actions.archive"), ICONS.box, true));
    }
  }
  if (a.nodeType === "GROUP") items.push(vbActionItem("addChild", co("actions.addChild"), PLUS_ICON_SVG));
  if (a.nodeType !== "GROUP" && a.tag) items.push(vbActionItem("link", co("actions.link"), PLUS_ICON_SVG));
  const primary = a.isSystem ? "" : `<button type="button" class="btn-secondary" data-coa-action="edit">${vt("common.edit")}</button>`;
  return vbHeaderActions(primary, items);
}

function viewAccountingCoaDetail(id) {
  const a = coaById(id);
  if (!a) return vbNotFound();
  const f = co("fields");
  const d = co("detail");
  const parent = coaParent(a);
  const children = coaChildren(a.code);

  const main = `<div class="profile-fields profile-fields-grid">
    ${copyableField(f.code, a.code)}
    ${detailField(f.category, coaCategoryBadge(a.category))}
    ${detailField(f.normalBalance, co(`normalBalance.${a.normalBalance}`))}
    ${detailField(f.nodeType, co(`nodeType.${a.nodeType}`))}
    ${detailField(f.parent, parent ? `<button type="button" class="table-link" data-coa-hash="#/accounting-coa/${parent.id}">${pdEscape(parent.code)} · ${pdEscape(parent.name)}</button>` : "—")}
    ${detailField(f.currency, a.currency || f.currencyAny)}
    ${detailField(f.balance, `${coaBalanceDisplay(a)}${a.nodeType === "GROUP" ? `<div class="table-cell-muted">${d.groupBalanceHint}</div>` : ""}`)}
    ${detailField(f.allowManual, a.allowManualEntry ? co("yes") : co("no"))}
    ${a.nodeType !== "GROUP" ? detailField(f.tag, a.tag ? `<code>${a.tag}</code>` : `<span class="table-cell-muted">${d.noTag}</span>`) : ""}
    ${detailField(f.description, a.description ? pdEscape(a.description) : "—")}
    ${detailField(f.created, a.createdAt)}${detailField(f.updated, a.updatedAt)}
  </div>`;

  const linkedAccounts = a.nodeType !== "GROUP" && a.tag ? coaLinkedAccountsTable(a) : `<div class="table-cell-muted">${a.tag ? "" : d.noTagHint}</div>`;

  const childrenTable = vbMiniTable(
    [co("columns.code"), f.category, co("columns.balance"), co("columns.status")],
    children.map((c) => [`<button type="button" class="table-link" data-coa-hash="#/accounting-coa/${c.id}">${pdEscape(c.code)} · ${pdEscape(c.name)}</button>`, co(`category.${c.category}`), coaBalanceDisplay(c), coaStatusBadge(c.status)]),
    d.noChildren
  );

  const flags = `<div class="profile-fields profile-fields-grid profile-fields-grid-1">
    ${detailField(f.isSystem, a.isSystem ? co("yes") : co("no"))}
    ${detailField(f.isTechnical, a.isTechnical ? co("yes") : co("no"))}
  </div>`;

  // Проводки — только у аналитических/технических счетов: на группу проводки не создаются (§2.1 FRD).
  // Это настоящие проводки привязанных по тегу ВА/РА (coaEntriesForAccount), не запись отдельного журнала.
  const entries = a.nodeType === "GROUP" ? [] : coaEntriesForAccount(a).slice(0, 15);
  const entriesTable = vbMiniTable(
    [co("columns.account"), co("columns.drCr"), co("columns.amount"), co("columns.status"), co("columns.date")],
    entries.map((tx) => [
      `<button type="button" class="table-link" data-coa-acc-hash="${accHref(tx.accountRef)}">${pdEscape(tx.accountRef.code)}</button>`,
      `<span class="badge badge-neutral">${accEnum("transferType", tx.transferType)}</span>`,
      coaFormatMoney(tx.amount, tx.currency),
      accTxStatusBadge(tx.status),
      dateTimeCell(tx.createdAt),
    ]),
    d.noEntries
  );

  return `<div id="coa-root">
    ${vbDetailHeader({ backHash: "#/accounting-coa", title: `${pdEscape(a.code)} · ${pdEscape(a.name)}`, badges: `${coaCategoryBadge(a.category)}${coaStatusBadge(a.status)}`, subtitle: a.createdAt, actions: coaDetailActions(a) })}
    <div class="client-detail-grid">
      <div class="client-detail-grid-main"><div class="profile-flat-block">
        ${flatSection(co("sections.main"), main)}
        ${a.nodeType === "GROUP" ? "" : flatSection(`${co("sections.linkedAccounts")} · ${coaLinkedAccounts(a).length}`, linkedAccounts)}
        ${a.nodeType === "GROUP" ? flatSection(`${co("sections.children")} · ${children.length}`, childrenTable) : flatSection(`${co("sections.entries")} · ${entries.length}`, entriesTable)}
      </div></div>
      <div class="client-detail-grid-side">${sectionCard(co("sections.flags"), flags, "is-collapsed")}</div>
    </div>
  </div>`;
}

function initAccountingCoaDetail(id) {
  const a = coaById(id);
  const root = document.getElementById("coa-root");
  if (!a || !root) return;
  vbAttachCommon(root);
  root.querySelectorAll("[data-coa-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.coaHash; }));
  root.querySelectorAll("[data-coa-acc-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.coaAccHash; }));
  root.querySelectorAll("[data-coa-unlink]").forEach((b) =>
    b.addEventListener("click", () => {
      const [kind, accId] = b.dataset.coaUnlink.split(":");
      const acc = coaFindAccountInstance(kind, accId);
      if (!acc) return;
      vbConfirm({ title: co("actions.unlinkTitle"), text: co("actions.unlinkText")(acc.code), confirmLabel: co("actions.unlink"), danger: true, onConfirm: () => { acc.tag = null; render(); } });
    })
  );
  root.querySelectorAll("[data-coa-action], [data-vb-action]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.coaAction || b.dataset.vbAction;
      if (act === "edit") coaOpenForm(a);
      if (act === "addChild") coaOpenForm(null, a.code);
      if (act === "link") coaOpenLinkForm(a);
      if (act === "deactivate") {
        if (coaHasNonzeroBalance(a)) { showToast(co("actions.deactivateBlockedBalance")); return; }
        vbConfirm({ title: co("actions.deactivateTitle"), text: co("actions.deactivateText")(pdEscape(a.name)), confirmLabel: co("actions.deactivate"), danger: true, onConfirm: () => { a.status = "INACTIVE"; coaStamp(a, a.createdDate, pdNow()); render(); } });
      }
      if (act === "activate") {
        vbConfirm({ title: co("actions.activateTitle"), text: co("actions.activateText")(pdEscape(a.name)), confirmLabel: co("actions.activate"), danger: false, onConfirm: () => { a.status = "ACTIVE"; coaStamp(a, a.createdDate, pdNow()); render(); } });
      }
      if (act === "archive") {
        if (a.status !== "INACTIVE") { showToast(co("actions.archiveBlockedStatus")); return; }
        if (coaHasNonzeroBalance(a)) { showToast(co("actions.archiveBlockedBalance")); return; }
        vbConfirm({ title: co("actions.archiveTitle"), text: co("actions.archiveText")(pdEscape(a.name)), confirmLabel: co("actions.archive"), danger: true, onConfirm: () => { a.status = "ARCHIVED"; coaStamp(a, a.createdDate, pdNow()); render(); } });
      }
    })
  );
}
