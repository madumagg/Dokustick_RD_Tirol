# DokuStick

Selbstgebaute Dokumentationshilfe: Text am Handy schreiben, diktieren oder aus Textbausteinen und Formularen zusammenstellen. Ein kleiner USB-Dongle tippt ihn dann am Zielgerät (z. B. NIDA-Pad, PC) ein, so als wäre er eine Tastatur. Am Zielgerät muss nichts installiert werden.

```
Handy (Web-App)  ──Bluetooth LE──▶  nRF52840 Dongle  ──USB-Tastatur──▶  Zielgerät
```

## Inhalt

| Ordner | Inhalt |
|---|---|
| `firmware/` | Firmware für den **Nordic nRF52840 Dongle (PCA10059)**, geschrieben mit Zephyr RTOS |
| `firmware/dokustick-firmware.hex` | Fertig kompilierte Firmware zum Aufspielen |
| `webapp/` | Weboberfläche (eine HTML-Datei, als App installierbar, funktioniert offline) |

## 1. Firmware aufspielen

Der Nordic-Bootloader auf dem Dongle bleibt dabei erhalten. Du kannst also jederzeit eine neue Version aufspielen, kaputtmachen kann man nichts.

1. **nRF Connect for Desktop** installieren (kostenlos von Nordic, für Windows, macOS und Linux) und darin die App **Programmer** installieren.
2. Den Dongle in den PC stecken und die kleine, seitlich angebrachte **RESET-Taste** drücken. Die rote LED pulsiert jetzt, der Bootloader ist aktiv.
3. Im Programmer links oben das Gerät **„Open DFU Bootloader“** auswählen.
4. **Add file** → `firmware/dokustick-firmware.hex` auswählen → **Write**.
5. Der Dongle startet neu, und die LED blinkt blau. Fertig.

Alternativ geht es auch per Kommandozeile mit `nrfutil` (Paket `nrf5sdk-tools`):

```sh
nrfutil nrf5sdk-tools pkg generate --hw-version 52 --sd-req=0x00 \
  --application firmware/dokustick-firmware.hex --application-version 1 dokustick.zip
nrfutil nrf5sdk-tools dfu usb-serial -pkg dokustick.zip -p <COM-Port des Dongles>
```

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

## 3. Erste Schritte

1. Den Dongle am Zielgerät einstecken. Die LED blinkt blau, der Dongle ist koppelbereit.
2. In der App auf **Verbinden** tippen, „DokuStick“ auswählen und die Kopplungsanfrage bestätigen.
3. Am Zielgerät in das gewünschte Textfeld klicken.
4. In der App Text eingeben und auf **Senden** tippen.
5. Einmal unter *Einstellungen* auf **Tastatur-Test senden** tippen und prüfen, ob alles korrekt ankommt.

**Wichtig:** Am Zielgerät muss das Tastaturlayout **Deutsch** eingestellt sein (Deutschland oder Österreich, beide sind identisch).

### Bedienung am Dongle

| Aktion | Wirkung |
|---|---|
| Taste **SW1** kurz drücken | 60 s Kopplungsmodus für ein weiteres Handy |
| Taste **SW1** 5 s halten (LED wird rot) | Alle Kopplungen löschen |

Solange noch kein Handy gekoppelt ist, ist der Dongle automatisch koppelbereit. Danach nimmt er nur noch gekoppelte Handys an, so kann niemand Fremdes Text auf dein Gerät tippen lassen. Es können bis zu 4 Handys gekoppelt werden.

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

### Formular-Felder

| Syntax | Feld |
|---|---|
| `{{Name}}` | Textfeld |
| `{{HF:#}}` | Zahlenfeld |
| `{{Haut:rosig\|blass\|zyanotisch}}` | Auswahl-Chips, freie Eingabe weiterhin möglich |

## 4. Gehäuse (3D-Druck)

Beim Konstruieren beachten:
- Die **Taste SW1** muss erreichbar bleiben, z. B. durch eine Öffnung oder einen flexiblen Druckknopf.
- Die **RGB-LED** sollte sichtbar sein: ein Loch oder eine dünne Wand aus hellem bzw. transparentem Filament.
- Die **RESET-Taste** (seitlich) braucht man nur für Firmware-Updates. Ein kleines Loch für eine Büroklammer reicht.
- Die Abmessungen am besten selbst mit dem Messschieber nehmen. Auf Printables und Thingiverse gibt es auch fertige Gehäuse für den „nRF52840 Dongle“ als Ausgangspunkt.

## Datenschutz

- Textbausteine, Formulare und Einstellungen liegen nur lokal im Browser des Handys. Ausgefüllte Formulare und der Editor-Inhalt werden nicht gespeichert.
- Die Bluetooth-Verbindung ist verschlüsselt, und nur gekoppelte Handys werden angenommen.
- **Diktat:** Die Spracherkennung des Browsers läuft je nach Gerät über Server von Google bzw. Apple. Keine identifizierenden Patientendaten diktieren.
- Vor dem Einsatz an dienstlichen Geräten mit der zuständigen IT abklären, ob USB-Tastaturen erlaubt sind.

## Firmware selbst bauen

```sh
pip install west
west init -m https://github.com/zephyrproject-rtos/zephyr --mr v3.7.0 zephyrproject
cd zephyrproject && west update && pip install -r zephyr/scripts/requirements-base.txt
# Zephyr SDK 0.16.8 (ARM-Toolchain) installieren, dann:
west build -b nrf52840dongle/nrf52840 /pfad/zu/dokustick/firmware
# Ergebnis: build/zephyr/zephyr.hex
```

### Bluetooth-Protokoll (für eigene Erweiterungen)

Service `6e7a0001-4b3c-4f8e-9a1d-5c2b7d0a4e01`

| Charakteristik | UUID | Inhalt |
|---|---|---|
| Befehl (write) | `6e7a0002-…` | `01` + Daten · `02` = Abbrechen · `03 <ms>` = Tippverzögerung |
| Status (read/notify) | `6e7a0003-…` | Flags, wartende Bytes, freie Bytes, Verzögerung, Firmware-Version |

Datenstrom: UTF-8-Text; `00 <modifier> <keycode>` = einzelne Taste; `00 FF <n>` = Pause n×10 ms.
