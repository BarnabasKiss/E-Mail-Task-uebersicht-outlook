// Die letzten Mails eines Absenders im Profil: Betreff, Zusammenfassung und dieselben Tags wie in der Liste.
import { el, badge, formatShort, formatDay, roleChip, URGENCY_LABEL, FILED_LABEL } from '../util.js';
import { icon } from '../icons.js';
import { formatOf } from '../search.js';

function attachmentTag(names) {
  if (!names?.length) return null;
  const formats = [...new Set(names.map(formatOf))];
  const label = formats.length > 2 ? `${formats.slice(0, 2).join(' · ')} +${formats.length - 2}` : formats.join(' · ');
  return el('span', { class: 'badge att-tag', title: names.join('\n') }, icon('paperclip', 12), label);
}

function mailCard(m, onOpen) {
  const done = m.archiviert;
  return el(
    'button',
    { class: `p-mail u-${m.dringlichkeit}`, type: 'button', onclick: () => onOpen(m.id) },
    el('span', { class: 'p-mail-top' }, el('strong', { class: 'p-mail-subject' }, m.betreff || '(ohne Betreff)'), el('time', { class: 'p-mail-time' }, formatShort(m.received_at))),
    m.zusammenfassung && el('span', { class: 'p-mail-summary' }, m.zusammenfassung),
    el(
      'span',
      { class: 'row-badges' },
      done ? badge(`Done · ${FILED_LABEL[m.status] || m.status}`, m.status === 'done' ? '' : 'ok', 'archive') : badge(URGENCY_LABEL[m.dringlichkeit] || m.dringlichkeit, `u-${m.dringlichkeit}`),
      m.kategorie && badge(m.kategorie),
      !done && m.wichtig?.length > 0 && el('span', { class: 'badge wichtig', title: `Wichtig: ${m.wichtig.join(', ')}` }, icon('flag', 12), 'Wichtig'),
      attachmentTag(m.anhaenge),
      !done && (m.aufgabe_uebernommen ? badge('Aufgabe übernommen', 'ok', 'check') : m.aufgabe_text && badge('Aufgabe vorgeschlagen', '', 'checkSquare')),
      !done && m.frist && badge(`Frist ${formatDay(m.frist)}`, 'frist', 'clock'),
      m.snoozed_until && badge(`zurückgestellt bis ${formatShort(m.snoozed_until)}`, '', 'clock'),
      roleChip(m.rolle),
    ),
  );
}

/** mails: Einträge wie in der Liste (neueste zuerst); onOpen(id) öffnet die Mail. */
export function createProfileMails(mails, onOpen) {
  return el(
    'section',
    { class: 'card', 'aria-label': 'Letzte Mails' },
    mails.length ? el('div', { class: 'p-mails' }, mails.map((m) => mailCard(m, onOpen))) : el('p', { class: 'hint' }, 'Von dieser Adresse liegt keine Mail in der Übersicht.'),
  );
}
