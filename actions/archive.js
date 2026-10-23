// Done: erledigt, keine Aufgabe nötig. Die Mail wandert nach "Done": sie bleibt durchsuchbar und lässt sich
// zurückholen. Optional den Absender künftig ignorieren (Regel landet in Mail-Regeln.md).
export default {
  name: 'archive',
  async run({ n8n, rules, scheduler }, { id, ignoreSender }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    await n8n.setStatus(p.id, 'done');
    scheduler.moveToArchive(p, 'done');
    const ignored = ignoreSender ? rules.appendIgnore(p.absender_mail) : false;
    return { ignored };
  },
};
