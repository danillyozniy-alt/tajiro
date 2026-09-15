/* ==========================================================================
   tajiro — Оплата: кнопка ждёт согласий

   Приём с чекаута экомзи: пока согласия не отмечены, кнопка выключена, а
   над ней стоит строка-подсказка. Отметили — подсказка уходит, кнопка
   оживает. Так человек не жмёт впустую и видит, чего от него ждут.

   Отличие от экомзи одно: там согласие одно, здесь два — на условия и на
   автопродление, как в прототипе. Ждём оба.

   Кнопка выключена уже в разметке (disabled), а не гасится скриптом: без
   JS отправлять всё равно некуда, и активная кнопка обещала бы то, чего
   не произойдёт.
   ========================================================================== */
(function () {
  'use strict';

  var form = document.getElementById('ch-form');
  var btn  = document.getElementById('ch-submit');
  var gate = document.getElementById('ch-gate');
  if (!form || !btn) return;

  var boxes = form.querySelectorAll('[data-consent]');
  if (!boxes.length) return;

  function sync() {
    var all = true;
    for (var i = 0; i < boxes.length; i++) {
      if (!boxes[i].checked) { all = false; break; }
    }
    btn.disabled = !all;
    if (gate) gate.hidden = all;
  }

  for (var i = 0; i < boxes.length; i++) {
    boxes[i].addEventListener('change', sync);
  }

  sync();

  /* Отправки пока нет — её подключают вместе со Stripe. Гасим submit, чтобы
     страница не перезагружалась вхолостую и не теряла введённое. */
  form.addEventListener('submit', function (e) { e.preventDefault(); });
})();
