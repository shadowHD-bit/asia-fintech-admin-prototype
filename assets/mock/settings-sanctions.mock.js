/* ==========================================================================
   Моковые данные для "Настройки системы → Санкционные списки".
   Форма записей — таблицы sanctioned_individuals и sanctioned_companies сервиса
   identity (apps/identity/src/kyc/entities), спецификация:
   docs/settings-sanctions-spec.md.
   Реальное: состав полей и обязательность (у физлица обязательны имя и фамилия
   кириллицей и латиницей; дата рождения хранится тремя числами и может быть
   неполной; у юрлица обязательно только название), формат CSV-импорта (физлица
   10 колонок, юрлица 8, разделитель ";", дата дд.мм.гггг, страна Alpha-3),
   правила нормализации названия и регистрационного номера юрлица,
   сопоставление (порог 0,7 по ФИО, у юрлиц точное совпадение ИНН / ОКПО /
   регистрационного номера, затем название с порогом 0,85), 40 юрлиц.
   Условное: сами записи, ID, даты; число физлиц (в реальности около 1,5 тыс.,
   в моке 120). Несколько записей намеренно совпадают с клиентами из моков
   "Клиенты", чтобы перепроверка давала результат. Должен загружаться после
   clients-users.mock.js и clients-companies.mock.js.
   ========================================================================== */

// Страны мока клиентов (COUNTRY_OPTIONS) с кодом Alpha-3, как в CSV и в текущей админке
const SL_ALPHA3 = { kg: "KGZ", kz: "KAZ", uz: "UZB", tj: "TJK", ru: "RUS", az: "AZE" };
function slCountryByAlpha3(alpha3) {
  const id = Object.keys(SL_ALPHA3).find((k) => SL_ALPHA3[k] === alpha3);
  return id || null;
}

const SL_TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
function slTranslit(value) {
  if (!value) return null;
  const out = value.toLowerCase().split("").map((ch) => (SL_TRANSLIT[ch] !== undefined ? SL_TRANSLIT[ch] : ch)).join("");
  return out.toUpperCase();
}

// Нормализация как в shared/helpers/sanctioned-company-normalize.helper.ts:
// название — lower, ё→е, без кавычек и пунктуации, без ОПФ; регномер — буквы и цифры, upper
const SL_OPF = ["общество с ограниченной ответственностью", "общества с ограниченной ответственностью", "ооо", "осоо", "оао", "зао", "ао", "ип", "llc", "ltd", "филиал"];
function slNormalizeName(value) {
  if (!value) return null;
  let s = value.toLowerCase().replace(/ё/g, "е").replace(/["'«»“”„.,;:()\-_/\\]/g, " ");
  SL_OPF.forEach((opf) => { s = s.replace(new RegExp(`(^|\\s)${opf}(?=\\s|$)`, "g"), " "); });
  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}
function slNormalizeRegNumber(value) {
  if (!value) return null;
  const s = value.replace(/[^0-9A-Za-zА-Яа-я]/g, "").toUpperCase();
  return s || null;
}
function slDigits(value) {
  if (!value) return null;
  const s = value.replace(/\D/g, "");
  return s || null;
}

function slStamp(rec, createdDate, updatedDate) {
  rec.createdDate = createdDate;
  rec.createdAt = formatDateTime(createdDate);
  rec.updatedDate = updatedDate || createdDate;
  rec.updatedAt = formatDateTime(rec.updatedDate);
  return rec;
}

// ---- Физлица --------------------------------------------------------------------------------------
const SL_LAST = ["Рахимов", "Нуралиев", "Каримов", "Пантиев", "Камбаров", "Хамиджанов", "Рахметов", "Махаммадюсупов", "Абдуллаев", "Алиев", "Исмаилов", "Сатыбалдиев", "Жаксыбеков", "Мусаев", "Ташматов", "Эргешов", "Осмонов", "Токтогулов", "Байзаков", "Султанов"];
const SL_FIRST = ["Махмуд", "Азиз", "Эмин", "Ильяс", "Дилшодбек", "Умиджон", "Галим", "Бахтияр", "Руслан", "Тимур", "Азамат", "Данияр", "Марат", "Улан", "Эльдар", "Фаррух", "Сардор", "Жасур", "Нурлан", "Бекзат"];
const SL_MIDDLE = ["Алимжанович", "Кагидинович", "Аладин Оглы", "Салманович", "Абдивалиевич", "Мамадалиевич", "Акисович", "Рахматович", "Иванович", "Тимурович", "Сергеевич", "Маратович"];
const SL_PLACES = {
  kg: [["Ошская обл.", "Ош"], [null, "Кашкар-Кыштак"], ["Чуйская обл.", "Токмок"], [null, "Бишкек"]],
  kz: [["Кызылординская обл.", "Байконур"], ["Алматинская обл.", "Талдыкорган"]],
  ru: [["Республики Дагестан", "Цинит"], ["Республики Дагестан", "Солнечное"], ["Московская обл.", "Химки"]],
  az: [[null, "Баку"]],
  uz: [["Ташкентская обл.", "Чирчик"]],
  tj: [[null, "Душанбе"]],
};
const SL_COUNTRY_POOL = ["kg", "kg", "kg", "kz", "kz", "ru", "ru", "az", "uz", "tj"];

function slMakeIndividual(seed, override) {
  const country = pick(SL_COUNTRY_POOL, seed * 5);
  const place = pick(SL_PLACES[country], seed);
  const lastName = pick(SL_LAST, seed * 7);
  const firstName = pick(SL_FIRST, seed * 3 + 1);
  const middleName = seed % 9 === 0 ? null : pick(SL_MIDDLE, seed * 5);
  const year = 1958 + ((seed * 13) % 45);
  let dob = { day: 1 + ((seed * 7) % 28), month: 1 + ((seed * 5) % 12), year };
  if (seed % 11 === 0) dob = { day: null, month: null, year: null };
  else if (seed % 7 === 0) dob = { day: null, month: null, year };
  else if (seed % 5 === 0) dob = { day: null, month: dob.month, year };
  const createdDate = new Date(MOCK_NOW.getTime() - 12 * 24 * 60 * 60 * 1000);
  const rec = {
    id: seedToPaymentUuid(11000 + seed),
    externalId: String(seed + 1),
    lastName, firstName, middleName,
    lastNameEn: slTranslit(lastName), firstNameEn: slTranslit(firstName), middleNameEn: slTranslit(middleName),
    dobDay: dob.day, dobMonth: dob.month, dobYear: dob.year,
    countryId: seed % 8 === 0 ? null : country,
    state: seed % 8 === 0 ? null : place[0],
    city: seed % 8 === 0 ? null : place[1],
  };
  return slStamp(Object.assign(rec, override || {}), createdDate, createdDate);
}

const SANCTION_INDIVIDUALS = Array.from({ length: 120 }).map((_, i) => slMakeIndividual(i + 1));
// Записи, совпадающие с клиентами мока "Клиенты → Пользователи" (по ФИО)
[3, 8, 14, 21].forEach((userIdx, n) => {
  const u = CLIENTS_USERS_MOCK[userIdx];
  const rec = SANCTION_INDIVIDUALS[10 + n * 17];
  Object.assign(rec, {
    lastName: u.lastName, firstName: u.firstName, middleName: u.middleName || null,
    lastNameEn: slTranslit(u.lastName), firstNameEn: slTranslit(u.firstName), middleNameEn: slTranslit(u.middleName || null),
  });
});
// Несколько записей добавлены вручную позже импорта (без внешнего ID)
[0, 1, 2].forEach((k) => {
  const rec = SANCTION_INDIVIDUALS[k];
  rec.externalId = null;
  slStamp(rec, new Date(MOCK_NOW.getTime() - (2 + k) * 24 * 60 * 60 * 1000 - 3 * 3600 * 1000), new Date(MOCK_NOW.getTime() - (2 + k) * 24 * 60 * 60 * 1000));
});
SANCTION_INDIVIDUALS.sort((a, b) => b.createdDate - a.createdDate);

// ---- Юрлица ------------------------------------------------------------------------------------------
const SL_COMPANY_STEMS = ["Марин Бункер", "КейДжи ИМПЭКС", "Азия Трейд", "Алатау Строй", "Нур Логистик", "Эгемен Групп", "Кум-Дарья", "Тянь-Шань Ресурс", "Иссык-Куль Тур", "Ала-Бука Агро", "Манас Инвест", "Бишкек Транзит", "Сары-Арка", "Каракол Металл", "Чуй Продукт", "Ата-Мекен Фуд", "Эркин Тоо", "Мега Кредит", "Форум Плюс", "Санжар Сервис"];
const SL_OPF_LABELS = ["Общество с ограниченной ответственностью", "ОсОО", "Общество с ограниченной ответственностью", "Филиал общества с ограниченной ответственностью"];
const SL_REG_SUFFIX = ["ООО", "ООО", "ООО", "Ф-л", "ООО"];
const SL_ADDRESSES = ["БИШКЕК, ЛЕНИНСКИЙ Р-Н, УЛ. ТОКТОГУЛА", "БИШКЕК, ПЕРВОМАЙСКИЙ Р-Н, УЛ. ЖИБЕК ЖОЛУ", "БИШКЕК, ОКТЯБРЬСКИЙ Р-Н, ПР. МИРА", "ЧУЙСКАЯ ОБЛАСТЬ, ЫСЫК-АТИНСКИЙ Р-Н", "ОШ, УЛ. ЛЕНИНА"];
const SL_ACTIVITY = ["07.29.9", "46.12.0", "46.90.0", "46.71.9", "64.99.0", "68.20.0", "47.19.0"];
const SL_FOUNDERS = ["Эшикулов Алмарсбек Беккулович", "Асанкулов Тимур Самсалиевич", "Шамшидинов Равшан Фарходович", "Калмырзаев Нурбол Русланович", "Розенберг Даниэль", "Румянов Вусал Багифович", "Арпеков Марс Рамисович", "Чолпонкулов Медер Сырымбекович"];

function slMakeCompany(seed, override) {
  const stem = pick(SL_COMPANY_STEMS, seed * 3);
  const opf = pick(SL_OPF_LABELS, seed);
  const onlyReg = seed % 9 === 0; // у филиалов иностранных компаний только регистрационный номер
  const onlyTin = seed % 7 === 0; // у части записей только ИНН
  const foreign = seed % 10 === 0;
  const createdDate = new Date(MOCK_NOW.getTime() - 12 * 24 * 60 * 60 * 1000);
  const rec = {
    id: seedToPaymentUuid(12000 + seed),
    externalId: String(seed + 1),
    name: `${opf} "${stem}"`,
    nameEn: seed % 4 === 0 ? `LLC ${slTranslit(stem)}` : null,
    registrationNumber: onlyTin ? null : `${190000 + seed * 137}-3301-${pick(SL_REG_SUFFIX, seed)}`,
    tin: onlyReg ? null : foreign ? String(2400000 + seed * 811) : String(2400000000000 + seed * 1234567).padStart(14, "0"),
    okpo: onlyReg || onlyTin ? null : String(27000000 + seed * 90123),
    countryId: foreign ? pick(["ru", "kz"], seed) : "kg",
    founderFullName: onlyReg || onlyTin ? null : pick(SL_FOUNDERS, seed),
    activityCode: onlyReg || onlyTin ? null : pick(SL_ACTIVITY, seed),
    address: onlyReg || onlyTin ? null : pick(SL_ADDRESSES, seed * 3),
  };
  return slStamp(Object.assign(rec, override || {}), createdDate, createdDate);
}
function slRecomputeCompany(rec) {
  rec.nameNormalized = slNormalizeName(rec.name);
  rec.registrationNumberNormalized = slNormalizeRegNumber(rec.registrationNumber);
  return rec;
}

const SANCTION_COMPANIES = Array.from({ length: 40 }).map((_, i) => slMakeCompany(i + 1));
// Записи, совпадающие с компаниями мока "Клиенты → Компании": по регистрационному номеру и по названию
(function plantCompanyMatches() {
  const withReg = CLIENTS_COMPANIES_MOCK.filter((c) => c.registrationNumber);
  [[withReg[0], 4], [withReg[1], 12]].forEach(([c, idx]) => {
    Object.assign(SANCTION_COMPANIES[idx], { registrationNumber: c.registrationNumber, name: `ОсОО "${c.name}"` });
  });
  const c = CLIENTS_COMPANIES_MOCK[2];
  Object.assign(SANCTION_COMPANIES[20], { name: c.name, registrationNumber: null, tin: null, okpo: null });
})();
SANCTION_COMPANIES.forEach(slRecomputeCompany);
[0, 1].forEach((k) => {
  SANCTION_COMPANIES[k].externalId = null;
  slStamp(SANCTION_COMPANIES[k], new Date(MOCK_NOW.getTime() - (k + 1) * 24 * 60 * 60 * 1000 - 5 * 3600 * 1000));
});
SANCTION_COMPANIES.sort((a, b) => b.createdDate - a.createdDate);

// ---- Перепроверка: сопоставление клиентов со списками ------------------------------------------------------------
const SL_FIO_THRESHOLD_NOTE = 0.7;

function slFio(rec) {
  return [rec.lastName, rec.firstName, rec.middleName].filter(Boolean).join(" ").toLowerCase();
}

// Возвращает { checked, matches[] }; в макете статусы клиентов не меняются
function slRerunIndividuals() {
  const matches = [];
  CLIENTS_USERS_MOCK.forEach((u) => {
    const fio = [u.lastName, u.firstName, u.middleName].filter(Boolean).join(" ").toLowerCase();
    const rec = SANCTION_INDIVIDUALS.find((r) => slFio(r) === fio);
    if (rec) matches.push({ client: u.fullName, link: `#/clients-users/${u.id}`, recordId: rec.id, matchedBy: "FIO" });
  });
  return { checked: CLIENTS_USERS_MOCK.length, matches };
}

function slRerunCompanies() {
  const matches = [];
  CLIENTS_COMPANIES_MOCK.forEach((c) => {
    const reg = slNormalizeRegNumber(c.registrationNumber);
    const name = slNormalizeName(c.name);
    let by = null;
    let rec = reg ? SANCTION_COMPANIES.find((r) => r.registrationNumberNormalized === reg) : null;
    if (rec) by = "REGISTRATION_NUMBER";
    else {
      rec = SANCTION_COMPANIES.find((r) => r.nameNormalized === name && (!r.registrationNumberNormalized || !reg) && !r.tin && !r.okpo);
      if (rec) by = "NAME";
    }
    if (rec) matches.push({ client: c.name, link: `#/clients-companies/${c.id}`, recordId: rec.id, matchedBy: by });
  });
  return { checked: CLIENTS_COMPANIES_MOCK.length, matches };
}
