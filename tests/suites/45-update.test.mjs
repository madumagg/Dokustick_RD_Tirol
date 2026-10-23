// Updates muessen trotz HTTP-Cache (GitHub Pages: max-age=600) sofort ankommen.
// Hintergrund: Bis v0.15 lieferte der Offline-Speicher nach einem Update bis zu 10 Minuten die alte Version aus.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serveStatic, WEBAPP } from '../lib/harness.mjs';

export const title = 'Updates trotz Zwischenspeicher, automatisches Neuladen, Offline-Start';

// Wie tools/version.sh, aber fuer die Kopie
function setVersion(dir, v) {
  const edit = (f, re, rep) => { const p = path.join(dir, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(re, rep)); };
  edit('sw.js', /^const VERSION = '[0-9.]+';/m, `const VERSION = '${v}';`);
  edit('app.js', /^const APP_VERSION = '[0-9.]+';/m, `const APP_VERSION = '${v}';`);
  edit('index.html', /\.js\?v=[0-9.]+"/g, `.js?v=${v}"`);
}

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dokustick-update-'));
  fs.cpSync(WEBAPP, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.js'), 'window.DOKUSTICK_CONFIG = {};');
  setVersion(dir, '9.1');
  const port = t.config.port + 1;
  const server = await serveStatic(dir, { port, maxAge: 600 });
  try {
    const ctx = await t.browser.newContext();
    const p = await ctx.newPage();
    p.on('pageerror', (e) => t.errors.push('Update: ' + e.message));
    const version = () => p.evaluate(() => APP_VERSION);
    await p.goto(`http://127.0.0.1:${port}/index.html`);
    await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
    await p.reload(); await p.waitForTimeout(800);
    ok(await version() === '9.1' && await p.evaluate(() => !!navigator.serviceWorker.controller), 'Ausgangsversion 9.1, Offline-Speicher aktiv');

    setVersion(dir, '9.2');
    await p.reload(); await p.waitForTimeout(2000);
    ok(await version() === '9.2', 'Update 9.2 kommt beim ersten Neuladen an (trotz max-age=600)');

    setVersion(dir, '9.3');
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await p.waitForFunction(() => APP_VERSION === '9.3', null, { timeout: 10000 }).catch(() => {});
    ok(await version() === '9.3', 'Update 9.3 lädt bei offener App automatisch neu');

    await ctx.setOffline(true);
    await p.reload(); await p.waitForTimeout(1500);
    ok(await version() === '9.3' && await p.isVisible('#sendBtn'), 'Offline: App startet aus dem Speicher');
    await ctx.close();
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
