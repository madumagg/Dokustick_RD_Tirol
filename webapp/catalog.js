'use strict';

/*
 * Medikamente- und Krankheiten-Datenbank (siehe supabase/migrations/*_catalog.sql)
 * sowie Arzneimittelliste 1 und 2 (supabase/migrations/*_arzneimittellisten.sql).
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
    primary: (e) => `${e.trade_name} ${e.dose}`,
    fields: [
      { key: 'trade_name', label: 'Handelsname', required: true, max: 120, placeholder: 'z. B. Thrombo ASS' },
      { key: 'ingredient', label: 'Wirkstoff', max: 200, placeholder: 'z. B. Acetylsalicylsäure' },
      { key: 'dose', label: 'Dosis', max: 60, placeholder: 'z. B. 100 mg' },
    ],
    csv: ['Handelsname', 'Wirkstoff', 'Dosis'],
  },
  dx: {
    table: 'diagnoses', title: 'Krankheiten', one: 'Krankheit', cols: 'id,name,abbreviation,approved,created_by,created_at',
    label: (e) => e.name,
    detail: (e) => e.abbreviation,
    haystack: (e) => `${e.name} ${e.abbreviation}`,
    primary: (e) => e.name,
    // Spalte heisst aus Kompatibilitaetsgruenden weiter "abbreviation"
    fields: [
      { key: 'name', label: 'Name', required: true, max: 150, placeholder: 'z. B. Koronare Herzkrankheit' },
      { key: 'abbreviation', label: 'Abkürzung / Beschreibung (optional)', max: 300, multiline: true, placeholder: 'z. B. KHK, Verengung der Herzkranzgefäße' },
    ],
    csv: ['Name', 'Abkürzung/Beschreibung'],
  },
  al1: drugList(1),
  al2: drugList(2),
};

// Arzneimittelliste 1/2: ein Eintrag = ein Medikament fuer ein Krankheitsbild (beide Listen in einer Tabelle)
function drugList(n) {
  return {
    table: 'drug_list_entries', list: n, title: `Arzneimittelliste ${n}`, tab: `Liste ${n}`, one: 'Medikament', slug: `arzneimittelliste-${n}`,
    none: `Noch keine Einträge in Arzneimittelliste ${n}.`,
    cols: 'id,list,name,indication,ingredient,dose,note,approved,created_by,created_at',
    // Spalte url erst ab Migration *_arzneimittellisten_laengere_texte.sql
    extraCols: 'url',
    label: (e) => e.name,
    detail: (e) => [e.ingredient, e.dose, e.note].filter(Boolean).join(' · '),
    haystack: (e) => `${e.name} ${e.ingredient} ${e.indication}`,
    primary: (e) => e.name,
    group: (e) => e.indication,
    fields: [
      { key: 'name', label: 'Medikament', required: true, max: 120, placeholder: 'z. B. Glucose 33 % i.v.' },
      { key: 'indication', label: 'Krankheitsbild', required: true, max: 150, placeholder: 'z. B. Hypoglykämie' },
      { key: 'ingredient', label: 'Wirkstoff', max: 200, placeholder: 'z. B. Glucose' },
      { key: 'dose', label: 'Dosierung (nur zur Information)', max: 2000, multiline: true, placeholder: 'z. B. ab 6. vLJ 15 g i.v.' },
      { key: 'note', label: 'Hinweise, z. B. Kontraindikationen', max: 2000, multiline: true, placeholder: 'z. B. KI: Kinder unter 6. vLJ' },
      { key: 'url', label: 'Link für mehr Infos (optional)', max: 500, inputType: 'url', extra: true, placeholder: 'https://… (z. B. Medikamentenlexikon)' },
    ],
    csv: ['Medikament', 'Krankheitsbild', 'Wirkstoff', 'Dosierung', 'Hinweise', 'Link'],
  };
}
const LIST_KINDS = ['al1', 'al2'];
const LIST_INFO = {
  al1: 'Für Notfallsanitäter:innen freigegeben, die Nachforderung eines Notarztes ist nicht zwingend.',
  al2: 'Notkompetenz (NKA/NKV) nach § 11 SanG: Notarzt vorher informieren bzw. nachfordern.',
};
// Tabelle fehlt -> Migration noch nicht eingespielt
// Nur Links mit http/https anzeigen (Datenbank prueft das auch)
const safeUrl = (u) => (/^https?:\/\/\S+$/i.test(String(u || '')) ? u : '');
const missingTable = (error) => error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message);

// Fuer die Suche: Gross/Klein und Akzente ignorieren
const normText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const catalog = {
  med: [],
  dx: [],
  al1: [],
  al2: [],
  available: null, // false = Tabellen fehlen (Katalog-Migration nicht eingespielt)
  listsAvailable: null, // false = Arzneimittellisten fehlen (eigene Migration)
  extraMissing: false, // true = Spalten aus extraCols fehlen noch (Migration nicht eingespielt)
  view: 'med',
  lastList: null, // zuletzt gewaehlte Arzneimittelliste
  onlyPending: false,
  query: '',

  get isAdmin() { return !!(cloud.account && cloud.info.is_admin); },
  key() { return cloud.account ? `u.${cloud.account.id}.catalog` : null; },

  load() {
    const c = this.key() ? store.load(this.key(), null) : null;
    for (const kind of Object.keys(CATALOGS)) this[kind] = (c && c[kind]) || [];
    this.available = c ? c.available : null;
    this.listsAvailable = c && c.listsAvailable !== undefined ? c.listsAvailable : null;
    this.render();
  },

  save() {
    if (this.key()) store.save(this.key(), { med: this.med, dx: this.dx, al1: this.al1, al2: this.al2, available: this.available, listsAvailable: this.listsAvailable });
  },

  async pull() {
    if (!cloud.sb || !cloud.account || !navigator.onLine) return;
    this.extraMissing = false;
    for (const kind of Object.keys(CATALOGS)) {
      const C = CATALOGS[kind];
      const { data, error } = await this.fetchAll(C);
      if (error) {
        if (!missingTable(error)) throw error;
        // Arzneimittellisten haben eine eigene Migration: Medikamente/Krankheiten gehen trotzdem
        if (C.list) { this.listsAvailable = false; this[kind] = []; continue; }
        this.available = false; this.save(); this.render(); return;
      }
      if (C.list) this.listsAvailable = true;
      this[kind] = data.sort((a, b) => (C.group ? C.group(a).localeCompare(C.group(b), 'de') : 0) || C.label(a).localeCompare(C.label(b), 'de'));
    }
    this.available = true;
    this.save();
    this.render();
  },

  // Spalten fuer Abfragen: extraCols nur, solange der Server sie kennt
  colsOf(C) { return C.extraCols && !this.extraMissing ? `${C.cols},${C.extraCols}` : C.cols; },
  fields(C) { return C.fields.filter((f) => !(f.extra && this.extraMissing)); },

  // Supabase liefert pro Abfrage hoechstens 1000 Zeilen (max_rows), daher seitenweise bis zur Gesamtzahl laden
  async fetchAll(C) {
    const r = await this.fetchPages(C);
    // Spalte fehlt (neue Migration noch nicht eingespielt): ohne sie weiter
    if (r.error && C.extraCols && !this.extraMissing && (r.error.code === '42703' || /column .* does not exist/i.test(r.error.message))) {
      this.extraMissing = true;
      return this.fetchPages(C);
    }
    return r;
  },

  async fetchPages(C) {
    const rows = [];
    let total = Infinity;
    while (rows.length < total) {
      let q = cloud.sb.from(C.table).select(this.colsOf(C), { count: 'exact' });
      if (C.list) q = q.eq('list', C.list);
      const { data, error, count } = await q.order('id').range(rows.length, rows.length + 999);
      if (error) return { error };
      if (count != null) total = count;
      if (!data.length) break;
      rows.push(...data);
    }
    return { data: rows };
  },

  pending(kind) { return this[kind].filter((e) => !e.approved); },

  // Eintraege einer Arzneimittelliste, die man verwenden kann: freigegebene und eigene Vorschlaege
  // (Admins laden auch fremde Vorschlaege, die gehoeren nicht in die Bausteine)
  usable(kind) {
    const me = cloud.account && cloud.account.id;
    return this[kind].filter((e) => e.approved || e.created_by === me);
  },

  // Fuer Bausteine: Medikamente bzw. Krankheitsbilder einer Arzneimittelliste (ohne Doppelte)
  drugNames(kind) {
    return [...new Set(this.usable(kind).map((e) => e.name.trim()))].sort((a, b) => a.localeCompare(b, 'de'));
  },
  indications(kind) {
    return [...new Set(this.usable(kind).map((e) => e.indication.trim()))].sort((a, b) => a.localeCompare(b, 'de'));
  },
  // Eintraege zu gewaehlten Medikamenten, z.B. fuer Dosierung und Kontraindikationen
  drugEntries(kind, names) {
    const set = new Set(names.map(normText));
    return this.usable(kind).filter((e) => set.has(normText(e.name)));
  },

  // Jedes Suchwort muss vorkommen (Reihenfolge egal), z.B. "thrombo 100" -> "Thrombo ASS 100 mg".
  // Reihenfolge: Treffer im Namen (am Wortanfang zuerst) vor Treffern nur in
  // Wirkstoff/Beschreibung, Freigegebene vor Vorschlaegen.
  search(kind, q, limit = 8) {
    const words = normText(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    const C = CATALOGS[kind];
    const hits = [];
    for (const e of this[kind]) {
      const h = normText(C.haystack(e));
      if (!words.every((w) => h.includes(w))) continue;
      const name = normText(C.primary(e));
      const inName = words.every((w) => name.includes(w));
      const i = name.indexOf(words[0]);
      const wordStart = i === 0 || (i > 0 && name[i - 1] === ' ');
      hits.push({ e, score: (inName ? (wordStart ? 0 : 1) : 4) + (e.approved ? 0 : 2) });
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
      // Arzneimittellisten: dasselbe Medikament darf fuer mehrere Krankheitsbilder eingetragen sein
      if (C.list && normText(e.indication) !== normText(entry.indication)) return false;
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
    if (this.available === false || (C.list && this.listsAvailable === false)) { toast('Die Datenbank ist noch nicht eingerichtet.', 'err'); return Promise.resolve(null); }
    const isNew = !entry;
    const values = { ...prefill, ...(entry || {}) };
    const fields = this.fields(C);
    const inputs = Object.fromEntries(fields.map((f) => [f.key, f.multiline
      ? el('textarea', { name: f.key, rows: 3, maxlength: f.max, placeholder: f.placeholder }, values[f.key] || '')
      : el('input', { type: f.inputType || 'text', name: f.key, value: values[f.key] || '', required: !!f.required, maxlength: f.max, placeholder: f.placeholder, autocomplete: 'off' })]));
    return new Promise((resolve) => {
      let result = null;
      $('#dlg').addEventListener('close', () => resolve(result), { once: true });
      openDialog(isNew ? (this.isAdmin ? `${C.one} hinzufügen` : `${C.one} vorschlagen`) : `${C.one} bearbeiten`, [
        ...fields.map((f) => field(f.label, inputs[f.key])),
        kind === 'med' ? el('p', { class: 'help', style: 'margin-top:-4px' }, 'Im Protokoll erscheinen nur Handelsname und Dosis. Der Wirkstoff hilft beim Suchen.') : null,
        C.list ? el('p', { class: 'help', style: 'margin-top:-4px' }, 'Im Protokoll erscheint der Name des Medikaments, im Feld „Krankheitsbild“ das Krankheitsbild. Dosierung und Hinweise sieht man beim Auswählen im Baustein. Gibt es das Medikament für ein weiteres Krankheitsbild, einen eigenen Eintrag mit demselben Namen anlegen.') : null,
        isNew && !this.isAdmin ? el('p', { class: 'note' }, 'Dein Vorschlag ist für dich sofort nutzbar. Für alle anderen erscheint er, sobald ein Admin ihn freigegeben hat.') : null,
      ], {
        saveLabel: isNew ? (this.isAdmin ? 'Hinzufügen' : 'Vorschlagen') : 'Speichern',
        onSave: async () => {
          const row = Object.fromEntries(fields.map((f) => [f.key, inputs[f.key].value.trim()]));
          if (row.url && !safeUrl(row.url)) { toast('Der Link muss mit http:// oder https:// beginnen.', 'err'); return false; }
          const sim = this.similar(kind, row, entry && entry.id);
          if (sim.length && !confirm(`Ähnliche Einträge gibt es schon:\n\n${sim.slice(0, 8).join('\n')}\n\nTrotzdem speichern?`)) return false;
          if (!navigator.onLine) { toast('Dafür wird eine Internetverbindung benötigt.', 'err'); return false; }
          const q = isNew
            ? cloud.sb.from(C.table).insert({ ...row, ...(C.list ? { list: C.list } : {}), approved: this.isAdmin }).select(this.colsOf(C)).single()
            : cloud.sb.from(C.table).update(row).eq('id', entry.id).select(this.colsOf(C)).single();
          const { data, error } = await q;
          if (error) {
            toast(error.code === '23505' ? 'Diesen Eintrag gibt es schon (eventuell als Vorschlag, der noch auf Freigabe wartet).'
              : error.code === '23514' ? 'Eine Eingabe ist zu lang für die Datenbank.' : germanError(error), 'err');
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
      const all = rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] || '']))).filter((r) => r[keys[0]]);
      const tooLong = (r) => C.fields.some((f) => f.max && r[f.key].length > f.max);
      const data = all.filter((r) => !tooLong(r));
      const skippedLong = all.filter(tooLong);
      if (!data.length) return toast(skippedLong.length ? 'Alle Zeilen sind zu lang für die Datenbank.' : 'Keine Einträge in der Datei gefunden.', 'err');
      const longNote = skippedLong.length ? `\n\n${skippedLong.length} Zeile(n) sind zu lang und werden ausgelassen, z. B. „${C.label(skippedLong[0]).slice(0, 60)}“.` : '';
      if (!confirm(`${data.length} ${C.title} importieren? Bereits vorhandene werden übersprungen.\n\nBeispiel: ${C.label(data[0])}${longNote}`)) return;
      const { data: n, error } = await cloud.sb.rpc('admin_import_catalog', { p_kind: kind, p_rows: data });
      if (error) return toast(germanError(error), 'err');
      // Erst neu laden, dann melden: so sind die Eintraege sofort suchbar
      await this.pull().catch(() => {});
      toast(`${n} neu importiert, ${data.length - n} übersprungen` + (skippedLong.length ? `, ${skippedLong.length} zu lang` : ''));
    });
    input.click();
  },

  // Gleiches Format wie der Import (Semikolon, Kopfzeile), damit Listen gesichert und wieder eingespielt werden koennen
  exportCsv(kind) {
    const C = CATALOGS[kind];
    const cell = (v) => (/[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    const rows = this[kind].filter((e) => e.approved).map((e) => C.fields.map((f) => cell(String(e[f.key] || ''))).join(';'));
    const csv = '\uFEFF' + [C.csv.join(';'), ...rows].join('\r\n') + '\r\n';
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const a = el('a', {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
      download: `protopilot-${C.slug || C.title.toLowerCase()}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`,
    });
    document.body.append(a); a.click(); a.remove();
    toast(`${rows.length} ${C.title} exportiert`);
  },

  /* ---------- Reiter "Datenbank" ---------- */

  render() {
    const box = $('#dbBody');
    if (!box) return;
    // Hinweis auf offene Vorschlaege fuer Admins (Reiter und Umschalter)
    const pend = Object.fromEntries(Object.keys(CATALOGS).map((k) => [k, this.isAdmin ? this.pending(k).length : 0]));
    const total = Object.values(pend).reduce((a, b) => a + b, 0);
    const navBadge = $('#dbNavBadge');
    navBadge.hidden = !total;
    navBadge.textContent = total;
    const isList = LIST_KINDS.includes(this.view);
    document.querySelectorAll('#dbTabs button').forEach((b) => {
      const k = b.dataset.kind;
      const n = k === 'al' ? pend.al1 + pend.al2 : pend[k];
      b.setAttribute('aria-selected', k === this.view || (k === 'al' && isList));
      b.textContent = (k === 'al' ? 'Arzneimittel­listen' : CATALOGS[k].title) + (n ? ` (${n})` : '');
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
    // Arzneimittellisten: Umschalter Liste 1 / Liste 2 mit kurzer Erklaerung
    const sub = isList ? [
      el('div', { class: 'seg seg-2', id: 'dbListTabs', role: 'tablist' }, LIST_KINDS.map((k) => el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(k === kind), 'data-kind': k,
        onclick: () => { this.view = this.lastList = k; this.query = ''; this.render(); },
      }, CATALOGS[k].tab + (pend[k] ? ` (${pend[k]})` : '')))),
      el('p', { class: 'help', style: 'margin:-8px 0 12px' }, `${C.title}: ${LIST_INFO[kind]}`),
    ] : [];
    if (isList && this.listsAvailable === false) {
      box.replaceChildren(...sub, el('div', { class: 'note warn' }, 'Die Arzneimittellisten sind noch nicht eingerichtet. Ein Admin muss einmalig die Migration supabase/migrations/20261028180000_arzneimittellisten.sql im Supabase-SQL-Editor ausführen.'));
      return;
    }
    const search = el('input', { type: 'search', placeholder: kind === 'med' ? 'Name oder Wirkstoff …' : C.list ? 'Medikament, Wirkstoff oder Krankheitsbild …' : 'Name, Abkürzung, Beschreibung …', value: this.query });
    const list = el('div', { class: 'mods' });
    const draw = () => {
      this.query = search.value;
      const q = normText(search.value);
      let entries = this[kind];
      if (this.onlyPending) entries = entries.filter((e) => !e.approved);
      const words = q.split(' ').filter(Boolean);
      if (words.length) entries = entries.filter((e) => { const h = normText(C.haystack(e)); return words.every((w) => h.includes(w)); });
      const shown = entries.slice(0, 200);
      // Arzneimittellisten nach Krankheitsbild gruppiert, wie in der Uebersicht der Liste
      const cards = [];
      let group = null;
      for (const e of shown) {
        if (C.group && C.group(e) !== group) { group = C.group(e); cards.push(el('h3', { class: 'db-group' }, group)); }
        cards.push(this.entryCard(kind, e));
      }
      list.replaceChildren(...cards);
      if (!shown.length) list.append(el('div', { class: 'empty' }, this[kind].length ? 'Nichts gefunden.' : `${C.none || `Noch keine ${C.title}.`} Mit „＋“ den ersten Eintrag anlegen.`));
      if (entries.length > shown.length) list.append(el('p', { class: 'help' }, `${entries.length - shown.length} weitere – bitte Suche verfeinern.`));
    };
    search.addEventListener('input', draw);
    draw();
    box.replaceChildren(...kids(
      ...sub,
      el('div', { class: 'row', style: 'margin-bottom:10px' },
        el('div', { class: 'grow', style: 'min-width:180px' }, search),
        el('button', { type: 'button', class: 'btn primary', onclick: () => this.edit(kind).then((e) => {
          // Nach dem Namen filtern, sonst geht der neue Eintrag in langen Listen unter
          if (e) { this.query = kind === 'med' ? e.trade_name : e.name; this.render(); }
        }) }, this.isAdmin ? '＋ Neu' : '＋ Vorschlagen')),
      this.isAdmin ? el('div', { class: 'row', style: 'margin-bottom:10px' },
        el('label', { class: 'check grow', style: 'min-height:36px' },
          el('input', { type: 'checkbox', checked: this.onlyPending, onchange: (e) => { this.onlyPending = e.target.checked; this.render(); } }),
          `Nur offene Vorschläge (${pend[kind]})`),
        el('button', { type: 'button', class: 'btn small', onclick: () => this.importCsv(kind) }, 'CSV importieren'),
        el('button', { type: 'button', class: 'btn small', onclick: () => this.exportCsv(kind) }, 'CSV exportieren')) : null,
      el('p', { class: 'help', style: 'margin:0 0 10px' }, `${this[kind].filter((e) => e.approved).length} freigegeben` + (this.pending(kind).length ? ` · ${this.pending(kind).length} ${this.isAdmin ? 'offen' : 'eigene Vorschläge offen'}` : '')),
      list));
  },

  entryCard(kind, e) {
    const C = CATALOGS[kind];
    const mine = cloud.account && e.created_by === cloud.account.id;
    const canEditEntry = this.isAdmin || (mine && !e.approved);
    // Arzneimittellisten: Wirkstoff, Dosierung und Hinweise vollstaendig, je eine Zeile
    const detail = C.list
      ? [...[e.ingredient, e.dose, e.note].filter(Boolean).map((t) => el('span', { style: 'display:block' }, t)),
        ...(safeUrl(e.url) ? [el('a', { href: e.url, target: '_blank', rel: 'noopener', class: 'drug-link' }, 'Mehr Infos ↗')] : [])]
      : C.detail(e);
    return el('div', { class: 'mod card' },
      el('div', { class: 'send', style: 'cursor:default' },
        el('span', { class: 'title' }, C.label(e), !e.approved ? el('span', { class: 'badge warn' }, 'wartet auf Freigabe') : null),
        detail && detail.length ? el('span', { class: 'prev' + (C.list ? ' full' : '') }, detail) : null),
      canEditEntry ? el('div', { class: 'acts' },
        this.isAdmin && !e.approved ? el('button', { title: 'Freigeben', 'aria-label': 'Freigeben', class: 'ok-act', onclick: () => this.approve(kind, e) }, '✓') : null,
        el('button', { title: 'Bearbeiten', 'aria-label': 'Bearbeiten', onclick: () => this.edit(kind, e) }, '✎'),
        el('button', { title: e.approved ? 'Löschen' : this.isAdmin ? 'Ablehnen' : 'Zurückziehen', 'aria-label': 'Löschen', onclick: () => this.remove(kind, e) }, '🗑')) : null);
  },
};

document.querySelectorAll('#dbTabs button').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.kind;
  // "Arzneimittellisten": zuletzt gewaehlte Liste, sonst Liste 1
  if (k === 'al') { if (!LIST_KINDS.includes(catalog.view)) catalog.view = catalog.lastList || 'al1'; } else catalog.view = k;
  catalog.query = '';
  catalog.render();
}));
