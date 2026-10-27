# Infoseite protopilot.at

Statische Website (HTML und CSS, ohne Skripte, Cookies oder externe Schriften) für das Webhosting bei Hetzner.

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: So geht's, Funktionen, Bildschirmfotos, Sicherheit, Bezug, Fragen |
| `impressum.html` | Impressum (§ 5 ECG, § 25 MedienG) |
| `datenschutz.html` | Datenschutzerklärung für Website und Web-App |
| `404.html` | Seite für falsche Adressen |
| `.htaccess` | Kurzadresse `protopilot.at/app`, Sicherheits-Header, Zwischenspeichern |
| `style.css` | Aussehen, passt sich hellem und dunklem Modus an |
| `img/` | Logo, Bildschirmfotos der App, Vorschaubild für WhatsApp & Co. |

## Vor dem Hochladen ausfüllen

- [x] `impressum.html` und `datenschutz.html`: Name, Anschrift, Speicherdauer der Zugriffsprotokolle (7 Tage)
- [ ] Mit Hetzner den **Vertrag zur Auftragsverarbeitung** abschließen (im Hetzner-Kundenkonto), darauf verweist die Datenschutzerklärung.
- [ ] Postfach **info@protopilot.at** anlegen (Kontaktadresse in `index.html`, `impressum.html` und `datenschutz.html`).
- [ ] Antwort auf „Was kostet ProtoPilot?“ in `index.html` anpassen, sobald Preis und Bezug feststehen.

## Hochladen

1. Mit einem FTP-Programm (z. B. FileZilla) verbinden. Server, Benutzer und Passwort stehen in der Hetzner-Verwaltung (konsoleH) beim Webhosting unter den FTP-Zugangsdaten.
2. In den Ordner `public_html` wechseln. Die Platzhalterseite von Hetzner dort löschen.
3. Den **Inhalt** dieses Ordners `website/` hochladen, also `index.html`, `img/` usw., nicht den Ordner selbst. `.htaccess` nicht vergessen (versteckte Datei). Diese `README.md` braucht es am Server nicht.
4. https://protopilot.at im Browser öffnen und mit Strg+F5 neu laden.

Ohne FTP-Programm geht es auch im Browser mit **WebFTP** in der konsoleH. Die Umleitung von `http://` auf `https://` erledigt Hetzner bereits.

## Später ändern

Die Dateien nur mit einem reinen Texteditor bearbeiten (z. B. Notepad++). Ein Web-Editor mit Vorschau wirft den Kopf der Seite (`<head>`, Verweis auf `style.css`) weg, dann fehlt das ganze Aussehen.

- **Neue Adresse der Web-App** (nach dem Umzug auf den eigenen Server): nur in `.htaccess` die Zieladresse bei `RedirectMatch` ändern. Alle Knöpfe „Web-App öffnen“ zeigen auf `/app`.
- **Datenschutz nach dem Server-Umzug:** In `datenschutz.html` den Absatz „Mit Konto“ anpassen (eigener Server statt Supabase, Standort).
- **Name:** Kommt statt ProtoPilot ein anderer Name, „ProtoPilot“ in allen `.html`-Dateien ersetzen und das Vorschaubild `img/vorschau.png` neu erstellen.
- **Bildschirmfotos** sind 390 Punkte breite Handy-Aufnahmen der App (doppelte Auflösung, WebP). Neue Fotos im gleichen Format einfach ersetzen.
