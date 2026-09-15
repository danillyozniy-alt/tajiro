/* ==========================================================================
   tajiro — едущая лента товаров

   Один скрипт на две страницы: каталог в 07 главной и полка в 03
   фрибейсика. Раньше жил в js/home/07-products.js и знал классы своей
   секции; со второй страницей переехал сюда и знает только data-атрибуты.

   Ход ленты делает CSS — у каждой полки свои keyframes, потому что шагов у
   них разное число. Скрипту остаётся одно: понять, какая строка сейчас в
   полосе фокуса, и подсветить её вместе с отзывом, если отзывы есть.

   Индекс берётся из ФАКТИЧЕСКОГО положения ленты, а не из своего таймера.
   Таймер и CSS-анимация живут по разным часам и за несколько минут
   расходятся: подсветка уезжала бы со строки, а реплика — с товаром.

   РАЗМЕТКА
     [data-roll]                окно с overflow: hidden
       [data-roll-track]          дорожка, на ней анимация
         [data-roll-list]           набор строк; скрипт клонирует его
           [data-roll-row] …          строки
     [data-roll-proof] …        необязательные реплики вне окна

   ПАРАМЕТРЫ на окне
     data-roll-focus   индекс строки, стоящей в полосе (по умолчанию 0)
     data-roll-clones  сколько копий набора добавить (по умолчанию 2)
   ========================================================================== */
(function () {
  'use strict';

  var wins = document.querySelectorAll('[data-roll]');
  if (!wins.length) return;

  var still = window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  Array.prototype.forEach.call(wins, function (win) { setup(win); });

  function setup(win) {
    var track = win.querySelector('[data-roll-track]');
    var list  = win.querySelector('[data-roll-list]');
    if (!track || !list) return;

    var focusIndex = parseFloat(win.getAttribute('data-roll-focus')) || 0;
    var copies     = parseInt(win.getAttribute('data-roll-clones'), 10);
    if (isNaN(copies)) copies = 2;

  /* Копии набора для бесшовной петли. Делаются здесь, а не в разметке: в
     цельном файле дубли вшили бы те же картинки повторно.

     Копий по умолчанию две, а не одна. Такт уводит ленту ровно на один
     набор, и при одной копии последние кадры ленты пустые — она доезжает
     до конца и обрывается. Условие простое: строк должно быть не меньше,
     чем конец хода плюс высота окна.

     Клоны скрыты от скринридера: тот же список читался бы несколько раз. */
    for (var c = 0; c < copies; c++) {
      var clone = list.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }
    track.classList.add('is-live');

    var rows = Array.prototype.slice.call(win.querySelectorAll('[data-roll-row]'));
    if (!rows.length) return;

    var proofs = [];
    var section = win.closest('section');
    if (section) {
      proofs = Array.prototype.slice.call(section.querySelectorAll('[data-roll-proof]'));
    }

    var COUNT = rows.length / (copies + 1);   /* строк в одном наборе */
    var cur = -1;

    /* Шаг ленты замером, а не числом в стилях.

       У каталога главной строка фиксированной высоты (56 миниатюра плюс
       поля), и шаг там честно выписан в CSS. У полки фрибейсика карточка
       тянется за содержимым: описание в узкой колонке ложится в четыре
       строки, в широкой — в две, и высота гуляет от 145 до двухсот с
       лишним. Зашитый шаг там означал бы, что лента промахивается мимо
       карточки на всех ширинах, кроме одной.

       Поэтому меряем и кладём в --roll-step и --roll-card на самом окне.
       Тот, кому это не нужно, переменные просто не читает. */
    function measure() {
      var h = rows[0].getBoundingClientRect().height;
      if (!h) return;
      var gap = parseFloat(getComputedStyle(track).rowGap) || 0;
      win.style.setProperty('--roll-card', h + 'px');
      win.style.setProperty('--roll-step', (h + gap) + 'px');
    }

    measure();

    if ('ResizeObserver' in window) {
      new ResizeObserver(measure).observe(win);
    } else {
      window.addEventListener('resize', measure);
    }

    /* Какая строка сейчас пересекает полосу фокуса.

       Считаем не по времени, а по геометрии: берём центр полосы и ищем
       строку, которая его накрывает. Так ответ верен при любом состоянии
       анимации — включая паузу, ускорение вкладки и возврат из фона. */
    function focused() {
      var band = win.getBoundingClientRect();
      var h = rows[0].getBoundingClientRect().height;
      if (!h) return -1;
      var y = band.top + h * focusIndex + h / 2;

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (y >= r.top && y < r.bottom) return i % COUNT;
      }
      return -1;
    }

    function sync() {
      var i = focused();
      if (i < 0 || i === cur) return;
      cur = i;

      /* Подсвечиваем все копии строки: какая из них сейчас в полосе —
         вопрос фазы, а выглядеть они обязаны одинаково. */
      for (var k = 0; k < rows.length; k++) {
        rows[k].classList.toggle('is-focus', k % COUNT === i);
      }

      for (var p = 0; p < proofs.length; p++) {
        proofs[p].classList.toggle('is-shown', p === i);
      }
    }

    /* --- Ход -------------------------------------------------------------
       Лента крутится только пока секция в кадре: за кадром это перерисовки
       впустую, а на телефоне ещё и батарея. */
    var raf = null;

    function loop() {
      sync();
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (raf) return;
      track.style.animationPlayState = 'running';
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      track.style.animationPlayState = 'paused';
    }

    sync();   /* первый кадр размечаем всегда, даже при reduced-motion */

    if (still || !('IntersectionObserver' in window)) return;

    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start();
      else stop();
    }, { threshold: 0.15 }).observe(win);
  }
})();
