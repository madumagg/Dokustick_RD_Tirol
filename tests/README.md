# Tests

Automatische Tests für Web-App, Datenbank-Regeln und Firmware-Tastaturbelegung. Ein kompletter Durchlauf dauert unter einer Minute.

## Einmalig einrichten

Voraussetzungen: **Node.js 20+** und für die Datenbank-Tests **Docker** (Docker Desktop unter Windows/macOS).

```sh
cd tests
npm install
npx playwright install chromium   # Testbrowser herunterladen
```

## Starten

```sh
cd tests
npm run db:start      # lokale Supabase starten, spielt supabase/migrations/ ein (erster Start dauert einige Minuten)
npm test              # alle Tests
npm run db:stop       # lokale Supabase beenden
```

Die Zugangsdaten der lokalen Supabase holen sich die Tests automatisch. Weitere Befehle:

| Befehl | Wirkung |
|---|---|
| `npm test -- compose sync` | nur Testreihen, deren Name den Text enthält |
| `npm run test:offline` | nur Tests ohne Datenbank (kein Docker nötig) |
| `npm run db:reset` | Datenbank leeren und alle Migrationen neu einspielen |
| `npm run db:status` | Adressen und Schlüssel der lokalen Supabase anzeigen. Das Dashboard liegt unter http://127.0.0.1:54323 |
| `tests/firmware/run.sh` | Test der deutschen Tastaturbelegung der Firmware (braucht gcc) |

Screenshots und die Test-PDF landen in `tests/test-output/` (nicht im Git).

**Sicherheit:** Die Tests legen Benutzer an, löschen sie und ändern App-Einstellungen. Zeigt `SUPABASE_URL` auf ein Projekt bei supabase.co, verweigern sie den Start. Nur für ein eigenes, leeres **Test-Projekt** lässt sich das mit `ALLOW_REMOTE_TESTS=1` übersteuern.

## Umgebungsvariablen (optional)

| Variable | Standard |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | automatisch aus `supabase status` |
| `TEST_PORT` | `8099` (Webserver für die App; `TEST_PORT+1` für den Update-Test) |
| `TEST_ADMIN_EMAIL` | `admin@dokustick.test` (wird angelegt und zum App-Admin gemacht) |
| `CHROMIUM_PATH` | eigener Chromium statt des Playwright-Browsers |

## Testreihen

| Datei | Prüft |
|---|---|
| `00-unit` | Kernfunktionen direkt im Browser: Feld-Syntax, Leerfeld-Regel, Kodierung für den Dongle, Datenbank-Suche, Sprachbefehle |
| `10-compose` | Protokoll, interaktive Bausteine, Pflichtfelder, Feld-Editor, Vorlagen, Senden an simulierten Dongle |
| `20-drag` | Blöcke verschieben mit Maus, Touch (echte Touch-Ereignisse) und Tastatur |
| `30-ios` | Bluefy-Hinweis auf iPhone/iPad, Tastatur-Diktat |
| `40-header` | Kopfzeile auf allen Bildschirmbreiten |
| `45-update` | Updates kommen trotz HTTP-Cache (wie GitHub Pages) sofort an; Offline-Start |
| `50-virtual` | Virtueller Dongle, PDF, Einsatz beenden *(Datenbank)* |
| `60-sync` | Konto, Synchronisation, Teams, Offline-Änderungen *(Datenbank)* |
| `70-admin-ui` | Administration in der App *(Datenbank)* |
| `80-catalog` | Medikamente & Krankheiten: Vorschlag, Freigabe, CSV-Import, Suche im Protokoll *(Datenbank)* |
| `90-db-rls`, `91-db-admin`, `92-db-catalog` | Zugriffsregeln der Datenbank direkt über die API *(Datenbank)* |

## Eigene Tests schreiben

Eine Testreihe ist eine Datei `suites/NN-name.test.mjs`:

```js
import { newDevice, login } from '../lib/harness.mjs';

export const needsCloud = true;        // weglassen, wenn keine Datenbank nötig ist
export const title = 'Kurzbeschreibung';

export default async function (t) {
  const p = await newDevice(t, { cloud: true, ble: true });   // eigener Browser-Kontext
  await login(p, t.config.adminEmail);
  t.ok(await p.isVisible('#adminCard'), 'Admin sieht die Administration');
}
```

Hilfsfunktionen stehen in `lib/harness.mjs`, u. a. `newDevice`, `login`, `waitSynced`, `sentText`, `serviceClient`, `userId` und `uniq`. Testdaten bekommen über `uniq()` einen eindeutigen Zusatz, so können Tests mehrfach gegen dieselbe Datenbank laufen.
