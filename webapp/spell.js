'use strict';

/*
 * Rechtschreibpruefung offline auf dem Geraet (Hunspell als WebAssembly).
 *
 * Woerterbuecher (vendor/dict, siehe README dort): Deutsch (Oesterreich) plus
 * medizinische Fachbegriffe. Zusaetzlich gelten als richtig: Woerter aus den
 * Bausteinen, Medikamente und Krankheiten aus der Datenbank und das eigene
 * Woerterbuch (settings.dictionary). Der Text verlaesst das Geraet nicht.
 *
 * Die Dateien (ca. 2 MB) werden erst bei Bedarf geladen und vom Service Worker
 * in einem eigenen Speicher gehalten (DICT_CACHE in sw.js), damit sie nicht bei
 * jeder neuen App-Version erneut heruntergeladen werden.
 */

const SPELL_WORD = /\p{L}[\p{L}\p{M}]*(?:-\p{L}[\p{L}\p{M}]*)*/gu;

// Haeufige Woerter aus dem Rettungsdienst, die in den Woerterbuechern fehlen
const RD_WORDS = `kreislaufstabil kreislaufinstabil intubiert extubiert intubierte Prellmarke Prellmarken Rissquetschwunde
erweckbar seitengleich Rasselgeräusch Rasselgeräusche Rekapillarisierungszeit Rekapzeit isokor anisokor lichtreagibel lichtstarr
entrundet Meningismus Hemiparese Einkoten Präsynkope kaltschweißig marmoriert Defibrillator Defibrillators Venenverweilkanüle
Vollelektrolytlösung Schaufeltrage Stifneck Spineboard nachgefordert Laienreanimation Thoraxkompression Thoraxkompressionen
defibrilliert immobilisiert reanimiert reanimationspflichtig`;

const spell = {
  h: null,              // Hunspell-Instanz
  loading: null,
  failed: false,
  extra: new Set(),     // Woerter aus Bausteinen, Datenbank, eigenem Woerterbuch (klein geschrieben)
  extraSig: '',
  inHunspell: new Set(), // fuer Vorschlaege an Hunspell uebergebene Zusatzwoerter
  ignored: new Set(),   // "Diesmal ignorieren" (bis zum Neuladen)
  cache: new Map(),     // Wort -> richtig?
  hints: new Set(),     // angezeigte Hinweiszeilen

  get enabled() { return settings.spellcheck !== false; },

  load() {
    if (this.h) return Promise.resolve(this.h);
    if (this.loading) return this.loading;
    const text = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ': ' + r.status); return r.text(); });
    this.loading = (async () => {
      const [mod, aff, dic, med] = await Promise.all([
        import('./vendor/hunspell/dist/Hunspell.js'),
        text('vendor/dict/de-AT.aff'), text('vendor/dict/de-AT.dic'), text('vendor/dict/de-med.dic')]);
      // Fachbegriffe nutzen dieselben Affix-Regeln: einfach ans Hauptwoerterbuch anhaengen (erste Zeile = Anzahl)
      this.h = await mod.createHunspellFromStrings(aff, dic.trimEnd() + '\n' + med.split('\n').slice(1).join('\n'));
      this.failed = false;
      this.refreshAll();
      renderSpellState();
      return this.h;
    })().catch((e) => { this.failed = true; this.loading = null; renderSpellState(); throw e; });
    return this.loading;
  },

  // Zusatzwoerter neu sammeln, wenn sich Bausteine, Datenbank oder eigenes Woerterbuch geaendert haben
  updateExtra() {
    const dict = settings.dictionary || [];
    let latest = '';
    for (const i of items) if (i.updated_at && i.updated_at > latest) latest = i.updated_at;
    const sig = [items.length, latest, catalog.med.length, catalog.dx.length, dict.join('|')].join(':');
    if (sig === this.extraSig) return;
    this.extraSig = sig;
    const sources = [
      ...items.filter((i) => !i.deleted && i.kind !== 'protocol').flatMap((i) => [i.title, i.body]),
      ...catalog.med.flatMap((e) => [e.trade_name, e.ingredient]),
      ...catalog.dx.flatMap((e) => [e.name, e.abbreviation]),
      ...dict,
      RD_WORDS,
    ];
    this.extra = new Set();
    for (const s of sources) for (const w of String(s || '').match(SPELL_WORD) || []) this.extra.add(w.toLowerCase());
    // Hunspell kennt sie dann auch fuer Vorschlaege (z.B. "Larynxtubs" -> "Larynxtubus")
    if (this.h) {
      for (const s of sources) for (const w of String(s || '').match(SPELL_WORD) || []) {
        if (w.length > 3 && !this.inHunspell.has(w)) { this.inHunspell.add(w); this.h.addWord(w); }
      }
    }
    this.cache.clear();
  },

  okWord(w) {
    if (this.extra.has(w.toLowerCase()) || this.ignored.has(w)) return true;
    let r = this.cache.get(w);
    if (r === undefined) {
      r = this.h.testSpelling(w);
      // Bindestrich-Woerter: in Ordnung, wenn alle Teile in Ordnung sind (z.B. "i.v.-Zugang", "Covid-Test")
      if (!r && w.includes('-')) r = w.split('-').every((p) => p.length < 3 || this.extra.has(p.toLowerCase()) || this.h.testSpelling(p));
      this.cache.set(w, r);
    }
    return r;
  },

  // Vermutlich falsch geschriebene Woerter: [{ word, index }]
  check(text) {
    if (!this.enabled || !this.h || !text) return [];
    this.updateExtra();
    // Sondertasten wie {TAB} nicht pruefen (Laenge bleibt, damit die Positionen stimmen)
    const t = text.replace(/\{[^}\n]*\}/g, (m) => ' '.repeat(m.length));
    const out = [];
    for (const m of t.matchAll(SPELL_WORD)) {
      const w = m[0], i = m.index, before = t[i - 1] || '', after = t[i + w.length] || '';
      if (w.length < 3) continue;
      if (/\d/.test(before) || /\d/.test(after)) continue;          // SpO2, 3x, 12mg
      if (/\p{Lu}/u.test(w.slice(1))) continue;                       // Abkuerzungen: RTW, GCS, pAVK
      if (after === '.' && this.h.testSpelling(w + '.')) continue;    // ca., bzw.
      if (!this.okWord(w)) out.push({ word: w, index: i });
    }
    return out;
  },

  suggest(word) { return this.h ? this.h.getSpellingSuggestions(word).slice(0, 6) : []; },

  addToDictionary(word) {
    settings.dictionary = [...new Set([...(settings.dictionary || []), word])].sort((a, b) => a.localeCompare(b, 'de'));
    saveSettings();
    renderSpellState();
    this.refreshAll();
  },

  // Ersetzt das Wort ueberall als ganzes Wort
  replaceWord(text, word, by) {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Ohne Lookbehind (aeltere iPads): Zeichen davor mitnehmen und wieder einsetzen
    return text.replace(new RegExp(`(^|[^\\p{L}\\p{M}-])${esc}(?![\\p{L}\\p{M}-])`, 'gu'), (m, pre) => pre + by);
  },

  /* ---------- Hinweiszeile unter einem Eingabefeld ---------- */

  // get/set lesen und schreiben den Text; liefert { box, refresh }
  hint(get, set) {
    const box = el('div', { class: 'spell', hidden: true });
    let timer = null;
    const draw = () => {
      const errs = this.check(get());
      box.hidden = !errs.length;
      const words = [...new Set(errs.map((e) => e.word))];
      box.replaceChildren(
        el('span', { class: 'spell-l' }, 'Rechtschreibung?'),
        ...words.map((w) => el('button', { type: 'button', class: 'chip spell-chip', title: 'Korrigieren', onclick: () => this.fix(w, get, set) }, w)));
    };
    const refresh = (delay = 0) => { clearTimeout(timer); timer = setTimeout(draw, delay); };
    const h = { box, refresh };
    this.hints.add(h);
    refresh();
    return h;
  },

  refreshAll() {
    for (const h of this.hints) { if (h.box.isConnected) h.refresh(); else this.hints.delete(h); }
  },

  fix(word, get, set) {
    const dlg = $('#dlg2'), form = $('#dlg2Form');
    const choose = (by) => { set(this.replaceWord(get(), word, by)); dlg.close(); this.refreshAll(); };
    const sugg = this.suggest(word);
    form.onsubmit = (e) => e.preventDefault();
    form.replaceChildren(
      el('h3', {}, `„${word}“`),
      sugg.length
        ? el('div', { class: 'chips' }, sugg.map((s) => el('button', { type: 'button', class: 'chip', onclick: () => choose(s) }, s)))
        : el('p', { class: 'help' }, 'Keine Vorschläge.'),
      el('div', { class: 'row', style: 'margin-top:14px' },
        el('button', { type: 'button', class: 'btn', onclick: () => { this.addToDictionary(word); dlg.close(); toast(`„${word}“ ins Wörterbuch aufgenommen`); } }, '＋ Ins Wörterbuch'),
        el('button', { type: 'button', class: 'btn', onclick: () => { this.ignored.add(word); this.cache.delete(word); dlg.close(); this.refreshAll(); } }, 'Ignorieren')),
      el('div', { class: 'row end', style: 'margin-top:8px' },
        el('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Abbrechen')));
    if (!dlg.open) dlg.showModal();
  },
};

/* ---------- Einstellungen ---------- */

function renderSpellState() {
  const st = $('#spellState');
  if (!st) return;
  $('#spellOn').checked = spell.enabled;
  if (document.activeElement !== $('#spellDict')) $('#spellDict').value = (settings.dictionary || []).join('\n');
  st.textContent = !spell.enabled ? 'Ausgeschaltet.'
    : spell.h ? 'Wörterbuch geladen und offline verfügbar.'
      : spell.failed ? 'Wörterbuch konnte nicht geladen werden (keine Internetverbindung?). Wird beim nächsten Start erneut versucht.'
        : 'Wörterbuch wird geladen …';
}

$('#spellOn').addEventListener('change', (e) => {
  settings.spellcheck = e.target.checked;
  saveSettings();
  if (spell.enabled) spell.load().catch(() => {});
  renderSpellState();
  spell.refreshAll();
});
$('#spellDict').addEventListener('change', (e) => {
  settings.dictionary = [...new Set(e.target.value.split('\n').map((w) => w.trim()).filter(Boolean))];
  saveSettings();
  renderSpellState();
  spell.refreshAll();
});
