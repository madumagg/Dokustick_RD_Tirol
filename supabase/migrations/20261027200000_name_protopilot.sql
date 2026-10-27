-- =====================================================================
-- ProtoPilot (vorher DokuStick): neuer Name in den haeufigen Fragen.
-- Aendert nur Eintraege, in denen noch "DokuStick" steht. Kann gefahrlos
-- mehrmals ausgefuehrt werden.
-- =====================================================================
update public.support_faq
   set question = replace(question, 'DokuStick', 'ProtoPilot'),
       answer = replace(replace(answer, 'DokuStick', 'ProtoPilot'),
                        '„ProtoPilot“ in den Bluetooth-Einstellungen',
                        '„ProtoPilot“ (ältere Firmware: „DokuStick“) in den Bluetooth-Einstellungen')
 where (question like '%DokuStick%' or answer like '%DokuStick%')
   and answer not like '%ältere Firmware: „DokuStick“%';
