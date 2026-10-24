#!/bin/bash
# Nächtliches Backup auf die NAS (BACKUP_DIR in .env), ältere als BACKUP_KEEP_DAYS werden gelöscht.
# Inhalt je Backup (dokustick-JJJJ-MM-TT_HHMM.tar.gz):
#   daten/          alle Daten zum Wiederherstellen mit server/restore.sh
#   komplett.dump   vollständiger pg_dump (nur für Notfälle durch Fachleute)
#   env             die Geheimnisse dieses Servers (.env) – ohne sie geht kein Wiederherstellen
source "$(dirname "$0")/lib.sh"
need_env
target="${BACKUP_DIR:?BACKUP_DIR fehlt in .env}"
if ! [ -d "$target" ] || ! touch "$target/.schreibtest" 2>/dev/null; then
  echo "Backup-Ordner $target fehlt oder ist nicht beschreibbar (NAS eingebunden?)." >&2
  exit 1
fi
rm -f "$target/.schreibtest"
ts="$(date +%Y-%m-%d_%H%M)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
"$SERVER_DIR/data-export.sh" "$tmp/daten" >/dev/null
dc exec -T db pg_dump -U supabase_admin -d postgres -Fc > "$tmp/komplett.dump"
cp "$ENV_FILE" "$tmp/env"
umask 077
tar -czf "$target/dokustick-$ts.tar.gz.part" -C "$tmp" .
mv "$target/dokustick-$ts.tar.gz.part" "$target/dokustick-$ts.tar.gz"
find "$target" -maxdepth 1 -name 'dokustick-*.tar.gz' -mtime +"${BACKUP_KEEP_DAYS:-30}" -delete
echo "Backup: $target/dokustick-$ts.tar.gz ($(du -h "$target/dokustick-$ts.tar.gz" | cut -f1))"
