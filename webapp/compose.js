'use strict';

/*
 * Interaktive Bausteine und das Protokoll im Schreiben-Fenster.
 *
 * Feld-Syntax in Bausteinen (wird auch vom Feld-Editor erzeugt):
 *   {{Name}}              Textfeld
 *   {{Name:#}}            Zahlenfeld
 *   {{Name:a|b|c}}        Einfachauswahl
 *   {{Name+:a|b|c}}       Mehrfachauswahl
 *   *a                    Vorauswahl, z.B. {{Atmung:*unauffällig|Dyspnoe}}
 *   {{Name?}} / {{Name+?:a|b}}  optional (sonst Pflichtfeld: Senden erst, wenn ausgefuellt)
 *   {{Name:@med}} / {{Name:@dx}}  Suche in der Medikamente- bzw. Krankheiten-Datenbank (mehrere)
 * Optionen, die mit "kein" beginnen, schliessen bei Mehrfachauswahl die anderen aus.
 */

const FIELD_RE = /\{\{\s*([^}:|]+?)\s*(?::([^}]*))?\}\}/g;
const FIELD_TYPES = { single: 'Einfachauswahl', multi: 'Mehrfachauswahl', text: 'Text', number: 'Zahl', med: 'Medikamente (Datenbank)', dx: 'Krankheiten (Datenbank)' };
// Feldarten, deren Wert eine Liste ist
const isListField = (f) => f.type === 'multi' || f.type === 'med' || f.type === 'dx';
// Schnellauswahl in Datenbank-Feldern (hebt die anderen Eintraege auf)
const LOOKUP_QUICK = ['keine', 'unbekannt'];

const TEMPLATES = [
  { category: 'ABCDE', title: 'A – Atemwege', body: 'A – Atemwege: {{Atemwege:frei und gesichert|gefährdet}}. Maßnahmen: {{Maßnahmen A+:*keine Maßnahmen erforderlich|Wendltubus|Guedeltubus|Larynxtubus|Endotrachealtubus|i-gel Larynxmaske}}.' },
  { category: 'ABCDE', title: 'B – Belüftung', body: 'B – Belüftung: Atmung {{Atmung:*unauffällig|Dyspnoe|Tachypnoe|Bradypnoe|Apnoe}}, AF {{AF:#}}/min, SpO2 {{SpO2:#}} %, Auskultation {{Auskultation:*seitengleich, vesikulär|abgeschwächt links|abgeschwächt rechts|Spastik|Rasselgeräusche}}. Maßnahmen: {{Maßnahmen B+:*keine Maßnahmen erforderlich|O2-Gabe|assistierte Beatmung|kontrollierte Beatmung}}.' },
  { category: 'ABCDE', title: 'C – Kreislauf', body: 'C – Kreislauf: {{Kreislauf:*stabil|instabil}}, RR {{RR}} mmHg, HF {{HF:#}}/min, Rekap.-Zeit {{Rekap:*< 2 s|> 2 s}}, Haut {{Haut:*rosig, warm, trocken|blass|kaltschweißig|zyanotisch|marmoriert}}. Maßnahmen: {{Maßnahmen C+:*keine Maßnahmen erforderlich|i.v.-Zugang|i.o.-Zugang|Volumengabe|Blutstillung|Tourniquet|Beckenschlinge}}.' },
  { category: 'ABCDE', title: 'D – Neurologie', body: 'D – Neurologie: GCS {{GCS:15|14|13|12|11|10|9|8|7|6|5|4|3}}, Pupillen {{Pupillen:*isokor, lichtreagibel|anisokor|lichtstarr}}, BZ {{BZ:#}} mg/dl, FAST {{FAST:*unauffällig|auffällig}}. Maßnahmen: {{Maßnahmen D+:*keine Maßnahmen erforderlich|Glukosegabe|Stroke-Voranmeldung}}.' },
  { category: 'ABCDE', title: 'E – Exposure', body: 'E – Exposure: {{Befund E:*keine weiteren Auffälligkeiten|Verletzungen (siehe Freitext)}}, Temp. {{Temp:#}} °C. Maßnahmen: {{Maßnahmen E+:*keine Maßnahmen erforderlich|Wärmeerhalt|Immobilisation|Wundversorgung|Schienung}}.' },
  { category: 'SAMPLER', title: 'S – Symptome', body: 'S – Symptome: {{Symptome}}.' },
  { category: 'SAMPLER', title: 'A – Allergien', body: 'A – Allergien: {{Allergien+:keine bekannt|unbekannt|Penicillin|Pflaster|Latex|Kontrastmittel}}.' },
  { category: 'SAMPLER', title: 'M – Medikation', body: 'M – Dauermedikation: {{Dauermedikation:@med}}.' },
  { category: 'SAMPLER', title: 'P – Patientengeschichte', body: 'P – Vorerkrankungen: {{Vorerkrankungen:@dx}}.' },
  { category: 'SAMPLER', title: 'L – Letzte Mahlzeit', body: 'L – Letzte Mahlzeit/Ausscheidung: {{Letzte Mahlzeit}}.' },
  { category: 'SAMPLER', title: 'E – Ereignis', body: 'E – Ereignis: {{Ereignis}}.' },
  { category: 'SAMPLER', title: 'R – Risikofaktoren', body: 'R – Risikofaktoren: {{Risikofaktoren+:keine bekannt|Rauchen|Diabetes|Hypertonie|Adipositas|Schwangerschaft}}.' },
  { category: 'Allgemein', title: 'Vitalparameter', body: 'RR {{RR}} mmHg, HF {{HF:#}}/min, SpO2 {{SpO2:#}} %, AF {{AF:#}}/min, BZ {{BZ:#}} mg/dl, Temp. {{Temp:#}} °C, GCS {{GCS:15|14|13|12|11|10|9|8|7|6|5|4|3}}' },
  { category: 'Allgemein', title: 'Schmerz', body: 'Schmerz NRS {{NRS:0|1|2|3|4|5|6|7|8|9|10}}/10, Lokalisation {{Lokalisation}}.' },
];

/* ================= Felder ================= */

function parseField(rawName, rawOpt) {
  let name = rawName.trim();
  let multi = false, optional = false;
  // Kennzeichen am Namensende: + = Mehrfachauswahl, ? = optional
  while (/[+?]$/.test(name)) {
    if (name.endsWith('+')) multi = true; else optional = true;
    name = name.slice(0, -1).trim();
  }
  const opt = (rawOpt || '').trim();
  if (opt === '#') return { name, type: 'number', optional, options: [], defaults: [] };
  if (opt === '@med' || opt === '@dx') return { name, type: opt.slice(1), optional, options: [], defaults: [] };
  if (!opt) return { name, type: 'text', optional, options: [], defaults: [] };
  const parts = opt.split('|').map((o) => o.trim()).filter(Boolean);
  const options = parts.map((o) => o.replace(/^\*/, '').trim());
  const defaults = parts.filter((o) => o.startsWith('*')).map((o) => o.slice(1).trim());
  return { name, type: multi ? 'multi' : 'single', optional, options, defaults: multi ? defaults : defaults.slice(0, 1) };
}

// Was an einem Feld fehlt: null = in Ordnung
function fieldProblem(f, v) {
  const text = isListField(f) ? (Array.isArray(v) ? v.join('') : '') : String(v || '').trim();
  if (!text) return f.optional ? null : 'fehlt';
  if (f.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(text)) return 'keine Zahl';
  return null;
}

const blockProblems = (b) => formFields(b.tpl).map((f) => ({ f, problem: fieldProblem(f, b.values[f.name]) })).filter((x) => x.problem);

// Alle Felder eines Bausteins (gleicher Name = gleiches Feld)
function formFields(tpl) {
  const fields = new Map();
  for (const m of tpl.matchAll(FIELD_RE)) {
    const f = parseField(m[1], m[2]);
    if (!fields.has(f.name)) fields.set(f.name, { ...f, token: m[0] });
  }
  return [...fields.values()];
}

const cleanName = (s) => s.replace(/[{}:|+?]/g, '').trim();
const cleanOption = (s) => s.replace(/[{}|]/g, '').replace(/^\*/, '').trim();

function fieldToken(f) {
  const name = cleanName(f.name) + (f.type === 'multi' ? '+' : '') + (f.optional ? '?' : '');
  if (f.type === 'text') return `{{${name}}}`;
  if (f.type === 'number') return `{{${name}:#}}`;
  if (f.type === 'med' || f.type === 'dx') return `{{${cleanName(f.name)}${f.optional ? '?' : ''}:@${f.type}}}`;
  const opts = f.options.map(cleanOption).filter(Boolean).map((o) => (f.defaults.includes(o) ? '*' + o : o));
  return `{{${name}:${opts.join('|')}}}`;
}

function initialValues(tpl) {
  const v = {};
  for (const f of formFields(tpl)) v[f.name] = isListField(f) ? [...f.defaults] : (f.defaults[0] || '');
  return v;
}

function fieldValueText(f, v) {
  if (isListField(f)) return (Array.isArray(v) ? v : []).join(', ');
  return v || '';
}

// Zerlegt eine Vorlage an ", ", ": " und Satzenden (ausserhalb von Feldern)
function splitSegments(tpl) {
  const DELIM = /, |: |\. (?=[A-ZÄÖÜ])/y;
  const parts = [{ s: '' }];
  let depth = 0;
  for (let i = 0; i < tpl.length;) {
    if (tpl.startsWith('{{', i)) { depth++; parts[parts.length - 1].s += '{{'; i += 2; continue; }
    if (depth && tpl.startsWith('}}', i)) { depth--; parts[parts.length - 1].s += '}}'; i += 2; continue; }
    DELIM.lastIndex = i;
    const m = !depth && DELIM.exec(tpl);
    if (m) { parts.push({ s: m[0], delim: true }, { s: '' }); i += m[0].length; continue; }
    parts[parts.length - 1].s += tpl[i++];
  }
  return parts;
}

/*
 * Setzt die Werte ein. Abschnitte, deren Felder alle leer sind, fallen weg,
 * z.B. wird aus "RR {{RR}} mmHg, HF {{HF:#}}/min" ohne RR einfach "HF 80/min".
 */
function fillTemplate(tpl, values) {
  const valueOf = (n, o) => { const f = parseField(n, o); return fieldValueText(f, values[f.name]); };
  const allEmpty = (seg) => {
    const fields = [...seg.matchAll(FIELD_RE)];
    return fields.length > 0 && fields.every((m) => !valueOf(m[1], m[2]).trim());
  };
  const parts = splitSegments(tpl);
  for (let k = 0; k < parts.length; k += 2) {
    if (!allEmpty(parts[k].s)) continue;
    const next = parts[k + 1];
    if (next && next.s === ', ') { parts[k].drop = next.drop = true; continue; }
    // Sonst das naechste noch vorhandene Komma davor entfernen, Satzzeichen am Ende behalten
    let j = k - 1;
    while (j > 0 && parts[j].drop) j -= 2;
    if (j > 0 && parts[j].s === ', ') {
      parts[j].drop = parts[k].drop = true;
      parts[k].keep = (parts[k].s.match(/[.!?]\s*$/) || [''])[0];
    }
  }
  return parts.map((p) => (p.drop ? p.keep || '' : p.s)).join('')
    .replace(FIELD_RE, (_, n, o) => valueOf(n, o));
}

// Kurzansicht fuer Listen: Felder als [Name]
const templatePreview = (tpl) => tpl.replace(FIELD_RE, (_, n, o) => `[${parseField(n, o).name}]`);

const isExclusive = (o) => /^(kein|unbekannt|nicht erhebbar)/i.test(o);

/* ================= Protokoll (Schreiben) ================= */

const textBlock = (text = '') => ({ id: uid(), type: 'text', text });
const moduleBlock = (it) => ({ id: uid(), type: 'module', title: it.title, tpl: it.body, values: initialValues(it.body) });

// Bleibt beim Neuladen erhalten, wird beim Schliessen des Tabs verworfen
let doc = (() => {
  try { const d = JSON.parse(sessionStorage.getItem('dokustick.doc')); if (Array.isArray(d) && d.length) return d; } catch { /* egal */ }
  return [textBlock()];
})();
let activeBlockId = null;

function saveDoc() {
  try { sessionStorage.setItem('dokustick.doc', JSON.stringify(doc)); } catch { /* egal */ }
}

const blockText = (b) => (b.type === 'text' ? b.text : fillTemplate(b.tpl, b.values));
// Bloecke getrennt durch eine Leerzeile (abschaltbar fuer einzeilige Zielfelder)
const joinBlocks = (blocks) => blocks.map(blockText).filter((t) => t.trim()).join(settings.blankLine ? '\n\n' : '\n');
const docText = () => joinBlocks(doc);
const docIsEmpty = () => !doc.some((b) => b.type === 'module' || b.text.trim());

function clearDoc() {
  doc = [textBlock()];
  activeBlockId = null;
  saveDoc();
  renderDoc();
}

// Textfeld fuer Diktat & Einfuegen: das zuletzt benutzte, sonst ein neues am Ende
function activeTextArea() {
  let b = doc.find((x) => x.id === activeBlockId && x.type === 'text');
  if (!b) {
    b = doc[doc.length - 1];
    if (!b || b.type !== 'text') { b = textBlock(); doc.push(b); renderDoc(); }
  }
  activeBlockId = b.id;
  return document.querySelector(`[data-block="${b.id}"] textarea`);
}

// Baustein ins Protokoll: mit Feldern als Karte, sonst als Text
function addToDoc(it, { quiet = false } = {}) {
  if (!formFields(it.body).length) {
    appendText(it.body);
  } else {
    // Vor einem leeren Textfeld am Ende einfuegen, damit man danach weiterschreiben kann
    const last = doc[doc.length - 1];
    const block = moduleBlock(it);
    if (last && last.type === 'text' && !last.text.trim()) doc.splice(doc.length - 1, 0, block);
    else doc.push(block, textBlock());
    saveDoc();
    renderDoc();
  }
  if (!quiet) toast(`„${it.title}“ im Protokoll`);
}

function appendText(text) {
  const ta = activeTextArea();
  const sep = ta.value && !/[\s]$/.test(ta.value) ? ' ' : '';
  ta.value += sep + text;
  ta.dispatchEvent(new Event('input'));
}

// Tastatur-Bedienung des Griffs (Pfeiltasten)
function moveBlock(b, dir) {
  const i = doc.indexOf(b), j = i + dir;
  if (j < 0 || j >= doc.length) return;
  [doc[i], doc[j]] = [doc[j], doc[i]];
  saveDoc();
  renderDoc();
  document.querySelector(`[data-block="${b.id}"] .grip`)?.focus();
}

function grip(b, card) {
  const g = el('button', {
    type: 'button', class: 'grip', title: 'Ziehen zum Verschieben', 'aria-label': 'Verschieben (Pfeiltasten)',
    onkeydown: (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveBlock(b, e.key === 'ArrowUp' ? -1 : 1); }
    },
  }, '⠿');
  enableDrag(g, b, card, { immediate: true });
  return g;
}

function removeBlock(b) {
  if (b.type === 'module' && !confirm(`„${b.title}“ aus dem Protokoll entfernen?`)) return;
  doc = doc.filter((x) => x !== b);
  if (!doc.length) doc.push(textBlock());
  saveDoc();
  renderDoc();
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(ta.scrollHeight + 2, 64) + 'px';
}

function renderPreviewInto(pre, text) {
  pre.replaceChildren();
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m; (m = TOKEN_RE.exec(text));) {
    pre.append(text.slice(last, m.index), el('span', { class: 'tok' }, '⟨' + m[1] + '⟩'));
    last = TOKEN_RE.lastIndex;
  }
  pre.append(text.slice(last));
}

function renderDoc() {
  const box = $('#docBlocks');
  box.replaceChildren(...doc.map(renderBlock));
  box.querySelectorAll('textarea').forEach(autosize);
}

function renderBlock(b) {
  return b.type === 'text' ? renderTextBlock(b) : renderModuleBlock(b);
}

function renderTextBlock(b) {
  const ta = el('textarea', {
    class: 'doc-text', rows: 2, placeholder: doc.length > 1 ? 'Freitext …' : 'Text eingeben, diktieren oder Bausteine hinzufügen …',
    autocomplete: 'off', spellcheck: 'true',
    onfocus: () => { activeBlockId = b.id; },
    oninput: (e) => { b.text = e.target.value; autosize(e.target); saveDoc(); hint.refresh(700); },
  }, b.text);
  const hint = spell.hint(() => b.text, (v) => { b.text = ta.value = v; autosize(ta); saveDoc(); });
  const card = el('div', { class: 'block block-text', 'data-block': b.id }, ta, hint.box);
  if (doc.length > 1) {
    card.append(el('div', { class: 'block-tools' },
      grip(b, card),
      el('button', { type: 'button', class: 'block-x', title: 'Textblock entfernen', 'aria-label': 'Textblock entfernen', onclick: () => removeBlock(b) }, '✕')));
  }
  return card;
}

function renderModuleBlock(b) {
  const pre = el('div', { class: 'preview small' });
  const missing = el('span', { class: 'badge bad' });
  const card = el('div', { class: 'block block-mod card', 'data-block': b.id });
  const update = () => {
    saveDoc();
    renderPreviewInto(pre, expandDynamic(blockText(b)));
    // Unvollstaendige Karten rot markieren
    const n = blockProblems(b).length;
    card.classList.toggle('incomplete', n > 0);
    missing.hidden = !n;
    missing.textContent = n === 1 ? '1 fehlt' : `${n} fehlen`;
  };
  const head = el('div', { class: 'block-head' },
    grip(b, card),
    el('strong', { class: 'grow' }, b.title, missing),
    el('button', { type: 'button', title: 'Nur diesen Block senden', 'aria-label': 'Nur diesen Block senden', onclick: () => sendChecked([b]) }, '⟶'),
    el('button', { type: 'button', title: 'Entfernen', 'aria-label': 'Entfernen', onclick: () => removeBlock(b) }, '✕'));
  // Kopfzeile gedrueckt halten (Touch) bzw. ziehen (Maus) verschiebt die Karte
  enableDrag(head, b, card);
  card.append(head, ...formFields(b.tpl).map((f) => renderFieldInput(f, b.values, update)), pre);
  update();
  return card;
}

// Eingabe fuer ein Feld: Knoepfe fuer Auswahl, Eingabefeld fuer Text/Zahl
function renderFieldInput(f, values, onChange) {
  const label = el('span', {}, f.name,
    f.type === 'multi' ? el('small', { class: 'help' }, ' · mehrere möglich') : null,
    f.optional ? el('small', { class: 'help' }, ' · optional') : null);
  // Fehlende Pflichtangaben rot markieren (Text kommt per CSS aus data-problem)
  const mark = (...nodes) => {
    const problem = fieldProblem(f, values[f.name]);
    label.classList.toggle('missing', !!problem);
    label.dataset.problem = problem || '';
    nodes.forEach((n) => n.classList.toggle('missing', !!problem));
  };
  if (f.type === 'med' || f.type === 'dx') return renderLookup(f, values, onChange, label, mark);
  if (f.type === 'text' || f.type === 'number') {
    let hint = null;
    const input = el('input', { type: 'text', inputmode: f.type === 'number' ? 'decimal' : null, autocomplete: 'off', value: values[f.name] || '',
      oninput: (e) => { values[f.name] = e.target.value; mark(input); onChange(); hint?.refresh(700); } });
    mark(input);
    const box = el('label', { class: 'field compact', 'data-field': f.name }, label, input);
    if (f.type === 'number') return box;
    // Hinweise ausserhalb des <label>, sonst loesen die Knoepfe darin doppelt aus
    hint = spell.hint(() => values[f.name] || '', (v) => { values[f.name] = input.value = v; mark(input); onChange(); }, FIELD_SPELL);
    return el('div', {}, box, hint.box);
  }
  const chips = el('div', { class: 'chips' });
  const selected = () => (f.type === 'multi' ? (Array.isArray(values[f.name]) ? values[f.name] : []) : [values[f.name]].filter(Boolean));
  const draw = () => {
    const sel = selected();
    mark(chips);
    const custom = sel.filter((v) => !f.options.includes(v));
    chips.replaceChildren(
      ...[...f.options, ...custom].map((o) => el('button', {
        type: 'button', class: 'chip' + (sel.includes(o) ? ' sel' : ''), 'aria-pressed': String(sel.includes(o)),
        onclick: () => toggle(o),
      }, o)),
      el('button', { type: 'button', class: 'chip more', title: 'Eigenen Wert eingeben', onclick: () => {
        const v = prompt(`${f.name}: eigener Wert`);
        if (v && v.trim()) toggle(v.trim(), true);
      } }, '…'));
  };
  const toggle = (o, forceOn = false) => {
    if (f.type === 'multi') {
      let sel = selected();
      if (sel.includes(o) && !forceOn) sel = sel.filter((x) => x !== o);
      else if (isExclusive(o)) sel = [o];
      else sel = [...sel.filter((x) => !isExclusive(x) && x !== o), o];
      // Reihenfolge wie in den Optionen, eigene Werte am Ende
      values[f.name] = [...f.options.filter((x) => sel.includes(x)), ...sel.filter((x) => !f.options.includes(x))];
    } else {
      values[f.name] = values[f.name] === o && !forceOn ? '' : o;
    }
    draw();
    onChange();
  };
  draw();
  return el('div', { class: 'field compact', 'data-field': f.name }, label, chips);
}

const shorten = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

// Suchfeld fuer Medikamente/Krankheiten: Treffer antippen, mehrere sammeln
function renderLookup(f, values, onChange, label, mark) {
  const C = CATALOGS[f.type];
  const chips = el('div', { class: 'chips' });
  const sugg = el('div', { class: 'sugg' });
  const input = el('input', {
    type: 'search', autocomplete: 'off', enterkeyhint: 'done',
    placeholder: f.type === 'med' ? 'Handelsname oder Wirkstoff suchen …' : 'Krankheit, Abkürzung oder Beschreibung …',
  });
  const list = () => (Array.isArray(values[f.name]) ? values[f.name] : []);
  const set = (arr) => { values[f.name] = arr; drawChips(); mark(input); onChange(); };
  const add = (v) => {
    v = v.trim();
    if (!v) return;
    set(LOOKUP_QUICK.includes(v) ? [v] : [...list().filter((x) => !LOOKUP_QUICK.includes(x) && x !== v), v]);
    input.value = '';
    drawSugg();
  };
  const drawChips = () => {
    const sel = list();
    chips.replaceChildren(
      // "keine"/"unbekannt" nur anbieten, solange nichts anderes gewaehlt ist
      ...LOOKUP_QUICK.filter((q) => !sel.length || sel.includes(q)).map((q) => el('button', {
        type: 'button', class: 'chip' + (sel.includes(q) ? ' sel' : ''), onclick: () => (sel.includes(q) ? set([]) : add(q)),
      }, q)),
      ...sel.filter((x) => !LOOKUP_QUICK.includes(x)).map((x) => el('button', {
        type: 'button', class: 'chip sel', title: 'Entfernen', 'aria-label': x + ' entfernen', onclick: () => set(list().filter((y) => y !== x)),
      }, x, el('span', { class: 'chip-x' }, '✕'))));
  };
  const drawSugg = () => {
    const q = input.value.trim();
    sugg.replaceChildren();
    if (!q) return;
    const taken = new Set(list());
    const hits = catalog.search(f.type, q, 8).filter((e) => !taken.has(C.label(e)));
    for (const e of hits) {
      sugg.append(el('button', { type: 'button', class: 'sugg-item', onclick: () => add(C.label(e)) },
        el('span', { class: 'grow' }, C.label(e), C.detail(e) ? el('span', { class: 'help' }, ' · ' + shorten(C.detail(e), 70)) : null),
        !e.approved ? el('span', { class: 'badge warn' }, 'Vorschlag') : null));
    }
    const exact = hits.some((e) => normText(C.label(e)) === normText(q));
    if (!exact) {
      sugg.append(el('div', { class: 'row sugg-free' },
        el('button', { type: 'button', class: 'btn small', onclick: () => add(q) }, `„${q}“ als Freitext übernehmen`),
        cloud.account && catalog.available !== false ? el('button', { type: 'button', class: 'btn small', onclick: async () => {
          const e = await catalog.edit(f.type, null, f.type === 'med' ? { trade_name: q } : { name: q });
          if (e) add(C.label(e));
        } }, 'In Datenbank vorschlagen …') : null));
    }
    if (!hits.length && !catalog[f.type].length) sugg.append(el('p', { class: 'help', style: 'margin:4px 0 0' }, cloud.account ? 'Die Datenbank ist noch leer.' : 'Für die Datenbank-Suche anmelden (Einstellungen → Konto).'));
  };
  input.addEventListener('input', drawSugg);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = sugg.querySelector('.sugg-item');
    if (first) first.click(); else add(input.value);
  });
  drawChips();
  mark(input);
  return el('div', { class: 'field compact', 'data-field': f.name }, label, chips, input, sugg);
}

/* ================= Pruefen vor dem Senden ================= */

// Sendet nur, wenn alle Pflichtfelder der Bausteine ausgefuellt sind
// Vom Benutzer geschriebener Text eines Blocks (Freitext und Textfelder, keine Auswahlen) mit Pruefoptionen
const typedTexts = (b) => (b.type === 'text' ? [[b.text, {}]]
  : formFields(b.tpl).filter((f) => f.type === 'text').map((f) => [String(b.values[f.name] || ''), FIELD_SPELL]));
// Textfelder stehen meist nach "Name:" -> der Anfang darf klein sein
const FIELD_SPELL = { sentenceStart: false };

function sendChecked(blocks, { spellChecked = false } = {}) {
  const missing = blocks.filter((b) => b.type === 'module').map((b) => ({ b, list: blockProblems(b) })).filter((x) => x.list.length);
  if (!missing.length) {
    // Moegliche Rechtschreibfehler: Hinweis, aber Senden bleibt moeglich
    const typos = spellChecked ? [] : [...new Set(blocks.flatMap(typedTexts).flatMap(([t, o]) => spell.check(t, o).map((e) => spell.label(e))))];
    if (!typos.length) return send(joinBlocks(blocks));
    openDialog('Mögliche Rechtschreibfehler', [
      el('p', {}, typos.length === 1 ? 'Hier ist vielleicht etwas falsch geschrieben:' : `Hier sind ${typos.length} Stellen vielleicht falsch geschrieben:`),
      el('p', { class: 'chips' }, typos.map((w) => el('span', { class: 'chip spell-chip' }, w))),
      el('p', { class: 'help' }, 'Zum Korrigieren die markierten Wörter unter dem Text antippen.'),
    ], {
      saveLabel: 'Trotzdem senden',
      cancelLabel: 'Korrigieren',
      onSave: () => { setTimeout(() => sendChecked(blocks, { spellChecked: true }), 0); },
    });
    return false;
  }
  const total = missing.reduce((n, x) => n + x.list.length, 0);
  openDialog('Fehlende Angaben', [
    el('p', {}, total === 1 ? 'Eine Angabe fehlt noch. Es wurde nichts gesendet.' : `${total} Angaben fehlen noch. Es wurde nichts gesendet.`),
    el('ul', { class: 'missing-list' }, missing.map(({ b, list }) => el('li', {},
      el('b', {}, b.title), ': ',
      list.map(({ f, problem }) => (problem === 'fehlt' ? f.name : `${f.name} (${problem})`)).join(', ')))),
  ], {
    saveLabel: 'Zum ersten fehlenden Feld',
    cancelLabel: 'Schließen',
    // Erst nach dem Schliessen der Meldung springen (vorher ist der Rest der Seite gesperrt)
    onSave: () => setTimeout(() => {
      const first = missing[0];
      const node = document.querySelector(`[data-block="${first.b.id}"] [data-field="${CSS.escape(first.list[0].f.name)}"]`);
      if (!node) return;
      showTab('write');
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash');
      node.querySelector('input')?.focus({ preventScroll: true });
    }, 50),
  });
  return false;
}

/* ================= Verschieben per Ziehen ================= */

const LONG_PRESS_MS = 350;
let drag = null;

/*
 * Touch: gedrueckt halten, dann ziehen (kurzes Wischen scrollt normal).
 * Maus: sofort ziehen. Der Griff (immediate) zieht auch per Touch sofort.
 */
function enableDrag(handle, b, card, { immediate = false } = {}) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return;
    if (!immediate && e.target.closest('button, input, textarea, select')) return;
    const touchLike = e.pointerType !== 'mouse';
    drag = { b, card, handle, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, y: e.clientY, active: false, wait: touchLike && !immediate, immediate };
    if (drag.wait) drag.timer = setTimeout(() => drag && startDrag(), LONG_PRESS_MS);
    else if (immediate) { e.preventDefault(); startDrag(); }
  });
  handle.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });
}

function startDrag() {
  const d = drag;
  d.active = true;
  clearTimeout(d.timer);
  try { d.handle.setPointerCapture(d.pointerId); } catch { /* egal */ }
  navigator.vibrate?.(25);
  // Positionen aller Bloecke zu Beginn merken (Seitenkoordinaten)
  d.scroll0 = window.scrollY;
  d.rects = [...document.querySelectorAll('#docBlocks > .block')].map((n) => {
    const r = n.getBoundingClientRect();
    return { id: n.dataset.block, top: r.top + window.scrollY, height: r.height };
  });
  d.self = d.rects.find((r) => r.id === d.b.id);
  d.line = el('div', { class: 'drop-line' });
  $('#docBlocks').append(d.line);
  d.card.classList.add('dragging');
  document.body.classList.add('drag-on');
  moveDrag();
  autoScroll();
}

function moveDrag() {
  const d = drag;
  const delta = d.y - d.y0 + (window.scrollY - d.scroll0);
  d.card.style.transform = `translateY(${delta}px)`;
  // Ziel: wie viele andere Bloecke liegen mit ihrer Mitte oberhalb der Kartenmitte?
  const center = d.self.top + d.self.height / 2 + delta;
  const others = d.rects.filter((r) => r.id !== d.b.id);
  d.target = others.filter((r) => r.top + r.height / 2 < center).length;
  const box = $('#docBlocks').getBoundingClientRect().top + window.scrollY;
  const at = d.target < others.length ? others[d.target].top - 5 : others.length ? others[others.length - 1].top + others[others.length - 1].height + 5 : d.self.top;
  d.line.style.top = (at - box) + 'px';
}

// Am oberen/unteren Rand automatisch mitscrollen
function autoScroll() {
  if (!drag || !drag.active) return;
  // Je naeher am Rand, desto schneller (bis ca. 1500 px/s)
  const zone = 120, top = 70, bottom = window.innerHeight - 150;
  const v = drag.y < top + zone ? -Math.min(1, (top + zone - drag.y) / zone) * 25
    : drag.y > bottom - zone ? Math.min(1, (drag.y - bottom + zone) / zone) * 25 : 0;
  if (v) { window.scrollBy(0, v); moveDrag(); }
  requestAnimationFrame(autoScroll);
}

function endDrag(drop) {
  const d = drag;
  drag = null;
  if (!d) return;
  clearTimeout(d.timer);
  if (!d.active) return;
  d.line.remove();
  d.card.classList.remove('dragging');
  d.card.style.transform = '';
  document.body.classList.remove('drag-on');
  if (drop && d.target != null) {
    const rest = doc.filter((x) => x !== d.b);
    rest.splice(d.target, 0, d.b);
    const changed = rest.some((x, i) => x !== doc[i]);
    doc = rest;
    if (changed) { saveDoc(); renderDoc(); }
  }
}

document.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.y = e.clientY;
  if (drag.active) return moveDrag();
  const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
  if (drag.wait) { if (dist > 8) endDrag(false); } // Finger bewegt sich vor Ablauf -> Scrollen
  else if (dist > 5) startDrag();                    // Maus: ab 5 px ziehen
});
document.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(true); });
document.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(false); });
// Waehrend des Ziehens darf der Browser nicht scrollen
document.addEventListener('touchmove', (e) => { if (drag && (drag.active || drag.wait)) { if (drag.active) e.preventDefault(); } }, { passive: false });

/* ================= Baustein-Auswahl im Schreiben-Fenster ================= */

function openPicker() {
  const search = el('input', { type: 'search', placeholder: 'Bausteine suchen …' });
  const list = el('div', {});
  const added = new Map();
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const groups = new Map();
    for (const it of listItems().filter((x) => !q || (x.title + ' ' + x.category + ' ' + x.body).toLowerCase().includes(q))) {
      const c = it.category || (it.kind === 'form' ? 'Formulare' : 'Allgemein');
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(it);
    }
    list.replaceChildren();
    if (!groups.size) list.append(el('div', { class: 'empty' }, 'Keine Bausteine gefunden.'));
    for (const [cat, group] of groups) {
      list.append(el('div', { class: 'row', style: 'margin-top:12px' },
        el('h2', { class: 'grow', style: 'margin:0' }, cat),
        group.length > 1 ? el('button', { type: 'button', class: 'btn small', onclick: () => { group.forEach((it) => add(it)); } }, '＋ alle') : null));
      list.append(el('div', { class: 'pick-list' }, group.map((it) => el('button', {
        type: 'button', class: 'pick', onclick: () => add(it),
      }, el('span', { class: 'grow' }, it.title, formFields(it.body).length ? el('span', { class: 'badge' }, 'interaktiv') : null),
      added.get(it.id) ? el('span', { class: 'pick-n' }, '✓ ' + added.get(it.id)) : el('span', { class: 'pick-n' }, '＋')))));
    }
  };
  const add = (it) => { addToDoc(it, { quiet: true }); added.set(it.id, (added.get(it.id) || 0) + 1); draw(); };
  search.addEventListener('input', draw);
  draw();
  openDialog('Baustein hinzufügen', [search, list]);
}

/* ================= Feld-Editor (beim Bearbeiten eines Bausteins) ================= */

// Zeigt die Felder eines Bausteins und erlaubt Hinzufuegen/Bearbeiten ohne Syntax
function fieldEditor(bodyArea) {
  const box = el('div', { class: 'fields-box' });
  const draw = () => {
    const fields = formFields(bodyArea.value);
    box.replaceChildren(
      el('div', { class: 'row' },
        el('span', { class: 'grow help' }, fields.length ? `Felder (${fields.length}) – antippen zum Bearbeiten:` : 'Noch keine Felder. Mit Feldern wird der Baustein im Protokoll interaktiv.'),
        el('button', { type: 'button', class: 'btn small primary', onclick: () => openFieldBuilder(bodyArea, null, draw) }, '＋ Feld')),
      fields.length ? el('div', { class: 'chips' }, fields.map((f) => el('button', {
        type: 'button', class: 'chip', onclick: () => openFieldBuilder(bodyArea, f, draw),
      }, `${f.name} · ${FIELD_TYPES[f.type]}${f.optional ? ' · optional' : ''}`))) : null);
  };
  bodyArea.addEventListener('input', draw);
  draw();
  return box;
}

function openFieldBuilder(bodyArea, field0, onDone) {
  const dlg = $('#dlg2'), form = $('#dlg2Form');
  const f = field0 ? { ...field0, options: [...field0.options], defaults: [...field0.defaults] } : { name: '', type: 'single', optional: false, options: [], defaults: [] };
  const required = el('input', { type: 'checkbox', checked: !f.optional });
  const name = el('input', { type: 'text', required: true, value: f.name, placeholder: 'z. B. Atemwege' });
  const type = el('select', {}, Object.entries(FIELD_TYPES).map(([k, v]) => el('option', { value: k, selected: f.type === k }, v)));
  const opts = el('textarea', { rows: 6, placeholder: 'frei und gesichert\ngefährdet' }, f.options.join('\n'));
  const defBox = el('div', { class: 'chips' });
  const optField = field('Auswahlmöglichkeiten (eine pro Zeile)', opts);
  // Kein <label>: Knoepfe darin wuerden beim Neuzeichnen doppelt ausgeloest
  const defField = el('div', { class: 'field' }, el('span', {}, 'Vorauswahl (optional, antippen)'), defBox);
  const readOpts = () => opts.value.split('\n').map(cleanOption).filter(Boolean);
  const drawDefaults = () => {
    const isChoice = type.value === 'single' || type.value === 'multi';
    optField.hidden = defField.hidden = !isChoice;
    const list = readOpts();
    f.defaults = f.defaults.filter((d) => list.includes(d));
    if (type.value === 'single') f.defaults = f.defaults.slice(0, 1);
    defBox.replaceChildren(...list.map((o) => el('button', {
      type: 'button', class: 'chip' + (f.defaults.includes(o) ? ' sel' : ''), onclick: () => {
        if (f.defaults.includes(o)) f.defaults = f.defaults.filter((d) => d !== o);
        else f.defaults = type.value === 'single' ? [o] : [...f.defaults, o];
        drawDefaults();
      },
    }, o)));
  };
  opts.addEventListener('input', drawDefaults);
  type.addEventListener('change', drawDefaults);

  form.replaceChildren(
    el('h3', {}, field0 ? 'Feld bearbeiten' : 'Neues Feld'),
    field('Name', name),
    field('Art', type),
    el('label', { class: 'check', style: 'margin-top:-6px' }, required, 'Pflichtfeld – Senden erst, wenn ausgefüllt'),
    el('p', { class: 'help', style: 'margin-top:-6px' }, 'Einfachauswahl = genau eine Option · Mehrfachauswahl = mehrere Optionen (z. B. Maßnahmen). Optionen, die mit „kein“ beginnen, heben die anderen auf.'),
    optField,
    defField,
    el('div', { class: 'row', style: 'margin-top:8px' },
      field0 ? el('button', { type: 'button', class: 'btn danger', onclick: () => {
        if (!confirm(`Feld „${f.name}“ aus dem Baustein entfernen?`)) return;
        bodyArea.value = bodyArea.value.split(field0.token).join('');
        bodyArea.dispatchEvent(new Event('input'));
        dlg.close();
      } }, 'Entfernen') : null,
      el('span', { class: 'grow' }),
      el('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Abbrechen'),
      el('button', { type: 'submit', class: 'btn primary' }, field0 ? 'Übernehmen' : 'Einfügen')));
  drawDefaults();

  form.onsubmit = (e) => {
    e.preventDefault();
    const nf = { name: cleanName(name.value), type: type.value, optional: !required.checked, options: readOpts(), defaults: f.defaults };
    if (!nf.name) return toast('Bitte einen Namen eingeben', 'err');
    if ((nf.type === 'single' || nf.type === 'multi') && nf.options.length < 2) return toast('Mindestens zwei Auswahlmöglichkeiten eintragen', 'err');
    const token = fieldToken(nf);
    if (field0) {
      bodyArea.value = bodyArea.value.split(field0.token).join(token);
    } else {
      const s = bodyArea.selectionStart ?? bodyArea.value.length;
      bodyArea.setRangeText(token, s, bodyArea.selectionEnd ?? s, 'end');
    }
    bodyArea.dispatchEvent(new Event('input'));
    dlg.close();
    onDone();
  };
  dlg.showModal();
  if (!field0) name.focus();
}

/* ================= Vorlagen ================= */

function openTemplates() {
  const exists = (t) => listItems().some((i) => i.title === t.title && !i.team_id);
  const target = el('select', {},
    el('option', { value: '' }, 'Meine eigenen'),
    ...cloud.adminTargets().map((t) => el('option', { value: t.id }, t.label)));
  const addTpl = (t) => { putItem(newItem('module', { ...t, team_id: target.value || null })); renderModules(); };
  const list = el('div', {});
  const draw = () => {
    const groups = new Map();
    TEMPLATES.forEach((t) => { if (!groups.has(t.category)) groups.set(t.category, []); groups.get(t.category).push(t); });
    list.replaceChildren();
    for (const [cat, group] of groups) {
      list.append(el('div', { class: 'row', style: 'margin-top:12px' },
        el('h2', { class: 'grow', style: 'margin:0' }, cat),
        el('button', { type: 'button', class: 'btn small', onclick: () => { group.forEach(addTpl); toast(`${group.length} Bausteine hinzugefügt`); draw(); } }, '＋ alle')));
      list.append(el('div', { class: 'pick-list' }, group.map((t) => el('button', { type: 'button', class: 'pick', onclick: () => { addTpl(t); toast(`„${t.title}“ hinzugefügt`); draw(); } },
        el('span', { class: 'grow' }, el('span', { style: 'display:block' }, t.title), el('span', { class: 'help' }, templatePreview(t.body).slice(0, 90) + '…')),
        el('span', { class: 'pick-n' }, exists(t) ? '✓' : '＋')))));
    }
  };
  draw();
  openDialog('Vorlagen', [
    el('p', { class: 'help', style: 'margin-top:0' }, 'Fertige interaktive Bausteine zum Übernehmen. Danach kannst du sie frei anpassen (✎). B–E sind Vorschläge.'),
    cloud.adminTargets().length ? field('Hinzufügen zu', target) : null,
    list]);
}

/* ================= Schreiben: Bedienelemente ================= */

// "Alles senden" laesst das Protokoll stehen; geloescht wird erst mit "Einsatz beenden"
$('#sendBtn').addEventListener('click', () => sendChecked(doc));

function endMission() {
  const dlg = $('#dlg');
  openDialog('Einsatz beenden?', [
    el('p', {}, 'Bist du sicher? Alle Bausteine im Protokoll werden zurückgesetzt und der Freitext gelöscht. Das kann nicht rückgängig gemacht werden.'),
    el('p', { class: 'help' }, 'Deine gespeicherten Bausteine bleiben natürlich erhalten.'),
  ], {
    saveLabel: 'Ja, Einsatz beenden',
    onSave: () => {
      clearDoc();
      window.scrollTo(0, 0);
      toast('Einsatz beendet – Protokoll zurückgesetzt');
    },
  });
  dlg.querySelector('button[type=submit]').classList.replace('primary', 'danger-fill');
}
$('#endBtn').addEventListener('click', endMission);
$('#addBlockBtn').addEventListener('click', openPicker);
$('#tokenSel').addEventListener('change', (e) => {
  const v = e.target.value;
  e.target.value = '';
  if (!v) return;
  const ta = activeTextArea();
  ta.setRangeText(v, ta.selectionStart, ta.selectionEnd, 'end');
  ta.dispatchEvent(new Event('input'));
  ta.focus();
});
