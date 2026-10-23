'use strict';

/*
 * Konto, Synchronisation und Teams (Supabase).
 *
 * Die App arbeitet immer mit der lokalen Kopie (offline-faehig).
 * Aenderungen werden als "dirty" markiert und beim naechsten Sync hochgeladen,
 * danach wird der Serverstand vollstaendig neu geladen.
 */

// Einstellungen, die mit dem Konto mitwandern (Darstellung bleibt pro Geraet)
const SYNCED_SETTINGS = ['delay', 'lang', 'voiceCmds', 'replacements', 'blankLine'];
const ITEM_COLS = 'id,kind,title,category,body,sort,deleted,team_id,updated_at';

const AUTH_ERRORS = [
  [/invalid login credentials/i, 'E-Mail oder Passwort falsch.'],
  [/email not confirmed/i, 'E-Mail-Adresse noch nicht bestätigt. Bitte den Link in der Bestätigungs-E-Mail öffnen.'],
  [/already registered|already been registered/i, 'Für diese E-Mail-Adresse gibt es bereits ein Konto.'],
  [/password should be at least|weak password/i, 'Das Passwort muss mindestens 8 Zeichen haben.'],
  [/rate limit|too many/i, 'Zu viele Versuche. Bitte kurz warten.'],
  [/failed to fetch|network|load failed/i, 'Keine Internetverbindung.'],
  [/unable to validate email|invalid.*email/i, 'Ungültige E-Mail-Adresse.'],
  [/same.*password|different from the old/i, 'Das neue Passwort muss sich vom alten unterscheiden.'],
  [/database error saving new user/i, 'Registrierung nicht möglich: Sie ist geschlossen oder deine E-Mail-Domain ist nicht zugelassen.'],
  [/user is banned/i, 'Dieses Konto ist gesperrt. Bitte wende dich an den Administrator.'],
];

function germanError(e) {
  const msg = String(e && (e.message || e.error_description || e) || 'Unbekannter Fehler');
  const hit = AUTH_ERRORS.find(([re]) => re.test(msg));
  return hit ? hit[1] : msg;
}

const cloud = {
  sb: null,
  account: store.load('account', null), // { id, email }
  info: store.load('appInfo', {}),        // Registrierungsregeln, Hinweis an alle, Admin-Status
  teams: [],
  syncing: false,
  running: null,
  again: false,
  lastSync: null,
  error: null,
  timer: null,

  get enabled() { return !!this.sb; },

  isAdmin(teamId) { return this.teams.some((t) => t.id === teamId && t.role === 'admin'); },
  teamName(teamId) { const t = this.teams.find((x) => x.id === teamId); return t ? t.name : 'Team'; },
  adminTeamOr(v) { return this.isAdmin(v) ? v : null; },
  key(name) { return `u.${this.account.id}.${name}`; },
  pending() {
    if (!this.account) return 0;
    return items.filter((i) => i.dirty).length + (store.load(this.key('settingsDirty'), false) ? 1 : 0);
  },

  /* ---------- Start & Anmeldestatus ---------- */

  start() {
    const cfg = window.DOKUSTICK_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) { this.render(); return; }
    this.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'dokustick.auth' },
    });
    this.sb.auth.onAuthStateChange((event, session) => {
      // Keine Supabase-Aufrufe direkt im Callback (Empfehlung von supabase-js)
      setTimeout(() => this.onAuth(event, session), 0);
    });
    window.addEventListener('online', () => this.sync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (!this.lastSync || Date.now() - this.lastSync > 30000)) this.sync();
    });
    setInterval(() => this.sync(), 120000);
    if (this.account) this.loadTeams();
    this.render();
    this.loadInfo();
  },

  // App-Einstellungen vom Server (fehlt admin.sql, bleibt alles beim Alten)
  async loadInfo() {
    if (!this.sb || !navigator.onLine) return;
    const { data, error } = await this.sb.rpc('app_info');
    if (error || !data) return;
    this.info = data;
    store.save('appInfo', data);
    this.render();
    renderStatus(); // Admin-Status beeinflusst die Verbinden-Schaltflaeche
    catalog.render();
  },

  onAuth(event, session) {
    if (event === 'PASSWORD_RECOVERY') return this.askNewPassword();
    const user = session && session.user;
    if (user && (!this.account || this.account.id !== user.id)) {
      this.setAccount({ id: user.id, email: user.email });
    } else if (event === 'SIGNED_OUT' && this.account) {
      this.setAccount(null);
    } else if (user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
      this.sync();
    }
  },

  setAccount(acc) {
    const prev = this.account;
    if (prev && !acc) {
      // Beim Abmelden die Kontodaten von diesem Geraet entfernen
      for (const k of ['items', 'teams', 'settingsDirty', 'lastSync', 'catalog']) store.remove(`u.${prev.id}.${k}`);
    }
    this.account = acc;
    store.save('account', acc);
    if (!acc) { this.info = { ...this.info, is_admin: false }; this.loadInfo(); }
    this.teams = []; this.lastSync = null; this.error = null;
    loadItems();
    if (acc) this.loadTeams();
    catalog.load();
    renderAll();
    if (acc) this.sync();
  },

  loadTeams() {
    this.teams = store.load(this.key('teams'), []);
    this.lastSync = store.load(this.key('lastSync'), null);
  },

  /* ---------- Synchronisation ---------- */

  schedule() {
    if (!this.account || !this.sb) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), 800);
    this.render();
  },

  settingsChanged() {
    if (!this.account) return;
    store.save(this.key('settingsDirty'), true);
    this.schedule();
  },

  // Liefert ein Promise, das erst nach Ende aller angeforderten Durchlaeufe erfuellt ist
  sync() {
    if (this.running) { this.again = true; return this.running; }
    this.running = this.syncOnce().finally(() => {
      this.running = null;
      if (this.again) { this.again = false; return this.sync(); }
    });
    return this.running;
  },

  async syncOnce() {
    if (!this.account || !this.sb) return;
    if (!navigator.onLine) { this.render(); return; }
    this.syncing = true; this.render();
    const acc = this.account;
    try {
      await this.pushItems(acc);
      await this.pushSettings(acc);
      if (this.account !== acc) return;
      await this.pullTeams(acc);
      await this.pullItems(acc);
      await this.pullSettings(acc);
      await this.loadInfo();
      // Datenbank-Fehler sollen die uebrige Synchronisation nicht stoeren
      await catalog.pull().catch(() => {});
      const first = !this.lastSync;
      this.lastSync = Date.now();
      store.save(this.key('lastSync'), this.lastSync);
      this.error = null;
      if (first) this.offerImport();
    } catch (e) {
      this.error = germanError(e);
      // Sitzung abgelaufen und nicht erneuerbar -> neu anmelden
      if (/jwt|refresh token|not authenticated/i.test(String(e && e.message))) this.error = 'Bitte neu anmelden.';
    } finally {
      this.syncing = false;
      this.render();
    }
  },

  async pushItems(acc) {
    for (const it of items.filter((i) => i.dirty)) {
      const rev = it.dirty;
      const row = {
        id: it.id, kind: it.kind, title: it.title, category: it.category, body: it.body,
        sort: it.sort, deleted: !!it.deleted, team_id: it.team_id || null, owner_id: it.team_id ? null : acc.id,
      };
      const { error } = await this.sb.from('items').upsert(row);
      if (error && error.code !== '42501') throw error;
      // 42501 = keine Berechtigung (z.B. Admin-Rechte verloren): Aenderung verwerfen
      if (error) toast(`„${it.title}“ konnte nicht gespeichert werden (keine Berechtigung).`, 'err');
      if (it.dirty === rev) it.dirty = 0;
      if (it.deleted && !it.dirty) items = items.filter((x) => x !== it);
      saveItems();
    }
  },

  async pullItems(acc) {
    const { data, error } = await this.sb.from('items').select(ITEM_COLS);
    if (error) throw error;
    if (this.account !== acc) return;
    const pendingLocal = items.filter((i) => i.dirty);
    const pendingIds = new Set(pendingLocal.map((i) => i.id));
    items = [
      ...pendingLocal,
      ...data.filter((r) => !r.deleted && !pendingIds.has(r.id)).map((r) => ({ ...r, dirty: 0 })),
    ];
    saveItems();
    renderItems();
  },

  async pushSettings(acc) {
    if (!store.load(this.key('settingsDirty'), false)) return;
    const data = Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, settings[k]]));
    const { error } = await this.sb.from('user_settings').upsert({ user_id: acc.id, data });
    if (error) throw error;
    store.save(this.key('settingsDirty'), false);
  },

  async pullSettings(acc) {
    if (store.load(this.key('settingsDirty'), false)) return;
    const { data, error } = await this.sb.from('user_settings').select('data').eq('user_id', acc.id).maybeSingle();
    if (error) throw error;
    if (!data || this.account !== acc) return;
    const before = settings.delay;
    for (const k of SYNCED_SETTINGS) if (k in data.data) settings[k] = data.data[k];
    store.save('settings', settings);
    renderSettings();
    if (settings.delay !== before) sendDelay();
  },

  async pullTeams(acc) {
    const { data, error } = await this.sb.from('team_members').select('role, team_id, teams(name)').eq('user_id', acc.id);
    if (error) throw error;
    this.teams = data.map((m) => ({ id: m.team_id, name: (m.teams && m.teams.name) || 'Team', role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    store.save(this.key('teams'), this.teams);
  },

  // Beim ersten Anmelden auf diesem Geraet: lokale Eintraege ins Konto uebernehmen?
  offerImport() {
    const local = (store.load('local.items', []) || []).filter((i) => !i.deleted);
    const own = items.filter((i) => !i.team_id);
    if (!local.length || own.length) return;
    if (!confirm(`Auf diesem Gerät sind ${local.length} Textbausteine/Formulare gespeichert. Sollen sie in dein Konto übernommen werden?`)) return;
    local.forEach((x, i) => putItem(newItem(x.kind, { title: x.title, category: x.category, body: x.body, sort: Date.now() + i })));
    renderItems();
    toast('Wird ins Konto übernommen …');
  },

  /* ---------- Anmeldung ---------- */

  redirectUrl() { return location.origin + location.pathname; },

  async signIn(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    toast('Angemeldet');
  },

  async signUp(email, password) {
    const { signup_mode: mode, allowed_domains: domains = [] } = this.info;
    if (mode === 'closed') throw new Error('Die Registrierung ist derzeit geschlossen.');
    if (mode === 'domains' && !domains.includes(email.split('@')[1]?.toLowerCase())) {
      throw new Error('Registrierung nur mit E-Mail-Adressen von ' + domains.map((d) => '@' + d).join(', ') + ' möglich.');
    }
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: this.redirectUrl() } });
    if (error) throw error;
    if (!data.session) {
      // Supabase verlangt standardmaessig eine Bestaetigung per E-Mail
      openDialog('Fast geschafft', [el('p', {}, `Wir haben eine E-Mail an ${email} geschickt. Öffne den Link darin, um dein Konto zu bestätigen. Danach bist du automatisch angemeldet.`)]);
    } else {
      toast('Konto erstellt');
    }
  },

  async resetPassword(email) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: this.redirectUrl() });
    if (error) throw error;
    openDialog('E-Mail gesendet', [el('p', {}, `Falls ein Konto für ${email} existiert, bekommst du gleich eine E-Mail mit einem Link zum Zurücksetzen des Passworts.`)]);
  },

  askNewPassword() {
    openDialog('Neues Passwort festlegen', [
      field('Neues Passwort', el('input', { type: 'password', name: 'pw', minlength: 8, required: true, autocomplete: 'new-password' })),
    ], {
      onSave: async (f) => {
        const { error } = await this.sb.auth.updateUser({ password: f.pw.value });
        if (error) { toast(germanError(error), 'err'); return false; }
        toast('Passwort geändert');
      },
    });
  },

  async signOut() {
    const n = this.pending();
    if (n && !confirm(`${n} Änderung(en) sind noch nicht hochgeladen und gehen beim Abmelden verloren. Trotzdem abmelden?`)) return;
    if (!n && !confirm('Abmelden? Deine Bausteine bleiben im Konto gespeichert und werden von diesem Gerät entfernt.')) return;
    await this.sb.auth.signOut({ scope: 'local' }).catch(() => {});
    this.setAccount(null);
    toast('Abgemeldet');
  },

  /* ---------- Teams ---------- */

  async rpc(fn, args) {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw error;
    return data;
  },

  createTeam() {
    openDialog('Team erstellen', [
      field('Name des Teams', el('input', { type: 'text', name: 'name', required: true, maxlength: 80, placeholder: 'z. B. RK Wache Innsbruck' })),
      el('p', { class: 'help' }, 'Du wirst Admin des Teams und bekommst einen Beitrittscode, den du an Kolleginnen und Kollegen weitergibst.'),
    ], {
      saveLabel: 'Erstellen',
      onSave: async (f) => {
        try {
          const id = await this.rpc('create_team', { p_name: f.name.value });
          await this.sync();
          this.manageTeam(id);
          return false; // Dialog wird durch die Verwaltung ersetzt
        } catch (e) { toast(germanError(e), 'err'); return false; }
      },
    });
  },

  joinTeam() {
    openDialog('Team beitreten', [
      field('Beitrittscode', el('input', { type: 'text', name: 'code', required: true, autocomplete: 'off', autocapitalize: 'characters', placeholder: 'z. B. K7MXQ2PA', style: 'text-transform:uppercase;letter-spacing:.1em' })),
    ], {
      saveLabel: 'Beitreten',
      onSave: async (f) => {
        try {
          await this.rpc('join_team', { p_code: f.code.value });
          await this.sync();
          toast('Team beigetreten');
        } catch (e) { toast(germanError(e), 'err'); return false; }
      },
    });
  },

  async leaveTeam(t) {
    if (!confirm(`Team „${t.name}“ verlassen? Die Team-Bausteine sind danach auf diesem Gerät nicht mehr verfügbar.`)) return;
    try {
      const { error } = await this.sb.from('team_members').delete().eq('team_id', t.id).eq('user_id', this.account.id);
      if (error) throw error;
      await this.sync();
      toast('Team verlassen');
    } catch (e) { toast(germanError(e), 'err'); }
  },

  async manageTeam(teamId) {
    const t = this.teams.find((x) => x.id === teamId);
    if (!t) return;
    let code = '…', members = [];
    try {
      const [inv, mem] = await Promise.all([
        this.sb.from('team_invites').select('code').eq('team_id', t.id).maybeSingle(),
        this.sb.from('team_members').select('user_id, email, role').eq('team_id', t.id).order('email'),
      ]);
      if (inv.error) throw inv.error;
      if (mem.error) throw mem.error;
      code = inv.data ? inv.data.code : '–';
      members = mem.data;
    } catch (e) { return toast(germanError(e), 'err'); }

    const refresh = () => this.manageTeam(teamId);
    const act = async (fn) => { try { await fn(); await this.sync(); refresh(); } catch (e) { toast(germanError(e), 'err'); } };

    openDialog('Team „' + t.name + '“', [
      el('h2', {}, 'Beitrittscode'),
      el('div', { class: 'row' },
        el('code', { class: 'joincode' }, code),
        el('button', { type: 'button', class: 'btn small', onclick: () => navigator.clipboard?.writeText(code).then(() => toast('Code kopiert')) }, 'Kopieren'),
        el('button', { type: 'button', class: 'btn small', onclick: () => {
          if (confirm('Neuen Code erzeugen? Der alte Code funktioniert dann nicht mehr (bestehende Mitglieder bleiben im Team).')) act(() => this.rpc('new_team_code', { p_team: t.id }));
        } }, 'Neuer Code')),
      el('p', { class: 'help' }, 'Mit diesem Code können andere in der App unter Einstellungen → „Team beitreten“ Mitglied werden.'),
      el('h2', {}, `Mitglieder (${members.length})`),
      el('div', { class: 'members' }, members.map((m) => {
        const me = m.user_id === this.account.id;
        return el('div', { class: 'member' },
          el('div', { class: 'grow' }, el('div', {}, (m.email || 'Unbekannt') + (me ? ' (du)' : '')), el('div', { class: 'help' }, m.role === 'admin' ? 'Admin' : 'Mitglied')),
          el('button', { type: 'button', class: 'btn small', onclick: () => act(async () => {
            const { error } = await this.sb.from('team_members').update({ role: m.role === 'admin' ? 'member' : 'admin' }).eq('team_id', t.id).eq('user_id', m.user_id);
            if (error) throw error;
          }) }, m.role === 'admin' ? 'Admin entziehen' : 'Zum Admin'),
          me ? null : el('button', { type: 'button', class: 'btn small danger', onclick: () => {
            if (confirm(`${m.email} aus dem Team entfernen?`)) act(async () => {
              const { error } = await this.sb.from('team_members').delete().eq('team_id', t.id).eq('user_id', m.user_id);
              if (error) throw error;
            });
          } }, 'Entfernen'));
      })),
      el('h2', {}, 'Team'),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn small', onclick: () => {
          const name = prompt('Neuer Name des Teams:', t.name);
          if (name && name.trim()) act(async () => {
            const { error } = await this.sb.from('teams').update({ name: name.trim() }).eq('id', t.id);
            if (error) throw error;
          });
        } }, 'Umbenennen'),
        el('button', { type: 'button', class: 'btn small danger', onclick: async () => {
          if (!confirm(`Team „${t.name}“ mit allen Team-Bausteinen und -Formularen endgültig löschen?`)) return;
          try {
            const { error } = await this.sb.from('teams').delete().eq('id', t.id);
            if (error) throw error;
            $('#dlg').close();
            await this.sync();
            toast('Team gelöscht');
          } catch (e) { toast(germanError(e), 'err'); }
        } }, 'Team löschen')),
    ]);
  },

  /* ---------- Anzeige ---------- */

  statusText() {
    if (this.syncing) return 'Synchronisiere …';
    const n = this.pending();
    if (!navigator.onLine) return n ? `Offline – ${n} Änderung(en) werden später hochgeladen` : 'Offline – lokale Kopie wird verwendet';
    if (this.error) return 'Fehler: ' + this.error;
    if (n) return `${n} Änderung(en) werden hochgeladen …`;
    if (!this.lastSync) return 'Noch nicht synchronisiert';
    const min = Math.round((Date.now() - this.lastSync) / 60000);
    return 'Synchronisiert ' + (min < 1 ? 'gerade eben' : `vor ${min} Min.`);
  },

  renderAnnouncement() {
    const box = $('#announce'), text = (this.info.announcement || '').trim();
    box.replaceChildren();
    if (!text || store.load('announceSeen', '') === text) return;
    box.append(el('div', { class: 'note announce' },
      el('span', { class: 'grow' }, text),
      el('button', { type: 'button', class: 'linkish', 'aria-label': 'Hinweis ausblenden', onclick: () => { store.save('announceSeen', text); this.renderAnnouncement(); } }, '✕')));
  },

  render() {
    const card = $('#accountCard'), teamsCard = $('#teamsCard'), teamsHead = $('#teamsHead');
    if (!card) return;
    this.renderAnnouncement();
    const adminCard = $('#adminCard');
    adminCard.hidden = $('#adminHead').hidden = !(this.account && this.info.is_admin);
    card.replaceChildren();
    teamsCard.replaceChildren();
    teamsHead.hidden = teamsCard.hidden = !this.account;
    const dot = $('#syncDot');
    dot.hidden = !this.account;
    dot.className = 'sync' + (this.error ? ' err' : this.pending() || this.syncing ? ' busy' : !navigator.onLine ? '' : ' on');
    dot.title = this.account ? this.statusText() : '';

    if (!this.enabled) {
      card.append(el('p', { class: 'help', style: 'margin:0' }, 'Die Cloud-Synchronisierung ist noch nicht eingerichtet (siehe Anleitung, Abschnitt „Konto & Teams“). Bausteine und Formulare werden nur auf diesem Gerät gespeichert.'));
      return;
    }

    if (!this.account) {
      const email = el('input', { type: 'email', name: 'email', required: true, autocomplete: 'username', placeholder: 'name@beispiel.at' });
      const pw = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', placeholder: 'mindestens 8 Zeichen' });
      const run = async (btn, fn) => {
        if (!email.reportValidity()) return;
        btn.disabled = true;
        try { await fn(); } catch (e) { toast(germanError(e), 'err'); } finally { btn.disabled = false; }
      };
      const needPw = () => { if (pw.value.length < 8) { toast('Das Passwort muss mindestens 8 Zeichen haben.', 'err'); return false; } return true; };
      const mode = this.info.signup_mode;
      card.append(
        el('p', { class: 'help', style: 'margin-top:0' }, 'Mit einem Konto werden deine Bausteine, Formulare und Einstellungen gesichert und auf all deinen Geräten synchronisiert. Außerdem kannst du Teams beitreten.'),
        mode === 'closed' ? el('p', { class: 'note' }, 'Neue Registrierungen sind derzeit geschlossen.') : null,
        mode === 'domains' ? el('p', { class: 'note' }, 'Registrierung nur mit E-Mail-Adressen von ' + (this.info.allowed_domains || []).map((d) => '@' + d).join(', ') + '.') : null,
        field('E-Mail', email),
        field('Passwort', pw),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn primary', onclick: (e) => needPw() && run(e.currentTarget, () => this.signIn(email.value.trim(), pw.value)) }, 'Anmelden'),
          el('button', { type: 'button', class: 'btn', onclick: (e) => needPw() && run(e.currentTarget, () => this.signUp(email.value.trim(), pw.value)) }, 'Registrieren'),
          el('span', { class: 'grow' }),
          el('button', { type: 'button', class: 'btn small linkish', onclick: (e) => run(e.currentTarget, () => this.resetPassword(email.value.trim())) }, 'Passwort vergessen?')));
      return;
    }

    card.append(
      el('div', { class: 'row', style: 'margin-bottom:6px' },
        el('div', { class: 'grow' }, el('div', {}, 'Angemeldet als ', el('b', {}, this.account.email)),
          el('div', { class: 'help' + (this.error ? ' errtext' : '') }, this.statusText()))),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn small', onclick: () => this.sync(), disabled: this.syncing }, 'Jetzt synchronisieren'),
        el('button', { type: 'button', class: 'btn small', onclick: () => this.askNewPassword() }, 'Passwort ändern'),
        el('span', { class: 'grow' }),
        el('button', { type: 'button', class: 'btn small danger', onclick: () => this.signOut() }, 'Abmelden')));

    if (!this.teams.length) {
      teamsCard.append(el('p', { class: 'help', style: 'margin-top:0' }, 'Teams teilen gemeinsame Textbausteine und Formulare, z. B. für eine Wache. Admins pflegen die Team-Inhalte, alle Mitglieder können sie nutzen.'));
    }
    for (const t of this.teams) {
      teamsCard.append(el('div', { class: 'member' },
        el('div', { class: 'grow' }, el('div', {}, el('b', {}, t.name)), el('div', { class: 'help' }, t.role === 'admin' ? 'Admin' : 'Mitglied')),
        t.role === 'admin' ? el('button', { type: 'button', class: 'btn small', onclick: () => this.manageTeam(t.id) }, 'Verwalten') : null,
        el('button', { type: 'button', class: 'btn small danger', onclick: () => this.leaveTeam(t) }, 'Verlassen')));
    }
    teamsCard.append(el('div', { class: 'row', style: 'margin-top:10px' },
      el('button', { type: 'button', class: 'btn', onclick: () => this.joinTeam() }, 'Team beitreten'),
      el('button', { type: 'button', class: 'btn', onclick: () => this.createTeam() }, 'Team erstellen')));
  },
};
