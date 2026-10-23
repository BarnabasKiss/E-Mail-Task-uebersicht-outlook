// Ausgang der App: Entwürfe neuer Mails (nur in der App, nicht in Outlook) und geplante Mails (neue Mails und Antworten).
// Eine geplante Mail liegt bis zur Sendezeit nur hier. Zur Sendezeit legt ein Hintergrundjob sie in Outlook als Entwurf an und sendet sie sofort,
// so bleiben keine halbfertigen Entwürfe in Outlook liegen und jede geplante Mail lässt sich bis zuletzt ändern oder abbrechen.
// Die App muss zur Sendezeit laufen: war sie aus, geht die Mail beim nächsten Start sofort raus.
import { cleanRecipients } from '../actions/outlook-draft.js';
import { afterReplySent } from './reply-sent.js';
import { imageFor } from './signature-setting.js';

const MIN_AHEAD_MS = 20_000;
const MAX_AHEAD_MS = 366 * 86400_000;
const MAX_TRIES = 3;
const RETRY_MS = 60_000;
const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// getScheduler: der Scheduler entsteht erst nach dem Ausgang (server.js), deshalb wird er bei Bedarf geholt
export function createOutbox({ n8n, store, scheduler: fixed, getScheduler, drafts, addressBook, now = () => Date.now(), log = console.log }) {
  const sched = () => (getScheduler ? getScheduler() : fixed);
  const services = () => ({ n8n, store, scheduler: sched(), drafts });

  // --- Entwürfe neuer Mails
  function saveDraft({ id, subject = '', text = '', to = [], cc = [], bcc = [] }) {
    const key = id && store.get('mailDrafts', id) ? id : uid('d');
    const clean = (l) => (Array.isArray(l) ? l : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean).slice(0, 60);
    const draft = { id: key, subject: String(subject).slice(0, 300), text: String(text).slice(0, 60000), to: clean(to), cc: clean(cc), bcc: clean(bcc), updatedAt: new Date(now()).toISOString() };
    store.set('mailDrafts', key, draft);
    return { id: key, updatedAt: draft.updatedAt };
  }
  const listDrafts = () => Object.values(store.all('mailDrafts')).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const getDraft = (id) => store.get('mailDrafts', id) || null;
  const deleteDraft = (id) => (store.get('mailDrafts', id) ? (store.del('mailDrafts', id), true) : false);

  // --- Geplante Mails
  function checked(kind, payload) {
    const to = cleanRecipients(payload.to, 'An');
    const cc = cleanRecipients(payload.cc, 'CC').filter((a) => !to.includes(a));
    const bcc = cleanRecipients(payload.bcc, 'BCC').filter((a) => !to.includes(a) && !cc.includes(a));
    if (!to.length) throw new Error('Es fehlt ein Empfänger bei An');
    if (to.length + cc.length + bcc.length > 60) throw new Error('Höchstens 60 Empfänger');
    const text = String(payload.text || '').trim();
    if (!text) throw new Error('Der Text ist leer');
    if (/\[BITTE ERGÄNZEN/i.test(text)) throw new Error('Im Text steht noch „[BITTE ERGÄNZEN …]“. Bitte ergänzen oder entfernen.');
    if (kind === 'new') {
      const subject = String(payload.subject || '').replace(/[\r\n]+/g, ' ').trim();
      if (!subject) throw new Error('Es fehlt der Betreff');
      if (subject.length > 300) throw new Error('Der Betreff ist zu lang (höchstens 300 Zeichen)');
      return { subject, text, to, cc, bcc, ...(payload.signatureImage === true && { signatureImage: true }) };
    }
    if (!sched().find(payload.id)) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    return { id: payload.id, text, to, cc, bcc, done: payload.done === true, ...(payload.signatureImage === true && { signatureImage: true }) };
  }

  function schedule({ kind, payload, sendAt, fromDraftId }) {
    if (!['new', 'reply'].includes(kind)) throw new Error('Unbekannte Art');
    const at = Date.parse(sendAt);
    if (Number.isNaN(at)) throw new Error('Ungültige Sendezeit');
    if (at < now() + MIN_AHEAD_MS) throw new Error('Die Sendezeit muss in der Zukunft liegen');
    if (at > now() + MAX_AHEAD_MS) throw new Error('Die Sendezeit liegt zu weit in der Zukunft (höchstens ein Jahr)');
    const item = { id: uid('s'), kind, payload: checked(kind, payload), sendAt: new Date(at).toISOString(), createdAt: new Date(now()).toISOString(), status: 'geplant', attempts: 0, error: '' };
    store.set('scheduled', item.id, item);
    if (fromDraftId) deleteDraft(fromDraftId);
    return item;
  }

  const listScheduled = () => Object.values(store.all('scheduled')).sort((a, b) => String(a.sendAt).localeCompare(String(b.sendAt)));

  /** Abbrechen. Bei einer neuen Mail mit toDraft landet der Inhalt wieder als Entwurf in der App (zum Weiterschreiben). */
  function cancel(id, { toDraft = false } = {}) {
    const item = store.get('scheduled', id);
    if (!item) return { cancelled: false };
    store.del('scheduled', id);
    if (toDraft && item.kind === 'new') return { cancelled: true, draftId: saveDraft(item.payload).id };
    return { cancelled: true };
  }

  async function deliver(item) {
    const { kind, payload } = item;
    if (kind === 'new') {
      const out = await n8n.saveNewDraft({ ...payload, ...imageFor(store, payload) });
      if (!out?.draftId) throw new Error('Outlook hat keinen Entwurf angelegt');
      try {
        await n8n.sendDraft(out.draftId);
      } catch (e) {
        await n8n.deleteDraft(out.draftId).catch(() => {}); // keinen halben Entwurf in Outlook zurücklassen
        throw e;
      }
      addressBook?.touch([...payload.to, ...payload.cc, ...payload.bcc]);
      return;
    }
    const p = sched().find(payload.id);
    if (!p) throw new Error('Die Mail ist nicht mehr in der Übersicht');
    const test = String(p.mail_id).startsWith('TEST-'); // Testmail: simuliert
    if (!test) {
      const out = await n8n.saveDraft({ id: p.mail_id, text: payload.text, to: payload.to, cc: payload.cc, bcc: payload.bcc, ...imageFor(store, payload) });
      if (!out?.draftId) throw new Error('Outlook hat keinen Entwurf angelegt');
      try {
        await n8n.sendDraft(out.draftId);
      } catch (e) {
        await n8n.deleteDraft(out.draftId).catch(() => {});
        throw e;
      }
      addressBook?.touch([...payload.to, ...payload.cc, ...payload.bcc]);
    }
    await afterReplySent(services(), p, payload.text, { test, done: payload.done });
  }

  let running = false;
  async function send(item) {
    store.set('scheduled', item.id, { ...item, status: 'sendet', lastTry: now() });
    try {
      await deliver(item);
      store.del('scheduled', item.id);
      return { sent: true };
    } catch (e) {
      const attempts = item.attempts + 1;
      store.set('scheduled', item.id, { ...item, status: 'fehler', attempts, error: e.message, lastTry: now() });
      log(`[outbox] ${item.id}: ${e.message}`);
      return { sent: false, error: e.message };
    }
  }

  /** Hintergrundjob: alles senden, was fällig ist (nacheinander; ein Fehler wird nach einer Minute bis zu dreimal wiederholt). */
  async function runDue() {
    if (running) return;
    running = true;
    try {
      for (const item of listScheduled()) {
        const due = Date.parse(item.sendAt) <= now();
        const retry = item.status === 'fehler' && item.attempts < MAX_TRIES && now() - (item.lastTry || 0) >= RETRY_MS;
        if (due && (item.status === 'geplant' || retry)) await send(item);
        else if (item.status === 'sendet' && now() - (item.lastTry || 0) > 10 * 60_000) store.set('scheduled', item.id, { ...item, status: 'geplant' }); // hing beim letzten Absturz
      }
    } finally {
      running = false;
    }
  }

  /** "Jetzt senden" bei einer geplanten Mail (auch nach Fehlern). */
  async function sendNow(id) {
    const item = store.get('scheduled', id);
    if (!item) throw new Error('Diese Mail ist nicht mehr geplant');
    const r = await send({ ...item, attempts: 0 });
    if (!r.sent) throw new Error(r.error);
    return r;
  }

  const counts = () => ({ drafts: listDrafts().length, scheduled: listScheduled().length, failed: listScheduled().filter((i) => i.status === 'fehler').length });

  return { saveDraft, listDrafts, getDraft, deleteDraft, schedule, listScheduled, cancel, runDue, sendNow, counts };
}
