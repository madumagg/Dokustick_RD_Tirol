-- =====================================================================
-- DokuStick: Administration (Erweiterung zum Schema)
--
-- Nach 20261023120000_schema.sql im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
--
-- Der zuerst registrierte Benutzer wird automatisch App-Admin,
-- solange es noch keinen gibt. Weitere Admins ernennt man in der App.
-- =====================================================================

-- --- Tabellen --------------------------------------------------------

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

-- Genau eine Zeile mit den App-Einstellungen
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  signup_mode text not null default 'open' check (signup_mode in ('open', 'domains', 'closed')),
  allowed_domains text[] not null default '{}',
  default_team uuid references public.teams on delete set null,
  announcement text not null default '' check (char_length(announcement) <= 1000),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict do nothing;

-- Erster Admin: der zuerst registrierte Benutzer
insert into public.app_admins (user_id)
  select id from auth.users
  where not exists (select 1 from public.app_admins)
  order by created_at limit 1;

alter table public.app_admins enable row level security;
alter table public.app_settings enable row level security;
revoke all on public.app_admins, public.app_settings from anon, authenticated;

-- --- Hilfsfunktionen -------------------------------------------------

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.require_superadmin()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
end;
$$;

-- Fuer die App: Hinweis an alle und Registrierungsregeln (auch ohne Anmeldung lesbar)
create or replace function public.app_info()
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'signup_mode', signup_mode,
    'allowed_domains', allowed_domains,
    'announcement', announcement,
    'is_admin', public.is_superadmin())
  from public.app_settings;
$$;

-- --- Registrierung pruefen & Standard-Team ---------------------------

create or replace function public.check_signup()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  s public.app_settings;
  domain text := lower(split_part(new.email, '@', 2));
begin
  select * into s from public.app_settings;
  if s.signup_mode = 'closed' then
    raise exception 'Die Registrierung ist derzeit geschlossen.';
  elsif s.signup_mode = 'domains'
    and not exists (select 1 from unnest(s.allowed_domains) d where lower(trim(leading '@' from d)) = domain) then
    raise exception 'Diese E-Mail-Domain ist nicht zugelassen.';
  end if;
  return new;
end;
$$;

drop trigger if exists dokustick_check_signup on auth.users;
create trigger dokustick_check_signup before insert on auth.users
  for each row execute function public.check_signup();

create or replace function public.join_default_team()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  t uuid;
begin
  select default_team into t from public.app_settings;
  if t is not null then
    insert into public.team_members (team_id, user_id, role, email)
      values (t, new.id, 'member', new.email)
      on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists dokustick_join_default_team on auth.users;
create trigger dokustick_join_default_team after insert on auth.users
  for each row execute function public.join_default_team();

-- --- Admin: Uebersicht & Einstellungen -------------------------------

create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  return json_build_object(
    'users', (select count(*) from auth.users),
    'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'banned', (select count(*) from auth.users where banned_until > now()),
    'teams', (select count(*) from public.teams),
    'modules', (select count(*) from public.items where kind = 'module' and not deleted),
    'forms', (select count(*) from public.items where kind = 'form' and not deleted),
    'settings', (select row_to_json(s) from public.app_settings s));
end;
$$;

create or replace function public.admin_save_settings(
  p_signup_mode text, p_allowed_domains text[], p_default_team uuid, p_announcement text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  update public.app_settings set
    signup_mode = p_signup_mode,
    allowed_domains = coalesce((select array_agg(distinct lower(trim(leading '@' from trim(d))))
                                from unnest(p_allowed_domains) d where trim(d) <> ''), '{}'),
    default_team = p_default_team,
    announcement = coalesce(p_announcement, ''),
    updated_at = now()
  where id;
end;
$$;

-- --- Admin: Benutzer -------------------------------------------------

create or replace function public.admin_users()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
               confirmed boolean, banned boolean, is_admin boolean, teams text)
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
         from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = u.id)
    from auth.users u
    order by u.created_at desc;
end;
$$;

create or replace function public.admin_set_banned(p_user uuid, p_banned boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  if p_user = auth.uid() then
    raise exception 'Du kannst dich nicht selbst sperren.';
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

-- --- Admin: Teams ----------------------------------------------------

create or replace function public.admin_teams()
returns table (id uuid, name text, created_at timestamptz, members bigint, admins text, items bigint, code text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  return query
    select t.id, t.name, t.created_at,
      (select count(*) from public.team_members m where m.team_id = t.id),
      (select string_agg(m.email, ', ' order by m.email) from public.team_members m where m.team_id = t.id and m.role = 'admin'),
      (select count(*) from public.items i where i.team_id = t.id and not i.deleted),
      (select c.code from public.team_invites c where c.team_id = t.id)
    from public.teams t
    order by t.name;
end;
$$;

create or replace function public.admin_team_members(p_team uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  return query
    select m.user_id, coalesce(u.email::text, m.email), m.role, m.joined_at
    from public.team_members m left join auth.users u on u.id = m.user_id
    where m.team_id = p_team
    order by m.role, 2;
end;
$$;

create or replace function public.admin_create_team(p_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  t uuid;
begin
  perform public.require_superadmin();
  insert into public.teams (name) values (trim(p_name)) returning id into t;
  insert into public.team_invites (team_id, code) values (t, public.new_join_code());
  return t;
end;
$$;

create or replace function public.admin_rename_team(p_team uuid, p_name text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  update public.teams set name = trim(p_name) where id = p_team;
end;
$$;

create or replace function public.admin_delete_team(p_team uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  delete from public.teams where id = p_team;
end;
$$;

create or replace function public.admin_new_team_code(p_team uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  c text := public.new_join_code();
begin
  perform public.require_superadmin();
  insert into public.team_invites (team_id, code) values (p_team, c)
    on conflict (team_id) do update set code = excluded.code;
  return c;
end;
$$;

create or replace function public.admin_add_member(p_team uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  u auth.users;
begin
  perform public.require_superadmin();
  select * into u from auth.users where lower(email) = lower(trim(p_email));
  if u.id is null then
    raise exception 'Kein Benutzer mit dieser E-Mail-Adresse registriert.';
  end if;
  insert into public.team_members (team_id, user_id, role, email)
    values (p_team, u.id, p_role, u.email)
    on conflict (team_id, user_id) do update set role = excluded.role;
end;
$$;

create or replace function public.admin_set_member_role(p_team uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  update public.team_members set role = p_role where team_id = p_team and user_id = p_user;
end;
$$;

create or replace function public.admin_remove_member(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  -- Letzten Admin nicht entfernen, solange noch andere Mitglieder da sind
  if exists (select 1 from public.team_members where team_id = p_team and user_id = p_user and role = 'admin')
    and not exists (select 1 from public.team_members where team_id = p_team and role = 'admin' and user_id <> p_user)
    and exists (select 1 from public.team_members where team_id = p_team and user_id <> p_user) then
    raise exception 'Das Team braucht mindestens einen Admin. Ernenne zuerst jemand anderen zum Admin.';
  end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
end;
$$;

-- --- Rechte ----------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_overview()', 'admin_save_settings(text, text[], uuid, text)', 'admin_users()',
    'admin_set_banned(uuid, boolean)', 'admin_set_superadmin(uuid, boolean)', 'admin_delete_user(uuid)',
    'admin_teams()', 'admin_team_members(uuid)', 'admin_create_team(text)', 'admin_rename_team(uuid, text)',
    'admin_delete_team(uuid)', 'admin_new_team_code(uuid)', 'admin_add_member(uuid, text, text)',
    'admin_set_member_role(uuid, uuid, text)', 'admin_remove_member(uuid, uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

revoke execute on function public.check_signup(), public.join_default_team(), public.require_superadmin() from public, anon, authenticated;
grant execute on function public.app_info() to anon, authenticated;
