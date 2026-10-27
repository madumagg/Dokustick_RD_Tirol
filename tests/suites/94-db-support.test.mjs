import { anonClient } from '../lib/harness.mjs';

export const needsCloud = true;
export const title = 'Datenbank-Regeln: Support-Tickets, interne Notizen, Zuweisung, Ideen, häufige Fragen';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const s = Date.now();
  async function login(email) { const c = anonClient(); const r = await c.auth.signInWithPassword({ email, password: t.config.password }); c.uid = r.data?.user?.id; c.email = email; return c; }
  async function user(name) {
    const c = anonClient();
    c.email = `${name}-${s}@test.at`;
    const { data, error } = await c.auth.signUp({ email: c.email, password: t.config.password });
    if (error) throw error;
    c.uid = data.user.id; return c;
  }
  const A = await login(t.config.adminEmail);
  const U = await user('sup-u'), V = await user('sup-v'), B = await user('sup-admin2');
  await A.rpc('admin_set_superadmin', { p_user: B.uid, p_admin: true });

  // --- Ohne Anmeldung: nur haeufige Fragen
  let r = await anonClient().from('support_faq').select('question, answer').order('sort');
  ok(r.data?.length >= 7 && r.data[0].question.includes('Dongle'), `Häufige Fragen ohne Anmeldung lesbar (${r.data?.length})`);
  const faqText = (r.data || []).map((f) => f.question + ' ' + f.answer).join('\n');
  ok(faqText.includes('Funktioniert ProtoPilot auf iPhone und iPad?') && !faqText.replace(/ältere Firmware: „DokuStick“/g, '').includes('DokuStick'),
    'Häufige Fragen: Name ProtoPilot (DokuStick nur als Hinweis auf ältere Firmware)');
  r = await anonClient().rpc('support_create', { p_category: 'frage', p_title: 'x', p_body: 'y' });
  ok(!!r.error, 'Ohne Anmeldung kein Ticket');

  // --- Tickets anlegen
  r = await U.rpc('support_create', { p_category: 'frage', p_title: `Dongle blinkt rot ${s}`, p_body: 'Was bedeutet das?', p_device: 'App-Version: 0.30\nGerät: Android 14' });
  const tU = r.data;
  ok(/^[0-9a-f-]{36}$/.test(tU || ''), 'Benutzer erstellt Ticket');
  r = await V.rpc('support_create', { p_category: 'vorschlag', p_title: `Dunkles Design für Nachtdienst ${s}`, p_body: 'Bitte noch dunkler, mein Name ist Max Muster.' });
  const tV = r.data;
  r = await U.rpc('support_create', { p_category: 'spam', p_title: 'x', p_body: 'y' });
  ok(!!r.error, 'Unbekannte Kategorie abgelehnt');

  r = await U.from('support_tickets').select('id');
  ok(!!r.error, 'Kein direkter Tabellenzugriff auf Tickets: ' + r.error?.message);
  r = await U.from('support_messages').select('id');
  ok(!!r.error, 'Kein direkter Tabellenzugriff auf Nachrichten');
  r = await U.rpc('support_my_tickets');
  ok(r.data?.length === 1 && r.data[0].id === tU && r.data[0].unread === false && r.data[0].status === 'offen', 'Eigene Tickets: genau eins, offen, nichts Neues');
  r = await V.rpc('support_ticket', { p_ticket: tU });
  ok(r.error?.message === 'Ticket nicht gefunden.', 'Fremdes Ticket nicht lesbar');
  r = await V.rpc('support_reply', { p_ticket: tU, p_body: 'Ich auch!' });
  ok(!!r.error, 'Auf fremdes Ticket nicht antworten');
  r = await U.rpc('admin_tickets');
  ok(r.error?.message === 'Keine Berechtigung', 'Benutzer: Admin-Ticketliste verweigert');
  r = await U.rpc('admin_reply', { p_ticket: tU, p_body: 'Ich bin Admin', p_internal: true });
  ok(r.error?.message === 'Keine Berechtigung', 'Benutzer kann keine internen Notizen schreiben');

  // --- Admins sehen alles
  r = await A.rpc('admin_tickets');
  let row = r.data?.find((x) => x.id === tU);
  ok(row && row.email === U.email && row.assigned_to === null && row.unread === true && row.messages === 1, 'Admin sieht Ticket mit E-Mail, nicht zugewiesen, neu');
  r = await A.rpc('support_counts');
  ok(r.data?.admin_new >= 2, `Abzeichen Admin: ${r.data?.admin_new} nicht zugewiesen`);
  r = await U.rpc('support_counts');
  ok(r.data?.unread === 0 && r.data.admin_new === null, 'Abzeichen Benutzer: keine Admin-Zahlen');
  r = await A.rpc('support_ticket', { p_ticket: tU });
  ok(r.data?.device.includes('Android 14') && r.data.email === U.email, 'Admin sieht Geräteinfos');

  // --- Antwort uebernimmt das Ticket
  r = await A.rpc('admin_reply', { p_ticket: tU, p_body: 'Rot blinkend heißt: nicht am Zielgerät eingesteckt.' });
  ok(!r.error, 'Admin antwortet ' + (r.error?.message || ''));
  r = await A.rpc('admin_tickets');
  row = r.data.find((x) => x.id === tU);
  ok(row.assigned_to === A.uid && row.status === 'in_arbeit' && row.unread === false, 'Antwort: automatisch zugewiesen, in Bearbeitung');
  r = await B.rpc('admin_reply', { p_ticket: tU, p_body: 'Doppelte Antwort' });
  ok(r.error?.code === 'DS409' && r.error.message.includes(t.config.adminEmail), 'Zweiter Admin: Warnung „bearbeitet bereits …“ (DS409)');
  r = await B.rpc('admin_ticket_assign', { p_ticket: tU, p_user: B.uid });
  ok(r.error?.code === 'DS409', 'Zweiter Admin kann nicht einfach übernehmen');
  r = await B.rpc('admin_reply', { p_ticket: tU, p_body: 'Nur intern: kenne ich vom Testgerät.', p_internal: true });
  ok(!r.error, 'Interne Notiz geht auch bei fremder Zuweisung');
  r = await A.rpc('admin_ticket_assign', { p_ticket: tU, p_user: U.uid });
  ok(r.error?.message.includes('nur App-Admins'), 'Nur App-Admins zuweisbar');

  // --- Benutzer sieht Antwort, aber keine internen Notizen
  r = await U.rpc('support_counts');
  ok(r.data?.unread === 1, 'Benutzer: 1 neue Antwort');
  r = await U.rpc('support_ticket', { p_ticket: tU });
  const bodies = r.data?.messages.map((m) => m.body);
  ok(JSON.stringify(bodies) === JSON.stringify(['Was bedeutet das?', 'Rot blinkend heißt: nicht am Zielgerät eingesteckt.', 'Status: In Bearbeitung']),
    'Benutzer sieht Verlauf ohne interne Notizen und Zuweisung: ' + JSON.stringify(bodies));
  ok(r.data.messages.every((m) => m.author_email === null) && r.data.assigned_email === null && r.data.email === null, 'Benutzer sieht keine Admin-E-Mails');
  r = await U.rpc('support_counts');
  ok(r.data?.unread === 0, 'Nach dem Lesen: keine neue Antwort mehr');
  r = await A.rpc('support_ticket', { p_ticket: tU });
  const internal = r.data.messages.filter((m) => m.internal).map((m) => m.body);
  ok(internal.includes('Übernommen') && internal.includes('Nur intern: kenne ich vom Testgerät.'), 'Admin sieht interne Notizen und Vermerke');

  // --- Rueckfrage und Antwort der Person
  r = await A.rpc('admin_reply', { p_ticket: tU, p_body: 'Welches Zielgerät?', p_status: 'rueckfrage' });
  r = await U.rpc('support_my_tickets');
  ok(r.data[0].status === 'rueckfrage' && r.data[0].unread === true, 'Status „wartet auf Rückmeldung“ beim Benutzer');
  r = await U.rpc('support_reply', { p_ticket: tU, p_body: 'Ein Laptop mit Windows.' });
  r = await A.rpc('support_counts');
  ok(r.data?.admin_mine === 1, 'Zugewiesener Admin: 1 Ticket mit neuer Nachricht');
  r = await A.rpc('admin_tickets');
  ok(r.data.find((x) => x.id === tU).status === 'in_arbeit', 'Antwort der Person: wieder in Bearbeitung');
  await A.rpc('support_ticket', { p_ticket: tU });
  r = await A.rpc('support_counts');
  ok(r.data?.admin_mine === 0, 'Nach dem Lesen: nichts Neues für den Admin');

  // --- Erledigt / wieder oeffnen
  r = await U.rpc('support_close', { p_ticket: tU, p_done: true });
  r = await U.rpc('support_my_tickets');
  ok(r.data[0].status === 'erledigt', 'Benutzer markiert als erledigt');
  r = await U.rpc('support_close', { p_ticket: tU, p_done: false });
  r = await U.rpc('support_my_tickets');
  ok(r.data[0].status === 'in_arbeit', 'Wieder geöffnet: bleibt beim zuständigen Admin');
  r = await A.rpc('admin_ticket_set', { p_ticket: tU, p_status: 'erledigt' });
  r = await U.rpc('support_ticket', { p_ticket: tU });
  ok(r.data.status === 'erledigt' && r.data.messages.at(-1).body === 'Status: Erledigt', 'Admin schließt: Vermerk für den Benutzer');
  r = await A.rpc('admin_ticket_set', { p_ticket: tU, p_status: 'kaputt' });
  ok(!!r.error, 'Ungültiger Status abgelehnt');

  // --- Ideen
  r = await U.rpc('support_ideas');
  ok(!r.data?.some((x) => x.id === tV), 'Unveröffentlichter Vorschlag ist keine Idee');
  r = await A.rpc('admin_ticket_idea', { p_ticket: tV, p_public: true, p_title: 'Noch dunkleres Design', p_text: 'Für Nachtdienste ein besonders dunkles Design.' });
  ok(!r.error, 'Admin veröffentlicht Vorschlag als Idee (Text bereinigt)');
  r = await U.rpc('support_ideas');
  let idea = r.data?.find((x) => x.id === tV);
  ok(idea && idea.title === 'Noch dunkleres Design' && idea.mine === false && idea.votes === 0 && !('created_by' in idea) && !JSON.stringify(idea).includes('Max Muster'),
    'Andere sehen die Idee ohne Namen und ohne Original-Text');
  r = await U.rpc('support_vote', { p_ticket: tV, p_on: true });
  ok(r.data === 1, '👍 zählt');
  r = await U.rpc('support_vote', { p_ticket: tV, p_on: true });
  ok(r.data === 1, 'Doppelt abstimmen zählt nicht doppelt');
  r = await B.rpc('support_vote', { p_ticket: tV, p_on: true });
  r = await V.rpc('support_ideas');
  idea = r.data.find((x) => x.id === tV);
  ok(idea.votes === 2 && idea.mine === true && idea.voted === false, 'Eigene Idee: 2 Stimmen, als eigene markiert');
  r = await U.rpc('support_vote', { p_ticket: tV, p_on: false });
  ok(r.data === 1, 'Stimme zurückgezogen');
  r = await U.rpc('support_vote', { p_ticket: tU, p_on: true });
  ok(r.error?.message === 'Idee nicht gefunden.', 'Nicht veröffentlichte Tickets: keine Stimme');
  r = await V.rpc('support_ticket', { p_ticket: tV });
  ok(r.data.messages.some((m) => m.system && m.body.startsWith('Als Idee für alle sichtbar')), 'Person erfährt, dass der Vorschlag veröffentlicht wurde');

  // --- Haeufige Fragen pflegen
  r = await U.from('support_faq').insert({ question: 'Hack?', answer: 'Nein' });
  ok(!!r.error, 'Benutzer kann keine häufigen Fragen anlegen');
  r = await A.from('support_faq').insert({ question: `Test-Frage ${s}`, answer: 'Antwort', sort: 99 }).select('id').single();
  const faq = r.data?.id;
  ok(!!faq, 'Admin legt häufige Frage an');
  r = await U.from('support_faq').update({ answer: 'geändert' }).eq('id', faq).select();
  ok(!r.error && r.data.length === 0, 'Benutzer kann sie nicht ändern');
  r = await A.from('support_faq').delete().eq('id', faq).select();
  ok(r.data?.length === 1, 'Admin löscht häufige Frage');

  // --- Loeschen
  r = await V.rpc('support_delete', { p_ticket: tU });
  ok(!!r.error, 'Fremdes Ticket nicht löschbar');
  r = await U.rpc('support_delete', { p_ticket: tU });
  r = await U.rpc('support_my_tickets');
  ok(!r.error && r.data.length === 0, 'Eigenes Ticket gelöscht');
  r = await A.rpc('admin_delete_user', { p_user: V.uid });
  r = await A.rpc('admin_tickets');
  ok(!r.data.some((x) => x.id === tV), 'Konto gelöscht: Tickets der Person sind weg');
  await A.rpc('admin_set_superadmin', { p_user: B.uid, p_admin: false });
}
