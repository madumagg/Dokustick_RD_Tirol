import { newDevice } from '../lib/harness.mjs';

export const title = 'Baustein-Editor: Abschnitte (Feld samt Beschriftung) per Ziehen umsortieren';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const p = await newDevice(t, { name: 'Reihenfolge', viewport: { width: 390, height: 1400 } });

  // Zerlegen: Zeichensetzung bleibt erhalten, Felder werden nie geteilt
  const r = await p.evaluate(() => ({
    roundtrip: TEMPLATES.every((x) => joinPieces(splitPieces(x.body)) === x.body),
    a: splitPieces(TEMPLATES[0].body),
    vital: splitPieces(TEMPLATES.find((x) => x.title === 'Vitalparameter').body).pieces.map(templatePreview),
    gcs: splitPieces(TEMPLATES.find((x) => x.title === 'GCS').body).pieces.length,
    swapped: (() => { const s = splitPieces('A – Atemwege: {{A:x, y|z}}. Maßnahmen: {{M+:a|b}}.'); s.pieces.reverse(); return joinPieces(s); })(),
  }));
  ok(r.roundtrip, 'Alle Vorlagen: zerlegen und wieder zusammensetzen ergibt denselben Text');
  ok(r.a.pieces.length === 2 && r.a.end === '.', 'A – Atemwege: 2 Abschnitte, Punkt am Ende bleibt am Ende');
  ok(JSON.stringify(r.vital) === JSON.stringify(['RR [RR] mmHg', 'HF [HF]/min', 'SpO2 [SpO2] %', 'AF [AF]/min', 'BZ [BZ] mg/dl', 'Temp. [Temp] °C', 'GCS [GCS]']),
    'Vitalparameter: 7 Abschnitte mit Einheit, „Temp.“ nicht getrennt: ' + r.vital.join(' | '));
  ok(r.gcs === 4, 'GCS: eine Zeile je Abschnitt');
  ok(r.swapped === 'Maßnahmen: {{M+:a|b}}. A – Atemwege: {{A:x, y|z}}.', 'Getauscht mit richtiger Zeichensetzung, Komma im Feld bleibt: ' + r.swapped);

  // Baustein-Editor: Pfeiltasten am Griff
  await p.click('nav button[data-tab=modules]');
  await p.click('#modList .mod:has-text("A – Atemwege") button[title=Bearbeiten]');
  const rows = p.locator('#dlg .piece-list .piece');
  ok(await rows.count() === 2 && (await rows.first().textContent()).includes('A – Atemwege: [Atemwege]'), 'Editor zeigt die Abschnitte mit Feldern als [Name]');
  ok(!(await p.locator('#dlgForm').evaluate((f) => [...f.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === 'null'))), 'Kein „null“ im Dialog ohne Team');
  await rows.nth(1).locator('.grip').focus();
  await p.keyboard.press('ArrowUp');
  const body = await p.inputValue('#dlg textarea[name=text]');
  ok(body.startsWith('Maßnahmen: {{Maßnahmen A+:') && body.includes('}}. A – Atemwege: {{Atemwege:') && body.endsWith('}}.'), 'Pfeil hoch: Maßnahmen vor Atemwege, Satzzeichen stimmen');
  const focused = await p.waitForFunction(() => document.activeElement.classList.contains('grip') && document.activeElement.closest('.piece') === document.querySelector('#dlg .piece-list .piece'), null, { timeout: 2000 }).then(() => true, () => false);
  ok(focused, 'Fokus wandert mit, weitere Pfeiltasten möglich');
  await p.click('#dlg >> text=Abbrechen');

  // Ziehen mit der Maus: GCS-Abschnitt der Vitalparameter nach oben
  await p.click('#modTemplates');
  await p.locator('#dlg .pick:has(span[style*="block"]:text-is("Vitalparameter"))').click();
  await p.click('#dlg >> text=Schließen');
  await p.click('#modList .mod:has(.title:text-matches("^Vitalparameter")) button[title=Bearbeiten]');
  const h = await rows.last().locator('.grip').boundingBox();
  const top = await rows.first().boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + ((top.y - 4 - h.y - h.height / 2) * i) / 12);
  ok(await p.locator('#dlg .piece.dragging').count() === 1 && await p.locator('#dlg .piece-list .drop-line').count() === 1, 'Ziehen: Abschnitt angehoben, Einfügelinie sichtbar');
  await p.screenshot({ path: t.out + '/reihenfolge-ziehen.png' });
  await p.mouse.up();
  const vb = await p.inputValue('#dlg textarea[name=text]');
  ok(vb.startsWith('GCS {{GCS:') && vb.includes('}}, RR {{RR}} mmHg, HF') && vb.endsWith('Temp. {{Temp:#}} °C'), 'GCS nach oben gezogen, Kommas stimmen: ' + vb.slice(0, 60) + '…');
  await p.click('#dlg button[type=submit]');
  await p.evaluate(() => addToDoc(listItems().find((i) => i.title === 'Vitalparameter'), { quiet: true }));
  await p.click('nav button[data-tab=write]');
  const labels = await p.locator('.block-mod:has-text("Vitalparameter") [data-field] > span:first-child').allTextContents();
  ok(labels[0].startsWith('GCS') && labels[1].startsWith('RR'), 'Im Protokoll erscheinen die Felder in der neuen Reihenfolge');

  // --- Fall aus der Praxis: neues Feld klebte direkt am Auskultations-Feld ("}}{{")
  const glued = 'B – Belüftung: Atmung {{Atmung:*unauffällig|Dyspnoe}}, AF {{AF:#}}/min, SpO2 {{SpO2:#}} %, Auskultation {{Auskultation:*seitengleich, vesikulär|Spastik}}{{mit/ohne O2+:mit O2|ohne O2}}. Maßnahmen: {{Maßnahmen B+:*keine Maßnahmen erforderlich|O2-Gabe}}.';
  await p.click('nav button[data-tab=modules]');
  await p.evaluate((b) => { putItem(newItem('module', { title: 'B geklebt', body: b })); renderModules(); }, glued);
  await p.click('#modList .mod:has-text("B geklebt") button[title=Bearbeiten]');
  const texts = await rows.locator('span.grow').allTextContents();
  ok(texts.length === 6 && texts[3].trim() === 'Auskultation [Auskultation]' && texts[4].trim() === '[mit/ohne O2]', 'Aneinanderklebende Felder sind eigene Abschnitte: ' + texts.map((x) => x.trim()).join(' | '));
  await rows.nth(4).locator('.grip').focus();
  await p.keyboard.press('ArrowUp');
  const fixed = await p.inputValue('#dlg textarea[name=text]');
  ok(fixed.includes('SpO2 {{SpO2:#}} %, {{mit/ohne O2+:mit O2|ohne O2}}, Auskultation {{Auskultation:') && fixed.endsWith('}}. Maßnahmen: {{Maßnahmen B+:*keine Maßnahmen erforderlich|O2-Gabe}}.'),
    'Hinter SpO2 verschoben, Komma ergänzt, Rest unverändert');
  const out = await p.evaluate((b) => fillTemplate(b, { ...initialValues(b), SpO2: '96', AF: '16', 'mit/ohne O2': ['mit O2'] }), fixed);
  ok(out === 'B – Belüftung: Atmung unauffällig, AF 16/min, SpO2 96 %, mit O2, Auskultation seitengleich, vesikulär. Maßnahmen: keine Maßnahmen erforderlich.', 'Protokolltext: ' + out);

  // --- ＋ Feld mit Cursor direkt hinter "%": Leerzeichen davor, Komma zum naechsten Abschnitt bleibt
  await p.evaluate(() => { const ta = document.querySelector('#dlg textarea[name=text]'); ta.value = 'SpO2 {{SpO2:#}} %, AF {{AF:#}}/min'; ta.dispatchEvent(new Event('input')); ta.setSelectionRange(17, 17); });
  await p.click('#dlg >> text=＋ Feld');
  await p.fill('#dlg2 input[type=text]', 'O2');
  await p.fill('#dlg2 textarea', 'mit O2\nohne O2');
  await p.click('#dlg2 button[type=submit]');
  ok(await p.inputValue('#dlg textarea[name=text]') === 'SpO2 {{SpO2:#}} % {{O2:mit O2|ohne O2}}, AF {{AF:#}}/min', 'Neues Feld hinter „%“ mit Leerzeichen eingefügt: ' + await p.inputValue('#dlg textarea[name=text]'));
  await p.evaluate(() => { const ta = document.querySelector('#dlg textarea[name=text]'); ta.setSelectionRange(15, 15); }); // direkt hinter "{{SpO2:#}}"
  await p.click('#dlg >> text=＋ Feld');
  await p.fill('#dlg2 input[type=text]', 'Messung');
  await p.fill('#dlg2 textarea', 'Finger\nOhr');
  await p.click('#dlg2 button[type=submit]');
  ok((await p.inputValue('#dlg textarea[name=text]')).startsWith('SpO2 {{SpO2:#}}, {{Messung:Finger|Ohr}} %'), 'Direkt hinter einem Feld: Komma statt Ankleben');
}
