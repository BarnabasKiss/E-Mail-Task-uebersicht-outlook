// Wie kam die Mail zu mir? "direkt" (ich stehe in An), "cc" (ich stehe in Cc) oder "shared" (weder noch: Shared Inbox,
// Verteiler oder Bcc). Outlook liefert das nicht als Feld, die App liest es aus An/Cc der Mail und merkt es sich lokal.

const ROLES = ['direkt', 'cc', 'shared'];

/** aliases: weitere eigene Adressen. Ohne ownAddress ist keine Aussage möglich (null). */
export function roleOf(mail, ownAddress, aliases = []) {
  const mine = new Set([ownAddress, ...aliases].filter(Boolean).map((a) => a.toLowerCase()));
  if (!mine.size) return null;
  const has = (list) => (list || []).some((r) => mine.has(String(r?.emailAddress?.address || '').toLowerCase()));
  if (has(mail?.toRecipients)) return 'direkt';
  if (has(mail?.ccRecipients)) return 'cc';
  return 'shared';
}

/** Hintergrundjob: bestimmt die Rolle neuer Mails (höchstens perRun pro Durchlauf, neueste zuerst) und speichert sie. */
export function createRoles({ drafts, store, ownAddress, aliases = [], getScheduler, perRun = 6, log = console.log }) {
  const SECTION = 'roles';
  const failed = new Map(); // mail_id -> Zeitpunkt des letzten Fehlers: 10 Minuten Pause, damit eine kaputte Mail nicht alle blockiert

  /** Rolle aus einer schon geladenen Mail merken (z. B. beim Öffnen der Detailansicht). */
  function remember(mailId, mail) {
    const role = roleOf(mail, ownAddress, aliases);
    if (role && store.get(SECTION, mailId) !== role) store.set(SECTION, mailId, role);
    return role;
  }

  async function run() {
    const todo = getScheduler()
      .state.items.filter((p) => !store.get(SECTION, p.mail_id) && Date.now() - (failed.get(p.mail_id) || 0) > 10 * 60 * 1000)
      .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
      .slice(0, perRun);
    for (const p of todo) {
      try {
        remember(p.mail_id, await drafts.getMail(p));
      } catch (e) {
        failed.set(p.mail_id, Date.now());
        log(`[roles] Mail ${p.id}: ${e.message}`);
      }
    }
  }

  return { run, remember, get: (mailId) => (ROLES.includes(store.get(SECTION, mailId)) ? store.get(SECTION, mailId) : null) };
}
