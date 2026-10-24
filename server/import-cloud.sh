#!/bin/bash
# Umzug: übernimmt alle Daten aus dem Supabase-Projekt (supabase.co) auf diesen Server.
#
#   server/import-cloud.sh "postgresql://postgres.PROJEKT:PASSWORT@aws-…pooler.supabase.com:5432/postgres"
#
# Die Verbindungsadresse steht im Supabase-Dashboard unter "Connect" → "Session pooler".
# Konten behalten ihre Passwörter, alle Geräte müssen sich danach einmal neu anmelden.
# Die Daten bei supabase.co bleiben unverändert (es wird nur gelesen).
source "$(dirname "$0")/lib.sh"
need_env
url="${1:?Verbindungsadresse der Supabase-Datenbank angeben (in Anführungszeichen)}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
"$SERVER_DIR/migrate.sh"
echo "Lese Daten von supabase.co …"
"$SERVER_DIR/data-export.sh" "$tmp/cloud" "$url"
# Sicherheitskopie des bisherigen Stands dieses Servers
mkdir -p "$SERVER_DIR/backups"
"$SERVER_DIR/data-export.sh" "$SERVER_DIR/backups/vor-import-$(date +%Y-%m-%d_%H%M)" >/dev/null
"$SERVER_DIR/data-import.sh" "$tmp/cloud" "${2:-}"
