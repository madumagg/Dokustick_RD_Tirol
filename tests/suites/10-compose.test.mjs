import { newDevice, sentText } from '../lib/harness.mjs';

export const title = 'Protokoll, interaktive Bausteine, Pflichtfelder, Feld-Editor';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  let promptAnswer = '';
  const p = await newDevice(t, { name: 'Protokoll', ble: true, context: { deviceScaleFactor: 2 }, dialog: (d) => (d.type() === 'prompt' ? d.accept(promptAnswer) : d.accept()) });
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.reload();
  await p.click('#connBtn');
  await p.waitForSelector('text=Verbunden');

  // Bausteine: ABCDE vorhanden
  await p.click('nav button[data-tab=modules]');
  ok(await p.isVisible('#modList .mod:has-text("A – Atemwege") .badge:has-text("interaktiv")'), 'ABCDE-Bausteine vorhanden und als interaktiv markiert');
  ok((await p.textContent('#modList .mod:has-text("A – Atemwege") .prev')).includes('[Atemwege]'), 'Vorschau zeigt Felder als [Name]');
  await p.screenshot({ path: t.out + '/40-bausteine.png' });
  await p.click('#modList .mod:has-text("A – Atemwege") .send');
  await p.click('nav button[data-tab=write]');
  const A = p.locator('.block-mod:has-text("A – Atemwege")');
  ok(await A.locator('.chip.sel:has-text("keine Maßnahmen erforderlich")').isVisible(), 'Vorauswahl "keine Maßnahmen erforderlich" aktiv');
  await A.locator('.chip:has-text("frei und gesichert")').click();
  await A.locator('.chip:has-text("Guedeltubus")').click();
  ok(!(await A.locator('.chip.sel:has-text("keine Maßnahmen")').count()), '"Guedeltubus" hebt "keine Maßnahmen" auf');
  await A.locator('.chip:has-text("Larynxtubus")').click();
  ok((await A.locator('.preview').textContent()) === 'A – Atemwege: frei und gesichert. Maßnahmen: Guedeltubus, Larynxtubus.', 'Vorschau: ' + await A.locator('.preview').textContent());
  await A.locator('.chip:has-text("keine Maßnahmen erforderlich")').click();
  ok((await A.locator('.chip.sel').count()) === 2, '"keine Maßnahmen" hebt alle anderen Maßnahmen auf');
  await A.locator('.chip:has-text("Guedeltubus")').click();
  // eigener Wert
  promptAnswer = 'Absaugen';
  await A.locator('.chip.more >> nth=1').click();
  ok((await A.locator('.preview').textContent()).includes('Guedeltubus, Absaugen'), 'Eigener Wert per "…" ergänzt');

  // Freitext + weiterer Baustein ueber Auswahl
  await p.locator('.block-text textarea').last().fill('Pat. kreislaufstabil.');
  await p.click('#addBlockBtn');
  await p.click('#dlg .pick:has-text("B – Belüftung")');
  await p.click('#dlg .pick:has-text("Vitalparameter")');
  await p.click('#dlg >> text=Schließen');
  const blocks = await p.evaluate(() => doc.map((b) => b.type === 'text' ? 'T' : b.title[0]).join(''));
  ok(blocks === 'ATBVT', 'Reihenfolge der Blöcke: ' + blocks);
  const V = p.locator('.block-mod:has-text("Vitalparameter")');
  await V.locator('input').first().fill('130/80');
  await V.locator('.block-head button[title=Entfernen]').click();
  ok(!(await p.locator('.block-mod:has-text("Vitalparameter")').count()), 'Block entfernt');
  await p.locator('.block-mod:has-text("B – Belüftung") .grip').focus();
  await p.keyboard.press('ArrowUp');
  const order = await p.evaluate(() => doc.map((b) => b.type === 'text' ? 'T' : b.title[0]).join(''));
  ok(order === 'ABTT', 'Block nach oben verschoben: ' + order);
  await p.screenshot({ path: t.out + '/41-protokoll.png', fullPage: true });

  // Pflichtfelder: B hat leere Zahlenfelder -> rot markiert, Senden blockiert
  const B = p.locator('.block-mod:has-text("B – Belüftung")');
  ok(await B.locator('.badge.bad').textContent() === '2 fehlen' && await B.evaluate((n) => n.classList.contains('incomplete')), 'B: Karte rot, Abzeichen "2 fehlen"');
  ok(await B.locator('[data-field="AF"] > span.missing').count() === 1 && await B.locator('[data-field="AF"] input.missing').count() === 1, 'B: leeres Feld AF rot markiert');
  ok(!(await A.locator('.badge.bad').isVisible()), 'A: vollständig, kein Hinweis');
  await p.click('#sendBtn');
  await p.waitForSelector('#dlg >> text=Fehlende Angaben');
  const msg = await p.textContent('#dlg');
  ok(msg.includes('2 Angaben fehlen noch') && msg.includes('B – Belüftung: AF, SpO2'), 'Senden blockiert, Meldung nennt fehlende Felder');
  await p.screenshot({ path: t.out + '/80-fehlende-angaben.png' });
  await p.click('#dlg >> text=Zum ersten fehlenden Feld');
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.activeElement.closest('[data-field]')?.dataset.field) === 'AF', 'Sprung zum ersten fehlenden Feld (AF)');
  ok((await sentText(p)) === '', 'Es wurde nichts gesendet');
  await B.locator('[data-field="AF"] input').fill('18a');
  ok(await B.locator('[data-field="AF"] > span').getAttribute('data-problem') === 'keine Zahl', 'Zahlenfeld: "18a" -> "keine Zahl"');
  await B.locator('[data-field="AF"] input').fill('18');
  await B.locator('[data-field="SpO2"] input').fill('96');
  ok(!(await B.evaluate((n) => n.classList.contains('incomplete'))), 'B nach dem Ausfüllen vollständig');
  // Einfachauswahl abwaehlen -> wieder fehlend
  await B.locator('.chip.sel:has-text("unauffällig")').click();
  ok(await B.locator('[data-field="Atmung"] > span.missing').count() === 1, 'Abgewählte Auswahl wird wieder rot');
  await B.locator('.chip:has-text("unauffällig")').click();
  await p.screenshot({ path: t.out + '/81-vollstaendig.png' });

  // Alles senden
  await p.click('#sendBtn');
  await p.waitForTimeout(800);
  const sent = await sentText(p);
  ok(sent === 'A – Atemwege: frei und gesichert. Maßnahmen: Guedeltubus, Absaugen.\n\nB – Belüftung: Atmung unauffällig, AF 18/min, SpO2 96 %, Auskultation seitengleich, vesikulär. Maßnahmen: keine Maßnahmen erforderlich.\n\nPat. kreislaufstabil.', 'Gesendet:\n' + sent);
  // Leerzeile abgeschaltet: Bloecke nur durch Zeilenumbruch getrennt
  await p.evaluate(() => { settings.blankLine = false; });
  await p.click('#sendBtn');
  await p.waitForTimeout(800);
  ok(!(await sentText(p)).includes('\n\n'), 'Ohne Leerzeile: Blöcke nur durch einen Zeilenumbruch getrennt');
  await p.evaluate(() => { settings.blankLine = true; });
  await A.locator('.block-head button[title="Nur diesen Block senden"]').click();
  await p.waitForTimeout(500);
  ok((await sentText(p)).startsWith('A – Atemwege') , 'Einzelnen Block senden');

  // Neu laden: Protokoll bleibt
  await p.reload();
  ok(await p.evaluate(() => doc.length) === 4 && (await p.locator('.block-mod:has-text("A – Atemwege") .chip.sel:has-text("Absaugen")').count()) === 1, 'Protokoll übersteht Neuladen');

  await p.click('#connBtn');
  await p.waitForSelector('text=Verbunden');
  // Feld-Editor
  await p.click('nav button[data-tab=modules]');
  await p.click('#modAdd');
  await p.fill('#dlg input[name=title]', 'Lagerung');
  await p.fill('#dlg textarea[name=text]', 'Lagerung: ');
  await p.click('#dlg >> text=＋ Feld');
  await p.fill('#dlg2 input[type=text]', 'Lage');
  await p.selectOption('#dlg2 select', 'multi');
  await p.fill('#dlg2 textarea', 'Oberkörper hoch\nSchocklage\nstabile Seitenlage\nVakuummatratze');
  await p.click('#dlg2 .chip:has-text("Oberkörper hoch")');
  await p.screenshot({ path: t.out + '/42-feld-editor.png' });
  await p.click('#dlg2 button[type=submit]');
  const body = await p.inputValue('#dlg textarea[name=text]');
  ok(body === 'Lagerung: {{Lage+:*Oberkörper hoch|Schocklage|stabile Seitenlage|Vakuummatratze}}', 'Feld eingefügt: ' + body);
  ok(await p.isVisible('#dlg .fields-box .chip:has-text("Lage · Mehrfachauswahl")'), 'Feldliste im Dialog aktualisiert');
  await p.click('#dlg .fields-box .chip:has-text("Lage")');
  await p.selectOption('#dlg2 select', 'single');
  await p.click('#dlg2 button[type=submit]');
  ok((await p.inputValue('#dlg textarea[name=text]')) === 'Lagerung: {{Lage:*Oberkörper hoch|Schocklage|stabile Seitenlage|Vakuummatratze}}', 'Feld geändert auf Einfachauswahl');
  // Optionales Textfeld
  await p.click('#dlg >> text=＋ Feld');
  await p.fill('#dlg2 input[type=text]', 'Bemerkung');
  await p.selectOption('#dlg2 select', 'text');
  await p.uncheck('#dlg2 input[type=checkbox]');
  await p.click('#dlg2 button[type=submit]');
  ok((await p.inputValue('#dlg textarea[name=text]')).endsWith('{{Bemerkung?}}'), 'Optionales Feld: Pflichtfeld-Haken weg -> {{Bemerkung?}}');
  await p.click('#dlg button[type=submit]');
  ok(await p.isVisible('#modList .mod:has-text("Lagerung") .badge:has-text("interaktiv")'), 'Neuer interaktiver Baustein gespeichert');
  await p.evaluate(() => addToDoc(listItems().find((i) => i.title === 'Lagerung'), { quiet: true }));
  const lag = p.locator('.block-mod:has-text("Lagerung")');
  ok(!(await lag.evaluate((n) => n.classList.contains('incomplete'))) && await lag.locator('[data-field="Bemerkung"] > span.missing').count() === 0, 'Leeres optionales Feld blockiert nicht');

  // Vorlagen
  await p.click('#modTemplates');
  await p.click('#dlg .pick:has-text("Schmerz")');
  await p.click('#dlg >> text=Schließen');
  ok(await p.isVisible('#modList .mod:has-text("Schmerz")'), 'Vorlage "Schmerz" übernommen');

  // Einfacher Baustein wird weiterhin sofort getippt
  await p.click('#modList .mod:has-text("Keine Allergien") .send');
  await p.waitForTimeout(500);
  { const t = await sentText(p); ok(t === 'Keine Allergien bekannt.', 'Einfacher Baustein sofort getippt: ' + JSON.stringify(t)); }

  // Altes Formular erscheint bei den Bausteinen
  ok(await p.isVisible('#modList h2:has-text("Formulare")'), 'Frühere Formulare erscheinen unter "Formulare"');

  // Diktat-Ziel: aktiver Textblock
  await p.click('nav button[data-tab=write]');
  await p.evaluate(() => insertDictation('neue zeile test komma fertig'));
  const lastText = await p.evaluate(() => doc.filter((b) => b.type === 'text').map((b) => b.text).join('|'));
  ok(lastText.includes('Test, fertig'), 'Diktat landet im Textblock: ' + JSON.stringify(lastText));

  await p.emulateMedia({ colorScheme: 'dark' });
  await p.screenshot({ path: t.out + '/43-protokoll-dunkel.png' });
}
