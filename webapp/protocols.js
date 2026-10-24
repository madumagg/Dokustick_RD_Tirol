'use strict';

/*
 * Protokollvorlagen: benannte Gruppen von Bausteinen, die mit einem Tipp ins
 * Protokoll kommen (z.B. "Standard", "Trauma", "Kind").
 *
 * Gespeichert als Eintrag mit kind 'protocol' (eigene, Team oder Standard-Bereich),
 * body = {"items": [<Baustein-IDs in Reihenfolge>]}. Die Bausteine werden beim
 * Einfuegen in ihrer aktuellen Fassung genommen. Welche Vorlage der Knopf im
 * Schreiben-Reiter einfuegt, steht in settings.defaultProtocol.
 */

const protocols = {
  list() { return listItems('protocol'); },
  ids(p) {
    try { const d = JSON.parse(p.body); return Array.isArray(d.items) ? d.items.filter((x) => typeof x === 'string') : []; } catch { return []; }
  },
  body(ids) { return JSON.stringify({ items: ids }); },
  find(id) { return id ? items.find((i) => i.id === id && i.kind === 'protocol' && !i.deleted) || null : null; },
  module(id) { return items.find((i) => i.id === id && i.kind !== 'protocol' && !i.deleted) || null; },

  // Eigener Standard, sonst die erste eigene Vorlage, sonst die erste aus dem Standard-Bereich
  current() {
    const all = this.list();
    return this.find(settings.defaultProtocol) || all.find((p) => !p.team_id) || all.find((p) => cloud.isStandard(p.team_id)) || all[0] || null;
  },

  // Bausteine in Reihenfolge; geloeschte oder nicht (mehr) sichtbare werden gezaehlt
  modules(p) {
    const found = [];
    let missing = 0;
    for (const id of this.ids(p)) { const it = this.module(id); if (it) found.push(it); else missing++; }
    return { found, missing };
  },

  // Darf der Baustein in einer Vorlage stehen, die fuer "target" gespeichert wird?
  // Team- und Standard-Vorlagen duerfen nur Bausteine enthalten, die dort alle sehen.
  allowedFor(it, target) {
    if (!target) return true;
    if (cloud.isStandard(target)) return cloud.isStandard(it.team_id);
    return it.team_id === target || cloud.isStandard(it.team_id);
  },

  insert(p) {
    const { found, missing } = this.modules(p);
    if (!found.length) { toast(`„${p.title}“ enthält keine verfügbaren Bausteine.`, 'err'); return; }
    // Interaktive Bausteine als Karte, einfache als Textblock (Reihenfolge bleibt erhalten)
    const blocks = found.map((it) => (formFields(it.body).length ? moduleBlock(it) : textBlock(it.body)));
    const last = doc[doc.length - 1];
    if (last && last.type === 'text' && !last.text.trim()) doc.splice(doc.length - 1, 0, ...blocks);
    else doc.push(...blocks, textBlock());
    saveDoc();
    renderDoc();
    showTab('write');
    toast(`„${p.title}“ eingefügt (${found.length} Bausteine)` + (missing ? `, ${missing} nicht mehr vorhanden` : ''), missing ? 'err' : undefined);
  },

  /* ---------- Schreiben-Reiter: Knopf neben "＋ Baustein" ---------- */

  renderButton() {
    const btn = $('#protoBtn');
    if (!btn) return;
    const p = this.current();
    btn.textContent = '📋 ' + (p ? shorten(p.title, 16) : 'Protokoll');
    btn.title = p ? `Protokollvorlage „${p.title}“ einfügen` : 'Protokollvorlage anlegen';
  },

  tap() {
    const p = this.current();
    if (p) this.insert(p); else this.open();
  },

  /* ---------- Auswahl und Verwaltung ---------- */

  open() {
    const list = el('div', { class: 'mods' });
    const draw = () => {
      const all = this.list(), cur = this.current();
      list.replaceChildren(...all.map((p) => {
        const { found, missing } = this.modules(p);
        const isCur = p === cur;
        return el('div', { class: 'mod card proto-card' },
          el('button', { type: 'button', class: 'send', onclick: () => { $('#dlg').close(); this.insert(p); } },
            el('span', { class: 'title' }, p.title, teamBadge(p), isCur ? el('span', { class: 'badge' }, '📋 Knopf') : null),
            el('span', { class: 'prev' }, `${found.length} Bausteine` + (missing ? ` · ${missing} fehlen` : '') + (found.length ? ': ' + found.map((m) => m.title).join(', ') : ''))),
          el('div', { class: 'acts' },
            el('button', {
              type: 'button', class: isCur ? 'ok-act' : '', title: 'Mit dem 📋-Knopf einfügen', 'aria-label': 'Mit dem Knopf einfügen',
              onclick: () => { settings.defaultProtocol = p.id; saveSettings(); this.renderButton(); draw(); toast(`📋 fügt jetzt „${p.title}“ ein`); },
            }, isCur ? '★' : '☆'),
            canEdit(p)
              ? el('button', { type: 'button', title: 'Bearbeiten', 'aria-label': 'Bearbeiten', onclick: () => this.edit(p, { back: true }) }, '✎')
              : el('button', { type: 'button', title: 'Als eigene Kopie speichern', 'aria-label': 'Als eigene Kopie speichern', onclick: () => { copyToMine(p); draw(); } }, '⧉')));
      }));
      if (!all.length) list.append(el('div', { class: 'empty' }, 'Noch keine Protokollvorlagen. Lege z. B. „Standard“ mit den Bausteinen an, die du bei jedem Patienten brauchst.'));
    };
    draw();
    openDialog('Protokollvorlagen', [
      el('p', { class: 'help', style: 'margin-top:0' }, 'Antippen fügt alle Bausteine der Vorlage ins Protokoll ein. ★ = wird mit dem 📋-Knopf im Schreiben-Reiter eingefügt.'),
      list,
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { type: 'button', class: 'btn primary', onclick: () => this.edit(null, { back: true }) }, '＋ Neue Protokollvorlage')),
    ]);
  },

  edit(p, { back = false } = {}) {
    const isNew = !p;
    p = p || newItem('protocol', { body: this.body([]) });
    const ids = this.ids(p);
    const chosen = el('div', { class: 'pick-list' });
    const avail = el('div', {});
    const count = el('h2', { style: 'margin:14px 0 0' });
    const search = el('input', { type: 'search', placeholder: 'Bausteine suchen …' });
    const owner = ownerField(p);
    const mine = el('input', { type: 'checkbox', name: 'mine', checked: isNew ? !this.current() : settings.defaultProtocol === p.id });
    const iconBtn = (label, title, disabled, onclick) => el('button', { type: 'button', class: 'btn small icon', title, 'aria-label': title, disabled, onclick }, label);
    const move = (i, j) => { [ids[i], ids[j]] = [ids[j], ids[i]]; drawChosen(); };
    const drawChosen = () => {
      count.textContent = `In der Vorlage (${ids.length})`;
      chosen.replaceChildren(...ids.map((id, i) => {
        const it = this.module(id);
        return el('div', { class: 'pick' },
          el('span', { class: 'grow' }, it ? it.title : '(nicht mehr vorhanden)', it ? teamBadge(it) : null),
          iconBtn('↑', 'Nach oben', i === 0, () => move(i, i - 1)),
          iconBtn('↓', 'Nach unten', i === ids.length - 1, () => move(i, i + 1)),
          iconBtn('✕', 'Entfernen', false, () => { ids.splice(i, 1); drawChosen(); drawAvail(); }));
      }));
      if (!ids.length) chosen.append(el('div', { class: 'empty' }, 'Noch leer – unten Bausteine antippen.'));
    };
    const drawAvail = () => {
      const q = search.value.trim().toLowerCase();
      const groups = new Map();
      for (const it of listItems().filter((x) => !q || (x.title + ' ' + x.category + ' ' + x.body).toLowerCase().includes(q))) {
        const c = it.category || (it.kind === 'form' ? 'Formulare' : 'Allgemein');
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c).push(it);
      }
      avail.replaceChildren();
      for (const [cat, group] of groups) {
        avail.append(el('div', { class: 'row', style: 'margin-top:10px' },
          el('h2', { class: 'grow', style: 'margin:0' }, cat),
          group.length > 1 ? el('button', { type: 'button', class: 'btn small', onclick: () => { ids.push(...group.map((x) => x.id)); drawChosen(); drawAvail(); } }, '＋ alle') : null));
        avail.append(el('div', { class: 'pick-list' }, group.map((it) => {
          const n = ids.filter((x) => x === it.id).length;
          return el('button', { type: 'button', class: 'pick', onclick: () => { ids.push(it.id); drawChosen(); drawAvail(); } },
            el('span', { class: 'grow' }, it.title, teamBadge(it)),
            el('span', { class: 'pick-n' }, n ? '✓ ' + n : '＋'));
        })));
      }
      if (!groups.size) avail.append(el('div', { class: 'empty' }, 'Keine Bausteine gefunden.'));
    };
    search.addEventListener('input', drawAvail);
    drawChosen();
    drawAvail();
    if (back) $('#dlg').addEventListener('close', () => setTimeout(() => { if (!$('#dlg').open) this.open(); }, 0), { once: true });
    openDialog(isNew ? 'Neue Protokollvorlage' : 'Protokollvorlage bearbeiten', [
      field('Name', el('input', { type: 'text', name: 'title', value: p.title, required: true, maxlength: 200, placeholder: 'z. B. Standard, Trauma, Kind' })),
      owner,
      el('label', { class: 'check' }, mine, 'Mit dem 📋-Knopf im Schreiben-Reiter einfügen'),
      count, chosen,
      el('h2', { style: 'margin:14px 0 0' }, 'Bausteine hinzufügen'),
      search, avail,
    ], {
      onSave: (f) => {
        const target = f.owner ? f.owner.value || null : p.team_id;
        const bad = ids.map((id) => this.module(id)).filter((it) => it && !this.allowedFor(it, target));
        if (bad.length) {
          toast(`Diese Bausteine sehen dort nicht alle: ${bad.map((it) => it.title).join(', ')}. Entfernen oder zuerst dort speichern.`, 'err');
          return false;
        }
        Object.assign(p, { title: f.title.value.trim(), body: this.body(ids), team_id: target });
        putItem(p);
        if (f.mine.checked) settings.defaultProtocol = p.id;
        else if (settings.defaultProtocol === p.id) settings.defaultProtocol = null;
        saveSettings();
        renderItems();
        toast(isNew ? 'Protokollvorlage angelegt' : 'Gespeichert');
      },
      onDelete: isNew ? null : () => { removeItem(p); renderItems(); },
    });
  },
};

$('#protoBtn').addEventListener('click', () => protocols.tap());
$('#protoMenu').addEventListener('click', () => protocols.open());
$('#modProtocols').addEventListener('click', () => protocols.open());
