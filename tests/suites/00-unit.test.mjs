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
    // "Beschriftung: {{leer}}" faellt samt Beschriftung weg
    const L = 'Kopf:\nText.\nKrankheitsbild: {{K?}}, \nMedikamente: {{M:@al2}}, \nDosis: {{D?}}.';
    eq(fillTemplate(L, { M: ['Glucose'] }), 'Kopf:\nText.\nMedikamente: Glucose.', 'Leere beschriftete Felder fallen samt Beschriftung weg');
    eq(fillTemplate(L, { K: 'Hypo', M: ['Glucose'], D: '15 g' }), 'Kopf:\nText.\nKrankheitsbild: Hypo, \nMedikamente: Glucose, \nDosis: 15 g.', 'Ausgefüllt bleibt alles stehen');
    eq(fillTemplate('Pat. wach, Schmerz: {{S?}}, RR {{RR}}', { RR: '120/80' }), 'Pat. wach, RR 120/80', 'Beschriftung in einer Zeile');
    eq(fillTemplate('Pat. wach. Schmerz: {{S?}}.', {}), 'Pat. wach. Schmerz: .', 'Ohne Komma davor bleibt alles wie bisher');
    eq(fillTemplate('A, Lange Beschriftung mit vielen Woertern: {{S?}}.', {}), 'A, Lange Beschriftung mit vielen Woertern: .', 'Lange Texte gelten nicht als Beschriftung');
    eq(fillTemplate('A, Dosis: {{S?}}.\nWeiterer Satz.', {}), 'A, Dosis: .\nWeiterer Satz.', 'Text in neuer Zeile hinter dem Feld bleibt erhalten');
    eq(fillTemplate('Gabe von {{M:@al1}}.', { M: ['Aspro Classic 320 mg p.o.'] }), 'Gabe von Aspro Classic 320 mg p.o.', 'Kein doppelter Punkt nach Abkürzung');
    eq(fillTemplate('M: {{M:@al1}}, Dosis: {{D?}}.', { M: ['Midazolam i.v.'] }), 'M: Midazolam i.v.', 'Kein doppelter Punkt, wenn das letzte Feld wegfällt');
    eq(fillTemplate('Pat. {{B}}...', { B: 'wach' }), 'Pat. wach...', 'Auslassungspunkte bleiben');

    // Feld-Syntax: Einlesen und Zurueckschreiben
    for (const tok of ['{{Name}}', '{{HF:#}}', '{{Haut:rosig|*blass}}', '{{M+:*keine|O2}}', '{{BZ?:#}}', '{{Maßnahmen+?:a|b}}', '{{Dauermedikation:@med}}', '{{Vorerkrankungen?:@dx}}', '{{Medikamente:@al1}}', '{{Medikamente?:@al2}}', '{{Krankheitsbild?:@kb1}}', '{{Krankheitsbild:@kb2}}']) {
      const [f] = formFields(tok);
      eq(fieldToken(f), tok, 'Feld-Syntax hin und zurück ' + tok);
    }
    eq(formFields('{{X+?:a|b}}')[0].optional && formFields('{{X+?:a|b}}')[0].type, 'multi', 'Mehrfach + optional erkannt');
    eq(fieldProblem(formFields('{{HF:#}}')[0], '18a'), 'keine Zahl', 'Zahlenprüfung');
    eq(fieldProblem(formFields('{{BZ?:#}}')[0], ''), null, 'Optionales leeres Feld ist in Ordnung');
    eq(fieldProblem(formFields('{{M:@med}}')[0], []), 'fehlt', 'Leeres Datenbank-Feld fehlt');
    eq([formFields('{{M:@al2}}')[0].type, isListField(formFields('{{M:@al2}}')[0]), isListField(formFields('{{K:@kb2}}')[0])], ['al2', true, false], 'Arzneimittelliste: Medikamente als Liste, Krankheitsbild als Einzelwert');
    eq(formFields('{{M:al2}}')[0].type, 'single', 'Ohne @ normale Auswahl');
    eq(fillTemplate('{{M:@al2}} ({{K:@kb2}})', { M: ['Dibondrin 30 mg i.v.', 'Prednisolon i.v.'], K: 'Allergische Reaktion' }), 'Dibondrin 30 mg i.v., Prednisolon i.v. (Allergische Reaktion)', 'Arzneimittelliste im Text');
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

    catalog.dx = [
      { id: 'k', name: 'Koronare Herzkrankheit', abbreviation: 'KHK, Verengung der Herzkranzgefäße', approved: true },
      { id: 'h', name: 'Herzinsuffizienz', abbreviation: 'HI, Herzschwäche', approved: true },
      { id: 'a', name: 'Arterielle Hypertonie', abbreviation: 'aHT, Bluthochdruck, häufig Ursache von Herzproblemen', approved: true },
    ];
    eq(catalog.search('dx', 'herz').map((e) => e.id), ['h', 'k', 'a'], 'Name (Wortanfang) vor Name (Teilwort) vor Beschreibung');
    eq(catalog.search('dx', 'bluthochdruck').map((e) => e.id), ['a'], 'Suche in der Beschreibung');

    // Sprachbefehle
    eq(processSpeech('neue zeile test komma fertig punkt'), '\ntest, fertig.', 'Sprachbefehle');
    return out;
  });
  for (const [c, m] of r) ok(c, m);
}
