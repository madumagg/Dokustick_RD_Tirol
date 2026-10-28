// Themes: nur App-Admins und freigeschaltete Benutzer, Freigabe in der Administration
import { newDevice, login, anonClient, uniq } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Themes: Liquid Glass für Admins, Freischaltung einzelner Benutzer, Freigabe für alle';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const s = uniq();
  const adminApi = anonClient();
  await adminApi.auth.signInWithPassword({ email: t.config.adminEmail, password: t.config.password });
  await adminApi.rpc('admin_theme_release', { p_theme: 'glass', p_release: 'admins' });

  const skin = (p) => p.evaluate(() => document.documentElement.dataset.skin || '');
  const settingsTab = (p) => p.click('nav button[data-tab=settings]');

  // Normaler Benutzer: keine Auswahl, auch ein gespeichertes Theme greift nicht
  const U = await newDevice(t, { name: 'Benutzer', cloud: true });
  const email = `theme-${s}@test.at`;
  await login(U, email, { signup: true });
  await settingsTab(U);
  ok(await U.isHidden('#skinField'), 'Normaler Benutzer: keine Theme-Auswahl');
  await U.evaluate(() => { settings.skin = 'glass'; store.save('settings', settings); themes.refresh(); });
  ok(await skin(U) === '', 'Nicht freigeschaltet: gespeichertes Theme wird nicht angewendet');

  // App-Admin: Liquid Glass auswählen
  const A = await newDevice(t, { name: 'Admin', cloud: true });
  await login(A, t.config.adminEmail);
  await settingsTab(A);
  ok(await A.isVisible('#skinField'), 'App-Admin: Theme-Auswahl sichtbar');
  const opts = await A.$$eval('#skin option', (o) => o.map((x) => x.textContent));
  ok(opts.join('|') === 'Standard|Liquid Glass', 'Auswahl: ' + opts.join(', '));
  await A.selectOption('#skin', 'glass');
  ok(await skin(A) === 'glass', 'Liquid Glass angewendet');
  ok((await A.textContent('#skinHelp')).includes('Noch nicht freigegeben'), 'Hinweis: noch nicht freigegeben');
  const blur = await A.evaluate(() => getComputedStyle(document.querySelector('nav')).backdropFilter);
  ok(/blur/.test(blur), 'Navigation ist eine Glasfläche: ' + blur);
  await A.screenshot({ path: t.out + '/79-glass-einstellungen.png' });
  await A.click('nav button[data-tab=write]');
  await A.evaluate(() => {
    const ta = document.querySelector('.doc-text'); ta.value = 'Pat. sitzend im Wohnzimmer angetroffen, ansprechbar.'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    TEMPLATES.filter((x) => /^[AB] – /.test(x.title)).forEach((m) => addToDoc(m, { quiet: true }));
  });
  await A.waitForFunction(() => !document.querySelector('#toast.show'), null, { timeout: 8000 });
  await A.screenshot({ path: t.out + '/79-glass-schreiben.png' });
  await A.click('nav button[data-tab=modules]');
  await A.screenshot({ path: t.out + '/79-glass-bausteine.png' });
  await A.evaluate(() => { settings.theme = 'dark'; applyTheme(); });
  await A.click('nav button[data-tab=write]');
  await A.screenshot({ path: t.out + '/79-glass-dunkel.png' });
  await A.evaluate(() => { settings.theme = ''; applyTheme(); });
  ok(await A.evaluate(() => JSON.parse(localStorage.getItem('dokustick.settings')).skin) === 'glass', 'Auswahl bleibt auf dem Gerät gespeichert');

  // Administration: Benutzer freischalten
  await settingsTab(A);
  await A.click('#adminOpen');
  await A.click('#adminTabs button[data-view=themes]');
  const card = A.locator('#adminBody .theme-card', { hasText: 'Liquid Glass' });
  await card.waitFor();
  ok((await card.textContent()).includes('Nur Admins'), 'Admin-Reiter Themes: Liquid Glass nur für Admins');
  await card.locator('input[type=email]').fill(email.toUpperCase());
  await card.locator('button:has-text("Freischalten")').click();
  await A.waitForSelector(`#adminBody .theme-card >> text=${email}`);
  ok(true, 'Benutzer per E-Mail-Adresse freigeschaltet');
  await A.screenshot({ path: t.out + '/79-admin-themes.png', fullPage: true });

  // Benutzer bekommt das Theme nach dem nächsten Abgleich
  await U.evaluate(() => cloud.loadInfo());
  await U.waitForSelector('#skinField:not([hidden])');
  ok(await skin(U) === 'glass', 'Freigeschaltet: zuvor gewähltes Theme greift');
  ok(!(await U.textContent('#skinHelp')).includes('Noch nicht freigegeben'), 'Kein Admin-Hinweis beim Benutzer');

  // Freischaltung entfernen: zurück zum Standard
  await A.locator('#adminBody .member', { hasText: email }).locator('button:has-text("Entfernen")').click();
  await A.waitForSelector(`#adminBody .theme-card >> text=${email}`, { state: 'detached' });
  await U.evaluate(() => cloud.loadInfo());
  await U.waitForSelector('#skinField', { state: 'hidden' });
  ok(await skin(U) === '', 'Freischaltung entfernt: wieder Standard');

  // Für alle freigeben: auch ohne Konto sichtbar
  await A.locator('#adminBody .theme-card select').selectOption('all');
  await A.waitForSelector('#adminBody .theme-card .badge.ok');
  const N = await newDevice(t, { name: 'Ohne Konto', cloud: true });
  await N.waitForFunction(() => (cloud.info.themes || []).includes('glass'), null, { timeout: 10000 });
  await settingsTab(N);
  ok(await N.isVisible('#skinField'), 'Für alle freigegeben: auch ohne Konto auswählbar');

  await adminApi.rpc('admin_theme_release', { p_theme: 'glass', p_release: 'admins' });
}
