/* ==========================================================================
   tajiro — Вход: два состояния

   Форма и подтверждение отправки лежат в разметке оба; скрипт только
   переключает, какое показано, и подставляет введённый адрес.

   Настоящей отправки здесь нет — её делает бэкенд, см. заметку в
   pages/login.html. Поэтому submit гасится, а переход к «письмо
   отправлено» происходит сразу: страница прототипа ведёт себя так же.

   Без скрипта видна форма, а второе состояние скрыто атрибутом hidden —
   то есть страница остаётся осмысленной и на вид рабочей.
   ========================================================================== */
(function () {
  'use strict';

  var form  = document.getElementById('login-send');
  var panel = document.getElementById('login-form');
  var sent  = document.getElementById('login-sent');
  if (!form || !panel || !sent) return;

  var input = document.getElementById('login-email');
  var echo  = document.getElementById('login-sent-email');
  var again = document.getElementById('login-again');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var mail = input ? input.value.trim() : '';
    if (!mail) { if (input) input.focus(); return; }

    if (echo) echo.textContent = mail;
    panel.hidden = true;
    sent.hidden = false;

    /* Фокус уводим на заголовок второго состояния: без этого он остаётся
       на кнопке, которой уже нет на экране, и человек с экранным диктором
       не узнает, что состояние сменилось. */
    var title = sent.querySelector('.lg__title');
    if (title) {
      title.setAttribute('tabindex', '-1');
      title.focus();
    }
  });

  if (again) {
    again.addEventListener('click', function (e) {
      e.preventDefault();
      sent.hidden = true;
      panel.hidden = false;
      if (input) { input.focus(); input.select(); }
    });
  }
})();
