import { el } from '../util.js';
import { icon } from '../icons.js';

const formatSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Leiste mit den Anhängen einer Mail (Chips mit Öffnen und Herunterladen). Die Anhänge werden nachgeladen (eigener Aufruf an
 * Outlook), die Ansicht wartet nicht darauf; ohne Anhänge bleibt die Leiste unsichtbar.
 * load() liefert { items, readByAi, canPreview }.
 */
export function createAttachmentsBox(proposalId, load) {
  const box = el('section', { class: 'attachments', 'aria-label': 'Anhänge', hidden: true });
  const base = `/api/proposals/${proposalId}/attachments`;

  const chip = (a, readByAi) => {
    const href = `${base}/${encodeURIComponent(a.id)}`;
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
  };

  load()
    .then(({ items, readByAi, canPreview }) => {
      if (!items.length) return;
      const preview = canPreview && el('a', { class: 'link att-preview', href: `${base}/review-preview`, target: '_blank', rel: 'noopener', title: 'Zeigt den anonymisierten Text, der an Claude gehen würde (wird dabei nicht gesendet).' }, 'Was geht an Claude?');
      box.replaceChildren(icon('paperclip', 14), el('div', { class: 'att-list' }, items.map((a) => chip(a, readByAi)), preview));
      box.hidden = false;
    })
    .catch(() => {}); // Anhänge sind eine Zugabe: ein Fehler stört die Mail nicht
  return box;
}
