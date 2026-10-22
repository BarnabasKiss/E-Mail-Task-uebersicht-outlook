// Hintergrundarbeit: Vorschläge holen, Antworten erkennen, Entwürfe erzeugen, aus Antworten lernen.
import { mailMeta } from './drafts.js';
import { isTestMail } from './test-mail.js';

export const needsReply = (p) => p.antwort_noetig === true || p.antwort_noetig === 'true';
// Testmails brauchen keine automatische Antwortprüfung und keine Hintergrund-Entwürfe (nur per Klick).
const autoReply = (p) => needsReply(p) && !isTestMail(p);

// Alles, was bearbeitet ist, liegt im Bereich "Done" (durchsuchbar, zurückholbar).
export const ARCHIVE_STATUSES = ['done', 'angenommen', 'beantwortet'];

const ERROR_BACKOFF_MS = 10 * 60 * 1000;
const byFiledDesc = (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || b.id - a.id;

export function createScheduler({ n8n, drafts, learner, store, poll, log = console.log }) {
  const state = { items: [], archive: [], fetchedAt: null, archiveAt: null, error: null };
  const busy = new Set();
  const timers = [];

  const guarded = (name, fn) => async () => {
    if (busy.has(name)) return;
    busy.add(name);
    try {
      await fn();
    } catch (e) {
      log(`[${name}] ${e.message}`);
    } finally {
      busy.delete(name);
    }
  };

  async function refreshProposals() {
    try {
      state.items = await n8n.listProposals('neu');
      state.fetchedAt = new Date().toISOString();
      state.error = null;
    } catch (e) {
      state.error = e.message;
      throw e;
    }
  }

  async function refreshArchive() {
    const lists = await Promise.all(ARCHIVE_STATUSES.map((s) => n8n.listProposals(s)));
    state.archive = lists.flat().sort(byFiledDesc);
    state.archiveAt = new Date().toISOString();
  }

  async function checkReplies() {
    const every = poll.repliesSec * 1000;
    for (const p of state.items.filter(autoReply)) {
      const last = store.get('replyChecks', p.mail_id);
      if (last && Date.now() - last < every) continue;
      try {
        const r = await n8n.hasReply(p);
        store.set('replyChecks', p.mail_id, Date.now());
        if (!r?.hasReply) continue;
        const mail = await drafts.getMail(p).catch(() => null);
        store.set('replies', p.mail_id, { reply: r.reply, meta: mail ? mailMeta(mail) : {}, at: new Date().toISOString() });
        await n8n.setStatus(p.id, 'beantwortet');
        moveToArchive(p, 'beantwortet');
      } catch (e) {
        store.set('replyChecks', p.mail_id, Date.now()); // nicht bei jedem Durchlauf neu versuchen
        log(`[replies] Mail ${p.id}: ${e.message}`);
      }
    }
  }

  async function makeDrafts() {
    for (;;) {
      const next = state.items.find((p) => {
        if (!autoReply(p) || store.get('drafts', p.mail_id)) return false;
        const err = store.get('draftErrors', p.mail_id);
        return !err || Date.now() - err.at > ERROR_BACKOFF_MS;
      });
      if (!next) return;
      try {
        await drafts.generate(next);
      } catch (e) {
        store.set('draftErrors', next.mail_id, { at: Date.now(), message: e.message });
        log(`[drafts] ${e.message}`);
      }
    }
  }

  async function learn() {
    for (const mailId of Object.keys(store.all('replies'))) {
      if (store.get('learned', mailId) || !store.get('drafts', mailId)) continue;
      await learner.learnFor(mailId);
    }
  }

  // Sofort in die Ansicht übernehmen, ohne auf die nächste Abfrage zu warten.
  function moveToArchive(p, status) {
    state.items = state.items.filter((x) => String(x.id) !== String(p.id));
    state.archive = [{ ...p, status, updatedAt: new Date().toISOString() }, ...state.archive.filter((x) => String(x.id) !== String(p.id))];
  }

  const jobs = [
    ['proposals', refreshProposals, poll.proposalsSec],
    ['archive', refreshArchive, poll.archiveSec ?? 300],
    ['replies', checkReplies, poll.repliesSec],
    ['drafts', makeDrafts, poll.draftsSec],
    ['learn', learn, poll.learnSec],
  ];

  return {
    state,
    find: (id) => state.items.find((p) => String(p.id) === String(id)) || state.archive.find((p) => String(p.id) === String(id)),
    isArchived: (id) => state.archive.some((p) => String(p.id) === String(id)),
    moveToArchive,
    remove(id) {
      state.items = state.items.filter((p) => String(p.id) !== String(id));
      state.archive = state.archive.filter((p) => String(p.id) !== String(id));
    },
    refresh: guarded('refresh', async () => {
      await refreshProposals();
      await refreshArchive();
    }),
    start() {
      jobs.forEach(([name, fn, sec], i) => {
        const run = guarded(name, fn);
        setTimeout(run, 500 + i * 3000);
        timers.push(setInterval(run, sec * 1000));
      });
    },
    stop: () => timers.forEach(clearInterval),
  };
}
