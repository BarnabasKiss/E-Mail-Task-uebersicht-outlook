// Regeln: die Regeldatei (Mail-Regeln.md) in der App bearbeiten. Als Liste je Abschnitt (Regel ändern, löschen, hinzufügen) oder als ganzer Text.
// Die App und das Lernen hängen weiter Zeilen an; geändert wird nur, was sich seit dem Laden nicht verändert hat (sonst Hinweis und Neuladen).
import { el } from '../util.js';
import { icon } from '../icons.js';

const rowsFor = (text) => Math.max(1, Math.ceil(String(text).length / 95));

/**
 * doc: { file, version, text, title, intro, sections: [{ heading, hints, rules: [{ index, text }] }] }. view: { text: true = ganze Datei als Text }.
 * handlers: { back, setText(bool), add(section, text), edit(section, index, was, text), remove(section, index, was), saveText(text, version), openExternal() }
 * note: Meldung unter der Kopfzeile (zuletzt gespeichert, Fehler)
 */
export function renderRules(container, doc, view, handlers, note = '') {
  const count = doc.sections.reduce((n, s) => n + s.rules.length, 0);
  const modeBtn = el('button', { class: 'btn', type: 'button', onclick: () => handlers.setText(!view.text) }, icon(view.text ? 'book' : 'pencil', 15), el('span', {}, view.text ? 'Als Liste bearbeiten' : 'Ganzen Text bearbeiten'));
  const externalBtn = el('button', { class: 'btn ghost', type: 'button', title: `Mit dem Standardprogramm öffnen: ${doc.file}`, onclick: handlers.openExternal }, icon('external', 15), el('span', {}, 'In Editor öffnen'));

  function ruleRow(section, r) {
    const area = el('textarea', {
      class: 'rl-text',
      rows: rowsFor(r.text),
      'aria-label': `Regel in „${section.heading}“`,
      onkeydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          area.blur();
        } else if (e.key === 'Escape') {
          area.value = r.text;
          area.blur();
        }
      },
      onchange: () => (area.value.trim() === r.text ? null : handlers.edit(section.heading, r.index, r.text, area.value)),
    });
    area.value = r.text;
    return el('li', { class: 'rl-row' }, area, el('button', { class: 'icon-btn danger', type: 'button', title: 'Regel löschen', 'aria-label': 'Regel löschen', onclick: () => handlers.remove(section.heading, r.index, r.text) }, icon('trash', 14)));
  }

  function sectionCard(section) {
    const input = el('input', { type: 'text', class: 'rl-new', maxlength: '600', placeholder: 'Neue Regel …', 'aria-label': `Neue Regel in „${section.heading}“`, onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), add()) });
    const add = () => (input.value.trim() ? handlers.add(section.heading, input.value) : input.focus());
    return el(
      'section',
      { class: 'card rl-section', 'data-section': section.heading },
      el('h3', {}, section.heading, el('span', { class: 'badge' }, String(section.rules.length))),
      section.hints.map((h) => el('p', { class: 'hint' }, h)),
      section.rules.length ? el('ul', { class: 'rl-list' }, section.rules.map((r) => ruleRow(section, r))) : el('p', { class: 'hint' }, 'Noch keine Regeln.'),
      el('div', { class: 'rl-add' }, input, el('button', { class: 'btn small', type: 'button', onclick: add }, icon('check', 14), el('span', {}, 'Hinzufügen'))),
    );
  }

  function textCard() {
    const area = el('textarea', { class: 'rl-all', 'aria-label': 'Regeldatei als Text', spellcheck: 'false' });
    area.value = doc.text;
    return el(
      'section',
      { class: 'card' },
      el('p', { class: 'hint' }, 'Die ganze Datei. Überschriften (## …) bilden die Abschnitte, Regeln sind Zeilen mit „- “. Gespeichert wird nur, wenn sich die Datei seit dem Laden nicht verändert hat.'),
      area,
      el('div', { class: 'rl-add' }, el('button', { class: 'btn primary', type: 'button', onclick: () => handlers.saveText(area.value, doc.version) }, icon('check', 15), el('span', {}, 'Speichern')), el('button', { class: 'btn ghost', type: 'button', onclick: () => handlers.setText(false) }, 'Verwerfen')),
    );
  }

  container.replaceChildren(
    el(
      'article',
      { class: 'detail rules' },
      el(
        'header',
        { class: 'd-head' },
        el('div', { class: 'd-title' }, el('h2', {}, 'Regeln'), el('div', { class: 'd-badges' }, el('span', { class: 'badge' }, `${count} Regeln`))),
        el('div', { class: 'd-actions' }, modeBtn, externalBtn, el('button', { class: 'btn', type: 'button', onclick: handlers.back }, icon('undo', 15), el('span', {}, 'Zurück'))),
      ),
      el('p', { class: 'hint rl-intro' }, doc.intro.length ? doc.intro.join(' ') : 'Regeln für Entwürfe, Dringlichkeit und Absender.'),
      note && el('p', { class: 'hint ct-note', role: 'status' }, note),
      ...(view.text ? [textCard()] : doc.sections.map(sectionCard)),
    ),
  );
}
