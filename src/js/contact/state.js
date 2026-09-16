/* ==========================================================================
   tajiro — Контакты: два состояния

   Ровно тот же приём, что на странице входа (js/login/state.js): форма и
   подтверждение лежат в разметке оба, скрипт только переключает, какое
   показано, и подставляет введённый адрес.

   Настоящей отправки нет — её сделает бэкенд, см. заметку в
   pages/contact.html. Поэтому submit гасится, а переход к «сообщение
   отправлено» происходит сразу.

   Молча ничего не делать было нельзя: человек написал бы письмо, нажал
   кнопку и остался бы думать, ушло оно или нет. Второе состояние ещё и
   называет запасной путь — почту поддержки, — так что даже когда бэкенда
   нет, страница доводит человека до живого адреса.

   Без скрипта видна форма, а второе состояние скрыто атрибутом hidden: то
   есть страница остаётся осмысленной и на вид рабочей.
   ========================================================================== */
(function () {
  'use strict';

  var form  = document.getElementById('ct-form');
  var panel = document.getElementById('ct-form-state');
  var sent  = document.getElementById('ct-sent-state');
  if (!form || !panel || !sent) return;

  var mailE = document.getElementById('ct-email');
  var msgE  = document.getElementById('ct-message');
  var echo  = document.getElementById('ct-sent-email');
  var again = document.getElementById('ct-again');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    /* Проверяем то же, что помечено обязательным в разметке, и в том же
       порядке, в каком поля идут на экране: иначе фокус прыгает снизу
       вверх и человек не понимает, куда его увели. */
    var mail = mailE ? mailE.value.trim() : '';
    if (!mail) { if (mailE) mailE.focus(); return; }

    var msg = msgE ? msgE.value.trim() : '';
    if (!msg) { if (msgE) msgE.focus(); return; }

    if (echo) echo.textContent = mail;
    panel.hidden = true;
    sent.hidden = false;

    /* Фокус уводим на заголовок второго состояния: без этого он остаётся
       на кнопке, которой уже нет на экране, и человек с экранным диктором
       не узнает, что состояние сменилось. */
    var title = sent.querySelector('.ct__title');
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
      if (msgE) { msgE.value = ''; }
      if (mailE) { mailE.focus(); mailE.select(); }
    });
  }
})();
