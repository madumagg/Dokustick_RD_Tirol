#!/bin/bash
# Stellt die Daten aus einem Backup von backup.sh wieder her (ersetzt alle aktuellen Daten).
#
#   server/restore.sh /mnt/nas/dokustick/dokustick-2026-10-25_0315.tar.gz
#
# Neuer Server nach einem Totalausfall: zuerst die Datei "env" aus dem Backup als server/.env
# hinlegen (chmod 600), server/config-js.sh ausführen, dann server/start.sh, dann dieses Skript.
source "$(dirname "$0")/lib.sh"
need_env
file="${1:?Backup-Datei angeben}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tar -xzf "$file" -C "$tmp"
"$SERVER_DIR/migrate.sh"
"$SERVER_DIR/data-import.sh" "$tmp/daten" "${2:-}"
