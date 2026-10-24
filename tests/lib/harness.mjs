// Gemeinsame Hilfsfunktionen fuer alle Testreihen.
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const WEBAPP = path.join(ROOT, 'webapp');
export const OUT = path.join(ROOT, 'tests', 'test-output');

// Zugangsdaten der lokalen Supabase automatisch holen (npx supabase start), falls nicht gesetzt
function localSupabaseEnv() {
  if (process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) return {};
  try {
    const out = execSync(`npx --no-install supabase status -o env --workdir "${ROOT}"`, { cwd: path.join(ROOT, 'tests'), stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 }).toString();
    const env = Object.fromEntries(out.split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
    return { url: env.API_URL, anon: env.ANON_KEY, service: env.SERVICE_ROLE_KEY };
  } catch {
    return {};
  }
}
const local = localSupabaseEnv();

export const config = {
  port: Number(process.env.TEST_PORT || 8099),
  supabaseUrl: process.env.SUPABASE_URL || local.url || 'http://127.0.0.1:54321',
  anonKey: process.env.SUPABASE_ANON_KEY || local.anon || '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || local.service || '',
  adminEmail: process.env.TEST_ADMIN_EMAIL || 'admin@dokustick.test',
  password: 'geheim123',
};

// Niemals versehentlich gegen die echte Datenbank testen (supabase.co oder den eigenen Server):
// nur Adressen auf diesem Rechner sind erlaubt
export function guardRemote() {
  const host = (() => { try { return new URL(config.supabaseUrl).hostname; } catch { return ''; } })();
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host) && process.env.ALLOW_REMOTE_TESTS !== '1') {
    throw new Error(`SUPABASE_URL zeigt nicht auf diesen Rechner (${config.supabaseUrl}).\n` +
      'Die Tests legen Benutzer an, loeschen sie und aendern Einstellungen. Bitte nur gegen die lokale\n' +
      'Supabase (npx supabase start) oder ein eigenes Test-Projekt laufen lassen.');
  }
}

/* ---------- Statischer Webserver ---------- */

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.aff': 'text/plain; charset=utf-8', '.dic': 'text/plain; charset=utf-8' };

// maxAge > 0 bildet GitHub Pages nach (dort: max-age=600)
export function serveStatic(dir, { port, maxAge = 0 } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Nicht gefunden'); }
    const body = fs.readFileSync(file);
    const etag = '"' + body.length.toString(16) + '-' + fs.statSync(file).mtimeMs.toString(16) + '"';
    const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': maxAge ? `max-age=${maxAge}` : 'no-store', etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, headers);
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/* ---------- Supabase ---------- */

export const anonClient = () => createClient(config.supabaseUrl, config.anonKey, { auth: { persistSession: false } });
export const serviceClient = () => createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false } });

export async function cloudAvailable() {
  if (!config.anonKey || !config.serviceKey) return 'SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY fehlen';
  try {
    const r = await fetch(config.supabaseUrl + '/auth/v1/health', { headers: { apikey: config.anonKey } });
    if (!r.ok) return `Supabase antwortet mit ${r.status}`;
  } catch (e) {
    return `Supabase unter ${config.supabaseUrl} nicht erreichbar`;
  }
  return true;
}

// Test-Admin anlegen (falls noetig) und zum App-Admin machen
export async function ensureAdmin() {
  const c = anonClient();
  let r = await c.auth.signInWithPassword({ email: config.adminEmail, password: config.password });
  if (r.error) r = await c.auth.signUp({ email: config.adminEmail, password: config.password });
  if (r.error || !r.data.user) throw new Error('Test-Admin konnte nicht angelegt werden: ' + (r.error && r.error.message));
  const { error } = await serviceClient().from('app_admins').upsert({ user_id: r.data.user.id });
  if (error) throw new Error('Test-Admin konnte nicht zum App-Admin gemacht werden: ' + error.message);
  return r.data.user.id;
}

export async function userId(email) {
  const { data, error } = await serviceClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const u = data.users.find((x) => x.email === email);
  return u && u.id;
}

/* ---------- Browser ---------- */

// Simulierter Dongle: zeichnet alle Bluetooth-Schreibvorgaenge in window.__writes auf
const BLE_MOCK = () => {
  window.__writes = [];
  const listeners = {};
  let pending = 0;
  const mk = () => {
    const dv = new DataView(new ArrayBuffer(7));
    dv.setUint8(0, 1 | (pending ? 4 : 0)); dv.setUint16(1, pending, true); dv.setUint16(3, 4096 - pending, true); dv.setUint8(5, 5); dv.setUint8(6, 2);
    return dv;
  };
  const stat = { addEventListener: (t, f) => (listeners[t] = f), startNotifications: async () => {}, readValue: async () => mk() };
  const cmd = {
    writeValueWithResponse: async (b) => {
      window.__writes.push(Array.from(b));
      if (b[0] === 1) {
        pending += b.length - 1;
        setTimeout(() => { pending = 0; listeners.characteristicvaluechanged?.({ target: { value: mk() } }); }, 30);
      }
    },
  };
  const device = {
    name: 'DokuStick', addEventListener() {},
    gatt: { connected: false, async connect() { this.connected = true; return { getPrimaryService: async () => ({ getCharacteristic: async (u) => (u.startsWith('6e7a0002') ? cmd : stat) }) }; }, disconnect() {} },
  };
  Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device } });
};

// Meldet Text "null"/"undefined" in der Seite: Platzhalter fuer "nichts anzeigen", die an
// replaceChildren/append statt an el() uebergeben wurden (die schreiben sie als Text hin)
const NULL_GUARD = () => {
  const seen = new Set();
  const report = (n) => {
    const p = n.parentElement;
    const where = p ? p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (p.className ? '.' + String(p.className).trim().split(/\s+/).join('.') : '') : '?';
    const ctx = (p && (p.closest('[id]') || p).textContent.replace(/\s+/g, ' ').trim().slice(0, 80)) || '';
    const key = where + '|' + n.data;
    if (!seen.has(key)) { seen.add(key); console.error(`NULL-TEXT "${n.data}" in <${where}>: ${ctx}`); }
  };
  const bad = (n) => /^(null|undefined)+$/.test(n.data);
  const scan = (n) => {
    if (n.nodeType === 3) { if (bad(n)) report(n); return; }
    if (n.nodeType !== 1) return;
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) if (bad(t)) report(t);
  };
  new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach(scan); }).observe(document, { childList: true, subtree: true });
};

/*
 * Neues "Geraet" (eigener Browser-Kontext).
 *   cloud: true -> App spricht mit der Test-Supabase, sonst ohne Konto
 *   ble:   true -> simulierter Dongle
 *   init        -> zusaetzliches Skript vor dem Laden der Seite (z.B. Geraeteeigenschaften faelschen)
 *   dialog(d)   -> eigene Behandlung nativer Dialoge (Standard: bestaetigen,
 *                  Frage nach Uebernahme lokaler Bausteine ablehnen)
 */
export async function newDevice(t, { name = 'Gerät', cloud = false, ble = false, viewport = { width: 390, height: 844 }, dialog, context = {}, init } = {}) {
  const ctx = await t.browser.newContext({ viewport, serviceWorkers: 'block', ...context });
  const cfg = cloud ? `{ supabaseUrl: '${config.supabaseUrl}', supabaseAnonKey: '${config.anonKey}' }` : '{}';
  await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: `window.DOKUSTICK_CONFIG = ${cfg};` }));
  await ctx.addInitScript(NULL_GUARD);
  if (ble) await ctx.addInitScript(BLE_MOCK);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => t.errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && m.text().startsWith('NULL-TEXT')) t.errors.push(`${name}: ${m.text()}`); });
  page.on('dialog', (d) => (dialog ? dialog(d) : /übernommen/.test(d.message()) ? d.dismiss() : d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined)));
  await page.goto(t.base + '/index.html');
  page.ctx = ctx;
  return page;
}

export async function login(page, email, { signup = false } = {}) {
  await page.click('nav button[data-tab=settings]');
  await page.fill('#accountCard input[type=email]', email);
  await page.fill('#accountCard input[type=password]', config.password);
  await page.click(`#accountCard >> text=${signup ? 'Registrieren' : 'Anmelden'}`);
  await page.waitForFunction(() => cloud.account && cloud.lastSync && !cloud.syncing, null, { timeout: 15000 });
}

export const waitSynced = (page) => page.waitForFunction(() => cloud.account && !cloud.syncing && !cloud.pending() && cloud.lastSync, null, { timeout: 15000 });

// Vom simulierten Dongle empfangener Text; Sondertasten als <mod,key>
export const sentText = (page) => page.evaluate(() => {
  const bytes = window.__writes.filter((w) => w[0] === 1).flatMap((w) => w.slice(1));
  window.__writes = [];
  let s = '', txt = [];
  const flush = () => { s += new TextDecoder().decode(new Uint8Array(txt)); txt = []; };
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) { flush(); s += `<${bytes[i + 1].toString(16)},${bytes[i + 2].toString(16)}>`; i += 2; } else txt.push(bytes[i]);
  }
  flush();
  return s;
});

// Eindeutiger Zusatz fuer Testdaten (Tests koennen mehrfach gegen dieselbe Datenbank laufen)
export const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
