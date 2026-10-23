// Menü "Später": Zeitpunkte aus snooze-options.js, bis zu denen eine Mail ausgeblendet wird.
import { menuButton } from './menu.js';
import { snoozeOptions } from '../snooze-options.js';

export function createSnoozeMenu({ onSnooze }) {
  return menuButton({
    label: 'Später',
    iconName: 'clock',
    title: 'Mail ausblenden und später wieder anzeigen',
    items: snoozeOptions().map((o) => ({
      label: o.label,
      hint: o.date.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      onClick: () => onSnooze(o.date.toISOString()),
    })),
  });
}
