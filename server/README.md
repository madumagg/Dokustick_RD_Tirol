# DokuStick auf dem eigenen Server

Diese Anleitung bringt Datenbank, Anmeldung und App von supabase.co und GitHub Pages auf einen eigenen Server: eine Ubuntu-VM unter Hyper-V (Windows 10 Pro), Router UniFi Dream Machine Pro, Backups auf eine Synology-NAS. Die Dongles sind davon nicht betroffen.

```
Internet ──443──▶ UniFi Dream Machine Pro ──▶ Ubuntu-VM (Hyper-V)
                                               └─ Docker:  Caddy (HTTPS, App-Dateien)
                                                           ├─ /auth/v1 → Anmeldung (GoTrue)
                                                           ├─ /rest/v1 → Daten-API (PostgREST)
                                                           └─ PostgreSQL 17 (wie bei supabase.co)
                                               └─ jede Nacht Backup ──▶ Synology-NAS
```

Es laufen dieselben Programmversionen wie in der lokalen Test-Datenbank (Supabase-CLI). Die komplette Testreihe ist auch gegen diesen Server-Aufbau grün. Zusammen brauchen die Dienste nur etwa 200 MB Arbeitsspeicher.

**Was du dafür brauchst:** eine Domain mit Mail-Postfach, etwa 1–2 Stunden Zeit und das Supabase-Dashboard (für den Datenumzug am Ende).

## 1. Domain und Mail-Postfach

1. Bei einem Anbieter mit Mail-Postfach eine Domain kaufen, z. B. eine `.at`-Domain.
2. Im DNS des Anbieters einen **A-Eintrag** anlegen: Name `dokustick`, Ziel deine **feste IP-Adresse**. Die App ist dann unter `https://dokustick.deinedomain.at` erreichbar. Statt `dokustick` geht auch die Domain selbst (`@`).
3. Ein Postfach für den Versand anlegen, z. B. `noreply@deinedomain.at`. Notiere vom Anbieter:
   - SMTP-Server
   - Port (meist 587, bei manchen 465)
   - Benutzername und Passwort

   Die App verschickt damit die Mails „E-Mail bestätigen“ und „Passwort vergessen“.
4. Prüfen, ob der Anbieter **SPF und DKIM** für die Domain eingerichtet hat (meist automatisch). Sonst landen die Mails im Spam.

## 2. Virtuelle Maschine in Hyper-V

1. **Hyper-V einschalten:** *Systemsteuerung → Programme → Windows-Features aktivieren oder deaktivieren → Hyper-V* anhaken, neu starten.
2. **Netzwerk:** *Hyper-V-Manager → Manager für virtuelle Switches → Neuer Switch → Extern*, an die Netzwerkkarte des Servers binden. Die VM bekommt damit eine eigene Adresse im Heimnetz.
3. **Ubuntu Server 24.04 LTS** als ISO-Datei von ubuntu.com herunterladen.
4. **Neue VM** (*Aktion → Neu → Virtueller Computer*):
   - Generation 2
   - 4096 MB Arbeitsspeicher, „Dynamischen Arbeitsspeicher“ aus
   - Netzwerk: der externe Switch
   - neue Festplatte mit 64 GB
   - als Installationsmedium die ISO-Datei
5. **Vor dem ersten Start** in den Einstellungen der VM:
   - *Sicherheit → Sicherer Start*: Vorlage **„Microsoft UEFI-Zertifizierungsstelle“**. Sonst startet Ubuntu nicht.
   - *Prozessor*: 2 virtuelle Prozessoren.
   - *Automatische Startaktion*: **Immer automatisch starten**. So startet die VM nach Windows-Updates und Stromausfällen wieder.
   - *Automatische Stoppaktion*: **Gastbetriebssystem herunterfahren**. So fährt die Datenbank sauber herunter.
6. **Ubuntu installieren:**
   - Benutzer z. B. `dokustick`
   - bei „SSH Setup“ **Install OpenSSH server** anhaken
   - sonst nichts auswählen
7. **Feste Adresse im Heimnetz:** in der UniFi-Oberfläche unter *Clients* die VM wählen und *Fixed IP Address* setzen, z. B. `192.168.1.20`.
8. Automatische Sicherheitsupdates sind bei Ubuntu schon eingeschaltet. Einmal alles aktualisieren:
   ```sh
   sudo apt update && sudo apt full-upgrade -y && sudo reboot
   ```

## 3. Router (UniFi Dream Machine Pro)

1. *Settings → Routing → Port Forwarding* (je nach Version *Firewall & Security → Port Forwarding*) zwei Regeln anlegen:
   - **443** (TCP und UDP) → VM-Adresse, Port 443
   - **80** (TCP) → VM-Adresse, Port 80

   Port 80 braucht das HTTPS-Zertifikat. Wer `http://` aufruft, wird automatisch auf `https://` umgeleitet.
2. **Nichts anderes freigeben**, vor allem nicht SSH (22) und die Verwaltung (8000).
3. Für den Zugriff von unterwegs auf die Verwaltung das **VPN der UDM** verwenden (WireGuard bzw. Teleport).

## 4. DokuStick installieren

Per SSH in die VM (unter Windows in der Eingabeaufforderung):

```sh
ssh dokustick@192.168.1.20
```

Docker und git installieren und DokuStick holen:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt install -y git cifs-utils
sudo mkdir -p /opt/dokustick && sudo chown $USER: /opt/dokustick
git clone https://github.com/madumagg/Dokustick_RD_Tirol.git /opt/dokustick
exit
```

Neu anmelden (damit die Docker-Rechte gelten), dann einrichten und starten:

```sh
ssh dokustick@192.168.1.20
cd /opt/dokustick
server/setup.sh
server/start.sh
```

- `setup.sh` fragt Adresse, Mail-Postfach und Backup-Ordner ab. Es erzeugt alle Passwörter und Schlüssel in `server/.env`.
  - Diese Datei ist **geheim** und kommt nie ins Repository.
  - Das angezeigte Passwort für die Verwaltung (Studio) bitte notieren.
- `start.sh` startet alle Dienste und spielt die Datenbank-Migrationen ein. Beim ersten Mal lädt es die Programme herunter (etwa 2 GB).
- Nach etwa einer Minute ist `https://dokustick.deinedomain.at` mit gültigem Zertifikat erreichbar.

**Kurztest:**
1. Die neue Adresse öffnen.
2. Unter *Einstellungen* ein **Testkonto** registrieren. Die Bestätigungs-Mail muss ankommen.
3. Anmelden.

Das Testkonto verschwindet beim Datenumzug (Schritt 7) wieder.

## 5. Backups auf die Synology-NAS

1. Auf der NAS:
   - *Systemsteuerung → Freigegebener Ordner → Erstellen*: `dokustick-backup`
   - *Systemsteuerung → Benutzer*: Benutzer `dokustick-backup` anlegen, mit Lese-/Schreibrecht **nur** auf diesen Ordner
2. In der VM die Freigabe einbinden (NAS-Adresse anpassen):
   ```sh
   sudo mkdir -p /mnt/nas/dokustick
   sudo sh -c 'printf "username=dokustick-backup\npassword=NAS-PASSWORT\n" > /etc/nas-dokustick.cred && chmod 600 /etc/nas-dokustick.cred'
   echo "//192.168.1.10/dokustick-backup /mnt/nas/dokustick cifs credentials=/etc/nas-dokustick.cred,uid=$(id -u),gid=$(id -g),vers=3.0,_netdev,nofail,x-systemd.automount 0 0" | sudo tee -a /etc/fstab
   sudo systemctl daemon-reload && sudo mount -a
   ```
3. Einmal von Hand testen, dann die Zeitpläne einrichten:
   ```sh
   server/backup.sh
   sudo server/install-timers.sh
   ```
   - **Backup jede Nacht um 03:15**, Aufbewahrung 30 Tage (`BACKUP_KEEP_DAYS` in `.env`)
   - **alle 5 Minuten** eine Prüfung auf neue App-Versionen (siehe Betrieb)
4. Empfehlung: Auf der NAS mit **Hyper Backup** den Ordner zusätzlich außer Haus sichern, z. B. auf eine USB-Platte oder in die Cloud.

Ein Backup (`dokustick-JJJJ-MM-TT_HHMM.tar.gz`) enthält:
- alle Daten
- einen vollständigen Datenbank-Abzug
- die Datei `.env`

Es ist also **geheim**: die Freigabe nur für den Backup-Benutzer freigeben.

**Wiederherstellen:**

```sh
server/restore.sh /mnt/nas/dokustick/dokustick-2026-11-02_0315.tar.gz
```

**Nach einem Totalausfall** (neue VM):
1. Schritte 2–4 wiederholen, aber statt `setup.sh` die Datei `env` aus dem Backup als `server/.env` verwenden. Sonst passen die gespeicherten Anmeldungen nicht mehr.
   ```sh
   tar -xzf BACKUP.tar.gz ./env && mv env server/.env && chmod 600 server/.env
   server/config-js.sh && server/start.sh && server/restore.sh BACKUP.tar.gz
   ```

## 6. Ankündigen

In der App unter *Administration → Einstellungen → Hinweis an alle* den Umzug ankündigen, z. B.:

> Am 15.11. um 20 Uhr zieht DokuStick auf einen eigenen Server um. Bitte vorher einmal mit Internet öffnen, damit alles synchronisiert ist. Danach musst du dich einmal neu anmelden.

## 7. Datenumzug von supabase.co

1. Im **Supabase-Dashboard** des Projekts:
   - oben **Connect** wählen
   - die Adresse unter **Session pooler** kopieren, sie beginnt mit `postgresql://postgres.kplefdmhbnztaelsslka:`
   - das Datenbank-Passwort an der Stelle `[YOUR-PASSWORD]` einsetzen. Ist es unbekannt: *Project Settings → Database → Reset database password*.
2. In der VM:
   ```sh
   server/import-cloud.sh "postgresql://postgres.kplefdmhbnztaelsslka:PASSWORT@…pooler.supabase.com:5432/postgres"
   ```
   - Das Skript liest alle Daten bei supabase.co, sichert den bisherigen Stand dieses Servers in `server/backups/` und fragt nach, bevor es ersetzt.
   - Übernommen werden alle Konten (mit ihren Passwörtern), Teams, Bausteine, Einstellungen, Medikamente und Krankheiten, Tickets und häufige Fragen.
   - Bei supabase.co wird nichts verändert.
3. **Prüfen:** Die neue Adresse öffnen und mit einem bestehenden Konto und dem **alten Passwort** anmelden.
4. **App umstellen:** Schick die neue Adresse und den Wert `ANON_KEY` aus `server/.env` an Claude.
   - `ANON_KEY` ist öffentlich und steht ohnehin in der App. Die anderen Werte bleiben geheim.
   - In `webapp/config.js` kommt dann die neue Adresse. Damit arbeitet auch die alte Adresse auf GitHub Pages ab sofort mit dem neuen Server.
5. **Auf jedem Gerät:**
   1. Die **neue Adresse** öffnen: Android in Chrome, iPhone/iPad in Bluefy.
   2. Anmelden.
   3. Erneut „Zum Startbildschirm hinzufügen“ und das alte Symbol löschen.

   Auch auf der alten Adresse muss man sich einmal neu anmelden. Noch nicht hochgeladene Änderungen auf dem Gerät gehen dabei nicht verloren, sie werden nach dem Anmelden hochgeladen.
6. **supabase.co:**
   - Das Projekt noch **2–4 Wochen** behalten. Im Notfall reicht es, `webapp/config.js` zurückzustellen.
   - Danach im Dashboard pausieren oder löschen.

## Betrieb

| Was | Wie |
|---|---|
| **App-Updates** | Kommen automatisch: Alle 5 Minuten holt `update.sh` neue Versionen von GitHub (`main`) und spielt neue Datenbank-Migrationen ein. Die App-Dateien kommen direkt aus dem Repository. |
| **Status** | `cd /opt/dokustick/server && docker compose ps` |
| **Protokolle** | `docker compose logs -f auth` (bzw. `rest`, `caddy`, `db`); Updates und Backups: `journalctl -u dokustick-update -u dokustick-backup` |
| **Zeitpläne** | `systemctl list-timers 'dokustick-*'` |
| **Verwaltung (Studio)** | `docker compose --profile admin up -d`, dann im Heimnetz `http://192.168.1.20:8000` (Benutzer `admin`, Passwort aus setup.sh). Danach `docker compose --profile admin stop studio meta`. |
| **App-Admin ernennen** | in der App unter *Administration → Benutzer*; ohne vorhandenen Admin: `server/make-admin.sh name@beispiel.at` |
| **Neustart** | Die VM startet mit Windows automatisch, Docker startet alle Dienste von selbst. |
| **USV** | Die USV-Software soll Windows bei Stromausfall sauber herunterfahren. Hyper-V fährt dabei die VM herunter (Stoppaktion aus Schritt 2). |
| **Ubuntu-Updates** | automatisch (unattended-upgrades); gelegentlich `sudo apt full-upgrade` und neu starten |

## Sicherheit

- Aus dem Internet sind nur die Ports 80 und 443 der VM erreichbar, Windows selbst nicht.
- Die Datenbank ist nicht von außen erreichbar, nur über die App-Schnittstellen mit den Zugriffsregeln (RLS).
- `server/.env` und die Backups enthalten alle Geheimnisse: nur für dich und den Backup-Benutzer zugänglich halten.
- **Windows 10** bekommt Sicherheitsupdates nur noch mit Anmeldung zum verlängerten Programm (ESU, bis 12. Oktober 2027). Prüfen unter *Einstellungen → Windows Update*. Langfristig das Betriebssystem des Servers wechseln.
- Soll DokuStick offiziell in der Organisation eingesetzt werden: den Betrieb auf einem privaten Server vorher mit dem Datenschutzbeauftragten klären. Gespeichert sind Dienst-E-Mail-Adressen und Tickets, aber keine Patientendaten.

## Für Entwickler

- Die Skripte in `server/` teilen sich `lib.sh`. `DOKUSTICK_ENV` und `DOKUSTICK_COMPOSE_EXTRA` erlauben einen zweiten Aufbau zum Testen, z. B. mit anderen Ports.
- **Testreihe gegen diesen Aufbau:**
  ```sh
  SUPABASE_URL=http://127.0.0.1:8180 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm test
  ```
  Dafür `setup.sh` mit `PUBLIC_URL=http://127.0.0.1:8180 SITE_ADDRESS=:8180 MAILER_AUTOCONFIRM=true` laufen lassen und Port 8180 freigeben.
- **Daten:** `data-export.sh` schreibt je Tabelle eine Datei mit einer JSON-Zeile pro Datensatz.
  - `data-import.sh` übernimmt nur Spalten, die es im Ziel gibt. So klappt der Import auch, wenn supabase.co eine neuere Version der Anmeldung (GoTrue) mit zusätzlichen Spalten hat.
  - Trigger und Fremdschlüssel sind während des Imports aus.
- **Migrationen:** `migrate.sh` spielt sie als `postgres` ein, wie der SQL-Editor bei supabase.co. Eingespielte stehen in `supabase_migrations.schema_migrations`.
  - Nach dem Umzug gilt deshalb: **Eine Migration auf `main` läuft innerhalb von 5 Minuten auf dem Server.**
