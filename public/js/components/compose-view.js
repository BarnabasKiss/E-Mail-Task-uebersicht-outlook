// Neue Mail schreiben: An, CC, BCC (mit Vorschlägen aus dem Adressbuch), Betreff, Text. Ablegen legt einen Entwurf in Outlook an, Senden wartet
// danach 10 Sekunden ("Rückgängig"). Gesendet wird nur, was vorher als Entwurf abgelegt wurde.
import { el, toast, formatShort } from '../util.js';
import { icon } from '../icons.js';
import { createRecipientField } from './recipient-field.js';
import { startCountdown } from '../countdown.js';

/**
 * opts: { signature, prefill: { to, cc, subject, text }, suggest(q, exclude), save(payload) -> { draftId, webLink, savedAt },
 *         send({ draftId }) -> true, discard({ draftId }), back(), undoSeconds }
 * @returns {{ dirty(): boolean }} dirty() = es steht etwas drin, das noch nicht gesendet ist (für die Rückfrage beim Verlassen)
 */
export function renderCompose(container, { signature = '', prefill = {}, suggest, save, send, discard, back, undoSeconds = 10 }) {
  const field = (label, values) => createRecipientField({ label, values, suggest, onChange: () => update() });
  const to = field('An', prefill.to || []);
  const cc = field('CC', prefill.cc || []);
  const bcc = field('BCC', []);
  const bccRow = el('div', { class: 'send-row' }, bcc.node);
  bccRow.hidden = true;
  const bccLink = el('button', { class: 'link send-bcc', type: 'button', onclick: () => { bccRow.hidden = false; bccLink.hidden = true; bcc.focus(); } }, '+ BCC');
  const subject = el('input', { type: 'text', class: 'cp-subject', maxlength: '300', value: prefill.subject || '', placeholder: 'Betreff', 'aria-label': 'Betreff', oninput: () => update() });
  const text = el('textarea', { class: 'draft-text cp-text', rows: 12, placeholder: 'Text der Mail …', 'aria-label': 'Text der Mail', oninput: () => update() });
  text.value = prefill.text || '';
  const sig = el('input', { type: 'checkbox', checked: true, 'aria-label': 'Meine Signatur anhängen' });
  const sigRow = el('div', { class: 'cp-sig', hidden: !signature }, el('label', { class: 'send-sig' }, sig, 'Meine Signatur anhängen'), el('details', {}, el('summary', {}, 'ansehen'), el('pre', {}, signature)));
  const status = el('span', { class: 'send-status', role: 'status' });
  const undoBar = el('div', { class: 'send-undo', hidden: true });
  const saveBtn = el('button', { class: 'btn', type: 'button', onclick: () => doSave() }, icon('external', 15), el('span', {}, 'In Outlook ablegen'));
  const sendBtn = el('button', { class: 'btn primary', type: 'button', onclick: () => doSend() }, icon('check', 15), el('span', {}, 'Senden'));
  const discardBtn = el('button', { class: 'btn ghost', type: 'button', onclick: () => doDiscard() }, icon('trash', 15), el('span', {}, 'Verwerfen'));
  let draftId = '';
  let busy = false;
  let countdown = null;
  let sent = false;

  const payload = () => ({
    subject: subject.value.trim(),
    text: `${text.value.trim()}${sig.checked && signature ? `\n\n${signature}` : ''}`,
    to: to.get(),
    cc: cc.get(),
    bcc: bcc.get(),
  });
  const dirty = () => !sent && !!(text.value.trim() || subject.value.trim() || to.get().length || cc.get().length || bcc.get().length);

  function problem() {
    const half = [to, cc, bcc].find((f) => f.pending());
    if (half) return `Bei ${half.node.dataset.label} steht eine unvollständige Adresse: „${half.pending()}“.`;
    if (!to.get().length) return 'Es fehlt ein Empfänger bei An.';
    if (!subject.value.trim()) return 'Es fehlt der Betreff.';
    if (!text.value.trim()) return 'Der Text ist leer.';
    return '';
  }

  function update() {
    const why = problem();
    const off = busy || !!countdown;
    saveBtn.disabled = off || !!why;
    sendBtn.disabled = off || !!why;
    sendBtn.title = why || 'Legt die Mail als Entwurf in Outlook ab und sendet nach 10 Sekunden (mit Rückgängig)';
    saveBtn.title = why;
    discardBtn.disabled = off;
    for (const f of [to, cc, bcc]) f.setDisabled(off);
    subject.disabled = text.disabled = off;
  }

  async function doSave() {
    [to, cc, bcc].forEach((f) => f.commit());
    busy = true;
    update();
    status.textContent = 'Wird in Outlook abgelegt …';
    try {
      const out = await save({ ...payload(), replaceId: draftId });
      draftId = out.draftId;
      status.replaceChildren(
        icon('check', 14),
        `In Outlook abgelegt${out.savedAt ? ` (${formatShort(out.savedAt)})` : ''} `,
        out.webLink && el('a', { href: out.webLink, target: '_blank', rel: 'noopener', class: 'link' }, 'In Outlook öffnen'),
      );
      return true;
    } catch (e) {
      status.textContent = '';
      toast(e.message, { error: true });
      return false;
    } finally {
      busy = false;
      update();
    }
  }

  async function doSend() {
    [to, cc, bcc].forEach((f) => f.commit());
    const why = problem();
    if (why) return toast(why, { error: true });
    if (!(await doSave())) return;
    const p = payload();
    const who = `${p.to.join(', ')}${p.cc.length ? ` (CC ${p.cc.join(', ')})` : ''}${p.bcc.length ? ` (BCC ${p.bcc.length})` : ''}`;
    countdown = startCountdown({
      bar: undoBar,
      seconds: undoSeconds,
      text: (left) => `Wird in ${left} s an ${who} gesendet.`,
      send: () => send({ draftId }),
      onStop: (reason) => {
        countdown = null;
        if (reason === 'done') {
          sent = true;
          toast('Gesendet.');
          back();
          return;
        }
        status.textContent = reason === 'cancel' ? 'Senden abgebrochen. Der Entwurf liegt weiter in Outlook.' : 'Das Senden hat nicht geklappt. Der Entwurf liegt in Outlook.';
        update();
      },
    });
    update();
  }

  async function doDiscard() {
    if (dirty() && !confirm('Diese Mail verwerfen? Ein in Outlook abgelegter Entwurf wird gelöscht.')) return;
    if (draftId) {
      try {
        await discard({ draftId });
      } catch (e) {
        return toast(e.message, { error: true });
      }
    }
    sent = true; // nichts mehr, was verloren gehen könnte
    back();
  }

  update();
  container.replaceChildren(
    el(
      'article',
      { class: 'detail compose' },
      el('header', { class: 'd-head' }, el('div', { class: 'd-title' }, el('h2', {}, 'Neue Mail')), el('div', { class: 'd-actions' }, el('button', { class: 'btn', type: 'button', onclick: doDiscard }, icon('undo', 15), el('span', {}, 'Zurück')))),
      el(
        'section',
        { class: 'card cp-card' },
        el('div', { class: 'send-row' }, to.node),
        el('div', { class: 'send-row' }, cc.node, bccLink),
        bccRow,
        el('div', { class: 'cp-subject-row' }, el('label', {}, 'Betreff'), subject),
        text,
        sigRow,
        el('div', { class: 'send-actions' }, saveBtn, sendBtn, discardBtn),
        undoBar,
        status,
      ),
    ),
  );
  (prefill.to?.length ? subject : to).focus?.();
  return { dirty };
}
