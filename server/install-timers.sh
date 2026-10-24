#!/bin/bash
# Richtet die Zeitpläne ein: Updates alle 5 Minuten, Backup jede Nacht um 03:15.
#
#   sudo server/install-timers.sh            (als der Benutzer, dem /opt/dokustick gehört, ausführen lassen)
#
# Status: systemctl list-timers 'dokustick-*'   Protokoll: journalctl -u dokustick-backup
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bitte mit sudo ausführen."; exit 1; }
dir="$(cd "$(dirname "$0")/.." && pwd)"
user="${SUDO_USER:-$(stat -c %U "$dir")}"
for f in "$dir"/server/systemd/*; do
  sed -e "s#@DIR@#$dir#g" -e "s#@USER@#$user#g" "$f" > "/etc/systemd/system/$(basename "$f")"
done
systemctl daemon-reload
systemctl enable --now dokustick-update.timer dokustick-backup.timer
systemctl list-timers 'dokustick-*'
