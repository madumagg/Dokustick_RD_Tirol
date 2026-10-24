import { newDevice, sentText } from '../lib/harness.mjs';

export const title = 'Scores: GCS mit Summe der Punkte, Summenfeld im Feld-Editor';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const p = await newDevice(t, { name: 'GCS', ble: true });
  await p.click('#connBtn');
  await p.waitForSelector('text=Verbunden');

  // Vorlage uebernehmen und ins Protokoll legen
  await p.click('nav button[data-tab=modules]');
  await p.click('#modTemplates');
  await p.locator('#dlg .pick:has(span[style*="block"]:text-is("GCS"))').click();
  await p.click('#dlg >> text=Schließen');
  await p.locator('#modList .mod:has(.title:text-matches("^GCS")) .send').click();
  await p.click('nav button[data-tab=write]');
  const G = p.locator('.block-mod:has-text("GCS")');
  ok(await G.locator('[data-field="Augen öffnen"] .chip').count() === 4 + 1 && await G.locator('[data-field="Motorisch"] .chip').count() === 6 + 1, 'GCS-Karte: 4 Optionen Augen, 6 Optionen Motorik (plus „…“)');
  ok((await G.locator('.sum-val').textContent()).startsWith('–'), 'Ergebnis leer, solange nicht alles gewählt ist');
  ok(await G.locator('.badge.bad').textContent() === '3 fehlen', 'Drei Pflichtfelder offen, das Ergebnis zählt nicht als fehlend');

  await G.locator('.chip:text-is("auf Ansprache (3 Punkte)")').click();
  await G.locator('.chip:text-is("desorientiert (4 Punkte)")').click();
  ok((await G.locator('.sum-val').textContent()).startsWith('–'), 'Teilweise gewählt: noch kein Ergebnis');
  await G.locator('[data-field="Motorisch"] .chip:text-is("gezielte Bewegung (5 Punkte)")').click();
  ok((await G.locator('.sum-val').textContent()) === '12 Punkte', 'Ergebnis 3 + 4 + 5 = 12 Punkte');
  await G.locator('.chip:text-is("Spontan (4 Punkte)")').click();
  ok((await G.locator('.sum-val').textContent()) === '13 Punkte', 'Andere Auswahl: Ergebnis neu berechnet (13)');
  await p.screenshot({ path: t.out + '/gcs.png', fullPage: true });

  await p.click('#sendBtn');
  await p.waitForTimeout(800);
  const sent = await sentText(p);
  const exp = 'GCS – Augen öffnen: Spontan (4 Punkte)\nVerbal: desorientiert (4 Punkte)\nMotorisch: gezielte Bewegung (5 Punkte)\nErgebnis: 13 Punkte';
  ok(sent === exp, 'Gesendet nur die gewählten Optionen und das Ergebnis:\n' + sent);

  // Summenfeld im Feld-Editor anlegen
  ok(await p.evaluate(() => fieldToken({ name: 'Summe', type: 'sum', optional: false, options: [], defaults: [] })) === '{{Summe?:=Summe}}', 'Feld-Editor erzeugt {{Summe?:=Summe}}');
  ok(await p.evaluate(() => scoreSum('A {{A:x (1 Punkt)|y (2 Punkte)}} B {{B+:u (3 Pkt.)|v (4 P)}} C {{C:ohne Punkte|anders}} = {{S?:=Summe}}', { A: 'y (2 Punkte)', B: ['u (3 Pkt.)', 'v (4 P)'], C: 'anders' })) === 9,
    'Summe auch über Mehrfachauswahl und Schreibweisen „Pkt.“/„P“; Felder ohne Punkte zählen nicht');
  ok(await p.evaluate(() => fillTemplate('Ergebnis: {{S?:=Summe}} Punkte', {})) === 'Ergebnis:  Punkte' && await p.evaluate(() => fieldProblem(parseField('S?', '=Summe'), '')) === null,
    'Ohne Punkte-Felder: Summe leer, nie „fehlt“');
}
