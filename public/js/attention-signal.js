// Verbindet die Zählung (attention.js) mit dem Browser: Tab-Symbol und Titel, Puls und Systembenachrichtigungen für neue wichtige Mails.
import { icon } from './icons.js';
import { attentionOf, freshImportant } from './attention.js';
import { createTabSignal } from './tab-signal.js';
import { notifySupported, notifyFresh, notifyTest, seenIds, rememberSeen } from './notifier.js';

/** update(items) bei jeder neuen Liste aufrufen. onOpen(id): Klick auf eine Benachrichtigung öffnet die Mail. */
export function createAttentionSignal({ onOpen }) {
  const tabSignal = createTabSignal();
  let lastImportant = -1; // -1 = noch keine Liste gesehen (der erste Stand pulsiert nicht)
  return {
    update(items) {
      const a = attentionOf(items);
      const { fresh, ids } = freshImportant(seenIds(), a.importantItems);
      rememberSeen(ids);
      tabSignal.update({ open: a.open, important: a.important, pulse: lastImportant >= 0 && fresh.length > 0 });
      lastImportant = a.important;
      if (fresh.length) notifyFresh(fresh, { onOpen });
    },
  };
}

/** Glocke oben rechts: fragt einmal um Erlaubnis, danach schickt ein Klick eine Testmeldung. Versteckt, wenn der Browser es nicht kann. */
export function setupNotifyButton(btn) {
  if (!notifySupported()) return;
  const paint = () => {
    const p = Notification.permission;
    btn.hidden = false;
    btn.replaceChildren(icon('bell', 15));
    btn.classList.toggle('on', p === 'granted');
    btn.title =
      p === 'granted' ? 'Benachrichtigungen für neue wichtige Mails sind an. Klicken für eine Testmeldung.'
      : p === 'denied' ? 'Benachrichtigungen sind im Browser blockiert (Seiteneinstellungen von localhost:4711 ändern).'
      : 'Benachrichtigungen für neue wichtige Mails einschalten';
    btn.setAttribute('aria-label', btn.title);
  };
  btn.addEventListener('click', async () => {
    if (Notification.permission === 'default') await Notification.requestPermission();
    else if (Notification.permission === 'granted') notifyTest();
    paint();
  });
  paint();
}
