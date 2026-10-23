// Empfängerfeld (An, CC, BCC): Adressen als Chips, Vorschläge aus dem Adressbuch beim Tippen, Einfügen mehrerer Adressen auf einmal.
// Enter, Komma, Semikolon, Leerzeichen oder Tab übernehmen die Eingabe, Rücktaste im leeren Feld entfernt die letzte Adresse.
import { el } from '../util.js';
import { icon } from '../icons.js';

const EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/;

/** "Anna Berger <a@x.at>, b@y.at; c@z.at" -> [{ name, address }] (nur gültige Adressen). */
export function parseAddresses(text) {
  const out = [];
  let rest = String(text || '');
  rest = rest.replace(/([^<>,;]*?)<\s*([^<>\s]+@[^<>\s]+)\s*>/g, (all, name, address) => {
    if (EMAIL.test(address)) out.push({ name: name.replace(/^["'\s,;]+|["'\s,;]+$/g, ''), address: address.toLowerCase() });
    return ' ';
  });
  for (const t of rest.split(/[\s,;]+/)) if (EMAIL.test(t)) out.push({ name: '', address: t.toLowerCase() });
  return out;
}

/**
 * label: "An" | "CC" | "BCC". values: Adressen. names: Adresse -> Name (für die Anzeige).
 * suggest(q) -> Promise<[{ name, address, company }]>. onChange(adressen) nach jeder Änderung.
 */
export function createRecipientField({ label, values = [], names = {}, suggest, onChange = () => {} }) {
  let list = [];
  const known = { ...names }; // Adresse -> Name
  let items = [];
  let active = -1;
  let timer = null;
  let ticket = 0;

  const input = el('input', { type: 'text', class: 'rf-input', autocomplete: 'off', 'aria-label': label, 'aria-autocomplete': 'list' });
  const chips = el('span', { class: 'rf-chips' });
  const pop = el('div', { class: 'rf-pop', role: 'listbox', hidden: true });
  const box = el('div', { class: 'rf-box', onclick: () => input.focus() }, chips, input);
  const node = el('div', { class: 'rf', 'data-label': label }, el('label', { class: 'rf-label' }, label), el('div', { class: 'rf-wrap' }, box, pop));

  function emit() {
    renderChips();
    onChange([...list]);
  }

  function renderChips() {
    chips.replaceChildren(
      ...list.map((a) =>
        el(
          'span',
          { class: 'rf-chip', title: a },
          known[a] && known[a] !== a ? el('span', { class: 'rf-name' }, known[a]) : el('span', {}, a),
          el('button', { class: 'rf-x', type: 'button', 'aria-label': `${a} entfernen`, onclick: (e) => { e.stopPropagation(); remove(a); } }, icon('x', 11)),
        ),
      ),
    );
  }

  function add(people) {
    let changed = false;
    for (const p of people) {
      if (p.name && !known[p.address]) known[p.address] = p.name;
      if (!list.includes(p.address)) {
        list.push(p.address);
        changed = true;
      }
    }
    if (changed) emit();
  }

  function remove(a) {
    list = list.filter((x) => x !== a);
    emit();
  }

  /** Eingabe in Chips umwandeln. Bleibt etwas Unlesbares, steht es weiter im Feld. */
  function commit() {
    const text = input.value;
    if (!text.trim()) return;
    const found = parseAddresses(text);
    if (!found.length) return;
    add(found);
    // was keine Adresse war (z. B. ein halbes Wort), bleibt stehen
    const left = text.replace(/[^<>,;]*<[^<>]+>/g, ' ').split(/[\s,;]+/).filter((t) => t && !EMAIL.test(t)).join(' ');
    input.value = left;
    close();
  }

  function close() {
    pop.hidden = true;
    active = -1;
    items = [];
  }

  function paint() {
    pop.replaceChildren(
      ...items.map((it, i) =>
        el(
          'div',
          { class: `rf-item${i === active ? ' active' : ''}`, role: 'option', 'aria-selected': i === active, onmousedown: (e) => { e.preventDefault(); pick(it); } },
          el('span', { class: 'rf-item-name' }, it.name || it.address),
          it.name && el('span', { class: 'rf-item-addr' }, it.address),
          it.company && el('span', { class: 'rf-item-co' }, it.company),
        ),
      ),
    );
    pop.hidden = !items.length;
  }

  function pick(it) {
    add([{ name: it.name, address: it.address }]);
    input.value = '';
    close();
    input.focus();
  }

  function lookup() {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q || !suggest) return close();
    timer = setTimeout(async () => {
      const mine = ++ticket;
      let found = [];
      try {
        found = await suggest(q, list);
      } catch {
        found = [];
      }
      if (mine !== ticket) return; // eine neuere Eingabe ist unterwegs
      items = found.filter((f) => !list.includes(f.address));
      active = items.length ? 0 : -1;
      paint();
    }, 110);
  }

  input.addEventListener('input', () => {
    if (/[,;]\s*$|\s$/.test(input.value) && parseAddresses(input.value).length) commit();
    else lookup();
    onChange([...list]); // damit der Sende-Knopf eine halbe Eingabe bemerkt
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      active = (active + 1) % items.length;
      paint();
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      active = (active - 1 + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (!pop.hidden && active >= 0 && items[active] && !EMAIL.test(input.value.trim())) {
        e.preventDefault();
        pick(items[active]);
      } else if (input.value.trim() && parseAddresses(input.value).length) {
        e.preventDefault();
        commit();
      } else if (e.key === 'Enter') {
        e.preventDefault(); // Enter im Feld soll nichts anderes auslösen
      }
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Backspace' && !input.value && list.length) {
      remove(list.at(-1));
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      commit();
      close();
    }, 120);
  });
  input.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') || '';
    const found = parseAddresses(text);
    if (found.length > 1 || (found.length === 1 && /[<,;\s]/.test(text.trim()))) {
      e.preventDefault();
      add(found);
    }
  });

  list = [...new Set(values.map((a) => String(a).toLowerCase()))];
  renderChips();

  return {
    node,
    get: () => [...list],
    /** Was noch im Feld steht, ohne gültige Adresse zu sein (der Absender muss es bestätigen oder löschen). */
    pending: () => (parseAddresses(input.value).length ? '' : input.value.trim()),
    commit,
    set(next, nameMap = {}) {
      Object.assign(known, nameMap);
      list = [...new Set(next.map((a) => String(a).toLowerCase()))];
      input.value = '';
      emit();
    },
    setDisabled(off) {
      input.disabled = off;
      box.classList.toggle('disabled', off);
      chips.querySelectorAll('.rf-x').forEach((b) => (b.disabled = off));
    },
    focus: () => input.focus(),
  };
}
