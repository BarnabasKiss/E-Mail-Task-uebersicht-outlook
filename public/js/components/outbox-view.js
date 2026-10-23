// Entwürfe und geplante Mails: was in der App wartet. Entwürfe neuer Mails liegen nur in der App (nicht in Outlook), geplante Mails sendet die App zur Sendezeit.
import { el, formatShort } from '../util.js';
import { icon } from '../icons.js';

const when = (iso) => new Date(iso).toLocaleString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const who = (list) => (list.length ? list.slice(0, 2).join(', ') + (list.length > 2 ? ` +${list.length - 2}` : '') : '(kein Empfänger)');

/** data: { drafts, scheduled }. handlers: { back, openDraft(draft), deleteDraft(id), cancel(id), toDraft(id), sendNow(id) } */
export function renderOutbox(container, data, handlers, note = '') {
  const scheduledRow = (s) => {
    const failed = s.status === 'fehler';
    return el(
      'li',
      { class: `ob-row${failed ? ' failed' : ''}` },
      el('span', { class: 'ob-main' }, el('strong', {}, s.kind === 'reply' ? `Antwort: ${s.betreff || '(Mail)'}` : s.payload.subject), el('span', { class: 'ob-sub' }, `an ${who(s.payload.to)}`, s.payload.cc.length ? ` · CC ${s.payload.cc.length}` : '', s.payload.bcc.length ? ` · BCC ${s.payload.bcc.length}` : '', s.payload.done ? ' · danach in Done' : '')),
      el('span', { class: 'ob-when' }, icon('clock', 13), when(s.sendAt)),
      el('span', { class: 'ob-state' }, failed ? el('span', { class: 'badge u-jetzt', title: s.error }, `Fehler (${s.attempts}×)`) : s.status === 'sendet' ? el('span', { class: 'badge' }, 'Wird gesendet') : el('span', { class: 'badge ok' }, 'Geplant')),
      el(
        'span',
        { class: 'ob-actions' },
        el('button', { class: 'btn small', type: 'button', onclick: () => handlers.sendNow(s.id) }, icon('send', 13), 'Jetzt senden'),
        s.kind === 'new' && el('button', { class: 'btn small', type: 'button', title: 'Die Planung aufheben und die Mail wieder als Entwurf öffnen', onclick: () => handlers.toDraft(s.id) }, icon('pencil', 13), 'Bearbeiten'),
        el('button', { class: 'icon-btn danger small', type: 'button', title: 'Planung abbrechen (die Mail wird nicht gesendet)', 'aria-label': 'Planung abbrechen', onclick: () => handlers.cancel(s.id) }, icon('trash', 14)),
      ),
      failed && el('span', { class: 'ob-error' }, s.error),
    );
  };

  const draftRow = (d) =>
    el(
      'li',
      { class: 'ob-row' },
      el('button', { class: 'ob-main ob-open', type: 'button', onclick: () => handlers.openDraft(d) }, el('strong', {}, d.subject || '(ohne Betreff)'), el('span', { class: 'ob-sub' }, `an ${who(d.to)}`, d.text ? ` · ${d.text.replace(/\s+/g, ' ').slice(0, 90)}` : '')),
      el('span', { class: 'ob-when' }, formatShort(d.updatedAt)),
      el('button', { class: 'icon-btn danger small', type: 'button', title: 'Entwurf löschen', 'aria-label': 'Entwurf löschen', onclick: () => handlers.deleteDraft(d.id) }, icon('trash', 14)),
    );

  container.replaceChildren(
    el(
      'article',
      { class: 'detail outbox' },
      el('header', { class: 'd-head' }, el('div', { class: 'd-title' }, el('h2', {}, 'Entwürfe und Geplantes'), el('div', { class: 'd-badges' }, el('span', { class: 'badge' }, `${data.drafts.length} Entwürfe`), el('span', { class: 'badge' }, `${data.scheduled.length} geplant`))), el('div', { class: 'd-actions' }, el('button', { class: 'btn', type: 'button', onclick: handlers.back }, icon('undo', 15), el('span', {}, 'Zurück')))),
      note && el('p', { class: 'hint ob-note', role: 'status' }, note),
      el(
        'section',
        { class: 'card', 'aria-label': 'Geplant' },
        el('div', { class: 'card-head' }, icon('clock', 14), el('h3', {}, 'Geplant')),
        data.scheduled.length ? el('ul', { class: 'ob-list' }, data.scheduled.map(scheduledRow)) : el('p', { class: 'hint' }, 'Nichts geplant. Bei jeder Mail gibt es „Senden planen“. Die App muss zur Sendezeit laufen; war sie aus, geht die Mail beim nächsten Start sofort raus.'),
      ),
      el(
        'section',
        { class: 'card', 'aria-label': 'Entwürfe' },
        el('div', { class: 'card-head' }, icon('pencil', 14), el('h3', {}, 'Entwürfe')),
        data.drafts.length ? el('ul', { class: 'ob-list' }, data.drafts.map(draftRow)) : el('p', { class: 'hint' }, 'Keine Entwürfe. Neue Mails werden beim Schreiben automatisch in der App gespeichert (nicht in Outlook).'),
      ),
    ),
  );
}
