// Oberfläche: Zustand und Ablauf. Liste links, Detail rechts, Aktionen gehen an die API und laden danach die Listen neu.
// Bausteine: components/ (Darstellung), search-controller (Suche und Filter), attention-signal (Tab-Symbol, Benachrichtigungen),
// hash (Adresszeile), shortcuts (Tastatur), status-bar, marking und mark-bar (Sammelaktionen).
import { api } from './api.js';
import { toast } from './util.js';
import { TABS, renderTabs, renderList, withoutCollapsed } from './components/list.js';
import { renderDetail, renderLoading, renderEmpty } from './components/detail.js';
import { renderProfile } from './components/profile.js';
import { renderLearnPanel } from './components/learn-panel.js';
import { readHash, writeHash } from './hash.js';
import { createSearch } from './search-controller.js';
import { createAttentionSignal, setupNotifyButton } from './attention-signal.js';
import { createStatusBar } from './status-bar.js';
import { installShortcuts } from './shortcuts.js';
import { createMarking } from './marking.js';
import { renderMarkBar } from './components/mark-bar.js';
import { snoozeOptions } from './snooze-options.js';

const $ = (id) => document.getElementById(id);
const state = { items: [], archive: [], ownAddress: '', tab: 'offen', selectedId: null, view: 'summary', controller: null, draftTimer: null, markMode: 'actions', profile: null, learning: false, learnTimer: null, profileTab: 'mails' };
const marking = createMarking();

const DELETE_TEXT =
  'Konversation endgültig löschen?\n\nSie wird aus der Mail-Übersicht entfernt und ist auch in Done nicht mehr zu finden. Das lässt sich nicht rückgängig machen.\nIn Outlook bleibt die Mail unverändert.';

const search = createSearch({
  els: { input: $('search'), clear: $('search-clear'), panel: $('filter-panel'), chips: $('filter-chips'), toggle: $('filter-toggle') },
  onChange: () => {
    marking.clear();
    renderLeft();
    syncHash();
  },
});
const statusBar = createStatusBar({ chip: $('status'), rulesLink: $('rules-link') });
const attention = createAttentionSignal({ onOpen: (id) => showItem(id) });

const syncHash = () => writeHash({ selectedId: state.selectedId, view: state.view, query: search.query, filters: search.filters, profile: state.profile });

// --- Liste
const everything = () => [...state.items, ...state.archive];
const findItem = (id) => everything().find((m) => String(m.id) === String(id));
const tabOf = (m) => TABS.find((t) => t.test(m))?.id || 'offen';
// Zugeklappte Gruppen (heute nur "Egal") bleiben für Tastatur und "Alle" außen vor
const COLLAPSED_KEY = 'mail-app.collapsed';
const readCollapsed = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY));
    return new Set(Array.isArray(saved) ? saved : ['egal']);
  } catch {
    return new Set(['egal']); // Egal ist zunächst zugeklappt
  }
};
const collapsed = readCollapsed();
function toggleGroup(id) {
  if (!collapsed.delete(id)) collapsed.add(id);
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // ohne Speicher gilt die Auswahl nur bis zum Neuladen
  }
  marking.prune(visibleItems().map((m) => m.id));
  renderLeft();
}
const inTab = () => (search.searching() ? search.results(everything()) : everything().filter(TABS.find((t) => t.id === state.tab).test));
const visibleItems = () => withoutCollapsed(inTab(), collapsed, state.tab, search.searching());

function renderLeft() {
  marking.prune(everything().map((m) => m.id));
  if (!marking.size) state.markMode = 'actions';
  const marked = everything().filter((m) => marking.has(m.id));
  renderMarkBar($('mark-bar'), { count: marked.length, mode: state.markMode, allDone: marked.length > 0 && marked.every((m) => m.archiviert) }, bulkHandlers);
  renderTabs($('tabs'), everything(), state.tab, search.searching(), (tab) => {
    state.tab = tab;
    marking.clear();
    search.reset(); // ein Klick auf einen Reiter beendet die Suche
    renderLeft();
    syncHash();
  });
  renderList($('list'), {
    items: inTab(),
    collapsed,
    selectedId: state.selectedId,
    query: search.query,
    searching: search.searching(),
    docCoverage: search.docCoverage,
    marking,
    tab: state.tab,
    actions: { select, archive: quickArchive, remove: quickRemove, restore: quickRestore, mark: markToggle, markRange, toggleGroup },
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
  stopLearnPolling();
  state.selectedId = null;
  state.profile = null;
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
  if (m.dringlichkeit === 'egal' && state.tab === 'offen') collapsed.delete('egal'); // die Mail soll zu sehen sein
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


// --- Sammelaktionen: Strg + Klick markiert Mails, die Leiste über der Liste führt die Aktion aus
// Ohne Markierung gilt die gewählte Mail.
const targetItems = () => (marking.size ? marking.list() : state.selectedId != null ? [state.selectedId] : []).map(findItem).filter(Boolean);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Führt Sammelaktionen aus ([{ action, ids, ...}]), lädt neu und wählt die nächste Mail, wenn die gewählte weggefallen ist. */
async function runBulk(calls, { message, confirmText, undo } = {}) {
  const todo = calls.filter((c) => c.ids.length);
  if (!todo.length) return false;
  if (confirmText && !confirm(confirmText)) return false;
  const ids = new Set(todo.flatMap((c) => c.ids.map(String)));
  const before = visibleItems();
  const firstAt = Math.max(0, before.findIndex((m) => ids.has(String(m.id))));
  let done = 0;
  const failed = [];
  try {
    for (const { action, ids: list, ...payload } of todo) {
      const r = await api.action('bulk', { action, ids: list, ...payload });
      done += r.done;
      failed.push(...r.failed);
    }
  } catch (e) {
    failed.push({ error: e.message });
  }
  marking.clear();
  state.markMode = 'actions';
  await loadList();
  const after = visibleItems();
  if (state.selectedId != null && !after.some((m) => String(m.id) === String(state.selectedId))) {
    const next = after[Math.min(firstAt, after.length - 1)];
    if (next) select(next.id);
    else clearDetail();
  }
  const problem = failed.length ? `${plural(failed.length, 'Mail', 'Mails')} nicht geklappt: ${failed[0].error}` : '';
  if (done) toast(`${message(done)}${problem ? `. ${problem}` : ''}`, { error: !!problem, action: failed.length ? undefined : undo });
  else toast(problem || 'Nichts geändert', { error: true });
  return true;
}

const bulkDone = () => {
  const items = targetItems();
  const archiveIds = items.filter((m) => !m.archiviert).map((m) => m.id);
  const restoreIds = items.filter((m) => m.archiviert).map((m) => m.id);
  return runBulk([{ action: 'archive', ids: archiveIds }, { action: 'restore', ids: restoreIds }], {
    message: (n) => (restoreIds.length && !archiveIds.length ? `${plural(n, 'Mail', 'Mails')} zurückgeholt` : `${plural(n, 'Mail', 'Mails')} erledigt`),
    undo: archiveIds.length && !restoreIds.length ? { label: 'Rückgängig', onClick: () => runBulk([{ action: 'restore', ids: archiveIds }], { message: (n) => `${plural(n, 'Mail', 'Mails')} wiederhergestellt` }) } : undefined,
  });
};
const bulkRemove = () => {
  const ids = targetItems().map((m) => m.id);
  return runBulk([{ action: 'delete', ids }], {
    message: (n) => `${plural(n, 'Konversation', 'Konversationen')} endgültig gelöscht`,
    confirmText: ids.length === 1 ? DELETE_TEXT : DELETE_TEXT.replace('Konversation endgültig löschen?\n\nSie wird', `${ids.length} Konversationen endgültig löschen?\n\nSie werden`).replace('ist auch in Done nicht mehr zu finden', 'sind auch in Done nicht mehr zu finden').replace('In Outlook bleibt die Mail', 'In Outlook bleiben die Mails'),
  });
};
function bulkSnoozeOpen() {
  if (!targetItems().some((m) => !m.archiviert)) return toast('Später gibt es nur für offene Mails.', { error: true });
  state.markMode = 'snooze';
  renderLeft();
}
function bulkSnoozePick(n) {
  const option = snoozeOptions()[n - 1];
  if (!option) return;
  return runBulk([{ action: 'snooze', ids: targetItems().filter((m) => !m.archiviert).map((m) => m.id), until: option.date.toISOString() }], {
    message: (c) => `${plural(c, 'Mail', 'Mails')} zurückgestellt (${option.label})`,
  });
}
function bulkCancel() {
  if (state.markMode === 'snooze') state.markMode = 'actions';
  else marking.clear();
  renderLeft();
}
const bulkHandlers = { done: bulkDone, snooze: bulkSnoozeOpen, remove: bulkRemove, cancel: bulkCancel, pick: bulkSnoozePick, all: () => bulkAll() };
function bulkAll() {
  marking.add(...visibleItems().map((m) => m.id));
  renderLeft();
}
const bulk = { active: () => marking.size > 0, cancel: bulkCancel };

// Strg + Klick: Mail markieren oder Markierung aufheben. Umschalt + Klick: alle Mails von der gewählten bis zu dieser markieren.
function markToggle(id) {
  marking.toggle(id);
  state.markMode = 'actions';
  renderLeft();
}
function markRange(id) {
  const list = visibleItems();
  const a = list.findIndex((m) => String(m.id) === String(state.selectedId));
  const b = list.findIndex((m) => String(m.id) === String(id));
  if (a < 0 || b < 0) return markToggle(id);
  marking.add(...list.slice(Math.min(a, b), Math.max(a, b) + 1).map((m) => m.id));
  state.markMode = 'actions';
  renderLeft();
}

// --- Detail
async function select(id, { keepView = true } = {}) {
  state.selectedId = id;
  state.profile = null;
  state.learning = false;
  stopLearnPolling();
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
      openProfile: (address) => openProfile(address),
      attachments: () => api.attachments(id),
      aiView: () => api.aiView(id),
      revertReview: async () => {
        await api.action('review-revert', { id }).then(() => loadList()).catch(failed);
        select(id);
      },
      thread: (before) => api.thread(id, { before }),
      outlookDraft: (payload) => api.action('outlook-draft', { id, ...payload }),
      outlookDraftDelete: () => api.action('outlook-draft-delete', { id }),
      outlookSend: () => perform('outlook-send', { id }, { message: (r) => (r?.simulated ? 'Testmodus: Es wurde nichts gesendet. Die Mail liegt jetzt unter Done.' : 'Gesendet. Die Mail liegt jetzt unter Done.') }),
      regenerate: async (opts = {}) => {
        await api.action('regenerate-draft', { id, ...opts }).catch(failed);
        await refreshDraft(id);
      },
      previousDraft: async () => {
        await api.action('draft-previous', { id }).catch(failed);
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

// --- Absender-Profil (ersetzt die Detailansicht, bis eine Mail gewählt oder "Zurück" geklickt wird)
async function openProfile(address) {
  if (!address) return;
  state.learning = false;
  stopLearnPolling();
  state.profile = String(address).toLowerCase();
  state.profileTab = 'mails';
  clearInterval(state.draftTimer);
  state.controller = null;
  renderLoading($('detail'));
  syncHash();
  await showProfile();
}

async function showProfile(scrollTop = 0) {
  const address = state.profile;
  if (!address) return;
  let data;
  try {
    data = await api.contact(address);
  } catch (e) {
    toast(e.message, { error: true });
    return closeProfile();
  }
  if (state.profile !== address) return; // inzwischen etwas anderes geöffnet
  renderProfile($('detail'), data, {
    back: closeProfile,
    openMail: (id) => showItem(id),
    change: async (payload) => {
      const top = $('detail').scrollTop;
      try {
        await api.action('contact', payload);
        if (payload.op === 'rule') await loadList(); // eine Regel ändert die Liste sofort
      } catch (e) {
        toast(e.message, { error: true });
      }
      await showProfile(top);
    },
  }, { tab: state.profileTab, onTab: (id) => (state.profileTab = id) });
  $('detail').scrollTop = scrollTop;
}

function closeProfile() {
  state.profile = null;
  if (state.selectedId != null && findItem(state.selectedId)) select(state.selectedId);
  else clearDetail();
}

// --- Lernen aus gesendeten Mails (Ansicht statt Detail; der Server arbeitet im Hintergrund, hier wird nur der Stand abgefragt)
function stopLearnPolling() {
  clearInterval(state.learnTimer);
  state.learnTimer = null;
}

async function showLearn() {
  let status;
  try {
    status = await api.historyLearn();
  } catch (e) {
    toast(e.message, { error: true });
    return closeLearn();
  }
  if (!state.learning) return; // inzwischen etwas anderes geöffnet
  renderLearnPanel($('detail'), status, {
    back: closeLearn,
    openRules: () => api.openRules().catch((e) => toast(e.message, { error: true })),
    start: async (count) => {
      try {
        await api.action('history-learn', { count });
      } catch (e) {
        return toast(e.message, { error: true });
      }
      await showLearn();
    },
  });
  if (status.running && !state.learnTimer) state.learnTimer = setInterval(showLearn, 2000);
  if (!status.running && state.learnTimer) {
    stopLearnPolling();
    loadList().catch(() => {}); // Regeln können Listen ändern
  }
}

function openLearn() {
  state.profile = null;
  clearInterval(state.draftTimer);
  state.controller = null;
  state.learning = true;
  showLearn();
}

function closeLearn() {
  stopLearnPolling();
  state.learning = false;
  if (state.selectedId != null && findItem(state.selectedId)) select(state.selectedId);
  else clearDetail();
}

// --- Kopfzeile
$('learn-link').addEventListener('click', (e) => {
  e.preventDefault();
  openLearn();
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
    statusBar.update();
  }
});
installShortcuts({ searchInput: $('search'), visibleItems, selectedId: () => state.selectedId, findItem, select, archive: quickArchive, restore: quickRestore, remove: quickRemove, bulk });
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
if (wanted?.dringlichkeit === 'egal' && !wanted.archiviert && !wanted.snoozed_until) collapsed.delete('egal');
const first = wanted || visibleItems()[0];
if (hash.kontakt) {
  state.selectedId = first?.id ?? null; // damit "Zurück zur Mail" eine Mail hat
  openProfile(hash.kontakt);
} else if (first) select(first.id);
else renderEmpty($('detail'), 'Keine offenen Mails. Neue erscheinen hier automatisch.');
renderLeft();
statusBar.update();
setInterval(() => loadList().then(statusBar.update).catch(statusBar.update), 30_000);
setInterval(statusBar.update, 5_000);
