import { el, avatar, formatFull, formatDay, URGENCY_LABEL, FILED_LABEL } from '../util.js';
import { icon } from '../icons.js';
import { createTaskRow } from './task-row.js';
import { createDraftPanel } from './draft-panel.js';
import { createSnoozeMenu } from './snooze-menu.js';
import { splitButton } from './menu.js';

const MAX_CHIPS = 5;

function personChips(label, people, ownAddress) {
  if (!people.length) return null;
  const chips = people.map((p) => {
    const own = p.address && p.address.toLowerCase() === ownAddress.toLowerCase();
    return el('span', { class: `person${own ? ' own' : ''}`, title: p.address || p.name }, own ? 'Du' : p.name || p.address);
  });
  const rest = chips.slice(MAX_CHIPS);
  const more = rest.length
    ? el('button', { class: 'link', type: 'button', onclick: (e) => { rest.forEach((c) => (c.hidden = false)); e.currentTarget.remove(); } }, `+${rest.length} weitere`)
    : null;
  rest.forEach((c) => (c.hidden = true));
  return el('div', { class: 'people-line' }, el('span', { class: 'people-label' }, label), el('div', { class: 'people' }, chips, more));
}

function badge(text, cls = '', iconName) {
  return el('span', { class: `badge ${cls}` }, iconName && icon(iconName, 12), text);
}

/**
 * Baut die Detailansicht. ctx: { view, ownAddress, onView(view), handlers }
 * handlers: { accept(payload), archive({ignoreSender}), remove(), restore(), snooze(iso), regenerate(), reload() }
 * Gibt einen Controller zurück: { setMatch(match), updateDraft({draft, error}), hasDraftPanel }
 */
export function renderDetail(container, data, ctx) {
  const { proposal: p, mail, mailError, draft, headings } = data;
  const { handlers } = ctx;
  const done = p.archiviert;

  // Erledigtes hat keine Aufgabe und keinen Entwurf mehr; dafür gibt es "Zurückholen".
  const taskRow = done ? null : createTaskRow({ proposal: p, headings, isTest: p.is_test, onAccept: handlers.accept });
  const draftPanel = !done && p.antwort_noetig ? createDraftPanel({ draft, error: p.entwurf_fehler, isTest: p.is_test, onRegenerate: handlers.regenerate }) : null;

  // --- Kopf mit Aktionen oben rechts
  const outlook = p.is_test
    ? el('span', { class: 'btn disabled', title: 'Testnachricht: existiert in Outlook nicht', 'aria-disabled': 'true' }, icon('external', 15), el('span', {}, 'In Outlook öffnen'))
    : el('a', { class: 'btn', href: p.web_link, target: '_blank', rel: 'noopener', title: 'Mail in Outlook im Browser öffnen' }, icon('external', 15), el('span', {}, 'In Outlook öffnen'));

  const remove = el(
    'button',
    { class: 'btn danger', type: 'button', title: 'Löschen: entfernt die Konversation vollständig aus dieser Übersicht (auch aus Done). In Outlook bleibt die Mail unverändert.', onclick: handlers.remove },
    icon('trash', 15),
    el('span', {}, 'Löschen'),
  );

  const actions = done
    ? [outlook, el('button', { class: 'btn primary', type: 'button', title: 'Zurück nach Offen holen, wenn doch noch etwas zu tun ist', onclick: handlers.restore }, icon('undo', 15), el('span', {}, 'Zurückholen')), remove]
    : [
        outlook,
        createSnoozeMenu({ onSnooze: handlers.snooze }),
        splitButton({
          label: 'Verwerfen',
          iconName: 'archive',
          title: 'In Done ablegen: keine Aufgabe nötig. Die Mail bleibt über die Suche auffindbar und lässt sich zurückholen.',
          onClick: () => handlers.archive({ ignoreSender: false }),
          items: [{ label: 'Absender künftig ignorieren', hint: 'Verwirft die Mail und blendet künftig alle Mails dieses Absenders aus.', stacked: true, onClick: () => handlers.archive({ ignoreSender: true }) }],
        }),
        remove,
      ];

  const head = el(
    'header',
    { class: 'd-head' },
    el(
      'div',
      { class: 'd-title' },
      el('h2', {}, p.betreff || '(ohne Betreff)'),
      el(
        'div',
        { class: 'd-badges' },
        p.is_test && badge('TESTNACHRICHT', 'test', 'flask'),
        done ? badge(`Done · ${FILED_LABEL[p.status] || p.status}`, p.status === 'done' ? '' : 'ok', 'archive') : badge(URGENCY_LABEL[p.dringlichkeit] || p.dringlichkeit, `u-${p.dringlichkeit}`),
        p.kategorie && badge(p.kategorie),
        !done && p.frist && badge(`Frist ${formatDay(p.frist)}`, 'frist', 'clock'),
        p.snoozed_until && badge(`zurückgestellt bis ${formatFull(p.snoozed_until)}`, '', 'clock'),
      ),
    ),
    el('div', { class: 'd-actions' }, actions),
  );

  const testBanner = p.is_test
    ? el('div', { class: 'banner test' }, icon('flask', 16), el('span', {}, el('strong', {}, 'Testnachricht von Claude. '), 'Diese Mail ist erfunden und existiert in Outlook nicht. Angezeigt wird die gespeicherte Vorschau.'))
    : null;
  const doneBanner = done
    ? el('div', { class: 'banner done' }, icon('archive', 16), el('span', {}, el('strong', {}, `In Done abgelegt${p.abgelegt_am ? ` am ${formatFull(p.abgelegt_am)}` : ''}. `), 'Weiterhin durchsuchbar. Mit „Zurückholen“ landet die Mail wieder unter Offen.'))
    : null;

  // --- Absender und Empfänger
  const people = el(
    'section',
    { class: 'people-block', 'aria-label': 'Absender und Empfänger' },
    el(
      'div',
      { class: 'from-line' },
      avatar(mail.from.name, mail.from.address, 36),
      el('div', { class: 'from-text' }, el('strong', {}, mail.from.name || mail.from.address), mail.from.name && el('span', { class: 'addr' }, ` <${mail.from.address}>`)),
      el('time', { class: 'from-date' }, formatFull(mail.receivedDateTime)),
    ),
    personChips('An', mail.to, ctx.ownAddress),
    personChips('Cc', mail.cc, ctx.ownAddress),
  );

  // --- Zusammenfassung / Nachricht umschalten
  const summaryView = el(
    'div',
    { class: 'msg-summary' },
    el('p', {}, p.zusammenfassung || 'Keine Zusammenfassung vorhanden.'),
    p.begruendung && !done && el('p', { class: 'why' }, icon('sparkle', 13), el('span', {}, p.begruendung), p.durch_regel && el('em', {}, ` (per Regel von „${URGENCY_LABEL[p.dringlichkeit_original] || p.dringlichkeit_original}“ geändert)`)),
  );
  const messageView = el(
    'div',
    { class: 'msg-full', hidden: true },
    mailError && el('div', { class: 'inline-error' }, icon('alert', 16), el('span', {}, `${mailError} Angezeigt wird die Vorschau.`), el('button', { class: 'link', type: 'button', onclick: handlers.reload }, 'Erneut laden')),
    mail.source === 'vorschau' && !mailError ? el('p', { class: 'hint' }, 'Nur Vorschau verfügbar.') : null,
    el('pre', { class: 'mailtext' }, mail.text || '(kein Text)'),
  );
  const tabSummary = el('button', { class: 'seg-btn', type: 'button', role: 'tab', onclick: () => setView('summary') }, icon('sparkle', 14), 'Zusammenfassung');
  const tabMessage = el('button', { class: 'seg-btn', type: 'button', role: 'tab', onclick: () => setView('message') }, icon('file', 14), 'Nachricht');
  function setView(v) {
    summaryView.hidden = v !== 'summary';
    messageView.hidden = v !== 'message';
    tabSummary.setAttribute('aria-selected', String(v === 'summary'));
    tabMessage.setAttribute('aria-selected', String(v === 'message'));
    ctx.onView?.(v);
  }
  const message = el('section', { class: 'card msg', 'aria-label': 'Inhalt' }, el('div', { class: 'seg', role: 'tablist' }, tabSummary, tabMessage), summaryView, messageView);
  setView(ctx.view === 'message' ? 'message' : 'summary');

  container.replaceChildren(el('article', { class: 'detail' }, head, testBanner, doneBanner, people, message, taskRow?.node, draftPanel?.node));
  container.scrollTop = 0;

  return {
    setMatch: (m) => taskRow?.setMatch(m),
    updateDraft: (next) => draftPanel?.update(next),
    hasDraftPanel: !!draftPanel,
  };
}

export function renderLoading(container) {
  container.replaceChildren(el('div', { class: 'detail skeleton', 'aria-busy': 'true' }, el('div', { class: 'sk sk-title' }), el('div', { class: 'sk sk-line' }), el('div', { class: 'sk sk-block' }), el('div', { class: 'sk sk-block short' })));
}

export function renderEmpty(container, text = 'Wähle links eine Mail.') {
  container.replaceChildren(el('div', { class: 'empty-detail' }, icon('inbox', 34), el('p', {}, text)));
}
