-- =====================================================================
-- DokuStick: Support & Feedback (Tickets, Ideen, Haeufige Fragen)
--
-- Nach 20261024100000_standard_vorlagen.sql im Supabase "SQL Editor" ausfuehren.
-- Kann gefahrlos mehrmals ausgefuehrt werden.
--
-- Tickets, Nachrichten, Lesestand und Stimmen sind fuer die App nur ueber die
-- Funktionen unten erreichbar (keine direkten Tabellenrechte). Die Funktionen
-- pruefen selbst, ob der Aufrufer das Ticket erstellt hat oder App-Admin ist.
-- Interne Notizen sehen nur App-Admins. Ideen (veroeffentlichte Vorschlaege)
-- sehen alle angemeldeten Benutzer, aber ohne Namen und Geraeteinfos.
-- =====================================================================

-- --- Tabellen --------------------------------------------------------

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users on delete cascade,
  category text not null check (category in ('frage', 'fehler', 'vorschlag')),
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'offen' check (status in ('offen', 'in_arbeit', 'rueckfrage', 'erledigt')),
  assigned_to uuid references auth.users on delete set null,
  device text not null default '' check (char_length(device) <= 4000),
  public boolean not null default false,   -- als Idee fuer alle sichtbar
  idea_text text not null default '' check (char_length(idea_text) <= 2000),
  created_at timestamptz not null default now(),
  last_user_at timestamptz not null default now(),  -- letzte Nachricht der Person
  last_admin_at timestamptz                          -- letzte sichtbare Antwort vom Support
);
create index if not exists support_tickets_created_by on public.support_tickets (created_by);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,  -- Reihenfolge, auch innerhalb einer Transaktion
  ticket_id uuid not null references public.support_tickets on delete cascade,
  author uuid references auth.users on delete set null,
  from_admin boolean not null default false,
  internal boolean not null default false,  -- interne Notiz, nur fuer App-Admins
  system boolean not null default false,    -- automatischer Vermerk (Status, Zuweisung)
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on public.support_messages (ticket_id, seq);

-- Wer hat ein Ticket zuletzt wann angesehen (fuer "neue Antwort")
create table if not exists public.support_reads (
  ticket_id uuid not null references public.support_tickets on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create table if not exists public.support_votes (
  ticket_id uuid not null references public.support_tickets on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create table if not exists public.support_faq (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 1 and 300),
  answer text not null check (char_length(answer) between 1 and 5000),
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_reads enable row level security;
alter table public.support_votes enable row level security;
alter table public.support_faq enable row level security;
revoke all on public.support_tickets, public.support_messages, public.support_reads,
  public.support_votes, public.support_faq from anon, authenticated;

-- Haeufige Fragen: alle lesen (auch ohne Anmeldung), App-Admins pflegen
grant select on public.support_faq to anon, authenticated;
grant insert, update, delete on public.support_faq to authenticated;
drop policy if exists "Haeufige Fragen lesen" on public.support_faq;
create policy "Haeufige Fragen lesen" on public.support_faq
  for select to anon, authenticated using (true);
drop policy if exists "Haeufige Fragen anlegen" on public.support_faq;
create policy "Haeufige Fragen anlegen" on public.support_faq
  for insert to authenticated with check (public.is_superadmin());
drop policy if exists "Haeufige Fragen aendern" on public.support_faq;
create policy "Haeufige Fragen aendern" on public.support_faq
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists "Haeufige Fragen loeschen" on public.support_faq;
create policy "Haeufige Fragen loeschen" on public.support_faq
  for delete to authenticated using (public.is_superadmin());

-- Erste haeufige Fragen (aus den Hinweisen der App), nur wenn noch keine da sind
insert into public.support_faq (question, answer, sort)
select q, a, s from (values
  ('Der Dongle verbindet sich nicht. Was tun?',
   'Dongle einstecken – er ist dann 60 s koppelbereit (LED blinkt blau). „Verbinden“ tippen und die Kopplungsanfrage bestätigen. Die Taste am Dongle kurz drücken öffnet das Kopplungsfenster erneut. Klappt es nach dem Löschen der Kopplungen nicht mehr: „DokuStick“ in den Bluetooth-Einstellungen des Handys entfernen und neu verbinden.', 1),
  ('Was bedeuten die LEDs am Dongle?',
   'Blau blinkend = koppelbereit · grün = verbunden · grün flackernd = tippt · rot blinkend = nicht am Zielgerät eingesteckt.', 2),
  ('Am Zielgerät fehlen Zeichen oder sie kommen verdreht an.',
   'In den Einstellungen unter „Tippen“ die Tippverzögerung erhöhen, z. B. bei Remote-Desktop oder Citrix auf 15–25 ms. Das Zielgerät muss auf Deutsch (Deutschland/Österreich) als Tastaturlayout eingestellt sein. Mit „Tastatur-Test senden“ lässt sich das prüfen.', 3),
  ('Funktioniert DokuStick auf iPhone und iPad?',
   'Safari kann auf iPhone und iPad kein Bluetooth für Webseiten. DokuStick deshalb in der kostenlosen App „Bluefy“ öffnen.', 4),
  ('Wie füge ich mein Standard-Protokoll mit einem Tipp ein?',
   'Im Reiter „Bausteine“ unter „📋 Protokollvorlagen“ eine Vorlage anlegen und die Bausteine auswählen. Die mit ★ markierte Vorlage fügt der 📋-Knopf im Schreiben-Reiter ein, über ▾ lassen sich auch die anderen wählen.', 5),
  ('Werden Patientendaten gespeichert?',
   'Nein. Ausgefüllte Bausteine, Formulare und der Text im Schreiben-Reiter werden nie gespeichert oder hochgeladen. Gespeichert (und mit Konto synchronisiert) werden nur deine Bausteine, Formulare und Einstellungen. Bitte keine Patientendaten in Bausteine oder Support-Tickets schreiben. Das Diktat läuft je nach Gerät über Server von Google bzw. Apple, deshalb keine Namen diktieren.', 6),
  ('Nach einem Update funktioniert etwas nicht wie beschrieben.',
   'Einstellungen → Dongle → „App neu laden“ lädt die App komplett neu. Hilft das nicht, bitte ein Ticket mit Kategorie „Fehler“ erstellen.', 7)
) as v(q, a, s)
where not exists (select 1 from public.support_faq);

-- --- Hilfsfunktionen -------------------------------------------------

create or replace function public.support_status_label(s text)
returns text language sql immutable set search_path = ''
as $$
  select case s when 'offen' then 'Offen' when 'in_arbeit' then 'In Bearbeitung'
    when 'rueckfrage' then 'Wartet auf Rückmeldung' when 'erledigt' then 'Erledigt' else s end;
$$;

-- Ticket lesen, wenn der Aufrufer es erstellt hat oder App-Admin ist
create or replace function public.support_get(p_ticket uuid)
returns public.support_tickets language plpgsql stable security definer set search_path = ''
as $$
declare
  t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_ticket;
  if t.id is null or (t.created_by is distinct from auth.uid() and not public.is_superadmin()) then
    raise exception 'Ticket nicht gefunden.' using errcode = 'P0002';
  end if;
  return t;
end;
$$;

create or replace function public.support_mark_read(p_ticket uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.support_reads (ticket_id, user_id) values (p_ticket, auth.uid())
    on conflict (ticket_id, user_id) do update set seen_at = now();
$$;

-- --- Fuer alle angemeldeten Benutzer ---------------------------------

create or replace function public.support_create(p_category text, p_title text, p_body text, p_device text default '')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t uuid;
begin
  if me is null then
    raise exception 'Bitte zuerst anmelden.' using errcode = '42501';
  end if;
  if (select count(*) from public.support_tickets where created_by = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Zu viele Tickets in kurzer Zeit. Bitte später noch einmal versuchen.';
  end if;
  insert into public.support_tickets (created_by, category, title, device)
    values (me, p_category, trim(p_title), coalesce(p_device, ''))
    returning id into t;
  insert into public.support_messages (ticket_id, author, body) values (t, me, trim(p_body));
  perform public.support_mark_read(t);
  return t;
end;
$$;

create or replace function public.support_my_tickets()
returns table (id uuid, category text, title text, status text, is_public boolean,
               created_at timestamptz, last_activity timestamptz, unread boolean)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.category, t.title, t.status, t.public, t.created_at,
    greatest(t.last_user_at, coalesce(t.last_admin_at, t.last_user_at)),
    coalesce(t.last_admin_at > coalesce(r.seen_at, '-infinity'::timestamptz), false)
  from public.support_tickets t
  left join public.support_reads r on r.ticket_id = t.id and r.user_id = auth.uid()
  where t.created_by = auth.uid()
  order by t.status = 'erledigt', 7 desc;
$$;

-- Ein Ticket mit allen Nachrichten (interne Notizen nur fuer App-Admins); merkt sich "gelesen"
create or replace function public.support_ticket(p_ticket uuid)
returns json language plpgsql security definer set search_path = ''
as $$
declare
  t public.support_tickets := public.support_get(p_ticket);
  adm boolean := public.is_superadmin();
begin
  perform public.support_mark_read(t.id);
  return json_build_object(
    'id', t.id, 'category', t.category, 'title', t.title, 'status', t.status,
    'created_at', t.created_at, 'device', t.device, 'is_public', t.public, 'idea_text', t.idea_text,
    'mine', t.created_by = auth.uid(),
    'email', case when adm then (select u.email from auth.users u where u.id = t.created_by) end,
    'assigned_to', case when adm then t.assigned_to end,
    'assigned_email', case when adm then (select u.email from auth.users u where u.id = t.assigned_to) end,
    'votes', (select count(*) from public.support_votes v where v.ticket_id = t.id),
    'messages', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'body', m.body, 'created_at', m.created_at, 'from_admin', m.from_admin,
        'internal', m.internal, 'system', m.system, 'mine', m.author = auth.uid(),
        'author_email', case when adm then (select u.email from auth.users u where u.id = m.author) end)
        order by m.seq)
      from public.support_messages m
      where m.ticket_id = t.id and (adm or not m.internal)), '[]'::json));
end;
$$;

-- Antwort der Person, die das Ticket erstellt hat (oeffnet erledigte Tickets wieder)
create or replace function public.support_reply(p_ticket uuid, p_body text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  t public.support_tickets := public.support_get(p_ticket);
begin
  if t.created_by <> auth.uid() then
    raise exception 'Antworten bitte über die Administration.' using errcode = '42501';
  end if;
  insert into public.support_messages (ticket_id, author, body) values (t.id, auth.uid(), trim(p_body));
  update public.support_tickets set
    last_user_at = now(),
    status = case when t.status in ('rueckfrage', 'erledigt')
                  then case when t.assigned_to is null then 'offen' else 'in_arbeit' end
                  else t.status end
  where id = t.id;
  perform public.support_mark_read(t.id);
end;
$$;

-- Eigenes Ticket als erledigt markieren oder wieder oeffnen
create or replace function public.support_close(p_ticket uuid, p_done boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  t public.support_tickets := public.support_get(p_ticket);
  s text;
begin
  if t.created_by <> auth.uid() then
    raise exception 'Nur für eigene Tickets.' using errcode = '42501';
  end if;
  s := case when p_done then 'erledigt' when t.assigned_to is null then 'offen' else 'in_arbeit' end;
  if s = t.status then return; end if;
  update public.support_tickets set status = s, last_user_at = now() where id = t.id;
  insert into public.support_messages (ticket_id, author, system, body)
    values (t.id, auth.uid(), true, case when p_done then 'Als erledigt markiert' else 'Wieder geöffnet' end);
  perform public.support_mark_read(t.id);
end;
$$;

-- Eigenes Ticket loeschen (z.B. versehentlich Patientendaten eingegeben); App-Admins jedes
create or replace function public.support_delete(p_ticket uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  t public.support_tickets := public.support_get(p_ticket);
begin
  delete from public.support_tickets where id = t.id;
end;
$$;

-- Veroeffentlichte Ideen: ohne Namen, mit Stimmen
create or replace function public.support_ideas()
returns table (id uuid, title text, idea_text text, status text, created_at timestamptz,
               votes bigint, voted boolean, mine boolean)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.title, t.idea_text, t.status, t.created_at,
    (select count(*) from public.support_votes v where v.ticket_id = t.id),
    exists (select 1 from public.support_votes v where v.ticket_id = t.id and v.user_id = auth.uid()),
    t.created_by = auth.uid()
  from public.support_tickets t
  where t.public and auth.uid() is not null
  order by t.status = 'erledigt', 6 desc, t.created_at desc;
$$;

create or replace function public.support_vote(p_ticket uuid, p_on boolean)
returns bigint language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Bitte zuerst anmelden.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.support_tickets where id = p_ticket and public) then
    raise exception 'Idee nicht gefunden.' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.support_votes (ticket_id, user_id) values (p_ticket, auth.uid()) on conflict do nothing;
  else
    delete from public.support_votes where ticket_id = p_ticket and user_id = auth.uid();
  end if;
  return (select count(*) from public.support_votes where ticket_id = p_ticket);
end;
$$;

-- Zahlen fuer die Abzeichen: neue Antworten; fuer App-Admins zusaetzlich
-- nicht zugewiesene Tickets und eigene mit neuen Nachrichten
create or replace function public.support_counts()
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'unread', (select count(*) from public.support_tickets t
               left join public.support_reads r on r.ticket_id = t.id and r.user_id = auth.uid()
               where t.created_by = auth.uid() and t.last_admin_at > coalesce(r.seen_at, '-infinity'::timestamptz)),
    'admin_new', case when public.is_superadmin() then
               (select count(*) from public.support_tickets t where t.assigned_to is null and t.status <> 'erledigt') end,
    'admin_mine', case when public.is_superadmin() then
               (select count(*) from public.support_tickets t
                left join public.support_reads r on r.ticket_id = t.id and r.user_id = auth.uid()
                where t.assigned_to = auth.uid() and t.status <> 'erledigt'
                  and t.last_user_at > coalesce(r.seen_at, '-infinity'::timestamptz)) end);
$$;

-- --- Fuer App-Admins -------------------------------------------------

create or replace function public.admin_tickets()
returns table (id uuid, category text, title text, status text, created_at timestamptz,
               last_activity timestamptz, email text, assigned_to uuid, assigned_email text,
               is_public boolean, votes bigint, messages bigint, unread boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  return query
    select t.id, t.category, t.title, t.status, t.created_at,
      greatest(t.last_user_at, coalesce(t.last_admin_at, t.last_user_at)),
      (select u.email::text from auth.users u where u.id = t.created_by),
      t.assigned_to,
      (select u.email::text from auth.users u where u.id = t.assigned_to),
      t.public,
      (select count(*) from public.support_votes v where v.ticket_id = t.id),
      (select count(*) from public.support_messages m where m.ticket_id = t.id and not m.system),
      t.last_user_at > coalesce(r.seen_at, '-infinity'::timestamptz)
    from public.support_tickets t
    left join public.support_reads r on r.ticket_id = t.id and r.user_id = auth.uid()
    order by t.status = 'erledigt', greatest(t.last_user_at, coalesce(t.last_admin_at, t.last_user_at)) desc;
end;
$$;

-- App-Admins fuer die Zuweisung
create or replace function public.admin_support_admins()
returns table (id uuid, email text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_superadmin();
  return query
    select u.id, u.email::text from public.app_admins a join auth.users u on u.id = a.user_id order by u.email;
end;
$$;

-- Zuweisen (p_user = null hebt die Zuweisung auf). Ist das Ticket schon jemand
-- anderem zugewiesen, nur mit p_force (Fehlercode DS409), damit nicht zwei
-- Admins gleichzeitig antworten.
create or replace function public.admin_ticket_assign(p_ticket uuid, p_user uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  t public.support_tickets;
  who text;
begin
  perform public.require_superadmin();
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null then
    raise exception 'Ticket nicht gefunden.' using errcode = 'P0002';
  end if;
  if p_user is not null and not exists (select 1 from public.app_admins a where a.user_id = p_user) then
    raise exception 'Tickets können nur App-Admins zugewiesen werden.';
  end if;
  if t.assigned_to is not distinct from p_user then return; end if;
  if t.assigned_to is not null and t.assigned_to <> auth.uid() and not p_force then
    select u.email into who from auth.users u where u.id = t.assigned_to;
    raise exception 'Dieses Ticket bearbeitet bereits %.', coalesce(who, 'jemand anderes') using errcode = 'DS409';
  end if;
  update public.support_tickets set
    assigned_to = p_user,
    status = case when p_user is not null and t.status = 'offen' then 'in_arbeit'
                  when p_user is null and t.status = 'in_arbeit' then 'offen'
                  else t.status end
  where id = t.id;
  insert into public.support_messages (ticket_id, author, from_admin, internal, system, body)
    values (t.id, auth.uid(), true, true, true,
      case when p_user is null then 'Zuweisung aufgehoben'
           when p_user = auth.uid() then 'Übernommen'
           else 'Zugewiesen an ' || coalesce((select u.email from auth.users u where u.id = p_user), '?') end);
end;
$$;

-- Status und/oder Kategorie aendern (null = unveraendert)
create or replace function public.admin_ticket_set(p_ticket uuid, p_status text, p_category text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  t public.support_tickets;
begin
  perform public.require_superadmin();
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null then
    raise exception 'Ticket nicht gefunden.' using errcode = 'P0002';
  end if;
  if p_category is not null and p_category <> t.category then
    update public.support_tickets set category = p_category where id = t.id;
    insert into public.support_messages (ticket_id, author, from_admin, internal, system, body)
      values (t.id, auth.uid(), true, true, true, 'Kategorie geändert');
  end if;
  if p_status is not null and p_status <> t.status then
    update public.support_tickets set status = p_status, last_admin_at = now() where id = t.id;
    insert into public.support_messages (ticket_id, author, from_admin, system, body)
      values (t.id, auth.uid(), true, true, 'Status: ' || public.support_status_label(p_status));
  end if;
end;
$$;

-- Antwort oder interne Notiz. Eine Antwort auf ein nicht zugewiesenes Ticket
-- uebernimmt es; ist es jemand anderem zugewiesen, nur mit p_force (DS409).
create or replace function public.admin_reply(p_ticket uuid, p_body text, p_internal boolean default false,
                                              p_status text default null, p_force boolean default false)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  t public.support_tickets;
  me uuid := auth.uid();
  who text;
  s text;
begin
  perform public.require_superadmin();
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null then
    raise exception 'Ticket nicht gefunden.' using errcode = 'P0002';
  end if;
  if not p_internal then
    if t.assigned_to is not null and t.assigned_to <> me and not p_force then
      select u.email into who from auth.users u where u.id = t.assigned_to;
      raise exception 'Dieses Ticket bearbeitet bereits %.', coalesce(who, 'jemand anderes') using errcode = 'DS409';
    end if;
    if t.assigned_to is null then
      update public.support_tickets set assigned_to = me where id = t.id;
      insert into public.support_messages (ticket_id, author, from_admin, internal, system, body)
        values (t.id, me, true, true, true, 'Übernommen');
    end if;
  end if;
  insert into public.support_messages (ticket_id, author, from_admin, internal, body)
    values (t.id, me, true, p_internal, trim(p_body));
  if not p_internal then
    update public.support_tickets set last_admin_at = now() where id = t.id;
  end if;
  s := coalesce(p_status, case when not p_internal and t.status = 'offen' then 'in_arbeit' else t.status end);
  if s <> t.status then
    update public.support_tickets set status = s, last_admin_at = now() where id = t.id;
    insert into public.support_messages (ticket_id, author, from_admin, system, body)
      values (t.id, me, true, true, 'Status: ' || public.support_status_label(s));
  end if;
  perform public.support_mark_read(t.id);
end;
$$;

-- Vorschlag als Idee fuer alle veroeffentlichen (ohne Namen) oder zurueckziehen
create or replace function public.admin_ticket_idea(p_ticket uuid, p_public boolean, p_title text, p_text text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  t public.support_tickets;
begin
  perform public.require_superadmin();
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null then
    raise exception 'Ticket nicht gefunden.' using errcode = 'P0002';
  end if;
  update public.support_tickets set
    public = p_public,
    title = coalesce(nullif(trim(p_title), ''), t.title),
    idea_text = coalesce(trim(p_text), '')
  where id = t.id;
  if p_public is distinct from t.public then
    insert into public.support_messages (ticket_id, author, from_admin, system, body)
      values (t.id, auth.uid(), true, true, case when p_public
        then 'Als Idee für alle sichtbar (ohne Namen) – andere können mit 👍 zustimmen'
        else 'Nicht mehr als Idee sichtbar' end);
  end if;
end;
$$;

-- --- Rechte ----------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'support_create(text, text, text, text)', 'support_my_tickets()', 'support_ticket(uuid)',
    'support_reply(uuid, text)', 'support_close(uuid, boolean)', 'support_delete(uuid)',
    'support_ideas()', 'support_vote(uuid, boolean)', 'support_counts()',
    'admin_tickets()', 'admin_support_admins()', 'admin_ticket_assign(uuid, uuid, boolean)',
    'admin_ticket_set(uuid, text, text)', 'admin_reply(uuid, text, boolean, text, boolean)',
    'admin_ticket_idea(uuid, boolean, text, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

revoke execute on function public.support_get(uuid), public.support_mark_read(uuid) from public, anon, authenticated;
