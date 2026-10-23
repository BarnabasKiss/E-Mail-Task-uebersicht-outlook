// Mikrofon-Aufnahme im Browser in Abschnitten: schneidet bei Sprechpausen, liefert jeden Abschnitt mit Sprache als Audio-Datei (webm/opus) an onSegment.
// Läuft in Chrome, Edge und Brave (auch unter Linux/Wayland über PipeWire); das Erkennen übernimmt der lokale Arbeitsprozess der App.
import { rmsOf, nextAction, updateNoiseFloor, speechThreshold } from './recorder-logic.js';

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const TICK_MS = 100;

export const recorderSupported = (win = globalThis.window) => !!(win?.navigator?.mediaDevices?.getUserMedia && win.MediaRecorder);

/**
 * onSegment(blob): bekommt jeden Abschnitt mit Sprache (die Aufnahme wartet nicht auf das Ergebnis). alive(): false = die Oberfläche ist verschwunden, die Aufnahme beendet sich dann selbst.
 * @returns {Promise<{ stop(): Promise<void> }>} wirft bei fehlender Berechtigung oder ohne Mikrofon (name: NotAllowedError, NotFoundError)
 */
export async function startSegmentRecorder({ onSegment, alive = () => true, win = globalThis.window, options = {} }) {
  const Recorder = win.MediaRecorder;
  const mime = MIMES.find((m) => Recorder.isTypeSupported?.(m)) || '';
  const stream = await win.navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const release = () => stream.getTracks().forEach((t) => t.stop());
  let ctx;
  let analyser;
  try {
    const Ctx = win.AudioContext || win.webkitAudioContext;
    ctx = new Ctx();
    await ctx.resume?.(); // ein angehaltener AudioContext liefert nur Stille
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
  } catch (e) {
    release(); // das Mikrofon darf nicht offen bleiben, wenn die Aufnahme nicht startet
    ctx?.close?.();
    throw e;
  }
  const samples = new Float32Array(analyser.fftSize);

  let floor = 0.005;
  let seg = null;
  let timer = null;
  let stopped = false;

  function begin() {
    const chunks = [];
    const rec = new Recorder(stream, mime ? { mimeType: mime } : undefined);
    const s = { rec, chunks, startedAt: Date.now(), speechMs: 0, silentMs: 0, keep: false };
    rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
    s.done = new Promise((resolve) => {
      rec.onstop = () => {
        // das Erkennen läuft weiter, ohne die Aufnahme (und die Mikrofon-Anzeige) aufzuhalten
        if (s.keep && chunks.length) Promise.resolve(onSegment(new win.Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }))).catch(() => {});
        resolve();
      };
    });
    rec.start();
    return s;
  }

  function finish(s, keep) {
    s.keep = keep;
    try {
      s.rec.stop();
    } catch {
      // schon beendet
    }
    return s.done;
  }

  function shutdown() {
    clearInterval(timer);
    release();
    ctx.close?.();
  }

  let last = Date.now();
  seg = begin();
  timer = setInterval(() => {
    if (!alive()) {
      stopped = true;
      finish(seg, false);
      return shutdown();
    }
    const now = Date.now();
    const dt = now - last; // echte Zeit: ein gedrosselter Timer (Hintergrund-Tab) verfälscht die Pausen nicht
    last = now;
    analyser.getFloatTimeDomainData(samples);
    const level = rmsOf(samples);
    const speaking = level > speechThreshold(floor);
    floor = updateNoiseFloor(floor, level);
    if (speaking) {
      seg.speechMs += dt;
      seg.silentMs = 0;
    } else seg.silentMs += dt;
    const action = nextAction({ elapsedMs: Date.now() - seg.startedAt, speechMs: seg.speechMs, silentMs: seg.silentMs }, options);
    if (!action) return;
    const old = seg;
    seg = begin(); // der nächste Abschnitt läuft schon, während der alte abgeschlossen wird: keine Lücke
    finish(old, action === 'cut');
  }, TICK_MS);

  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await finish(seg, seg.speechMs >= (options.minSpeechMs ?? 500));
      shutdown();
    },
  };
}
