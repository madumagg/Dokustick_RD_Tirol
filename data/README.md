# Startlisten für die Datenbank

Importdateien für *Datenbank → CSV importieren* (nur App-Admins). Bereits vorhandene Einträge mit exakt gleichem Namen (bei Medikamenten: Handelsname + Dosis) werden beim Import übersprungen, Einträge mit anderer Schreibweise dagegen nicht.

| Datei | Inhalt |
|---|---|
| `krankheiten-volkskrankheiten.csv` | 53 häufige Vorerkrankungen (Volkskrankheiten) mit gängigen Abkürzungen, nach Organsystemen geordnet |
| `medikamente-oesterreich.csv` | 2899 in Österreich zugelassene Präparate der meistverordneten Wirkstoffgruppen (Details unten) |

Format: Semikolon-getrennt, UTF-8, Kopfzeile `Name;Abkürzung/Beschreibung` (Medikamente: `Handelsname;Wirkstoff;Dosis`). Mit *CSV exportieren* erzeugt die App dasselbe Format.

**Medizinische Inhalte vor dem Import fachlich prüfen.** Medikamentenlisten nur aus verlässlichen Quellen übernehmen, nicht ausdenken.

## Medikamentenliste Österreich

Stand: Oktober 2026, maschinell erstellt und stichprobenartig geprüft.

**Quellen**

- Präparate, Wirkstoffe, ATC-Codes und Vertriebsstatus: [medikamio.com/de-at](https://medikamio.com/de-at/wirkstoffe/index). Die Seite führt die in Österreich zugelassenen Arzneimittel mit Gebrauchsinformation.
- Insuline: Medikamio und das Register der Europäischen Arzneimittel-Agentur ([EMA](https://www.ema.europa.eu/en/medicines)). Diese Präparate sind EU-weit zugelassen.
- Auswahl der Wirkstoffgruppen: die zehn meistverordneten Gruppen laut [Statistischem Handbuch der österreichischen Sozialversicherung 2024](https://www.sozialversicherung.at/cdscontent/load?contentid=10008.791265&version=1740566437) (Verordnungen 2023: Blutdruck/RAS, Lipidsenker, Antidepressiva, Diabetes, Schmerzmittel, Gerinnungshemmer, Psycholeptika, Antibiotika, Atemwege, Magenschutz). Dazu kommen für den Rettungsdienst wichtige Gruppen: Betablocker, Diuretika, Calciumantagonisten, weitere Herzmittel, Schilddrüse, Gicht, Antiepileptika, Parkinson, Kortison, NSAR, Antiemetika, Antihistaminika, Osteoporose, Prostata/Blase, Opioid-Substitution.

**Regeln**

- Nur Präparate, die nicht als eingestellt gekennzeichnet sind.
- Weggelassen wurden:
  - Tierarzneimittel
  - Salben, Augentropfen und Nasensprays (außer Fentanyl-Nasenspray gegen Durchbruchschmerzen)
  - Grippemittel-Kombinationen
  - Starterpackungen
  - Ampullen und Infusionen, außer Spritzen und Pens, die Patienten selbst anwenden: Heparine, GLP-1, Denosumab und Insuline.
- Generika mit Wirkstoffnamen werden zum Wirkstoff zusammengefasst, z. B. „Bisoprolol Sandoz 5 mg“ und „Bisoprolol Krka 5 mg“ zu `Bisoprolol;Bisoprolol;5 mg`. Kombinationen stehen als `Ramipril/HCT`.
- Markennamen bleiben einzeln (`Concor;Bisoprolol;5 mg`), auch wenig verbreitete. So lässt sich auch ein unbekannter Name auf einer Packung zuordnen.
- Die Darreichungsform steht nur beim Namen, wenn sie für die Doku zählt: `retard`, `Tropfen`, `Saft`, `Zäpfchen`, `Pflaster`, `Inhalation`, `Dosieraerosol`.
- Insuline stehen ohne Dosis, weil die Einheiten von Patient zu Patient verschieden sind.

**Grenzen**

- Die Liste enthält nicht alle Wirkstoffe, nur die oben genannten Gruppen. Fehlende Präparate können über *Vorschlagen* ergänzt werden.
- Ob ein Präparat noch erhältlich ist, stammt aus den Angaben von Medikamio. Einzelne Einträge können veraltet sein.
- Bei einzelnen Präparaten fehlte in den Quelldaten die Stärke im Namen. Sie stehen ohne Dosis in der Liste, z. B. `Novalgin`.
- Offensichtliche Fehler in den Quelldaten wurden korrigiert, z. B. fehlende Wirkstoffe bei Sacubitril/Valsartan.
