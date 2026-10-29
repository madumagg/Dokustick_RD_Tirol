import { newDevice } from '../lib/harness.mjs';

export const title = 'Baustein-Editor: Abschnitte (Feld samt Beschriftung) per Ziehen umsortieren';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const p = await newDevice(t, { name: 'Reihenfolge', viewport: { width: 390, height: 1400 } });

  // Zerlegen: Zeichensetzung bleibt erhalten, Felder werden nie geteilt
  const r = await p.evaluate(() => ({
    roundtrip: TEMPLATES.every((x) => joinPieces(splitPieces(x.body)) === x.body),
    a: splitPieces(TEMPLATES.find((x) => x.title === 'A – Atemwege').body),
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

  // --- Fall aus der Praxis: Feld klebte vor der Ueberschrift, nach dem Verschieben verschmolzen zwei Abschnitte
  const L = '{{Lagerung+:Sitzend im Tragstuhl|Liegend|erhöhter Oberkörper}}';
  const M = '{{Maßnahmen E+:*keine Maßnahmen erforderlich|Wärmeerhalt}}';
  const exposure = `${L} E – Exposure: {{Befund E:*keine weiteren Auffälligkeiten|Verletzungen (siehe Freitext)}}, Temp. {{Temp?}} °C. Maßnahmen: ${M}.`;
  await p.click('#dlg >> text=Abbrechen');
  await p.evaluate((b) => { putItem(newItem('module', { title: 'E Lagerung', body: b })); renderModules(); }, exposure);
  await p.click('#modList .mod:has-text("E Lagerung") button[title=Bearbeiten]');
  const eTexts = (await rows.locator('span.grow').allTextContents()).map((x) => x.trim());
  ok(JSON.stringify(eTexts) === JSON.stringify(['[Lagerung]', 'E – Exposure: [Befund E]', 'Temp. [Temp] °C', 'Maßnahmen: [Maßnahmen E]']),
    'Feld vor der Überschrift ist ein eigener Abschnitt: ' + eTexts.join(' | '));
  await rows.first().locator('.grip').focus();
  for (let i = 0; i < 3; i++) {
    await p.keyboard.press('ArrowDown');
    // Fokus wandert nach dem Neuzeichnen mit (setTimeout), erst dann weiter
    await p.waitForFunction((k) => document.activeElement.closest('.piece') === document.querySelectorAll('#dlg .piece-list .piece')[k], i + 1, { timeout: 2000 });
  }
  const moved = await p.inputValue('#dlg textarea[name=text]');
  ok(moved === `E – Exposure: {{Befund E:*keine weiteren Auffälligkeiten|Verletzungen (siehe Freitext)}}, Temp. {{Temp?}} °C, Maßnahmen: ${M}. ${L}.`, 'Lagerung ans Ende verschoben: ' + moved.replace(/\{\{[^}]*\}\}/g, '[F]'));
  ok(await rows.count() === 4 && (await rows.last().locator('span.grow').textContent()).trim() === '[Lagerung]', 'Nichts zusammengelegt, weiterhin 4 Abschnitte');
  const merged = await p.evaluate(() => {
    const bodies = [...TEMPLATES.map((t) => t.body), document.querySelector('#dlg textarea[name=text]').value, 'Pat. wach, orientiert. kreislaufstabil {{K:ja|nein}}. Haut {{H:rosig|blass}}.'];
    let bad = 0, n = 0;
    for (const body of bodies) {
      const count = splitPieces(body).pieces.length;
      for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) {
        if (i === j) continue;
        const parts = splitPieces(body);
        const [x] = parts.pieces.splice(i, 1); parts.pieces.splice(j, 0, x);
        parts.seps = stableSeps(parts);
        n++;
        if (splitPieces(joinPieces(parts)).pieces.length !== count) bad++;
      }
    }
    return { bad, n };
  });
  ok(merged.bad === 0, `Alle Vorlagen: ${merged.n} Verschiebungen, keine legt Abschnitte zusammen`);

  // ＋ Feld ohne vorher ins Textfeld zu tippen (Cursor am Anfang): ans Ende statt vor die Ueberschrift
  await p.evaluate(() => { const ta = document.querySelector('#dlg textarea[name=text]'); ta.value = 'E – Exposure: {{Befund:a|b}}.'; ta.dispatchEvent(new Event('input')); ta.setSelectionRange(0, 0); });
  await p.click('#dlg >> text=＋ Feld');
  await p.fill('#dlg2 input[type=text]', 'Lagerung');
  await p.fill('#dlg2 textarea', 'Liegend\nSitzend');
  await p.click('#dlg2 button[type=submit]');
  ok(await p.inputValue('#dlg textarea[name=text]') === 'E – Exposure: {{Befund:a|b}}, {{Lagerung:Liegend|Sitzend}}.', 'Cursor am Anfang: neues Feld ans Ende vor den Punkt: ' + await p.inputValue('#dlg textarea[name=text]'));

  // --- Tippen im Baustein-Text: Fokus bleibt im Textfeld (iPad: sonst schliesst sich die Tastatur)
  await p.click('#dlg textarea[name=text]');
  await p.keyboard.press('End');
  await p.keyboard.type(' Test', { delay: 20 });
  ok(await p.evaluate(() => document.activeElement.name === 'text') && (await p.inputValue('#dlg textarea[name=text]')).endsWith('}}. Test'),
    'Tippen: alle Buchstaben kommen an, Fokus bleibt im Textfeld');

  // --- Fester Text wird ein eigener, verschiebbarer Abschnitt (Fall aus der Praxis)
  const fixedText = async (body, text) => {
    await p.evaluate((b) => { const ta = document.querySelector('#dlg textarea[name=text]'); ta.value = b; ta.dispatchEvent(new Event('input')); ta.setSelectionRange(0, 0); }, body);
    await p.click('#dlg >> text=＋ Feld');
    await p.selectOption('#dlg2 select', 'fixed');
    await p.fill('#dlg2 textarea', text);
    await p.click('#dlg2 button[type=submit]');
    return { body: await p.inputValue('#dlg textarea[name=text]'), pieces: (await rows.locator('span.grow').allTextContents()).map((x) => x.trim()) };
  };
  let r2 = await fixedText('B: Atmung {{Atmung:unauffällig|Dyspnoe}}.', 'mit O2-Gabe');
  ok(r2.body === 'B: Atmung {{Atmung:unauffällig|Dyspnoe}}, mit O2-Gabe.' && r2.pieces.at(-1) === 'mit O2-Gabe', 'Fester Text klein: mit Komma, eigener Abschnitt: ' + r2.body);
  r2 = await fixedText('B: Atmung {{Atmung:unauffällig|Dyspnoe}}.', 'Pat. über Risiken aufgeklärt.');
  ok(r2.body === 'B: Atmung {{Atmung:unauffällig|Dyspnoe}}. Pat. über Risiken aufgeklärt.' && r2.pieces.length === 2, 'Fester Text mit Punkt: eigener Satz, kein „..“: ' + r2.body);
  r2 = await fixedText('Monitoring angelegt.', 'keine Auffälligkeiten');
  ok(r2.body === 'Monitoring angelegt, keine Auffälligkeiten.' && r2.pieces.length === 2, 'Baustein ohne Felder: fester Text als zweiter Abschnitt: ' + r2.body);
  await p.evaluate(() => { const ta = document.querySelector('#dlg textarea[name=text]'); ta.value = 'A: {{A:frei|gefährdet}}. Maßnahmen: {{M:keine|O2}}.'; ta.dispatchEvent(new Event('input')); ta.setSelectionRange(25, 25); });
  await p.click('#dlg >> text=＋ Feld');
  await p.selectOption('#dlg2 select', 'fixed');
  await p.fill('#dlg2 textarea', 'Pat. kooperativ');
  await p.click('#dlg2 button[type=submit]');
  ok(await p.inputValue('#dlg textarea[name=text]') === 'A: {{A:frei|gefährdet}}. Pat. kooperativ. Maßnahmen: {{M:keine|O2}}.', 'Mitten im Text: klebt nicht am folgenden Abschnitt: ' + await p.inputValue('#dlg textarea[name=text]'));
}
