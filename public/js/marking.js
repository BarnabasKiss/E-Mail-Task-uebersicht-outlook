// Markierte Mails für Sammelaktionen (reine Logik, ohne Browser). Mails werden mit Strg + Klick auf die Zeile markiert, es gibt keine Kästchen.
export function createMarking() {
  const ids = new Set();
  const key = (id) => String(id);
  return {
    get size() {
      return ids.size;
    },
    has: (id) => ids.has(key(id)),
    list: () => [...ids],
    add(...list) {
      list.forEach((id) => ids.add(key(id)));
    },
    toggle(id) {
      if (!ids.delete(key(id))) ids.add(key(id));
    },
    clear: () => ids.clear(),
    /** Vergisst Mails, die es nicht mehr gibt (z. B. nach dem Nachladen der Liste). */
    prune(valid) {
      const ok = new Set([...valid].map(key));
      for (const id of [...ids]) if (!ok.has(id)) ids.delete(id);
    },
  };
}

