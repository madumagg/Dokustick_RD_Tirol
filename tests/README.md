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
| `tests/firmware/run.sh [Pfad]` | Test der deutschen Tastaturbelegung der Firmware (braucht gcc). Der Pfad zeigt auf einen Klon von `rdprotopilot/firmware`, Standard: `../firmware` neben diesem Repository |

Screenshots und die Test-PDF landen in `tests/test-output/` (nicht im Git).

In jeder Testreihe gelten als Fehler: JavaScript-Ausnahmen im Browser und Text „null“ oder „undefined“ in der Seite (meist ein leerer Platzhalter, der an `replaceChildren`/`append` statt an `el()` ging, siehe `docs/ARCHITEKTUR.md`).

**Sicherheit:** Die Tests legen Benutzer an, löschen sie und ändern App-Einstellungen. Zeigt `SUPABASE_URL` nicht auf diesen Rechner (`127.0.0.1`/`localhost`), verweigern sie den Start. Das schützt supabase.co und den eigenen Server. Nur für ein eigenes, leeres **Test-Projekt** lässt sich das mit `ALLOW_REMOTE_TESTS=1` übersteuern.

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
| `12-gcs` | GCS-Vorlage: Summe der Punkte, nur gewählte Optionen im Text, Summenfeld im Feld-Editor |
| `13-reihenfolge` | Baustein-Editor: Abschnitte per Ziehen und Pfeiltasten umsortieren, Zeichensetzung bleibt erhalten |
| `20-drag` | Blöcke verschieben mit Maus, Touch (echte Touch-Ereignisse) und Tastatur |
| `30-ios` | Bluefy-Hinweis auf iPhone/iPad, Tastatur-Diktat |
| `40-header` | Kopfzeile auf allen Bildschirmbreiten |
| `41-name` | Name ProtoPilot, Icons, alte Sticks („DokuStick“) werden weiter erkannt |
| `45-update` | Updates kommen trotz HTTP-Cache (wie GitHub Pages) sofort an; Offline-Start; Wörterbuch bleibt über Updates im Speicher |
| `50-virtual` | Virtueller Dongle, PDF, Einsatz beenden *(Datenbank)* |
| `60-sync` | Konto, Synchronisation, Teams, Offline-Änderungen *(Datenbank)* |
| `62-sitzung` | Abgelaufene Anmeldung (z. B. nach Serverwechsel): nicht hochgeladene Änderungen bleiben, Hinweis mit vorausgefüllter E-Mail, nach erneuter Anmeldung hochgeladen *(Datenbank)* |
| `63-anmeldeseite` | Anmeldeseite ohne Konto (App ausgeblendet, Website-Link, Was ist neu, kein Hinweis an alle), Vorschau (Überblick, Beispiel-Protokoll, Senden zeigt nur Text, nichts gespeichert, lokale Daten unberührt), nach Anmeldung App und Hinweis, ohne Server weiter angemeldet *(Datenbank)* |
| `70-admin-ui` | Administration in der App *(Datenbank)* |
| `75-standard` | Standard-Bausteine: App-Admin pflegt, alle nutzen und kopieren *(Datenbank)* |
| `76-protokolle` | Protokollvorlagen: anlegen, mit 📋 einfügen, Reihenfolge, Import; mit Datenbank zusätzlich Standard-Vorlagen |
| `77-rechtschreibung` | Rechtschreibprüfung: Hinweise, Korrektur, eigenes Wörterbuch, Prüfung vor dem Senden |
| `78-support` | Support & Feedback: Ticket mit Geräteinfos, Abzeichen, Admin-Antwort übernimmt das Ticket, Warnung für zweiten Admin, interne Notizen unsichtbar, Ideen mit 👍, häufige Fragen, „Was ist neu“ nach Updates, Server ohne Migration *(Teile mit Datenbank)* |
| `71-superadmin` | Superadmin: Abzeichen, keine Knöpfe zum Sperren/Entziehen/Löschen für normale Admins, Superadmin ernennt und entfernt Superadmins *(Datenbank)* |
| `79-themes` | Themes: Auswahl nur für App-Admins, Liquid Glass anwenden, Benutzer in der Administration freischalten und wieder entfernen, Freigabe für alle (auch ohne Konto) *(Datenbank)* |
| `80-catalog` | Medikamente & Krankheiten: Vorschlag, Freigabe, CSV-Import, Suche im Protokoll *(Datenbank)* |
| `81-arzneimittellisten` | Arzneimittellisten: Reiter Liste 1/2 nach Krankheitsbild, neuer Eintrag, Vorlagen Venenzugang (Liste 2) und Liste 1, Krankheitsbild vorbelegen und hervorheben, Dosierung/KI-Hinweise, Aufklärung, Server ohne Migration *(Datenbank)* |
| `90-db-rls`, `91-db-admin`, `92-db-catalog`, `93-db-standard`, `94-db-support`, `95-db-themes`, `96-db-arzneimittellisten`, `97-db-superadmin` | Zugriffsregeln der Datenbank direkt über die API *(Datenbank)* |

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

## Gegen den eigenen Server-Aufbau testen

Die Testreihe läuft auch gegen `server/` (eigener Server statt supabase.co), siehe Abschnitt „Für Entwickler“ in [`server/README.md`](../server/README.md).
