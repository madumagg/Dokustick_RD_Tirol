// ProtoPilot-Logo: PNG-Dateien und favicon.ico aus branding/svg erzeugen.
// Aufruf (nach make.py): node branding/export.mjs   – nutzt Playwright aus tests/
import { chromium } from '../tests/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG = join(HERE, 'svg'), PNG = join(HERE, 'png');
mkdirSync(PNG, { recursive: true });

const jobs = [
  ...[16, 32, 48].map((s) => ['protopilot-favicon', s, s, `favicon-${s}`]),
  ...[64, 128, 192, 256, 512, 1024].map((s) => ['protopilot-icon', s, s, `protopilot-icon-${s}`]),
  ['protopilot-icon-quadratisch', 180, 180, 'apple-touch-icon'],
  ['protopilot-icon-quadratisch', 192, 192, 'android-192'],
  ['protopilot-icon-quadratisch', 512, 512, 'android-512'],
  ['protopilot-icon-maskable', 512, 512, 'android-maskable-512'],
  ['protopilot-symbol', 0, 512, 'protopilot-symbol'],
  ['protopilot-symbol-dunkel', 0, 512, 'protopilot-symbol-dunkel'],
  ['protopilot-symbol-schwarz', 0, 512, 'protopilot-symbol-schwarz'],
  ['protopilot-symbol-weiss', 0, 512, 'protopilot-symbol-weiss'],
  ['protopilot-logo', 0, 256, 'protopilot-logo'],
  ['protopilot-logo-dunkel', 0, 256, 'protopilot-logo-dunkel'],
  ['protopilot-logo-auf-petrol', 0, 256, 'protopilot-logo-auf-petrol'],
  ['protopilot-logo-schwarz', 0, 256, 'protopilot-logo-schwarz'],
  ['protopilot-logo-weiss', 0, 256, 'protopilot-logo-weiss'],
  ['protopilot-schriftzug', 0, 160, 'protopilot-schriftzug'],
  ['protopilot-schriftzug-dunkel', 0, 160, 'protopilot-schriftzug-dunkel'],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, w0, h, out] of jobs) {
  const svg = readFileSync(join(SVG, src + '.svg'), 'utf8');
  const [, , vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const w = w0 || Math.round((h * vw) / vh);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`);
  writeFileSync(join(PNG, out + '.png'), await page.screenshot({ omitBackground: true }));
}
// favicon.ico mit 16, 32 und 48 px (PNG-Eintraege, von allen Browsern unterstuetzt)
const imgs = [16, 32, 48].map((s) => [s, readFileSync(join(PNG, `favicon-${s}.png`))]);
const head = Buffer.alloc(6 + 16 * imgs.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let offset = head.length;
imgs.forEach(([s, data], i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += data.length;
});
writeFileSync(join(PNG, 'favicon.ico'), Buffer.concat([head, ...imgs.map(([, d]) => d)]));
console.log(`${jobs.length} PNG-Dateien und favicon.ico in branding/png`);

// Dateien fuer die Infoseite (website/)
const WEB = join(HERE, '..', 'website');
const copy = (from, to) => writeFileSync(join(WEB, to), readFileSync(from));
copy(join(SVG, 'protopilot-favicon.svg'), 'favicon.svg');
copy(join(PNG, 'favicon.ico'), 'favicon.ico');
copy(join(PNG, 'apple-touch-icon.png'), 'img/apple-touch-icon.png');
copy(join(SVG, 'protopilot-logo.svg'), 'img/logo.svg');
copy(join(SVG, 'protopilot-logo-dunkel.svg'), 'img/logo-dunkel.svg');

// Icons der Web-App (webapp/): Tab, Startbildschirm, Android
const APP = join(HERE, '..', 'webapp');
const toApp = (from, to) => writeFileSync(join(APP, to), readFileSync(from));
toApp(join(SVG, 'protopilot-icon.svg'), 'icon.svg');
toApp(join(SVG, 'protopilot-favicon.svg'), 'favicon.svg');
toApp(join(PNG, 'protopilot-icon-192.png'), 'icon-192.png');
toApp(join(PNG, 'protopilot-icon-512.png'), 'icon-512.png');
toApp(join(PNG, 'android-maskable-512.png'), 'icon-maskable-512.png');
toApp(join(PNG, 'apple-touch-icon.png'), 'apple-touch-icon.png');

// Vorschaubild fuer WhatsApp & Co. (1200 x 630)
await page.setViewportSize({ width: 1200, height: 630 });
const shot = readFileSync(join(WEB, 'img/app-protokoll.webp')).toString('base64');
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;height:100%}
  body{background:#0b6f6a;color:#fff;font-family:"Inter Display",Inter,sans-serif;display:flex;align-items:center;overflow:hidden}
  .t{padding:0 0 0 80px;flex:1}
  .t svg{height:84px;width:auto;display:block}
  h1{font-size:70px;font-weight:800;line-height:1.05;margin:44px 0 22px;letter-spacing:-1.5px}
  p{font-size:28px;margin:0;opacity:.9;max-width:560px;line-height:1.4;font-family:Inter,sans-serif}
  .ph{width:330px;margin:120px 90px 0 0;background:#1b2423;border-radius:40px;padding:11px;transform:rotate(3deg);box-shadow:0 30px 60px rgba(0,0,0,.35)}
  .ph img{display:block;width:100%;border-radius:30px}
</style><div class="t">${readFileSync(join(SVG, 'protopilot-logo-auf-petrol.svg'), 'utf8')}
<h1>Dein Pilot fürs Protokoll.</h1><p>Am Handy zusammenstellen, der Stick tippt es ins Dokumentationsprogramm.</p></div>
<div class="ph"><img src="data:image/webp;base64,${shot}"></div>`);
await page.waitForTimeout(200);
writeFileSync(join(WEB, 'img/vorschau.png'), await page.screenshot());
await browser.close();
console.log('webapp/: icon.svg, favicon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png');
console.log('website/: favicon.svg, favicon.ico, img/logo.svg, img/logo-dunkel.svg, img/apple-touch-icon.png, img/vorschau.png');
