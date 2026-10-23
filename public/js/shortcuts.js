// Tastaturkürzel: / = Suche, j/k oder Pfeile = nächste/vorherige Mail, e = in Done ablegen (in Done: zurückholen), Entf = löschen.
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** deps: { searchInput, visibleItems(), selectedId(), findItem(id), select(id, opts), archive(id), restore(id), remove(id) } */
export function installShortcuts({ searchInput, visibleItems, selectedId, findItem, select, archive, restore, remove }) {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = TYPING.test(document.activeElement?.tagName);
    const current = selectedId();
    if (e.key === '/' && !typing) {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.blur();
    } else if (!typing && ['j', 'k', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      const list = visibleItems();
      if (!list.length) return;
      const i = list.findIndex((m) => String(m.id) === String(current));
      const step = e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1;
      const next = list[Math.min(Math.max(i + step, 0), list.length - 1)];
      if (next && String(next.id) !== String(current)) {
        e.preventDefault();
        select(next.id, { keepView: false });
      }
    } else if (!typing && current && e.key === 'e') {
      const m = findItem(current);
      if (m) (m.archiviert ? restore : archive)(m.id);
    } else if (!typing && current && e.key === 'Delete') {
      remove(current);
    }
  });
}
