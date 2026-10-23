import { devices } from 'playwright';
import { newDevice } from '../lib/harness.mjs';

export const title = 'iPhone/iPad: Bluefy-Hinweis, Diktat über Tastatur';

export default async function (t) {
  const ok = (c, m) => t.ok(c, m);
  const page = (context, init) => newDevice(t, { name: 'iOS', context: { ...context, permissions: ['clipboard-read', 'clipboard-write'] }, init });
  // iPad (iPadOS gibt sich als Mac aus)
  const ipadUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const ipad = await page({ viewport: { width: 820, height: 1180 }, userAgent: ipadUA, hasTouch: true, isMobile: false },
    "Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); delete window.webkitSpeechRecognition; delete window.SpeechRecognition;");
  ok(await ipad.evaluate(() => IS_IOS), 'iPad (meldet sich als Mac) wird als iOS erkannt');
  ok(await ipad.isVisible('#statusArea >> text=Bluefy laden') && await ipad.isVisible('#statusArea >> text=Link kopieren'), 'iPad: Bluefy-Hinweis mit Knöpfen');
  ok(await ipad.getAttribute('#statusArea a', 'href') === 'https://apps.apple.com/app/id1492822055', 'Link zu Bluefy im App Store');
  await ipad.click('#statusArea >> text=Link kopieren');
  ok(await ipad.evaluate(() => navigator.clipboard.readText()) === t.base + '/index.html', 'App-Link in Zwischenablage kopiert');
  await ipad.click('#micBtn');
  ok((await ipad.textContent('#toast')).includes('Mikrofon'), 'iPad ohne Spracherkennung: Hinweis auf Tastatur-Diktat');
  ok(await ipad.evaluate(() => document.activeElement.classList.contains('doc-text')), 'iPad: Textfeld fokussiert (Tastatur geht auf)');
  await ipad.screenshot({ path: t.out + '/70-ipad.png' });
  // iPhone
  const iphone = await page(devices['iPhone 13']);
  ok(await iphone.isVisible('#statusArea >> text=Bluefy laden'), 'iPhone: Bluefy-Hinweis');
  await iphone.screenshot({ path: t.out + '/71-iphone.png' });
  // Desktop ohne Bluetooth (z.B. Firefox): alter Hinweis
  const desk = await page({ viewport: { width: 1200, height: 800 } }, "Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });");
  ok(!(await desk.evaluate(() => IS_IOS)) && await desk.isVisible('#statusArea >> text=Android: Chrome verwenden'), 'Desktop: allgemeiner Hinweis, kein iOS');
}
