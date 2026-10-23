// "Senden planen": Knopf mit kleinem Fenster (heute 16:00, morgen 08:00, Montag 08:00 oder eigene Zeit). Wählt die Zeit; geplant wird in der App.
import { el, toast } from '../util.js';
import { icon } from '../icons.js';
import { snoozeOptions } from '../snooze-options.js';

const two = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;

/**
 * onPick(iso, { done }) wird mit der gewählten Zeit aufgerufen. withDone: zeigt "Danach in Done ablegen" (bei Antworten).
 * @returns {{ node, setDisabled(off, why) }}
 */
export function createScheduleMenu({ onPick, withDone = false, now = () => new Date() }) {
  const done = el('input', { type: 'checkbox', 'aria-label': 'Danach in Done ablegen' });
  const when = el('input', { type: 'datetime-local', class: 'sch-when', 'aria-label': 'Eigene Sendezeit' });
  const pop = el('div', { class: 'sch-pop', role: 'dialog', 'aria-label': 'Senden planen', hidden: true });
  const toggle = el('button', { class: 'btn', type: 'button', 'aria-expanded': 'false', onclick: () => (pop.hidden ? open() : close()) }, icon('clock', 15), el('span', {}, 'Senden planen'));
  const node = el('span', { class: 'sch' }, toggle, pop);

  function pick(date) {
    if (date.getTime() < now().getTime() + 60_000) return toast('Die Sendezeit muss in der Zukunft liegen.', { error: true });
    close();
    onPick(date.toISOString(), { done: withDone && done.checked });
  }

  function open() {
    const d = new Date(now().getTime() + 3600_000);
    d.setMinutes(0, 0, 0);
    when.value = local(d);
    pop.replaceChildren(
      ...[
      ...snoozeOptions(now()).map((o) =>
        el('button', { class: 'menu-item', type: 'button', onclick: () => pick(o.date) }, el('span', {}, o.label), el('small', {}, o.date.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' }))),
      ),
      el('div', { class: 'sch-custom' }, el('label', {}, 'Eigene Zeit'), when, el('button', { class: 'btn small primary', type: 'button', onclick: () => (when.value ? pick(new Date(when.value)) : toast('Wähle Datum und Uhrzeit.', { error: true })) }, 'Planen')),
      withDone && el('label', { class: 'sch-done' }, done, 'Danach in Done ablegen'),
      el('p', { class: 'hint' }, 'Die App sendet die Mail zur gewählten Zeit. Sie muss dann laufen; war sie aus, geht die Mail beim nächsten Start sofort raus.'),
      ].filter(Boolean), // replaceChildren würde ein false als Text "false" einfügen
    );
    pop.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }
  function close() {
    pop.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  // Listener am document räumen sich selbst auf, sobald das Menü aus der Seite verschwunden ist
  const onClick = (e) => {
    if (!node.isConnected) return forget();
    if (!pop.hidden && !node.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (!node.isConnected) return forget();
    if (e.key === 'Escape') close();
  };
  const forget = () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
  };
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  return {
    node,
    setDisabled(off, why = '') {
      toggle.disabled = off;
      toggle.title = why || 'Die Mail zu einer bestimmten Zeit senden';
      if (off) close();
    },
  };
}
