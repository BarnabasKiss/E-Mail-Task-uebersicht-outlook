// Neue Mail schreiben, gleicher Aufbau wie die Antwort: zuerst der Text (mit Werkzeugen: Rechtschreibung, Struktur, Lücken, Diktieren), dann der Betreff
// (Vorschlag per Knopf, änderbar), darunter An, CC, BCC und die Knöpfe. Der Entwurf wird laufend in der App gespeichert (nicht in Outlook).
// Senden wartet 30 Sekunden ("Rückgängig"), Senden planen sendet zur gewählten Zeit. Gesendet wird nur, was vorher als Entwurf in Outlook abgelegt wurde.
import { el, toast, formatShort } from '../util.js';
import { icon } from '../icons.js';
import { createRecipientField } from './recipient-field.js';
import { createImproveBar } from './improve-bar.js';
import { createScheduleMenu } from './schedule-menu.js';
import { confirmWarnings } from './send-warn.js';
import { startCountdown, UNDO_SECONDS } from '../countdown.js';

/**
 * opts: { signature, prefill: { to, cc, subject, text, draftId }, suggest(q, exclude), appSave(p) -> { id, updatedAt }, appDelete(id),
 *         save(p) -> { draftId, webLink, savedAt }, send({ draftId }) -> true, discard({ draftId }), schedule({ kind, payload, sendAt, fromDraftId }),
 *         improve({ mode, text, subject, to }), makeSubject({ text, to }), check({ text, to, cc, bcc }) -> { warnings } (optional), back(), undoSeconds, autosaveMs }
 * @returns {{ dirty(): boolean, flush(): Promise }} dirty() = es gibt Änderungen, die noch nicht in der App gespeichert sind
 */
export function renderCompose(container, { signature = '', prefill = {}, suggest, appSave, appDelete, save, send, discard, schedule, improve, makeSubject, check, back, undoSeconds = UNDO_SECONDS, autosaveMs = 1200 }) {
  const field = (label, values) => createRecipientField({ label, values, suggest, onChange: () => changed() });
  const to = field('An', prefill.to || []);
  const cc = field('CC', prefill.cc || []);
  const bcc = field('BCC', prefill.bcc || []);
  const bccRow = el('div', { class: 'send-row' }, bcc.node);
  const bccLink = el('button', { class: 'link send-bcc', type: 'button', onclick: () => { bccRow.hidden = false; bccLink.hidden = true; bcc.focus(); } }, '+ BCC');
  bccRow.hidden = !(prefill.bcc || []).length;
  bccLink.hidden = !bccRow.hidden;

  const text = el('textarea', { class: 'draft-text cp-text', rows: 12, placeholder: 'Schreibe oder diktiere hier deine Mail …', 'aria-label': 'Text der Mail', oninput: () => changed() });
  text.value = prefill.text || '';
  const subject = el('input', { type: 'text', class: 'cp-subject', maxlength: '300', value: prefill.subject || '', placeholder: 'Betreff', 'aria-label': 'Betreff', oninput: () => changed() });
  const subjectBtn = el('button', { class: 'btn small', type: 'button', title: 'Claude schlägt einen Betreff aus dem Text vor; du kannst ihn danach ändern', onclick: () => doSubject() }, icon('sparkle', 14), 'Betreff vorschlagen');
  const sig = el('input', { type: 'checkbox', checked: true, 'aria-label': 'Meine Signatur anhängen' });
  const sigRow = el('div', { class: 'cp-sig', hidden: !signature }, el('label', { class: 'send-sig' }, sig, 'Meine Signatur anhängen'), el('details', {}, el('summary', {}, 'ansehen'), el('pre', {}, signature)));
  const saved = el('span', { class: 'cp-saved' });
  const status = el('span', { class: 'send-status', role: 'status' });
  const undoBar = el('div', { class: 'send-undo', hidden: true });
  const warnBox = el('div', { class: 'warn-box', hidden: true, role: 'alert' });
  const warnOk = () => (check ? confirmWarnings(warnBox, () => check({ text: text.value.trim(), to: to.get(), cc: cc.get(), bcc: bcc.get() })) : true);

  const bar = createImproveBar({
    getText: () => text.value,
    setText: (t) => { text.value = t; changed(); },
    textarea: text,
    run: ({ mode }) => improve({ mode, text: text.value, subject: subject.value, to: to.get() }),
    onTextChange: () => changed(),
  });

  const sendBtn = el('button', { class: 'btn primary', type: 'button', onclick: () => doSend() }, icon('send', 15), el('span', {}, 'Senden'));
  const planner = createScheduleMenu({ onPick: (iso) => doSchedule(iso) });
  const saveBtn = el('button', { class: 'btn', type: 'button', onclick: () => doSave() }, icon('external', 15), el('span', {}, 'In Outlook ablegen'));
  const discardBtn = el('button', { class: 'btn ghost', type: 'button', onclick: () => doDiscard() }, icon('trash', 15), el('span', {}, 'Verwerfen'));

  let draftId = ''; // Entwurf in Outlook (nur nach "In Outlook ablegen" oder beim Senden)
  let appId = prefill.draftId || ''; // Entwurf in der App
  let busy = false;
  let countdown = null;
  let finished = false;
  let timer = null;
  let unsaved = false;

  const payload = () => ({
    subject: subject.value.trim(),
    text: `${text.value.trim()}${sig.checked && signature ? `\n\n${signature}` : ''}`,
    to: to.get(),
    cc: cc.get(),
    bcc: bcc.get(),
  });
  const hasContent = () => !!(text.value.trim() || subject.value.trim() || to.get().length || cc.get().length || bcc.get().length);

  // --- Entwurf in der App: speichert still im Hintergrund
  async function saveApp() {
    clearTimeout(timer);
    timer = null;
    if (finished || !hasContent()) return unsaved = false;
    try {
      const out = await appSave({ id: appId, subject: subject.value, text: text.value, to: to.get(), cc: cc.get(), bcc: bcc.get() });
      appId = out.id;
      unsaved = false;
      saved.textContent = `Entwurf in der App gespeichert (${formatShort(out.updatedAt)})`;
    } catch {
      saved.textContent = 'Der Entwurf konnte nicht gespeichert werden.';
    }
  }
  function changed() {
    unsaved = true;
    clearTimeout(timer);
    timer = setTimeout(saveApp, autosaveMs);
    update();
    bar.update();
  }

  function problem() {
    const half = [to, cc, bcc].find((f) => f.pending());
    if (half) return `Bei ${half.node.dataset.label} steht eine unvollständige Adresse: „${half.pending()}“.`;
    if (!text.value.trim()) return 'Der Text ist leer.';
    if (!subject.value.trim()) return 'Es fehlt der Betreff (der Knopf „Betreff vorschlagen“ hilft).';
    if (!to.get().length) return 'Es fehlt ein Empfänger bei An.';
    return '';
  }

  function update() {
    const why = problem();
    const off = busy || !!countdown;
    sendBtn.disabled = off || !!why;
    sendBtn.title = why || `Legt die Mail als Entwurf in Outlook ab und sendet nach ${undoSeconds} Sekunden (mit Rückgängig)`;
    saveBtn.disabled = off || !!why;
    saveBtn.title = why;
    planner.setDisabled(off || !!why, why);
    discardBtn.disabled = off;
    subjectBtn.disabled = off || !text.value.trim();
    for (const f of [to, cc, bcc]) f.setDisabled(off);
    subject.disabled = text.disabled = off;
  }

  async function doSubject() {
    subjectBtn.disabled = true;
    try {
      const out = await makeSubject({ text: text.value, to: to.get() });
      subject.value = out.subject;
      changed();
    } catch (e) {
      toast(e.message, { error: true });
    } finally {
      update();
    }
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
        ...[
          icon('check', 14),
          `In Outlook abgelegt${out.savedAt ? ` (${formatShort(out.savedAt)})` : ''} `,
          out.webLink && el('a', { href: out.webLink, target: '_blank', rel: 'noopener', class: 'link' }, 'In Outlook öffnen'),
        ].filter(Boolean),
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

  async function cleanup() {
    finished = true;
    clearTimeout(timer);
    if (appId) await appDelete(appId).catch(() => {});
    bar.stopDictation();
  }

  async function doSend() {
    [to, cc, bcc].forEach((f) => f.commit());
    const why = problem();
    if (why) return toast(why, { error: true });
    if (!(await warnOk())) return;
    if (!(await doSave())) return;
    bar.stopDictation();
    const p = payload();
    const who = `${p.to.join(', ')}${p.cc.length ? ` (CC ${p.cc.join(', ')})` : ''}${p.bcc.length ? ` (BCC ${p.bcc.length})` : ''}`;
    countdown = startCountdown({
      bar: undoBar,
      seconds: undoSeconds,
      text: (left) => `Wird in ${left} s an ${who} gesendet. Mit „Rückgängig“ kannst du noch etwas ändern.`,
      send: () => send({ draftId }),
      onStop: async (reason) => {
        countdown = null;
        if (reason === 'done') {
          await cleanup();
          toast('Gesendet.');
          back();
          return;
        }
        status.textContent = reason === 'cancel' ? 'Senden abgebrochen. Du kannst weiterschreiben, der Entwurf liegt auch in Outlook.' : 'Das Senden hat nicht geklappt. Der Entwurf liegt in Outlook.';
        update();
      },
    });
    update();
  }

  async function doSchedule(iso) {
    [to, cc, bcc].forEach((f) => f.commit());
    const why = problem();
    if (why) return toast(why, { error: true });
    if (!(await warnOk())) return;
    busy = true;
    update();
    try {
      await schedule({ kind: 'new', payload: payload(), sendAt: iso, fromDraftId: appId });
      if (draftId) await discard({ draftId }).catch(() => {});
      finished = true;
      clearTimeout(timer);
      bar.stopDictation();
      toast(`Geplant für ${new Date(iso).toLocaleString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Unter „Entwürfe“ siehst du sie und kannst sie ändern oder abbrechen.`);
      back();
    } catch (e) {
      toast(e.message, { error: true });
    } finally {
      busy = false;
      update();
    }
  }

  async function doDiscard() {
    if (hasContent() && !confirm('Diese Mail verwerfen? Der Entwurf in der App und ein abgelegter Entwurf in Outlook werden gelöscht.')) return;
    if (draftId) {
      try {
        await discard({ draftId });
      } catch (e) {
        return toast(e.message, { error: true });
      }
    }
    await cleanup();
    back();
  }

  update();
  container.replaceChildren(
    el(
      'article',
      { class: 'detail compose' },
      el('header', { class: 'd-head' }, el('div', { class: 'd-title' }, el('h2', {}, 'Neue Mail'), saved), el('div', { class: 'd-actions' }, el('button', { class: 'btn', type: 'button', title: 'Zurück; der Entwurf bleibt in der App gespeichert', onclick: async () => { await saveApp(); bar.stopDictation(); back(); } }, icon('undo', 15), el('span', {}, 'Zurück')))),
      el(
        'section',
        { class: 'card cp-card', 'aria-label': 'Neue Mail' },
        text,
        bar.node,
        bar.gapsNode,
        sigRow,
        el('div', { class: 'cp-subject-row' }, el('label', {}, 'Betreff'), subject, subjectBtn),
        el('div', { class: 'send-row' }, to.node),
        el('div', { class: 'send-row' }, cc.node, bccLink),
        bccRow,
        el('div', { class: 'send-actions' }, sendBtn, planner.node, saveBtn, discardBtn),
        warnBox,
        undoBar,
        status,
      ),
    ),
  );
  if (prefill.draftId) saved.textContent = 'Entwurf aus der App geöffnet';
  (prefill.to?.length ? text : text).focus?.();
  return { dirty: () => unsaved && !finished, flush: saveApp };
}
