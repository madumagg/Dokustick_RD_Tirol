# DokuStick – Architektur

Überblick für Entwickler: wie die Teile zusammenhängen, wo welche Daten liegen und worauf man bei Änderungen achten muss.

```
┌──────────── Handy / Tablet ────────────┐        ┌──────── Supabase (Frankfurt) ────────┐
│ Web-App (webapp/, GitHub Pages)        │ HTTPS  │ Auth (E-Mail + Passwort)             │
│  · Protokoll, Bausteine, Datenbank     │◀──────▶│ Postgres + Row Level Security        │
│  · Offline-Speicher (Service Worker)   │        │ Tabellen: items, teams, medications… │
│  · localStorage = lokale Kopie         │        └──────────────────────────────────────┘
└──────────────┬─────────────────────────┘
               │ Bluetooth LE (Web Bluetooth)
┌──────────────▼─────────────────────────┐
│ Dongle nRF52840 (firmware/, Zephyr)    │ USB-HID  ┌──────────────────┐
│  · empfängt Text, tippt als Tastatur   │─────────▶│ Zielgerät (NIDA…) │
└────────────────────────────────────────┘          └──────────────────┘
```

## Web-App

Reines HTML/CSS/JavaScript **ohne Build-Schritt**. Die Skripte sind klassische `<script>`-Dateien und teilen sich den globalen Gültigkeitsbereich. Sie werden in dieser Reihenfolge geladen (`index.html`):

| Datei | Inhalt |
|---|---|
| `config.js` | Supabase-URL und öffentlicher Schlüssel (`window.DOKUSTICK_CONFIG`) |
| `vendor/supabase.js` | supabase-js 2.117.2 (lokal, damit die App offline startet) |
| `app.js` | Grundlagen: Hilfsfunktionen (`el`, `store`, `toast`, `openDialog`), Datenmodell der Bausteine, Text-Kodierung, Bluetooth, Diktat, Bausteine-Liste, Einstellungen, `boot()` |
| `compose.js` | Feld-Syntax, Vorlagen, Protokoll im Schreiben-Fenster, Feld-Editor, Pflichtfeld-Prüfung, Verschieben per Ziehen |
| `catalog.js` | Medikamente-/Krankheiten-Datenbank (Laden, Suche, Vorschlag, Freigabe, CSV-Import) |
| `cloud.js` | Konto, Synchronisation, Teams |
| `admin.js` | Administration (nur App-Admins) |
| `virtual.js` | Virtueller Dongle mit PDF-Ausgabe (nur App-Admins); `vendor/jspdf.umd.min.js` wird erst bei Bedarf geladen |
| `sw.js` | Service Worker: Offline-Speicher |

Eine Datei darf Funktionen einer **später** geladenen Datei nur zur Laufzeit aufrufen (in Funktionen oder Event-Handlern), nicht beim Laden. `boot()` läuft erst, wenn alle Skripte geladen sind.

### Konventionen

- Oberflächentexte auf Deutsch mit Umlauten. Code-Kommentare auf Deutsch ohne Umlaute (ae, oe, ue).
- DOM wird mit `el(tag, props, ...kinder)` gebaut. Benutzerinhalte immer als Text einfügen, nie als HTML.
- `localStorage` nur über `store.load/save/remove`. Das Präfix `dokustick.` wird automatisch ergänzt, und Fehler (privater Modus) werden abgefangen.
- Farben nur über die CSS-Variablen in `:root` (heller und dunkler Modus).

## Daten: wo liegt was?

### Gerät (localStorage, Präfix `dokustick.`)

| Schlüssel | Inhalt |
|---|---|
| `settings` | Einstellungen: `{ delay, lang, voiceCmds, replacements, blankLine, theme }` |
| `local.items` | Bausteine ohne Konto |
| `account` | angemeldetes Konto `{ id, email }` |
| `u.<userId>.items` | Bausteine des Kontos (lokale Kopie, inklusive noch nicht hochgeladener Änderungen!) |
| `u.<userId>.teams` | Teams des Kontos `[{ id, name, role }]` |
| `u.<userId>.settingsDirty` | Einstellungen noch nicht hochgeladen |
| `u.<userId>.lastSync` | Zeitpunkt der letzten Synchronisation |
| `u.<userId>.catalog` | Medikamente/Krankheiten für die Offline-Suche |
| `appInfo` | Registrierungsregeln, Hinweis an alle, Admin-Status (`app_info()`) |
| `announceSeen` | zuletzt ausgeblendeter Hinweis |
| `auth` | Supabase-Sitzung (von supabase-js verwaltet) |

In `sessionStorage` liegen `dokustick.doc` (das Protokoll, bleibt beim Neuladen erhalten und wird beim Schließen des Tabs verworfen) und `dokustick.tab` (zuletzt offener Reiter).

### Baustein (Eintrag in `items`)

```js
{ id,            // UUID, auch offline erzeugt (crypto.randomUUID)
  kind,          // 'module' oder 'form' (frühere Formulare; werden wie Bausteine angezeigt)
  title, category, body,   // body enthält Text und Felder, siehe unten
  team_id,       // null = eigener Eintrag
  sort, deleted, updated_at,
  dirty }        // > 0: lokale Änderung noch nicht hochgeladen (nur lokal)
```

### Feld-Syntax in `body`

| Syntax | Feld |
|---|---|
| `{{Name}}` | Text |
| `{{Name:#}}` | Zahl |
| `{{Name:a\|b\|c}}` | Einfachauswahl |
| `{{Name+:a\|b\|c}}` | Mehrfachauswahl |
| `*a` | Vorauswahl |
| `{{Name?…}}` | optional (sonst Pflichtfeld) |
| `{{Name:@med}}` / `{{Name:@dx}}` | Suche in Medikamenten / Krankheiten (Liste) |

Sondertasten im Text: `{TAB}`, `{SHIFT+TAB}`, `{ENTER}`, `{PAUSE}`, `{PAUSE:ms}`, `{DATUM}`, `{ZEIT}`, Pfeiltasten usw. (`KEYS` in `app.js`).

Regeln beim Ausfüllen (`fillTemplate` in `compose.js`):
- **Leere Felder:** Abschnitte (getrennt durch `, `, `: `, Satzende), deren Felder alle leer sind, fallen weg.
- **Ausschließende Optionen:** Optionen, die mit „kein“ oder „unbekannt“ beginnen, heben bei Mehrfachauswahl die anderen auf (`isExclusive`).

**Achtung:** Diese Syntax steht so in der Datenbank. Eine neue Syntax braucht eine Umwandlung der vorhandenen Bausteine (beim Laden in `loadItems()` oder per Datenbank-Migration).

### Protokoll (`doc`)

Liste von Blöcken: `{ id, type: 'text', text }` oder `{ id, type: 'module', title, tpl, values }`. `tpl` ist eine **Kopie** des Baustein-Texts zum Zeitpunkt des Hinzufügens. Spätere Änderungen am Baustein wirken sich also nicht auf ein laufendes Protokoll aus.

## Synchronisation (`cloud.js`)

Die App arbeitet immer mit der lokalen Kopie. `cloud.sync()` läuft bei Änderungen (verzögert), beim Wiederkehren des Netzes, beim Zurückholen der App in den Vordergrund und alle 2 Minuten:

1. **Hochladen:** jeden Eintrag mit `dirty > 0` per `upsert` hochladen. Löschen = `deleted: true`. Bei fehlender Berechtigung (`42501`) wird die lokale Änderung verworfen.
2. **Teams, Einträge, Einstellungen, App-Info und Datenbank** vollständig neu laden. Lokale Einträge mit `dirty` haben Vorrang vor dem Serverstand.

Beim Abmelden werden alle `u.<userId>.*`-Schlüssel vom Gerät entfernt.

## Supabase

Schema als Migrationen in `supabase/migrations/` (Reihenfolge = Dateiname):

| Migration | Inhalt |
|---|---|
| `…_schema.sql` | `items`, `teams`, `team_members`, `team_invites`, `user_settings`; Funktionen `create_team`, `join_team`, `new_team_code` |
| `…_admin.sql` | `app_admins`, `app_settings`; `app_info`, `admin_*`-Funktionen; Trigger auf `auth.users` (Registrierungsregeln, Standard-Team) |
| `…_catalog.sql` | `medications`, `diagnoses`; `admin_import_catalog` |
| `…_diagnoses_beschreibung.sql` | `diagnoses.abbreviation` fasst jetzt Abkürzung **und/oder Beschreibung** (bis 300 Zeichen). Der Spaltenname bleibt aus Kompatibilitätsgründen. |

Alle Tabellen haben **Row Level Security**. Kurzfassung:
- **Eigene Einträge:** sieht und ändert nur der Besitzer.
- **Teams:** Team-Einträge sehen die Mitglieder, ändern dürfen nur die Team-Admins.
- **Beitrittscode:** sehen nur die Team-Admins.
- **Admin-Funktionen** prüfen selbst `require_superadmin()`.
- **Medikamente und Krankheiten:** freigegebene Einträge sind für alle sichtbar, Vorschläge nur für den Ersteller und die App-Admins.

### Regeln für Datenbank-Änderungen

1. **Nie eine bereits eingespielte Migration ändern.** Jede Änderung ist eine **neue** Datei `supabase/migrations/<JJJJMMTTHHMMSS>_<name>.sql`.
2. **Abwärtskompatibel ändern.** Auf den Handys laufen teils noch ältere App-Versionen (Offline-Speicher). Neue Spalten mit Standardwert hinzufügen, alte erst entfernen, wenn keine App sie mehr nutzt. Spalten nicht umbenennen, sondern neue anlegen, Daten kopieren und die alte später entfernen.
3. **Erst lokal testen** (`npm run db:reset` + `npm test`, siehe `tests/README.md`), dann in der echten Datenbank im Supabase-SQL-Editor ausführen.
4. **Supabase-Eigenheiten:**
   - `UPDATE`/`DELETE` ohne `WHERE` ist verboten (pg_safeupdate). Auch bei Ein-Zeilen-Tabellen `where id` schreiben.
   - `auth.users.banned_until` niemals auf `'infinity'` setzen, das kann der Login-Dienst nicht lesen (Fehler „Database error querying schema“).
   - Funktionen mit `security definer` immer mit `set search_path = ''` und voll qualifizierten Namen (`public.…`).
   - Neue Tabellen: RLS einschalten, `anon` alle Rechte entziehen, nur nötige Rechte an `authenticated` geben.

## Bluetooth-Protokoll

Service `6e7a0001-4b3c-4f8e-9a1d-5c2b7d0a4e01`:

| Charakteristik | UUID | Inhalt |
|---|---|---|
| Befehl (write, verschlüsselt) | `6e7a0002-…` | `01` + Daten (max. 19 Byte pro Paket) · `02` Abbrechen · `03 <ms>` Tippverzögerung · `04` alle Kopplungen löschen |
| Status (read/notify) | `6e7a0003-…` | Flags (USB, Caps Lock, tippt, koppelbar), wartende Bytes, freie Bytes, Verzögerung, Firmware-Version |

Datenstrom: UTF-8-Text, `00 <mod> <key>` = Taste, `00 FF <n>` = Pause n×10 ms. Zeichen ohne Taste auf der deutschen Tastatur lässt die Firmware weg (`keymap_de.c`). Typografische Zeichen wie „–“ oder „„“ werden auf `-` bzw. `"` abgebildet, ® und ™ entfernt schon die App.

**Achtung:** Änderungen am Protokoll erfordern neue Firmware auf **jedem** Dongle. Möglichst nur erweitern (neue Befehlsnummern), nie bestehende ändern.

## Veröffentlichen

- **`main` ist live:** GitHub Pages veröffentlicht `main` automatisch, nach etwa 30–60 Sekunden ist der Stand online.
- **Version erhöhen:** Vor jeder Veröffentlichung im Projektordner `tools/version.sh` ausführen (z. B. 0.18 → 0.19). Das ändert `sw.js`, `app.js` und die `?v=`-Adressen in `index.html`. Ohne neue Version laden Geräte mit Offline-Speicher das Update nicht zuverlässig.
- **Offline-Speicher:** Der Service Worker lädt online immer zuerst vom Netz (`cache: 'no-cache'`) und greift nur offline oder nach 4 s auf den Speicher zurück.
- **Neue Dateien:** zusätzlich in `FILES` in `sw.js` eintragen, sonst fehlen sie offline.

## Bekannte Stolperfallen

- **Knöpfe in `<label>`:** Werden sie beim Klick neu gezeichnet, löst der Browser einen zweiten Klick aus. Für Knopfgruppen deshalb `div.field` statt `field()` verwenden (siehe Feld-Editor).
- **iOS:** Safari kann kein Web Bluetooth, auf iPhone/iPad läuft die App in **Bluefy**. iPadOS meldet sich als Mac (`IS_IOS` in `app.js`).
- **Web Bluetooth und Diktat** funktionieren nur über https oder `localhost`.
- **Mehrere Supabase-Clients:** Die App nutzt `storageKey: 'dokustick.auth'`.
