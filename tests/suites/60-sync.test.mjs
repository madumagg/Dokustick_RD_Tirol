import { newDevice, waitSynced, serviceClient, userId, uniq } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Konto, Synchronisation, Teams, Offline';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const db = serviceClient();
  const count = async (table, f) => (await f(db.from(table).select('*', { count: 'exact', head: true }))).count;
  async function device(name, { declineImport = false } = {}) {
    const page = await newDevice(t, { name, cloud: true, dialog: (d) => (declineImport && /übernommen/.test(d.message()) ? d.dismiss() : d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined)) });
    return { ctx: page.ctx, page };
  }
  const settingsTab = (p) => p.click('nav button[data-tab=settings]');
  async function register(p, email) {
    await settingsTab(p);
    await p.fill('#accountCard input[type=email]', email);
    await p.fill('#accountCard input[type=password]', t.config.password);
    await p.click('#accountCard >> text=Registrieren');
    await p.waitForSelector('#accountCard >> text=Angemeldet als');
    await waitSynced(p);
  }
  const stamp = uniq();
  const emailA = `anna-${stamp}@test.at`, emailB = `ben-${stamp}@test.at`;

  // --- Geraet A: Registrieren, lokale Daten uebernehmen
  const A = await device('A');
  await register(A.page, emailA);
  await waitSynced(A.page);
  const uidA = await userId(emailA);
  ok(await count('items', (q) => q.eq('owner_id', uidA).eq('deleted', false)) === 18, 'A: 18 lokale Eintraege ins Konto uebernommen');
  await A.page.screenshot({ path: t.out + '/10-konto.png' });

  // --- Team erstellen
  await A.page.click('#teamsCard >> text=Team erstellen');
  await A.page.fill('#dlg input[name=name]', 'RK Wache Test');
  await A.page.click('#dlg button[type=submit]');
  await A.page.waitForSelector('#dlg .joincode');
  const code = (await A.page.textContent('#dlg .joincode')).trim();
  ok(/^[A-Z2-9]{8}$/.test(code), 'A: Team erstellt, Code ' + code);
  await A.page.screenshot({ path: t.out + '/11-team.png' });
  await A.page.click('#dlg >> text=Schließen');

  // --- Team-Baustein anlegen
  await A.page.click('nav button[data-tab=modules]');
  await A.page.click('#modAdd');
  await A.page.fill('#dlg input[name=title]', 'Team Übergabe');
  await A.page.fill('#dlg textarea[name=text]', 'Übergabe an KH-Personal erfolgt.');
  await A.page.selectOption('#dlg select[name=owner]', { label: 'Team: RK Wache Test' });
  await A.page.click('#dlg button[type=submit]');
  await waitSynced(A.page);
  const teamId = (await db.from('teams').select('id').eq('name', 'RK Wache Test').order('created_at', { ascending: false }).limit(1)).data[0].id;
  ok(await count('items', (q) => q.eq('team_id', teamId).eq('title', 'Team Übergabe')) === 1, 'A: Team-Baustein in DB');

  // --- Geraet B: Registrieren ohne Import, Team beitreten
  const B = await device('B', { declineImport: true });
  await register(B.page, emailB);
  const uidB = await userId(emailB);
  ok(await count('items', (q) => q.eq('owner_id', uidB)) === 0, 'B: Import abgelehnt, Konto leer');
  await B.page.click('#teamsCard >> text=Team beitreten');
  await B.page.fill('#dlg input[name=code]', code.toLowerCase());
  await B.page.click('#dlg button[type=submit]');
  await B.page.waitForSelector('#teamsCard >> text=RK Wache Test');
  await B.page.click('nav button[data-tab=modules]');
  await B.page.waitForSelector('#modList >> text=Team Übergabe');
  ok(await B.page.isVisible('#modList .badge:has-text("RK Wache Test")'), 'B: sieht Team-Baustein mit Team-Abzeichen');
  ok(!(await B.page.isVisible('#modList button[title=Bearbeiten]')), 'B: kein Bearbeiten-Knopf bei Team-Baustein');
  await B.page.screenshot({ path: t.out + '/12-team-bausteine.png' });
  await B.page.click('#modList .mod:has-text("Team Übergabe") button[title="Als eigene Kopie speichern"]');
  await waitSynced(B.page);
  ok(await count('items', (q) => q.eq('owner_id', uidB).eq('title', 'Team Übergabe')) === 1, 'B: eigene Kopie gespeichert');

  // --- A aendert Team-Baustein, B sieht Aenderung
  await A.page.click('nav button[data-tab=modules]');
  await A.page.click('#modList .mod:has-text("Team Übergabe") button[title=Bearbeiten] >> nth=0');
  await A.page.fill('#dlg input[name=title]', 'Team Übergabe v2');
  await A.page.click('#dlg button[type=submit]');
  await waitSynced(A.page);
  await B.page.evaluate(() => cloud.sync());
  await B.page.waitForSelector('#modList >> text=Team Übergabe v2');
  ok(true, 'B: sieht geaenderten Team-Baustein nach Sync');

  // --- A loescht einen eigenen Baustein
  await A.page.click('#modList .mod:has-text("Keine Allergien") button[title=Bearbeiten]');
  await A.page.click('#dlg >> text=Löschen');
  await waitSynced(A.page);
  ok((await db.from('items').select('deleted').eq('owner_id', uidA).eq('title', 'Keine Allergien').single()).data.deleted === true, 'A: Loeschen als deleted-Flag in DB');

  // --- Offline arbeiten
  await A.ctx.setOffline(true);
  await A.page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await A.page.click('#modAdd');
  await A.page.fill('#dlg input[name=title]', 'Offline erstellt');
  await A.page.fill('#dlg textarea[name=text]', 'Im Funkloch angelegt.');
  await A.page.click('#dlg button[type=submit]');
  await A.page.waitForTimeout(1500);
  await settingsTab(A.page);
  const offTxt = await A.page.textContent('#accountCard');
  ok(/Offline – 1 Änderung/.test(offTxt), 'A offline: ' + offTxt.match(/Offline[^A-Z]*/)?.[0]);
  ok(await count('items', (q) => q.eq('owner_id', uidA).eq('title', 'Offline erstellt')) === 0, 'A offline: noch nicht in DB');
  await A.ctx.setOffline(false);
  await A.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitSynced(A.page);
  ok(await count('items', (q) => q.eq('owner_id', uidA).eq('title', 'Offline erstellt')) === 1, 'A wieder online: automatisch hochgeladen');

  // --- Einstellungen synchronisieren
  await A.page.evaluate(() => { const r = document.querySelector('#delay'); r.value = 17; r.dispatchEvent(new Event('change')); });
  await waitSynced(A.page);
  ok((await db.from('user_settings').select('data').eq('user_id', uidA).single()).data.data.delay === 17, 'A: Tippverzoegerung in Konto gespeichert');

  // --- Zweites Geraet von A
  const A2 = await device('A2');
  await settingsTab(A2.page);
  await A2.page.fill('#accountCard input[type=email]', emailA);
  await A2.page.fill('#accountCard input[type=password]', 'falsch999');
  await A2.page.click('#accountCard >> text=Anmelden');
  await A2.page.waitForSelector('#toast.err');
  ok((await A2.page.textContent('#toast')).includes('E-Mail oder Passwort falsch'), 'A2: falsches Passwort -> deutsche Meldung');
  await A2.page.fill('#accountCard input[type=password]', 'geheim123');
  await A2.page.click('#accountCard >> text=Anmelden');
  await waitSynced(A2.page);
  // Ohne Standard-Bereich zaehlen (den sehen alle, er haengt von anderen Tests ab)
  const a2 = await A2.page.evaluate(() => ({ n: listItems().filter((i) => !cloud.isStandard(i.team_id)).length, delay: settings.delay, teams: cloud.teams.length }));
  ok(a2.n === 19 && a2.delay === 17 && a2.teams === 1, `A2: ${a2.n} Eintraege, Verzoegerung ${a2.delay}, ${a2.teams} Team (ohne Import-Frage)`);

  // --- Abmelden
  await A2.page.click('#accountCard >> text=Abmelden');
  await A2.page.waitForSelector('#accountCard >> text=Registrieren');
  const after = await A2.page.evaluate(() => ({ acc: cloud.account, keys: Object.keys(localStorage).filter((k) => k.startsWith('dokustick.u.')).length, n: items.length }));
  ok(!after.acc && after.keys === 0 && after.n === 18, `A2 abgemeldet: Kontodaten entfernt, lokale Standarddaten (${after.n})`);

  // --- Neu laden: Sitzung bleibt erhalten
  await A.page.reload();
  await waitSynced(A.page);
  ok(await A.page.evaluate(() => cloud.account && cloud.account.email) === emailA, 'A: nach Neuladen weiterhin angemeldet');

  await B.page.click('nav button[data-tab=settings]');
  await B.page.screenshot({ path: t.out + '/13-mitglied.png', fullPage: false });
}
