// Datenbank-Regeln fuer Themes: Freigabe nur durch App-Admins, Tabellen gesperrt
import { anonClient } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Datenbank-Regeln: Themes freigeben und freischalten';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const s = Date.now();
  async function login(email) { const c = anonClient(); const r = await c.auth.signInWithPassword({ email, password: t.config.password }); c.uid = r.data?.user?.id; return c; }
  async function signup(email) { const c = anonClient(); const r = await c.auth.signUp({ email, password: t.config.password }); c.uid = r.data?.user?.id; return c; }
  const A = await login(t.config.adminEmail);
  const U = await signup(`dbtheme-${s}@test.at`);
  const V = await signup(`dbtheme2-${s}@test.at`);
  const themesOf = async (c) => (await c.rpc('app_info')).data?.themes;

  let r = await A.rpc('admin_theme_release', { p_theme: 'glass', p_release: 'admins' });
  ok(!r.error, 'Admin: Freigabe auf „nur Admins“');
  ok(JSON.stringify(await themesOf(U)) === '[]', 'Benutzer: keine Themes freigegeben');
  ok(JSON.stringify(await themesOf(anonClient())) === '[]', 'Ohne Anmeldung: keine Themes');

  // Benutzer duerfen nichts verwalten und die Tabellen nicht lesen
  for (const [fn, args] of [['admin_themes', {}], ['admin_theme_release', { p_theme: 'glass', p_release: 'all' }],
    ['admin_theme_unlock', { p_theme: 'glass', p_email: `dbtheme-${s}@test.at` }], ['admin_theme_lock', { p_theme: 'glass', p_user: U.uid }]]) {
    r = await U.rpc(fn, args);
    ok(!!r.error, `Benutzer: ${fn} verweigert`);
  }
  r = await anonClient().rpc('admin_themes');
  ok(!!r.error, 'Ohne Anmeldung: admin_themes verweigert');
  r = await U.from('theme_unlocks').select('*');
  ok(!!r.error || !r.data?.length, 'Benutzer: Tabelle theme_unlocks nicht lesbar');
  r = await U.from('theme_settings').insert({ theme: 'glass', release: 'all' });
  ok(!!r.error, 'Benutzer: theme_settings nicht beschreibbar');

  // Einzelnen Benutzer freischalten (E-Mail ohne Gross-/Kleinschreibung, mit Leerzeichen)
  r = await A.rpc('admin_theme_unlock', { p_theme: 'glass', p_email: `  DBTHEME-${s}@test.at ` });
  ok(r.data === U.uid, 'Admin schaltet Benutzer per E-Mail frei');
  r = await A.rpc('admin_theme_unlock', { p_theme: 'glass', p_email: `dbtheme-${s}@test.at` });
  ok(!r.error, 'Zweimal freischalten ist kein Fehler');
  r = await A.rpc('admin_theme_unlock', { p_theme: 'glass', p_email: `gibtsnicht-${s}@test.at` });
  ok(/Kein Benutzer/.test(r.error?.message || ''), 'Unbekannte E-Mail: ' + r.error?.message);
  ok(JSON.stringify(await themesOf(U)) === '["glass"]', 'Freigeschalteter Benutzer: glass');
  ok(JSON.stringify(await themesOf(V)) === '[]', 'Anderer Benutzer: weiterhin nichts');
  r = await A.rpc('admin_themes');
  const g = (r.data || []).find((x) => x.theme === 'glass');
  ok(g?.release === 'admins' && g.users.some((u) => u.email === `dbtheme-${s}@test.at`), 'admin_themes listet Freigabe und Benutzer');

  // Ungueltige Werte
  r = await A.rpc('admin_theme_release', { p_theme: 'glass', p_release: 'jeder' });
  ok(!!r.error, 'Ungültige Freigabe abgelehnt');
  r = await A.rpc('admin_theme_release', { p_theme: 'Glas!', p_release: 'all' });
  ok(!!r.error, 'Ungültiger Theme-Name abgelehnt');

  // Entziehen und fuer alle freigeben
  r = await A.rpc('admin_theme_lock', { p_theme: 'glass', p_user: U.uid });
  ok(!r.error && JSON.stringify(await themesOf(U)) === '[]', 'Freischaltung entfernt');
  r = await A.rpc('admin_theme_release', { p_theme: 'glass', p_release: 'all' });
  ok(JSON.stringify(await themesOf(V)) === '["glass"]' && JSON.stringify(await themesOf(anonClient())) === '["glass"]', 'Für alle: auch ohne Anmeldung');

  // Konto loeschen entfernt die Freischaltung
  await A.rpc('admin_theme_unlock', { p_theme: 'glass', p_email: `dbtheme2-${s}@test.at` });
  r = await A.rpc('admin_delete_user', { p_user: V.uid });
  r = await A.rpc('admin_themes');
  ok(!(r.data || []).some((x) => x.users.some((u) => u.id === V.uid)), 'Gelöschtes Konto: Freischaltung weg');

  await A.rpc('admin_theme_release', { p_theme: 'glass', p_release: 'admins' });
}
