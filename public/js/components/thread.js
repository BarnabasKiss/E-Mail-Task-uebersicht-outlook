// Der Verlauf einer Konversation als Nachrichten: deine eigenen rechts, die der anderen links, jede Person in ihrer Farbe.
// Jede Nachricht hat oben eine Zeile mit dem Namen (An und CC beim Darüberfahren), darunter den Text ohne zitierten Verlauf und unten die Signatur als Dropdown.
import { el, hueOf, formatFull } from '../util.js';
import { icon } from '../icons.js';
import { textWithImages } from './mail-text.js';

const label = (p, ownAddress) => (p.address && p.address.toLowerCase() === String(ownAddress).toLowerCase() ? 'Du' : p.name || p.address || '?');

// Kurzform für die Beschriftung (Vorlesen): erste zwei Namen, der Rest als "+n"
function brief(list, ownAddress) {
  const names = list.map((p) => label(p, ownAddress));
  return names.length > 1 ? `${names[0]}, ${names[1]}${names.length > 2 ? ` +${names.length - 2}` : ''}` : names[0] || '';
}

// Vollständige Liste beim Darüberfahren: je Zeile Name und Adresse, getrennt nach An und CC
// Das Popover liegt fest (position: fixed) unter dem Namen, damit es nicht vom scrollenden Rahmen des Verlaufs abgeschnitten wird
function placePopover(host, pop, own) {
  requestAnimationFrame(() => {
    const r = host.getBoundingClientRect();
    const w = pop.offsetWidth;
    const left = own ? Math.max(8, r.right - w) : Math.min(r.left, window.innerWidth - w - 8);
    const top = r.bottom + 6 + pop.offsetHeight > window.innerHeight - 8 && r.top - 6 - pop.offsetHeight > 8 ? r.top - 6 - pop.offsetHeight : r.bottom + 6;
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${top}px`;
  });
}

function popover(m, ownAddress) {
  const group = (title, list) =>
    list.length
      ? [
          el('div', { class: 'pop-title' }, title),
          ...list.map((p) =>
            el('div', { class: 'pop-row' }, el('span', { class: 'pop-name' }, label(p, ownAddress)), p.address && label(p, ownAddress) !== p.address && el('span', { class: 'pop-addr' }, p.address)),
          ),
        ]
      : [];
  return el('div', { class: 'b-pop', role: 'tooltip' }, el('div', { class: 'pop-title' }, 'Von'), el('div', { class: 'pop-row' }, el('span', { class: 'pop-name' }, m.own ? 'Du' : m.from.name || m.from.address), m.from.name && m.from.address && el('span', { class: 'pop-addr' }, m.from.address)), ...group('An', m.to), ...group('CC', m.cc));
}

/** m: Nachricht vom Server. Die geöffnete Mail zeigt ihre Bilder an der richtigen Stelle. */
function bubble(m, { proposalId, ownAddress }) {
  const who = m.own ? 'Du' : m.from.name || m.from.address;
  const body = m.current && /⟦bild:/.test(m.text) ? textWithImages(proposalId, m.text, { chips: true }) : [m.text || '(kein Text)'];
  const row = el(
    'article',
    { class: `bubble-row${m.own ? ' own' : ''}`, 'data-id': m.id },
    el(
      'div',
      { class: `bubble${m.current ? ' current' : ''}`, style: m.own ? undefined : `--h:${hueOf(m.from.address || m.from.name)}` },
      el(
        'header',
        { class: 'b-head' },
        // Standardmäßig nur der Name; beim Darüberfahren oder per Tastatur-Fokus erscheint die vollständige Liste (Von, An, CC)
        el(
          'div',
          { class: 'b-people', tabindex: '0', 'aria-label': `Von ${who}, an ${brief(m.to, ownAddress)}${m.cc.length ? `, CC ${brief(m.cc, ownAddress)}` : ''}` },
          el('span', { class: 'b-from' }, el('i', { class: 'b-dot' }), who),
          popover(m, ownAddress),
        ),
        el('span', { class: 'spacer' }),
        m.hasAttachments && el('span', { class: 'b-att', title: 'Mit Anhang' }, icon('paperclip', 12)),
        el('time', { class: 'b-time' }, formatFull(m.sent)),
      ),
      el('div', { class: 'b-text' }, ...body),
      m.signature && el('details', { class: 'b-sig' }, el('summary', {}, 'Signatur'), el('pre', {}, m.signature)),
    ),
  );
  const host = row.querySelector('.b-people');
  const pop = row.querySelector('.b-pop');
  for (const ev of ['mouseenter', 'focus']) host.addEventListener(ev, () => placePopover(host, pop, m.own));
  return row;
}

/**
 * Verlauf mit "Ältere Nachrichten laden". loadPage(before) -> { messages (neueste zuerst), hasMore, nextBefore, degraded }.
 * @returns {{ node, load(): Promise, ownSignature(): string }} load() holt die erste Seite (nur einmal), ownSignature() ist die Signatur deiner letzten Nachricht
 */
export function createThread({ proposalId, ownAddress, loadPage, scrollEl = () => null }) {
  const list = el('div', { class: 'thread-list' });
  const older = el('button', { class: 'btn small thread-older', type: 'button', hidden: true, onclick: () => more() }, icon('chevron', 14), 'Ältere Nachrichten laden');
  const note = el('p', { class: 'hint', hidden: true });
  const node = el('div', { class: 'thread', 'aria-label': 'Verlauf' }, older, note, list);
  const ctx = { proposalId, ownAddress };
  let messages = []; // alt -> neu
  let state = { hasMore: false, nextBefore: '' };
  let loading = null;

  // Erste Seite: die neueste Nachricht steht unten und ist sichtbar. Ältere Nachrichten oben: die Ansicht bleibt dort, wo sie war.
  function render({ keep = false } = {}) {
    const box = scrollEl();
    const before = box ? box.scrollHeight - box.scrollTop : 0;
    list.replaceChildren(...messages.map((m) => bubble(m, ctx)));
    older.hidden = !state.hasMore;
    if (box) requestAnimationFrame(() => (box.scrollTop = keep ? box.scrollHeight - before : box.scrollHeight));
  }

  async function fetchPage(before) {
    const page = await loadPage(before);
    const fresh = [...page.messages].reverse().filter((m) => !messages.some((x) => x.id === m.id));
    messages = before ? [...fresh, ...messages] : fresh;
    state = { hasMore: page.hasMore, nextBefore: page.nextBefore };
    note.hidden = !page.degraded;
    if (page.degraded) note.textContent = 'Der Verlauf konnte nicht geladen werden, angezeigt wird nur diese Nachricht.';
    render({ keep: !!before });
  }

  async function more() {
    older.disabled = true;
    try {
      await fetchPage(state.nextBefore);
    } catch (e) {
      note.hidden = false;
      note.textContent = `Ältere Nachrichten konnten nicht geladen werden. ${e.message}`;
    } finally {
      older.disabled = false;
    }
  }

  return {
    node,
    /** Nach dem Aufklappen: ans Ende springen, dort steht die neueste Nachricht. */
    toEnd() {
      const box = scrollEl();
      if (box) requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
    },
    load() {
      loading ||= fetchPage('').catch((e) => {
        note.hidden = false;
        note.textContent = `Der Verlauf konnte nicht geladen werden. ${e.message}`;
        loading = null;
      });
      return loading;
    },
    ownSignature: () => [...messages].reverse().find((m) => m.own && m.signature)?.signature || '',
  };
}
