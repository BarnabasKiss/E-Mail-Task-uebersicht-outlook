// Lokale Spracherkennung für das Diktieren: ein Python-Arbeitsprozess (tools/stt-worker.py, faster-whisper) erkennt die Aufnahmen aus dem Browser
// auf diesem Rechner, nichts geht ins Netz (nur das Modell wird beim ersten Start einmal heruntergeladen). Eingerichtet wird er mit install-speech.sh.
// Der Prozess startet beim ersten Diktat, bleibt eine Weile im Speicher und beendet sich nach längerem Leerlauf von selbst.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Whisper erfindet bei Stille manchmal Sätze aus seinen Trainingsdaten; ein kurzes Ergebnis, das nur daraus besteht, wird verworfen
const HALLUCINATION = /^(untertitel(ung)?\b.{0,70}|vielen dank (für|fürs) (die|das|ihr|eure?)? ?(aufmerksamkeit|zuschauen|zusehen).{0,20}|bis (zum )?(nächsten|bald)\b.{0,25}|copyright\b.{0,60}|amara\.org.{0,40}|thanks for watching.{0,20})$/i;
// Whisper übernimmt Schreibweise und Satzzeichen vom Anfangstext (Prompt); bei leisen, kurzen Aufnahmen gibt es ihn manchmal selbst zurück, auch das wird verworfen
export const PROMPT = 'Hallo Anna, vielen Dank für deine Nachricht. Ich melde mich morgen wegen der Rechnung, Schaden-Nr. 2026-0815.';
const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const cleanTranscript = (text) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length < 90 && HALLUCINATION.test(t)) return '';
  const flat = squash(t);
  return flat.length >= 12 && squash(PROMPT).includes(flat) ? '' : t;
};

export function defaultPython(dataDir) {
  return path.join(dataDir, 'speech-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}

/**
 * options: { enabled, python, args (statt des Standard-Aufrufs, für Tests), script, model, language, tmpDir, idleMs, startMs, jobMs, log }
 * @returns {{ status(), transcribe(buffer, mime) -> Promise<string>, close() }}
 */
export function createSpeech({ enabled = true, python, args, script, model = 'large-v3-turbo', language = 'de', tmpDir = os.tmpdir(), idleMs = 10 * 60_000, startMs = 15 * 60_000, jobMs = 180_000, log = console.log }) {
  let child = null;
  let ready = null; // Promise, die erfüllt wird, wenn das Modell geladen ist
  let nextId = 1;
  const pending = new Map();
  let chain = Promise.resolve(); // Aufträge laufen nacheinander (ein Modell, eine CPU)
  let idleTimer = null;
  let buffer = '';

  // Aufnahmen, die nach einem Absturz liegen geblieben sind (älter als eine Stunde), räumt der Start auf
  try {
    for (const f of fs.readdirSync(tmpDir)) {
      const full = path.join(tmpDir, f);
      if (/^stt-\d+-/.test(f) && Date.now() - fs.statSync(full).mtimeMs > 3600_000) fs.rmSync(full, { force: true });
    }
  } catch {
    // Ordner nicht lesbar: nicht schlimm
  }

  const installed = () => !!python && fs.existsSync(python) && (!script || fs.existsSync(script));

  function status() {
    if (!enabled) return { available: false, reason: 'abgeschaltet', model };
    if (!installed()) return { available: false, reason: 'nicht eingerichtet', model, hint: 'Im App-Ordner ./install-speech.sh ausführen (einmalig, lädt das Erkennungsmodell herunter).' };
    return { available: true, running: !!child, model, language };
  }

  function stop() {
    clearTimeout(idleTimer);
    if (child) child.kill();
    child = null;
    ready = null;
  }

  function start() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      const proc = spawn(python, args || [script, model, language], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      child = proc;
      proc.stdin.on('error', () => {}); // der Prozess ist schon weg: die Meldung kommt über 'close'
      buffer = '';
      let err = '';
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error('Die Spracherkennung hat nicht rechtzeitig gestartet (beim ersten Mal lädt sie das Modell herunter).'));
      }, startMs);
      proc.stderr.setEncoding('utf8').on('data', (d) => (err = (err + d).slice(-2000)));
      proc.stdout.setEncoding('utf8').on('data', (d) => {
        buffer += d;
        for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
          const line = buffer.slice(0, i).trim();
          buffer = buffer.slice(i + 1);
          if (!line) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.ready) {
            clearTimeout(timer);
            resolve();
          } else if (msg.fatal) {
            clearTimeout(timer);
            reject(new Error(`Die Spracherkennung konnte nicht starten: ${msg.fatal}`));
          } else if (pending.has(msg.id)) {
            const job = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) job.reject(new Error(msg.error));
            else job.resolve(msg.text || '');
          }
        }
      });
      proc.on('error', (e) => {
        clearTimeout(timer);
        reject(new Error(`Die Spracherkennung lässt sich nicht starten: ${e.message}`));
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (child === proc) {
          child = null;
          ready = null;
        }
        if (child === null) {
          // nur der aktuelle Prozess betrifft die laufenden Aufträge; das späte Ende eines älteren soll einen neuen nicht abbrechen
          for (const job of pending.values()) job.reject(new Error(`Die Spracherkennung wurde beendet (Code ${code}). ${err.slice(-300)}`));
          pending.clear();
        }
        reject(new Error(`Die Spracherkennung wurde beendet (Code ${code}). ${err.slice(-300)}`));
      });
    });
    ready.catch(() => {
      stop();
    });
    return ready;
  }

  function run(file) {
    return new Promise((resolve, reject) => {
      if (!child) return reject(new Error('Die Spracherkennung läuft nicht (mehr). Bitte noch einmal versuchen.'));
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Die Spracherkennung hat zu lange gebraucht.'));
      }, jobMs);
      pending.set(id, { resolve: (t) => (clearTimeout(timer), resolve(t)), reject: (e) => (clearTimeout(timer), reject(e)) });
      child.stdin.write(`${JSON.stringify({ id, file, prompt: PROMPT })}\n`);
    });
  }

  /** Erkennt eine Aufnahme (Bytes aus dem Browser) und liefert den Text ('' bei Stille). */
  function transcribe(audio, mime = 'audio/webm') {
    const st = status();
    if (!st.available) return Promise.reject(new Error(st.reason === 'abgeschaltet' ? 'Die Spracherkennung ist abgeschaltet (speech.enabled in config.json).' : 'Die lokale Spracherkennung ist noch nicht eingerichtet: im App-Ordner ./install-speech.sh ausführen.'));
    if (!audio?.length) return Promise.reject(new Error('Die Aufnahme ist leer.'));
    if (audio.length > MAX_AUDIO_BYTES) return Promise.reject(new Error('Die Aufnahme ist zu groß.'));
    const job = chain.then(async () => {
      clearTimeout(idleTimer);
      fs.mkdirSync(tmpDir, { recursive: true });
      const file = path.join(tmpDir, `stt-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${EXT[String(mime).split(';')[0].trim().toLowerCase()] || 'webm'}`);
      fs.writeFileSync(file, audio);
      try {
        await start();
        return cleanTranscript(await run(file));
      } finally {
        fs.rmSync(file, { force: true });
        idleTimer = setTimeout(() => {
          log('[speech] Leerlauf, Arbeitsprozess beendet');
          stop();
        }, idleMs);
        idleTimer.unref?.();
      }
    });
    chain = job.catch(() => {});
    return job;
  }

  return { status, transcribe, close: stop };
}
