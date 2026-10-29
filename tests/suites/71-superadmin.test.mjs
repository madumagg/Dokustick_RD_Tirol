import { newDevice, login, serviceClient, uniq } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Superadmin: geschützt in der Benutzerverwaltung, ernennt und entfernt Superadmins';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const s = uniq();
  const svc = serviceClient();
  async function device(name, email, opts = {}) {
    const page = await newDevice(t, { name, cloud: true });
    await login(page, email, opts);
    await page.click('nav button[data-tab=settings]');
    return page;
  }
  const users = async (p) => {
    await p.click('#adminOpen');
    await p.click('#adminTabs button[data-view=users]');
    await p.waitForSelector('#adminBody .card');
  };

  // Test-Admin ist Superadmin (wie nach dem Eintragen im SQL-Editor)
  const O = await device('O', t.config.adminEmail);
  const ownerId = await O.evaluate(() => cloud.account.id);
  await svc.from('app_admins').update({ owner: false }).neq('user_id', ownerId);
  await svc.from('app_admins').update({ owner: true }).eq('user_id', ownerId);
  await O.evaluate(() => cloud.loadInfo());
  await O.waitForFunction(() => cloud.info.is_owner === true);
  ok((await O.textContent('#adminRole')).startsWith('Du bist Superadmin'), 'Einstellungen: „Du bist Superadmin“');

  // Zweiter, normaler App-Admin
  const A = await device('A', `sa-ui-${s}@test.at`, { signup: true });
  const aId = await A.evaluate(() => cloud.account.id);
  await svc.from('app_admins').upsert({ user_id: aId });
  await A.evaluate(() => cloud.loadInfo());
  await A.waitForFunction(() => cloud.info.is_admin === true && cloud.info.is_owner === false);
  ok((await A.textContent('#adminRole')).startsWith('Du bist App-Admin'), 'Normaler Admin: „Du bist App-Admin“');
  await users(A);
  await A.fill('#adminBody input[type=search]', t.config.adminEmail);
  const ownerCard = A.locator('#adminBody .card', { hasText: t.config.adminEmail });
  await ownerCard.waitFor();
  ok(await ownerCard.locator('.badge:text-is("Superadmin")').count() === 1, 'Normaler Admin sieht das Abzeichen „Superadmin“');
  ok(await ownerCard.locator('button', { hasText: /Sperren|Admin entziehen|Löschen|Superadmin/ }).count() === 0, 'Beim Superadmin gibt es kein Sperren, Entziehen, Löschen');
  ok((await ownerCard.textContent()).includes('Geschützt'), 'Hinweis „Geschützt“');
  await A.screenshot({ path: t.out + '/sa0-admin-sieht-superadmin.png' });

  // Superadmin ernennt A zum Superadmin und entfernt die Rolle wieder
  await users(O);
  await O.fill('#adminBody input[type=search]', `sa-ui-${s}`);
  const aCard = O.locator('#adminBody .card', { hasText: `sa-ui-${s}@test.at` });
  await aCard.locator('button:text-is("Zum Superadmin")').click();
  await O.waitForSelector(`#adminBody .card:has-text("sa-ui-${s}@test.at") .badge:text-is("Superadmin")`);
  ok(true, 'Superadmin ernennt über die Oberfläche einen zweiten Superadmin');
  ok(await aCard.locator('button:text-is("Löschen")').count() === 0 && await aCard.locator('button:text-is("Superadmin entfernen")').count() === 1, 'Neuer Superadmin ist geschützt, „Superadmin entfernen“ angeboten');
  await O.screenshot({ path: t.out + '/sa1-superadmin.png' });
  await aCard.locator('button:text-is("Superadmin entfernen")').click();
  await O.waitForSelector(`#adminBody .card:has-text("sa-ui-${s}@test.at") .badge:text-is("App-Admin")`);
  ok(true, 'Superadmin-Rolle entfernt, wieder App-Admin');

  // Aufraeumen
  await O.evaluate((id) => cloud.sb.rpc('admin_delete_user', { p_user: id }), aId);
}
