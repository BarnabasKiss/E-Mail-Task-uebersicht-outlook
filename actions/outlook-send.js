// Den abgelegten Entwurf wirklich senden. Nur der gemerkte Entwurf dieser Mail, nie eine beliebige ID. Danach gilt die Mail als beantwortet
// und das Lernen kann den gesendeten Text mit dem Entwurf vergleichen.
import { mailMeta } from '../lib/drafts.js';

export default {
  name: 'outlook-send',
  async run({ n8n, store, scheduler, drafts }, { id }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    const saved = store.get('outlookDrafts', p.mail_id);
    if (!saved?.draftId) throw new Error('Es gibt keinen abgelegten Entwurf, den man senden könnte');
    if (/\[BITTE ERGÄNZEN/i.test(saved.text)) throw new Error('Im Entwurf steht noch „[BITTE ERGÄNZEN …]“. Bitte ergänzen oder entfernen.');
    const test = String(p.mail_id).startsWith('TEST-'); // Testmail: nichts wird gesendet, die Mail wandert trotzdem nach Done
    if (!test) await n8n.sendDraft(saved.draftId);
    store.del('outlookDrafts', p.mail_id);

    // Ab hier ist die Mail raus: Fehler dürfen das nicht mehr als Fehlschlag melden
    try {
      if (!test) {
        const mail = await drafts.getMail(p).catch(() => null);
        store.set('replies', p.mail_id, { reply: { body: saved.text }, meta: mail ? mailMeta(mail) : {}, at: new Date().toISOString() }); // nur echte Antworten lehren die App etwas
      }
      await n8n.setStatus(p.id, 'beantwortet');
      scheduler.moveToArchive(p, 'beantwortet');
    } catch {
      // die Antworterkennung holt den Status später nach
    }
    return { sent: !test, simulated: test };
  },
};
