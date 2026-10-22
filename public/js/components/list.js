import { el, avatar, formatShort, formatDay, URGENCY_LABEL, FILED_LABEL } from '../util.js';
import { icon } from '../icons.js';

export const TABS = [
  { id: 'offen', label: 'Offen', test: (m) => !m.archiviert && !m.snoozed_until && m.dringlichkeit !== 'egal' },
  { id: 'egal', label: 'Egal', test: (m) => !m.archiviert && !m.snoozed_until && m.dringlichkeit === 'egal' },
  { id: 'spaeter', label: 'Später', test: (m) => !m.archiviert && !!m.snoozed_until },
  { id: 'done', label: 'Done', test: (m) => m.archiviert },
];

const GROUPS = ['jetzt', 'heute', 'woche'];

export function matchesQuery(m, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [m.absender, m.absender_mail, m.betreff, m.zusammenfassung, m.aufgabe_text, m.kategorie, m.is_test ? 'test' : '', m.archiviert ? 'done' : '']
    .some((f) => String(f || '').toLowerCase().includes(q));
}

export function renderTabs(container, items, activeTab, searching, onSelect) {
  container.replaceChildren(
    ...TABS.map((t) => {
      const count = items.filter(t.test).length;
      return el(
        'button',
        { class: 'chip', role: 'tab', type: 'button', 'aria-selected': !searching && t.id === activeTab, onclick: () => onSelect(t.id) },
        t.label,
        el('span', { class: 'chip-count' }, String(count)),
      );
    }),
  );
}

function badge(text, cls = '', iconName) {
  return el('span', { class: `badge ${cls}` }, iconName && icon(iconName, 12), text);
}

function quickButton(iconName, title, cls, onClick) {
  return el(
    'button',
    {
      class: `quick ${cls}`,
      type: 'button',
      title,
      'aria-label': title,
      onclick: (e) => {
        e.stopPropagation();
        onClick();
      },
      onkeydown: (e) => e.stopPropagation(),
    },
    icon(iconName, 15),
  );
}

function row(m, selected, actions) {
  const time = m.snoozed_until ? `bis ${formatShort(m.snoozed_until)}` : formatShort(m.received_at);
  const quick = m.archiviert
    ? [quickButton('undo', 'Zurückholen nach Offen', '', () => actions.restore(m.id)), quickButton('trash', 'Endgültig löschen', 'danger', () => actions.remove(m.id))]
    : [quickButton('archive', 'In Done ablegen (Verwerfen)', '', () => actions.archive(m.id)), quickButton('trash', 'Endgültig löschen', 'danger', () => actions.remove(m.id))];
  return el(
    'div',
    {
      class: `mail-row u-${m.dringlichkeit}${m.is_test ? ' is-test' : ''}${m.archiviert ? ' is-done' : ''}`,
      role: 'option',
      tabindex: '0',
      'aria-selected': selected,
      'data-id': m.id,
      onclick: () => actions.select(m.id),
      onkeydown: (e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          actions.select(m.id);
        }
      },
    },
    avatar(m.absender, m.absender_mail, 34),
    el(
      'span',
      { class: 'row-main' },
      el('span', { class: 'row-top' }, el('span', { class: 'row-from' }, m.absender || m.absender_mail), el('time', { class: 'row-time' }, time)),
      el('span', { class: 'row-subject' }, m.betreff),
      el('span', { class: 'row-summary' }, m.zusammenfassung),
      el(
        'span',
        { class: 'row-badges' },
        m.is_test && badge('TEST', 'test', 'flask'),
        m.archiviert && badge(`Done · ${FILED_LABEL[m.status] || m.status}`, m.status === 'done' ? '' : 'ok', 'archive'),
        !m.archiviert && m.dringlichkeit !== 'egal' && badge(URGENCY_LABEL[m.dringlichkeit], `u-${m.dringlichkeit}`),
        !m.archiviert && m.aufgabe_text && badge('Aufgabe', '', 'checkSquare'),
        !m.archiviert && m.antwort_noetig && badge(m.hat_entwurf ? 'Entwurf' : 'Antwort offen', m.hat_entwurf ? 'ok' : '', 'file'),
        !m.archiviert && m.frist && badge(`Frist ${formatDay(m.frist)}`, 'frist', 'clock'),
      ),
    ),
    el('span', { class: 'row-actions' }, quick),
  );
}

function header(text, count) {
  return el('div', { class: 'group-head', role: 'presentation' }, text, el('span', {}, String(count)));
}

/** items: bereits nach Tab/Suche gefilterte Liste. Gruppiert nur in "Offen" ohne Suche. */
export function renderList(container, { items, selectedId, query, tab, actions }) {
  const searching = query.trim().length > 0;
  const mk = (m) => row(m, String(m.id) === String(selectedId), actions);
  const nodes = [];
  if (!items.length) {
    const text = searching ? `Nichts gefunden für „${query}“.` : tab === 'offen' ? 'Keine offenen Mails.' : tab === 'done' ? 'In Done liegt noch nichts. Verworfene und erledigte Mails landen hier.' : 'Hier ist nichts.';
    nodes.push(el('div', { class: 'empty-state' }, icon(tab === 'done' && !searching ? 'archive' : 'inbox', 28), el('strong', {}, searching ? 'Keine Treffer' : tab === 'offen' ? 'Alles erledigt' : 'Leer'), el('p', {}, text)));
  } else if (searching) {
    const inDone = items.filter((m) => m.archiviert).length;
    nodes.push(header(`${items.length} Treffer in allen Mails${inDone ? `, davon ${inDone} in Done` : ''}`, ''), ...items.map(mk));
  } else if (tab === 'offen') {
    for (const g of GROUPS) {
      const inGroup = items.filter((m) => m.dringlichkeit === g);
      if (inGroup.length) nodes.push(header(URGENCY_LABEL[g], inGroup.length), ...inGroup.map(mk));
    }
  } else {
    nodes.push(...items.map(mk));
  }
  container.replaceChildren(...nodes);
  container.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
