-- =====================================================================
-- ProtoPilot: Arzneimittellisten – Korrektur der Startdaten
--
-- Rueckmeldung nach der fachlichen Pruefung:
--   * Liste 1: Stesolid getrennt als Rektiole 5 mg und 10 mg
--   * Liste 2: Amiodaron getrennt als 300 mg und 150 mg
--     (statt "Sedacoron 150 mg/3 ml i.v.")
-- Die alten Eintraege aus 20261028180000_arzneimittellisten.sql werden nur
-- geloescht, wenn sie noch unveraendert sind. In der App geaenderte Eintraege
-- bleiben, wie sie sind.
--
-- Nach 20261028180000_arzneimittellisten.sql im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
-- =====================================================================

insert into public.drug_list_entries (list, indication, name, ingredient, dose, note, approved) values
  (1, 'Bestehender zerebraler Krampfanfall', 'Stesolid Rektiole 5 mg', 'Diazepam',
    '1.–3. vLJ / 10–15 kg KG: 5 mg rektal, ab 65. LJ: 5 mg rektal. Über 8 Jahre soll Midazolam nasal über MAD gegeben werden.',
    'KI: Kinder unter 1. vLJ', true),
  (1, 'Bestehender zerebraler Krampfanfall', 'Stesolid Rektiole 10 mg', 'Diazepam',
    '3.–65. vLJ: 10 mg rektal. Über 8 Jahre soll Midazolam nasal über MAD gegeben werden.',
    'KI: Kinder unter 1. vLJ', true),
  (2, 'Atem-Kreislauf-Stillstand', 'Amiodaron 300 mg i.v.', 'Amiodaron (Sedacoron 150 mg/3 ml)',
    'Nur schockbarer Rhythmus. Erwachsene: 300 mg i.v. nach dem 3. erfolglosen Schock. Kinder ab 6 J.: 5 mg/kg KG i.v. nach dem 3. erfolglosen Schock.',
    '', true),
  (2, 'Atem-Kreislauf-Stillstand', 'Amiodaron 150 mg i.v.', 'Amiodaron (Sedacoron 150 mg/3 ml)',
    'Nur schockbarer Rhythmus. Erwachsene: einmalig 150 mg i.v. nach dem 5. erfolglosen Schock. Kinder ab 6 J.: einmalig 5 mg/kg KG i.v. nach dem 5. erfolglosen Schock.',
    '', true)
on conflict do nothing;

-- Alte Sammel-Eintraege entfernen, solange sie unveraendert aus den Startdaten stammen
delete from public.drug_list_entries
where list = 1 and name = 'Stesolid Rektiole' and indication = 'Bestehender zerebraler Krampfanfall'
  and dose = 'Patient:innen < 8 Jahre: 1.–3. vLJ / 10–15 kg 5 mg, 3.–65. vLJ 10 mg, ab 65. LJ 5 mg rektal.';

delete from public.drug_list_entries
where list = 2 and name = 'Sedacoron 150 mg/3 ml i.v.' and indication = 'Atem-Kreislauf-Stillstand'
  and dose = 'Nur schockbarer Rhythmus. Erwachsene 300 mg i.v. nach dem 3. erfolglosen Schock, einmalig 150 mg nach dem 5. Kinder ab 6 J. 5 mg/kg KG i.v. nach dem 3. und einmalig nach dem 5. Schock.';
