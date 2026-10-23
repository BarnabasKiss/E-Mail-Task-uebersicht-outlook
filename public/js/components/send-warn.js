// Warnungen vor dem Senden: zeigt die Hinweise und wartet auf "Trotzdem senden" oder "Zurück". Ohne Hinweise (oder wenn die Prüfung selbst fehlschlägt) geht es gleich weiter.
import { el } from '../util.js';
import { icon } from '../icons.js';

/**
 * box: Platz für die Hinweise. check() -> { warnings: [{ title, hint }] }. @returns {Promise<boolean>} true = senden
 */
export async function confirmWarnings(box, check) {
  let warnings = [];
  try {
    warnings = (await check())?.warnings || [];
  } catch {
    return true; // die Prüfung ist nur eine Hilfe
  }
  if (!warnings.length) return true;
  return new Promise((resolve) => {
    const done = (ok) => {
      box.hidden = true;
      box.replaceChildren();
      resolve(ok);
    };
    box.replaceChildren(
      el('div', { class: 'warn-head' }, icon('alert', 15), el('strong', {}, warnings.length === 1 ? 'Bitte kurz prüfen' : `${warnings.length} Dinge bitte kurz prüfen`)),
      el('ul', {}, warnings.map((w) => el('li', {}, el('strong', {}, w.title), w.hint && el('span', {}, ` ${w.hint}`)))),
      el('div', { class: 'warn-actions' }, el('button', { class: 'btn small', type: 'button', onclick: () => done(false) }, 'Zurück und ändern'), el('button', { class: 'btn small primary', type: 'button', onclick: () => done(true) }, 'Trotzdem senden')),
    );
    box.hidden = false;
  });
}
