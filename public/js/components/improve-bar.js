// Werkzeuge für den Text einer Mail: Rechtschreibung, Rechtschreibung und Struktur, Lücken suchen, Diktieren, und "Vorige Version", wenn dir ein Ergebnis nicht gefällt.
// run({ mode }) -> { text } (Rechtschreibung, Struktur) oder { gaps: [{ punkt, hinweis }] } (Lücken). Der Text bleibt unverändert, bis du ein Ergebnis siehst und behältst.
import { el, toast } from '../util.js';
import { icon } from '../icons.js';
import { createDictation } from './dictation.js';

const MODES = [
  { id: 'spelling', label: 'Rechtschreibung', iconName: 'check', title: 'Nur Rechtschreibung, Grammatik und Zeichensetzung korrigieren' },
  { id: 'structure', label: 'Rechtschreibung & Struktur', iconName: 'sparkle', title: 'Zusätzlich Absätze, Reihenfolge und Sätze klarer machen' },
  { id: 'gaps', label: 'Lücken suchen', iconName: 'search', title: 'Zeigt, was fehlen könnte (Frist, Anhang, unbeantwortete Fragen …), ohne den Text zu ändern' },
];

/**
 * getText(), setText(text): Zugriff auf das Textfeld. textarea: für das Diktieren. run({ mode }). onTextChange(): nach einer Änderung (z. B. Entwurf speichern).
 * @returns {{ node, gapsNode, update(), reset() }} node = Knopfleiste, gapsNode = Platz für das Ergebnis "Lücken" (unter das Textfeld setzen)
 */
export function createImproveBar({ getText, setText, textarea, run, onTextChange = () => {}, extra = [] }) {
  const history = [];
  let busy = false;
  const hint = el('span', { class: 'imp-hint', role: 'status' });
  const gapsNode = el('div', { class: 'imp-gaps', hidden: true });
  const buttons = MODES.map((m) => ({ m, btn: el('button', { class: 'btn small', type: 'button', title: m.title, onclick: () => apply(m) }, icon(m.iconName, 14), m.label) }));
  const back = el('button', { class: 'btn small ghost', type: 'button', hidden: true, title: 'Den Text von vor der letzten Änderung zurückholen', onclick: undo }, icon('undo', 14), 'Vorige Version');
  const dictation = createDictation({ textarea, hint, onText: onTextChange });
  const node = el('div', { class: 'imp-bar' }, ...buttons.map((b) => b.btn), dictation.node, back, ...extra, hint);

  function update() {
    const empty = !getText().trim();
    for (const { btn } of buttons) btn.disabled = busy || empty;
    back.hidden = !history.length || busy;
  }

  function showGaps(gaps) {
    if (!gaps.length) {
      gapsNode.replaceChildren(el('p', { class: 'imp-ok' }, icon('check', 14), 'Keine Lücken gefunden.', el('button', { class: 'link', type: 'button', onclick: () => (gapsNode.hidden = true) }, 'Ausblenden')));
    } else {
      gapsNode.replaceChildren(
        el('div', { class: 'imp-gaps-head' }, icon('alert', 14), el('strong', {}, `${gaps.length} mögliche ${gaps.length === 1 ? 'Lücke' : 'Lücken'}`), el('button', { class: 'link', type: 'button', onclick: () => (gapsNode.hidden = true) }, 'Alle ausblenden')),
        el(
          'ul',
          {},
          gaps.map((g) =>
            el('li', {}, el('span', {}, el('strong', {}, g.punkt), ' ', g.hinweis), el('button', { class: 'icon-btn small', type: 'button', title: 'Erledigt', 'aria-label': 'Hinweis ausblenden', onclick: (e) => { e.currentTarget.closest('li').remove(); if (!gapsNode.querySelector('li')) gapsNode.hidden = true; } }, icon('x', 12))),
          ),
        ),
      );
    }
    gapsNode.hidden = false;
  }

  async function apply(m) {
    busy = true;
    update();
    hint.textContent = m.id === 'gaps' ? 'Claude sucht nach Lücken … (10 bis 30 Sekunden)' : 'Claude überarbeitet den Text … (10 bis 30 Sekunden)';
    try {
      const before = getText();
      const out = await run({ mode: m.id });
      if (m.id === 'gaps') {
        showGaps(out.gaps || []);
        hint.textContent = '';
      } else if (out.text.trim() === before.trim()) {
        hint.textContent = 'Daran gibt es nichts zu verbessern.';
      } else {
        history.push(before);
        if (history.length > 10) history.shift();
        setText(out.text);
        onTextChange();
        hint.textContent = `${m.label}: übernommen. „Vorige Version“ bringt den alten Text zurück.`;
      }
    } catch (e) {
      hint.textContent = '';
      toast(e.message, { error: true });
    } finally {
      busy = false;
      update();
    }
  }

  function undo() {
    const prev = history.pop();
    if (prev == null) return;
    setText(prev);
    onTextChange();
    hint.textContent = 'Vorige Version zurückgeholt.';
    update();
  }

  update();
  return { node, gapsNode, update, reset: () => { history.length = 0; gapsNode.hidden = true; update(); }, stopDictation: dictation.stop };
}
