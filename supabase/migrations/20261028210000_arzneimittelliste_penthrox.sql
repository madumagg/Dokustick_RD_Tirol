-- =====================================================================
-- ProtoPilot: Penthrox Inhaler in Arzneimittelliste 2
--
-- Rueckmeldung aus der fachlichen Pruefung: In Tirol steht der Penthrox
-- Inhaler auf Liste 2. Er darf erst nach Venenzugang und vorheriger
-- Paracetamol-Gabe gegeben werden. Nur wenn kein Venenzugang moeglich ist,
-- darf er sofort gegeben werden.
-- Dosierung und Kontraindikationen sind (noch) nicht eingetragen; sie lassen
-- sich in der App ergaenzen (Datenbank -> Arzneimittellisten -> Liste 2 -> ✎).
--
-- Nach 20261028180000_arzneimittellisten.sql im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
-- =====================================================================

insert into public.drug_list_entries (list, indication, name, ingredient, dose, note, approved) values
  (2, 'Starke Schmerzen', 'Penthrox Inhaler', 'Methoxyfluran',
    'Erst nach Venenzugang und vorheriger Paracetamol-Gabe. Nur wenn kein Venenzugang möglich ist, darf er sofort gegeben werden.',
    '', true)
on conflict do nothing;
