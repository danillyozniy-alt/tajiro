/* ==========================================================================
   tajiro — поведение шапки
   Десктоп: выпадающие панели Platform / Resources (клик, Esc, клик мимо).
   Мобилка: полноэкранный лист с аккордеоном, ловушка фокуса, блок прокрутки.
   ========================================================================== */
(function () {
  'use strict';

  var header = document.getElementById('site-header');
  if (!header) return;

  var MOBILE = '(max-width: 900px)';

  /* ---------------------------------------------------------------- утилиты */

  var FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function focusable(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll(FOCUSABLE),
      function (el) { return el.offsetWidth || el.offsetHeight || el.getClientRects().length; }
    );
  }

  /* ------------------------------------------------- десктопные выпадашки */

  var triggers = Array.prototype.slice.call(header.querySelectorAll('.nav__trigger'));

  function panelOf(trigger) {
    return document.getElementById(trigger.getAttribute('aria-controls'));
  }

  function closePanel(trigger) {
    var panel = panelOf(trigger);
    trigger.setAttribute('aria-expanded', 'false');
    if (panel) panel.classList.remove('is-open');
  }

  function closeAllPanels() {
    triggers.forEach(function (t) {
      closePanel(t);
      t.setAttribute('aria-expanded', 'false');
    });
  }

  /* Панель раскрыта средствами CSS — классом не управляем, только атрибутом */
  function syncExpanded(trigger, open) {
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function openPanel(trigger) {
    closeAllPanels();
    var panel = panelOf(trigger);
    trigger.setAttribute('aria-expanded', 'true');
    if (panel) panel.classList.add('is-open');
  }

  /* Указатель: открываем по наведению. Небольшая задержка на закрытие,
     чтобы меню не мигало, когда курсор мазнул мимо по дороге к панели. */
  var CLOSE_DELAY = 140;
  var closeTimer = null;
  var canHover = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function cancelClose() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(closeAllPanels, CLOSE_DELAY);
  }

  triggers.forEach(function (trigger) {
    var item = trigger.closest('.nav__item');

    /* Раскрытие по наведению живёт в CSS (:hover / :focus-within).
       Здесь только тач-устройства, где hover недоступен. */
    if (!canHover) {
      trigger.addEventListener('click', function () {
        cancelClose();
        if (trigger.getAttribute('aria-expanded') === 'true') closePanel(trigger);
        else openPanel(trigger);
      });
    }

    if (!item) return;

    /* На hover-устройствах JS не открывает панель, а лишь держит
       aria-expanded в согласии с тем, что реально видно на экране. */
    if (canHover) {
      item.addEventListener('mouseenter', function () {
        cancelClose();
        item.classList.remove('is-dismissed');   /* новое наведение снимает Esc */
        syncExpanded(trigger, true);
      });

      item.addEventListener('mouseleave', function () {
        item.classList.remove('is-dismissed');
        scheduleClose();
      });

      item.addEventListener('focusin', function () {
        cancelClose();
        syncExpanded(trigger, true);
      });

      item.addEventListener('focusout', function (e) {
        if (item.contains(e.relatedTarget)) return;
        item.classList.remove('is-dismissed');
        syncExpanded(trigger, false);
      });
    }
  });

  /* Пункты без выпадашки (Pricing) и правая группа закрывают чужие панели */
  Array.prototype.forEach.call(
    header.querySelectorAll('.nav__link, .nav__login'),
    function (el) {
      el.addEventListener('mouseenter', scheduleClose);
    }
  );

  /* Снятие «погашено после Esc». Держим это на событиях, которые доходят
     всегда (Tab, уход курсора из шапки), а не только на focusout. */
  function clearDismissed() {
    Array.prototype.forEach.call(
      header.querySelectorAll('.nav__item.is-dismissed'),
      function (el) { el.classList.remove('is-dismissed'); }
    );
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') clearDismissed();
  });

  header.addEventListener('mouseleave', clearDismissed);

  /* ------------------------------------------------- ссылки, которые врут
     Шапка одна на все страницы, а разделы на страницах разные. Отсюда две
     поломки, которые в разметке не видны и чинятся только здесь.

     1. ЯКОРЬ В НИКУДА. «Pricing» ведёт на #the-math — раздел есть на
        главной и нет на фрибейсике: нажал и остался на месте. Такие якоря
        переадресуем на главную, там раздел заведомо есть.

     2. КНОПКА НА САМУ СЕБЯ. «Start for free» ведёт на free-basic.html, и
        на самом фрибейсике это ссылка на текущую страницу — нажатие не
        делает ничего. Там она должна вести дальше по воронке, на оплату.

     Обе правки живут в скрипте, а не в разметке, потому что зависят от
     того, КАКАЯ страница открыта, а разметка у всех страниц одна. */
  var here = location.pathname.split('/').pop() || 'index.html';

  Array.prototype.forEach.call(header.querySelectorAll('a[href^="#"]'), function (a) {
    var id = a.getAttribute('href').slice(1);
    if (id && !document.getElementById(id)) {
      a.setAttribute('href', 'index.html#' + id);
    }
  });

  /* ТОЛЬКО КНОПКА, а не любая ссылка. В первой версии правило стояло на
     всех ссылках шапки — и на главной перекинуло на оплату ЗНАК: он ведёт
     на index.html, то есть на страницу, где человек и стоит. Для знака это
     нормально и привычно, для кнопки — нет. */
  Array.prototype.forEach.call(header.querySelectorAll('a.btn[href]'), function (a) {
    if (a.getAttribute('href') === here) {
      a.setAttribute('href', 'checkout.html');
    }
  });

  /* Клик мимо шапки — закрыть */
  document.addEventListener('click', function (e) {
    if (!header.contains(e.target)) closeAllPanels();
    if (!header.contains(e.target)) clearDismissed();
  });

  /* Уход фокуса из шапки (Tab за последний пункт панели) — закрыть */
  header.addEventListener('focusout', function (e) {
    if (!header.contains(e.relatedTarget)) closeAllPanels();
  });

  /* ------------------------------------------------------ мобильный лист */

  var burger = document.getElementById('nav-burger');
  var sheet = document.getElementById('nav-sheet');
  var closeBtn = document.getElementById('nav-close');
  var lockedScrollY = 0;

  function sheetIsOpen() {
    return !!sheet && sheet.classList.contains('is-open');
  }

  function openSheet() {
    if (!sheet) return;
    lockedScrollY = window.scrollY;          /* overflow:hidden на body теряет позицию */
    sheet.classList.add('is-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('nav-open');

    /* Лист стартует с visibility:hidden — focus() по скрытому элементу
       ничего не делает, поэтому переносим его за перерисовку.
       preventScroll — чтобы фокус не таскал страницу под листом. */
    if (closeBtn) {
      requestAnimationFrame(function () {
        closeBtn.focus({ preventScroll: true });
      });
    }
  }

  /* byUserAction — человек сам закрыл меню (крестик, бургер, Esc): возвращаем
     и фокус на бургер, и позицию прокрутки. При переходе по якорю и при смене
     брейкпоинта не делаем ни того, ни другого — иначе перебьём сам переход. */
  function closeSheet(byUserAction) {
    if (!sheet) return;
    sheet.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('nav-open');

    if (byUserAction) {
      window.scrollTo(0, lockedScrollY);     /* overflow:hidden теряет позицию */
      burger.focus({ preventScroll: true });
    }
  }

  if (burger) {
    burger.addEventListener('click', function () {
      if (sheetIsOpen()) closeSheet(true);
      else openSheet();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function () { closeSheet(true); });
  }

  /* Переход по якорю из листа — закрыть, чтобы был виден целевой раздел */
  if (sheet) {
    sheet.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (link) closeSheet(false);
    });
  }

  /* Ловушка фокуса внутри открытого листа */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !sheetIsOpen()) return;

    var items = focusable(sheet);
    if (!items.length) return;

    var first = items[0];
    var last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* --------------------------------------------------- аккордеон в листе */

  var accTriggers = Array.prototype.slice.call(header.querySelectorAll('.nav-acc__trigger[aria-controls]'));

  accTriggers.forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var row = trigger.closest('.nav-acc__row');
      var open = trigger.getAttribute('aria-expanded') === 'true';

      /* Аккордеон одиночного раскрытия — как на доске */
      accTriggers.forEach(function (other) {
        other.setAttribute('aria-expanded', 'false');
        var otherRow = other.closest('.nav-acc__row');
        if (otherRow) otherRow.classList.remove('is-open');
      });

      if (!open) {
        trigger.setAttribute('aria-expanded', 'true');
        if (row) row.classList.add('is-open');
      }
    });
  });

  /* ------------------------------------------------------------ Esc и ресайз */

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;

    if (sheetIsOpen()) {
      closeSheet(true);
      return;
    }

    /* Панель раскрывает CSS, поэтому ищем её по фактическому состоянию
       (:hover / :focus-within), а не по aria — так Esc работает независимо
       от того, дошли ли до нас события фокуса. */
    var hot = header.querySelector('.nav__item:hover, .nav__item:focus-within');

    if (hot && !hot.classList.contains('is-dismissed')) {
      var hotTrigger = hot.querySelector('.nav__trigger');
      hot.classList.add('is-dismissed');
      if (hotTrigger) {
        closePanel(hotTrigger);
        syncExpanded(hotTrigger, false);
        hotTrigger.focus();
      }
      return;
    }

    /* Сенсорные устройства: панель держит класс .is-open */
    var open = triggers.filter(function (t) {
      return t.getAttribute('aria-expanded') === 'true';
    })[0];

    if (open) {
      closePanel(open);
      open.focus();
    }
  });

  /* Уехали за брейкпоинт — снять состояния, чтобы ничего не залипло */
  if (window.matchMedia) {
    var mq = window.matchMedia(MOBILE);
    var onChange = function (ev) {
      if (ev.matches) closeAllPanels();
      else closeSheet(false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
