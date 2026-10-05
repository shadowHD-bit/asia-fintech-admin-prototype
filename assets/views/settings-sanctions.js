/* ==========================================================================
   "Настройки системы → Санкционные списки → Физлица / Юрлица": два пункта сайдбара, у каждого своя страница-таблица.
   Спецификация: docs/settings-sanctions-spec.md; данные —
   mock/settings-sanctions.mock.js. Списки построены на заготовке
   createAccessList (views/settings-access.js), формы и подтверждения — на
   хелперах vbOpenForm / vbConfirm (views/settings-vabs.js).
   ========================================================================== */

function sl(path) {
  return t(`sanctions.${path}`);
}

// ---- Отображение ------------------------------------------------------------------------------
function slCountryCell(id) {
  const c = id ? findCountry(id) : null;
  return c ? `<span class="table-country"><span class="flag-icon">${c.flag}</span>${SL_ALPHA3[id]}</span>` : "—";
}

function slDob(r) {
  if (!r.dobYear) return "—";
  const p = (n) => (n ? String(n).padStart(2, "0") : "xx");
  return `${p(r.dobDay)}.${p(r.dobMonth)}.${r.dobYear}`;
}

function slFioEn(r) {
  return [r.lastNameEn, r.firstNameEn, r.middleNameEn].filter(Boolean).join(" ");
}

function slDobKind(r) {
  return r.dobYear && r.dobMonth && r.dobDay ? "full" : r.dobYear ? "partial" : "none";
}

function slTrunc(value, wide) {
  return value ? `<span class="table-truncate ${wide ? "table-truncate-wide" : ""}" title="${escapeAttr(value)}">${pdEscape(value)}</span>` : "—";
}

function slRowActions(kind, r) {
  const items = kind === "countries"
    ? [{ label: sl("actions.delete"), icon: TRASH_ICON_SVG, danger: true, attrs: `data-sl-del="${r.id}"` }]
    : [
        { label: sl("actions.edit"), icon: EDIT_ICON_SVG, attrs: `data-sl-edit="${r.id}"` },
        { label: sl("actions.delete"), icon: TRASH_ICON_SVG, danger: true, attrs: `data-sl-del="${r.id}"` },
      ];
  return `<div class="sl-actions">${rowKebabMenu(`sl-row-${r.id}`, items)}</div>`;
}

// Каждое значение в таблице копируется: значок копирования рядом со значением (пустое значение — прочерк)
function slCopy(value, html) {
  if (value == null || value === "" || value === "—") return "—";
  return `<span class="sl-copy" data-sl-copy="${escapeAttr(String(value))}">${html != null ? html : pdEscape(String(value))}<span class="sl-copy-check">${CHECK_ICON_SVG}</span></span>`;
}

// Главная колонка: значение и под ним ID записи (тоже копируется)
function slNameCell(value, r, html) {
  return `<div class="identity-cell">${slCopy(value, html)}<div class="identity-cell-sub"><span class="identity-cell-tag">ID</span><span class="sl-copy" data-sl-copy="${r.code}">${r.code}<span class="sl-copy-check">${CHECK_ICON_SVG}</span></span></div></div>`;
}
function slRecords(kind) {
  return kind === "individuals" ? SANCTION_INDIVIDUALS : kind === "companies" ? SANCTION_COMPANIES : SANCTION_COUNTRIES;
}

function slTitleOf(kind, r) {
  if (kind === "individuals") return [r.lastName, r.firstName, r.middleName].filter(Boolean).join(" ");
  if (kind === "companies") return r.name;
  return r.countryId ? findCountry(r.countryId).name : "—";
}

function slIdCell(r) {
  return `<div class="identity-cell-primary"><button type="button" class="id-copy" data-copy-value="${r.code}" title="${t("clientsUsers.copy")}"><span class="id-copy-label">${r.code}</span>${COPY_ICON_SVG}</button></div>`;
}

function slAttachRows(kind) {
  return (wrap) => {
    const records = () => slRecords(kind);
    wrap.querySelectorAll("[data-sl-copy]").forEach((el) => el.addEventListener("click", () => copyTextToClipboard(el.dataset.slCopy).then(() => { el.classList.add("is-copied"); setTimeout(() => el.classList.remove("is-copied"), 900); })));
    wrap.querySelectorAll("[data-sl-edit]").forEach((b) => b.addEventListener("click", () => slOpenForm(kind, records().find((r) => r.id === b.dataset.slEdit))));
    wrap.querySelectorAll("[data-sl-del]").forEach((b) => b.addEventListener("click", () => slConfirmDelete(kind, records().find((r) => r.id === b.dataset.slDel))));
  };
}

// Действия списка в шапке экрана: «Экспорт» (CSV / XLSX) и меню «⋯» — добавить, импорт, перепроверка
function slBarActions(kind) {
  const items = [
    { label: sl("actions.add"), icon: PLUS_ICON_SVG, attrs: `data-sl-more="add"` },
    { label: sl("actions.import"), icon: UPLOAD_ICON_SL, attrs: `data-sl-more="import"` },
  ];
  if (kind !== "countries") items.push({ label: sl("actions.rerun"), icon: ICONS.lock, attrs: `data-sl-more="rerun"` });
  return () => `${sectionHintBtn(`sl-hint-btn-${kind}`, sl(`info.${kind}`))}${exportMenuHtml("sl-export", sl("export.button"), sl("export.hint"))}${rowKebabMenu(`sl-more-${kind}`, items)}`;
}

const UPLOAD_ICON_SL = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12V3m0 0L6.5 6.5M10 3l3.5 3.5M4 14v2h12v-2"/></svg>`;

function slAttachBar(kind) {
  return () => {
    bindExportMenu("sl-export", (format) => slOpenExportModal(kind, format));
    document.querySelectorAll("[data-sl-more]").forEach((b) =>
      b.addEventListener("click", () => {
        const act = b.dataset.slMore;
        if (act === "add") slOpenForm(kind, null);
        else if (act === "import") slOpenImport(kind);
        else if (act === "rerun") slConfirmRerun(kind);
      })
    );
  };
}
// ---- Списки -----------------------------------------------------------------------------------------
const slIndividualsList = createAccessList({
  key: "sl-ind",
  data: () => SANCTION_INDIVIDUALS,
  searchPlaceholder: () => sl("search.individuals"),
  searchText: (r) => [r.lastName, r.firstName, r.middleName, r.lastNameEn, r.firstNameEn, r.middleNameEn, r.externalId, r.code].filter(Boolean).join(" "),
  tab: null,
  filters: [
    { id: "created", kind: "date", label: () => sl("filters.created"), get: (r) => r.createdDate },
    { id: "country", kind: "multi", label: () => sl("filters.country"), get: (r) => r.countryId || "", options: () => COUNTRY_OPTIONS.map((c) => ({ value: c.id, label: `${SL_ALPHA3[c.id]} · ${c.name}` })) },
    { id: "year", kind: "multi", label: () => sl("filters.birthYear"), get: (r) => r.dobYear || "", options: () => [...new Set(SANCTION_INDIVIDUALS.map((r) => r.dobYear).filter(Boolean))].sort((a, b) => a - b).map((y) => ({ value: String(y), label: String(y) })) },
    { id: "dobKind", kind: "multi", label: () => sl("filters.dobKind"), get: slDobKind, options: () => ["full", "partial", "none"].map((v) => ({ value: v, label: sl(`dobKind.${v}`) })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: {},
  columns: [
    { label: () => sl("columns.lastName"), html: (r) => slNameCell(r.lastName, r) },
    { label: () => sl("columns.firstName"), html: (r) => slCopy(r.firstName) },
    { label: () => sl("columns.middleName"), html: (r) => slCopy(r.middleName) },
    { label: () => sl("columns.fioEn"), html: (r) => slCopy(slFioEn(r), slTrunc(slFioEn(r), false)) },
    { label: () => sl("columns.dob"), html: (r) => slCopy(slDob(r)) },
    { label: () => sl("columns.country"), html: (r) => slCopy(r.countryId ? SL_ALPHA3[r.countryId] : "", slCountryCell(r.countryId)) },
    { label: () => sl("columns.region"), html: (r) => slCopy(r.state) },
    { label: () => sl("columns.city"), html: (r) => slCopy(r.city) },
    { label: () => sl("columns.created"), html: (r) => slCopy(r.createdAt, dateTimeCell(r.createdAt)) },
    { label: () => sl("columns.updated"), html: (r) => slCopy(r.updatedAt, dateTimeCell(r.updatedAt)) },
    { label: () => "", html: (r) => slRowActions("individuals", r) },
  ],  attachRows: slAttachRows("individuals"),
});

const slCompaniesList = createAccessList({
  key: "sl-com",
  data: () => SANCTION_COMPANIES,
  searchPlaceholder: () => sl("search.companies"),
  searchText: (r) => [r.name, r.nameEn, r.tin, r.okpo, r.registrationNumber, r.founderFullName, r.externalId, r.code].filter(Boolean).join(" "),
  tab: null,
  filters: [
    { id: "created", kind: "date", label: () => sl("filters.created"), get: (r) => r.createdDate },
    { id: "country", kind: "multi", label: () => sl("filters.country"), get: (r) => r.countryId || "", options: () => COUNTRY_OPTIONS.map((c) => ({ value: c.id, label: `${SL_ALPHA3[c.id]} · ${c.name}` })) },
    { id: "identifiers", kind: "multi", label: () => sl("filters.identifiers"), get: (r) => { const v = []; if (r.tin) v.push("tin"); if (r.okpo) v.push("okpo"); if (r.registrationNumber) v.push("reg"); return v.length ? v : ["none"]; }, options: () => ["tin", "okpo", "reg", "none"].map((v) => ({ value: v, label: sl(`identifiers.${v}`) })) },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: {},
  columns: [
    { label: () => sl("columns.name"), html: (r) => slNameCell(r.name, r, `<span class="sl-name" title="${escapeAttr(r.name)}">${pdEscape(r.name)}</span>`) },
    { label: () => sl("columns.nameEn"), html: (r) => slCopy(r.nameEn, slTrunc(r.nameEn, false)) },
    { label: () => sl("columns.tin"), html: (r) => slCopy(r.tin) },
    { label: () => sl("columns.okpo"), html: (r) => slCopy(r.okpo) },
    { label: () => sl("columns.regNumber"), html: (r) => slCopy(r.registrationNumber) },
    { label: () => sl("columns.country"), html: (r) => slCopy(r.countryId ? SL_ALPHA3[r.countryId] : "", slCountryCell(r.countryId)) },
    { label: () => sl("columns.founder"), html: (r) => slCopy(r.founderFullName, slTrunc(r.founderFullName, true)) },
    { label: () => sl("columns.activity"), html: (r) => slCopy(r.activityCode) },
    { label: () => sl("columns.address"), html: (r) => slCopy(r.address, slTrunc(r.address, true)) },
    { label: () => sl("columns.created"), html: (r) => slCopy(r.createdAt, dateTimeCell(r.createdAt)) },
    { label: () => sl("columns.updated"), html: (r) => slCopy(r.updatedAt, dateTimeCell(r.updatedAt)) },
    { label: () => "", html: (r) => slRowActions("companies", r) },
  ],  attachRows: slAttachRows("companies"),
});

const slCountriesList = createAccessList({
  key: "sl-cty",
  data: () => SANCTION_COUNTRIES,
  searchPlaceholder: () => sl("search.countries"),
  searchText: (r) => [r.countryId ? findCountry(r.countryId).name : "", r.countryId ? SL_ALPHA3[r.countryId] : "", r.code].filter(Boolean).join(" "),
  tab: null,
  filters: [
    { id: "created", kind: "date", label: () => sl("filters.created"), get: (r) => r.createdDate },
  ],
  defaultSort: (a, b) => b.createdDate - a.createdDate,
  sorts: {},
  columns: [
    { label: () => sl("columns.country"), html: (r) => slNameCell(r.countryId ? SL_ALPHA3[r.countryId] : "", r, slCountryCell(r.countryId)) },
    { label: () => sl("columns.created"), html: (r) => slCopy(r.createdAt, dateTimeCell(r.createdAt)) },
    { label: () => "", html: (r) => slRowActions("countries", r) },
  ],  attachRows: slAttachRows("countries"),
});

function slListOf(kind) {
  return kind === "individuals" ? slIndividualsList : kind === "companies" ? slCompaniesList : slCountriesList;
}

// ---- Экран (каждый список — отдельный пункт сайдбара) ---------------------------------------------------
function viewSanctions(kind) {
  return `
    <div class="list-hero">${pageHeader(sl(`titles.${kind}`), t(`navDescriptions.settings-sanctions-${kind}`), slBarActions(kind)())}</div>
    ${slListOf(kind).view()}
  `;
}

function initSanctions(kind) {
  slListOf(kind).init();
  slAttachBar(kind)();
}
// ---- Добавление и изменение --------------------------------------------------------------------------
function slCountryOptions() {
  return [{ value: "", label: "—" }, ...COUNTRY_OPTIONS.map((c) => ({ value: c.id, label: `${SL_ALPHA3[c.id]} · ${c.name}` }))];
}

function slNum(el, id) {
  const raw = el.querySelector(id).value.trim();
  return raw === "" ? null : /^\d+$/.test(raw) ? Number(raw) : NaN;
}

function slIndividualFields(r) {
  const f = sl("fields");
  const v = (x) => (x == null ? "" : String(x));
  return `<div class="sl-section-title">${sl("form.ru")}</div>
    <div class="sl-grid">${vbInput("sl-last", `${f.lastName} *`, v(r && r.lastName))}${vbInput("sl-first", `${f.firstName} *`, v(r && r.firstName))}${vbInput("sl-middle", f.middleName, v(r && r.middleName))}</div>
    <div class="sl-section-title">${sl("form.en")}</div>
    <div class="sl-grid">${vbInput("sl-last-en", `${f.lastNameEn} *`, v(r && r.lastNameEn))}${vbInput("sl-first-en", `${f.firstNameEn} *`, v(r && r.firstNameEn))}${vbInput("sl-middle-en", f.middleNameEn, v(r && r.middleNameEn))}</div>
    <div class="sl-section-title">${sl("form.dob")}</div>
    <div class="sl-grid sl-grid-3">${vbInput("sl-day", f.dobDay, v(r && r.dobDay), 'inputmode="numeric" placeholder="дд"')}${vbInput("sl-month", f.dobMonth, v(r && r.dobMonth), 'inputmode="numeric" placeholder="мм"')}${vbInput("sl-year", f.dobYear, v(r && r.dobYear), 'inputmode="numeric" placeholder="гггг"')}</div>
    <div class="sl-section-title">${sl("form.place")}</div>
    <div class="sl-grid">${vbSelect("sl-country", f.country, slCountryOptions(), r && r.countryId ? r.countryId : "")}${vbInput("sl-state", f.region, v(r && r.state))}${vbInput("sl-city", f.city, v(r && r.city))}</div>`;
}

function slReadIndividual(el) {
  const e = sl("form.errors");
  const txt = (id) => el.querySelector(id).value.trim();
  const val = (s) => (s.length ? s : null);
  const lastName = txt("#sl-last"), firstName = txt("#sl-first"), middleName = val(txt("#sl-middle"));
  const lastNameEn = txt("#sl-last-en"), firstNameEn = txt("#sl-first-en"), middleNameEn = val(txt("#sl-middle-en"));
  if (lastName.length < 2 || firstName.length < 2) return { error: e.ru };
  if (lastNameEn.length < 2 || firstNameEn.length < 2) return { error: e.en };
  const latin = /^[A-Za-z' .-]+$/;
  if (![lastNameEn, firstNameEn, middleNameEn].filter(Boolean).every((x) => latin.test(x))) return { error: e.latin };
  const day = slNum(el, "#sl-day"), month = slNum(el, "#sl-month"), year = slNum(el, "#sl-year");
  if ([day, month, year].some((x) => Number.isNaN(x))) return { error: e.dobNumber };
  if (year !== null && (year < 1900 || year > 2026)) return { error: e.dobYear };
  if (month !== null && (month < 1 || month > 12)) return { error: e.dobMonth };
  if (day !== null && (day < 1 || day > 31)) return { error: e.dobDay };
  if ((month !== null && year === null) || (day !== null && (month === null || year === null))) return { error: e.dobPartial };
  if (day !== null && new Date(year, month - 1, day).getMonth() !== month - 1) return { error: e.dobInvalid };
  const countryId = txt("#sl-country") || null;
  return { rec: { lastName, firstName, middleName, lastNameEn, firstNameEn, middleNameEn, dobDay: day, dobMonth: month, dobYear: year, countryId, state: val(txt("#sl-state")), city: val(txt("#sl-city")) } };
}

function slCompanyFields(r) {
  const f = sl("fields");
  const v = (x) => (x == null ? "" : String(x));
  return `${vbInput("sl-name", `${f.name} *`, v(r && r.name))}${vbInput("sl-name-en", f.nameEn, v(r && r.nameEn))}
    <div class="sl-grid sl-grid-3">${vbInput("sl-reg", f.regNumber, v(r && r.registrationNumber))}${vbInput("sl-tin", f.tin, v(r && r.tin))}${vbInput("sl-okpo", f.okpo, v(r && r.okpo))}</div>
    <div class="sl-grid">${vbSelect("sl-country", f.country, slCountryOptions(), r && r.countryId ? r.countryId : "")}${vbInput("sl-activity", f.activity, v(r && r.activityCode))}</div>
    ${vbInput("sl-founder", f.founder, v(r && r.founderFullName))}${vbInput("sl-address", f.address, v(r && r.address))}
    <p class="table-cell-muted sl-hint">${sl("form.companyHint")}</p>`;
}

function slReadCompany(el) {
  const txt = (id) => el.querySelector(id).value.trim();
  const val = (s) => (s.length ? s : null);
  const name = txt("#sl-name");
  if (name.length < 2) return { error: sl("form.errors.name") };
  return {
    rec: {
      name, nameEn: val(txt("#sl-name-en")), registrationNumber: val(txt("#sl-reg")), tin: slDigits(txt("#sl-tin")), okpo: slDigits(txt("#sl-okpo")),
      countryId: txt("#sl-country") || null, founderFullName: val(txt("#sl-founder")), activityCode: val(txt("#sl-activity")), address: val(txt("#sl-address")),
    },
  };
}

function slCountryFields() {
  const f = sl("countryForm");
  return `<div class="sl-grid">${vbSelect("sl-cty-country", f.country, slCountryOptions(), "")}</div>`;
}

function slReadCountryForm(el) {
  const f = sl("countryForm");
  const countryId = el.querySelector("#sl-cty-country").value.trim() || null;
  if (!countryId) return { error: f.errCountry };
  if (SANCTION_COUNTRIES.some((r) => r.countryId === countryId)) return { error: f.errDuplicate };
  return { rec: { countryId } };
}

function slOpenForm(kind, r) {
  if (kind === "countries") {
    vbOpenForm({
      title: sl("countryForm.addTitle"),
      width: 420,
      fieldsHtml: slCountryFields(),
      submitLabel: vt("common.create"),
      onSubmit: (el) => {
        const res = slReadCountryForm(el);
        if (res.error) return res.error;
        closeModal();
        const now = pdNow();
        const newId = Date.now() % 100000 + 70000;
        SANCTION_COUNTRIES.unshift(slStamp(Object.assign({ id: seedToPaymentUuid(newId), code: entityCode("SLN", newId) }, res.rec), now));
        render();
        return null;
      },
    });
    return;
  }
  const isInd = kind === "individuals";
  const title = isInd ? (r ? sl("form.editIndividual") : sl("form.addIndividual")) : r ? sl("form.editCompany") : sl("form.addCompany");
  vbOpenForm({
    title,
    width: 620,
    intro: r ? null : sl("form.addNote"),
    fieldsHtml: isInd ? slIndividualFields(r) : slCompanyFields(r),
    submitLabel: r ? vt("common.save") : vt("common.create"),
    onSubmit: (el) => {
      const res = isInd ? slReadIndividual(el) : slReadCompany(el);
      if (res.error) return res.error;
      closeModal();
      const now = pdNow();
      if (r) {
        Object.assign(r, res.rec);
        if (!isInd) slRecomputeCompany(r);
        r.updatedDate = now;
        r.updatedAt = formatDateTime(now);
      } else {
        const newId = Date.now() % 100000 + 70000;
        const rec = slStamp(Object.assign({ id: seedToPaymentUuid(newId), code: entityCode(isInd ? "SLI" : "SLC", newId), externalId: null }, res.rec), now);
        if (!isInd) slRecomputeCompany(rec);
        slRecords(kind).unshift(rec);
      }
      render();
      return null;
    },
  });
}

// ---- Удаление и очистка ----------------------------------------------------------------------------------
function slConfirmDelete(kind, r) {
  if (!r) return;
  vbConfirm({
    title: sl("delete.title"),
    text: sl("delete.text")(pdEscape(slTitleOf(kind, r))),
    confirmLabel: sl("actions.delete"),
    danger: true,
    onConfirm: () => {
      const list = slRecords(kind);
      list.splice(list.indexOf(r), 1);
      render();
    },
  });
}

// ---- Импорт CSV -----------------------------------------------------------------------------------------------
function slCsvNorm(value) {
  if (value == null) return null;
  const s = value.trim();
  return s.length < 2 ? null : s;
}

// Правила разбора — как в ChecklistImportService: .csv, шапка + строки, разделитель ";", число колонок,
// обязательные поля; поле короче 2 символов считается пустым; дата дд.мм.гггг; страна Alpha-3
function slParseCsv(kind, filename, text) {
  const m = sl("import");
  if (!/\.csv$/i.test(filename)) return { error: m.errExt };
  const lines = text.replace(/^﻿/, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { error: m.errRows };
  if (kind === "countries") {
    const now = pdNow();
    const records = [];
    for (let i = 1; i < lines.length; i += 1) {
      const alpha3 = slCsvNorm(lines[i]);
      const countryId = alpha3 ? slCountryByAlpha3(alpha3) : null;
      if (!countryId) return { error: m.errRow(i + 1, "country") };
      const newId = Date.now() % 100000 + 80000 + i;
      records.push(slStamp({ id: seedToPaymentUuid(newId), code: entityCode("SLN", newId), countryId }, now));
    }
    return { records };
  }
  const expected = kind === "individuals" ? 10 : 8;
  if (!lines[1].includes(";")) return { error: m.errDelimiter };
  const got = lines[1].split(";").length;
  if (got !== expected) return { error: m.errColumns(expected, got) };
  const now = pdNow();
  const records = [];
  for (let i = 1; i < lines.length; i += 1) {
    const c = lines[i].split(";");
    const rowNo = i + 1;
    const rowId = Date.now() % 100000 + 80000 + i;
    const base = { id: seedToPaymentUuid(rowId), code: entityCode(kind === "individuals" ? "SLI" : "SLC", rowId), externalId: String(rowNo) };
    if (kind === "individuals") {
      const [firstName, lastName, , firstNameEn, lastNameEn] = [0, 1, 2, 3, 4].map((k) => slCsvNorm(c[k]));
      const missing = [!firstName && "firstName", !lastName && "lastName", !firstNameEn && "firstNameEn", !lastNameEn && "lastNameEn"].filter(Boolean);
      if (missing.length) return { error: m.errRow(rowNo, missing.join(", ")) };
      const d = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((c[6] || "").trim());
      const alpha3 = slCsvNorm(c[7]);
      records.push(slStamp({
        ...base, firstName, lastName, middleName: slCsvNorm(c[2]), firstNameEn, lastNameEn, middleNameEn: slCsvNorm(c[5]),
        dobDay: d ? parseInt(d[1], 10) || null : null, dobMonth: d ? parseInt(d[2], 10) || null : null, dobYear: d ? parseInt(d[3], 10) || null : null,
        countryId: alpha3 ? slCountryByAlpha3(alpha3) : null, state: slCsvNorm(c[8]), city: slCsvNorm(c[9]),
      }, now));
    } else {
      const name = slCsvNorm(c[0]);
      if (!name) return { error: m.errRow(rowNo, "name") };
      const alpha3 = slCsvNorm(c[4]);
      records.push(slRecomputeCompany(slStamp({
        ...base, name, nameEn: null, registrationNumber: slCsvNorm(c[1]), tin: slDigits(slCsvNorm(c[2])), okpo: slDigits(slCsvNorm(c[3])),
        countryId: alpha3 ? slCountryByAlpha3(alpha3) : null, founderFullName: slCsvNorm(c[5]), activityCode: slCsvNorm(c[6]), address: slCsvNorm(c[7]),
      }, now)));
    }
  }
  return { records };
}

// ---- Экспорт списка (CSV / XLSX): то, что показывает таблица — поиск, фильтры и сортировка, без учёта страницы ----------
function slOpenExportModal(kind, format) {
  const list = slListOf(kind);
  const x = sl("export");
  const count = list.exportRows().length;
  const lines = list.filterLines();
  const filtered = lines.length > 0;
  const fmt = format.toUpperCase();
  openModal({
    title: x.modalTitle[kind],
    width: 480,
    bodyHtml: filtered
      ? `<p class="modal-confirm-text">${x.filteredText(count)}</p><ul class="exp-filters">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      : `<p class="modal-confirm-text">${x.allText(list.count())}</p>`,
    footerHtml: filtered
      ? `<button type="button" class="btn-secondary" id="exp-cancel">${vt("common.cancel")}</button><button type="button" class="btn-primary" id="exp-go"${count ? "" : " disabled"}>${x.go(fmt)}</button>`
      : `<button type="button" class="btn-secondary" id="exp-filters">${x.applyFilters}</button><button type="button" class="btn-primary" id="exp-go">${x.go(fmt)}</button>`,
    onMount: (el) => {
      const cancel = el.querySelector("#exp-cancel");
      if (cancel) cancel.addEventListener("click", closeModal);
      const flt = el.querySelector("#exp-filters");
      if (flt) flt.addEventListener("click", () => { closeModal(); list.openFilters(); });
      el.querySelector("#exp-go").addEventListener("click", () => { closeModal(); slExportTable(kind, format); });
    },
  });
}

function slExportTable(kind, format) {
  const x = sl("export");
  const list = slListOf(kind).exportRows();
  const country = (r) => (r.countryId ? SL_ALPHA3[r.countryId] : "");
  const rows = list.map((r) =>
    kind === "individuals"
      ? [r.code, r.lastName, r.firstName, r.middleName || "", slFioEn(r), slDob(r) === "—" ? "" : slDob(r), country(r), r.state || "", r.city || "", r.createdAt, r.updatedAt]
      : kind === "companies"
      ? [r.code, r.name, r.nameEn || "", r.tin || "", r.okpo || "", r.registrationNumber || "", country(r), r.founderFullName || "", r.activityCode || "", r.address || "", r.createdAt, r.updatedAt]
      : [r.code, r.countryId ? findCountry(r.countryId).name : "", r.createdAt]
  );
  exportTable(`sanctions_${kind}_${new Date().toISOString().slice(0, 10)}`, format, x.columns[kind], rows);
  showToast(x.done(list.length));
}
function slCsvHeader(kind) {
  return sl(`import.header.${kind}`);
}

function slDownload(filename, content) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function slExportCsv(kind) {
  const rows = slRecords(kind).map((r) => {
    if (kind === "individuals") {
      const dob = r.dobYear ? `${String(r.dobDay || 0).padStart(2, "0")}.${String(r.dobMonth || 0).padStart(2, "0")}.${r.dobYear}` : "";
      return [r.firstName, r.lastName, r.middleName, r.firstNameEn, r.lastNameEn, r.middleNameEn, dob, r.countryId ? SL_ALPHA3[r.countryId] : "", r.state, r.city];
    }
    if (kind === "companies") return [r.name, r.registrationNumber, r.tin, r.okpo, r.countryId ? SL_ALPHA3[r.countryId] : "", r.founderFullName, r.activityCode, r.address];
    return [r.countryId ? SL_ALPHA3[r.countryId] : ""];
  });
  slDownload(`sanctioned-${kind}.csv`, [slCsvHeader(kind), ...rows.map((c) => c.map((x) => (x == null ? "" : String(x).replace(/;/g, ","))).join(";"))].join("\n"));
}

function slOpenImport(kind) {
  const m = sl("import");
  let parsed = null;
  openModal({
    title: m.title[kind],
    width: 600,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${kind === "countries" ? m.introCountries : m.intro}</p>
      <div class="sl-format"><div class="sl-format-title">${m.formatTitle}</div><code class="vb-mono">${pdEscape(slCsvHeader(kind))}</code><div class="table-cell-muted">${m.format[kind]}</div></div>
      <div class="sl-import-tools"><button type="button" class="btn-secondary" id="sl-template">${m.template}</button><button type="button" class="btn-secondary" id="sl-export">${m.exportCurrent}</button></div>
      <label class="filters-field vb-field"><span class="filters-field-label">${m.file}</span><input type="file" id="sl-file" accept=".csv" /></label>
      <div class="sl-import-result" id="sl-import-result"></div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="sl-cancel">${vt("common.cancel")}</button><button type="button" class="btn-danger" id="sl-do-import" disabled>${m.doImport}</button>`,
    onMount: (el) => {
      const box = el.querySelector("#sl-import-result");
      const go = el.querySelector("#sl-do-import");
      el.querySelector("#sl-cancel").addEventListener("click", closeModal);
      el.querySelector("#sl-template").addEventListener("click", () => slDownload(`sanctioned-${kind}-template.csv`, `${slCsvHeader(kind)}\n${m.templateRow[kind]}`));
      el.querySelector("#sl-export").addEventListener("click", () => slExportCsv(kind));
      el.querySelector("#sl-file").addEventListener("change", (ev) => {
        const file = ev.target.files[0];
        parsed = null;
        go.disabled = true;
        box.className = "sl-import-result";
        box.textContent = "";
        if (!file) return;
        file.text().then((text) => {
          const res = slParseCsv(kind, file.name, text);
          if (res.error) {
            box.className = "sl-import-result is-error";
            box.textContent = res.error;
            return;
          }
          parsed = res.records;
          box.className = "sl-import-result is-ok";
          box.textContent = m.readOk(res.records.length, slRecords(kind).length);
          go.disabled = false;
        });
      });
      go.addEventListener("click", () => {
        if (!parsed) return;
        const records = parsed;
        vbConfirm({
          title: m.confirmTitle,
          text: (kind === "countries" ? m.confirmTextCountries : m.confirmText)(records.length, slRecords(kind).length),
          confirmLabel: m.doImport,
          danger: true,
          onConfirm: () => {
            const list = slRecords(kind);
            list.splice(0, list.length, ...records.sort((a, b) => b.createdDate - a.createdDate));
            render();
            if (kind !== "countries") slRunRerun(kind, true);
          },
        });
      });
    },
  });
}

// ---- Перепроверка -----------------------------------------------------------------------------------------------------
function slConfirmRerun(kind) {
  const m = sl("rerun");
  vbConfirm({
    title: m.title[kind],
    text: m.text[kind],
    confirmLabel: m.confirmLabel,
    danger: kind === "individuals",
    onConfirm: () => slRunRerun(kind, false),
  });
}

function slRunRerun(kind, afterImport) {
  const m = sl("rerun");
  const res = kind === "individuals" ? slRerunIndividuals() : slRerunCompanies();
  const records = slRecords(kind);
  const rows = res.matches.map((x) => {
    const rec = records.find((r) => r.id === x.recordId);
    return [vbLink(x.link, pdEscape(x.client)), m.matchedBy[x.matchedBy], rec ? pdEscape(slTitleOf(kind, rec)) : "—"];
  });
  const body = `${afterImport ? `<p class="table-cell-muted">${m.afterImport}</p>` : ""}
    <p class="modal-confirm-text">${m.resultChecked(res.checked)} ${res.matches.length ? m.resultMatches(res.matches.length) : m.noMatches}</p>
    ${res.matches.length ? vbMiniTable([m.columns.client, m.columns.matchedBy, m.columns.record], rows, "") : ""}
    <p class="table-cell-muted sl-hint">${m.note[kind]}</p>`;
  openModal({
    title: m.resultTitle,
    width: 620,
    bodyHtml: body,
    footerHtml: `<button type="button" class="btn-primary" id="sl-r-close">${sl("actions.close")}</button>`,
    onMount: (el) => {
      el.querySelector("#sl-r-close").addEventListener("click", closeModal);
      vbAttachRows(el);
      el.querySelectorAll("[data-vb-hash]").forEach((b) => b.addEventListener("click", closeModal));
    },
  });
}












