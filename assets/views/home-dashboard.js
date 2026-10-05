/* ==========================================================================
   Главная: сводный дашборд по разделам платформы.
   Быстрая навигация (плитки по группам сайдбара) + карточки с краткими
   показателями каждого раздела (Клиенты, Операции, Счета, Операционный день,
   Безопасность, Тарифы), диаграммы — инлайн (без библиотек). У каждой
   карточки — переход к разделу и к «Аналитике» (полная статистика,
   прорабатывается отдельно).
   Данные берутся из тех же моков, что и разделы; здесь ничего не создаётся.
   ========================================================================== */

function dh(path) {
  return t(`home.${path}`);
}

// ---- Примитивы графиков (без библиотек, инлайн SVG/CSS) --------------------------------------

// Горизонтальная составная полоса + легенда. segments: [{ value, label, color }]
function dashStackedBar(segments, opts) {
  const clean = segments.filter((s) => s.value > 0);
  const total = clean.reduce((n, s) => n + s.value, 0);
  if (!total) return `<div class="dash-empty">${(opts && opts.emptyText) || dh("common.noData")}</div>`;
  const bar = clean
    .map((s) => `<span class="dash-bar-seg" style="flex-grow:${s.value};background:${s.color}" title="${pdEscape(s.label)}: ${s.value}"></span>`)
    .join("");
  const legend = clean
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((s) => `<div class="dash-legend-row"><span class="dash-legend-dot" style="background:${s.color}"></span><span class="dash-legend-label">${pdEscape(s.label)}</span><span class="dash-legend-value">${s.value}</span></div>`)
    .join("");
  return `<div class="dash-bar">${bar}</div><div class="dash-legend">${legend}</div>`;
}

// Донат (hmDonut ниже — общий SVG-строитель дуг, здесь просто крупнее и с легендой и суммой в центре) — для
// категориальных распределений (статус, риск), где важна доля от целого, а не ранжирование, как в dashTopList.
// opts.stacked — легенда под кругом, а не сбоку (для рядов из нескольких донатов в узких колонках).
// opts.legendLeft/opts.legendNarrow — легенда узкой колонкой (не растянутой auto-fit-сеткой на всю ширину) слева
// или справа от круга соответственно; нужно для одиночного доната в широком контейнере, например в шапке-хиро, —
// там обычное "сбоку" означало "сеткой на всю оставшуюся ширину". opts.large — крупнее (для шапки-хиро, где обычный
// 132px-круг теряется на фоне остального контента шапки).
function dashDonut(segments, opts) {
  const clean = segments.filter((s) => s.value > 0);
  const total = clean.reduce((n, s) => n + s.value, 0);
  if (!total) return `<div class="dash-empty">${(opts && opts.emptyText) || dh("common.noData")}</div>`;
  const legend = clean
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((s) => `<div class="dash-legend-row"><span class="dash-legend-dot" style="background:${s.color}"></span><span class="dash-legend-label">${pdEscape(s.label)}</span><span class="dash-legend-value">${s.value}</span></div>`)
    .join("");
  const cls = `dash-donut-wrap${opts && opts.stacked ? " is-stacked" : ""}${opts && opts.legendLeft ? " is-legend-left" : ""}${opts && opts.legendNarrow ? " is-legend-narrow" : ""}${opts && opts.large ? " is-large" : ""}`;
  return `<div class="${cls}"><div class="dash-donut-visual">${hmDonut(clean)}<div class="dash-donut-center">${total}</div></div><div class="dash-legend">${legend}</div></div>`;
}

// Список «топ N» с мини-полосой пропорционально максимуму. rows: [{ icon, label, value }]
function dashTopList(rows, opts) {
  if (!rows.length) return `<div class="dash-empty">${(opts && opts.emptyText) || dh("common.noData")}</div>`;
  const max = Math.max(...rows.map((r) => r.value));
  return `<div class="dash-toplist">${rows
    .map(
      (r) => `<div class="dash-top-row">
        ${r.icon ? `<span class="dash-top-icon">${r.icon}</span>` : ""}
        <span class="dash-top-label">${pdEscape(r.label)}</span>
        <span class="dash-top-bar-track"><span class="dash-top-bar-fill" style="width:${Math.max(6, Math.round((r.value / max) * 100))}%"></span></span>
        <span class="dash-top-value">${r.displayValue || r.value.toLocaleString("ru-RU")}</span>
      </div>`
    )
    .join("")}</div>`;
}

function dashStat(value, label) {
  return `<div class="dash-stat"><div class="dash-stat-value">${value}</div><div class="dash-stat-label">${label}</div></div>`;
}

// ==========================================================================
// Главная: герой (логотип, приветствие, карта мира с клиентами по странам) и
// минималистичные плитки разделов: цифра, динамика/кольцо, ссылки.
// ==========================================================================

// Упрощённые контуры суши, [долгота, широта]. Рисуются равнопромежуточной
// проекцией (2 px на градус) и заливаются точечным паттерном.
const HM_LAND = [
  // Евразия
  [[-9,37],[-9,43],[-2,43.5],[-1,46],[-4.5,48.5],[2,51],[5,53.5],[8,54.5],[8.5,57],[10.5,57.5],[10.5,55],[12.5,54.5],[19,54.5],[21,57],[24,57.5],[23.5,59.5],[30,60],[22,60.5],[21.5,63],[25,65.5],[22,66],[18,63],[17,61],[19,59.5],[16.5,56.5],[13,55.5],[11,59],[6,58],[5,61],[8,63.5],[14,67],[20,70],[28,71],[33,69.5],[41,67.5],[44,66],[41,64.5],[43,67],[48,67.5],[53,68.5],[60,69],[68,68.5],[68,71],[73,72.5],[80,73],[87,75],[100,77],[105,77.5],[113,74],[128,73],[140,72.5],[150,71.5],[160,69.5],[170,70],[180,68.5],[180,65],[177,64.5],[170,60],[163,58],[162,55],[156,51],[156,57],[159.5,61],[152,59],[143,59],[136,54.5],[141,52.5],[140,48],[135,43.5],[130,42.5],[129,40],[128,38],[129,35.5],[126.5,34.5],[125.5,37.5],[124.5,39.5],[121.5,39],[122,37],[119,37],[120.5,35.5],[121.5,32],[122,30],[120.5,26.5],[117,23.5],[113,22],[110,20.5],[108,21.5],[106,19],[108.5,15],[109,12],[105,8.7],[103,10.5],[101,13],[99.5,10],[100.5,7],[103.5,1.5],[101,3],[98.5,8],[98,12.5],[97.5,16.5],[94.5,16],[94,19],[91.5,22.5],[89,22],[87,21.5],[85,19.5],[80.5,15.5],[80,10.5],[77.5,8],[75,12],[73,17],[72.8,20.5],[70,21],[68.5,23.5],[66.5,25.5],[61.5,25],[57,26],[56.5,27],[54,26.7],[51,29],[48.5,30],[50,26],[51.5,24.5],[54,24],[56.5,24.5],[57.5,23.5],[59.5,22.5],[58,20.5],[55,17],[52,16],[45,13],[43,13],[42.5,16],[39,21.5],[36.5,27],[34.5,28],[33,30],[32.5,31.2],[34.5,31.5],[35,33.5],[36,36],[32,36],[28,36.5],[26.5,39],[27,40.5],[29,41],[35,42],[41.5,41.5],[38,44.5],[37.5,46.5],[35,45],[33.5,44.5],[31,46.5],[29.5,45.5],[28.5,43.5],[27.5,42],[26,40.5],[23.5,40],[22.5,37],[21,38],[19.5,40.5],[16,42],[18.5,40],[16.5,38],[15.5,40],[12.5,41.5],[10,44],[8,44],[3.5,43],[3,42],[0,39.5],[-0.5,38],[-2,36.7],[-5,36],[-6.5,37]],
  // Африка
  [[-17,21],[-16,24],[-13,28],[-10,30],[-9.5,32.5],[-6,35.8],[0,35.5],[10,37],[11,33.5],[15,32.5],[20,31],[25,31.7],[32,31.2],[34,28],[35.5,24],[37.5,19],[39,15.5],[43,12.5],[51,11.8],[48,5],[42,-1],[40,-5],[39,-10],[40.5,-15],[35,-20],[35.5,-24],[32.5,-28.5],[30,-31.5],[27,-33.5],[22,-34],[18.5,-34.2],[17,-29],[15,-26],[12,-18],[13.5,-12],[12,-6],[9,-1],[9.5,4],[7,4.5],[4,6.3],[-2,5],[-8,4.5],[-13,8],[-15,11],[-17,14.5],[-16.5,19]],
  [[44,-25],[47,-25],[50,-15.5],[49,-12],[47,-15],[44,-20]],
  // Северная Америка
  [[-168,66],[-166,68.5],[-156,71.5],[-140,70],[-128,70],[-115,68],[-95,68],[-90,69],[-82,69.5],[-81,66],[-87,64],[-94,60],[-93,58.5],[-88,56],[-82,55],[-80,52],[-79,51],[-77,55],[-78,59],[-77,62],[-73,62],[-70,59],[-65,60],[-62,57],[-56,52.5],[-59,48],[-65,49.5],[-65,47.5],[-61,45.5],[-66,44],[-70,43.5],[-71,41.5],[-74,40.5],[-76,38],[-76,35],[-81,31.5],[-80,27],[-80,25.2],[-81.5,25.5],[-83,29],[-85,29.7],[-89,30],[-91,29.2],[-94,29.5],[-97.5,27],[-97.5,22],[-96,19],[-94,18.2],[-91,18.5],[-90.5,21],[-87,21.5],[-88,16],[-84,15.5],[-83.5,11],[-80,9],[-77.5,8.5],[-79,7.5],[-81,8],[-85.5,10.5],[-87.5,13],[-92,14.5],[-96,15.8],[-101,17.5],[-105.5,20],[-105.5,23],[-109,25.5],[-112,29.5],[-113,31],[-114.8,31.8],[-112.5,28],[-110,23.5],[-110.5,23],[-112,25],[-114.5,29.5],[-115.5,30.5],[-117,32.5],[-120.5,34.5],[-122.5,37.5],[-124,40.5],[-124,46.5],[-123,48.5],[-127,50.5],[-130,54],[-134,58],[-138,59.5],[-144,60],[-149,60],[-152,58.5],[-157,57],[-162,55],[-158,58.5],[-162,59.5],[-165,61],[-166,64]],
  [[-73,78.5],[-66,81],[-40,83.3],[-20,82],[-19,77],[-22,72],[-27,68.5],[-40,65],[-43.5,60],[-49,61],[-53,66],[-55,70],[-58,75.5]],
  [[-85,22],[-80,23.2],[-74,20],[-78,20.5],[-82,22.5]],
  // Южная Америка
  [[-77,8.5],[-72,12],[-63,10.7],[-60,8.5],[-52,5],[-50,1.5],[-48,-1],[-44,-2.5],[-38.5,-4],[-35,-6],[-35.5,-9.5],[-39,-14],[-39,-18],[-41,-22],[-45,-23.8],[-48.5,-26],[-48.5,-28.5],[-52.5,-33],[-54.5,-34.8],[-57,-35],[-57.5,-38],[-62,-39],[-63,-41],[-65,-42],[-65.5,-45],[-67.5,-46.5],[-66,-48.5],[-69,-51],[-68.5,-53],[-72,-54],[-74.5,-50],[-74,-45],[-73.5,-40],[-71.5,-32],[-70.5,-25],[-70.3,-18.5],[-76,-14],[-79,-8],[-81,-5],[-80,-2.5],[-80,0.5],[-78.5,2.5],[-77.5,7]],
  // Океания и острова
  [[114,-22],[113.5,-26],[115,-34],[118,-35],[123,-33.8],[130,-31.5],[135.5,-34.8],[138,-35.5],[140,-38],[146,-39],[150,-37.5],[153,-31],[153.5,-26],[150,-22],[146,-19],[145.5,-15],[143.5,-14],[142.5,-10.7],[141.5,-13.5],[141,-17],[136.5,-15.5],[135.5,-12],[131,-11.5],[129,-14.8],[126,-14],[123,-17],[121,-19.5],[117,-20.5]],
  [[172.5,-34.5],[178,-37.7],[175,-41.5],[173,-40]],
  [[172.5,-40.5],[174,-41.5],[171,-45],[167,-46],[168,-44]],
  [[131,-1],[135,-3.5],[141,-2.6],[147,-6],[150,-10.5],[143,-9],[138,-8],[133,-4]],
  [[95.3,5.5],[98,4],[103,-1],[106,-3],[105.5,-5.8],[101,-2.5],[97,2]],
  [[109,1.5],[111,1.5],[115,5],[119,5.2],[118,1],[116,-3.8],[112,-3.8],[110,-2]],
  [[105.3,-6.5],[108,-6.5],[114.5,-7.7],[114,-8.5],[106,-7.5]],
  [[130,31.5],[132,33.5],[135,34],[139,35],[141,38],[142,41],[140,41],[140,39],[136.5,37],[133,35.5],[131,34.5]],
  [[140,42],[141.5,45.4],[145,43.5],[143,42]],
  [[-5.5,50],[1.5,51],[1.7,53],[-0.5,54.5],[-2,57.5],[-3.5,58.6],[-6,58],[-5.5,56],[-5,54.8],[-3,54],[-4.5,53],[-5,51.7]],
  [[-10,51.8],[-6,52],[-6,54.2],[-8,55],[-10,54]],
  [[-24,65.5],[-18,66.5],[-13.5,65],[-19,63.4],[-22.5,64]],
];

// Центры стран для пузырей (широта, долгота)
const HM_COUNTRY_GEO = { kg: [41.5, 74.5], kz: [48, 67], uz: [41, 64], tj: [38.8, 71], ru: [56, 40], az: [40.3, 47.6] };

// Замкнутый сглаженный контур: квадратичные кривые через середины рёбер
function hmSmoothPath(poly, px, py) {
  const pts = poly.map(([lo, la]) => [+px(lo), +py(la)]);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = pts.length;
  const start = mid(pts[n - 1], pts[0]);
  let d = `M${start[0].toFixed(1)} ${start[1].toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += `Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

// Карта: сглаженные силуэты суши + пузыри с числом клиентов. Двигается мышью,
// масштабируется колесом и кнопками (см. initHomeMap).
// mapId — id корневого узла (нужен уникальным, если на странице несколько карт сразу, например по секциям
// "Пользователи"/"Компании" в аналитике: initInteractiveMap ниже цепляется к DOM по этому же id).
function hmMapSvg(points, mapId = "hm-map") {
  const px = (lon) => ((lon + 180) * 2).toFixed(1);
  const py = (lat) => ((85 - lat) * 2).toFixed(1);
  const path = HM_LAND.map((poly) => hmSmoothPath(poly, px, py)).join("");
  const max = Math.max(1, ...points.map((p) => p.value));
  const bubbles = points
    .map((p) => {
      const g = HM_COUNTRY_GEO[p.id];
      if (!g) return "";
      const r = 8 + Math.round((p.value / max) * 8);
      return `<g class="hm-bubble" data-r="${r}" transform="translate(${px(g[1])} ${py(g[0])})"><title>${pdEscape(p.name)}: ${p.value}</title><circle r="${r}"/><text y="1" text-anchor="middle" dominant-baseline="middle">${p.value}</text></g>`;
    })
    .join("");
  return `<div class="hm-map" id="${mapId}">
    <svg class="hm-map-svg" viewBox="0 0 720 290" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><pattern id="hm-dotpat-${mapId}" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.35"/></pattern></defs><g id="${mapId}-g"><path class="hm-land" d="${path}" fill="url(#hm-dotpat-${mapId})"/>${bubbles}</g></svg>
    <div class="hm-map-ctrl"><button type="button" data-hm-zoom="in" aria-label="+">+</button><button type="button" data-hm-zoom="out" aria-label="−">−</button><button type="button" data-hm-zoom="reset" aria-label="reset">⤾</button></div>
  </div>`;
}
function hmHero() {
  const hour = MOCK_NOW.getHours();
  const greeting = hour < 5 ? t("home.greetingNight") : hour < 12 ? t("home.greetingMorning") : hour < 18 ? t("home.greetingDay") : t("home.greetingEvening");
  const clients = CLIENTS_USERS_MOCK.length + CLIENTS_COMPANIES_MOCK.length;
  const dayMs = 24 * 60 * 60 * 1000;
  const opsToday = [...OPERATIONS_PAYMENTS_MOCK, ...OPERATIONS_EXCHANGES_MOCK].filter((r) => MOCK_NOW - r.createdDate <= dayMs).length;
  const openDisc = EOD_DISCREPANCIES.filter(eodIsOpenDiscrepancy).length;
  const counts = {};
  CLIENTS_USERS_MOCK.forEach((u) => { if (u.residenceCountryId) counts[u.residenceCountryId] = (counts[u.residenceCountryId] || 0) + 1; });
  const points = Object.keys(counts).map((id) => ({ id, value: counts[id], name: (findCountry(id) || { name: id }).name })).sort((a, b) => b.value - a.value);
  const date = new Intl.DateTimeFormat(t("home.locale"), { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(MOCK_NOW).replace(/\s*г\./, "");
  const chips = points.slice(0, 4).map((p) => { const c = findCountry(p.id); return `<span class="hm-chip">${c ? `<span class="dash-flag">${c.flag}</span>` : ""}${pdEscape(p.name)} · ${p.value}</span>`; }).join("");
  return `<section class="hm-hero">
    <div class="hm-hero-main">
      <div class="hm-brand"><img class="sidebar-brand-mark" src="assets/images/logo-icon.svg" alt="Asia Fintech" /><div class="sidebar-brand-text"><span class="sidebar-brand-title"><span class="brand-word">Asia</span> <span class="brand-word-accent">Fintech</span></span><span class="sidebar-brand-subtitle">${t("home.brandTag")}</span></div></div>
      <div class="hm-hello-row"><h1 class="hm-hello">${greeting}, ${pdEscape(CURRENT_ADMIN.name)}!</h1>${sectionHintBtn("hm-hint-btn", t("home.info"))}</div>
      <div class="hm-date">${date}</div>
      <div class="hm-pills">
        <button type="button" class="hm-pill" data-dash-hash="#/clients-users"><strong>${clients.toLocaleString("ru-RU")}</strong> ${t("home.pillClients")}</button>
        <button type="button" class="hm-pill" data-dash-hash="#/operations-payments"><strong>${opsToday}</strong> ${t("home.pillOps")}</button>
        <button type="button" class="hm-pill ${openDisc ? "is-warn" : ""}" data-dash-hash="#/eod-discrepancies"><strong>${openDisc}</strong> ${t("home.pillDisc")}</button>
      </div>
    </div>
    <div class="hm-hero-map">
      <div class="hm-map-head"><span></span><button type="button" class="hm-link" data-dash-hash="#/analytics-users">${t("home.allAnalytics")} →</button></div>
      ${hmMapSvg(points)}
      <div class="hm-map-chips">${chips}</div>
    </div>
  </section>`;
}

// ---- Мини-графики плиток ------------------------------------------------------
function hmSpark(values) {
  const max = Math.max(1, ...values);
  const w = 160, h = 44, step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 4 - (v / max) * (h - 12)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return `<svg class="hm-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${line}L${w} ${h}L0 ${h}Z" class="hm-spark-area"/><path d="${line}" class="hm-spark-line"/><circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="2.6" class="hm-spark-dot"/></svg>`;
}

function hmRing(fraction, label) {
  const r = 20, c = 2 * Math.PI * r;
  return `<div class="hm-ring"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="${r}" class="hm-ring-bg"/><circle cx="24" cy="24" r="${r}" class="hm-ring-fg" stroke-dasharray="${(c * fraction).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 24 24)"/></svg><span>${label}</span></div>`;
}

function hmDonut(segments) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const r = 20, c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((s) => {
    const len = (s.value / total) * c;
    const el = `<circle cx="24" cy="24" r="${r}" fill="none" stroke="${s.color}" stroke-width="7" stroke-dasharray="${len.toFixed(1)} ${(c - len).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 24 24)"/>`;
    offset += len;
    return el;
  }).join("");
  return `<svg class="hm-donut" viewBox="0 0 48 48" aria-hidden="true">${arcs}</svg>`;
}

// Динамика по дням за 7 суток: значения от старых к новым
function hmDaily(dates) {
  const dayMs = 24 * 60 * 60 * 1000;
  const out = Array(7).fill(0);
  dates.forEach((d) => { const k = Math.floor((MOCK_NOW - d) / dayMs); if (k >= 0 && k < 7) out[6 - k] += 1; });
  return out;
}

function hmDelta(values) {
  const prev = values.slice(0, 3).reduce((n, v) => n + v, 0);
  const cur = values.slice(4).reduce((n, v) => n + v, 0);
  if (!prev) return "";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `<span class="hm-delta ${pct >= 0 ? "is-up" : "is-down"}">${pct >= 0 ? "+" : ""}${pct}%</span>`;
}

// Минималистичная плитка: подпись, цифра, график справа, строка ссылок
function hmTile({ label, big, sub, visual, list, stats, settings }) {
  return `<article class="hm-tile">
    <button type="button" class="hm-tile-main" data-dash-hash="${list}">
      <span class="hm-tile-label">${label}</span>
      <span class="hm-tile-row"><span class="hm-tile-big">${big}</span><span class="hm-tile-visual">${visual || ""}</span></span>
      <span class="hm-tile-sub">${sub}</span>
    </button>
    <footer class="hm-tile-foot">
      ${stats ? `<button type="button" class="hm-link" data-dash-hash="${stats}">${t("home.linkStats")}</button>` : `<span></span>`}
      ${settings ? `<button type="button" class="hm-link is-muted" data-dash-hash="${settings}">${t("home.linkSettings")}</button>` : ""}
    </footer>
  </article>`;
}

// ---- Настройка карточек: какие показывать, что в них выводить, в каком порядке ---------------
// Хранится в localStorage (по аналогии с SIDEBAR_COLLAPSED_KEY в app.js): состояние чисто UI,
// не влияет на данные и не синхронизируется между админами/устройствами — допущение прототипа.
const HM_CARDS_STORAGE_KEY = "hm-dashboard-cards-v1";
// Карточки, включённые на главной по умолчанию (как было изначально) — остальные
// доступны в настройках, но появляются на дашборде только когда админ их включит.
const HM_DEFAULT_VISIBLE_IDS = ["clients", "companies", "operations", "accounts", "eod", "events"];
const HM_CARD_IDS = [...HM_DEFAULT_VISIBLE_IDS, "payments", "exchanges", "discrepancies", "partners", "currencies"];
const HM_METRIC_OPTIONS = {
  clients: ["total", "users", "companies", "byStatus", "byRisk"],
  companies: ["total", "today", "byStatus", "byRisk"],
  operations: ["today", "week", "byType"],
  accounts: ["top", "count"],
  eod: ["progress", "discrepancies"],
  events: ["today", "critical", "bySeverity"],
  payments: ["today", "week", "byStatus"],
  exchanges: ["today", "week"],
  discrepancies: ["open", "byType"],
  partners: ["total", "byStatus"],
  currencies: ["active", "disabled"],
};

function hmCardMeta() {
  return {
    clients: { label: t("nav.clients"), list: "#/clients-users", stats: "#/analytics-users", settings: "#/settings-verif-kyc" },
    companies: { label: t("nav.clients-companies"), list: "#/clients-companies", stats: "#/analytics-users", settings: "#/settings-verif-kyb" },
    operations: { label: t("nav.operations"), list: "#/operations-payments", stats: "#/analytics-operations", settings: "#/settings-tariffs-catalog" },
    accounts: { label: t("home.volumeTitle"), list: "#/accounts-virtual", stats: "#/analytics-accounts", settings: "#/settings-vabs-currencies" },
    eod: { label: t("nav.eod"), list: "#/eod-dashboard", stats: "#/analytics-eod", settings: "#/settings-eod-day" },
    events: { label: t("home.eventsTitle"), list: "#/security-audit-logs", stats: "#/analytics-events", settings: "#/settings-kyt-configs" },
    payments: { label: t("nav.operations-payments"), list: "#/operations-payments", stats: "#/analytics-operations", settings: "#/settings-tariffs-catalog" },
    exchanges: { label: t("nav.operations-exchanges"), list: "#/operations-exchanges", stats: "#/analytics-operations", settings: "#/settings-rates" },
    discrepancies: { label: t("nav.eod-discrepancies"), list: "#/eod-discrepancies", stats: "#/analytics-eod", settings: "#/settings-eod-reconciliation" },
    partners: { label: t("nav.clients-partners"), list: "#/clients-partners", stats: null, settings: null },
    currencies: { label: t("nav.settings-vabs-currencies"), list: "#/settings-vabs-currencies", stats: null, settings: null },
  };
}

function hmDefaultCardConfig() {
  return HM_CARD_IDS.map((id) => ({ id, visible: HM_DEFAULT_VISIBLE_IDS.includes(id), metric: HM_METRIC_OPTIONS[id][0] }));
}

function hmLoadCardConfig() {
  try {
    const raw = localStorage.getItem(HM_CARDS_STORAGE_KEY);
    if (!raw) return hmDefaultCardConfig();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return hmDefaultCardConfig();
    const seen = new Set();
    const out = [];
    parsed.forEach((c) => {
      if (!c || !HM_METRIC_OPTIONS[c.id] || seen.has(c.id)) return;
      seen.add(c.id);
      const opts = HM_METRIC_OPTIONS[c.id];
      out.push({ id: c.id, visible: c.visible !== false, metric: opts.includes(c.metric) ? c.metric : opts[0] });
    });
    HM_CARD_IDS.forEach((id) => { if (!seen.has(id)) out.push({ id, visible: HM_DEFAULT_VISIBLE_IDS.includes(id), metric: HM_METRIC_OPTIONS[id][0] }); });
    return out;
  } catch (e) {
    return hmDefaultCardConfig();
  }
}

function hmSaveCardConfig(cfg) {
  try {
    localStorage.setItem(HM_CARDS_STORAGE_KEY, JSON.stringify(cfg));
  } catch (e) {
    // localStorage недоступен — настройка просто не сохранится между визитами, не критично для прототипа
  }
}

// Общая палитра для донатов-разбивок без семантической окраски (статусы платежей,
// типы сверки, статусы партнёров) — циклом, в отличие от AN_STATUS_COLORS/AN_RISK_COLORS
// (analytics.js), где цвет привязан к конкретному значению енама.
const HM_PALETTE = ["var(--color-brand)", "var(--color-info)", "var(--color-warning)", "var(--color-danger)", "var(--color-success)", "var(--color-text-tertiary)"];

// Разбивка по категориям → тайл показывает самую крупную категорию числом и её долю,
// донат — всё распределение целиком (та же форма, что hmDonut уже использует в accTile).
function hmBreakdownMetric(counts, labelFn, colorFn) {
  const entries = Object.keys(counts)
    .map((k, i) => ({ key: k, value: counts[k], color: colorFn ? colorFn(k, i) : HM_PALETTE[i % HM_PALETTE.length] }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!entries.length) return { big: "—", sub: dh("common.noData"), visual: "" };
  const total = entries.reduce((n, e) => n + e.value, 0);
  const top = entries[0];
  const pct = total ? Math.round((top.value / total) * 100) : 0;
  return {
    big: top.value.toLocaleString("ru-RU"),
    sub: `${labelFn(top.key)} · ${pct}%`,
    visual: hmDonut(entries.map((e) => ({ value: e.value, color: e.color }))),
  };
}

function hmClientsMetric(metric) {
  const users = CLIENTS_USERS_MOCK;
  const companies = CLIENTS_COMPANIES_MOCK;
  if (metric === "users") {
    const d = hmDaily(users.map((u) => u.createdDate).filter(Boolean));
    return { big: users.length.toLocaleString("ru-RU"), sub: `${hmDelta(d)} ${t("home.newWeek")(d.reduce((n, v) => n + v, 0))}`, visual: hmSpark(d) };
  }
  if (metric === "companies") {
    const d = hmDaily(companies.map((c) => c.createdDate).filter(Boolean));
    return { big: companies.length.toLocaleString("ru-RU"), sub: `${hmDelta(d)} ${t("home.newWeek")(d.reduce((n, v) => n + v, 0))}`, visual: hmSpark(d) };
  }
  if (metric === "byStatus") {
    const counts = {};
    users.forEach((u) => { counts[u.kycStatus] = (counts[u.kycStatus] || 0) + 1; });
    return hmBreakdownMetric(counts, kycStatusLabel, (k) => AN_STATUS_COLORS[k] || "var(--color-text-tertiary)");
  }
  if (metric === "byRisk") {
    const counts = {};
    users.forEach((u) => { const lvl = u.scoringProfile && u.scoringProfile.scoringRiskLevel; if (lvl) counts[lvl] = (counts[lvl] || 0) + 1; });
    companies.forEach((c) => { if (c.scoringRiskLevel) counts[c.scoringRiskLevel] = (counts[c.scoringRiskLevel] || 0) + 1; });
    return hmBreakdownMetric(counts, riskLevelLabel, (k) => AN_RISK_COLORS[k] || "var(--color-text-tertiary)");
  }
  const d = hmDaily([...users, ...companies].map((c) => c.createdDate).filter(Boolean));
  return { big: (users.length + companies.length).toLocaleString("ru-RU"), sub: `${hmDelta(d)} ${t("home.newWeek")(d.reduce((n, v) => n + v, 0))}`, visual: hmSpark(d) };
}

function hmCompaniesMetric(metric) {
  const dayMs = 24 * 60 * 60 * 1000;
  const companies = CLIENTS_COMPANIES_MOCK;
  const d = hmDaily(companies.map((c) => c.createdDate).filter(Boolean));
  if (metric === "today") {
    const today = companies.filter((c) => c.createdDate && MOCK_NOW - c.createdDate <= dayMs).length;
    return { big: today.toLocaleString("ru-RU"), sub: t("home.newTodaySub"), visual: hmSpark(d) };
  }
  if (metric === "byStatus") {
    const counts = {};
    companies.forEach((c) => { const s = c.currentKYBLevelStatusV2 ? c.currentKYBLevelStatusV2.status : "NOT_CONNECTED"; counts[s] = (counts[s] || 0) + 1; });
    return hmBreakdownMetric(counts, kybStatusLabel, (k) => AN_STATUS_COLORS[k] || "var(--color-text-tertiary)");
  }
  if (metric === "byRisk") {
    const counts = {};
    companies.forEach((c) => { if (c.scoringRiskLevel) counts[c.scoringRiskLevel] = (counts[c.scoringRiskLevel] || 0) + 1; });
    return hmBreakdownMetric(counts, riskLevelLabel, (k) => AN_RISK_COLORS[k] || "var(--color-text-tertiary)");
  }
  return { big: companies.length.toLocaleString("ru-RU"), sub: `${hmDelta(d)} ${t("home.newWeek")(d.reduce((n, v) => n + v, 0))}`, visual: hmSpark(d) };
}

function hmOperationsMetric(metric) {
  const dayMs = 24 * 60 * 60 * 1000;
  const ops = [...OPERATIONS_PAYMENTS_MOCK, ...OPERATIONS_EXCHANGES_MOCK];
  const d = hmDaily(ops.map((r) => r.createdDate));
  if (metric === "week") {
    const week = d.reduce((n, v) => n + v, 0);
    return { big: week.toLocaleString("ru-RU"), sub: t("home.opsWeekTotalSub"), visual: hmSpark(d) };
  }
  if (metric === "byType") {
    const counts = { payments: OPERATIONS_PAYMENTS_MOCK.length, exchanges: OPERATIONS_EXCHANGES_MOCK.length };
    return hmBreakdownMetric(counts, (k) => t(`nav.operations-${k}`), (k, i) => HM_PALETTE[i]);
  }
  return { big: ops.filter((r) => MOCK_NOW - r.createdDate <= dayMs).length.toLocaleString("ru-RU"), sub: `${hmDelta(d)} ${t("home.opsWeek")}`, visual: hmSpark(d) };
}

function hmPaymentsMetric(metric) {
  const dayMs = 24 * 60 * 60 * 1000;
  const rows = OPERATIONS_PAYMENTS_MOCK;
  const d = hmDaily(rows.map((r) => r.createdDate));
  if (metric === "week") {
    const week = d.reduce((n, v) => n + v, 0);
    return { big: week.toLocaleString("ru-RU"), sub: t("home.opsWeekTotalSub"), visual: hmSpark(d) };
  }
  if (metric === "byStatus") {
    const counts = {};
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return hmBreakdownMetric(counts, paymentStatusLabel);
  }
  return { big: rows.filter((r) => MOCK_NOW - r.createdDate <= dayMs).length.toLocaleString("ru-RU"), sub: `${hmDelta(d)} ${t("home.opsWeek")}`, visual: hmSpark(d) };
}

function hmExchangesMetric(metric) {
  const dayMs = 24 * 60 * 60 * 1000;
  const rows = OPERATIONS_EXCHANGES_MOCK;
  const d = hmDaily(rows.map((r) => r.createdDate));
  if (metric === "week") {
    const week = d.reduce((n, v) => n + v, 0);
    return { big: week.toLocaleString("ru-RU"), sub: t("home.opsWeekTotalSub"), visual: hmSpark(d) };
  }
  return { big: rows.filter((r) => MOCK_NOW - r.createdDate <= dayMs).length.toLocaleString("ru-RU"), sub: `${hmDelta(d)} ${t("home.opsWeek")}`, visual: hmSpark(d) };
}

function hmDiscrepanciesMetric(metric) {
  const rows = EOD_DISCREPANCIES;
  const d = hmDaily(rows.map((r) => r.createdDate));
  if (metric === "byType") {
    const counts = {};
    rows.forEach((r) => { counts[r.reconciliationType] = (counts[r.reconciliationType] || 0) + 1; });
    return hmBreakdownMetric(counts, (k) => eodEnum("reconType", k));
  }
  const open = rows.filter(eodIsOpenDiscrepancy).length;
  return { big: open.toLocaleString("ru-RU"), sub: `${rows.length} ${t("home.discrepanciesTotalSub")}`, visual: hmSpark(d) };
}

function hmPartnersMetric(metric) {
  if (metric === "byStatus") {
    const counts = {};
    PN_SERVICES.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
    return hmBreakdownMetric(counts, (k) => pn(`status.${k}`));
  }
  const approved = PN_SERVICES.filter((s) => s.status === "APPROVED").length;
  return { big: PN_SERVICES.length.toLocaleString("ru-RU"), sub: `${approved} ${pn("status.APPROVED")}`, visual: "" };
}

function hmCurrenciesMetric(metric) {
  const active = VB_CURRENCIES.filter((c) => c.status === "ACTIVE").length;
  const disabled = VB_CURRENCIES.filter((c) => c.status === "DISABLED").length;
  if (metric === "disabled") {
    return { big: disabled.toLocaleString("ru-RU"), sub: t("home.currenciesDisabledSub"), visual: "" };
  }
  return { big: active.toLocaleString("ru-RU"), sub: `${VB_CURRENCIES.length} ${t("home.currenciesTotalSub")}`, visual: "" };
}

// Объём по счетам: остатки активных виртуальных счетов (обязательства перед клиентами;
// реальные учитывают те же деньги у провайдеров — складывать нельзя). Валюты между собой
// не суммируем: крупно — главная по объёму, ниже — остальные.
function hmAccountsMetric(metric) {
  const byCurrency = {};
  const accCount = {};
  accAllAccounts().filter((a) => a.kind === "virtual" && a.status === "ACTIVE").forEach((a) => a.balances.forEach((b) => {
    if (b.total > 0) { byCurrency[b.currency] = (byCurrency[b.currency] || 0) + b.total; accCount[b.currency] = (accCount[b.currency] || 0) + 1; }
  }));
  const cur = Object.keys(byCurrency).map((c) => ({ c, v: byCurrency[c], n: accCount[c] })).sort((a, b) => b.v - a.v);
  const compact = (n) => new Intl.NumberFormat(t("home.locale"), { notation: "compact", maximumFractionDigits: 1 }).format(n);
  const palette = ["var(--color-brand)", "var(--color-info)", "var(--color-warning)"];
  // топ-3 валюты по объёму, остальное — «Другие» (счётом валют; суммы разных валют не складываем).
  // Кольцо — доли по числу счетов с остатком: у сумм в разных валютах общей единицы нет
  const top = cur.slice(0, 3);
  const restCur = cur.slice(3);
  const donut = top.map((x, i) => ({ value: x.n, color: palette[i] }));
  if (restCur.length) donut.push({ value: restCur.reduce((n, x) => n + x.n, 0), color: "var(--color-text-tertiary)" });
  if (metric === "count") {
    const totalAccounts = cur.reduce((n, x) => n + x.n, 0);
    return { big: totalAccounts.toLocaleString("ru-RU"), sub: t("home.accountsCountSub"), visual: top.length ? hmDonut(donut) : "" };
  }
  const subParts = top.slice(1).map((x) => `${compact(x.v)} ${x.c}`);
  if (restCur.length) subParts.push(t("home.otherCurrencies")(restCur.length));
  return {
    big: top.length ? `${compact(top[0].v)} <span class="hm-tile-unit">${top[0].c}</span>` : "—",
    sub: subParts.join(" · ") || dh("common.noData"),
    visual: top.length ? hmDonut(donut) : "",
  };
}

function hmEodMetric(metric) {
  const day = eodActiveDay();
  if (!day) return { big: "—", sub: dh("common.noData"), visual: "" };
  const stages = eodStagesOf(day);
  const done = stages.filter((s) => s.status === "COMPLETED").length;
  const open = EOD_DISCREPANCIES.filter(eodIsOpenDiscrepancy).length;
  const ring = hmRing(done / stages.length, `${done}/${stages.length}`);
  if (metric === "discrepancies") {
    return { big: open.toLocaleString("ru-RU"), sub: `${eodDayDate(day)} · ${eodEnum("status", day.status)}`, visual: ring };
  }
  return { big: eodDayDate(day), sub: `${eodEnum("status", day.status)} · ${open} ${t("home.discShort")}`, visual: ring };
}

function hmEventsMetric(metric) {
  const dayMs = 24 * 60 * 60 * 1000;
  const ev = AUDIT_LOGS_MOCK.filter((r) => r.event);
  const d = hmDaily(ev.map((r) => r.createdDate));
  const todayCount = ev.filter((r) => MOCK_NOW - r.createdDate <= dayMs).length;
  const critical = ev.filter((r) => MOCK_NOW - r.createdDate <= dayMs && r.event.severity === "CRITICAL").length;
  if (metric === "critical") {
    return { big: critical.toLocaleString("ru-RU"), sub: `${todayCount} ${t("home.eventsTotalSub")}`, visual: hmSpark(d) };
  }
  if (metric === "bySeverity") {
    const counts = {};
    ev.forEach((r) => { counts[r.event.severity] = (counts[r.event.severity] || 0) + 1; });
    return hmBreakdownMetric(counts, (k) => auEnum("severity", k), (k) => AN_SEVERITY_COLORS[k] || "var(--color-text-tertiary)");
  }
  return { big: todayCount.toLocaleString("ru-RU"), sub: `${critical} ${t("home.criticalShort")} · ${t("home.perDay")}`, visual: hmSpark(d) };
}

const HM_METRIC_BUILDERS = {
  clients: hmClientsMetric,
  companies: hmCompaniesMetric,
  operations: hmOperationsMetric,
  accounts: hmAccountsMetric,
  eod: hmEodMetric,
  events: hmEventsMetric,
  payments: hmPaymentsMetric,
  exchanges: hmExchangesMetric,
  discrepancies: hmDiscrepanciesMetric,
  partners: hmPartnersMetric,
  currencies: hmCurrenciesMetric,
};

function hmTiles() {
  const cfg = hmLoadCardConfig();
  const meta = hmCardMeta();
  const visibleCards = cfg.filter((c) => c.visible);
  const tilesHtml = visibleCards
    .map((c) => {
      const m = meta[c.id];
      const metric = HM_METRIC_BUILDERS[c.id](c.metric);
      return hmTile({ label: m.label, big: metric.big, sub: metric.sub, visual: metric.visual, list: m.list, stats: m.stats, settings: m.settings });
    })
    .join("");
  const empty = visibleCards.length ? "" : `<div class="dash-empty">${t("home.cardSettings.emptyState")}</div>`;
  return `<div class="hm-tiles-head">
    <h2 class="hm-tiles-title">${t("home.tilesTitle")}</h2>
    <button type="button" class="hm-link" id="hm-cards-settings-btn">${ICONS.settings}<span>${t("home.cardSettings.open")}</span></button>
  </div>
  <div class="hm-tiles">${tilesHtml}${empty}</div>`;
}

// Выбор метрики — не нативный <select>, а тот же кастомный попап-дропдаун, что и
// на экране создания платежа (.pc-dropdown/.pc-dropdown-trigger/-panel/-option,
// см. cwDropdownField в operations-payments.js) — переиспользуем готовые классы,
// открытие/закрытие вешаем один раз на модалку через hmBindCardDropdowns.
function hmCardSettingsRowHtml(c, meta) {
  const mt = t("home.cardSettings.metrics");
  const optionsHtml = HM_METRIC_OPTIONS[c.id]
    .map((mid) => `<button type="button" class="pc-dropdown-option${mid === c.metric ? " is-selected" : ""}" data-hm-metric-pick="${mid}"><span class="pc-dropdown-option-title">${pdEscape(mt[c.id][mid])}</span></button>`)
    .join("");
  return `<div class="hm-card-row" draggable="true" data-hm-card="${c.id}">
    <span class="hm-card-drag" title="${pdEscape(t("home.cardSettings.dragHint"))}" aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.4"/><circle cx="13" cy="5" r="1.4"/><circle cx="7" cy="10" r="1.4"/><circle cx="13" cy="10" r="1.4"/><circle cx="7" cy="15" r="1.4"/><circle cx="13" cy="15" r="1.4"/></svg>
    </span>
    <label class="hm-card-vis"><input type="checkbox" data-hm-vis${c.visible ? " checked" : ""} /></label>
    <span class="hm-card-label">${pdEscape(meta[c.id].label)}</span>
    <div class="pc-dropdown hm-card-dd" id="hm-dd-${c.id}" data-hm-metric="${c.metric}">
      <button type="button" class="pc-dropdown-trigger" data-hm-dd-toggle="${c.id}">
        <span data-hm-dd-label>${pdEscape(mt[c.id][c.metric])}</span><span class="pc-dropdown-chevron">${FILTER_GROUP_CHEVRON}</span>
      </button>
      <div class="pc-dropdown-panel">${optionsHtml}</div>
    </div>
  </div>`;
}

// Открытие/закрытие .hm-card-dd и выбор опции — один делегированный обработчик на
// модалку, по образцу pcBindDropdowns (operations-payments.js).
function hmBindCardDropdowns(modalEl) {
  modalEl.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-hm-dd-toggle]");
    if (toggleBtn) {
      const wrap = modalEl.querySelector(`#hm-dd-${toggleBtn.dataset.hmDdToggle}`);
      if (!wrap) return;
      const wasOpen = wrap.classList.contains("is-open");
      modalEl.querySelectorAll(".hm-card-dd.is-open").forEach((el) => el.classList.remove("is-open"));
      if (!wasOpen) wrap.classList.add("is-open");
      return;
    }
    const pickBtn = e.target.closest("[data-hm-metric-pick]");
    if (pickBtn) {
      const wrap = pickBtn.closest(".hm-card-dd");
      const value = pickBtn.dataset.hmMetricPick;
      wrap.dataset.hmMetric = value;
      wrap.querySelector("[data-hm-dd-label]").textContent = pickBtn.querySelector(".pc-dropdown-option-title").textContent;
      wrap.querySelectorAll("[data-hm-metric-pick]").forEach((b) => b.classList.toggle("is-selected", b === pickBtn));
      wrap.classList.remove("is-open");
      return;
    }
    if (!e.target.closest(".pc-dropdown-panel")) {
      modalEl.querySelectorAll(".hm-card-dd.is-open").forEach((el) => el.classList.remove("is-open"));
    }
  });
}

// Перетаскивание строк — по аналогии с rgRulesDnd в settings-routing.js (та же схема
// dragstart/dragover с классами -before/-after для индикатора места вставки).
function hmAttachCardListDnd(list) {
  if (!list) return;
  let dragId = null;
  list.querySelectorAll(".hm-card-row").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragId = row.dataset.hmCard;
      row.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      list.querySelectorAll(".hm-card-drop-before, .hm-card-drop-after").forEach((x) => x.classList.remove("hm-card-drop-before", "hm-card-drop-after"));
    });
    row.addEventListener("dragover", (e) => {
      if (!dragId || row.dataset.hmCard === dragId) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      list.querySelectorAll(".hm-card-drop-before, .hm-card-drop-after").forEach((x) => x.classList.remove("hm-card-drop-before", "hm-card-drop-after"));
      row.classList.add(before ? "hm-card-drop-before" : "hm-card-drop-after");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const target = row.dataset.hmCard;
      if (!dragId || target === dragId) return;
      const dragEl = list.querySelector(`[data-hm-card="${dragId}"]`);
      const r = row.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      row.insertAdjacentElement(before ? "beforebegin" : "afterend", dragEl);
      list.querySelectorAll(".hm-card-drop-before, .hm-card-drop-after").forEach((x) => x.classList.remove("hm-card-drop-before", "hm-card-drop-after"));
    });
  });
}

function hmOpenCardSettings() {
  const cfg = hmLoadCardConfig();
  const meta = hmCardMeta();
  const mt = t("home.cardSettings");
  openModal({
    title: mt.title,
    width: 560,
    bodyHtml: `<p class="modal-confirm-text pd-modal-intro">${mt.intro}</p><div class="hm-card-list" id="hm-card-list">${cfg.map((c) => hmCardSettingsRowHtml(c, meta)).join("")}</div>`,
    footerHtml: `<button type="button" class="btn-secondary" id="hm-cards-reset">${mt.reset}</button><span class="hm-card-foot-spacer"></span><button type="button" class="btn-secondary" id="hm-cards-cancel">${mt.cancel}</button><button type="button" class="btn-primary" id="hm-cards-save">${mt.save}</button>`,
    onMount: (el) => {
      hmAttachCardListDnd(el.querySelector("#hm-card-list"));
      hmBindCardDropdowns(el);
      el.querySelector("#hm-cards-cancel").addEventListener("click", closeModal);
      el.querySelector("#hm-cards-reset").addEventListener("click", () => {
        hmSaveCardConfig(hmDefaultCardConfig());
        closeModal();
        render();
      });
      el.querySelector("#hm-cards-save").addEventListener("click", () => {
        const next = [...el.querySelectorAll(".hm-card-row")].map((row) => ({
          id: row.dataset.hmCard,
          visible: row.querySelector("[data-hm-vis]").checked,
          metric: row.querySelector(".hm-card-dd").dataset.hmMetric,
        }));
        hmSaveCardConfig(next);
        closeModal();
        render();
      });
    },
  });
}

function viewHome() {
  return `<div class="hm-page">${hmHero()}${hmTiles()}</div>`;
}

// Зум/пан колесом, перетаскиванием и кнопками +/−/сброс — общая логика для любой карты, отрисованной hmMapSvg(points, mapId).
function initInteractiveMap(mapId) {
  const map = document.getElementById(mapId);
  const g = document.getElementById(`${mapId}-g`);
  if (!map || !g) return;
  const state = { k: 1, x: 0, y: 0 };
  const apply = () => {
    const svg = map.querySelector("svg");
    const w = svg.clientWidth || 720;
    const ratio = 720 / w;
    state.k = Math.min(8, Math.max(1, state.k));
    const maxX = (state.k - 1) * 720, maxY = (state.k - 1) * 290;
    state.x = Math.min(0, Math.max(-maxX, state.x));
    state.y = Math.min(0, Math.max(-maxY, state.y));
    g.setAttribute("transform", `translate(${state.x} ${state.y}) scale(${state.k})`);
    g.querySelectorAll(".hm-bubble").forEach((b) => {
      const inv = 1 / state.k;
      b.querySelector("circle").setAttribute("r", (+b.dataset.r * inv).toFixed(2));
      b.querySelector("text").setAttribute("style", `font-size:${(9 * inv).toFixed(2)}px`);
    });
    return ratio;
  };
  const zoomAt = (factor, cx, cy) => {
    const nk = Math.min(8, Math.max(1, state.k * factor));
    const f = nk / state.k;
    state.x = cx - (cx - state.x) * f;
    state.y = cy - (cy - state.y) * f;
    state.k = nk;
    apply();
  };
  const toSvg = (ev) => {
    const r = map.querySelector("svg").getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * 720, ((ev.clientY - r.top) / r.height) * 290];
  };
  map.addEventListener("wheel", (ev) => { ev.preventDefault(); const [cx, cy] = toSvg(ev); zoomAt(ev.deltaY < 0 ? 1.25 : 0.8, cx, cy); }, { passive: false });
  let drag = null;
  map.addEventListener("pointerdown", (ev) => { if (ev.target.closest(".hm-map-ctrl")) return; drag = { sx: ev.clientX, sy: ev.clientY, x: state.x, y: state.y }; map.setPointerCapture(ev.pointerId); map.classList.add("is-drag"); });
  map.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const r = map.querySelector("svg").getBoundingClientRect();
    state.x = drag.x + ((ev.clientX - drag.sx) / r.width) * 720;
    state.y = drag.y + ((ev.clientY - drag.sy) / r.height) * 290;
    apply();
  });
  const end = () => { drag = null; map.classList.remove("is-drag"); };
  map.addEventListener("pointerup", end);
  map.addEventListener("pointercancel", end);
  map.querySelectorAll("[data-hm-zoom]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.hmZoom === "reset") { state.k = 1; state.x = 0; state.y = 0; apply(); return; }
    zoomAt(b.dataset.hmZoom === "in" ? 1.5 : 1 / 1.5, 360, 145);
  }));
  apply();
}

function initHome() {
  initInteractiveMap("hm-map");
  document.querySelectorAll("[data-dash-hash]").forEach((b) => b.addEventListener("click", () => { window.location.hash = b.dataset.dashHash; }));
  const settingsBtn = document.getElementById("hm-cards-settings-btn");
  if (settingsBtn) settingsBtn.addEventListener("click", hmOpenCardSettings);
}
