#!/usr/bin/env node
/* ==========================================================================
   Tajiro — сборка страницы из исходников.

   Из одного источника (src/) получаются две вещи, и лежат они в РАЗНЫХ
   папках — чтобы «что можно отправлять» было видно по расположению, а не
   по памяти:

     dist/    рабочая версия. Страницы плюс папки css, js, assets: сайт
              разобран на части. Это то, что заливается на хостинг и что
              открываешь в браузере во время работы. Отправлять нельзя —
              без соседних папок html откроется голым текстом.

     send/    то, что отправляют. Каждая страница — один самодостаточный
              файл, всё вшито внутрь:

                Tajiro-home.html             всё внутри: стили, скрипты, шрифты, кадры, ролик

              Полный тяжелее втрое, зато работает вообще без сети.

   Страниц может быть сколько угодно: список лежит в PAGES ниже, добавление
   новой — одна строка там и один шаблон в src/.

   Собираются обе всегда и вместе. Раньше полный файл требовал отдельного
   ключа — и после любой правки молча оставался старым, потому что watcher
   про него не знал. Лишние сто миллисекунд на сборку дешевле, чем отправить
   устаревший файл и не заметить.

   Команды:
     node tools/build.mjs            — собрать всё
     node tools/build.mjs --watch    — пересобирать при изменении src/
     node tools/build.mjs --serve    — собрать, поднять сервер и следить

   Никаких зависимостей: только то, что уже есть в Node.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC  = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const SEND = path.join(ROOT, 'send');

/* Страницы сайта. Всё, что нужно знать сборке о каждой: из какого шаблона
   собирать, как назвать в dist/ и как назвать цельный файл для отправки.

   Список существует затем, чтобы добавление страницы было одной строкой, а
   не правкой в четырёх местах. Отчёт, очистка старых цельных файлов и
   выбор стартовой страницы сервера строятся отсюда же.

   Шаблоны лежат в src/pages/, их части — в подпапках по странице:

     partials/shared/   шапка, подвал, полоса показателей — общее для всех
     partials/home/     секции главной
     partials/<стр>/    секции этой страницы

     css/core/          шрифты, токены, появление — фундамент
     css/shared/        блоки, которые стоят больше чем на одной странице
     css/home/          секции главной
     css/<стр>/         секции этой страницы

   То же деление у js/. Правило одно: файл переезжает в shared/ ровно тогда,
   когда его подключает вторая страница, — не раньше. */
const PAGES = [
  { template: 'pages/index.html',       out: 'index.html',       send: 'Tajiro-home.html' },
  { template: 'pages/free-basic.html',  out: 'free-basic.html',  send: 'Tajiro-free-basic.html' },
  { template: 'pages/login.html',       out: 'login.html',       send: 'Tajiro-login.html' },
  { template: 'pages/checkout.html',    out: 'checkout.html',    send: 'Tajiro-checkout.html' },
  { template: 'pages/contact.html',     out: 'contact.html',     send: 'Tajiro-contact.html' },
  { template: 'pages/about.html',       out: 'about.html',       send: 'Tajiro-about.html' }
];

const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.js'  : 'text/javascript; charset=utf-8',
  '.svg' : 'image/svg+xml',
  '.jpg' : 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png' : 'image/png',
  '.webp': 'image/webp',
  '.ico' : 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff' : 'font/woff',

  /* Без этой строки .mp4 уезжал в application/octet-stream. На дев-сервере
     это сходило с рук — браузер угадывал тип по содержимому. А вот в
     data-URI гадать не по чему: видео вшивалось как поток байтов, и плеер
     отказывался его открывать. */
  '.mp4' : 'video/mp4'
};

const STYLE_SLOT = '<!--STYLE-SLOT-->';

/* ------------------------------------------------------------------ helpers */

const read = p => fs.readFileSync(p, 'utf8');
const mime = p => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

function dataUri(absPath) {
  return 'data:' + mime(absPath).split(';')[0] + ';base64,'
       + fs.readFileSync(absPath).toString('base64');
}

function size(bytes) {
  return bytes > 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(2) + ' MB'
    : Math.round(bytes / 1024) + ' KB';
}

/* --------------------------------------------------------- 1. сборка разметки
   Раскрываем <!--#include partials/xx.html -->. Маркер секции остаётся в
   разметке: по нему готовую страницу всегда можно разобрать обратно. */

function assemble(templateRel) {
  const template = read(path.join(SRC, templateRel));
  const missing = [];

  const html = template.replace(
    /^([ \t]*)<!--#include\s+(\S+)\s*-->[ \t]*\r?\n?/gm,
    (_all, indent, rel) => {
      const abs = path.join(SRC, rel);
      if (!fs.existsSync(abs)) { missing.push(rel); return ''; }
      const body = read(abs).replace(/\s+$/, '');
      const name = path.basename(rel, '.html');
      const mark = name === 'head' ? '' : indent + '<!-- ===== ' + name + ' ===== -->\n';
      return mark + body + '\n';
    }
  );

  if (missing.length) throw new Error('нет партиалов: ' + missing.join(', '));

  /* Комментарии вида <!--# ... --> — записка разработчику, а не часть
     страницы: до сборок они не доезжают. */
  return html.replace(/^[ \t]*<!--#[\s\S]*?-->[ \t]*\r?\n?/gm, '');
}

/* ------------------------------------------------------- 2. подключённый сайт */

/* Копируем поверх и только потом убираем осиротевшее.

   Сносить каталог перед копированием нельзя: watcher живёт в процессе
   сервера, ручной запуск — в своём, и две сборки встречаются на живом
   dist/. На Windows это либо ENOTEMPTY на открытом файле, либо пачка 404
   у страницы, которая грузится ровно между rm и copy. */
function syncDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const keep = new Set();

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    keep.add(entry.name);
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) { syncDir(a, b); continue; }

    /* Копируем только изменившееся. Безусловный copyFileSync ронял сборку
       на EBUSY: браузер стримит dist/assets/video/ai-team.mp4 и держит на
       нём хэндл, а watcher переписывал файл при каждой правке где угодно. */
    const src = fs.statSync(a);
    let dst = null;
    try { dst = fs.statSync(b); } catch {}

    if (dst && dst.size === src.size && dst.mtimeMs >= src.mtimeMs) continue;

    fs.copyFileSync(a, b);
  }

  for (const entry of fs.readdirSync(to, { withFileTypes: true })) {
    if (keep.has(entry.name)) continue;
    fs.rmSync(path.join(to, entry.name), {
      recursive: true, force: true, maxRetries: 5, retryDelay: 60
    });
  }
}

/* Папки копируются ОДИН раз за сборку, а не на каждую страницу: syncDir
   доносит до dist/ изменения и сносит осиротевшее, и два таких прохода по
   одному каталогу подряд — это лишняя работа на десятки мегабайт ассетов. */
function syncAssets() {
  fs.mkdirSync(DIST, { recursive: true });
  for (const dir of ['css', 'js', 'assets']) {
    syncDir(path.join(SRC, dir), path.join(DIST, dir));
  }
}

function buildLinked(html, out) {
  fs.writeFileSync(path.join(DIST, out), html);
  return Buffer.byteLength(html);
}

/* ------------------------------------------------------- 3. один файл в почту
   Порядок операций важен: сначала стили и скрипты становятся текстом внутри
   документа, и только потом внутри этого текста ищутся ссылки на ассеты. */

function buildSingle(html, withVideo, sendBase) {
  let out = html;

  /* --- ссылки между страницами -------------------------------------------
     На сайте кнопки главной ведут на free-basic.html — файл лежит рядом в
     dist/. В send/ такого файла нет: там у каждой страницы своё имя вида
     Tajiro-<страница>.html. Без подмены кнопка в отправленном файле ведёт
     в никуда, и снаружи это выглядит поломкой вёрстки, а не сборки.

     Поэтому в цельной версии адрес страницы заменяется на имя её цельного
     файла: положишь оба рядом — переходы работают и без сети. */
  for (const other of PAGES) {
    if (other.send === sendBase) continue;
    out = out.split('href="' + other.out + '"').join('href="' + other.send + '"');
  }

  /* --- стили: весь блок <link> схлопывается в один <style> --------------- */
  const sheets = [];
  out = out.replace(
    /^[ \t]*<link rel="stylesheet" href="([^"]+)">[ \t]*\r?\n?/gm,
    (_all, href) => {
      sheets.push(href);
      /* место под <style> держит первая ссылка, остальные исчезают:
         порядок правил обязан остаться тем же, что в подключённой сборке */
      return sheets.length === 1 ? STYLE_SLOT + '\n' : '';
    }
  );

  if (sheets.length) {
    const css = sheets.map(href => {
      const body = read(path.join(SRC, href)).replace(/\s+$/, '');
      return '/* ===== ' + path.basename(href) + ' ===== */\n' + body;
    }).join('\n\n');
    out = out.replace(STYLE_SLOT, '<style>\n' + css + '\n</style>');
  }

  /* --- скрипты: каждый остаётся на своём месте --------------------------- */
  out = out.replace(/<script src="([^"]+)"><\/script>/g, (_all, src) => {
    const body = read(path.join(SRC, src)).replace(/\s+$/, '');
    return '<script>\n' + body + '\n</script>';
  });

  /* --- ассеты: и в разметке, и внутри уже вшитых стилей ------------------ */
  let inlined = 0;
  /* Вшивается ВСЁ, включая видео. Раньше здесь был выбор: обычный цельный
     файл без ролика и «-full» с роликом. Лёгкий делался ради почты — с
     роликом файл переваливает за 8 МБ, а вложения режут на десяти, у многих
     на пяти. Им не пользовались: отправляют всегда полный, а лёгкий просто
     лежал рядом и путал, какой из двух брать. Выбор снят. */
  const kinds = 'fonts|img|video';

  out = out.replace(new RegExp('(?:\\.\\./)*assets/(?:' + kinds + ')/[A-Za-z0-9._/-]+', 'g'), ref => {
    const rel = ref.replace(/^(?:\.\.\/)+/, '');
    const abs = path.join(SRC, rel);
    if (!fs.existsSync(abs)) throw new Error('нет ассета: ' + rel);
    inlined++;
    return dataUri(abs);
  });

  /* Если что-то всё же осталось ссылкой — это перечисляется в отчёте
     сборки. Молчать нельзя: снаружи недостающий ассет выглядит поломкой, а
     не решением. */
  const external = [...new Set(
    (out.match(/(?:\.\.\/)*assets\/[A-Za-z0-9._/-]+/g) || [])
      .map(r => r.replace(/^(?:\.\.\/)+/, ''))
  )];

  const name = sendBase;

  fs.mkdirSync(SEND, { recursive: true });
  fs.writeFileSync(path.join(SEND, name), out);
  return { name, bytes: Buffer.byteLength(out), sheets: sheets.length, inlined, external };
}

/* --------------------------------------------------------------- 4. прогон */

/* Ключи читаем здесь, а не у самого запуска: buildOnce обращается к ним, а
   объявление const ниже по файлу до него не дотягивается. */
const argv = process.argv.slice(2);

/* Сборки идут по одной: параллельные проходы syncDir по одному и тому же
   dist/ спорят за файлы — один удаляет осиротевшее ровно тогда, когда
   другой это же копирует. */
let busy = false;
let queued = false;

function build() {
  if (busy) { queued = true; return; }
  busy = true;
  try { buildOnce(); }
  finally {
    busy = false;
    if (queued) { queued = false; build(); }
  }
}

function buildOnce() {
  const t0 = process.hrtime.bigint();
  syncAssets();

  const report = [];

  for (const page of PAGES) {
    const html = assemble(page.template);
    const linked = buildLinked(html, page.out);
    const single = buildSingle(html, true, page.send);

    /* Хвосты прошлой схемы: «-full» больше не собирается, и старые копии
       цельных файлов в dist тоже не нужны. Удаляем на каждой сборке, иначе
       в папках лежат файлы, которых никто больше не обновляет. */
    fs.rmSync(path.join(SEND, page.send.replace(/\.html$/, '-full.html')), { force: true });
    for (const stale of [page.send, page.send.replace(/\.html$/, '-full.html')]) {
      fs.rmSync(path.join(DIST, stale), { force: true });
    }

    const line = r => '  send/' + r.name.padEnd(26) + size(r.bytes).padStart(9) +
                      '   ' + r.inlined + ' ассетов вшито';

    report.push(
      '  dist/' + page.out.padEnd(26) + size(linked).padStart(9) +
        '   + ' + single.sheets + ' css, ассеты файлами  (рабочая версия)\n' +
      line(single)
      + (single.external.length
          ? '\n  ! ссылкой, не вшито: ' + single.external.join(', ')
          : '\n    всё внутри — работает без сети')
    );
  }

  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('built in ' + ms.toFixed(0) + ' ms\n' + report.join('\n\n'));
}

/* ---------------------------------------------------------------- 5. сервер */

function serve() {
  http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);

    /* Цельные файлы лежат вне dist, но смотреть их надо тем же сервером —
       иначе проверить отправляемую версию можно только открыв её с диска. */
    const send = rel === '/send' || rel.startsWith('/send/');
    const base = send ? SEND : DIST;
    const tail = send ? (rel.slice(5) || '/') : rel;

    let file = path.join(base, tail === '/' ? 'index.html' : tail);
    if (!file.startsWith(base)) { res.writeHead(403).end('forbidden'); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }

    /* Range обязателен для видео: без 206 браузер не умеет перематывать —
       любой seek отбрасывает ролик на начало. Отдаём кусок, если попросили. */
    const size = fs.statSync(file).size;
    const range = req.headers.range;
    const head = { 'Content-Type': mime(file), 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };

    if (range) {
      /* \d, а не d: без обратной косой это искало букву «d», ни один
         заголовок не совпадал, и перемотка видео молча не работала —
         сервер каждый раз отдавал файл целиком. */
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m) {
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        if (start >= size || start > end) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + size }).end();
          return;
        }
        res.writeHead(206, {
          ...head,
          'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
          'Content-Length': end - start + 1
        });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, { ...head, 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT, () => {
    console.log('http://localhost:' + PORT + '  — Ctrl+C, чтобы остановить');
  });
}

/* ----------------------------------------------------------------- 6. watch */

function watch() {
  let timer = null;
  fs.watch(SRC, { recursive: true }, (_event, name) => {
    if (!name || /(^|[\\/])\./.test(name)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { build(); }
      catch (err) { console.error('build failed: ' + err.message); }
    }, 80);
  });
  console.log('слежу за src/ …');
}

/* ------------------------------------------------------------------- запуск */

try {
  build();
} catch (err) {
  console.error('build failed: ' + err.message);
  process.exit(1);
}
if (argv.includes('--serve')) { serve(); watch(); }
else if (argv.includes('--watch')) { watch(); }
