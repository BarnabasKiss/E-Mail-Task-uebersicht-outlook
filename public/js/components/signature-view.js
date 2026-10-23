// Signatur: Text und optional ein Bild (Logo), die bei Antworten und neuen Mails unter deinen Text gesetzt wird (der Haken „Meine Signatur anhängen“ bleibt).
// Von Hand eingestellt gilt sie vor allem anderen; ohne Einstellung nimmt die App die Signatur aus deiner letzten Nachricht im Verlauf.
// Sie liegt nur in der App, nichts davon wird in Outlook gespeichert; beim Senden hängt n8n das Bild als eingebettetes Bild an die Mail.
import { el } from '../util.js';
import { icon } from '../icons.js';

/**
 * info: { manual: string|null, detected: string, image: { name, contentType, size }|null }. handlers: { back, save(text), reset(), uploadImage(file), removeImage() }. note: Meldung.
 */
export function renderSignature(container, info, handlers, note = '') {
  const manual = typeof info.manual === 'string';
  const pick = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif', hidden: true, 'aria-label': 'Signaturbild wählen', onchange: () => pick.files[0] && handlers.uploadImage(pick.files[0]) });
  const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;
  const area = el('textarea', { class: 'sg-text', rows: 8, 'aria-label': 'Signatur', placeholder: 'z. B.\nMit freundlichen Grüßen\nBarni Kiss\nProjektmanager\nTel.: +43 …', spellcheck: 'false' });
  area.value = manual ? info.manual : info.detected;
  container.replaceChildren(
    el(
      'article',
      { class: 'detail signature' },
      el(
        'header',
        { class: 'd-head' },
        el('div', { class: 'd-title' }, el('h2', {}, 'Signatur'), el('div', { class: 'd-badges' }, el('span', { class: `badge${manual ? ' ok' : ''}` }, manual ? (info.manual ? 'Von Hand eingestellt' : 'Keine Signatur') : info.detected ? 'Automatisch erkannt' : 'Noch keine'))),
        el('div', { class: 'd-actions' }, el('button', { class: 'btn', type: 'button', onclick: handlers.back }, icon('undo', 15), el('span', {}, 'Zurück'))),
      ),
      el(
        'section',
        { class: 'card' },
        el('p', {}, 'Dieser Text wird bei Antworten und neuen Mails unter deinen Text gesetzt. Er liegt nur in der App und wird nicht in Outlook gespeichert. Beim Schreiben kannst du ihn mit dem Haken „Meine Signatur anhängen“ pro Mail weglassen.'),
        !manual && el('p', { class: 'hint' }, info.detected ? 'Gerade nutzt die App die Signatur aus deiner letzten Nachricht im Verlauf (unten). Speichern macht sie zu deiner festen Signatur.' : 'Es ist noch keine Signatur bekannt: Sie erscheint hier, sobald die App eine Nachricht von dir im Verlauf gesehen hat, oder du schreibst sie selbst.'),
        area,
        el(
          'div',
          { class: 'sg-image' },
          info.image
            ? [el('img', { class: 'sg-thumb', src: `/api/signature-image?v=${info.image.size}-${encodeURIComponent(info.image.name)}`, alt: 'Signaturbild' }), el('span', { class: 'hint' }, `${info.image.name} (${kb(info.image.size)}). Wird unter der Signatur eingebettet.`)]
            : el('span', { class: 'hint' }, 'Kein Bild. Ein Logo (PNG, JPEG oder GIF) wird unter dem Text der Signatur eingebettet.'),
          el('button', { class: 'btn small', type: 'button', onclick: () => pick.click() }, icon('paperclip', 14), el('span', {}, info.image ? 'Bild ersetzen' : 'Bild wählen')),
          info.image && el('button', { class: 'btn small ghost', type: 'button', onclick: handlers.removeImage }, icon('trash', 14), el('span', {}, 'Bild entfernen')),
          pick,
        ),
        note && el('p', { class: 'hint ct-note', role: 'status' }, note),
        el(
          'div',
          { class: 'rl-add' },
          el('button', { class: 'btn primary', type: 'button', onclick: () => handlers.save(area.value) }, icon('check', 15), el('span', {}, 'Speichern')),
          el('button', { class: 'btn', type: 'button', title: 'Mails ganz ohne Signatur senden', onclick: () => handlers.save('') }, el('span', {}, 'Keine Signatur')),
          manual && el('button', { class: 'btn ghost', type: 'button', title: 'Wieder die Signatur aus deiner letzten Nachricht nehmen', onclick: handlers.reset }, icon('refresh', 15), el('span', {}, 'Automatisch erkennen')),
        ),
      ),
    ),
  );
}
