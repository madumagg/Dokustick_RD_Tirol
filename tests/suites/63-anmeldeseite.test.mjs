import { newDevice, login, anonClient, uniq, openSettings } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Anmeldeseite und Vorschau: App nur angemeldet, Was ist neu, Vorschau ohne Senden und Speichern';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const s = uniq();
  const admin = anonClient();
  await admin.auth.signInWithPassword({ email: t.config.adminEmail, password: t.config.password });
  const hint = `Gate-Hinweis ${s}`;
  await admin.rpc('admin_save_settings', { p_signup_mode: 'open', p_allowed_domains: [], p_default_team: null, p_announcement: hint });

  // --- Ohne Konto: nur die Anmeldeseite
  const P = await newDevice(t, { name: 'Ohne Konto', cloud: true });
  // Lokale Daten aus der Zeit ohne Konto duerfen durch die Vorschau nicht veraendert werden
  await P.evaluate(() => localStorage.setItem('dokustick.local.items', JSON.stringify([{ id: 'x', kind: 'module', title: 'Mein lokaler Baustein', body: 'lokal', sort: 0 }])));
  await P.reload();
  await P.waitForSelector('#gate');
  ok(await P.isVisible('#gate') && await P.isHidden('header') && await P.isHidden('nav') && await P.isHidden('#tab-write'), 'Ohne Konto: Anmeldeseite, App ausgeblendet');
  ok(await P.isVisible('#gate #accountCard >> text=Anmelden') && await P.isVisible('#gate #accountCard >> text=Registrieren') && await P.isVisible('#gate >> text=Passwort vergessen?'), 'Anmelden, Registrieren und Passwort vergessen');
  ok(await P.getAttribute('#gate a:has-text("protopilot.at")', 'href') === 'https://protopilot.at', 'Link zur Webseite');
  ok(await P.getAttribute('#gate a:has-text("Impressum")', 'href') === 'https://protopilot.at/impressum.html' && await P.isVisible('#gate a:has-text("Datenschutz")'), 'Impressum und Datenschutz verlinkt');
  const ver = await P.evaluate(() => APP_VERSION);
  ok((await P.textContent('#gateNews')).includes('Version ' + ver) && (await P.textContent('#gateVer')) === ver, `Was ist neu: aktuelle Version ${ver}`);
  await P.click('#gateNews >> text=Alle Neuerungen');
  await P.waitForSelector('#dlg h3:text-is("Was ist neu")');
  ok(await P.locator('#dlg .news').count() > 2, 'Alle Neuerungen im Dialog');
  await P.click('#dlg >> text=Schließen');
  await P.waitForFunction(() => cloud.info && cloud.info.signup_mode);
  ok(!(await P.textContent('body')).includes(hint) && await P.evaluate(() => cloud.info.announcement === ''), 'Hinweis an alle: ohne Anmeldung weder angezeigt noch geliefert');
  await P.screenshot({ path: t.out + '/63-anmeldeseite.png', fullPage: true });

  // --- Vorschau
  await P.click('#previewBtn');
  await P.waitForSelector('#dlg h3:text-is("Vorschau von ProtoPilot")');
  ok((await P.textContent('#dlg')).includes('nichts gesendet'), 'Vorschau: kurzer Überblick beim Start');
  await P.click('#dlg button:has-text("Los geht")');
  ok(await P.isHidden('#gate') && await P.isVisible('#tab-write') && await P.isVisible('#previewBar >> text=Vorschau'), 'Vorschau: App sichtbar, Hinweisleiste');
  const titles = await P.evaluate(() => doc.filter((b) => b.type === 'module').map((b) => b.title));
  ok(titles.join('|') === 'A – Atemwege|B – Belüftung', 'Beispiel-Protokoll: ' + titles.join(', '));
  ok(await P.evaluate(() => listItems().length > 10 && !listItems().some((i) => i.title === 'Mein lokaler Baustein')), 'Beispiel-Bausteine statt der lokalen Daten');
  await P.screenshot({ path: t.out + '/63-vorschau.png', fullPage: true });

  // Ausfuellen und senden: nur Anzeige
  const A = P.locator('.block-mod:has-text("A – Atemwege")');
  await A.locator('[data-field=Atemwege] .chip:has-text("frei und gesichert")').click();
  await P.click('#sendBtn');
  await P.waitForSelector('#dlg h3:text-is("Fehlende Angaben")');
  ok(true, 'Pflichtfelder werden auch in der Vorschau geprüft');
  await P.click('#dlg >> text=Schließen');
  await A.locator('button[title="Nur diesen Block senden"]').click();
  await P.waitForSelector('#dlg h3:text-is("Vorschau: nichts gesendet")');
  ok((await P.textContent('#dlg pre')).startsWith('A – Atemwege: frei und gesichert.'), 'Senden zeigt nur, was getippt würde');
  await P.click('#dlg >> text=Schließen');
  ok(await P.evaluate(() => !ble.connected && !sendJob), 'Nichts an einen Stick gesendet');
  await P.click('#connBtn');
  await P.waitForSelector('#dlg >> text=keine Verbindung zum ProtoPilot-Stick');
  ok(true, '„Verbinden“ erklärt die Vorschau');
  await P.click('#dlg >> text=Schließen');

  // Bausteine anlegen geht, landet aber nur im Vorschau-Speicher
  await P.evaluate(() => { putItem(newItem('module', { title: 'Vorschau-Test', body: 'Test', sort: 999 })); renderModules(); });
  ok(await P.evaluate(() => JSON.parse(localStorage.getItem('dokustick.preview.items')).some((i) => i.title === 'Vorschau-Test')
    && !localStorage.getItem('dokustick.local.items').includes('Vorschau-Test')), 'Neuer Baustein nur im Vorschau-Speicher');
  await P.evaluate(() => { settings.delay = 33; store.save('settings', settings); });
  ok(await P.evaluate(() => !(JSON.parse(localStorage.getItem('dokustick.settings') || '{}').delay === 33)), 'Einstellungen werden in der Vorschau nicht gespeichert');
  await openSettings(P);
  ok(await P.isVisible('#previewSettings') && await P.isHidden('#accountCard') && await P.isHidden('#skinField') && await P.isHidden('#delay'), 'Einstellungen gesperrt, Hinweis zur Anmeldung');
  await P.click('nav button[data-tab=db]');
  ok(await P.isVisible('#dbBody >> text=nach der Anmeldung'), 'Datenbank erst nach der Anmeldung');

  // Neu laden: bleibt in der Vorschau
  await P.reload();
  await P.waitForSelector('#previewBar >> text=Vorschau');
  ok(await P.isHidden('#gate') && await P.evaluate(() => listItems().some((i) => i.title === 'Vorschau-Test')), 'Nach Neuladen weiter in der Vorschau');

  // Beenden: zurueck zur Anmeldeseite, nichts bleibt uebrig
  await P.click('#previewBar button:has-text("Anmelden")');
  await P.waitForSelector('#gate');
  ok(await P.evaluate(() => !localStorage.getItem('dokustick.preview.items') && !doc.some((b) => b.type === 'module') && settings.delay !== 33
    && JSON.parse(localStorage.getItem('dokustick.local.items'))[0].title === 'Mein lokaler Baustein'), 'Vorschau beendet: Beispieldaten weg, lokale Daten unverändert');

  // --- Anmelden: App und Hinweis an alle
  await login(P, `gate-${s}@test.at`, { signup: true });
  ok(await P.isHidden('#gate') && await P.isVisible('nav') && await P.isHidden('#previewBar .note'), 'Angemeldet: App sichtbar, keine Vorschau-Leiste');
  await P.evaluate(() => cloud.loadInfo());
  await P.waitForSelector(`#announce >> text=${hint}`);
  ok(true, 'Angemeldet: Hinweis an alle sichtbar');

  // Server nicht erreichbar: bleibt angemeldet (z. B. im Einsatz ohne Netz)
  await P.ctx.route('http://127.0.0.1:54321/**', (r) => r.abort());
  await P.reload();
  await P.waitForFunction(() => typeof gate !== 'undefined');
  await P.waitForTimeout(500);
  const off = await P.evaluate(() => ({ acc: !!cloud.account, gated: document.body.classList.contains('gated'), nav: getComputedStyle(document.querySelector('nav')).display }));
  ok(off.acc && !off.gated && off.nav !== 'none' && await P.isHidden('#gate'), 'Ohne Verbindung zum Server: App bleibt nutzbar ' + JSON.stringify(off));
  await P.ctx.unroute('http://127.0.0.1:54321/**');

  // Abmelden: wieder die Anmeldeseite
  await P.reload();
  await openSettings(P);
  await P.click('#accountCard >> text=Abmelden');
  await P.waitForSelector('#gate');
  ok(true, 'Abgemeldet: Anmeldeseite');

  await admin.rpc('admin_save_settings', { p_signup_mode: 'open', p_allowed_domains: [], p_default_team: null, p_announcement: '' });
}
