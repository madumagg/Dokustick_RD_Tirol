#!/bin/bash
# Spielt alle noch fehlenden Migrationen aus supabase/migrations ein (Reihenfolge = Dateiname).
# Jede Migration laeuft in einer Transaktion als postgres (wie im SQL-Editor von supabase.co);
# eingespielte stehen in supabase_migrations.schema_migrations.
source "$(dirname "$0")/lib.sh"
need_env
wait_db
done_list="$(psql_admin -tA -c "select version from supabase_migrations.schema_migrations")"
n=0
for f in "$REPO_DIR"/supabase/migrations/*.sql; do
  name="$(basename "$f" .sql)"
  version="${name%%_*}"
  grep -qx "$version" <<<"$done_list" && continue
  echo "Migration: $name"
  psql_pg --single-transaction < "$f"
  psql_admin -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '${name#*_}')"
  n=$((n + 1))
done
# Daten-API kennt danach neue Tabellen und Funktionen
psql_admin -c "notify pgrst, 'reload schema'"
echo "Migrationen: $n neu eingespielt."
