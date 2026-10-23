// Was nach dem Senden einer Antwort aus der App zu tun ist (sofort oder zur geplanten Zeit): Entwurfsreste wegräumen, die Mail gegen die automatische
// Antworterkennung schützen (sie bleibt offen), den gesendeten Text zum Lernen merken und auf Wunsch die Mail nach Done legen.
import { mailMeta } from './drafts.js';

export async function afterReplySent({ n8n, store, scheduler, drafts }, p, text, { test = false, done = false } = {}) {
  store.del('outlookDrafts', p.mail_id);
  store.del('draftEdits', p.mail_id);
  store.set('appSent', p.mail_id, new Date().toISOString());
  // Ab hier ist die Mail raus: Fehler dürfen das nicht mehr als Fehlschlag melden
  try {
    if (!test) {
      const mail = await drafts.getMail(p).catch(() => null);
      store.set('replies', p.mail_id, { reply: { body: text }, meta: mail ? mailMeta(mail) : {}, at: new Date().toISOString() }); // nur echte Antworten lehren die App etwas
    }
    if (done) {
      await n8n.setStatus(p.id, 'beantwortet');
      scheduler.moveToArchive(p, 'beantwortet');
    }
  } catch {
    // die Antworterkennung holt den Status später nach
  }
}
