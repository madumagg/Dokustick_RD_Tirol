-- =====================================================================
-- ProtoPilot: Arzneimittellisten – laengere Texte und Link
--
-- * Dosierung und Hinweise (z. B. Kontraindikationen) bis 2000 statt
--   400 bzw. 300 Zeichen (vollstaendige Angaben z. B. beim Penthrox Inhaler)
-- * Neue Spalte url: Link fuer mehr Infos, z. B. ins Medikamentenlexikon
--   (nur http/https)
-- * admin_import_catalog: CSV-Import der Arzneimittellisten mit Link
--
-- Nach 20261028180000_arzneimittellisten.sql im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
-- =====================================================================

alter table public.drug_list_entries drop constraint if exists drug_list_entries_dose_check;
alter table public.drug_list_entries add constraint drug_list_entries_dose_check check (char_length(dose) <= 2000);
alter table public.drug_list_entries drop constraint if exists drug_list_entries_note_check;
alter table public.drug_list_entries add constraint drug_list_entries_note_check check (char_length(note) <= 2000);

alter table public.drug_list_entries add column if not exists url text not null default '';
alter table public.drug_list_entries drop constraint if exists drug_list_entries_url_check;
alter table public.drug_list_entries add constraint drug_list_entries_url_check
  check (url = '' or (url ~* '^https?://[^[:space:]]+$' and char_length(url) <= 500));
comment on column public.drug_list_entries.url is 'Link fuer mehr Infos, z. B. ins Medikamentenlexikon (nur http/https)';

-- Import: wie 20261028180000_arzneimittellisten.sql, Arzneimittellisten zusaetzlich mit url
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
  elsif p_kind in ('al1', 'al2') then
    insert into public.drug_list_entries (list, name, indication, ingredient, dose, note, url, approved)
      select right(p_kind, 1)::smallint, trim(r ->> 'name'), trim(r ->> 'indication'),
        coalesce(trim(r ->> 'ingredient'), ''), coalesce(trim(r ->> 'dose'), ''), coalesce(trim(r ->> 'note'), ''),
        coalesce(trim(r ->> 'url'), ''), true
      from jsonb_array_elements(p_rows) r
      where coalesce(trim(r ->> 'name'), '') <> '' and coalesce(trim(r ->> 'indication'), '') <> ''
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
