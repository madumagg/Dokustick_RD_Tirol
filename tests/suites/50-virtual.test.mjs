import { readFileSync } from 'node:fs';
import { newDevice, login, uniq } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Virtueller Dongle (Admins), PDF, Einsatz beenden';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const device = (name) => newDevice(t, { name, cloud: true, context: { acceptDownloads: true }, dialog: (d) => (/Trotzdem senden/.test(d.message()) ? d.accept() : d.dismiss()) });
  // --- Normaler Benutzer: keine Auswahl, direkt Bluetooth
  const U = await device('U');
  await login(U, `nutzer-${uniq()}@test.at`, { signup: true });
    await U.click('nav button[data-tab=write]');
  // Testbrowser hat kein Web Bluetooth: fuer normale Benutzer bleibt "Verbinden" gesperrt
  ok(await U.isDisabled('#connBtn'), 'Normaler Benutzer ohne Bluetooth: Verbinden gesperrt, kein virtueller Dongle');
  await U.evaluate(() => connectMenu());
  await U.waitForTimeout(300);
  ok(!(await U.isVisible('#dlg >> text=Virtueller Dongle')), 'Normaler Benutzer: Auswahl wird nie angeboten');

  // --- Admin
  const A = await device('A');
  await login(A, t.config.adminEmail);
    await A.click('nav button[data-tab=write]');
  await A.click('#connBtn');
  await A.click('#dlg >> text=Virtueller Dongle (Test)');
  await A.waitForSelector('#connText >> text=Virtueller Dongle');
  ok(await A.isVisible('#virtualOut'), 'Admin: virtueller Dongle verbunden, Ausgabe sichtbar');

  await A.evaluate(() => {
    clearDoc();
    addToDoc(TEMPLATES[0], { quiet: true });
    const b = doc[0]; b.values.Atemwege = 'gefährdet'; b.values['Maßnahmen A'] = ['Guedeltubus', 'i-gel Larynxmaske'];
    doc[doc.length - 1].text = 'Größe 1,80 m – „ok“ … 5 µg, 38 °C, Ä Ö Ü ß € @ 😀\nRR 120/80{TAB}Fertig{ENTER}Ende';
    saveDoc(); renderDoc();
  });
  await A.click('#sendBtn');
  await A.waitForFunction(() => vdongle.keystrokes > 0 && !sendJob, null, { timeout: 10000 });
  await A.waitForTimeout(200);
  const screen = await A.textContent('.vscreen');
  // Gedankenstrich gibt es auf keiner Tastatur -> Firmware tippt '-'
  const expected = 'A - Atemwege: gefährdet. Maßnahmen: Guedeltubus, i-gel Larynxmaske.\n\nGröße 1,80 m - "ok" ... 5 µg, 38 °C, Ä Ö Ü ß € @ \nRR 120/80TabFertig\nEnde';
  ok(screen === expected, 'Ausgabe wie Firmware:\n' + JSON.stringify(screen));
  ok((await A.textContent('#virtualOut .note')).includes('😀'), 'Nicht tippbares Emoji als ausgelassen gemeldet');
  ok(await A.evaluate(() => doc.length) === 2 && (await A.evaluate(() => doc[1].text)).includes('Größe'), '"Alles senden" löscht das Protokoll nicht');
  await A.screenshot({ path: t.out + '/60-virtuell.png', fullPage: true });

  // Einzelne unvollstaendige Karte: Senden blockiert, Ausgabe bleibt unveraendert
  const before = await A.evaluate(() => vdongle.keystrokes);
  await A.evaluate(() => addToDoc(TEMPLATES.find((t) => t.title.startsWith('D')), { quiet: true }));
  await A.click('.block-mod:has-text("D – Neurologie") button[title="Nur diesen Block senden"]');
  await A.waitForSelector('#dlg >> text=Fehlende Angaben');
  ok((await A.textContent('#dlg')).includes('D – Neurologie: GCS, BZ'), 'Einzelne Karte unvollständig: Meldung "GCS, BZ"');
  await A.click('#dlg >> text=Zum ersten fehlenden Feld');
  await A.waitForTimeout(300);
  ok(await A.evaluate(() => vdongle.keystrokes) === before, 'Nichts an den Dongle gesendet');
  await A.evaluate(() => { doc = doc.filter((b) => !(b.title || '').startsWith('D')); saveDoc(); renderDoc(); });

  // PDF
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('#virtualOut >> text=Als PDF speichern')]);
  const pdfPath = t.out + '/test-ausgabe.pdf';
  await dl.saveAs(pdfPath);
  // jsPDF schreibt Text unkomprimiert in WinAnsi; Node uebersetzt 0x80 nicht immer in €
  const txt = new TextDecoder('latin1').decode(readFileSync(pdfPath)).replace(/\x80/g, '€');
  ok(/^dokustick-test-\d{4}-\d\d-\d\d-\d{4}\.pdf$/.test(dl.suggestedFilename()), 'PDF heruntergeladen: ' + dl.suggestedFilename());
  ok(txt.includes('U+1F600'), 'PDF: Emoji als U+1F600 statt Zeichensalat');
  ok(txt.includes('Maßnahmen: Guedeltubus, i-gel Larynxmaske') && txt.includes('Ä Ö Ü ß € @') && txt.includes('[Tab]') && txt.includes(t.config.adminEmail), 'PDF enthält Ausgabe, Umlaute, [Tab] und Benutzer');

  // Einsatz beenden: abbrechen, dann bestaetigen
  const itemsBefore = await A.evaluate(() => { putItem(newItem('module', { title: 'Bleibt', body: 'Test' })); return items.length; });
  const docLen = await A.evaluate(() => doc.length);
  await A.click('#endBtn');
  ok(await A.isVisible('#dlg >> text=Bist du sicher?'), 'Einsatz beenden: Sicherheitsabfrage erscheint');
  await A.screenshot({ path: t.out + '/61-einsatz-beenden.png' });
  await A.click('#dlg >> text=Abbrechen');
  ok(await A.evaluate(() => doc.length) === docLen && docLen > 1, 'Abbrechen: Protokoll bleibt erhalten');
  await A.click('#endBtn');
  await A.click('#dlg >> text=Ja, Einsatz beenden');
  ok(await A.evaluate(() => doc.length === 1 && doc[0].type === 'text' && !doc[0].text), 'Bestätigt: Protokoll zurückgesetzt');
  ok(await A.evaluate(() => items.length) === itemsBefore, 'Gespeicherte Bausteine bleiben erhalten (' + itemsBefore + ')');

  // Trennen
  await A.click('#connBtn');
  await A.waitForSelector('#connText >> text=Nicht verbunden');
  ok(await A.isHidden('#virtualOut'), 'Getrennt: Ausgabe ausgeblendet');
  ok(await A.evaluate(() => !document.querySelector('#clearAfter') && !document.querySelector('#clearBtn')), '"Leeren" und "nach Senden leeren" entfernt');
}
