import { newDevice } from '../lib/harness.mjs';

export const title = 'Blöcke verschieben (Maus, Touch, Tastatur)';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  async function setup(context) {
    const p = await newDevice(t, { name: 'Ziehen', context });
    await p.evaluate(() => { sessionStorage.clear(); clearDoc(); ['A', 'B', 'C'].forEach((l) => addToDoc(TEMPLATES.find((x) => x.title.startsWith(l)), { quiet: true })); doc[doc.length - 1].text = 'Freitext'; saveDoc(); renderDoc(); });
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
}
