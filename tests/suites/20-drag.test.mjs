import { newDevice } from '../lib/harness.mjs';

export const title = 'Blöcke verschieben (Maus, Touch, Tastatur)';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  // pinned = false: Freitext geloest (steht nach den Bausteinen) -> reine Ziehmechanik
  async function setup(context, { pinned = false } = {}) {
    const p = await newDevice(t, { name: 'Ziehen', context });
    await p.evaluate((pin) => {
      sessionStorage.clear(); clearDoc();
      if (!pin) doc[0].pinned = false;
      ['A', 'B', 'C'].forEach((l) => addToDoc(TEMPLATES.find((x) => x.title.startsWith(l)), { quiet: true }));
      doc.find((b) => b.type === 'text').text = 'Freitext'; saveDoc(); renderDoc();
    }, pinned);
    return { ctx: p.ctx, p };
  }
  const order = (p) => p.evaluate(() => doc.map((b) => (b.type === 'text' ? 'T' : b.title[0])).join(''));
  const center = async (p, sel) => { const b = await p.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const headOf = (l) => `.block-mod:has(strong:text-is("${l}")) .block-head strong`;

  // --- Maus
  {
    const { p } = await setup({});
    ok(await order(p) === 'ABCT', 'Start: ' + await order(p));
    ok(!(await p.locator('.block-head button[title="Nach oben"]').count()), 'Keine Pfeil-Knöpfe mehr');
    const from = await center(p, headOf('A – Atemwege'));
    const to = await center(p, headOf('C – Kreislauf'));
    await p.mouse.move(from.x, from.y); await p.mouse.down();
    for (let i = 1; i <= 15; i++) await p.mouse.move(from.x, from.y + ((to.y + 120 - from.y) * i) / 15);
    ok(await p.locator('.block.dragging').count() === 1 && await p.locator('.drop-line').count() === 1, 'Maus: Karte angehoben, Einfügelinie sichtbar');
    await p.screenshot({ path: t.out + '/50-ziehen.png' });
    await p.mouse.up();
    ok(await order(p) === 'BCAT', 'Maus: A hinter C gezogen -> ' + await order(p));
    // Klick ohne Bewegung verschiebt nichts
    const c = await center(p, headOf('B – Belüftung')); await p.mouse.click(c.x, c.y);
    ok(await order(p) === 'BCAT', 'Maus: einfacher Klick verschiebt nichts');
    // Tastatur
    await p.locator('.block-mod:has(strong:text-is("A – Atemwege")) .grip').focus();
    await p.keyboard.press('ArrowUp');
    ok(await order(p) === 'BACT', 'Tastatur: Pfeil hoch am Griff -> ' + await order(p));
    ok(await p.evaluate(() => document.activeElement.classList.contains('grip')), 'Tastatur: Fokus bleibt am Griff');
  }

  // --- Touch (echte Touch-Ereignisse ueber CDP)
  {
    const { ctx, p } = await setup({ hasTouch: true, isMobile: true });
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((t) => ({ x: Math.round(t.x), y: Math.round(t.y) })) });
    async function gesture(from, toY, holdMs, steps = 12, holdEnd = 0) {
      await touch('touchStart', [from]);
      await p.waitForTimeout(holdMs);
      for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x: from.x, y: from.y + ((toY - from.y) * i) / steps }]); await p.waitForTimeout(16); }
      await p.waitForTimeout(holdEnd);
      await touch('touchEnd', []);
      await p.waitForTimeout(100);
    }
    // Kurzes Wischen auf der Kopfzeile: kein Verschieben
    let from = await center(p, headOf('A – Atemwege'));
    await gesture(from, from.y + 250, 30);
    ok(await order(p) === 'ABCT', 'Touch: kurzes Wischen verschiebt nichts');
    await p.evaluate(() => window.scrollTo(0, 0));
    // Gedrueckt halten + ziehen
    from = await center(p, headOf('A – Atemwege'));
    const to = await center(p, headOf('B – Belüftung'));
    await gesture(from, to.y + 200, 500);
    ok(await order(p) === 'BACT', 'Touch: gedrückt halten + ziehen -> ' + await order(p));
    // Griff am Textblock: sofort ziehen nach ganz oben
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    from = await center(p, '.block-text .grip');
    await gesture(from, 60, 20, 40, 2000);
    const o = await order(p);
    ok(o[0] === 'T', 'Touch: Textblock am Griff nach oben gezogen (mit Mitscrollen) -> ' + o);
    // Antippen einer Option funktioniert weiterhin
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator('.block-mod:has(strong:text-is("A – Atemwege")) .chip:has-text("gefährdet")').tap();
    ok(await p.locator('.block-mod:has(strong:text-is("A – Atemwege")) .chip.sel:has-text("gefährdet")').count() === 1, 'Touch: Optionen antippen funktioniert weiterhin');
    await p.screenshot({ path: t.out + '/51-touch.png' });
  }

  // --- Freitext oben angeheftet (Standard bei neuem Protokoll)
  {
    const { p } = await setup({ viewport: { width: 390, height: 3200 } }, { pinned: true });
    const pinned = () => p.evaluate(() => !!doc[0].pinned);
    ok(await order(p) === 'TABC' && await pinned(), 'Angeheftet: Freitext oben, neue Bausteine darunter -> ' + await order(p));
    ok(await p.locator('.block-text .pin.on').count() === 1, '📌 am Freitext aktiv');
    // Baustein ueber den angehefteten Freitext schieben: Freitext bleibt oben
    await p.locator('.block-mod:has(strong:text-is("A – Atemwege")) .grip').focus();
    await p.keyboard.press('ArrowUp');
    ok(await order(p) === 'TABC' && await pinned(), 'Baustein kann nicht über den angehefteten Freitext -> ' + await order(p));
    // Mit der Maus zwischen andere Bausteine ziehen geht weiterhin
    // Massgeblich ist die Kartenmitte: C so weit hochziehen, dass seine Mitte ueber der von A liegt
    const card = async (l) => p.locator(`.block-mod:has(strong:text-is("${l}"))`).boundingBox();
    const cBox = await card('C – Kreislauf'), aBox = await card('A – Atemwege');
    const from = await center(p, headOf('C – Kreislauf'));
    const dy = (aBox.y + aBox.height / 2 - 20) - (cBox.y + cBox.height / 2);
    await p.mouse.move(from.x, from.y); await p.mouse.down();
    for (let i = 1; i <= 15; i++) await p.mouse.move(from.x, from.y + (dy * i) / 15);
    await p.mouse.up();
    ok(await order(p) === 'TCAB' && await pinned(), 'Maus: C vor A gezogen, Freitext bleibt oben -> ' + await order(p));
    // Freitext selbst verschieben: loest die Anheftung
    await p.locator('.block-text .grip').focus();
    await p.keyboard.press('ArrowDown');
    ok(await order(p) === 'CTAB' && !(await p.evaluate(() => doc.some((b) => b.pinned))), 'Freitext verschoben -> gelöst: ' + await order(p));
    ok(await p.locator('.block-text .pin:not(.on)').count() === 1, '📌 jetzt inaktiv');
    // 📌 antippen: wieder oben angeheftet
    await p.locator('.block-text .pin').click();
    ok(await order(p) === 'TCAB' && await pinned(), '📌 antippen: Freitext wieder oben angeheftet -> ' + await order(p));
    // Diktat/Tasten ohne Auswahl landen im angehefteten Freitext
    ok(await p.evaluate(() => { activeBlockId = null; return activeTextArea().closest('[data-block]').dataset.block === doc[0].id; }), 'Diktat/Tasten ohne Auswahl landen im angehefteten Freitext');
    await p.screenshot({ path: t.out + '/52-angeheftet.png', fullPage: true });

    // Einfache Textbausteine: eigene Bloecke in der Reihenfolge des Hinzufuegens, nie an den Freitext angehaengt
    await p.evaluate(() => {
      addToDoc({ title: 'E – Ereignis', body: 'Siehe Notfallgeschehen' }, { quiet: true });
      addToDoc({ title: 'Monitoring', body: 'Monitoring (EKG, SpO2, RR) angelegt.' }, { quiet: true });
    });
    const texts = () => p.evaluate(() => doc.map((b) => (b.type === 'text' ? b.text : b.title[0])).join(' | '));
    ok(await texts() === 'Freitext | C | A | B | Siehe Notfallgeschehen | Monitoring (EKG, SpO2, RR) angelegt.', 'Textbausteine als eigene Blöcke am Ende: ' + await texts());
    const mon = p.locator('.block-text:has(textarea:text-is("Monitoring (EKG, SpO2, RR) angelegt.")) .grip');
    await mon.focus();
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('ArrowUp');
    ok(await texts() === 'Freitext | C | A | Monitoring (EKG, SpO2, RR) angelegt. | B | Siehe Notfallgeschehen', 'Einzeln verschiebbar, nichts zusammengelegt: ' + await texts());
  }
}
