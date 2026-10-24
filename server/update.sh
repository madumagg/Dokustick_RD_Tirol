#!/bin/bash
# Holt neue Versionen von GitHub (main) und spielt neue Migrationen ein.
# Läuft alle 5 Minuten per systemd-Timer (install-timers.sh); die App-Dateien werden direkt
# aus dem Repository ausgeliefert und sind damit sofort aktuell.
source "$(dirname "$0")/lib.sh"
need_env
cd "$REPO_DIR"
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
old="$(git rev-parse HEAD)"
git merge -q --ff-only origin/main
echo "Update: $(git log --oneline -1)"
"$SERVER_DIR/migrate.sh"
# Geänderte Server-Konfiguration übernehmen
if ! git diff --quiet "$old" HEAD -- server/docker-compose.yml; then dc up -d --remove-orphans; fi
if ! git diff --quiet "$old" HEAD -- server/Caddyfile; then dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile; fi
