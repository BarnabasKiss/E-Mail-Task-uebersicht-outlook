// Erweiterte Suche: reine Logik ohne DOM (Filter, Textsuche mit Bereichen, URL-Zustand), damit sie sich testen lässt.
// Die Oberfläche steht in components/search-panel.js, die Dokumentsuche (Treffer in Anhängen) kommt vom Server.

/** Dateiformat aus dem Namen ("Rechnung.pdf" -> "PDF"), sonst "Datei". */
export const formatOf = (name) => (/\.([A-Za-z0-9]{1,5})$/.exec(String(name || ''))?.[1] || 'Datei').toUpperCase();

export const ROLLEN = [
  ['direkt', 'Direkt'],
  ['cc', 'CC'],
  ['shared', 'Shared'],
];
// Bereiche, in denen gesucht wird (alle an = Standard)
export const SCOPES = [
  ['meta', 'Absender & Betreff'],
  ['text', 'Mailtext'],
  ['bewertung', 'Bewertung'],
  ['content', 'Dokumentinhalt'],
  ['names', 'Dokumentnamen'],
];

export const defaultFilters = () => ({
  scope: { meta: true, text: true, bewertung: true, content: true, names: true },
  from: '',
  to: '',
  toMode: 'beide', // an | cc | beide
  after: '',
  before: '',
  anhang: false,
  format: '',
  aufgabe: false,
  wichtig: false,
  rollen: [],
});

const terms = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
const two = (n) => String(n).padStart(2, '0');
/** Lokaler Tag "YYYY-MM-DD" eines ISO-Zeitpunkts, '' bei ungültig. */
export function localDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

// Dokumentinhalt, Dokumentnamen und Mailtext durchsucht der Server (der volle Text liegt nicht in der Liste)
export const docScopeOn = (f) => f.scope.content || f.scope.names || f.scope.text;
export const scopesAllOn = (f) => SCOPES.every(([k]) => f.scope[k]);

/** Erfüllt die Mail alle gesetzten Filter? (Der Suchtext ist getrennt: matchesText.) */
export function matchesFilters(m, f) {
  if (f.from) {
    const hay = `${m.absender || ''} ${m.absender_mail || ''}`.toLowerCase();
    if (!terms(f.from).every((t) => hay.includes(t))) return false;
  }
  if (f.to) {
    // An/Cc: nur bekannt, wenn die Mail schon gelesen wurde (Hintergrundjob); sonst kein Treffer
    const r = m.empfaenger;
    if (!r) return false;
    const pool = f.toMode === 'an' ? r.an : f.toMode === 'cc' ? r.cc : [...r.an, ...r.cc];
    const hay = pool.join(' | ').toLowerCase();
    if (!terms(f.to).every((t) => hay.includes(t))) return false;
  }
  if (f.after || f.before) {
    const d = localDay(m.received_at);
    if (!d || (f.after && d < f.after) || (f.before && d > f.before)) return false;
  }
  if (f.anhang || f.format) {
    const names = m.anhaenge || [];
    if (!names.length) return false;
    if (f.format && !names.some((n) => formatOf(n) === f.format)) return false;
  }
  if (f.aufgabe && !(m.aufgabe_text || m.aufgabe_uebernommen)) return false;
  if (f.wichtig && !m.wichtig?.length) return false;
  if (f.rollen.length && !f.rollen.includes(m.rolle)) return false;
  return true;
}

/**
 * Suchtext gegen die Felder der Liste (nur die eingeschalteten Bereiche). Alle Wörter müssen vorkommen.
 * docHit: der Server hat in einem Dokument gefunden (Dokumentinhalt und Dokumentnamen hängen am Server).
 */
export function matchesText(m, query, scope, docHit = false) {
  const t = terms(query);
  if (!t.length || docHit) return true;
  const fields = [];
  if (scope.meta) fields.push(m.absender, m.absender_mail, m.betreff, m.is_test ? 'test' : '', m.archiviert ? 'done' : '');
  if (scope.bewertung) fields.push(m.zusammenfassung, m.aufgabe_text, m.kategorie, m.begruendung);
  const hay = fields.filter(Boolean).join('\n').toLowerCase();
  return t.every((x) => hay.includes(x));
}

const SIMPLE = ['from', 'to', 'after', 'before', 'format'];
const FLAGS = ['anhang', 'aufgabe', 'wichtig'];

/** Gibt es etwas Besonderes (Filter oder eingeschränkte Bereiche)? Für Zähler am Filter-Knopf und das Suchen ohne Text. */
export function filterCount(f) {
  // "Mit Anhang" gehört zum Format-Filter, wenn eines gewählt ist: ein Filter, nicht zwei
  return SIMPLE.filter((k) => f[k]).length + FLAGS.filter((k) => f[k] && !(k === 'anhang' && f.format)).length + (f.rollen.length ? 1 : 0) + (scopesAllOn(f) ? 0 : 1);
}
export const filtersActive = (f) => filterCount(f) > 0;
/** Filter ohne die Bereiche: nur sie erlauben eine Suche ohne Suchtext. */
export const hasRealFilter = (f) => filterCount({ ...f, scope: defaultFilters().scope }) > 0;

const fmtDay = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.` : '');

/** Chips für aktive Filter: [{ key, label }]; key sagt dem Panel, was zurückzusetzen ist. */
export function filterChips(f) {
  const chips = [];
  if (!scopesAllOn(f)) chips.push({ key: 'scope', label: `Nur in: ${SCOPES.filter(([k]) => f.scope[k]).map(([, l]) => l).join(', ') || 'nichts'}` });
  if (f.from) chips.push({ key: 'from', label: `Von: ${f.from}` });
  if (f.to) chips.push({ key: 'to', label: `${f.toMode === 'an' ? 'An' : f.toMode === 'cc' ? 'CC' : 'An/CC'}: ${f.to}` });
  if (f.after || f.before) chips.push({ key: 'zeit', label: f.after && f.before ? `${fmtDay(f.after)} – ${fmtDay(f.before)}` : f.after ? `ab ${fmtDay(f.after)}` : `bis ${fmtDay(f.before)}` });
  if (f.anhang && !f.format) chips.push({ key: 'anhang', label: 'Mit Anhang' });
  if (f.format) chips.push({ key: 'format', label: `Format: ${f.format}` });
  if (f.aufgabe) chips.push({ key: 'aufgabe', label: 'Mit Aufgabe' });
  if (f.wichtig) chips.push({ key: 'wichtig', label: 'Wichtig' });
  if (f.rollen.length) chips.push({ key: 'rollen', label: `Eingang: ${ROLLEN.filter(([k]) => f.rollen.includes(k)).map(([, l]) => l).join(', ')}` });
  return chips;
}

/** Einen Chip entfernen (gibt neue Filter zurück). */
export function clearChip(f, key) {
  const d = defaultFilters();
  const next = { ...f, scope: { ...f.scope }, rollen: [...f.rollen] };
  if (key === 'scope') next.scope = d.scope;
  else if (key === 'zeit') (next.after = ''), (next.before = '');
  else if (key === 'anhang') next.anhang = false;
  else if (key === 'format') (next.format = ''), (next.anhang = false);
  else if (key === 'rollen') next.rollen = [];
  else if (key === 'to') (next.to = ''), (next.toMode = 'beide');
  else if (key in d) next[key] = d[key];
  return next;
}

/** URL-Zustand: nur gesetzte Werte, kurze Namen (f_von, f_ab, ...). */
export function filtersToParams(f, params) {
  for (const k of ['f_von', 'f_an', 'f_am', 'f_ab', 'f_bis', 'f_fmt', 'f_anh', 'f_auf', 'f_wi', 'f_ein', 'f_in']) params.delete(k);
  if (f.from) params.set('f_von', f.from);
  if (f.to) params.set('f_an', f.to);
  if (f.to && f.toMode !== 'beide') params.set('f_am', f.toMode);
  if (f.after) params.set('f_ab', f.after);
  if (f.before) params.set('f_bis', f.before);
  if (f.format) params.set('f_fmt', f.format);
  if (f.anhang && !f.format) params.set('f_anh', '1');
  if (f.aufgabe) params.set('f_auf', '1');
  if (f.wichtig) params.set('f_wi', '1');
  if (f.rollen.length) params.set('f_ein', f.rollen.join(','));
  if (!scopesAllOn(f)) params.set('f_in', SCOPES.filter(([k]) => f.scope[k]).map(([k]) => k).join(',') || '-');
}

export function filtersFromParams(params) {
  const f = defaultFilters();
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  f.from = params.get('f_von') || '';
  f.to = params.get('f_an') || '';
  f.toMode = ['an', 'cc'].includes(params.get('f_am')) ? params.get('f_am') : 'beide';
  f.after = date(params.get('f_ab'));
  f.before = date(params.get('f_bis'));
  f.format = (params.get('f_fmt') || '').toUpperCase().slice(0, 6);
  f.anhang = params.get('f_anh') === '1' || !!f.format;
  f.aufgabe = params.get('f_auf') === '1';
  f.wichtig = params.get('f_wi') === '1';
  f.rollen = (params.get('f_ein') || '').split(',').filter((r) => ROLLEN.some(([k]) => k === r));
  const scope = params.get('f_in');
  if (scope) for (const [k] of SCOPES) f.scope[k] = scope.split(',').includes(k);
  return f;
}
