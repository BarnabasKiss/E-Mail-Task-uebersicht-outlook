import { api } from './api.js';
import { el, formatShort, toast } from './util.js';
import { icon } from './icons.js';
import { TABS, renderTabs, renderList } from './components/list.js';
import { createSearchPanel } from './components/search-panel.js';
import { attentionOf, freshImportant } from './attention.js';
import { createTabSignal } from './tab-signal.js';
import { notifySupported, notifyFresh, notifyTest, seenIds, rememberSeen } from './notifier.js';
import { defaultFilters, matchesFilters, matchesText, docScopeOn, hasRealFilter, filtersToParams, filtersFromParams, formatOf } from './search.js';
import { renderDetail, renderLoading, renderEmpty } from './components/detail.js';

const $ = (id) => document.getElementById(id);
const state = { filters: defaultFilters(), docHits: {}, docCoverage: null, items: [], archive: [], ownAddress: '', tab: 'offen', query: '', selectedId: null, view: 'summary', controller: null, draftTimer: null };

const DELETE_TEXT =
  'Konversation endgültig löschen?\n\nSie wird aus der Mail-Übersicht entfernt und ist auch in Done nicht mehr zu finden. Das lässt sich nicht rückgängig machen.\nIn Outlook bleibt die Mail unverändert.';

// --- Deep-Link: #mail=ID&view=message&tab=done&q=suche
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { mail: p.get('mail'), view: p.get('view') === 'message' ? 'message' : 'summary', tab: p.get('tab'), q: p.get('q') || '', filters: filtersFromParams(p) };
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.selectedId) p.set('mail', state.selectedId);
  if (state.view === 'message') p.set('view', 'message');
  if (state.query.trim()) p.set('q', state.query.trim());
  filtersToParams(state.filters, p);
  history.replaceState(null, '', p.toString() ? `#${p}` : location.pathname);
}

// --- Liste
const everything = () => [...state.items, ...state.archive];
// Gesucht wird mit Suchtext oder mit einem Filter (nur eingeschränkte Bereiche ohne Text sind noch keine Suche)
const searching = () => state.query.trim().length > 0 || hasRealFilter(state.filters);
const findItem = (id) => everything().find((m) => String(m.id) === String(id));
function visibleItems() {
  if (searching()) {
    return everything()
      .filter((m) => matchesFilters(m, state.filters) && matchesText(m, state.query, state.filters.scope, !!state.docHits[m.mail_id]))
      .map((m) => (state.docHits[m.mail_id] ? { ...m, doc_treffer: state.docHits[m.mail_id] } : m));
  }
  return everything().filter(TABS.find((t) => t.id === state.tab).test);
}
const tabOf = (m) => TABS.find((t) => t.test(m))?.id || 'offen';

function renderLeft() {
  renderTabs($('tabs'), everything(), state.tab, searching(), (tab) => {
    state.tab = tab;
    $('search').value = '';
    state.query = '';
    $('search-clear').hidden = true;
    searchPanel.set(defaultFilters()); // setzt auch die Filter zurück und zeichnet neu
  });
  renderList($('list'), {
    items: visibleItems(),
    selectedId: state.selectedId,
    query: state.query,
    searching: searching(),
    docCoverage: state.docCoverage,
    tab: state.tab,
    actions: { select, archive: quickArchive, remove: quickRemove, restore: quickRestore },
  });
}

async function loadList(fn = api.proposals) {
  const data = await fn();
  state.items = data.items;
  state.archive = data.archive || [];
  state.ownAddress = data.ownAddress;
  updateSearchChoices();
  signalAttention();
  if (state.selectedId && !findItem(state.selectedId)) clearDetail();
  renderLeft();
}

function clearDetail() {
  state.selectedId = null;
  state.controller = null;
  clearInterval(state.draftTimer);
  renderEmpty($('detail'));
  writeHash();
}

/** Springt zu einer Mail: passender Reiter, Suche leeren, Detail öffnen. */
function showItem(id) {
  const m = findItem(id);
  if (!m) return;
  state.tab = tabOf(m);
  state.query = '';
  $('search').value = '';
  $('search-clear').hidden = true;
  select(id);
}

// --- Aktionen
/**
 * Führt eine Aktion aus, lädt die Listen neu und wählt – wenn die gewählte Mail betroffen war – die nächste.
 * opts: { message (Text oder Funktion), toastAction, confirmText }
 */
async function perform(action, payload, { message, toastAction, confirmText } = {}) {
  if (confirmText && !confirm(confirmText)) return false;
  const wasSelected = String(state.selectedId) === String(payload.id);
  const before = visibleItems();
  const idx = before.findIndex((m) => String(m.id) === String(payload.id));
  try {
    const result = await api.action(action, payload);
    toast(typeof message === 'function' ? message(result) : message, { action: toastAction });
    await loadList();
    if (wasSelected) {
      const after = visibleItems();
      const next = after[Math.min(Math.max(idx, 0), after.length - 1)];
      if (next) select(next.id);
      else clearDetail();
    }
    return true;
  } catch (e) {
    toast(e.message, { error: true });
    return false;
  }
}

const undoArchive = (id) =>
  api
    .action('restore', { id })
    .then(() => loadList())
    .then(() => showItem(id))
    .then(() => toast('Wiederhergestellt'))
    .catch((e) => toast(e.message, { error: true }));

const archive = (id, ignoreSender = false) =>
  perform(
    'archive',
    { id, ignoreSender },
    {
      message: ignoreSender ? 'In Done abgelegt. Der Absender wird künftig ignoriert (Regel in Mail-Regeln.md).' : 'In Done abgelegt',
      toastAction: ignoreSender ? undefined : { label: 'Rückgängig', onClick: () => undoArchive(id) },
    },
  );
const quickArchive = (id) => archive(id);
const quickRemove = (id) => perform('delete', { id }, { message: 'Endgültig gelöscht', confirmText: DELETE_TEXT });
const quickRestore = (id) =>
  perform('restore', { id }, { message: 'Zurückgeholt nach Offen', toastAction: { label: 'Anzeigen', icon: null, onClick: () => showItem(id) } });

// --- Detail
async function select(id, { keepView = true } = {}) {
  state.selectedId = id;
  if (!keepView) state.view = 'summary';
  clearInterval(state.draftTimer);
  renderLeft();
  renderLoading($('detail'));
  writeHash();
  let data;
  try {
    data = await api.detail(id);
  } catch (e) {
    renderEmpty($('detail'), e.message);
    toast(e.message, { error: true });
    return;
  }
  if (String(state.selectedId) !== String(id)) return; // inzwischen andere Mail gewählt

  state.controller = renderDetail($('detail'), data, {
    view: state.view,
    ownAddress: state.ownAddress,
    onView: (v) => {
      state.view = v;
      writeHash();
    },
    handlers: {
      accept: (payload) =>
        perform('accept', { id, ...payload }, { message: (r) => (r?.duplicate ? 'Diese Aufgabe steht schon in der Liste.' : 'Aufgabe übernommen.') }),
      archive: ({ ignoreSender }) => archive(id, ignoreSender),
      remove: () => quickRemove(id),
      restore: () => quickRestore(id),
      snooze: (until) => perform('snooze', { id, until }, { message: 'Zurückgestellt' }),
      reload: () => select(id),
      attachments: () => api.attachments(id),
      aiView: () => api.aiView(id),
      revertReview: async () => {
        try {
          await api.action('review-revert', { id });
          await loadList();
        } catch (e) {
          toast(e.message, { error: true });
        }
        select(id);
      },
      regenerate: async () => {
        try {
          await api.action('regenerate-draft', { id });
        } catch (e) {
          toast(e.message, { error: true });
        }
        await refreshDraft(id);
      },
    },
  });

  if (data.proposal.archiviert) return;
  if (data.proposal.aufgabe_text && !data.proposal.aufgabe_uebernommen) {
    api
      .match(id)
      .then((m) => String(state.selectedId) === String(id) && state.controller?.setMatch(m))
      .catch((e) => toast(e.message, { error: true }));
  } else {
    state.controller.setMatch({ heading: null, quiet: true, reason: data.proposal.aufgabe_uebernommen ? '' : 'Keine Aufgabe vorgeschlagen. Du kannst trotzdem eine anlegen.' });
  }
  if (state.controller.hasDraftPanel && !data.draft && !data.proposal.entwurf_fehler && !data.proposal.is_test) {
    state.draftTimer = setInterval(() => refreshDraft(id), 6000);
  }
}

async function refreshDraft(id) {
  if (String(state.selectedId) !== String(id)) return;
  const d = await api.detail(id).catch(() => null);
  if (!d || String(state.selectedId) !== String(id)) return;
  state.controller?.updateDraft({ draft: d.draft, error: d.proposal.entwurf_fehler });
  if (d.draft || d.proposal.entwurf_fehler) clearInterval(state.draftTimer);
}

// --- Statusleiste
async function updateStatus() {
  const chip = $('status');
  try {
    const s = await api.status();
    chip.className = `status${s.error ? ' error' : ''}`;
    chip.replaceChildren(
      ...[
        s.error ? icon('alert', 14) : el('span', { class: 'dot ok' }),
        el('span', {}, s.error ? s.error : s.fetchedAt ? `Aktualisiert ${formatShort(s.fetchedAt)}` : 'Lädt …'),
        s.claudeBusy ? el('span', { class: 'busy' }, el('span', { class: 'spinner' }), 'Claude arbeitet') : null,
      ].filter(Boolean),
    );
    $('rules-link').title = `Regeldatei öffnen: ${s.rulesFile}`;
  } catch {
    chip.className = 'status error';
    chip.replaceChildren(icon('alert', 14), el('span', {}, 'Die App ist nicht erreichbar.'));
  }
}

// --- Bedienung
// Dokumentensuche: Treffer in Anhängen kommen vom Server (kurz gewartet, damit nicht jeder Tastendruck abgefragt wird)
let docTimer = null;
function searchDocs() {
  clearTimeout(docTimer);
  const q = state.query.trim();
  if (q.length < 2 || !docScopeOn(state.filters)) {
    state.docHits = {};
    state.docCoverage = null;
    return;
  }
  docTimer = setTimeout(async () => {
    try {
      const r = await api.search(q, { content: state.filters.scope.content, names: state.filters.scope.names, text: state.filters.scope.text });
      if (q !== state.query.trim()) return; // inzwischen anders gesucht
      state.docHits = r.hits || {};
      state.docCoverage = { indexed: r.indexed, total: r.total };
      renderLeft();
    } catch {
      // Dokumentensuche ist eine Zugabe: die normale Suche funktioniert weiter
    }
  }, 250);
}
$('search').addEventListener('input', (e) => {
  state.query = e.target.value;
  $('search-clear').hidden = !state.query;
  searchDocs();
  renderLeft();
  writeHash();
});
$('search-clear').addEventListener('click', () => {
  $('search').value = '';
  state.query = '';
  writeHash();
  searchDocs();
  $('search-clear').hidden = true;
  renderLeft();
  $('search').focus();
});
$('rules-link').addEventListener('click', (e) => {
  e.preventDefault();
  api.openRules().catch((err) => toast(err.message, { error: true }));
});
$('refresh').addEventListener('click', async () => {
  const btn = $('refresh');
  btn.disabled = true;
  btn.classList.add('spinning');
  try {
    await loadList(api.refresh);
  } catch (e) {
    toast(e.message, { error: true });
  } finally {
    btn.disabled = false;
    btn.classList.remove('spinning');
    updateStatus();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === '/' && !typing) {
    e.preventDefault();
    $('search').focus();
  } else if (e.key === 'Escape' && document.activeElement === $('search')) {
    $('search').blur();
  } else if (!typing && (e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const list = visibleItems();
    if (!list.length) return;
    const i = list.findIndex((m) => String(m.id) === String(state.selectedId));
    const step = e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1;
    const next = list[Math.min(Math.max(i + step, 0), list.length - 1)];
    if (next && String(next.id) !== String(state.selectedId)) {
      e.preventDefault();
      select(next.id, { keepView: false });
    }
  } else if (!typing && state.selectedId && e.key === 'e') {
    // e = in Done ablegen (bzw. zurückholen, wenn die Mail schon in Done liegt)
    const m = findItem(state.selectedId);
    if (m) (m.archiviert ? quickRestore : quickArchive)(m.id);
  } else if (!typing && state.selectedId && e.key === 'Delete') {
    quickRemove(state.selectedId);
  }
});

// --- Tab-Symbol und Benachrichtigungen (siehe attention.js)
const tabSignal = createTabSignal();
let lastImportant = -1;
function signalAttention() {
  const a = attentionOf(state.items);
  const { fresh, ids } = freshImportant(seenIds(), a.importantItems);
  rememberSeen(ids);
  tabSignal.update({ open: a.open, important: a.important, pulse: lastImportant >= 0 && fresh.length > 0 });
  lastImportant = a.important;
  if (fresh.length) notifyFresh(fresh, { onOpen: (id) => showItem(id) });
}

// Knopf für die Benachrichtigungen: fragt einmal um Erlaubnis, danach schickt er eine Testmeldung
function setupNotifyButton() {
  const btn = $('notify');
  if (!notifySupported()) return;
  const paint = () => {
    const p = Notification.permission;
    btn.hidden = false;
    btn.replaceChildren(icon('bell', 15));
    btn.classList.toggle('on', p === 'granted');
    btn.title =
      p === 'granted' ? 'Benachrichtigungen für neue wichtige Mails sind an. Klicken für eine Testmeldung.'
      : p === 'denied' ? 'Benachrichtigungen sind im Browser blockiert (Seiteneinstellungen von localhost:4711 ändern).'
      : 'Benachrichtigungen für neue wichtige Mails einschalten';
    btn.setAttribute('aria-label', btn.title);
  };
  btn.addEventListener('click', async () => {
    if (Notification.permission === 'default') await Notification.requestPermission();
    else if (Notification.permission === 'granted') notifyTest();
    paint();
  });
  paint();
}
setupNotifyButton();

// --- Erweiterte Suche
const searchPanel = createSearchPanel({
  panel: $('filter-panel'),
  chipsBox: $('filter-chips'),
  button: $('filter-toggle'),
  onChange: (f) => {
    state.filters = f;
    searchDocs();
    renderLeft();
    writeHash();
  },
});
// Auswahl im Panel: Formate der vorhandenen Anhänge und bekannte Absender
function updateSearchChoices() {
  const all = everything();
  searchPanel.setChoices({
    formats: [...new Set(all.flatMap((m) => (m.anhaenge || []).map(formatOf)))].sort(),
    names: [...new Set(all.map((m) => m.absender).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')),
  });
}

// --- Start
const hash = readHash();
state.view = hash.view;
state.filters = hash.filters;
searchPanel.set(hash.filters, { silent: true, open: hasRealFilter(hash.filters) });
if (new URLSearchParams(location.hash.slice(1)).get('theme') === 'light') document.documentElement.dataset.theme = 'light';
if (hash.tab && TABS.some((t) => t.id === hash.tab)) state.tab = hash.tab;
if (hash.q) {
  state.query = hash.q;
  $('search').value = hash.q;
  $('search-clear').hidden = false;
  searchDocs();
}
await loadList().catch((e) => toast(e.message, { error: true }));
const wanted = hash.mail && findItem(hash.mail);
if (wanted && !hash.tab && !hash.q && !hasRealFilter(state.filters)) state.tab = tabOf(wanted);
const first = wanted || visibleItems()[0];
if (first) select(first.id);
else renderEmpty($('detail'), 'Keine offenen Mails. Neue erscheinen hier automatisch.');
renderLeft();
updateStatus();
setInterval(() => loadList().then(updateStatus).catch(updateStatus), 30_000);
setInterval(updateStatus, 5_000);
