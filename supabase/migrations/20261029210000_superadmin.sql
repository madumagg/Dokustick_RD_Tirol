-- =====================================================================
-- ProtoPilot: Superadmin (geschuetzter App-Admin)
--
-- Ein Superadmin ist ein App-Admin mit Spalte app_admins.owner = true.
--   * Niemand kann einem Superadmin die Admin-Rechte entziehen, ihn sperren
--     oder sein Konto loeschen (auch kein anderer Superadmin). Dafuer muss
--     zuerst die Superadmin-Rolle entfernt werden.
--   * Superadmins ernennen und entfernen kann nur ein Superadmin
--     (admin_set_owner). Mindestens einer bleibt immer.
--   * Der erste Superadmin wird einmalig im SQL-Editor eingetragen:
--       update public.app_admins set owner = true
--       where user_id = (select id from auth.users where lower(email) = lower('name@beispiel.at'));
--
-- Nach den bisherigen Migrationen im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
-- =====================================================================

alter table public.app_admins add column if not exists owner boolean not null default false;
comment on column public.app_admins.owner is 'Superadmin: geschuetzt, verwaltet die Superadmins';

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid() and owner);
$$;

-- Fehler, wenn das Konto ein Superadmin ist (Schutz vor Entziehen, Sperren, Loeschen)
create or replace function public.require_not_owner(p_user uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.app_admins where user_id = p_user and owner) then
    raise exception 'Superadmins sind geschützt. Zuerst muss ein Superadmin die Superadmin-Rolle entfernen.' using errcode = '42501';
  end if;
end;
$$;

-- --- Bestehende Admin-Funktionen mit Schutz --------------------------

create or replace function public.admin_set_banned(p_user uuid, p_banned boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  if p_user = auth.uid() then
    raise exception 'Du kannst dich nicht selbst sperren.';
  end if;
  if p_banned then
    perform public.require_not_owner(p_user);
  end if;
  -- Kein 'infinity': das kann der Supabase-Login-Dienst nicht lesen
  update auth.users set banned_until = case when p_banned then '2999-12-31'::timestamptz else null end
    where id = p_user;
  -- Bestehende Anmeldungen beenden
  if p_banned then
    delete from auth.sessions where user_id = p_user;
  end if;
end;
$$;

create or replace function public.admin_set_superadmin(p_user uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  if p_admin then
    insert into public.app_admins (user_id) values (p_user) on conflict do nothing;
  else
    if p_user = auth.uid() then
      raise exception 'Du kannst dir die Admin-Rechte nicht selbst entziehen.';
    end if;
    perform public.require_not_owner(p_user);
    delete from public.app_admins where user_id = p_user;
  end if;
end;
$$;

create or replace function public.admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  t record;
begin
  perform public.require_superadmin();
  if p_user = auth.uid() then
    raise exception 'Du kannst dein eigenes Konto hier nicht löschen.';
  end if;
  perform public.require_not_owner(p_user);
  -- Teams, in denen der Benutzer einziger Admin ist, bekommen einen neuen Admin
  for t in
    select m.team_id from public.team_members m
    where m.user_id = p_user and m.role = 'admin'
      and not exists (select 1 from public.team_members o where o.team_id = m.team_id and o.role = 'admin' and o.user_id <> p_user)
  loop
    update public.team_members set role = 'admin'
      where team_id = t.team_id and user_id = (
        select user_id from public.team_members where team_id = t.team_id and user_id <> p_user order by joined_at limit 1);
  end loop;
  delete from auth.users where id = p_user;
end;
$$;

-- --- Superadmins verwalten (nur Superadmins) -------------------------

create or replace function public.admin_set_owner(p_user uuid, p_owner boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Nur ein Superadmin kann Superadmins ernennen oder entfernen.' using errcode = '42501';
  end if;
  if p_owner then
    if not exists (select 1 from auth.users where id = p_user) then
      raise exception 'Kein Benutzer mit dieser ID.';
    end if;
    insert into public.app_admins (user_id, owner) values (p_user, true)
      on conflict (user_id) do update set owner = true;
  else
    if exists (select 1 from public.app_admins where user_id = p_user and owner)
      and (select count(*) from public.app_admins where owner) <= 1 then
      raise exception 'Es muss mindestens ein Superadmin bleiben.';
    end if;
    update public.app_admins set owner = false where user_id = p_user;
  end if;
end;
$$;

-- --- Benutzerliste mit Superadmin-Kennzeichen ------------------------
-- Rueckgabetyp aendert sich (neue Spalte is_owner), daher neu anlegen

drop function if exists public.admin_users();
create function public.admin_users()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
               confirmed boolean, banned boolean, is_admin boolean, teams text, is_owner boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
      u.email_confirmed_at is not null,
      coalesce(u.banned_until > now(), false),
      exists (select 1 from public.app_admins a where a.user_id = u.id),
      (select string_agg(t.name || case when m.role = 'admin' then ' (Admin)' else '' end, ', ' order by t.name)
         from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = u.id),
      exists (select 1 from public.app_admins a where a.user_id = u.id and a.owner)
    from auth.users u
    order by u.created_at desc;
end;
$$;

-- app_info um is_owner erweitern (sonst unveraendert, siehe 20261028120000_themes.sql)
create or replace function public.app_info()
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'signup_mode', signup_mode,
    'allowed_domains', allowed_domains,
    'announcement', announcement,
    'is_admin', public.is_superadmin(),
    'is_owner', public.is_owner(),
    'standard_team', (select id from public.teams where is_standard),
    'themes', public.my_themes())
  from public.app_settings;
$$;

-- --- Rechte ----------------------------------------------------------

revoke execute on function public.admin_users(), public.admin_set_owner(uuid, boolean) from public, anon;
grant execute on function public.admin_users(), public.admin_set_owner(uuid, boolean) to authenticated;
revoke execute on function public.require_not_owner(uuid) from public, anon, authenticated;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.app_info() to anon, authenticated;
