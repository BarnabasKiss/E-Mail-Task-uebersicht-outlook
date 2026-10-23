import { el } from '../util.js';
import { icon } from '../icons.js';
import { hoverTip } from './mail-text.js';

const formatSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const TEXTLIKE = /\.(txt|csv|tsv|md|json|xml|log|ics|html?|docx|xlsx|pptx)$/i;
const PREVIEW_CHARS = 900;

/**
 * Vorschau beim Darüberfahren: Bilder als Bild, PDFs als erste Seite (der Server rendert sie), Text und Office-Dateien als Textanfang (wird erst beim
 * ersten Darüberfahren geladen). Andere Typen haben keine Vorschau. @returns {{ pop, onOpen }|null}
 */
export function previewFor(a, href) {
  const type = String(a.contentType || '').toLowerCase();
  const name = a.name || '';
  const pop = (...kids) => el('div', { class: 'img-pop att-pop', role: 'tooltip' }, ...kids, el('span', {}, name));
  if (IMAGE.test(name) || type.startsWith('image/') && !type.includes('svg')) return { pop: pop(el('img', { src: href, alt: name })) };
  if (/\.pdf$/i.test(name) || type === 'application/pdf') {
    const img = el('img', { alt: name });
    const note = el('em', { class: 'att-nopreview', hidden: true }, 'Keine Vorschau möglich');
    img.addEventListener('error', () => {
      img.hidden = true;
      note.hidden = false;
    });
    return { pop: pop(img, note), onOpen: () => !img.getAttribute('src') && img.setAttribute('src', `${href}?preview=1`) };
  }
  if (TEXTLIKE.test(name)) {
    const pre = el('pre', { class: 'att-text' }, 'Wird geladen …');
    let loaded = false;
    return {
      pop: pop(pre),
      onOpen: () => {
        if (loaded) return;
        loaded = true;
        fetch(href)
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error())))
          .then((t) => (pre.textContent = t.trim().slice(0, PREVIEW_CHARS) + (t.trim().length > PREVIEW_CHARS ? ' …' : '') || '(leer)'))
          .catch(() => (pre.textContent = 'Keine Vorschau möglich'));
      },
    };
  }
  return null;
}

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
    const view = previewFor(a, href);
    const link = el('a', { class: 'att', href, target: '_blank', rel: 'noopener', title: view ? undefined : `${a.name}\nIm Browser öffnen\n${hint}` }, body);
    if (view) hoverTip(link, view.pop, { onOpen: view.onOpen }); // der Tooltip ersetzt den Browser-Tooltip; Hinweis zur KI steht am Sparkle-Symbol
    return el(
      'span',
      { class: 'att-wrap' },
      link,
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
