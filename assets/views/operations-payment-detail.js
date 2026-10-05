/* ==========================================================================
   Страница деталей платежа/обмена: #/operations-payments/<id> и
   #/operations-exchanges/<id> (обмен — тот же платёж с paymentSystem=EXCHANGE,
   поэтому страница одна). Спецификация: docs/operations-payment-details-spec.md.
   Данные — строки списков (OPERATIONS_PAYMENTS_MOCK / OPERATIONS_EXCHANGES_MOCK)
   + детали из operations-payment-details.mock.js. Все действия — только через
   модалки; изменения живут в моке на время сессии.
   Переиспользует хелперы из views/clients-users.js, views/clients-companies.js,
   views/operations-payments.js и components/modal.js.
   ========================================================================== */

const PD_ARROW_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10h13M12 5.5 16.5 10 12 14.5"/></svg>`;
const PD_EXTERNAL_LINK_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4.5H4.5v11h11V12M12 3.5h4.5V8M16 4 9 11"/></svg>`;
const PD_DOWNLOAD_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v9M6.5 8.5 10 12l3.5-3.5"/><path d="M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14"/></svg>`;

// Превью для изображений (кликабельная миниатюра, открывает в новой вкладке)
// и скачивание — доступны, когда у вложения есть url: реальный object URL
// (файл выбран в этой сессии через <input type="file"> — работает для любого
// типа файла, не только картинок) либо picsum-плейсхолдер для старых демо-
// вложений без настоящих байт (тот же приём, что и в документах KYC,
// clients-users.js). Переиспользуется и на карточке платежа, и в мастере
// создания платежа (operations-payments.js).
function pdIsImageFile(fileName) {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(fileName || "");
}

function pdAttachmentRowHtml(f, actionsHtml) {
  const isImage = pdIsImageFile(f.fileName);
  const thumb =
    f.url && isImage
      ? `<a href="${f.url}" target="_blank" rel="noopener" class="pd-attach-thumb"><img src="${f.url}" alt="" /></a>`
      : `<span class="document-row-icon">${DOCUMENT_ICON_SVG}</span>`;
  return `
    <div class="pd-attach">
      ${thumb}
      <div class="document-row-info">
        <span class="document-row-name">${pdEscape(f.customFileName || f.fileName)}</span>
        <span class="document-row-file">${f.fileName} · ${f.sizeKb} KB</span>
      </div>
      <div class="pd-attach-actions">
        ${f.url ? `<a class="icon-btn" href="${f.url}" download="${pdEscape(f.fileName)}" title="${t("paymentDetail.attachments").download}">${PD_DOWNLOAD_ICON}</a>` : ""}
        ${actionsHtml || ""}
      </div>
    </div>`;
}

let paymentActionTick = 0;
// Текущий ref открытой карточки — нужен дроверу комментариев, чтобы
// перерисовывать себя после add/edit/delete без полного повторного открытия.
let currentPaymentDetailRef = null;

// Ссылки на эксплорер по сети — копия networkToExplorerUrlMap бэкенда (neuron-transactions, network-to-explorer-url.map.ts).
// Бэкенд отдаёт explorerUrl только для ввода и вывода (у внутреннего перевода в блокчейне нет транзакции).
const PAYMENT_EXPLORER_TX_URL = {
  BITCOIN: "https://www.blockchain.com/btc/tx/",
  BCH: "https://www.blockchain.com/bch/tx/",
  LITECOIN: "https://blockchair.com/litecoin/transaction/",
  DASH: "https://blockchair.com/dash/transaction/",
  DOGECOIN: "https://blockchair.com/dogecoin/transaction/",
  ETHEREUM: "https://etherscan.io/tx/",
  BSC: "https://bscscan.com/tx/",
  POLYGON: "https://polygonscan.com/tx/",
  ARBITRUM: "https://arbiscan.io/tx/",
  AVALANCHE: "https://snowtrace.io/tx/",
  TRON: "https://tronscan.org/#/transaction/",
};

function paymentExplorerTxUrl(networkName, hash) {
  const base = PAYMENT_EXPLORER_TX_URL[String(networkName || "").toUpperCase()];
  return base && hash ? `${base}${hash}` : null;
}

function currentPaymentRef() {
  const m = window.location.hash.replace(/^#\/?/, "").match(/^operations-(payments|exchanges)\/(.+)$/);
  return m ? { section: m[1], id: decodeURIComponent(m[2]) } : null;
}

function findPaymentRow(ref) {
  if (!ref) return null;
  const list = ref.section === "exchanges" ? OPERATIONS_EXCHANGES_MOCK : OPERATIONS_PAYMENTS_MOCK;
  return list.find((r) => r.id === ref.id) || null;
}

function pdShort(id) {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function pdEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Имя админа по id (ACCESS_ADMINS, settings-access.mock.js) — комментарии/
// запросы теперь ссылаются на реальные записи (см. paymentAdminId/
// paymentOtherAdminIds в operations-payment-details.mock.js), а не голый uuid.
function paymentAdminName(adminId) {
  const a = ACCESS_ADMINS.find((x) => x.id === adminId);
  return a ? a.name : pdShort(adminId);
}

// Роль(и) админа — те же записи ACCESS_ROLES, что и в разделе "Настройки →
// Доступ" (acRoleById, settings-access.js), берём короткое имя роли (SUPER,
// PAYMENTS_OPERATOR и т.п.) — тот же формат, что и в бейджах acRoleBadges.
function paymentAdminRoleLabel(adminId) {
  const a = ACCESS_ADMINS.find((x) => x.id === adminId);
  if (!a || !a.roleIds || !a.roleIds.length) return "";
  return a.roleIds.map((id) => acRoleById(id)).filter(Boolean).map((r) => r.name).join(", ");
}

// ---- Изменения мока (последовательные "минуты" от MOCK_NOW, чтобы даты были правдоподобны)
function pdNow() {
  paymentActionTick += 1;
  return new Date(MOCK_NOW.getTime() + paymentActionTick * 60 * 1000);
}

function setPaymentStatus(row, status) {
  const now = pdNow();
  row.previousStatus = row.status;
  row.status = status;
  row.updatedDate = now;
  row.updatedAt = formatDateTime(now);
  if (status === "SUCCESSFUL" || status === "DECLINED") {
    row.settledDate = now;
    row.settledAt = formatDateTime(now);
  }
}

function addPaymentComment(extras, text) {
  const now = pdNow();
  extras.comments.unshift({
    id: `cm-new-${now.getTime()}`,
    adminId: paymentAdminId(),
    text,
    createdDate: now,
    createdAt: formatDateTime(now),
  });
}

// ---- Шапка ------------------------------------------------------------------------
// ID теперь только в шапке (копируемый) — в общей информации ниже его убрали,
// он и так виден здесь. Переход в vABS — отдельная кнопка-ссылка (не пункт
// меню, ей не нужно подтверждение/статус); Одобрить/Отклонить и остальные
// действия — раз их несколько и они зависят от статуса, снова под
// меню-троеточием (см. renderPaymentHeaderActionsMenu), а не отдельными
// кнопками вподряд — так компактнее.
function renderPaymentDetailHeader(row, ref, extras) {
  const cd = t("paymentDetail");
  const isExchange = ref.section === "exchanges";
  const isCrypto = !isExchange && isCryptoPayment(row);
  const isIncoming = isCrypto ? paymentFlow(row) === "INCOMING" : row.direction === "INCOMING";

  return `
    <div class="card client-detail-header cd-hero">
      <button type="button" class="client-detail-back" id="pd-back" title="${isExchange ? cd.backToExchanges : isCrypto ? cd.backToCrypto : cd.backToPayments}">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 4.5-5 5.5 5 5.5"/></svg>
      </button>
      <div class="client-detail-header-main">
        <div class="client-detail-title-row">
          <span class="page-title">${isExchange ? cd.titleExchange : isCrypto ? cd.titleCrypto : cd.titlePayment} ${row.code}</span>
          <span class="badge ${paymentStatusBadgeClass(row.status)}">${paymentStatusLabel(row.status)}</span>
          <span class="badge ${isIncoming ? "badge-success" : "badge-neutral"}">${isCrypto ? paymentFlowOneLabel(paymentFlow(row), row) : paymentDirectionLabel(row.direction)}</span>
          <span class="badge badge-neutral">${isCrypto && row.cryptoWallet ? `${row.cryptoWallet.networkName} · ${row.cryptoWallet.currencyTicker}` : paymentSystemLabel(row.paymentSystem)}</span>
        </div>
        <div class="client-detail-subtitle">
          <span class="inline-copy">ID: ${row.code}${copyIconButton(row.code)}</span>
          <span class="client-detail-subtitle-sep">·</span>
          <span>${cd.created} ${row.createdAt}</span>
          <span class="client-detail-subtitle-sep">·</span>
          <span>${row.settledAt ? `${cd.settled} ${row.settledAt}` : cd.notSettled}</span>
        </div>
      </div>
      <div class="pd-header-tools">
        <button type="button" class="client-detail-actions-btn" id="pd-goto-operation-btn" title="${cd.actions.goToOperation}">${PD_EXTERNAL_LINK_ICON}</button>
        <div class="client-detail-actions" id="cd-actions">
          <button type="button" class="client-detail-actions-btn" id="cd-actions-btn" title="${cd.actions.menu}">${KEBAB_ICON_SVG}</button>
          <div class="client-detail-actions-menu">${renderPaymentHeaderActionsMenu(row, extras)}</div>
        </div>
      </div>
    </div>
  `;
}

// PDF платежа/обмена: все вкладки карточки (основное, риск, запросы, история) в печатной версии
function exportPaymentPdf(row, ref, extras) {
  const cd = t("paymentDetail");
  const isExchange = ref.section === "exchanges";
  const kindTitle = isExchange ? cd.titleExchange : isCryptoPayment(row) ? cd.titleCrypto : cd.titlePayment;
  const name = `${kindTitle} ${row.code}`;
  const section = (title, html) => `<section class="pdf-section"><h2>${title}</h2>${html}</section>`;
  const body = [
    renderPaymentMainTab(row, extras),
    section(t("paymentDetail.tabs.risk"), renderPaymentRiskTab(extras)),
    section(t("paymentDetail.tabs.requests"), renderPaymentRequestsTab(row, extras)),
    section(t("paymentDetail.tabs.history"), renderPaymentHistoryTab(row)),
  ].join("");
  const meta = `${paymentStatusLabel(row.status)} · ID: ${row.code} · ${cd.created} ${row.createdAt}`;
  exPrintHtml(exPdfHtml(`${name} | ${row.code}`, name, meta, body), `${name} | ${row.code}`);
}

// Пункты меню-троеточия — допустимые для текущего статуса/платёжной системы
// (см. спецификацию 4.5): "Одобрить"/"Отклонить" — только не в финальном
// статусе (PAYMENT_NON_FINAL_STATUSES — тот же набор что и у платежей,
// ничем не платёжно-специфичный, действует и для обменов); "Запросить
// информацию" — ON_REVIEW/PROCESSING; "Изменить курс" — только у обмена и
// только пока ON_REVIEW (updateExchangePaymentRate реально разрешена только
// в этом статусе, подтверждено чтением exchange-payments.service.ts
// 24.09.2026); "Отменить сделку" — только у незавершённой OTC-сделки.
// goToOperation сюда не возвращаем — для него уже есть отдельная кнопка-ссылка.
function renderPaymentHeaderActionsMenu(row, extras) {
  const a = t("paymentDetail").actions;
  const canReview = PAYMENT_NON_FINAL_STATUSES.includes(row.status);
  const canRequestInfo = row.status === "ON_REVIEW" || row.status === "PROCESSING";
  const canChangeRate = row.paymentSystem === "EXCHANGE" && row.status === "ON_REVIEW";
  const canCancelDeal = row.paymentSystem === "OTC" && extras.rail.kind === "otc" && extras.rail.status === "PENDING";
  // Выгрузка в PDF доступна всегда — поэтому меню никогда не пустое (у платежа в финальном статусе других действий нет)
  const items = [`<button type="button" class="user-menu-item" data-action="exportPdf">${PD_DOWNLOAD_ICON}<span>${a.exportPdf}</span></button>`];
  if (canReview) items.push(`<button type="button" class="user-menu-item" data-action="approve">${CHECK_ICON_SVG}<span>${a.approve}</span></button>`);
  if (canReview) items.push(`<button type="button" class="user-menu-item is-danger" data-action="decline">${TRASH_ICON_SVG}<span>${a.decline}</span></button>`);
  if (canRequestInfo) items.push(`<button type="button" class="user-menu-item" data-action="requestInfo">${EDIT_ICON_SVG}<span>${a.requestInfo}</span></button>`);
  if (canChangeRate) items.push(`<button type="button" class="user-menu-item" data-action="changeRate">${EDIT_ICON_SVG}<span>${a.changeRate}</span></button>`);
  if (canCancelDeal) items.push(`<button type="button" class="user-menu-item is-danger" data-action="cancelDeal">${TRASH_ICON_SVG}<span>${a.cancelDeal}</span></button>`);
  return items.join("");
}

// ---- Сумма — плоская секция (без карточки), вторым блоком на странице (после
// общей информации). Соурс/таргет и комиссия соурс/таргет — теперь ВСЕГДА
// отдельными строками (раньше схлопывались в одну, если валюта не менялась) —
// так честнее видно списание и зачисление по отдельности, даже когда сумма
// одинаковая; курс — только когда валюты реально разные (иначе он всегда 1,
// показывать нечего). Итого — отдельной строкой в конце, всегда.
function renderPaymentHero(row, extras) {
  const h = t("paymentDetail.hero");
  const cd = t("paymentDetail");
  const differs = row.sourceCurrency !== row.targetCurrency;
  const side = (label, amount, currency) => `
    <div class="pd-hero-side">
      <div class="pd-hero-label">${label}</div>
      <div class="pd-hero-amount">${formatPaymentAmount(amount)}<span class="pd-hero-cur">${currency}</span>${row.cryptoWallet ? ` <span class="badge badge-neutral">${row.cryptoWallet.networkName}</span>` : ""}</div>
    </div>`;
  const stat = (label, value) => `<div class="pd-hero-stat"><div class="pd-hero-label">${label}</div><div class="pd-hero-stat-value">${value}</div></div>`;
  const feeTarget = +(extras.fee.total * extras.fee.rate).toFixed(2);

  return flatSection(
    cd.sections.money,
    `<div class="pd-hero">
      <div class="pd-hero-money">
        ${side(h.sent, row.sourceAmount, row.sourceCurrency)}
        <div class="pd-hero-arrow">${PD_ARROW_ICON}</div>
        ${side(h.received, row.targetAmount, row.targetCurrency)}
      </div>
      <div class="pd-hero-stats">
        ${differs ? stat(h.rate, row.exchangeRate) : ""}
        ${stat(h.feeSource, `${formatPaymentAmount(extras.fee.total)} ${row.feeCurrency}`)}
        ${stat(h.feeTarget, `${formatPaymentAmount(feeTarget)} ${row.targetCurrency}`)}
        ${stat(h.totalDebit, `${formatPaymentAmount(row.totalAmount)} ${row.totalCurrency}`)}
      </div>
    </div>`,
    null,
    cd.sectionDesc.money
  );
}

// ---- Отправитель/получатель — компактные непримечательные блоки (не sectionCard-
// карточки, просто лёгкая рамка) со стрелкой между ними, тот же смысл, что и
// .payment-parties-cell в списке платежей (кто → кому). Вместо голого id — имя
// (email, если ФИО не указано), как в списке (paymentPartyRef в моке линкует на
// настоящие записи CLIENTS_USERS_MOCK/CLIENTS_COMPANIES_MOCK); клик по имени
// ведёт на карточку. Когда clientId нет (сторона вне системы) — имя и тип всё
// равно показываем (paymentExternalPartyRef), без ссылки и без копирования id.
// Для настоящего клиента (clientId есть) в боксе теперь ещё и его собственные
// данные — email/телефон для физлица, рег. номер для юрлица — из тех же
// реальных записей CLIENTS_USERS_MOCK/CLIENTS_COMPANIES_MOCK, что и имя/ссылка
// (paymentPartyRef в моке). У внешней стороны таких данных нет по определению —
// это не наш клиент, только то, что уже показано в "Детали платежа".
function paymentPartyExtraPairs(clientId, clientType) {
  if (!clientId) return "";
  const f = t("paymentDetail.fields");
  if (clientType === "CORPORATE") {
    const c = CLIENTS_COMPANIES_MOCK.find((x) => x.id === clientId);
    return c ? pdPairs([[f.regNumber, c.registrationNumber], [f.email, c.businessEmail]]) : "";
  }
  const u = CLIENTS_USERS_MOCK.find((x) => x.id === clientId);
  return u ? pdPairs([[f.email, u.email], [f.phone, u.phone]]) : "";
}

// accountPairs — номер счёта этой стороны; identityPairs — firstName/
// lastName/middleName внешней стороны (только у SWIFT/WIRE/ACH, см.
// paymentPartyDetails) — оба перенесены прямо в бокс участника, рядом с
// именем. Имени может не быть даже при известном типе (SBP/CARD_NUMBER —
// в схеме нет поля имени вообще) — тогда тип всё равно показываем бейджем,
// а вместо имени — честная заглушка "не указано", а не общий пустой бокс.
function renderPaymentPartyBox(label, row, side, accountPairs, identityPairs) {
  const notSpecified = t("paymentDetail.participants.notSpecified");
  const clientId = row[`${side}ClientId`];
  const clientType = row[`${side}ClientType`];
  const name = row[`${side}ClientName`] || (clientId ? pdShort(clientId) : null);
  if (!name && !clientType) {
    return `<div class="pd-party-box"><div class="pd-party-box-label">${label}</div><div class="table-cell-muted">${notSpecified}</div></div>`;
  }
  const link = row[`${side}ClientLink`];
  // У внутренней стороны (есть clientId) — её счёт в нашей системе, ссылка ведёт в раздел "Счета"; у внешней — реквизиты рельса (accountPairs)
  const internalAcc = clientId ? paymentInternalAccount(row, side) : null;
  const ourAccount = internalAcc
    ? detailField(t("paymentDetail.fields.accountNumber"), `<span class="profile-field-value-wrap"><button type="button" class="table-link" data-party-hash="${internalAcc.href}">${internalAcc.code}</button>${copyIconButton(internalAcc.code)}</span>`)
    : "";
  const extra = [paymentPartyExtraPairs(clientId, clientType), identityPairs || "", internalAcc ? ourAccount : accountPairs || ""].filter(Boolean).join("");
  return `
    <div class="pd-party-box">
      <div class="pd-party-box-label">${label}</div>
      <div class="pd-party-box-main">
        ${clientType ? `<span class="badge badge-neutral">${paymentClientTypeLabel(clientType)}</span>` : ""}
        ${
          clientId
            ? `<button type="button" class="table-link" data-party-hash="${link}">${pdEscape(name)}</button>`
            : name
              ? `<span>${pdEscape(name)}</span>`
              : `<span class="table-cell-muted">${notSpecified}</span>`
        }
        ${clientId ? `<button type="button" class="id-copy" data-copy-value="${clientId}" title="${clientId}">${COPY_ICON_SVG}</button>` : ""}
      </div>
      ${extra ? `<div class="profile-fields profile-fields-grid profile-fields-grid-1 pd-party-box-extra">${extra}</div>` : ""}
    </div>
  `;
}

// ---- Крипто (CRYPTO_WALLET): внешняя сторона — не клиент, а адрес в сети (адрес, тег/memo, сеть).
// Ввод: отправитель — внешний адрес; вывод: получатель — внешний адрес; перевод между клиентами — обе стороны наши.
// Сеть/валюта ведут в настройки vABS (справочники "Сети" и "Валюты"); если записи в справочнике нет — просто текст
function vbSettingsLink(kind, entity, text) {
  return entity ? `<button type="button" class="table-link" data-party-hash="#/settings-vabs-${kind}/${entity.id}">${pdEscape(text)}</button>` : pdEscape(text);
}

function renderCryptoAddressBox(label, address, tag, network) {
  const c = t("paymentDetail.crypto");
  return `
    <div class="pd-party-box">
      <div class="pd-party-box-label">${label}</div>
      <div class="pd-party-box-main"><span class="badge badge-neutral">${c.externalAddress}</span></div>
      <div class="profile-fields profile-fields-grid profile-fields-grid-1 pd-party-box-extra">${pdPairs([[c.address, address], [c.tag, tag], [c.network, network]])}</div>
    </div>`;
}

function renderCryptoPartySection(row) {
  const cd = t("paymentDetail");
  const p = cd.participants;
  const cw = row.cryptoWallet || {};
  const op = row.cryptoOperationType;
  const sender = op === "CUSTOMER_DEPOSIT" ? renderCryptoAddressBox(p.sender, cw.addressFrom, cw.addressFromTag, cw.networkName) : renderPaymentPartyBox(p.sender, row, "sender", "", "");
  const recipient = op === "CUSTOMER_WITHDRAWAL" ? renderCryptoAddressBox(p.recipient, cw.addressTo, cw.addressToTag, cw.networkName) : renderPaymentPartyBox(p.recipient, row, "recipient", "", "");
  return flatSection(
    cd.sections.parties,
    `<div class="pd-parties-row">${sender}<div class="pd-parties-arrow">${PD_ARROW_ICON}</div>${recipient}</div>`,
    null,
    cd.crypto.partiesDesc
  );
}

// Транзакция в сети: хеш — ссылка на эксплорер (в новой вкладке) + копирование
function renderCryptoTransactionSection(row, r) {
  const cd = t("paymentDetail");
  const c = cd.crypto;
  const f = cd.fields;
  const en = cd.enums;
  const onChainOp = r.operationType === "CUSTOMER_DEPOSIT" || r.operationType === "CUSTOMER_WITHDRAWAL";
  const url = onChainOp ? paymentExplorerTxUrl(r.networkName, r.hash) : null;
  let hashHtml;
  if (r.hash) {
    hashHtml = url
      ? `<span class="profile-field-value-wrap"><a class="table-link pd-hash-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" title="${c.openExplorer}">${r.hash}</a>${copyIconButton(r.hash)}</span>`
      : `<span class="profile-field-value-wrap"><span>${r.hash}</span>${copyIconButton(r.hash)}</span>`;
  } else {
    hashHtml = `<span class="table-cell-muted">${r.operationType === "CUSTOMER_TRANSFER" ? c.noHashInternal : c.noHashYet}</span>`;
  }
  const fields = `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${detailField(f.operationType, en.cryptoOperation[r.operationType])}
      ${detailField(f.network, vbSettingsLink("networks", vbNetworkByName(String(r.networkName || "").toUpperCase()), r.networkName))}
      ${detailField(f.ticker, vbSettingsLink("currencies", vbCurrencyByTicker(r.currencyTicker, String(r.networkName || "").toUpperCase()) || vbCurrencyByTicker(r.currencyTicker), r.currencyTicker))}
    </div>
    <div class="profile-fields profile-fields-grid profile-fields-grid-1">${detailField(f.hash, hashHtml)}</div>
    ${url ? `<div class="pd-explorer-row"><a class="btn-secondary pd-explorer-btn" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${PD_EXTERNAL_LINK_ICON}<span>${c.openExplorer}</span></a></div>` : ""}`;
  return flatSection(c.txSection, fields, null, c.txSectionDesc);
}

function renderPaymentPartySection(row, details) {
  if (row.cryptoOperationType) return renderCryptoPartySection(row);
  const cd = t("paymentDetail");
  const p = cd.participants;
  const senderAccount = details ? details.senderAccount : "";
  const recipientAccount = details ? details.recipientAccount : "";
  const senderIdentity = details ? details.senderIdentity : "";
  const recipientIdentity = details ? details.recipientIdentity : "";
  return flatSection(
    cd.sections.parties,
    `<div class="pd-parties-row">
      ${renderPaymentPartyBox(p.sender, row, "sender", senderAccount, senderIdentity)}
      <div class="pd-parties-arrow">${PD_ARROW_ICON}</div>
      ${renderPaymentPartyBox(p.recipient, row, "recipient", recipientAccount, recipientIdentity)}
    </div>`,
    null,
    cd.sectionDesc.parties
  );
}

// ---- Кто на какой стороне: internal — реквизиты нашего клиента, external —
// реквизиты контрагента (BasePaymentType/SWIFT/WIRE/ACH и т.п. — подтверждено
// реальным примером ответа 23.09.2026). Роль (кто из них — отправитель, кто —
// получатель) определяется направлением: OUTGOING — наш клиент отправляет
// (internal = sender), INCOMING — наш клиент получает (internal = recipient).
// senderIdentity/recipientIdentity — firstName/lastName/middleName внешней
// стороны (реальные поля BasePaymentMethodExternalClientEntity, есть только
// у SWIFT/WIRE/ACH) — уходят в бокс участника, рядом с именем/типом.
// senderAccount/recipientAccount — номер счёта (тоже в бокс участника).
// senderBank/recipientBank — банк этой стороны + адрес/страна/город внешней
// стороны (уходит в "Детали платежа", оформлен как обычные параметры).
// Возвращает null для рельсов, где такого деления вообще нет (crypto/otc/cash —
// там своя форма, остаётся в renderPaymentRequisites как раньше).
function paymentPartyDetails(row, extras) {
  const r = extras.rail;
  const f = t("paymentDetail.fields");
  const isOutgoing = row.direction === "OUTGOING";

  if (r.kind === "base") {
    const i = r.internal;
    const e = r.external;
    const internalAccount = pdPairs([[f.accountNumber, i.accountNumber]]);
    const externalAccount = pdPairs([[f.accountNumber, e.accountNumber]]);
    const externalIdentity = pdPairs([[f.lastName, e.lastName], [f.firstName, e.firstName], [f.middleName, e.middleName]]);
    const internalBank = pdPairs([[f.bank, i.bankName]]);
    const externalBankPairs = [
      [f.bank, e.bankName],
      [f.bankCode, e.bankCode],
      [f.branchCode, e.branchCode],
      [f.country, e.country],
      [f.city, e.city],
      [f.address, e.addressLine ? `${e.addressLine}${e.postalCode ? `, ${e.postalCode}` : ""}` : null],
    ];
    if (r.intermediaryBank) externalBankPairs.push([f.intermediaryBank, [r.intermediaryBank.name, r.intermediaryBank.bankCode].filter(Boolean).join(" · ")]);
    const externalBank = pdPairs(externalBankPairs);
    return isOutgoing
      ? { senderAccount: internalAccount, recipientAccount: externalAccount, senderIdentity: "", recipientIdentity: externalIdentity, senderBank: internalBank, recipientBank: externalBank }
      : { senderAccount: externalAccount, recipientAccount: internalAccount, senderIdentity: externalIdentity, recipientIdentity: "", senderBank: externalBank, recipientBank: internalBank };
  }

  if (r.kind === "sbp") {
    const internalAccount = pdPairs([[f.accountNumber, r.internal.accountNumber]]);
    const externalBank = pdPairs([[f.bankId, r.external.bankId], [f.bankBic, r.external.bankBic]]);
    return isOutgoing
      ? { senderAccount: internalAccount, recipientAccount: "", senderBank: "", recipientBank: externalBank }
      : { senderAccount: "", recipientAccount: internalAccount, senderBank: externalBank, recipientBank: "" };
  }

  if (r.kind === "cardNumber") {
    const externalAccount = pdPairs([[f.cardPan, r.external.cardPan]]);
    return isOutgoing
      ? { senderAccount: "", recipientAccount: externalAccount, senderBank: "", recipientBank: "" }
      : { senderAccount: externalAccount, recipientAccount: "", senderBank: "", recipientBank: "" };
  }

  if (r.kind === "inner") {
    const client = (c) => pdPairs([[f.accountId, c.accountId], [f.email, c.email], [f.phone, c.phoneNumber]]);
    return { senderAccount: client(r.senderClient), recipientAccount: client(r.recipientClient), senderBank: "", recipientBank: "" };
  }

  return null;
}

// ---- Общая информация: направление, система, статус, даты + назначение
// платежа/источник средств (были отдельным блоком — по просьбе объединено
// сюда, это тоже общие параметры платежа). ID убран — он уже в шапке
// (копируемый). Все поля кликом копируют значение (badge — копирует текст
// статуса, не HTML). Никакого степпера/истории статусов — по бэкенду есть
// только текущий+предыдущий статус, полноценной цепочки нет.
function renderPaymentGeneralInfoSection(row) {
  const cd = t("paymentDetail");
  const g = cd.general;
  const en = cd.enums;
  return flatSection(
    cd.sections.general,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(g.direction, isCryptoPayment(row) ? paymentFlowOneLabel(paymentFlow(row), row) : paymentDirectionLabel(row.direction))}
      ${copyableField(g.paymentSystem, paymentSystemLabel(row.paymentSystem))}
      ${copyableField(g.status, paymentStatusLabel(row.status), `<span class="badge ${paymentStatusBadgeClass(row.status)}">${paymentStatusLabel(row.status)}</span>`)}
      ${copyableField(g.createdAt, row.createdAt)}
      ${copyableField(g.updatedAt, row.updatedAt)}
      ${row.settledAt ? copyableField(g.settledAt, row.settledAt) : detailField(g.settledAt, cd.notSettled)}
      ${copyableField(g.purpose, row.purposeOfPayment)}
      ${row.sourceOfFunds ? copyableField(g.sourceOfFunds, en.sourceOfFunds[row.sourceOfFunds]) : detailField(g.sourceOfFunds, "—")}
    </div>`,
    null,
    cd.sectionDesc.general
  );
}

// ---- Детали платежа: теперь только банки сторон (реквизиты счёта переехали
// в карточки участников). Оформлено так же, как "Общая информация" — плоская
// сетка параметров, без отдельных карточек-колонок. Банк-посредник (SWIFT)
// подмешан в пары банка получателя/отправителя ещё в paymentPartyDetails.
// Только для рельсов, где вообще есть банк стороны (crypto/otc/cash — своя
// форма, остаётся в renderPaymentRequisites).
function renderPaymentDetailsSection(details) {
  if (!details) return "";
  const cd = t("paymentDetail");
  const p = cd.participants;
  const blocks = [];
  if (details.senderBank) blocks.push(`<div class="pd-req-subtitle">${p.senderBank}</div><div class="profile-fields profile-fields-grid profile-fields-grid-3">${details.senderBank}</div>`);
  if (details.recipientBank) blocks.push(`<div class="pd-req-subtitle">${p.recipientBank}</div><div class="profile-fields profile-fields-grid profile-fields-grid-3">${details.recipientBank}</div>`);
  if (!blocks.length) return "";
  return flatSection(cd.sections.paymentDetails, blocks.join(""), null, cd.sectionDesc.paymentDetails);
}

// ---- Реквизиты (зависят от платёжной системы) -----------------------------------
function pdPairs(pairs) {
  return pairs
    .filter(([, v]) => v != null && v !== "")
    .map(([label, raw]) => copyableField(label, String(raw)))
    .join("");
}

function pdCol(title, pairsHtml) {
  return pairsHtml ? `<div class="pd-req-col"><div class="pd-req-title">${title}</div><div class="profile-fields profile-fields-grid profile-fields-grid-1">${pairsHtml}</div></div>` : "";
}

// Реквизиты для рельсов без деления "отправитель/получатель + банк" (crypto/
// otc/cash) — у base/sbp/cardNumber/inner эта же информация теперь в
// renderPaymentDetailsSection (см. paymentPartyDetails), здесь для них
// сознательно ничего не рендерим — не дублируем.
function renderPaymentRequisites(row, extras) {
  const f = t("paymentDetail.fields");
  const rq = t("paymentDetail.req");
  const en = t("paymentDetail.enums");
  const r = extras.rail;
  let cols = "";

  if (r.kind === "crypto") return renderCryptoTransactionSection(row, r);
  if (r.kind === "otc") {
    cols =
      pdCol(
        rq.deal,
        pdPairs([
          [f.referenceNumber, r.referenceNumber],
          [f.dealId, r.dealId],
          [f.dealType, en.otcDealType[r.dealType]],
          [f.dealStatus, en.otcDealStatus[r.status]],
          [f.baseNetwork, r.baseNetworkName],
          [f.quoteNetwork, r.quoteNetworkName],
        ])
      ) +
      pdCol(rq.parties, pdPairs([[f.sellerId, r.sellerClientId], [f.sellerEmail, r.sellerEmail], [f.buyerId, r.buyerClientId], [f.buyerEmail, r.buyerEmail]]));
  } else if (r.kind === "cash") {
    cols =
      pdCol(rq.client, pdPairs([[f.operationType, en.cashOperation[r.operationType]], [f.clientId, r.internal.clientId], [f.representativeId, r.internal.representativeId]])) +
      pdCol(rq.office, pdPairs([[f.officeId, r.external.officeId], [f.whiteLabelId, r.external.whiteLabelId], [f.partnerId, r.external.partnerId], [f.operatorId, r.external.operatorId]]));
  }

  if (!cols) return "";
  return flatSection(t("paymentDetail.sections.paymentDetails"), `<div class="pd-req-grid">${cols}</div>`);
}

// ---- Комментарии ---------------------------------------------------------------------
// Заметок больше нет вообще (не наш реальный объект) — только комментарии.
// Автор — реальное имя админа (ACCESS_ADMINS), не голый id. Изменить/удалить —
// только свой комментарий (adminId === paymentAdminId()), чужие админские
// комментарии трогать нельзя — это уже было верно, просто подтверждаю логику.
// Полный рендер одного комментария (используется и превью, и дровером) —
// автор/дата + свои действия (редактировать/удалить только для своего
// комментария, чужие админские трогать нельзя).
function renderPaymentCommentRow(cm) {
  const c = t("paymentDetail.comments");
  const own = cm.adminId === paymentAdminId();
  const role = paymentAdminRoleLabel(cm.adminId);
  return `
    <div class="pd-comment">
      <div class="pd-comment-head">
        <span class="pd-comment-author">${pdEscape(paymentAdminName(cm.adminId))}${own ? ` <span class="table-cell-muted">(${c.you})</span>` : ""}</span>
        ${
          own
            ? `<span class="pd-comment-actions">
                <button type="button" class="icon-btn" data-comment-edit="${cm.id}" title="${c.edit}">${EDIT_ICON_SVG}</button>
                <button type="button" class="icon-btn icon-btn-danger" data-comment-delete="${cm.id}" title="${c.delete}">${TRASH_ICON_SVG}</button>
              </span>`
            : ""
        }
      </div>
      ${role ? `<div class="pd-comment-role">${pdEscape(role)}</div>` : ""}
      <div class="pd-comment-text">${pdEscape(cm.text)}</div>
      <div class="pd-comment-date pd-comment-date-bottom">${cm.createdAt}</div>
    </div>`;
}

// На "Основной" вкладке — только превью (последний комментарий + счётчик) в
// боковой карточке. Полный список с добавлением/редактированием/удалением —
// в выезжающем сайдбаре (тот же паттерн .filters-drawer, что и в фильтрах).
function renderPaymentCommentsPreview(extras) {
  const c = t("paymentDetail.comments");
  const list = [...extras.comments].sort((a, b) => b.createdDate - a.createdDate);
  const latest = list[0];
  const body = latest
    ? `${renderPaymentCommentRow(latest)}${list.length > 1 ? `<button type="button" class="table-link pd-view-all" data-pd-action="openComments">${c.viewAll} (${list.length})</button>` : ""}`
    : `<div class="table-cell-muted">${c.empty}</div>`;

  return sectionCard(
    t("paymentDetail.sections.comments"),
    `<div class="kyc-actions-row"><button type="button" class="profile-flat-edit" data-pd-action="openComments">${PLUS_ICON_SVG}<span>${c.add}</span></button></div>
    <div class="pd-feed">${body}</div>`
  );
}

// ---- Дровер комментариев (полный список) — тот же паттерн, что и
// .filters-drawer в фильтрах компаний (клиентс-компании.js): оверлей + aside,
// открытие/закрытие через requestAnimationFrame + класс is-open, Escape и
// клик по оверлею закрывают, удаление wrap-а — с задержкой под CSS-переход.
function renderPaymentCommentsDrawerBody(extras) {
  const c = t("paymentDetail.comments");
  const list = [...extras.comments].sort((a, b) => b.createdDate - a.createdDate);
  return list.length ? list.map(renderPaymentCommentRow).join("") : `<div class="table-cell-muted">${c.empty}</div>`;
}

function renderPaymentCommentsDrawer(extras) {
  const c = t("paymentDetail.comments");
  return `
    <div class="filters-drawer-overlay" id="pd-comments-overlay"></div>
    <aside class="filters-drawer" id="pd-comments-drawer">
      <div class="filters-drawer-header">
        <h2 class="filters-drawer-title">${t("paymentDetail.sections.comments")}</h2>
        <button type="button" class="filters-drawer-close" id="pd-comments-drawer-close">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 6 8 8M14 6l-8 8"/></svg>
        </button>
      </div>
      <div class="filters-drawer-body pd-feed" id="pd-comments-drawer-body">${renderPaymentCommentsDrawerBody(extras)}</div>
      <div class="filters-drawer-footer">
        <button type="button" class="btn-primary" id="pd-comments-drawer-add">+ ${c.add}</button>
      </div>
    </aside>
  `;
}

function rerenderPaymentCommentsDrawerBody(extras) {
  const bodyEl = document.getElementById("pd-comments-drawer-body");
  if (!bodyEl) return;
  bodyEl.innerHTML = renderPaymentCommentsDrawerBody(extras);
  attachPaymentCommentsDrawerBodyHandlers(extras, currentPaymentDetailRef);
}

function attachPaymentCommentsDrawerBodyHandlers(extras, ref) {
  document.querySelectorAll("#pd-comments-drawer-body [data-comment-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openCommentModal(extras, ref, btn.dataset.commentEdit));
  });
  document.querySelectorAll("#pd-comments-drawer-body [data-comment-delete]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteComment(extras, ref, btn.dataset.commentDelete));
  });
}

function handlePaymentCommentsDrawerEscape(e) {
  if (e.key === "Escape") closePaymentCommentsDrawer();
}

function openPaymentCommentsDrawer(extras, ref) {
  currentPaymentDetailRef = ref;
  const wrap = document.createElement("div");
  wrap.id = "pd-comments-drawer-wrap";
  wrap.innerHTML = renderPaymentCommentsDrawer(extras);
  document.body.appendChild(wrap);

  const closeBtn = document.getElementById("pd-comments-drawer-close");
  if (closeBtn) closeBtn.addEventListener("click", closePaymentCommentsDrawer);
  const overlay = document.getElementById("pd-comments-overlay");
  if (overlay) overlay.addEventListener("click", closePaymentCommentsDrawer);
  const addBtn = document.getElementById("pd-comments-drawer-add");
  if (addBtn) addBtn.addEventListener("click", () => openCommentModal(extras, ref, null));
  attachPaymentCommentsDrawerBodyHandlers(extras, ref);

  requestAnimationFrame(() => {
    const o = document.getElementById("pd-comments-overlay");
    const d = document.getElementById("pd-comments-drawer");
    if (o) o.classList.add("is-open");
    if (d) d.classList.add("is-open");
  });

  document.addEventListener("keydown", handlePaymentCommentsDrawerEscape);
  document.body.classList.add("filters-drawer-open");
}

function closePaymentCommentsDrawer() {
  const wrap = document.getElementById("pd-comments-drawer-wrap");
  if (!wrap) return;
  const overlay = document.getElementById("pd-comments-overlay");
  const drawer = document.getElementById("pd-comments-drawer");
  if (overlay) overlay.classList.remove("is-open");
  if (drawer) drawer.classList.remove("is-open");
  document.removeEventListener("keydown", handlePaymentCommentsDrawerEscape);
  document.body.classList.remove("filters-drawer-open");
  setTimeout(() => wrap.remove(), 220);
}

// ---- Запросы информации — реальное поле у платежа (infoRequests(input:
// FilterInput): PaymentInfoRequestsType, подтверждено чтением swift-payments.
// resolver.ts и аналогов по остальным методам 23.09.2026). На "Основной"
// вкладке — только превью (счётчик + последний запрос) в боковой карточке;
// полный список и возможность запросить новую информацию — во вкладке
// "Запросы" (см. renderPaymentRequestsTab).
function renderPaymentRequestRow(req) {
  const r = t("paymentDetail.requests");
  const awaiting = req.status === "AWAITING_CLIENT_RESPONSE";
  return `
    <div class="pd-request">
      <div class="pd-request-head">
        <span class="badge ${awaiting ? "badge-warning" : "badge-success"}">${awaiting ? r.awaiting : r.responded}</span>
        <span class="pd-comment-date">${r.requestedAt} ${req.createdAt} · ${pdEscape(paymentAdminName(req.adminId))}</span>
      </div>
      <div class="pd-comment-text">${pdEscape(req.requestText)}</div>
      <div class="pd-request-response">
        <div class="pd-req-title">${r.response}${req.respondedAt ? ` · ${req.respondedAt}` : ""}</div>
        ${req.responseText ? `<div class="pd-comment-text">${pdEscape(req.responseText)}</div>` : `<div class="table-cell-muted">${r.noResponse}</div>`}
      </div>
    </div>`;
}

function renderPaymentRequestsPreview(row, extras) {
  const cd = t("paymentDetail");
  const r = cd.requests;
  const list = extras.infoRequests;
  const canRequest = row.status === "ON_REVIEW" || row.status === "PROCESSING";
  const body = list.length
    ? renderPaymentRequestRow(list[0])
    : `<div class="table-cell-muted">${r.empty}</div>`;
  return sectionCard(
    list.length ? `${cd.sections.requests} · ${list.length}` : cd.sections.requests,
    `${canRequest ? `<div class="kyc-actions-row"><button type="button" class="profile-flat-edit" data-pd-action="requestInfo">${PLUS_ICON_SVG}<span>${cd.actions.requestInfo}</span></button></div>` : ""}
    ${body}
    ${list.length ? `<button type="button" class="table-link pd-view-all" data-pd-tab-link="requests">${r.viewAll}</button>` : ""}`
  );
}

function renderPaymentRequestsTab(row, extras) {
  const cd = t("paymentDetail");
  const r = cd.requests;
  const canRequest = row.status === "ON_REVIEW" || row.status === "PROCESSING";
  const body = extras.infoRequests.length ? `<div class="pd-feed">${extras.infoRequests.map(renderPaymentRequestRow).join("")}</div>` : `<div class="table-cell-muted">${r.empty}</div>`;
  return `
    <div class="profile-flat-block">
      ${flatSection(
        cd.sections.requests,
        `${canRequest ? `<div class="kyc-actions-row"><button type="button" class="profile-flat-edit" data-pd-action="requestInfo">${PLUS_ICON_SVG}<span>${cd.actions.requestInfo}</span></button></div>` : ""}${body}`,
        null,
        cd.sectionDesc.requests
      )}
    </div>
  `;
}

// ---- Риск — предпросмотр в боковой карточке "Основной" вкладки (уровень
// риска, оценка, провайдер), полная картина — во вкладке "Риск" (решение +
// сырой JSON, тот же принцип, что и служебный блок).
function renderPaymentRiskPreview(extras) {
  const cd = t("paymentDetail");
  const s = cd.scoring;
  if (!extras.scoring) return sectionCard(cd.sections.scoring, `<div class="table-cell-muted">${s.empty}</div>`);
  const sc = extras.scoring;
  return sectionCard(
    cd.sections.scoring,
    `<div class="profile-fields profile-fields-grid profile-fields-grid-1" style="margin-bottom: var(--space-3)">
      ${detailField(s.risk, `<span class="badge ${riskLevelBadgeClass(sc.riskLevel.name)}">${riskLevelLabel(sc.riskLevel.name)}</span>`)}
    </div>
    <div class="profile-fields profile-fields-grid">
      ${detailField(s.score, sc.normalizedScore)}
      ${detailField(s.provider, pdEscape(sc.provider))}
    </div>
    <button type="button" class="table-link pd-view-all" data-pd-tab-link="risk">${s.viewAll}</button>`
  );
}

function renderPaymentRiskTab(extras) {
  const cd = t("paymentDetail");
  const s = cd.scoring;
  if (!extras.scoring) {
    return `<div class="profile-flat-block">${flatSection(cd.sections.scoring, `<div class="table-cell-muted">${s.empty}</div>`, null, cd.sectionDesc.scoring)}</div>`;
  }
  const sc = extras.scoring;
  return `
    <div class="profile-flat-block">
      ${flatSection(
        cd.sections.scoring,
        `<div class="profile-fields profile-fields-grid">
          ${detailField(s.risk, `<span class="badge ${riskLevelBadgeClass(sc.riskLevel.name)}">${riskLevelLabel(sc.riskLevel.name)}</span>`)}
          ${detailField(s.decision, sc.finalDecision)}
          ${detailField(s.score, sc.normalizedScore)}
          ${detailField(s.provider, pdEscape(sc.provider))}
        </div>`,
        null,
        cd.sectionDesc.scoring
      )}
    </div>
  `;
}

function renderPaymentAttachmentsCard(extras) {
  const a = t("paymentDetail.attachments");
  const files = extras.attachments.length
    ? extras.attachments
        .map((f, idx) => pdAttachmentRowHtml(f, `<button type="button" class="icon-btn icon-btn-danger" data-attachment-delete="${idx}" title="${a.remove}">${TRASH_ICON_SVG}</button>`))
        .join("")
    : `<div class="table-cell-muted">${a.empty}</div>`;
  return flatSection(
    t("paymentDetail.sections.attachments"),
    `<div class="documents-list">${files}</div><button type="button" class="btn-secondary address-add-btn" data-pd-action="addAttachment">+ ${a.add}</button>`
  );
}

// Служебный JSON — раньше был свёрнутой по умолчанию карточкой (is-collapsed);
// в левой колонке карточек больше нет вовсе, поэтому теперь просто плоская
// секция в самом низу (место и так подсказывает, что это второстепенное).
function renderPaymentServiceCard(row, extras) {
  const s = t("paymentDetail.service");
  const metadata = extras.scoring ? { scoringResult: extras.scoring } : {};
  const op = extras.operation;
  return flatSection(
    t("paymentDetail.sections.service"),
    `<div class="profile-fields profile-fields-grid profile-fields-grid-3">
      ${copyableField(s.id, row.id)}
      ${op ? copyableField(s.vabsStatus, op.status, vbOpStatusBadge(op.status)) : ""}
    </div>
    <div class="pd-req-subtitle">${s.metadata}</div>
    <pre class="pd-json">${pdEscape(JSON.stringify(metadata, null, 2))}</pre>`
  );
}

// ---- История изменений — журнал аудита (AUDIT_LOGS_MOCK, security-audit-
// logs.mock.js), отфильтрованный по affectedEntity.type === "Payment" и
// affectedEntity.id === row.id. Это реальный, отдельный от самого платежа
// источник — на самом платеже (CommonPaymentType) полноценной истории нет
// (только status/previousStatus, см. комментарий в общей информации), но
// именно такие админские действия (например mutation:vabsUpdatePaymentsStatus)
// реально пишутся в аудит-лог с affectedEntity на платёж — тот же принцип,
// что и "Связанные события" на карточке самого аудит-лога (security-audit-
// logs.js). Переиспользует его хелперы (auEventTitle/auActorLabel/auResultBadge).
function getPaymentAuditHistory(row) {
  return AUDIT_LOGS_MOCK.filter((l) => l.affectedEntity && l.affectedEntity.type === "Payment" && l.affectedEntity.id === row.id).sort((a, b) => b.createdDate - a.createdDate);
}

// Метка изменённого параметра + читаемое значение — единственный реально
// встречающийся у платежа diff (mutation:vabsUpdatePaymentsStatus, см.
// security-audit-logs.mock.js) это смена status, показываем через
// paymentStatusLabel; остальные поля (если появятся) — как есть.
function paymentHistoryFieldLabel(field) {
  const g = t("paymentDetail.general");
  return field === "status" ? g.status : field;
}
function paymentHistoryFieldValue(field, value) {
  if (value == null) return "—";
  if (field === "status") return paymentStatusLabel(value);
  return pdEscape(String(value));
}

function renderPaymentHistoryTab(row) {
  const cd = t("paymentDetail");
  const h = cd.history;
  const list = getPaymentAuditHistory(row);
  const rows = [];
  list.forEach((l) => {
    const changed = (l.result.changes && l.result.changes.changedFields) || [];
    const dateCell = l.createdAt;
    const actor = pdEscape(auActorLabel(l));
    if (!changed.length) {
      rows.push(`<tr><td>${dateCell}</td><td>${actor}</td><td colspan="3" class="table-cell-muted">${auEventTitle(l)}</td></tr>`);
      return;
    }
    changed.forEach((field) => {
      const oldVal = paymentHistoryFieldValue(field, l.result.changes.oldValue ? l.result.changes.oldValue[field] : null);
      const newVal = paymentHistoryFieldValue(field, l.result.changes.newValue ? l.result.changes.newValue[field] : null);
      rows.push(`<tr><td>${dateCell}</td><td>${actor}</td><td>${pdEscape(paymentHistoryFieldLabel(field))}</td><td>${oldVal}</td><td>${newVal}</td></tr>`);
    });
  });
  const body = rows.length
    ? `<div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>${h.columns.date}</th>
              <th>${h.columns.actor}</th>
              <th>${h.columns.field}</th>
              <th>${h.columns.oldValue}</th>
              <th>${h.columns.newValue}</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>`
    : `<div class="table-cell-muted">${h.empty}</div>`;
  return `<div class="profile-flat-block">${flatSection(cd.sections.history, body, null, cd.sectionDesc.history)}</div>`;
}

// ---- Табы --------------------------------------------------------------------------------
const PAYMENT_DETAIL_TABS = ["main", "ledger", "risk", "requests", "history"];
const paymentDetailState = { tab: "main" };

// Та же иконка-на-вкладку схема, что и в карточке клиента (CD_TAB_ICONS,
// clients-users.js) — переиспользует .cd-subtab-icon.
const PD_TAB_ICONS = {
  main: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h14M3 10h10M3 14h6"/></svg>`,
  ledger: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="15" height="12" rx="1.5"/><path d="M2.5 8h15M7 8v8"/></svg>`,
  risk: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5 17 6v5.5c0 4-3 6.5-7 8-4-1.5-7-4-7-8V6l7-3.5Z"/><path d="m7 10 2 2 4-4.5"/></svg>`,
  requests: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3.5h9l3 3V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M7 9.5h6M7 12.5h6"/></svg>`,
  history: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5.5V10l3 2"/><path d="M4 8a6 6 0 1 1 1 5.5"/><path d="M2.5 6v3H5.5"/></svg>`,
};

function renderPaymentDetailTabsBar() {
  return `
    <div class="cd-subtabs">
      ${PAYMENT_DETAIL_TABS.map(
        (id) => `
          <button type="button" class="cd-subtab${paymentDetailState.tab === id ? " is-active" : ""}" data-pd-tab="${id}">
            <span class="cd-subtab-icon">${PD_TAB_ICONS[id]}</span>
            <span>${t(`paymentDetail.tabs.${id}`)}</span>
          </button>
        `
      ).join("")}
    </div>
  `;
}

// ---- Страница --------------------------------------------------------------------------
function viewPaymentDetail(ref) {
  const cd = t("paymentDetail");
  const row = findPaymentRow(ref);

  if (!row) {
    return `
      ${pageHeader(cd.notFoundTitle)}
      <div class="empty-state">
        <div class="empty-state-icon">${ICONS.box}</div>
        <div class="empty-state-title">${cd.notFoundTitle}</div>
        <div class="empty-state-text">${cd.notFoundText}</div>
      </div>
    `;
  }

  const extras = getPaymentDetailExtras(row);
  paymentDetailState.tab = "main"; // всегда открываем карточку с "Основной" вкладки
  pdLedgerTab = "virtual";
  currentPaymentDetailRef = ref;

  return `
    <div id="pd-root">
      ${renderPaymentDetailHeader(row, ref, extras)}
      <div class="cd-tabs-wrap" id="pd-tabs-wrap">${renderPaymentDetailTabsBar()}</div>
      <div id="pd-tab-content">${renderPaymentDetailTabContent(row, extras)}</div>
    </div>
  `;
}

// ---- Основная вкладка: сумма/комиссия → общая информация → отправитель и
// получатель (кто → кому) → детали платежа (реквизиты сторон + банки) →
// вложения → служебное. Слева — без карточек (.profile-flat-block), справа —
// узкая колонка с карточками-превью (риск, запросы, комментарии).
function renderPaymentMainTab(row, extras) {
  const details = paymentPartyDetails(row, extras);
  return `
    <div class="client-detail-grid">
      <div class="client-detail-grid-main">
        <div class="profile-flat-block">
          ${renderPaymentHero(row, extras)}
          ${renderPaymentGeneralInfoSection(row)}
          ${renderPaymentPartySection(row, details)}
          ${renderPaymentDetailsSection(details)}
          ${!details ? renderPaymentRequisites(row, extras) : ""}
          ${renderPaymentAttachmentsCard(extras)}
          ${renderPaymentServiceCard(row, extras)}
        </div>
      </div>
      <div class="client-detail-grid-side">
        ${renderPaymentRiskPreview(extras)}
        ${renderPaymentRequestsPreview(row, extras)}
        ${renderPaymentCommentsPreview(extras)}
      </div>
    </div>
  `;
}

function renderPaymentDetailTabContent(row, extras) {
  if (paymentDetailState.tab === "ledger") return renderPaymentLedgerTab(row);
  if (paymentDetailState.tab === "risk") return renderPaymentRiskTab(extras);
  if (paymentDetailState.tab === "requests") return renderPaymentRequestsTab(row, extras);
  if (paymentDetailState.tab === "history") return renderPaymentHistoryTab(row);
  return renderPaymentMainTab(row, extras);
}

// ---- Вкладка «Проводки»: проводки платежа/обмена (VirtualTransaction в терминах бэкенда) --------------------------
// По бэкенду (plugins/common-payments-plugin/core/payments-accounting/payments-accounting.service.ts) исходящий
// платёж создаёт Operation с проводками (name, client, virtualTransactions[]): "Sender" — списание со счёта
// отправителя (DEBIT), "Bank fee" — комиссия банка (CREDIT), если комиссия больше нуля, а при обмене валют ещё
// "Exchange buy"/"Exchange sell" (DEBIT/CREDIT через счёт ликвидности). Проводка несёт валюту, сумму, тип
// (дебет/кредит), порядок и счёт. Счета отправителя и получателя — те же записи, что уже показаны в блоке
// "Отправитель/Получатель" (paymentInternalAccount, operations-payments.js) — если сторона внешняя (нет клиента в
// системе), проводки по ней в наших книгах нет. Счета комиссии и обмена — служебные счета банка (ACC_SERVICE_VIRTUALS
// в accounts.mock.js: доход по входящим/исходящим транзакциям, пул ликвидности).
// ДОПУЩЕНИЕ ПРОТОТИПА: в изученном коде виден только дебетовый борт списания у исходящего платежа; кредитовую
// проводку по счёту получателя-нашего клиента (для платежей между своими клиентами и обменов) достроили по аналогии,
// в реальной схеме её вид может отличаться.
function pdLegStatus(row) {
  if (row.status === "SUCCESSFUL" || row.status === "REFUNDED") return "COMPLETED";
  if (row.status === "DECLINED") return "DECLINED";
  if (row.status === "DRAFT") return "NEW";
  return "PROCESSING";
}

function pdServiceAccount(index) {
  return ACCOUNTS_VIRTUAL_MOCK[index];
}

function pdLeg(row, order, description, side, amount, currency, acc) {
  const seed = Math.abs(paymentStableHash(`${row.id}:${order}`));
  return { id: seedToPaymentUuid(80000 + (seed % 20000)), code: entityCode("LEG", 80000 + (seed % 20000)), order, description, side, amount, currency, acc: acc || null, status: pdLegStatus(row), createdAt: row.createdAt };
}

// Реальные проводки (через ностро/провайдера) — только там, где деньги реально уходят за пределы наших книг:
// внутренний перевод между двумя нашими клиентами (BOTH-рельсы, крипто-перевод между клиентами) в реальных
// проводках не нуждается — см. тот же принцип у vbAddOperation (accounts.mock.js: реальные ноги строятся не для
// каждой операции, а только когда есть внешняя сторона). Ностро и счёт провайдера подобраны детерминированно по id платежа.
function pdIsFullyInternal(row) {
  const isCryptoTransfer = row.cryptoOperationType === "CUSTOMER_TRANSFER";
  return PAYMENT_BOTH_INTERNAL_SYSTEMS.includes(row.paymentSystem) || isCryptoTransfer;
}

function pdLedgerRealLegsFor(row) {
  if (pdIsFullyInternal(row)) return [];
  const l = t("paymentDetail.ledger");
  const seed = Math.abs(paymentStableHash(`${row.id}:real`));
  const nostro = ACCOUNTS_NOSTRO_MOCK[seed % ACCOUNTS_NOSTRO_MOCK.length];
  const provider = ACCOUNTS_REAL_MOCK[(seed * 7) % ACCOUNTS_REAL_MOCK.length];
  const incoming = row.cryptoOperationType ? row.cryptoOperationType === "CUSTOMER_DEPOSIT" : row.direction === "INCOMING";
  return [
    pdLeg(row, 1, l.nostro, incoming ? "DEBIT" : "CREDIT", row.sourceAmount, row.sourceCurrency, nostro),
    pdLeg(row, 2, l.providerAccount, incoming ? "CREDIT" : "DEBIT", row.sourceAmount, row.sourceCurrency, provider),
  ];
}

function pdLedgerLegsFor(row) {
  const l = t("paymentDetail.ledger");
  const legs = [];
  const senderAcc = paymentInternalAccount(row, "sender");
  const recipientAcc = paymentInternalAccount(row, "recipient");
  const isFx = row.sourceCurrency !== row.targetCurrency;
  const fee = row.feeAmount || 0;
  const netSource = +(row.sourceAmount - fee).toFixed(2);
  let order = 0;
  if (senderAcc) legs.push(pdLeg(row, ++order, l.sender, "DEBIT", row.sourceAmount, row.sourceCurrency, senderAcc));
  if (fee > 0) legs.push(pdLeg(row, ++order, l.bankFee, "CREDIT", fee, row.sourceCurrency, pdServiceAccount(row.direction === "INCOMING" ? 37 : 38)));
  if (isFx) {
    legs.push(pdLeg(row, ++order, l.exchangeBuy, "DEBIT", netSource, row.sourceCurrency, pdServiceAccount(39)));
    legs.push(pdLeg(row, ++order, l.exchangeSell, "CREDIT", row.targetAmount, row.targetCurrency, pdServiceAccount(39)));
  }
  if (recipientAcc) legs.push(pdLeg(row, ++order, l.recipient, "CREDIT", row.targetAmount, row.targetCurrency, recipientAcc));
  return legs;
}

// Общий рендер таблицы проводок — используется картой платежа/обмена (operations-payment-detail.js) и картой ОТС-сделки
// (operations-otc.js): один и тот же набор столбцов и стиль строки (описание+ID проводки в одной колонке, тип дебет/
// кредит и статус — бейджами). hashAttr — атрибут ссылки на счёт (у платежа "data-party-hash", у ОТС "data-otc-hash";
// у каждой карточки уже есть свой обработчик клика по этому атрибуту, новый не нужен).
function renderLedgerTable(legs, { title, intro, emptyTitle, emptyText, exportKey, hashAttr = "data-party-hash" }) {
  const l = t("paymentDetail.ledger");
  const actions = `<span class="filters-bar-end">${exportMenuHtml(exportKey, l.exportButton, l.exportHint)}</span>`;
  if (!legs.length) {
    return `<div class="profile-flat-block">${flatSection(title, `<div class="empty-state"><div class="empty-state-icon">${ICONS.box}</div><div class="empty-state-title">${emptyTitle}</div><div class="empty-state-text">${emptyText}</div></div>`, null, intro, actions)}</div>`;
  }
  const accCell = (a) => (a ? `<button type="button" class="table-link" ${hashAttr}="${accHref(a)}">${a.code}</button>` : `<span class="table-cell-muted">${l.noAccount}</span>`);
  const rows = legs
    .map(
      (x) => `<tr>
        <td><div class="identity-cell">
          <div class="identity-cell-primary">${x.acc ? `<button type="button" class="table-link" ${hashAttr}="${accHref(x.acc)}">${pdEscape(x.description)}</button>` : `<span>${pdEscape(x.description)}</span>`}</div>
          <div class="identity-cell-sub"><span class="identity-cell-tag">${t("clientsUsers.idTag")}</span><button type="button" class="id-copy" data-copy-value="${x.code}" title="${t("clientsUsers.copy")}"><span class="id-copy-label">${x.code}</span>${COPY_ICON_SVG}</button></div>
        </div></td>
        <td><span class="badge ${x.side === "DEBIT" ? "badge-neutral" : "badge-info"}">${accEnum("transferType", x.side)}</span></td>
        <td>${formatPaymentAmount(x.amount)}</td>
        <td>${x.currency}</td>
        <td>${accCell(x.acc)}</td>
        <td>${vbOpStatusBadge(x.status)}</td>
        <td>${dateTimeCell(x.createdAt)}</td>
      </tr>`
    )
    .join("");
  const table = `<div class="table-scroll"><table class="data-table"><thead><tr>
      <th>${l.colDescription}</th><th>${l.colSide}</th><th>${l.colAmount}</th><th>${l.colCurrency}</th><th>${l.colAccount}</th><th>${l.colStatus}</th><th>${l.colDate}</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return `<div class="profile-flat-block">${flatSection(title, table, null, intro, actions)}</div>`;
}

// Виртуальные/реальные — как на карточке операции vABS (settings-vabs-ops.js: vbOpTabsBar) — те же пилюли-табы
// с количеством проводок в каждой.
let pdLedgerTab = "virtual";

function pdLedgerTabsBar(row) {
  const l = t("paymentDetail.ledger");
  const counts = { virtual: pdLedgerLegsFor(row).length, real: pdLedgerRealLegsFor(row).length };
  return `<div class="quick-tabs">${["virtual", "real"].map((k) => `<button type="button" class="quick-tab${pdLedgerTab === k ? " is-active" : ""}" data-pd-ledger-tab="${k}">${l.tabs[k]}<span class="quick-tab-count">${counts[k]}</span></button>`).join("")}</div>`;
}

function pdLedgerActiveLegs(row) {
  return pdLedgerTab === "real" ? pdLedgerRealLegsFor(row) : pdLedgerLegsFor(row);
}

function renderPaymentLedgerTab(row) {
  const l = t("paymentDetail.ledger");
  const isReal = pdLedgerTab === "real";
  const table = renderLedgerTable(pdLedgerActiveLegs(row), {
    title: l.title,
    intro: l.intro,
    emptyTitle: isReal ? l.emptyRealTitle : l.emptyTitle,
    emptyText: isReal ? l.emptyRealText : l.emptyText,
    exportKey: "pd-ledger-export",
  });
  return `${pdLedgerTabsBar(row)}${table}`;
}

function pdLedgerExportRows(row) {
  const l = t("paymentDetail.ledger");
  const legs = pdLedgerActiveLegs(row);
  const headers = [l.colDescription, l.colId, l.colSide, l.colAmount, l.colCurrency, l.colAccount, l.colStatus, l.colDate];
  const rows = legs.map((x) => [x.description, x.code, accEnum("transferType", x.side), x.amount, x.currency, x.acc ? x.acc.code : l.noAccount, accEnum("opStatus", x.status), row.createdAt]);
  return { headers, rows };
}

function rerenderPaymentDetail(ref) {
  currentPaymentDetailRef = ref;
  const y = window.scrollY;
  document.getElementById("view-container").innerHTML = viewPaymentDetail(ref);
  initPaymentDetailView(ref);
  window.scrollTo(0, y);
  // Дровер комментариев живёт вне #view-container — переживает полный
  // ре-рендер карточки, поэтому его тело нужно обновить отдельно, если открыт.
  if (document.getElementById("pd-comments-drawer-wrap")) {
    const row = findPaymentRow(ref);
    if (row) rerenderPaymentCommentsDrawerBody(getPaymentDetailExtras(row));
  }
}

// Переключение вкладки/навигация без полной перерисовки заголовка: только
// табы и содержимое (то же самое, что и в клиентской карточке).
function updatePaymentDetailTab(row) {
  const extras = getPaymentDetailExtras(row);
  const tabsWrap = document.getElementById("pd-tabs-wrap");
  const content = document.getElementById("pd-tab-content");
  if (tabsWrap) tabsWrap.innerHTML = renderPaymentDetailTabsBar();
  if (content) content.innerHTML = renderPaymentDetailTabContent(row, extras);
  attachPaymentDetailTabHandlers(row);
  attachPaymentDetailContentHandlers(row);
}

// ---- Модалки действий ----------------------------------------------------------------
// Общая модалка с полем ввода (textarea/input) и обязательной валидацией
function openPaymentTextModal({ title, intro, label, value = "", requiredMsg, submitLabel, danger, multiline = true, onSubmit }) {
  const c = t("paymentDetail.common");
  const field = multiline
    ? `<textarea class="form-textarea" id="pd-modal-text" rows="4">${pdEscape(value)}</textarea>`
    : `<input class="address-form-input" type="text" id="pd-modal-text" value="${escapeAttr(value)}" />`;

  openModal({
    title,
    width: 480,
    bodyHtml: `
      ${intro ? `<p class="modal-confirm-text pd-modal-intro">${intro}</p>` : ""}
      <label class="filters-field">
        <span class="filters-field-label">${label}</span>
        ${field}
      </label>
      <div class="form-error" id="pd-modal-error" hidden>${requiredMsg}</div>
    `,
    footerHtml: `
      <button type="button" class="btn-secondary" id="pd-modal-cancel">${c.cancel}</button>
      <button type="button" class="${danger ? "btn-danger" : "btn-primary"}" id="pd-modal-submit">${submitLabel}</button>
    `,
    onMount: (modalEl) => {
      const input = modalEl.querySelector("#pd-modal-text");
      const error = modalEl.querySelector("#pd-modal-error");
      input.focus();
      modalEl.querySelector("#pd-modal-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#pd-modal-submit").addEventListener("click", () => {
        const text = input.value.trim();
        if (!text) {
          error.hidden = false;
          return;
        }
        closeModal();
        onSubmit(text);
      });
    },
  });
}

function openApproveModal(row, ref) {
  const m = t("paymentDetail.modals");
  const c = t("paymentDetail.common");
  openConfirmModal({
    title: m.approveTitle,
    text: m.approveText(formatPaymentAmount(row.sourceAmount), row.sourceCurrency, row.recipientClientName || ""),
    confirmLabel: t("paymentDetail.actions.approve"),
    cancelLabel: c.cancel,
    danger: false,
    onConfirm: () => requireAdmin2fa("payment_approve", () => {
      setPaymentStatus(row, "SUCCESSFUL");
      rerenderPaymentDetail(ref);
    }),
  });
}

function openDeclineModal(row, extras, ref) {
  const m = t("paymentDetail.modals");
  openPaymentTextModal({
    title: m.declineTitle,
    intro: m.declineText,
    label: m.reasonLabel,
    requiredMsg: m.reasonRequired,
    submitLabel: t("paymentDetail.actions.decline"),
    danger: true,
    onSubmit: (reason) => {
      addPaymentComment(extras, m.declineCommentPrefix + reason);
      setPaymentStatus(row, "DECLINED");
      rerenderPaymentDetail(ref);
    },
  });
}

function openRequestInfoModal(row, extras, ref) {
  const m = t("paymentDetail.modals");
  openPaymentTextModal({
    title: m.requestTitle,
    intro: m.requestText,
    label: m.requestLabel,
    requiredMsg: m.requestRequired,
    submitLabel: t("paymentDetail.common.send"),
    onSubmit: (text) => {
      const now = pdNow();
      extras.infoRequests.unshift({
        id: `ir-new-${now.getTime()}`,
        adminId: paymentAdminId(),
        requestText: text,
        responseText: null,
        status: "AWAITING_CLIENT_RESPONSE",
        createdAt: formatDateTime(now),
        respondedAt: null,
      });
      setPaymentStatus(row, "NEED_ACTION");
      rerenderPaymentDetail(ref);
    },
  });
}

function openChangeRateModal(row, ref) {
  const m = t("paymentDetail.modals");
  const c = t("paymentDetail.common");
  openModal({
    title: m.rateTitle,
    width: 420,
    bodyHtml: `
      <label class="filters-field">
        <span class="filters-field-label">${m.rateLabel}</span>
        <input class="address-form-input" type="number" step="any" min="0" id="pd-rate-input" value="${row.exchangeRate}" />
      </label>
      <div class="pd-rate-preview" id="pd-rate-preview"></div>
      <div class="form-error" id="pd-modal-error" hidden>${m.rateInvalid}</div>
    `,
    footerHtml: `
      <button type="button" class="btn-secondary" id="pd-modal-cancel">${c.cancel}</button>
      <button type="button" class="btn-primary" id="pd-modal-submit">${c.save}</button>
    `,
    onMount: (modalEl) => {
      const input = modalEl.querySelector("#pd-rate-input");
      const preview = modalEl.querySelector("#pd-rate-preview");
      const error = modalEl.querySelector("#pd-modal-error");
      // Комиссия ("банковская", спред) берётся из source ДО конвертации —
      // targetAmount = (sourceAmount - feeAmount) * rate, как в реальном
      // _calculateExchangeAmounts (exchange-payments.service.ts). Раньше тут
      // считали просто sourceAmount * rate, что игнорировало комиссию вовсе.
      const updatePreview = () => {
        const rate = parseFloat(input.value);
        const net = row.sourceAmount - row.feeAmount;
        preview.textContent = rate > 0 ? `${m.ratePreview} ${formatPaymentAmount(+(net * rate).toFixed(2))} ${row.targetCurrency}` : "";
      };
      updatePreview();
      input.addEventListener("input", updatePreview);
      modalEl.querySelector("#pd-modal-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#pd-modal-submit").addEventListener("click", () => {
        const rate = parseFloat(input.value);
        if (!(rate > 0)) {
          error.hidden = false;
          return;
        }
        const now = pdNow();
        row.exchangeRate = rate;
        row.targetAmount = +((row.sourceAmount - row.feeAmount) * rate).toFixed(2);
        row.updatedDate = now;
        row.updatedAt = formatDateTime(now);
        // extras.fee.rate — тот самый "чистый" курс, по которому карточка
        // считает комиссию в валюте получателя (feeTarget в renderPaymentHero);
        // extras кэшируются в PAYMENT_DETAIL_EXTRAS, поэтому без явного
        // обновления тут комиссия в валюте получателя осталась бы по старому
        // курсу, хотя сумма зачисления уже пересчиталась.
        getPaymentDetailExtras(row).fee.rate = rate;
        closeModal();
        rerenderPaymentDetail(ref);
      });
    },
  });
}

function openCancelDealModal(extras, ref) {
  const m = t("paymentDetail.modals");
  openPaymentTextModal({
    title: m.cancelDealTitle,
    intro: m.cancelDealText,
    label: m.cancelDealLabel,
    requiredMsg: m.reasonRequired,
    submitLabel: t("paymentDetail.actions.cancelDeal"),
    danger: true,
    onSubmit: (reason) => {
      requireAdmin2fa("otc_force_cancel", () => {
        extras.rail.status = "CANCELED";
        addPaymentComment(extras, m.cancelDealComment + reason);
        rerenderPaymentDetail(ref);
      });
    },
  });
}

function openCommentModal(extras, ref, commentId) {
  const m = t("paymentDetail.modals");
  const existing = commentId ? extras.comments.find((cm) => cm.id === commentId) : null;
  openPaymentTextModal({
    title: existing ? m.commentEditTitle : m.commentTitle,
    label: m.commentLabel,
    value: existing ? existing.text : "",
    requiredMsg: m.commentRequired,
    submitLabel: t("paymentDetail.common.save"),
    onSubmit: (text) => {
      if (existing) existing.text = text;
      else addPaymentComment(extras, text);
      rerenderPaymentDetail(ref);
    },
  });
}

function confirmDeleteComment(extras, ref, commentId) {
  const m = t("paymentDetail.modals");
  const c = t("paymentDetail.common");
  openConfirmModal({
    title: m.commentDeleteTitle,
    text: m.commentDeleteText,
    confirmLabel: c.delete,
    cancelLabel: c.cancel,
    danger: true,
    onConfirm: () => {
      extras.comments = extras.comments.filter((cm) => cm.id !== commentId);
      rerenderPaymentDetail(ref);
    },
  });
}

// Форма добавления вложения: реальный выбор файла (<input type="file">) +
// отдельное редактируемое поле "Название файла" (предзаполняется именем
// выбранного файла, но админ может его поменять — так же, как customFileName
// уже показывается в списке вложений, см. renderPaymentAttachmentsCard).
function openAddAttachmentModal(extras, ref) {
  const m = t("paymentDetail.modals");
  const c = t("paymentDetail.common");
  openModal({
    title: m.attachTitle,
    width: 480,
    bodyHtml: `
      <label class="filters-field">
        <span class="filters-field-label">${m.attachFileLabel}</span>
        <input type="file" id="pd-attach-file" />
      </label>
      <div class="form-error" id="pd-attach-file-error" hidden>${m.attachFileRequired}</div>
      <label class="filters-field">
        <span class="filters-field-label">${m.attachLabel}</span>
        <input class="address-form-input" type="text" id="pd-attach-name" placeholder="${m.attachLabel}" />
      </label>
      <div class="form-error" id="pd-attach-name-error" hidden>${m.attachRequired}</div>
    `,
    footerHtml: `
      <button type="button" class="btn-secondary" id="pd-attach-cancel">${c.cancel}</button>
      <button type="button" class="btn-primary" id="pd-attach-submit">${t("paymentDetail.common.add")}</button>
    `,
    onMount: (modalEl) => {
      const fileInput = modalEl.querySelector("#pd-attach-file");
      const nameInput = modalEl.querySelector("#pd-attach-name");
      const fileError = modalEl.querySelector("#pd-attach-file-error");
      const nameError = modalEl.querySelector("#pd-attach-name-error");
      let selectedFile = null;

      fileInput.addEventListener("change", () => {
        selectedFile = fileInput.files[0] || null;
        fileError.hidden = true;
        if (selectedFile && !nameInput.value.trim()) {
          // Название по умолчанию — имя файла без расширения, но остаётся
          // редактируемым (customFileName у вложения — отдельное поле).
          nameInput.value = selectedFile.name.replace(/\.[^.]+$/, "");
        }
      });

      modalEl.querySelector("#pd-attach-cancel").addEventListener("click", closeModal);
      modalEl.querySelector("#pd-attach-submit").addEventListener("click", () => {
        const name = nameInput.value.trim();
        let hasError = false;
        if (!selectedFile) {
          fileError.hidden = false;
          hasError = true;
        }
        if (!name) {
          nameError.hidden = false;
          hasError = true;
        }
        if (hasError) return;
        closeModal();
        extras.attachments.push({
          id: `at-new-${Date.now()}`,
          customFileName: name,
          fileName: selectedFile.name,
          sizeKb: Math.max(1, Math.round(selectedFile.size / 1024)),
          // Реальный object URL выбранного файла — живёт, пока открыта
          // страница; даёт настоящее превью (картинки) и скачивание
          // (любой тип файла), а не только имя/размер.
          url: URL.createObjectURL(selectedFile),
        });
        rerenderPaymentDetail(ref);
      });
    },
  });
}

function confirmDeleteAttachment(extras, ref, idx) {
  const m = t("paymentDetail.modals");
  const c = t("paymentDetail.common");
  openConfirmModal({
    title: m.attachDeleteTitle,
    text: m.attachDeleteText,
    confirmLabel: c.delete,
    cancelLabel: c.cancel,
    danger: true,
    onConfirm: () => {
      extras.attachments.splice(idx, 1);
      rerenderPaymentDetail(ref);
    },
  });
}

// ---- Обработчики ------------------------------------------------------------------------
// Шапка (назад, копирование id, меню-троеточие) рендерится один раз и не
// перерисовывается при переключении вкладок — обработчик вешается один раз
// здесь же, а не в attachPaymentDetailContentHandlers (тот перевешивается на
// каждое переключение вкладки), иначе на кнопку меню навешивался бы ещё один
// обработчик поверх уже существующего. Тот же паттерн, что и в
// attachClientDetailHeaderHandlers (clients-users.js).
function attachPaymentDetailHeaderHandlers(row, ref) {
  const backBtn = document.getElementById("pd-back");
  if (backBtn) backBtn.addEventListener("click", () => { window.location.hash = `#/${paymentListRouteId(ref)}`; });

  document.querySelectorAll(".client-detail-header .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn));
    });
  });

  // Кнопка-ссылка "перейти в vABS" (operation.id === payment.id, подтверждено
  // чтением кода 23.09.2026 — swift-payments.resolver.ts findRelatedOperation()
  // и аналоги по остальным методам). Настоящего кросс-линка с VB_OPERATIONS в
  // моке нет (это отдельный, независимо сгенерированный список), поэтому
  // переход честно ведёт по реальному паттерну маршрута — если конкретной
  // записи не найдётся, страница операций покажет "не найдено".
  const gotoOperationBtn = document.getElementById("pd-goto-operation-btn");
  if (gotoOperationBtn) {
    gotoOperationBtn.addEventListener("click", () => {
      window.location.hash = `#/settings-vabs-operations/${row.id}`;
    });
  }

  const actionsWrap = document.getElementById("cd-actions");
  if (!actionsWrap) return;

  const handleOutsideClick = (e) => {
    if (!actionsWrap.contains(e.target)) closeActionsMenu();
  };
  const closeActionsMenu = () => {
    actionsWrap.classList.remove("is-open");
    document.removeEventListener("click", handleOutsideClick, true);
  };

  document.getElementById("cd-actions-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = actionsWrap.classList.toggle("is-open");
    if (isOpen) setTimeout(() => document.addEventListener("click", handleOutsideClick, true), 0);
    else document.removeEventListener("click", handleOutsideClick, true);
  });

  const extras = getPaymentDetailExtras(row);
  const headerActions = {
    approve: () => openApproveModal(row, ref),
    decline: () => openDeclineModal(row, extras, ref),
    requestInfo: () => openRequestInfoModal(row, extras, ref),
    changeRate: () => openChangeRateModal(row, ref),
    cancelDeal: () => openCancelDealModal(extras, ref),
    exportPdf: () => exportPaymentPdf(row, ref, extras),
  };
  actionsWrap.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeActionsMenu();
      const fn = headerActions[btn.dataset.action];
      if (fn) fn();
    });
  });
}

function attachPaymentDetailTabHandlers(row) {
  document.querySelectorAll("[data-pd-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      paymentDetailState.tab = btn.dataset.pdTab;
      updatePaymentDetailTab(row);
    });
  });
}

// Перевешивается при каждом переключении вкладки (#pd-tab-content каждый раз
// перерисовывается целиком) — копирование, действия, комментарии/запросы/
// вложения, переход по ссылкам-превью и т.д.
function attachPaymentDetailContentHandlers(row) {
  const ref = currentPaymentRef();
  const content = document.getElementById("pd-tab-content");
  if (!content || !ref) return;
  const extras = getPaymentDetailExtras(row);

  content.querySelectorAll(".collapsible-card-head").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".collapsible-card").classList.toggle("is-collapsed"));
  });

  content.querySelectorAll(".id-copy, .copy-icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      copyTextToClipboard(btn.dataset.copyValue).then(() => flashCopied(btn));
    });
  });

  content.querySelectorAll(".copy-target").forEach((el) => {
    el.addEventListener("click", () => {
      copyTextToClipboard(el.dataset.copyText).then(() => {
        el.classList.add("is-copied");
        setTimeout(() => el.classList.remove("is-copied"), 900);
      });
    });
  });

  const actions = {
    requestInfo: () => openRequestInfoModal(row, extras, ref),
    openComments: () => openPaymentCommentsDrawer(extras, ref),
    addAttachment: () => openAddAttachmentModal(extras, ref),
  };
  content.querySelectorAll("[data-pd-action]").forEach((btn) => {
    btn.addEventListener("click", () => actions[btn.dataset.pdAction]());
  });

  content.querySelectorAll("[data-party-hash]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = btn.dataset.partyHash;
    });
  });

  if (paymentDetailState.tab === "ledger") {
    content.querySelectorAll("[data-pd-ledger-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pdLedgerTab = btn.dataset.pdLedgerTab;
        updatePaymentDetailTab(row);
      });
    });
    bindExportMenu("pd-ledger-export", (format) => {
      const { headers, rows } = pdLedgerExportRows(row);
      exportTable(`payment-${row.code}-ledger`, format, headers, rows);
      showToast(t("paymentDetail.ledger.exportDone"));
    });
  }

  content.querySelectorAll("[data-au-hash]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = btn.dataset.auHash;
    });
  });

  // "Смотреть все" в превью-карточках (риск/запросы) — переключает вкладку.
  content.querySelectorAll("[data-pd-tab-link]").forEach((btn) => {
    btn.addEventListener("click", () => {
      paymentDetailState.tab = btn.dataset.pdTabLink;
      updatePaymentDetailTab(row);
    });
  });

  content.querySelectorAll("[data-comment-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openCommentModal(extras, ref, btn.dataset.commentEdit));
  });
  content.querySelectorAll("[data-comment-delete]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteComment(extras, ref, btn.dataset.commentDelete));
  });
  content.querySelectorAll("[data-attachment-delete]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteAttachment(extras, ref, Number(btn.dataset.attachmentDelete)));
  });
}

function initPaymentDetailView(ref) {
  const row = findPaymentRow(ref);
  if (!row) return;
  attachPaymentDetailHeaderHandlers(row, ref);
  attachPaymentDetailTabHandlers(row);
  attachPaymentDetailContentHandlers(row);
}
