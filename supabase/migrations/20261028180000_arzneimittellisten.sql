-- =====================================================================
-- ProtoPilot: Arzneimittelliste 1 und 2 (Datenbank-Reiter "Arzneimittellisten")
--
-- Ein Eintrag = ein Medikament fuer ein Krankheitsbild, wie in der Uebersicht
-- der Arzneimittellisten (RD Tirol, Update 2022). Dasselbe Medikament kann fuer
-- mehrere Krankheitsbilder eingetragen sein (z. B. Dibondrin).
--   * list 1 = Arzneimittelliste 1 (Notfallsanitaeter:innen, ohne Notarzt-Nachforderung)
--   * list 2 = Arzneimittelliste 2 (Notkompetenz NKA/NKV nach Paragraf 11 SanG)
-- In Bausteinen: {{Medikamente:@al2}} sucht in Liste 2, {{Krankheitsbild?:@kb2}}
-- bietet die Krankheitsbilder von Liste 2 zur Auswahl an.
--
-- Regeln wie bei Medikamenten/Krankheiten (20261023120200_catalog.sql):
-- Vorschlaege von allen, Freigabe, Aenderung und Import durch App-Admins.
--
-- Nach den bisherigen Migrationen im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
-- =====================================================================

create table if not exists public.drug_list_entries (
  id uuid primary key default gen_random_uuid(),
  list smallint not null check (list in (1, 2)),
  name text not null check (char_length(trim(name)) between 1 and 120),
  indication text not null check (char_length(trim(indication)) between 1 and 150),
  ingredient text not null default '' check (char_length(ingredient) <= 200),
  dose text not null default '' check (char_length(dose) <= 400),
  note text not null default '' check (char_length(note) <= 300),
  approved boolean not null default false,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists drug_list_entries_unique
  on public.drug_list_entries (list, lower(trim(name)), lower(trim(indication)));

comment on table public.drug_list_entries is 'Arzneimittelliste 1 und 2: Medikament je Krankheitsbild';
comment on column public.drug_list_entries.name is 'Medikament, wie es im Protokoll erscheint, z. B. "Glucose 33 % i.v."';
comment on column public.drug_list_entries.indication is 'Krankheitsbild (Indikation), z. B. "Hypoglykämie"';
comment on column public.drug_list_entries.dose is 'Dosierung laut Liste (nur zur Information, erscheint nicht im Protokoll)';
comment on column public.drug_list_entries.note is 'Hinweise, z. B. Kontraindikationen';

drop trigger if exists drug_list_entries_touch on public.drug_list_entries;
create trigger drug_list_entries_touch before insert or update on public.drug_list_entries
  for each row execute function public.catalog_touch();

-- --- Zugriffsregeln (wie medications/diagnoses) ----------------------

alter table public.drug_list_entries enable row level security;

drop policy if exists "Freigegebene und eigene lesen" on public.drug_list_entries;
create policy "Freigegebene und eigene lesen" on public.drug_list_entries for select to authenticated
  using (approved or created_by = auth.uid() or public.is_superadmin());

drop policy if exists "Vorschlagen" on public.drug_list_entries;
create policy "Vorschlagen" on public.drug_list_entries for insert to authenticated
  with check (not approved or public.is_superadmin());

drop policy if exists "Admins bearbeiten" on public.drug_list_entries;
create policy "Admins bearbeiten" on public.drug_list_entries for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "Eigene offene Vorschlaege bearbeiten" on public.drug_list_entries;
create policy "Eigene offene Vorschlaege bearbeiten" on public.drug_list_entries for update to authenticated
  using (created_by = auth.uid() and not approved) with check (created_by = auth.uid() and not approved);

drop policy if exists "Loeschen" on public.drug_list_entries;
create policy "Loeschen" on public.drug_list_entries for delete to authenticated
  using (public.is_superadmin() or (created_by = auth.uid() and not approved));

revoke all on public.drug_list_entries from anon;
grant select, insert, update, delete on public.drug_list_entries to authenticated;

-- --- Import fuer Admins: jetzt auch 'al1' und 'al2' ------------------
-- Ersetzt die Funktion aus 20261023120200_catalog.sql (med/dx unveraendert).

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
    insert into public.drug_list_entries (list, name, indication, ingredient, dose, note, approved)
      select right(p_kind, 1)::smallint, trim(r ->> 'name'), trim(r ->> 'indication'),
        coalesce(trim(r ->> 'ingredient'), ''), coalesce(trim(r ->> 'dose'), ''), coalesce(trim(r ->> 'note'), ''), true
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

-- --- Startdaten: Arzneimittelliste I + II NEU (RD Tirol, Update 2022) -
-- Abgeschrieben aus der Uebersicht und den Algorithmen der Liste. Vor der
-- Verwendung fachlich pruefen; Aenderungen danach in der App (Reiter Datenbank).

insert into public.drug_list_entries (list, indication, name, ingredient, dose, note, approved) values
  -- Arzneimittelliste 1
  (1, 'Schwere allergische Reaktion', 'EpiPen 0,3 mg i.m.', 'Adrenalin',
    'Autoinjektor, > 30 kg KG / > 12. vLJ: 0,3 mg i.m. Frühestens nach 5 min einmalig wiederholen.',
    'KI: < 15 kg KG, Kinder unter 3. vLJ', true),
  (1, 'Schwere allergische Reaktion', 'EpiPen 0,15 mg i.m.', 'Adrenalin',
    'Autoinjektor, 15–30 kg KG / 3.–12. vLJ: 0,15 mg i.m. Frühestens nach 5 min einmalig wiederholen.',
    'KI: < 15 kg KG, Kinder unter 3. vLJ', true),
  (1, 'Schwere allergische Reaktion', 'Suprarenin 1 mg/ml i.m.', 'Adrenalin (1:1000)',
    'Injektion i.m.: 3.–6. vLJ 0,15 mg, 6.–12. vLJ 0,3 mg, > 12. vLJ 0,5 mg. Wenn kein passender EpiPen für die Wiederholung da ist.',
    'KI: < 15 kg KG, Kinder unter 3. vLJ', true),
  (1, 'Schwellung der oberen Atemwege', 'Suprarenin 1 mg/ml über Verneblermaske', 'Adrenalin (1:1000)',
    'Bis 3. vLJ 0,5 mg, ab 3. vLJ 1 mg inhalativ, mit 3 ml NaCl verdünnt; O2 9 l/min. Keine Wiederholung.',
    'KI: keine', true),
  (1, 'Akutes Koronarsyndrom', 'Aspro Classic 320 mg p.o.', 'Acetylsalicylsäure',
    'Erwachsene: 320 mg p.o. (Tablette). Nicht bei bereits eingenommenem ASS am Notfalltag.',
    'KI: Kinder, Schwangere im 3. Trimenon', true),
  (1, 'Akuter Bronchospasmus', 'Berodualin Inhalationslösung', 'Fenoterol / Ipratropiumbromid',
    '6.–12. vLJ 10 Tropfen, ab 12. vLJ 30 Tropfen, mit 3 ml NaCl verdünnt über Verneblermaske; O2 9 l/min.',
    'KI: < 6. vLJ, Kinder HF > 180, Erwachsene HF > 140', true),
  (1, 'Fieber mit Krampfanfall bei Kindern', 'Paracetamol Supp. 125 mg rektal', 'Paracetamol',
    '6. LM – 2. vLJ: 125 mg rektal.',
    'KI: Paracetamolgabe in den letzten 6 h, Kinder unter 6. vLM', true),
  (1, 'Fieber mit Krampfanfall bei Kindern', 'Paracetamol Supp. 250 mg rektal', 'Paracetamol',
    '2.–8. vLJ: 250 mg rektal.',
    'KI: Paracetamolgabe in den letzten 6 h, Kinder unter 6. vLM', true),
  (1, 'Bestehender zerebraler Krampfanfall', 'Stesolid Rektiole', 'Diazepam',
    'Patient:innen < 8 Jahre: 1.–3. vLJ / 10–15 kg 5 mg, 3.–65. vLJ 10 mg, ab 65. LJ 5 mg rektal.',
    'KI: Kinder unter 1. vLJ', true),
  (1, 'Bestehender zerebraler Krampfanfall', 'Midazolam 5 mg/ml nasal über MAD', 'Midazolam',
    'Ab dem 8. vLJ: 10 mg nasal (5 mg pro Nasenloch).',
    'KI: Kinder unter 1. vLJ', true),
  -- Arzneimittelliste 2
  (2, 'Schwere allergische Reaktion', 'ELO-Mel isoton i.v.', 'Isotone Elektrolytlösung',
    'Zusätzlich zu Adrenalin i.m. (Liste 1). Ab 6. vLJ 250 ml i.v. (max. 20 ml/kg KG), Erwachsene 500 ml i.v. Einmalige Wiederholung nur bei Erwachsenen.',
    'KI: Kinder unter 6. vLJ', true),
  (2, 'Schwere allergische Reaktion', 'Dibondrin 30 mg i.v.', 'Diphenhydramin',
    'Zusätzlich zu Adrenalin i.m. (Liste 1). Einmalig ab 18 kg KG: 30 mg i.v. Keine Wiederholung.',
    'KI: < 18 kg KG', true),
  (2, 'Schwere allergische Reaktion', 'Prednisolon i.v.', 'Prednisolon',
    'Zusätzlich zu Adrenalin i.m. (Liste 1). Einmalig 18–30 kg KG 100 mg i.v., ab 30 kg KG 250 mg i.v. (oder äquivalente Dosis eines anderen Glucocorticoids). Keine Wiederholung.',
    'KI: < 18 kg KG', true),
  (2, 'Allergische Reaktion', 'Dibondrin 30 mg i.v.', 'Diphenhydramin',
    'Einmalig ab 18 kg KG: 30 mg i.v. Keine Wiederholung. Wenn keine schwere allergische Reaktion, auch ohne Adrenalin.',
    'KI: < 18 kg KG', true),
  (2, 'Hypoglykämie', 'Glucose 33 % i.v.', 'Glucose',
    'Ab 6. vLJ und Erwachsene: 15 g i.v. (ca. 50 ml). Bei Bewusstseinsstörung UND BZ < 50 mg/dl. Erwachsene: Wiederholung nach ca. 5 min möglich.',
    'KI: Kinder unter 6. vLJ', true),
  (2, 'Hypovolämie', 'ELO-Mel isoton i.v.', 'Isotone Elektrolytlösung',
    'Kinder ab 6. vLJ: 20 ml/kg KG i.v. (max. 500 ml), Erwachsene: 500 ml i.v. Erwachsene einmalig wiederholbar.',
    'KI: Lungenödem', true),
  (2, 'Bestehender zerebraler Krampfanfall', 'Midazolam i.v.', 'Midazolam',
    'Ab der Pubertät: 2 mg i.v., verdünnt auf 1 mg/ml (1 ml Midazolam 5 mg/ml + 4 ml NaCl). Nur im aktiven Krampf, wenn die Gabe über MAD nicht wirkt oder nicht möglich ist.',
    'KI: Kinder', true),
  (2, 'Starke Schmerzen', 'Paracetamol 10 mg/ml i.v.', 'Paracetamol',
    'Ab Pubertät 1000 mg i.v., 12. vLJ bis Pubertät 15 mg/kg KG i.v. Ab NRS > 3.',
    'KI: < 12. vLJ, schwere Leberschädigung, chron. Alkoholismus, Einnahme innerhalb der letzten 6 h', true),
  (2, 'Atem-Kreislauf-Stillstand', 'Suprarenin 1 mg/ml i.v.', 'Adrenalin',
    'Erwachsene 1 mg i.v., Kinder ab 6 J. 0,01 mg/kg KG i.v. Schockbar: nach dem 3. erfolglosen Schock, nicht schockbar: sobald möglich. Danach nach jeder 2. Rhythmusanalyse (alle 3–5 min).',
    '', true),
  (2, 'Atem-Kreislauf-Stillstand', 'Sedacoron 150 mg/3 ml i.v.', 'Amiodaron',
    'Nur schockbarer Rhythmus. Erwachsene 300 mg i.v. nach dem 3. erfolglosen Schock, einmalig 150 mg nach dem 5. Kinder ab 6 J. 5 mg/kg KG i.v. nach dem 3. und einmalig nach dem 5. Schock.',
    '', true)
on conflict do nothing;
