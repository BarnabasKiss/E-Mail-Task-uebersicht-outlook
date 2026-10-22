// Entwurf neu erzeugen (nach Änderung der Regeln oder wenn der Entwurf nicht passt).
export default {
  name: 'regenerate-draft',
  async run({ drafts, scheduler }, { id }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    return drafts.generate(p);
  },
};
