// Zustand in der Adresszeile (#mail=ID&view=message&q=suche&f_von=...): Neuladen und Lesezeichen behalten Mail, Ansicht und Suche.
import { filtersFromParams, filtersToParams } from './search.js';

export function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return {
    mail: p.get('mail'),
    kontakt: p.get('kontakt'),
    view: p.get('view') === 'message' ? 'message' : 'summary',
    tab: p.get('tab'),
    q: p.get('q') || '',
    filters: filtersFromParams(p),
    lightTheme: p.get('theme') === 'light',
  };
}

export function writeHash({ selectedId, view, query, filters, profile }) {
  const p = new URLSearchParams();
  if (selectedId) p.set('mail', selectedId);
  if (profile) p.set('kontakt', profile);
  if (view === 'message') p.set('view', 'message');
  if (query.trim()) p.set('q', query.trim());
  filtersToParams(filters, p);
  history.replaceState(null, '', p.toString() ? `#${p}` : location.pathname);
}
