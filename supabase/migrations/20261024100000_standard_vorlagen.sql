-- =====================================================================
-- DokuStick: Standard-Bausteine und Protokollvorlagen
--
-- Nach den bisherigen Migrationen im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
--
--  * Standard-Bereich: ein besonderes Team (teams.is_standard) ohne Mitglieder.
--    Seine Eintraege sehen alle angemeldeten Benutzer, aendern duerfen nur
--    App-Admins. Aeltere App-Versionen behandeln sie wie fremde
--    Team-Eintraege (nutzen und kopieren, nicht aendern).
--  * Protokollvorlagen: items.kind = 'protocol', body = JSON mit den
--    Baustein-IDs in Reihenfolge: {"items": ["<uuid>", ...]}
-- =====================================================================

-- --- Standard-Bereich ------------------------------------------------

alter table public.teams add column if not exists is_standard boolean not null default false;
create unique index if not exists teams_one_standard on public.teams (is_standard) where is_standard;
insert into public.teams (name, is_standard)
  select 'Standard', true where not exists (select 1 from public.teams where is_standard);

create or replace function public.is_standard_team(t uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.teams where id = t and is_standard);
$$;

create or replace function public.require_not_standard(t uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.is_standard_team(t) then
    raise exception 'Der Standard-Bereich ist kein Team und hat keine Mitglieder.';
  end if;
end;
$$;

-- --- Protokollvorlagen -----------------------------------------------

alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('module', 'form', 'protocol'));

-- --- Zugriffsregeln --------------------------------------------------

drop policy if exists "Mitglieder sehen ihr Team" on public.teams;
create policy "Mitglieder sehen ihr Team" on public.teams
  for select to authenticated using (public.is_team_member(id) or is_standard);

drop policy if exists "Eigene und Team-Eintraege lesen" on public.items;
create policy "Eigene und Team-Eintraege lesen" on public.items
  for select to authenticated
  using (owner_id = auth.uid() or public.is_team_member(team_id) or public.is_standard_team(team_id));
drop policy if exists "Eigene oder als Admin anlegen" on public.items;
create policy "Eigene oder als Admin anlegen" on public.items
  for insert to authenticated
  with check (owner_id = auth.uid() or public.is_team_admin(team_id)
              or (public.is_standard_team(team_id) and public.is_superadmin()));
drop policy if exists "Eigene oder als Admin aendern" on public.items;
create policy "Eigene oder als Admin aendern" on public.items
  for update to authenticated
  using (owner_id = auth.uid() or public.is_team_admin(team_id)
         or (public.is_standard_team(team_id) and public.is_superadmin()))
  with check (owner_id = auth.uid() or public.is_team_admin(team_id)
              or (public.is_standard_team(team_id) and public.is_superadmin()));

-- --- App-Info: Standard-Bereich bekanntgeben -------------------------

create or replace function public.app_info()
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'signup_mode', signup_mode,
    'allowed_domains', allowed_domains,
    'announcement', announcement,
    'is_admin', public.is_superadmin(),
    'standard_team', (select id from public.teams where is_standard))
  from public.app_settings;
$$;

-- --- Admin-Funktionen: Standard-Bereich ist kein normales Team -------

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
    'teams', (select count(*) from public.teams where not is_standard),
    'modules', (select count(*) from public.items where kind = 'module' and not deleted),
    'forms', (select count(*) from public.items where kind = 'form' and not deleted),
    'protocols', (select count(*) from public.items where kind = 'protocol' and not deleted),
    'settings', (select row_to_json(s) from public.app_settings s));
end;
$$;

create or replace function public.admin_save_settings(
  p_signup_mode text, p_allowed_domains text[], p_default_team uuid, p_announcement text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  perform public.require_not_standard(p_default_team);
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
    where not t.is_standard
    order by t.name;
end;
$$;

create or replace function public.admin_rename_team(p_team uuid, p_name text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  perform public.require_not_standard(p_team);
  update public.teams set name = trim(p_name) where id = p_team;
end;
$$;

create or replace function public.admin_delete_team(p_team uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  perform public.require_not_standard(p_team);
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
  perform public.require_not_standard(p_team);
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
  perform public.require_not_standard(p_team);
  select * into u from auth.users where lower(email) = lower(trim(p_email));
  if u.id is null then
    raise exception 'Kein Benutzer mit dieser E-Mail-Adresse registriert.';
  end if;
  insert into public.team_members (team_id, user_id, role, email)
    values (p_team, u.id, p_role, u.email)
    on conflict (team_id, user_id) do update set role = excluded.role;
end;
$$;

revoke execute on function public.is_standard_team(uuid), public.require_not_standard(uuid) from public, anon;
grant execute on function public.is_standard_team(uuid) to authenticated;
revoke execute on function public.require_not_standard(uuid) from authenticated;
