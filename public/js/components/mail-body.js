import { el } from '../util.js';
import { icon } from '../icons.js';
import { textWithImages, maskedNodes, autosize } from './mail-text.js';
import { createThread } from './thread.js';

/**
 * Die Ansicht "Verlauf": die Nachrichten der Konversation (thread.js) und ein Auge zum Umschalten. Ohne Verlauf (handlers.thread fehlt,
 * Vorschau statt Outlook) der Mailtext allein.
 *  Original     = der Verlauf, die geöffnete Mail mit ihren Bildern an ihrer Stelle.
 *  Anonymisiert = genau das, was Claude bekäme: maskierter Mailtext mit markierten Platzhaltern, Zuordnung als zugeklapptes Dropdown,
 *                 Bilder mit Tooltip auf den maskierten Bildtext, Text aus Anhängen und das Ergebnis der Prüfung.
 * Der Text aus Bildern und Anhängen kommt nachgeladen (handlers.aiView, die OCR kann dauern), die Mail erscheint sofort.
 *
 * @returns {{ node: HTMLElement, eye: HTMLElement|null, show(): void, preload(): Promise, ownSignature(): string }}
 *   node = die Ansicht, eye = Umschalter (null, wenn nichts zu anonymisieren ist), show() = beim Einblenden aufrufen
 */
export function createMailBody({ proposalId, mail, mailError, handlers, ownAddress = '' }) {
  const thread = handlers.thread && ['outlook', 'test'].includes(mail.source) ? createThread({ proposalId, ownAddress, loadPage: handlers.thread, scrollEl: () => node }) : null;
  let ai = null; // Antwort von /ai-view, sobald da
  let showMasked = false;
  let aiRequested = false;

  const sendable = () => (ai && ai.text != null ? ai : mail.masked); // { text, map }
  const original = () => (mail.imageText ? textWithImages(proposalId, mail.imageText) : mail.text || '(kein Text)');

  // Anonymisiert: die Bilder bleiben an ihrer Stelle, der Tooltip zeigt den maskierten Text, den Claude daraus bekommt.
  const maskedView = (src) => {
    if (!(ai && ai.text != null && ai.imageIds?.length)) return maskedNodes(src.text, src.map);
    const tip = (id) => {
      const it = ai.items.find((x) => x.attId === id);
      return el(
        'span',
        { class: 'ai-tip', role: 'tooltip' },
        el('span', { class: 'ai-tip-title' }, it ? 'So bekommt Claude den Text aus diesem Bild' : 'Aus diesem Bild geht nichts an Claude'),
        it ? el('span', { class: 'ai-tip-text' }, ...maskedNodes(it.masked, ai.map)) : el('span', { class: 'ai-tip-text' }, 'Kein Text erkannt oder das Bild ist zu klein. Claude sieht nie das Bild selbst.'),
      );
    };
    return textWithImages(proposalId, src.text, { resolve: (n) => ai.imageIds[Number(n) - 1], tip, plain: (t) => maskedNodes(t, src.map) });
  };

  const mailText = el('pre', { class: 'mailtext', hidden: !!thread }, original());
  const fitMailText = autosize(mailText);
  const legend = el('details', { class: 'mask-legend', hidden: true }); // Dropdown, standardmäßig zu
  const aiBox = el('section', { class: 'ai-items', 'aria-label': 'Anhänge und Prüfung', hidden: true });
  const eye = mail.masked && mail.text ? el('button', { class: 'eye-btn', type: 'button', 'aria-pressed': 'false', onclick: () => setMasked(!showMasked) }) : null;

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
    const itemNode = (it) => {
      const box = el('pre', { class: 'mailtext' }, ...maskedNodes(it.masked, map));
      fits.push(autosize(box));
      return el('div', { class: 'ai-item' }, el('div', { class: 'ai-name' }, it.maskedName), box);
    };
    aiBox.replaceChildren(
      ...[
        ai.error && el('p', { class: 'hint' }, ai.error),
        items.length && el('div', { class: 'ai-title' }, icon('sparkle', 13), el('span', {}, 'Text aus Anhängen, so bekommt ihn Claude')),
        ...items.map(itemNode),
        check,
      ].filter(Boolean),
    );
    requestAnimationFrame(() => fits.forEach((f) => f()));
  }

  function setMasked(on) {
    showMasked = on;
    const src = sendable();
    const entries = Object.entries(src.map);
    if (thread) {
      thread.node.hidden = on;
      mailText.hidden = !on;
    }
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
    eye.title = on
      ? 'Zeigt, was an Claude geht: anonymisierter Mailtext samt Text aus Bildern und Anhängen. Klicken für das Original.'
      : 'Original mit dem Text, den die OCR aus den Bildern liest. Klicken, um zu sehen, was anonymisiert wird.';
    eye.replaceChildren(icon(on ? 'eyeOff' : 'eye', 16), el('span', {}, on ? 'Anonymisiert' : 'Original'));
    renderAiBox();
    requestAnimationFrame(fitMailText);
  }
  if (eye) setMasked(false);

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

  const node = el(
    'div',
    { class: 'msg-full', hidden: true },
    mailError && el('div', { class: 'inline-error' }, icon('alert', 16), el('span', {}, `${mailError} Angezeigt wird die Vorschau.`), el('button', { class: 'link', type: 'button', onclick: handlers.reload }, 'Erneut laden')),
    mail.source === 'vorschau' && !mailError ? el('p', { class: 'hint' }, 'Nur Vorschau verfügbar.') : null,
    thread?.node,
    mailText,
    legend,
    aiBox,
  );

  return {
    node,
    eye,
    show() {
      thread?.load().then(() => thread.toEnd());
      loadAi();
      requestAnimationFrame(fitMailText);
    },
    preload: () => thread?.load() ?? Promise.resolve(),
    ownSignature: () => thread?.ownSignature() ?? '',
  };
}
