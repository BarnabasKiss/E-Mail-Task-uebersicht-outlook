// Spracheingabe: Knopf "Diktieren" für ein Textfeld. Zwei Wege:
//  1. lokal (bevorzugt): der Browser nimmt am Mikrofon auf (in Abschnitten, geschnitten bei Sprechpausen), die App erkennt die Abschnitte auf diesem Rechner
//     (faster-whisper, siehe lib/speech.js und install-speech.sh). Läuft in Brave, Chrome und Edge, unter Linux/Wayland, ohne Netz, mit Satzzeichen.
//  2. Ausweichweg: die Spracherkennung des Browsers (nur Chrome/Edge; das Audio geht dabei an den Anbieter). Brave hat sie abgeschaltet.
import { el } from '../util.js';
import { icon } from '../icons.js';
import { joinDictation } from '../dictation-text.js';
import { api } from '../api.js';
import { recorderSupported, startSegmentRecorder } from '../recorder.js';

const ERRORS = {
  'not-allowed': 'Der Browser darf das Mikrofon nicht benutzen. Erlaube es links in der Adressleiste.',
  'service-not-allowed': 'Der Browser darf die Spracherkennung nicht benutzen.',
  network: 'Die Spracherkennung des Browsers ist nicht erreichbar. Richte die lokale Erkennung ein: im App-Ordner ./install-speech.sh ausführen.',
  'audio-capture': 'Es wurde kein Mikrofon gefunden.',
  'language-not-supported': 'Die Sprache wird nicht unterstützt.',
  NotAllowedError: 'Der Browser darf das Mikrofon nicht benutzen. Erlaube es links in der Adressleiste (Schloss-Symbol).',
  NotFoundError: 'Es wurde kein Mikrofon gefunden.',
  NotReadableError: 'Das Mikrofon ist belegt (von einer anderen Anwendung).',
};
const INSTALL = 'Die lokale Spracherkennung ist noch nicht eingerichtet: im App-Ordner ./install-speech.sh ausführen (einmalig, lädt ein Modell herunter), danach die App neu starten.';

// Brave meldet eine Browser-Erkennung, die dort nie funktioniert (abgeschaltet): sie zählt nicht
const browserRecognition = (win) => (win?.navigator?.brave ? null : win?.SpeechRecognition || win?.webkitSpeechRecognition || null);
export const dictationSupported = (win = globalThis.window) => recorderSupported(win) || !!browserRecognition(win);

/**
 * textarea: Feld, in das diktiert wird (an der Schreibmarke). hint: Element für Zwischenstand und Meldungen (oder null). onText: nach jeder Einfügung.
 * deps (für Tests): { speechStatus(), transcribe(blob), startRecorder({ onSegment }) }.
 * Rückgabe: { node, stop() }
 */
export function createDictation({ textarea, lang = 'de-AT', onText = () => {}, hint = null, win = globalThis.window, deps = {} }) {
  const speechStatus = deps.speechStatus || (() => api.speech());
  const transcribe = deps.transcribe || ((blob) => api.transcribe(blob));
  const startRecorder = deps.startRecorder || ((o) => startSegmentRecorder({ ...o, win }));
  const button = el('button', { class: 'btn small dict-btn', type: 'button', 'aria-pressed': 'false' });
  const SR = browserRecognition(win);
  const canRecord = recorderSupported(win) || !!deps.startRecorder;
  let state = 'idle'; // idle | listening | working (Abschlusserkennung läuft noch)
  let engine = null;
  let rec = null; // Browser-Erkennung
  let recorder = null; // lokale Aufnahme
  let chain = Promise.resolve();

  const say = (text) => {
    if (hint) hint.textContent = text;
  };
  function paint() {
    const active = state !== 'idle';
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('listening', state === 'listening');
    button.replaceChildren(icon('mic', 14), state === 'listening' ? 'Stopp' : state === 'working' ? 'Erkenne …' : 'Diktieren');
    button.disabled = state === 'working' || (!canRecord && !SR);
    button.title =
      !canRecord && !SR
        ? 'Dieser Browser kann nicht aufnehmen. Nimm Brave, Chrome oder Edge, oder das Diktat des Systems (Windows: Win+H).'
        : state === 'listening'
          ? 'Aufnahme beenden'
          : 'Sprich deinen Text (Satzzeichen setzt die Erkennung selbst). Befehle: „neue Zeile“, „neuer Absatz“, „Komma“, „Punkt“, „Fragezeichen“.';
  }

  function insert(chunk) {
    const pos = textarea.selectionEnd ?? textarea.value.length;
    const add = joinDictation(textarea.value.slice(0, pos), chunk);
    if (!add) return;
    textarea.setRangeText(add, pos, pos, 'end');
    textarea.dispatchEvent(new win.Event('input', { bubbles: true }));
    onText();
  }

  // --- lokal: Aufnahme -> /api/transcribe -> Text
  function enqueue(blob) {
    chain = chain.then(async () => {
      say('… wird erkannt');
      try {
        insert(await transcribe(blob));
        say(state === 'listening' ? 'Ich höre zu …' : '');
      } catch (e) {
        say(e.message);
      }
    });
    return chain;
  }

  async function startLocal() {
    recorder = await startRecorder({ onSegment: (blob) => enqueue(blob) });
  }

  async function stopLocal() {
    state = 'working';
    paint();
    say('… wird erkannt');
    try {
      await recorder?.stop();
      await chain;
    } finally {
      recorder = null;
      state = 'idle';
      say('');
      paint();
    }
  }

  // --- Ausweichweg: Browser-Erkennung
  function startBrowser() {
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
      state = 'idle';
      paint();
    };
    // Chrome beendet die Aufnahme nach einer Pause von selbst: weiterlaufen lassen, solange nicht "Stopp" gedrückt wurde
    rec.onend = () => {
      if (state === 'listening') {
        try {
          rec.start();
        } catch {
          state = 'idle';
          paint();
        }
      } else {
        say('');
        paint();
      }
    };
    rec.start();
  }

  async function chooseEngine() {
    const status = canRecord ? await Promise.resolve(speechStatus()).catch(() => ({ available: false })) : { available: false };
    if (status.available) return 'local';
    if (SR) return 'browser';
    throw new Error(canRecord ? INSTALL : 'Dieser Browser kann nicht aufnehmen.');
  }

  async function start() {
    state = 'listening';
    say('Mikrofon wird gestartet …');
    paint();
    try {
      engine = await chooseEngine();
      if (engine === 'local') await startLocal();
      else startBrowser();
      say(engine === 'local' ? 'Ich höre zu … (lokal, ohne Netz)' : 'Ich höre zu … (Spracherkennung des Browsers)');
    } catch (e) {
      state = 'idle';
      say(ERRORS[e.name] || e.message);
      paint();
    }
  }

  async function stop() {
    if (state === 'idle') return;
    if (engine === 'local' && recorder) return stopLocal();
    state = 'idle';
    try {
      rec?.stop();
    } catch {
      // schon beendet
    }
    say('');
    paint();
  }

  button.addEventListener('click', () => (state === 'listening' ? stop() : state === 'idle' ? start() : null));
  paint();
  return { node: button, stop };
}
