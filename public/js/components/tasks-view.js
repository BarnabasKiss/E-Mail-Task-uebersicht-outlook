// Aufgabenliste (Optionen): welche Markdown-Datei die App bei "Aufgabe übernehmen" bearbeitet. Pfad eintippen oder Ordner durchsuchen.
// Die Wahl liegt in der App (state.json) und gilt vor der Einstellung `vault` in config.json.
import { el } from '../util.js';
import { icon } from '../icons.js';

/**
 * info: { path, exists, writable, headings, configured, custom }. handlers: { back, save(path), reset(), browse(dir) -> { dir, parent, dirs, files } }. note: Meldung.
 */
export function renderTasksFile(container, info, handlers, note = '') {
  const input = el('input', { type: 'text', class: 'tk-path', value: info.path, 'aria-label': 'Pfad der Aufgabenliste', spellcheck: 'false' });
  const list = el('div', { class: 'tk-browser', hidden: true });
  const status = !info.exists ? ['Datei fehlt', 'bad'] : !info.writable ? ['Nicht beschreibbar', 'bad'] : [`${info.headings} Überschriften`, 'ok'];

  async function open(dir) {
    let r;
    try {
      r = await handlers.browse(dir);
    } catch (e) {
      list.replaceChildren(el('p', { class: 'hint' }, e.message));
      list.hidden = false;
      return;
    }
    const row = (label, ic, onclick, cls = '') => el('button', { class: `tk-item ${cls}`, type: 'button', onclick }, icon(ic, 14), el('span', {}, label));
    list.replaceChildren(
      el('div', { class: 'tk-dir' }, r.dir),
      r.parent && row('.. (eine Ebene höher)', 'undo', () => open(r.parent)),
      ...r.dirs.map((d) => row(d, 'folder', () => open(`${r.dir.replace(/[\\/]$/, '')}/${d}`))),
      ...r.files.map((f) => row(f, 'file', () => ((input.value = `${r.dir.replace(/[\\/]$/, '')}/${f}`), (list.hidden = true), input.focus()), 'file')),
      !r.dirs.length && !r.files.length && el('p', { class: 'hint' }, 'Keine Unterordner oder Markdown-Dateien.'),
    );
    list.hidden = false;
  }

  container.replaceChildren(
    el(
      'article',
      { class: 'detail tasks-file' },
      el(
        'header',
        { class: 'd-head' },
        el('div', { class: 'd-title' }, el('h2', {}, 'Aufgabenliste'), el('div', { class: 'd-badges' }, el('span', { class: `badge ${status[1]}` }, status[0]), info.custom && el('span', { class: 'badge' }, 'Von Hand gewählt'))),
        el('div', { class: 'd-actions' }, el('button', { class: 'btn', type: 'button', onclick: handlers.back }, icon('undo', 15), el('span', {}, 'Zurück'))),
      ),
      el(
        'section',
        { class: 'card' },
        el('p', {}, 'In diese Markdown-Datei schreibt die App, wenn du bei einer Mail „Aufgabe übernehmen“ wählst (immer mit Sicherung und Prüfung). Die Datei muss schon existieren; ihre ###-Überschriften sind die Gruppen zur Auswahl.'),
        el('p', { class: 'hint' }, 'Der Pfad gilt auf dem Rechner, auf dem die App läuft (im Container z. B. /data/vault/…).'),
        el('div', { class: 'tk-row' }, input, el('button', { class: 'btn', type: 'button', onclick: () => (list.hidden ? open(input.value.replace(/[^\\/]*$/, '') || '') : (list.hidden = true)) }, icon('folder', 15), el('span', {}, 'Durchsuchen'))),
        list,
        note && el('p', { class: 'hint ct-note', role: 'status' }, note),
        el(
          'div',
          { class: 'rl-add' },
          el('button', { class: 'btn primary', type: 'button', onclick: () => handlers.save(input.value) }, icon('check', 15), el('span', {}, 'Speichern')),
          info.custom && el('button', { class: 'btn ghost', type: 'button', title: info.configured, onclick: handlers.reset }, icon('refresh', 15), el('span', {}, 'Standard aus config.json')),
        ),
      ),
    ),
  );
}
