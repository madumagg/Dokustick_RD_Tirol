import { newDevice, login, serviceClient, userId, uniq } from '../lib/harness.mjs';

export const needsCloud = false;
export const title = 'Support & Feedback: Tickets, Zuweisung, interne Notizen, Ideen, häufige Fragen, Was ist neu';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const settings = (p) => p.click('nav button[data-tab=settings]');

  // --- Was ist neu: nur nach einem Update, nicht beim ersten Start
  const F = await newDevice(t, { name: 'Neu' });
  const ver = await F.evaluate(() => APP_VERSION);
  ok(await F.locator('#newsNote .note').count() === 0, 'Erster Start: kein Hinweis „Neu in Version …“');
  await settings(F);
  ok((await F.textContent('#supportCard')).includes('Tickets brauchen die Cloud-Synchronisierung'), 'Ohne Cloud: Hinweis statt Tickets');
  await F.click('#supportCard >> text=Was ist neu');
  ok((await F.locator('#dlg .news h2').first().textContent()).startsWith('Version ' + ver) && await F.locator('#dlg .news h2 .badge').first().textContent() === 'aktuell',
    'Dialog „Was ist neu“ beginnt mit der aktuellen Version ' + ver);
  await F.click('#dlg >> text=Schließen');
  await F.click('#supportCard >> text=Häufige Fragen');
  ok((await F.textContent('#dlg .faq')).includes('Noch keine häufigen Fragen auf diesem Gerät'), 'Häufige Fragen ohne Cloud: Hinweis statt Endlos-Laden');
  await F.click('#dlg >> text=Schließen');

  const O = await newDevice(t, { name: 'Update', init: () => { if (!localStorage.getItem('dokustick.newsSeen')) { localStorage.setItem('dokustick.local.items', '[]'); localStorage.setItem('dokustick.newsSeen', '"0.27"'); } } });
  const note = O.locator('#newsNote .note');
  ok(await note.count() === 1 && (await note.textContent()).startsWith(`Neu in Version ${ver}:`) && (await note.textContent()).includes('…'), 'Nach Update von 0.27: Hinweis mit der neuesten Version');
  await O.screenshot({ path: t.out + '/support-neu-hinweis.png' });
  await note.locator('text=Mehr').click();
  const versions = await O.locator('#dlg .news h2').allTextContents();
  ok(versions.length >= 3 && versions[1].startsWith('Version 0.29'), '„Mehr“ zeigt alle Neuerungen: ' + versions.slice(0, 3).join(', '));
  await O.click('#dlg >> text=Schließen');
  ok(await note.count() === 0 && await O.evaluate(() => store.load('newsSeen')) === ver, 'Gelesen: Hinweis weg');
  await O.reload();
  ok(await O.locator('#newsNote .note').count() === 0, 'Nach Neuladen kein Hinweis mehr');

  const Old = await newDevice(t, { name: 'Bisher', init: () => { if (!localStorage.getItem('dokustick.x')) { localStorage.setItem('dokustick.x', '1'); localStorage.setItem('dokustick.local.items', '[]'); } } });
  ok(await Old.locator('#newsNote .note').count() === 1, 'Bisherige Benutzer ohne gemerkte Version sehen die Neuerungen');
  await Old.click('#newsNote button[aria-label="Hinweis ausblenden"]');
  ok(await Old.locator('#newsNote .note').count() === 0, '✕ blendet den Hinweis aus');

  // --- Geraeteinfos
  const D = await newDevice(t, { name: 'Gerät', ble: true });
  let info = await D.evaluate(() => deviceInfo());
  ok(info.startsWith('App-Version: ' + ver) && info.includes('Dongle: nicht verbunden') && info.includes('User-Agent: '), 'Geräteinfos: App-Version, Dongle, User-Agent');
  await D.click('#connBtn');
  await D.waitForSelector('text=Verbunden');
  info = await D.evaluate(() => deviceInfo());
  ok(/Dongle: verbunden, Firmware \d+, am Zielgerät eingesteckt/.test(info), 'Mit Dongle: Firmware und USB-Status: ' + info.split('\n').find((l) => l.startsWith('Dongle')));

  if (!t.cloud) return;

  // ================= Mit Test-Datenbank =================
  const s = uniq();

  // Server noch ohne Migration *_support.sql: Hinweis, Synchronisation laeuft weiter
  const M = await newDevice(t, { name: 'Ohne Migration', cloud: true });
  await M.ctx.route(/\/rest\/v1\/(rpc\/support_|support_faq)/, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }) }));
  await login(M, `support-alt-${s}@test.at`, { signup: true });
  await M.waitForSelector('#supportCard >> text=noch nicht eingerichtet');
  ok(!(await M.evaluate(() => cloud.error)) && await M.isHidden('#setNavBadge'), 'Ohne Migration: Hinweis im Support-Bereich, Sync ohne Fehler');

  const confirms = [];
  const dialog = (d) => { confirms.push(d.message()); return /übernommen/.test(d.message()) || /Trotzdem/.test(d.message()) ? d.dismiss() : d.accept(); };
  const U = await newDevice(t, { name: 'Benutzer', cloud: true, ble: true });
  await login(U, `support-${s}@test.at`, { signup: true });
  await U.waitForSelector('#supportCard >> text=Noch keine Tickets');
  ok(true, 'Angemeldet: „Support & Feedback“ mit Tickets');

  // Neues Ticket: Kategorie Fehler, Geraeteinfos
  await U.click('#supportCard >> text=＋ Neues Ticket');
  await U.click('#dlg button[data-cat=fehler]');
  ok(await U.getAttribute('#dlg input[name=title]', 'placeholder') === 'z. B. Dongle tippt Umlaute falsch' && await U.isChecked('#dlg input[name=device]'), 'Kategorie Fehler: passender Hinweis, Geräteinfos angehakt');
  ok((await U.textContent('#dlg .dev-info')).includes('App-Version: ' + ver), 'Vorschau zeigt, was mitgeschickt wird');
  ok((await U.textContent('#dlg .note.warn')).includes('keine Patientendaten'), 'Hinweis: keine Patientendaten');
  await U.click('#dlg button[type=submit]');
  ok(await U.locator('#dlg[open]').count() === 1 && await U.evaluate(() => !document.querySelector('#dlg input[name=title]').validity.valid), 'Leer: Pflichtfeld, nicht gesendet');
  await U.fill('#dlg input[name=title]', `Umlaute fehlen ${s}`);
  await U.fill('#dlg textarea[name=body]', 'Am Laptop kommt statt ä nichts an.');
  await U.screenshot({ path: t.out + '/support-neues-ticket.png' });
  await U.click('#dlg button[type=submit]');
  const card = U.locator(`#supportCard .ticket:has-text("Umlaute fehlen ${s}")`);
  await card.waitFor();
  ok((await card.locator('.prev').textContent()).startsWith('Fehler · Offen'), 'Ticket in „Meine Tickets“: Fehler · Offen');

  // --- Admin: Abzeichen, Liste, Antwort mit Rueckfrage
  const A = await newDevice(t, { name: 'Admin', cloud: true, dialog });
  await login(A, t.config.adminEmail);
  await A.waitForFunction(() => support.polledFor && support.counts.admin_new > 0);
  ok(await A.isVisible('#setNavBadge') && Number(await A.textContent('#setNavBadge')) >= 1, 'Admin: Abzeichen an „Einstellungen“ für nicht zugewiesene Tickets');
  await A.click('#adminSupport button:has-text("Tickets")');
  await A.fill('#adminBody input[type=search]', s);
  const row = A.locator(`#adminBody .ticket:has-text("Umlaute fehlen ${s}")`);
  ok(await row.locator('.badge.warn:text-is("nicht zugewiesen")').count() === 1 && await row.locator('.badge.bad:text-is("Neu")').count() === 1, 'Admin-Liste: neu und nicht zugewiesen');
  await A.screenshot({ path: t.out + '/support-admin-liste.png' });
  await row.locator('.send').click();
  await A.waitForSelector('#dlg >> text=Noch niemandem zugewiesen');
  ok((await A.textContent('#dlg details.dev .dev-info')).includes('Firmware') || (await A.textContent('#dlg details.dev .dev-info')).includes('Dongle:'), 'Admin sieht die Geräteinfos');
  await A.fill('#dlg textarea[aria-label=Antwort]', 'Welches Tastaturlayout ist am Laptop eingestellt?');
  await A.selectOption('#dlg select[name=after]', 'rueckfrage');
  await A.click('#dlg button:text-is("Senden")');
  await A.waitForSelector('#dlg .msg.mine:has-text("Welches Tastaturlayout")');
  ok(await A.locator('#dlg .msg-sys.internal:has-text("Übernommen")').count() === 1 && (await A.locator('#dlg select[aria-label=Zuständig] option:checked').textContent()).includes('(du)'),
    'Erste Antwort übernimmt das Ticket (interner Vermerk)');
  ok(await A.locator('#dlg .msg-sys:has-text("Status: Wartet auf Rückmeldung")').count() === 1, 'Status „Wartet auf Rückmeldung“ als Vermerk');
  await A.check('#dlg .check:has-text("Interne Notiz") input');
  ok(await A.inputValue('#dlg select[name=after]') === 'rueckfrage', 'Interne Notiz: Status bleibt, solange man ihn nicht ändert');
  await A.fill('#dlg textarea[aria-label=Antwort]', 'Vermutlich englisches Layout.');
  await A.click('#dlg button:text-is("Senden")');
  await A.waitForSelector('#dlg .msg.internal:has-text("Vermutlich englisches Layout")');
  ok(true, 'Interne Notiz im Verlauf (gelb markiert)');
  await A.screenshot({ path: t.out + '/support-admin-ticket.png', fullPage: true });
  await A.click('#dlg >> text=Schließen');

  // --- Zweiter Admin wird gewarnt
  const B = await newDevice(t, { name: 'Admin 2', cloud: true, dialog });
  await login(B, `support-admin-${s}@test.at`, { signup: true });
  await serviceClient().from('app_admins').insert({ user_id: await userId(`support-admin-${s}@test.at`) });
  await B.evaluate(() => cloud.loadInfo());
  await B.waitForSelector('#adminOpen', { state: 'visible' });
  await B.evaluate(() => admin.open('support'));
  await B.fill('#adminBody input[type=search]', s);
  await B.locator(`#adminBody .ticket:has-text("Umlaute fehlen ${s}")`).locator('.send').click();
  await B.waitForSelector('#dlg .note.warn');
  ok((await B.textContent('#dlg .note.warn')).includes(`Wird bearbeitet von ${t.config.adminEmail}`), 'Zweiter Admin: „Wird bearbeitet von …“');
  const before = await B.locator('#dlg .msg').count();
  await B.fill('#dlg textarea[aria-label=Antwort]', 'Doppelte Antwort');
  await B.click('#dlg button:text-is("Senden")');
  await B.waitForTimeout(500);
  ok(confirms.some((m) => m.includes(`${t.config.adminEmail} bearbeitet dieses Ticket. Trotzdem antworten?`)) && await B.locator('#dlg .msg').count() === before,
    'Warnung vor dem Antworten, abgelehnt: nichts gesendet');
  await B.click('#dlg >> text=Schließen');

  // --- Benutzer sieht die Antwort (ohne interne Notiz) und antwortet
  await U.evaluate(() => support.poll());
  ok(await U.textContent('#setNavBadge') === '1', 'Benutzer: Abzeichen „1“ an Einstellungen');
  ok(await card.locator('.badge.bad:text-is("Neue Antwort")').count() === 1 && (await card.locator('.prev').textContent()).includes('Wartet auf deine Antwort'), 'Ticket: „Neue Antwort“, „Wartet auf deine Antwort“');
  await U.screenshot({ path: t.out + '/support-benutzer-karte.png' });
  await card.locator('.send').click();
  await U.waitForSelector('#dlg .thread');
  const msgs = await U.locator('#dlg .msg .msg-meta').allTextContents();
  ok(msgs.length === 2 && msgs[0].startsWith('Du ·') && msgs[1].startsWith('Support ·'), 'Verlauf: eigene Nachricht und Antwort vom „Support“');
  ok(!(await U.textContent('#dlg .thread')).includes('englisches Layout') && !(await U.textContent('#dlg .thread')).includes('Übernommen') && !(await U.textContent('#dlg')).includes(t.config.adminEmail),
    'Keine internen Notizen, Vermerke oder Admin-E-Mails');
  ok(await U.isHidden('#setNavBadge'), 'Gelesen: Abzeichen weg');
  await U.fill('#dlg textarea[aria-label=Antwort]', 'Englisch (USA). Jetzt auf Deutsch umgestellt, geht!');
  await U.click('#dlg button:text-is("Senden")');
  await U.waitForSelector('#dlg .msg.mine:has-text("geht!")');
  ok((await U.textContent('#dlg .help .badge')) === 'In Bearbeitung', 'Antwort: wieder „In Bearbeitung“');
  await U.screenshot({ path: t.out + '/support-benutzer-ticket.png', fullPage: true });
  await U.click('#dlg button:text-is("Erledigt ✓")');
  await U.waitForSelector('#dlg button:text-is("Wieder öffnen")');
  ok(await U.locator('#dlg .msg-sys:has-text("Als erledigt markiert")').count() === 1, 'Benutzer markiert als erledigt');
  await U.click('#dlg >> text=Schließen');

  // --- Vorschlag -> Idee -> Abstimmen
  await U.click('#supportCard >> text=💡 Ideen');
  await U.click('#dlg >> text=＋ Eigener Vorschlag');
  ok(await U.getAttribute('#dlg button[data-cat=vorschlag]', 'aria-selected') === 'true' && !(await U.isChecked('#dlg input[name=device]')), 'Eigener Vorschlag: Kategorie gewählt, ohne Geräteinfos');
  await U.fill('#dlg input[name=title]', `Schmerzskala ${s}`);
  await U.fill('#dlg textarea[name=body]', 'Baustein für NRS 0–10 wäre super. Gruß, Hans');
  await U.click('#dlg button[type=submit]');
  await U.locator(`#supportCard .ticket:has-text("Schmerzskala ${s}")`).waitFor();

  await A.evaluate(() => admin.show('support'));
  await A.fill('#adminBody input[type=search]', `Schmerzskala ${s}`);
  await A.locator(`#adminBody .ticket:has-text("Schmerzskala ${s}") .send`).click();
  await A.click('#dlg summary:has-text("Als Idee für alle veröffentlichen")');
  ok((await A.inputValue('#dlg details.dev textarea')).includes('Gruß, Hans'), 'Text der Idee vorbelegt, zum Bereinigen');
  await A.fill('#dlg details.dev textarea', 'Baustein für die Schmerzskala NRS 0–10.');
  await A.click('#dlg button:text-is("Veröffentlichen")');
  await A.waitForSelector('#dlg summary:has-text("Als Idee veröffentlicht")');
  ok(true, 'Admin veröffentlicht den Vorschlag als Idee');
  await A.click('#dlg >> text=Schließen');

  const V = await newDevice(t, { name: 'Kollegin', cloud: true });
  await login(V, `support-v-${s}@test.at`, { signup: true });
  await V.click('#supportCard >> text=💡 Ideen');
  const idea = V.locator(`#dlg .idea:has-text("Schmerzskala ${s}")`);
  await idea.waitFor();
  ok(!(await idea.textContent()).includes('Hans') && await idea.locator('.badge:text-is("Dein Vorschlag")').count() === 0, 'Andere sehen die Idee ohne Namen');
  await idea.locator('.vote').click();
  await V.waitForSelector(`#dlg .idea:has-text("Schmerzskala ${s}") .vote[aria-pressed=true]`);
  ok((await idea.locator('.vote').textContent()) === '👍 1', '👍 gezählt und markiert');
  await V.screenshot({ path: t.out + '/support-ideen.png' });
  await V.click('#dlg >> text=Schließen');
  await U.click('#supportCard >> text=💡 Ideen');
  const mine = U.locator(`#dlg .idea:has-text("Schmerzskala ${s}")`);
  await mine.waitFor();
  ok(await mine.locator('.badge:text-is("Dein Vorschlag")').count() === 1 && (await mine.locator('.vote').textContent()) === '👍 1', 'Eigene Idee markiert, Stimme sichtbar');
  await U.click('#dlg >> text=Schließen');

  // --- Haeufige Fragen
  await V.click('#supportCard >> text=Häufige Fragen');
  await V.waitForSelector('#dlg .faq details');
  ok(await V.locator('#dlg .faq details').count() >= 7 && (await V.textContent('#dlg .faq')).includes('Der Dongle verbindet sich nicht'), 'Häufige Fragen aus der Datenbank');
  await V.fill('#dlg input[type=search]', 'Citrix');
  ok(await V.locator('#dlg .faq details').count() === 1, 'Suche in den häufigen Fragen');
  await V.click('#dlg .faq summary');
  ok(await V.isVisible('#dlg .faq p:has-text("15–25 ms")'), 'Antwort klappt auf');
  await V.screenshot({ path: t.out + '/support-faq.png' });
  await V.click('#dlg >> text=Schließen');

  await A.evaluate(() => admin.show('support'));
  await A.click('#adminBody >> text=Bearbeiten');
  await A.click('#dlg >> text=＋ Neue Frage');
  await A.fill('#dlg input[name=q]', `Testfrage ${s}?`);
  await A.fill('#dlg textarea[name=a]', 'Testantwort.');
  await A.click('#dlg button[type=submit]');
  await A.waitForSelector(`#dlg .mod:has-text("Testfrage ${s}?")`);
  ok(true, 'Admin legt häufige Frage an, zurück in der Liste');
  await A.locator(`#dlg .mod:has-text("Testfrage ${s}?") button[title="Nach oben"]`).click();
  await A.waitForFunction((q) => { const t = [...document.querySelectorAll('#dlg .mod .title')].map((x) => x.textContent); return t.indexOf(q) === t.length - 2; }, `Testfrage ${s}?`);
  ok(true, '↑ verschiebt die Frage');
  await A.locator(`#dlg .mod:has-text("Testfrage ${s}?") .send`).click();
  await A.click('#dlg button:text-is("Löschen")');
  await A.waitForSelector('#dlg h3:text-is("Häufige Fragen")');
  await A.waitForSelector(`#dlg .mod:has-text("Testfrage ${s}?")`, { state: 'detached' });
  ok(true, 'Gelöscht, Liste aktualisiert');
}
