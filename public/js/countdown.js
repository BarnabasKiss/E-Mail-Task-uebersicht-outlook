// Bedenkzeit vor dem Senden: zeigt "Wird in n s gesendet" mit "Rückgängig" und ruft nach Ablauf send() auf.
import { el } from './util.js';
import { icon } from './icons.js';

/**
 * bar: Element, in dem der Hinweis steht. text(left): Hinweistext. send(): Promise<boolean>. Rückgabe: { stop() }.
 * onStop(why): 'cancel' (Rückgängig) | 'failed' (send() meldete false) | 'done' (gesendet), danach ist die Bedenkzeit vorbei.
 */
export function startCountdown({ bar, seconds, text, send, onStop }) {
  let left = seconds;
  let timer = null;
  const end = (why) => {
    clearInterval(timer);
    timer = null;
    bar.hidden = true;
    onStop(why);
  };
  const paint = () =>
    bar.replaceChildren(
      el('span', {}, text(left)),
      el('button', { class: 'btn small', type: 'button', onclick: () => end('cancel') }, icon('undo', 14), 'Rückgängig'),
    );
  bar.hidden = false;
  timer = setInterval(async () => {
    left -= 1;
    if (left > 0) return paint();
    clearInterval(timer);
    bar.replaceChildren(el('span', {}, 'Wird gesendet …'));
    end((await send()) ? 'done' : 'failed');
  }, 1000);
  paint();
  return { stop: () => end('cancel') };
}
