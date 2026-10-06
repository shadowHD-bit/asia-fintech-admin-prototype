/* ==========================================================================
   Крипто-адреса клиентов (физлица и компании) — демонстрационные данные для вкладки
   «Крипто-адреса» в карточке клиента. Модель — VabsCryptoProviderAddress из спеки
   провайдера (core-dev/providers/crypto-cp-provider/README.md): адрес на клиента и
   сеть, состояние выдачи (выдан / выдаётся / отказ провайдера), memo-тег для сетей
   с тегами, поколения адреса: видит клиент только текущий (isCurrent), прошлые
   остаются в истории.
   Адреса детерминированы по индексу клиента — при перезагрузке не меняются.
   ========================================================================== */

const CA_NETWORKS = ["TRON", "ETHEREUM", "BITCOIN", "LITECOIN"];
const CA_STATES = ["ISSUED", "ISSUING", "REFUSED"];
// Сети с memo-тегом в демо нет (TRON/ETH/BTC/LTC без тега); поле оставлено по модели провайдера.
const CA_TAGGED_NETWORKS = [];
// Баланс клиента рядом с адресом — в USDT: виртуальные счета клиентов ведутся в USDT (accounts.mock.js),
// нативные монеты сетей на виртуальных счетах не встречаются.
const CA_NETWORK_TICKERS = { TRON: ["USDT"], ETHEREUM: ["USDT"], BITCOIN: ["USDT"], LITECOIN: ["USDT"] };

const CA_B58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const CA_BECH32_CHARS = "023456789acdefghjklmnpqrstuvwxyz";

function caChars(seed, len, alphabet) {
  let x = (seed * 2654435761) >>> 0;
  let s = "";
  for (let i = 0; i < len; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    s += alphabet[x % alphabet.length];
  }
  return s;
}

function caAddress(network, seed) {
  if (network === "TRON") return "T" + caChars(seed, 33, CA_B58_CHARS);
  if (network === "ETHEREUM") return "0x" + caChars(seed, 40, "0123456789abcdef");
  if (network === "BITCOIN") return "bc1q" + caChars(seed, 38, CA_BECH32_CHARS);
  return "ltc1q" + caChars(seed, 38, CA_BECH32_CHARS);
}

let CA_BY_CLIENT = null;

// Строим лениво: мок клиентов грузится раньше, но порядок скриптов не должен этим управлять.
function caBuildAll() {
  if (CA_BY_CLIENT) return CA_BY_CLIENT;
  CA_BY_CLIENT = {};
  const clients = [...CLIENTS_USERS_MOCK, ...CLIENTS_COMPANIES_MOCK];
  clients.forEach((client, idx) => {
    const list = [];
    const netCount = 1 + (idx % 3);
    for (let k = 0; k < netCount; k++) {
      const network = CA_NETWORKS[(idx + k) % CA_NETWORKS.length];
      const seed = idx * 10 + k + 1;
      const createdAt = new Date(MOCK_NOW.getTime() - (idx * 3 + k + 2) * 24 * 3600 * 1000);
      let state = "ISSUED";
      if ((idx + k) % 5 === 0) state = "ISSUING";
      else if ((idx + k) % 7 === 3) state = "REFUSED";
      const hasAddress = state === "ISSUED";
      list.push({
        id: `ca-${client.id}-${k}`,
        clientId: client.id,
        network,
        address: hasAddress ? caAddress(network, seed) : null,
        tag: null,
        state,
        unavailableReason: state === "REFUSED" ? "Провайдер отклонил запрос на выдачу адреса" : null,
        nextAttemptAt: state === "ISSUED" ? null : new Date(MOCK_NOW.getTime() + (k + 1) * 3600 * 1000),
        createdAt,
        updatedAt: state === "ISSUED" ? new Date(createdAt.getTime() + 2 * 3600 * 1000) : new Date(MOCK_NOW.getTime() - (idx % 6) * 3600 * 1000),
        isCurrent: true,
      });
      // Поколение: у каждого четвёртого клиента первый адрес был перевыпущен — старый остаётся в истории.
      if (k === 0 && idx % 4 === 1 && hasAddress) {
        list.push({
          id: `ca-${client.id}-${k}-old`,
          clientId: client.id,
          network,
          address: caAddress(network, seed + 500),
          tag: null,
          state: "ISSUED",
          unavailableReason: null,
          nextAttemptAt: null,
          createdAt: new Date(createdAt.getTime() - 60 * 24 * 3600 * 1000),
          updatedAt: new Date(createdAt.getTime() - 50 * 24 * 3600 * 1000),
          isCurrent: false,
        });
      }
    }
    CA_BY_CLIENT[client.id] = list;
  });
  return CA_BY_CLIENT;
}

// Текущие адреса сверху, внутри — по сети; прошлые поколения — ниже в той же сети.
function getClientCryptoAddresses(client) {
  const list = (caBuildAll()[client.id] || []).slice();
  return list.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return CA_NETWORKS.indexOf(a.network) - CA_NETWORKS.indexOf(b.network);
  });
}

// Демо-остаток USDT для клиента user2@fexpost.com: его виртуальный счёт получает USDT-баланс,
// тогда вкладка «Крипто-адреса» показывает свободно/в холде и совпадает с вкладкой «Счета».
(function caSeedDemoUsdt() {
  const target = CLIENTS_USERS_MOCK.find((u) => u.email === "user2@fexpost.com");
  if (!target) return;
  const owned = ACCOUNTS_VIRTUAL_MOCK.filter((a) => a.client && a.client.id === target.id);
  const acc = owned.find((a) => a.status === "ACTIVE") || owned[0];
  if (!acc || acc.balances.some((b) => b.currency === "USDT")) return;
  acc.balances.push({ id: `ca-usdt-${target.id}`, code: "BAL-USDT-DEMO", description: null, currency: "USDT", total: 1250.5, hold: 300, available: 950.5, status: "ACTIVE", type: null });
})();