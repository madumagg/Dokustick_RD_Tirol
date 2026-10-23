import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { newDevice, login, ROOT } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Medikamente & Krankheiten: Vorschlag, Freigabe, Import, Suche im Protokoll';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const s = Date.now() % 100000;
  const device = (name) => newDevice(t, { name, cloud: true });
  const sync = (p) => p.evaluate(() => cloud.sync());
  const dlgFill = async (p, vals) => { for (const [k, v] of Object.entries(vals)) await p.fill(`#dlg [name=${k}]`, v); await p.click('#dlg button[type=submit]'); };
  const med1 = `Thrombo ASS ${s}`, med2 = `Concor ${s}`, dx1 = `Koronare Herzkrankheit ${s}`;
  // --- Nicht angemeldet
  const N = await device('N');
  await N.click('nav button[data-tab=db]');
  ok(await N.isVisible('#dbBody >> text=nach der Anmeldung'), 'Nicht angemeldet: Hinweis auf Anmeldung');

  // --- Benutzer U schlaegt vor
  const U = await device('U');
  await login(U, `cat-u-${s}@test.at`, { signup: true });
  await U.click('nav button[data-tab=db]');
  await U.click('#dbBody >> text=＋ Vorschlagen');
  await dlgFill(U, { trade_name: med1, ingredient: 'Acetylsalicylsäure', dose: '100 mg' });
  await U.waitForSelector(`#dbBody .mod:has-text("${med1} 100 mg") .badge:has-text("wartet auf Freigabe")`);
  ok(true, 'U: Vorschlag erscheint mit "wartet auf Freigabe"');
  await U.click('#dbBody >> text=＋ Vorschlagen');
  await dlgFill(U, { trade_name: med1, ingredient: 'ASS', dose: '100 mg' });
  await U.waitForSelector('#toast.err');
  ok((await U.textContent('#toast')).includes('gibt es schon'), 'U: doppelter Vorschlag abgelehnt: ' + await U.textContent('#toast'));
  await U.click('#dlg >> text=Abbrechen');
  await U.screenshot({ path: t.out + '/a0-db-vorschlag.png' });

  // --- Admin gibt frei, legt an, importiert
  const A = await device('A');
  await login(A, t.config.adminEmail);
  await A.waitForFunction(() => !document.querySelector('#dbNavBadge').hidden);
  ok(Number(await A.textContent('#dbNavBadge')) >= 1, 'Admin: rotes Abzeichen am Reiter (' + await A.textContent('#dbNavBadge') + ')');
  await A.click('nav button[data-tab=db]');
  await A.check('#dbBody input[type=checkbox]');
  await A.click(`#dbBody .mod:has-text("${med1}") button[title=Freigeben]`);
  await A.waitForSelector(`#dbBody .mod:has-text("${med1}")`, { state: 'detached' });
  ok(true, 'Admin: Vorschlag freigegeben (verschwindet aus "offen")');
  await A.uncheck('#dbBody input[type=checkbox]');
  await A.click('#dbBody >> text=＋ Neu');
  await dlgFill(A, { trade_name: med2, ingredient: 'Bisoprolol' + s, dose: '5 mg' });
  await A.waitForSelector(`#dbBody .mod:has-text("${med2} 5 mg")`);
  ok(!(await A.isVisible(`#dbBody .mod:has-text("${med2}") .badge`)), 'Admin: eigener Eintrag sofort freigegeben');
  await A.click('#dbTabs button[data-kind=dx]');
  await A.click('#dbBody >> text=＋ Neu');
  await dlgFill(A, { name: dx1, abbreviation: 'KHK' });
  await A.waitForSelector(`#dbBody .mod:has-text("${dx1}")`);
  await A.click('#dbBody >> text=＋ Neu');
  ok(await A.evaluate(() => document.querySelector('#dlg [name=abbreviation]').tagName === 'TEXTAREA' && document.querySelector('#dlg [name=abbreviation]').maxLength === 300), 'Abkürzung/Beschreibung: mehrzeilig, max. 300 Zeichen');
  await dlgFill(A, { name: `Herzklappeninsuffizienz ${s}`, abbreviation: `Undichte Herzklappe ${s}, häufig Mitralklappe; Schlussunfähigkeit` });
  await A.waitForSelector(`#dbBody .mod:has-text("Herzklappeninsuffizienz ${s}") .prev:has-text("Undichte Herzklappe")`);
  ok(true, 'Lange Beschreibung gespeichert und in der Liste angezeigt');
  const csv = path.join(t.out, 'import.csv');
  writeFileSync(csv, `Name;Abkürzung/Beschreibung\nDiabetes mellitus Typ 2 ${s};DM2\n"Chronisch obstruktive Lungenerkrankung ${s}";COPD\ndiabetes mellitus typ 2 ${s};\nZu lang ${s};${'x'.repeat(301)}\n`);
  const [chooser] = await Promise.all([A.waitForEvent('filechooser'), A.click('#dbBody >> text=CSV importieren')]);
  await chooser.setFiles(csv);
  await A.waitForSelector('#toast >> text=importiert');
  ok((await A.textContent('#toast')).startsWith('2 neu importiert, 1 übersprungen, 1 zu lang'), 'CSV-Import: ' + await A.textContent('#toast'));
  await A.screenshot({ path: t.out + '/a1-db-admin.png' });
  // Mitgelieferte Liste (data/) laesst sich importieren; bei wiederholtem Lauf wird alles uebersprungen
  const [chooser2] = await Promise.all([A.waitForEvent('filechooser'), A.click('#dbBody >> text=CSV importieren')]);
  await chooser2.setFiles(path.join(ROOT, 'data', 'krankheiten-volkskrankheiten.csv'));
  await A.waitForFunction(() => /importiert, \d+ übersprungen/.test(document.querySelector('#toast').textContent) && !document.querySelector('#toast').textContent.startsWith('2 neu'));
  const m = (await A.textContent('#toast')).match(/(\d+) neu importiert, (\d+) übersprungen/);
  ok(m && Number(m[1]) + Number(m[2]) === 53, 'Mitgelieferte Liste data/krankheiten-volkskrankheiten.csv: ' + (m && m[0]));
  ok(await A.evaluate(() => catalog.search('dx', 'pavk').some((e) => e.name === 'Periphere arterielle Verschlusskrankheit')), 'Suche nach Abkürzung „pavk“ findet pAVK');
  // Export: gleiches Format wie der Import, nur freigegebene Eintraege
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('#dbBody >> text=CSV exportieren')]);
  const exported = readFileSync(await dl.path(), 'utf8');
  ok(/^dokustick-krankheiten-\d{4}-\d\d-\d\d\.csv$/.test(dl.suggestedFilename()) && exported.startsWith('\uFEFFName;Abkürzung/Beschreibung\r\n') && exported.includes(`Diabetes mellitus Typ 2 ${s};DM2`) && exported.includes(`${dx1};KHK`),
    'CSV-Export: ' + dl.suggestedFilename() + ', enthält importierte und angelegte Einträge');

  // --- Benutzer V nutzt die Datenbank im Protokoll
  const V = await device('V');
  await login(V, `cat-v-${s}@test.at`, { signup: true });
  const vMeds = await V.evaluate(() => catalog.med.map((e) => e.trade_name));
  ok(vMeds.includes(med1) && vMeds.includes(med2), 'V: sieht freigegebene Medikamente');
  await V.click('nav button[data-tab=write]');
  await V.evaluate(() => { clearDoc(); ['M –', 'P –'].forEach((t) => addToDoc(TEMPLATES.find((x) => x.title.startsWith(t)), { quiet: true })); });
  const M = V.locator('.block-mod:has-text("M – Medikation")');
  ok(await M.evaluate((n) => n.classList.contains('incomplete')), 'M leer: als fehlend markiert');
  await M.locator('input[type=search]').fill('bisoprolol' + s);
  await M.locator(`.sugg-item:has-text("${med2} 5 mg")`).waitFor();
  ok((await M.locator('.sugg-item').first().textContent()).includes('Bisoprolol'), 'Suche nach Wirkstoff findet Handelsname (Wirkstoff in der Trefferliste)');
  await M.locator('.sugg-item').first().click();
  await M.locator('input[type=search]').fill('100 ' + s + ' thrombo');
  await M.locator('input[type=search]').press('Enter');
  const mPrev = await M.locator('.preview').textContent();
  { const exp = `M – Dauermedikation: ${med2} 5 mg, ${med1} 100 mg.`; ok(mPrev === exp, 'Ausgabe nur Handelsname + Dosis: ' + JSON.stringify(mPrev) + (mPrev === exp ? '' : ' erwartet ' + JSON.stringify(exp))); }
  await M.locator(`.chip:has-text("${med2} 5 mg")`).click();
  ok(!(await M.locator('.preview').textContent()).includes(med2), 'Eintrag per Tipp wieder entfernt');
  await M.locator('input[type=search]').fill('Neuomed' + s);
  await M.locator('text=In Datenbank vorschlagen').click();
  ok(await V.inputValue('#dlg input[name=trade_name]') === 'Neuomed' + s, 'Vorschlag aus dem Protokoll: Handelsname vorausgefüllt');
  await V.fill('#dlg input[name=dose]', '20 mg');
  await V.click('#dlg button[type=submit]');
  await M.locator(`.chip:has-text("Neuomed${s} 20 mg")`).waitFor();
  ok(true, 'Vorgeschlagenes Medikament direkt im Protokoll übernommen');
  await M.locator('input[type=search]').fill('Blutdrucktablette weiß');
  await M.locator('text=als Freitext übernehmen').click();
  ok((await M.locator('.preview').textContent()).includes('Blutdrucktablette weiß'), 'Freitext übernommen');

  const P = V.locator('.block-mod:has-text("P – Patientengeschichte")');
  await P.locator('.chip:has-text("keine")').click();
  ok((await P.locator('.preview').textContent()) === 'P – Vorerkrankungen: keine.', '"keine" erfüllt das Pflichtfeld');
  await P.locator('input[type=search]').fill('KHK ' + s);
  await P.locator('.sugg-item').first().click();
  ok((await P.locator('.preview').textContent()) === `P – Vorerkrankungen: ${dx1}.`, 'Suche nach Abkürzung, "keine" wird ersetzt');
  await P.locator('input[type=search]').fill('copd ' + s);
  await P.locator('.sugg-item').first().click();
  ok(!(await P.evaluate((n) => n.classList.contains('incomplete'))) && !(await M.evaluate((n) => n.classList.contains('incomplete'))), 'M und P vollständig');
  await P.locator('input[type=search]').fill('undichte ' + s);
  ok((await P.locator('.sugg-item').first().textContent()).startsWith(`Herzklappeninsuffizienz ${s}`), 'Suche über die Beschreibung findet die Krankheit');
  await P.locator('.sugg-item').first().click();
  ok((await P.locator('.preview').textContent()).endsWith(`Herzklappeninsuffizienz ${s}.`), 'Im Protokoll steht nur der Name, nicht die Beschreibung');
  await V.screenshot({ path: t.out + '/a2-protokoll-db.png', fullPage: true });

  // --- Offline: Suche aus dem Speicher
  // Server nicht erreichbar: Liste muss aus dem Geraetespeicher kommen
  await V.ctx.route('http://127.0.0.1:54321/**', (r) => r.abort());
  await V.reload();
  await V.waitForTimeout(800);
  await V.evaluate(() => { addToDoc(TEMPLATES.find((x) => x.title.startsWith('M –')), { quiet: true }); });
  const M2 = V.locator('.block-mod:has-text("M – Medikation")').last();
  await M2.locator('input[type=search]').fill('acetyl ' + s);
  ok(await M2.locator(`.sugg-item:has-text("${med1}")`).count() === 1, 'Offline: Suche funktioniert aus dem Gerätespeicher');
  await V.ctx.unroute('http://127.0.0.1:54321/**');

  // --- ® wird beim Senden entfernt, keine Warnung
  ok(await V.evaluate(() => unsupportedChars('Eliquis® 5 mg').length === 0 && new TextDecoder().decode(encode('Eliquis® 5 mg')) === 'Eliquis 5 mg'), '® wird beim Senden entfernt');

  // --- U sieht Freigabe nach Sync
  await sync(U);
  await U.click('#dbTabs button[data-kind=med]');
  ok(!(await U.isVisible(`#dbBody .mod:has-text("${med1}") .badge`)), 'U: eigener Vorschlag jetzt freigegeben');
  ok(await U.evaluate((n) => !catalog.med.some((e) => e.trade_name === n), 'Neuomed' + s), 'U: sieht Vs offenen Vorschlag nicht');
}
