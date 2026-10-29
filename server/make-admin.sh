#!/bin/bash
# Macht ein vorhandenes Konto zum App-Admin (für einen Neustart ohne Datenübernahme).
#
#   server/make-admin.sh name@beispiel.at                 App-Admin
#   server/make-admin.sh name@beispiel.at --superadmin    Superadmin (geschützt, ernennt Superadmins)
source "$(dirname "$0")/lib.sh"
need_env
email="${1:?E-Mail-Adresse angeben}"
owner=false; [ "${2:-}" = "--superadmin" ] && owner=true
n="$(psql_admin -tA -v email="$email" -v owner="$owner" <<'SQL' | tail -1
insert into public.app_admins (user_id)
  select id from auth.users where lower(email) = lower(:'email')
  on conflict do nothing;
update public.app_admins set owner = true
  where :'owner' = 'true' and user_id = (select id from auth.users where lower(email) = lower(:'email'));
select count(*) from public.app_admins a join auth.users u on u.id = a.user_id where lower(u.email) = lower(:'email');
SQL
)"
if [ "$n" = 1 ]; then if [ "$owner" = true ]; then echo "$email ist Superadmin."; else echo "$email ist App-Admin."; fi; else echo "Kein Konto mit $email – zuerst in der App registrieren."; exit 1; fi
