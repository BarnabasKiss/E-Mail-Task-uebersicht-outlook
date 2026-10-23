// Absender-Gedächtnis im Profil: Ansprache, Sprache, Anrede, Gruß und Notizen einer Person oder Firma, alles direkt bearbeitbar.
// Neu Gelerntes steht als "prüfen" da, bis du es bestätigst, änderst oder löschst.
import { el } from '../util.js';
import { icon } from '../icons.js';

const SELECTS = {
  form: { label: 'Ansprache', options: [['du', 'Du'], ['sie', 'Sie']] },
  sprache: { label: 'Sprache', options: [['de', 'Deutsch'], ['en', 'Englisch']] },
};
const TEXTS = {
  anrede: { label: 'Anrede', help: 'mit {Vorname} und {Nachname}, z. B. „Hallo {Vorname},“' },
  gruss: { label: 'Gruß', help: 'z. B. „Mit freundlichen Grüßen“' },
};
const nameOf = (list, value) => list.find(([v]) => v === value)?.[1] || value;

/** part: { key, fields, notes } aus dem Profil; change(payload) speichert (und lädt das Profil neu). */
export function createMemoryPanel({ title, part, isPerson, change }) {
  const fieldRow = (name) => {
    const f = part.fields[name];
    const manual = f?.source === 'manuell';
    const learned = f && !manual ? `gelernt: ${SELECTS[name] ? nameOf(SELECTS[name].options, f.value) : f.value}${f.total > 1 ? ` (${f.count} von ${f.total})` : ''}` : 'noch nichts gelernt';
    const save = (value) => change({ op: 'field', key: part.key, field: name, value });
    let control;
    if (SELECTS[name]) {
      control = el(
        'select',
        { 'aria-label': SELECTS[name].label, onchange: (e) => save(e.target.value) },
        el('option', { value: '' }, `Automatisch (${learned})`),
        SELECTS[name].options.map(([v, label]) => el('option', { value: v, selected: manual && f.value === v }, label)),
      );
    } else {
      control = el('input', {
        type: 'text',
        value: manual ? f.value : '',
        maxlength: '80',
        placeholder: f ? `Automatisch (${learned})` : 'Automatisch (noch nichts gelernt)',
        'aria-label': TEXTS[name].label,
        title: TEXTS[name].help,
        onchange: (e) => save(e.target.value.trim()),
      });
    }
    return el('div', { class: 'mem-row' }, el('label', {}, SELECTS[name]?.label || TEXTS[name].label), control, manual && el('span', { class: 'mem-fixed', title: 'Von dir festgelegt: überschreibt das Gelernte. Leeren stellt „Automatisch“ wieder her.' }, 'festgelegt'));
  };

  const noteRow = (n) =>
    el(
      'li',
      { class: `mem-note${n.reviewed ? '' : ' unreviewed'}` },
      el('input', { type: 'text', class: 'mem-note-text', value: n.text, maxlength: '300', 'aria-label': 'Notiz', onchange: (e) => change({ op: 'note-edit', key: part.key, id: n.id, text: e.target.value }) }),
      !n.reviewed && el('span', { class: 'badge', title: 'Automatisch gelernt, noch nicht von dir geprüft' }, 'prüfen'),
      !n.reviewed && el('button', { class: 'icon-btn', type: 'button', title: 'Passt so', 'aria-label': 'Notiz bestätigen', onclick: () => change({ op: 'note-edit', key: part.key, id: n.id, reviewed: true }) }, icon('check', 14)),
      el('button', { class: 'icon-btn danger', type: 'button', title: 'Notiz löschen', 'aria-label': 'Notiz löschen', onclick: () => change({ op: 'note-delete', key: part.key, id: n.id }) }, icon('trash', 14)),
    );

  const add = el('input', {
    type: 'text',
    class: 'mem-add',
    maxlength: '300',
    placeholder: 'Neue Notiz, z. B. „Antworten kurz halten, keine Floskeln“',
    'aria-label': 'Neue Notiz',
    onkeydown: (e) => {
      if (e.key === 'Enter' && add.value.trim()) change({ op: 'note-add', key: part.key, text: add.value });
    },
  });
  const unreviewed = part.notes.filter((n) => !n.reviewed).length;

  return el(
    'section',
    { class: 'card memory', 'aria-label': title },
    el('div', { class: 'card-head' }, el('h3', {}, title), el('span', { class: 'spacer' }), unreviewed > 0 && el('button', { class: 'btn small', type: 'button', onclick: () => change({ op: 'confirm', key: part.key }) }, icon('check', 14), `${unreviewed} bestätigen`)),
    el('div', { class: 'mem-fields' }, ['form', 'sprache', ...(isPerson ? ['anrede'] : []), 'gruss'].map(fieldRow)),
    el('ul', { class: 'mem-notes' }, part.notes.map(noteRow)),
    el('div', { class: 'mem-add-row' }, add),
    el('p', { class: 'hint' }, 'Keine Klarnamen oder Kundendaten schreiben: Die Notizen gehen (anonymisiert) mit an Claude, wenn ein Entwurf entsteht.'),
  );
}
