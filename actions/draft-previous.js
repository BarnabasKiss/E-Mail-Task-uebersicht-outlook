// Entwurf: eine Version zurück (tauscht den Entwurf mit dem vorigen, nochmal klicken stellt ihn wieder her).
export default {
  name: 'draft-previous',
  async run({ store, scheduler }, { id }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    const d = store.get('drafts', p.mail_id);
    if (!d?.previous?.text) throw new Error('Es gibt keine vorige Version');
    store.set('drafts', p.mail_id, { ...d, text: d.previous.text, createdAt: d.previous.createdAt || d.createdAt, previous: { text: d.text, createdAt: d.createdAt } });
    return { ok: true };
  },
};
