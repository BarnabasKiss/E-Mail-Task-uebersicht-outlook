// Spracheingabe: Knopf "Diktieren" für ein Textfeld. Nutzt die Spracherkennung des Browsers (Chrome, Edge; in Brave und Firefox fehlt sie oder ist abgeschaltet).
// Chrome schickt das Audio zur Erkennung an Google: für vertrauliche Inhalte lieber das Diktat des Betriebssystems nehmen (Windows: Win+H).
import { el } from '../util.js';
import { icon } from '../icons.js';
import { joinDictation } from '../dictation-text.js';

const ERRORS = {
  'not-allowed': 'Der Browser darf das Mikrofon nicht benutzen. Erlaube es links in der Adressleiste.',
  'service-not-allowed': 'Der Browser darf die Spracherkennung nicht benutzen.',
  network: 'Die Spracherkennung des Browsers ist nicht erreichbar (in Brave ist sie abgeschaltet, Chrome oder Edge funktionieren). Alternative: Windows-Diktat mit Win+H.',
  'audio-capture': 'Es wurde kein Mikrofon gefunden.',
  'language-not-supported': 'Die Sprache wird nicht unterstützt.',
};

export const dictationSupported = (win = globalThis.window) => !!(win?.SpeechRecognition || win?.webkitSpeechRecognition);

/**
 * textarea: Feld, in das diktiert wird (an der Schreibmarke). Rückgabe: { node, stop() }. Fehler und Zwischenstand stehen in `hint` (ein Element oder null).
 * onText: wird nach jeder Einfügung aufgerufen (z. B. um den Entwurf zu speichern).
 */
export function createDictation({ textarea, lang = 'de-AT', onText = () => {}, hint = null, win = globalThis.window }) {
  const SR = win?.SpeechRecognition || win?.webkitSpeechRecognition;
  const button = el('button', { class: 'btn small dict-btn', type: 'button', 'aria-pressed': 'false' });
  let rec = null;
  let active = false;

  const say = (text) => {
    if (hint) hint.textContent = text;
  };
  const paint = () => {
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('listening', active);
    button.replaceChildren(icon('mic', 14), active ? 'Stopp' : 'Diktieren');
    button.title = !SR
      ? 'Dieser Browser hat keine Spracherkennung. Nimm Chrome oder Edge, oder das Windows-Diktat (Win+H).'
      : active
        ? 'Aufnahme beenden'
        : 'Sprich deinen Text. Befehle: „Komma“, „Punkt“, „Fragezeichen“, „neue Zeile“, „neuer Absatz“.';
    button.disabled = !SR;
  };

  function insert(chunk) {
    const pos = textarea.selectionEnd ?? textarea.value.length;
    const add = joinDictation(textarea.value.slice(0, pos), chunk);
    if (!add) return;
    textarea.setRangeText(add, pos, pos, 'end');
    textarea.dispatchEvent(new win.Event('input', { bubbles: true }));
    onText();
  }

  function start() {
    rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) insert(r[0].transcript);
        else interim += r[0].transcript;
      }
      say(interim ? `… ${interim}` : '');
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      say(ERRORS[e.error] || `Spracheingabe fehlgeschlagen (${e.error}).`);
      active = false;
      paint();
    };
    // Chrome beendet die Aufnahme nach einer Pause von selbst: weiterlaufen lassen, solange nicht "Stopp" gedrückt wurde
    rec.onend = () => {
      if (active) {
        try {
          rec.start();
        } catch {
          active = false;
          paint();
        }
      } else {
        say('');
        paint();
      }
    };
    rec.start();
  }

  button.addEventListener('click', () => {
    if (active) return stop();
    active = true;
    say('Ich höre zu … Sprich los.');
    paint();
    try {
      start();
    } catch (e) {
      active = false;
      say(`Spracheingabe nicht möglich: ${e.message}`);
      paint();
    }
  });

  function stop() {
    active = false;
    try {
      rec?.stop();
    } catch {
      // schon beendet
    }
    say('');
    paint();
  }

  paint();
  return { node: button, stop };
}
