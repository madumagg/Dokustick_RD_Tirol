#!/bin/bash
# Gemeinsame Hilfsfunktionen der Server-Skripte (wird mit "source" eingebunden)
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"
ENV_FILE="${DOKUSTICK_ENV:-$SERVER_DIR/.env}"

# docker compose mit der Konfiguration von DokuStick (DOKUSTICK_COMPOSE_EXTRA nur fuer Tests)
dc() {
  # shellcheck disable=SC2086
  docker compose --project-directory "$SERVER_DIR" -f "$SERVER_DIR/docker-compose.yml" --env-file "$ENV_FILE" ${DOKUSTICK_COMPOSE_EXTRA:-} "$@"
}

# psql im Datenbank-Container: als Superuser bzw. als postgres (wie der SQL-Editor von supabase.co)
psql_admin() { dc exec -T -e PGOPTIONS="-c client_min_messages=warning" db psql -v ON_ERROR_STOP=1 -X -q -U supabase_admin -d postgres "$@"; }
psql_pg() { dc exec -T -e PGOPTIONS="-c client_min_messages=warning" db psql -v ON_ERROR_STOP=1 -X -q -h 127.0.0.1 -U postgres -d postgres "$@"; }

need_env() {
  [ -f "$ENV_FILE" ] || { echo "Es fehlt $ENV_FILE – zuerst server/setup.sh ausführen."; exit 1; }
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

# Wartet, bis die Datenbank Verbindungen annimmt
wait_db() {
  for _ in $(seq 1 60); do
    dc exec -T db pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "Die Datenbank startet nicht. Logs: docker compose logs db"; exit 1
}

# Sicherheitsabfrage; mit --ja bzw. DOKUSTICK_JA=1 ohne Rueckfrage
confirm() {
  [ "${DOKUSTICK_JA:-}" = 1 ] && return 0
  read -r -p "$1 [ja/nein] " a
  [ "$a" = ja ] || { echo "Abgebrochen."; exit 1; }
}
