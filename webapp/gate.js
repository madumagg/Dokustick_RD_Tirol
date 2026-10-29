'use strict';

/*
 * Anmeldeseite und Vorschau.
 *
 * Ist die Cloud eingerichtet (config.js), sieht man die App nur angemeldet. Sonst
 * erscheint die Anmeldeseite (#gate) mit Anmeldung/Registrierung (das Formular aus
 * cloud.render in #accountCard wird dorthin verschoben), Link zur Webseite und
 * "Was ist neu". Offline bleibt man angemeldet (Konto steht im Geraetespeicher).
 *
 * Vorschau: die App mit Beispiel-Bausteinen zum Ausprobieren. Nichts wird gesendet
 * (send() zeigt nur den Text), nichts gespeichert (eigener Speicher "preview.items",
 * Einstellungen werden nicht geschrieben) und nichts synchronisiert.
 */

const WEBSITE_URL = 'https://protopilot.at';

const preview = {
  // In der Sitzung merken, damit ein Neuladen in der Vorschau bleibt
  active: (() => { try { return sessionStorage.getItem('dokustick.preview') === '1'; } catch { return false; } })(),

  setActive(on) {
    this.active = on;
    try { if (on) sessionStorage.setItem('dokustick.preview', '1'); else sessionStorage.removeItem('dokustick.preview'); } catch { /* egal */ }
  },

  start() {
    this.setActive(true);
    store.remove('preview.items');
    loadItems(); // -> Beispiel-Bausteine
    clearDoc();
    // Kleines Beispiel-Protokoll zum Ausprobieren
    for (const t of ['A – Atemwege', 'B – Belüftung']) {
      const it = items.find((i) => i.title === t);
      if (it) addToDoc(it, { quiet: true });
    }
    showTab('write');
    renderAll();
    this.intro();
  },

  stop() {
    this.setActive(false);
    store.remove('preview.items');
    // Aenderungen an Einstellungen in der Vorschau verwerfen
    settings = Object.assign({}, DEFAULT_SETTINGS, store.load('settings', {}));
    clearDoc();
    loadItems();
    renderAll();
  },

  intro() {
    const point = (title, text) => el('li', {}, el('b', {}, title), ' ', text);
    openDialog('Vorschau von ProtoPilot', [
      el('p', { style: 'margin-top:0' }, 'Probier die App mit Beispiel-Bausteinen aus. Es wird nichts gesendet und nichts gespeichert.'),
      el('ul', { class: 'preview-points' },
        point('Schreiben:', 'Bausteine landen hier als Karten. Optionen antippen, Pflichtfelder sind rot markiert, dazwischen Freitext oder Diktat.'),
        point('Bausteine:', 'eigene Textbausteine mit Auswahlfeldern anlegen oder fertige Vorlagen übernehmen (ABCDE, SAMPLER, GCS …).'),
        point('Senden:', 'Mit dem ProtoPilot-Stick tippt die App den Text am PC ein. In der Vorschau siehst du nur, was getippt würde.'),
        point('Mit Konto:', 'Sicherung und Abgleich auf allen Geräten, Teams, Medikamente-Datenbank und Arzneimittellisten.')),
    ], { onSave: () => {}, saveLabel: 'Los geht’s', cancelLabel: 'Schließen' });
  },

  // Statt zu senden: zeigen, was getippt wuerde
  sent(text) {
    openDialog('Vorschau: nichts gesendet', [
      el('p', { style: 'margin-top:0' }, 'Mit dem Stick würde jetzt dieser Text am PC eingetippt:'),
      el('pre', { class: 'preview' }, text),
      el('p', { class: 'help' }, 'Zum echten Senden anmelden und den ProtoPilot-Stick verbinden.'),
    ]);
  },

  noConnect() {
    openDialog('Vorschau', [
      el('p', { style: 'margin-top:0' }, 'In der Vorschau gibt es keine Verbindung zum ProtoPilot-Stick. „Senden“ zeigt dir stattdessen, was getippt würde.'),
      el('p', {}, 'Den Stick verbindest du nach der Anmeldung über diese Schaltfläche.'),
    ]);
  },

  renderBar() {
    const box = $('#previewBar');
    box.replaceChildren();
    if (!this.active) return;
    box.append(el('div', { class: 'note preview-bar' },
      el('span', { class: 'grow' }, el('b', {}, 'Vorschau: '), 'Beispiel-Bausteine zum Ausprobieren. Es wird nichts gesendet und nichts gespeichert.'),
      el('span', { class: 'row', style: 'gap:6px' },
        el('button', { type: 'button', class: 'btn small', onclick: () => this.intro() }, 'Überblick'),
        el('button', { type: 'button', class: 'btn small primary', onclick: () => this.stop() }, 'Anmelden'))));
  },
};

const gate = {
  // Anmeldeseite noetig: Cloud eingerichtet, nicht angemeldet, nicht in der Vorschau
  needed() { return cloud.configured && !cloud.account && !preview.active; },

  update() {
    const on = this.needed();
    document.body.classList.toggle('gated', on);
    document.body.classList.toggle('previewing', preview.active && !cloud.account);
    $('#gate').hidden = !on;
    // Das Anmeldeformular aus den Einstellungen auf die Anmeldeseite holen und zurueck
    const card = $('#accountCard'), slot = $('#gateLogin');
    if (on && card.parentNode !== slot) slot.append(card);
    if (!on && card.parentNode === slot) $('#accountHead').after(card);
    preview.renderBar();
    if (on) this.renderNews();
  },

  // "Was ist neu": die letzten beiden Versionen, der Rest im Dialog
  renderNews() {
    const box = $('#gateNews');
    const list = NEWS.filter((n) => verCmp(n.v, APP_VERSION) <= 0);
    box.replaceChildren(...kids(
      ...list.slice(0, 2).map((n) => el('div', { class: 'news' },
        el('h3', {}, 'Version ' + n.v),
        el('ul', {}, n.items.map((x) => el('li', {}, x))))),
      list.length > 2 ? el('button', { type: 'button', class: 'btn small', onclick: () => support.showNews() }, 'Alle Neuerungen') : null));
    $('#gateVer').textContent = APP_VERSION;
  },
};

$('#previewBtn').addEventListener('click', () => preview.start());
$('#previewSettingsLogin').addEventListener('click', () => preview.stop());
