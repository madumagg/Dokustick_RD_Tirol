#!/bin/bash
# Exportiert alle Daten von DokuStick in einen Ordner: je Tabelle eine Datei (eine Zeile JSON pro Zeile).
# Erfasst werden alle Tabellen im Schema public sowie die Konten (auth.users, auth.identities).
#
#   server/data-export.sh ZIELORDNER                       aus der Datenbank dieses Servers
#   server/data-export.sh ZIELORDNER "postgresql://…"      aus einer anderen Datenbank (z. B. supabase.co)
#
# JSON statt SQL, damit der Import auch klappt, wenn sich einzelne Spalten unterscheiden
# (z. B. neuere Anmelde-Version bei supabase.co).
source "$(dirname "$0")/lib.sh"
need_env
out="${1:?Zielordner angeben}"
src="${2:-}"
mkdir -p "$out"
wait_db
q() { # Abfrage an die Quelle (psql laeuft immer im Datenbank-Container dieses Servers)
  if [ -n "$src" ]; then dc exec -T -e PGOPTIONS="-c client_min_messages=warning" db psql "$src" -v ON_ERROR_STOP=1 -X -q "$@"
  else psql_admin "$@"; fi
}
tables="$(q -tA -c "select table_schema || '.' || table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  union all select 'auth.users' union all select 'auth.identities' order by 1")"
: > "$out/tabellen.txt"
for t in $tables; do
  q -c "\\copy (select to_jsonb(x) from $t x) to stdout" > "$out/$t.jsonl"
  printf '%s %s\n' "$t" "$(wc -l < "$out/$t.jsonl" | tr -d ' ')" >> "$out/tabellen.txt"
done
date -Iseconds > "$out/erstellt.txt"
echo "Exportiert nach $out:"
sed 's/^/  /' "$out/tabellen.txt"
