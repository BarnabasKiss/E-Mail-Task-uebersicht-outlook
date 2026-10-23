import { el, toast } from '../util.js';
import { icon } from '../icons.js';

// Antwortentwurf: editierbar, kopierbar, neu erzeugbar, als Variante (kürzer, förmlicher, freundlicher, Ablehnung) und mit Hinweis.
// Ablage heute: Zwischenablage. Ein späteres Modul (z. B. Outlook-Entwurf) ersetzt nur den Kopieren-Knopf.
const VARIANTS = [
  { id: 'kuerzer', label: 'Kürzer', title: 'Den Text im Feld deutlich kürzen', needsText: true },
  { id: 'foermlicher', label: 'Förmlicher', title: 'Den Text im Feld förmlicher formulieren', needsText: true },
  { id: 'freundlicher', label: 'Freundlicher', title: 'Den Text im Feld freundlicher formulieren', needsText: true },
  { id: 'ablehnung', label: 'Ablehnung', title: 'Neu schreiben: höfliche Ablehnung, ohne einen Grund zu erfinden', needsText: false },
];
const VARIANT_LABEL = Object.fromEntries(VARIANTS.map((v) => [v.id, v.label.toLowerCase()]));

export function createDraftPanel({ draft, error, isTest, onRegenerate, onPrevious }) {
  const area = el('textarea', { class: 'draft-text', rows: 7, 'aria-label': 'Antwortentwurf', placeholder: 'Der Entwurf erscheint hier …' });
  const status = el('span', { class: 'draft-status' });
  const copy = el('button', { class: 'btn', type: 'button', onclick: copyText }, icon('copy', 15), el('span', {}, 'Kopieren'));
  const regen = el('button', { class: 'btn', type: 'button', onclick: () => regenerate({}) }, icon('sparkle', 15), el('span', {}));
  const errorBox = el('div', { class: 'inline-error', hidden: true }, icon('alert', 16), el('span', {}), el('button', { class: 'link', type: 'button', onclick: () => regenerate({}) }, 'Erneut versuchen'));

  const hint = el('input', {
    class: 'draft-hint',
    type: 'text',
    maxlength: '500',
    placeholder: 'Hinweis für die Antwort, z. B. „sag, dass ich nächste Woche Zeit habe“',
    'aria-label': 'Hinweis für den Entwurf',
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        regenerate({});
      }
    },
  });
  const variantButtons = VARIANTS.map((v) => ({ v, btn: el('button', { class: 'btn small', type: 'button', title: v.title, onclick: () => regenerate({ variant: v.id }) }, v.label) }));
  const previous = el('button', { class: 'btn small ghost', type: 'button', title: 'Zur vorigen Version zurück (nochmal klicken: wieder vor)', onclick: goBack }, icon('undo', 14), 'Vorige Version');
  const tools = el('div', { class: 'draft-tools' }, ...variantButtons.map((x) => x.btn), hint, previous);

  const node = el(
    'section',
    { class: 'card draft', 'aria-label': 'Antwortentwurf' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Antwortentwurf'), status, el('span', { class: 'spacer' }), copy, regen),
    errorBox,
    tools,
    area,
  );

  let current = { draft, error };
  let busy = false;

  function grow() {
    area.style.height = 'auto';
    area.style.height = `${Math.min(Math.max(area.scrollHeight + 2, 120), 380)}px`;
  }
  area.addEventListener('input', () => {
    grow();
    render();
  });

  async function copyText() {
    try {
      await navigator.clipboard.writeText(area.value);
      toast('Entwurf kopiert');
    } catch {
      area.select();
      toast('Kopieren nicht möglich. Der Text ist markiert (Strg+C).', { error: true });
    }
  }

  // opts: { variant } – der Hinweis und der Text im Feld (zum Überarbeiten) gehen immer mit
  async function regenerate(opts = {}) {
    busy = true;
    render();
    try {
      await onRegenerate({ ...opts, hint: hint.value.trim(), base: area.value.trim() });
      hint.value = '';
    } finally {
      busy = false;
      render();
    }
  }

  async function goBack() {
    busy = true;
    render();
    try {
      await onPrevious();
    } finally {
      busy = false;
      render();
    }
  }

  function render() {
    const { draft: d, error: e } = current;
    copy.disabled = !area.value.trim();
    regen.disabled = busy;
    for (const { v, btn } of variantButtons) btn.disabled = busy || (v.needsText && !area.value.trim());
    hint.disabled = busy;
    previous.hidden = !d?.previous?.text || busy;
    regen.querySelector('span:last-child').textContent = d ? 'Neu erzeugen' : 'Jetzt erzeugen';
    errorBox.hidden = !e || busy;
    errorBox.querySelector('span:nth-child(2)').textContent = e ? `Der Entwurf konnte nicht erstellt werden. ${e}` : '';
    status.className = 'draft-status';
    if (busy) {
      status.classList.add('busy');
      status.textContent = 'Claude schreibt … (10 bis 30 Sekunden)';
    } else if (d) status.textContent = `${d.variant ? `Variante: ${VARIANT_LABEL[d.variant] || d.variant}. ` : ''}Bereit. Änderungen hier werden nicht gespeichert.`;
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
