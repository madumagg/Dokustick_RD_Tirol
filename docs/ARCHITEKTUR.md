# ProtoPilot – Architektur

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
| `protocols.js` | Protokollvorlagen: Knopf 📋 im Schreiben-Reiter, Auswahl, Editor |
| `spell.js` | Rechtschreibprüfung (Hunspell als WebAssembly, lädt `vendor/hunspell` und `vendor/dict` erst bei Bedarf per `import()`) |
| `catalog.js` | Medikamente-/Krankheiten-Datenbank und Arzneimittellisten 1/2 (Laden, Suche, Vorschlag, Freigabe, CSV-Import) |
| `cloud.js` | Konto, Synchronisation, Teams |
| `support.js` | Support & Feedback: Tickets, Ideen, häufige Fragen, „Was ist neu“ (`NEWS`), Geräteinfos, Abzeichen |
| `themes.js` | Themes: Liste `THEMES`, Freigabe prüfen, `data-skin` am `<html>` setzen, Auswahl in den Einstellungen. Aussehen in `themes.css` |
| `admin.js` | Administration (nur App-Admins), darin die Reiter „Support“ und „Themes“ |
| `virtual.js` | Virtueller Dongle mit PDF-Ausgabe (nur App-Admins); `vendor/jspdf.umd.min.js` wird erst bei Bedarf geladen |
| `sw.js` | Service Worker: Offline-Speicher |

Eine Datei darf Funktionen einer **später** geladenen Datei nur zur Laufzeit aufrufen (in Funktionen oder Event-Handlern), nicht beim Laden. `boot()` läuft erst, wenn alle Skripte geladen sind.

### Konventionen

- Oberflächentexte auf Deutsch mit Umlauten. Code-Kommentare auf Deutsch ohne Umlaute (ae, oe, ue).
- DOM wird mit `el(tag, props, ...kinder)` gebaut. Benutzerinhalte immer als Text einfügen, nie als HTML.
- `el()` lässt `null` als Kind weg, die eingebauten `replaceChildren`/`append`/`before`/`after` aber **nicht**: Sie schreiben „null“ als Text in die Seite. Können dort leere Einträge vorkommen (`bedingung ? el(…) : null`), die Liste mit `kids(…)` einpacken: `box.replaceChildren(...kids(a, b ? c : null))`. Die Tests melden „null“/„undefined“ als Text in jeder Testreihe als Fehler.
- `localStorage` nur über `store.load/save/remove`. Das Präfix `dokustick.` wird automatisch ergänzt, und Fehler (privater Modus) werden abgefangen.
- Farben nur über die CSS-Variablen in `:root` (heller und dunkler Modus). Themes überschreiben diese Variablen in `themes.css` unter `[data-skin="…"]`.
- **Neues Theme:** Eintrag in `THEMES` (`themes.js`) und ein Block `[data-skin="<id>"]` in `themes.css`, für hell und dunkel. Die ID nur aus Kleinbuchstaben, Ziffern und `-`. Es ist dann zuerst nur für App-Admins sichtbar und wird in der Administration unter „Themes“ freigegeben.

## Daten: wo liegt was?

### Gerät (localStorage, Präfix `dokustick.`)

| Schlüssel | Inhalt |
|---|---|
| `settings` | Einstellungen: `{ delay, lang, voiceCmds, replacements, blankLine, theme, skin, defaultProtocol, spellcheck, dictionary }`. `theme` (hell/dunkel) und `skin` (Theme) gelten nur auf diesem Gerät und werden nicht synchronisiert. |
| `local.items` | Bausteine ohne Konto |
| `account` | angemeldetes Konto `{ id, email }` |
| `u.<userId>.items` | Bausteine des Kontos (lokale Kopie, inklusive noch nicht hochgeladener Änderungen!) |
| `u.<userId>.teams` | Teams des Kontos `[{ id, name, role }]` |
| `u.<userId>.settingsDirty` | Einstellungen noch nicht hochgeladen |
| `u.<userId>.lastSync` | Zeitpunkt der letzten Synchronisation |
| `u.<userId>.catalog` | Medikamente/Krankheiten und Arzneimittellisten für die Offline-Suche (`med`, `dx`, `al1`, `al2`, `available`, `listsAvailable`) |
| `appInfo` | Registrierungsregeln, Hinweis an alle, Admin-Status, freigegebene Themes (`app_info()`) |
| `announceSeen` | zuletzt ausgeblendeter Hinweis |
| `lostSession` | `{ id, email, pending }`, wenn die Anmeldung ungültig wurde, ohne dass man sich abgemeldet hat |
| `newsSeen` | Version, bis zu der „Was ist neu“ gelesen ist |
| `supportFaq` | häufige Fragen für offline |
| `auth` | Supabase-Sitzung (von supabase-js verwaltet) |

In `sessionStorage` liegen `dokustick.doc` (das Protokoll, bleibt beim Neuladen erhalten und wird beim Schließen des Tabs verworfen) und `dokustick.tab` (zuletzt offener Reiter).

### Baustein (Eintrag in `items`)

```js
{ id,            // UUID, auch offline erzeugt (crypto.randomUUID)
  kind,          // 'module', 'form' (frühere Formulare; werden wie Bausteine angezeigt) oder 'protocol'
  title, category, body,   // body enthält Text und Felder, siehe unten
  team_id,       // null = eigener Eintrag
  sort, deleted, updated_at,
  dirty }        // > 0: lokale Änderung noch nicht hochgeladen (nur lokal)
```

**Protokollvorlagen** (`kind: 'protocol'`): `body` ist JSON `{"items": ["<Baustein-ID>", …]}` in Reihenfolge. Eingefügt wird die jeweils aktuelle Fassung der Bausteine. `listItems()` liefert Vorlagen nur mit `listItems('protocol')`. Welche Vorlage der Knopf 📋 einfügt, steht in `settings.defaultProtocol` (sonst die erste eigene, dann die erste aus dem Standard-Bereich). Team- und Standard-Vorlagen dürfen nur Bausteine enthalten, die dort alle sehen (`protocols.allowedFor`). Beim Import einer Sicherung werden die IDs neu vergeben und die Verweise umgestellt.

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
| `{{Name:@al1}}` / `{{Name:@al2}}` | Medikamente aus Arzneimittelliste 1 / 2 als Knöpfe (Liste, „keine“ immer dabei) |
| `{{Name:@kb1}}` / `{{Name:@kb2}}` | Krankheitsbild aus Arzneimittelliste 1 / 2 als Knöpfe (ein Wert) |
| `{{Name?:=Summe}}` | Summe der Punkte aller gewählten Optionen im Baustein (`scoreSum`); Punkte stehen in der Option als „(4 Punkte)“, „(1 Punkt)“, „(2 Pkt.)“. Erst gefüllt, wenn jedes Feld mit Punkten gewählt ist. Das `?` lässt ältere App-Versionen das Feld als leere optionale Auswahl behandeln. |

Sondertasten im Text: `{TAB}`, `{SHIFT+TAB}`, `{ENTER}`, `{PAUSE}`, `{PAUSE:ms}`, `{DATUM}`, `{ZEIT}`, Pfeiltasten usw. (`KEYS` in `app.js`).

**Reihenfolge im Editor:** `splitPieces()` zerlegt einen Baustein in Abschnitte (getrennt an Zeilenumbruch, `, `, `; ` und `. ` vor Großbuchstaben, nie in Feldern). `joinPieces()` setzt sie mit den Trennzeichen an ihren ursprünglichen Positionen wieder zusammen. Für jede Vorlage gilt `joinPieces(splitPieces(x)) === x`. Direkt aneinanderklebende Felder (`}}{{`) trennt `splitPieces` mit leerem Trennzeichen, ein Feld vor einer neuen Beschriftung (`{{Lagerung}} E – Exposure: {{…}}`) mit Leerzeichen. Hinter einem Feld ist `. ` immer ein Satzende. Beim Umsortieren wählt `stableSeps()` die Trennzeichen so, dass beim nächsten Zerlegen dieselbe Zahl Abschnitte herauskommt: Aus leeren Trennzeichen und Leerzeichen wird `, `, ebenso aus einem Satzende, das weder hinter einem Feld noch vor einem Großbuchstaben steht. Sonst würden zwei Abschnitte verschmelzen. „＋ Feld“ und „Fester Text“ fügen bei Cursor ganz am Anfang (Textfeld noch nicht angetippt) am Ende vor dem Schlusspunkt ein.

Regeln beim Ausfüllen (`fillTemplate` in `compose.js`):
- **Leere Felder:** Abschnitte (getrennt durch `, `, `: `, Satzende), deren Felder alle leer sind, fallen weg.
- **Beschriftung mit Doppelpunkt** (`dropLabelled`): Steht vor dem leeren Feld `Beschriftung: ` und beginnt die Beschriftung mit `, ` oder in einer neuen Zeile, fällt sie mit weg. Beschriftung = letzte Zeile vor dem `: `, höchstens 4 Wörter/40 Zeichen, ohne `.!?:;`. Steht hinter dem Feld noch Text in einer neuen Zeile, bleibt alles wie bisher.
- **Doppelter Punkt:** Endet ein Wert mit `.` (z. B. „Aspro Classic 320 mg p.o.“) und folgt im Baustein ein `.`, bleibt nur einer.
- **Ausschließende Optionen:** Optionen, die mit „kein“ oder „unbekannt“ beginnen, heben bei Mehrfachauswahl die anderen auf (`isExclusive`).

**Arzneimittellisten in Bausteinen** (`DRUG_FIELDS`, `drugContext` in `compose.js`): `renderFieldInput` zeigt `al`/`kb`-Felder als Mehrfach- bzw. Einfachauswahl, die Optionen kommen bei jedem Zeichnen aus `catalog.drugNames()`/`catalog.indications()` (freigegebene und eigene Einträge). Medikament und Krankheitsbild derselben Liste im selben Baustein kennen sich über die Feldliste (`fields`): Ein Medikament mit genau einem Krankheitsbild belegt das leere Krankheitsbild vor, passende Optionen bekommen die Klasse `hint`, unter den Medikamenten stehen Dosierung und Hinweise (`.drug-info`). Nach jeder Änderung schickt `renderModuleBlock` ein `refresh`-Ereignis an alle `[data-dyn]`-Felder.

**Achtung:** Diese Syntax steht so in der Datenbank. Eine neue Syntax braucht eine Umwandlung der vorhandenen Bausteine (beim Laden in `loadItems()` oder per Datenbank-Migration).

### Protokoll (`doc`)

Liste von Blöcken: `{ id, type: 'text', text, pinned? }` oder `{ id, type: 'module', title, tpl, values }`. `pinned: true` hat der Freitext eines neuen Protokolls: Er bleibt oben (`keepPinnedOnTop` nach jedem Verschieben), neue Blöcke kommen ans Ende (`insertBlocks`). Verschiebt man ihn selbst, wird `pinned` entfernt; ältere Protokolle ohne `pinned` verhalten sich wie früher. `tpl` ist eine **Kopie** des Baustein-Texts zum Zeitpunkt des Hinzufügens. Spätere Änderungen am Baustein wirken sich also nicht auf ein laufendes Protokoll aus.

## Synchronisation (`cloud.js`)

Die App arbeitet immer mit der lokalen Kopie. `cloud.sync()` läuft bei Änderungen (verzögert), beim Wiederkehren des Netzes, beim Zurückholen der App in den Vordergrund und alle 2 Minuten:

1. **Hochladen:** jeden Eintrag mit `dirty > 0` per `upsert` hochladen. Löschen = `deleted: true`. Bei fehlender Berechtigung (`42501`) wird die lokale Änderung verworfen.
2. **Teams, Einträge, Einstellungen, App-Info und Datenbank** vollständig neu laden. Lokale Einträge mit `dirty` haben Vorrang vor dem Serverstand.

Beim Abmelden werden alle `u.<userId>.*`-Schlüssel vom Gerät entfernt. **Ausnahme:** Wird die Anmeldung ungültig, ohne dass man selbst abgemeldet hat (`SIGNED_OUT` von supabase-js, z. B. abgelaufen oder nach einem Serverwechsel), bleiben sie erhalten (`cloud.sessionLost()`). Meldet man sich mit demselben Konto wieder an, werden offene Änderungen hochgeladen. Bei einem anderen Konto werden sie nach Rückfrage verworfen.

Nach jedem `loadInfo()` holt `support.poll()` die Zahlen für die Abzeichen (`support_counts`) und die eigenen Tickets, höchstens stündlich auch die häufigen Fragen. Fehler dort (z. B. fehlende Migration) stören die Synchronisation nicht.

## Supabase

Schema als Migrationen in `supabase/migrations/` (Reihenfolge = Dateiname):

| Migration | Inhalt |
|---|---|
| `…_schema.sql` | `items`, `teams`, `team_members`, `team_invites`, `user_settings`; Funktionen `create_team`, `join_team`, `new_team_code` |
| `…_admin.sql` | `app_admins`, `app_settings`; `app_info`, `admin_*`-Funktionen; Trigger auf `auth.users` (Registrierungsregeln, Standard-Team) |
| `…_catalog.sql` | `medications`, `diagnoses`; `admin_import_catalog` |
| `…_diagnoses_beschreibung.sql` | `diagnoses.abbreviation` fasst jetzt Abkürzung **und/oder Beschreibung** (bis 300 Zeichen). Der Spaltenname bleibt aus Kompatibilitätsgründen. |
| `…_standard_vorlagen.sql` | Standard-Bereich: `teams.is_standard` (genau ein Team „Standard“ ohne Mitglieder), `app_info().standard_team`; `items.kind` erlaubt `'protocol'`; Admin-Funktionen behandeln den Standard-Bereich nicht als Team |
| `…_support.sql` | `support_tickets`, `support_messages` (`internal`, `system`), `support_reads`, `support_votes`, `support_faq`; Funktionen `support_*` (Benutzer) und `admin_ticket_*`, `admin_reply`, `admin_tickets` |
| `…_name_protopilot.sql` | Häufige Fragen mit dem neuen Namen ProtoPilot |
| `…_themes.sql` | `theme_settings` (Freigabe je Theme: `admins` oder `all`), `theme_unlocks` (einzelne Benutzer); `my_themes()`, `app_info().themes`, `admin_themes`, `admin_theme_release`, `admin_theme_unlock`, `admin_theme_lock` |
| `…_arzneimittellisten.sql` | `drug_list_entries` (`list` 1/2, `name`, `indication`, `ingredient`, `dose`, `note`; eindeutig je Liste + Name + Krankheitsbild), Regeln wie `medications`; `admin_import_catalog` kennt zusätzlich `al1`/`al2`; Startdaten aus der Arzneimittelliste RD Tirol 2022. Fehlt die Tabelle, setzt die App nur `catalog.listsAvailable = false`, Medikamente und Krankheiten laufen weiter. |

Alle Tabellen haben **Row Level Security**. Kurzfassung:
- **Eigene Einträge:** sieht und ändert nur der Besitzer.
- **Teams:** Team-Einträge sehen die Mitglieder, ändern dürfen nur die Team-Admins.
- **Beitrittscode:** sehen nur die Team-Admins.
- **Admin-Funktionen** prüfen selbst `require_superadmin()`.
- **Medikamente und Krankheiten:** freigegebene Einträge sind für alle sichtbar, Vorschläge nur für den Ersteller und die App-Admins.
- **Support:** Tickets, Nachrichten, Lesestand und Stimmen haben **keine** Tabellenrechte, nur die `security definer`-Funktionen greifen zu. Sie prüfen Ersteller oder App-Admin (`support_get`). Interne Notizen und E-Mail-Adressen liefern sie nur an App-Admins, Ideen (`support_ideas`) nur mit Titel, Ideen-Text und Stimmen. Ist ein Ticket jemand anderem zugewiesen, verweigern `admin_reply` und `admin_ticket_assign` ohne `p_force` mit Fehlercode `DS409`; die App fragt dann nach. Häufige Fragen: lesen alle (auch `anon`), schreiben nur App-Admins (RLS).
- **Themes:** `theme_settings` und `theme_unlocks` haben keine Tabellenrechte, nur die Funktionen greifen zu. `app_info().themes` nennt die für den Aufrufer freigegebenen Themes (für alle freigegebene auch ohne Anmeldung). App-Admins dürfen in der App alle Themes verwenden. Ohne Eintrag in `theme_settings` gilt ein Theme als „nur Admins“.
- **Standard-Bereich:** Einträge mit `team_id` = Standard-Team sehen alle angemeldeten Benutzer, anlegen und ändern dürfen nur App-Admins. In der App ist es ein Pseudo-Team: `cloud.isStandard()`, `cloud.isAdmin()` (für App-Admins wahr), `cloud.adminTargets()` für „Speichern in“. Ältere App-Versionen behandeln Standard-Einträge wie fremde Team-Einträge.

### Regeln für Datenbank-Änderungen

1. **Nie eine bereits eingespielte Migration ändern.** Jede Änderung ist eine **neue** Datei `supabase/migrations/<JJJJMMTTHHMMSS>_<name>.sql`.
2. **Abwärtskompatibel ändern.** Auf den Handys laufen teils noch ältere App-Versionen (Offline-Speicher). Neue Spalten mit Standardwert hinzufügen, alte erst entfernen, wenn keine App sie mehr nutzt. Spalten nicht umbenennen, sondern neue anlegen, Daten kopieren und die alte später entfernen.
3. **Erst lokal testen** (`npm run db:reset` + `npm test`, siehe `tests/README.md`), dann in der echten Datenbank im Supabase-SQL-Editor ausführen.
4. **Supabase-Eigenheiten:**
   - `UPDATE`/`DELETE` ohne `WHERE` ist verboten (pg_safeupdate). Auch bei Ein-Zeilen-Tabellen `where id` schreiben.
   - `auth.users.banned_until` niemals auf `'infinity'` setzen, das kann der Login-Dienst nicht lesen (Fehler „Database error querying schema“).
   - Funktionen mit `security definer` immer mit `set search_path = ''` und voll qualifizierten Namen (`public.…`).
   - Neue Tabellen: RLS einschalten, `anon` alle Rechte entziehen, nur nötige Rechte an `authenticated` geben.

## Eigener Server (`server/`)

Alternative zu supabase.co und GitHub Pages, Anleitung in [`server/README.md`](../server/README.md). Docker Compose mit:
- PostgreSQL 17 (`supabase/postgres`)
- GoTrue für die Anmeldung
- PostgREST als Daten-API
- Caddy

Es sind dieselben Image-Versionen wie bei der Supabase-CLI. Caddy liefert die App direkt aus dem Repository aus, `/config.js` aus `server/generated/`. `/auth/v1` und `/rest/v1` leitet Caddy an GoTrue und PostgREST weiter, mit CORS für die alte Adresse. Kong, Realtime und Storage entfallen, Studio startet nur bei Bedarf (`--profile admin`).

`migrate.sh` spielt Migrationen ein und führt Buch in `supabase_migrations.schema_migrations`. `update.sh` holt `main` alle 5 Minuten. Nach dem Umzug läuft eine neue Migration also kurz nach dem Push auf dem Server, nicht erst nach Handarbeit im SQL-Editor.

Daten-Export und -Import (`data-export.sh`, `data-import.sh`) arbeiten mit JSON je Zeile und übernehmen nur gemeinsame Spalten. Damit funktionieren derselbe Weg für Backups und der Umzug von supabase.co.

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
- **Version erhöhen:** Vor jeder Veröffentlichung im Projektordner `tools/version.sh` ausführen (z. B. 0.18 → 0.19). Das ändert `sw.js`, `app.js` und die `?v=`-Adressen der Skripte und Stylesheets in `index.html`. Ohne neue Version laden Geräte mit Offline-Speicher das Update nicht zuverlässig.
- **Offline-Speicher:** Der Service Worker lädt online immer zuerst vom Netz (`cache: 'no-cache'`) und greift nur offline oder nach 4 s auf den Speicher zurück.
- **Wörterbuch:** Hunspell und die Wörterbücher (ca. 2 MB, `DICT_FILES` in `sw.js`) liegen in einem eigenen Speicher `DICT_CACHE`, der App-Updates überdauert und zuerst gefragt wird. Bei neuen Wörterbuch- oder Hunspell-Dateien `DICT_CACHE` hochzählen.
- **Neue Dateien:** zusätzlich in `FILES` in `sw.js` eintragen, sonst fehlen sie offline.
- **Was ist neu:** Neuerungen für Benutzer als Eintrag in `NEWS` (oben in `support.js`) ergänzen. Der Hinweis nach dem Update zeigt alle Einträge, die neuer als `newsSeen` und nicht neuer als `APP_VERSION` sind.

## Bekannte Stolperfallen

- **Knöpfe in `<label>`:** Werden sie beim Klick neu gezeichnet, löst der Browser einen zweiten Klick aus. Für Knopfgruppen deshalb `div.field` statt `field()` verwenden (siehe Feld-Editor).
- **iOS:** Safari kann kein Web Bluetooth, auf iPhone/iPad läuft die App in **Bluefy**. iPadOS meldet sich als Mac (`IS_IOS` in `app.js`).
- **Web Bluetooth und Diktat** funktionieren nur über https oder `localhost`.
- **Mehrere Supabase-Clients:** Die App nutzt `storageKey: 'dokustick.auth'`.
- **Supabase liefert höchstens 1000 Zeilen pro Abfrage** (`max_rows`). Größere Listen seitenweise laden, siehe `catalog.fetchAll()`.
- **Neue Einstellungen:** Ältere App-Versionen laden beim Speichern der Einstellungen nur ihre eigenen Schlüssel hoch (`SYNCED_SETTINGS`) und überschreiben damit neuere Schlüssel. Neue Einstellungen deshalb immer mit sinnvollem Standardwert behandeln.
- **Globale Namen:** Alle Skripte teilen sich einen Gültigkeitsbereich. Ein zweites `const` mit demselben Namen in einer anderen Datei (z. B. `fmtDate` aus `admin.js`) bricht das spätere Skript komplett ab. Vor neuen globalen Namen kurz suchen.
- **Supabase-Sicherheitsprüfung (Advisors):** Meldet absichtlich so gebaute Stellen. *RLS ohne Policy* bei `app_admins`, `app_settings` und `support_*`: Diese Tabellen sind gesperrt, Zugriff nur über Funktionen. *Security-Definer-Funktion für authenticated ausführbar* bei allen `admin_*`/`support_*`-Funktionen: Sie prüfen selbst, wer aufruft. Rechte dort **nicht** entziehen, sonst geht die App nicht mehr. `app_info()` darf auch `anon` aufrufen (Anmeldeseite).
