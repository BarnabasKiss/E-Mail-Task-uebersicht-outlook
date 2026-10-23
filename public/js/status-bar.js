import { api } from './api.js';
import { el, formatShort } from './util.js';
import { icon } from './icons.js';

/** Statusanzeige oben (Aktualisiert um ..., Fehler, "Claude arbeitet"). update() fragt den Server und zeichnet neu. */
export function createStatusBar({ chip, rulesLink }) {
  async function update() {
    try {
      const s = await api.status();
      chip.className = `status${s.error ? ' error' : ''}`;
      chip.replaceChildren(
        ...[
          s.error ? icon('alert', 14) : el('span', { class: 'dot ok' }),
          el('span', {}, s.error ? s.error : s.fetchedAt ? `Aktualisiert ${formatShort(s.fetchedAt)}` : 'Lädt …'),
          s.claudeBusy ? el('span', { class: 'busy' }, el('span', { class: 'spinner' }), 'Claude arbeitet') : null,
        ].filter(Boolean),
      );
      rulesLink.title = `Regeldatei öffnen: ${s.rulesFile}`;
    } catch {
      chip.className = 'status error';
      chip.replaceChildren(icon('alert', 14), el('span', {}, 'Die App ist nicht erreichbar.'));
    }
  }
  return { update };
}
