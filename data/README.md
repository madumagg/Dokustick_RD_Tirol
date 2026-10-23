# Startlisten für die Datenbank

Importdateien für *Datenbank → CSV importieren* (nur App-Admins). Bereits vorhandene Einträge mit exakt gleichem Namen werden beim Import übersprungen, Einträge mit anderer Schreibweise dagegen nicht.

| Datei | Inhalt |
|---|---|
| `krankheiten-volkskrankheiten.csv` | 53 häufige Vorerkrankungen (Volkskrankheiten) mit gängigen Abkürzungen, nach Organsystemen geordnet |

Format: Semikolon-getrennt, UTF-8, Kopfzeile `Name;Abkürzung` (Medikamente: `Handelsname;Wirkstoff;Dosis`). Mit *CSV exportieren* erzeugt die App dasselbe Format.

**Medizinische Inhalte vor dem Import fachlich prüfen.** Medikamentenlisten nur aus verlässlichen Quellen übernehmen, nicht ausdenken.
