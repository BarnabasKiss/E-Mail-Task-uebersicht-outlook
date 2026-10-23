import { whyImportant } from './attention.js';

const KEY = 'mailapp.importantSeen';
const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};
const write = (ids) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Browser ohne Speicher: dann gibt es nach dem Neuladen höchstens eine Benachrichtigung zu viel
  }
};

export const notifySupported = () => typeof Notification !== 'undefined';
export const seenIds = read;
export const rememberSeen = write;

/**
 * Systembenachrichtigung für neue wichtige Mails (Notification-API, vom Browser nach einmaliger Freigabe erlaubt).
 * Mehr als 3 neue auf einmal werden zu einer Meldung zusammengefasst. Testmails melden nichts.
 * onOpen(id) wird beim Klick aufgerufen (die App springt zur Mail).
 */
export function notifyFresh(fresh, { onOpen, now = new Date() }) {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  const real = fresh.filter((m) => !m.is_test);
  const show = (title, body, tag, id) => {
    const n = new Notification(title, { body, tag, renotify: false });
    n.onclick = () => {
      window.focus();
      if (id != null) onOpen(id);
      n.close();
    };
  };
  if (real.length > 3) show(`${real.length} neue wichtige Mails`, real.map((m) => m.absender).slice(0, 4).join(', '), 'mail-bulk');
  else for (const m of real) show(`Wichtig: ${m.absender || m.absender_mail}`, `${m.betreff}\n${whyImportant(m, now)}`, `mail-${m.id}`, m.id);
}

/** Zum Ausprobieren: eine Testmeldung, damit man sieht, dass es ankommt. */
export function notifyTest() {
  new Notification('Mail-Übersicht', { body: 'So melden sich neue wichtige Mails.', tag: 'mail-test' });
}
