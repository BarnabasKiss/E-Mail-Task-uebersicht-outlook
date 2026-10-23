// Suche und Filter der Oberfläche: Suchfeld, Filter-Panel, Dokumentsuche am Server und das Filtern der Liste.
// Zustand (Text, Filter, Treffer) liegt hier; sobald sich etwas ändert, ruft das Modul onChange() auf, die Oberfläche zeichnet neu.
import { api } from './api.js';
import { createSearchPanel } from './components/search-panel.js';
import { defaultFilters, matchesFilters, matchesText, docScopeOn, hasRealFilter, formatOf } from './search.js';

const DEBOUNCE_MS = 250;

/** els: { input, clear, panel, chips, toggle }. */
export function createSearch({ els, onChange }) {
  let query = '';
  let filters = defaultFilters();
  let docHits = {}; // mail_id -> Fundstellen aus Dokumenten und Mailtext (vom Server)
  let docCoverage = null; // { indexed, total }: wie viele Mails der Index schon gelesen hat
  let timer = null;

  // Treffer in Dokumenten und im Mailtext kommen vom Server (der volle Text liegt nicht in der Liste); kurz gewartet,
  // damit nicht jeder Tastendruck abgefragt wird. Fehler stören die normale Suche nicht.
  function fetchDocs() {
    clearTimeout(timer);
    const q = query.trim();
    if (q.length < 2 || !docScopeOn(filters)) {
      docHits = {};
      docCoverage = null;
      return;
    }
    timer = setTimeout(async () => {
      try {
        const r = await api.search(q, { content: filters.scope.content, names: filters.scope.names, text: filters.scope.text });
        if (q !== query.trim()) return; // inzwischen anders gesucht
        docHits = r.hits || {};
        docCoverage = { indexed: r.indexed, total: r.total };
        onChange();
      } catch {
        // Zugabe: die normale Suche funktioniert weiter
      }
    }, DEBOUNCE_MS);
  }

  const panel = createSearchPanel({
    panel: els.panel,
    chipsBox: els.chips,
    button: els.toggle,
    onChange: (f) => {
      filters = f;
      fetchDocs();
      onChange();
    },
  });

  function setQuery(text) {
    query = text;
    els.input.value = text;
    els.clear.hidden = !text;
    fetchDocs();
  }

  els.input.addEventListener('input', () => {
    query = els.input.value;
    els.clear.hidden = !query;
    fetchDocs();
    onChange();
  });
  els.clear.addEventListener('click', () => {
    setQuery('');
    onChange();
    els.input.focus();
  });

  return {
    get query() {
      return query;
    },
    get filters() {
      return filters;
    },
    get docCoverage() {
      return docCoverage;
    },
    /** Gesucht wird mit Suchtext oder mit einem Filter (nur eingeschränkte Bereiche ohne Text sind noch keine Suche). */
    searching: () => query.trim().length > 0 || hasRealFilter(filters),
    /** Treffer unter allen Mails; Mails mit Fundstellen in Dokumenten bekommen doc_treffer. */
    results: (all) =>
      all
        .filter((m) => matchesFilters(m, filters) && matchesText(m, query, filters.scope, !!docHits[m.mail_id]))
        .map((m) => (docHits[m.mail_id] ? { ...m, doc_treffer: docHits[m.mail_id] } : m)),
    /** Suchtext und Filter zurücksetzen. Ruft onChange nicht auf (der Aufrufer zeichnet ohnehin neu). */
    reset() {
      setQuery('');
      filters = defaultFilters();
      panel.set(filters, { silent: true });
    },
    /** Zustand aus der Adresszeile übernehmen (beim Start). */
    restore({ q, filters: f }) {
      filters = f;
      panel.set(f, { silent: true, open: hasRealFilter(f) });
      if (q) setQuery(q);
    },
    /** Auswahl im Filter-Panel: Formate der vorhandenen Anhänge und bekannte Absender. */
    setChoices(all) {
      panel.setChoices({
        formats: [...new Set(all.flatMap((m) => (m.anhaenge || []).map(formatOf)))].sort(),
        names: [...new Set(all.map((m) => m.absender).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')),
      });
    },
  };
}
