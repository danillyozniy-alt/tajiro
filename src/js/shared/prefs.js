/* ==========================================================================
   tajiro — язык и валюта

   Один переключатель на два выбора. В шапке он висит короткой надписью
   «EN · AED», сам выбор лежит в панели; ниже 901 то же самое стоит строкой
   аккордеона в мобильном листе.

   Копий разметки ДВЕ — панель и лист, — поэтому скрипт не ищет «свой»
   элемент, а работает со всеми сразу: кнопки собираются по data-атрибутам,
   надписи обновляются у всех [data-prefs-label]. Иначе в меню осталась бы
   одна валюта, а в шапке другая.

   ЯЗЫК. Переводов на странице пока нет — переключатель ставит только
   атрибут lang у документа и запоминает нажатую кнопку. Направление письма
   не трогаем намеренно: развернуть вёрстку справа налево с английским
   текстом значит показать поломку вместо перевода. Когда тексты появятся,
   сюда добавляется строка с dir и подстановка строк.

   ВАЛЮТА. Пересчитывается всё, что зависит от рынка:
     [data-sub]    цена подписки за месяц; ровная по рынкам, НЕ считается
                   по курсу: 149 в дирхамах, риалах и риялах, 19 в динарах
                   и оманских риалах. Те же цифры лежат в
                   js/checkout/market.js — при правке менять оба места.
     [data-range]  диапазон цен каталога
     [data-week]   выручка за неделю в демо-панели
     [data-usd]    ценник товара; в атрибуте лежит цена в долларах,
                   остальное считается по курсу

   Статистика ($480B) остаётся в долларах намеренно: это размер рынка из
   отчёта, а не цена, и переводить его по курсу нечего.

   Скрипт общий, а не страничный. На странице без помеченных цен он просто
   ничего не находит — и новая страница получает рабочий переключатель, как
   только проставит атрибуты.
   ========================================================================== */
(function () {
  'use strict';

  /* --- Рынки ---------------------------------------------------------------- */
  var CUR   = {AE:'AED', SA:'SAR', QA:'QAR', BH:'BHD', OM:'OMR', KW:'KWD'};
  var SUB   = {AE:'AED 149', SA:'SAR 149', QA:'QAR 149', BH:'BHD 19', OM:'OMR 19', KW:'KWD 19'};
  var RATE  = {AE:3.6725, SA:3.75, QA:3.64, BH:0.376, OM:0.3845, KW:0.3065};
  var RANGE = {AE:'AED 26–3,669', SA:'SAR 26–3,746', QA:'QAR 26–3,636', BH:'BHD 3–376', OM:'OMR 3–384', KW:'KWD 2–306'};
  var WEEK  = {AE:'AED 6,760', SA:'SAR 6,900', QA:'QAR 6,700', BH:'BHD 692', OM:'OMR 707', KW:'KWD 564'};

  var LANG = {en: 'EN', ar: 'AR'};

  var all = function (sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  };

  var marketBtns = all('[data-market]');
  var langBtns   = all('[data-lang]');
  var labels     = all('[data-prefs-label]');
  if (!marketBtns.length && !langBtns.length) return;

  var market = 'AE';
  var lang   = 'en';

  /* Динары и риал делятся примерно на три: товар за $8 выходит меньше трёх
     единиц, и без десятой доли все дешёвые ценники схлопывались в «3».
     У кувейтского динара разрыв ещё больше — тот же товар меньше трёх. */
  function money(usd, cur) {
    var x = usd * RATE[market];
    if (cur === 'BHD' || cur === 'OMR' || cur === 'KWD') return (Math.round(x * 10) / 10).toString();
    return Math.round(x).toString();
  }

  function fill(sel, value) {
    all(sel).forEach(function (e) { e.textContent = value; });
  }

  /* Надпись в баре и в строке аккордеона: текущий язык и текущая валюта */
  function paintLabel() {
    labels.forEach(function (e) {
      e.textContent = LANG[lang] + ' · ' + CUR[market];
    });
  }

  /* Нажатой отмечается ровно одна кнопка в каждой копии разметки */
  function paintPressed(btns, attr, value) {
    btns.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute(attr) === value ? 'true' : 'false');
    });
  }

  function applyMarket(code) {
    if (!CUR[code]) return;
    market = code;

    fill('[data-sub]', SUB[market]);
    fill('[data-range]', RANGE[market]);
    fill('[data-week]', WEEK[market]);

    all('[data-usd]').forEach(function (e) {
      e.textContent = CUR[market] + ' ' + money(parseFloat(e.getAttribute('data-usd')), CUR[market]);
    });

    paintPressed(marketBtns, 'data-market', market);
    paintLabel();
  }

  function applyLang(code) {
    if (!LANG[code]) return;
    lang = code;
    document.documentElement.setAttribute('lang', lang);
    paintPressed(langBtns, 'data-lang', lang);
    paintLabel();
  }

  marketBtns.forEach(function (b) {
    b.addEventListener('click', function () { applyMarket(b.getAttribute('data-market')); });
  });

  langBtns.forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
  });

  /* Стартовое состояние проставляем сами, а не полагаемся на разметку:
     значения в атрибутах aria-pressed — это то, что видит человек до
     загрузки скрипта, и держать их в двух местах верными вручную нельзя. */
  applyMarket(market);
  applyLang(lang);
})();
