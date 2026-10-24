'use strict';

/*
 * Administration der gesamten App (nur fuer App-Admins sichtbar).
 * Alle Aktionen laufen ueber Datenbankfunktionen, die selbst pruefen,
 * ob der Aufrufer App-Admin ist (siehe supabase/migrations/*_admin.sql).
 */

const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');

const admin = {
  view: 'overview',
  teams: [],

  async call(fn, args) {
    const { data, error } = await cloud.sb.rpc(fn, args);
    if (error) throw error;
    return data;
  },

  open(view = this.view) {
    showTab('admin');
    this.show(view);
  },

  async show(view) {
    this.view = view;
    document.querySelectorAll('#adminTabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === view));
    this.renderTabBadge();
    const box = $('#adminBody');
    box.replaceChildren(el('div', { class: 'empty' }, 'Lade …'));
    try {
      const content = await this['render_' + view]();
      if (this.view === view) box.replaceChildren(...[content].flat().filter((x) => x != null));
    } catch (e) {
      box.replaceChildren(el('div', { class: 'note err' }, germanError(e)));
    }
  },

  // Fuehrt eine Aktion aus, meldet Fehler und laedt die Ansicht neu
  async act(fn, okMsg) {
    try {
      await fn();
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(germanError(e), 'err');
    }
    await this.show(this.view);
  },

  /* ---------- Uebersicht ---------- */

  async render_overview() {
    const o = await this.call('admin_overview');
    const stat = (label, value, sub) => el('div', { class: 'stat card' }, el('div', { class: 'stat-v' }, String(value)), el('div', { class: 'stat-l' }, label), sub ? el('div', { class: 'help' }, sub) : null);
    const modes = { open: 'offen für alle', domains: 'nur bestimmte Domains', closed: 'geschlossen' };
    return [
      el('div', { class: 'stats' },
        stat('Benutzer', o.users, `${o.active_30d} aktiv in 30 Tagen`),
        stat('Teams', o.teams),
        stat('Textbausteine', o.modules),
        stat('Formulare', o.forms),
        o.protocols != null ? stat('Protokollvorlagen', o.protocols) : null,
        support.available && support.polledFor ? stat('Support', support.counts.admin_new, 'Tickets nicht zugewiesen') : null),
      (o.unconfirmed || o.banned) ? el('p', { class: 'help' }, `${o.unconfirmed} Benutzer haben ihre E-Mail-Adresse noch nicht bestätigt, ${o.banned} sind gesperrt.`) : null,
      el('p', { class: 'help' }, 'Registrierung: ', el('b', {}, modes[o.settings.signup_mode]),
        o.settings.signup_mode === 'domains' ? ' (' + o.settings.allowed_domains.map((d) => '@' + d).join(', ') + ')' : ''),
    ];
  },

  /* ---------- Support-Tickets ---------- */

  renderTabBadge() {
    const b = $('#adminTabs button[data-view=support]');
    if (!b) return;
    const n = support.adminBadge;
    b.replaceChildren(...kids('Support', n ? el('span', { class: 'badge bad' }, String(n)) : null));
  },

  async render_support() {
    const [tickets] = await Promise.all([this.call('admin_tickets'), support.poll()]);
    const me = cloud.account.id;
    const filters = {
      open: ['Offen (alle)', (t) => t.status !== 'erledigt'],
      new: ['Nicht zugewiesen', (t) => !t.assigned_to && t.status !== 'erledigt'],
      mine: ['Mir zugewiesen', (t) => t.assigned_to === me && t.status !== 'erledigt'],
      wait: ['Wartet auf Rückmeldung', (t) => t.status === 'rueckfrage'],
      ideas: ['Veröffentlichte Ideen', (t) => t.is_public],
      done: ['Erledigt', (t) => t.status === 'erledigt'],
      all: ['Alle', () => true],
    };
    const count = (k) => tickets.filter(filters[k][1]).length;
    const filter = el('select', { 'aria-label': 'Filter', style: 'width:auto' },
      Object.entries(filters).map(([k, [label]]) => el('option', { value: k, selected: k === (this.ticketFilter || 'open') }, `${label} (${count(k)})`)));
    const cat = el('select', { 'aria-label': 'Kategorie', style: 'width:auto' }, el('option', { value: '' }, 'Alle Kategorien'),
      Object.entries(TICKET_CATS).map(([k, label]) => el('option', { value: k, selected: k === this.ticketCat }, label)));
    const search = el('input', { type: 'search', placeholder: 'Suchen …', value: this.ticketQuery || '' });
    const list = el('div', { class: 'mods' });
    const draw = () => {
      this.ticketFilter = filter.value; this.ticketCat = cat.value;
      const q = (this.ticketQuery = search.value.trim().toLowerCase());
      const hits = tickets.filter((t) => filters[filter.value][1](t) && (!cat.value || t.category === cat.value)
        && (!q || (t.title + ' ' + t.email + ' ' + (t.assigned_email || '')).toLowerCase().includes(q)));
      list.replaceChildren(...hits.map((t) => el('div', { class: 'mod card ticket' + (t.unread ? ' unread' : '') },
        el('button', { type: 'button', class: 'send', onclick: () => this.openTicket(t.id) },
          el('span', { class: 'title' }, t.title,
            t.unread && t.status !== 'erledigt' ? el('span', { class: 'badge bad' }, 'Neu') : null,
            t.is_public ? el('span', { class: 'badge' }, '💡 ' + t.votes) : null),
          el('span', { class: 'prev' }, TICKET_CATS[t.category] + ' · ', statusBadge(t.status),
            ` · ${t.email || 'Gelöschtes Konto'} · ${fmtWhen(t.last_activity)}`),
          el('span', { class: 'prev' }, t.assigned_to
            ? (t.assigned_to === me ? 'Bearbeitet von dir' : 'Bearbeitet von ' + (t.assigned_email || '?'))
            : el('span', { class: 'badge warn' }, 'nicht zugewiesen'))))));
      if (!hits.length) list.append(el('div', { class: 'empty' }, 'Keine Tickets.'));
    };
    [filter, cat].forEach((x) => x.addEventListener('change', draw));
    search.addEventListener('input', draw);
    draw();
    return [
      el('div', { class: 'row', style: 'margin-bottom:8px' }, filter, cat),
      el('div', { style: 'margin-bottom:12px' }, search),
      list,
      el('div', { class: 'row', style: 'margin-top:20px' },
        el('h2', { class: 'grow', style: 'margin:0' }, `Häufige Fragen (${support.faq.length})`),
        el('button', { type: 'button', class: 'btn', onclick: () => this.manageFaq() }, 'Bearbeiten')),
    ];
  },

  async openTicket(id) {
    let t, admins;
    try {
      [t, admins] = await Promise.all([support.rpc('support_ticket', { p_ticket: id }), this.call('admin_support_admins')]);
    } catch (e) { return toast(germanError(e), 'err'); }
    const me = cloud.account.id;
    const dlg = $('#dlg');
    if (!dlg.open || dlg.dataset.ticket !== id) {
      // Beim Schliessen die Liste auffrischen (Status, Zuweisung, gelesen)
      dlg.addEventListener('close', () => { delete dlg.dataset.ticket; if (this.view === 'support' && !$('#tab-admin').hidden) this.show('support'); }, { once: true });
    }
    // Aktion mit Rueckfrage, wenn das Ticket inzwischen jemand anderem gehoert (DS409)
    const run = async (fn, msg) => {
      try {
        await fn(false);
      } catch (e) {
        if (e.code !== 'DS409') return toast(germanError(e), 'err');
        if (!confirm(e.message + ' Trotzdem fortfahren?')) return;
        try { await fn(true); } catch (e2) { return toast(germanError(e2), 'err'); }
      }
      if (msg) toast(msg);
      await this.openTicket(id);
      support.poll();
    };
    const statusSel = (value, name) => el('select', { name, style: 'width:auto' },
      Object.entries(TICKET_STATUS).map(([k, label]) => el('option', { value: k, selected: k === value }, label)));
    const assign = el('select', { style: 'width:auto', 'aria-label': 'Zuständig' },
      el('option', { value: '' }, '– niemand –'),
      admins.map((a) => el('option', { value: a.id, selected: a.id === t.assigned_to }, a.id === me ? `${a.email} (du)` : a.email)));
    assign.addEventListener('change', () => run((force) => this.call('admin_ticket_assign', { p_ticket: id, p_user: assign.value || null, p_force: force }), 'Zugewiesen'));
    const status = statusSel(t.status);
    status.addEventListener('change', () => run(() => this.call('admin_ticket_set', { p_ticket: id, p_status: status.value }), 'Status geändert'));
    const category = el('select', { style: 'width:auto', 'aria-label': 'Kategorie' },
      Object.entries(TICKET_CATS).map(([k, label]) => el('option', { value: k, selected: k === t.category }, label)));
    category.addEventListener('change', () => run(() => this.call('admin_ticket_set', { p_ticket: id, p_status: null, p_category: category.value }), 'Kategorie geändert'));

    const other = t.assigned_to && t.assigned_to !== me;
    const reply = el('textarea', { rows: 4, maxlength: 5000, placeholder: 'Antwort an ' + (t.email || 'die Person') + ' …', 'aria-label': 'Antwort' });
    const internal = el('input', { type: 'checkbox' });
    const after = statusSel(t.status === 'offen' ? 'in_arbeit' : t.status, 'after');
    internal.addEventListener('change', () => {
      // Interne Notiz aendert den Status nur, wenn man ihn bewusst waehlt
      after.value = internal.checked || t.status !== 'offen' ? t.status : 'in_arbeit';
      reply.placeholder = internal.checked ? 'Interne Notiz (sieht nur das Admin-Team) …' : 'Antwort an ' + (t.email || 'die Person') + ' …';
      reply.classList.toggle('internal-input', internal.checked);
    });
    const send = () => {
      const body = reply.value.trim();
      if (!body) return toast('Text eingeben', 'err');
      // Warnung schon vor dem Senden, wenn jemand anderes zustaendig ist
      if (!internal.checked && other && !confirm(`${t.assigned_email} bearbeitet dieses Ticket. Trotzdem antworten?`)) return;
      run((force) => this.call('admin_reply', {
        p_ticket: id, p_body: body, p_internal: internal.checked, p_status: after.value === t.status ? null : after.value, p_force: force || other,
      }), internal.checked ? 'Notiz gespeichert' : 'Antwort gesendet');
    };

    // Vorschlaege als Idee veroeffentlichen (ohne Namen, Text vorher bereinigen)
    const ideaTitle = el('input', { type: 'text', maxlength: 200, value: t.title });
    const ideaText = el('textarea', { rows: 3, maxlength: 2000 }, t.idea_text || (t.messages.find((m) => !m.from_admin && !m.system) || {}).body || '');
    const ideaBox = el('details', { class: 'dev', open: t.is_public || null },
      el('summary', {}, t.is_public ? `💡 Als Idee veröffentlicht · 👍 ${t.votes}` : '💡 Als Idee für alle veröffentlichen'),
      el('p', { class: 'help' }, 'Alle angemeldeten Benutzer sehen Titel und Text (ohne Namen) und können mit 👍 zustimmen. Text vorher von persönlichen Angaben bereinigen.'),
      field('Titel', ideaTitle), field('Text', ideaText),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn small primary', onclick: () => run(() => this.call('admin_ticket_idea', { p_ticket: id, p_public: true, p_title: ideaTitle.value, p_text: ideaText.value }), t.is_public ? 'Gespeichert' : 'Veröffentlicht') },
          t.is_public ? 'Speichern' : 'Veröffentlichen'),
        t.is_public ? el('button', { type: 'button', class: 'btn small', onclick: () => run(() => this.call('admin_ticket_idea', { p_ticket: id, p_public: false, p_title: ideaTitle.value, p_text: ideaText.value }), 'Zurückgezogen') }, 'Zurückziehen') : null));

    openDialog(t.title, [
      el('div', { class: 'help' }, `Von ${t.email || 'gelöschtem Konto'} · erstellt ${fmtWhen(t.created_at)}`),
      other ? el('p', { class: 'note warn' }, `⚠ Wird bearbeitet von ${t.assigned_email}. Bitte nicht doppelt antworten.`) : null,
      !t.assigned_to ? el('p', { class: 'note' }, 'Noch niemandem zugewiesen. Mit der ersten Antwort übernimmst du das Ticket.') : null,
      el('div', { class: 'row ticket-meta' },
        el('label', { class: 'field' }, el('span', {}, 'Zuständig'), assign),
        !t.assigned_to || other ? el('button', { type: 'button', class: 'btn small', style: 'align-self:flex-end', onclick: () => run((force) => this.call('admin_ticket_assign', { p_ticket: id, p_user: me, p_force: force }), 'Übernommen') }, 'Übernehmen') : null),
      el('div', { class: 'row ticket-meta' },
        el('label', { class: 'field' }, el('span', {}, 'Status'), status),
        el('label', { class: 'field' }, el('span', {}, 'Kategorie'), category)),
      t.device ? el('details', { class: 'dev' }, el('summary', {}, 'Geräteinfos'), el('pre', { class: 'dev-info' }, t.device)) : null,
      t.category === 'vorschlag' || t.is_public ? ideaBox : null,
      support.thread(t, { admin: true }),
      reply,
      el('label', { class: 'check' }, internal, 'Interne Notiz (nur für Admins sichtbar)'),
      el('div', { class: 'row ticket-meta' },
        el('label', { class: 'field grow' }, el('span', {}, 'Status danach'), after),
        el('button', { type: 'button', class: 'btn primary', style: 'align-self:flex-end', onclick: send }, 'Senden')),
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { type: 'button', class: 'btn small danger', onclick: async () => {
          if (!confirm(`Ticket „${t.title}“ mit allen Nachrichten endgültig löschen?`)) return;
          try { await support.rpc('support_delete', { p_ticket: id }); } catch (e) { return toast(germanError(e), 'err'); }
          dlg.close();
          toast('Ticket gelöscht');
          support.poll();
        } }, 'Ticket löschen')),
    ]);
    dlg.dataset.ticket = id;
  },

  // Haeufige Fragen pflegen (direkt in der Tabelle, Regeln erlauben das nur App-Admins)
  async manageFaq() {
    await support.loadFaq();
    const list = el('div', { class: 'mods' });
    const save = async (row) => {
      const { error } = row.id
        ? await cloud.sb.from('support_faq').update({ question: row.question, answer: row.answer, sort: row.sort, updated_at: new Date().toISOString() }).eq('id', row.id)
        : await cloud.sb.from('support_faq').insert({ question: row.question, answer: row.answer, sort: row.sort });
      if (error) throw error;
    };
    const again = async (msg) => { await support.loadFaq(); if (msg) toast(msg); this.manageFaq(); };
    const move = async (i, j) => {
      const a = support.faq[i], b = support.faq[j];
      try {
        await save({ ...a, sort: j + 1 });
        await save({ ...b, sort: i + 1 });
      } catch (e) { return toast(germanError(e), 'err'); }
      again();
    };
    const edit = (f) => {
      const q = el('input', { type: 'text', name: 'q', maxlength: 300, required: true, value: f ? f.question : '' });
      const a = el('textarea', { name: 'a', rows: 6, maxlength: 5000, required: true }, f ? f.answer : '');
      // Zurueck zur Liste, sobald Speichern/Loeschen fertig ist
      $('#dlg').addEventListener('close', () => setTimeout(async () => { await this.faqBusy; if (!$('#dlg').open) this.manageFaq(); }, 0), { once: true });
      openDialog(f ? 'Frage bearbeiten' : 'Neue häufige Frage', [field('Frage', q), field('Antwort', a)], {
        onSave: async () => {
          try { await save({ id: f && f.id, question: q.value.trim(), answer: a.value.trim(), sort: f ? f.sort : support.faq.length + 1 }); } catch (e) { toast(germanError(e), 'err'); return false; }
          await support.loadFaq();
          toast('Gespeichert');
        },
        onDelete: f ? () => {
          this.faqBusy = (async () => {
            const { error } = await cloud.sb.from('support_faq').delete().eq('id', f.id);
            if (error) toast(germanError(error), 'err');
          })();
        } : null,
      });
    };
    list.replaceChildren(...support.faq.map((f, i) => el('div', { class: 'mod card' },
      el('button', { type: 'button', class: 'send', onclick: () => edit(f) },
        el('span', { class: 'title' }, f.question), el('span', { class: 'prev' }, f.answer)),
      el('div', { class: 'acts' },
        el('button', { type: 'button', title: 'Nach oben', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => move(i, i - 1) }, '↑'),
        el('button', { type: 'button', title: 'Nach unten', 'aria-label': 'Nach unten', disabled: i === support.faq.length - 1, onclick: () => move(i, i + 1) }, '↓')))));
    if (!support.faq.length) list.append(el('div', { class: 'empty' }, 'Noch keine häufigen Fragen.'));
    openDialog('Häufige Fragen', [
      el('p', { class: 'help', style: 'margin-top:0' }, 'Sehen alle in den Einstellungen unter „Support & Feedback“, auch ohne Konto und offline.'),
      list,
      el('div', { class: 'row', style: 'margin-top:12px' }, el('button', { type: 'button', class: 'btn primary', onclick: () => edit(null) }, '＋ Neue Frage')),
    ]);
  },

  /* ---------- Benutzer ---------- */

  async render_users() {
    const users = await this.call('admin_users');
    const search = el('input', { type: 'search', placeholder: `${users.length} Benutzer durchsuchen …`, value: this.userQuery || '' });
    const list = el('div', { class: 'mods' });
    const draw = () => {
      const q = (this.userQuery = search.value.trim().toLowerCase());
      list.replaceChildren(...users.filter((u) => !q || (u.email + ' ' + (u.teams || '')).toLowerCase().includes(q)).map((u) => this.userCard(u)));
      if (!list.children.length) list.append(el('div', { class: 'empty' }, 'Niemand gefunden.'));
    };
    search.addEventListener('input', draw);
    draw();
    return [el('div', { style: 'margin-bottom:12px' }, search), list];
  },

  userCard(u) {
    const me = u.id === cloud.account.id;
    const badge = (t, cls = '') => el('span', { class: 'badge ' + cls }, t);
    return el('div', { class: 'card pad' },
      el('div', {}, el('b', {}, u.email),
        me ? badge('Du') : null,
        u.is_admin ? badge('App-Admin') : null,
        u.banned ? badge('Gesperrt', 'bad') : null,
        !u.confirmed ? badge('Unbestätigt', 'warn') : null),
      el('div', { class: 'help' }, `Registriert ${fmtDate(u.created_at)} · zuletzt angemeldet ${fmtDate(u.last_sign_in_at)}`),
      el('div', { class: 'help' }, 'Teams: ' + (u.teams || 'keine')),
      el('div', { class: 'row', style: 'margin-top:8px' },
        el('button', { type: 'button', class: 'btn small', onclick: () => {
          if (confirm(`E-Mail zum Zurücksetzen des Passworts an ${u.email} senden?`)) {
            this.act(async () => { const { error } = await cloud.sb.auth.resetPasswordForEmail(u.email, { redirectTo: cloud.redirectUrl() }); if (error) throw error; }, 'E-Mail gesendet');
          }
        } }, 'Passwort-Reset'),
        me ? null : el('button', { type: 'button', class: 'btn small', onclick: () => {
          if (u.banned || confirm(`${u.email} sperren? Die Person wird abgemeldet und kann sich nicht mehr anmelden.`)) {
            this.act(() => this.call('admin_set_banned', { p_user: u.id, p_banned: !u.banned }), u.banned ? 'Entsperrt' : 'Gesperrt');
          }
        } }, u.banned ? 'Entsperren' : 'Sperren'),
        me ? null : el('button', { type: 'button', class: 'btn small', onclick: () => {
          if (confirm(u.is_admin ? `${u.email} die App-Admin-Rechte entziehen?` : `${u.email} zum App-Admin machen? Die Person kann dann alle Benutzer und Teams verwalten.`)) {
            this.act(() => this.call('admin_set_superadmin', { p_user: u.id, p_admin: !u.is_admin }), 'Gespeichert');
          }
        } }, u.is_admin ? 'Admin entziehen' : 'Zum App-Admin'),
        me ? null : el('button', { type: 'button', class: 'btn small danger', onclick: () => {
          if (confirm(`Konto ${u.email} endgültig löschen? Alle eigenen Bausteine, Formulare und Einstellungen dieser Person werden gelöscht. Das kann nicht rückgängig gemacht werden.`)) {
            this.act(() => this.call('admin_delete_user', { p_user: u.id }), 'Konto gelöscht');
          }
        } }, 'Löschen')));
  },

  /* ---------- Teams ---------- */

  async render_teams() {
    this.teams = await this.call('admin_teams');
    return [
      el('div', { class: 'row', style: 'margin-bottom:12px' },
        el('span', { class: 'grow help' }, `${this.teams.length} Teams`),
        el('button', { type: 'button', class: 'btn primary', onclick: () => {
          const name = prompt('Name des neuen Teams:');
          if (name && name.trim()) this.act(async () => { const id = await this.call('admin_create_team', { p_name: name }); this.manageTeam(id); }, 'Team erstellt');
        } }, '＋ Team')),
      el('div', { class: 'mods' }, this.teams.length ? this.teams.map((t) =>
        el('div', { class: 'mod card' },
          el('button', { class: 'send', onclick: () => this.manageTeam(t.id) },
            el('span', { class: 'title' }, t.name),
            el('span', { class: 'prev' }, `${t.members} Mitglieder · ${t.items} Einträge · Admins: ${t.admins || 'keine'}`)),
          el('div', { class: 'acts' }, el('button', { title: 'Verwalten', 'aria-label': 'Verwalten', onclick: () => this.manageTeam(t.id) }, '✎'))))
        : el('div', { class: 'empty' }, 'Noch keine Teams.')),
    ];
  },

  async manageTeam(teamId) {
    let members, team;
    try {
      [members, this.teams] = await Promise.all([this.call('admin_team_members', { p_team: teamId }), this.call('admin_teams')]);
      team = this.teams.find((t) => t.id === teamId);
      if (!team) return;
    } catch (e) { return toast(germanError(e), 'err'); }

    const again = () => this.manageTeam(teamId);
    const run = async (fn, msg) => {
      try { await fn(); if (msg) toast(msg); } catch (e) { toast(germanError(e), 'err'); }
      await again();
      cloud.sync();
      if (this.view === 'teams') this.show('teams');
    };
    const email = el('input', { type: 'email', placeholder: 'E-Mail-Adresse', autocomplete: 'off' });
    const role = el('select', { style: 'width:auto' }, el('option', { value: 'member' }, 'Mitglied'), el('option', { value: 'admin' }, 'Admin'));

    openDialog('Team „' + team.name + '“', [
      el('h2', {}, 'Beitrittscode'),
      el('div', { class: 'row' },
        el('code', { class: 'joincode' }, team.code || '–'),
        el('button', { type: 'button', class: 'btn small', onclick: () => navigator.clipboard?.writeText(team.code).then(() => toast('Code kopiert')) }, 'Kopieren'),
        el('button', { type: 'button', class: 'btn small', onclick: () => run(() => this.call('admin_new_team_code', { p_team: teamId }), 'Neuer Code erzeugt') }, 'Neuer Code')),
      el('h2', {}, `Mitglieder (${members.length})`),
      el('div', { class: 'members' }, members.length ? members.map((m) => el('div', { class: 'member' },
        el('div', { class: 'grow' }, el('div', {}, m.email || 'Unbekannt'), el('div', { class: 'help' }, m.role === 'admin' ? 'Admin' : 'Mitglied')),
        el('button', { type: 'button', class: 'btn small', onclick: () => run(() => this.call('admin_set_member_role', { p_team: teamId, p_user: m.user_id, p_role: m.role === 'admin' ? 'member' : 'admin' })) }, m.role === 'admin' ? 'Admin entziehen' : 'Zum Admin'),
        el('button', { type: 'button', class: 'btn small danger', onclick: () => {
          if (confirm(`${m.email} aus dem Team entfernen?`)) run(() => this.call('admin_remove_member', { p_team: teamId, p_user: m.user_id }), 'Entfernt');
        } }, 'Entfernen'))) : el('p', { class: 'help' }, 'Noch keine Mitglieder.')),
      el('div', { class: 'row', style: 'margin-top:8px' }, el('div', { class: 'grow', style: 'min-width:180px' }, email), role,
        el('button', { type: 'button', class: 'btn', onclick: () => {
          if (!email.value.trim()) return toast('E-Mail-Adresse eingeben', 'err');
          run(() => this.call('admin_add_member', { p_team: teamId, p_email: email.value, p_role: role.value }), 'Hinzugefügt');
        } }, 'Hinzufügen')),
      el('h2', {}, 'Team'),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn small', onclick: () => {
          const name = prompt('Neuer Name des Teams:', team.name);
          if (name && name.trim()) run(() => this.call('admin_rename_team', { p_team: teamId, p_name: name }), 'Umbenannt');
        } }, 'Umbenennen'),
        el('button', { type: 'button', class: 'btn small danger', onclick: async () => {
          if (!confirm(`Team „${team.name}“ mit allen ${team.items} Team-Einträgen endgültig löschen?`)) return;
          try { await this.call('admin_delete_team', { p_team: teamId }); $('#dlg').close(); toast('Team gelöscht'); } catch (e) { toast(germanError(e), 'err'); }
          cloud.sync();
          this.show('teams');
        } }, 'Team löschen')),
    ]);
  },

  /* ---------- Einstellungen ---------- */

  async render_settings() {
    const [o, teams] = await Promise.all([this.call('admin_overview'), this.call('admin_teams')]);
    const s = o.settings;
    const radio = (value, label, help) => el('label', { class: 'check', style: 'align-items:flex-start' },
      el('input', { type: 'radio', name: 'signup', value, checked: s.signup_mode === value, style: 'margin-top:3px' }),
      el('span', {}, label, help ? el('span', { class: 'help', style: 'display:block' }, help) : null));
    const domains = el('textarea', { rows: 3, placeholder: 'roteskreuz-tirol.at' }, s.allowed_domains.join('\n'));
    const domainBox = field('Erlaubte E-Mail-Domains (eine pro Zeile)', domains);
    const team = el('select', {}, el('option', { value: '' }, 'Keines'), ...teams.map((t) => el('option', { value: t.id, selected: t.id === s.default_team }, t.name)));
    const ann = el('textarea', { rows: 3, maxlength: 1000, placeholder: 'z. B. Bitte keine Patientendaten in Textbausteinen speichern.' }, s.announcement);
    const form = el('div', {},
      el('h2', {}, 'Registrierung'),
      el('div', { class: 'card pad' },
        radio('open', 'Offen für alle'),
        radio('domains', 'Nur bestimmte E-Mail-Domains', 'z. B. nur Dienst-Adressen der Organisation'),
        radio('closed', 'Geschlossen', 'Niemand kann sich neu registrieren. Bestehende Konten funktionieren weiter.'),
        domainBox),
      el('h2', {}, 'Team für neue Benutzer'),
      el('div', { class: 'card pad' },
        field('Neue Benutzer treten automatisch diesem Team bei', team),
        el('p', { class: 'help', style: 'margin:0' }, 'Bausteine für alle Benutzer gehören besser in den Bereich „Standard“: beim Bearbeiten eines Bausteins unter „Speichern in“ wählen.')),
      el('h2', {}, 'Hinweis an alle'),
      el('div', { class: 'card pad' },
        field('Wird allen in der App oben angezeigt (leer = kein Hinweis)', ann)),
      el('div', { style: 'margin-top:16px' }, el('button', { type: 'button', class: 'btn big primary', onclick: () => {
        const mode = form.querySelector('input[name=signup]:checked').value;
        const list = domains.value.split(/[\n,;\s]+/).map((d) => d.trim()).filter(Boolean);
        if (mode === 'domains' && !list.length) return toast('Mindestens eine Domain eintragen', 'err');
        this.act(async () => {
          await this.call('admin_save_settings', { p_signup_mode: mode, p_allowed_domains: list, p_default_team: team.value || null, p_announcement: ann.value.trim() });
          await cloud.loadInfo();
        }, 'Einstellungen gespeichert');
      } }, 'Speichern')));
    const syncDomains = () => { domainBox.hidden = form.querySelector('input[name=signup]:checked').value !== 'domains'; };
    form.querySelectorAll('input[name=signup]').forEach((r) => r.addEventListener('change', syncDomains));
    syncDomains();
    return form;
  },
};

document.querySelectorAll('#adminTabs button').forEach((b) => b.addEventListener('click', () => admin.show(b.dataset.view)));
$('#adminBack').addEventListener('click', () => showTab('settings'));
