// Die Detailansicht rechts, eine Spalte: Kopf mit Aktionen, Absender und Empfänger, Anhänge, Aufgabe (eine Zeile), Zusammenfassung (immer sichtbar),
// Verlauf als eigene, aufklappbare Sektion (mit Knopf zum Vergrößern) und darunter die Antwort (Entwurf, Empfänger, Ablegen, Senden). Der Verlauf steht in mail-body.js und thread.js, die Anhangsleiste in attachments-box.js.
import { el, avatar, badge, formatFull, formatDay, roleChip, URGENCY_LABEL, FILED_LABEL } from '../util.js';
import { icon } from '../icons.js';
import { createTaskRow } from './task-row.js';
import { createDraftPanel } from './draft-panel.js';
import { createSnoozeMenu } from './snooze-menu.js';
import { splitButton } from './menu.js';
import { createAttachmentsBox } from './attachments-box.js';
import { createMailBody } from './mail-body.js';

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
  // Signatur deiner letzten Nachricht im Verlauf (für "Meine Signatur anhängen"); der Verlauf wird dafür im Hintergrund geladen
  let bodyView = null;
  const draftPanel = !done
    ? createDraftPanel({
        draft,
        error: p.entwurf_fehler,
        isTest: p.is_test,
        needsReply: p.antwort_noetig,
        suggest: handlers.suggest,
        reply: data.reply,
        ownSignature: () => handlers.signatureOverride?.() ?? (bodyView?.ownSignature() || ''),
        onRegenerate: handlers.regenerate,
        onSendCheck: handlers.sendCheck,
        onOutlookDraft: handlers.outlookDraft,
        onOutlookDraftDelete: handlers.outlookDraftDelete,
        onSend: handlers.outlookSend,
        onArchive: () => handlers.archive({ ignoreSender: false }),
        onSchedule: handlers.schedule,
        onUnschedule: handlers.unschedule,
        onImprove: handlers.improve ? (o) => handlers.improve({ ...o, context: mail.text }) : null,
        onSaveEdit: handlers.saveEdit,
        undoSeconds: handlers.undoSeconds,
      })
    : null;

  // --- Kopf mit Aktionen oben rechts
  // Nur Symbole mit Tooltip: "In Outlook öffnen" und "Löschen"
  const outlook = p.is_test
    ? el('span', { class: 'icon-btn disabled', title: 'In Outlook öffnen: nicht möglich, Testnachrichten gibt es in Outlook nicht', role: 'img', 'aria-label': 'In Outlook öffnen (bei Testnachrichten nicht möglich)' }, icon('external', 15))
    : el('a', { class: 'icon-btn', href: p.web_link, target: '_blank', rel: 'noopener', title: 'In Outlook öffnen: die Mail im Browser anzeigen', 'aria-label': 'In Outlook öffnen' }, icon('external', 15));

  const remove = el(
    'button',
    { class: 'icon-btn danger', type: 'button', title: 'Löschen: entfernt die Konversation vollständig aus dieser Übersicht (auch aus Done). In Outlook bleibt die Mail unverändert.', 'aria-label': 'Löschen', onclick: handlers.remove },
    icon('trash', 15),
  );

  const actions = done
    ? [outlook, el('button', { class: 'btn primary', type: 'button', title: 'Zurück nach Offen holen, wenn doch noch etwas zu tun ist', onclick: handlers.restore }, icon('undo', 15), el('span', {}, 'Zurückholen')), remove]
    : [
        outlook,
        createSnoozeMenu({ onSnooze: handlers.snooze }),
        splitButton({
          label: 'Done',
          iconName: 'check',
          title: 'In Done ablegen: erledigt, keine Aufgabe nötig. Die Mail bleibt über die Suche auffindbar und lässt sich zurückholen.',
          onClick: () => handlers.archive({ ignoreSender: false }),
          items: [{ label: 'Absender künftig ignorieren', hint: 'Legt die Mail in Done ab und blendet künftig alle Mails dieses Absenders aus.', stacked: true, onClick: () => handlers.archive({ ignoreSender: true }) }],
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
        !done && p.wichtig?.length > 0 && el('span', { class: 'badge wichtig', title: `Wichtig: ${p.wichtig.join(', ')}` }, icon('flag', 12), 'Wichtig'),
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
      el('button', { class: 'avatar-btn', type: 'button', title: 'Absender-Profil öffnen', 'aria-label': 'Absender-Profil öffnen', onclick: () => handlers.openProfile?.(mail.from.address) }, avatar(mail.from.name, mail.from.address, 36)),
      el('div', { class: 'from-text' }, el('strong', {}, mail.from.name || mail.from.address), mail.from.name && el('span', { class: 'addr' }, ` <${mail.from.address}>`), roleChip(p.rolle)),
      el('time', { class: 'from-date' }, formatFull(mail.receivedDateTime)),
    ),
    personChips('An', mail.to, ctx.ownAddress),
    personChips('Cc', mail.cc, ctx.ownAddress),
  );

  const attachmentsBox = createAttachmentsBox(p.id, handlers.attachments);

  // --- Zusammenfassung (immer sichtbar) und Verlauf (eigene Sektion, aufklappbar)
  const summaryText = [p.zusammenfassung, !done && p.begruendung].filter(Boolean).join(' ') || 'Keine Zusammenfassung vorhanden.';
  const summaryView = el(
    'div',
    { class: 'msg-summary' },
    // Zusammenfassung und Begründung stehen in einem Absatz
    el('p', {}, summaryText, !done && p.durch_regel && el('em', { class: 'by-rule' }, ` (per Regel von „${URGENCY_LABEL[p.dringlichkeit_original] || p.dringlichkeit_original}“ geändert)`)),
    p.anhang_bewertung && !done && el(
      'p',
      { class: 'why att-review' },
      icon('paperclip', 13),
      el('span', {}, `Mit Anhängen neu bewertet (${(p.anhang_bewertung.anhaenge || []).join(', ')}). Vorher: ${URGENCY_LABEL[p.anhang_bewertung.vorher] || p.anhang_bewertung.vorher}. `),
      el('button', { class: 'link', type: 'button', onclick: handlers.revertReview }, 'Zurücksetzen'),
    ),
  );
  const summary = el('section', { class: 'card summary', 'aria-label': 'Zusammenfassung' }, el('div', { class: 'card-head' }, icon('sparkle', 14), el('h3', {}, 'Zusammenfassung')), summaryView);

  const body = createMailBody({ proposalId: p.id, mail, mailError, handlers, ownAddress: ctx.ownAddress });
  bodyView = body;
  const sizeBtn = el('button', { class: 'icon-btn v-size', type: 'button', hidden: true, 'aria-pressed': 'false', onclick: () => setBig(!verlauf.classList.contains('big')) });
  const toggle = el('button', { class: 'v-toggle', type: 'button', 'aria-expanded': 'false', onclick: () => setOpen(body.node.hidden) }, icon('chevron', 14), icon('file', 14), 'Verlauf');
  // Das Auge (Original/Anonymisiert) gehört zum Verlauf und ist nur bei aufgeklapptem Verlauf zu sehen
  const verlauf = el('section', { class: 'card verlauf', 'aria-label': 'Verlauf' }, el('div', { class: 'v-head' }, toggle, el('span', { class: 'spacer' }), body.eye, sizeBtn), body.node);
  // Vergrößern: der Verlauf zeigt alles ohne Scrollen im Rahmen; nochmal klicken macht ihn wieder so klein wie vorher
  function setBig(big) {
    verlauf.classList.toggle('big', big);
    sizeBtn.setAttribute('aria-pressed', String(big));
    sizeBtn.title = big ? 'Verlauf verkleinern' : 'Verlauf vergrößern: alles ohne Scrollen zeigen';
    sizeBtn.setAttribute('aria-label', sizeBtn.title);
    sizeBtn.replaceChildren(icon(big ? 'shrink' : 'expand', 15));
  }
  setBig(false);
  function setOpen(open) {
    sizeBtn.hidden = !open;
    body.node.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    verlauf.classList.toggle('open', open);
    if (body.eye) body.eye.hidden = !open;
    if (open) body.show();
    ctx.onView?.(open ? 'message' : 'summary');
  }
  setOpen(ctx.view === 'message');

  // Reihenfolge: Person, Anhänge, Aufgabe, Zusammenfassung, Verlauf, Antwort
  container.replaceChildren(el('article', { class: 'detail' }, head, testBanner, doneBanner, people, attachmentsBox, taskRow?.node, summary, verlauf, draftPanel?.node));
  container.scrollTop = 0;
  if (draftPanel) body.preload().then(() => draftPanel.refresh());

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
