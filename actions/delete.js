// Löschen: entfernt die Konversation vollständig aus der Mail-Übersicht (Tabellenzeile in n8n und alles Lokale:
// Entwurf, Zuordnung, Zurückstellung). Auch in Done ist sie danach nicht mehr zu finden. Outlook bleibt unverändert.
export default {
  name: 'delete',
  async run({ n8n, store, scheduler }, { id }) {
    const p = scheduler.find(id);
    if (!p) throw new Error('Eintrag nicht gefunden (evtl. schon gelöscht)');
    await n8n.deleteRow(p.id);
    store.purge(p.mail_id);
    scheduler.remove(p.id);
    return { deleted: true };
  },
};
