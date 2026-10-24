import { newDevice, login, waitSynced, serviceClient, uniq } from '../lib/harness.mjs';
import { randomUUID } from 'node:crypto';

export const needsCloud = false;
export const title = 'Protokollvorlagen: anlegen, mit 📋 einfügen, Standard vom Admin';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const P = await newDevice(t, { name: 'P' });
  const docTitles = () => P.evaluate(() => doc.map((b) => (b.type === 'module' ? b.title : 'Text:' + b.text.slice(0, 20))));
  const chooser = async (p = P) => { await p.click('nav button[data-tab=write]'); await p.click('#protoMenu'); };

  // --- Noch keine Vorlage: Knopf fuehrt zur Verwaltung
  ok((await P.textContent('#protoBtn')).trim() === '📋 Protokoll', 'Knopf neben „＋ Baustein“: „📋 Protokoll“');
  await P.click('#protoBtn');
  await P.waitForSelector('#dlg >> text=Noch keine Protokollvorlagen');
  ok(true, 'Ohne Vorlage öffnet der Knopf die Verwaltung');

  // --- Vorlage "Standard": ABCDE komplett + Monitoring an zweiter Stelle
  await P.click('#dlg >> text=＋ Neue Protokollvorlage');
  await P.fill('#dlg input[name=title]', 'Standard');
  ok(await P.isChecked('#dlg input[name=mine]'), 'Erste Vorlage ist automatisch die des 📋-Knopfs');
  await P.locator('#dlg .row:has(h2:text-is("ABCDE")) >> text=＋ alle').click();
  await P.locator('#dlg button.pick:has-text("Monitoring")').click();
  ok(await P.locator('#dlg h2:has-text("In der Vorlage (6)")').count() === 1, 'ABCDE (5) + Monitoring ausgewählt');
  for (let i = 0; i < 4; i++) await P.locator('#dlg .pick-list').first().locator('.pick:has-text("Monitoring") button[title="Nach oben"]').click();
  const chosen = await P.locator('#dlg .pick-list').first().locator('.pick > span.grow').allTextContents();
  ok(chosen[1].startsWith('Monitoring'), 'Reihenfolge mit ↑ geändert: ' + chosen.map((x) => x.split(' ')[0]).join(', '));
  await P.click('#dlg button[type=submit]');
  await P.waitForSelector('#dlg .proto-card:has-text("Standard") .acts .ok-act');
  ok(true, 'Zurück in der Übersicht, „Standard“ mit ★');
  await P.screenshot({ path: t.out + '/protokoll-vorlagen.png' });
  await P.click('#dlg >> text=Schließen');
  ok((await P.textContent('#protoBtn')).trim() === '📋 Standard', 'Knopf heißt jetzt „📋 Standard“');

  // --- Einfuegen
  await P.click('#protoBtn');
  let titles = await docTitles();
  ok(JSON.stringify(titles.slice(0, 3)) === JSON.stringify(['A – Atemwege', 'Text:Monitoring (EKG, SpO', 'B – Belüftung']) && titles.length === 7 && titles[6] === 'Text:',
    'Eingefügt in Reihenfolge, einfacher Baustein als Text, leerer Textblock am Ende: ' + titles.join(' | '));
  await P.screenshot({ path: t.out + '/protokoll-eingefuegt.png', fullPage: true });

  // --- Zweite Vorlage, Auswahl ueber ▾ und Wechsel des Standards
  await chooser();
  await P.click('#dlg >> text=＋ Neue Protokollvorlage');
  await P.fill('#dlg input[name=title]', 'Trauma');
  ok(!(await P.isChecked('#dlg input[name=mine]')), 'Weitere Vorlage ändert den Knopf nicht automatisch');
  await P.locator('#dlg button.pick:has-text("C – Kreislauf")').click();
  await P.locator('#dlg button.pick:has-text("E – Exposure")').click();
  await P.click('#dlg button[type=submit]');
  await P.locator('#dlg .proto-card:has-text("Trauma") .send').click();
  titles = await docTitles();
  ok(titles.slice(-3).join('|') === 'C – Kreislauf|E – Exposure|Text:', 'Über ▾ gewählte Vorlage „Trauma“ angehängt');
  await chooser();
  await P.locator('#dlg .proto-card:has-text("Trauma") button[title="Mit dem 📋-Knopf einfügen"]').click();
  ok((await P.textContent('#protoBtn')).trim() === '📋 Trauma', '☆ macht „Trauma“ zum Knopf');
  await P.click('#dlg >> text=Schließen');

  // --- Bausteine-Reiter: Vorlagen sind keine Bausteine, eigener Knopf
  await P.click('nav button[data-tab=modules]');
  ok(await P.locator('#modList .mod:has-text("Trauma")').count() === 0, 'Vorlagen erscheinen nicht in der Bausteine-Liste');
  await P.click('#modProtocols');
  ok(await P.locator('#dlg .proto-card').count() === 2, 'Knopf „📋 Protokollvorlagen“ im Bausteine-Reiter');
  await P.click('#dlg >> text=Schließen');

  // --- Geloeschter Baustein
  await P.evaluate(() => { removeItem(listItems().find((i) => i.title === 'E – Exposure')); renderAll(); clearDoc(); });
  await P.click('nav button[data-tab=write]');
  await P.click('#protoBtn');
  ok((await P.textContent('#toast')).includes('1 nicht mehr vorhanden') && (await docTitles()).length === 2, 'Gelöschter Baustein: Hinweis, Rest wird eingefügt');

  // --- Sicherung und Import: Verweise bleiben erhalten
  const r = await P.evaluate(() => {
    const exported = JSON.parse(JSON.stringify(items.filter((i) => !i.deleted).map(exportable)));
    replaceOwnItems(exported);
    const p = listItems('protocol').find((x) => x.title === 'Standard');
    return { n: protocols.modules(p).found.length, missing: protocols.modules(p).missing, newIds: !exported.some((x) => x.id === p.id) };
  });
  // E – Exposure wurde oben geloescht und fehlt deshalb weiterhin
  ok(r.n === 5 && r.missing === 1 && r.newIds, `Nach Import: neue IDs, Vorlage „Standard“ findet ihre ${r.n} vorhandenen Bausteine`);

  // --- Standard-Vorlage vom App-Admin (braucht die Test-Datenbank)
  if (!t.cloud) return;
  const db = serviceClient();
  const s = uniq();
  const std = (await db.from('teams').select('id').eq('is_standard', true).single()).data.id;
  const stdMod = randomUUID();
  await db.from('items').insert({ id: stdMod, team_id: std, kind: 'module', category: 'Standard-Test', title: `Std Auffindesituation ${s}`, body: 'Auffindesituation: {{Lage:liegend|sitzend|stehend}}.' });
  const A = await newDevice(t, { name: 'Admin', cloud: true });
  await login(A, t.config.adminEmail);
  await A.evaluate((n) => { putItem(newItem('module', { title: n, body: 'Nur für mich.' })); renderItems(); }, `Admin privat ${s}`);
  await chooser(A);
  await A.click('#dlg >> text=＋ Neue Protokollvorlage');
  await A.fill('#dlg input[name=title]', `Std-Protokoll ${s}`);
  await A.locator(`#dlg button.pick:has-text("Std Auffindesituation ${s}")`).click();
  await A.locator(`#dlg button.pick:has-text("Admin privat ${s}")`).click();
  await A.selectOption('#dlg select[name=owner]', { label: 'Standard (für alle)' });
  await A.click('#dlg button[type=submit]');
  await A.waitForSelector('#toast.err');
  ok((await A.textContent('#toast')).includes('sehen dort nicht alle'), 'Standard-Vorlage mit eigenem Baustein abgelehnt');
  await A.locator('#dlg .pick-list').first().locator(`.pick:has-text("Admin privat ${s}") button[title=Entfernen]`).click();
  await A.click('#dlg button[type=submit]');
  await waitSynced(A);
  const row = (await db.from('items').select('team_id, kind, body').eq('title', `Std-Protokoll ${s}`).single()).data;
  ok(row?.team_id === std && row.kind === 'protocol' && JSON.parse(row.body).items[0] === stdMod, 'Standard-Protokollvorlage gespeichert');

  const U = await newDevice(t, { name: 'U', cloud: true });
  await login(U, `prot-${s}@test.at`, { signup: true });
  await chooser(U);
  const card = U.locator(`#dlg .proto-card:has-text("Std-Protokoll ${s}")`);
  ok(await card.locator('.badge.std').count() === 1 && await card.locator('button[title=Bearbeiten]').count() === 0, 'Benutzer sieht die Standard-Vorlage, kann sie nicht ändern');
  await card.locator('.send').click();
  ok((await U.evaluate(() => doc.map((b) => b.title))).includes(`Std Auffindesituation ${s}`), 'Benutzer fügt die Standard-Vorlage ein');
  await chooser(U);
  await U.locator(`#dlg .proto-card:has-text("Std-Protokoll ${s}") button[title="Als eigene Kopie speichern"]`).click();
  ok(await U.locator(`#dlg .proto-card:has-text("Std-Protokoll ${s}"):not(:has(.badge.std)) button[title=Bearbeiten]`).count() === 1, 'Eigene Kopie der Vorlage ist bearbeitbar');
}
