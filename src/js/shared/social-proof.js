/* ==========================================================================
   09 · Отзывы — бесконечная лента и точки

   Листание делает сам браузер: у ленты scroll-snap, палец работает точнее
   любого скрипта. Скрипт отвечает за три вещи — закольцевать ленту,
   нарисовать точки и держать активную в согласии с прокруткой.

   КАК ЗАКОЛЬЦОВАНО. Нативную прокрутку нельзя «продолжить» за последний
   элемент, поэтому набор карточек утраивается: копия, оригинал, копия.
   Лента стоит на середине, и когда прокрутка уходит за границу среднего
   блока, положение сдвигается ровно на его ширину. Содержимое по обе
   стороны одинаковое, поэтому подмена не видна.

   Сдвиг делается не во время жеста, а когда прокрутка успокоилась: если
   двигать scrollLeft на инерции, айфон эту инерцию обрывает. Пока палец
   ведёт, человек видит копию — она неотличима от оригинала.

   ВЫШЕ 600 карточки встают сеткой. Копии там были бы лишними плитками,
   поэтому на этом пороге они убираются, а на обратном — создаются заново.
   ========================================================================== */
(function () {
  'use strict';

  var track = document.getElementById('s09-track');
  var dotsEl = document.getElementById('s09-dots');
  if (!track || !dotsEl) return;

  var originals = Array.prototype.slice.call(track.querySelectorAll('.s-09__card'));
  var count = originals.length;
  if (count < 2) return;

  var clones = [];
  var dots = [];
  var looped = false;
  var current = -1;

  /* --- Точки --------------------------------------------------------------
     Их всегда столько, сколько настоящих карточек: копии в счёт не идут. */
  originals.forEach(function (card, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 's-09__dot';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', 'Story ' + (i + 1) + ' of ' + count);
    b.addEventListener('click', function () { goTo(i); });
    dotsEl.appendChild(b);
    dots.push(b);
  });

  /* --- Кольцо -------------------------------------------------------------
     Копии помечены aria-hidden и вынуты из обхода табом: для человека с
     клавиатурой и для чтения с экрана отзывов по-прежнему четыре. */
  function makeClone(card) {
    var c = card.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    c.classList.add('is-clone');
    Array.prototype.forEach.call(c.querySelectorAll('a, button'), function (el) {
      el.setAttribute('tabindex', '-1');
    });
    clones.push(c);
    return c;
  }

  function buildLoop() {
    if (looped) return;
    var before = document.createDocumentFragment();
    var after = document.createDocumentFragment();
    originals.forEach(function (card) { before.appendChild(makeClone(card)); });
    originals.forEach(function (card) { after.appendChild(makeClone(card)); });
    track.insertBefore(before, originals[0]);
    track.appendChild(after);
    looped = true;
    /* Встаём на середину — на первую настоящую карточку */
    track.scrollLeft = originals[0].offsetLeft - track.offsetLeft;
  }

  function dropLoop() {
    if (!looped) return;
    clones.forEach(function (c) { c.remove(); });
    clones = [];
    looped = false;
  }

  /* Ширина одного набора: от первой настоящей карточки до первой карточки
     следующего набора. Считается каждый раз заново — при повороте экрана
     карточки меняют ширину. */
  function blockWidth() {
    var after = clones[count];               /* первая копия ПОСЛЕ оригиналов */
    if (!after) return 0;
    return after.offsetLeft - originals[0].offsetLeft;
  }

  function rebase() {
    if (!looped) return;
    var w = blockWidth();
    if (w <= 0) return;
    var first = originals[0].offsetLeft - track.offsetLeft;
    var x = track.scrollLeft;
    if (x < first - w * 0.5)       track.scrollLeft = x + w;
    else if (x > first + w * 0.5)  track.scrollLeft = x - w;
  }

  function goTo(i) {
    var card = originals[i];
    track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  }

  /* --- Активная точка ------------------------------------------------------
     Активна карточка, чей левый край ближе всего к левому краю ленты.
     Считаем по расстоянию, а не по попаданию в диапазон: при прилипании
     промежуточных положений не бывает, а на инерции бывают. Индекс копии
     сворачивается в индекс оригинала по остатку. */
  function sync() {
    var all = looped ? clones.slice(0, count).concat(originals, clones.slice(count)) : originals;
    var x = track.scrollLeft, best = 0, min = Infinity;
    for (var i = 0; i < all.length; i++) {
      var d = Math.abs(all[i].offsetLeft - track.offsetLeft - x);
      if (d < min) { min = d; best = i; }
    }
    var idx = ((best % count) + count) % count;
    if (idx === current) return;
    current = idx;
    for (var k = 0; k < dots.length; k++) {
      var on = k === idx;
      dots[k].classList.toggle('is-on', on);
      dots[k].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  /* Кадр на прокрутку, а не обработчик на каждое событие: браузер сыплет
     их десятками за жест, а перерисовать точку нужно раз в кадр. */
  var queued = false, settle = null;
  track.addEventListener('scroll', function () {
    if (!queued) {
      queued = true;
      requestAnimationFrame(function () { queued = false; sync(); });
    }
    clearTimeout(settle);
    settle = setTimeout(rebase, 140);
  }, { passive: true });

  /* --- Порог --------------------------------------------------------------- */
  var phone = window.matchMedia('(max-width: 600px)');

  function apply() {
    if (phone.matches) { buildLoop(); } else { dropLoop(); }
    current = -1;
    sync();
  }

  if (phone.addEventListener) phone.addEventListener('change', apply);
  else phone.addListener(apply);

  window.addEventListener('resize', function () { current = -1; sync(); });
  apply();
})();
