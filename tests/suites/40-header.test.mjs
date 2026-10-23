// Kopfzeile darf auf keiner Breite ueberlaufen (Version, Sync-Wolke, Verbinden)
import { newDevice } from '../lib/harness.mjs';

export const title = 'Kopfzeile auf allen Bildschirmbreiten';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  // Auch mit kuenftigen, breiteren Versionsnummern pruefen
  for (const [width, ver] of [[320, null], [360, null], [375, null], [390, null], [390, 'v0.88'], [390, 'v1.10'], [414, null], [430, 'v0.88'], [820, null]]) {
    const p = await newDevice(t, { name: `Kopf ${width}`, viewport: { width, height: 700 } });
    // Angemeldeten Zustand nachbilden: Wolke sichtbar (breiteste Variante)
    await p.evaluate((v) => { const d = document.querySelector('#syncDot'); d.hidden = false; d.className = 'sync on'; if (v) document.querySelector('#hdrVer').textContent = v; }, ver);
    const r = await p.evaluate(() => {
      const bar = document.querySelector('header .bar');
      const btn = document.querySelector('#connBtn').getBoundingClientRect();
      return { overflow: bar.scrollWidth > bar.clientWidth, btnInside: btn.right <= window.innerWidth, ver: document.querySelector('#hdrVer').textContent, text: getComputedStyle(document.querySelector('#connText')).display !== 'none' };
    });
    ok(!r.overflow && r.btnInside && /^v\d+\.\d+$/.test(r.ver), `${width}px: kein Überlauf, Version ${r.ver}, Statustext ${r.text ? 'sichtbar' : 'ausgeblendet'}`);
    await p.ctx.close();
  }
}
