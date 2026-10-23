// Der Verlauf einer Konversation als Nachrichten: deine eigenen rechts, die der anderen links, jede Person in ihrer Farbe.
// Jede Nachricht hat oben eine kompakte Zeile (wer an wen, CC), darunter den Text ohne zitierten Verlauf und unten die Signatur als Dropdown.
import { el, hueOf, formatFull } from '../util.js';
import { icon } from '../icons.js';
import { textWithImages } from './mail-text.js';

const FIRST = 2; // so viele Namen stehen in der Kopfzeile, der Rest als "+n" (alle im Tooltip)

const label = (p, ownAddress) => (p.address && p.address.toLowerCase() === String(ownAddress).toLowerCase() ? 'Du' : p.name || p.address || '?');
const tip = (list) => list.map((p) => (p.name && p.address ? `${p.name} <${p.address}>` : p.name || p.address)).join('\n');

function recipients(prefix, list, ownAddress) {
  if (!list.length) return null;
  const names = list.map((p) => label(p, ownAddress));
  const more = names.length - FIRST;
  return el('span', { class: 'b-rcpt', title: tip(list) }, el('span', { class: 'b-rcpt-label' }, prefix), names.slice(0, FIRST).join(', '), more > 0 && el('span', { class: 'b-more' }, ` +${more}`));
}

/** m: Nachricht vom Server. Die geöffnete Mail zeigt ihre Bilder an der richtigen Stelle. */
function bubble(m, { proposalId, ownAddress }) {
  const who = m.own ? 'Du' : m.from.name || m.from.address;
  const body = m.current && /⟦bild:/.test(m.text) ? textWithImages(proposalId, m.text) : [m.text || '(kein Text)'];
  return el(
    'article',
    { class: `bubble-row${m.own ? ' own' : ''}`, 'data-id': m.id },
    el(
      'div',
      { class: `bubble${m.current ? ' current' : ''}`, style: m.own ? undefined : `--h:${hueOf(m.from.address || m.from.name)}` },
      el(
        'header',
        { class: 'b-head' },
        el('span', { class: 'b-from', title: m.from.address ? `${m.from.name} <${m.from.address}>` : m.from.name }, el('i', { class: 'b-dot' }), who),
        el('span', { class: 'b-to' }, el('span', { class: 'b-arrow', 'aria-hidden': 'true' }, '→'), recipients('', m.to, ownAddress), recipients('CC ', m.cc, ownAddress)),
        el('span', { class: 'spacer' }),
        m.hasAttachments && el('span', { class: 'b-att', title: 'Mit Anhang' }, icon('paperclip', 12)),
        el('time', { class: 'b-time' }, formatFull(m.sent)),
      ),
      el('div', { class: 'b-text' }, ...body),
      m.signature && el('details', { class: 'b-sig' }, el('summary', {}, 'Signatur'), el('pre', {}, m.signature)),
    ),
  );
}

/**
 * Verlauf mit "Ältere Nachrichten laden". loadPage(before) -> { messages (neueste zuerst), hasMore, nextBefore, degraded }.
 * @returns {{ node, load(): Promise, ownSignature(): string }} load() holt die erste Seite (nur einmal), ownSignature() ist die Signatur deiner letzten Nachricht
 */
export function createThread({ proposalId, ownAddress, loadPage }) {
  const list = el('div', { class: 'thread-list' });
  const older = el('button', { class: 'btn small thread-older', type: 'button', hidden: true, onclick: () => more() }, icon('chevron', 14), 'Ältere Nachrichten laden');
  const note = el('p', { class: 'hint', hidden: true });
  const node = el('div', { class: 'thread', 'aria-label': 'Verlauf' }, older, note, list);
  const ctx = { proposalId, ownAddress };
  let messages = []; // alt -> neu
  let state = { hasMore: false, nextBefore: '' };
  let loading = null;

  function render() {
    list.replaceChildren(...messages.map((m) => bubble(m, ctx)));
    older.hidden = !state.hasMore;
  }

  async function fetchPage(before) {
    const page = await loadPage(before);
    const fresh = [...page.messages].reverse().filter((m) => !messages.some((x) => x.id === m.id));
    messages = before ? [...fresh, ...messages] : fresh;
    state = { hasMore: page.hasMore, nextBefore: page.nextBefore };
    note.hidden = !page.degraded;
    if (page.degraded) note.textContent = 'Der Verlauf konnte nicht geladen werden, angezeigt wird nur diese Nachricht.';
    render();
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
