import { newDevice, login } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Arzneimittellisten: Reiter Liste 1/2, Auswahl in Bausteinen, Krankheitsbild, Aufklärung';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const s = Date.now() % 100000;
  const device = (name) => newDevice(t, { name, cloud: true });
  const dlgFill = async (p, vals) => { for (const [k, v] of Object.entries(vals)) await p.fill(`#dlg [name=${k}]`, v); await p.click('#dlg button[type=submit]'); };

  // --- Admin: Reiter Arzneimittellisten, nach Krankheitsbild gruppiert
  const A = await device('A');
  await login(A, t.config.adminEmail);
  await A.click('nav button[data-tab=db]');
  await A.click('#dbTabs button[data-kind=al]');
  await A.waitForSelector('#dbListTabs button[data-kind=al1][aria-selected=true]');
  ok(await A.isVisible('#dbBody h3.db-group:has-text("Akutes Koronarsyndrom")') && await A.isVisible('#dbBody .mod:has-text("Aspro Classic 320 mg p.o.")'), 'Liste 1: nach Krankheitsbild gruppiert, Startdaten sichtbar');
  ok((await A.textContent('#dbBody')).includes('Notarztes ist nicht zwingend'), 'Liste 1: kurze Erklärung');
  await A.click('#dbListTabs button[data-kind=al2]');
  await A.waitForSelector('#dbBody .mod:has-text("Glucose 33 % i.v.")');
  ok((await A.textContent('#dbBody .mod:has-text("Glucose 33 % i.v.") .prev')).includes('KI: Kinder unter 6. vLJ'), 'Liste 2: Dosierung und Kontraindikation vollständig angezeigt');
  ok((await A.textContent('#dbBody')).includes('§ 11 SanG'), 'Liste 2: Hinweis auf Notkompetenz');
  // Neues Medikament fuer Liste 2
  await A.click('#dbBody >> text=＋ Neu');
  await dlgFill(A, { name: `Testamin ${s} i.v.`, indication: `Testkrankheit ${s}`, dose: '1 mg i.v.', note: 'KI: Test' });
  await A.waitForSelector(`#dbBody h3.db-group:has-text("Testkrankheit ${s}") + .mod:has-text("Testamin ${s} i.v.")`);
  ok(true, 'Admin: neues Medikament mit neuem Krankheitsbild in Liste 2');
  await A.click('#dbTabs button[data-kind=med]');
  await A.click('#dbTabs button[data-kind=al]');
  ok(await A.getAttribute('#dbListTabs button[data-kind=al2]', 'aria-selected') === 'true', 'Zuletzt gewählte Liste bleibt gewählt');
  await A.screenshot({ path: t.out + '/al0-datenbank.png', fullPage: true });

  // --- Benutzer: Baustein Venenzugang (Liste 2)
  const V = await device('V');
  await login(V, `al-v-${s}@test.at`, { signup: true });
  await V.waitForFunction(() => catalog.al2.length > 0);
  ok(await V.evaluate((n) => catalog.drugNames('al2').includes(n) && catalog.indications('al2').includes('Hypoglykämie'), `Testamin ${s} i.v.`), 'Benutzer: Liste 2 mit neuem Eintrag geladen');
  await V.click('nav button[data-tab=write]');
  await V.evaluate(() => { clearDoc(); addToDoc(TEMPLATES.find((x) => x.title.startsWith('Venenzugang und Medikamente')), { quiet: true }); });
  const B = V.locator('.block-mod').first();
  const kb = B.locator('[data-field=Krankheitsbild]'), med = B.locator('[data-field=Medikamente]');
  ok(await kb.locator('.chip:has-text("Hypoglykämie")').count() === 1 && await kb.locator('.chip:has-text("Aspro")').count() === 0, 'Krankheitsbilder kommen aus Liste 2');
  ok(await med.locator('.chip:has-text("Glucose 33 % i.v.")').count() === 1 && await med.locator('.chip:has-text("Aspro Classic")').count() === 0, 'Medikamente kommen aus Liste 2 (nicht aus Liste 1)');
  ok(await med.locator('.chip:has-text("Dibondrin 30 mg i.v.")').count() === 1, 'Medikament mit zwei Krankheitsbildern nur einmal');
  await B.locator('[data-field="Größe Venflon"] .chip:has-text("Venflon Grün")').click();
  await B.locator('[data-field=Ort] .chip:has-text("Ellenbeuge Links")').click();
  ok(await B.evaluate((n) => n.classList.contains('incomplete')), 'Ohne Medikament unvollständig');
  await kb.locator('.chip:has-text("Hypoglykämie")').click();
  ok(await med.locator('.chip.hint').allTextContents().then((x) => x.join('|') === 'Glucose 33 % i.v.'), 'Krankheitsbild gewählt: passendes Medikament hervorgehoben');
  await med.locator('.chip:has-text("Glucose 33 % i.v.")').click();
  ok((await med.locator('.drug-info').textContent()).includes('15 g i.v.') && (await med.locator('.drug-info').textContent()).includes('KI: Kinder unter 6. vLJ'), 'Dosierung und Kontraindikation des gewählten Medikaments angezeigt');
  await B.locator('[data-field=Dosis] input').fill('15 g');
  const exp = 'Venenzugang und Medikamente:\nPatient wurde über mögliche Folgen des Zuganges sowie des zu gebenden Medikamentes aufgeklärt und ist mit der Maßnahme einverstanden.\n'
    + 'Größe: Venflon Grün, \nOrt: Ellenbeuge Links, \nKrankheitsbild: Hypoglykämie, \nMedikamente (Arzneimittelliste 2): Glucose 33 % i.v., \nDosis: 15 g.';
  const got = await V.evaluate(() => blockText(doc.find((b) => b.type === 'module')));
  ok(got === exp, 'Text mit Aufklärung, Krankheitsbild, Medikament und Dosis' + (got === exp ? '' : ': ' + JSON.stringify(got)));
  ok(!(await B.evaluate((n) => n.classList.contains('incomplete'))), 'Baustein vollständig');
  await V.screenshot({ path: t.out + '/al1-venenzugang.png', fullPage: true });

  // Ohne Medikamentengabe: "keine", Krankheitsbild und Dosis fallen samt Beschriftung weg
  await V.evaluate(() => { clearDoc(); addToDoc(TEMPLATES.find((x) => x.title.startsWith('Venenzugang und Medikamente')), { quiet: true }); });
  const B2 = V.locator('.block-mod').first();
  await B2.locator('[data-field="Größe Venflon"] .chip:has-text("Venflon Pink")').click();
  await B2.locator('[data-field=Ort] .chip:has-text("Handrücken Rechts")').click();
  await B2.locator('[data-field=Medikamente] .chip:text-is("keine")').click();
  const got2 = await V.evaluate(() => blockText(doc.find((b) => b.type === 'module')));
  ok(got2.endsWith('Größe: Venflon Pink, \nOrt: Handrücken Rechts, \nMedikamente (Arzneimittelliste 2): keine.'), 'Ohne Krankheitsbild und Dosis: Zeilen fallen weg: ' + JSON.stringify(got2.split('\n').slice(-3)));
  // Bewusstloser Patient: Aufklaerung nicht moeglich
  await B2.locator('[data-field=Aufklärung] .chip:has-text("nicht ansprechbar")').click();
  ok((await V.evaluate(() => blockText(doc.find((b) => b.type === 'module')))).startsWith('Venenzugang und Medikamente:\nAufklärung nicht möglich, da Patient nicht ansprechbar.\nGröße'), 'Aufklärung nicht möglich wählbar');

  // Medikament zuerst: Krankheitsbild wird vorbelegt, bei mehreren Krankheitsbildern nicht
  await V.evaluate(() => { clearDoc(); addToDoc(TEMPLATES.find((x) => x.title.startsWith('Venenzugang und Medikamente')), { quiet: true }); });
  const B3 = V.locator('.block-mod').first();
  await B3.locator('[data-field=Medikamente] .chip:has-text("Dibondrin 30 mg i.v.")').click();
  ok(await V.evaluate(() => doc.find((b) => b.type === 'module').values.Krankheitsbild) === '', 'Dibondrin (zwei Krankheitsbilder): Krankheitsbild bleibt leer');
  ok(await B3.locator('[data-field=Krankheitsbild] .chip.hint').count() === 2, 'Beide passenden Krankheitsbilder hervorgehoben');
  await B3.locator('[data-field=Medikamente] .chip:has-text("Midazolam i.v.")').click();
  await B3.locator('[data-field=Krankheitsbild] .chip.sel:has-text("Bestehender zerebraler Krampfanfall")').waitFor();
  ok(true, 'Midazolam: Krankheitsbild automatisch gewählt');
  await B3.locator('[data-field=Medikamente] .chip:has-text("Paracetamol")').click();
  ok(await V.evaluate(() => doc.find((b) => b.type === 'module').values.Krankheitsbild) === 'Bestehender zerebraler Krampfanfall', 'Gewähltes Krankheitsbild wird nicht überschrieben');
  ok((await B3.locator('[data-field=Medikamente] .drug-info').textContent()).includes('Ab Pubertät 1000 mg'), 'Hinweise für mehrere Medikamente');

  // --- Baustein Arzneimittelliste 1
  await V.evaluate(() => { clearDoc(); addToDoc(TEMPLATES.find((x) => x.title === 'Medikamente Arzneimittelliste 1'), { quiet: true }); });
  const C = V.locator('.block-mod').first();
  ok(await C.locator('[data-field=Medikamente] .chip:has-text("Aspro Classic 320 mg p.o.")').count() === 1 && await C.locator('[data-field=Medikamente] .chip:has-text("Glucose")').count() === 0, 'Liste 1: Medikamente aus Liste 1');
  await C.locator('[data-field=Medikamente] .chip:has-text("Aspro Classic 320 mg p.o.")').click();
  const got3 = await V.evaluate(() => blockText(doc.find((b) => b.type === 'module')));
  ok(got3 === 'Medikamente nach Arzneimittelliste 1:\nPatient wurde über die Maßnahme sowie mögliche Folgen des zu gebenden Medikamentes aufgeklärt und ist mit der Maßnahme einverstanden.\nKrankheitsbild: Akutes Koronarsyndrom, \nMedikamente: Aspro Classic 320 mg p.o.',
    'Liste 1: Krankheitsbild vorbelegt, Dosis entfällt: ' + JSON.stringify(got3));
  await V.screenshot({ path: t.out + '/al2-liste1.png', fullPage: true });

  // --- Baustein Liste 2 ohne Venenzugang (z. B. Penthrox)
  await V.evaluate(() => { clearDoc(); addToDoc(TEMPLATES.find((x) => x.title === 'Medikamente Arzneimittelliste 2 (ohne Venenzugang)'), { quiet: true }); });
  const P = V.locator('.block-mod').first();
  ok(await P.locator('[data-field="Größe Venflon"]').count() === 0 && await P.locator('[data-field=Medikamente] .chip:has-text("Glucose 33 % i.v.")').count() === 1, 'Liste 2 ohne Venenzugang: keine Venflon-Felder, Medikamente aus Liste 2');
  await P.locator('[data-field=Krankheitsbild] .chip:has-text("Hypoglykämie")').click();
  await P.locator('[data-field=Medikamente] .chip:has-text("Glucose 33 % i.v.")').click();
  const got4 = await V.evaluate(() => blockText(doc.find((b) => b.type === 'module')));
  ok(got4 === 'Medikamente nach Arzneimittelliste 2 (ohne Venenzugang):\nVenenzugang nicht möglich.\nPatient wurde über die Maßnahme sowie mögliche Folgen des zu gebenden Medikamentes aufgeklärt und ist mit der Maßnahme einverstanden.\nKrankheitsbild: Hypoglykämie, \nMedikamente: Glucose 33 % i.v.',
    'Liste 2 ohne Venenzugang: Text: ' + JSON.stringify(got4));

  // --- Feld-Editor bietet die neuen Feldarten an
  ok(await V.evaluate(() => fieldToken({ name: 'Medikamente', type: 'al2', optional: false, options: [], defaults: [] }) === '{{Medikamente:@al2}}'
    && Object.keys(FIELD_TYPES).includes('kb1')), 'Feld-Editor: Feldarten für Arzneimittellisten');

  // --- Server ohne die neue Migration: Medikamente/Krankheiten laufen weiter
  const W = await device('W');
  await W.ctx.route('**/rest/v1/drug_list_entries**', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.drug_list_entries' in the schema cache" }) }));
  await login(W, `al-w-${s}@test.at`, { signup: true });
  await W.waitForFunction(() => catalog.listsAvailable === false);
  ok(await W.evaluate(() => catalog.available === true && catalog.al1.length === 0), 'Ohne Migration: Medikamente/Krankheiten verfügbar, Listen leer');
  await W.click('nav button[data-tab=db]');
  await W.click('#dbTabs button[data-kind=al]');
  ok(await W.isVisible('#dbBody >> text=20261028180000_arzneimittellisten.sql'), 'Ohne Migration: Hinweis im Reiter');
  await W.click('#dbTabs button[data-kind=med]');
  ok(!(await W.isVisible('#dbBody .note.warn')), 'Ohne Migration: Medikamente-Reiter ohne Warnung');
  await W.click('nav button[data-tab=write]');
  await W.evaluate(() => { clearDoc(); addToDoc(TEMPLATES.find((x) => x.title.startsWith('Venenzugang und Medikamente')), { quiet: true }); });
  ok((await W.textContent('.block-mod [data-field=Medikamente] .drug-info')).includes('noch nicht geladen'), 'Ohne Migration: Hinweis im Baustein');

  // Im Supabase-SQL-Editor eingetragene Bausteine haben Windows-Zeilenenden: nach dem Sync nur \n
  const crBody = 'Medikamente nach Arzneimittelliste 1:\r\nKrankheitsbild: {{Krankheitsbild?:@kb1}}, \r\nMedikamente: {{Medikamente:@al1}}, \r\nDosis: {{Dosis?}}.';
  const crId = await A.evaluate(async (body) => {
    const id = uid();
    await cloud.sb.from('items').insert({ id, owner_id: cloud.account.id, kind: 'module', title: 'CRLF-Test', body });
    await cloud.sync();
    return id;
  }, crBody);
  ok(await A.evaluate((id) => { const it = items.find((i) => i.id === id); return !!it && !it.body.includes('\r') && !it.dirty; }, crId), 'Windows-Zeilenenden aus der Datenbank werden beim Sync zu \\n');
  const crText = await A.evaluate((id) => { const it = items.find((i) => i.id === id); const b = moduleBlock(it); b.values.Medikamente = ['Aspro Classic 320 mg p.o.']; return blockText(b); }, crId);
  ok(crText === 'Medikamente nach Arzneimittelliste 1:\nMedikamente: Aspro Classic 320 mg p.o.', 'Baustein mit Windows-Zeilenenden: Text ohne Leerzeilen: ' + JSON.stringify(crText));

  // Aufraeumen: Testeintrag nicht in Liste 2 lassen
  await A.evaluate((n) => cloud.sb.from('drug_list_entries').delete().eq('name', n), `Testamin ${s} i.v.`);
}
