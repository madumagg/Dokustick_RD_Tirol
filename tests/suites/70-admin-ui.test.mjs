import { newDevice, login as loginAs, uniq, openSettings } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Administration: Benutzer, Teams, Registrierung, Hinweis an alle';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  async function device(name) {
    const page = await newDevice(t, { name, cloud: true, dialog: (d) => (d.type() === 'prompt' ? d.accept('Rettungswache Tirol') : /übernommen/.test(d.message()) ? d.dismiss() : d.accept()) });
    await openSettings(page);
    return page;
  }
  const login = async (p, email) => { await loginAs(p, email); await openSettings(p); };
  const s = uniq();
  // normaler Benutzer sieht keine Administration
  const U = await device('U');
  await U.fill('#accountCard input[type=email]', `normal-${s}@test.at`);
  await U.fill('#accountCard input[type=password]', 'geheim123');
  await U.click('#accountCard >> text=Registrieren');
  await U.waitForFunction(() => cloud.account && cloud.lastSync, null, { timeout: 15000 });
  ok(await U.isHidden('#adminCard'), 'Normaler Benutzer: keine Administration sichtbar');

  const A = await device('A');
  await login(A, t.config.adminEmail);
  ok(await A.isVisible('#adminCard'), 'App-Admin: Administration sichtbar');
  await A.click('#adminOpen');
  await A.waitForSelector('.stats');
  ok(true, 'Übersicht: ' + (await A.textContent('.stats')).replace(/\s+/g, ' ').slice(0, 80));
  await A.screenshot({ path: t.out + '/30-admin-uebersicht.png' });

  await A.click('#adminTabs button[data-view=users]');
  await A.waitForSelector(`#adminBody >> text=normal-${s}@test.at`);
  await A.fill('#adminBody input[type=search]', `normal-${s}`);
  const card = A.locator('#adminBody .card', { hasText: `normal-${s}@test.at` });
  await card.locator('text=Sperren').click();
  await A.waitForSelector('#adminBody .badge.bad');
  ok(true, 'Benutzer ueber Oberflaeche gesperrt');
  await A.screenshot({ path: t.out + '/31-admin-benutzer.png' });
  await A.locator('#adminBody .card', { hasText: `normal-${s}@test.at` }).locator('text=Entsperren').click();
  await A.waitForSelector('#adminBody .badge.bad', { state: 'detached' });
  ok(true, 'Benutzer wieder entsperrt');

  await A.click('#adminTabs button[data-view=teams]');
  await A.click('#adminBody >> text=＋ Team');
  await A.waitForSelector('#dlg .joincode');
  await A.fill('#dlg input[type=email]', `normal-${s}@test.at`);
  await A.click('#dlg >> text=Hinzufügen');
  await A.waitForSelector(`#dlg >> text=normal-${s}@test.at`);
  ok(true, 'Team erstellt und Mitglied per E-Mail hinzugefügt');
  await A.screenshot({ path: t.out + '/32-admin-team.png' });
  await A.click('#dlg >> text=Schließen');

  await A.click('#adminTabs button[data-view=settings]');
  await A.check('#adminBody input[value=closed]');
  await A.fill('#adminBody textarea >> nth=1', 'Testhinweis: Bitte keine Patientendaten speichern.');
  await A.click('#adminBody button:has-text("Speichern")');
  await A.waitForSelector('#toast >> text=Einstellungen gespeichert');
  await A.screenshot({ path: t.out + '/33-admin-einstellungen.png', fullPage: true });

  const N = await device('N');
  await N.waitForSelector('#gate #accountCard >> text=Neue Registrierungen sind derzeit geschlossen');
  ok(!(await N.textContent('body')).includes('Testhinweis') && await N.evaluate(() => cloud.info.announcement === ''), 'Abgemeldet: Anmeldeseite mit „Registrierung geschlossen“, kein Hinweis an alle');
  await N.fill('#accountCard input[type=email]', `neu-${s}@test.at`);
  await N.fill('#accountCard input[type=password]', 'geheim123');
  await N.click('#accountCard >> text=Registrieren');
  await N.waitForSelector('#toast.err');
  ok((await N.textContent('#toast')).includes('geschlossen'), 'Registrierung blockiert: ' + await N.textContent('#toast'));
  // Angemeldet erscheint der Hinweis an alle
  await A.evaluate(() => { localStorage.removeItem('dokustick.announceSeen'); return cloud.loadInfo(); });
  await A.waitForSelector('#announce >> text=Testhinweis');
  ok(true, 'Angemeldet: Hinweis an alle sichtbar');
  await A.click('#announce button');
  ok(await A.isHidden('#announce .note'), 'Hinweis lässt sich ausblenden');

  // zuruecksetzen
  await A.check('#adminBody input[value=open]');
  await A.fill('#adminBody textarea >> nth=1', '');
  await A.click('#adminBody button:has-text("Speichern")');
  await A.waitForFunction(() => cloud.info.signup_mode === 'open' && !cloud.info.announcement, null, { timeout: 10000 });
  ok(true, 'Einstellungen zurückgesetzt');
}
