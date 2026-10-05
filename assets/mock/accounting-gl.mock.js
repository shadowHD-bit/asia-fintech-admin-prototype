/* ==========================================================================
   "Настройки → Бухгалтерия → Главная книга" (General Ledger / Journal Entries).

   ДОПУЩЕНИЕ ПРОТОТИПА: как и План счетов (см. mock/accounting-coa.mock.js) —
   реального движка проводок в бэкенде нет, раздел построен по требованиям
   из general-ledger-i-chart-of-accounts.md (§4 General Ledger). Суммы и
   состав проводок в примерах "Исходящий SWIFT"/"FX Trade"/"Выдача кредита"
   взяты из §8 документа один в один (та же цена операции, те же комиссии) —
   это не совпадение, а прямое соответствие рабочим примерам спецификации.

   Каждая запись — одна проводка (дебет+кредит одной парой, без отдельных
   "ног") — это полностью соответствует §4.2 и примерам §8 документа: там
   JE-XXXX тоже задаёт Debit/Credit одной строкой, а не отдельными легами.

   Измерения (VA-ID/RA-ID/Client-ID) привязаны к РЕАЛЬНЫМ записям из
   mock/accounts.mock.js и mock/clients-users.mock.js — не выдуманные ID,
   чтобы при желании можно было провалиться по ссылке в настоящую карточку
   клиента/счёта.

   Загружается после accounting-coa.mock.js (нужны коды счетов плана счетов)
   и после accounts.mock.js/clients-users.mock.js (нужны реальные ВА/РА/клиенты).
   ========================================================================== */

function glStamp(entity, createdDate) {
  entity.createdDate = createdDate;
  entity.createdAt = formatDateTime(createdDate);
  return entity;
}

function glPeriodOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Порог для ручных проводок (§10.2): ниже — проводятся сразу (Posted), выше — уходят на апрув (Pending).
// Один порог вместо двух (документ допускает "один или два независимых апрува" — в прототипе один уровень).
const GL_MANUAL_THRESHOLD = 5000;

// Реальные счета/клиенты как источник измерений — не выдуманные ID
const GL_VA_SAMPLE = ACCOUNTS_VIRTUAL_MOCK.filter((a) => a.client && a.type === "CLIENT").slice(0, 8);
const GL_RA_SAMPLE = ACCOUNTS_REAL_MOCK.slice(0, 6);
function glVa(i) { return GL_VA_SAMPLE[i % GL_VA_SAMPLE.length]; }
function glRa(i) { return GL_RA_SAMPLE[i % GL_RA_SAMPLE.length]; }

let glSeq = 0;
function glNextId(createdDate) {
  glSeq += 1;
  const d = createdDate;
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return { id: seedToPaymentUuid(41000 + glSeq), entryId: `JE-${datePart}-${String(glSeq).padStart(6, "0")}` };
}

// entry: { debit, credit, amount, currency, type, status, dims, product, channel, description, transactionId,
//          batchReference, daysAgo, effective }
function glMake(spec) {
  // effectiveDate — приоритетно: когда проводка строится из реальной операции (см. автогенерацию ниже),
  // нужна ЕЁ настоящая дата, а не пересчитанная через daysAgo (которая всегда немного плывёт из-за округления).
  const createdDate = spec.effectiveDate || new Date(MOCK_NOW.getTime() - (spec.daysAgo || 0) * 24 * 3600 * 1000 - (spec.hoursAgo || 0) * 3600 * 1000);
  const { id, entryId } = glNextId(createdDate);
  const dims = spec.dims || {};
  const debitAcc = coaByCode(spec.debit);
  const creditAcc = coaByCode(spec.credit);
  return glStamp(
    {
      id,
      entryId,
      transactionId: spec.transactionId || `TXN-${entryId.slice(3)}`,
      // Ссылка на настоящую запись в "Операции" — только у проводок, автоматически построенных из реальных
      // операций (см. ниже); у иллюстративных сценариев (Opening Balance, Loan, Manual...) её нет и не может быть.
      sourceOperationId: spec.sourceOperationId || null,
      // Код правила проводки (accounting-rules.mock.js), которое создало эту проводку — только у type=AUTO,
      // построенных через правила (см. §12 ниже); у иллюстративных сценариев 1-11 и у ручных/сторно проводок нет.
      appliedRuleCode: spec.appliedRuleCode || null,
      batchReference: spec.batchReference || null,
      type: spec.type || "AUTO",
      status: spec.status || "POSTED",
      effectiveDate: createdDate,
      effectiveAt: formatDateTime(createdDate),
      postedDate: spec.status === "PENDING" ? null : createdDate,
      postedAt: spec.status === "PENDING" ? null : formatDateTime(createdDate),
      period: glPeriodOf(createdDate),
      debitAccountCode: spec.debit,
      debitAccountName: debitAcc ? `${debitAcc.code} · ${debitAcc.name}` : spec.debit,
      creditAccountCode: spec.credit,
      creditAccountName: creditAcc ? `${creditAcc.code} · ${creditAcc.name}` : spec.credit,
      amount: spec.amount,
      currency: spec.currency,
      dimensions: {
        vaId: dims.va || null,
        vaCode: dims.vaCode || null,
        raId: dims.ra || null,
        raCode: dims.raCode || null,
        clientId: dims.clientId || null,
        clientName: dims.clientName || null,
        product: dims.product || null,
        channel: dims.channel || null,
      },
      description: spec.description,
      reversalOfId: spec.reversalOfId || null,
      reversedById: null,
      // CURRENT_ADMIN определён в app.js, который грузится ПОСЛЕДНИМ — а сценарии 1–11 ниже вызывают glPush
      // немедленно при загрузке мока (а не по клику админа), поэтому прямое обращение к CURRENT_ADMIN здесь
      // уже на первом же вызове падало с ReferenceError и обнуляло весь GL_JOURNAL_ENTRIES (найдено по
      // консоли браузера — "GL пустой"). typeof-проверка безопасна для ещё не объявленной переменной и даёт
      // настоящее имя админа там, где glPush вызывается по-настоящему вживую (ручная проводка/сторно из
      // accounting-gl.js — те вызовы происходят уже после полной загрузки страницы).
      createdBy: spec.type === "MANUAL" || spec.type === "REVERSAL" ? (typeof CURRENT_ADMIN !== "undefined" ? CURRENT_ADMIN.name : "Администратор") : "Система",
      supportingDocNote: spec.supportingDocNote || null,
      rejectReason: spec.rejectReason || null,
    },
    createdDate
  );
}

const GL_JOURNAL_ENTRIES = [];
function glPush(spec) {
  const e = glMake(spec);
  GL_JOURNAL_ENTRIES.push(e);
  return e;
}

// ---- 1. Вступительные остатки (§11.2 Opening Balance) — по одному на каждый РА-счёт с клиентскими деньгами ---
[
  { debit: "1101", credit: "2100", amount: 1420000, currency: "EUR", va: glVa(0), ra: glRa(0), product: "current", daysAgo: 180 },
  { debit: "1102", credit: "2100", amount: 288600, currency: "GBP", va: glVa(1), ra: glRa(1), product: "current", daysAgo: 180 },
  { debit: "1103", credit: "2100", amount: 410000, currency: "USD", va: glVa(2), ra: glRa(2), product: "current", daysAgo: 180 },
  { debit: "1111", credit: "2100", amount: 95000, currency: "EUR", va: glVa(3), ra: glRa(3), product: "current", daysAgo: 180 },
  { debit: "1121", credit: "2110", amount: 210000, currency: "EUR", va: glVa(4), ra: glRa(0), product: "card", daysAgo: 180 },
  { debit: "1101", credit: "3100", amount: 500000, currency: "EUR", daysAgo: 180 }, // внесение уставного капитала: Nostro растёт (актив), Equity растёт
].forEach((s, i) =>
  glPush({
    type: "MANUAL",
    status: "POSTED",
    debit: s.debit,
    credit: s.credit,
    amount: s.amount,
    currency: s.currency,
    daysAgo: s.daysAgo,
    description: `Opening balance migration${s.va ? ` — ${s.va.code}` : ""}`,
    dims: s.va
      ? { va: s.va.id, vaCode: s.va.code, ra: s.ra ? s.ra.id : null, raCode: s.ra ? s.ra.code : null, clientId: s.va.client.id, clientName: null, product: s.product, channel: null }
      : { ra: null },
  })
);

// ---- 2. Входящий SEPA (§8, по образцу примера из документа) — 3 клиента, с комиссией -------------------------
[
  { va: glVa(0), ra: glRa(0), amount: 5000, fee: 1.5, daysAgo: 12 },
  { va: glVa(3), ra: glRa(0), amount: 2200, fee: 1.5, daysAgo: 6 },
  { va: glVa(5), ra: glRa(1), amount: 870, fee: 1.5, daysAgo: 2, currency: "GBP", debitAcc: "1102" },
].forEach((s) => {
  const cur = s.currency || "EUR";
  const debitAcc = s.debitAcc || "1101";
  const dims = { va: s.va.id, vaCode: s.va.code, ra: s.ra.id, raCode: s.ra.code, clientId: s.va.client.id, product: "current", channel: "SEPA" };
  glPush({ debit: debitAcc, credit: "2100", amount: s.amount, currency: cur, daysAgo: s.daysAgo, description: `Incoming SEPA — ${s.va.code}`, dims });
  glPush({ debit: "2100", credit: "4110", amount: s.fee, currency: cur, daysAgo: s.daysAgo, description: `SEPA fee — ${s.va.code}`, dims: { ...dims, va: s.va.id } });
});

// ---- 3. Исходящий SWIFT (§8.1, числа из примера документа один в один) --------------------------------------
(() => {
  const va = glVa(1), ra = glRa(1);
  const dims = { va: va.id, vaCode: va.code, ra: ra.id, raCode: ra.code, clientId: va.client.id, product: "current", channel: "SWIFT" };
  const txn = "TXN-SWIFT-1001";
  glPush({ debit: "2100", credit: "1101", amount: 10000, currency: "EUR", daysAgo: 9, description: "SWIFT — списание суммы перевода (AR-003)", dims, transactionId: txn });
  glPush({ debit: "5100", credit: "1101", amount: 8, currency: "EUR", daysAgo: 9, description: "SWIFT — комиссия банка-корреспондента (AR-005)", dims: { ra: ra.id, raCode: ra.code, channel: "SWIFT" }, transactionId: txn });
  glPush({ debit: "2100", credit: "4120", amount: 25, currency: "EUR", daysAgo: 9, description: "SWIFT — комиссия платформы (AR-004)", dims, transactionId: txn });
})();

// ---- 4. Внутренний перевод (VA → VA, один и тот же GL-счёт 2100, активы не двигаются) ------------------------
(() => {
  const from = glVa(0), to = glVa(4);
  const txn = "TXN-INT-2001";
  glPush({ debit: "2100", credit: "2100", amount: 200, currency: "EUR", daysAgo: 4, description: `Internal transfer ${from.code} → ${to.code}`, dims: { va: from.id, vaCode: from.code, clientId: from.client.id, product: "current", channel: "Internal" }, transactionId: txn });
})();

// ---- 5. FX Trade (§8.3, числа из примера документа) -----------------------------------------------------------
(() => {
  const va = glVa(2);
  const txn = "TXN-FX-3001";
  const dimsEur = { va: va.id, vaCode: va.code, clientId: va.client.id, product: "fx", channel: "Internal" };
  glPush({ debit: "2100", credit: "1401", amount: 1000, currency: "EUR", daysAgo: 3, description: "FX — списание EUR с клиента (AR-007)", dims: dimsEur, transactionId: txn });
  glPush({ debit: "1402", credit: "2100", amount: 870, currency: "GBP", daysAgo: 3, description: "FX — зачисление GBP клиенту (AR-008)", dims: { ...dimsEur, va: va.id }, transactionId: txn });
  glPush({ debit: "2100", credit: "4200", amount: 5, currency: "EUR", daysAgo: 3, description: "FX — комиссия платформы (AR-009)", dims: dimsEur, transactionId: txn });
  // AR-010 "закрытие клиринга" из §8.3 сюда намеренно не добавлена: в её примере закрывающая проводка должна
  // обнулить 1401 (EUR) И 1402 (GBP) одновременно, а у проводки в этой модели одна валюта на обе стороны (как и
  // в самом документе, §4.2 "Сумма"/"Валюта" — по одному полю) — закрыть разновалютный клиринг одной проводкой
  // нельзя без отдельного шага конвертации через реальный Nostro, которого в этом сценарии нет. Поэтому 1401/
  // 1402 после сделки остаются с переносимым остатком — это честнее, чем подогнанная "закрывающая" цифра.
})();

// ---- 6. Кредит: выдача → начисление процентов → погашение (§8.2, числа из примера) ----------------------------
(() => {
  const va = glVa(3);
  const dims = { va: va.id, vaCode: va.code, clientId: va.client.id, product: "credit" };
  glPush({ debit: "1200", credit: "2100", amount: 50000, currency: "EUR", daysAgo: 45, description: "Loan disbursement (AR-011)", dims });
  glPush({ debit: "1300", credit: "4400", amount: 1500, currency: "EUR", daysAgo: 15, description: "Interest accrual — monthly (AR-012)", dims });
  glPush({ debit: "2100", credit: "1300", amount: 500, currency: "EUR", daysAgo: 1, description: "Loan repayment — interest (AR-014)", dims });
  glPush({ debit: "2100", credit: "1200", amount: 1000, currency: "EUR", daysAgo: 1, description: "Loan repayment — principal (AR-013)", dims });
})();

// ---- 7. Заморозка / разморозка средств (AML-блокировка) --------------------------------------------------------
(() => {
  const va = glVa(5);
  const dims = { va: va.id, vaCode: va.code, clientId: va.client.id };
  glPush({ debit: "2100", credit: "2200", amount: 1500, currency: "EUR", daysAgo: 20, description: "Funds hold — AML review (AR-015)", dims });
  glPush({ debit: "2200", credit: "2100", amount: 1500, currency: "EUR", daysAgo: 18, description: "Funds release — AML review closed (AR-016)", dims });
})();

// ---- 8. Ежемесячная комиссия за обслуживание ---------------------------------------------------------------
GL_VA_SAMPLE.slice(0, 4).forEach((va, i) => {
  glPush({ debit: "2100", credit: "4300", amount: 4.9, currency: "EUR", daysAgo: 25 + i, description: `Monthly maintenance fee — ${va.code}`, dims: { va: va.id, vaCode: va.code, clientId: va.client.id, product: "current" } });
});

// ---- 9. Непривязанный входящий платёж — Suspense (AR-017) ------------------------------------------------------
glPush({ debit: "1101", credit: "1500", amount: 3000, currency: "EUR", daysAgo: 1, description: "Unmatched incoming SEPA — VA не найден по реквизитам", dims: { ra: glRa(0).id, raCode: glRa(0).code, channel: "SEPA" } });

// ---- 10. Ручные проводки: ниже порога — сразу Posted, выше — Pending (апрув), плюс одна Rejected -------------
(() => {
  const va = glVa(6);
  glPush({
    type: "MANUAL", status: "POSTED", debit: "5500", credit: "1101", amount: 120, currency: "EUR", daysAgo: 2,
    description: "Корректировка: ошибочно учтённая комиссия провайдера", dims: { ra: glRa(0).id, raCode: glRa(0).code },
    supportingDocNote: "Скан счёта провайдера — приложен (заглушка, загрузка файлов не реализована в прототипе)",
  });
  glPush({
    type: "MANUAL", status: "PENDING", debit: "5500", credit: "2100", amount: 18500, currency: "EUR", daysAgo: 0, hoursAgo: 3,
    description: "Начисление компенсации клиенту по инциденту INC-4471", dims: { va: va.id, vaCode: va.code, clientId: va.client.id },
    supportingDocNote: "Решение комитета по инцидентам — приложено (заглушка)",
  });
  glPush({
    type: "MANUAL", status: "REJECTED", debit: "5500", credit: "1103", amount: 9000, currency: "USD", daysAgo: 7,
    description: "Запрошенное списание без достаточного обоснования", dims: { ra: glRa(2).id, raCode: glRa(2).code },
    rejectReason: "Недостаточно подтверждающих документов — отклонено на апруве",
  });
})();

// ---- 11. Пример сторно (Reversal) — ошибочно задвоенный входящий SEPA ------------------------------------------
(() => {
  const va = glVa(7);
  const dims = { va: va.id, vaCode: va.code, clientId: va.client.id, product: "current", channel: "SEPA" };
  const original = glPush({ debit: "1101", credit: "2100", amount: 1800, currency: "EUR", daysAgo: 5, description: `Incoming SEPA — ${va.code} (задвоено)`, dims });
  const reversal = glPush({
    type: "REVERSAL", status: "POSTED", debit: "2100", credit: "1101", amount: 1800, currency: "EUR", daysAgo: 4,
    description: `Сторно: дублирующая проводка ${original.entryId}`, dims, reversalOfId: original.id,
  });
  original.status = "REVERSED";
  original.reversedById = reversal.id;
})();

// ---- 12. Автогенерация из реальных операций ("Операции → Платежи"), через Правила проводок -----------------
// В отличие от сценариев 1–11 выше (придуманы по примерам документа §8), эти проводки строятся из РЕАЛЬНЫХ
// записей OPERATIONS_PAYMENTS_MOCK — закрывает дыру, найденную в разговоре: Главная книга должна зеркалить
// операции, а не жить отдельной выдуманной жизнью. У каждой такой проводки transactionId = реальный код
// операции (`PAY-.../CRY-...`), sourceOperationId = её настоящий id (кликабельная ссылка на карточку платежа,
// см. accounting-gl.js glAccountLink/viewAccountingGlDetail).
//
// Какие счета дебетовать/кредитовать для триггера+валюты+рельса — больше не зашито здесь картами по валюте:
// это теперь данные (ACCOUNTING_RULES, accounting-rules.mock.js), которые ищет arFindRule(trigger, ctx).
// Если для сочетания валюты/рельса подходящего активного правила нет — проводка просто не строится (например,
// RUB/KGS: для них в плане счетов нет счёта-корреспондента, следовательно и правила на них нет — это
// отражается в данных, а не в отдельной отсечке кода). Остаётся зашитым (это не предмет правил, а структура
// самой операции):
//  - только status=SUCCESSFUL — остальные статусы ещё не факт хозяйственной жизни;
//  - внутренний перевод между двумя нашими клиентами без обмена валют (INNER/DEFERRED_INNER) и крипто-перевод
//    между клиентами (CUSTOMER_TRANSFER) — деньги остаются внутри счёта 2100, проводка не нужна вообще —
//    такой операции нет смысла искать правило, это не её триггер.
// Загружается после accounting-rules.mock.js (нужны ACCOUNTING_RULES/arFindRule).

function glVaForClient(clientId) {
  return clientId ? ACCOUNTS_VIRTUAL_MOCK.find((a) => a.client && a.client.id === clientId) || null : null;
}

function glDimsForClient(clientId, channel) {
  const va = glVaForClient(clientId);
  return { ...(va ? { va: va.id, vaCode: va.code, clientId: va.client.id } : {}), channel };
}

// Проводит одну "попытку" через правило: ищет активное правило по триггеру+условиям, и если нашлось —
// создаёт проводку; если нет — молча ничего не делает (честная модель "нет правила — нет проводки").
function glApplyRule(trigger, ctx, common, amount, currency, descriptionSuffix) {
  const rule = arFindRule(trigger, ctx);
  if (!rule) return null;
  return glPush({ ...common, debit: rule.debitAccountCode, credit: rule.creditAccountCode, amount, currency, appliedRuleCode: rule.code, description: `${common.transactionId} — ${descriptionSuffix}` });
}

OPERATIONS_PAYMENTS_MOCK.filter((p) => p.status === "SUCCESSFUL").forEach((p) => {
  const isCrypto = p.paymentSystem === "CRYPTO_WALLET";
  const isExchange = p.sourceCurrency !== p.targetCurrency;
  const isInternalNoFx = PAYMENT_BOTH_INTERNAL_SYSTEMS.includes(p.paymentSystem) && !isExchange;
  if (isInternalNoFx) return;

  const clientId = p.direction === "INCOMING" ? p.recipientClientId : p.senderClientId;
  const dims = glDimsForClient(clientId, p.paymentSystem);
  const common = { effectiveDate: p.createdDate, transactionId: p.code, sourceOperationId: p.id, dims };

  if (isCrypto) {
    if (p.cryptoOperationType === "CUSTOMER_TRANSFER") return;
    const isDeposit = p.cryptoOperationType === "CUSTOMER_DEPOSIT";
    glApplyRule(isDeposit ? "CRYPTO_DEPOSIT" : "CRYPTO_WITHDRAWAL", {}, common, p.sourceAmount, p.sourceCurrency, `крипто-${isDeposit ? "депозит" : "вывод"}`);
    return;
  }

  if (isExchange) {
    glApplyRule("FX_TRADE", { leg: "SOURCE", currency: p.sourceCurrency }, common, p.sourceAmount, p.sourceCurrency, `обмен: списание ${p.sourceCurrency}`);
    glApplyRule("FX_TRADE", { leg: "TARGET", currency: p.targetCurrency }, common, p.targetAmount, p.targetCurrency, `обмен: зачисление ${p.targetCurrency}`);
    if (p.feeAmount) glApplyRule("FX_FEE", { currency: p.feeCurrency }, common, p.feeAmount, p.feeCurrency, "комиссия за обмен");
    return;
  }

  const trigger = p.direction === "INCOMING" ? "PAYMENT_RECEIVED" : "PAYMENT_SENT";
  glApplyRule(trigger, { currency: p.sourceCurrency, rail: p.paymentSystem }, common, p.sourceAmount, p.sourceCurrency, `${p.direction === "INCOMING" ? "входящий" : "исходящий"} платёж (${p.paymentSystem})`);
  if (p.feeAmount) glApplyRule("PAYMENT_FEE", { currency: p.feeCurrency, rail: p.paymentSystem }, common, p.feeAmount, p.feeCurrency, "комиссия платформы");
});

function glById(id) {
  return GL_JOURNAL_ENTRIES.find((e) => e.id === id) || null;
}

// ---- Остатки по валютам из реальных проводок (заменяет прежний выдуманный баланс в Плане счетов) -------------
// Группа — рекурсивно суммирует потомков по каждой валюте отдельно (валюты друг с другом не смешиваются).
function coaBalancesByCurrency(a) {
  if (a.nodeType === "GROUP") {
    const out = {};
    coaChildren(a.code).forEach((c) => {
      const kids = coaBalancesByCurrency(c);
      Object.keys(kids).forEach((cur) => { out[cur] = (out[cur] || 0) + kids[cur]; });
    });
    return out;
  }
  const out = {};
  GL_JOURNAL_ENTRIES.filter((e) => e.status === "POSTED" && (e.debitAccountCode === a.code || e.creditAccountCode === a.code)).forEach((e) => {
    const isDebitSide = e.debitAccountCode === a.code;
    const amtSign = isDebitSide ? 1 : -1;
    const normalFactor = a.normalBalance === "DEBIT" ? 1 : -1;
    out[e.currency] = Math.round(((out[e.currency] || 0) + amtSign * normalFactor * e.amount) * 100) / 100;
  });
  return out;
}

function coaHasNonzeroBalance(a) {
  return Object.values(coaBalancesByCurrency(a)).some((v) => Math.abs(v) > 0.005);
}

function glEntriesForAccount(code) {
  return GL_JOURNAL_ENTRIES.filter((e) => e.debitAccountCode === code || e.creditAccountCode === code);
}
