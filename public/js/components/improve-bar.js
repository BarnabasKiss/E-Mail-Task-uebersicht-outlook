// Werkzeuge für den Text einer Mail in einer Leiste: Diktieren | Umschreiben ▾ (Stichpunkte → Mail, kürzer, förmlicher, freundlicher) | Übersetzen ▾ | Prüfen ▾ (Rechtschreibung, Struktur, Lücken)
// | ↶ Version n von m ↷. Alle Änderungen, auch "Neu erzeugen", landen in einer gemeinsamen Versionsliste; jede Version lässt sich zurückholen.
// run({ mode }) -> { text } (Umschreiben, Übersetzen, Rechtschreibung, Struktur) oder { gaps: [{ punkt, hinweis }] } (Lücken). Der Text bleibt unverändert, bis du ein Ergebnis siehst.
import { el, toast } from '../util.js';
import { icon } from '../icons.js';
import { createDictation } from './dictation.js';
import { createToolMenu } from './tool-menu.js';

const REWRITE = [
  { id: 'notes', label: 'Aus Stichpunkten eine Mail', title: 'Macht aus Stichpunkten im Feld eine fertige Mail, mit deiner üblichen Anrede und Ansprache' },
  { id: 'kuerzer', label: 'Kürzer', title: 'Den Text deutlich kürzen' },
  { id: 'foermlicher', label: 'Förmlicher', title: 'Den Text förmlicher formulieren' },
  { id: 'freundlicher', label: 'Freundlicher', title: 'Den Text freundlicher formulieren' },
];
const TRANSLATE = [
  { id: 'translate-en', label: 'Ins Englische', title: 'Den Text auf Englisch übersetzen' },
  { id: 'translate-de', label: 'Ins Deutsche', title: 'Den Text auf Deutsch übersetzen' },
];
const CHECK = [
  { id: 'spelling', label: 'Rechtschreibung', title: 'Nur Rechtschreibung, Grammatik und Zeichensetzung korrigieren' },
  { id: 'structure', label: 'Rechtschreibung & Struktur', title: 'Zusätzlich Absätze, Reihenfolge und Sätze klarer machen' },
  { id: 'gaps', label: 'Lücken suchen', title: 'Zeigt, was fehlen könnte (Frist, Anhang, unbeantwortete Fragen …), ohne den Text zu ändern' },
];
const MAX_VERSIONS = 30;

/**
 * getText(), setText(text): Zugriff auf das Textfeld. textarea: für das Diktieren. run({ mode }). onTextChange(): nach einer Änderung (z. B. Entwurf speichern).
 * rewrite: zusätzliche Einträge für "Umschreiben" [{ id, label, title, needsText: false, run() }] (run macht die Änderung selbst, z. B. neu erzeugen).
 * @returns {{ node, gapsNode, update(), reset(), stopDictation(), snapshot(), record(label) }}
 *   snapshot() merkt den aktuellen Text vor einer Änderung von außen, record(label) legt danach die neue Version an.
 */
export function createImproveBar({ getText, setText, textarea, run, onTextChange = () => {}, rewrite = [] }) {
  let versions = []; // { text, label }
  let at = -1;
  let busy = false;
  const hint = el('span', { class: 'imp-hint', role: 'status' });
  const gapsNode = el('div', { class: 'imp-gaps', hidden: true });
  const dictation = createDictation({ textarea, hint, onText: () => { onTextChange(); update(); } });
  const rewriteItems = [...REWRITE, ...rewrite];
  const menu = (label, iconName, title, items) => createToolMenu({ label, iconName, title, items, onPick: (it) => apply(it) });
  const menus = [menu('Umschreiben', 'pencil', 'Den Text umformulieren', rewriteItems), menu('Übersetzen', 'book', 'Den Text übersetzen', TRANSLATE), menu('Prüfen', 'check', 'Den Text prüfen oder korrigieren', CHECK)];
  const prev = el('button', { class: 'btn small ghost icon-only', type: 'button', title: 'Vorige Version', 'aria-label': 'Vorige Version', onclick: () => go(-1) }, icon('undo', 14));
  const next = el('button', { class: 'btn small ghost icon-only flip', type: 'button', title: 'Nächste Version', 'aria-label': 'Nächste Version', onclick: () => go(1) }, icon('undo', 14));
  const label = el('span', { class: 'imp-version' });
  const versionNode = el('span', { class: 'imp-versions', hidden: true }, prev, label, next);
  const node = el('div', { class: 'imp-bar' }, dictation.node, ...menus.map((m) => m.node), versionNode, hint);

  function update() {
    const empty = !getText().trim();
    for (const m of menus) m.setDisabled(busy, empty);
    versionNode.hidden = versions.length < 2;
    prev.disabled = busy || at <= 0;
    next.disabled = busy || at >= versions.length - 1;
    if (versions.length > 1) {
      label.textContent = `Version ${at + 1} von ${versions.length}`;
      label.title = versions[at].label ? `Diese Version: ${versions[at].label}` : '';
    }
  }

  function push(text, name) {
    versions = versions.slice(0, at + 1);
    versions.push({ text, label: name });
    if (versions.length > MAX_VERSIONS) versions.shift();
    at = versions.length - 1;
  }
  // vor einer Änderung: was gerade im Feld steht (auch eigene Eingaben seit der letzten Version) wird eine Version
  function snapshot() {
    const text = getText();
    if (!text.trim()) return;
    if (at < 0) push(text, 'Vorher');
    else if (versions[at].text !== text) push(text, 'Eigene Änderung');
  }
  function record(name) {
    const text = getText();
    if (!text.trim() || (at >= 0 && versions[at].text === text)) return update();
    push(text, name);
    hint.textContent = `${name}: übernommen. Mit ↶ kommst du zur vorigen Version zurück.`;
    update();
  }

  function go(step) {
    snapshot(); // eigene Eingaben gehen beim Blättern nicht verloren
    const target = at + step;
    if (target < 0 || target >= versions.length) return update();
    at = target;
    setText(versions[at].text);
    onTextChange();
    hint.textContent = `Version ${at + 1} von ${versions.length}${versions[at].label ? `: ${versions[at].label}` : ''}.`;
    update();
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

  async function apply(item) {
    busy = true;
    update();
    hint.textContent = item.id === 'gaps' ? 'Claude sucht nach Lücken … (10 bis 30 Sekunden)' : 'Claude arbeitet … (10 bis 30 Sekunden)';
    try {
      const before = getText();
      if (item.run) {
        snapshot();
        await item.run(); // z. B. neu erzeugen: die Zeile legt die Version selbst an (record)
        return;
      }
      const out = await run({ mode: item.id });
      if (item.id === 'gaps') {
        showGaps(out.gaps || []);
        hint.textContent = '';
      } else if (out.text.trim() === before.trim()) {
        hint.textContent = 'Daran gibt es nichts zu ändern.';
      } else {
        snapshot();
        setText(out.text);
        onTextChange();
        record(item.label);
      }
    } catch (e) {
      hint.textContent = '';
      toast(e.message, { error: true });
    } finally {
      busy = false;
      update();
    }
  }

  update();
  return { node, gapsNode, update, snapshot, record, reset: () => { versions = []; at = -1; gapsNode.hidden = true; update(); }, stopDictation: dictation.stop };
}
