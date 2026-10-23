// Welche Anhänge hat eine Mail? Für die Listenansicht (Tag mit Dateiformaten). Outlook-Abfrage im Hintergrund, nur einmal pro
// Mail, Ergebnis lokal gemerkt (Dateinamen, ohne Inhalt). Eingebettete Bilder zählen nicht (list() liefert nur echte Anhänge).

export function createAttachmentInfo({ attachments, store, getScheduler, perRun = 6, log = console.log }) {
  const SECTION = 'attInfo';
  const failed = new Map(); // mail_id -> letzter Fehler: 10 Minuten Pause

  const remember = (mailId, items) => {
    const names = items.map((a) => a.name);
    if (JSON.stringify(store.get(SECTION, mailId)) !== JSON.stringify(names)) store.set(SECTION, mailId, names);
  };

  async function run() {
    const todo = getScheduler()
      .state.items.filter((p) => store.get(SECTION, p.mail_id) === undefined && Date.now() - (failed.get(p.mail_id) || 0) > 10 * 60 * 1000)
      .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
      .slice(0, perRun);
    for (const p of todo) {
      try {
        remember(p.mail_id, await attachments.list(p));
      } catch (e) {
        failed.set(p.mail_id, Date.now());
        log(`[attachment-info] Mail ${p.id}: ${e.message}`);
      }
    }
  }

  /** Dateinamen, [] = keine Anhänge, null = noch nicht abgefragt. */
  return { run, remember, get: (mailId) => store.get(SECTION, mailId) ?? null };
}
