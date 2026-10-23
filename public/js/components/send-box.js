// Unter dem Antwortentwurf: Empfänger prüfen, in Outlook ablegen oder senden. Senden legt den Entwurf zuerst in Outlook ab und wartet dann
// 10 Sekunden ("Rückgängig"), bevor wirklich gesendet wird. Mit offenen Platzhaltern ([BITTE ERGÄNZEN …]) oder ohne Empfänger geht es nicht.
import { el, toast, formatShort } from '../util.js';
import { icon } from '../icons.js';

const UNDO_SECONDS = 10;
const parse = (s) => [...new Set(String(s).split(/[,;\s]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))];

/**
 * reply: { only: {to, cc}, all: {to, cc}, draft: gemerkter Outlook-Entwurf | null }
 * getText(): Text im Feld. ownSignature(): Signatur deiner letzten Nachricht ('' = keine bekannt).
 * save({text, to, cc}) -> { webLink, savedAt } (wirft bei Fehler). send() -> true, wenn gesendet. discard() löscht den Entwurf in Outlook.
 */
export function createSendBox({ reply, getText, ownSignature, save, send, discard, undoSeconds = UNDO_SECONDS }) {
  const saved = reply.draft;
  const hasAll = JSON.stringify(reply.all) !== JSON.stringify(reply.only);
  const start = saved ? { to: saved.to, cc: saved.cc } : reply.only;
  const to = el('input', { type: 'text', class: 'send-addr', value: start.to.join(', '), 'aria-label': 'An', placeholder: 'Adresse(n), mit Komma getrennt', oninput: () => update() });
  const cc = el('input', { type: 'text', class: 'send-addr', value: start.cc.join(', '), 'aria-label': 'CC', placeholder: 'optional', oninput: () => update() });
  const radio = (value, text, checked) => el('label', { class: 'send-mode' }, el('input', { type: 'radio', name: `mode-${Math.random().toString(36).slice(2)}`, checked, onchange: () => setMode(value) }), text);
  const only = radio('only', 'Nur an den Absender', !saved?.cc?.length);
  const all = radio('all', 'Allen antworten', !!saved?.cc?.length);
  const sig = el('input', { type: 'checkbox', checked: true, 'aria-label': 'Meine Signatur anhängen' });
  const sigRow = el('label', { class: 'send-sig', hidden: true }, sig, 'Meine Signatur anhängen');
  const status = el('span', { class: 'send-status', role: 'status' });
  const saveBtn = el('button', { class: 'btn', type: 'button', onclick: () => doSave() }, icon('external', 15), el('span', {}, 'In Outlook ablegen'));
  const sendBtn = el('button', { class: 'btn primary', type: 'button', onclick: () => doSend() }, icon('check', 15), el('span', {}, 'Senden'));
  const undoBar = el('div', { class: 'send-undo', hidden: true });
  let busy = false;
  let timer = null;

  function setMode(m) {
    const r = reply[m];
    to.value = r.to.join(', ');
    cc.value = r.cc.join(', ');
    update();
  }

  const payload = () => {
    const signature = sig.checked && ownSignature() ? `\n\n${ownSignature()}` : '';
    return { text: `${getText().trim()}${signature}`, to: parse(to.value), cc: parse(cc.value) };
  };

  function problem() {
    const p = payload();
    if (!getText().trim()) return 'Der Entwurf ist leer.';
    if (!p.to.length) return 'Es fehlt ein Empfänger bei An.';
    if (/\[BITTE ERGÄNZEN/i.test(p.text)) return 'Im Entwurf steht noch „[BITTE ERGÄNZEN …]“.';
    return '';
  }

  function update() {
    sigRow.hidden = !ownSignature();
    const why = problem();
    const off = busy || !!timer;
    saveBtn.disabled = off || !getText().trim() || !parse(to.value).length;
    sendBtn.disabled = off || !!why;
    sendBtn.title = why || 'Legt den Entwurf in Outlook ab und sendet nach 10 Sekunden (mit Rückgängig)';
    to.disabled = cc.disabled = off;
  }

  function showSaved(out) {
    status.replaceChildren(
      icon('check', 14),
      `In Outlook abgelegt${out.savedAt ? ` (${formatShort(out.savedAt)})` : ''} `,
      out.webLink && el('a', { href: out.webLink, target: '_blank', rel: 'noopener', class: 'link' }, 'In Outlook öffnen'),
      ' · ',
      el('button', { class: 'link', type: 'button', onclick: doDiscard }, 'Entwurf dort löschen'),
    );
  }

  async function doSave() {
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
      status.textContent = 'Entwurf in Outlook gelöscht.';
    } catch (e) {
      toast(e.message, { error: true });
    }
  }

  async function doSend() {
    const why = problem();
    if (why) return toast(why, { error: true });
    if (!(await doSave())) return;
    const p = payload();
    let left = undoSeconds;
    const stop = () => {
      clearInterval(timer);
      timer = null;
      undoBar.hidden = true;
      update();
    };
    const paint = () =>
      undoBar.replaceChildren(
        el('span', {}, `Wird in ${left} s an ${p.to.join(', ')}${p.cc.length ? ` (CC ${p.cc.join(', ')})` : ''} gesendet.`),
        el('button', { class: 'btn small', type: 'button', onclick: () => { stop(); status.textContent = 'Senden abgebrochen. Der Entwurf liegt weiter in Outlook.'; } }, icon('undo', 14), 'Rückgängig'),
      );
    undoBar.hidden = false;
    timer = setInterval(async () => {
      left -= 1;
      if (left > 0) return paint();
      clearInterval(timer);
      undoBar.replaceChildren(el('span', {}, 'Wird gesendet …'));
      const ok = await send();
      if (!ok) {
        timer = null;
        undoBar.hidden = true;
        status.textContent = 'Das Senden hat nicht geklappt. Der Entwurf liegt in Outlook.';
        update();
      }
    }, 1000);
    paint();
    update();
  }

  if (saved) showSaved(saved);
  update();

  const node = el(
    'div',
    { class: 'send-box' },
    hasAll && el('div', { class: 'send-modes' }, only, all),
    el('div', { class: 'send-row' }, el('label', {}, 'An'), to),
    el('div', { class: 'send-row' }, el('label', {}, 'CC'), cc),
    sigRow,
    el('div', { class: 'send-actions' }, saveBtn, sendBtn),
    undoBar,
    status,
  );
  return { node, update };
}
