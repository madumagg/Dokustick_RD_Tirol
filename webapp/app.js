'use strict';

/* ================= Konstanten ================= */

// Wird mit tools/version.sh zusammen mit sw.js und index.html erhoeht
const APP_VERSION = '0.24';

const SVC_UUID = '6e7a0001-4b3c-4f8e-9a1d-5c2b7d0a4e01';
const CMD_UUID = '6e7a0002-4b3c-4f8e-9a1d-5c2b7d0a4e01';
const STAT_UUID = '6e7a0003-4b3c-4f8e-9a1d-5c2b7d0a4e01';
const CMD_DATA = 1, CMD_CANCEL = 2, CMD_DELAY = 3, CMD_UNPAIR = 4;
const CHUNK = 19;            // Nutzdaten pro BLE-Paket (passt in die Standard-MTU)

// Sondertasten: [Modifier, HID-Usage-ID]
const KEYS = {
  'TAB': [0, 0x2B], 'SHIFT+TAB': [0x02, 0x2B], 'ENTER': [0, 0x28], 'ESC': [0, 0x29],
  'BACKSPACE': [0, 0x2A], 'DEL': [0, 0x4C], 'HOME': [0, 0x4A], 'END': [0, 0x4D],
  'RIGHT': [0, 0x4F], 'LEFT': [0, 0x50], 'DOWN': [0, 0x51], 'UP': [0, 0x52],
};
const TOKEN_RE = /\{(SHIFT\+TAB|TAB|ENTER|ESC|BACKSPACE|DEL|HOME|END|RIGHT|LEFT|DOWN|UP|PAUSE(?::(\d+))?|DATUM|ZEIT)\}/g;

// Zeichen, die ohne Entsprechung auf der deutschen Tastatur ersetzt werden
// ® und ™ stehen oft in Handelsnamen, haben aber keine Taste
const NORMALIZE = { '®': '', '™': '', '©': '', '≥': '>=', '≤': '<=', '±': '+/-', '×': 'x', '÷': ':', '→': '->', '←': '<-', '•': '-', '·': '-', '½': '1/2', '¼': '1/4', '¾': '3/4', '‰': ' Promille' };
// Zeichen, die die Firmware tippen kann (zusaetzlich zu druckbarem ASCII)
const SUPPORTED = new Set([...'\n\täöüÄÖÜß§°²³€µμ´áéíóúÁÉÍÓÚàèìòùâêîôû   “”„‘’‚–—−…']);

const DEFAULT_MODULES = [
  { category: 'Befund', title: 'Wach & orientiert', body: 'Pat. bei Eintreffen wach, ansprechbar und zu allen Qualitäten orientiert.' },
  { category: 'Befund', title: 'Keine Allergien', body: 'Keine Allergien bekannt.' },
  { category: 'Befund', title: 'Keine Dauermedikation', body: 'Keine Dauermedikation bekannt.' },
  { category: 'Maßnahmen', title: 'Monitoring', body: 'Monitoring (EKG, SpO2, NIBP) angelegt.' },
  { category: 'Maßnahmen', title: 'Venöser Zugang', body: 'Periphervenöser Zugang gelegt, Infusion angehängt.' },
  { category: 'Transport', title: 'Transport liegend', body: 'Transport liegend unter Monitoring ins Krankenhaus.' },
  { category: 'Transport', title: 'Transportverweigerung', body: 'Pat. lehnt Transport nach ausführlicher Aufklärung über mögliche Folgen ab.' },
  { category: 'Tasten', title: 'Tab', body: '{TAB}' },
  { category: 'Tasten', title: 'Enter', body: '{ENTER}' },
  { category: 'Tasten', title: 'Datum & Uhrzeit', body: '{DATUM} {ZEIT}' },
];
const DEFAULT_FORMS = [
  { title: 'Vitalparameter', body: 'RR {{RR}} mmHg, HF {{HF:#}}/min, SpO2 {{SpO2:#}} %, AF {{AF:#}}/min, BZ {{BZ:#}} mg/dl, Temp. {{Temp:#}} °C, GCS {{GCS:15|14|13|12|11|10|9|8|7|6|5|4|3}}' },
  { title: 'Kurzbefund', body: 'Pat. {{Bewusstsein:wach, orientiert|wach, desorientiert|somnolent|soporös|komatös}}.\nAtmung: {{Atmung:unauffällig|Dyspnoe|Tachypnoe|Bradypnoe}}.\nHaut: {{Haut:rosig, warm, trocken|blass|kaltschweißig|zyanotisch}}.\nSchmerz NRS {{NRS:#}}/10.' },
  { title: 'Felder mit Tab füllen', body: '{{Feld 1}}{TAB}{{Feld 2}}{TAB}{{Feld 3}}' },
];
const DEFAULT_SETTINGS = { delay: 5, lang: 'de-AT', voiceCmds: true, replacements: '', blankLine: true, theme: '', defaultProtocol: null, spellcheck: true, dictionary: [] };

/* ================= Hilfsfunktionen ================= */

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Die Datenbank erwartet echte UUIDs (auch offline erzeugt)
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c);
  return n;
}

let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), kind === 'err' ? 5000 : 2500);
}

const store = {
  load(key, fallback) {
    try { const v = localStorage.getItem('dokustick.' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem('dokustick.' + key, JSON.stringify(value)); } catch { /* privater Modus */ }
  },
  remove(key) {
    try { localStorage.removeItem('dokustick.' + key); } catch { /* egal */ }
  },
};

/* ================= Daten: Bausteine & Formulare ================= */

/*
 * Ein Eintrag (Textbaustein oder Formular):
 *   { id, kind: 'module'|'form', title, category, body, team_id, sort, deleted, updated_at, dirty }
 * team_id = null -> eigener Eintrag. dirty > 0 -> noch nicht hochgeladen.
 * Ohne Konto liegen die Eintraege unter "local.items", mit Konto pro Benutzer.
 */
let items = [];
let settings = Object.assign({}, DEFAULT_SETTINGS, store.load('settings', {}));

function newItem(kind, fields = {}) {
  return { id: uid(), kind, title: '', category: '', body: '', team_id: null, sort: Date.now() + Math.random(), deleted: false, updated_at: null, dirty: 0, ...fields };
}

function defaultItems() {
  return [
    ...DEFAULT_MODULES.map((m, i) => newItem('module', { ...m, sort: i })),
    ...DEFAULT_FORMS.map((f, i) => newItem('form', { ...f, sort: i })),
    ...TEMPLATES.filter((t) => t.category === 'ABCDE').map((t, i) => newItem('module', { ...t, sort: 100 + i })),
  ];
}

const itemsKey = () => (cloud.account ? `u.${cloud.account.id}.items` : 'local.items');

function loadItems() {
  let list = store.load(itemsKey(), null);
  if (!list && !cloud.account) {
    // Daten aus der ersten Version uebernehmen
    const oldM = store.load('modules', null), oldF = store.load('forms', null);
    if (oldM || oldF) {
      list = [
        ...(oldM || []).map((m, i) => newItem('module', { title: m.title, category: m.cat || '', body: m.text, sort: i })),
        ...(oldF || []).map((f, i) => newItem('form', { title: f.name, body: f.tpl, sort: i })),
      ];
      store.remove('modules'); store.remove('forms');
    } else {
      list = defaultItems();
    }
  }
  items = list || [];
  saveItems();
}

function saveItems() { store.save(itemsKey(), items); }

// Bausteine und (fruehere) Formulare werden gemeinsam angezeigt; Protokollvorlagen nur mit listItems('protocol')
const listItems = (kind) => items.filter((i) => (kind ? i.kind === kind : i.kind !== 'protocol') && !i.deleted).sort((a, b) => a.sort - b.sort);

function canEdit(it) { return !it.team_id || cloud.isAdmin(it.team_id); }

// Speichert eine Aenderung lokal und stoesst die Synchronisation an
function putItem(it) {
  it.updated_at = new Date().toISOString();
  if (cloud.account) it.dirty = (it.dirty || 0) + 1;
  if (!items.includes(it)) items.push(it);
  saveItems();
  cloud.schedule();
}

function removeItem(it) {
  if (cloud.account) { it.deleted = true; putItem(it); }
  else { items = items.filter((x) => x !== it); saveItems(); }
}

function saveSettings() {
  store.save('settings', settings);
  cloud.settingsChanged();
}

/* ================= Text kodieren ================= */

const pad2 = (n) => String(n).padStart(2, '0');
function expandDynamic(text) {
  const d = new Date();
  return text
    .replaceAll('{DATUM}', `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`)
    .replaceAll('{ZEIT}', `${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
}

function normalize(text) {
  text = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  return [...text].map((c) => NORMALIZE[c] ?? c).join('');
}

function unsupportedChars(text) {
  const bad = new Set();
  for (const c of normalize(text).replace(TOKEN_RE, '')) {
    const code = c.codePointAt(0);
    if ((code >= 0x20 && code <= 0x7E) || SUPPORTED.has(c)) continue;
    bad.add(c);
  }
  return [...bad];
}

// Wandelt Text inkl. Platzhaltern in den Datenstrom der Firmware um
function encode(text) {
  text = expandDynamic(normalize(text));
  const enc = new TextEncoder();
  const out = [];
  const pushText = (s) => { for (const b of enc.encode(s)) out.push(b); };
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m; (m = TOKEN_RE.exec(text));) {
    pushText(text.slice(last, m.index));
    if (m[1].startsWith('PAUSE')) {
      let ms = m[2] ? Number(m[2]) : 500;
      while (ms > 0) { const n = Math.min(255, Math.ceil(ms / 10)); out.push(0, 0xFF, n); ms -= n * 10; }
    } else {
      const [mod, key] = KEYS[m[1]];
      out.push(0, mod, key);
    }
    last = TOKEN_RE.lastIndex;
  }
  pushText(text.slice(last));
  return new Uint8Array(out);
}

/* ================= Bluetooth ================= */

const ble = {
  device: null, cmd: null, stat: null, status: null,
  connecting: false, userDisconnect: false, statusWaiters: [],
  get connected() { return !!(this.device && this.device.gatt.connected && this.cmd); },
};
let sendJob = null; // { total, sent, cancelled }
let sendChain = Promise.resolve();

// iPadOS meldet sich wie ein Mac, hat aber einen Touchscreen
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const BLUEFY_URL = 'https://apps.apple.com/app/id1492822055';

async function copyAppLink() {
  const url = location.href.split('#')[0];
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopiert – in Bluefy oben in die Adresszeile einfügen');
  } catch {
    prompt('Diesen Link in Bluefy öffnen:', url);
  }
}

const isAuthError = (e) => /auth|encrypt|insufficient|pair/i.test(String(e && (e.message || e)));

function parseStatus(dv) {
  const s = {
    flags: dv.getUint8(0), pending: dv.getUint16(1, true), free: dv.getUint16(3, true),
    delay: dv.getUint8(5), version: dv.getUint8(6),
  };
  s.usb = !!(s.flags & 1); s.caps = !!(s.flags & 2); s.typing = !!(s.flags & 4); s.pairing = !!(s.flags & 8);
  ble.status = s;
  ble.statusWaiters.splice(0).forEach((r) => r());
  renderStatus();
}

const waitStatus = (ms) => new Promise((r) => { ble.statusWaiters.push(r); setTimeout(r, ms); });

function useDevice(d) {
  ble.device = d;
  if (!d.dokustickHooked) { d.addEventListener('gattserverdisconnected', onDisconnected); d.dokustickHooked = true; }
}

async function connect() {
  if (!navigator.bluetooth) return renderStatus();
  ble.connecting = true; ble.userDisconnect = false; renderStatus();
  const remembered = !!ble.device;
  try {
    if (!ble.device) useDevice(await navigator.bluetooth.requestDevice({ filters: [{ services: [SVC_UUID] }] }));
    await setupGatt();
    toast('Verbunden');
  } catch (e) {
    handleConnectError(e);
    // Gemerkter Dongle nicht erreichbar: beim naechsten Versuch Auswahl anzeigen
    if (remembered && !isAuthError(e)) ble.device = null;
  } finally {
    ble.connecting = false; renderStatus();
  }
}

async function setupGatt() {
  const server = await ble.device.gatt.connect();
  const svc = await server.getPrimaryService(SVC_UUID);
  const cmd = await svc.getCharacteristic(CMD_UUID);
  ble.stat = await svc.getCharacteristic(STAT_UUID);
  ble.stat.addEventListener('characteristicvaluechanged', (e) => parseStatus(e.target.value));
  // Loest beim ersten Mal die Kopplung aus (verschluesselte Charakteristik)
  await ble.stat.startNotifications();
  parseStatus(await ble.stat.readValue());
  ble.cmd = cmd;
  await writeCmd(new Uint8Array([CMD_DELAY, settings.delay]));
}

function handleConnectError(e) {
  if (e && e.name === 'NotFoundError') return; // Auswahl abgebrochen
  if (isAuthError(e)) {
    toast('Kopplung abgelehnt: Dongle neu einstecken (LED blinkt blau) und erneut verbinden.', 'err');
  } else {
    toast('Verbindung fehlgeschlagen: ' + (e && (e.message || e.name) || e), 'err');
  }
  if (ble.device && ble.device.gatt.connected) ble.device.gatt.disconnect();
  ble.cmd = null;
}

async function onDisconnected() {
  ble.cmd = null; ble.stat = null; ble.status = null;
  if (sendJob) sendJob.cancelled = true;
  renderStatus();
  if (ble.userDisconnect) return;
  // Automatisch erneut verbinden (z.B. kurz ausser Reichweite)
  for (const delay of [500, 1000, 2000, 4000, 8000]) {
    await sleep(delay);
    if (ble.userDisconnect || ble.connected) return;
    try { ble.connecting = true; renderStatus(); await setupGatt(); toast('Wieder verbunden'); return; } catch { /* weiter versuchen */ } finally { ble.connecting = false; renderStatus(); }
  }
}

function disconnect() {
  ble.userDisconnect = true;
  if (ble.device && ble.device.gatt.connected) ble.device.gatt.disconnect();
}

async function writeCmd(bytes) {
  if (!ble.cmd) throw new Error('Nicht verbunden');
  if (ble.cmd.writeValueWithResponse) await ble.cmd.writeValueWithResponse(bytes);
  else await ble.cmd.writeValue(bytes);
}

function send(text) {
  if (!text.trim()) { toast('Kein Text vorhanden'); return false; }
  if (!ble.connected) { toast('Nicht mit dem Dongle verbunden', 'err'); return false; }
  const bad = unsupportedChars(text);
  if (bad.length && !confirm(`Diese Zeichen gibt es auf der deutschen Tastatur nicht und werden ausgelassen:\n\n${bad.join('  ')}\n\nTrotzdem senden?`)) return false;
  const bytes = encode(text);
  sendChain = sendChain.then(() => transmit(bytes)).catch((e) => toast('Senden fehlgeschlagen: ' + (e.message || e), 'err'));
  return true;
}

async function transmit(bytes) {
  const job = sendJob = { total: bytes.length, sent: 0, cancelled: false };
  let free = ble.status ? ble.status.free : 512;
  renderStatus();
  try {
    for (let i = 0; i < bytes.length && !job.cancelled; i += CHUNK) {
      const part = bytes.slice(i, i + CHUNK);
      // Flusskontrolle: nicht mehr schicken, als der Dongle puffern kann
      while (free < part.length + 64 && !job.cancelled) {
        await waitStatus(500);
        if (ble.status) free = ble.status.free;
      }
      const pkt = new Uint8Array(part.length + 1);
      pkt[0] = CMD_DATA; pkt.set(part, 1);
      for (let tries = 0; !job.cancelled; tries++) {
        try { await writeCmd(pkt); break; } catch (e) {
          if (!ble.connected || tries > 40) throw e;
          await sleep(250); // Warteschlange voll -> kurz warten
        }
      }
      free -= part.length;
      job.sent += part.length;
      renderStatus();
    }
    // Warten, bis der Dongle fertig getippt hat
    while (!job.cancelled && ble.connected && ble.status && (ble.status.pending > 0 || ble.status.typing)) {
      await waitStatus(1000);
    }
  } finally {
    if (sendJob === job) sendJob = null;
    renderStatus();
  }
}

async function cancelTyping() {
  if (sendJob) sendJob.cancelled = true;
  try { await writeCmd(new Uint8Array([CMD_CANCEL])); toast('Abgebrochen'); } catch { /* ignorieren */ }
}

function renderStatus() {
  const dot = $('#connDot'), txt = $('#connText'), btn = $('#connBtn'), area = $('#statusArea');
  area.replaceChildren();
  const s = ble.status;
  dot.className = 'dot' + (ble.connected ? (sendJob || (s && s.typing) ? ' busy' : ' on') : '');
  const virtual = !!(ble.device && ble.device.virtual);
  txt.textContent = ble.connecting ? 'Verbinde …' : ble.connected ? (virtual ? 'Virtueller Dongle' : 'Verbunden') : 'Nicht verbunden';
  dot.title = txt.textContent; // auf schmalen Handys ist der Text ausgeblendet
  dot.setAttribute('aria-label', txt.textContent);
  btn.textContent = ble.connected ? 'Trennen' : 'Verbinden';
  btn.className = 'btn small' + (ble.connected ? '' : ' primary');
  btn.disabled = ble.connecting;
  $('#fwVer').textContent = s ? (virtual ? 'virtuell' : 'Version ' + s.version) : '–';
  if (typeof renderVirtual === 'function') renderVirtual();

  if (!navigator.bluetooth && !virtual) {
    if (IS_IOS) {
      // Safari auf iPhone/iPad kann kein Web Bluetooth -> Weg ueber die App Bluefy zeigen
      area.append(el('div', { class: 'note warn' },
        el('div', {}, 'Safari kann auf iPhone und iPad kein Bluetooth für Webseiten. Öffne DokuStick deshalb in der kostenlosen App „Bluefy“.'),
        el('div', { class: 'row', style: 'margin-top:6px' },
          el('a', { class: 'btn small', href: BLUEFY_URL, target: '_blank', rel: 'noopener' }, '1. Bluefy laden'),
          el('button', { type: 'button', class: 'btn small', onclick: copyAppLink }, '2. Link kopieren'))));
    } else {
      area.append(el('div', { class: 'note err' }, 'Dieser Browser unterstützt kein Web Bluetooth. Android: Chrome verwenden. iPhone/iPad: die kostenlose App „Bluefy“ verwenden. Die Seite muss über https geöffnet werden.'));
    }
    // App-Admins koennen trotzdem den virtuellen Dongle verwenden
    btn.disabled = !(cloud.account && cloud.info.is_admin);
    return;
  }
  if (!ble.connected || !s) return;
  if (!s.usb) area.append(el('div', { class: 'note warn' }, 'Dongle ist nicht am Zielgerät eingesteckt (oder das Gerät schläft).'));
  if (s.caps) area.append(el('div', { class: 'note' }, 'Feststelltaste am Zielgerät ist aktiv – wird automatisch ausgeglichen.'));
  if (sendJob || s.typing) {
    const total = sendJob ? sendJob.total : s.pending;
    const done = sendJob ? Math.max(0, sendJob.sent - s.pending) : 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    area.append(el('div', { class: 'progress' },
      el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${pct}%` })),
      el('button', { class: 'btn small danger', onclick: cancelTyping }, 'Abbrechen')));
  }
}

// connectMenu (virtual.js) bietet App-Admins zusaetzlich den virtuellen Dongle an
$('#connBtn').addEventListener('click', () => (ble.connected ? disconnect() : connectMenu()));

/* ================= Diktat ================= */

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;

const VOICE_CMDS = [
  ['neuer absatz', '\n\n'], ['neue zeile', '\n'], ['doppelpunkt', ':'], ['semikolon', ';'], ['fragezeichen', '?'],
  ['ausrufezeichen', '!'], ['schrägstrich', '/'], ['bindestrich', '-'], ['klammer auf', '('], ['klammer zu', ')'],
  ['tabulator', '{TAB}'], ['komma', ','], ['punkt', '.'],
];
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseReplacements() {
  return settings.replacements.split('\n')
    .map((l) => l.split(/=>|→/))
    .filter((p) => p.length === 2 && p[0].trim())
    .map(([a, b]) => [a.trim(), b.trim()]);
}

function processSpeech(t) {
  const rules = [...parseReplacements(), ...(settings.voiceCmds ? VOICE_CMDS : [])];
  for (const [spoken, repl] of rules) {
    t = t.replace(new RegExp(`(^|\\s)${reEscape(spoken)}(?=\\s|$|[.,!?])`, 'giu'), (_, pre) => pre + repl);
  }
  return t.replace(/[ \t]+([.,:;?!)])/g, '$1').replace(/\(\s+/g, '(').replace(/ *\n */g, '\n');
}

function insertDictation(raw) {
  const ta = activeTextArea();
  let ins = processSpeech(raw.trim());
  if (!ins) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const before = ta.value.slice(0, s);
  if (before && !/\s$/.test(before) && !/^[.,:;?!)\n]/.test(ins)) ins = ' ' + ins;
  if (/(^|[.!?]\s*|\n\s*)$/.test(before)) ins = ins.replace(/^(\s*)(\p{Ll})/u, (_, a, b) => a + b.toUpperCase());
  ta.setRangeText(ins, s, e, 'end');
  ta.dispatchEvent(new Event('input'));
}

function updateMicBtn() {
  const b = $('#micBtn');
  b.className = 'btn' + (listening ? ' rec' : '');
  b.textContent = listening ? '■ Stopp' : '🎤 Diktat';
}

function startDictation() {
  if (!SpeechRec) {
    if (!IS_IOS) return toast('Spracheingabe wird von diesem Browser nicht unterstützt', 'err');
    // Auf iPhone/iPad geht die Diktierfunktion der Tastatur immer
    activeTextArea().focus();
    return toast('Tippe auf das Mikrofon 🎤 der Bildschirmtastatur, um zu diktieren.');
  }
  rec = new SpeechRec();
  rec.lang = settings.lang;
  // Einzelne Saetze + automatischer Neustart ist auf Android zuverlaessiger als continuous
  rec.continuous = false;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) insertDictation(r[0].transcript); else interim += r[0].transcript;
    }
    $('#interim').textContent = interim;
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      listening = false; updateMicBtn();
      toast('Kein Zugriff auf das Mikrofon', 'err');
    }
  };
  rec.onend = () => {
    $('#interim').textContent = '';
    if (listening) { try { rec.start(); } catch { listening = false; updateMicBtn(); } }
  };
  listening = true;
  updateMicBtn();
  rec.start();
}

function stopDictation() {
  listening = false;
  if (rec) rec.stop();
  updateMicBtn();
}

$('#micBtn').addEventListener('click', () => (listening ? stopDictation() : startDictation()));

/* ================= Gemeinsame Listen-Bausteine ================= */

// Filter "Alle / Meine / Team X", nur sichtbar, wenn man in einem Team ist
function renderScopeSelect(sel, onChange) {
  const teams = cloud.teams;
  const std = cloud.standardTeam && items.some((i) => i.team_id === cloud.standardTeam && !i.deleted);
  sel.hidden = !teams.length && !std;
  const cur = sel.value || 'all';
  sel.replaceChildren(
    el('option', { value: 'all' }, 'Alle'),
    el('option', { value: 'mine' }, 'Meine'),
    std ? el('option', { value: cloud.standardTeam }, 'Standard') : null,
    ...teams.map((t) => el('option', { value: t.id }, t.name)));
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : 'all';
  sel.onchange = onChange;
}

function inScope(it, scope) {
  if (!scope || scope === 'all') return true;
  if (scope === 'mine') return !it.team_id;
  return it.team_id === scope;
}

function teamBadge(it) {
  if (!it.team_id) return null;
  return el('span', { class: 'badge' + (cloud.isStandard(it.team_id) ? ' std' : '') }, cloud.teamName(it.team_id));
}

// Auswahl, wo ein Eintrag gespeichert wird (nur fuer Team-Admins und App-Admins relevant)
function ownerField(it) {
  const targets = cloud.adminTargets();
  if (!cloud.account || !targets.length) return null;
  return field('Speichern in', el('select', { name: 'owner' },
    el('option', { value: '' }, 'Meine eigenen'),
    ...targets.map((t) => el('option', { value: t.id, selected: it.team_id === t.id }, t.label))));
}

function copyToMine(it) {
  putItem(newItem(it.kind, { title: it.title, category: it.category, body: it.body }));
  renderAll();
  toast('Als eigene Kopie gespeichert');
}

function itemActions(it, extra) {
  return el('div', { class: 'acts' },
    extra,
    canEdit(it)
      ? el('button', { title: 'Bearbeiten', 'aria-label': 'Bearbeiten', onclick: () => editModule(it) }, '✎')
      : el('button', { title: 'Als eigene Kopie speichern', 'aria-label': 'Als eigene Kopie speichern', onclick: () => copyToMine(it) }, '⧉'));
}

/* ================= Textbausteine ================= */

function renderModules() {
  renderScopeSelect($('#modScope'), renderModules);
  const q = $('#modSearch').value.trim().toLowerCase();
  const scope = $('#modScope').value;
  const list = $('#modList');
  list.replaceChildren();
  const all = listItems();
  const shown = all.filter((m) => inScope(m, scope) && (!q || (m.title + ' ' + m.body + ' ' + m.category).toLowerCase().includes(q)));
  if (!shown.length) {
    list.append(el('div', { class: 'empty' }, all.length ? 'Nichts gefunden.' : 'Noch keine Textbausteine. Mit „＋ Neu“ anlegen oder aus den Vorlagen übernehmen.'));
    return;
  }
  const groups = new Map();
  for (const m of shown) {
    const c = m.category || (m.kind === 'form' ? 'Formulare' : 'Allgemein');
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(m);
  }
  for (const [cat, group] of groups) {
    list.append(el('h2', {}, cat));
    list.append(el('div', { class: 'mods' }, group.map((m) => {
      const interactive = formFields(m.body).length > 0;
      // Interaktive Bausteine kommen ins Protokoll, einfache werden sofort getippt
      const tap = () => (interactive ? addToDoc(m) : send(m.body) && toast('Wird getippt: ' + m.title));
      return el('div', { class: 'mod card' },
        el('button', { class: 'send', onclick: tap },
          el('span', { class: 'title' }, m.title, interactive ? el('span', { class: 'badge' }, 'interaktiv') : null, teamBadge(m)),
          el('span', { class: 'prev' }, templatePreview(m.body))),
        itemActions(m, el('button', { title: 'Ins Protokoll', 'aria-label': 'Ins Protokoll', onclick: () => addToDoc(m) }, '↧')));
    })));
  }
}

function editModule(m) {
  const isNew = !m;
  // Ist gerade ein Team gefiltert, in dem man Admin ist, landet der neue Eintrag dort
  m = m || newItem('module', { team_id: cloud.adminTeamOr($('#modScope').value) });
  const cats = [...new Set(listItems().map((x) => x.category).filter(Boolean))];
  const body = el('textarea', { name: 'text', rows: 6, required: true, placeholder: 'z. B. A – Atemwege: ' }, m.body);
  openDialog(isNew ? 'Neuer Baustein' : 'Baustein bearbeiten', [
    field('Titel', el('input', { type: 'text', name: 'title', value: m.title, required: true })),
    field('Kategorie', el('input', { type: 'text', name: 'cat', value: m.category, list: 'catList' }),
      el('datalist', { id: 'catList' }, cats.map((c) => el('option', { value: c })))),
    field('Text', body),
    fieldEditor(body),
    ownerField(m),
    el('p', { class: 'help' }, 'Sondertasten im Text: ', el('code', {}, '{TAB}'), ' ', el('code', {}, '{ENTER}'), ' ', el('code', {}, '{PAUSE}'), ' ', el('code', {}, '{DATUM}'), ' ', el('code', {}, '{ZEIT}')),
  ], {
    onSave: (f) => {
      Object.assign(m, { title: f.title.value.trim(), category: f.cat.value.trim(), body: f.text.value });
      if (f.owner) m.team_id = f.owner.value || null;
      putItem(m);
      renderModules();
    },
    onDelete: isNew ? null : () => { removeItem(m); renderModules(); },
  });
}

$('#modSearch').addEventListener('input', renderModules);
$('#modAdd').addEventListener('click', () => editModule(null));
$('#modTemplates').addEventListener('click', () => openTemplates());

/* ================= Dialog ================= */

function field(label, ...inputs) {
  return el('label', { class: 'field' }, el('span', {}, label), ...inputs);
}

// Dialog mit Formular; ohne onSave nur mit "Schliessen"
function openDialog(title, content, { onSave, onDelete, saveLabel = 'Speichern', cancelLabel = 'Abbrechen' } = {}) {
  const dlg = $('#dlg'), form = $('#dlgForm');
  form.replaceChildren(
    el('h3', {}, title),
    ...content,
    el('div', { class: 'row', style: 'margin-top:8px' },
      onDelete ? el('button', { type: 'button', class: 'btn danger', onclick: () => {
        if (confirm('Wirklich löschen?')) { onDelete(); dlg.close(); }
      } }, 'Löschen') : null,
      el('span', { class: 'grow' }),
      el('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, onSave ? cancelLabel : 'Schließen'),
      onSave ? el('button', { type: 'submit', class: 'btn primary' }, saveLabel) : null));
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!onSave) return dlg.close();
    // onSave darf false liefern, um den Dialog offen zu lassen (z.B. bei Fehlern)
    if ((await onSave(form.elements)) !== false) dlg.close();
  };
  if (!dlg.open) dlg.showModal();
}

/* ================= Einstellungen ================= */

function applyTheme() {
  if (settings.theme) document.documentElement.dataset.theme = settings.theme;
  else delete document.documentElement.dataset.theme;
}

function renderSettings() {
  $('#delay').value = settings.delay;
  $('#delayVal').textContent = settings.delay;
  $('#lang').value = settings.lang;
  $('#voiceCmds').checked = settings.voiceCmds;
  $('#blankLine').checked = settings.blankLine;
  $('#replacements').value = settings.replacements;
  $('#theme').value = settings.theme;
  renderSpellState();
}

async function sendDelay() {
  if (ble.connected) { try { await writeCmd(new Uint8Array([CMD_DELAY, settings.delay])); } catch { /* ignorieren */ } }
}

$('#delay').addEventListener('input', (e) => { $('#delayVal').textContent = e.target.value; });
$('#delay').addEventListener('change', (e) => { settings.delay = Number(e.target.value); saveSettings(); sendDelay(); });
$('#lang').addEventListener('change', (e) => { settings.lang = e.target.value; saveSettings(); });
$('#voiceCmds').addEventListener('change', (e) => { settings.voiceCmds = e.target.checked; saveSettings(); });
$('#blankLine').addEventListener('change', (e) => { settings.blankLine = e.target.checked; saveSettings(); });
$('#replacements').addEventListener('change', (e) => { settings.replacements = e.target.value; saveSettings(); });
$('#theme').addEventListener('change', (e) => { settings.theme = e.target.value; store.save('settings', settings); applyTheme(); });
$('#unpairBtn').addEventListener('click', async () => {
  if (!ble.connected) return toast('Nicht mit dem Dongle verbunden', 'err');
  if (!confirm('Alle gekoppelten Handys am Dongle löschen? Danach ist der Dongle wieder frei koppelbar. Entferne „DokuStick“ anschließend auch in den Bluetooth-Einstellungen dieses Handys.')) return;
  ble.userDisconnect = true;
  try { await writeCmd(new Uint8Array([CMD_UNPAIR])); toast('Kopplungen gelöscht'); } catch (e) { toast('Fehlgeschlagen: ' + e.message, 'err'); }
});
// Notfall: Offline-Speicher leeren und frisch laden (Daten und Anmeldung bleiben erhalten)
$('#hardReloadBtn').addEventListener('click', async () => {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch { /* egal */ }
  location.replace(location.pathname + '?neu=' + Date.now());
});
$('#testBtn').addEventListener('click', () => send('Test äöü ÄÖÜ ß @ € {[]} \\ | ~ ^ ° ² µ 123'));

// Beim Export bleiben nur Inhalte; Besitz und Sync-Status gehen nicht mit.
// Die ID braucht der Import, um die Bausteine in Protokollvorlagen zuzuordnen.
const exportable = (it) => ({ id: it.id, kind: it.kind, title: it.title, category: it.category, body: it.body });

$('#exportBtn').addEventListener('click', () => {
  const data = JSON.stringify({ app: 'dokustick', version: 2, items: items.filter((i) => !i.deleted).map(exportable), settings }, null, 2);
  const a = el('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: 'dokustick-backup.json' });
  document.body.append(a); a.click(); a.remove();
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());

// Ersetzt die eigenen Eintraege; Team-Eintraege bleiben unberuehrt
function replaceOwnItems(newList) {
  for (const it of items.filter((i) => !i.team_id && !i.deleted)) removeItem(it);
  // Neue IDs; Verweise in Protokollvorlagen auf mitimportierte Bausteine umstellen
  const created = newList.map((x, i) => newItem(x.kind, { title: x.title || '', category: x.category || '', body: x.body || '', sort: Date.now() + i }));
  const newId = new Map(newList.map((x, i) => [x.id, created[i].id]).filter(([old]) => old));
  for (const it of created) {
    if (it.kind === 'protocol') it.body = protocols.body(protocols.ids(it).map((id) => newId.get(id) || id));
    putItem(it);
  }
}

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'dokustick') throw new Error('Keine DokuStick-Sicherung');
    // Version 1 hatte getrennte Listen
    const list = data.items || [
      ...(data.modules || []).map((m) => ({ kind: 'module', title: m.title, category: m.cat, body: m.text })),
      ...(data.forms || []).map((f) => ({ kind: 'form', title: f.name, body: f.tpl })),
    ];
    if (!confirm('Deine eigenen Textbausteine und Formulare werden ersetzt. Fortfahren?')) return;
    replaceOwnItems(list.filter((x) => ['module', 'form', 'protocol'].includes(x.kind)));
    Object.assign(settings, data.settings || {});
    saveSettings(); renderAll(); toast('Import erfolgreich');
  } catch (err) {
    toast('Import fehlgeschlagen: ' + err.message, 'err');
  }
});
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('Alle eigenen Textbausteine, Formulare und Einstellungen auf den Auslieferungszustand zurücksetzen?')) return;
  replaceOwnItems([...DEFAULT_MODULES.map((m) => ({ kind: 'module', ...m })), ...DEFAULT_FORMS.map((f) => ({ kind: 'form', ...f }))]);
  settings = Object.assign({}, DEFAULT_SETTINGS);
  saveSettings(); renderAll(); toast('Zurückgesetzt');
});

/* ================= Navigation & Start ================= */

function showTab(name) {
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name));
  document.querySelectorAll('main > section').forEach((s) => (s.hidden = s.id !== 'tab-' + name));
  try { sessionStorage.setItem('dokustick.tab', name); } catch { /* egal */ }
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

function renderItems() {
  renderModules();
  protocols.renderButton();
}

function renderAll() {
  applyTheme(); renderSettings(); renderItems(); renderDoc(); renderStatus(); cloud.render();
}

function boot() {
  loadItems();
  renderAll();
  try { const t = sessionStorage.getItem('dokustick.tab'); if (t) showTab(t === 'admin' ? 'settings' : t); } catch { /* egal */ }

  // Bereits erlaubten Dongle merken, damit "Verbinden" ohne Geraeteauswahl klappt
  if (navigator.bluetooth && navigator.bluetooth.getDevices) {
    navigator.bluetooth.getDevices().then((devs) => {
      const d = devs.find((x) => x.name === 'DokuStick') || devs[0];
      if (d && !ble.device) useDevice(d);
    }).catch(() => {});
  }

  // Woerterbuch im Hintergrund laden (beim ersten Mal ca. 2 MB, danach aus dem Offline-Speicher)
  if (spell.enabled) setTimeout(() => spell.load().catch(() => {}), 1500);

  $('#appVer').textContent = APP_VERSION;
  $('#hdrVer').textContent = 'v' + APP_VERSION;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    // Neue Version uebernommen -> einmal neu laden (Protokoll bleibt in der Sitzung erhalten)
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloading && !sendJob) { reloading = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
  }
  catalog.load(); // gespeicherte Datenbank fuer die Offline-Suche
  cloud.start();
}
