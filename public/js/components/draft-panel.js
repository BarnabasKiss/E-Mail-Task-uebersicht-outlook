import { el, toast } from '../util.js';
import { icon } from '../icons.js';

// Antwortentwurf: editierbar, kopierbar, neu erzeugbar. Ablage heute: Zwischenablage.
// Ein späteres Modul (z. B. Outlook-Entwurf) ersetzt nur den Kopieren-Knopf.
export function createDraftPanel({ draft, error, isTest, onRegenerate }) {
  const area = el('textarea', { class: 'draft-text', rows: 7, 'aria-label': 'Antwortentwurf', placeholder: 'Der Entwurf erscheint hier …' });
  const status = el('span', { class: 'draft-status' });
  const copy = el('button', { class: 'btn', type: 'button', onclick: copyText }, icon('copy', 15), el('span', {}, 'Kopieren'));
  const regen = el('button', { class: 'btn', type: 'button', onclick: regenerate }, icon('sparkle', 15), el('span', {}));
  const errorBox = el('div', { class: 'inline-error', hidden: true }, icon('alert', 16), el('span', {}), el('button', { class: 'link', type: 'button', onclick: regenerate }, 'Erneut versuchen'));

  const node = el(
    'section',
    { class: 'card draft', 'aria-label': 'Antwortentwurf' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Antwortentwurf'), status, el('span', { class: 'spacer' }), copy, regen),
    errorBox,
    area,
  );

  let current = { draft, error };
  let busy = false;

  function grow() {
    area.style.height = 'auto';
    area.style.height = `${Math.min(Math.max(area.scrollHeight + 2, 120), 380)}px`;
  }
  area.addEventListener('input', grow);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(area.value);
      toast('Entwurf kopiert');
    } catch {
      area.select();
      toast('Kopieren nicht möglich. Der Text ist markiert (Strg+C).', { error: true });
    }
  }

  async function regenerate() {
    busy = true;
    render();
    try {
      await onRegenerate();
    } finally {
      busy = false;
    }
  }

  function render() {
    const { draft: d, error: e } = current;
    copy.disabled = !area.value.trim();
    regen.disabled = busy;
    regen.querySelector('span:last-child').textContent = d ? 'Neu erzeugen' : 'Jetzt erzeugen';
    errorBox.hidden = !e || busy;
    errorBox.querySelector('span:nth-child(2)').textContent = e ? `Der Entwurf konnte nicht erstellt werden. ${e}` : '';
    status.className = 'draft-status';
    if (busy) {
      status.classList.add('busy');
      status.textContent = 'Claude schreibt … (10 bis 30 Sekunden)';
    } else if (d) status.textContent = 'Bereit. Änderungen hier werden nicht gespeichert.';
    else if (isTest) status.textContent = 'Testnachricht: Entwürfe nur per Klick auf „Jetzt erzeugen“.';
    else if (!e) {
      status.classList.add('busy');
      status.textContent = 'Wird im Hintergrund erstellt …';
    } else status.textContent = '';
  }

  area.value = draft?.text || '';
  render();
  queueMicrotask(grow);

  return {
    node,
    update(next) {
      current = next;
      if (next.draft) area.value = next.draft.text;
      busy = false;
      render();
      grow();
    },
  };
}
