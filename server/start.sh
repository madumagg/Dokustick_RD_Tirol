#!/bin/bash
# Startet alle Dienste und spielt fehlende Migrationen ein (auch nach Updates gefahrlos)
source "$(dirname "$0")/lib.sh"
need_env
dc up -d --remove-orphans
wait_db
"$SERVER_DIR/migrate.sh"
dc ps
