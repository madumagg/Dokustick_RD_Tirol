// Umbenennung DokuStick -> ProtoPilot: Name und Icon in der App, alte Sticks werden weiter erkannt
import { newDevice } from '../lib/harness.mjs';

export const title = 'Name ProtoPilot, alte Sticks (DokuStick) werden weiter erkannt';

// Bereits erlaubte Geraete wie bei Chrome (navigator.bluetooth.getDevices)
const known = (names) => `(() => {
  const devs = ${JSON.stringify(names)}.map((name) => ({ name, addEventListener() {}, gatt: { connected: false } }));
  Object.defineProperty(navigator, 'bluetooth', { value: { getDevices: async () => devs, requestDevice: async () => devs[0] } });
})()`;

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);

  const p = await newDevice(t, { name: 'Name' });
  ok(await p.title() === 'ProtoPilot', 'Fenstertitel ProtoPilot');
  ok((await p.textContent('header .brand-name')) === 'ProtoPilot', 'Kopfzeile zeigt ProtoPilot');
  const manifest = await p.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  ok(manifest.name === 'ProtoPilot' && manifest.short_name === 'ProtoPilot', 'Manifest: Name ProtoPilot');
  ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'Manifest: Icon für Android (maskable)');
  for (const f of ['favicon.svg', 'apple-touch-icon.png', 'icon-maskable-512.png']) {
    ok((await p.evaluate(async (u) => (await fetch(u)).status, f)) === 200, `${f} vorhanden`);
  }
  ok(!(await p.evaluate(() => document.body.innerText)).includes('DokuStick'), 'Kein „DokuStick“ mehr auf der Startseite');

  // Beim Start wird der gekoppelte Stick gewaehlt, egal ob neue oder alte Firmware
  for (const [names, want] of [[['Kopfhörer', 'ProtoPilot'], 'ProtoPilot'], [['Kopfhörer', 'DokuStick'], 'DokuStick']]) {
    const d = await newDevice(t, { name: want, init: known(names) });
    await d.waitForFunction(() => ble.device, null, { timeout: 5000 });
    ok(await d.evaluate(() => ble.device.name) === want, `Gekoppelter Stick „${want}“ wird erkannt`);
  }
}
