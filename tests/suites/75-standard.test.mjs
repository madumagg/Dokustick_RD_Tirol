import { newDevice, login, waitSynced, serviceClient, uniq } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Standard-Bausteine: App-Admin pflegt, alle nutzen und kopieren';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const db = serviceClient();
  const s = uniq();
  const std = (await db.from('teams').select('id').eq('is_standard', true).single()).data.id;
  const title = `Std Übergabe ${s}`;

  // --- App-Admin legt Standard-Baustein an
  const A = await newDevice(t, { name: 'Admin', cloud: true });
  await login(A, t.config.adminEmail);
  await A.click('nav button[data-tab=modules]');
  await A.click('#modAdd');
  await A.fill('#dlg input[name=title]', title);
  await A.fill('#dlg input[name=cat]', 'Übergabe');
  await A.fill('#dlg textarea[name=text]', 'Übergabe an das Klinikpersonal erfolgt.');
  const labels = await A.$$eval('#dlg select[name=owner] option', (o) => o.map((x) => x.textContent));
  ok(labels.includes('Standard (für alle)'), 'Admin: „Speichern in“ bietet „Standard (für alle)“');
  await A.selectOption('#dlg select[name=owner]', { label: 'Standard (für alle)' });
  await A.click('#dlg button[type=submit]');
  await waitSynced(A);
  const row = (await db.from('items').select('team_id, owner_id').eq('title', title).single()).data;
  ok(row?.team_id === std && row.owner_id === null, 'Admin: Baustein liegt im Standard-Bereich');
  ok(await A.isVisible(`#modList .mod:has-text("${title}") .badge.std:has-text("Standard")`), 'Admin: Abzeichen „Standard“');
  ok(await A.isVisible(`#modList .mod:has-text("${title}") button[title=Bearbeiten]`), 'Admin: darf bearbeiten (✎)');

  // --- Normaler Benutzer ohne Team
  const U = await newDevice(t, { name: 'U', cloud: true });
  await login(U, `std-${s}@test.at`, { signup: true });
  await U.click('nav button[data-tab=modules]');
  const card = U.locator(`#modList .mod:has-text("${title}")`);
  await card.waitFor();
  ok(await card.locator('.badge.std').count() === 1, 'Benutzer sieht den Standard-Baustein mit Abzeichen');
  ok(await card.locator('button[title=Bearbeiten]').count() === 0, 'Benutzer kann ihn nicht bearbeiten');
  ok(await U.$$eval('#modScope option', (o) => o.map((x) => x.textContent)).then((l) => l.includes('Standard')), 'Filter „Standard“ vorhanden, auch ohne Team');
  await U.selectOption('#modScope', { label: 'Standard' });
  ok(await U.locator('#modList .mod').count() >= 1 && await U.locator('#modList .mod:not(:has(.badge.std))').count() === 0, 'Filter zeigt nur Standard-Bausteine');
  await U.selectOption('#modScope', { label: 'Alle' });
  await card.locator('button[title="Als eigene Kopie speichern"]').click();
  const copy = U.locator(`#modList .mod:has-text("${title}"):not(:has(.badge))`);
  await copy.waitFor();
  ok(await copy.locator('button[title=Bearbeiten]').count() === 1, 'Eigene Kopie angelegt und bearbeitbar');
  await copy.locator('button[title=Bearbeiten]').click();
  await U.fill('#dlg textarea[name=text]', 'Übergabe an die Notaufnahme erfolgt.');
  await U.click('#dlg button[type=submit]');
  await waitSynced(U);
  const rows = (await db.from('items').select('body, team_id').eq('title', title)).data;
  ok(rows.length === 2 && rows.some((r) => r.team_id === std && r.body.includes('Klinikpersonal')) && rows.some((r) => !r.team_id && r.body.includes('Notaufnahme')),
    'Kopie geändert, das Original im Standard-Bereich bleibt unverändert');
  await U.screenshot({ path: t.out + '/standard-bausteine.png', fullPage: true });

}
