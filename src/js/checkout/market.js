/* ==========================================================================
   tajiro — Оплата: валюта и дата конца пробного периода

   Два дела, оба из прототипа.

   1. ВАЛЮТА. Страну выбирают на самой странице, и от неё зависят суммы в
      счёте: [data-price] — цена подписки, [data-zero] — нули. Курсов здесь
      нет: цены назначены по рынкам, как в прототипе, а не пересчитаны из
      доллара. В заливе так и продают — ценник ровный в местной валюте.

      Динары и риалы идут с ТРЕМЯ знаками после запятой: у BHD, OMR и KWD
      дробная часть в тысячных, и «BHD 19.00» было бы ошибкой в счёте.

   2. ДАТА. Второе согласие обещает списание «с такого-то числа» — это
      четырнадцатый день от сегодня. Считается на клиенте только для
      показа; настоящую дату проставит бэкенд при создании подписки.

   Скрипт ничего не прячет: без него в разметке остаются суммы для ОАЭ и
   слова «the trial end date», то есть счёт читается и так.
   ========================================================================== */
(function () {
  'use strict';

  var PRICE = {
    AE: 'AED 149.00',
    SA: 'SAR 149.00',
    QA: 'QAR 149.00',
    BH: 'BHD 19.000',
    OM: 'OMR 19.000',
    KW: 'KWD 19.000'
  };

  var ZERO = {
    AE: 'AED 0.00',
    SA: 'SAR 0.00',
    QA: 'QAR 0.00',
    BH: 'BHD 0.000',
    OM: 'OMR 0.000',
    KW: 'KWD 0.000'
  };

  /* Код страны перед суммой не отрывается от неё переносом, а дробная
     часть уходит в свой span — она набрана мельче и тише. */
  function render(sum) {
    var parts = sum.split(' ');
    var code = parts[0];
    var num = parts[1].split('.');
    return code + ' ' + num[0] +
           '<span class="ch__dec">.' + num[1] + '</span>';
  }

  function paint(market) {
    var price = PRICE[market] || PRICE.AE;
    var zero = ZERO[market] || ZERO.AE;

    var prices = document.querySelectorAll('[data-price]');
    for (var i = 0; i < prices.length; i++) {
      prices[i].innerHTML = render(price);
    }

    var zeros = document.querySelectorAll('[data-zero]');
    for (var z = 0; z < zeros.length; z++) {
      zeros[z].innerHTML = render(zero);
    }
  }

  var select = document.getElementById('ch-market');
  if (select) {
    select.addEventListener('change', function () { paint(select.value); });
    paint(select.value);
  }

  /* Дата конца пробного периода. Формат тот же, что в прототипе:
     «29 September 2026» — день, месяц словом, год. */
  var end = new Date();
  end.setDate(end.getDate() + 14);
  var text = end.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  var dates = document.querySelectorAll('[data-date]');
  for (var d = 0; d < dates.length; d++) {
    dates[d].textContent = text;
  }
})();
