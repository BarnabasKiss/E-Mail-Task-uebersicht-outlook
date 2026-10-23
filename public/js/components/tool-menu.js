// Knopf mit aufklappbarer Liste (für die Textwerkzeuge). items: [{ id, label, title, needsText? }]; onPick(item). Schließt bei Klick daneben und mit Escape.
import { el } from '../util.js';
import { icon } from '../icons.js';

/** @returns {{ node, setDisabled(off, emptyText), close() }} */
export function createToolMenu({ label, iconName, title = '', items, onPick }) {
  const pop = el('div', { class: 'menu left', role: 'menu', hidden: true });
  const toggle = el('button', { class: 'btn small', type: 'button', title, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => (pop.hidden ? open() : close()) }, icon(iconName, 14), el('span', {}, label), icon('chevron', 12));
  const node = el('span', { class: 'menu-wrap' }, toggle, pop);
  const entries = items.map((it) => ({
    it,
    btn: el('button', { class: 'menu-item stacked', type: 'button', role: 'menuitem', title: it.title || '', onclick: () => { close(); onPick(it); } }, el('span', {}, it.label), it.title && el('small', {}, it.title)),
  }));
  pop.replaceChildren(...entries.map((e) => e.btn));

  function open() {
    pop.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }
  function close() {
    pop.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  // Listener am document räumen sich selbst auf, sobald das Menü aus der Seite verschwunden ist (andere Mail, neu gezeichnet)
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
    close,
    /** off: alles gesperrt; empty: es gibt noch keinen Text (Einträge mit needsText bleiben gesperrt) */
    setDisabled(off, empty = false) {
      toggle.disabled = off;
      if (off) close();
      for (const { it, btn } of entries) btn.disabled = off || (empty && it.needsText !== false);
    },
  };
}
