/* Тексты раздела "Операционные настройки → Агрегация". Подмешиваются в I18N после i18n.js
   (i18nMerge, определён в i18n-rates.js). Ключей почти нет в EN — берутся из RU. */

i18nMerge(I18N.ru, {
  nav: {
    "settings-aggregation": "Агрегация",
    "settings-aggregation-networks": "Сети",
    "settings-aggregation-batches": "Пачки",
  },
  navDescriptions: {
    "settings-aggregation-networks": "Сети провайдера крипто-кошельков: баланс для сбора, триггеры, с какими условиями и когда собрать депозитные адреса на сервисный адрес",
    "settings-aggregation-batches": "Пачки сбора адресов на сервисный адрес: статус, кем запущена, сколько адресов, история",
  },
  aggregation: {
    networks: {
      title: "Агрегация: сети",
      info: "Деньги клиентов приходят на отдельные депозитные адреса. Чтобы платить выводы, их периодически собирают пачкой на сервисный адрес (SERVICE). Когда собирать — решают триггеры: два реагируют на нехватку денег при выводе, один — ручной запуск, три — по расписанию, порогу накопления и низкому остатку, их включает администратор.",
      ready: "Можно собрать",
      service: "На SERVICE",
      serviceUnavailable: "Баланс SERVICE не получен от провайдера",
      openBatch: "Идёт сбор",
      openBatchText: "Сейчас собирается пачка — новая не начнётся, пока эта не закроется.",
      openBatchLink: "Открыть пачку",
      currencies: "Валюты",
      triggersOn: (n, total) => `${n} из ${total} триггеров включено`,
      leadDefault: "Триггеры решают, когда собрать депозитные адреса сети на сервисный адрес (SERVICE). Реактивные включены всегда, остальные — по вашему порогу.",
      triggersTitle: "Триггеры",
      triggersDesc: "Что запускает сбор в этой сети и что сейчас с условием каждого триггера",
    },
    overview: {
      trigger: "Триггер",
    },
    currencies: {
      ticker: "Валюта", ready: "Можно собрать", service: "На SERVICE",
      noRate: "нет курса к USD", noBalance: "баланс недоступен",
    },
    control: {
      enabled: "Агрегация включена", disabled: "Агрегация выключена",
      enable: "Включить", disable: "Выключить",
      enableTitle: "Включить агрегацию сети", disableTitle: "Выключить агрегацию сети",
      disableConsequence: (network) => `Новые пачки в сети ${network} не будут собираться и отправляться — ни автоматически, ни выводами, ни вручную. Выводы сети будут ждать. Уже отправленные пачки досводятся.`,
      bannerDisabled: (since, reason, by) => `Агрегация выключена с ${since}: ${reason}${by ? ` (${by})` : ""}`,
    },
    manual: {
      run: "Запустить сбор сейчас",
      title: "Запустить сбор сейчас",
      intro: "Сервер проверяет всё так же, как при автоматическом запуске — результат может быть и «не собрано», это не ошибка.",
      outcome: {
        FIRED: "Сбор запущен",
        SKIPPED_OPEN_BATCH: "Уже идёт сбор",
        SKIPPED_NOTHING_TO_COLLECT: "Нечего собирать",
        SKIPPED_LOCKED: "Пачку сейчас собирает другой сервер, повторите через несколько секунд",
        SKIPPED_AGGREGATION_DISABLED: "Агрегация выключена — включите её, чтобы собирать",
        SKIPPED_COOLDOWN: "Последние сборы сети неудачны, повторите позже",
        FAILED: "Не удалось собрать",
      },
      lastRun: (outcome, date) => `Последний ручной запуск: ${outcome} · ${date}`,
    },
    kind: {
      WITHDRAWAL_SHORTFALL: { name: "Нехватка при выводе", subtitle: "Собирает, когда выводу не хватает денег на SERVICE" },
      FEE_QUOTE_SHORTFALL: { name: "Нехватка при расчёте комиссии", subtitle: "Собирает, когда при расчёте комиссии видна нехватка" },
      MANUAL: { name: "Ручной запуск", subtitle: "Последний запуск сбора администратором" },
      PERIODIC: { name: "По расписанию", subtitle: "Раз в заданный интервал" },
      READY_ACCUMULATION: { name: "Порог накопления", subtitle: "Когда накопилось достаточно к сбору" },
      SERVICE_LOW_BALANCE: { name: "Низкий остаток SERVICE", subtitle: "Когда остаток валюты на SERVICE ниже порога" },
    },
    evalStatus: {
      DUE: "Условие выполнено", NOT_DUE: "Не выполнено", DATA_UNAVAILABLE: "Нет данных",
      lowestBalance: "Наименьший остаток",
    },
    params: {
      every: (n) => `каждые ${n} мин`,
      onceEvery: (n) => `Раз в ${n} минут`,
      from: (n) => `от ${n} $`,
      below: (n) => `ниже ${n} $`,
      minCollect: (n) => `если собрать хотя бы ${n} $`,
      noMinCollect: "без минимума",
      default: "по умолчанию",
      nextRun: (d) => `следующий запуск: ${d}`,
    },
    cooldown: { until: (d) => `На паузе до ${d}` },
    eventType: {
      FIRED: "Запустил сбор",
      COVERED_BY_OTHER_TRIGGER: "Условие выполнено, сбор запустил другой триггер",
      SKIPPED_OPEN_BATCH: "Пропуск: пачка уже идёт",
      SKIPPED_NOTHING_TO_COLLECT: "Пропуск: нечего собирать",
      SKIPPED_LOCKED: "Пропуск: пачку собирает другой сервер",
      SKIPPED_DISABLED: "Пропуск: триггер выключен",
      SKIPPED_AGGREGATION_DISABLED: "Пропуск: агрегация выключена",
      SKIPPED_COOLDOWN: "Пропуск: пауза",
      FAILED: "Ошибка сбора",
      METRIC_UNAVAILABLE: "Нет данных для проверки",
      CONFIG_CHANGED: "Изменена настройка",
      AGGREGATION_ENABLED: "Агрегация включена",
      AGGREGATION_DISABLED: "Агрегация выключена",
    },
    config: {
      changedBy: (name, date, reason) => `${name} изменил настройку ${date}${reason ? `: ${reason}` : ""}`,
    },
    history: {
      title: "История сети", batch: "Пачка", controlEvent: "Выключатель", system: "Система",
      date: "Дата", trigger: "Триггер", event: "Событие", actor: "Кто", reason: "Причина", open: "Открыть",
      empty: "Событий пока нет", why: "Почему собрана",
    },
    dialog: {
      reason: "Причина", editTitle: (n) => `Настройка: ${n}`, enableTitle: (n) => `Включить: ${n}`, disableTitle: (n) => `Выключить: ${n}`,
      currentValue: (v) => `сейчас: ${v}`, minCollectHint: "Необязательный минимум к сбору — чтобы не собирать мелочь с комиссией сети на пачку. Оставьте пустым, чтобы снять минимум",
      willFireToast: "Агрегация запустится в ближайшие 15 секунд",
    },
    fields: {
      intervalMinutes: "Интервал, минут", thresholdUsd: "Порог накопления, $", minBalanceUsd: "Минимальный остаток, $", minCollectUsd: "Минимум к сбору, $",
    },
    errors: {
      reason: "Укажите причину", intervalRange: "Интервал — целое число от 5 до 10 080 минут", amountRange: "Сумма должна быть больше 0 и не больше 100 000 000", outcomeRequired: "Выберите исход",
    },
    consequence: {
      WITHDRAWAL_SHORTFALL: "Выводы перестанут запрашивать сбор сами — будут ждать планового или ручного.",
      FEE_QUOTE_SHORTFALL: "Расчёт комиссии перестанет запускать сбор. Выводы запускают его сами, пока включён триггер «Нехватка при выводе».",
      PERIODIC: "Сбор по расписанию прекратится. При повторном включении отсчёт начнётся заново.",
      READY_ACCUMULATION: "Накопленные депозиты не будут собираться автоматически.",
      SERVICE_LOW_BALANCE: "Остаток SERVICE не будет пополняться заранее — выводы могут ждать сбора.",
    },
    toggle: { manualHint: "Ручной запуск выключить нельзя. Чтобы остановить сбор — выключите агрегацию сети", on: "Включён", off: "Выключен" },
    batches: {
      title: "Агрегация: пачки", info: "Пачка — сбор депозитных адресов сети на сервисный адрес. Живёт до подтверждения перевода в блокчейне.",
      search: "Поиск по ID, сети или триггеру", network: "Сеть", trigger: "Запуск", status: "Статус", created: "Создана", id: "ID", addresses: "Адресов",
      submitted: "Отправлена", processed: "Обработана", hashes: "Транзакции", noHashes: "Транзакций пока нет",
      addressesTitle: "Адреса пачки", addressColumn: "Адрес", tickerColumn: "Валюта", amountColumn: "Сумма", outcomeColumn: "Исход",
    },
    addressOutcome: {
      CONFIRMED: "Собран", REJECTED: "Отклонён — вернулся в оборот", PENDING: "Ещё в пути", UNSEEN: "Провайдер не увидел", NOT_SUBMITTED: "Не отправлен — провайдер не видел",
    },
    failure: {
      title: "Почему не собралось",
      reason: {
        PROVIDER_REJECTED: "Провайдер отказал — само не пройдёт",
        PROVIDER_UNAVAILABLE: "Провайдер недоступен — скорее всего пройдёт само",
        INTERNAL: "Сбой на нашей стороне",
      },
      statusCode: "Код ответа", providerErrorId: "ID ошибки у провайдера", requestId: "ID запроса",
      step: { SUBMIT: "На отправке", REAPER: "Черновик не успели отправить" },
      returnedNote: "Депозиты пачки вернулись в оборот — это норма, а не потеря денег.",
    },
    batchStatus: {
      DRAFT: "Готовится", SUBMITTED: "Отправлена", CONFIRMING: "Подтверждается", CONFIRMED: "Собрана", PARTIALLY_CONFIRMED: "Собрана частично",
      REJECTED: "Отклонена", FAILED: "Ошибка", EXPIRED: "Зависла", COMPLETED: "Старая запись", PARTIALLY_COMPLETED: "Старая запись",
    },
    release: {
      button: "Закрыть вручную", title: "Закрыть зависшую пачку",
      intro: "Система продолжает проверять пачку раз в ~10 минут и чаще всего закрывает её сама. Ручное закрытие — аварийный выход.",
      outcomeLabel: "Что произошло", outcomePlaceholder: "— Выберите —",
      outcome: { CONFIRMED: "Деньги дошли до SERVICE", RELEASED: "Агрегация не прошла" },
      releasedBy: (name, date, outcome, reason) => `${name} закрыл пачку ${date}: ${outcome}${reason ? ` — ${reason}` : ""}`,
    },
  },
});

i18nMerge(I18N.en, {
  nav: {
    "settings-aggregation": "Aggregation",
    "settings-aggregation-networks": "Networks",
    "settings-aggregation-batches": "Batches",
  },
  aggregation: {
    networks: { title: "Aggregation: networks" },
    batches: { title: "Aggregation: batches" },
    control: { enabled: "Aggregation on", disabled: "Aggregation off" },
  },
});
