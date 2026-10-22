// Aufgabe übernehmen: in "3 Aufgaben" einfügen, Vorschlag in n8n als angenommen markieren.
export default {
  name: 'accept',
  async run({ n8n, vault, scheduler }, { id, text, heading, newHeading, due, important }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    const result = vault.addTask({ heading, newHeading, text, link: p.web_link, due, important: !!important });
    await n8n.setStatus(p.id, 'angenommen');
    scheduler.moveToArchive(p, 'angenommen'); // bleibt in Done durchsuchbar
    return result;
  },
};
