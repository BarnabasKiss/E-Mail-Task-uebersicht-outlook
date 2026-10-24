// Oberfläche: Zustand und Ablauf. Liste links, Detail rechts, Aktionen gehen an die API und laden danach die Listen neu.
// Bausteine: components/ (Darstellung), search-controller (Suche und Filter), attention-signal (Tab-Symbol, Benachrichtigungen),
// hash (Adresszeile), shortcuts (Tastatur), status-bar, marking und mark-bar (Sammelaktionen).
import { api } from './api.js';
import { toast } from './util.js';
import { TABS, renderTabs, renderList, withoutCollapsed } from './components/list.js';
import { renderDetail, renderLoading, renderEmpty } from './components/detail.js';
import { renderProfile } from './components/profile.js';
import { renderLearnPanel } from './components/learn-panel.js';
import { renderRules } from './components/rules-view.js';
import { renderSignature } from './components/signature-view.js';
import { renderTasksFile } from './components/tasks-view.js';
import { prepareSignatureImage } from './signature-image.js';
import { renderContacts } from './components/contacts-view.js';
import { renderCompose } from './components/compose-view.js';
import { renderOutbox } from './components/outbox-view.js';
import { icon } from './icons.js';
import { readHash, writeHash } from './hash.js';
import { createSearch } from './search-controller.js';
import { createAttentionSignal, setupNotifyButton } from './attention-signal.js';
import { createStatusBar } from './status-bar.js';
import { installShortcuts } from './shortcuts.js';
import { createMarking } from './marking.js';
import { renderMarkBar } from './components/mark-bar.js';
import { snoozeOptions } from './snooze-options.js';

const $ = (id) => document.getElementById(id);
const state = { items: [], archive: [], ownAddress: '', tab: 'offen', selectedId: null, view: 'summary', controller: null, draftTimer: null, markMode: 'actions', profile: null, learning: false, learnTimer: null, profileTab: 'mails', contacts: null, outbox: null, rules: null, sig: null, signatureManual: null, signatureImage: null, tasks: null, compose: null };
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
// Symbole an den Knöpfen der Kopfzeile (data-icon)
document.querySelectorAll('[data-icon]').forEach((b) => b.prepend(icon(b.dataset.icon, 15)));

// Zähler am Knopf "Entwürfe": Entwürfe plus geplante Mails, rot bei Fehlern
function showOutboxCount(s) {
  const o = s.outbox || { drafts: 0, scheduled: 0, failed: 0 };
  const badge = $('outbox-badge');
  const total = o.drafts + o.scheduled;
  badge.hidden = total === 0;
  badge.textContent = String(total);
  badge.classList.toggle('bad', o.failed > 0);
  badge.title = `${o.drafts} Entwürfe, ${o.scheduled} geplant${o.failed ? `, ${o.failed} mit Fehler` : ''}`;
}
const statusBar = createStatusBar({ chip: $('status'), rulesLink: $('rules-link'), onStatus: showOutboxCount });
const attention = createAttentionSignal({ onOpen: (id) => showItem(id) });

// Kopfzeile: welche Ansicht gerade offen ist (Neue Mail, Entwürfe, Kontakte, Lernen), gemerkt über aria-current
function syncNav() {
  const open = { 'compose-link': !!state.compose, 'outbox-link': !!state.outbox, 'contacts-link': !!state.contacts, 'learn-link': !!state.learning, 'rules-link': !!state.rules, 'signature-link': !!state.sig, 'tasks-link': !!state.tasks };
  open['options-link'] = open['contacts-link'] || open['learn-link'] || open['rules-link'] || open['signature-link'] || open['tasks-link'];
  for (const [id, on] of Object.entries(open)) {
    if (on) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
}

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
  state.contacts = state.outbox = state.rules = state.sig = state.tasks = null;
  state.selectedId = null;
  state.profile = null;
  state.controller = null;
  clearInterval(state.draftTimer);
  renderEmpty($('detail'));
  syncNav();
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

// --- Neue Mail: Ansicht statt Detail. Der Entwurf wird laufend in der App gespeichert; beim Verlassen wird der letzte Stand noch gesichert.
function leaveCompose() {
  if (!state.compose) return true;
  state.compose.view.flush?.();
  state.compose.view.stopDictation?.();
  state.compose = null;
  syncNav();
  return true;
}

async function openCompose(prefill = {}) {
  if (!leaveCompose()) return;
  clearInterval(state.draftTimer);
  stopLearnPolling();
  state.controller = null;
  state.profile = null;
  state.learning = false;
  state.contacts = state.outbox = state.rules = state.sig = state.tasks = null;
  const info = await api.composeInfo().catch(() => ({ signature: '' }));
  const handle = { view: null };
  state.compose = handle;
  syncNav();
  handle.view = renderCompose($('detail'), {
    signature: info.signature,
    signatureImage: info.image,
    prefill,
    suggest: (q, exclude) => api.suggest(q, exclude),
    appSave: (payload) => api.action('mail-draft-save', payload),
    appDelete: (id) => api.action('mail-draft-delete', { id }),
    save: (payload) => api.action('compose-draft', payload),
    send: async ({ draftId }) => {
      try {
        await api.action('compose-send', { draftId });
        return true;
      } catch (e) {
        toast(e.message, { error: true });
        return false;
      }
    },
    discard: ({ draftId }) => api.action('compose-discard', { draftId }),
    schedule: (o) => api.action('schedule', o),
    improve: (o) => api.action('text-improve', o),
    makeSubject: (o) => api.action('text-subject', o),
    check: (o) => api.action('send-check', o),
    back: () => {
      state.compose = null;
      statusBar.update();
      if (state.selectedId != null && findItem(state.selectedId)) select(state.selectedId);
      else clearDetail();
    },
  });
}

// --- Entwürfe und geplante Mails (Ansicht statt Detail)
async function showOutbox(note = state.outbox?.note || '') {
  const o = state.outbox;
  if (!o) return;
  let data;
  try {
    data = await api.outbox();
  } catch (e) {
    toast(e.message, { error: true });
    return closeOutbox();
  }
  if (state.outbox !== o) return;
  o.note = note;
  statusBar.update();
  const run = async (promise, text) => {
    try {
      const r = await promise;
      await showOutbox(typeof text === 'function' ? text(r) : text);
    } catch (e) {
      toast(e.message, { error: true });
      await showOutbox('');
    }
  };
  renderOutbox($('detail'), data, {
    back: closeOutbox,
    openDraft: (d) => openCompose({ ...d, draftId: d.id }),
    deleteDraft: (id) => (confirm('Diesen Entwurf löschen?') ? run(api.action('mail-draft-delete', { id }), 'Entwurf gelöscht.') : null),
    cancel: (id) => (confirm('Die Planung abbrechen? Die Mail wird dann nicht gesendet.') ? run(api.action('schedule-cancel', { id }), 'Planung abgebrochen.') : null),
    toDraft: async (id) => {
      try {
        const r = await api.action('schedule-cancel', { id, toDraft: true });
        const fresh = await api.outbox();
        const draft = fresh.drafts.find((d) => d.id === r.draftId);
        if (draft) openCompose({ ...draft, draftId: draft.id });
      } catch (e) {
        toast(e.message, { error: true });
      }
    },
    sendNow: (id) => run(api.action('schedule-now', { id }), 'Gesendet.'),
  }, note);
}

function openOutbox() {
  leaveCompose();
  clearInterval(state.draftTimer);
  stopLearnPolling();
  state.controller = null;
  state.profile = null;
  state.learning = false;
  state.contacts = state.rules = state.sig = state.tasks = null;
  state.outbox = { note: '' };
  syncNav();
  showOutbox('');
}

function closeOutbox() {
  state.outbox = null;
  if (state.selectedId != null && findItem(state.selectedId)) select(state.selectedId);
  else clearDetail();
}

// --- Detail
async function select(id, { keepView = true } = {}) {
  if (!leaveCompose()) return;
  state.selectedId = id;
  state.profile = null;
  state.learning = false;
  state.contacts = state.outbox = state.rules = state.sig = state.tasks = null;
  stopLearnPolling();
  if (!keepView) state.view = 'summary';
  clearInterval(state.draftTimer);
  syncNav();
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
    signatureOverride: () => state.signatureManual,
    signatureImage: () => state.signatureImage,
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
      schedule: (payload, sendAt) => api.action('schedule', { kind: 'reply', payload: { id, ...payload }, sendAt }),
      unschedule: (scheduleId) => api.action('schedule-cancel', { id: scheduleId }),
      improve: (o) => api.action('text-improve', o),
      sendCheck: (o) => api.action('send-check', o),
      saveEdit: (text) => api.action('reply-edit', { id, text }),
      suggest: (q, exclude) => api.suggest(q, exclude),
      outlookDraft: (payload) => api.action('outlook-draft', { id, ...payload }),
      outlookDraftDelete: () => api.action('outlook-draft-delete', { id }),
      // Senden lässt die Mail offen; mit done wandert sie gleich nach Done (Auswahl springt dann zur nächsten Mail)
      outlookSend: async ({ done = false } = {}) => {
        if (done) return perform('outlook-send', { id, done: true }, { message: (r) => (r?.simulated ? 'Testmodus: Es wurde nichts gesendet. Die Mail liegt jetzt unter Done.' : 'Gesendet. Die Mail liegt jetzt unter Done.') });
        try {
          const r = await api.action('outlook-send', { id });
          toast(r?.simulated ? 'Testmodus: Es wurde nichts gesendet.' : 'Gesendet. Die Mail bleibt offen.');
          return true;
        } catch (e) {
          toast(e.message, { error: true });
          return false;
        }
      },
      regenerate: async (opts = {}) => {
        await api.action('regenerate-draft', { id, ...opts }).catch(failed);
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
  if (state.controller.hasDraftPanel && !data.draft && !p.entwurf_fehler && !p.is_test && p.antwort_noetig) {
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
  if (!address || !leaveCompose()) return;
  state.learning = false;
  state.contacts = state.outbox = state.rules = state.sig = state.tasks = null;
  stopLearnPolling();
  state.profile = String(address).toLowerCase();
  state.profileTab = 'mails';
  clearInterval(state.draftTimer);
  state.controller = null;
  syncNav();
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
    compose: (address) => openCompose({ to: [address] }),
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
  if (!leaveCompose()) return;
  state.profile = null;
  state.contacts = state.outbox = state.rules = state.sig = state.tasks = null;
  clearInterval(state.draftTimer);
  state.controller = null;
  state.learning = true;
  syncNav();
  showLearn();
}

function closeLearn() {
  stopLearnPolling();
  state.learning = false;
  if (state.selectedId != null && findItem(state.selectedId)) select(state.selectedId);
  else clearDetail();
}

// --- Kontakte (Adressbuch): Ansicht statt Detail, wie das Lernen
async function showContacts(note = state.contacts?.note || '', { focusSearch = false } = {}) {
  const c = state.contacts;
  if (!c) return;
  let data;
  try {
    data = await api.addressBook({ q: c.q, source: c.source, limit: c.limit });
  } catch (e) {
    toast(e.message, { error: true });
    return closeContacts();
  }
  if (state.contacts !== c) return; // inzwischen etwas anderes geöffnet
  c.note = note;
  const change = async (op, payload, text) => {
    try {
      const r = await api.action('book', { op, ...payload });
      await showContacts(typeof text === 'function' ? text(r) : text || '');
    } catch (e) {
      toast(e.message, { error: true });
    }
  };
  renderContacts($('detail'), data, { q: c.q, source: c.source, focusSearch }, {
    back: closeContacts,
    search: (q, source) => {
      Object.assign(c, { q, source, limit: 200 });
      return showContacts('', { focusSearch: true });
    },
    more: () => {
      c.limit += 200;
      return showContacts(c.note);
    },
    add: (p) => change('add', p, 'Kontakt hinzugefügt.'),
    edit: (address, fields) => change('edit', { address, ...fields }, c.note),
    remove: (address) => change('remove', { address }, 'Kontakt gelöscht.'),
    importText: (text) => change('import-text', { text }, (r) => `${r.added} neue Kontakte, ${r.updated} aktualisiert${r.skipped ? `, ${r.skipped} Zeilen ohne gültige Adresse` : ''}.`),
    importSent: () => change('import-sent', {}, (r) => `${r.mails} gesendete Mails gelesen, ${r.people} Empfänger neu im Adressbuch.`),
    importOutlook: () => change('import-outlook', {}, (r) => (r.empty ? 'In deinem Outlook-Kontaktordner liegen keine Kontakte (nur persönliche Kontakte sind abrufbar, das Firmenverzeichnis nicht).' : `${r.added} neue Kontakte aus Outlook, ${r.updated} aktualisiert.`)),
    openProfile: (address) => openProfile(address),
  }, note);
}

function openContacts() {
  if (!leaveCompose()) return;
  clearInterval(state.draftTimer);
  stopLearnPolling();
  state.controller = null;
  state.profile = null;
  state.learning = false;
  state.rules = state.sig = state.tasks = null;
  state.contacts = { q: '', source: '', limit: 200, note: '' };
  syncNav();
  showContacts('');
}

function closeContacts() {
  state.contacts = state.outbox = state.rules = state.sig = state.tasks = null;
  if (state.selectedId != null && findItem(state.selectedId)) select(state.selectedId);
  else clearDetail();
}

// --- Regeln (Regeldatei bearbeiten): Ansicht statt Detail
async function showRules(note = state.rules?.note || '') {
  const r = state.rules;
  if (!r) return;
  let doc = r.doc;
  if (!doc || r.reload) {
    try {
      doc = await api.rules();
    } catch (e) {
      toast(e.message, { error: true });
      return closeRules();
    }
    if (state.rules !== r) return; // inzwischen etwas anderes geöffnet
    r.doc = doc;
    r.reload = false;
  }
  r.note = note;
  // Jede Änderung antwortet mit dem neuen Dokument; bei einem Konflikt (Datei inzwischen geändert) wird neu geladen
  const change = async (payload, text) => {
    try {
      r.doc = await api.editRules(payload);
      if (payload.op === 'save-text') r.text = false;
      return showRules(text);
    } catch (e) {
      toast(e.message, { error: true });
      r.reload = true;
      return showRules(`${e.message}`);
    }
  };
  renderRules($('detail'), doc, { text: r.text }, {
    back: closeRules,
    setText: (on) => {
      r.text = on;
      return showRules('');
    },
    add: (section, text) => change({ op: 'add', section, text }, 'Regel hinzugefügt.'),
    edit: (section, index, was, text) => change({ op: 'edit', section, index, was, text }, 'Regel geändert.'),
    remove: (section, index, was) => change({ op: 'delete', section, index, was }, 'Regel gelöscht.'),
    saveText: (text, version) => change({ op: 'save-text', text, version }, 'Datei gespeichert.'),
    openExternal: () => api.openRules().catch((err) => toast(err.message, { error: true })),
  }, note);
}

function openRules() {
  if (!leaveCompose()) return;
  clearInterval(state.draftTimer);
  stopLearnPolling();
  state.controller = null;
  state.profile = null;
  state.learning = false;
  state.contacts = state.outbox = state.sig = state.tasks = null;
  state.rules = { doc: null, text: false, note: '', reload: false };
  syncNav();
  showRules('');
}

function closeRules() {
  state.rules = null;
  if (state.selectedId != null && findItem(state.selectedId)) select(state.selectedId);
  else clearDetail();
}

// --- Signatur (Optionen): Ansicht statt Detail. Von Hand eingestellt gilt sie bei Antworten und neuen Mails vor der erkannten.
async function showSignature(note = state.sig?.note || '') {
  const s = state.sig;
  if (!s) return;
  let info;
  try {
    info = await api.composeInfo();
  } catch (e) {
    toast(e.message, { error: true });
    return closeSignature();
  }
  if (state.sig !== s) return; // inzwischen etwas anderes geöffnet
  state.signatureManual = info.manual;
  state.signatureImage = info.image;
  s.note = note;
  const change = async (payload, text) => {
    try {
      const r = await api.action('signature', payload);
      state.signatureManual = r.manual;
      state.signatureImage = r.image;
      return showSignature(text);
    } catch (e) {
      toast(e.message, { error: true });
    }
  };
  renderSignature($('detail'), info, {
    back: closeSignature,
    save: (text) => change({ op: 'set', text }, text.trim() ? 'Signatur gespeichert.' : 'Mails gehen jetzt ohne Signatur raus.'),
    uploadImage: async (file) => {
      try {
        const img = await prepareSignatureImage(file);
        return change({ op: 'set-image', ...img }, 'Signaturbild gespeichert.');
      } catch (e) {
        toast(e.message, { error: true });
      }
    },
    removeImage: () => change({ op: 'remove-image' }, 'Signaturbild entfernt.'),
    reset: () => change({ op: 'reset' }, 'Die Signatur wird wieder automatisch aus deiner letzten Nachricht erkannt.'),
  }, note);
}

function openSignature() {
  if (!leaveCompose()) return;
  clearInterval(state.draftTimer);
  stopLearnPolling();
  state.controller = null;
  state.profile = null;
  state.learning = false;
  state.contacts = state.outbox = state.rules = state.tasks = null;
  state.sig = { note: '' };
  syncNav();
  showSignature('');
}

function closeSignature() {
  state.sig = state.tasks = null;
  if (state.selectedId != null && findItem(state.selectedId)) select(state.selectedId);
  else clearDetail();
}

// --- Aufgabenliste (Optionen): Ansicht statt Detail
async function showTasks(note = state.tasks?.note || '') {
  const t = state.tasks;
  if (!t) return;
  let info;
  try {
    info = await api.tasksFile();
  } catch (e) {
    toast(e.message, { error: true });
    return closeTasks();
  }
  if (state.tasks !== t) return;
  t.note = note;
  const change = async (payload, text) => {
    try {
      await api.action('tasks-file', payload);
      return showTasks(text);
    } catch (e) {
      toast(e.message, { error: true });
    }
  };
  renderTasksFile($('detail'), info, {
    back: closeTasks,
    save: (path) => change({ op: 'set', path }, 'Aufgabenliste gespeichert.'),
    reset: () => change({ op: 'reset' }, 'Es gilt wieder die Datei aus config.json.'),
    browse: (dir) => api.browse(dir),
  }, note);
}

function openTasks() {
  if (!leaveCompose()) return;
  clearInterval(state.draftTimer);
  stopLearnPolling();
  state.controller = null;
  state.profile = null;
  state.learning = false;
  state.contacts = state.outbox = state.rules = state.sig = null;
  state.tasks = { note: '' };
  syncNav();
  showTasks('');
}

function closeTasks() {
  state.tasks = null;
  if (state.selectedId != null && findItem(state.selectedId)) select(state.selectedId);
  else clearDetail();
}

// --- Kopfzeile
$('compose-link').addEventListener('click', () => openCompose());
$('outbox-link').addEventListener('click', openOutbox);
$('contacts-link').addEventListener('click', openContacts);
$('learn-link').addEventListener('click', openLearn);
$('rules-link').addEventListener('click', openRules);
$('signature-link').addEventListener('click', openSignature);
$('tasks-link').addEventListener('click', openTasks);

// Optionen: ein Menü für Kontakte, Lernen und Regeln
{
  const toggle = $('options-link');
  const menu = $('options-menu');
  toggle.append(icon('chevron', 12));
  const setOpen = (on) => {
    menu.hidden = !on;
    toggle.setAttribute('aria-expanded', String(on));
  };
  toggle.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', () => setOpen(false));
  document.addEventListener('click', (e) => !menu.hidden && !$('options-wrap').contains(e.target) && setOpen(false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
}
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
api.composeInfo().then((i) => ((state.signatureManual = i.manual), (state.signatureImage = i.image))).catch(() => {}); // eine von Hand eingestellte Signatur gilt auch bei Antworten
renderLeft();
statusBar.update();
setInterval(() => loadList().then(statusBar.update).catch(statusBar.update), 30_000);
setInterval(statusBar.update, 5_000);
