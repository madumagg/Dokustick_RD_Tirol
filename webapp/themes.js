'use strict';

/*
 * Themes: Designs, die ueber die ganze App gelegt werden (Attribut data-skin am <html>).
 * Das Aussehen steht in themes.css, die Freigabe in der Datenbank
 * (supabase/migrations/*_themes.sql, app_info().themes):
 *   - App-Admins duerfen alle Themes verwenden, auch noch nicht freigegebene.
 *   - Sonst nur Themes, die fuer alle oder fuer diese Person freigeschaltet sind.
 * Die Freigabe wird mit app_info auf dem Geraet gespeichert und gilt so auch offline.
 *
 * Neues Theme: Eintrag in THEMES und ein Block [data-skin="<id>"] in themes.css.
 * Ohne Eintrag in der Datenbank ist es zuerst nur fuer App-Admins sichtbar.
 */

const THEMES = [
  {
    id: 'glass', name: 'Liquid Glass', color: '#dfe9f3', dark: '#0b1318',
    desc: 'Durchscheinende Glasflächen auf farbigem Hintergrund, angelehnt an das neue iOS.',
  },
];

const themes = {
  allowed(id) {
    return !!(cloud.account && cloud.info.is_admin) || (cloud.info.themes || []).includes(id);
  },

  available() { return THEMES.filter((t) => this.allowed(t.id)); },

  // Gewaehltes Theme, solange es (noch) freigegeben ist, sonst Standard
  current() {
    const id = settings.skin;
    return id && THEMES.some((t) => t.id === id) && this.allowed(id) ? id : '';
  },

  apply() {
    const id = this.current(), root = document.documentElement;
    if (id) root.dataset.skin = id; else delete root.dataset.skin;
    // Farbe der Browser-Leiste passend zum Theme
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) {
      if (!meta.dataset.base) meta.dataset.base = meta.content;
      const t = THEMES.find((x) => x.id === id);
      const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      meta.content = t ? (dark ? t.dark : t.color) : meta.dataset.base;
    }
  },

  // Auswahl in den Einstellungen; ohne freigegebene Themes unsichtbar
  renderSetting() {
    const box = $('#skinField'), sel = $('#skin'), help = $('#skinHelp');
    if (!box) return;
    const list = this.available();
    box.hidden = help.hidden = !list.length;
    if (!list.length) return;
    sel.replaceChildren(el('option', { value: '' }, 'Standard'), ...list.map((t) => el('option', { value: t.id }, t.name)));
    sel.value = this.current();
    const t = THEMES.find((x) => x.id === sel.value);
    const onlyAdmin = t && cloud.info.is_admin && !(cloud.info.themes || []).includes(t.id);
    help.textContent = t ? t.desc + (onlyAdmin ? ' Noch nicht freigegeben: sehen nur App-Admins.' : '') : 'Das gewohnte Aussehen von ProtoPilot.';
  },

  refresh() {
    this.apply();
    this.renderSetting();
  },
};

$('#skin').addEventListener('change', (e) => {
  settings.skin = e.target.value;
  store.save('settings', settings);
  themes.refresh();
});
// Wechselt das System zwischen hell und dunkel, die Farbe der Browser-Leiste nachziehen
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => themes.apply());
