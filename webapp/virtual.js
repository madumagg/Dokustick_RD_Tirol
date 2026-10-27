'use strict';

/*
 * Virtueller Dongle (nur fuer App-Admins, zum Testen ohne Hardware).
 *
 * Nimmt denselben Datenstrom entgegen wie der echte Dongle und wertet ihn
 * wie die Firmware aus (UTF-8, Sondertasten, nicht tippbare Zeichen fallen weg).
 * Die "getippte" Ausgabe wird angezeigt und kann als PDF gespeichert werden.
 */

// Anzeige fuer Sondertasten: [Modifier, HID-Code] -> Beschriftung
const VKEY_LABELS = Object.fromEntries(Object.entries(KEYS).map(([name, [mod, key]]) => [`${mod},${key}`, name]));
const VKEY_NAMES = { 'TAB': 'Tab', 'SHIFT+TAB': 'Shift+Tab', 'ESC': 'Esc', 'BACKSPACE': 'Rücktaste', 'DEL': 'Entf', 'HOME': 'Pos1', 'END': 'Ende', 'RIGHT': 'Pfeil rechts', 'LEFT': 'Pfeil links', 'DOWN': 'Pfeil runter', 'UP': 'Pfeil hoch' };

// Wie keymap_de.c: typografische Zeichen werden ersetzt, alles andere ohne Taste faellt weg
const VTYPO = { ' ': ' ', ' ': ' ', ' ': ' ', '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '‚': "'", '–': '-', '—': '-', '−': '-', '…': '...', 'μ': 'µ' };

const vdongle = {
  out: [],       // Abschnitte: { t: 'text', s } | { t: 'key', s } | { t: 'pause', ms }
  dropped: new Set(),
  keystrokes: 0,
  sends: 0,
  // Zustand des Decoders wie in typer.c
  utf8: [], need: 0, esc: 0, escMod: 0,

  reset() {
    this.out = []; this.dropped = new Set(); this.keystrokes = 0; this.sends = 0;
    this.utf8 = []; this.need = 0; this.esc = 0;
    renderVirtual();
  },

  pushText(s) {
    const last = this.out[this.out.length - 1];
    if (last && last.t === 'text') last.s += s; else this.out.push({ t: 'text', s });
  },

  typeChar(c) {
    const code = c.codePointAt(0);
    if (c === '\r') return;
    if (c === '\n') { this.keystrokes++; return this.pushText('\n'); }
    if (c === '\t') { this.keystrokes++; return this.out.push({ t: 'key', s: 'Tab' }); }
    const m = VTYPO[c];
    if (m !== undefined) { this.keystrokes += m.length; return this.pushText(m); }
    if ((code >= 0x20 && code <= 0x7E) || SUPPORTED.has(c)) { this.keystrokes++; return this.pushText(c); }
    this.dropped.add(c);
  },

  feed(bytes) {
    for (const b of bytes) {
      if (this.esc === 1) { this.escMod = b; this.esc = 2; continue; }
      if (this.esc === 2) {
        this.esc = 0;
        if (this.escMod === 0xFF) { this.out.push({ t: 'pause', ms: b * 10 }); continue; }
        this.keystrokes++;
        if (this.escMod === 0 && b === 0x28) { this.pushText('\n'); continue; }
        const name = VKEY_LABELS[`${this.escMod},${b}`];
        this.out.push({ t: 'key', s: name ? VKEY_NAMES[name] || name : `Taste ${b.toString(16)}` });
        continue;
      }
      if (b === 0x00) { this.esc = 1; this.utf8 = []; this.need = 0; continue; }
      if (this.need) {
        this.utf8.push(b);
        if (--this.need === 0) { this.typeChar(new TextDecoder().decode(new Uint8Array(this.utf8))); this.utf8 = []; }
        continue;
      }
      if (b < 0x80) this.typeChar(String.fromCharCode(b));
      else { this.utf8 = [b]; this.need = b >= 0xF0 ? 3 : b >= 0xE0 ? 2 : 1; }
    }
  },

  // Entspricht writeValueWithResponse der Befehls-Charakteristik
  async write(pkt) {
    if (pkt[0] === CMD_DATA) this.feed(pkt.slice(1));
    else if (pkt[0] === CMD_CANCEL) { this.utf8 = []; this.need = 0; this.esc = 0; }
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(renderVirtual, 50);
  },
};

/* ---------- Verbinden ---------- */

function connectVirtual() {
  const device = {
    name: 'Virtueller Dongle',
    virtual: true,
    gatt: { connected: true, disconnect() { this.connected = false; ble.device = null; onDisconnected(); } },
  };
  ble.device = device;
  ble.cmd = { writeValueWithResponse: (b) => vdongle.write(b) };
  ble.stat = null;
  ble.status = { flags: 1, pending: 0, free: 4096, delay: settings.delay, version: 0, usb: true, caps: false, typing: false, pairing: false };
  ble.userDisconnect = false;
  renderStatus();
  renderVirtual();
  toast('Virtueller Dongle verbunden');
}

// Admins duerfen zwischen echtem und virtuellem Dongle waehlen
function connectMenu() {
  if (!(cloud.account && cloud.info.is_admin)) return connect();
  openDialog('Verbinden mit …', [
    el('div', { class: 'pick-list' },
      el('button', { type: 'button', class: 'pick', disabled: !navigator.bluetooth, onclick: () => { $('#dlg').close(); if (ble.device && ble.device.virtual) ble.device = null; connect(); } },
        el('span', { class: 'grow' }, el('b', {}, 'ProtoPilot-Stick (Bluetooth)'), el('span', { class: 'help', style: 'display:block' }, navigator.bluetooth ? 'Echter Dongle am Zielgerät' : 'In diesem Browser nicht verfügbar'))),
      el('button', { type: 'button', class: 'pick', onclick: () => { $('#dlg').close(); connectVirtual(); } },
        el('span', { class: 'grow' }, el('b', {}, 'Virtueller Dongle (Test)'), el('span', { class: 'help', style: 'display:block' }, 'Zeigt an, was getippt würde, und speichert es als PDF')))),
  ]);
}

/* ---------- Anzeige ---------- */

function renderVirtual() {
  const box = $('#virtualOut');
  const on = !!(ble.device && ble.device.virtual && ble.connected);
  box.hidden = !on;
  if (!on) return;
  const screen = el('div', { class: 'vscreen' });
  for (const p of vdongle.out) {
    if (p.t === 'text') screen.append(p.s);
    else if (p.t === 'key') screen.append(el('span', { class: 'vkey' }, p.s));
  }
  if (!vdongle.out.length) screen.append(el('span', { class: 'help' }, 'Noch nichts getippt. „Alles senden“ oder einen Baustein senden.'));
  box.replaceChildren(...kids(
    el('div', { class: 'row', style: 'margin-bottom:8px' },
      el('strong', { class: 'grow' }, 'Virtueller Dongle – Ausgabe'),
      el('span', { class: 'help' }, `${vdongle.keystrokes} Anschläge`)),
    screen,
    vdongle.dropped.size ? el('p', { class: 'note warn', style: 'margin:8px 0 0' }, 'Ausgelassen (keine Taste auf deutscher Tastatur): ' + [...vdongle.dropped].join(' ')) : null,
    el('div', { class: 'row', style: 'margin-top:10px' },
      el('button', { type: 'button', class: 'btn small', onclick: () => vdongle.reset() }, 'Ausgabe leeren'),
      el('span', { class: 'grow' }),
      el('button', { type: 'button', class: 'btn small primary', onclick: exportVirtualPdf, disabled: !vdongle.out.length }, 'Als PDF speichern'))));
}

/* ---------- PDF ---------- */

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    document.head.append(el('script', { src, onload: res, onerror: () => rej(new Error('PDF-Bibliothek konnte nicht geladen werden')) }));
  });
}

async function exportVirtualPdf() {
  try {
    await loadScript('vendor/jspdf.umd.min.js');
  } catch (e) { return toast(e.message, 'err'); }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 18, maxW = W - 2 * M, LH = 5.6;
  const now = new Date();
  const stamp = now.toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
  let y = M;

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
  pdf.text('ProtoPilot – Testausgabe (virtueller Dongle)', M, y); y += 7;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100);
  pdf.text(`Erstellt: ${stamp}   ·   Benutzer: ${cloud.account ? cloud.account.email : '–'}   ·   Anschläge: ${vdongle.keystrokes}   ·   Tippverzögerung: ${settings.delay} ms`, M, y); y += 4;
  if (vdongle.dropped.size) {
    // Standardschrift kennt z.B. keine Emojis -> als Unicode-Code ausgeben
    const names = [...vdongle.dropped].map((c) => (/^[\u0020-\u00ff]$/.test(c) ? c : 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')));
    pdf.text('Ausgelassene Zeichen (keine Taste): ' + names.join(' '), M, y); y += 4;
  }
  pdf.text('[ ] = Sondertaste, z. B. [Tab]. Zeilenumbrüche entsprechen der Enter-Taste.', M, y); y += 3;
  pdf.setDrawColor(200); pdf.line(M, y, W - M, y); y += 7;

  // Text mit Sondertasten als [Name], umgebrochen auf die Seitenbreite
  const full = vdongle.out.map((p) => (p.t === 'text' ? p.s : p.t === 'key' ? `[${p.s}]` : '')).join('');
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); pdf.setTextColor(20);
  for (const para of full.split('\n')) {
    const lines = para ? pdf.splitTextToSize(para, maxW) : [''];
    for (const line of lines) {
      if (y > 297 - M - 8) { pdf.addPage(); y = M; }
      pdf.text(line, M, y);
      y += LH;
    }
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(140);
    pdf.text(`Seite ${i} von ${pages}`, W - M, 297 - 8, { align: 'right' });
    pdf.text('Nur für Testzwecke – keine Patientendaten', M, 297 - 8);
  }
  const pad = (n) => String(n).padStart(2, '0');
  pdf.save(`protopilot-test-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.pdf`);
  toast('PDF gespeichert');
}
