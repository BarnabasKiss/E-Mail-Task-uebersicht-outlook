import { el, avatar, formatShort, formatDay, roleChip, URGENCY_LABEL, FILED_LABEL } from '../util.js';
import { icon } from '../icons.js';
import { formatOf } from '../search.js';

export const TABS = [
  { id: 'offen', label: 'Offen', test: (m) => !m.archiviert && !m.snoozed_until && m.dringlichkeit !== 'egal' },
  { id: 'egal', label: 'Egal', test: (m) => !m.archiviert && !m.snoozed_until && m.dringlichkeit === 'egal' },
  { id: 'spaeter', label: 'Später', test: (m) => !m.archiviert && !!m.snoozed_until },
  { id: 'done', label: 'Done', test: (m) => m.archiviert },
];

const GROUPS = ['jetzt', 'ueberfaellig', 'heute', 'woche'];
const GROUP_LABEL = { ...URGENCY_LABEL, ueberfaellig: 'Überfällig' };

/** Überfällig: Frist vorbei, "Heute" von einem früheren Tag oder "Diese Woche" von vor mehr als 7 Tagen. "Jetzt" bleibt in "Jetzt". */
export function isOverdue(m, now = new Date()) {
  if (m.archiviert || !['heute', 'woche'].includes(m.dringlichkeit)) return false;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/^\d{4}-\d{2}-\d{2}/.test(m.frist || '') && new Date(`${m.frist.slice(0, 10)}T00:00:00`) < start) return true;
  const got = new Date(m.received_at);
  if (Number.isNaN(got.getTime())) return false;
  return m.dringlichkeit === 'heute' ? got < start : start - got > 7 * 86400000;
}
const groupOf = (m) => (isOverdue(m) ? 'ueberfaellig' : m.dringlichkeit);

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

// Nur ein Symbol mit Tooltip (statt Textmarke): spart Platz in der Liste.
function iconTag(iconName, title, cls = '') {
  return el('span', { class: `tag-icon ${cls}`, title, role: 'img', 'aria-label': title }, icon(iconName, 14));
}

/** Büroklammer mit den Formaten (PDF · XLSX, ab 3 verschiedenen "+n"); der Tooltip nennt die Dateinamen. */
function attachmentTag(names) {
  if (!names?.length) return null;
  const formats = [...new Set(names.map(formatOf))];
  const label = formats.length > 2 ? `${formats.slice(0, 2).join(' · ')} +${formats.length - 2}` : formats.join(' · ');
  return el('span', { class: 'badge att-tag', title: names.join('\n') }, icon('paperclip', 12), label);
}

/** Suchbegriffe im Ausschnitt markieren. */
function highlight(snippet, query) {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  if (!terms.length || !snippet) return [snippet];
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return snippet.split(re).map((s, i) => (i % 2 ? el('mark', { class: 'hit' }, s) : s));
}

/** Fundstellen unter der Zusammenfassung: Dokument (Büroklammer, Dateiname, Ausschnitt) und Mailtext (Brief, Ausschnitt). */
function docHit(hits, query) {
  const docs = hits.filter((h) => h.kind !== 'text');
  const text = hits.find((h) => h.kind === 'text');
  const lines = [];
  if (docs.length) {
    const first = docs[0];
    lines.push(
      el(
        'span',
        { class: 'row-doc', title: docs.map((h) => h.name).join('\n') },
        icon('paperclip', 12),
        el('span', { class: 'row-doc-name' }, first.name),
        docs.length > 1 && el('span', { class: 'row-doc-more' }, `+${docs.length - 1}`),
        first.snippet && el('span', { class: 'row-doc-text' }, ...highlight(first.snippet, query)),
      ),
    );
  }
  if (text) lines.push(el('span', { class: 'row-doc', title: 'Treffer im Mailtext' }, icon('file', 12), el('span', { class: 'row-doc-text' }, ...highlight(text.snippet, query))));
  return lines;
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

function row(m, selected, actions, query = '') {
  const time = m.snoozed_until ? `bis ${formatShort(m.snoozed_until)}` : formatShort(m.received_at);
  const quick = m.archiviert
    ? [quickButton('undo', 'Zurückholen nach Offen', '', () => actions.restore(m.id)), quickButton('trash', 'Endgültig löschen', 'danger', () => actions.remove(m.id))]
    : [quickButton('check', 'In Done ablegen', '', () => actions.archive(m.id)), quickButton('trash', 'Endgültig löschen', 'danger', () => actions.remove(m.id))];
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
      el('span', { class: 'row-top' }, el('span', { class: 'row-who' }, el('span', { class: 'row-from' }, m.absender || m.absender_mail), roleChip(m.rolle)), el('time', { class: 'row-time' }, time)),
      el('span', { class: 'row-subject' }, m.betreff),
      el('span', { class: 'row-summary' }, m.zusammenfassung),
      m.doc_treffer && docHit(m.doc_treffer, query),
      el(
        'span',
        { class: 'row-badges' },
        m.is_test && badge('TEST', 'test', 'flask'),
        m.archiviert && badge(`Done · ${FILED_LABEL[m.status] || m.status}`, m.status === 'done' ? '' : 'ok', 'archive'),
        !m.archiviert && m.wichtig?.length > 0 && el('span', { class: 'badge wichtig', title: `Wichtig: ${m.wichtig.join(', ')}` }, icon('flag', 12), 'Wichtig'),
        !m.archiviert && (m.aufgabe_uebernommen
          ? iconTag('check', `Aufgabe übernommen: ${m.aufgabe_uebernommen.text}`, 'ok')
          : m.aufgabe_text && iconTag('checkSquare', 'Aufgabe vorgeschlagen')),
        attachmentTag(m.anhaenge),
        !m.archiviert && m.frist && badge(`Frist ${formatDay(m.frist)}`, 'frist', 'clock'),
      ),
    ),
    el('span', { class: 'row-actions' }, quick),
  );
}

// Überschriften der Offen-Liste mit Farbe und Symbol; ohne level (Suche) schlicht.
const GROUP_ICON = { jetzt: 'zap', ueberfaellig: 'alert', heute: 'sun', woche: 'calendar' };
function header(text, count, level) {
  return el('div', { class: `group-head${level ? ` g-${level}` : ''}`, role: 'presentation' }, el('span', { class: 'group-title' }, level && icon(GROUP_ICON[level], 14), text), el('span', { class: 'group-count' }, String(count)));
}

/** items: bereits nach Tab/Suche gefilterte Liste. Gruppiert nur in "Offen" ohne Suche. */
export function renderList(container, { items, selectedId, query, tab, actions, docCoverage, searching = query.trim().length > 0 }) {
  const mk = (m) => row(m, String(m.id) === String(selectedId), actions, query);
  const nodes = [];
  if (!items.length) {
    const text = searching ? (query.trim() ? `Nichts gefunden für „${query}“.` : 'Keine Mail passt zu den Filtern.') : tab === 'offen' ? 'Keine offenen Mails.' : tab === 'done' ? 'In Done liegt noch nichts. Erledigte Mails landen hier.' : 'Hier ist nichts.';
    nodes.push(el('div', { class: 'empty-state' }, icon(tab === 'done' && !searching ? 'archive' : 'inbox', 28), el('strong', {}, searching ? 'Keine Treffer' : tab === 'offen' ? 'Alles erledigt' : 'Leer'), el('p', {}, text)));
  } else if (searching) {
    const inDone = items.filter((m) => m.archiviert).length;
    const partial = docCoverage && docCoverage.indexed < docCoverage.total ? ` · Dokumente und Mailtext: ${docCoverage.indexed} von ${docCoverage.total} Mails gelesen` : '';
    nodes.push(header(`${items.length} Treffer in allen Mails${inDone ? `, davon ${inDone} in Done` : ''}${partial}`, ''), ...items.map(mk));
  } else if (tab === 'offen') {
    for (const g of GROUPS) {
      const inGroup = items.filter((m) => groupOf(m) === g);
      if (g === 'ueberfaellig') inGroup.sort((a, b) => String(a.received_at).localeCompare(String(b.received_at))); // am längsten überfällig zuerst
      if (inGroup.length) nodes.push(header(GROUP_LABEL[g], inGroup.length, g), ...inGroup.map(mk));
    }
  } else {
    nodes.push(...items.map(mk));
  }
  container.replaceChildren(...nodes);
  container.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
