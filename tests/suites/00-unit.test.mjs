// Schnelltest der Kernfunktionen direkt im Browser (ohne Bedienoberflaeche)
import { newDevice } from '../lib/harness.mjs';

export const title = 'Kernfunktionen: Feld-Syntax, Leerfelder, Kodierung, Suche, Sprachbefehle';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const p = await newDevice(t, { name: 'Einheit' });
  const r = await p.evaluate(() => {
    const out = [];
    const eq = (got, exp, msg) => out.push([JSON.stringify(got) === JSON.stringify(exp), msg + (JSON.stringify(got) === JSON.stringify(exp) ? '' : `: ${JSON.stringify(got)} statt ${JSON.stringify(exp)}`)]);
    const tpl = (title) => TEMPLATES.find((x) => x.title.startsWith(title)).body;

    // Leere Abschnitte fallen weg, Satzzeichen bleiben
    const B = tpl('B – Bel');
    eq(fillTemplate(B, initialValues(B)), 'B – Belüftung: Atmung unauffällig, Auskultation seitengleich, vesikulär. Maßnahmen: keine Maßnahmen erforderlich.', 'Leere Messwerte fallen weg');
    eq(fillTemplate(B, { ...initialValues(B), AF: '18', SpO2: '96' }), 'B – Belüftung: Atmung unauffällig, AF 18/min, SpO2 96 %, Auskultation seitengleich, vesikulär. Maßnahmen: keine Maßnahmen erforderlich.', 'Messwerte eingesetzt');
    eq(fillTemplate(tpl('Vital'), { HF: '80' }), 'HF 80/min', 'Nur ein Vitalwert');
    eq(fillTemplate(tpl('Schmerz'), { NRS: '5' }), 'Schmerz NRS 5/10.', 'Satzende bleibt erhalten');
    eq(fillTemplate('{{Feld 1}}{TAB}{{Feld 2}}', { 'Feld 2': 'x' }), '{TAB}x', 'Platzhalter bleiben stehen');
    eq(fillTemplate('Pat. {{B:wach, orientiert|somnolent}}.', { B: 'wach, orientiert' }), 'Pat. wach, orientiert.', 'Kommas in Optionen');

    // Feld-Syntax: Einlesen und Zurueckschreiben
    for (const tok of ['{{Name}}', '{{HF:#}}', '{{Haut:rosig|*blass}}', '{{M+:*keine|O2}}', '{{BZ?:#}}', '{{Maßnahmen+?:a|b}}', '{{Dauermedikation:@med}}', '{{Vorerkrankungen?:@dx}}']) {
      const [f] = formFields(tok);
      eq(fieldToken(f), tok, 'Feld-Syntax hin und zurück ' + tok);
    }
    eq(formFields('{{X+?:a|b}}')[0].optional && formFields('{{X+?:a|b}}')[0].type, 'multi', 'Mehrfach + optional erkannt');
    eq(fieldProblem(formFields('{{HF:#}}')[0], '18a'), 'keine Zahl', 'Zahlenprüfung');
    eq(fieldProblem(formFields('{{BZ?:#}}')[0], ''), null, 'Optionales leeres Feld ist in Ordnung');
    eq(fieldProblem(formFields('{{M:@med}}')[0], []), 'fehlt', 'Leeres Datenbank-Feld fehlt');
    eq([isExclusive('keine Maßnahmen erforderlich'), isExclusive('unbekannt'), isExclusive('Guedeltubus')], [true, true, false], 'Ausschließende Optionen');

    // Kodierung fuer den Dongle
    eq([...encode('a{TAB}b{ENTER}')], [97, 0, 0, 0x2B, 98, 0, 0, 0x28], 'Sondertasten kodiert');
    eq([...encode('{PAUSE:3000}')], [0, 0xFF, 255, 0, 0xFF, 45], 'Lange Pause aufgeteilt');
    eq(new TextDecoder().decode(encode('Eliquis® ≥ 5')), 'Eliquis >= 5', '® entfernt, ≥ ersetzt');
    eq(unsupportedChars('Test 😀 äöü'), ['😀'], 'Nicht tippbare Zeichen erkannt');

    // Datenbank-Suche
    catalog.med = [
      { id: '1', trade_name: 'Thrombo ASS', ingredient: 'Acetylsalicylsäure', dose: '100 mg', approved: true },
      { id: '2', trade_name: 'Concor', ingredient: 'Bisoprolol', dose: '5 mg', approved: true },
      { id: '3', trade_name: 'Basocin', ingredient: 'Clindamycin', dose: '1 %', approved: false },
    ];
    eq(catalog.search('med', 'thrombo 100').map((e) => e.id), ['1'], 'Suche mit mehreren Wörtern');
    eq(catalog.search('med', 'bisoprolol').map((e) => e.id), ['2'], 'Suche nach Wirkstoff');
    eq(catalog.search('med', 'as').map((e) => e.id), ['1', '3'], 'Wortanfang vor Vorschlag');
    eq(catalog.similar('med', { trade_name: 'thrombo ass ', dose: '100 MG' }), ['Thrombo ASS 100 mg'], 'Ähnliche Einträge erkannt');

    // Sprachbefehle
    eq(processSpeech('neue zeile test komma fertig punkt'), '\ntest, fertig.', 'Sprachbefehle');
    return out;
  });
  for (const [c, m] of r) ok(c, m);
}
