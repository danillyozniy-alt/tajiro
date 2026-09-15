/* ==========================================================================
   tajiro — поток заказов в витрине (секция 06)
   Пара к блокам «Лента заказов» и «Панель магазина» в css/06-pillar-store.css.

   Устроено по принципу экомзи: это не карусель из четырёх зашитых плашек,
   а поток событий. Пришёл заказ — и он один двигает сразу всё: плашку,
   счётчик корзины, выручку каталога и число заказов за месяц.

   Разница принципиальная. Раньше плашки крутились по своему циклу, а
   цифры рядом — по своему; совпадение периодов держалось на честном слове,
   и «+$29» не имел никакого отношения к сумме справа. Теперь имеет.
   ========================================================================== */
(function () {
  'use strict';

  var ctr = document.getElementById('s06-toasts');
  if (!ctr) return;

  var revenueE = document.getElementById('s06-revenue');
  var loadedE  = document.getElementById('s06-loaded');
  var phone    = ctr.closest('.s-06__stage');
  var iconProto = document.getElementById('s06-toast-icon');
  var grid      = document.querySelector('.s-06__lattice-grid');

  var still = window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Товары — из каталога, который секция и продаёт */
  var PRODUCTS = [
    'New Puppy Checklist',
    'Medical Bill Audit Kit',
    'Focus Planner',
    'Budget Reset Planner',
    'Sleep Better Guide',
    'Meal Prep Checklist',
    'Morning Routine Quiz',
    'Focus Planner'
  ];

  /* У каждого города своя сторона, и она за ним закреплена: волна приходит
     оттуда же, что и город в уведомлении. Случайное направление выглядело
     несвязанным ни с чем — а связь тут и есть весь смысл.

     Углы разведены по кругу, а не взяты по настоящим азимутам: почти все
     эти города лежат от Залива на запад, и по азимутам волна всегда шла бы
     с одной стороны. Важно, что сторона у города постоянная. */
  var CITIES = [
    { name: 'Doha',        a: 200 },
    { name: 'Riyadh',      a: 236 },
    { name: 'Dubai',       a: 272 },
    { name: 'Jeddah',      a: 308 },
    { name: 'Abu Dhabi',   a: 344 },
    { name: 'Kuwait City', a: 20 },
    { name: 'Manama',      a: 56 },
    { name: 'Muscat',      a: 92 },
    { name: 'Sharjah',     a: 128 },
    { name: 'Dammam',      a: 164 }
  ];

  var revenue = 2340;
  var loaded  = 100;

  /* Свой генератор вместо Math.random: последовательность заказов одинакова
     от загрузки к загрузке — секцию можно сравнивать по скриншотам. */
  var seed = 21;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }

  function money(n) { return '$' + n.toLocaleString('en-US'); }

  /* Счётчик доезжает до нового значения, а не подменяется: подмена читается
     как опечатка, движение — как приход денег. */
  function countTo(el, from, to, dur, fmt) {
    if (!el) return;
    if (still) { el.textContent = fmt(to); return; }

    var t0 = null;
    function tick(now) {
      if (t0 === null) t0 = now;
      var p = Math.min((now - t0) / dur, 1);
      var ease = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * ease));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* --- Решётка гириха ----------------------------------------------------
     Ромб взят из фирменного паттерна первого экрана: половина диагонали 45,
     шаг 90 по горизонтали, ряды через 45 со сдвигом — та же кладка.

     Расстояние от центра пишем каждому ромбу в --d сразу: волна потом
     собирается из одной CSS-анимации на всех, без вычислений на кадре. */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var HALF = 45, CENTER = 450;

  var cells = [];

  function buildLattice() {
    if (!grid) return;

    var frag = document.createDocumentFragment();

    for (var row = 0, y = 0; y <= 900; y += HALF, row++) {
      var shift = (row % 2) ? HALF : 0;
      for (var x = -HALF; x <= 900 + HALF; x += HALF * 2) {
        var cx = x + shift, cy = y;
        var dx = cx - CENTER, dy = cy - CENTER;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 470) continue;          /* за маской ромбы всё равно не видны */

        var d = document.createElementNS(SVG_NS, 'path');
        d.setAttribute('class', 's-06__diamond');
        d.setAttribute('d', 'M' + (cx + HALF) + ' ' + cy +
                            'L' + cx + ' ' + (cy - HALF) +
                            'L' + (cx - HALF) + ' ' + cy +
                            'L' + cx + ' ' + (cy + HALF) + 'Z');
        frag.appendChild(d);
        cells.push({ el: d, x: dx, y: dy });
      }
    }

    grid.appendChild(frag);
  }

  /* Волна идёт снаружи внутрь, с той стороны, откуда пришёл заказ.

     Задержка ромба — его проекция на направление прилёта: чем дальше он
     против хода волны, тем позже вспыхнет. Отсюда ровный фронт полосой,
     а не кольцо во все стороны.

     Направление приходит от города из уведомления — см. CITIES. */
  var SPREAD = 1.9;   /* мс на единицу пути: определяет скорость фронта */

  function ripple(deg) {
    if (!grid || still || !cells.length) return;

    var a = deg * Math.PI / 180;
    var ux = Math.cos(a), uy = Math.sin(a);

    /* Дальняя точка по направлению прилёта — от неё отсчитываются задержки */
    var max = 0;
    for (var i = 0; i < cells.length; i++) {
      var proj = cells[i].x * ux + cells[i].y * uy;
      cells[i].p = proj;
      if (proj > max) max = proj;
    }

    for (var j = 0; j < cells.length; j++) {
      cells[j].el.style.setProperty('--d', Math.round((max - cells[j].p) * SPREAD));
    }

    grid.classList.remove('is-rippling');
    void grid.getBoundingClientRect().width;   /* без пересчёта стиля анимация не перезапустится */
    grid.classList.add('is-rippling');
  }

  buildLattice();

  /* --- Искры -------------------------------------------------------------
     Между заказами решётка стояла: волна привязана к событию, а событие
     редкое. Искры идут своим тактом, несколько раз в секунду по паре
     случайных ромбов — фон живёт постоянно, а волна остаётся событием.

     Класс снимаем по окончании самой анимации, а не по таймеру: таймер
     разъезжается с длительностью, и ромб залипал бы подсвеченным. */
  var sparkTimer = null;

  function spark() {
    if (!cells.length) return;

    var n = 2 + Math.floor(rnd() * 3);   /* 2-4 разом: одиночная плитка теряется в решётке */
    for (var i = 0; i < n; i++) {
      var d = cells[Math.floor(rnd() * cells.length)].el;
      if (d.classList.contains('is-spark')) continue;
      d.classList.add('is-spark');
      d.addEventListener('animationend', function () {
        this.classList.remove('is-spark');
      }, { once: true });
    }

    sparkTimer = setTimeout(spark, 430 + rnd() * 640);
  }

  /* Фронт волны доходит до корпуса примерно за секунду — на столько плашка
     и отстаёт. Порядок обязан быть причинным: заказ прилетает, попадает в
     магазин, и только потом появляется уведомление о нём. Одновременно —
     и связь между ними уже не читается. */
  var ARRIVAL = 600;

  function sale() {
    var product = pick(PRODUCTS);
    var city    = pick(CITIES);
    var amount  = Math.round(9 + rnd() * 50);

    ripple(city.a);
    setTimeout(function () { deliver(product, city.name, amount); }, ARRIVAL);
    schedule();
  }

  /* --- Стопка плашек -------------------------------------------------------
     Копим две. Одна плашка читалась разовым всплытием: пришла, ушла, экран
     пустой. Две — это уже лента, по ней видно, что заказы идут потоком.

     Больше двух не берём: на плашку с зазором уходит около полусотни
     пикселей, а свободного низа у экрана всего четверть высоты — третья
     полезла бы на кнопку витрины.

     Массив от свежей к старой: у свежей место 0, она внизу. */
  var STACK = 2;
  var GAP = 7;
  var live = [];

  function restack() {
    if (!live.length) return;
    /* Складываем реальные высоты, а не умножаем одну на всех: высота
       зависит от содержимого и от того, какой шрифт успел подгрузиться.
       С одной высотой на всех плашки наезжали бы друг на друга, стоило
       одной из них отличиться хоть на пиксель. */
    var y = 0;
    for (var i = 0; i < live.length; i++) {
      live[i].style.setProperty('--y', (-y) + 'px');
      y += live[i].offsetHeight + GAP;
    }
  }

  function retire(toast) {
    var k = live.indexOf(toast);
    if (k < 0) return;              /* уже уходит */
    live.splice(k, 1);
    toast.classList.add('is-leaving');
    setTimeout(function () { toast.remove(); }, 420);
    restack();
  }

  function deliver(product, city, amount) {

    /* --- плашка --- */
    var toast = el('div', 's-06__toast');

    var icon = el('span', 's-06__toast-icon');
    if (iconProto) {
      /* Клон образца из разметки, а не новый <img> с путём строкой: путь
         внутри скрипта сборка не находит и в цельный файл не вшивает. */
      var img = iconProto.cloneNode(false);
      img.removeAttribute('id');
      img.removeAttribute('hidden');
      img.className = '';
      icon.appendChild(img);
    }

    var copy = el('span', 's-06__toast-copy');
    copy.appendChild(el('span', 's-06__toast-title', 'New order from ' + city));
    copy.appendChild(el('span', 's-06__toast-sub', product));

    toast.appendChild(icon);
    toast.appendChild(copy);
    /* Плюс отдельным span-ом: цифры набираются «Tajiro Figures», а в этой
       подрезанной гарнитуре знак нарисован узким и с высокой перекладиной —
       на экране он читается перевёрнутым крестом. Шрифт нужен цифрам, не
       знаку. */
    var sum = el('span', 's-06__toast-amount');
    sum.appendChild(el('span', 's-06__toast-sign', '+'));
    sum.appendChild(document.createTextNode(money(amount) + '.00'));
    toast.appendChild(sum);

    ctr.appendChild(toast);
    live.unshift(toast);

    /* Лишнюю вытесняем ДО раскладки. Наоборот было нельзя: раскладка успевала
       поставить её на третью полку, и гасла она уже поверх кнопки витрины —
       на 83 пикселя выше, чем ей положено. Теперь она остаётся там, где
       стояла, и на её место въезжает соседняя. */
    while (live.length > STACK) retire(live[live.length - 1]);

    restack();

    /* Снимаем анимацию въезда, как только она отыграла: пока она висит с
       fill-mode both, её последний кадр перебивает базовый transform, и
       плашка не смогла бы подняться, когда под неё придёт следующая. */
    toast.addEventListener('animationend', function settled(e) {
      if (e.animationName !== 's06-toast-in') return;
      toast.removeEventListener('animationend', settled);
      toast.classList.add('is-settled');
    });

    /* Заказы идут раз в 1,7–3,2 с, так что при жизни в 5,2 с на экране почти
       всегда две плашки. Соотношение важнее самих чисел: ускоряя поток, срок
       жизни надо ускорять во столько же раз, иначе плашки начнут копиться.
       Срок нужен на случай, когда поток встал: одинокая плашка не должна
       висеть вечно.

       Уход отдельным классом, а не удалением: иначе плашка исчезает рывком. */
    setTimeout(function () { retire(toast); }, 7400);

    /* --- показатели --- */
    /* Плашка выручки уступила место домену — счётчик остался только
       у числа товаров. */
    if (revenueE) countTo(revenueE, revenue, revenue + amount, 420, money);
    countTo(loadedE, loaded, loaded + 1, 320, String);
    revenue += amount;
    loaded += 1;
  }

  /* --- Расписание ----------------------------------------------------------
     Поток идёт, только пока витрина в кадре: за кадром это таймеры и
     перерисовки впустую, а на телефоне ещё и батарея. */
  var timer = null, running = false;

  function schedule() {
    clearTimeout(timer);
    if (!running) return;
    timer = setTimeout(sale, 3400 + rnd() * 2600);
  }

  function start() {
    if (running) return;
    running = true;
    timer = setTimeout(sale, 1200);
    if (!still && !sparkTimer) spark();
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    clearTimeout(sparkTimer);
    sparkTimer = null;
  }

  if (!phone || !('IntersectionObserver' in window)) { start(); return; }

  new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting) start();
    else stop();
  }, { threshold: 0.2 }).observe(phone);
})();
