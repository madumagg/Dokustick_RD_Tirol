import { newDevice, login, waitSynced, serviceClient, uniq, config, openSettings } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Abgelaufene Anmeldung (z. B. nach Serverwechsel): nichts geht verloren';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const s = uniq();
  const email = `sitzung-${s}@test.at`;
  const A = await newDevice(t, { name: 'Sitzung', cloud: true });
  await login(A, email, { signup: true });
  const uid = await A.evaluate(() => cloud.account.id);

  // Aenderung, die noch nicht hochgeladen ist (Server kurz nicht erreichbar)
  await A.route('**/rest/v1/**', (r) => r.abort());
  await A.evaluate((title) => { putItem(newItem('module', { title, body: 'Offline geschrieben.' })); renderItems(); }, `Offline ${s}`);
  await A.waitForTimeout(500);
  ok(await A.evaluate(() => cloud.pending()) === 1, 'Eine Änderung wartet auf das Hochladen');

  // Anmeldung wird ungueltig, wie nach einem Wechsel auf einen anderen Server
  await A.unroute('**/rest/v1/**');
  await A.evaluate(() => {
    const k = 'dokustick.auth', v = JSON.parse(localStorage.getItem(k));
    v.refresh_token = 'ungueltig'; v.expires_at = 1;
    localStorage.setItem(k, JSON.stringify(v));
  });
  await A.reload();
  await A.waitForFunction(() => !cloud.account, null, { timeout: 15000 });
  await openSettings(A);
  const note = await A.textContent('#accountCard .note.warn');
  ok(note.includes(`wieder mit ${email} an`) && note.includes('1 Änderung(en) auf diesem Gerät werden danach hochgeladen'), 'Hinweis: abgelaufen, 1 Änderung wartet');
  ok(await A.inputValue('#accountCard input[type=email]') === email, 'E-Mail-Adresse vorausgefüllt');
  ok(await A.evaluate((id) => (JSON.parse(localStorage.getItem(`dokustick.u.${id}.items`)) || []).some((i) => i.dirty), uid), 'Nicht hochgeladene Änderung bleibt auf dem Gerät');
  await A.screenshot({ path: t.out + '/sitzung-abgelaufen.png' });

  // Erneut anmelden: die Aenderung wird nachgeholt
  await A.fill('#accountCard input[type=password]', config.password);
  await A.click('#accountCard >> text=Anmelden');
  await waitSynced(A);
  const row = (await serviceClient().from('items').select('title').eq('owner_id', uid).eq('title', `Offline ${s}`).maybeSingle()).data;
  ok(!!row, 'Nach erneuter Anmeldung hochgeladen');
  ok(await A.evaluate(() => !localStorage.getItem('dokustick.lostSession')) && await A.locator('#accountCard .note.warn').count() === 0, 'Hinweis verschwindet');

  // Abmelden mit dem Knopf loescht die Kontodaten wie bisher
  await openSettings(A);
  await A.click('#accountCard >> text=Abmelden');
  await A.waitForFunction(() => !cloud.account);
  await A.waitForTimeout(300);
  ok(await A.evaluate((id) => !localStorage.getItem(`dokustick.u.${id}.items`) && !localStorage.getItem('dokustick.lostSession'), uid), 'Selbst abgemeldet: Kontodaten entfernt, kein Hinweis');
}
