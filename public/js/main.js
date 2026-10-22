import { api } from './api.js';
import { el, formatShort, toast } from './util.js';
import { icon } from './icons.js';
import { TABS, renderTabs, renderList, matchesQuery } from './components/list.js';
import { renderDetail, renderLoading, renderEmpty } from './components/detail.js';

const $ = (id) => document.getElementById(id);
const state = { items: [], archive: [], ownAddress: '', tab: 'offen', query: '', selectedId: null, view: 'summary', controller: null, draftTimer: null };

const DELETE_TEXT =
  'Konversation endgültig löschen?\n\nSie wird aus der Mail-Übersicht entfernt und ist auch in Done nicht mehr zu finden. Das lässt sich nicht rückgängig machen.\nIn Outlook bleibt die Mail unverändert.';

// --- Deep-Link: #mail=ID&view=message&tab=done&q=suche
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { mail: p.get('mail'), view: p.get('view') === 'message' ? 'message' : 'summary', tab: p.get('tab'), q: p.get('q') || '' };
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.selectedId) p.set('mail', state.selectedId);
  if (state.view === 'message') p.set('view', 'message');
  history.replaceState(null, '', p.toString() ? `#${p}` : location.pathname);
}

// --- Liste
const everything = () => [...state.items, ...state.archive];
const searching = () => state.query.trim().length > 0;
const findItem = (id) => everything().find((m) => String(m.id) === String(id));
function visibleItems() {
  if (searching()) return everything().filter((m) => matchesQuery(m, state.query));
  return everything().filter(TABS.find((t) => t.id === state.tab).test);
}
const tabOf = (m) => TABS.find((t) => t.test(m))?.id || 'offen';

function renderLeft() {
  renderTabs($('tabs'), everything(), state.tab, searching(), (tab) => {
    state.tab = tab;
    $('search').value = '';
    state.query = '';
    $('search-clear').hidden = true;
    renderLeft();
  });
  renderList($('list'), {
    items: visibleItems(),
    selectedId: state.selectedId,
    query: state.query,
    tab: state.tab,
    actions: { select, archive: quickArchive, remove: quickRemove, restore: quickRestore },
  });
}

async function loadList(fn = api.proposals) {
  const data = await fn();
  state.items = data.items;
  state.archive = data.archive || [];
  state.ownAddress = data.ownAddress;
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
        perform('accept', { id, ...payload }, { message: (r) => (r?.duplicate ? 'Diese Aufgabe steht schon in der Liste.' : 'Aufgabe übernommen. Die Mail liegt jetzt in Done.') }),
      archive: ({ ignoreSender }) => archive(id, ignoreSender),
      remove: () => quickRemove(id),
      restore: () => quickRestore(id),
      snooze: (until) => perform('snooze', { id, until }, { message: 'Zurückgestellt' }),
      reload: () => select(id),
      attachments: () => api.attachments(id),
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
  if (data.proposal.aufgabe_text) {
    api
      .match(id)
      .then((m) => String(state.selectedId) === String(id) && state.controller?.setMatch(m))
      .catch((e) => toast(e.message, { error: true }));
  } else {
    state.controller.setMatch({ heading: null, quiet: true, reason: 'Keine Aufgabe vorgeschlagen. Du kannst trotzdem eine anlegen.' });
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
$('search').addEventListener('input', (e) => {
  state.query = e.target.value;
  $('search-clear').hidden = !state.query;
  renderLeft();
});
$('search-clear').addEventListener('click', () => {
  $('search').value = '';
  state.query = '';
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

// --- Start
const hash = readHash();
state.view = hash.view;
if (new URLSearchParams(location.hash.slice(1)).get('theme') === 'light') document.documentElement.dataset.theme = 'light';
if (hash.tab && TABS.some((t) => t.id === hash.tab)) state.tab = hash.tab;
if (hash.q) {
  state.query = hash.q;
  $('search').value = hash.q;
  $('search-clear').hidden = false;
}
await loadList().catch((e) => toast(e.message, { error: true }));
const wanted = hash.mail && findItem(hash.mail);
if (wanted && !hash.tab && !hash.q) state.tab = tabOf(wanted);
const first = wanted || visibleItems()[0];
if (first) select(first.id);
else renderEmpty($('detail'), 'Keine offenen Mails. Neue erscheinen hier automatisch.');
renderLeft();
updateStatus();
setInterval(() => loadList().then(updateStatus).catch(updateStatus), 30_000);
setInterval(updateStatus, 5_000);
