// Oberfläche: Zustand und Ablauf. Liste links, Detail rechts, Aktionen gehen an die API und laden danach die Listen neu.
// Bausteine: components/ (Darstellung), search-controller (Suche und Filter), attention-signal (Tab-Symbol, Benachrichtigungen),
// hash (Adresszeile), shortcuts (Tastatur), status-bar.
import { api } from './api.js';
import { toast } from './util.js';
import { TABS, renderTabs, renderList } from './components/list.js';
import { renderDetail, renderLoading, renderEmpty } from './components/detail.js';
import { readHash, writeHash } from './hash.js';
import { createSearch } from './search-controller.js';
import { createAttentionSignal, setupNotifyButton } from './attention-signal.js';
import { createStatusBar } from './status-bar.js';
import { installShortcuts } from './shortcuts.js';

const $ = (id) => document.getElementById(id);
const state = { items: [], archive: [], ownAddress: '', tab: 'offen', selectedId: null, view: 'summary', controller: null, draftTimer: null };

const DELETE_TEXT =
  'Konversation endgültig löschen?\n\nSie wird aus der Mail-Übersicht entfernt und ist auch in Done nicht mehr zu finden. Das lässt sich nicht rückgängig machen.\nIn Outlook bleibt die Mail unverändert.';

const search = createSearch({
  els: { input: $('search'), clear: $('search-clear'), panel: $('filter-panel'), chips: $('filter-chips'), toggle: $('filter-toggle') },
  onChange: () => {
    renderLeft();
    syncHash();
  },
});
const statusBar = createStatusBar({ chip: $('status'), rulesLink: $('rules-link') });
const attention = createAttentionSignal({ onOpen: (id) => showItem(id) });

const syncHash = () => writeHash({ selectedId: state.selectedId, view: state.view, query: search.query, filters: search.filters });

// --- Liste
const everything = () => [...state.items, ...state.archive];
const findItem = (id) => everything().find((m) => String(m.id) === String(id));
const tabOf = (m) => TABS.find((t) => t.test(m))?.id || 'offen';
const visibleItems = () => (search.searching() ? search.results(everything()) : everything().filter(TABS.find((t) => t.id === state.tab).test));

function renderLeft() {
  renderTabs($('tabs'), everything(), state.tab, search.searching(), (tab) => {
    state.tab = tab;
    search.reset(); // ein Klick auf einen Reiter beendet die Suche
    renderLeft();
    syncHash();
  });
  renderList($('list'), {
    items: visibleItems(),
    selectedId: state.selectedId,
    query: search.query,
    searching: search.searching(),
    docCoverage: search.docCoverage,
    tab: state.tab,
    actions: { select, archive: quickArchive, remove: quickRemove, restore: quickRestore },
  });
}

async function loadList(fn = api.proposals) {
  const data = await fn();
  state.items = data.items;
  state.archive = data.archive || [];
  state.ownAddress = data.ownAddress;
  search.setChoices(everything());
  attention.update(state.items);
  if (state.selectedId && !findItem(state.selectedId)) clearDetail();
  renderLeft();
}

function clearDetail() {
  state.selectedId = null;
  state.controller = null;
  clearInterval(state.draftTimer);
  renderEmpty($('detail'));
  syncHash();
}

/** Springt zu einer Mail: passender Reiter, Suche und Filter zurücksetzen, Detail öffnen. */
function showItem(id) {
  const m = findItem(id);
  if (!m) return;
  state.tab = tabOf(m);
  search.reset();
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
  const idx = visibleItems().findIndex((m) => String(m.id) === String(payload.id));
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
  perform('archive', { id, ignoreSender }, {
    message: ignoreSender ? 'In Done abgelegt. Der Absender wird künftig ignoriert (Regel in Mail-Regeln.md).' : 'In Done abgelegt',
    toastAction: ignoreSender ? undefined : { label: 'Rückgängig', onClick: () => undoArchive(id) },
  });
const quickArchive = (id) => archive(id);
const quickRemove = (id) => perform('delete', { id }, { message: 'Endgültig gelöscht', confirmText: DELETE_TEXT });
const quickRestore = (id) => perform('restore', { id }, { message: 'Zurückgeholt nach Offen', toastAction: { label: 'Anzeigen', icon: null, onClick: () => showItem(id) } });

// --- Detail
async function select(id, { keepView = true } = {}) {
  state.selectedId = id;
  if (!keepView) state.view = 'summary';
  clearInterval(state.draftTimer);
  renderLeft();
  renderLoading($('detail'));
  syncHash();
  let data;
  try {
    data = await api.detail(id);
  } catch (e) {
    renderEmpty($('detail'), e.message);
    toast(e.message, { error: true });
    return;
  }
  if (String(state.selectedId) !== String(id)) return; // inzwischen andere Mail gewählt

  const failed = (e) => toast(e.message, { error: true });
  state.controller = renderDetail($('detail'), data, {
    view: state.view,
    ownAddress: state.ownAddress,
    onView: (v) => {
      state.view = v;
      syncHash();
    },
    handlers: {
      accept: (payload) => perform('accept', { id, ...payload }, { message: (r) => (r?.duplicate ? 'Diese Aufgabe steht schon in der Liste.' : 'Aufgabe übernommen.') }),
      archive: ({ ignoreSender }) => archive(id, ignoreSender),
      remove: () => quickRemove(id),
      restore: () => quickRestore(id),
      snooze: (until) => perform('snooze', { id, until }, { message: 'Zurückgestellt' }),
      reload: () => select(id),
      attachments: () => api.attachments(id),
      aiView: () => api.aiView(id),
      revertReview: async () => {
        await api.action('review-revert', { id }).then(() => loadList()).catch(failed);
        select(id);
      },
      regenerate: async () => {
        await api.action('regenerate-draft', { id }).catch(failed);
        await refreshDraft(id);
      },
    },
  });

  const p = data.proposal;
  if (p.archiviert) return;
  if (p.aufgabe_text && !p.aufgabe_uebernommen) {
    api
      .match(id)
      .then((m) => String(state.selectedId) === String(id) && state.controller?.setMatch(m))
      .catch(failed);
  } else {
    state.controller.setMatch({ heading: null, quiet: true, reason: p.aufgabe_uebernommen ? '' : 'Keine Aufgabe vorgeschlagen. Du kannst trotzdem eine anlegen.' });
  }
  // Der Entwurf entsteht im Hintergrund: solange er fehlt, alle 6 Sekunden nachsehen
  if (state.controller.hasDraftPanel && !data.draft && !p.entwurf_fehler && !p.is_test) {
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

// --- Kopfzeile
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
    statusBar.update();
  }
});
installShortcuts({ searchInput: $('search'), visibleItems, selectedId: () => state.selectedId, findItem, select, archive: quickArchive, restore: quickRestore, remove: quickRemove });
setupNotifyButton($('notify'));

// --- Start
const hash = readHash();
state.view = hash.view;
if (hash.lightTheme) document.documentElement.dataset.theme = 'light';
if (hash.tab && TABS.some((t) => t.id === hash.tab)) state.tab = hash.tab;
search.restore({ q: hash.q, filters: hash.filters });
await loadList().catch((e) => toast(e.message, { error: true }));
const wanted = hash.mail && findItem(hash.mail);
if (wanted && !hash.tab && !search.searching()) state.tab = tabOf(wanted);
const first = wanted || visibleItems()[0];
if (first) select(first.id);
else renderEmpty($('detail'), 'Keine offenen Mails. Neue erscheinen hier automatisch.');
renderLeft();
statusBar.update();
setInterval(() => loadList().then(statusBar.update).catch(statusBar.update), 30_000);
setInterval(statusBar.update, 5_000);
