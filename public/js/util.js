// Kleine Helfer. Inhalte werden immer als Text eingefügt (nie als HTML), damit Mailtexte nichts ausführen können.
import { icon } from './icons.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    // aria-* braucht den Text "true"/"false", nicht ein leeres Attribut.
    if (k.startsWith('aria-') && typeof v === 'boolean') {
      node.setAttribute(k, String(v));
      continue;
    }
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const two = (n) => String(n).padStart(2, '0');

/** Kurz für die Liste: heute "10:42", gestern "Gestern", sonst "20.10." */
export function formatShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return `${two(d.getHours())}:${two(d.getMinutes())}`;
  if (d.toDateString() === yesterday.toDateString()) return 'Gestern';
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.`;
}

/** Vollständig für die Detailansicht: "Di, 20.10.2026, 10:42" */
export function formatFull(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]}, ${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function formatDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.` : '';
}

export const URGENCY_LABEL = { jetzt: 'Jetzt', heute: 'Heute', woche: 'Diese Woche', egal: 'Egal' };
/** Wie eine Mail nach Done kam. */
export const FILED_LABEL = { done: 'Erledigt', angenommen: 'Aufgabe übernommen', beantwortet: 'Beantwortet' };

function initials(name, fallback = '?') {
  const parts = String(name || '').replace(/[<>()]/g, ' ').split(/[\s@.]+/).filter(Boolean);
  if (!parts.length) return fallback;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function avatar(name, address, size = 32) {
  const key = String(address || name || '');
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return el('span', { class: 'avatar', style: `--h:${h};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`, 'aria-hidden': 'true' }, initials(name || address));
}

let toastTimer;
/** Meldung unten mittig. action = { label, onClick } für z. B. "Rückgängig". */
export function toast(message, { error = false, action } = {}) {
  const t = document.getElementById('toast');
  t.className = `toast${error ? ' error' : ''}`;
  t.replaceChildren(el('span', {}, message));
  if (action) {
    t.append(
      el('button', { type: 'button', class: 'toast-action', onclick: () => { t.hidden = true; action.onClick(); } }, action.icon === null ? null : icon(action.icon || 'undo', 14), action.label),
    );
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), error ? 8000 : action ? 9000 : 3500);
}

/** Wie die Mail bei dir ankam: Direkt (du stehst in An), CC oder Shared (Shared Inbox, Verteiler, Bcc). */
const ROLE = {
  direkt: ['Direkt', 'Direkt an dich gerichtet (du stehst in An).'],
  cc: ['CC', 'Du bist nur im CC.'],
  shared: ['Shared', 'Nicht persönlich an dich adressiert: Shared Inbox, Verteiler oder Bcc.'],
};
export function roleChip(rolle) {
  const r = ROLE[rolle];
  return r ? el('span', { class: `role role-${rolle}`, title: r[1] }, r[0]) : null;
}

/** Kleine Marke (Pille) mit optionalem Symbol. cls z. B. 'ok', 'frist', 'u-jetzt'. */
export function badge(text, cls = '', iconName) {
  return el('span', { class: `badge ${cls}` }, iconName && icon(iconName, 12), text);
}
