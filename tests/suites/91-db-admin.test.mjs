import { anonClient } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Datenbank-Regeln: Administration';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const client = () => anonClient();
  async function login(email, pw = t.config.password) { const c = client(); const r = await c.auth.signInWithPassword({ email, password: pw }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  async function signup(email) { const c = client(); const r = await c.auth.signUp({ email, password: t.config.password }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  const s = Date.now();
  const admin = await login(t.config.adminEmail);
  ok(!admin.err, 'Admin meldet sich an');
  const U = await signup(`user-${s}@test.at`);
  let r = await U.rpc('admin_users');
  ok(r.error?.message === 'Keine Berechtigung', 'Normaler Benutzer: admin_users verweigert');
  r = await client().rpc('admin_overview');
  ok(!!r.error, 'Nicht angemeldet: admin_overview verweigert');
  r = await client().rpc('app_info');
  ok(r.data?.signup_mode === 'open' && r.data?.is_admin === false, 'app_info ohne Anmeldung lesbar, is_admin=false');
  r = await admin.rpc('app_info');
  ok(r.data?.is_admin === true, 'app_info: Admin erkannt');
  r = await admin.rpc('admin_overview');
  ok(r.data?.users >= 2 && 'settings' in r.data, `Uebersicht: ${r.data?.users} Benutzer, ${r.data?.teams} Teams`);
  r = await admin.rpc('admin_users');
  ok(r.data?.some((u) => u.email === `user-${s}@test.at`), 'Benutzerliste enthaelt neuen Benutzer');

  // Registrierung steuern
  const save = (mode, domains, team, ann) => admin.rpc('admin_save_settings', { p_signup_mode: mode, p_allowed_domains: domains, p_default_team: team, p_announcement: ann });
  r = await save('closed', [], null, '');
  ok(!r.error, 'Registrierung schliessen');
  let c = await signup(`zu-${s}@test.at`);
  ok(!!c.err, 'Geschlossen: Registrierung abgelehnt -> "' + c.err?.message + '"');
  r = await save('domains', ['@Beispiel.at ', ''], null, '');
  r = await client().rpc('app_info');
  ok(JSON.stringify(r.data?.allowed_domains) === '["beispiel.at"]', 'Domains normalisiert: ' + JSON.stringify(r.data?.allowed_domains));
  c = await signup(`dom-${s}@beispiel.at`);
  ok(!c.err, 'Erlaubte Domain: Registrierung klappt');
  c = await signup(`dom-${s}@anders.at`);
  ok(!!c.err, 'Andere Domain: abgelehnt');

  // Standard-Team
  r = await admin.rpc('admin_create_team', { p_name: 'Alle ' + s });
  const team = r.data; ok(!!team, 'Admin erstellt Team ohne Mitglied zu sein');
  r = await save('open', [], team, 'Bitte keine Patientendaten in Bausteine!');
  c = await signup(`neu-${s}@test.at`);
  r = await admin.rpc('admin_team_members', { p_team: team });
  ok(r.data?.some((m) => m.email === `neu-${s}@test.at` && m.role === 'member'), 'Neuer Benutzer automatisch im Standard-Team');
  r = await U.rpc('app_info');
  ok(r.data?.announcement === 'Bitte keine Patientendaten in Bausteine!', 'Hinweis an alle lesbar');
  r = await client().rpc('app_info');
  ok(r.data?.announcement === '' && r.data?.signup_mode === 'open', 'Ohne Anmeldung: kein Hinweis an alle, Registrierungsregeln lesbar');

  // Mitglieder verwalten
  r = await admin.rpc('admin_add_member', { p_team: team, p_email: `USER-${s}@test.at`, p_role: 'admin' });
  ok(!r.error, 'Mitglied per E-Mail (Gross/Klein egal) als Admin hinzugefuegt');
  r = await admin.rpc('admin_add_member', { p_team: team, p_email: 'gibtsnicht@test.at', p_role: 'member' });
  ok(r.error?.message.startsWith('Kein Benutzer'), 'Unbekannte E-Mail: ' + r.error?.message);
  r = await admin.rpc('admin_remove_member', { p_team: team, p_user: U.uid });
  ok(!!r.error, 'Letzten Team-Admin entfernen verweigert');
  r = await admin.rpc('admin_new_team_code', { p_team: team });
  ok(/^[A-Z2-9]{8}$/.test(r.data), 'Neuer Team-Code ' + r.data);
  r = await admin.rpc('admin_teams');
  const tr = r.data?.find((t) => t.id === team);
  ok(tr && Number(tr.members) === 2 && tr.admins === `user-${s}@test.at`, `Teamliste: ${tr?.members} Mitglieder, Admin ${tr?.admins}`);

  // Sperren
  r = await admin.rpc('admin_set_banned', { p_user: U.uid, p_banned: true });
  ok(!r.error, 'Benutzer gesperrt');
  c = await login(`user-${s}@test.at`);
  ok(!!c.err, 'Gesperrt: Anmeldung abgelehnt -> "' + c.err?.message + '"');
  r = await U.auth.refreshSession();
  ok(!!r.error, 'Gesperrt: bestehende Sitzung kann nicht erneuert werden');
  r = await admin.rpc('admin_set_banned', { p_user: U.uid, p_banned: false });
  c = await login(`user-${s}@test.at`);
  ok(!c.err, 'Entsperrt: Anmeldung klappt wieder');
  r = await admin.rpc('admin_set_banned', { p_user: admin.uid, p_banned: true });
  ok(!!r.error, 'Selbst sperren verweigert');

  // Admin-Rechte
  r = await admin.rpc('admin_set_superadmin', { p_user: c.uid, p_admin: true });
  r = await c.rpc('admin_users');
  ok(!r.error, 'Neuer App-Admin hat Zugriff');
  r = await c.rpc('admin_set_superadmin', { p_user: c.uid, p_admin: false });
  ok(!!r.error, 'Sich selbst Admin entziehen verweigert');
  r = await admin.rpc('admin_set_superadmin', { p_user: c.uid, p_admin: false });
  r = await c.rpc('admin_users');
  ok(!!r.error, 'Admin-Rechte entzogen -> kein Zugriff mehr');

  // Loeschen: einziger Team-Admin -> anderes Mitglied wird Admin
  r = await admin.rpc('admin_delete_user', { p_user: U.uid });
  ok(!r.error, 'Benutzer geloescht ' + (r.error?.message || ''));
  r = await admin.rpc('admin_team_members', { p_team: team });
  ok(r.data?.length === 1 && r.data[0].role === 'admin', 'Verbleibendes Mitglied wurde Team-Admin');
  r = await admin.rpc('admin_delete_user', { p_user: admin.uid });
  ok(!!r.error, 'Eigenes Konto loeschen verweigert');
  r = await admin.rpc('admin_delete_team', { p_team: team });
  r = await admin.rpc('admin_overview');
  ok(r.data?.settings?.default_team === null, 'Team geloescht, Standard-Team zurueckgesetzt');
  await save('open', [], null, '');
}
