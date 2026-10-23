// Bausteine für die Darstellung des Mailtexts: Bilder an ihrer Stelle im Text, Platzhalter-Markierung, Textkasten mit Größenanpassung.
import { el } from '../util.js';
import { icon } from '../icons.js';

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

/** Hängt einen Tooltip an ein Element: erscheint beim Darüberfahren (folgt dem Mauszeiger) und bei Tastatur-Fokus. */
function hoverTip(wrap, tipNode) {
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

/** Bild mit OCR-Kennzeichnung, dessen Tooltip beim Darüberfahren (und per Tastatur-Fokus) erscheint. */
function imageWithTip(link, tipNode) {
  return hoverTip(el('span', { class: 'mail-img-wrap', tabindex: '0' }, link, el('span', { class: 'ocr-badge' }, 'OCR')), tipNode);
}

// Dateiname aus der Bild-ID ("image001.png@01DC…" -> "image001.png"); ohne erkennbaren Namen "Bild n"
const imageName = (id, n) => {
  const name = decodeURIComponent(String(id)).split('@')[0];
  return /^[^/\\]{1,60}\.[a-z0-9]{2,5}$/i.test(name) ? name : `Bild ${n}`;
};

/** Bild als kleine Marke mit Namen: Darüberfahren zeigt eine Vorschau, Linksklick öffnet das Bild in voller Größe. */
function imageChip(src, label) {
  const link = el('a', { class: 'img-chip', href: src, target: '_blank', rel: 'noopener', title: 'Linksklick öffnet das Bild' }, icon('paperclip', 12), el('span', {}, label));
  const pop = el('div', { class: 'img-pop', role: 'tooltip' }, el('img', { src, alt: label }), el('span', {}, label));
  return hoverTip(link, pop);
}

/**
 * Mailtext mit den Bildern aus der Mail an ihrer Stelle (Marken ⟦bild:<Wert>⟧).
 * resolve: Marke -> Anhang-ID; tip: Anhang-ID -> Tooltip-Knoten oder null; plain: Textstück -> Knoten (z. B. mit Platzhalter-Markierung).
 * chips: Bilder als kleine Marken mit Namen statt in voller Größe (Vorschau beim Darüberfahren, Klick öffnet).
 */
export function textWithImages(proposalId, text, { resolve = (v) => v, tip, plain = (t) => t, chips = false } = {}) {
  let count = 0;
  const parts = [];
  let last = 0;
  // Das Bild ist ein Block: die Zeilenumbrüche um die Marke würden sonst als Leerzeilen dazukommen.
  for (const m of text.matchAll(IMAGE_MARK)) {
    parts.push(plain(text.slice(last, m.index).replace(last ? /^\n|\n$/g : /\n$/, '')));
    const id = resolve(m[1]);
    const src = `/api/proposals/${proposalId}/attachments/${encodeURIComponent(id)}`;
    count += 1;
    if (chips) {
      parts.push(imageChip(src, imageName(id, count)));
      last = m.index + m[0].length;
      continue;
    }
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
