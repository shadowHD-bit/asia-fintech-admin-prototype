/* ==========================================================================
   Моковые данные для "Настройки системы → vABS": сети, валюты, справочники
   (перечисления), провайдеры, операции. Спецификация: docs/settings-vabs-spec.md.
   Реальное: 5 сетей и 45 валют как в текущей админке (FIAT 35, BITCOIN 1,
   ETHEREUM 6, LITECOIN 1, TRON 2), 18 названий перечислений и известные
   значения, 12 провайдеров и их типы (ACCOUNT / EXCHANGE), состав конфигурации
   провайдеров, правила статусов проводок и расчёт статуса операции.
   Условное: описания, ID, даты, значения перечислений, которых нет в
   репозиториях, соответствия валют, сами операции. Операции построены из
   проводок мока "Счета" (accounts.mock.js), чтобы переходы между разделами
   работали. Должен загружаться после accounts.mock.js.
   ========================================================================== */

// ---- Сети --------------------------------------------------------------------------------------
const VB_DATE_A = new Date(2025, 8, 4, 20, 29);
const VB_DATE_B = new Date(2026, 2, 18, 20, 29);
const VB_DATE_C = new Date(2026, 4, 22, 22, 16);
const VB_DATE_FIAT_UPDATED = new Date(2026, 1, 12, 16, 39);

function vbStamp(entity, createdDate, updatedDate) {
  entity.createdDate = createdDate;
  entity.createdAt = formatDateTime(createdDate);
  entity.updatedDate = updatedDate || createdDate;
  entity.updatedAt = formatDateTime(entity.updatedDate);
  return entity;
}

const VB_NETWORKS = ["FIAT", "BITCOIN", "ETHEREUM", "LITECOIN", "TRON"].map((name, i) =>
  vbStamp(
    { id: seedToPaymentUuid(9100 + i), name, description: null, status: "ACTIVE", references: [], metadata: null },
    i === 0 ? VB_DATE_A : VB_DATE_B,
    i === 0 ? VB_DATE_FIAT_UPDATED : VB_DATE_B
  )
);

// ---- Валюты ------------------------------------------------------------------------------------
const VB_FIAT_TICKERS = [
  "USD", "EUR", "RUB", "KGS", "GBP", "HKD", "AMD", "AOA", "AED", "CNY", "KZT", "UZS", "TRY", "CHF", "JPY", "GEL", "BYN", "PLN", "CZK", "AZN",
  "INR", "THB", "MDL", "RSD", "SGD", "USD.K", "RUBR", "RUB.N", "EUR.K", "GLD.PD", "SLV.PD", "AED.PD", "CNY.PD", "PLT.PD", "PLD.PD",
];
const VB_DISABLED_TICKERS = ["AMD", "AOA", "BYN", "RSD"];
const VB_CRYPTO = [
  ["BTC", "BITCOIN", 8], ["ETH", "ETHEREUM", 18], ["USDT", "ETHEREUM", 6], ["USDC", "ETHEREUM", 6], ["DAI", "ETHEREUM", 18], ["LINK", "ETHEREUM", 18],
  ["UNI", "ETHEREUM", 18], ["LTC", "LITECOIN", 8], ["TRX", "TRON", 6], ["USDT", "TRON", 6],
];

const VB_CURRENCIES = [
  ...VB_FIAT_TICKERS.map((ticker) => ({ ticker, network: "FIAT", decimals: 2 })),
  ...VB_CRYPTO.map(([ticker, network, decimals]) => ({ ticker, network, decimals })),
].map((c, i) => {
  const isPd = c.ticker.endsWith(".PD");
  const created = c.network !== "FIAT" ? VB_DATE_B : isPd || i % 3 === 0 ? VB_DATE_C : VB_DATE_A;
  return vbStamp(
    {
      id: seedToPaymentUuid(9200 + i),
      ticker: c.ticker,
      networkName: c.network,
      decimals: c.decimals,
      description: `${c.ticker}:${isPd ? "METAL" : c.network}`,
      status: VB_DISABLED_TICKERS.includes(c.ticker) && c.network === "FIAT" ? "DISABLED" : "ACTIVE",
      references: [],
      metadata: null,
    },
    created
  );
});

function vbNetworkByName(name) {
  return VB_NETWORKS.find((n) => n.name === name) || null;
}
function vbCurrenciesOfNetwork(name) {
  return VB_CURRENCIES.filter((c) => c.networkName === name);
}
function vbCurrencyByTicker(ticker, network) {
  return VB_CURRENCIES.find((c) => c.ticker === ticker && (!network || c.networkName === network)) || null;
}
function vbCurrencyById(id) {
  return VB_CURRENCIES.find((c) => c.id === id) || null;
}
// Сеть валюты в моке счетов: USDT живёт в TRON, остальное — фиат
function vbNetworkOfTicker(ticker) {
  return ticker === "USDT" ? "TRON" : "FIAT";
}

// ---- Справочники (перечисления) ----------------------------------------------------------
// [название, описание, значения, где используется (ключ i18n) или null]
const VB_ENUM_SPECS = [
  ["AccountTypeEnum", "Типы счетов", ["INTERNAL", "EXTERNAL", "SYSTEM", "CLIENT", "SERVICE", "NOSTRO"], "accountType"],
  ["RealAccountStatusEnum", "Статусы реальных счетов", ["ACTIVE", "CLOSED", "DISABLED", "ERROR", "FROZEN", "ARCHIVED"], "realAccountStatus"],
  ["VirtualAccountStatusEnum", "Статусы виртуальных счетов", ["ACTIVE", "CLOSED", "DISABLED", "ERROR", "FROZEN", "ARCHIVED"], "virtualAccountStatus"],
  ["AccountRestrictionReasonEnum", "Причины ограничения счёта", ["COMPLIANCE_REVIEW", "CLIENT_REQUEST", "SUSPICIOUS_ACTIVITY", "COURT_ORDER"], "restrictionReason"],
  ["BalanceStatusEnum", null, ["ACTIVE", "PENDING", "PROCESSING", "ERROR"], "balanceStatus"],
  ["RealBalanceTypeEnum", "Типы реальных балансов", ["HOT_WALLET", "DEPOSIT_ADDRESS", "SERVICE_ADDRESS"], "realBalanceType"],
  ["EntityCategoryEnum", null, ["PRIMARY", "SECONDARY"], "entityCategory"],
  ["ProviderTypeEnum", "Типы провайдеров", ["ACCOUNT", "EXCHANGE"], null],
  ["ClientTypeEnum", null, ["SYSTEM", "CLIENT"], null],
  ["ClientStatusEnum", null, ["ACTIVE", "BLOCKED", "ARCHIVED"], null],
  ["ClientCategoryEnum", null, ["INDIVIDUAL", "CORPORATE", "SERVICE"], null],
  ["RailEnum", "Каналы перевода", ["SWIFT", "RU_WIRE"], null],
  ["JsonSchemaTypeEnum", null, ["SWIFT", "RU_WIRE"], null],
  ["JsonSchemaSegmentEnum", null, ["BENEFICIARY", "BENEFICIARY_BANK", "CORRESPONDENT_BANK"], null],
  ["DepositDetailsSchemaSegmentEnum", null, ["BENEFICIARY", "BENEFICIARY_BANK", "CORRESPONDENT_BANK"], null],
  ["NomineeCompanyStatusEnum", null, ["ACTIVE", "DISABLED", "ARCHIVED"], null],
  ["NomineeCompanyBalanceStatusEnum", null, ["ACTIVE", "DISABLED", "ARCHIVED"], null],
  ["NomineeCompanyBalanceTypeEnum", null, ["INDIVIDUAL", "CORPORATE"], null],
];
const VB_ENUMS = VB_ENUM_SPECS.map(([name, description, values, usedIn], i) =>
  vbStamp({ id: seedToPaymentUuid(9300 + i), name, description, values: [...values], usedIn }, VB_DATE_A, i % 4 === 0 ? VB_DATE_C : VB_DATE_A)
);

// ---- Провайдеры ----------------------------------------------------------------------------------
const VB_PROJECT = { id: seedToPaymentUuid(9400), name: "Default" };
const VB_PROVIDER_TYPES = {
  Paygine: "ACCOUNT", Pay2me: "ACCOUNT", "Requisites provider": "ACCOUNT", "Cash provider": "ACCOUNT", "Crypto Processing": "ACCOUNT",
  "Harbour and Hills": "EXCHANGE", Pintopay: "EXCHANGE", Walletverse: "EXCHANGE", Elcart: "EXCHANGE",
};
const VB_EXTRA_PROVIDERS = [
  { name: "Exchanger", conditions: { name: "Exchanger" } },
  { name: "Internal Liquidity", conditions: { name: "Internal Liquidity" } },
  { name: "Nominee Company", conditions: { name: "Nominee Company" } },
];
const VB_DISABLED_PROVIDERS = ["Elcart", "Nominee Company"];
const VB_SERVICE_CLIENT_ID = ACC_SERVICE_CLIENT.id;

function vbNostroOfProvider(providerId) {
  return ACCOUNTS_NOSTRO_MOCK.find((a) => a.provider.id === providerId) || null;
}

function vbBuildConfig(p) {
  const nostro = vbNostroOfProvider(p.id);
  const tickers = (list) => list.map((tk) => (vbCurrencyByTicker(tk) || {}).id).filter(Boolean);
  const base = { providerId: p.id, projectId: VB_PROJECT.id, clientId: VB_SERVICE_CLIENT_ID };
  if (p.name === "Cash provider") {
    return { ...base, nostroVirtualAccountId: ACCOUNTS_VIRTUAL_MOCK[39].id, nostroRealAccountId: nostro && nostro.id, supportedCurrencyIds: tickers(["USD", "EUR", "RUB", "KGS"]) };
  }
  if (p.name === "Walletverse") return { ...base, virtualAccountId: ACCOUNTS_VIRTUAL_MOCK[39].id };
  if (p.name === "Pintopay") return { supportedAccountCurrencyIds: tickers(["USD", "EUR"]), balanceCurrencyTickers: ["USDT"], masterCurrencyTicker: "USDT" };
  if (["Exchanger", "Internal Liquidity", "Nominee Company", "Elcart"].includes(p.name)) return { clientId: VB_SERVICE_CLIENT_ID };
  return {
    ...base,
    nostroRealAccountId: nostro ? nostro.id : seedToPaymentUuid(9500),
    liabilityPoolRealAccountId: seedToPaymentUuid(9501),
    liabilityPoolVirtualAccountId: ACCOUNTS_VIRTUAL_MOCK[36].id,
    supportedAccountCurrencyIds: tickers(p.name === "Paygine" ? ["RUB"] : ["USD", "EUR", "RUB"]),
  };
}

const VB_PROVIDERS = [
  ...ACC_PROVIDERS.map((p) => ({ id: p.id, name: p.name, type: VB_PROVIDER_TYPES[p.name] || "EXCHANGE", conditions: null })),
  ...VB_EXTRA_PROVIDERS.map((p, i) => ({ id: seedToPaymentUuid(3050 + i), name: p.name, type: "EXCHANGE", conditions: p.conditions })),
].map((p, i) => {
  const provider = vbStamp(
    {
      ...p,
      category: "PRIMARY",
      description: null,
      status: VB_DISABLED_PROVIDERS.includes(p.name) ? "DISABLED" : "ACTIVE",
      project: VB_PROJECT,
      metadata: null,
      references: [],
    },
    new Date(2025, 8, 4, 20, 29 + i),
    i % 3 === 0 ? VB_DATE_C : new Date(2025, 8, 4, 20, 29 + i)
  );
  return provider;
});
VB_PROVIDERS.forEach((p) => {
  const cfg = vbBuildConfig(p);
  Object.keys(cfg).forEach((k) => { if (cfg[k] == null) delete cfg[k]; });
  p.providerConfig = vbStamp({ id: seedToPaymentUuid(9600 + VB_PROVIDERS.indexOf(p)), status: "ACTIVE", description: null, config: cfg }, p.createdDate, p.updatedDate);
});

function vbProviderById(id) {
  return VB_PROVIDERS.find((p) => p.id === id) || null;
}
function vbRealAccountsOfProvider(id) {
  return [...ACCOUNTS_REAL_MOCK, ...ACCOUNTS_NOSTRO_MOCK].filter((a) => a.provider.id === id);
}

// Соответствие валют провайдера: наша валюта ↔ валюта на стороне провайдера
const VB_CURRENCY_MAPPINGS = [
  ["Paygine", "RUB", "RUB.N"], ["Paygine", "RUB", "RUBR"], ["Requisites provider", "USD", "USD.K"], ["Requisites provider", "EUR", "EUR.K"],
  ["Pay2me", "RUB", "RUBR"], ["Cash provider", "USD", "USD.K"], ["Cash provider", "KGS", "KGS"], ["Pintopay", "USD", "USD.K"], ["Pintopay", "EUR", "EUR.K"],
].map(([provider, ours, theirs], i) => {
  const p = VB_PROVIDERS.find((x) => x.name === provider);
  const c = vbCurrencyByTicker(ours, "FIAT");
  const pc = vbCurrencyByTicker(theirs, "FIAT");
  return vbStamp({ id: seedToPaymentUuid(9700 + i), providerId: p.id, currencyId: c.id, providerCurrencyId: pc.id, decimals: 2, description: null }, p.createdDate);
});

// ---- Операции -------------------------------------------------------------------------------------
const VB_TX_TRANSITIONS = {
  PENDING: ["PROCESSING", "ERROR", "DECLINED"],
  PROCESSING: ["ERROR", "DECLINED", "REPLACED", "CONFIRMED"],
  ERROR: ["PROCESSING", "DECLINED", "REPLACED"],
  DECLINED: [],
  REPLACED: [],
  CONFIRMED: [],
};

// Расчёт статуса операции по статусам проводок — как в ядре (operations.service._calculateOperationStatus)
function vbCalcOperationStatus(statuses) {
  const set = new Set(statuses);
  const uniform = set.size === 1;
  if (uniform && set.has("PENDING")) return "NEW";
  if (set.has("ERROR")) return "ERROR";
  if (uniform && set.has("DECLINED")) return "DECLINED";
  if (set.has("DECLINED")) return "PARTIAL_DECLINED";
  if (set.has("CONFIRMED") && [...set].every((s) => s === "CONFIRMED" || s === "REPLACED")) return "COMPLETED";
  return "PROCESSING";
}

const VB_OPERATIONS = [];
const VB_OPERATION_INDEX = {};
let vbLegCounter = 0;

function vbOpposite(side) {
  return side === "DEBIT" ? "CREDIT" : "DEBIT";
}

function vbMakeLeg(kind, account, currency, amount, side, order, status, description, createdDate) {
  vbLegCounter += 1;
  return {
    id: seedToPaymentUuid(20000 + vbLegCounter),
    legKind: kind,
    accountId: account.id,
    currency,
    amount,
    transferType: side,
    order,
    status,
    previousStatus: null,
    description,
    providerTxId: kind === "real" ? `PRV-${(vbLegCounter * 2654435) % 9000000 + 1000000}` : null,
    rawTxData: null,
    createdDate,
    createdAt: formatDateTime(createdDate),
  };
}

function vbAddOperation(acc, tx, seed) {
  if (VB_OPERATION_INDEX[tx.operation.id]) return;
  const isVirtualAnchor = acc.kind === "virtual";
  const amount = tx.amount;
  const isPayment = /payment/i.test(tx.operation.name);
  const fee = isPayment ? +(amount * 0.01).toFixed(2) : 0;
  const status = tx.status;
  tx.legKind = isVirtualAnchor ? "virtual" : "real";
  tx.rawTxData = tx.rawTxData || null;
  const pool = ACCOUNTS_VIRTUAL_MOCK[36];
  const revenue = ACCOUNTS_VIRTUAL_MOCK[37];
  const counterSide = vbOpposite(tx.transferType);
  const virtualLegs = [];
  const realLegs = [];
  const d = tx.createdDate;

  if (isVirtualAnchor) {
    virtualLegs.push(tx);
    virtualLegs.push(vbMakeLeg("virtual", pool, tx.currency, +(amount - fee).toFixed(2), counterSide, 1, status, "Liability pool", d));
    if (fee > 0) virtualLegs.push(vbMakeLeg("virtual", revenue, tx.currency, fee, counterSide, 2, status, "Bank fee", d));
    if (isPayment && seed % 2 === 0) {
      const nostro = acc.linkedIds.map((id) => ACCOUNTS_NOSTRO_MOCK.find((n) => n.id === id)).find(Boolean);
      const other = ACCOUNTS_REAL_MOCK[seed % ACCOUNTS_REAL_MOCK.length];
      if (nostro) {
        const incoming = tx.transferType === (acc.ledgerType === "ACTIVE" ? "DEBIT" : "CREDIT");
        realLegs.push(vbMakeLeg("real", nostro, tx.currency, amount, incoming ? "DEBIT" : "CREDIT", 1, status, "Nostro", d));
        realLegs.push(vbMakeLeg("real", other, tx.currency, amount, incoming ? "CREDIT" : "DEBIT", 2, status, "Provider account", d));
      }
    }
  } else {
    realLegs.push(tx);
    const other = ACCOUNTS_REAL_MOCK[(seed + 3) % ACCOUNTS_REAL_MOCK.length];
    realLegs.push(vbMakeLeg("real", other.id === acc.id ? ACCOUNTS_NOSTRO_MOCK[0] : other, tx.currency, amount, counterSide, 2, status, "Counterparty", d));
    virtualLegs.push(vbMakeLeg("virtual", pool, tx.currency, amount, "DEBIT", 1, status, "Liability pool", d));
    virtualLegs.push(vbMakeLeg("virtual", revenue, tx.currency, amount, "CREDIT", 2, status, "Service", d));
  }

  // порядок проводок внутри операции — по позиции в своём списке
  virtualLegs.forEach((l, i) => { l.order = i + 1; });
  realLegs.forEach((l, i) => { l.order = i + 1; });

  const virtualAccounts = virtualLegs.map((l) => ACCOUNTS_VIRTUAL_MOCK.find((a) => a.id === l.accountId)).filter(Boolean);
  const realAccounts = realLegs.map((l) => [...ACCOUNTS_REAL_MOCK, ...ACCOUNTS_NOSTRO_MOCK].find((a) => a.id === l.accountId)).filter(Boolean);
  const clients = [];
  virtualAccounts.forEach((a) => { if (!clients.some((c) => c.id === a.client.id)) clients.push(a.client); });
  const providers = [];
  realAccounts.forEach((a) => { if (!providers.some((p) => p.id === a.provider.id)) providers.push(a.provider); });

  const op = {
    id: tx.operation.id,
    name: tx.operation.name,
    description: seed % 7 === 0 && /Incoming/.test(tx.operation.name) ? "SBP deposit" : null,
    externalOperationId: isPayment && seed % 3 === 0 ? `EXT-${(seed * 7919) % 900000 + 100000}` : null,
    status: "NEW",
    clientRefs: clients,
    providerRefs: providers,
    virtualLegs,
    realLegs,
    metadata: seed % 5 === 0 ? { source: "webhook", channel: tx.currency === "RUB" ? "SBP" : "API" } : null,
    errorMessages: [],
    references: [],
  };
  vbStamp(op, tx.createdDate, new Date(tx.createdDate.getTime() + (2 + (seed % 20)) * 60 * 1000));
  vbRecalcOperation(op, { silent: true });
  VB_OPERATIONS.push(op);
  VB_OPERATION_INDEX[op.id] = op;
}

// Пересчёт статуса операции по проводкам (вызывается и после изменения проводки в интерфейсе)
function vbRecalcOperation(op, opts) {
  const all = [...op.virtualLegs, ...op.realLegs];
  op.status = vbCalcOperationStatus(all.map((l) => l.status));
  op.errorMessages =
    op.status === "ERROR"
      ? [{ code: "VABS-107", title: "Недопустимая смена статуса проводки", message: "Проводка перешла в статус ERROR", status: "400", path: null }]
      : [];
  // операция в мок-проводке счёта показывает актуальный статус
  all.forEach((l) => { if (l.operation) l.operation.status = op.status; });
  return op;
}

Object.keys(ACCOUNT_TRANSACTIONS).forEach((accountId) => {
  const acc = accFind("all", accountId);
  ACCOUNT_TRANSACTIONS[accountId].forEach((tx, j) => vbAddOperation(acc, tx, j + accountId.charCodeAt(0)));
});
VB_OPERATIONS.sort((a, b) => b.createdDate - a.createdDate);

function vbOperationById(id) {
  return VB_OPERATION_INDEX[id] || null;
}
