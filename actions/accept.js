// Aufgabe übernehmen: in "3 Aufgaben" einfügen. Die Mail bleibt in "Offen" (sie kann noch beantwortet werden); lokal wird
// nur vermerkt, dass die Aufgabe übernommen ist, damit die Ansicht sie nicht noch einmal vorschlägt.
export default {
  name: 'accept',
  async run({ vault, scheduler, store }, { id, text, heading, newHeading, due, important }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Vorschlag nicht gefunden (evtl. schon bearbeitet)');
    const result = vault.addTask({ heading, newHeading, text, link: p.web_link, due, important: !!important });
    store.set('tasks', p.mail_id, { at: new Date().toISOString(), text, heading: newHeading || heading || '' });
    return result;
  },
};
