// Den abgelegten Entwurf wirklich senden. Nur der gemerkte Entwurf dieser Mail, nie eine beliebige ID. Die Mail bleibt danach offen (die automatische
// Antworterkennung lässt sie in Ruhe); mit done wandert sie gleich nach Done. Das Lernen kann den gesendeten Text mit dem Entwurf vergleichen.
import { afterReplySent } from '../lib/reply-sent.js';

export default {
  name: 'outlook-send',
  async run(services, { id, done = false }) {
    const { n8n, store, scheduler } = services;
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    const saved = store.get('outlookDrafts', p.mail_id);
    if (!saved?.draftId) throw new Error('Es gibt keinen abgelegten Entwurf, den man senden könnte');
    if (/\[BITTE ERGÄNZEN/i.test(saved.text)) throw new Error('Im Entwurf steht noch „[BITTE ERGÄNZEN …]“. Bitte ergänzen oder entfernen.');
    const test = String(p.mail_id).startsWith('TEST-'); // Testmail: nichts wird gesendet
    if (!test) await n8n.sendDraft(saved.draftId);
    await afterReplySent(services, p, saved.text, { test, done });
    return { sent: !test, simulated: test, done };
  },
};
