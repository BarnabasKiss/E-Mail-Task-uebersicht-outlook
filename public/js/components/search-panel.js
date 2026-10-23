import { el } from '../util.js';
import { icon } from '../icons.js';
import { SCOPES, ROLLEN, defaultFilters, filterChips, clearChip, filterCount, localDay } from '../search.js';

/**
 * Erweiterte Suche: Panel unter dem Suchfeld, Chips für aktive Filter und Zähler am Filter-Knopf.
 * Die Bedienelemente werden einmal gebaut und nur umgestellt (sonst verliert das Textfeld beim Tippen den Fokus).
 * onChange(filters) wird bei jeder Änderung aufgerufen.
 */
export function createSearchPanel({ panel, chipsBox, button, onChange }) {
  let f = defaultFilters();

  const emit = () => {
    refresh();
    onChange(f);
  };
  const update = (patch) => {
    f = { ...f, ...patch };
    emit();
  };

  const check = (label, get, set) => {
    const input = el('input', { type: 'checkbox', onchange: () => set(input.checked) });
    input.sync = () => (input.checked = !!get());
    return { input, node: el('label', { class: 'fp-check' }, input, el('span', {}, label)) };
  };

  // Suchen in
  const scopeChecks = SCOPES.map(([key, label]) => check(label, () => f.scope[key], (on) => update({ scope: { ...f.scope, [key]: on } })));

  // Personen
  const people = el('datalist', { id: 'fp-people' });
  const from = el('input', { type: 'text', list: 'fp-people', placeholder: 'Name oder Adresse', autocomplete: 'off', 'aria-label': 'Von (Absender)', oninput: () => update({ from: from.value.trim() }) });
  const to = el('input', { type: 'text', list: 'fp-people', placeholder: 'Name oder Adresse', autocomplete: 'off', 'aria-label': 'An oder CC (Empfänger)', oninput: () => update({ to: to.value.trim() }) });
  const toMode = el('select', { 'aria-label': 'An, CC oder beides', onchange: () => update({ toMode: toMode.value }) }, el('option', { value: 'beide' }, 'An + CC'), el('option', { value: 'an' }, 'Nur An'), el('option', { value: 'cc' }, 'Nur CC'));

  // Zeitraum
  const after = el('input', { type: 'date', 'aria-label': 'Von Datum', onchange: () => update({ after: after.value }) });
  const before = el('input', { type: 'date', 'aria-label': 'Bis Datum', onchange: () => update({ before: before.value }) });
  const quick = (label, days) => el('button', { class: 'fp-quick', type: 'button', onclick: () => update({ after: localDay(new Date(Date.now() - days * 86400000)), before: '' }) }, label);

  // Eigenschaften
  const anhang = check('Mit Anhang', () => f.anhang, (on) => update({ anhang: on, format: on ? f.format : '' }));
  const format = el('select', { 'aria-label': 'Dateiformat', onchange: () => update({ format: format.value, anhang: format.value ? true : f.anhang }) }, el('option', { value: '' }, 'Format'));
  const aufgabe = check('Mit Aufgabe', () => f.aufgabe, (on) => update({ aufgabe: on }));
  const wichtig = check('Wichtig', () => f.wichtig, (on) => update({ wichtig: on }));
  const rollen = ROLLEN.map(([key, label]) => {
    const b = el('button', { class: 'fp-toggle', type: 'button', 'aria-pressed': 'false', onclick: () => update({ rollen: f.rollen.includes(key) ? f.rollen.filter((r) => r !== key) : [...f.rollen, key] }) }, label);
    b.sync = () => b.setAttribute('aria-pressed', String(f.rollen.includes(key)));
    return b;
  });

  const reset = el('button', { class: 'link', type: 'button', onclick: () => { f = defaultFilters(); emit(); } }, 'Zurücksetzen');
  const row = (label, ...children) => el('div', { class: 'fp-row' }, el('span', { class: 'fp-label' }, label), el('div', { class: 'fp-fields' }, ...children));

  panel.append(
    row('Suchen in', ...scopeChecks.map((c) => c.node)),
    row('Von', from, people),
    row('An / CC', to, toMode),
    row('Zeitraum', after, el('span', { class: 'fp-dash' }, '–'), before, el('div', { class: 'fp-quicks' }, quick('Heute', 0), quick('7 Tage', 7), quick('30 Tage', 30))),
    row('Mit', anhang.node, format, aufgabe.node, wichtig.node),
    row('Eingang', ...rollen),
    el('div', { class: 'fp-foot' }, reset),
  );

  function refresh() {
    scopeChecks.forEach((c) => c.input.sync());
    [anhang, aufgabe, wichtig].forEach((c) => c.input.sync());
    rollen.forEach((b) => b.sync());
    if (document.activeElement !== from) from.value = f.from;
    if (document.activeElement !== to) to.value = f.to;
    toMode.value = f.toMode;
    after.value = f.after;
    before.value = f.before;
    if (f.format && ![...format.options].some((o) => o.value === f.format)) format.append(el('option', { value: f.format }, f.format));
    format.value = f.format;

    const n = filterCount(f);
    button.classList.toggle('active', n > 0);
    button.querySelector('.filter-count').textContent = n ? String(n) : '';
    button.setAttribute('aria-label', n ? `Filter (${n} aktiv)` : 'Filter');
    const chips = filterChips(f);
    chipsBox.hidden = !chips.length;
    chipsBox.replaceChildren(
      ...chips.map((c) => el('button', { class: 'filter-chip', type: 'button', title: 'Filter entfernen', onclick: () => { f = clearChip(f, c.key); emit(); } }, el('span', {}, c.label), el('span', { class: 'x', 'aria-hidden': 'true' }, '×'))),
    );
  }

  const toggle = (open = panel.hidden) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.querySelector('.filter-icon')?.replaceWith(icon('sliders', 16));
  button.addEventListener('click', () => toggle());
  refresh();

  return {
    get: () => f,
    /** Von außen setzen (URL, Zurücksetzen). Ohne Rückruf, wenn silent. */
    set(next, { silent = false, open } = {}) {
      f = next;
      refresh();
      if (open !== undefined) toggle(open);
      if (!silent) onChange(f);
    },
    toggle,
    /** Formate der Anhänge und bekannte Absender für die Auswahl. */
    setChoices({ formats = [], names = [] }) {
      const keep = format.value;
      format.replaceChildren(el('option', { value: '' }, 'Format'), ...formats.map((x) => el('option', { value: x }, x)));
      if (keep && !formats.includes(keep)) format.append(el('option', { value: keep }, keep));
      format.value = keep;
      people.replaceChildren(...names.map((n) => el('option', { value: n })));
    },
  };
}
