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

// Nach diesen Woertern ist ein grosses Wort meist ein Hauptwort ("beim Gehen", "das Gute", "alles Gute")
const NOMINAL_BEFORE = new Set(`der die das dem den des ein eine einem einen einer eines am im zum zur vom beim ins ans aufs ums durchs fürs
übers alles etwas nichts viel viele wenig kein keine keinem keinen keiner sein seine ihr ihre mein meine dein deine unser unsere
dieses diesem dieser diese diesen jedes jeder`.split(/\s+/));
// Abkuerzungen, nach denen der Satz weitergeht ("Pat. ist wach", "ca. 2 h")
const MID_ABBR = new Set('pat ca bzw evtl ggf inkl exkl dr hr fr li re bds vs lt'.split(' '));
// Hoefliche Anrede, mitten im Satz gross richtig
const FORMAL = new Set('Sie Ihnen Ihr Ihre Ihrem Ihren Ihrer Ihres'.split(' '));
// Doppelt erlaubt: "die Frau, die die Tür ..."
const DOUBLE_OK = new Set(['der', 'die', 'das', 'dem', 'den', 'des', 'sie', 'es']);
const capFirst = (w) => w[0].toUpperCase() + w.slice(1);
const lowFirst = (w) => w[0].toLowerCase() + w.slice(1);
const isLowerStart = (w) => w[0] !== w[0].toUpperCase();

const spell = {
  h: null,              // Hunspell-Instanz
  loading: null,
  failed: false,
  extra: new Set(),     // Woerter aus Bausteinen, Datenbank, eigenem Woerterbuch (klein geschrieben)
  extraExact: new Set(), // dieselben in Originalschreibweise
  extraCased: new Set(), // Schreibweise verbindlich (Datenbank, eigenes Woerterbuch, Rettungsdienst-Woerter)
  extraSig: '',
  stemCache: new Map(),
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
    this.extraExact = new Set();
    for (const s of sources) for (const w of String(s || '').match(SPELL_WORD) || []) { this.extra.add(w.toLowerCase()); this.extraExact.add(w); }
    // Bausteintexte zaehlen hier nicht: dort steht am Satzanfang jedes Wort gross
    this.extraCased = new Set();
    for (const s of [...catalog.med.flatMap((e) => [e.trade_name, e.ingredient]), ...catalog.dx.map((e) => e.name), ...dict, RD_WORDS]) {
      for (const w of String(s || '').match(SPELL_WORD) || []) this.extraCased.add(w);
    }
    // Unbekannte Woerter kennt Hunspell dann auch fuer Vorschlaege (z.B. "Larynxtubs" -> "Larynxtubus").
    // Bekannte nicht hinzufuegen: "Wach" aus einem Titel wuerde sonst als Hauptwort gelten.
    if (this.h) {
      for (const s of sources) for (const w of String(s || '').match(SPELL_WORD) || []) {
        if (w.length > 3 && !this.inHunspell.has(w) && !this.h.testSpelling(w)) { this.inHunspell.add(w); this.h.addWord(w); }
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

  stems(w) {
    let r = this.stemCache.get(w);
    if (!r) { r = this.h.stemWord(w); this.stemCache.set(w, r); }
    return r;
  },

  // Stellung im Satz: 'start' (Satzanfang), 'mid' (mitten im Satz) oder 'free' (beides moeglich,
  // z.B. nach Doppelpunkt, nach Abkuerzungen wie "Pat.", nach Zahlen, in Aufzaehlungen)
  position(t, prev, i, sentenceStart) {
    const gap = t.slice(prev ? prev.end : 0, i);
    if (gap.includes('\n')) return /\S/.test(gap.slice(gap.lastIndexOf('\n') + 1)) ? 'free' : 'start';
    if (!prev) return !/\S/.test(gap) && sentenceStart ? 'start' : 'free';
    if (/[!?]/.test(gap)) return 'start';
    if (/[:;"„“”(–]/.test(gap) || /\s-\s/.test(gap) || /\d/.test(gap)) return 'free';
    if (gap.includes('.')) {
      const p = prev.word;
      if (MID_ABBR.has(p.toLowerCase())) return 'mid';
      // Hunspell akzeptiert jedes Wort auch mit Punkt; Abkuerzung = nur mit Punkt gueltig ("usw.")
      const abbr = p.length <= 3 || /\p{Lu}/u.test(p.slice(1)) || (this.h.testSpelling(p + '.') && !this.h.testSpelling(p));
      return abbr ? 'free' : 'start';
    }
    return 'mid';
  },

  // Gross/Klein: liefert die richtige Schreibweise oder null
  caseFix(w, pos, prevWord) {
    if (pos === 'free' || this.ignored.has(w) || this.extraCased.has(w)) return null;
    if (pos === 'start') return isLowerStart(w) ? capFirst(w) : null;
    if (isLowerStart(w)) {
      // Nur ueber Bausteine/Datenbank bekannt und dort nur gross geschrieben ("larynxtubus")
      return !this.h.testSpelling(w) && this.extraExact.has(capFirst(w)) && !this.extraExact.has(w) ? capFirst(w) : null;
    }
    if (FORMAL.has(w) || NOMINAL_BEFORE.has((prevWord || '').toLowerCase())) return null;
    // Gemeldet wird nur, was es klein als Wort gibt und was das Woerterbuch nicht als Hauptwort kennt
    // (z.B. "Ist", "Wach", "Bewusstlos"); "Übergabe" gibt es klein nicht -> Hauptwort
    const low = lowFirst(w);
    if (!this.h.testSpelling(low)) return null;
    const st = this.stems(w);
    if (!st.length || !st.every(isLowerStart)) return null;
    // Hauptwoerter aus Verben ("bei Eintreffen", "Erbrechen", "Schwindel beim Aufstehen")
    if (/(en|ern|eln)$/.test(w) && st.includes(low)) return null;
    return low;
  },

  // Moegliche Fehler: [{ word, index, kind, fix, from }]
  //   kind 'spell' = unbekanntes Wort, 'case' = Gross/Klein (fix = richtige Schreibweise),
  //   'double' = doppeltes Wort (from = Ende des ersten, ab dort wird geloescht)
  // sentenceStart: false fuer Textfelder in Bausteinen (stehen meist nach "Name:")
  check(text, { sentenceStart = true } = {}) {
    if (!this.enabled || !this.h || !text) return [];
    this.updateExtra();
    // Sondertasten wie {TAB} nicht pruefen (Laenge bleibt, damit die Positionen stimmen)
    const t = text.replace(/\{[^}\n]*\}/g, (m) => ' '.repeat(m.length));
    const out = [];
    let prev = null;
    for (const m of t.matchAll(SPELL_WORD)) {
      const w = m[0], i = m.index, before = t[i - 1] || '', after = t[i + w.length] || '';
      const pos = this.position(t, prev, i, sentenceStart);
      const last = prev;
      prev = { word: w, end: i + w.length };
      if (/\d/.test(before) || /\d/.test(after)) continue;          // SpO2, 3x, 12mg
      if (/\p{Lu}/u.test(w.slice(1))) continue;                       // Abkuerzungen: RTW, GCS, pAVK
      if (last && pos === 'mid' && last.word.toLowerCase() === w.toLowerCase() && !DOUBLE_OK.has(w.toLowerCase()) && !this.ignored.has(w)) {
        out.push({ word: w, index: i, kind: 'double', from: last.end });
        continue;
      }
      if (w.length < 3) { const c = this.h.testSpelling(w) && this.caseFix(w, pos, last && last.word); if (c) out.push({ word: w, index: i, kind: 'case', fix: c }); continue; }
      const known = (after === '.' && this.h.testSpelling(w + '.')) || this.okWord(w);   // "ca." gilt als bekannt
      if (!known) { out.push({ word: w, index: i, kind: 'spell' }); continue; }
      const c = this.caseFix(w, pos, last && last.word);
      if (c) out.push({ word: w, index: i, kind: 'case', fix: c });
    }
    return out;
  },

  // Anzeige eines Fehlers (Hinweis und Rueckfrage vor dem Senden)
  label(e) { return e.kind === 'case' ? `${e.word} → ${e.fix}` : e.kind === 'double' ? `${e.word} ${e.word}` : e.word; },

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
  hint(get, set, opts = {}) {
    const box = el('div', { class: 'spell', hidden: true });
    let timer = null;
    const draw = () => {
      const errs = this.check(get(), opts);
      box.hidden = !errs.length;
      // Unbekannte Woerter nur einmal zeigen (Korrektur gilt fuer alle), Gross/Klein und doppelte je Stelle
      const shown = errs.filter((e, n) => e.kind !== 'spell' || errs.findIndex((x) => x.kind === 'spell' && x.word === e.word) === n);
      box.replaceChildren(
        el('span', { class: 'spell-l' }, 'Rechtschreibung?'),
        ...shown.map((e) => el('button', { type: 'button', class: 'chip spell-chip k-' + e.kind, title: 'Korrigieren', onclick: () => this.fix(e, get, set, opts) }, this.label(e))));
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

  fix(err, get, set, opts = {}) {
    const dlg = $('#dlg2'), form = $('#dlg2Form');
    const word = err.word;
    // Gross/Klein und doppelte Woerter: genau diese Stelle aendern (im aktuellen Text neu suchen)
    const atSpot = (change) => {
      const text = get();
      const cur = this.check(text, opts).filter((x) => x.kind === err.kind && x.word === word)
        .sort((a, b) => Math.abs(a.index - err.index) - Math.abs(b.index - err.index))[0];
      if (cur) set(change(text, cur));
    };
    const choose = (by) => {
      if (err.kind === 'spell') set(this.replaceWord(get(), word, by));
      else if (err.kind === 'case') atSpot((t, c) => t.slice(0, c.index) + by + t.slice(c.index + word.length));
      else atSpot((t, c) => t.slice(0, c.from) + t.slice(c.index + word.length));
      dlg.close();
      this.refreshAll();
    };
    const sugg = err.kind === 'spell' ? this.suggest(word) : [err.kind === 'case' ? err.fix : word];
    const help = { case: err.fix && isLowerStart(err.fix) ? 'Mitten im Satz klein schreiben.' : 'Groß schreiben (Satzanfang oder Hauptwort).', double: 'Das Wort steht doppelt. Antippen entfernt die Wiederholung.' }[err.kind];
    form.onsubmit = (e) => e.preventDefault();
    form.replaceChildren(...kids(
      el('h3', {}, err.kind === 'double' ? `„${word} ${word}“` : `„${word}“`),
      help ? el('p', { class: 'help', style: 'margin-top:0' }, help) : null,
      sugg.length
        ? el('div', { class: 'chips' }, sugg.map((s) => el('button', { type: 'button', class: 'chip', onclick: () => choose(s) }, s)))
        : el('p', { class: 'help' }, 'Keine Vorschläge.'),
      el('div', { class: 'row', style: 'margin-top:14px' },
        err.kind !== 'double' ? el('button', { type: 'button', class: 'btn', onclick: () => { this.addToDictionary(word); dlg.close(); toast(`„${word}“ ins Wörterbuch aufgenommen`); } }, '＋ Ins Wörterbuch') : null,
        el('button', { type: 'button', class: 'btn', onclick: () => { this.ignored.add(word); this.cache.delete(word); dlg.close(); this.refreshAll(); } }, 'Ignorieren')),
      el('div', { class: 'row end', style: 'margin-top:8px' },
        el('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Abbrechen'))));
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
