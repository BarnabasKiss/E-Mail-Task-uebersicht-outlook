import { el, avatar, formatFull, formatDay, roleChip, URGENCY_LABEL, FILED_LABEL } from '../util.js';
import { icon } from '../icons.js';
import { createTaskRow } from './task-row.js';
import { createDraftPanel } from './draft-panel.js';
import { createSnoozeMenu } from './snooze-menu.js';
import { splitButton } from './menu.js';

const MAX_CHIPS = 5;

const formatSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Anhänge werden nachgeladen (eigener Aufruf an Outlook), die Ansicht wartet nicht darauf. */
function createAttachmentsBox(proposalId, load) {
  const box = el('section', { class: 'attachments', 'aria-label': 'Anhänge', hidden: true });
  load()
    .then(({ items, readByAi, canPreview }) => {
      if (!items.length) return;
      box.replaceChildren(
        icon('paperclip', 14),
        el(
          'div',
          { class: 'att-list' },
          items.map((a) => {
            const href = `/api/proposals/${proposalId}/attachments/${encodeURIComponent(a.id)}`;
            const hint = a.tooBig
              ? 'Zu groß für die App (über 25 MB). In Outlook öffnen.'
              : readByAi && a.readable
                ? 'Der Text daraus wird anonymisiert an Claude gegeben, wenn ein Antwortentwurf entsteht.'
                : 'Dieser Dateityp wird von Claude nicht gelesen.';
            const body = [el('span', { class: 'att-name' }, a.name), el('span', { class: 'att-size' }, formatSize(a.size))];
            if (readByAi && a.readable) body.push(el('span', { class: 'att-ai', title: hint }, icon('sparkle', 11)));
            if (a.tooBig) return el('span', { class: 'att disabled', title: hint }, body);
            return el(
              'span',
              { class: 'att-wrap' },
              el('a', { class: 'att', href, target: '_blank', rel: 'noopener', title: `${a.name}\nIm Browser öffnen\n${hint}` }, body),
              el('a', { class: 'att-dl', href: `${href}?download=1`, download: a.name, title: `${a.name} herunterladen`, 'aria-label': `${a.name} herunterladen` }, icon('download', 14)),
            );
          }),
          canPreview && el('a', { class: 'link att-preview', href: `/api/proposals/${proposalId}/attachments/review-preview`, target: '_blank', rel: 'noopener', title: 'Zeigt den anonymisierten Text, der an Claude gehen würde (wird dabei nicht gesendet).' }, 'Was geht an Claude?'),
        ),
      );
      box.hidden = false;
    })
    .catch(() => {}); // Anhänge sind eine Zugabe: ein Fehler stört die Mail nicht
  return box;
}

const IMAGE_MARK = /⟦bild:([^⟧]*)⟧/g;

// Tooltip hängt direkt an der Seite (nicht im scrollbaren Mailtext) und folgt dem Mauszeiger.
function placeTip(tip, x, y) {
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = x + 16 + w > window.innerWidth - 8 ? Math.max(8, x - w - 16) : x + 16;
  const top = y + 20 + h > window.innerHeight - 8 ? Math.max(8, y - h - 12) : y + 20;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

/**
 * Mailtext mit den Bildern aus der Mail an ihrer Stelle (Marken ⟦bild:<Wert>⟧).
 * resolve: Marke -> Anhang-ID, tip: Anhang-ID -> Tooltip-Knoten oder null, text: Textstück -> Knoten (z. B. mit Platzhalter-Markierung).
 */
function textWithImages(proposalId, text, { resolve = (v) => v, tip, plain = (t) => t } = {}) {
  const parts = [];
  let last = 0;
  // Das Bild ist ein Block: die Zeilenumbrüche um die Marke würden sonst als Leerzeilen dazukommen.
  for (const m of text.matchAll(IMAGE_MARK)) {
    parts.push(plain(text.slice(last, m.index).replace(last ? /^\n|\n$/g : /\n$/, '')));
    const id = resolve(m[1]);
    const src = `/api/proposals/${proposalId}/attachments/${encodeURIComponent(id)}`;
    const link = el('a', { class: 'mail-img', href: src, target: '_blank', rel: 'noopener', title: tip ? null : 'Bild in voller Größe öffnen' }, el('img', { src, alt: 'Bild in der Mail', loading: 'lazy' }));
    const tipNode = tip ? tip(id) : null;
    if (tipNode) {
      const wrap = el('span', { class: 'mail-img-wrap', tabindex: '0' }, link, el('span', { class: 'ocr-badge' }, 'OCR'));
      const open = (x, y) => {
        document.body.append(tipNode);
        tipNode.classList.add('on');
        placeTip(tipNode, x, y);
      };
      wrap.addEventListener('mouseenter', (e) => open(e.clientX, e.clientY));
      wrap.addEventListener('mousemove', (e) => placeTip(tipNode, e.clientX, e.clientY));
      wrap.addEventListener('mouseleave', () => tipNode.remove());
      wrap.addEventListener('focus', () => {
        const r = wrap.getBoundingClientRect();
        open(r.left, r.top + 8);
      });
      wrap.addEventListener('blur', () => tipNode.remove());
      parts.push(wrap);
    } else {
      parts.push(link);
    }
    last = m.index + m[0].length;
  }
  parts.push(plain(last ? text.slice(last).replace(/^\n/, '') : text));
  return parts.flat().filter((x) => x !== '');
}

/** Textkasten, der sich bis 320 px dem Inhalt anpasst und per Ziehen (unten rechts) in der Höhe veränderbar ist. */
function autosize(box) {
  let userSized = false;
  const fit = () => {
    if (userSized || !box.isConnected) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight + 2, 320)}px`;
  };
  box.addEventListener('pointerdown', (e) => {
    const r = box.getBoundingClientRect();
    if (e.clientX > r.right - 22 && e.clientY > r.bottom - 22) userSized = true; // Ziehgriff
  });
  box.addEventListener('load', fit, true); // Bilder laden nach
  return fit;
}

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
      avatar(mail.from.name, mail.from.address, 36),
      el('div', { class: 'from-text' }, el('strong', {}, mail.from.name || mail.from.address), mail.from.name && el('span', { class: 'addr' }, ` <${mail.from.address}>`), roleChip(p.rolle)),
      el('time', { class: 'from-date' }, formatFull(mail.receivedDateTime)),
    ),
    personChips('An', mail.to, ctx.ownAddress),
    personChips('Cc', mail.cc, ctx.ownAddress),
  );

  const attachmentsBox = createAttachmentsBox(p.id, handlers.attachments);

  // --- Zusammenfassung / Nachricht umschalten
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
  // Auge: "Original" = Mail mit Bildern und der Text, den die OCR daraus liest. "Anonymisiert" = genau das, was Claude bekäme
  // (Mailtext, Text aus Bildern und Anhängen, mit markierten Platzhaltern, Zuordnung und Ergebnis der Prüfung).
  // Der Text aus Bildern und Anhängen kommt nachgeladen (die OCR kann dauern), die Mail erscheint sofort.
  let ai = null; // Antwort von /ai-view, sobald da
  const sendable = () => (ai && ai.text != null ? ai : mail.masked); // { text, map }
  const original = () => (mail.imageText ? textWithImages(p.id, mail.imageText) : mail.text || '(kein Text)');
  const maskedNodes = (text, map) => {
    const parts = [];
    let last = 0;
    for (const m of text.matchAll(/\[[A-ZÄÖÜ]+_\d+\]/g)) {
      parts.push(text.slice(last, m.index));
      parts.push(el('mark', { class: 'mask', title: `Original: ${map[m[0]] ?? '?'}` }, m[0]));
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return parts.filter((x) => x !== '');
  };
  // Anonymisiert: die Bilder bleiben an ihrer Stelle, der Tooltip zeigt den maskierten Text, den Claude daraus bekommt.
  const maskedView = (src) => {
    if (!(ai && ai.text != null && ai.imageIds?.length)) return maskedNodes(src.text, src.map);
    const tip = (id) => {
      const it = ai.items.find((x) => x.attId === id);
      return el('span', { class: 'ai-tip', role: 'tooltip' }, el('span', { class: 'ai-tip-title' }, it ? 'So bekommt Claude den Text aus diesem Bild' : 'Aus diesem Bild geht nichts an Claude'), it ? el('span', { class: 'ai-tip-text' }, ...maskedNodes(it.masked, ai.map)) : el('span', { class: 'ai-tip-text' }, 'Kein Text erkannt oder das Bild ist zu klein. Claude sieht nie das Bild selbst.'));
    };
    return textWithImages(p.id, src.text, { resolve: (n) => ai.imageIds[Number(n) - 1], tip, plain: (t) => maskedNodes(t, src.map) });
  };
  const mailText = el('pre', { class: 'mailtext' }, original());
  const fitMailText = autosize(mailText);
  const legend = el('details', { class: 'mask-legend', hidden: true }); // Dropdown, standardmäßig zu
  const aiBox = el('section', { class: 'ai-items', 'aria-label': 'Anhänge und Prüfung', hidden: true });
  let showMasked = false;
  const eye = mail.masked && mail.text
    ? el('button', { class: 'eye-btn', type: 'button', 'aria-pressed': 'false', onclick: () => setMasked(!showMasked) })
    : null;

  // Nur in der anonymisierten Ansicht: Text aus Anhängen (Bilder stehen im Text) und das Ergebnis der Prüfung.
  function renderAiBox() {
    const items = (ai?.items || []).filter((it) => !it.attId && it.masked != null);
    aiBox.hidden = !showMasked || !ai || (ai.text == null && !ai.error);
    if (aiBox.hidden) return;
    const map = ai.map || {};
    const check = ai.problems.length
      ? el('p', { class: 'ai-check bad' }, icon('alert', 14), el('span', {}, `Prüfung: Würde NICHT an Claude gesendet. ${ai.problems.join('; ')}.`))
      : el('p', { class: 'ai-check ok' }, icon('check', 14), el('span', {}, 'Prüfung bestanden: keine erkannten Namen oder Kennungen mehr im Text.'));
    const fits = [];
    const nodes = [
      ai.error && el('p', { class: 'hint' }, ai.error),
      items.length && el('div', { class: 'ai-title' }, icon('sparkle', 13), el('span', {}, 'Text aus Anhängen, so bekommt ihn Claude')),
      ...items.map((it) => el('div', { class: 'ai-item' }, el('div', { class: 'ai-name' }, it.maskedName), (() => { const box = el('pre', { class: 'mailtext' }, ...maskedNodes(it.masked, map)); fits.push(autosize(box)); return box; })())),
      check,
    ];
    aiBox.replaceChildren(...nodes.filter(Boolean));
    requestAnimationFrame(() => fits.forEach((f) => f()));
  }

  function setMasked(on) {
    showMasked = on;
    const src = sendable();
    const entries = Object.entries(src.map);
    if (on) {
      mailText.replaceChildren(...maskedView(src));
      legend.replaceChildren(
        el('summary', { class: 'mask-title' }, entries.length ? `${entries.length} Angaben ersetzt` : 'Nichts ersetzt'),
        ...entries.map(([ph, v]) => el('div', { class: 'mask-row' }, el('mark', { class: 'mask' }, ph), el('span', { class: 'mask-arrow' }, '←'), el('span', {}, v))),
      );
    } else {
      mailText.replaceChildren(...[original()].flat());
    }
    legend.hidden = !on || !entries.length;
    eye.setAttribute('aria-pressed', String(on));
    eye.title = on ? 'Zeigt, was an Claude geht: anonymisierter Mailtext samt Text aus Bildern und Anhängen. Klicken für das Original.' : 'Original mit dem Text, den die OCR aus den Bildern liest. Klicken, um zu sehen, was anonymisiert wird.';
    eye.replaceChildren(icon(on ? 'eyeOff' : 'eye', 16), el('span', {}, on ? 'Anonymisiert' : 'Original'));
    renderAiBox();
    requestAnimationFrame(fitMailText);
  }
  if (eye) setMasked(false);

  let aiRequested = false;
  function loadAi() {
    if (aiRequested || !handlers.aiView) return;
    aiRequested = true;
    handlers
      .aiView()
      .then((r) => {
        ai = r;
        if (eye) setMasked(showMasked);
        else renderAiBox();
      })
      .catch(() => {
        aiBox.hidden = true; // Zugabe: ein Fehler stört die Mail nicht
      });
  }

  const messageView = el(
    'div',
    { class: 'msg-full', hidden: true },
    mailError && el('div', { class: 'inline-error' }, icon('alert', 16), el('span', {}, `${mailError} Angezeigt wird die Vorschau.`), el('button', { class: 'link', type: 'button', onclick: handlers.reload }, 'Erneut laden')),
    mail.source === 'vorschau' && !mailError ? el('p', { class: 'hint' }, 'Nur Vorschau verfügbar.') : null,
    mailText,
    legend,
    aiBox,
  );
  const tabSummary = el('button', { class: 'seg-btn', type: 'button', role: 'tab', onclick: () => setView('summary') }, icon('sparkle', 14), 'Zusammenfassung');
  const tabMessage = el('button', { class: 'seg-btn', type: 'button', role: 'tab', onclick: () => setView('message') }, icon('file', 14), 'Nachricht');
  function setView(v) {
    summaryView.hidden = v !== 'summary';
    messageView.hidden = v !== 'message';
    if (v === 'message') {
      loadAi();
      requestAnimationFrame(fitMailText);
    }
    if (eye) eye.hidden = v !== 'message';
    tabSummary.setAttribute('aria-selected', String(v === 'summary'));
    tabMessage.setAttribute('aria-selected', String(v === 'message'));
    ctx.onView?.(v);
  }
  const message = el('section', { class: 'card msg', 'aria-label': 'Inhalt' }, el('div', { class: 'seg-row' }, el('div', { class: 'seg', role: 'tablist' }, tabSummary, tabMessage), eye), summaryView, messageView);
  setView(ctx.view === 'message' ? 'message' : 'summary');

  container.replaceChildren(el('article', { class: 'detail' }, head, testBanner, doneBanner, people, attachmentsBox, message, taskRow?.node, draftPanel?.node));
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
