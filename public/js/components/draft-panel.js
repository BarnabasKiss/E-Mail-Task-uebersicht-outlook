import { el, toast } from '../util.js';
import { icon } from '../icons.js';
import { createSendBox } from './send-box.js';
import { createImproveBar } from './improve-bar.js';

// Antwortentwurf: editierbar, kopierbar, neu erzeugbar (mit Hinweis), Werkzeuge in einer Leiste (improve-bar.js: Diktieren, Umschreiben mit Kürzer/Förmlicher/Freundlicher/Ablehnung,
// Übersetzen, Prüfen) und eine gemeinsame Versionsliste für alles. Ablage: Zwischenablage, als Entwurf in Outlook oder gleich senden (send-box.js; bei Testmails nur simuliert).
const REJECT = { id: 'ablehnung', label: 'Ablehnung', title: 'Neu schreiben: höfliche Ablehnung, ohne einen Grund zu erfinden', needsText: false };

export function createDraftPanel({ draft, error, isTest, needsReply = true, suggest, reply, ownSignature = () => '', signatureImage = () => null, onRegenerate, onOutlookDraft, onOutlookDraftDelete, onSend, onArchive, onSchedule, onUnschedule, onImprove, onSaveEdit, onSendCheck, undoSeconds }) {
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
  const hintRow = el('div', { class: 'draft-hint-row' }, hint);

  const sendBox =
    reply && onOutlookDraft
      ? createSendBox({ isTest, suggest, reply, getText: () => area.value, ownSignature, save: onOutlookDraft, send: onSend, check: onSendCheck, signatureImage, discard: onOutlookDraftDelete, archive: onArchive, schedule: onSchedule, unschedule: onUnschedule, undoSeconds })
      : null;

  // Werkzeuge für den Text im Feld: Rechtschreibung, Struktur, Lücken, Diktieren (mit Rückgängig)
  const improve = onImprove
    ? createImproveBar({
        getText: () => area.value,
        setText: (t) => { area.value = t; render(); grow(); },
        textarea: area,
        run: ({ mode }) => onImprove({ mode, text: area.value, to: reply ? [reply.sender] : [] }),
        onTextChange: () => queueEdit(),
        rewrite: [{ ...REJECT, run: () => regenerate({ variant: REJECT.id }) }],
      })
    : null;

  const node = el(
    'section',
    { class: 'card draft', 'aria-label': 'Antwortentwurf' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Antwortentwurf'), status, el('span', { class: 'spacer' }), copy, regen),
    errorBox,
    hintRow,
    area,
    improve?.node,
    improve?.gapsNode,
    sendBox?.node,
  );

  let current = { draft, error };
  let busy = false;

  function grow() {
    area.style.height = 'auto';
    area.style.height = `${Math.min(Math.max(area.scrollHeight + 2, 120), 380)}px`;
  }
  // Was du im Feld änderst, bleibt erhalten (auch nach dem Neuladen), ohne den erzeugten Entwurf zu überschreiben: das Lernen vergleicht beides
  let editTimer = null;
  function queueEdit() {
    if (!onSaveEdit) return;
    clearTimeout(editTimer);
    editTimer = setTimeout(() => onSaveEdit(area.value).catch(() => {}), 1200);
  }
  area.addEventListener('input', () => {
    grow();
    render();
    queueEdit();
    improve?.update();
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
    improve?.snapshot();
    try {
      await onRegenerate({ ...opts, hint: hint.value.trim(), base: area.value.trim() });
      hint.value = '';
      improve?.record(opts.variant ? REJECT.label : 'Neu erzeugt');
    } finally {
      busy = false;
      render();
    }
  }

  function render() {
    const { draft: d, error: e } = current;
    copy.disabled = !area.value.trim();
    sendBox?.update();
    improve?.update();
    regen.disabled = busy;
    hint.disabled = busy;
    regen.querySelector('span:last-child').textContent = d ? 'Neu erzeugen' : 'Jetzt erzeugen';
    errorBox.hidden = !e || busy;
    errorBox.querySelector('span:nth-child(2)').textContent = e ? `Der Entwurf konnte nicht erstellt werden. ${e}` : '';
    status.className = 'draft-status';
    if (busy) {
      status.classList.add('busy');
      status.textContent = 'Claude schreibt … (10 bis 30 Sekunden)';
    } else if (d) status.textContent = '';
    else if (isTest) status.textContent = 'Testnachricht: Entwürfe nur per Klick auf „Jetzt erzeugen“.';
    else if (!needsReply && !e) status.textContent = 'Laut Bewertung ist keine Antwort nötig. Du kannst trotzdem eine schreiben oder erzeugen lassen.';
    else if (!e) {
      status.classList.add('busy');
      status.textContent = 'Wird im Hintergrund erstellt …';
    } else status.textContent = '';
  }

  area.value = draft?.edited ?? draft?.text ?? '';
  render();
  queueMicrotask(grow);

  return {
    node,
    /** Der Verlauf ist geladen: die Signatur deiner letzten Nachricht ist jetzt bekannt. */
    refresh: () => sendBox?.update(),
    update(next) {
      current = next;
      if (next.draft) area.value = next.draft.text;
      busy = false;
      render();
      grow();
    },
  };
}
