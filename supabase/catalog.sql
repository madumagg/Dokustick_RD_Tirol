-- =====================================================================
-- DokuStick: Medikamente- und Krankheiten-Datenbank
--
-- Nach schema.sql und admin.sql im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
--
-- Regeln:
--   * Angemeldete Benutzer sehen alle freigegebenen Eintraege und ihre eigenen Vorschlaege.
--   * Jeder kann Eintraege vorschlagen; sie werden erst nach Freigabe durch einen
--     App-Admin fuer alle sichtbar. Eigene offene Vorschlaege darf man aendern/loeschen.
--   * App-Admins sehen alles, geben frei, bearbeiten, loeschen und importieren.
--   * Doppelte Eintraege (gleicher Handelsname + Dosis bzw. gleicher Name) sind nicht moeglich.
-- =====================================================================

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  trade_name text not null check (char_length(trim(trade_name)) between 1 and 120),
  ingredient text not null default '' check (char_length(ingredient) <= 200),
  dose text not null default '' check (char_length(dose) <= 60),
  approved boolean not null default false,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists medications_unique on public.medications (lower(trim(trade_name)), lower(trim(dose)));

create table if not exists public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 150),
  abbreviation text not null default '' check (char_length(abbreviation) <= 30),
  approved boolean not null default false,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists diagnoses_unique on public.diagnoses (lower(trim(name)));

-- --- Ersteller, Freigabe und Zeitstempel serverseitig setzen ---------

create or replace function public.catalog_touch()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.approved and (tg_op = 'INSERT' or not old.approved) then
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif not new.approved then
    new.approved_by := null;
    new.approved_at := null;
  else
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists medications_touch on public.medications;
create trigger medications_touch before insert or update on public.medications
  for each row execute function public.catalog_touch();
drop trigger if exists diagnoses_touch on public.diagnoses;
create trigger diagnoses_touch before insert or update on public.diagnoses
  for each row execute function public.catalog_touch();

-- --- Zugriffsregeln (fuer beide Tabellen gleich) ---------------------

do $$
declare
  t text;
begin
  foreach t in array array['medications', 'diagnoses'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "Freigegebene und eigene lesen" on public.%I', t);
    execute format('create policy "Freigegebene und eigene lesen" on public.%I for select to authenticated
      using (approved or created_by = auth.uid() or public.is_superadmin())', t);

    execute format('drop policy if exists "Vorschlagen" on public.%I', t);
    execute format('create policy "Vorschlagen" on public.%I for insert to authenticated
      with check (not approved or public.is_superadmin())', t);

    execute format('drop policy if exists "Admins bearbeiten" on public.%I', t);
    execute format('create policy "Admins bearbeiten" on public.%I for update to authenticated
      using (public.is_superadmin()) with check (public.is_superadmin())', t);

    execute format('drop policy if exists "Eigene offene Vorschlaege bearbeiten" on public.%I', t);
    execute format('create policy "Eigene offene Vorschlaege bearbeiten" on public.%I for update to authenticated
      using (created_by = auth.uid() and not approved) with check (created_by = auth.uid() and not approved)', t);

    execute format('drop policy if exists "Loeschen" on public.%I', t);
    execute format('create policy "Loeschen" on public.%I for delete to authenticated
      using (public.is_superadmin() or (created_by = auth.uid() and not approved))', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- --- Import fuer Admins (Doppelte werden uebersprungen) -------------

create or replace function public.admin_import_catalog(p_kind text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  perform public.require_superadmin();
  if p_kind = 'med' then
    insert into public.medications (trade_name, ingredient, dose, approved)
      select trim(r ->> 'trade_name'), coalesce(trim(r ->> 'ingredient'), ''), coalesce(trim(r ->> 'dose'), ''), true
      from jsonb_array_elements(p_rows) r
      where coalesce(trim(r ->> 'trade_name'), '') <> ''
      on conflict do nothing;
  elsif p_kind = 'dx' then
    insert into public.diagnoses (name, abbreviation, approved)
      select trim(r ->> 'name'), coalesce(trim(r ->> 'abbreviation'), ''), true
      from jsonb_array_elements(p_rows) r
      where coalesce(trim(r ->> 'name'), '') <> ''
      on conflict do nothing;
  else
    raise exception 'Unbekannte Liste';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.admin_import_catalog(text, jsonb) from public, anon;
grant execute on function public.admin_import_catalog(text, jsonb) to authenticated;
revoke execute on function public.catalog_touch() from public, anon, authenticated;
