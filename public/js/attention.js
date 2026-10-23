// Was verlangt Aufmerksamkeit? Reine Logik (ohne DOM) für Tab-Symbol, Titel und Systembenachrichtigungen.
//  offen   = alles im Tab "Offen" (nicht Egal, Später, Done)
//  wichtig = offen und (Jetzt, Überfällig oder mit dem Tag "Wichtig")
import { isOverdue } from './components/list.js';

const isOpen = (m) => !m.archiviert && !m.snoozed_until && m.dringlichkeit !== 'egal';
export const isImportant = (m, now = new Date()) => isOpen(m) && (m.dringlichkeit === 'jetzt' || isOverdue(m, now) || m.wichtig?.length > 0);

export function attentionOf(items, now = new Date()) {
  const open = items.filter(isOpen);
  const important = open.filter((m) => isImportant(m, now));
  return { open: open.length, important: important.length, importantItems: important };
}

export const BASE_TITLE = 'Mail-Übersicht';
export function titleFor({ open, important }) {
  if (important) return `(${important} wichtig) ${BASE_TITLE}`;
  return open ? `(${open}) ${BASE_TITLE}` : BASE_TITLE;
}

export const COLORS = { open: '#2563eb', important: '#f2480b' };

/** Tab-Symbol als SVG (Brief mit Punkt und Zahl). big = größerer Punkt für den Puls. level: null | 'open' | 'important'. */
export function faviconSvg({ level, count = 0, big = false }) {
  const letter = '<g fill="none" stroke="#4f46e5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="22" height="16" rx="3"/><path d="m2 8 11 7.5L24 8"/></g>';
  if (!level) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${letter}</svg>`;
  const text = count > 9 ? '9+' : String(count);
  const r = big ? 12.5 : 10.5;
  const badge = `<circle cx="22.5" cy="22.5" r="${r}" fill="${COLORS[level]}" stroke="#fff" stroke-width="1.6"/><text x="22.5" y="${text.length > 1 ? 26.5 : 27}" font-family="Arial,Helvetica,sans-serif" font-size="${text.length > 1 ? 11 : 14}" font-weight="700" fill="#fff" text-anchor="middle">${text}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${letter}${badge}</svg>`;
}
export const svgUrl = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/**
 * Neu hinzugekommene wichtige Mails gegenüber den schon gesehenen IDs. Ohne bisherige Liste (erster Start) gilt der aktuelle Stand
 * als bekannt, damit nicht beim ersten Mal alles auf einmal meldet.
 */
export function freshImportant(seenIds, importantItems) {
  const ids = importantItems.map((m) => String(m.id));
  if (seenIds == null) return { fresh: [], ids };
  const seen = new Set(seenIds);
  return { fresh: importantItems.filter((m) => !seen.has(String(m.id))), ids };
}

/** Kurzer Grund für die Benachrichtigung. */
export function whyImportant(m, now = new Date()) {
  if (m.wichtig?.length) return m.wichtig.slice(0, 2).join(', ');
  if (m.dringlichkeit === 'jetzt') return 'Jetzt';
  return isOverdue(m, now) ? 'Überfällig' : 'Wichtig';
}
