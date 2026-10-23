// Was verlangt Aufmerksamkeit? Reine Logik (ohne DOM) für Tab-Symbol, Titel und Systembenachrichtigungen.
//  offen   = alles im Tab "Offen" ohne die Gruppe Egal (nicht Später, Done)
//  wichtig = offen und (Jetzt, Überfällig oder mit dem Tag "Wichtig")
import { isOverdue } from './components/list.js';

const isOpen = (m) => !m.archiviert && !m.snoozed_until && m.dringlichkeit !== 'egal';
const isImportant = (m, now = new Date()) => isOpen(m) && (m.dringlichkeit === 'jetzt' || isOverdue(m, now) || m.wichtig?.length > 0);

export function attentionOf(items, now = new Date()) {
  const open = items.filter(isOpen);
  const important = open.filter((m) => isImportant(m, now));
  return { open: open.length, important: important.length, importantItems: important };
}

const BASE_TITLE = 'Mail-Übersicht';
export function titleFor({ open, important }) {
  if (important) return `(${important} wichtig) ${BASE_TITLE}`;
  return open ? `(${open}) ${BASE_TITLE}` : BASE_TITLE;
}

const COLORS = { open: '#2563eb', important: '#f2480b' };

/**
 * Tab-Symbol als SVG: der Brief wie im ursprünglichen Symbol (index.html), bei Bedarf mit einem farbigen Punkt unten rechts.
 * Der Punkt hat keinen Rand und keine Zahl (bei 16 Pixeln nicht lesbar), die Zahl steht im Titel. big = größerer Punkt für den Puls.
 * level: null | 'open' | 'important'.
 */
export function faviconSvg({ level, big = false }) {
  const letter = '<g fill="none" stroke="#4f46e5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></g>';
  const dot = level ? `<circle cx="18.5" cy="18" r="${big ? 6.5 : 5.5}" fill="${COLORS[level]}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${letter}${dot}</svg>`;
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
