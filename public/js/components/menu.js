// Aufklappmenüs (Später, Done mit Zusatzmenü), die sich gegenseitig schließen.
import { el } from '../util.js';
import { icon } from '../icons.js';

let openMenu = null;
const closeOpen = () => {
  if (openMenu) openMenu.close();
};
document.addEventListener('click', (e) => {
  if (openMenu && !openMenu.root.contains(e.target)) closeOpen();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOpen();
});

/**
 * Aufklappmenü. items: [{ label, hint?, stacked?, onClick }]. `stacked` setzt den Hinweis unter den Titel
 * (für längere Hinweise), sonst steht er rechts daneben (für kurze wie Datumsangaben).
 * Gibt { root, toggle(), close() } zurück; `trigger` ist das Element, das das Menü öffnet.
 */
function attachMenu(root, trigger, items) {
  const list = el(
    'div',
    { class: 'menu', role: 'menu', hidden: true },
    items.map((it) =>
      el(
        'button',
        { class: `menu-item${it.stacked ? ' stacked' : ''}`, type: 'button', role: 'menuitem', onclick: () => { api.close(); it.onClick(); } },
        el('span', {}, it.label),
        it.hint && el('small', {}, it.hint),
      ),
    ),
  );
  root.append(list);
  const api = {
    root,
    close() {
      list.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (openMenu === api) openMenu = null;
    },
    toggle() {
      const willOpen = list.hidden;
      closeOpen();
      list.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) openMenu = api;
    },
  };
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  return api;
}

/** Knopf mit Symbol und Text, der ein Menü öffnet (z. B. "Später"). */
export function menuButton({ label, iconName, items, title }) {
  const root = el('div', { class: 'menu-wrap' });
  const btn = el('button', { class: 'btn', type: 'button', title }, iconName && icon(iconName, 15), el('span', {}, label), icon('chevron', 14));
  root.prepend(btn);
  const m = attachMenu(root, btn, items);
  btn.addEventListener('click', m.toggle);
  return root;
}

/** Geteilter Knopf: Hauptaktion links, Zusatzaktionen im Menü rechts. */
export function splitButton({ label, iconName, title, onClick, items, danger = false }) {
  const root = el('div', { class: 'menu-wrap split' });
  const main = el('button', { class: `btn${danger ? ' danger' : ''}`, type: 'button', title, onclick: onClick }, iconName && icon(iconName, 15), el('span', {}, label));
  const caret = el('button', { class: `btn caret${danger ? ' danger' : ''}`, type: 'button', 'aria-label': 'Weitere Optionen' }, icon('chevron', 14));
  root.append(main, caret);
  const m = attachMenu(root, caret, items);
  caret.addEventListener('click', m.toggle);
  return root;
}
