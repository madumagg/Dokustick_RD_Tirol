import { anonClient, serviceClient } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Datenbank-Regeln: Superadmin';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const client = () => anonClient();
  async function login(email, pw = t.config.password) { const c = client(); const r = await c.auth.signInWithPassword({ email, password: pw }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  async function signup(email) { const c = client(); const r = await c.auth.signUp({ email, password: t.config.password }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  const s = Date.now();
  const svc = serviceClient();
  const owner = await login(t.config.adminEmail);
  // Ausgangslage: Test-Admin ist einziger Superadmin (wie nach dem Eintragen im SQL-Editor)
  await svc.from('app_admins').update({ owner: false }).neq('user_id', owner.uid);
  await svc.from('app_admins').update({ owner: true }).eq('user_id', owner.uid);

  let r = await owner.rpc('app_info');
  ok(r.data?.is_admin === true && r.data?.is_owner === true, 'app_info: Superadmin erkannt');
  r = await client().rpc('app_info');
  ok(r.data?.is_owner === false, 'app_info ohne Anmeldung: is_owner=false');

  // Zweiter, normaler App-Admin
  const A = await signup(`sa-admin-${s}@test.at`);
  r = await owner.rpc('admin_set_superadmin', { p_user: A.uid, p_admin: true });
  ok(!r.error, 'Superadmin macht Benutzer zum App-Admin');
  r = await A.rpc('app_info');
  ok(r.data?.is_admin === true && r.data?.is_owner === false, 'Normaler App-Admin: is_owner=false');
  r = await A.rpc('admin_users');
  const meRow = r.data?.find((u) => u.id === owner.uid);
  ok(meRow?.is_owner === true && meRow?.is_admin === true, 'Benutzerliste kennzeichnet den Superadmin');

  // Normaler Admin kann dem Superadmin nichts
  r = await A.rpc('admin_set_superadmin', { p_user: owner.uid, p_admin: false });
  ok(/geschützt/.test(r.error?.message || ''), 'Admin kann Superadmin die Rechte nicht entziehen: ' + r.error?.message);
  r = await A.rpc('admin_set_banned', { p_user: owner.uid, p_banned: true });
  ok(/geschützt/.test(r.error?.message || ''), 'Admin kann Superadmin nicht sperren');
  r = await A.rpc('admin_delete_user', { p_user: owner.uid });
  ok(/geschützt/.test(r.error?.message || ''), 'Admin kann Superadmin nicht löschen');
  const { data: still } = await svc.from('app_admins').select('owner').eq('user_id', owner.uid).single();
  ok(still?.owner === true, 'Superadmin ist danach unverändert');
  r = await A.rpc('admin_set_owner', { p_user: A.uid, p_owner: true });
  ok(/Nur ein Superadmin/.test(r.error?.message || ''), 'Admin kann sich nicht selbst zum Superadmin machen');
  r = await A.rpc('admin_set_owner', { p_user: owner.uid, p_owner: false });
  ok(!!r.error, 'Admin kann dem Superadmin die Rolle nicht entfernen');

  // Superadmin verwaltet Superadmins
  r = await owner.rpc('admin_set_owner', { p_user: owner.uid, p_owner: false });
  ok(/mindestens ein Superadmin/.test(r.error?.message || ''), 'Letzter Superadmin kann sich nicht selbst entfernen');
  r = await owner.rpc('admin_set_owner', { p_user: A.uid, p_owner: true });
  ok(!r.error, 'Superadmin ernennt zweiten Superadmin');
  r = await A.rpc('app_info');
  ok(r.data?.is_owner === true, 'Zweiter Superadmin erkannt');
  r = await owner.rpc('admin_set_superadmin', { p_user: A.uid, p_admin: false });
  ok(/geschützt/.test(r.error?.message || ''), 'Auch ein Superadmin kann einem Superadmin nicht direkt die Admin-Rechte entziehen');
  r = await owner.rpc('admin_set_owner', { p_user: A.uid, p_owner: false });
  ok(!r.error, 'Superadmin entfernt die Superadmin-Rolle');
  r = await A.rpc('app_info');
  ok(r.data?.is_admin === true && r.data?.is_owner === false, 'Danach wieder normaler App-Admin');
  r = await owner.rpc('admin_set_superadmin', { p_user: A.uid, p_admin: false });
  ok(!r.error, 'Jetzt lassen sich die Admin-Rechte entziehen');

  // Normale Benutzer
  const U = await signup(`sa-user-${s}@test.at`);
  r = await U.rpc('admin_set_owner', { p_user: U.uid, p_owner: true });
  ok(!!r.error, 'Normaler Benutzer: admin_set_owner verweigert');
  r = await owner.rpc('admin_set_owner', { p_user: '00000000-0000-0000-0000-000000000000', p_owner: true });
  ok(/Kein Benutzer/.test(r.error?.message || ''), 'Unbekannte ID: abgelehnt');
  r = await client().rpc('admin_set_owner', { p_user: owner.uid, p_owner: false });
  ok(!!r.error, 'Nicht angemeldet: verweigert');

  // Aufraeumen
  for (const id of [A.uid, U.uid]) await owner.rpc('admin_delete_user', { p_user: id });
}
