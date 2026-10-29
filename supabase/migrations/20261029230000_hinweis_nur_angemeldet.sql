-- =====================================================================
-- ProtoPilot: "Hinweis an alle" nur fuer angemeldete Benutzer
--
-- Die App zeigt ohne Anmeldung nur noch die Anmeldeseite. app_info() liefert
-- den Hinweis deshalb nur an Angemeldete; Registrierungsregeln und freigegebene
-- Themes bleiben auch ohne Anmeldung lesbar (Anmeldeseite).
-- Sonst unveraendert gegenueber 20261029210000_superadmin.sql.
--
-- Nach 20261029210000_superadmin.sql im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
-- =====================================================================

create or replace function public.app_info()
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'signup_mode', signup_mode,
    'allowed_domains', allowed_domains,
    'announcement', case when auth.uid() is null then '' else announcement end,
    'is_admin', public.is_superadmin(),
    'is_owner', public.is_owner(),
    'standard_team', (select id from public.teams where is_standard),
    'themes', public.my_themes())
  from public.app_settings;
$$;

grant execute on function public.app_info() to anon, authenticated;
