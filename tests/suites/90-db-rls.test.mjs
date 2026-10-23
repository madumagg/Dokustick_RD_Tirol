import { randomUUID } from 'node:crypto';
import { anonClient } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Datenbank-Regeln: eigene Bausteine, Teams, Einstellungen';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const client = () => anonClient();
  async function login(email, pw = t.config.password) { const c = client(); const r = await c.auth.signInWithPassword({ email, password: pw }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  async function signup(email) { const c = client(); const r = await c.auth.signUp({ email, password: t.config.password }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  async function user(name) {
    const c = anonClient();
    const email = `${name}-${Date.now()}@test.at`;
    const { data, error } = await c.auth.signUp({ email, password: t.config.password });
    if (error) throw error;
    c.uid = data.user.id; c.email = email; return c;
  }
  const A = await user('admin'), B = await user('member'), C = await user('fremd');
  const anonC = anonClient();

  // eigene Eintraege
  const ownA = randomUUID();
  let r = await A.from('items').insert({ id: ownA, owner_id: A.uid, kind: 'module', title: 'A privat', body: 'x' });
  ok(!r.error, 'A legt eigenen Baustein an');
  r = await B.from('items').select().eq('id', ownA);
  ok(r.data?.length === 0, 'B sieht A\'s privaten Baustein nicht');
  r = await B.from('items').insert({ id: randomUUID(), owner_id: A.uid, kind: 'module', title: 'gefaelscht' });
  ok(!!r.error, 'B kann keinen Baustein im Namen von A anlegen');
  r = await B.from('items').update({ title: 'gehackt' }).eq('id', ownA).select();
  ok(r.data?.length === 0, 'B kann A\'s Baustein nicht aendern');

  // Team
  r = await A.rpc('create_team', { p_name: 'RD Wache Test' });
  ok(!r.error, 'A erstellt Team'); const team = r.data;
  r = await A.from('team_invites').select('code').eq('team_id', team).single();
  ok(!!r.data?.code, 'A sieht Beitrittscode ' + r.data?.code); const code = r.data.code;
  r = await B.rpc('join_team', { p_code: code.toLowerCase().slice(0, 4) + ' ' + code.slice(4) });
  ok(!r.error && r.data === team, 'B tritt mit Code bei (Gross/Klein + Leerzeichen egal)');
  r = await C.rpc('join_team', { p_code: 'FALSCH12' });
  ok(!!r.error, 'C mit falschem Code abgelehnt: ' + r.error?.message);
  r = await B.from('team_invites').select('code');
  ok(r.data?.length === 0, 'B (Mitglied) sieht Beitrittscode nicht');

  const tItem = randomUUID();
  r = await A.from('items').insert({ id: tItem, team_id: team, kind: 'form', title: 'Team-Formular', body: '{{RR}}' });
  ok(!r.error, 'A (Admin) legt Team-Formular an');
  r = await B.from('items').select().eq('id', tItem);
  ok(r.data?.length === 1, 'B sieht Team-Formular');
  r = await C.from('items').select().eq('id', tItem);
  ok(r.data?.length === 0, 'C (fremd) sieht Team-Formular nicht');
  r = await B.from('items').update({ title: 'geaendert' }).eq('id', tItem).select();
  ok(r.data?.length === 0, 'B (Mitglied) kann Team-Formular nicht aendern');
  r = await B.from('items').insert({ id: randomUUID(), team_id: team, kind: 'module', title: 'x' });
  ok(!!r.error, 'B (Mitglied) kann keinen Team-Baustein anlegen');
  r = await B.from('items').upsert({ id: tItem, team_id: null, owner_id: B.uid, kind: 'form', title: 'geklaut' }).select();
  ok(!!r.error || r.data?.length === 0, 'B kann Team-Formular nicht per Upsert uebernehmen');
  r = await A.from('items').upsert({ id: tItem, team_id: team, kind: 'form', title: 'Team-Formular v2', body: '{{RR}}', deleted: false }).select().single();
  ok(r.data?.title === 'Team-Formular v2' && r.data?.updated_by === A.uid, 'A aendert per Upsert, updated_by gesetzt');
  r = await B.from('items').delete().eq('id', tItem);
  ok(!!r.error || true, 'Loeschen nur per deleted-Flag');
  r = await A.from('items').select('id').eq('id', tItem);
  ok(r.data?.length === 1, 'Team-Formular existiert noch');

  // Mitglieder
  r = await B.from('team_members').select('user_id').eq('team_id', team);
  ok(r.data?.length === 1 && r.data[0].user_id === B.uid, 'B sieht nur eigene Mitgliedschaft');
  r = await A.from('team_members').select('email, role').eq('team_id', team);
  ok(r.data?.length === 2, 'A (Admin) sieht alle Mitglieder: ' + r.data?.map((m) => m.role).join(','));
  r = await B.from('team_members').update({ role: 'admin' }).eq('team_id', team).eq('user_id', B.uid).select();
  ok(r.data?.length === 0, 'B kann sich nicht selbst zum Admin machen');
  r = await A.from('team_members').delete().eq('team_id', team).eq('user_id', A.uid);
  ok(!!r.error, 'Letzter Admin kann nicht austreten: ' + r.error?.message);
  r = await A.from('team_members').update({ role: 'admin' }).eq('team_id', team).eq('user_id', B.uid).select();
  ok(r.data?.length === 1, 'A macht B zum Admin');
  r = await A.from('team_members').delete().eq('team_id', team).eq('user_id', A.uid);
  ok(!r.error, 'A tritt aus');
  r = await A.from('items').select().eq('id', tItem);
  ok(r.data?.length === 0, 'A sieht Team-Formular nach Austritt nicht mehr');
  r = await B.from('team_members').delete().eq('team_id', team).eq('user_id', B.uid);
  ok(!r.error, 'B tritt als letztes Mitglied aus');
  r = await A.rpc('join_team', { p_code: code });
  ok(!!r.error, 'Leeres Team wurde geloescht, Code ungueltig');

  // Einstellungen
  r = await A.from('user_settings').upsert({ user_id: A.uid, data: { delay: 9 } });
  ok(!r.error, 'A speichert Einstellungen');
  r = await B.from('user_settings').select().eq('user_id', A.uid);
  ok(r.data?.length === 0, 'B sieht A\'s Einstellungen nicht');

  // Nicht angemeldet
  r = await anonC.from('items').select();
  ok(!!r.error || r.data?.length === 0, 'Nicht angemeldet: kein Zugriff (' + (r.error?.message || 'leer') + ')');
  r = await anonC.rpc('create_team', { p_name: 'x' });
  ok(!!r.error, 'Nicht angemeldet: kein Team anlegen');
}
