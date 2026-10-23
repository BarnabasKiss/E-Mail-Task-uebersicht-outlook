// Unter dem Antwortentwurf: Empfänger (An, CC, BCC, mit Vorschlägen aus dem Adressbuch) prüfen, in Outlook ablegen oder senden.
// Senden legt den Entwurf zuerst in Outlook ab und wartet dann 10 Sekunden ("Rückgängig"), bevor wirklich gesendet wird. Die Mail bleibt danach
// offen; "Senden & Done" legt sie gleich in Done ab, und nach dem Senden bietet die App „In Done ablegen“ an.
// Mit offenen Platzhaltern ([BITTE ERGÄNZEN …]), ohne Empfänger oder mit halber Eingabe in einem Feld geht es nicht.
import { el, toast, formatShort } from '../util.js';
import { icon } from '../icons.js';
import { createRecipientField } from './recipient-field.js';
import { startCountdown } from '../countdown.js';

const UNDO_SECONDS = 10;

/**
 * reply: { names, only: {to, cc}, all: {to, cc}, draft: gemerkter Outlook-Entwurf | null }
 * getText(): Text im Feld. ownSignature(): Signatur deiner letzten Nachricht ('' = keine bekannt). suggest(q, exclude) -> Vorschläge.
 * save({text, to, cc, bcc}) -> { webLink, savedAt, simulated } (wirft bei Fehler). send({done}) -> true, wenn gesendet. discard() löscht den Entwurf in Outlook.
 * archive() legt die Mail in Done ab (Knopf nach dem Senden).
 */
export function createSendBox({ isTest = false, reply, getText, ownSignature, suggest, save, send, discard, archive, undoSeconds = UNDO_SECONDS }) {
  const saved = reply.draft;
  const hasAll = JSON.stringify([reply.all.to, reply.all.cc]) !== JSON.stringify([reply.only.to, reply.only.cc]);
  const start = saved ? { to: saved.to, cc: saved.cc, bcc: saved.bcc || [] } : { ...reply.only, bcc: [] };
  const field = (label, values) => createRecipientField({ label, values, names: reply.names || {}, suggest, onChange: () => update() });
  const to = field('An', start.to);
  const cc = field('CC', start.cc);
  const bcc = field('BCC', start.bcc);
  const bccRow = el('div', { class: 'send-row' }, bcc.node);
  const bccLink = el('button', { class: 'link send-bcc', type: 'button', onclick: () => { bccRow.hidden = false; bccLink.hidden = true; bcc.focus(); } }, '+ BCC');
  bccRow.hidden = !start.bcc.length;
  bccLink.hidden = !bccRow.hidden;

  const radio = (value, text, checked, name) => el('label', { class: 'send-mode' }, el('input', { type: 'radio', name, checked, onchange: () => setMode(value) }), text);
  const group = `mode-${Math.random().toString(36).slice(2)}`;
  const only = radio('only', 'Nur an den Absender', !saved?.cc?.length, group);
  const all = radio('all', 'Allen antworten', !!saved?.cc?.length, group);
  const sig = el('input', { type: 'checkbox', checked: true, 'aria-label': 'Meine Signatur anhängen' });
  const sigRow = el('label', { class: 'send-sig', hidden: true }, sig, 'Meine Signatur anhängen');
  const status = el('span', { class: 'send-status', role: 'status' });
  const saveBtn = el('button', { class: 'btn', type: 'button', onclick: () => doSave() }, icon('external', 15), el('span', {}, 'In Outlook ablegen'));
  const sendBtn = el('button', { class: 'btn primary', type: 'button', onclick: () => doSend() }, icon('check', 15), el('span', {}, 'Senden'));
  const sendDoneBtn = el('button', { class: 'btn', type: 'button', title: 'Senden und die Mail gleich in Done ablegen', onclick: () => doSend({ done: true }) }, icon('archive', 15), el('span', {}, 'Senden & Done'));
  const undoBar = el('div', { class: 'send-undo', hidden: true });
  let busy = false;
  let countdown = null;

  function setMode(m) {
    const r = reply[m];
    to.set(r.to);
    cc.set(r.cc);
    update();
  }

  const payload = () => {
    const signature = sig.checked && ownSignature() ? `\n\n${ownSignature()}` : '';
    return { text: `${getText().trim()}${signature}`, to: to.get(), cc: cc.get(), bcc: bcc.get() };
  };

  function problem() {
    const p = payload();
    const half = [to, cc, bcc].find((f) => f.pending());
    if (!getText().trim()) return 'Der Entwurf ist leer.';
    if (half) return `Bei ${half.node.dataset.label} steht eine unvollständige Adresse: „${half.pending()}“.`;
    if (!p.to.length) return 'Es fehlt ein Empfänger bei An.';
    if (/\[BITTE ERGÄNZEN/i.test(p.text)) return 'Im Entwurf steht noch „[BITTE ERGÄNZEN …]“.';
    return '';
  }

  function update() {
    sigRow.hidden = !ownSignature();
    const why = problem();
    const off = busy || !!countdown;
    saveBtn.disabled = off || !getText().trim() || !to.get().length;
    sendBtn.disabled = off || !!why;
    sendDoneBtn.disabled = off || !!why;
    sendBtn.title = why || 'Legt den Entwurf in Outlook ab und sendet nach 10 Sekunden (mit Rückgängig). Die Mail bleibt offen.';
    for (const f of [to, cc, bcc]) f.setDisabled(off);
  }

  function showSaved(out) {
    if (out.simulated) {
      status.replaceChildren(icon('check', 14), 'Test: abgelegt (nur simuliert, in Outlook ist nichts passiert) · ', el('button', { class: 'link', type: 'button', onclick: doDiscard }, 'Entwurf verwerfen'));
      return;
    }
    status.replaceChildren(
      icon('check', 14),
      `In Outlook abgelegt${out.savedAt ? ` (${formatShort(out.savedAt)})` : ''} `,
      out.webLink && el('a', { href: out.webLink, target: '_blank', rel: 'noopener', class: 'link' }, 'In Outlook öffnen'),
      ' · ',
      el('button', { class: 'link', type: 'button', onclick: doDiscard }, 'Entwurf dort löschen'),
    );
  }

  async function doSave() {
    [to, cc, bcc].forEach((f) => f.commit());
    busy = true;
    update();
    status.textContent = 'Wird in Outlook abgelegt …';
    try {
      const out = await save(payload());
      showSaved(out);
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

  async function doDiscard() {
    try {
      await discard();
      status.textContent = isTest ? 'Entwurf verworfen.' : 'Entwurf in Outlook gelöscht.';
    } catch (e) {
      toast(e.message, { error: true });
    }
  }

  async function doSend({ done = false } = {}) {
    [to, cc, bcc].forEach((f) => f.commit());
    const why = problem();
    if (why) return toast(why, { error: true });
    if (!(await doSave())) return;
    const p = payload();
    const who = `${p.to.join(', ')}${p.cc.length ? ` (CC ${p.cc.join(', ')})` : ''}${p.bcc.length ? ` (BCC ${p.bcc.length})` : ''}`;
    countdown = startCountdown({
      bar: undoBar,
      seconds: undoSeconds,
      text: (left) => `Wird in ${left} s an ${who} gesendet${done ? ' und danach in Done abgelegt' : ''}.`,
      send: () => send({ done }),
      onStop: (reason) => {
        countdown = null;
        if (reason === 'cancel') status.textContent = 'Senden abgebrochen. Der Entwurf liegt weiter in Outlook.';
        else if (reason === 'failed') status.textContent = 'Das Senden hat nicht geklappt. Der Entwurf liegt in Outlook.';
        else if (!done) showSent(who);
        update();
      },
    });
    update();
  }

  // Nach dem Senden bleibt die Mail offen; hier kann sie gleich in Done wandern
  function showSent(who) {
    status.replaceChildren(
      icon('check', 14),
      `${isTest ? 'Test: nichts gesendet (simuliert)' : 'Gesendet'} (${formatShort(new Date().toISOString())}) an ${who}. `,
      archive && el('button', { class: 'link', type: 'button', onclick: () => archive() }, 'In Done ablegen'),
    );
  }

  if (saved) showSaved(saved);
  update();

  const node = el(
    'div',
    { class: 'send-box' },
    isTest && el('p', { class: 'send-test' }, icon('flask', 13), 'Testmodus: Ablegen und Senden sind simuliert, an Outlook geht nichts.'),
    hasAll && el('div', { class: 'send-modes' }, only, all),
    el('div', { class: 'send-row' }, to.node),
    el('div', { class: 'send-row' }, cc.node, bccLink),
    bccRow,
    sigRow,
    el('div', { class: 'send-actions' }, saveBtn, sendBtn, sendDoneBtn),
    undoBar,
    status,
  );
  return { node, update };
}
