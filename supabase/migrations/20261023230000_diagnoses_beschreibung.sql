-- =====================================================================
-- DokuStick: Krankheiten mit "Abkuerzung / Beschreibung"
--
-- Die Spalte diagnoses.abbreviation nimmt jetzt Abkuerzung und/oder eine
-- kurze Beschreibung auf (bis 300 statt 30 Zeichen).
-- Der Spaltenname bleibt gleich, damit aeltere App-Versionen weiter funktionieren.
--
-- Nach den bisherigen Migrationen im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
-- =====================================================================

alter table public.diagnoses drop constraint if exists diagnoses_abbreviation_check;
alter table public.diagnoses add constraint diagnoses_abbreviation_check check (char_length(abbreviation) <= 300);

comment on column public.diagnoses.abbreviation is 'Abkuerzung und/oder kurze Beschreibung (max. 300 Zeichen), z.B. "KHK, Verengung der Herzkranzgefaesse"';
