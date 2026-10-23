-- =====================================================================
-- DokuStick: Datenbank-Schema fuer Supabase
--
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausfuehren.
-- Das Skript kann gefahrlos mehrmals ausgefuehrt werden.
--
-- Zugriffsregeln (Row Level Security):
--   * Eigene Bausteine/Formulare sieht und aendert nur der Besitzer.
--   * Team-Bausteine sehen alle Team-Mitglieder, aendern duerfen nur Admins.
--   * Den Beitrittscode eines Teams sehen nur dessen Admins.
-- =====================================================================

-- --- Tabellen --------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  email text,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members (user_id);

-- Beitrittscodes getrennt, damit nur Admins sie lesen koennen
create table if not exists public.team_invites (
  team_id uuid primary key references public.teams on delete cascade,
  code text not null unique
);

-- Textbausteine (kind = 'module') und Formulare (kind = 'form')
create table if not exists public.items (
  id uuid primary key,
  owner_id uuid references auth.users on delete cascade,
  team_id uuid references public.teams on delete cascade,
  kind text not null check (kind in ('module', 'form')),
  title text not null default '' check (char_length(title) <= 200),
  category text not null default '' check (char_length(category) <= 100),
  body text not null default '' check (char_length(body) <= 20000),
  sort double precision not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- entweder eigener oder Team-Eintrag
  check ((owner_id is null) <> (team_id is null))
);
create index if not exists items_owner_idx on public.items (owner_id);
create index if not exists items_team_idx on public.items (team_id);

create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- --- Hilfsfunktionen -------------------------------------------------

create or replace function public.is_team_member(t uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid());
$$;

create or replace function public.is_team_admin(t uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.new_join_code()
returns text language sql volatile set search_path = ''
as $$
  -- 8 Zeichen ohne leicht verwechselbare Zeichen (0/O, 1/I)
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 8);
$$;

-- --- Trigger ---------------------------------------------------------

-- Zeitstempel und Bearbeiter immer serverseitig setzen
create or replace function public.items_touch()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.items_touch();

create or replace function public.settings_touch()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists settings_touch on public.user_settings;
create trigger settings_touch before insert or update on public.user_settings
  for each row execute function public.settings_touch();

-- Ein Team braucht immer einen Admin; ohne Mitglieder wird es geloescht
create or replace function public.team_members_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  t uuid := coalesce(old.team_id, new.team_id);
begin
  if not exists (select 1 from public.team_members where team_id = t) then
    delete from public.teams where id = t;
  elsif auth.uid() is not null
    and not exists (select 1 from public.team_members where team_id = t and role = 'admin') then
    raise exception 'Das Team braucht mindestens einen Admin. Ernenne zuerst jemand anderen zum Admin.';
  end if;
  return null;
end;
$$;

drop trigger if exists team_members_guard on public.team_members;
create trigger team_members_guard after delete or update on public.team_members
  for each row execute function public.team_members_guard();

-- --- Zugriffsregeln --------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.items enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Mitglieder sehen ihr Team" on public.teams;
create policy "Mitglieder sehen ihr Team" on public.teams
  for select to authenticated using (public.is_team_member(id));
drop policy if exists "Admins benennen Team um" on public.teams;
create policy "Admins benennen Team um" on public.teams
  for update to authenticated using (public.is_team_admin(id)) with check (public.is_team_admin(id));
drop policy if exists "Admins loeschen Team" on public.teams;
create policy "Admins loeschen Team" on public.teams
  for delete to authenticated using (public.is_team_admin(id));

drop policy if exists "Eigene Mitgliedschaft oder Admin" on public.team_members;
create policy "Eigene Mitgliedschaft oder Admin" on public.team_members
  for select to authenticated using (user_id = auth.uid() or public.is_team_admin(team_id));
drop policy if exists "Austreten oder Admin entfernt" on public.team_members;
create policy "Austreten oder Admin entfernt" on public.team_members
  for delete to authenticated using (user_id = auth.uid() or public.is_team_admin(team_id));
drop policy if exists "Admins aendern Rollen" on public.team_members;
create policy "Admins aendern Rollen" on public.team_members
  for update to authenticated using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));

drop policy if exists "Admins sehen Beitrittscode" on public.team_invites;
create policy "Admins sehen Beitrittscode" on public.team_invites
  for select to authenticated using (public.is_team_admin(team_id));

drop policy if exists "Eigene und Team-Eintraege lesen" on public.items;
create policy "Eigene und Team-Eintraege lesen" on public.items
  for select to authenticated using (owner_id = auth.uid() or public.is_team_member(team_id));
drop policy if exists "Eigene oder als Admin anlegen" on public.items;
create policy "Eigene oder als Admin anlegen" on public.items
  for insert to authenticated with check (owner_id = auth.uid() or public.is_team_admin(team_id));
drop policy if exists "Eigene oder als Admin aendern" on public.items;
create policy "Eigene oder als Admin aendern" on public.items
  for update to authenticated
  using (owner_id = auth.uid() or public.is_team_admin(team_id))
  with check (owner_id = auth.uid() or public.is_team_admin(team_id));

drop policy if exists "Eigene Einstellungen" on public.user_settings;
create policy "Eigene Einstellungen" on public.user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Nicht angemeldete Besucher bekommen keinerlei Zugriff
revoke all on public.teams, public.team_members, public.team_invites, public.items, public.user_settings from anon;
grant select, insert, update on public.items to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select, update, delete on public.teams to authenticated;
grant select, update, delete on public.team_members to authenticated;
grant select on public.team_invites to authenticated;
revoke insert on public.teams, public.team_members, public.team_invites from authenticated;
revoke delete on public.items, public.user_settings from authenticated;

-- --- Team-Funktionen (aus der App aufgerufen) ------------------------

create or replace function public.create_team(p_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  t uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  insert into public.teams (name) values (trim(p_name)) returning id into t;
  insert into public.team_members (team_id, user_id, role, email)
    values (t, auth.uid(), 'admin', auth.jwt() ->> 'email');
  insert into public.team_invites (team_id, code) values (t, public.new_join_code());
  return t;
end;
$$;

create or replace function public.join_team(p_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  t uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  select team_id into t from public.team_invites where code = upper(replace(trim(p_code), ' ', ''));
  if t is null then
    raise exception 'Beitrittscode ungültig';
  end if;
  insert into public.team_members (team_id, user_id, role, email)
    values (t, auth.uid(), 'member', auth.jwt() ->> 'email')
    on conflict (team_id, user_id) do nothing;
  return t;
end;
$$;

create or replace function public.new_team_code(p_team uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  c text := public.new_join_code();
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Nur Admins können den Code ändern';
  end if;
  update public.team_invites set code = c where team_id = p_team;
  return c;
end;
$$;

revoke execute on function public.create_team(text), public.join_team(text), public.new_team_code(uuid) from public, anon;
grant execute on function public.create_team(text), public.join_team(text), public.new_team_code(uuid) to authenticated;
revoke execute on function public.team_members_guard(), public.new_join_code() from public, anon, authenticated;
