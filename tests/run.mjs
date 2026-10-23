// Startet alle Testreihen: node run.mjs [--ohne-cloud] [name ...]
//   name: nur Testreihen, deren Dateiname den Text enthaelt, z.B. "node run.mjs compose sync"
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { config, guardRemote, serveStatic, cloudAvailable, ensureAdmin, WEBAPP, OUT, ROOT } from './lib/harness.mjs';

const args = process.argv.slice(2);
const noCloud = args.includes('--ohne-cloud');
const filters = args.filter((a) => !a.startsWith('--'));

const dir = path.join(ROOT, 'tests', 'suites');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)));

fs.mkdirSync(OUT, { recursive: true });
try { guardRemote(); } catch (e) { console.error(e.message); process.exit(2); }

let cloud = noCloud ? 'mit --ohne-cloud abgeschaltet' : await cloudAvailable();
let adminId = null;
if (cloud === true) {
  try { adminId = await ensureAdmin(); } catch (e) { cloud = e.message; }
}
console.log(cloud === true ? `Supabase: ${config.supabaseUrl} (Test-Admin ${config.adminEmail})` : `Supabase: nicht verfügbar – ${cloud}. Testreihen mit Cloud werden übersprungen.`);

const server = await serveStatic(WEBAPP, { port: config.port }).catch((e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`Port ${config.port} ist belegt. Anderen Port wählen, z.B.: TEST_PORT=8199 npm test`);
  process.exit(2);
});
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];

for (const file of files) {
  const suite = await import(path.join(dir, file));
  const name = file.replace('.test.mjs', '');
  if (suite.needsCloud && cloud !== true) { results.push({ name, skipped: true }); console.log(`\n=== ${name}: übersprungen (braucht Supabase)`); continue; }
  console.log(`\n=== ${name}${suite.title ? ' – ' + suite.title : ''}`);
  const t = {
    browser, base: `http://127.0.0.1:${config.port}`, config, adminId, out: OUT, errors: [], passed: 0, failed: 0,
    ok(cond, msg) { console.log((cond ? '  OK    ' : '  FAIL  ') + msg); cond ? this.passed++ : this.failed++; },
  };
  const started = Date.now();
  try {
    await suite.default(t);
  } catch (e) {
    t.failed++;
    console.log('  ABBRUCH  ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n           '));
  }
  // Fehler im Browser (JavaScript-Ausnahmen) gelten als Fehlschlag
  for (const err of t.errors) { t.failed++; console.log('  FEHLER IM BROWSER  ' + err); }
  results.push({ name, passed: t.passed, failed: t.failed, ms: Date.now() - started });
}

await browser.close();
server.close();

console.log('\n================ Ergebnis ================');
for (const r of results) {
  console.log(r.skipped ? `  –  ${r.name.padEnd(22)} übersprungen` : `  ${r.failed ? '✗' : '✓'}  ${r.name.padEnd(22)} ${r.passed} bestanden${r.failed ? `, ${r.failed} FEHLGESCHLAGEN` : ''}  (${(r.ms / 1000).toFixed(1)} s)`);
}
const failed = results.reduce((n, r) => n + (r.failed || 0), 0);
console.log(failed ? `\n${failed} Prüfungen fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(failed ? 1 : 0);
