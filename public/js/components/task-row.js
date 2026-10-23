import { el } from '../util.js';
import { icon } from '../icons.js';

const NEW = '__new__';
const PENDING = '__pending__';
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Aufgabe in einer Zeile: Text, Überschrift, Frist, Wichtig, Übernehmen. */
export function createTaskRow({ proposal, headings, isTest, onAccept }) {
  const taken = proposal.aufgabe_uebernommen;
  const text = el('input', { type: 'text', class: 'task-text', 'aria-label': 'Aufgabe', value: proposal.aufgabe_text || '', placeholder: 'Aufgabe formulieren …' });

  const select = el(
    'select',
    { 'aria-label': 'Überschrift in „3 Aufgaben“', disabled: true },
    el('option', { value: PENDING }, 'Ordne zu …'),
    ...headings.map((h) => el('option', { value: h }, h)),
    el('option', { value: NEW }, '＋ Neue Überschrift …'),
  );
  const newInput = el('input', { type: 'text', 'aria-label': 'Name der neuen Überschrift', placeholder: 'Neue Überschrift', hidden: true });
  const backBtn = el('button', { class: 'icon-btn', type: 'button', title: 'Bestehende Überschrift wählen', 'aria-label': 'Zurück zur Auswahl', hidden: true, onclick: () => showNew(false) }, icon('x', 14));
  const headingBox = el('div', { class: 'task-heading' }, select, newInput, backBtn);

  const due = el('input', { type: 'date', 'aria-label': 'Frist', value: isoDate.test(proposal.frist || '') ? proposal.frist : '' });
  const important = el('button', { class: 'icon-btn toggle', type: 'button', 'aria-pressed': String(proposal.dringlichkeit === 'jetzt'), title: 'Wichtig: als [!] eintragen', 'aria-label': 'Wichtig' }, icon('star', 16));
  important.addEventListener('click', () => important.setAttribute('aria-pressed', String(important.getAttribute('aria-pressed') !== 'true')));
  const submit = el('button', { class: 'btn primary', type: 'button', onclick: send }, icon('check', 15), el('span', {}, 'Übernehmen'));
  const note = el('div', { class: 'task-note' });

  function showNew(on) {
    select.hidden = on;
    newInput.hidden = !on;
    backBtn.hidden = !on;
    if (on) {
      select.value = NEW;
      newInput.focus();
    } else if (select.value === NEW) {
      select.value = headings[0] ?? PENDING;
    }
  }
  select.addEventListener('change', () => select.value === NEW && showNew(true));

  function setNote(msg, error = false) {
    note.className = `task-note${error ? ' error' : ''}`;
    note.textContent = msg;
  }

  async function send() {
    const isNew = !newInput.hidden;
    if (!text.value.trim()) return setNote('Bitte einen Aufgabentext eingeben.', true), text.focus();
    if (!isNew && select.value === PENDING) return setNote('Die Überschrift wird noch zugeordnet. Bitte kurz warten oder selbst wählen.', true);
    if (isNew && !newInput.value.trim()) return setNote('Bitte den Namen der neuen Überschrift eingeben.', true), newInput.focus();
    if (isTest && !confirm('Das ist eine Testnachricht. Soll die Aufgabe trotzdem in „3 Aufgaben“ geschrieben werden?')) return;
    submit.disabled = true;
    try {
      await onAccept({
        text: text.value.trim(),
        heading: isNew ? undefined : select.value,
        newHeading: isNew ? newInput.value.trim() : undefined,
        due: due.value || undefined,
        important: important.getAttribute('aria-pressed') === 'true',
      });
    } finally {
      submit.disabled = false;
    }
  }

  text.addEventListener('keydown', (e) => e.key === 'Enter' && send());
  text.title = text.value;
  text.addEventListener('input', () => (text.title = text.value)); // langer Text bleibt per Tooltip lesbar

  const formRow = el('div', { class: 'task-row', hidden: !!taken }, el('span', { class: 'task-icon' }, icon('checkSquare', 18)), text, headingBox, due, important, submit);
  // Schon übernommen: nur der Vermerk, das Formular lässt sich für eine weitere Aufgabe öffnen
  const takenRow = taken
    ? el(
        'div',
        { class: 'task-row taken' },
        el('span', { class: 'task-icon ok' }, icon('check', 18)),
        el('span', { class: 'taken-text', title: taken.text }, el('strong', {}, 'Aufgabe übernommen: '), taken.text, taken.heading && el('span', { class: 'taken-heading' }, ` · ${taken.heading}`)),
        el('button', { class: 'link', type: 'button', onclick: () => ((takenRow.hidden = true), (formRow.hidden = false), text.focus()) }, 'Weitere Aufgabe'),
      )
    : null;
  const node = el('section', { class: 'card task', 'aria-label': 'Aufgabe' }, takenRow, formRow, note);

  return {
    node,
    setMatch(match) {
      select.disabled = false;
      select.querySelector(`option[value="${PENDING}"]`)?.remove();
      if (match.heading && !match.isNew) {
        select.value = match.heading;
        setNote('');
      } else if (match.heading && match.isNew) {
        newInput.value = match.heading;
        showNew(true);
        setNote(`Keine passende Überschrift gefunden. Die neue wird ganz oben angelegt. ${match.reason || ''}`);
      } else {
        select.value = headings[0] ?? NEW;
        setNote(match.reason || 'Zuordnung nicht möglich, bitte Überschrift wählen.', !match.quiet);
      }
    },
  };
}
