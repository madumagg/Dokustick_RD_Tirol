# Wörterbücher für die Rechtschreibprüfung

Die Wörterbücher werden unverändert mit der App ausgeliefert und nur auf dem Gerät verwendet (`spell.js`). Sie stehen unter eigenen Lizenzen, unabhängig vom Rest der App.

| Datei | Inhalt | Quelle | Lizenz |
|---|---|---|---|
| `de-AT.aff`, `de-AT.dic` | Deutsch (Österreich), igerman98 Version 20161207, © Björn Jacke | npm-Paket [`dictionary-de-at`](https://github.com/wooorm/dictionaries) 3.0.0, Original [j3e.de/ispell/igerman98](https://www.j3e.de/ispell/igerman98/) | GPL-2.0 oder GPL-3.0 (`COPYING.GPL-2`, `COPYING.GPL-3`) |
| `de-med.dic` | Medizinische Fachbegriffe (Ergänzung zu igerman98), © Dr. Tobias Quathamer | Debian-Paket `hunspell-de-med` 20230905, Projekt [codeberg.org/toddy/medicalterms](https://codeberg.org/toddy/medicalterms) | GPL-3.0 oder später (`COPYING.GPL-3`) |

`de-med.dic` verwendet dieselben Affix-Regeln wie igerman98. Die App hängt es beim Laden an `de-AT.dic` an.

**Aktualisieren:** Neue Dateien hier ablegen und in `sw.js` `DICT_CACHE` hochzählen, damit die Geräte sie neu laden.
