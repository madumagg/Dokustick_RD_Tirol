import { newDevice, sentText } from '../lib/harness.mjs';

export const title = 'Rechtschreibprüfung offline: Hinweise, Korrektur, Wörterbuch, Prüfung vor dem Senden';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const p = await newDevice(t, { name: 'Rechtschreibung', ble: true });
  await p.click('#connBtn');
  await p.waitForSelector('text=Verbunden');
  const t0 = Date.now();
  await p.waitForFunction(() => spell.h, null, { timeout: 20000 });
  ok(true, `Wörterbuch geladen (${Date.now() - t0} ms nach dem Start, im Hintergrund)`);

  // --- Fachbegriffe, Bausteinwoerter, Abkuerzungen gelten als richtig
  const words = (s) => p.evaluate((x) => spell.check(x).map((e) => e.word), s);
  const fine = 'Pat. wach, kreislaufstabil, Tachykardie, Hypoglykämie, Thoraxschmerzen seit ca. 2 h. RTW, NEF, SpO2 98 %, GCS 15. Larynxtubus, kaltschweißig. Jänner. {TAB} {PAUSE:500}';
  ok((await words(fine)).length === 0, 'Keine Fehler in: ' + fine + ' → ' + JSON.stringify(await words(fine)));
  ok(JSON.stringify(await words('Der Pateint hat Brustschmerzn und patient')) === '["Pateint","Brustschmerzn","patient"]', 'Erkennt Tippfehler und klein geschriebenes Hauptwort');

  // --- Hinweise unter dem Freitext, Korrektur per Antippen
  const ta = p.locator('.block-text textarea').last();
  await ta.fill('Der Pateint klagt über Brustschmerzn.');
  const hint = p.locator('.block-text .spell').last();
  await hint.locator('.spell-chip:has-text("Pateint")').waitFor();
  ok(await hint.locator('.spell-chip').count() === 2, 'Hinweis unter dem Freitext mit 2 Wörtern');
  await hint.locator('.spell-chip:has-text("Pateint")').click();
  await p.locator('#dlg2 .chip:has-text("Patient")').first().click();
  ok((await ta.inputValue()) === 'Der Patient klagt über Brustschmerzn.', 'Vorschlag „Patient“ übernommen');
  await hint.locator('.spell-chip:has-text("Brustschmerzn")').click();
  ok(await p.locator('#dlg2 .chip:text-is("Brustschmerzen")').count() === 1, 'Vorschlag „Brustschmerzen“');
  await p.locator('#dlg2 .chip:text-is("Brustschmerzen")').click();
  await p.waitForFunction(() => document.querySelector('.block-text .spell').hidden);
  ok(true, 'Alles korrigiert: Hinweis verschwindet');

  // --- Eigenes Woerterbuch
  await ta.fill('Übergabe an Dr. Plattnerin.');
  await hint.locator('.spell-chip:has-text("Plattnerin")').waitFor();
  await hint.locator('.spell-chip:has-text("Plattnerin")').click();
  await p.click('#dlg2 >> text=＋ Ins Wörterbuch');
  await p.waitForFunction(() => document.querySelector('.block-text .spell').hidden);
  ok(await p.evaluate(() => settings.dictionary.includes('Plattnerin')), '„Plattnerin“ ins eigene Wörterbuch aufgenommen');
  await p.click('nav button[data-tab=settings]');
  ok((await p.inputValue('#spellDict')).includes('Plattnerin') && (await p.textContent('#spellState')).includes('offline verfügbar'), 'Einstellungen zeigen das eigene Wörterbuch');
  await p.click('nav button[data-tab=write]');

  // --- Textfeld in einem Baustein
  await p.evaluate(() => addToDoc(TEMPLATES.find((x) => x.title === 'S – Symptome'), { quiet: true }));
  const S = p.locator('.block-mod:has-text("S – Symptome")');
  await S.locator('[data-field="Symptome"] input').fill('Atemnott');
  await S.locator('.spell-chip:has-text("Atemnott")').waitFor();
  await S.locator('.spell-chip:has-text("Atemnott")').click();
  await p.locator('#dlg2 .chip:text-is("Atemnot")').click();
  ok((await S.locator('[data-field="Symptome"] input').inputValue()) === 'Atemnot' && (await S.locator('.preview').textContent()) === 'S – Symptome: Atemnot.', 'Textfeld im Baustein korrigiert, Vorschau aktualisiert');

  // --- Pruefung vor dem Senden
  await ta.fill('Pat. wurde mit dem Rettungswagn transportiert.');
  await p.click('#sendBtn');
  await p.waitForSelector('#dlg >> text=Mögliche Rechtschreibfehler');
  ok(await p.locator('#dlg .spell-chip:has-text("Rettungswagn")').count() === 1, 'Vor dem Senden: Hinweis mit „Rettungswagn“');
  await p.click('#dlg button:has-text("Korrigieren")');
  ok((await sentText(p)) === '', '„Korrigieren“: nichts gesendet');
  await p.click('#sendBtn');
  await p.click('#dlg button:has-text("Trotzdem senden")');
  await p.waitForFunction(() => window.__writes.length > 0);
  await p.waitForTimeout(300);
  ok((await sentText(p)).includes('Rettungswagn transportiert'), '„Trotzdem senden“ sendet');
  await p.screenshot({ path: t.out + '/rechtschreibung.png', fullPage: true });

  // --- Abschalten
  await p.click('nav button[data-tab=settings]');
  await p.uncheck('#spellOn');
  await p.click('nav button[data-tab=write]');
  ok(await p.evaluate(() => [...document.querySelectorAll('.spell')].every((n) => n.hidden)), 'Ausgeschaltet: keine Hinweise');
  await p.click('#sendBtn');
  await p.waitForFunction(() => window.__writes.length > 0);
  ok(!(await p.isVisible('#dlg >> text=Mögliche Rechtschreibfehler')), 'Ausgeschaltet: Senden ohne Rückfrage');
}
