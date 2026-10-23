// Den in Outlook abgelegten Entwurf wieder löschen (Rückgängig vor dem Senden oder "Entwurf verwerfen"). Nur der gemerkte Entwurf dieser Mail.
export default {
  name: 'outlook-draft-delete',
  async run({ n8n, store, scheduler }, { id }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    const saved = store.get('outlookDrafts', p.mail_id);
    if (!saved?.draftId) return { deleted: false };
    if (!String(p.mail_id).startsWith('TEST-')) {
      await n8n.deleteDraft(saved.draftId).catch((e) => {
        if (!/outlook|kein Entwurf/i.test(e.message)) throw e; // schon weg (in Outlook gelöscht oder gesendet)
      });
    }
    store.del('outlookDrafts', p.mail_id);
    return { deleted: true };
  },
};
