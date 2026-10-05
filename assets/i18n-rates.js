/* Тексты раздела "Настройки системы → Курсы". Подмешиваются в I18N после загрузки i18n.js; ключи, которых нет в EN, берутся из RU */

function i18nMerge(target, src) {
  Object.keys(src).forEach((k) => {
    if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k])) i18nMerge((target[k] = target[k] || {}), src[k]);
    else target[k] = src[k];
  });
}

i18nMerge(I18N.ru, {
  nav: { "settings-rates": "Курсы" },
  navDescriptions: { "settings-rates": "Курсы валютных пар и криптовалют, источники курсов и наценки: как из курса источников получается курс для клиента" },
  accessMatrix: { features: { rates: "Курсы и наценки" } },
  twofa: { actions: { items: { rates_markup_change: "Создание и отмена наценки на курс" } } },
  rates: {
    title: "Курсы",
    info: "Как считается курс для клиента\n1. Источники присылают курсы, из них складывается агрегированный курс пары\n2. К нему применяется глобальная наценка по паре — получается итоговый курс\n3. Для отдельных клиентов сверху применяется индивидуальная наценка — получается персональный курс\nОбмен клиента считается по персональному курсу\nТип наценки: процент — курс × (1 + значение / 100), фиксированная — курс + значение. Значение может быть отрицательным (скидка), но курс после наценки должен остаться больше нуля",
    tabs: { pairs: "Курсы", markups: "Наценки", individual: "Индивидуальные", providers: "Источники" },
    status: { ACTIVE: "Действует", EXPIRED: "Завершена", CANCELLED: "Отменена", UNAVAILABLE: "Недоступен" },
    type: { PERCENTAGE: "Процент", FIXED: "Фиксированная" },
    delay: { sec: (n) => `${n} с`, min: (n) => `${n} мин`, hour: (n) => `${n} ч` },
    clientsMore: (n) => `и ещё ${n}`,
    columns: {
      pair: "Пара", aggregated: "Курс источников", markup: "Наценка", final: "Итоговый курс", deviation: "Отклонение", sources: "Источники", updated: "Обновлён",
      status: "Статус", description: "Описание", created: "Создана", ended: "Завершена", clients: "Клиенты", personal: "Персональный курс",
      provider: "Источник", kind: "Тип", pairs: "Пары", lastUpdate: "Последнее обновление", delay: "Задержка",
    },
    filters: { pair: "Пара", type: "Тип наценки", created: "Дата создания" },
    pairs: { search: "Поиск по паре или ID", filterMarkup: "Наценка", filterQuote: "Валюта котировки", markup: { with: "С наценкой", without: "Без наценки" } },
    markups: { search: "Поиск по паре, описанию или ID", add: "Новая наценка" },
    individual: { search: "Поиск по клиенту, паре или описанию", add: "Индивидуальная наценка" },
    providers: { search: "Поиск по источнику", filterKind: "Тип источника", kind: { EXCHANGE: "Биржа", REGULATOR: "Регулятор" } },
    actions: { setMarkup: "Задать наценку", history: "История наценок", cancel: "Отменить наценку" },
    history: { title: (pair) => `История наценок ${pair}`, empty: "Наценок по паре не было", close: "Закрыть" },
    export: { button: "Экспорт", hint: "Все записи текущей вкладки", done: "Файл выгружен" },
    form: {
      titleGlobal: "Новая наценка на курс", titleIndividual: "Индивидуальная наценка",
      introGlobal: "Наценка применяется к агрегированному курсу пары для всех клиентов. Действующая наценка по этой паре будет завершена",
      introIndividual: "Наценка применяется к итоговому курсу пары только для выбранных клиентов",
      pair: "Пара", type: "Тип наценки", value: "Значение (минус — скидка)", description: "Описание или причина", clients: "Клиенты",
      baseAggregated: "Курс источников", baseFinal: "Итоговый курс", resultFinal: "Итоговый курс", resultPersonal: "Персональный курс", replaces: "Заменит действующую наценку",
      created: "Наценка создана",
      errors: {
        value: "Введите числовое значение", zero: "Наценка не может быть нулевой", percent: "Процент должен быть больше −100", result: "После наценки курс должен остаться больше нуля",
        clients: "Выберите хотя бы одного клиента", description: "Укажите описание или причину (от 3 символов)", descriptionLong: "Описание не длиннее 500 символов",
        cancelReason: "Укажите причину отмены (от 3 символов)", cancelReasonLong: "Причина не длиннее 500 символов",
      },
    },
    cancel: { title: "Отменить наценку", text: (pair, markup) => `Наценка ${markup} по паре ${pair} перестанет действовать, курс вернётся к значению без неё. Действие нельзя отменить`, reason: "Причина отмены", done: "Наценка отменена" },
  },
});

i18nMerge(I18N.en, {
  nav: { "settings-rates": "Exchange rates" },
  navDescriptions: { "settings-rates": "Currency and crypto pair rates, rate sources and markups: how the client rate is built from source rates" },
  accessMatrix: { features: { rates: "Rates and markups" } },
  twofa: { actions: { items: { rates_markup_change: "Create or cancel a rate markup" } } },
  rates: {
    title: "Exchange rates",
    tabs: { pairs: "Rates", markups: "Markups", individual: "Individual", providers: "Sources" },
    status: { ACTIVE: "Active", EXPIRED: "Expired", CANCELLED: "Cancelled", UNAVAILABLE: "Unavailable" },
    type: { PERCENTAGE: "Percentage", FIXED: "Fixed" },
  },
});
