import { randomUUID } from 'node:crypto';
import { anonClient } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Datenbank-Regeln: Standard-Bausteine und Protokollvorlagen';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  async function login(email) { const c = anonClient(); const r = await c.auth.signInWithPassword({ email, password: t.config.password }); c.uid = r.data?.user?.id; return c; }
  async function user(name) {
    const c = anonClient();
    const { data, error } = await c.auth.signUp({ email: `${name}-${Date.now()}@test.at`, password: t.config.password });
    if (error) throw error;
    c.uid = data.user.id; return c;
  }
  const admin = await login(t.config.adminEmail);
  const U = await user('std-u'), V = await user('std-v');

  // Standard-Bereich bekannt
  let r = await anonClient().rpc('app_info');
  const std = r.data?.standard_team;
  ok(/^[0-9a-f-]{36}$/.test(std || ''), 'app_info nennt den Standard-Bereich (auch ohne Anmeldung)');
  r = await U.from('teams').select('id, name, is_standard').eq('id', std);
  ok(r.data?.length === 1 && r.data[0].is_standard === true, 'Benutzer sieht den Standard-Bereich, ohne Mitglied zu sein');

  // Nur App-Admins legen Standard-Eintraege an und aendern sie
  const mod = randomUUID();
  r = await admin.from('items').insert({ id: mod, team_id: std, kind: 'module', title: 'Standard ABCDE', body: 'A – Atemwege: {{A:frei|gefährdet}}' });
  ok(!r.error, 'App-Admin legt Standard-Baustein an');
  r = await U.from('items').insert({ id: randomUUID(), team_id: std, kind: 'module', title: 'Fremd', body: 'x' });
  ok(!!r.error, 'Normaler Benutzer kann keinen Standard-Baustein anlegen');
  r = await U.from('items').select('id, title').eq('id', mod);
  ok(r.data?.length === 1, 'Normaler Benutzer sieht den Standard-Baustein');
  r = await V.from('items').select('id').eq('id', mod);
  ok(r.data?.length === 1, 'Auch ein zweiter Benutzer sieht ihn (alle Konten, ohne Team)');
  r = await U.from('items').update({ title: 'geändert' }).eq('id', mod).select();
  ok(r.data?.length === 0, 'Normaler Benutzer kann den Standard-Baustein nicht ändern');
  r = await admin.from('items').update({ title: 'Standard ABCDE neu' }).eq('id', mod).select();
  ok(r.data?.length === 1, 'App-Admin ändert den Standard-Baustein');
  r = await anonClient().from('items').select('id').eq('id', mod);
  ok(!r.data?.length, 'Nicht angemeldet: kein Zugriff');

  // Protokollvorlagen (eigene und Standard)
  const own = randomUUID();
  r = await U.from('items').insert({ id: own, owner_id: U.uid, kind: 'protocol', title: 'Mein Standard', body: JSON.stringify({ items: [mod] }) });
  ok(!r.error, 'Benutzer legt eigene Protokollvorlage an');
  r = await V.from('items').select('id').eq('id', own);
  ok(r.data?.length === 0, 'Eigene Protokollvorlage sehen andere nicht');
  const stdProt = randomUUID();
  r = await admin.from('items').insert({ id: stdProt, team_id: std, kind: 'protocol', title: 'Standardprotokoll', body: JSON.stringify({ items: [mod] }) });
  ok(!r.error, 'App-Admin legt Standard-Protokollvorlage an');
  r = await V.from('items').select('kind, body').eq('id', stdProt).single();
  ok(r.data?.kind === 'protocol' && JSON.parse(r.data.body).items[0] === mod, 'Alle sehen die Standard-Protokollvorlage');
  r = await U.from('items').insert({ id: randomUUID(), owner_id: U.uid, kind: 'irgendwas', title: 'x' });
  ok(!!r.error, 'Unbekannte Art weiterhin abgelehnt');

  // Standard-Bereich ist kein normales Team
  r = await admin.rpc('admin_teams');
  ok(!r.data?.some((x) => x.id === std), 'Admin-Teamliste zeigt den Standard-Bereich nicht');
  r = await admin.rpc('admin_delete_team', { p_team: std });
  ok(/kein Team/.test(r.error?.message || ''), 'Standard-Bereich lässt sich nicht löschen: ' + r.error?.message);
  r = await admin.rpc('admin_add_member', { p_team: std, p_email: 'admin@dokustick.test', p_role: 'admin' });
  ok(!!r.error, 'Standard-Bereich bekommt keine Mitglieder');
  r = await admin.rpc('admin_save_settings', { p_signup_mode: 'open', p_allowed_domains: [], p_default_team: std, p_announcement: '' });
  ok(!!r.error, 'Standard-Bereich kann nicht Team für neue Benutzer sein');
  r = await U.from('teams').delete().eq('id', std).select();
  ok(!r.data?.length, 'Benutzer kann den Standard-Bereich nicht löschen');
  r = await admin.rpc('admin_overview');
  ok(typeof r.data?.protocols === 'number', `Übersicht zählt Protokollvorlagen (${r.data?.protocols})`);
}
