# ProtoPilot – Logo

Ein Blatt Papier wird zum Flieger und schickt das Protokoll los. Die orangen Punkte sind die Funkstrecke zum Stick.

## Farben

| Name | Wert | Verwendung |
|---|---|---|
| Petrol | `#0b6f6a` | Hauptfarbe, Icon-Hintergrund, „Pilot“ im Schriftzug |
| Petrol hell | `#bfe3df` | hintere Flügelhälfte im Icon |
| Petrol mittel | `#3fb8ae` | „Pilot“ und Flügel auf dunklem Hintergrund |
| Signal-Orange | `#ffa62b` | Funkpunkte (nur als Akzent) |
| Dunkel | `#15201f` | „Proto“ im Schriftzug |

**Schrift:** Inter Display ExtraBold (SIL Open Font License, frei verwendbar). In den SVG-Dateien ist der Schriftzug als Form gespeichert, die Schrift muss also nicht installiert sein.

## Dateien

| Datei (`svg/` bzw. `png/`) | Wofür |
|---|---|
| `protopilot-logo` | Hauptlogo auf hellem Hintergrund |
| `protopilot-logo-dunkel` | auf dunklem Hintergrund |
| `protopilot-logo-auf-petrol` | auf petrolfarbenem Hintergrund |
| `protopilot-logo-schwarz` / `-weiss` | einfarbig, z. B. Aufkleber, Stempel, Gravur |
| `protopilot-schriftzug` / `-dunkel` | nur der Name |
| `protopilot-icon` | App-Icon mit runden Ecken, Profilbilder |
| `protopilot-icon-quadratisch` | ohne Rundung (iPhone/Android runden selbst) |
| `protopilot-icon-maskable` | Android-Icon mit Rand für runde/andere Formen |
| `protopilot-favicon` | Browser-Tab: ohne Punkte, kräftiger, für 16 bis 48 Pixel |
| `protopilot-symbol` (+ `-dunkel`, `-schwarz`, `-weiss`) | nur der Flieger ohne Hintergrund |
| `png/favicon.ico` | Browser-Tab für ältere Browser (16, 32, 48 px) |
| `png/apple-touch-icon.png`, `png/android-*.png` | Startbildschirm-Symbole |

Für Druck immer die SVG-Dateien nehmen, sie sind beliebig vergrößerbar.

## Regeln

- Rund um das Logo frei lassen: mindestens die halbe Icon-Breite.
- Das Logo nicht verzerren, drehen, umfärben oder mit Schatten versehen.
- Kleinste Größe: Hauptlogo 24 px hoch, darunter nur das Icon bzw. `protopilot-favicon`.
- Kein rotes Kreuz und keinen Rettungsstern dazustellen. Das Rote Kreuz ist gesetzlich geschützt, und beides lässt an eine Rettungsorganisation denken.

## Neu erzeugen

```
pip install fonttools uharfbuzz
python3 branding/make.py      # SVG-Dateien in branding/svg
node branding/export.mjs      # PNG, favicon.ico und die Logo-Dateien der Website
```

`make.py` braucht die Schriftdatei `InterDisplay-ExtraBold.otf` (Pfad oben im Skript, Download: rsms.me/inter). `export.mjs` nutzt Playwright aus `tests/` und schreibt auch `website/favicon.*`, `website/img/logo*.svg`, `website/img/apple-touch-icon.png` und das Vorschaubild `website/img/vorschau.png` neu.
