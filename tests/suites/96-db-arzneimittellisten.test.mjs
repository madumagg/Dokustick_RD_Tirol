import { anonClient } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Datenbank-Regeln: Arzneimittelliste 1 und 2';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const client = () => anonClient();
  async function login(email, pw = t.config.password) { const c = client(); const r = await c.auth.signInWithPassword({ email, password: pw }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  async function signup(email) { const c = client(); const r = await c.auth.signUp({ email, password: t.config.password }); c.err = r.error; c.uid = r.data?.user?.id; return c; }
  const s = Date.now();
  const admin = await login(t.config.adminEmail);
  const U = await signup(`al-u-${s}@test.at`), V = await signup(`al-v-${s}@test.at`);
  const T = 'drug_list_entries';

  // Startdaten aus der Arzneimittelliste (RD Tirol 2022)
  let r = await V.from(T).select('list,name,indication,approved').eq('approved', true);
  const l1 = (r.data || []).filter((e) => e.list === 1), l2 = (r.data || []).filter((e) => e.list === 2);
  ok(l1.length >= 10 && l2.length >= 10, `Startdaten vorhanden (Liste 1: ${l1.length}, Liste 2: ${l2.length})`);
  ok(l2.some((e) => e.name === 'Glucose 33 % i.v.' && e.indication === 'Hypoglykämie'), 'Liste 2: Glucose 33 % bei Hypoglykämie');
  ok(l1.some((e) => e.name === 'Aspro Classic 320 mg p.o.' && e.indication === 'Akutes Koronarsyndrom'), 'Liste 1: Aspro Classic bei akutem Koronarsyndrom');
  ok(l2.filter((e) => e.name === 'Dibondrin 30 mg i.v.').length === 2, 'Dasselbe Medikament für zwei Krankheitsbilder (Dibondrin)');
  ok(!l1.concat(l2).some((e) => /nitrolingual/i.test(e.name)), 'Gestrichene Medikamente (Nitrolingual) nicht enthalten');
  // Korrektur nach fachlicher Pruefung (20261028200000_arzneimittellisten_korrektur.sql)
  ok(['Stesolid Rektiole 5 mg', 'Stesolid Rektiole 10 mg'].every((n) => l1.some((e) => e.name === n)) && !l1.some((e) => e.name === 'Stesolid Rektiole'), 'Liste 1: Stesolid als 5 mg und 10 mg');
  ok(l2.some((e) => e.name === 'Penthrox Inhaler' && e.indication === 'Starke Schmerzen'), 'Liste 2: Penthrox Inhaler bei starken Schmerzen');
  ok(['Amiodaron 300 mg i.v.', 'Amiodaron 150 mg i.v.'].every((n) => l2.some((e) => e.name === n && e.indication === 'Atem-Kreislauf-Stillstand')) && !l2.some((e) => e.name.startsWith('Sedacoron')), 'Liste 2: Amiodaron als 300 mg und 150 mg');

  // Vorschlagen, Freigeben, Doppelte
  const name = `Testamin ${s} i.v.`;
  r = await U.from(T).insert({ list: 2, name, indication: 'Testkrankheit', dose: '1 mg' }).select().single();
  ok(!r.error && r.data.approved === false && r.data.created_by === U.uid, 'Benutzer schlägt Eintrag für Liste 2 vor (offen, Ersteller gesetzt)');
  const id = r.data?.id;
  r = await V.from(T).select().eq('id', id);
  ok(r.data?.length === 0, 'Anderer Benutzer sieht offenen Vorschlag nicht');
  r = await V.from(T).insert({ list: 2, name: ' ' + name.toUpperCase(), indication: 'TESTKRANKHEIT' });
  ok(r.error?.code === '23505', 'Doppelter Eintrag (gleiche Liste, Name, Krankheitsbild) abgelehnt: ' + r.error?.code);
  r = await V.from(T).insert({ list: 2, name, indication: 'Andere Krankheit' });
  ok(!r.error, 'Gleiches Medikament für anderes Krankheitsbild erlaubt');
  r = await V.from(T).insert({ list: 1, name, indication: 'Testkrankheit' });
  ok(!r.error, 'Gleiches Medikament in der anderen Liste erlaubt');
  r = await U.from(T).insert({ list: 3, name: 'Liste drei ' + s, indication: 'x' });
  ok(r.error?.code === '23514', 'Nur Liste 1 und 2 erlaubt');
  r = await U.from(T).insert({ list: 1, name: 'Ohne Krankheitsbild ' + s, indication: ' ' });
  ok(r.error?.code === '23514', 'Krankheitsbild ist Pflicht');
  r = await U.from(T).insert({ list: 1, name: 'Selbstfreigabe ' + s, indication: 'x', approved: true });
  ok(!!r.error, 'Benutzer kann nicht selbst freigeben');
  r = await U.from(T).update({ dose: '2 mg' }).eq('id', id).select();
  ok(r.data?.length === 1 && r.data[0].dose === '2 mg', 'Benutzer korrigiert eigenen offenen Vorschlag');
  r = await V.from(T).update({ dose: 'x' }).eq('id', id).select();
  ok(r.data?.length === 0, 'Fremde können Vorschlag nicht ändern');
  r = await admin.from(T).update({ approved: true }).eq('id', id).select().single();
  ok(r.data?.approved && r.data.approved_by === admin.uid && r.data.created_by === U.uid, 'Admin gibt frei');
  r = await V.from(T).select().eq('id', id);
  ok(r.data?.length === 1, 'Nach Freigabe für alle sichtbar');
  r = await U.from(T).delete().eq('id', id).select();
  ok(r.data?.length === 0, 'Freigegebenen Eintrag kann Ersteller nicht löschen');
  r = await admin.from(T).delete().eq('id', id).select();
  ok(r.data?.length === 1, 'Admin löscht Eintrag');

  // Import (gleiche Funktion wie Medikamente/Krankheiten)
  r = await U.rpc('admin_import_catalog', { p_kind: 'al1', p_rows: [{ name: 'X', indication: 'Y' }] });
  ok(!!r.error, 'Import nur für Admins');
  r = await admin.rpc('admin_import_catalog', { p_kind: 'al1', p_rows: [
    { name: 'Import A ' + s, indication: 'Import KB', dose: '1 mg' },
    { name: 'import a ' + s, indication: 'import kb' },
    { name: 'Import B ' + s, indication: '' },
    { name: 'Import C ' + s, indication: 'Import KB', note: 'KI: keine' },
  ] });
  ok(r.data === 2, 'Import: 2 von 4 übernommen (Doppelte und ohne Krankheitsbild übersprungen): ' + r.data);
  r = await V.from(T).select().ilike('name', 'Import % ' + s);
  ok(r.data?.length === 2 && r.data.every((e) => e.approved && e.list === 1), 'Importierte Einträge in Liste 1, sofort für alle sichtbar');
  r = await admin.rpc('admin_import_catalog', { p_kind: 'dx', p_rows: [{ name: 'Import dx ' + s }] });
  ok(r.data === 1, 'Import für Krankheiten funktioniert weiter');

  r = await client().from(T).select();
  ok(!!r.error || r.data?.length === 0, 'Nicht angemeldet: kein Zugriff');

  // Aufraeumen: Testeintraege nicht in den Listen lassen (Auswahl in den Bausteinen)
  await admin.from(T).delete().like('name', `% ${s}%`);
}
