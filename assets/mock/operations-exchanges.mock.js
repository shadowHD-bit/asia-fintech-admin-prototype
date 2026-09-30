/* ==========================================================================
   Моковые данные для "Операции → Обмены".
   Подтверждено чтением бэкенда 21.09.2026: отдельной ручки для обменов НЕТ —
   это те же платежи (`payments`/`FindPaymentsInput`), отфильтрованные по
   `paymentSystems: [EXCHANGE]`. Тип строки — `ExchangePaymentType extends
   CommonPaymentType` (core-feature-dev_bank_core/plugins/common-payments-plugin/
   core/payments/methods/exchange/graphql/types/exchange-payment.type.ts).

   Уточнено повторным чтением 24.09.2026 (exchange-payments.service.ts) —
   модель совсем другая, чем у обычного платежа, и раньше была смоделирована
   неверно:
   - Обмен — это ОДИН и тот же клиент, конвертирующий между ДВУМЯ своими же
     счетами, а не перевод другому клиенту. В сервисе есть жёсткая проверка
     `if (dto.recipientClientId !== dto.senderClientId) throwError(...)`
     ("Sender and recipient cannot be the different") — recipientClientId
     обязан совпадать с senderClientId. senderAccountId/recipientAccountId —
     два РАЗНЫХ счёта того же клиента.
   - CreateExchangePaymentInput extends CreateCommonPaymentInput НАПРЯМУЮ (не
     CreateBasePaymentInput) — значит purposeOfPayment/sourceOfFunds сюда не
     передаются вовсе (эти поля — только у CreateBasePaymentInput, SWIFT/WIRE/
     ACH). Честно оставляем purposeOfPayment пустым, а не выдумываем.
   - Комиссия — не provider/bank пополам, как у переводов: provider-комиссия
     всегда 0, комиссия получателя (target) всегда 0, вся комиссия —
     "банковская" (по сути спред), берётся из source ДО конвертации
     (`_getExchangeBankFee`/`_calculateExchangeAmounts`, exchange-payments.
     service.ts) — feeCurrency честно = sourceCurrency (это уже было верно).
   - direction — реальное поле CommonPaymentType, но раз обе стороны — один и
     тот же клиент, содержательного "входящий/исходящий" тут нет; используем
     "BOTH" (тот же смысл, что и у INNER/OTC в PAYMENT_BOTH_INTERNAL_SYSTEMS,
     operations-payments.mock.js).

   Переиспользует утилиты/справочники из assets/mock/operations-payments.mock.js
   (PAYMENT_STATUS_OPTIONS, PAYMENT_CURRENCY_OPTIONS, seedToPaymentUuid,
   paymentPartyRef) — тот файл должен грузиться раньше.
   ========================================================================== */

const OPERATIONS_EXCHANGES_MOCK = Array.from({ length: 26 }).map((_, i) => {
  const seed = i + 1;
  const status = pick(PAYMENT_STATUS_OPTIONS, seed * 5);

  const createdDate = new Date(MOCK_NOW.getTime() - seed * 8.3 * 60 * 60 * 1000);
  const updatedDate = new Date(createdDate.getTime() + (3 + (seed % 40)) * 60 * 1000);
  const isSettled = status === "SUCCESSFUL" || (status === "REFUNDED" && seed % 2 === 0);
  const settledDate = isSettled ? new Date(updatedDate.getTime() + 2 * 60 * 1000) : null;

  const sourceCurrency = pick(PAYMENT_CURRENCY_OPTIONS, seed);
  // Разная валюта почти всегда — сама суть обмена; редкие "одинаковые" строки
  // (seed % 13 === 0) оставлены намеренно как edge case для проверки UI (у
  // такой пары quoteId по реальной валидации не должно быть вовсе —
  // ensureQuoteConsistency, payments.service.ts).
  const targetCurrency = seed % 13 === 0 ? sourceCurrency : pick(PAYMENT_CURRENCY_OPTIONS, seed + 2 + (seed % 3));

  const sourceAmount = 80 + ((seed * 211) % 12000);
  const exchangeRate = +(0.7 + ((seed * 37) % 130) / 100).toFixed(4);
  // Комиссия — только банковская (спред), берётся из source ДО конвертации;
  // provider- и target-комиссии у обмена всегда 0 (см. комментарий в шапке).
  const feeAmount = +(sourceAmount * 0.008).toFixed(2);
  const targetAmount = +((sourceAmount - feeAmount) * exchangeRate).toFixed(2);
  const totalAmount = +(sourceAmount + feeAmount).toFixed(2);

  // Один клиент — конвертирует между двумя своими счетами (не перевод другому
  // клиенту, см. шапку). senderClientId/recipientClientId ниже намеренно
  // совпадают — это честная модель, а не дубль по ошибке.
  const client = paymentPartyRef(seed, 8000);
  const senderAccountId = `408${String(1700000000000000 + ((seed * 7919) % 89999999999999)).slice(0, 15)}`;
  const recipientAccountId = `408${String(1700000000000000 + ((seed * 7919 + 41) % 89999999999999)).slice(0, 15)}`;

  return {
    id: seedToPaymentUuid(seed + 5000),
    code: entityCode("EXC", seed + 5000),
    createdDate,
    updatedDate,
    createdAt: formatDateTime(createdDate),
    updatedAt: formatDateTime(updatedDate),
    settledDate,
    settledAt: settledDate ? formatDateTime(settledDate) : null,
    direction: "BOTH",
    paymentSystem: "EXCHANGE",
    status,
    previousStatus: status === "DECLINED" && seed % 2 === 0 ? "ON_REVIEW" : null,
    isFavorite: seed % 9 === 0,
    // Обе стороны — один и тот же клиент (см. шапку файла); поля дублируются,
    // чтобы общий код карточки платежа (paymentPartyDetails и т.п., который
    // читает senderClientId/recipientClientId по всем рельсам одинаково) не
    // нужно было отдельно чинить под обмены.
    senderClientId: client.id,
    senderClientType: client.type,
    senderClientName: client.name,
    senderClientLink: client.link,
    senderAccountId,
    recipientClientId: client.id,
    recipientClientType: client.type,
    recipientClientName: client.name,
    recipientClientLink: client.link,
    recipientAccountId,
    sourceAmount,
    sourceCurrency,
    targetAmount,
    targetCurrency,
    exchangeRate,
    feeAmount,
    feeCurrency: sourceCurrency,
    totalAmount,
    totalCurrency: sourceCurrency,
    // CreateExchangePaymentInput extends CreateCommonPaymentInput напрямую —
    // purposeOfPayment/sourceOfFunds сюда не передаются (см. шапку файла),
    // честно оставляем пустыми, а не выдумываем.
    purposeOfPayment: null,
    sourceOfFunds: null,
    note: seed % 7 === 0 ? "Курс подтверждён вручную оператором" : null,
  };
});
