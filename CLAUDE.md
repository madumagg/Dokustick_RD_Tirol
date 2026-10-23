# DokuStick – Hinweise für Claude Code

Dokumentationshilfe für den Rettungsdienst: Eine Web-App (Handy/iPad) schickt Text per Bluetooth an einen nRF52840-Dongle, der ihn als USB-Tastatur am Zielgerät eintippt. Konto, Teams und Datenbanken über Supabase.

**Zuerst lesen:** [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md). Dort stehen Aufbau, Datenmodell, Synchronisation, Datenbank-Regeln, Bluetooth-Protokoll und bekannte Stolperfallen.

## Arbeitsweise im Team

- **Wir sind mehrere** (zwei Personen, jeweils mit eigener Claude-Instanz). Vor jeder Arbeit `git pull` ausführen. Vor dem Pushen erneut holen und bei Bedarf rebasen.
- **`main` ist sofort live** (GitHub Pages, ca. 30–60 s). Größere Änderungen auf einem eigenen Branch entwickeln und erst getestet nach `main` übernehmen.
- **Benutzersprache ist Deutsch:** Antworten, Oberflächentexte, Commit-Nachrichten und Dokumentation auf Deutsch.

## Vor jedem Push

1. **Tests:** `cd tests && npm run db:start && npm test`. Alles muss grün sein. Ohne Docker mindestens `npm run test:offline`.
2. **Bei Änderungen an `webapp/`:** `tools/version.sh` ausführen (z. B. 0.18 → 0.19), sonst kommt das Update auf Geräten mit Offline-Speicher nicht zuverlässig an. Neue Dateien zusätzlich in `FILES` in `webapp/sw.js` eintragen.
3. **Neue Funktionen** bekommen eine Testreihe in `tests/suites/` (siehe `tests/README.md`).
4. **Anleitung aktualisieren:** `README.md` für Benutzer, `docs/ARCHITEKTUR.md` für Entwickler.

## Datenbank (Supabase)

- **Echte Datenbank:** Projekt `kplefdmhbnztaelsslka` (siehe `webapp/config.js`). Dort **niemals testen** und keine Änderungen ausprobieren. Die Tests verweigern selbst den Start gegen supabase.co.
- **Neue Migration:** Jede Schemaänderung ist eine **neue** Datei in `supabase/migrations/`. Bestehende Migrationen nie ändern, sie sind in der echten Datenbank bereits eingespielt.
- **Abwärtskompatibel:** Ältere App-Versionen laufen auf Geräten weiter (Offline-Speicher). Keine Spalten umbenennen oder löschen, ohne dass die App vorher umgestellt ist.
- **Einspielen in die echte Datenbank** macht ein Mensch im Supabase-SQL-Editor. Sag nach einer neuen Migration klar dazu, dass sie dort ausgeführt werden muss.
- **Geheim:** Der `service_role`-/Secret-Key gehört nie ins Repository. Im Code steht nur der öffentliche publishable/anon-Key.

## Nicht ohne Rücksprache ändern

- **Feld-Syntax in Bausteinen** (`{{Name+?:a|b}}`, `@med`, `@dx`): Sie steht so in der Datenbank. Eine Änderung braucht eine Umwandlung bestehender Daten.
- **Speicherformat in localStorage** (`dokustick.u.<id>.items` usw.): Dort liegen eventuell noch nicht hochgeladene Änderungen der Benutzer. Formatwechsel nur mit Umwandlung in `loadItems()`.
- **Bluetooth-Protokoll / Firmware** (`firmware/`): Eine Änderung erfordert neue Firmware auf jedem Dongle. Nur erweitern, nichts Bestehendes ändern.
- **Medizinische Inhalte** (Vorlagen, Medikamente, Optionen): fachlich prüfen lassen, keine Medikamentenlisten erfinden.

## Code-Konventionen

- Vanilla JavaScript ohne Build-Schritt. Klassische Skripte mit gemeinsamem globalen Bereich, Ladereihenfolge siehe `docs/ARCHITEKTUR.md`.
- DOM mit `el(...)` bauen, Benutzerinhalte nie als HTML einfügen. Speicherzugriff nur über `store`.
- Kommentare auf Deutsch ohne Umlaute, Oberflächentexte mit Umlauten.
- Firmware: Zephyr 3.7, Boards `nrf52840dongle/nrf52840` und `nrf52840_mdk_usb_dongle/nrf52840`. Bauen siehe `README.md`.
