'use strict';

/*
 * Support & Feedback (Einstellungen): Tickets an die App-Admins (Frage, Fehler,
 * Vorschlag), Ideen zum Abstimmen, haeufige Fragen und "Was ist neu".
 *
 * Tickets laufen ueber Datenbankfunktionen (supabase/migrations/*_support.sql),
 * die selbst pruefen, wer was sehen darf. Die Bearbeitung durch App-Admins
 * steht in admin.js (Reiter "Support").
 */

// "Was ist neu": Neuerungen fuer Benutzer pro Version, neueste zuerst.
// Bei jeder Version mit sichtbaren Neuerungen hier einen Eintrag ergaenzen.
const NEWS = [
  { v: '0.47', items: ['Behoben: Im Theme Liquid Glass stand auf dem iPad in Dialogen (z. B. „Krankheit hinzufügen“) der Text bzw. der Cursor neben dem Eingabefeld. Dialoge sind dort jetzt fast deckend statt gläsern.'] },
  { v: '0.46', items: ['Arzneimittellisten: Dosierung und Hinweise (z. B. Kontraindikationen) dürfen jetzt bis 2000 Zeichen lang sein, Zeilenumbrüche bleiben erhalten. Neu ist ein Link für mehr Infos, z. B. ins Medikamentenlexikon, der in der Datenbank und im Baustein erscheint.'] },
  { v: '0.45', items: [
    'ProtoPilot startet jetzt mit einer Anmeldeseite: anmelden, registrieren, Link zu protopilot.at und „Was ist neu“. Die App selbst sieht man nur angemeldet. Offline bleibt man angemeldet.',
    'Neu: Vorschau. Die App mit Beispiel-Bausteinen ausprobieren, ohne Konto. Gesendet und gespeichert wird dabei nichts, „Senden“ zeigt nur, was getippt würde.',
    'Der Hinweis an alle erscheint nur noch für angemeldete Benutzer.'] },
  { v: '0.44', items: ['Administration: Superadmins. Sie sind geschützt, niemand kann ihnen die Rechte entziehen, sie sperren oder löschen. Nur ein Superadmin ernennt weitere Superadmins.'] },
  { v: '0.43', items: [
    'Neue Vorlagen nach dem SAN-Protokoll Tirol: „c – Kritische Blutung“ (inkl. V.a. HWS-Verletzung), „TNC – Traumacheck“ und „Verlauf“ (Bausteine → Vorlagen).',
    'Bleibt ein Pflichtfeld leer, bleiben Beschriftung und Satz in der Vorschau stehen, damit man sieht, was noch fehlt. Wegfallen tun sie nur bei optionalen Feldern.'] },
  { v: '0.42', items: ['Fester Text nur mit Auswahl: Ist in einem Satz mit optionalem Feld nichts gewählt, fällt der ganze Satz weg. Ein Baustein wie „Monitoring [SpO2 | EKG | NIBP] angelegt.“ erscheint ohne Auswahl nicht im Protokoll.'] },
  { v: '0.41', items: ['Neue Vorlage „Medikamente Arzneimittelliste 2 (ohne Venenzugang)“, z. B. für den Penthrox Inhaler, wenn kein Venenzugang möglich ist (Bausteine → Vorlagen → Maßnahmen).'] },
  { v: '0.40', items: ['Behoben: Bei Bausteinen, die direkt in der Datenbank eingetragen wurden, entstand eine leere Zeile im Text, wenn eine optionale Angabe (z. B. „Dosis“) leer blieb.'] },
  { v: '0.39', items: [
    'Neu im Reiter Datenbank: „Arzneimittellisten“ mit Liste 1 und Liste 2 (RD Tirol), nach Krankheitsbild geordnet, mit Dosierung und Kontraindikationen. Neue Medikamente lassen sich ergänzen.',
    'Neue Vorlagen „Venenzugang und Medikamente (Liste 2)“ und „Medikamente Arzneimittelliste 1“: Medikament und Krankheitsbild antippen, die Aufklärung steht schon drin.',
    'Wählt man zuerst das Medikament, wird das Krankheitsbild automatisch eingetragen. Unter der Auswahl stehen Dosierung und Kontraindikationen.',
    'Leere optionale Angaben mit Beschriftung (z. B. „Dosis:“) fallen im Text ganz weg, und nach „i.v.“ steht kein doppelter Punkt mehr.'] },
  { v: '0.38', items: ['Vorbereitung für Themes: neue Designs, die über die ganze App gelegt werden. Sie werden nach und nach freigeschaltet und erscheinen dann in den Einstellungen unter „Allgemein → Theme“.'] },
  { v: '0.37', items: ['DokuStick heißt jetzt ProtoPilot: neuer Name und neues Logo. Deine Bausteine, Einstellungen und die Anmeldung bleiben erhalten.', 'Ältere Sticks funktionieren weiter. Mit der neuen Firmware (Version 4) heißt der Stick auch in den Bluetooth-Einstellungen „ProtoPilot“.'] },
  { v: '0.36', items: ['Baustein-Editor: Beim Tippen im Text schließt sich die iPad-Tastatur nicht mehr nach jedem Buchstaben.', 'Fester Text wird immer ein eigener, verschiebbarer Abschnitt, auch wenn er klein beginnt; kein doppelter Punkt mehr am Ende.'] },
  { v: '0.35', items: ['Läuft die Anmeldung ab, bleiben noch nicht hochgeladene Änderungen auf dem Gerät und werden nach dem erneuten Anmelden hochgeladen. Die E-Mail-Adresse ist dann schon eingetragen.'] },
  { v: '0.34', items: ['Baustein-Editor: Beim Verschieben verschmelzen keine Abschnitte mehr. Ein Feld vor der Überschrift ist ein eigener Abschnitt.', '„＋ Feld“ fügt ans Ende ein, wenn man vorher nicht ins Textfeld getippt hat (statt vor die Überschrift).'] },
  { v: '0.33', items: ['Behoben: Einfache Textbausteine (ohne Felder) wurden im Protokoll an den Freitext angehängt. Jetzt kommen sie als eigener Block ans Ende und lassen sich einzeln verschieben.'] },
  { v: '0.32', items: ['„Alles senden“ fragt vorher nach: nur tatsächlich Erhobenes dokumentieren. Werte, die noch unverändert aus der Vorauswahl stammen, werden aufgelistet.'] },
  { v: '0.31', items: ['Behoben: An einigen Stellen stand „null“, z. B. im Baustein-Editor bei Bausteinen ohne Felder und am Admin-Reiter „Support“.'] },
  { v: '0.30', items: [
    'Support & Feedback in den Einstellungen: Fragen stellen, Fehler melden und Vorschläge einbringen – die Antwort kommt direkt in der App.',
    '💡 Ideen: veröffentlichte Vorschläge ansehen und mit 👍 unterstützen.',
    'Häufige Fragen und diese Übersicht „Was ist neu“.'] },
  { v: '0.29', items: ['Baustein-Editor: direkt aneinanderhängende Felder lassen sich trennen und einzeln verschieben.'] },
  { v: '0.28', items: ['Baustein-Editor: Abschnitte (Feld samt Beschriftung) per Ziehen umsortieren.'] },
  { v: '0.27', items: ['Feld-Editor: „Fester Text“, der immer mitgeschrieben wird.'] },
  { v: '0.26', items: ['Vorlage GCS: die Punkte werden automatisch zusammengezählt.'] },
  { v: '0.25', items: ['Der Freitext ist im Protokoll oben angeheftet (📌) und lässt sich trotzdem verschieben.'] },
  { v: '0.24', items: ['Rechtschreibprüfung: auch Groß-/Kleinschreibung und doppelte Wörter.'] },
  { v: '0.23', items: ['Rechtschreibprüfung offline auf dem Gerät, mit medizinischen Fachbegriffen.'] },
  { v: '0.22', items: ['📋 Protokollvorlagen: mehrere Bausteine mit einem Tipp einfügen.', 'Standard-Bausteine für alle, als eigene Kopie anpassbar.', 'Medikamentenliste Österreich in der Datenbank.'] },
];

const TICKET_CATS = { frage: 'Frage / Problem', fehler: 'Fehler', vorschlag: 'Vorschlag' };
const TICKET_STATUS = { offen: 'Offen', in_arbeit: 'In Bearbeitung', rueckfrage: 'Wartet auf Rückmeldung', erledigt: 'Erledigt' };
const IDEA_STATUS = { offen: 'Neu', rueckfrage: 'Neu', in_arbeit: 'In Arbeit', erledigt: 'Umgesetzt' };
const TICKET_HINTS = {
  frage: ['z. B. Wie lege ich eine Protokollvorlage an?', 'Worum geht es? Was hast du schon versucht?'],
  fehler: ['z. B. Dongle tippt Umlaute falsch', 'Was hast du gemacht? Was ist passiert? Was hättest du erwartet?'],
  vorschlag: ['z. B. Baustein für Schmerzskala', 'Was soll besser werden und wofür brauchst du es im Einsatz?'],
};

// Wurde die App vor diesem Start schon benutzt? Nur dann "Was ist neu" zeigen.
const USED_BEFORE = !!(store.load('local.items', null) || store.load('account', null));

function verCmp(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
const fmtWhen = (s) => new Date(s).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Status aus Sicht der Person, die das Ticket erstellt hat
const statusBadge = (s, forUser) => el('span', { class: 'badge' + (s === 'rueckfrage' ? ' warn' : s === 'erledigt' ? ' ok' : '') },
  forUser && s === 'rueckfrage' ? 'Wartet auf deine Antwort' : TICKET_STATUS[s] || s);

// Geraeteinfos fuer Fehlermeldungen (die Person sieht vor dem Senden genau diesen Text)
function deviceInfo() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'unbekannt';
  const osVer = ((ua.match(/(?:iPhone OS|CPU OS|Android|Windows NT|Mac OS X) ([\d._]+)/) || [])[1] || '').replace(/_/g, '.');
  const browser = /Bluefy/i.test(ua) ? 'Bluefy' : /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'unbekannt';
  const installed = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const s = ble.status;
  return [
    ['App-Version', APP_VERSION],
    ['Gerät', os + (osVer ? ' ' + osVer : '')],
    ['Browser', browser + (installed ? ' (als App installiert)' : '')],
    ['Bildschirm', `${screen.width}×${screen.height}, Faktor ${window.devicePixelRatio || 1}`],
    ['Bluetooth', navigator.bluetooth ? 'verfügbar' : 'nicht verfügbar'],
    ['Dongle', ble.connected ? (ble.device.virtual ? 'virtuell' : 'verbunden') + (s && !ble.device.virtual ? `, Firmware ${s.version}, ${s.usb ? 'am Zielgerät eingesteckt' : 'nicht am Zielgerät'}` : '') : 'nicht verbunden'],
    ['Tippverzögerung', settings.delay + ' ms'],
    ['Diktat', SpeechRec ? settings.lang : 'nicht verfügbar'],
    ['Rechtschreibung', settings.spellcheck ? 'an' : 'aus'],
    ['Online', navigator.onLine ? 'ja' : 'nein'],
    ['User-Agent', ua],
  ].map(([k, v]) => `${k}: ${v}`).join('\n');
}

const support = {
  counts: { unread: 0, admin_new: 0, admin_mine: 0 },
  tickets: null,      // eigene Tickets (null = noch nicht geladen)
  available: true,    // false, solange auf dem Server die Migration *_support.sql fehlt
  faq: store.load('supportFaq', []),
  faqAt: 0,
  polling: null,
  polledAt: 0,
  polledFor: null,    // Konto, fuer das die Zahlen gelten (neue Antwort -> Hinweis)

  get badge() { return (this.counts.unread || 0) + (cloud.info.is_admin ? this.adminBadge : 0); },
  get adminBadge() { return (this.counts.admin_new || 0) + (this.counts.admin_mine || 0); },

  async rpc(fn, args) {
    const { data, error } = await cloud.sb.rpc(fn, args);
    if (error) throw error;
    return data;
  },
  // Funktion oder Tabelle fehlt auf dem Server (Migration noch nicht ausgefuehrt)
  missing(e) { return !!e && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(e.code); },

  reset() {
    this.counts = { unread: 0, admin_new: 0, admin_mine: 0 };
    this.tickets = null;
    this.polledFor = null;
  },

  // Abzeichen, eigene Tickets und haeufige Fragen laden (nach jedem Sync)
  poll() {
    if (!this.polling) this.polling = this.load().catch(() => {}).finally(() => { this.polling = null; });
    return this.polling;
  },
  async load() {
    if (!cloud.sb || !navigator.onLine) return;
    this.polledAt = Date.now();
    if (Date.now() - this.faqAt > 3600e3) this.loadFaq();
    const acc = cloud.account;
    if (!acc) { this.reset(); this.render(); return; }
    try {
      const [counts, tickets] = await Promise.all([this.rpc('support_counts'), this.rpc('support_my_tickets')]);
      if (cloud.account !== acc) return;
      const before = this.polledFor === acc.id ? this.counts : null;
      this.counts = counts;
      this.tickets = tickets;
      this.available = true;
      this.polledFor = acc.id;
      if (before && counts.unread > before.unread) toast('Neue Antwort vom Support (Einstellungen)');
      else if (before && cloud.info.is_admin && counts.admin_new > before.admin_new) toast('Neues Support-Ticket');
    } catch (e) {
      if (this.missing(e)) this.available = false;
    }
    this.render();
    admin.renderTabBadge();
  },
  async loadFaq() {
    if (!cloud.sb) return false;
    const { data, error } = await cloud.sb.from('support_faq').select('id, question, answer, sort').order('sort').order('question');
    if (error || !data) return false;
    this.faqAt = Date.now();
    const changed = JSON.stringify(data) !== JSON.stringify(this.faq);
    this.faq = data;
    store.save('supportFaq', data);
    return changed;
  },

  /* ---------- Einstellungen: Karte "Support & Feedback" ---------- */

  render() {
    const card = $('#supportCard');
    if (!card) return;
    const n = this.badge, nav = $('#setNavBadge');
    nav.hidden = !n;
    nav.textContent = n > 99 ? '99+' : n;
    this.renderAdminCard();
    card.replaceChildren();
    const btn = (label, onclick, cls = 'btn') => el('button', { type: 'button', class: cls, onclick }, label);
    const more = el('div', { class: 'row', style: 'margin-top:12px' },
      btn('❓ Häufige Fragen', () => this.showFaq()),
      btn('✨ Was ist neu', () => this.showNews()));

    if (!cloud.enabled || !cloud.account) {
      card.append(el('p', { class: 'help', style: 'margin-top:0' }, cloud.enabled
        ? 'Melde dich oben an, um Fragen zu stellen, Fehler zu melden oder Vorschläge einzubringen.'
        : 'Tickets brauchen die Cloud-Synchronisierung.'), more);
      return;
    }
    if (!this.available) {
      card.append(el('p', { class: 'note', style: 'margin-top:0' }, 'Support ist auf dem Server noch nicht eingerichtet.'), more);
      return;
    }
    const list = el('div', { class: 'mods', style: 'margin-top:12px' });
    if (!this.tickets) list.append(el('div', { class: 'help' }, navigator.onLine ? 'Lade Tickets …' : 'Tickets sind nur online sichtbar.'));
    else if (!this.tickets.length) list.append(el('div', { class: 'help' }, 'Noch keine Tickets.'));
    else {
      for (const t of this.tickets) {
        list.append(el('div', { class: 'mod card ticket' + (t.unread ? ' unread' : '') },
          el('button', { type: 'button', class: 'send', onclick: () => this.open(t.id) },
            el('span', { class: 'title' }, t.title, t.unread ? el('span', { class: 'badge bad' }, 'Neue Antwort') : null),
            el('span', { class: 'prev' }, TICKET_CATS[t.category] + ' · ', statusBadge(t.status, true), ' · ' + fmtWhen(t.last_activity)))));
      }
    }
    card.append(
      el('p', { class: 'help', style: 'margin-top:0' }, 'Fragen stellen, Fehler melden oder Vorschläge einbringen – die Admins antworten hier.'),
      el('div', { class: 'row' },
        btn('＋ Neues Ticket', () => this.create(), 'btn primary'),
        btn('💡 Ideen', () => this.ideas())),
      list, more);
  },

  // Hinweis in der Administrations-Karte der Einstellungen
  renderAdminCard() {
    const box = $('#adminSupport');
    if (!box) return;
    box.replaceChildren();
    if (!cloud.account || !cloud.info.is_admin || !this.available) return;
    const { admin_new: neu = 0, admin_mine: mine = 0 } = this.counts;
    const parts = [neu ? `${neu} nicht zugewiesen` : null, mine ? `${mine} mit neuer Nachricht für dich` : null].filter(Boolean);
    box.append(el('div', { class: 'row', style: 'margin-top:10px' },
      el('span', { class: 'grow help' }, 'Support-Tickets: ' + (parts.join(', ') || 'nichts Neues')),
      el('button', { type: 'button', class: 'btn small', onclick: () => admin.open('support') }, 'Tickets', this.adminBadge ? el('span', { class: 'badge bad' }, String(this.adminBadge)) : null)));
  },

  /* ---------- Neues Ticket ---------- */

  create(category = 'frage') {
    if (!cloud.account) return toast('Bitte zuerst anmelden.', 'err');
    let cat = category;
    const title = el('input', { type: 'text', name: 'title', required: true, maxlength: 200 });
    const body = el('textarea', { name: 'body', rows: 6, required: true, maxlength: 5000 });
    const attach = el('input', { type: 'checkbox', name: 'device', checked: true });
    const info = deviceInfo();
    const ideaHint = el('p', { class: 'help', style: 'margin:0 0 8px' }, 'Gibt es das schon? Unter ',
      el('button', { type: 'button', class: 'linkish', style: 'padding:0', onclick: () => this.ideas() }, '💡 Ideen'),
      ' kannst du bestehenden Vorschlägen mit 👍 zustimmen.');
    const seg = el('div', { class: 'seg seg-3', role: 'tablist' });
    const drawCat = () => {
      seg.replaceChildren(...Object.entries(TICKET_CATS).map(([v, label]) => el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(v === cat), 'data-cat': v, onclick: () => { cat = v; drawCat(); },
      }, label)));
      [title.placeholder, body.placeholder] = TICKET_HINTS[cat];
      ideaHint.hidden = cat !== 'vorschlag';
      attach.checked = cat !== 'vorschlag';
    };
    drawCat();
    openDialog('Neues Ticket', [
      seg, ideaHint,
      field('Betreff', title),
      field('Beschreibung', body),
      el('label', { class: 'check' }, attach, 'Geräteinfos anhängen (hilft bei Fehlern)'),
      el('details', { class: 'dev' }, el('summary', {}, 'Anzeigen, was mitgeschickt wird'), el('pre', { class: 'dev-info' }, info)),
      el('p', { class: 'note warn' }, 'Bitte keine Patientendaten (Namen, Geburtsdaten o. Ä.) eingeben.'),
    ], {
      saveLabel: 'Senden',
      onSave: async (f) => {
        if (!f.title.value.trim() || !f.body.value.trim()) { toast('Betreff und Beschreibung ausfüllen', 'err'); return false; }
        try {
          await this.rpc('support_create', { p_category: cat, p_title: f.title.value.trim(), p_body: f.body.value.trim(), p_device: attach.checked ? info : '' });
        } catch (e) { toast(germanError(e), 'err'); return false; }
        toast('Ticket gesendet – die Antwort erscheint hier unter Einstellungen.');
        this.poll();
      },
    });
    title.focus();
  },

  /* ---------- Ticket ansehen und antworten ---------- */

  // Nachrichtenverlauf; admin = Ansicht in der Administration (mit internen Notizen und E-Mails)
  thread(t, { admin = false } = {}) {
    return el('div', { class: 'thread' }, t.messages.map((m) => {
      const when = fmtWhen(m.created_at);
      if (m.system) {
        return el('div', { class: 'msg-sys' + (m.internal ? ' internal' : '') },
          m.body + ' · ' + when + (admin && m.author_email ? ' · ' + m.author_email : ''));
      }
      const who = admin
        ? (m.internal ? 'Interne Notiz · ' : '') + (m.from_admin ? m.author_email || 'Admin' : t.email || 'Benutzer')
        : m.from_admin ? 'Support' : 'Du';
      return el('div', { class: 'msg' + ((admin ? m.from_admin : !m.from_admin) ? ' mine' : '') + (m.internal ? ' internal' : '') },
        el('div', { class: 'msg-meta' }, who + ' · ' + when),
        el('div', { class: 'msg-body' }, m.body));
    }));
  },

  async open(id) {
    let t;
    try { t = await this.rpc('support_ticket', { p_ticket: id }); } catch (e) { return toast(germanError(e), 'err'); }
    const again = () => this.open(id);
    const run = async (btn, fn, msg) => {
      btn.disabled = true;
      try { await fn(); if (msg) toast(msg); } catch (e) { toast(germanError(e), 'err'); btn.disabled = false; return; }
      await again();
      this.poll();
    };
    const reply = el('textarea', { rows: 3, maxlength: 5000, placeholder: t.status === 'erledigt' ? 'Antwort schreiben (öffnet das Ticket wieder) …' : 'Antwort schreiben …', 'aria-label': 'Antwort' });
    const done = t.status === 'erledigt';
    openDialog(t.title, [
      el('div', { class: 'help' }, TICKET_CATS[t.category] + ' · erstellt ' + fmtWhen(t.created_at) + ' · ', statusBadge(t.status, true)),
      t.is_public ? el('p', { class: 'note' }, `Als Idee für alle sichtbar (ohne Namen) · 👍 ${t.votes}`) : null,
      this.thread(t),
      reply,
      el('div', { class: 'row', style: 'margin-top:8px' },
        el('button', { type: 'button', class: 'btn primary', onclick: (e) => {
          if (!reply.value.trim()) return toast('Antwort eingeben', 'err');
          run(e.currentTarget, () => this.rpc('support_reply', { p_ticket: id, p_body: reply.value.trim() }), 'Gesendet');
        } }, 'Senden'),
        el('span', { class: 'grow' }),
        el('button', { type: 'button', class: 'btn small', onclick: (e) => run(e.currentTarget, () => this.rpc('support_close', { p_ticket: id, p_done: !done }), done ? 'Wieder geöffnet' : 'Als erledigt markiert') },
          done ? 'Wieder öffnen' : 'Erledigt ✓')),
      t.device ? el('details', { class: 'dev' }, el('summary', {}, 'Mitgeschickte Geräteinfos'), el('pre', { class: 'dev-info' }, t.device)) : null,
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('button', { type: 'button', class: 'btn small danger', onclick: async () => {
          if (!confirm('Ticket mit allen Nachrichten endgültig löschen?')) return;
          try { await this.rpc('support_delete', { p_ticket: id }); } catch (e) { return toast(germanError(e), 'err'); }
          $('#dlg').close();
          toast('Ticket gelöscht');
          this.poll();
        } }, 'Ticket löschen')),
    ]);
    // Gelesen: Abzeichen aktualisieren
    if (this.tickets) { const it = this.tickets.find((x) => x.id === id); if (it && it.unread) { it.unread = false; this.counts.unread = Math.max(0, this.counts.unread - 1); this.render(); } }
  },

  /* ---------- Ideen ---------- */

  async ideas() {
    if (!cloud.account) return toast('Bitte zuerst anmelden.', 'err');
    let list;
    try { list = await this.rpc('support_ideas'); } catch (e) { return toast(germanError(e), 'err'); }
    const box = el('div', { class: 'mods' });
    const draw = () => {
      box.replaceChildren(...list.map((i) => el('div', { class: 'card pad idea' },
        el('div', { class: 'grow' },
          el('div', {}, el('b', {}, i.title), el('span', { class: 'badge' + (i.status === 'erledigt' ? ' ok' : '') }, IDEA_STATUS[i.status] || i.status),
            i.mine ? el('span', { class: 'badge' }, 'Dein Vorschlag') : null),
          i.idea_text ? el('div', { class: 'help idea-text' }, i.idea_text) : null),
        el('button', {
          type: 'button', class: 'btn small vote', 'aria-pressed': String(!!i.voted), title: i.voted ? 'Zustimmung zurückziehen' : 'Zustimmen',
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { i.votes = await this.rpc('support_vote', { p_ticket: i.id, p_on: !i.voted }); i.voted = !i.voted; } catch (err) { toast(germanError(err), 'err'); }
            draw();
          },
        }, '👍 ' + i.votes))));
      if (!list.length) box.append(el('div', { class: 'empty' }, 'Noch keine Ideen veröffentlicht.'));
    };
    draw();
    openDialog('💡 Ideen', [
      el('p', { class: 'help', style: 'margin-top:0' }, 'Vorschläge, die die Admins für alle sichtbar gemacht haben (ohne Namen). Mit 👍 zeigst du, dass du das auch brauchst – das hilft bei der Reihenfolge.'),
      box,
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { type: 'button', class: 'btn', onclick: () => this.create('vorschlag') }, '＋ Eigener Vorschlag')),
    ]);
  },

  /* ---------- Haeufige Fragen und "Was ist neu" ---------- */

  showFaq() {
    const search = el('input', { type: 'search', placeholder: 'Suchen …', 'aria-label': 'Häufige Fragen durchsuchen' });
    const list = el('div', { class: 'faq' });
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const hits = this.faq.filter((f) => !q || (f.question + ' ' + f.answer).toLowerCase().includes(q));
      list.replaceChildren(...hits.map((f) => el('details', {}, el('summary', {}, f.question), el('p', {}, f.answer))));
      if (!hits.length) list.append(el('div', { class: 'empty' }, this.faq.length ? 'Nichts gefunden.' : cloud.sb && navigator.onLine ? 'Lade …' : 'Noch keine häufigen Fragen auf diesem Gerät.'));
      search.hidden = this.faq.length < 6;
    };
    search.addEventListener('input', draw);
    draw();
    openDialog('Häufige Fragen', [
      search, list,
      cloud.account && this.available ? el('div', { class: 'row', style: 'margin-top:12px' },
        el('span', { class: 'grow help' }, 'Nicht gefunden?'),
        el('button', { type: 'button', class: 'btn', onclick: () => this.create('frage') }, '＋ Frage stellen')) : null,
    ]);
    this.loadFaq().then((changed) => { if (changed && list.isConnected) draw(); }).catch(() => {});
  },

  newsSeen() {
    let seen = store.load('newsSeen', null);
    if (!seen) {
      // Bisherige Benutzer sehen die Neuerungen ab Einfuehrung dieser Uebersicht, neue nichts
      seen = USED_BEFORE ? '0.29' : APP_VERSION;
      store.save('newsSeen', seen);
    }
    return seen;
  },

  // Kurzer Hinweis oben nach einem Update, bis er geschlossen oder geoeffnet wird
  renderNews() {
    const box = $('#newsNote');
    if (!box) return;
    box.replaceChildren();
    const seen = this.newsSeen();
    const fresh = NEWS.filter((n) => verCmp(n.v, seen) > 0 && verCmp(n.v, APP_VERSION) <= 0);
    if (!fresh.length) return;
    const more = fresh.length > 1 || fresh[0].items.length > 1;
    box.append(el('div', { class: 'note announce news-note' },
      el('span', { class: 'grow' }, el('b', {}, `Neu in Version ${fresh[0].v}: `), fresh[0].items[0], more ? ' …' : ''),
      el('button', { type: 'button', class: 'linkish', onclick: () => this.showNews() }, 'Mehr'),
      el('button', { type: 'button', class: 'linkish', 'aria-label': 'Hinweis ausblenden', onclick: () => { store.save('newsSeen', APP_VERSION); this.renderNews(); } }, '✕')));
  },

  showNews() {
    store.save('newsSeen', APP_VERSION);
    this.renderNews();
    openDialog('Was ist neu', NEWS.filter((n) => verCmp(n.v, APP_VERSION) <= 0).map((n) => el('div', { class: 'news' },
      el('h2', {}, 'Version ' + n.v, n.v === APP_VERSION ? el('span', { class: 'badge' }, 'aktuell') : null),
      el('ul', {}, n.items.map((x) => el('li', {}, x))))));
  },
};

support.renderNews();
// Einstellungen geoeffnet: Tickets auffrischen (hoechstens alle 15 s)
$('nav button[data-tab=settings]').addEventListener('click', () => { if (cloud.account && Date.now() - support.polledAt > 15000) support.poll(); });
