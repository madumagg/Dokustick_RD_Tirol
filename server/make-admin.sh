#!/bin/bash
# Macht ein vorhandenes Konto zum App-Admin (für einen Neustart ohne Datenübernahme).
#
#   server/make-admin.sh name@beispiel.at
source "$(dirname "$0")/lib.sh"
need_env
email="${1:?E-Mail-Adresse angeben}"
n="$(psql_admin -tA -v email="$email" <<'SQL' | tail -1
insert into public.app_admins (user_id)
  select id from auth.users where lower(email) = lower(:'email')
  on conflict do nothing;
select count(*) from public.app_admins a join auth.users u on u.id = a.user_id where lower(u.email) = lower(:'email');
SQL
)"
if [ "$n" = 1 ]; then echo "$email ist App-Admin."; else echo "Kein Konto mit $email – zuerst in der App registrieren."; exit 1; fi
