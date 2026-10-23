// Bausteine für die Darstellung des Mailtexts: Bilder an ihrer Stelle im Text, Platzhalter-Markierung, Textkasten mit Größenanpassung.
import { el } from '../util.js';

const IMAGE_MARK = /⟦bild:([^⟧]*)⟧/g; // Marke, die der Server für ein eingebettetes Bild in den Text setzt

// Tooltip hängt direkt an der Seite (nicht im scrollbaren Mailtext) und folgt dem Mauszeiger.
function placeTip(tip, x, y) {
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = x + 16 + w > window.innerWidth - 8 ? Math.max(8, x - w - 16) : x + 16;
  const top = y + 20 + h > window.innerHeight - 8 ? Math.max(8, y - h - 12) : y + 20;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

/** Bild mit OCR-Kennzeichnung, dessen Tooltip beim Darüberfahren (und per Tastatur-Fokus) erscheint. */
function imageWithTip(link, tipNode) {
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
  return wrap;
}

/**
 * Mailtext mit den Bildern aus der Mail an ihrer Stelle (Marken ⟦bild:<Wert>⟧).
 * resolve: Marke -> Anhang-ID; tip: Anhang-ID -> Tooltip-Knoten oder null; plain: Textstück -> Knoten (z. B. mit Platzhalter-Markierung).
 */
export function textWithImages(proposalId, text, { resolve = (v) => v, tip, plain = (t) => t } = {}) {
  const parts = [];
  let last = 0;
  // Das Bild ist ein Block: die Zeilenumbrüche um die Marke würden sonst als Leerzeilen dazukommen.
  for (const m of text.matchAll(IMAGE_MARK)) {
    parts.push(plain(text.slice(last, m.index).replace(last ? /^\n|\n$/g : /\n$/, '')));
    const id = resolve(m[1]);
    const src = `/api/proposals/${proposalId}/attachments/${encodeURIComponent(id)}`;
    const link = el('a', { class: 'mail-img', href: src, target: '_blank', rel: 'noopener', title: tip ? null : 'Bild in voller Größe öffnen' }, el('img', { src, alt: 'Bild in der Mail', loading: 'lazy' }));
    const tipNode = tip ? tip(id) : null;
    parts.push(tipNode ? imageWithTip(link, tipNode) : link);
    last = m.index + m[0].length;
  }
  parts.push(plain(last ? text.slice(last).replace(/^\n/, '') : text));
  return parts.flat().filter((x) => x !== '');
}

/** Text mit markierten Platzhaltern ([PERSON_1] ...); der Tooltip der Markierung nennt den Originalwert aus der Zuordnung. */
export function maskedNodes(text, map) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\[[A-ZÄÖÜ]+_\d+\]/g)) {
    parts.push(text.slice(last, m.index));
    parts.push(el('mark', { class: 'mask', title: `Original: ${map[m[0]] ?? '?'}` }, m[0]));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts.filter((x) => x !== '');
}

/**
 * Textkasten, der sich bis 320 px dem Inhalt anpasst und per Ziehen (unten rechts) in der Höhe veränderbar ist.
 * Gibt die Funktion zurück, die die Höhe neu berechnet (nach Inhaltswechsel oder wenn der Kasten sichtbar wird).
 */
export function autosize(box) {
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
