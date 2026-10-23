'use strict';

/*
 * Medikamente- und Krankheiten-Datenbank (siehe supabase/migrations/*_catalog.sql).
 *
 * Die Listen werden beim Synchronisieren geladen und auf dem Geraet gespeichert,
 * damit die Suche in den Bausteinen auch ohne Internet funktioniert.
 * Neue Eintraege sind Vorschlaege, bis ein App-Admin sie freigibt.
 */

const CATALOGS = {
  med: {
    table: 'medications', title: 'Medikamente', one: 'Medikament', cols: 'id,trade_name,ingredient,dose,approved,created_by,created_at',
    label: (e) => [e.trade_name, e.dose].filter(Boolean).join(' '),
    detail: (e) => e.ingredient,
    haystack: (e) => `${e.trade_name} ${e.ingredient} ${e.dose}`,
    fields: [
      { key: 'trade_name', label: 'Handelsname', required: true, placeholder: 'z. B. Thrombo ASS' },
      { key: 'ingredient', label: 'Wirkstoff', placeholder: 'z. B. Acetylsalicylsäure' },
      { key: 'dose', label: 'Dosis', placeholder: 'z. B. 100 mg' },
    ],
    csv: ['Handelsname', 'Wirkstoff', 'Dosis'],
  },
  dx: {
    table: 'diagnoses', title: 'Krankheiten', one: 'Krankheit', cols: 'id,name,abbreviation,approved,created_by,created_at',
    label: (e) => e.name,
    detail: (e) => e.abbreviation,
    haystack: (e) => `${e.name} ${e.abbreviation}`,
    fields: [
      { key: 'name', label: 'Name', required: true, placeholder: 'z. B. Koronare Herzkrankheit' },
      { key: 'abbreviation', label: 'Abkürzung (optional)', placeholder: 'z. B. KHK' },
    ],
    csv: ['Name', 'Abkürzung'],
  },
};

// Fuer die Suche: Gross/Klein und Akzente ignorieren
const normText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const catalog = {
  med: [],
  dx: [],
  available: null, // false = Tabellen fehlen (Katalog-Migration nicht eingespielt)
  view: 'med',
  onlyPending: false,
  query: '',

  get isAdmin() { return !!(cloud.account && cloud.info.is_admin); },
  key() { return cloud.account ? `u.${cloud.account.id}.catalog` : null; },

  load() {
    const c = this.key() ? store.load(this.key(), null) : null;
    this.med = (c && c.med) || [];
    this.dx = (c && c.dx) || [];
    this.available = c ? c.available : null;
    this.render();
  },

  save() {
    if (this.key()) store.save(this.key(), { med: this.med, dx: this.dx, available: this.available });
  },

  async pull() {
    if (!cloud.sb || !cloud.account || !navigator.onLine) return;
    for (const kind of ['med', 'dx']) {
      const { data, error } = await cloud.sb.from(CATALOGS[kind].table).select(CATALOGS[kind].cols).limit(20000);
      if (error) {
        // Tabelle existiert nicht -> Datenbank noch nicht eingerichtet
        if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) { this.available = false; this.save(); this.render(); return; }
        throw error;
      }
      this[kind] = data.sort((a, b) => CATALOGS[kind].label(a).localeCompare(CATALOGS[kind].label(b), 'de'));
    }
    this.available = true;
    this.save();
    this.render();
  },

  pending(kind) { return this[kind].filter((e) => !e.approved); },

  // Jedes Suchwort muss vorkommen (Reihenfolge egal), z.B. "thrombo 100" -> "Thrombo ASS 100 mg".
  // Treffer am Wortanfang vor Teiltreffern, Freigegebene vor Vorschlaegen.
  search(kind, q, limit = 8) {
    const words = normText(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    const C = CATALOGS[kind];
    const hits = [];
    for (const e of this[kind]) {
      const h = normText(C.haystack(e));
      if (!words.every((w) => h.includes(w))) continue;
      const i = h.indexOf(words[0]);
      const wordStart = i === 0 || h[i - 1] === ' ';
      hits.push({ e, score: (wordStart ? 0 : 2) + (e.approved ? 0 : 1) });
    }
    return hits.sort((a, b) => a.score - b.score || C.label(a.e).localeCompare(C.label(b.e), 'de')).slice(0, limit).map((x) => x.e);
  },

  // Aehnliche Eintraege, um Doppelte schon beim Vorschlagen zu vermeiden
  similar(kind, entry, ignoreId) {
    const C = CATALOGS[kind];
    const main = normText(kind === 'med' ? entry.trade_name : entry.name);
    if (!main) return [];
    return this[kind].filter((e) => e.id !== ignoreId).filter((e) => {
      const other = normText(kind === 'med' ? e.trade_name : e.name);
      if (other === main || (main.length >= 4 && (other.startsWith(main) || main.startsWith(other)))) return true;
      if (kind === 'med' && entry.ingredient && normText(e.ingredient) === normText(entry.ingredient) && normText(e.dose) === normText(entry.dose)) return true;
      if (kind === 'dx' && entry.abbreviation && normText(e.abbreviation) === normText(entry.abbreviation)) return true;
      return false;
    }).map((e) => C.label(e));
  },

  /* ---------- Bearbeiten ---------- */

  // Neuer Vorschlag (bzw. bei Admins: neuer Eintrag) oder Aenderung; liefert den Eintrag oder null
  edit(kind, entry = null, prefill = {}) {
    const C = CATALOGS[kind];
    if (!cloud.account) { toast('Bitte zuerst unter Einstellungen anmelden.', 'err'); return Promise.resolve(null); }
    if (this.available === false) { toast('Die Datenbank ist noch nicht eingerichtet.', 'err'); return Promise.resolve(null); }
    const isNew = !entry;
    const values = { ...prefill, ...(entry || {}) };
    const inputs = Object.fromEntries(C.fields.map((f) => [f.key, el('input', { type: 'text', name: f.key, value: values[f.key] || '', required: !!f.required, placeholder: f.placeholder, autocomplete: 'off' })]));
    return new Promise((resolve) => {
      let result = null;
      $('#dlg').addEventListener('close', () => resolve(result), { once: true });
      openDialog(isNew ? (this.isAdmin ? `${C.one} hinzufügen` : `${C.one} vorschlagen`) : `${C.one} bearbeiten`, [
        ...C.fields.map((f) => field(f.label, inputs[f.key])),
        kind === 'med' ? el('p', { class: 'help', style: 'margin-top:-4px' }, 'Im Protokoll erscheinen nur Handelsname und Dosis. Der Wirkstoff hilft beim Suchen.') : null,
        isNew && !this.isAdmin ? el('p', { class: 'note' }, 'Dein Vorschlag ist für dich sofort nutzbar. Für alle anderen erscheint er, sobald ein Admin ihn freigegeben hat.') : null,
      ], {
        saveLabel: isNew ? (this.isAdmin ? 'Hinzufügen' : 'Vorschlagen') : 'Speichern',
        onSave: async () => {
          const row = Object.fromEntries(C.fields.map((f) => [f.key, inputs[f.key].value.trim()]));
          const sim = this.similar(kind, row, entry && entry.id);
          if (sim.length && !confirm(`Ähnliche Einträge gibt es schon:\n\n${sim.slice(0, 8).join('\n')}\n\nTrotzdem speichern?`)) return false;
          if (!navigator.onLine) { toast('Dafür wird eine Internetverbindung benötigt.', 'err'); return false; }
          const q = isNew
            ? cloud.sb.from(C.table).insert({ ...row, approved: this.isAdmin }).select(C.cols).single()
            : cloud.sb.from(C.table).update(row).eq('id', entry.id).select(C.cols).single();
          const { data, error } = await q;
          if (error) {
            toast(error.code === '23505' ? 'Diesen Eintrag gibt es schon (eventuell als Vorschlag, der noch auf Freigabe wartet).' : germanError(error), 'err');
            return false;
          }
          result = data;
          toast(isNew ? (this.isAdmin ? 'Hinzugefügt' : 'Vorgeschlagen – wartet auf Freigabe') : 'Gespeichert');
          this.pull().catch(() => {});
        },
      });
    });
  },

  async approve(kind, e) {
    const { error } = await cloud.sb.from(CATALOGS[kind].table).update({ approved: true }).eq('id', e.id);
    if (error) return toast(germanError(error), 'err');
    toast('Freigegeben');
    await this.pull();
  },

  async remove(kind, e) {
    const C = CATALOGS[kind];
    const text = e.approved ? `„${C.label(e)}“ endgültig aus der Datenbank löschen?` : `Vorschlag „${C.label(e)}“ ${this.isAdmin ? 'ablehnen' : 'zurückziehen'}?`;
    if (!confirm(text)) return;
    const { error } = await cloud.sb.from(C.table).delete().eq('id', e.id);
    if (error) return toast(germanError(error), 'err');
    toast(e.approved ? 'Gelöscht' : this.isAdmin ? 'Abgelehnt' : 'Zurückgezogen');
    await this.pull();
  },

  /* ---------- CSV-Import (Admins) ---------- */

  importCsv(kind) {
    const C = CATALOGS[kind];
    const input = el('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const lines = (await file.text()).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
      const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
      const split = (l) => {
        const out = []; let cur = '', q = false;
        for (let i = 0; i < l.length; i++) {
          const ch = l[i];
          if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch;
        }
        out.push(cur);
        return out.map((x) => x.trim());
      };
      let rows = lines.map(split);
      if (rows.length && normText(rows[0][0]) === normText(C.csv[0])) rows = rows.slice(1); // Kopfzeile
      const keys = C.fields.map((f) => f.key);
      const data = rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] || '']))).filter((r) => r[keys[0]]);
      if (!data.length) return toast('Keine Einträge in der Datei gefunden.', 'err');
      if (!confirm(`${data.length} ${C.title} importieren? Bereits vorhandene werden übersprungen.\n\nBeispiel: ${C.label(data[0])}`)) return;
      const { data: n, error } = await cloud.sb.rpc('admin_import_catalog', { p_kind: kind, p_rows: data });
      if (error) return toast(germanError(error), 'err');
      toast(`${n} neu importiert, ${data.length - n} übersprungen`);
      await this.pull();
    });
    input.click();
  },

  /* ---------- Reiter "Datenbank" ---------- */

  render() {
    const box = $('#dbBody');
    if (!box) return;
    // Hinweis auf offene Vorschlaege fuer Admins (Reiter und Umschalter)
    const pend = { med: this.pending('med').length, dx: this.pending('dx').length };
    const navBadge = $('#dbNavBadge');
    navBadge.hidden = !(this.isAdmin && pend.med + pend.dx);
    navBadge.textContent = pend.med + pend.dx;
    document.querySelectorAll('#dbTabs button').forEach((b) => {
      const k = b.dataset.kind;
      b.setAttribute('aria-selected', k === this.view);
      b.textContent = CATALOGS[k].title + (this.isAdmin && pend[k] ? ` (${pend[k]})` : '');
    });

    if (!cloud.enabled || !cloud.account) {
      box.replaceChildren(el('div', { class: 'note' }, 'Die Datenbank steht nach der Anmeldung zur Verfügung (Einstellungen → Konto).'));
      return;
    }
    if (this.available === false) {
      box.replaceChildren(el('div', { class: 'note warn' }, 'Die Datenbank ist noch nicht eingerichtet. Ein Admin muss einmalig die Migration supabase/migrations/20261023120200_catalog.sql im Supabase-SQL-Editor ausführen.'));
      return;
    }
    const kind = this.view, C = CATALOGS[kind];
    const search = el('input', { type: 'search', placeholder: kind === 'med' ? 'Name oder Wirkstoff …' : 'Name oder Abkürzung …', value: this.query });
    const list = el('div', { class: 'mods' });
    const draw = () => {
      this.query = search.value;
      const q = normText(search.value);
      let entries = this[kind];
      if (this.onlyPending) entries = entries.filter((e) => !e.approved);
      const words = q.split(' ').filter(Boolean);
      if (words.length) entries = entries.filter((e) => { const h = normText(C.haystack(e)); return words.every((w) => h.includes(w)); });
      const shown = entries.slice(0, 200);
      list.replaceChildren(...shown.map((e) => this.entryCard(kind, e)));
      if (!shown.length) list.append(el('div', { class: 'empty' }, this[kind].length ? 'Nichts gefunden.' : `Noch keine ${C.title}. Mit „＋“ den ersten Eintrag anlegen.`));
      if (entries.length > shown.length) list.append(el('p', { class: 'help' }, `${entries.length - shown.length} weitere – bitte Suche verfeinern.`));
    };
    search.addEventListener('input', draw);
    draw();
    box.replaceChildren(
      el('div', { class: 'row', style: 'margin-bottom:10px' },
        el('div', { class: 'grow', style: 'min-width:180px' }, search),
        el('button', { type: 'button', class: 'btn primary', onclick: () => this.edit(kind).then((e) => e && this.render()) }, this.isAdmin ? '＋ Neu' : '＋ Vorschlagen')),
      this.isAdmin ? el('div', { class: 'row', style: 'margin-bottom:10px' },
        el('label', { class: 'check grow', style: 'min-height:36px' },
          el('input', { type: 'checkbox', checked: this.onlyPending, onchange: (e) => { this.onlyPending = e.target.checked; this.render(); } }),
          `Nur offene Vorschläge (${pend[kind]})`),
        el('button', { type: 'button', class: 'btn small', onclick: () => this.importCsv(kind) }, 'CSV importieren')) : null,
      el('p', { class: 'help', style: 'margin:0 0 10px' }, `${this[kind].filter((e) => e.approved).length} freigegeben` + (pend[kind] ? ` · ${pend[kind]} ${this.isAdmin ? 'offen' : 'eigene Vorschläge offen'}` : '')),
      list);
  },

  entryCard(kind, e) {
    const C = CATALOGS[kind];
    const mine = cloud.account && e.created_by === cloud.account.id;
    const canEditEntry = this.isAdmin || (mine && !e.approved);
    return el('div', { class: 'mod card' },
      el('div', { class: 'send', style: 'cursor:default' },
        el('span', { class: 'title' }, C.label(e), !e.approved ? el('span', { class: 'badge warn' }, 'wartet auf Freigabe') : null),
        C.detail(e) ? el('span', { class: 'prev' }, C.detail(e)) : null),
      canEditEntry ? el('div', { class: 'acts' },
        this.isAdmin && !e.approved ? el('button', { title: 'Freigeben', 'aria-label': 'Freigeben', class: 'ok-act', onclick: () => this.approve(kind, e) }, '✓') : null,
        el('button', { title: 'Bearbeiten', 'aria-label': 'Bearbeiten', onclick: () => this.edit(kind, e) }, '✎'),
        el('button', { title: e.approved ? 'Löschen' : this.isAdmin ? 'Ablehnen' : 'Zurückziehen', 'aria-label': 'Löschen', onclick: () => this.remove(kind, e) }, '🗑')) : null);
  },
};

document.querySelectorAll('#dbTabs button').forEach((b) => b.addEventListener('click', () => { catalog.view = b.dataset.kind; catalog.query = ''; catalog.render(); }));
