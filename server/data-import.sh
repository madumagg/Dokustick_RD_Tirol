#!/bin/bash
# Spielt einen Export von data-export.sh ein und ERSETZT dabei alle Daten (Konten, Bausteine, Teams …).
# Das Schema kommt vorher aus den Migrationen (server/migrate.sh), hier geht es nur um die Daten.
#
#   server/data-import.sh ORDNER        mit Sicherheitsabfrage (--ja: ohne)
#
# Uebernommen werden nur Spalten, die es hier gibt; fehlende bekommen ihren Standardwert.
# Waehrend des Imports sind Trigger und Fremdschluessel aus (session_replication_role = replica),
# sonst wuerden z. B. die Registrierungsregeln neue Teammitgliedschaften anlegen.
source "$(dirname "$0")/lib.sh"
need_env
dir="${1:?Ordner mit dem Export angeben}"
[ "${2:-}" = "--ja" ] && DOKUSTICK_JA=1
[ -f "$dir/tabellen.txt" ] || { echo "$dir ist kein Export von data-export.sh"; exit 1; }
echo "Export vom $(cat "$dir/erstellt.txt" 2>/dev/null):"
sed 's/^/  /' "$dir/tabellen.txt"
confirm "Alle Daten auf diesem Server werden durch diesen Export ersetzt. Fortfahren?"
wait_db

remote=/tmp/dokustick-import
dc exec -T db rm -rf "$remote"
dc cp "$dir" "db:$remote" >/dev/null 2>&1

{
  cat <<'SQL'
begin;
set session_replication_role = replica;
create temp table src (j jsonb) on commit drop;

-- Zaehler (identity/serial) hinter den hoechsten uebernommenen Wert setzen
create function pg_temp.fix_sequences(tbl regclass) returns void language plpgsql as $$
declare c record; seq text;
begin
  for c in select a.attname from pg_attribute a where a.attrelid = tbl and a.attnum > 0 and not a.attisdropped loop
    seq := pg_get_serial_sequence(tbl::text, c.attname);
    if seq is not null then
      execute format('select setval(%L, coalesce((select max(%I) from %s), 0) + 1, false)', seq, c.attname, tbl);
    end if;
  end loop;
end $$;

-- Zeilen aus src in die Tabelle uebernehmen: nur gemeinsame, nicht berechnete Spalten
create function pg_temp.load(name text) returns text language plpgsql as $$
declare tbl regclass := to_regclass(name); cols text; vals text; ident boolean; n bigint;
begin
  if tbl is null then return name || ': fehlt hier, übersprungen'; end if;
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg('r.' || quote_ident(a.attname), ', ' order by a.attnum),
         bool_or(a.attidentity <> '')
    into cols, vals, ident
  from pg_attribute a
  where a.attrelid = tbl and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and exists (select 1 from src s where s.j ? a.attname);
  if cols is null then return name || ': 0'; end if;
  execute format('insert into %s (%s)%s select %s from src s, jsonb_populate_record(null::%s, s.j) r',
                 tbl, cols, case when ident then ' overriding system value' else '' end, vals, tbl);
  get diagnostics n = row_count;
  perform pg_temp.fix_sequences(tbl);
  return name || ': ' || n;
end $$;


SQL
  # Alle Zieltabellen leeren, die im Export vorkommen und hier existieren
  echo "do \$\$ declare t text; begin"
  while read -r t _; do
    echo "  if to_regclass('$t') is not null then execute 'truncate table $t cascade'; end if;"
  done < "$dir/tabellen.txt"
  echo "end \$\$;"
  while read -r t _; do
    echo "truncate src;"
    echo "\\copy src (j) from '$remote/$t.jsonl'"
    echo "select pg_temp.load('$t');"
  done < "$dir/tabellen.txt"
  echo "commit;"
  echo "notify pgrst, 'reload schema';"
} | psql_admin -t

dc exec -T db rm -rf "$remote"
echo "Import abgeschlossen. Angemeldete Geräte müssen sich einmal neu anmelden."
