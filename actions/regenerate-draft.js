// Entwurf neu erzeugen (nach Änderung der Regeln oder wenn der Entwurf nicht passt), optional als Variante
// (kuerzer, foermlicher, freundlicher, ablehnung) und mit einem Hinweis von Barni. base = Text im Entwurfsfeld.
export default {
  name: 'regenerate-draft',
  async run({ drafts, scheduler }, { id, variant, hint, base }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    return drafts.generate(p, { variant, hint, base });
  },
};
