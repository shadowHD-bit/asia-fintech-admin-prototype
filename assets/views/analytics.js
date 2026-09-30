/* ==========================================================================
   Вьюхи "Аналитика → Пользователи" и "Аналитика → Операции".

   Реального единого "Analytics"-API с этими двумя вкладками в бэкенде нет
   (проверено чтением обоих репозиториев 24.09.2026) — то, что есть по факту:
   - identity: отдельные resolver'ы `kycStatusStatistics`/`kycCountryStatistics`/
     `kycAgeGenderStatistics`/`kycScoringRiskLevelStatistics` (и их KYB-аналоги
     `kybStatusStatistics`/`kybCountryStatistics`/`kybScoringRiskLevelStatistics`,
     apps/identity/src/statistics) — каждый отдаёт {total, statistics:[{<срез>,
     count, percent}]}. Ровно эти 4 среза (статус/страна/риск/пол-возраст) и
     легли в основу вкладки "Пользователи" ниже, отдельно для физлиц (KYC) и
     юрлиц (KYB), как и разделены в реальных resolver'ах.
   - core (plugins/statistics-plugin): `usageAnalytics` — бизнес-метрики в
     срезах "сегодня"/"текущий месяц"/произвольный период, с разбивкой
     byCurrency: [{currencyTicker, amount, count}] на метрику. Именно эта форма
     (period-тумблер + разбивка по валюте с count+amount) взята за основу
     вкладки "Операции"; сами метрики там — DEPOSITS/WITHDRAWALS/EXCHANGES/
     OTC_DEALS/... по типам операций, а не общий group-by статус/рельс/
     направление — такого среза нет нигде, агрегация ниже полностью на
     стороне UI, поверх реальных enum'ов (PaymentStatusEnum/PaymentSystemEnum/
     PaymentDirectionEnum).
   - Ни для пользователей, ни для платежей НЕТ реальной ручки "рост по дням" —
     поэтому здесь нет линейного графика по датам, только срезы, которые
     реально к чему-то привязаны (текущее состояние базы / period-срез).

   Возрастные бакеты (18–25/26–35/…): свои для UI — у реальной системы состав
   диапазонов настраивается отдельным справочником (ageRangeStatisticSettings),
   конкретные границы нигде не подтверждены, поэтому это иллюстративная, а не
   вычитанная разбивка.

   Переиспользует общие хелперы (sectionCard, renderMetricCard, pageHeader,
   findCountry, kycStatusLabel, statusBadgeClass, riskLevelLabel,
   paymentStatusLabel, paymentSystemLabel, paymentDirectionLabel,
   formatPaymentAmount, paymentClientCellHtml, dashStackedBar, dashTopList,
   dashStat, pdEscape, pdShort) — все уже в общей области видимости к моменту
   вызова (см. правило про порядок script-тегов: обращения только внутри тел
   функций).
   ========================================================================== */

// ---- Пользователи -----------------------------------------------------------------

// Тот же маппинг цветов по статусу KYC/KYB, что и на главном дашборде
// (dashClientsCard, home-dashboard.js) — держим согласованно.
const AN_STATUS_COLORS = {
  SUCCESSFUL: "var(--color-success)",
  PROCESSING: "var(--color-info)",
  PENDING: "var(--color-info)",
  REQUIRES_REVIEW: "var(--color-warning)",
  REJECTED: "var(--color-danger)",
  REJECTED_RETRY: "var(--color-danger)",
  NOT_CONNECTED: "var(--color-text-tertiary)",
};

// ScoringRiskLevelEnum (5 значений) — та же эскалация цвета, что и
// riskLevelBadgeClass (clients-companies.js): у реальных badge-классов
// VERY_HIGH_RISK визуально совпадает с HIGH_RISK (тот же --color-danger,
// разница только в насыщенности заливки бейджа), поэтому здесь то же.
const AN_RISK_COLORS = {
  LOW_RISK: "var(--color-success)",
  MEDIUM_RISK: "var(--color-warning)",
  HIGH_RISK: "var(--color-danger)",
  VERY_HIGH_RISK: "var(--color-danger)",
  PROHIBITED_RISK: "var(--color-text)",
};

const AN_AGE_BUCKETS = [
  { label: "18–25", min: 18, max: 25 },
  { label: "26–35", min: 26, max: 35 },
  { label: "36–45", min: 36, max: 45 },
  { label: "46–60", min: 46, max: 60 },
  { label: "60+", min: 61, max: 200 },
];

function anUsersData() {
  const users = CLIENTS_USERS_MOCK;
  const companies = CLIENTS_COMPANIES_MOCK;
  const dayMs = 24 * 60 * 60 * 1000;
  const recentThreshold = new Date(MOCK_NOW.getTime() - 7 * dayMs);

  const kycByStatus = {};
  users.forEach((u) => { kycByStatus[u.kycStatus] = (kycByStatus[u.kycStatus] || 0) + 1; });

  const kybByStatus = {};
  companies.forEach((c) => {
    const s = c.currentKYBLevelStatusV2 ? c.currentKYBLevelStatusV2.status : "NOT_CONNECTED";
    kybByStatus[s] = (kybByStatus[s] || 0) + 1;
  });

  const riskByLevelUsers = {};
  let userNotScored = 0;
  users.forEach((u) => {
    const lvl = u.scoringProfile && u.scoringProfile.scoringRiskLevel;
    if (lvl) riskByLevelUsers[lvl] = (riskByLevelUsers[lvl] || 0) + 1;
    else userNotScored += 1;
  });

  const riskByLevelCompanies = {};
  let companyNotScored = 0;
  companies.forEach((c) => {
    if (c.scoringRiskLevel) riskByLevelCompanies[c.scoringRiskLevel] = (riskByLevelCompanies[c.scoringRiskLevel] || 0) + 1;
    else companyNotScored += 1;
  });

  const countryCountsUsers = {};
  users.forEach((u) => { if (u.residenceCountryId) countryCountsUsers[u.residenceCountryId] = (countryCountsUsers[u.residenceCountryId] || 0) + 1; });

  const countryCountsCompanies = {};
  companies.forEach((c) => { if (c.countryOfIncorporationId) countryCountsCompanies[c.countryOfIncorporationId] = (countryCountsCompanies[c.countryOfIncorporationId] || 0) + 1; });

  const genderCounts = { MALE: 0, FEMALE: 0 };
  users.forEach((u) => { if (genderCounts[u.gender] != null) genderCounts[u.gender] += 1; });

  const ageCounts = AN_AGE_BUCKETS.map((b) => ({ label: b.label, value: 0 }));
  users.forEach((u) => {
    const age = Math.floor((MOCK_NOW - u.birthDate) / (365.25 * dayMs));
    const idx = AN_AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
    if (idx >= 0) ageCounts[idx].value += 1;
  });

  // "Заблокирован" — только у физлиц реальное поле (blockReasons, см. клиентскую
  // карточку); у компаний в мок-ответе `companies` такого поля нет вовсе.
  const blocked = users.filter((u) => u.blockReasons && u.blockReasons.length).length;
  const newRecent = users.filter((u) => u.createdDate >= recentThreshold).length + companies.filter((c) => c.createdDate >= recentThreshold).length;

  const recent = [
    ...users.map((u) => ({ kind: "user", id: u.id, name: u.fullName || u.email, status: u.kycStatus, countryId: u.residenceCountryId, createdDate: u.createdDate, createdAt: u.createdAt })),
    ...companies.map((c) => ({ kind: "company", id: c.id, name: c.name, status: c.currentKYBLevelStatusV2 ? c.currentKYBLevelStatusV2.status : "NOT_CONNECTED", countryId: c.countryOfIncorporationId, createdDate: c.createdDate, createdAt: c.createdAt })),
  ]
    .sort((a, b) => b.createdDate - a.createdDate)
    .slice(0, 8);

  return {
    totalUsers: users.length,
    totalCompanies: companies.length,
    blocked,
    newRecent,
    kycByStatus,
    kybByStatus,
    riskByLevelUsers,
    riskByLevelCompanies,
    userNotScored,
    companyNotScored,
    countryCountsUsers,
    countryCountsCompanies,
    genderCounts,
    ageCounts,
    recent,
  };
}

// ---- Шапка вкладки: заголовок + описание + пара ключевых цифр + большой график, как на главном дашборде и
// дашборде операционного дня (hmHero/eodWeekChartHtml, home-dashboard.js / eod.js) — тот же .hm-hero/.hm-hero-main/
// .hm-hero-map каркас и тот же плавный линейный график с заливкой (.ed-chart-* классы общие, не завязаны на EOD).
function anRegistrationSeries(days) {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date(MOCK_NOW.getFullYear(), MOCK_NOW.getMonth(), MOCK_NOW.getDate());
  const buckets = Array.from({ length: days }).map((_, i) => ({ date: new Date(today.getTime() - (days - 1 - i) * dayMs), users: 0, companies: 0 }));
  const bucketIndex = (d) => days - 1 - Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / dayMs);
  CLIENTS_USERS_MOCK.forEach((u) => { const i = bucketIndex(u.createdDate); if (buckets[i]) buckets[i].users += 1; });
  CLIENTS_COMPANIES_MOCK.forEach((c) => { const i = bucketIndex(c.createdDate); if (buckets[i]) buckets[i].companies += 1; });
  return buckets;
}

// Столбчатая диаграмма по дням, внутри каждого столбца — деление физ/юр (стек: физлица снизу, юрлица сверху).
// Сетка и подписи оси X — тот же приём, что в eodWeekChartHtml (eod.js): пунктирные линии, метка активного дня
// подсвечена; labelEvery — показывать подпись не у каждого столбца, чтобы не слипались на 14+ точках.
function anStackedBarsHtml(vals, opts) {
  const labelEvery = opts.labelEvery || 1;
  const rawMax = Math.max(1, ...vals.map((v) => v.users + v.companies));
  const step = rawMax <= 5 ? 1 : rawMax <= 10 ? 2 : rawMax <= 25 ? 5 : rawMax <= 50 ? 10 : rawMax <= 100 ? 20 : 50;
  const max = Math.ceil(rawMax / step) * step;
  const W = 620, H = 260, L = 16, R = 16, T = 22, B = 32;
  const iw = W - L - R, ih = H - T - B;
  const n = vals.length;
  const colW = iw / n;
  const barW = Math.min(28, colW * 0.55);
  const base = T + ih;
  const py = (v) => T + ih - (v / max) * ih;
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const grid = ticks.map((v) => `<line class="ed-chart-grid${v === 0 ? " is-base" : ""}" x1="${L}" x2="${W - R}" y1="${py(v)}" y2="${py(v)}"/>`).join("");
  const xs = vals.map((v, i) => (i % labelEvery === 0 || i === n - 1 ? `<text class="ed-chart-tick${v.isActive ? " is-active" : ""}" x="${L + colW * (i + 0.5)}" y="${H - 8}" text-anchor="middle">${v.label}</text>` : "")).join("");
  const bars = vals
    .map((v, i) => {
      const cx = L + colW * (i + 0.5);
      const x = cx - barW / 2;
      const total = v.users + v.companies;
      const uy = py(v.users), cy = py(total);
      const tipW = 122, tipX = Math.min(Math.max(cx - tipW / 2, L), W - R - tipW);
      const tipY = Math.max(0, cy - 46);
      return `<g class="ed-pt${v.isActive ? " is-active" : ""}">
        <rect class="ed-pt-hit" x="${x - 6}" y="${T}" width="${barW + 12}" height="${ih}"/>
        ${v.companies ? `<rect class="an-bar an-bar-companies" x="${x}" y="${cy}" width="${barW}" height="${Math.max(0, uy - cy)}" rx="2.5"/>` : ""}
        ${v.users ? `<rect class="an-bar an-bar-users" x="${x}" y="${uy}" width="${barW}" height="${Math.max(0, base - uy)}" rx="2.5"/>` : ""}
        <g class="ed-pt-tip"><rect x="${tipX}" y="${tipY}" width="${tipW}" height="34" rx="6"/><text x="${tipX + tipW / 2}" y="${tipY + 14}" text-anchor="middle">${total} ${opts.unitLabel || ""} · ${v.label}</text><text x="${tipX + tipW / 2}" y="${tipY + 27}" text-anchor="middle" class="an-bar-tip-sub">${v.users} ${opts.usersLabel} · ${v.companies} ${opts.companiesLabel}</text></g>
      </g>`;
    })
    .join("");
  return `<div class="ed-chart-box">
    <svg class="ed-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeAttr(opts.title || "")}">
      ${grid}${bars}${xs}
    </svg></div>`;
}

const AN_USERS_HERO_DAYS = 14;

// Иконка "Обновить данные" — отдельная от ICONS.chevron/DOWNLOAD_ICON_SVG, стрелка по кругу
const AN_REFRESH_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 10a6.5 6.5 0 1 1-2-4.7"/><path d="M16.5 3v4h-4"/></svg>`;

// Дата "по состоянию на" в шапке и в шапке PDF-выгрузки — одно и то же значение, одна функция
function anCurrentDateText() {
  return new Intl.DateTimeFormat(t("home.locale"), { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(MOCK_NOW).replace(/\s*г\./, "");
}

function anUsersHero(d) {
  const cd = t("analyticsUsers");
  const days = AN_USERS_HERO_DAYS;
  const series = anRegistrationSeries(days);
  const vals = series.map((b, i) => ({ users: b.users, companies: b.companies, label: `${pad2(b.date.getDate())}.${pad2(b.date.getMonth() + 1)}`, isActive: i === series.length - 1 }));
  const periodUsers = series.reduce((s, b) => s + b.users, 0);
  const periodCompanies = series.reduce((s, b) => s + b.companies, 0);
  const verifiedUsers = d.kycByStatus.SUCCESSFUL || 0;
  const verifiedCompanies = d.kybByStatus.SUCCESSFUL || 0;
  const totalAll = d.totalUsers + d.totalCompanies;
  const verifiedPct = totalAll ? Math.round(((verifiedUsers + verifiedCompanies) / totalAll) * 100) : 0;
  return `<div class="hm-hero">
    <div class="hm-hero-main">
      <h1 class="hm-hello">${t("nav.analytics-users")}</h1>
      <div class="hm-date">${anCurrentDateText()}</div>
      <p class="hm-lead">${cd.hero.lead}</p>
      <div class="hm-pills">
        <span class="hm-pill"><strong>${totalAll.toLocaleString("ru-RU")}</strong> ${cd.metrics.total}</span>
        <span class="hm-pill"><strong>${(periodUsers + periodCompanies).toLocaleString("ru-RU")}</strong> ${cd.hero.newInPeriod(days)}</span>
        <span class="hm-pill"><strong>${verifiedPct}%</strong> ${cd.hero.verified}</span>
      </div>
      <div class="ed-actions">
        <button type="button" class="btn-secondary an-hero-btn" id="an-refresh">${AN_REFRESH_ICON_SVG}<span>${cd.hero.refresh}</span></button>
        <button type="button" class="btn-secondary an-hero-btn" id="an-export-pdf">${DOWNLOAD_ICON_SVG}<span>${cd.hero.exportPdf}</span></button>
      </div>
    </div>
    <div class="hm-hero-map">
      ${anStackedBarsHtml(vals, { title: cd.hero.chartTitle(days), unitLabel: cd.hero.chartUnit, usersLabel: cd.hero.chartUsers, companiesLabel: cd.hero.chartCompanies, labelEvery: 2 })}
      <div class="an-chart-caption">${cd.hero.chartTitle(days)}</div>
      <div class="ed-volume">
        <span class="hm-chip ed-volume-chip"><span class="an-legend-dot an-legend-dot-users"></span><strong>${periodUsers}</strong> ${t("paymentClientType.INDIVIDUAL")}</span>
        <span class="hm-chip ed-volume-chip"><span class="an-legend-dot an-legend-dot-companies"></span><strong>${periodCompanies}</strong> ${t("paymentClientType.CORPORATE")}</span>
      </div>
    </div>
  </div>`;
}

function anRiskSegments(byLevel, notScored, notScoredLabel) {
  return [
    ...Object.keys(byLevel).map((lvl) => ({ value: byLevel[lvl], label: riskLevelLabel(lvl), color: AN_RISK_COLORS[lvl] || "var(--color-text-tertiary)" })),
    ...(notScored ? [{ value: notScored, label: notScoredLabel, color: "var(--color-text-tertiary)" }] : []),
  ];
}

function anRecentRowHtml(row) {
  const cd = t("analyticsUsers.table");
  const country = findCountry(row.countryId);
  const typeLabel = row.kind === "user" ? t("paymentClientType.INDIVIDUAL") : t("paymentClientType.CORPORATE");

  return `
    <tr>
      <td><button type="button" class="table-link" data-an-client="${row.kind}:${row.id}">${pdEscape(row.name)}</button></td>
      <td><span class="badge badge-neutral">${typeLabel}</span></td>
      <td><span class="badge ${statusBadgeClass(row.status)}">${kycStatusLabel(row.status)}</span></td>
      <td>${country ? `<span class="an-flag">${country.flag}</span>${country.name}` : cd.noCountry}</td>
      <td>${row.createdAt}</td>
    </tr>
  `;
}

// ---- Секции "Пользователи" / "Компании": у каждой свой фильтр по периоду регистрации (когорта — клиенты,
// зарегистрированные за период; статус/уровень/риск/география/воронка считаются по этой когорте), своя карта
// географии (hmMapSvg — общая с главным дашбордом, см. home-dashboard.js; там же initInteractiveMap, обобщённый из
// initHomeMap, чтобы на странице можно было держать две независимые карты).
let anUsersFilterPeriod = "all";
let anCompaniesFilterPeriod = "all";

function anPeriodThreshold(period) {
  if (period === "all") return null;
  const days = period === "days7" ? 7 : period === "days30" ? 30 : 90;
  return new Date(MOCK_NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function anUsersCohort(period) {
  const th = anPeriodThreshold(period);
  return CLIENTS_USERS_MOCK.filter((u) => !th || u.createdDate >= th);
}

function anCompaniesCohort(period) {
  const th = anPeriodThreshold(period);
  return CLIENTS_COMPANIES_MOCK.filter((c) => !th || c.createdDate >= th);
}

function anPeriodTabsHtml(dataAttr, active) {
  const p = t("analyticsUsers.period");
  const tabs = [
    { key: "days7", label: p.days7 },
    { key: "days30", label: p.days30 },
    { key: "days90", label: p.days90 },
    { key: "all", label: p.all },
  ];
  return `<div class="quick-tabs">${tabs.map((tb) => `<button type="button" class="quick-tab${tb.key === active ? " is-active" : ""}" data-${dataAttr}="${tb.key}">${tb.label}</button>`).join("")}</div>`;
}

// Разделы страницы без карточки-обёртки: заголовок (+ опционально подзаголовок) прямо на фоне страницы, а не в
// .card, как sectionCard — по просьбе пользователя графики на этой странице идут "просто на странице", без рамок.
// headRight — необязательная ссылка/действие справа от заголовка в той же строке (например "Все →" на общий список)
function anFlatSection(title, contentHtml, desc, headRight) {
  return `<div class="an-subsection"><div class="an-subsection-head"><h3 class="an-subsection-title">${title}</h3>${headRight ? `<span class="an-subsection-action">${headRight}</span>` : ""}</div>${desc ? `<p class="an-subsection-desc">${desc}</p>` : ""}${contentHtml}</div>`;
}

// Каждый отдельный график — в своей карточке (когда их несколько рядом в an-split/an-split-3/an-split-13); title —
// маленькая подпись графика внутри карточки (dash-subtitle), null — без неё (когда график один и подписан уже
// заголовком anFlatSection снаружи, как воронка).
function anChartCard(title, contentHtml) {
  return `<div class="card an-chart-card">${title ? `<div class="dash-subtitle">${title}</div>` : ""}${contentHtml}</div>`;
}

// points сортированы по убыванию — так топ-чипы под картой (первые 4) сразу самые крупные, без отдельной сортировки
function anGeoMapBlock(countryCounts, mapId) {
  const points = Object.keys(countryCounts)
    .map((id) => ({ id, value: countryCounts[id], name: (findCountry(id) || { name: id }).name }))
    .sort((a, b) => b.value - a.value);
  const chips = points
    .slice(0, 4)
    .map((p) => {
      const c = findCountry(p.id);
      return `<span class="hm-chip">${c ? `<span class="dash-flag">${c.flag}</span>` : ""}${pdEscape(p.name)} · ${p.value}</span>`;
    })
    .join("");
  return `${hmMapSvg(points, mapId)}${chips ? `<div class="hm-map-chips">${chips}</div>` : ""}`;
}

function anStatusSegments(byStatus) {
  return Object.keys(byStatus).map((s) => ({ value: byStatus[s], label: kycStatusLabel(s), color: AN_STATUS_COLORS[s] || "var(--color-text-tertiary)" }));
}

// Последовательная (не качественная, как AN_STATUS_COLORS/AN_RISK_COLORS) заливка от серого к фирменному —
// уровни идут по нарастающей, поэтому и цвет должен нарастать, а не различаться по смыслу
const AN_LEVEL_COLORS = { 0: "var(--color-text-tertiary)", 1: "#b6c0ff", 2: "#7c8cff", 3: "var(--color-brand)" };

function anLevelSegments(levelCounts) {
  const labels = t("analyticsUsers.levels");
  return [0, 1, 2, 3].map((lvl) => ({ label: labels[lvl], value: levelCounts[lvl] || 0, color: AN_LEVEL_COLORS[lvl] }));
}

// Список-бар в том же визуальном стиле, что и строки воронки (an-kf-row: толстый скруглённый трек, число белым
// внутри полоски, курсивом справа не — процент от суммы всех строк) — стандартный вид горизонтального бар-чарта
// для этой страницы (взамен более тонкого dashTopList). Ширина полоски — доля от МАКСИМАЛЬНОГО значения в списке
// (обычный бар-чарт, не воронка), проценты в конце строки — доля от суммы всех строк.
// Полоска трека: число внутри полоски (белым), ТОЛЬКО если полоска физически достаточно широкая, чтобы его
// вместить (>=22%) — иначе число уже не влезает и просто зрительно "съезжает" за пределы узкой полоски (виден на
// разрезах с большим разбросом значений, например суммы по валютам, где мелкая валюта — 2% ширины при 6+ значных
// числах). Если узко — число рисуется СРАЗУ ПОСЛЕ полоски, тёмным текстом, в нормальном потоке (track — flex, не
// абсолютное позиционирование), поэтому не наслаивается и не обрезается ни при какой ширине.
function anKfBarHtml(width, displayValue) {
  const wide = width >= 22;
  return `<span class="an-kf-bar" style="width:${width}%">${wide ? `<span class="an-kf-count">${displayValue}</span>` : ""}</span>${wide ? "" : `<span class="an-kf-count an-kf-count-out">${displayValue}</span>`}`;
}

// r.title — расшифровка метки во всплывающей подсказке при наведении (нативный title, например для числового кода);
// r.displayValue — как показать значение (например, с разделителями разрядов); по умолчанию — само r.value.
// opts.centerLabels — метки по центру своей колонки (когда это короткие коды, а не читаемый текст).
function anBarListHtml(rows, opts) {
  const o = opts || {};
  if (!rows.length || !rows.some((r) => r.value > 0)) return `<div class="dash-empty">${o.emptyText || t("analyticsUsers.noData")}</div>`;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0) || 1;
  return `<div class="an-kf an-bar-list${o.centerLabels ? " an-bar-list-center" : ""}">${rows
    .map((r) => {
      const width = Math.max(4, Math.round((r.value / max) * 100));
      const pct = Math.round((r.value / total) * 100);
      return `<div class="an-kf-row">
        <span class="an-kf-label"${r.title ? ` title="${escapeAttr(r.title)}"` : ""}>${pdEscape(r.label)}</span>
        <span class="an-kf-track">${anKfBarHtml(width, r.displayValue != null ? r.displayValue : r.value)}</span>
        <span class="an-kf-pct">${pct}%</span>
      </div>`;
    })
    .join("")}</div>`;
}

// Одна строка дерева-воронки: ширина полоски — доля от общей базы (f.total), т.е. классическое сужение воронки
// сверху вниз по всему дереву, а не только внутри своей ветки; рядом — тот же процент и, если передан base
// (родительский шаг), ещё "· N% от него" — локальная конверсия относительно родителя.
function anKfRow(label, value, total, base, cls) {
  const pctOfTotal = total ? Math.round((value / total) * 100) : 0;
  const pctOfBase = base ? Math.round((value / base) * 100) : null;
  const width = Math.max(4, pctOfTotal);
  return `<div class="an-kf-row ${cls || ""}">
    <span class="an-kf-label">${pdEscape(label)}</span>
    <span class="an-kf-track">${anKfBarHtml(width, value)}</span>
    <span class="an-kf-pct">${pctOfTotal}%${pctOfBase != null ? `<span class="an-kf-pct-sub"> · ${pctOfBase}%</span>` : ""}</span>
  </div>`;
}

// Дерево-воронка с ветвлением, как просили: Регистрация → KYC 1 → {KYC 2, крипто-операция} → {KYC 3, фиат-операция}
// → {СБП-операция}. Каждая "продолжающая" ступень (KYC N) остаётся на основном стволе, каждая операция — боковая
// ветка от неё (an-kf-branch-wrap/an-kf-branch рисуют трек и уголок-коннектор через CSS). f — { total, kyc1, kyc2,
// kyc3, crypto, fiat, sbp }; crypto/fiat/sbp — это клиенты СВОЕГО уровня, дошедшие до операции (не обязательно
// прошедшие уровни глубже — это и есть смысл бокового ответвления, а не продолжения ствола).
function anKycFunnelHtml(f, labels, opts) {
  const o = opts || {};
  if (!f.total) return `<div class="dash-empty">${o.emptyText || t("analyticsUsers.noData")}</div>`;
  return `<div class="an-kf">
    ${anKfRow(labels.registered, f.total, f.total, null, "an-kf-root")}
    <div class="an-kf-branch-wrap">
      ${anKfRow(labels.kyc1, f.kyc1, f.total, f.total, "an-kf-main")}
      <div class="an-kf-branch-wrap">
        <div class="an-kf-branch">${anKfRow(labels.crypto, f.crypto, f.total, f.kyc1, "an-kf-leaf")}</div>
        ${anKfRow(labels.kyc2, f.kyc2, f.total, f.kyc1, "an-kf-main")}
        <div class="an-kf-branch-wrap">
          <div class="an-kf-branch">${anKfRow(labels.fiat, f.fiat, f.total, f.kyc2, "an-kf-leaf")}</div>
          ${anKfRow(labels.kyc3, f.kyc3, f.total, f.kyc2, "an-kf-main")}
          <div class="an-kf-branch-wrap">
            <div class="an-kf-branch">${anKfRow(labels.sbp, f.sbp, f.total, f.kyc3, "an-kf-leaf")}</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// Флаги "клиент когда-либо выполнял операцию такого рода" — по всей истории платежей (не по когорте периода: клиент
// мог зарегистрироваться в выбранном периоде, а операцию совершить позже, к текущему моменту). SBP — рельс SBP;
// крипто — рельс CRYPTO_WALLET (см. isCryptoPayment, operations-payments.js); остальное — общий "фиат".
function anOpFlagsFor(list, clientType) {
  const flags = {};
  list.forEach((x) => { flags[x.id] = { crypto: false, fiat: false, sbp: false }; });
  OPERATIONS_PAYMENTS_MOCK.forEach((r) => {
    [["senderClientId", "senderClientType"], ["recipientClientId", "recipientClientType"]].forEach(([idKey, typeKey]) => {
      const id = r[idKey];
      if (!id || r[typeKey] !== clientType || !flags[id]) return;
      if (r.paymentSystem === "CRYPTO_WALLET") flags[id].crypto = true;
      else if (r.paymentSystem === "SBP") flags[id].sbp = true;
      else flags[id].fiat = true;
    });
  });
  return flags;
}

function anUserOpFlags() {
  return anOpFlagsFor(CLIENTS_USERS_MOCK, "INDIVIDUAL");
}

function anCompanyOpFlags() {
  return anOpFlagsFor(CLIENTS_COMPANIES_MOCK, "CORPORATE");
}

// Прошла ли уровень N — общая проверка что для физлиц (kycLevelStatuses), что для компаний (kybLevelStatuses):
// обе построены в моках одинаково — уровни ниже текущего помечены SUCCESSFUL, текущий несёт статус самой записи
// (см. комментарий "тот же паттерн" в clients-companies.mock.js).
function anLevelPassed(levelStatuses, level) {
  const st = levelStatuses.find((x) => x.level === level);
  return !!st && st.status === "SUCCESSFUL";
}

function anUserPassedLevel(u, level) {
  return anLevelPassed(u.kycLevelStatuses, level);
}

function anSectionUsersStats(period) {
  const dayMs = 24 * 60 * 60 * 1000;
  const users = anUsersCohort(period);
  const statusCounts = {};
  users.forEach((u) => { statusCounts[u.kycStatus] = (statusCounts[u.kycStatus] || 0) + 1; });
  const levelCounts = {};
  users.forEach((u) => { const lvl = u.kycLevel || 0; levelCounts[lvl] = (levelCounts[lvl] || 0) + 1; });
  const riskByLevel = {};
  let notScored = 0;
  users.forEach((u) => {
    const lvl = u.scoringProfile && u.scoringProfile.scoringRiskLevel;
    if (lvl) riskByLevel[lvl] = (riskByLevel[lvl] || 0) + 1;
    else notScored += 1;
  });
  const countryCounts = {};
  users.forEach((u) => { if (u.residenceCountryId) countryCounts[u.residenceCountryId] = (countryCounts[u.residenceCountryId] || 0) + 1; });
  const genderCounts = { MALE: 0, FEMALE: 0 };
  users.forEach((u) => { if (genderCounts[u.gender] != null) genderCounts[u.gender] += 1; });
  const ageCounts = AN_AGE_BUCKETS.map((b) => ({ label: b.label, value: 0 }));
  users.forEach((u) => {
    const age = Math.floor((MOCK_NOW - u.birthDate) / (365.25 * dayMs));
    const idx = AN_AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
    if (idx >= 0) ageCounts[idx].value += 1;
  });

  const verified = statusCounts.SUCCESSFUL || 0;
  const requiresReview = statusCounts.REQUIRES_REVIEW || 0;
  const highRisk = ["HIGH_RISK", "VERY_HIGH_RISK", "PROHIBITED_RISK"].reduce((n, lvl) => n + (riskByLevel[lvl] || 0), 0);
  const blocked = users.filter((u) => u.blockReasons && u.blockReasons.length).length;

  // Ветвящаяся воронка: KYC N+1 — продолжение ствола (нужен пройденный KYC N), операция — боковая ветка от
  // СВОЕГО уровня (крипто — от KYC 1, фиат — от KYC 2, СБП — от KYC 3), не требует более глубоких уровней.
  const kyc1Users = users.filter((u) => anUserPassedLevel(u, 1));
  const kyc2Users = kyc1Users.filter((u) => anUserPassedLevel(u, 2));
  const kyc3Users = kyc2Users.filter((u) => anUserPassedLevel(u, 3));
  const opFlags = anUserOpFlags();
  const cryptoCount = kyc1Users.filter((u) => opFlags[u.id].crypto).length;
  const fiatCount = kyc2Users.filter((u) => opFlags[u.id].fiat).length;
  const sbpCount = kyc3Users.filter((u) => opFlags[u.id].sbp).length;

  return {
    count: users.length, statusCounts, levelCounts, riskByLevel, notScored, countryCounts, genderCounts, ageCounts,
    verified, requiresReview, highRisk, blocked,
    funnel: { total: users.length, kyc1: kyc1Users.length, kyc2: kyc2Users.length, kyc3: kyc3Users.length, crypto: cryptoCount, fiat: fiatCount, sbp: sbpCount },
  };
}

function anSectionCompaniesStats(period) {
  const companies = anCompaniesCohort(period);
  const statusCounts = {};
  companies.forEach((c) => {
    const st = c.currentKYBLevelStatusV2 ? c.currentKYBLevelStatusV2.status : "NOT_CONNECTED";
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  });
  const riskByLevel = {};
  let notScored = 0;
  companies.forEach((c) => {
    if (c.scoringRiskLevel) riskByLevel[c.scoringRiskLevel] = (riskByLevel[c.scoringRiskLevel] || 0) + 1;
    else notScored += 1;
  });
  const countryCounts = {};
  companies.forEach((c) => { if (c.countryOfIncorporationId) countryCounts[c.countryOfIncorporationId] = (countryCounts[c.countryOfIncorporationId] || 0) + 1; });

  // По виду деятельности — businessActivities[0].name (реальное поле, подтверждено пасенным запросом company,
  // см. комментарий в clients-companies.mock.js); по типу компании и структуре собственности — тоже реальные поля
  // (companyTypeName, companyOwnershipStructure — последнее подтверждённый закрытый enum бэкенда, не выдумка).
  // Ключ — код вида деятельности (числовой, показываем в баре), name — расшифровка (в подсказке при наведении)
  const activityCounts = {};
  companies.forEach((c) => (c.businessActivities || []).forEach((a) => {
    if (!activityCounts[a.code]) activityCounts[a.code] = { count: 0, name: a.name };
    activityCounts[a.code].count += 1;
  }));
  const typeCounts = {};
  companies.forEach((c) => { if (c.companyTypeName) typeCounts[c.companyTypeName] = (typeCounts[c.companyTypeName] || 0) + 1; });
  const ownershipCounts = {};
  companies.forEach((c) => { if (c.companyOwnershipStructure) ownershipCounts[c.companyOwnershipStructure] = (ownershipCounts[c.companyOwnershipStructure] || 0) + 1; });

  const verified = statusCounts.SUCCESSFUL || 0;
  const requiresReview = statusCounts.REQUIRES_REVIEW || 0;
  const highRisk = ["HIGH_RISK", "VERY_HIGH_RISK", "PROHIBITED_RISK"].reduce((n, lvl) => n + (riskByLevel[lvl] || 0), 0);

  // Воронка KYB — зеркало воронки KYC у физлиц (та же кросс-проверка: kybLevelStatuses в моке построены строго тем
  // же паттерном, что и kycLevelStatuses — уровни ниже текущего SUCCESSFUL, текущий несёт статус записи, см.
  // anLevelPassed выше), ветки операций — тем же способом, но по CORPORATE-стороне платежей (anCompanyOpFlags).
  const kyb1 = companies.filter((c) => anLevelPassed(c.kybLevelStatuses, 1));
  const kyb2 = kyb1.filter((c) => anLevelPassed(c.kybLevelStatuses, 2));
  const kyb3 = kyb2.filter((c) => anLevelPassed(c.kybLevelStatuses, 3));
  const opFlags = anCompanyOpFlags();
  const cryptoCount = kyb1.filter((c) => opFlags[c.id].crypto).length;
  const fiatCount = kyb2.filter((c) => opFlags[c.id].fiat).length;
  const sbpCount = kyb3.filter((c) => opFlags[c.id].sbp).length;

  return {
    count: companies.length, statusCounts, riskByLevel, notScored, countryCounts, activityCounts, typeCounts, ownershipCounts,
    verified, requiresReview, highRisk,
    funnel: { total: companies.length, kyc1: kyb1.length, kyc2: kyb2.length, kyc3: kyb3.length, crypto: cryptoCount, fiat: fiatCount, sbp: sbpCount },
  };
}

// Общая качественная палитра (не последовательная, как у уровней KYC, и не завязанная на смысл конкретного
// значения, как у статуса/риска) — для категорий без установленного цвета в приложении: тип компании, структура
// собственности.
const AN_QUALITATIVE_COLORS = ["var(--color-brand)", "var(--color-info)", "var(--color-success)", "var(--color-warning)", "var(--color-danger)", "var(--color-text-tertiary)"];

function anCategorySegments(counts, labelFn) {
  return Object.keys(counts).map((k, i) => ({ label: labelFn ? labelFn(k) : k, value: counts[k], color: AN_QUALITATIVE_COLORS[i % AN_QUALITATIVE_COLORS.length] }));
}

function anActivityRows(activityCounts) {
  return Object.keys(activityCounts)
    .map((k) => ({ label: k, title: activityCounts[k].name, value: activityCounts[k].count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

// Топ-N простого счётчика "ключ → число" (в отличие от anActivityRows выше, где значение — объект {count, name}
// с расшифровкой для подсказки) — валютные пары, рельсы и т.п. без отдельной подписи-расшифровки.
function anCountRows(counts, limit) {
  return Object.keys(counts)
    .map((k) => ({ label: k, value: counts[k] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit || 6);
}

function anUsersSectionHtml() {
  const cd = t("analyticsUsers");
  const period = anUsersFilterPeriod;
  const s = anSectionUsersStats(period);
  const statusSegments = anStatusSegments(s.statusCounts);
  const riskSegments = anRiskSegments(s.riskByLevel, s.notScored, cd.sections.riskNotScored);
  const genderSegments = [
    { value: s.genderCounts.MALE, label: t("clientDetail.gender.MALE"), color: "var(--color-info)" },
    { value: s.genderCounts.FEMALE, label: t("clientDetail.gender.FEMALE"), color: "var(--color-brand)" },
  ];
  return `
    <h2 class="an-section-title">${cd.sections.usersTitle}</h2>
    <p class="an-section-desc">${cd.sections.usersDesc}</p>
    ${anPeriodTabsHtml("an-users-period", period)}

    <div class="metrics-grid an-kpi-grid">
      ${renderMetricCard(s.count, cd.kpi.registered)}
      ${renderMetricCard(s.verified, cd.kpi.verified)}
      ${renderMetricCard(s.requiresReview, cd.kpi.requiresReview)}
      ${renderMetricCard(s.highRisk, cd.kpi.highRisk)}
      ${renderMetricCard(s.blocked, cd.kpi.blocked)}
    </div>

    <div class="an-map-block">${anGeoMapBlock(s.countryCounts, "an-map-users")}</div>

    ${anFlatSection(
      cd.sections.profileTitle,
      `<div class="an-split-3" style="display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:24px">
        <div>${anChartCard(cd.sections.statusTitle, dashDonut(statusSegments, { emptyText: cd.noData, stacked: true }))}</div>
        <div>${anChartCard(cd.sections.levelTitle, dashDonut(anLevelSegments(s.levelCounts), { emptyText: cd.noData, stacked: true }))}</div>
        <div>${anChartCard(cd.sections.riskTitle, dashDonut(riskSegments, { emptyText: cd.noData, stacked: true }))}</div>
      </div>`,
      cd.sections.profileDesc
    )}

    ${anFlatSection(
      cd.sections.demographicsTitle,
      `<div class="an-split-13" style="display:grid!important;grid-template-columns:260px 1fr!important;gap:24px">
        <div>${anChartCard(cd.sections.byGender, dashDonut(genderSegments, { emptyText: cd.noData, stacked: true }))}</div>
        <div>${anChartCard(cd.sections.byAge, anBarListHtml(s.ageCounts, { emptyText: cd.noData }))}</div>
      </div>`,
      cd.sections.demographicsDesc
    )}

    ${anFlatSection(cd.funnel.title, anChartCard(null, anKycFunnelHtml(s.funnel, cd.funnel, { emptyText: cd.noData })), cd.funnel.desc)}
  `;
}

function anCompaniesSectionHtml() {
  const cd = t("analyticsUsers");
  const period = anCompaniesFilterPeriod;
  const s = anSectionCompaniesStats(period);
  const statusSegments = anStatusSegments(s.statusCounts);
  const riskSegments = anRiskSegments(s.riskByLevel, s.notScored, cd.sections.riskNotScored);
  const ownershipLabels = t("companyDetail.ownershipStructure");
  const typeSegments = anCategorySegments(s.typeCounts);
  const ownershipSegments = anCategorySegments(s.ownershipCounts, (k) => ownershipLabels[k] || k);
  return `
    <h2 class="an-section-title">${cd.sections.companiesTitle}</h2>
    <p class="an-section-desc">${cd.sections.companiesDesc}</p>
    ${anPeriodTabsHtml("an-companies-period", period)}

    <div class="metrics-grid an-kpi-grid an-kpi-grid-4">
      ${renderMetricCard(s.count, cd.kpi.registered)}
      ${renderMetricCard(s.verified, cd.kpi.verified)}
      ${renderMetricCard(s.requiresReview, cd.kpi.requiresReview)}
      ${renderMetricCard(s.highRisk, cd.kpi.highRisk)}
    </div>

    <div class="an-map-block">${anGeoMapBlock(s.countryCounts, "an-map-companies")}</div>

    ${anFlatSection(
      cd.sections.profileTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(cd.sections.statusTitle, dashDonut(statusSegments, { emptyText: cd.noData, stacked: true }))}</div>
        <div>${anChartCard(cd.sections.riskTitle, dashDonut(riskSegments, { emptyText: cd.noData, stacked: true }))}</div>
      </div>`,
      cd.sections.profileDesc
    )}

    ${anFlatSection(
      cd.typeOwnershipTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(cd.typeTitle, dashDonut(typeSegments, { emptyText: cd.noData, stacked: true }))}</div>
        <div>${anChartCard(cd.ownershipTitle, dashDonut(ownershipSegments, { emptyText: cd.noData, stacked: true }))}</div>
      </div>`
    )}

    ${anFlatSection(cd.activityTitle, anChartCard(null, anBarListHtml(anActivityRows(s.activityCounts), { emptyText: cd.noData, centerLabels: true })))}

    ${anFlatSection(cd.funnelCompanies.title, anChartCard(null, anKycFunnelHtml(s.funnel, cd.funnelCompanies, { emptyText: cd.noData })), cd.funnelCompanies.desc)}
  `;
}

function viewAnalyticsUsers() {
  const d = anUsersData();

  return `
    ${anUsersHero(d)}

    <div class="an-section" id="an-users-body">${anUsersSectionHtml()}</div>
    <div class="an-section-divider"></div>
    <div class="an-section" id="an-companies-body">${anCompaniesSectionHtml()}</div>

    ${anFlatSection(
      t("analyticsUsers.sections.recentTitle"),
      anChartCard(
        null,
        d.recent.length
          ? `<div class="table-scroll">
              <table class="data-table">
                <thead><tr><th>${t("analyticsUsers.table.client")}</th><th>${t("analyticsUsers.table.type")}</th><th>${t("analyticsUsers.table.status")}</th><th>${t("analyticsUsers.table.country")}</th><th>${t("analyticsUsers.table.created")}</th></tr></thead>
                <tbody>${d.recent.map(anRecentRowHtml).join("")}</tbody>
              </table>
            </div>`
          : `<div class="dash-empty">${t("analyticsUsers.noData")}</div>`
      ),
      t("analyticsUsers.sections.recentDesc"),
      vbLink("#/clients-users", `${t("analyticsUsers.sections.recentAll")} →`)
    )}
  `;
}

function bindAnUsersSection() {
  const body = document.getElementById("an-users-body");
  if (!body) return;
  body.querySelectorAll("[data-an-users-period]").forEach((b) => b.addEventListener("click", () => {
    anUsersFilterPeriod = b.dataset.anUsersPeriod;
    body.innerHTML = anUsersSectionHtml();
    bindAnUsersSection();
  }));
  initInteractiveMap("an-map-users");
}

function bindAnCompaniesSection() {
  const body = document.getElementById("an-companies-body");
  if (!body) return;
  body.querySelectorAll("[data-an-companies-period]").forEach((b) => b.addEventListener("click", () => {
    anCompaniesFilterPeriod = b.dataset.anCompaniesPeriod;
    body.innerHTML = anCompaniesSectionHtml();
    bindAnCompaniesSection();
  }));
  initInteractiveMap("an-map-companies");
}

// Экспорт всей страницы (шапка + обе секции + последние регистрации) как PDF через печать — тот же приём, что и
// exportEodDashboardPdf (eod.js): печатная HTML-копия текущего DOM в скрытом iframe, дальше системный диалог
// "Сохранить как PDF" (exPdfHtml/exPrintHtml, components/export.js). EX_PDF_CSS уже прячет .btn-primary/.btn-secondary
// при печати, так что сами кнопки "Обновить"/"Экспорт" и табы периода в файл не попадают лишним шумом.
function exportAnalyticsUsersPdf() {
  const root = document.getElementById("view-container");
  if (!root) return;
  const name = t("nav.analytics-users");
  exPrintHtml(exPdfHtml(name, name, anCurrentDateText(), root.innerHTML), name);
}

function initAnalyticsUsers() {
  // Разделы этой страницы больше не карточки (anFlatSection, не sectionCard) — сворачивать нечего,
  // collapsible-card-head здесь не встречается.
  const content = document.getElementById("view-container");

  content.querySelectorAll("[data-an-client]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [kind, id] = btn.dataset.anClient.split(":");
      window.location.hash = kind === "user" ? `#/clients-users/${id}` : `#/clients-companies/${id}`;
    });
  });
  vbAttachRows(content);

  const refreshBtn = document.getElementById("an-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", () => { render(); showToast(t("analyticsUsers.hero.refreshed")); });
  const exportBtn = document.getElementById("an-export-pdf");
  if (exportBtn) exportBtn.addEventListener("click", () => exportAnalyticsUsersPdf());

  bindAnUsersSection();
  bindAnCompaniesSection();
}

// ---- Операции -----------------------------------------------------------------
// Разбита на 4 раздела по видам операций — так же, как устроена навигация "Операции" в самом приложении (фиат/крипто —
// вкладки одного списка платежей, обмены и OTC — отдельные разделы), а не по метрикам реальной ручки `usageAnalytics`
// (plugins/statistics-plugin): та считает "Внесено/Выведено/Прибыль" по рельсам и operation_type строгим реестром
// правил (METRIC_DEFINITIONS) — повторять эту SQL-логику 1-в-1 здесь не стали, ГРАНИЦЫ ПРОТОТИПА. Вместо этого статус
// и объём считаются по каждому виду напрямую из моков (то же, что и раньше), а число "успешно/остального" в шапке —
// честная агрегация по всем 4 видам, без выдуманной общей суммы в разных валютах.
const AN_OPERATIONS_STATUS_COLORS = {
  SUCCESSFUL: "var(--color-success)",
  PROCESSING: "var(--color-info)",
  ON_REVIEW: "var(--color-info)",
  NEED_ACTION: "var(--color-warning)",
  DRAFT: "var(--color-text-tertiary)",
  REFUNDED: "var(--color-text-tertiary)",
  DECLINED: "var(--color-danger)",
};

const AN_OTC_STATUS_COLORS = {
  PENDING: "var(--color-warning)",
  CONFIRMING: "var(--color-info)",
  REJECTING: "var(--color-info)",
  CANCELING: "var(--color-info)",
  COMPLETED: "var(--color-success)",
  REJECTED: "var(--color-danger)",
  CANCELED: "var(--color-text-tertiary)",
  EXPIRED: "var(--color-text-tertiary)",
};

let anFiatPeriod = "all";
let anCryptoPeriod = "all";
let anExchangesPeriod = "all";
let anOtcPeriod = "all";

function anOpsCohort(list, period) {
  const th = anPeriodThreshold(period);
  return list.filter((r) => !th || r.createdDate >= th);
}

// Объём по валюте — сумма и число операций, отдельно "успешно" и "всё остальное" (в разных статусах и валютах
// суммировать вместе нечестно, поэтому строка на валюту, а не единая цифра).
function anVolumeByCurrency(rows) {
  const byCurrency = {};
  rows.forEach((r) => {
    const c = r.totalCurrency;
    if (!byCurrency[c]) byCurrency[c] = { successCount: 0, successAmount: 0, otherCount: 0, otherAmount: 0 };
    if (r.status === "SUCCESSFUL") { byCurrency[c].successCount += 1; byCurrency[c].successAmount += r.totalAmount; }
    else { byCurrency[c].otherCount += 1; byCurrency[c].otherAmount += r.totalAmount; }
  });
  return byCurrency;
}

// "Требуют подтверждения" — платёж на проверке или ждёт действия администратора (ON_REVIEW/NEED_ACTION);
// у платежей это ровно два статуса из PaymentStatusEnum, не выдумка.
function anPendingCount(statusCounts) {
  return (statusCounts.ON_REVIEW || 0) + (statusCounts.NEED_ACTION || 0);
}

function anFiatOpsStats(period) {
  const rows = anOpsCohort(OPERATIONS_PAYMENTS_MOCK.filter((r) => !isCryptoPayment(r)), period);
  const statusCounts = {};
  const railCounts = {};
  const directionCounts = {};
  rows.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    railCounts[r.paymentSystem] = (railCounts[r.paymentSystem] || 0) + 1;
    directionCounts[r.direction] = (directionCounts[r.direction] || 0) + 1;
  });
  return {
    count: rows.length, statusCounts, railCounts, directionCounts,
    volumeByCurrency: anVolumeByCurrency(rows),
    successCount: statusCounts.SUCCESSFUL || 0, pendingCount: anPendingCount(statusCounts),
  };
}

function anCryptoOpsStats(period) {
  const rows = anOpsCohort(OPERATIONS_PAYMENTS_MOCK.filter((r) => isCryptoPayment(r)), period);
  const statusCounts = {};
  const typeCounts = {};
  rows.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    if (r.cryptoOperationType) typeCounts[r.cryptoOperationType] = (typeCounts[r.cryptoOperationType] || 0) + 1;
  });
  return {
    count: rows.length, statusCounts, typeCounts,
    volumeByCurrency: anVolumeByCurrency(rows),
    successCount: statusCounts.SUCCESSFUL || 0, pendingCount: anPendingCount(statusCounts),
  };
}

function anExchangesOpsStats(period) {
  const rows = anOpsCohort(OPERATIONS_EXCHANGES_MOCK, period);
  const statusCounts = {};
  const pairCounts = {};
  rows.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    const key = `${r.sourceCurrency} → ${r.targetCurrency}`;
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  });
  return {
    count: rows.length, statusCounts, pairCounts,
    volumeByCurrency: anVolumeByCurrency(rows),
    successCount: statusCounts.SUCCESSFUL || 0, pendingCount: anPendingCount(statusCounts),
  };
}

function anOtcOpsStats(period) {
  const rows = anOpsCohort(OTC_DEALS_MOCK, period);
  const statusCounts = {};
  const pairCounts = {};
  rows.forEach((d) => {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
    const key = `${d.baseCurrencyTicker}/${d.quoteCurrencyTicker}`;
    pairCounts[key] = (pairCounts[key] || 0) + 1;
  });
  return { count: rows.length, statusCounts, pairCounts, successCount: statusCounts.COMPLETED || 0, pendingCount: statusCounts.PENDING || 0 };
}

function anVolumeTableHtml(volumeByCurrency) {
  const cd = t("analyticsOperations");
  const rows = Object.keys(volumeByCurrency)
    .map((c) => ({ currency: c, ...volumeByCurrency[c] }))
    .sort((a, b) => b.successAmount + b.otherAmount - (a.successAmount + a.otherAmount));
  if (!rows.length) return `<div class="dash-empty">${cd.noData}</div>`;
  return `<div class="table-scroll"><table class="data-table">
    <thead><tr><th>${cd.volumeTable.currency}</th><th>${cd.volumeTable.successCount}</th><th>${cd.volumeTable.successAmount}</th><th>${cd.volumeTable.otherCount}</th><th>${cd.volumeTable.otherAmount}</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${r.currency}</td><td>${r.successCount}</td><td>${formatPaymentAmount(r.successAmount)}</td><td>${r.otherCount}</td><td>${formatPaymentAmount(r.otherAmount)}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

// Общий рендер раздела вида операций: заголовок+подзаголовок, табы периода, 4 KPI (число/успешно/доля успешных/
// требуют подтверждения), карточка "статус" + карточка второго среза рядом, затем — объём по валютам (и, если
// передан cfg.directionHtml, ещё направление рядом с ним); "объём" одной суммой не считаем: операции идут в разных
// валютах, честная сумма невозможна без конвертации, которую мы сознательно не делаем — строка на валюту.
function anOpsCategoryHtml(cfg) {
  const cd = t("analyticsOperations");
  const statusSegments = Object.keys(cfg.s.statusCounts).map((k) => ({ label: cfg.statusLabel(k), value: cfg.s.statusCounts[k], color: cfg.statusColors[k] || "var(--color-text-tertiary)" }));
  const successRate = cfg.s.count ? Math.round((cfg.s.successCount / cfg.s.count) * 100) : 0;
  const volumeBlock = cfg.volumeByCurrency
    ? anFlatSection(
        cfg.directionHtml ? cd.sections.volumeDirectionTitle : cd.sections.volumeTitle,
        cfg.directionHtml
          ? `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
              <div>${anChartCard(cd.sections.byDirection, cfg.directionHtml)}</div>
              <div>${anChartCard(null, anVolumeTableHtml(cfg.volumeByCurrency))}</div>
            </div>`
          : anChartCard(null, anVolumeTableHtml(cfg.volumeByCurrency)),
        cd.sections.volumeDesc
      )
    : "";
  return `
    <h2 class="an-section-title">${cfg.title}</h2>
    <p class="an-section-desc">${cfg.desc}</p>
    ${anPeriodTabsHtml(cfg.dataAttr, cfg.period)}

    <div class="metrics-grid an-kpi-grid an-kpi-grid-4">
      ${renderMetricCard(cfg.s.count, cfg.totalLabel || cd.kpi.total)}
      ${renderMetricCard(cfg.s.successCount, cfg.successLabel || cd.kpi.successful)}
      ${renderMetricCard(`${successRate}%`, cfg.rateLabel || cd.kpi.successRate)}
      ${renderMetricCard(cfg.s.pendingCount || 0, cd.kpi.pending)}
    </div>

    ${anFlatSection(
      cfg.profileTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(cd.sections.byStatus, dashDonut(statusSegments, { emptyText: cd.noData, stacked: true }))}</div>
        <div>${anChartCard(cfg.secondaryTitle, cfg.secondaryHtml)}</div>
      </div>`
    )}

    ${volumeBlock}
  `;
}

function anFiatSectionHtml() {
  const cd = t("analyticsOperations");
  const s = anFiatOpsStats(anFiatPeriod);
  const railSegments = Object.keys(s.railCounts).map((k, i) => ({ label: paymentSystemLabel(k), value: s.railCounts[k], color: AN_QUALITATIVE_COLORS[i % AN_QUALITATIVE_COLORS.length] }));
  const directionSegments = Object.keys(s.directionCounts).map((k, i) => ({ label: paymentDirectionLabel(k), value: s.directionCounts[k], color: AN_QUALITATIVE_COLORS[i % AN_QUALITATIVE_COLORS.length] }));
  return anOpsCategoryHtml({
    dataAttr: "an-fiat-period", period: anFiatPeriod,
    title: cd.sections.fiatTitle, desc: cd.sections.fiatDesc, profileTitle: cd.sections.fiatProfileTitle,
    s, statusColors: AN_OPERATIONS_STATUS_COLORS, statusLabel: paymentStatusLabel,
    secondaryTitle: cd.sections.byRail, secondaryHtml: dashDonut(railSegments, { emptyText: cd.noData, stacked: true }),
    volumeByCurrency: s.volumeByCurrency, directionHtml: dashDonut(directionSegments, { emptyText: cd.noData, stacked: true }),
  });
}

function anCryptoSectionHtml() {
  const cd = t("analyticsOperations");
  const cryptoTypeLabels = t("operationsPayments.cryptoOperation");
  const s = anCryptoOpsStats(anCryptoPeriod);
  const typeSegments = Object.keys(s.typeCounts).map((k, i) => ({ label: cryptoTypeLabels[k] || k, value: s.typeCounts[k], color: AN_QUALITATIVE_COLORS[i % AN_QUALITATIVE_COLORS.length] }));
  return anOpsCategoryHtml({
    dataAttr: "an-crypto-period", period: anCryptoPeriod,
    title: cd.sections.cryptoTitle, desc: cd.sections.cryptoDesc, profileTitle: cd.sections.cryptoProfileTitle,
    s, statusColors: AN_OPERATIONS_STATUS_COLORS, statusLabel: paymentStatusLabel,
    secondaryTitle: cd.sections.byType, secondaryHtml: dashDonut(typeSegments, { emptyText: cd.noData, stacked: true }),
    volumeByCurrency: s.volumeByCurrency,
  });
}

function anExchangesSectionHtml() {
  const cd = t("analyticsOperations");
  const s = anExchangesOpsStats(anExchangesPeriod);
  return anOpsCategoryHtml({
    dataAttr: "an-exchanges-period", period: anExchangesPeriod,
    title: cd.sections.exchangesTitle, desc: cd.sections.exchangesDesc, profileTitle: cd.sections.exchangesProfileTitle,
    s, statusColors: AN_OPERATIONS_STATUS_COLORS, statusLabel: paymentStatusLabel,
    secondaryTitle: cd.sections.byPair, secondaryHtml: anBarListHtml(anCountRows(s.pairCounts), { emptyText: cd.noData }),
    volumeByCurrency: s.volumeByCurrency,
  });
}

function anOtcSectionHtml() {
  const cd = t("analyticsOperations");
  const s = anOtcOpsStats(anOtcPeriod);
  return anOpsCategoryHtml({
    dataAttr: "an-otc-period", period: anOtcPeriod,
    title: cd.sections.otcTitle, desc: cd.sections.otcDesc, profileTitle: cd.sections.otcProfileTitle,
    s, statusColors: AN_OTC_STATUS_COLORS, statusLabel: (k) => otcEnum("status", k),
    totalLabel: cd.kpi.deals, successLabel: cd.kpi.completed, rateLabel: cd.kpi.completionRate,
    secondaryTitle: cd.sections.byPair, secondaryHtml: anBarListHtml(anCountRows(s.pairCounts), { emptyText: cd.noData }),
  });
}

// Тренд по дням: успешно/остальное — по всем 4 видам операций сразу, тот же компонент, что и в шапке "Пользователи
// и компании" (anStackedBarsHtml), просто со смыслом "успешно/остальное" вместо "физлица/юрлица".
const AN_OPS_HERO_DAYS = 14;

function anOperationsSeries(days) {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date(MOCK_NOW.getFullYear(), MOCK_NOW.getMonth(), MOCK_NOW.getDate());
  const buckets = Array.from({ length: days }).map((_, i) => ({ date: new Date(today.getTime() - (days - 1 - i) * dayMs), ok: 0, other: 0 }));
  const idx = (d) => days - 1 - Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / dayMs);
  const isOk = (status) => status === "SUCCESSFUL" || status === "COMPLETED";
  [...OPERATIONS_PAYMENTS_MOCK, ...OPERATIONS_EXCHANGES_MOCK, ...OTC_DEALS_MOCK].forEach((r) => {
    const i = idx(r.createdDate);
    if (!buckets[i]) return;
    if (isOk(r.status)) buckets[i].ok += 1; else buckets[i].other += 1;
  });
  return buckets;
}

function anOperationsHero() {
  const cd = t("analyticsOperations");
  const days = AN_OPS_HERO_DAYS;
  const series = anOperationsSeries(days);
  const vals = series.map((b, i) => ({ users: b.ok, companies: b.other, label: `${pad2(b.date.getDate())}.${pad2(b.date.getMonth() + 1)}`, isActive: i === series.length - 1 }));
  const totalOk = series.reduce((s, b) => s + b.ok, 0);
  const totalOther = series.reduce((s, b) => s + b.other, 0);
  const totalAll = totalOk + totalOther;
  const successPct = totalAll ? Math.round((totalOk / totalAll) * 100) : 0;
  return `<div class="hm-hero">
    <div class="hm-hero-main">
      <h1 class="hm-hello">${t("nav.analytics-operations")}</h1>
      <div class="hm-date">${anCurrentDateText()}</div>
      <p class="hm-lead">${cd.hero.lead}</p>
      <div class="hm-pills">
        <span class="hm-pill"><strong>${totalAll.toLocaleString("ru-RU")}</strong> ${cd.hero.totalInPeriod(days)}</span>
        <span class="hm-pill"><strong>${successPct}%</strong> ${cd.hero.successRate}</span>
      </div>
      <div class="ed-actions">
        <button type="button" class="btn-secondary an-hero-btn" id="ao-refresh">${AN_REFRESH_ICON_SVG}<span>${cd.hero.refresh}</span></button>
        <button type="button" class="btn-secondary an-hero-btn" id="ao-export-pdf">${DOWNLOAD_ICON_SVG}<span>${cd.hero.exportPdf}</span></button>
      </div>
    </div>
    <div class="hm-hero-map">
      ${anStackedBarsHtml(vals, { title: cd.hero.chartTitle(days), unitLabel: cd.hero.chartUnit, usersLabel: cd.hero.chartOk, companiesLabel: cd.hero.chartOther, labelEvery: 2 })}
      <div class="an-chart-caption">${cd.hero.chartTitle(days)}</div>
      <div class="ed-volume">
        <span class="hm-chip ed-volume-chip"><span class="an-legend-dot an-legend-dot-users"></span><strong>${totalOk}</strong> ${cd.hero.chartOk}</span>
        <span class="hm-chip ed-volume-chip"><span class="an-legend-dot an-legend-dot-companies"></span><strong>${totalOther}</strong> ${cd.hero.chartOther}</span>
      </div>
    </div>
  </div>`;
}

function anTopOperationRowHtml(row) {
  const cd = t("analyticsOperations.topTable");
  const section = row.paymentSystem === "EXCHANGE" ? "exchanges" : "payments";
  return `
    <tr>
      <td><button type="button" class="table-link" data-an-op="${section}:${row.id}">${row.code}</button></td>
      <td>${paymentClientCellHtml(row, "sender")}</td>
      <td><span class="badge badge-neutral">${paymentSystemLabel(row.paymentSystem)}</span></td>
      <td>${formatPaymentAmount(row.totalAmount)} ${row.totalCurrency}</td>
      <td><span class="badge ${paymentStatusBadgeClass(row.status)}">${paymentStatusLabel(row.status)}</span></td>
      <td>${row.createdAt}</td>
    </tr>
  `;
}

// Топ по сумме — только платежи и обмены (общая форма totalAmount/totalCurrency); OTC-сделки в другой форме
// (amount/cost по base/quote-валютам, суммы не сопоставимы напрямую) — в эту таблицу сознательно не подмешиваем.
function anTopOperationsHtml() {
  const cd = t("analyticsOperations");
  const top = [...OPERATIONS_PAYMENTS_MOCK, ...OPERATIONS_EXCHANGES_MOCK].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 8);
  return anChartCard(
    null,
    top.length
      ? `<div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>${cd.topTable.id}</th><th>${cd.topTable.client}</th><th>${cd.topTable.rail}</th><th>${cd.topTable.amount}</th><th>${cd.topTable.status}</th><th>${cd.topTable.created}</th></tr></thead>
            <tbody>${top.map(anTopOperationRowHtml).join("")}</tbody>
          </table>
        </div>`
      : `<div class="dash-empty">${cd.noData}</div>`
  );
}

function viewAnalyticsOperations() {
  return `
    ${anOperationsHero()}

    <div class="an-section" id="ao-fiat-body">${anFiatSectionHtml()}</div>
    <div class="an-section-divider"></div>
    <div class="an-section" id="ao-crypto-body">${anCryptoSectionHtml()}</div>
    <div class="an-section-divider"></div>
    <div class="an-section" id="ao-exchanges-body">${anExchangesSectionHtml()}</div>
    <div class="an-section-divider"></div>
    <div class="an-section" id="ao-otc-body">${anOtcSectionHtml()}</div>

    ${anFlatSection(t("analyticsOperations.sections.topTitle"), anTopOperationsHtml())}
  `;
}

function anBindOpsSection(bodyId, dataAttr, getSet, renderFn) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.querySelectorAll(`[data-${dataAttr}]`).forEach((b) => b.addEventListener("click", () => {
    getSet(b.dataset[dataAttr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]);
    body.innerHTML = renderFn();
    anBindOpsSection(bodyId, dataAttr, getSet, renderFn);
  }));
}

function exportAnalyticsOperationsPdf() {
  const root = document.getElementById("view-container");
  if (!root) return;
  const name = t("nav.analytics-operations");
  exPrintHtml(exPdfHtml(name, name, anCurrentDateText(), root.innerHTML), name);
}

function initAnalyticsOperations() {
  const content = document.getElementById("view-container");
  vbAttachRows(content);

  content.querySelectorAll("[data-an-op]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [section, id] = btn.dataset.anOp.split(":");
      window.location.hash = `#/operations-${section}/${id}`;
    });
  });

  const refreshBtn = document.getElementById("ao-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", () => { render(); showToast(t("analyticsOperations.hero.refreshed")); });
  const exportBtn = document.getElementById("ao-export-pdf");
  if (exportBtn) exportBtn.addEventListener("click", () => exportAnalyticsOperationsPdf());

  anBindOpsSection("ao-fiat-body", "an-fiat-period", (v) => { anFiatPeriod = v; }, anFiatSectionHtml);
  anBindOpsSection("ao-crypto-body", "an-crypto-period", (v) => { anCryptoPeriod = v; }, anCryptoSectionHtml);
  anBindOpsSection("ao-exchanges-body", "an-exchanges-period", (v) => { anExchangesPeriod = v; }, anExchangesSectionHtml);
  anBindOpsSection("ao-otc-body", "an-otc-period", (v) => { anOtcPeriod = v; }, anOtcSectionHtml);
}
// ---- Счета и балансы ------------------------------------------------------------
// Агрегация на стороне UI по ACCOUNTS_VIRTUAL/REAL/NOSTRO_MOCK (отдельной ручки статистики по счетам в бэкенде не
// найдено). Остатки виртуальных, реальных и ностро — тремя отдельными таблицами, не суммируются друг с другом:
// виртуальные — обязательства перед клиентами, реальные — деньги у провайдеров, ностро — у банков-партнёров; это
// разные деньги, даже если валюта совпадает, складывать их в одну цифру нельзя.
const AN_ACCOUNT_STATUS_COLORS = {
  ACTIVE: "var(--color-success)",
  FROZEN: "var(--color-warning)",
  DISABLED: "var(--color-text-tertiary)",
  CLOSED: "var(--color-text-tertiary)",
  ARCHIVED: "var(--color-border)",
  ERROR: "var(--color-danger)",
};

function anAccountsData() {
  const virtual = ACCOUNTS_VIRTUAL_MOCK;
  const real = ACCOUNTS_REAL_MOCK;
  const nostro = ACCOUNTS_NOSTRO_MOCK;
  const realSide = [...real, ...nostro];
  const all = [...virtual, ...realSide];
  const count = (list, getter) => {
    const out = {};
    list.forEach((a) => { const k = getter(a); if (k != null && k !== "") out[k] = (out[k] || 0) + 1; });
    return out;
  };
  const balancesFor = (list) => {
    const out = {};
    list.forEach((a) => a.balances.forEach((b) => {
      const row = (out[b.currency] = out[b.currency] || { accounts: 0, total: 0, hold: 0 });
      row.accounts += 1;
      row.total += b.total;
      row.hold += b.hold;
    }));
    return out;
  };
  const railCounts = {};
  realSide.forEach((a) => accRailsOf(a).forEach((r) => { railCounts[r] = (railCounts[r] || 0) + 1; }));
  return {
    total: all.length,
    virtual: virtual.length,
    real: real.length,
    correspondent: nostro.length,
    nonzero: all.filter(accHasFunds).length,
    byStatus: count(all, (a) => a.status),
    byKind: { virtual: virtual.length, real: real.length, correspondent: nostro.length },
    byType: count(all, (a) => a.type),
    byLedger: count(all, (a) => a.ledgerType),
    byProvider: count(realSide, (a) => a.provider.name),
    byRail: railCounts,
    balancesVirtual: balancesFor(virtual),
    balancesReal: balancesFor(real),
    balancesNostro: balancesFor(nostro),
    restricted: all.filter((a) => a.restrictionReason || ["FROZEN", "DISABLED", "ERROR"].includes(a.status)).slice(0, 8),
  };
}

// Вся строка кликабельна — не только маленькая ссылка на ID внутри accAccountCell. Отдельный атрибут
// (не data-acc-hash — под тот уже есть общий обработчик без проверки цели клика, повесить его и на <tr> означало
// бы, что клик по вложенной ссылке/кнопке копирования сначала сработает сам, а потом ещё и уведёт со страницы).
function anAccountsRestrictedRowHtml(a) {
  return `<tr class="an-row-link" data-acc-row-hash="${accHref(a)}">
    <td>${accAccountCell(a)}</td>
    <td>${accKindBadge(a.kind)}</td>
    <td>${accOwnerCell(a)}</td>
    <td>${accStatusBadge(a.status)}</td>
    <td>${a.restrictionReason ? accEnum("restrictionReason", a.restrictionReason) : t("accounts.noValue")}</td>
  </tr>`;
}

function anBalanceTableHtml(balances) {
  const b = t("analyticsAccounts.balancesTable");
  const rows = Object.keys(balances).map((c) => ({ currency: c, ...balances[c] })).sort((x, y) => y.total - x.total);
  if (!rows.length) return `<div class="dash-empty">${t("analyticsAccounts.noData")}</div>`;
  return `<div class="table-scroll"><table class="data-table">
    <thead><tr><th>${b.currency}</th><th>${b.accounts}</th><th>${b.total}</th><th>${b.hold}</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${accCurrencyLink(r.currency)}${accNetworkOf(r.currency) ? ` <span class="table-cell-muted">· ${accNetworkOf(r.currency)}</span>` : ""}</td><td>${r.accounts}</td><td>${formatPaymentAmount(r.total)}</td><td>${r.hold ? formatPaymentAmount(r.hold) : "—"}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

// Топ держателей — только виртуальные счета (у реальных/ностро "владелец" — сам провайдер, не клиент). Валюта, по
// которой строим топ, — та, где суммарно больше всего виртуальных остатков; сравнивать держателей в РАЗНЫХ валютах
// одной суммой нечестно (курс), поэтому топ — по одной, самой крупной по объёму валюте, а не общий по всем сразу.
function anTopHoldersHtml(virtual) {
  const cd = t("analyticsAccounts");
  const totals = {};
  virtual.forEach((a) => a.balances.forEach((b) => { totals[b.currency] = (totals[b.currency] || 0) + b.total; }));
  const currencies = Object.keys(totals).sort((x, y) => totals[y] - totals[x]);
  if (!currencies.length) return { currency: null, html: `<div class="dash-empty">${cd.noData}</div>` };
  const currency = currencies[0];
  const rows = virtual
    .map((a) => ({ a, bal: a.balances.find((b) => b.currency === currency) }))
    .filter((x) => x.bal && x.bal.total > 0)
    .sort((x, y) => y.bal.total - x.bal.total)
    .slice(0, 8);
  const th = cd.topHolders;
  const html = rows.length
    ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>${th.owner}</th><th>${th.balance}</th></tr></thead>
        <tbody>${rows.map(({ a, bal }) => `<tr><td>${accOwnerCell(a)}</td><td>${accMoney(bal.total, currency)}</td></tr>`).join("")}</tbody>
      </table></div>`
    : `<div class="dash-empty">${cd.noData}</div>`;
  return { currency, html };
}

function anAccountsHero(d) {
  const cd = t("analyticsAccounts");
  const kindSegments = Object.keys(d.byKind).map((k, i) => ({ label: t(`accounts.kind.${k}`), value: d.byKind[k], color: ["var(--color-brand)", "var(--color-info)", "var(--color-warning)"][i] }));
  return `<div class="hm-hero">
    <div class="hm-hero-main">
      <h1 class="hm-hello">${t("nav.analytics-accounts")}</h1>
      <div class="hm-date">${anCurrentDateText()}</div>
      <p class="hm-lead">${cd.hero.lead}</p>
      <div class="hm-pills">
        <span class="hm-pill"><strong>${d.total}</strong> ${cd.metrics.total}</span>
        <span class="hm-pill"><strong>${d.nonzero}</strong> ${cd.metrics.nonzero}</span>
      </div>
      <div class="ed-actions">
        <button type="button" class="btn-secondary an-hero-btn" id="aa-refresh">${AN_REFRESH_ICON_SVG}<span>${cd.hero.refresh}</span></button>
        <button type="button" class="btn-secondary an-hero-btn" id="aa-export-pdf">${DOWNLOAD_ICON_SVG}<span>${cd.hero.exportPdf}</span></button>
      </div>
    </div>
    <div class="hm-hero-map">
      <div class="an-hero-donut">${dashDonut(kindSegments, { emptyText: cd.noData, legendNarrow: true, large: true })}</div>
    </div>
  </div>`;
}

function viewAnalyticsAccounts() {
  const d = anAccountsData();
  const cd = t("analyticsAccounts");
  const statusSegments = Object.keys(d.byStatus).map((s) => ({ value: d.byStatus[s], label: accEnum("status", s), color: AN_ACCOUNT_STATUS_COLORS[s] || "var(--color-text-tertiary)" }));
  const kindSegments = Object.keys(d.byKind).map((k, i) => ({ label: t(`accounts.kind.${k}`), value: d.byKind[k], color: ["var(--color-brand)", "var(--color-info)", "var(--color-warning)"][i] }));
  const typeRows = Object.keys(d.byType).map((k) => ({ label: accEnum("type", k), value: d.byType[k] })).sort((a, b) => b.value - a.value);
  const ledgerSegments = Object.keys(d.byLedger).map((k, i) => ({ label: accEnum("ledger", k), value: d.byLedger[k], color: AN_QUALITATIVE_COLORS[i % AN_QUALITATIVE_COLORS.length] }));
  const providerRows = Object.keys(d.byProvider).map((k) => ({ label: k, value: d.byProvider[k] })).sort((a, b) => b.value - a.value);
  const railRows = Object.keys(d.byRail).map((k) => ({ label: paymentSystemLabel(k), value: d.byRail[k] })).sort((a, b) => b.value - a.value);
  const holders = anTopHoldersHtml(ACCOUNTS_VIRTUAL_MOCK);

  return `
    ${anAccountsHero(d)}

    <div class="metrics-grid an-kpi-grid">
      ${renderMetricCard(d.total, cd.metrics.total)}
      ${renderMetricCard(d.virtual, cd.metrics.virtual)}
      ${renderMetricCard(d.real, cd.metrics.real)}
      ${renderMetricCard(d.correspondent, cd.metrics.correspondent)}
      ${renderMetricCard(d.nonzero, cd.metrics.nonzero)}
    </div>

    ${anFlatSection(
      cd.sections.statusKindTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(cd.sections.byStatus, dashDonut(statusSegments, { emptyText: cd.noData, stacked: true }))}</div>
        <div>${anChartCard(cd.sections.byKind, dashDonut(kindSegments, { emptyText: cd.noData, stacked: true }))}</div>
      </div>`,
      cd.sections.statusKindDesc
    )}

    ${anFlatSection(
      cd.sections.typeLedgerTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(cd.sections.typeTitle, anBarListHtml(typeRows, { emptyText: cd.noData }))}</div>
        <div>${anChartCard(cd.sections.ledgerTitle, dashDonut(ledgerSegments, { emptyText: cd.noData, stacked: true }))}</div>
      </div>`,
      cd.sections.typeLedgerDesc
    )}

    ${anFlatSection(
      cd.sections.providerRailTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(cd.sections.providerTitle, anBarListHtml(providerRows, { emptyText: cd.noData }))}</div>
        <div>${anChartCard(cd.sections.railTitle, anBarListHtml(railRows, { emptyText: cd.noData }))}</div>
      </div>`,
      cd.sections.providerRailDesc
    )}

    ${anFlatSection(cd.sections.balancesVirtualTitle, anChartCard(null, anBalanceTableHtml(d.balancesVirtual)), cd.sections.balancesVirtualDesc)}
    ${anFlatSection(cd.sections.balancesRealTitle, anChartCard(null, anBalanceTableHtml(d.balancesReal)), cd.sections.balancesRealDesc)}
    ${anFlatSection(cd.sections.balancesNostroTitle, anChartCard(null, anBalanceTableHtml(d.balancesNostro)), cd.sections.balancesNostroDesc)}

    ${holders.currency ? anFlatSection(cd.sections.topHoldersTitle, anChartCard(null, holders.html), cd.sections.topHoldersDesc(holders.currency)) : ""}

    ${anFlatSection(
      cd.sections.restrictedTitle,
      anChartCard(
        null,
        d.restricted.length
          ? `<div class="table-scroll"><table class="data-table">
              <thead><tr><th>${cd.restricted.account}</th><th>${cd.restricted.kind}</th><th>${cd.restricted.owner}</th><th>${cd.restricted.status}</th><th>${cd.restricted.reason}</th></tr></thead>
              <tbody>${d.restricted.map(anAccountsRestrictedRowHtml).join("")}</tbody>
            </table></div>`
          : `<div class="dash-empty">${cd.noData}</div>`
      ),
      cd.sections.restrictedDesc
    )}
  `;
}

function exportAnalyticsAccountsPdf() {
  const root = document.getElementById("view-container");
  if (!root) return;
  const name = t("nav.analytics-accounts");
  exPrintHtml(exPdfHtml(name, name, anCurrentDateText(), root.innerHTML), name);
}

function initAnalyticsAccounts() {
  const content = document.getElementById("view-container");
  content.querySelectorAll("[data-acc-hash]").forEach((btn) => {
    btn.addEventListener("click", () => { window.location.hash = btn.dataset.accHash; });
  });
  content.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn)));
  });
  content.querySelectorAll("tr[data-acc-row-hash]").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, a")) return;
      window.location.hash = tr.dataset.accRowHash;
    });
  });
  const refreshBtn = document.getElementById("aa-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", () => { render(); showToast(t("analyticsAccounts.hero.refreshed")); });
  const exportBtn = document.getElementById("aa-export-pdf");
  if (exportBtn) exportBtn.addEventListener("click", () => exportAnalyticsAccountsPdf());
}
/* ==========================================================================
   Аналитика → "Операционный день" и "События": агрегаты по мокам EOD и
   аудит-логов. Отдельной ручки статистики в бэкенде нет (EOD: есть лишь
   vabsActive…-сравнения активного дня; audit-log: только auditLogs с фильтрами
   и count), поэтому считаем на клиенте — для прототипа это честная витрина
   того, что можно построить поверх списочных запросов.
   ========================================================================== */
function anCountBy(list, getter) {
  const out = {};
  list.forEach((x) => { const k = getter(x); if (k != null && k !== "") out[k] = (out[k] || 0) + 1; });
  return out;
}

function anSortedList(counts, labeler) {
  return Object.keys(counts).map((k) => ({ label: labeler(k), value: counts[k] })).sort((a, b) => b.value - a.value);
}

function anBindCommon() {
  const content = document.getElementById("view-container");
  content.querySelectorAll(".collapsible-card-head").forEach((btn) => btn.addEventListener("click", () => btn.closest(".collapsible-card").classList.toggle("is-collapsed")));
  content.querySelectorAll("[data-vb-hash]").forEach((btn) => btn.addEventListener("click", () => { window.location.hash = btn.dataset.vbHash; }));
}

// ---- Операционный день ---------------------------------------------------------
function anEodData() {
  const closed = EOD_DAYS.filter((d) => d.status === "CLOSED" && d.startDatetime && d.endDatetimeActual);
  const started = EOD_DAYS.filter((d) => d.startDatetime);
  const durations = closed.map((d) => d.endDatetimeActual - d.startDatetime);
  const volumes = {};
  let operations = 0;
  started.forEach((d) => {
    const s = eodDayStats(d);
    operations += s.operations;
    s.volumes.forEach((v) => { volumes[v.currency] = (volumes[v.currency] || 0) + v.amount; });
  });
  const perDay = EOD_DAYS.map((d) => ({ day: d, n: eodDiscrepanciesOfDay(d.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 8);
  return {
    days: EOD_DAYS.length,
    closed: closed.length,
    operations,
    avgClose: durations.length ? durations.reduce((s, x) => s + x, 0) / durations.length : 0,
    discrepancies: EOD_DISCREPANCIES.length,
    open: EOD_DISCREPANCIES.filter(eodIsOpenDiscrepancy).length,
    daysWithDisc: new Set(EOD_DISCREPANCIES.map((d) => d.eodId)).size,
    byDayStatus: anCountBy(EOD_DAYS, (d) => d.status),
    byCloseType: anCountBy(EOD_DAYS, (d) => d.closeType),
    byDiscStatus: anCountBy(EOD_DISCREPANCIES, (d) => d.status),
    byReconType: anCountBy(EOD_DISCREPANCIES, (d) => d.reconciliationType),
    byResolution: anCountBy(EOD_DISCREPANCIES, (d) => (eodLastResolution(d) ? eodLastResolution(d).resolutionType : "")),
    volumes,
    perDay,
    snapshots: EOD_SNAPSHOTS.length,
    brokenSnapshots: EOD_SNAPSHOTS.filter((s) => eodSnapshotDifference(s) !== 0).length,
  };
}

const AN_EOD_STATUS_COLORS = { CLOSED: "var(--color-success)", OPEN: "var(--color-info)", CLOSING_PROCESS: "var(--color-info)", AWAITING_APPROVAL: "var(--color-warning)", FAILED: "var(--color-danger)", PLANNED: "var(--color-border)" };
const AN_DISC_STATUS_COLORS = { DETECTED: "var(--color-danger)", PENDING_DECISION: "var(--color-warning)", RESOLVED: "var(--color-success)" };

function anEodHero(d, c) {
  const statusSegments = Object.keys(d.byDayStatus).map((k) => ({ value: d.byDayStatus[k], label: eodEnum("status", k), color: AN_EOD_STATUS_COLORS[k] || "var(--color-text-tertiary)" }));
  return `<div class="hm-hero">
    <div class="hm-hero-main">
      <h1 class="hm-hello">${t("nav.analytics-eod")}</h1>
      <div class="hm-date">${anCurrentDateText()}</div>
      <p class="hm-lead">${c.hero.lead}</p>
      <div class="hm-pills">
        <span class="hm-pill"><strong>${d.days}</strong> ${c.metrics.days}</span>
        <span class="hm-pill"><strong>${d.open}</strong> ${c.metrics.open}</span>
      </div>
      <div class="ed-actions">
        <button type="button" class="btn-secondary an-hero-btn" id="ae-refresh">${AN_REFRESH_ICON_SVG}<span>${c.hero.refresh}</span></button>
        <button type="button" class="btn-secondary an-hero-btn" id="ae-export-pdf">${DOWNLOAD_ICON_SVG}<span>${c.hero.exportPdf}</span></button>
      </div>
    </div>
    <div class="hm-hero-map">
      <div class="an-hero-donut">${dashDonut(statusSegments, { emptyText: c.noData, legendNarrow: true, large: true })}</div>
    </div>
  </div>`;
}

function viewAnalyticsEod() {
  const d = anEodData();
  const c = t("analyticsEod");
  const statusSegments = Object.keys(d.byDayStatus).map((k) => ({ value: d.byDayStatus[k], label: eodEnum("status", k), color: AN_EOD_STATUS_COLORS[k] || "var(--color-text-tertiary)" }));
  const closeSegments = Object.keys(d.byCloseType).map((k, i) => ({ label: eodEnum("closeType", k), value: d.byCloseType[k], color: AN_QUALITATIVE_COLORS[i % AN_QUALITATIVE_COLORS.length] }));
  const volRows = Object.keys(d.volumes).sort().map((cur) => { const v = Math.round(d.volumes[cur]); return { label: cur, value: v, displayValue: v.toLocaleString("ru-RU") }; });
  const discSegments = Object.keys(d.byDiscStatus).map((k) => ({ value: d.byDiscStatus[k], label: eodEnum("discStatus", k), color: AN_DISC_STATUS_COLORS[k] || "var(--color-text-tertiary)" }));
  const reconRows = anSortedList(d.byReconType, (k) => eodEnum("reconType", k));
  const resolutionRows = anSortedList(d.byResolution, (k) => eodEnum("resolution", k));

  return `
    ${anEodHero(d, c)}

    <div class="metrics-grid an-kpi-grid">
      ${renderMetricCard(d.days, c.metrics.days)}
      ${renderMetricCard(d.operations.toLocaleString("ru-RU"), c.metrics.operations)}
      ${renderMetricCard(d.avgClose ? eodDuration(d.avgClose) : "—", c.metrics.avgClose)}
      ${renderMetricCard(d.discrepancies, c.metrics.discrepancies)}
      ${renderMetricCard(d.open, c.metrics.open)}
    </div>

    ${anFlatSection(
      c.sections.statusCloseTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(c.sections.daysTitle, dashDonut(statusSegments, { emptyText: c.noData, stacked: true }))}</div>
        <div>${anChartCard(c.sections.closeTypeTitle, dashDonut(closeSegments, { emptyText: c.noData, stacked: true }))}</div>
      </div>`,
      c.sections.statusCloseDesc
    )}

    ${anFlatSection(c.sections.volumeTitle, anChartCard(null, anBarListHtml(volRows, { emptyText: c.noData })), c.sections.volumeDesc)}

    ${anFlatSection(
      c.sections.discTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(c.sections.discStatusTitle, dashDonut(discSegments, { emptyText: c.noData, stacked: true }))}</div>
        <div>${anChartCard(c.sections.reconTitle, anBarListHtml(reconRows, { emptyText: c.noData }))}</div>
      </div>`,
      c.sections.discDesc
    )}

    ${anFlatSection(c.sections.resolutionTitle, anChartCard(null, anBarListHtml(resolutionRows, { emptyText: c.noData })), c.sections.resolutionDesc)}

    ${anFlatSection(
      c.sections.topDaysTitle,
      anChartCard(
        null,
        d.perDay.length
          ? `<div class="table-scroll"><table class="data-table">
              <thead><tr><th>${c.topDays.day}</th><th>${c.topDays.count}</th><th>${c.topDays.status}</th></tr></thead>
              <tbody>${d.perDay.map((x) => `<tr><td>${eodDayLink(x.day)}</td><td>${x.n}</td><td>${eodStatusBadge(x.day.status)}</td></tr>`).join("")}</tbody>
            </table></div>`
          : `<div class="dash-empty">${c.noData}</div>`
      ),
      c.sections.topDaysDesc
    )}

    ${anFlatSection(
      c.sections.snapshotsTitle,
      anChartCard(null, `<div class="rg-meta-list">${rgMetaRow(c.snapshots.total, d.snapshots)}${rgMetaRow(c.snapshots.broken, d.brokenSnapshots)}</div>`),
      c.sections.snapshotsDesc
    )}
  `;
}

function exportAnalyticsEodPdf() {
  const root = document.getElementById("view-container");
  if (!root) return;
  const name = t("nav.analytics-eod");
  exPrintHtml(exPdfHtml(name, name, anCurrentDateText(), root.innerHTML), name);
}

function initAnalyticsEod() {
  anBindCommon();
  const refreshBtn = document.getElementById("ae-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", () => { render(); showToast(t("analyticsEod.hero.refreshed")); });
  const exportBtn = document.getElementById("ae-export-pdf");
  if (exportBtn) exportBtn.addEventListener("click", () => exportAnalyticsEodPdf());
}
const AN_SEVERITY_COLORS = { INFO: "var(--color-text-tertiary)", WARNING: "var(--color-warning)", CRITICAL: "var(--color-danger)" };
const AN_RESULT_COLORS = { SUCCESS: "var(--color-success)", FAILURE: "var(--color-danger)" };

function anEventsData() {
  const L = AUDIT_LOGS_MOCK;
  const ev = (r) => r.event;
  return {
    total: L.length,
    critical: L.filter((r) => ev(r) && ev(r).severity === "CRITICAL").length,
    failures: L.filter((r) => r.result.status === "FAILURE").length,
    actors: new Set(L.map((r) => r.actor.id)).size,
    noEvent: L.filter((r) => !ev(r)).length,
    bySeverity: anCountBy(L, (r) => (ev(r) ? ev(r).severity : "")),
    byResult: anCountBy(L, (r) => r.result.status),
    byActorType: anCountBy(L, (r) => r.actor.type),
    byCategory: anCountBy(L, (r) => (ev(r) ? ev(r).category : "")),
    byAction: anCountBy(L, (r) => (ev(r) ? ev(r).action : "")),
    bySource: anCountBy(L, (r) => r.source),
    byEntity: anCountBy(L, (r) => (ev(r) ? ev(r).entity : "")),
    topActors: anSortedList(anCountBy(L, (r) => r.actor.id), (id) => { const r = L.find((x) => x.actor.id === id); return auActorLabel(r); }).slice(0, 8),
  };
}

function anEventsHero(d, c) {
  const severitySegments = Object.keys(d.bySeverity).map((k) => ({ value: d.bySeverity[k], label: auEnum("severity", k), color: AN_SEVERITY_COLORS[k] || "var(--color-brand)" }));
  return `<div class="hm-hero">
    <div class="hm-hero-main">
      <h1 class="hm-hello">${t("nav.analytics-events")}</h1>
      <div class="hm-date">${anCurrentDateText()}</div>
      <p class="hm-lead">${c.hero.lead}</p>
      <div class="hm-pills">
        <span class="hm-pill"><strong>${d.total}</strong> ${c.metrics.total}</span>
        <span class="hm-pill"><strong>${d.critical}</strong> ${c.metrics.critical}</span>
      </div>
      <div class="ed-actions">
        <button type="button" class="btn-secondary an-hero-btn" id="av-refresh">${AN_REFRESH_ICON_SVG}<span>${c.hero.refresh}</span></button>
        <button type="button" class="btn-secondary an-hero-btn" id="av-export-pdf">${DOWNLOAD_ICON_SVG}<span>${c.hero.exportPdf}</span></button>
      </div>
    </div>
    <div class="hm-hero-map">
      <div class="an-hero-donut">${dashDonut(severitySegments, { emptyText: c.noData, legendNarrow: true, large: true })}</div>
    </div>
  </div>`;
}

function viewAnalyticsEvents() {
  const d = anEventsData();
  const c = t("analyticsEvents");
  const seg = (counts, colors, group) => Object.keys(counts).map((k, i) => ({ value: counts[k], label: auEnum(group, k), color: (colors && colors[k]) || AN_QUALITATIVE_COLORS[i % AN_QUALITATIVE_COLORS.length] }));

  return `
    ${anEventsHero(d, c)}

    <div class="metrics-grid an-kpi-grid">
      ${renderMetricCard(d.total, c.metrics.total)}
      ${renderMetricCard(d.critical, c.metrics.critical)}
      ${renderMetricCard(d.failures, c.metrics.failures)}
      ${renderMetricCard(d.actors, c.metrics.actors)}
      ${renderMetricCard(d.noEvent, c.metrics.noEvent)}
    </div>

    ${anFlatSection(
      c.sections.severityResultTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(c.sections.severityTitle, dashDonut(seg(d.bySeverity, AN_SEVERITY_COLORS, "severity"), { emptyText: c.noData, stacked: true }))}</div>
        <div>${anChartCard(c.sections.resultTitle, dashDonut(seg(d.byResult, AN_RESULT_COLORS, "result"), { emptyText: c.noData, stacked: true }))}</div>
      </div>`,
      c.sections.severityResultDesc
    )}

    ${anFlatSection(
      c.sections.actorSourceTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(c.sections.actorTypeTitle, dashDonut(seg(d.byActorType, null, "actorType"), { emptyText: c.noData, stacked: true }))}</div>
        <div>${anChartCard(c.sections.sourceTitle, dashDonut(seg(d.bySource, null, "source"), { emptyText: c.noData, stacked: true }))}</div>
      </div>`,
      c.sections.actorSourceDesc
    )}

    ${anFlatSection(
      c.sections.categoryActionTitle,
      `<div class="an-split" style="display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:24px">
        <div>${anChartCard(c.sections.categoryTitle, anBarListHtml(anSortedList(d.byCategory, (k) => auEnum("category", k)), { emptyText: c.noData }))}</div>
        <div>${anChartCard(c.sections.actionTitle, anBarListHtml(anSortedList(d.byAction, (k) => auEnum("action", k)), { emptyText: c.noData }))}</div>
      </div>`,
      c.sections.categoryActionDesc
    )}

    ${anFlatSection(c.sections.entityTitle, anChartCard(null, anBarListHtml(anSortedList(d.byEntity, (k) => auEnum("entity", k)), { emptyText: c.noData })), c.sections.entityDesc)}

    ${anFlatSection(c.sections.actorsTitle, anChartCard(null, anBarListHtml(d.topActors, { emptyText: c.noData })), c.sections.actorsDesc)}

    <p class="table-cell-muted">${c.note}</p>
  `;
}

function exportAnalyticsEventsPdf() {
  const root = document.getElementById("view-container");
  if (!root) return;
  const name = t("nav.analytics-events");
  exPrintHtml(exPdfHtml(name, name, anCurrentDateText(), root.innerHTML), name);
}

function initAnalyticsEvents() {
  anBindCommon();
  const refreshBtn = document.getElementById("av-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", () => { render(); showToast(t("analyticsEvents.hero.refreshed")); });
  const exportBtn = document.getElementById("av-export-pdf");
  if (exportBtn) exportBtn.addEventListener("click", () => exportAnalyticsEventsPdf());
}