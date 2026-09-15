#!/usr/bin/env node
/* ==========================================================================
   genimg.mjs — кадры для страниц через Gemini Image (Nano Banana Pro)

   Сборки не касается. Запускается руками, когда нужен новый снимок, и
   кладёт результат прямо в src/assets/img — туда же, где лежат остальные.

   ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ. Кадры на странице — не декор, а часть смысла:
   на них показано, кому эта страница адресована. Держать их промпты в
   переписке значит потерять их при первой же пересборке; здесь они лежат
   рядом с кодом и переживают любую правку.

   ЧТО ДЕЛАЕТ
     1. просит у Gemini кадр по промпту из манифеста ниже;
     2. кладёт исходный jpg в src/assets/img/<путь>.jpg;
     3. пережимает его в webp через ffmpeg — в разметке стоит webp,
        jpg остаётся исходником, как у всех прежних кадров.

   ЧТО НУЖНО
     · ключ из aistudio.google.com — либо переменной окружения
       GEMINI_API_KEY, либо строкой GEMINI_API_KEY=… в файле .env.local в
       корне проекта. Файл в .gitignore; в код ключ не вписываем.

       Файл удобнее переменной на Windows: setx действует только на
       процессы, запущенные ПОСЛЕ него, — уже открытый терминал ключа не
       увидит, и придётся его перезапускать;
     · ffmpeg в PATH — им же пережаты остальные ассеты проекта.

   КАК ЗАПУСКАТЬ
     node tools/genimg.mjs                 только недостающие кадры
     node tools/genimg.mjs store-hero-gulf один кадр по имени
     node tools/genimg.mjs --force         перерисовать всё заново
     node tools/genimg.mjs --list          показать манифест и статус
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const IMG = path.join(HERE, '..', 'src', 'assets', 'img');

const MODEL = 'gemini-3-pro-image';        // Nano Banana Pro
const API = 'https://generativelanguage.googleapis.com/v1beta/interactions';


/* --- Общий регистр -----------------------------------------------------------
   Приписывается к каждому промпту. Собран по тем кадрам, что уже лежат в
   проекте, чтобы новые встали с ними в один ряд, а не рядом.

   ПРО ПЛАТКИ. Их нет ни на одном кадре проекта — это решение принято при
   замене заглушек (коммит 8fe6620) и здесь только продолжено. Страница
   обращается к человеку, который заводит своё дело, а не к образу региона.
   -------------------------------------------------------------------------- */
const LOOK = [
  'Photorealistic editorial photograph, shot on a full-frame camera with a fast prime lens.',
  'Natural daylight, warm and bright, soft shadows, gentle film grain.',
  'Contemporary Gulf setting: modern apartment, balcony, cafe or office in Dubai or Riyadh.',
  'Modern, relaxed, everyday clothing in muted warm tones. No headscarf. No hijab.',
  'Colours warm and clean — sand, cream, warm greens; nothing teal or neon.',
  'No text, no logos, no watermarks, no UI overlays, no collage, no frames.',
].join(' ');


/* --- Манифест ----------------------------------------------------------------
   Ключ = имя для командной строки. out — путь внутри src/assets/img без
   расширения. ar — пропорция кадра, size — сторона по длинной грани.

   Пропорции взяты от места, куда кадр встаёт, а не наоборот: витрина
   телефона 9:16, обложка товара 3:2, лицо в отзыве 1:1.
   -------------------------------------------------------------------------- */
const SHOTS = {
  'store-hero-gulf': {
    out: 'screens/store-hero-gulf',
    ar: '9:16',
    size: '2K',
    prompt: `Vertical lifestyle photograph for the hero banner of an online store.
      A confident Emirati woman in her early thirties on a sunlit rooftop terrace in
      Dubai, laughing mid-conversation, holding a phone loosely at her side.
      Modern city skyline soft and out of focus behind her. Shot slightly from below,
      full upper body, plenty of clean sky in the upper third so a headline can sit
      over it.`,
  },

  'ai-influencer-gulf': {
    out: 'people/ai-influencer-gulf',
    ar: '9:16',
    size: '2K',
    prompt: `Vertical video still, as if a frame from a short social-media clip.
      A charismatic Gulf Arab woman in her late twenties presenting to camera in a
      bright modern apartment, mid-gesture, talking with her hands, looking straight
      into the lens with an easy smile. Shallow depth of field, warm afternoon light
      from a window behind her. Framed for 9:16 with headroom at the top.`,
  },

  'prod-golden-visa': {
    out: 'products/golden-visa',
    ar: '3:2',
    size: '1K',
    prompt: `Still-life product cover, no people. A neat stack of official-looking
      documents and a passport on a pale stone desk beside a glass of water and a
      pair of reading glasses, morning light raking across from the left, tall
      modern windows out of focus behind. Calm, orderly, premium.`,
  },

  'prod-end-of-service': {
    out: 'products/end-of-service',
    ar: '3:2',
    size: '1K',
    prompt: `Still-life product cover, no people. A slim laptop closed on a warm
      wooden desk next to a pocket calculator, a fountain pen and a small notebook
      with a handwritten column of figures, late-afternoon sun, a cup of Arabic
      coffee at the edge of frame. Quiet, precise, reassuring.`,
  },

  'prod-school-admission': {
    out: 'products/school-admission',
    ar: '3:2',
    size: '1K',
    prompt: `Still-life product cover, no people. A family kitchen table in soft
      morning light with a wall calendar, a school satchel, a folder of forms and a
      child's pencil case arranged casually, warm cream and sand tones.`,
  },

  'prod-umrah-prep': {
    out: 'products/umrah-prep',
    ar: '3:2',
    size: '1K',
    prompt: `Still-life product cover, no people. A small open travel case on a
      bedroom floor in warm morning light, neatly folded white cloth, a compact
      prayer mat rolled beside it, a water bottle and a passport wallet. Respectful,
      calm, uncluttered.`,
  },

  'prod-rent-renewal': {
    out: 'products/rent-renewal',
    ar: '3:2',
    size: '1K',
    prompt: `Still-life product cover, no people. A set of apartment keys on a
      clean desk beside a tidy contract folder and a phone face down, bright daylight
      through a balcony door, a green plant softly out of focus behind.`,
  },
};


/* --- Один кадр ---------------------------------------------------------------- */
async function draw(key, shot, apiKey) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'text', text: `${shot.prompt.replace(/\s+/g, ' ').trim()} ${LOOK}` }],
      response_format: {
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: shot.ar,
        image_size: shot.size,
      },
    }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}\n${body.slice(0, 600)}`);

  const b64 = findImage(JSON.parse(body));
  if (!b64) throw new Error(`ответ без картинки:\n${body.slice(0, 600)}`);

  const jpg = path.join(IMG, shot.out + '.jpg');
  fs.mkdirSync(path.dirname(jpg), { recursive: true });
  fs.writeFileSync(jpg, Buffer.from(b64, 'base64'));

  const webp = path.join(IMG, shot.out + '.webp');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', jpg,
                          '-c:v', 'libwebp', '-quality', '82', webp]);

  return { jpg, webp };
}

/* Форма ответа у этого эндпоинта менялась (output_image.data, inline_data,
   inlineData), поэтому не ходим по фиксированному пути, а ищем первую
   строку, которая выглядит как base64 картинки. */
function findImage(node) {
  if (typeof node === 'string') {
    return node.length > 2048 && /^[A-Za-z0-9+/=\s]+$/.test(node) ? node : null;
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) {
      const hit = findImage(v);
      if (hit) return hit;
    }
  }
  return null;
}


/* --- Запуск -------------------------------------------------------------------- */
const args = process.argv.slice(2);
const force = args.includes('--force');
const names = args.filter((a) => !a.startsWith('--'));
const todo = names.length ? names : Object.keys(SHOTS);

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0).padStart(5) + ' KB';

if (args.includes('--list')) {
  for (const [key, shot] of Object.entries(SHOTS)) {
    const has = fs.existsSync(path.join(IMG, shot.out + '.webp'));
    console.log(`${has ? '✓' : '·'} ${key.padEnd(22)} ${shot.ar.padEnd(5)} ${shot.out}`);
  }
  process.exit(0);
}

const apiKey = process.env.GEMINI_API_KEY || fromEnvFile();
if (!apiKey) {
  console.error('Ключа нет. Положи его одним из двух способов:\n' +
                '  · строкой GEMINI_API_KEY=… в .env.local в корне проекта (файл в .gitignore)\n' +
                '  · переменной окружения GEMINI_API_KEY');
  process.exit(1);
}

/* Разбираем только то, что нужно: строку KEY=value, без кавычек и
   комментариев. Полноценный парсер .env тут не нужен — в файле одна
   строка. */
function fromEnvFile() {
  const file = path.join(HERE, '..', '.env.local');
  if (!fs.existsSync(file)) return null;
  const hit = fs.readFileSync(file, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/m);
  return hit ? hit[1].replace(/^["']|["']$/g, '') : null;
}

let made = 0;
for (const key of todo) {
  const shot = SHOTS[key];
  if (!shot) { console.error(`нет такого кадра: ${key}`); process.exitCode = 1; continue; }

  const webp = path.join(IMG, shot.out + '.webp');
  if (fs.existsSync(webp) && !force) { console.log(`· ${key} — уже есть, пропускаю`); continue; }

  process.stdout.write(`… ${key} `);
  try {
    const { jpg, webp: w } = await draw(key, shot, apiKey);
    console.log(`→ ${path.relative(IMG, w)}  ${kb(w)}  (исходник ${kb(jpg)})`);
    made++;
  } catch (err) {
    console.log('— не вышло');
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  }
}

if (made) console.log(`\nготово: ${made}. Дальше npm run build.`);
