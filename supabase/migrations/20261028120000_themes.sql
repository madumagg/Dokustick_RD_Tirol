-- =====================================================================
-- ProtoPilot: Themes (Designs der App) freigeben
--
-- Welche Themes es gibt, steht in der App (webapp/themes.js). Hier steht nur,
-- wer sie verwenden darf:
--   * App-Admins duerfen immer alle Themes verwenden.
--   * theme_settings.release = 'all': alle Benutzer (auch ohne Konto).
--     Ohne Eintrag gilt 'admins' (neue Themes sind zuerst nur fuer Admins).
--   * theme_unlocks: einzelne Benutzer, die ein App-Admin freigeschaltet hat.
--
-- Die Tabellen sind gesperrt, Zugriff nur ueber die Funktionen unten.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
-- =====================================================================

create table if not exists public.theme_settings (
  theme text primary key check (theme ~ '^[a-z0-9-]{1,40}$'),
  release text not null default 'admins' check (release in ('admins', 'all')),
  updated_at timestamptz not null default now()
);

create table if not exists public.theme_unlocks (
  theme text not null check (theme ~ '^[a-z0-9-]{1,40}$'),
  user_id uuid not null references auth.users on delete cascade,
  granted_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (theme, user_id)
);
create index if not exists theme_unlocks_user on public.theme_unlocks (user_id);

alter table public.theme_settings enable row level security;
alter table public.theme_unlocks enable row level security;
revoke all on public.theme_settings, public.theme_unlocks from anon, authenticated;

-- Themes, die der Aufrufer verwenden darf (ohne die Admin-Regel, die prueft die App
-- ueber is_admin). Ohne Anmeldung nur die fuer alle freigegebenen.
create or replace function public.my_themes()
returns text[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(theme order by theme), '{}') from (
    select theme from public.theme_settings where release = 'all'
    union
    select theme from public.theme_unlocks where user_id = auth.uid()
  ) t;
$$;

-- app_info um die freigegebenen Themes erweitern (sonst unveraendert)
create or replace function public.app_info()
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'signup_mode', signup_mode,
    'allowed_domains', allowed_domains,
    'announcement', announcement,
    'is_admin', public.is_superadmin(),
    'standard_team', (select id from public.teams where is_standard),
    'themes', public.my_themes())
  from public.app_settings;
$$;

-- --- Admin-Funktionen -------------------------------------------------

-- Alle Themes mit Freigabe und freigeschalteten Benutzern
create or replace function public.admin_themes()
returns json language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  return coalesce((
    select json_agg(json_build_object(
      'theme', t.theme,
      'release', coalesce(s.release, 'admins'),
      'users', coalesce((
        select json_agg(json_build_object('id', u.id, 'email', u.email, 'created_at', x.created_at) order by u.email)
          from public.theme_unlocks x join auth.users u on u.id = x.user_id
          where x.theme = t.theme), '[]'::json))
      order by t.theme)
    from (select theme from public.theme_settings union select theme from public.theme_unlocks) t
    left join public.theme_settings s on s.theme = t.theme), '[]'::json);
end;
$$;

create or replace function public.admin_theme_release(p_theme text, p_release text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  insert into public.theme_settings (theme, release) values (p_theme, p_release)
    on conflict (theme) do update set release = excluded.release, updated_at = now();
end;
$$;

-- Einzelnen Benutzer per E-Mail-Adresse freischalten
create or replace function public.admin_theme_unlock(p_theme text, p_email text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  u auth.users;
begin
  perform public.require_superadmin();
  select * into u from auth.users where lower(email) = lower(trim(p_email));
  if u.id is null then
    raise exception 'Kein Benutzer mit dieser E-Mail-Adresse registriert.';
  end if;
  insert into public.theme_unlocks (theme, user_id, granted_by) values (p_theme, u.id, auth.uid())
    on conflict (theme, user_id) do nothing;
  return u.id;
end;
$$;

create or replace function public.admin_theme_lock(p_theme text, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  delete from public.theme_unlocks where theme = p_theme and user_id = p_user;
end;
$$;

-- --- Rechte ----------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array['admin_themes()', 'admin_theme_release(text, text)', 'admin_theme_unlock(text, text)', 'admin_theme_lock(text, uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

grant execute on function public.my_themes() to anon, authenticated;
grant execute on function public.app_info() to anon, authenticated;
