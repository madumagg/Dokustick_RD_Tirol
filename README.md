# DokuStick

Selbstgebaute Dokumentationshilfe: Text am Handy schreiben, diktieren oder aus Textbausteinen und Formularen zusammenstellen. Ein kleiner USB-Dongle tippt ihn dann am Zielgerät (z. B. NIDA-Pad, PC) ein, so als wäre er eine Tastatur. Am Zielgerät muss nichts installiert werden.

```
Handy (Web-App)  ──Bluetooth LE──▶  nRF52840 Dongle  ──USB-Tastatur──▶  Zielgerät
```

## Inhalt

| Ordner | Inhalt |
|---|---|
| `firmware/` | Firmware (Zephyr RTOS) für **Makerdiary nRF52840 MDK USB Dongle** und **Nordic nRF52840 Dongle (PCA10059)** |
| `firmware/out/` | Fertig kompilierte Firmware zum Aufspielen |
| `webapp/` | Weboberfläche (als App installierbar, funktioniert offline) |
| `supabase/migrations/` | Datenbank-Schema (Konto, Teams, Administration, Medikamente & Krankheiten) |
| `tests/` | Automatische Tests, siehe [`tests/README.md`](tests/README.md) |
| `docs/ARCHITEKTUR.md` | Technischer Aufbau für Entwickler |

## 1. Firmware aufspielen

Der Bootloader auf dem Dongle bleibt immer erhalten. Du kannst also jederzeit eine neue Version aufspielen.

### Makerdiary nRF52840 MDK USB Dongle (z. B. von GeeekPi)

1. **Taste gedrückt halten** und den Dongle dabei in den PC stecken, dann loslassen.
2. Erscheint ein USB-Laufwerk (z. B. `MDK-DONGLE` oder ähnlich), hat der Dongle den **UF2-Bootloader**:
   - Öffne darauf die Datei `INFO_UF2.TXT` und sieh nach, was bei **SoftDevice** steht:
     - `S140 …` → `firmware/out/dokustick-makerdiary-uf2-s140.uf2` auf das Laufwerk ziehen
     - `not found` → `firmware/out/dokustick-makerdiary-uf2-ohne-softdevice.uf2` auf das Laufwerk ziehen
   - Das Laufwerk verschwindet von selbst, der Dongle startet neu, und die LED blinkt blau.
3. Erscheint **kein** Laufwerk, hat der Dongle den älteren **Nordic Open Bootloader**. Dann gehst du wie beim Nordic-Dongle vor (siehe unten), mit der Datei `firmware/out/dokustick-makerdiary-open-bootloader.hex`.

### Nordic nRF52840 Dongle (PCA10059)

1. **nRF Connect for Desktop** installieren und darin die App **Programmer** installieren.
2. Den Dongle in den PC stecken und die kleine, seitlich angebrachte **RESET-Taste** drücken. Die rote LED pulsiert.
3. Im Programmer das Gerät **„Open DFU Bootloader“** auswählen.
4. **Add file** → `firmware/out/dokustick-nordic-pca10059.hex` → **Write**.

## 2. Weboberfläche bereitstellen

Web Bluetooth funktioniert nur über **https**. Am einfachsten ist **GitHub Pages** (kostenlos):

1. Dieses Projekt in ein GitHub-Repository hochladen.
2. Im Repository unter *Settings → Pages* bei Source „Deploy from a branch“ wählen, Branch `main`, Ordner `/ (root)`.
3. Die App ist dann unter `https://<benutzer>.github.io/<repo>/webapp/` erreichbar.
4. Die Seite am Handy öffnen und im Browser-Menü **„Zum Startbildschirm hinzufügen“** wählen. Danach funktioniert sie wie eine App, auch ohne Internet.

**Browser:**
- **Android:** Chrome
- **iPhone/iPad:** Safari kann kein Web Bluetooth. Nutze dort die kostenlose App **Bluefy** und öffne die Seite darin.
- **Windows/macOS/Linux:** Chrome oder Edge (praktisch zum Testen)

### iPhone & iPad

Safari kann auf iPhone und iPad kein Bluetooth für Webseiten. Deshalb läuft DokuStick dort in der kostenlosen App **[Bluefy – Web BLE Browser](https://apps.apple.com/app/id1492822055)**:

1. Bluefy aus dem App Store installieren.
2. In Bluefy `https://madumagg.github.io/Dokustick_RD_Tirol/` öffnen. Öffnet man die Seite in Safari, zeigt die App beide Schritte mit „Bluefy laden“ und „Link kopieren“ direkt an.
3. **Diktat:** Falls der 🎤-Knopf in Bluefy nicht funktioniert, die Diktierfunktion der Bildschirmtastatur verwenden (Mikrofon-Taste).

**iPad ohne SIM-Karte:** Die Verbindung zum Dongle läuft über Bluetooth und braucht **kein Internet**. Internet über einen Hotspot (z. B. vom Diensthandy) ist nur für die Synchronisierung von Konto und Teams, für das Diktat und zum ersten Laden der Seite nötig. Ohne Internet werden Änderungen an Bausteinen gesammelt und später hochgeladen.

## 3. Erste Schritte

1. Den Dongle am Zielgerät einstecken. Die LED blinkt blau, der Dongle ist koppelbereit.
2. In der App auf **Verbinden** tippen, „DokuStick“ auswählen und die Kopplungsanfrage bestätigen.
3. Am Zielgerät in das gewünschte Textfeld klicken.
4. In der App Text eingeben und auf **Senden** tippen.
5. Einmal unter *Einstellungen* auf **Tastatur-Test senden** tippen und prüfen, ob alles korrekt ankommt.

**Wichtig:** Am Zielgerät muss das Tastaturlayout **Deutsch** eingestellt sein (Deutschland oder Österreich, beide sind identisch).

### Koppeln

- Nach dem Einstecken ist der Dongle **60 s koppelbereit** (LED blinkt blau). Ein kurzer Druck auf die Taste startet ihn neu und öffnet das Fenster erneut.
- Solange noch kein Handy gekoppelt ist, ist er dauerhaft koppelbereit.
- Danach nimmt er nur gekoppelte Handys an, so kann niemand Fremdes Text auf dein Gerät tippen lassen.
- Es werden bis zu 4 Handys gespeichert. Beim fünften wird die älteste Kopplung ersetzt.
- **Alle Kopplungen löschen:** in der App unter *Einstellungen → Dongle*.
- Beim Nordic-Dongle geht das Löschen zusätzlich, indem man die Taste SW1 5 s hält, bis die LED rot leuchtet.

| LED | Bedeutung |
|---|---|
| blau blinkend | koppelbereit |
| grün | verbunden |
| grün flackernd | tippt gerade |
| rot blinkend | Text wartet, aber der Dongle steckt in keinem Zielgerät |
| rot | Kopplungen werden gelöscht |

### Sondertasten in Texten und Formularen

| Platzhalter | Wirkung |
|---|---|
| `{TAB}` / `{SHIFT+TAB}` | nächstes / vorheriges Feld |
| `{ENTER}` | Enter |
| `{PAUSE}` / `{PAUSE:2000}` | 0,5 s bzw. 2000 ms warten |
| `{DATUM}` / `{ZEIT}` | aktuelles Datum / Uhrzeit |
| `{UP}` `{DOWN}` `{LEFT}` `{RIGHT}` `{HOME}` `{END}` `{BACKSPACE}` `{DEL}` `{ESC}` | entsprechende Taste |

### Interaktive Bausteine & Protokoll

Bausteine können **Auswahlfelder** enthalten, z. B. beim ABCDE-Schema:

> A – Atemwege: [frei und gesichert | gefährdet]. Maßnahmen: [keine Maßnahmen erforderlich | Wendltubus | Guedeltubus | …]

- **Ins Protokoll:** Tippt man einen interaktiven Baustein an, landet er im Fenster *Schreiben* als Karte mit Auswahl-Knöpfen. Einfache Bausteine ohne Felder werden wie bisher sofort getippt. ↧ legt jeden Baustein ins Protokoll.
- **Im Protokoll:** Optionen antippen, mit „…“ einen eigenen Wert eingeben. Dazwischen ist Freitext oder Diktat möglich. Blöcke entfernt man mit ✕.
- **Verschieben:** Kopfzeile einer Karte gedrückt halten (Touch, ca. ⅓ s) bzw. mit der Maus anklicken und an die neue Stelle ziehen. Mit dem Griff ⠿ geht es auch sofort, am Bildschirmrand scrollt die Seite mit. Per Tastatur: Griff auswählen und Pfeiltasten drücken.
- **Senden:** „Alles senden“ tippt das ganze Protokoll und lässt es stehen. Zwischen den Blöcken steht automatisch eine Leerzeile (abschaltbar unter *Einstellungen → Tippen*, z. B. für einzeilige Felder). ⟶ an einer Karte sendet nur diesen Block.
- **Einsatz beenden:** Der Knopf ganz unten setzt nach einer Sicherheitsabfrage alle Bausteine im Protokoll zurück und löscht den Freitext. Die gespeicherten Bausteine bleiben erhalten.
- **Pflichtfelder:** Alle Felder sind standardmäßig Pflichtfelder. Fehlende Angaben werden rot markiert („fehlt“, bei Zahlenfeldern mit Text „keine Zahl“), die Karte bekommt einen roten Rand und ein Abzeichen wie „2 fehlen“. Beim Senden erscheint dann die Meldung **„Fehlende Angaben“** mit allen offenen Feldern, und **es wird nichts gesendet**. „Zum ersten fehlenden Feld“ springt direkt dorthin. Freitext wird nicht geprüft.
- **Optionale Felder:** Im Feld-Editor den Haken „Pflichtfeld“ entfernen, z. B. für Werte, die nicht immer gemessen werden. Bleibt ein optionaler Messwert leer, fällt er samt Beschriftung weg: Aus „RR … mmHg, HF 80/min“ wird „HF 80/min“.
- **Mehrfachauswahl:** Optionen, die mit „kein“ beginnen (z. B. „keine Maßnahmen erforderlich“), heben die anderen auf und umgekehrt.
- **Felder anlegen:** Baustein bearbeiten (✎) → **＋ Feld**: Name, Art (Einfachauswahl, Mehrfachauswahl, Text, Zahl), Auswahlmöglichkeiten und Vorauswahl festlegen. Vorhandene Felder antippen, um sie zu ändern.
- **Vorlagen:** *Bausteine → Vorlagen* enthält das ABCDE-Schema (A nach Vorgabe, B–E als anpassbare Vorschläge) sowie Vitalparameter und Schmerz.
- Das Protokoll bleibt beim Neuladen der Seite erhalten und wird beim Schließen des Browser-Tabs verworfen. Es wird nie hochgeladen.

Für Fortgeschrittene, so sieht ein Feld im Text aus:

| Syntax | Feld |
|---|---|
| `{{Name}}` | Textfeld |
| `{{HF:#}}` | Zahlenfeld |
| `{{Haut:rosig\|blass\|zyanotisch}}` | Einfachauswahl |
| `{{Maßnahmen+:keine\|O2-Gabe\|Beatmung}}` | Mehrfachauswahl |
| `*` vor einer Option | Vorauswahl, z. B. `{{Atmung:*unauffällig\|Dyspnoe}}` |
| `?` nach dem Namen | optional, z. B. `{{BZ?:#}}` oder `{{Maßnahmen+?:…}}` |

## 4. Konto & Teams (optional)

Mit einem Konto werden Textbausteine, Formulare und Einstellungen in der Cloud gesichert und auf allen Geräten synchronisiert. In **Teams** (z. B. eine Wache) teilen sich mehrere Personen gemeinsame Bausteine. Admins pflegen sie, alle Mitglieder können sie nutzen. Ohne Konto funktioniert die App wie bisher, dann wird nur lokal gespeichert.

Die Daten liegen bei **Supabase** (kostenloser Tarif, Server in Frankfurt).

### Einmalige Einrichtung

1. Auf https://supabase.com kostenlos registrieren und **New project** anlegen:
   - Name: `dokustick`
   - Region: **Central EU (Frankfurt)**
   - Datenbank-Passwort: ein sicheres Passwort wählen und gut aufheben
2. Links **SQL Editor** → **New query**, den Inhalt von [`supabase/migrations/20261023120000_schema.sql`](supabase/migrations/20261023120000_schema.sql) einfügen und **Run** klicken.
3. **Authentication → URL Configuration**:
   - **Site URL:** `https://madumagg.github.io/Dokustick_RD_Tirol/webapp/`
   - **Redirect URLs:** dieselbe Adresse hinzufügen
4. **Authentication → Sign In / Providers → Email**: „Confirm email“ eingeschaltet lassen und die minimale Passwortlänge auf **8** setzen.
5. **Project Settings → API**: **Project URL** und den **anon public** Key in [`webapp/config.js`](webapp/config.js) eintragen.

Der anon-Key darf öffentlich im Code stehen. Die Daten werden durch die Zugriffsregeln der Datenbank geschützt.

### Bedienung

- **Konto:** *Einstellungen → Konto* → Registrieren, dann den Link in der Bestätigungs-E-Mail öffnen.
- **Erste Anmeldung:** Die App fragt, ob die bisher lokal gespeicherten Bausteine ins Konto übernommen werden sollen.
- **Team erstellen:** *Einstellungen → Teams → Team erstellen*. Du bist dann Admin und bekommst einen 8-stelligen Beitrittscode.
- **Team beitreten:** *Team beitreten* → Code eingeben.
- **Team-Bausteine anlegen** (nur Admins): beim Bearbeiten unter „Speichern in“ das Team auswählen.
  - Team-Bausteine tragen ein Team-Abzeichen.
  - Mitglieder können sie nutzen und mit ⧉ als eigene Kopie speichern, aber nicht ändern.
- **Offline:** Alles funktioniert weiter. Änderungen werden hochgeladen, sobald wieder Internet da ist. Das Wolken-Symbol im Kopf zeigt den Status: grün = synchron, gelb = wartet, rot = Fehler.
- **Abmelden** entfernt die Kontodaten von diesem Gerät. In der Cloud bleiben sie erhalten.

### Gut zu wissen

- Im kostenlosen Supabase-Tarif wird ein Projekt **nach 7 Tagen ohne Nutzung pausiert**. Die App läuft dann lokal weiter, synchronisiert aber nicht mehr. Im Supabase-Dashboard lässt es sich mit einem Klick wieder starten. Bei regelmäßiger Nutzung passiert das nicht.
- Der eingebaute E-Mail-Versand von Supabase schafft nur wenige Mails pro Stunde. Das reicht für eine Wache. Für viele Registrierungen auf einmal unter *Authentication → Emails* einen eigenen SMTP-Server eintragen.
- Will niemand Neues mehr dazukommen, kann man unter *Authentication → Sign In / Providers* „Allow new users to sign up“ ausschalten.
- In Bausteine und Formulare gehören **keine Patientendaten**. Ausgefüllte Formulare und der Editor-Text werden nie hochgeladen.

### Administration

Für App-Admins gibt es unter *Einstellungen → Administration* eine Verwaltung der gesamten App. Einmalig einrichten: Im Supabase **SQL Editor** den Inhalt von [`supabase/migrations/20261023120100_admin.sql`](supabase/migrations/20261023120100_admin.sql) ausführen (nach der Schema-Migration). Der **zuerst registrierte Benutzer** wird dabei automatisch App-Admin.

| Bereich | Funktionen |
|---|---|
| Übersicht | Anzahl Benutzer (aktiv, unbestätigt, gesperrt), Teams, Textbausteine, Formulare |
| Benutzer | suchen, Passwort-Reset senden, sperren/entsperren, zum App-Admin machen, Konto löschen |
| Teams | alle Teams sehen, anlegen, umbenennen, löschen; Mitglieder per E-Mail hinzufügen, entfernen, Rollen ändern; Beitrittscode erneuern |
| Einstellungen | Registrierung offen / nur bestimmte E-Mail-Domains / geschlossen; Standard-Team für neue Benutzer; Hinweis an alle |

**Virtueller Dongle (nur App-Admins):** Beim Verbinden wählbar, auch in Browsern ohne Bluetooth. Er wertet die gesendeten Daten genauso aus wie die Firmware: Zeichen ohne Taste fallen weg, „–“ wird zu „-“. Im Schreiben-Fenster zeigt er an, was getippt würde, und speichert das mit **Als PDF speichern** als Testprotokoll.

Hinweise:
- Gesperrte Benutzer werden sofort abgemeldet und können sich nicht mehr anmelden.
- Löscht man ein Konto, das einziger Admin eines Teams ist, wird automatisch das am längsten dabei befindliche Mitglied Team-Admin.
- Sich selbst kann man weder sperren noch löschen noch die Admin-Rechte entziehen. So bleibt immer mindestens ein App-Admin übrig.

### Datenbank: Medikamente & Krankheiten

Einmalig einrichten: Im Supabase **SQL Editor** den Inhalt von [`supabase/migrations/20261023120200_catalog.sql`](supabase/migrations/20261023120200_catalog.sql) ausführen (nach den anderen beiden).
Für Beschreibungen bei Krankheiten zusätzlich [`supabase/migrations/20261023230000_diagnoses_beschreibung.sql`](supabase/migrations/20261023230000_diagnoses_beschreibung.sql) ausführen.

- **Reiter „Datenbank“:** Medikamente (Handelsname, Wirkstoff, Dosis) und Krankheiten (Name, optional Abkürzung und/oder kurze Beschreibung, bis 300 Zeichen) ansehen und durchsuchen.
- **Vorschlagen:** Jeder angemeldete Benutzer kann neue Einträge vorschlagen. Für einen selbst sind sie sofort nutzbar („wartet auf Freigabe“), für alle anderen erst nach der Freigabe durch einen App-Admin.
- **Doppelte Einträge:** Die App warnt vor ähnlichen Einträgen. Exakte Doppelungen (gleicher Handelsname + Dosis bzw. gleicher Name) lehnt die Datenbank ab.
- **Admins:**
  - Am Reiter zeigt ein rotes Abzeichen die offenen Vorschläge an. Mit „Nur offene Vorschläge“ werden sie gefiltert, mit ✓ freigegeben, mit ✎ bearbeitet, mit 🗑 abgelehnt.
  - Eigene Einträge von Admins sind sofort freigegeben.
  - **CSV importieren:** Medikamente `Handelsname;Wirkstoff;Dosis`, Krankheiten `Name;Abkürzung/Beschreibung`, je eine Zeile pro Eintrag, Kopfzeile optional. Vorhandene Einträge werden übersprungen. Startlisten liegen in [`data/`](data/): 53 Volkskrankheiten und knapp 2900 in Österreich zugelassene Medikamente. Quellen und Regeln stehen in [`data/README.md`](data/README.md).
  - **CSV exportieren:** Speichert alle freigegebenen Einträge im selben Format, z. B. als Sicherung oder zum Weitergeben.
- **In Bausteinen:** Feldart „Medikamente (Datenbank)“ bzw. „Krankheiten (Datenbank)“ (Syntax `{{Dauermedikation:@med}}`, `{{Vorerkrankungen:@dx}}`).
  - Im Protokoll ins Suchfeld tippen. Jedes Wort muss vorkommen, „thrombo 100“ findet also „Thrombo ASS 100 mg“, und auch die Suche nach dem Wirkstoff funktioniert. Den gewünschten Treffer antippen, mehrere sind möglich.
  - Im Text erscheinen nur **Handelsname und Dosis**.
  - „keine“ und „unbekannt“ stehen immer zur Auswahl. Nicht gefundene Einträge lassen sich als Freitext übernehmen oder gleich „in der Datenbank vorschlagen“.
  - Die Listen werden auf dem Gerät gespeichert, die Suche funktioniert also auch offline.
- **Vorlage SAMPLER(R):** *Bausteine → Vorlagen → SAMPLER*. M sucht in den Medikamenten, P in den Krankheiten. Die übrigen Punkte sind Vorschläge zum Anpassen.

## 5. Gehäuse (3D-Druck)

Beim Konstruieren beachten:
- Der Makerdiary-Dongle wird bereits mit Gehäuse geliefert.
- Beim Nordic-Dongle:
  - Die **Taste SW1** muss erreichbar bleiben, z. B. durch eine Öffnung oder einen flexiblen Druckknopf.
  - Die **RGB-LED** sollte sichtbar sein: ein Loch oder eine dünne Wand aus hellem bzw. transparentem Filament.
  - Die **RESET-Taste** (seitlich) braucht man nur für Firmware-Updates. Ein kleines Loch für eine Büroklammer reicht.
- Die Abmessungen am besten selbst mit dem Messschieber nehmen. Auf Printables und Thingiverse gibt es auch fertige Gehäuse für den „nRF52840 Dongle“ als Ausgangspunkt.

## Updates

- Ist Internet da, lädt die App immer die neueste Version. Ist eine neue Version verfügbar, während die App offen ist, lädt sie sich selbst neu. Das Protokoll bleibt dabei erhalten.
- Die installierte Version steht oben im Kopf neben dem Namen (z. B. „v0.18“) und unter *Einstellungen → Dongle → App-Version*. Schema: **0.x** = in Entwicklung, ab **1.0** fertiges Produkt.
- Klemmt etwas nach einem Update: *Einstellungen → Dongle → **App neu laden***. Das leert den Offline-Speicher. Anmeldung, Bausteine und Einstellungen bleiben erhalten.
- Für Entwickler: Vor jedem Veröffentlichen `tools/version.sh` ausführen. Das erhöht die Version automatisch um eine Stufe (0.18 → 0.19). Mit `tools/version.sh 1.0` setzt man eine bestimmte Version.

## Datenschutz

- Ohne Konto liegen Textbausteine, Formulare und Einstellungen nur lokal im Browser des Handys. Mit Konto werden sie zusätzlich bei Supabase (Frankfurt) gespeichert. Ausgefüllte Formulare und der Editor-Inhalt werden nie gespeichert oder hochgeladen.
- Die Bluetooth-Verbindung ist verschlüsselt, und nur gekoppelte Handys werden angenommen.
- **Diktat:** Die Spracherkennung des Browsers läuft je nach Gerät über Server von Google bzw. Apple. Keine identifizierenden Patientendaten diktieren.
- Vor dem Einsatz an dienstlichen Geräten mit der zuständigen IT abklären, ob USB-Tastaturen erlaubt sind.

## Mitentwickeln

- **Aufbau und Datenmodell:** [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md), Regeln fürs gemeinsame Arbeiten (auch für Claude Code) in [`CLAUDE.md`](CLAUDE.md).
- **Tests:** `cd tests && npm install && npm run db:start && npm test`, Details in [`tests/README.md`](tests/README.md).
- **Datenbank-Änderungen** sind neue Dateien in `supabase/migrations/`. Sie werden lokal getestet und erst danach in der echten Datenbank im SQL-Editor ausgeführt.
- **Veröffentlichen:** `main` ist sofort live. Vorher `tools/version.sh` ausführen und testen.

## Firmware selbst bauen

```sh
pip install west
west init -m https://github.com/zephyrproject-rtos/zephyr --mr v3.7.0 zephyrproject
cd zephyrproject && west update && pip install -r zephyr/scripts/requirements-base.txt
# Zephyr SDK 0.16.8 (ARM-Toolchain) installieren, dann:
west build -b nrf52840dongle/nrf52840 /pfad/zu/dokustick/firmware             # Nordic
west build -b nrf52840_mdk_usb_dongle/nrf52840 /pfad/zu/dokustick/firmware \
  -- -DCONFIG_BUILD_OUTPUT_UF2=y                                              # Makerdiary
# UF2-Bootloader mit SoftDevice S140 zusätzlich: -DCONFIG_FLASH_LOAD_OFFSET=0x26000
```

### Bluetooth-Protokoll (für eigene Erweiterungen)

Service `6e7a0001-4b3c-4f8e-9a1d-5c2b7d0a4e01`

| Charakteristik | UUID | Inhalt |
|---|---|---|
| Befehl (write) | `6e7a0002-…` | `01` + Daten · `02` = Abbrechen · `03 <ms>` = Tippverzögerung · `04` = alle Kopplungen löschen |
| Status (read/notify) | `6e7a0003-…` | Flags, wartende Bytes, freie Bytes, Verzögerung, Firmware-Version |

Datenstrom: UTF-8-Text; `00 <modifier> <keycode>` = einzelne Taste; `00 FF <n>` = Pause n×10 ms.
