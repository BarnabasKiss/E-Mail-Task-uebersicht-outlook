// Leiste über der Liste, solange Mails markiert sind (Strg + Klick auf eine Zeile): Anzahl und einfache Buttons für Sammelaktionen, alles in einer Zeile.
// Zweiter Zustand "snooze": nur die Zeitpunkte zur Auswahl.
import { el } from '../util.js';
import { icon } from '../icons.js';
import { snoozeOptions } from '../snooze-options.js';

const button = (label, onClick, { iconName, title } = {}) =>
  el('button', { class: 'btn small', type: 'button', title: title || undefined, onclick: onClick }, iconName && icon(iconName, 14), label);
const iconButton = (iconName, title, onClick, cls = '') =>
  el('button', { class: `icon-btn small ${cls}`, type: 'button', title, 'aria-label': title, onclick: onClick }, icon(iconName, 14));

/** state: { count, mode: 'actions'|'snooze', allDone }; on: { done, snooze, remove, all, cancel, pick(n) } */
export function renderMarkBar(container, { count, mode, allDone }, on, now = new Date()) {
  container.hidden = count === 0;
  if (!count) return container.replaceChildren();
  if (mode === 'snooze') {
    // "Nächste Woche (Mo 08:00)" wird zu "Nächste Woche": der Zeitpunkt steht im Tooltip
    container.replaceChildren(
      ...snoozeOptions(now).map((o, i) => button(o.label.replace(/\s*\(.*\)/, ''), () => on.pick(i + 1), { title: `${o.label}: ${o.date.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' })}` })),
      el('span', { class: 'spacer' }),
      iconButton('x', 'Zurück', on.cancel),
    );
    return container;
  }
  container.replaceChildren(
    el('strong', { class: 'mark-count' }, `${count} markiert`),
    button(allDone ? 'Zurückholen' : 'Done', on.done, { iconName: allDone ? 'undo' : 'check', title: allDone ? 'Alle markierten zurück nach Offen holen' : 'Alle markierten in Done ablegen' }),
    !allDone && button('Später', on.snooze, { iconName: 'clock', title: 'Alle markierten zurückstellen' }),
    iconButton('trash', 'Alle markierten endgültig löschen', on.remove, 'danger'),
    el('span', { class: 'spacer' }),
    button('Alle', on.all, { title: 'Alle Mails der Liste markieren' }),
    iconButton('x', 'Markierung aufheben', on.cancel),
  );
  return container;
}
