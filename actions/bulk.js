// Sammelaktion: dieselbe Aktion für mehrere Mails nacheinander (Done, Zurückholen, Später, Löschen).
// Ein Fehler bei einer Mail stoppt die anderen nicht; die Antwort nennt, was geklappt hat und was nicht.
const ALLOWED = ['archive', 'restore', 'snooze', 'delete'];
const MAX_IDS = 200;

export default {
  name: 'bulk',
  async run(services, { action, ids, ...payload }) {
    if (!ALLOWED.includes(action)) throw new Error(`Als Sammelaktion nicht möglich: ${action}`);
    if (!Array.isArray(ids) || !ids.length) throw new Error('Keine Mails ausgewählt');
    if (ids.length > MAX_IDS) throw new Error(`Höchstens ${MAX_IDS} Mails auf einmal`);

    const failed = [];
    let done = 0;
    let ignored = 0;
    for (const id of [...new Set(ids)]) {
      try {
        // Zurückholen lädt die Listen sonst nach jeder Mail neu: einmal am Ende genügt
        const result = await services.actions[action].run(services, { ...payload, id, ...(action === 'restore' ? { refresh: false } : {}) });
        done += 1;
        if (result?.ignored) ignored += 1;
      } catch (e) {
        failed.push({ id, error: e.message });
      }
    }
    if (action === 'restore' && done) await services.scheduler.refresh();
    return { done, failed, ignored };
  },
};
