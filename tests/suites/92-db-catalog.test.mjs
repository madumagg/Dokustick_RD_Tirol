import { anonClient } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Datenbank-Regeln: Medikamente & Krankheiten';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const client = () => anonClient();
  async function login(email, pw = t.config.password) { const c = client(); const r = await c.auth.signInWithPassword({ email, password: pw }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  async function signup(email) { const c = client(); const r = await c.auth.signUp({ email, password: t.config.password }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  const s = Date.now();
  const admin = await login(t.config.adminEmail);
  const U = await signup(`med-u-${s}@test.at`), V = await signup(`med-v-${s}@test.at`);
  const name = `Testolol ${s}`;

  let r = await U.from('medications').insert({ trade_name: name, ingredient: 'Testwirkstoff', dose: '5 mg' }).select().single();
  ok(!r.error && r.data.approved === false && r.data.created_by === U.uid, 'Benutzer schlägt Medikament vor (offen, Ersteller gesetzt)');
  const medId = r.data.id;
  r = await U.from('medications').select().eq('id', medId);
  ok(r.data?.length === 1, 'Ersteller sieht eigenen Vorschlag');
  r = await V.from('medications').select().eq('id', medId);
  ok(r.data?.length === 0, 'Anderer Benutzer sieht offenen Vorschlag nicht');
  r = await V.from('medications').insert({ trade_name: name.toUpperCase() + ' ', dose: '5 MG' });
  ok(r.error?.code === '23505', 'Doppelter Vorschlag (Groß/Klein, Leerzeichen) abgelehnt: ' + r.error?.code);
  r = await V.from('medications').insert({ trade_name: name, dose: '10 mg' });
  ok(!r.error, 'Gleicher Handelsname mit anderer Dosis erlaubt');
  r = await U.from('medications').insert({ trade_name: 'Selbstfreigabe ' + s, approved: true });
  ok(!!r.error, 'Benutzer kann nicht selbst freigeben (Einfügen)');
  r = await U.from('medications').update({ approved: true }).eq('id', medId).select();
  ok(!!r.error || r.data?.length === 0, 'Benutzer kann eigenen Vorschlag nicht freigeben');
  r = await U.from('medications').update({ dose: '5,0 mg' }).eq('id', medId).select();
  ok(r.data?.length === 1 && r.data[0].dose === '5,0 mg', 'Benutzer korrigiert eigenen offenen Vorschlag');
  r = await V.from('medications').update({ dose: 'x' }).eq('id', medId).select();
  ok(r.data?.length === 0, 'Fremde können Vorschlag nicht ändern');
  r = await admin.from('medications').select().eq('id', medId);
  ok(r.data?.length === 1, 'Admin sieht offenen Vorschlag');
  r = await admin.from('medications').update({ approved: true }).eq('id', medId).select().single();
  ok(r.data?.approved && r.data.approved_by === admin.uid && r.data.created_by === U.uid, 'Admin gibt frei (Freigabe vermerkt, Ersteller bleibt)');
  r = await V.from('medications').select().eq('id', medId);
  ok(r.data?.length === 1, 'Nach Freigabe für alle sichtbar');
  r = await U.from('medications').update({ dose: '7 mg' }).eq('id', medId).select();
  ok(r.data?.length === 0, 'Freigegebenen Eintrag kann Ersteller nicht mehr ändern');
  r = await U.from('medications').delete().eq('id', medId).select();
  ok(r.data?.length === 0, 'Freigegebenen Eintrag kann Ersteller nicht löschen');
  r = await admin.from('medications').insert({ trade_name: 'Admin direkt ' + s, dose: '1 mg', approved: true }).select().single();
  ok(r.data?.approved === true, 'Admin legt direkt freigegeben an');

  // Krankheiten
  r = await U.from('diagnoses').insert({ name: 'Testkrankheit ' + s, abbreviation: 'TK' }).select().single();
  ok(!r.error && !r.data.approved, 'Krankheit vorschlagen');
  const dxId = r.data.id;
  r = await V.from('diagnoses').insert({ name: ' testkrankheit ' + s });
  ok(r.error?.code === '23505', 'Doppelte Krankheit abgelehnt');
  r = await U.from('diagnoses').update({ abbreviation: 'B'.repeat(300) }).eq('id', dxId).select();
  ok(r.data?.length === 1, 'Abkürzung/Beschreibung mit 300 Zeichen erlaubt');
  r = await U.from('diagnoses').update({ abbreviation: 'B'.repeat(301) }).eq('id', dxId).select();
  ok(r.error?.code === '23514', 'Mehr als 300 Zeichen abgelehnt');
  r = await U.from('diagnoses').delete().eq('id', dxId).select();
  ok(r.data?.length === 1, 'Eigenen offenen Vorschlag zurückziehen');

  // Import
  r = await U.rpc('admin_import_catalog', { p_kind: 'med', p_rows: [{ trade_name: 'X' }] });
  ok(!!r.error, 'Import nur für Admins');
  r = await admin.rpc('admin_import_catalog', { p_kind: 'dx', p_rows: [{ name: 'Import A ' + s, abbreviation: 'IA' }, { name: 'import a ' + s }, { name: 'Import B ' + s }, { name: '' }] });
  ok(r.data === 2, 'Import: 2 von 4 übernommen (Doppelte und leere übersprungen): ' + r.data);
  r = await V.from('diagnoses').select().ilike('name', '%' + s);
  ok(r.data?.length === 2 && r.data.every((d) => d.approved), 'Importierte Einträge sofort für alle sichtbar');

  r = await client().from('medications').select();
  ok(!!r.error || r.data?.length === 0, 'Nicht angemeldet: kein Zugriff');
}
