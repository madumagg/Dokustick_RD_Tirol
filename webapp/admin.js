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

  open() {
    showTab('admin');
    this.show(this.view);
  },

  async show(view) {
    this.view = view;
    document.querySelectorAll('#adminTabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === view));
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
        stat('Formulare', o.forms)),
      (o.unconfirmed || o.banned) ? el('p', { class: 'help' }, `${o.unconfirmed} Benutzer haben ihre E-Mail-Adresse noch nicht bestätigt, ${o.banned} sind gesperrt.`) : null,
      el('p', { class: 'help' }, 'Registrierung: ', el('b', {}, modes[o.settings.signup_mode]),
        o.settings.signup_mode === 'domains' ? ' (' + o.settings.allowed_domains.map((d) => '@' + d).join(', ') + ')' : ''),
    ];
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
      el('h2', {}, 'Standard-Team'),
      el('div', { class: 'card pad' },
        field('Neue Benutzer treten automatisch diesem Team bei', team),
        el('p', { class: 'help', style: 'margin:0' }, 'Praktisch für gemeinsame Bausteine, die alle bekommen sollen.')),
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
