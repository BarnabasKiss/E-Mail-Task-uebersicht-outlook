// Mikrofon-Aufnahme im Browser in Abschnitten: schneidet bei Sprechpausen, liefert jeden Abschnitt mit Sprache als Audio-Datei (webm/opus) an onSegment.
// Läuft in Chrome, Edge und Brave (auch unter Linux/Wayland über PipeWire); das Erkennen übernimmt der lokale Arbeitsprozess der App.
import { rmsOf, nextAction, updateNoiseFloor, speechThreshold } from './recorder-logic.js';

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const TICK_MS = 100;

export const recorderSupported = (win = globalThis.window) => !!(win?.navigator?.mediaDevices?.getUserMedia && win.MediaRecorder);

/** @returns {Promise<{ stop(): Promise<void> }>} wirft bei fehlender Berechtigung oder ohne Mikrofon (name: NotAllowedError, NotFoundError) */
export async function startSegmentRecorder({ onSegment, win = globalThis.window, options = {} }) {
  const Recorder = win.MediaRecorder;
  const mime = MIMES.find((m) => Recorder.isTypeSupported?.(m)) || '';
  const stream = await win.navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const Ctx = win.AudioContext || win.webkitAudioContext;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
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
      rec.onstop = async () => {
        if (s.keep && chunks.length) await onSegment(new win.Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
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

  seg = begin();
  timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const level = rmsOf(samples);
    const speaking = level > speechThreshold(floor);
    floor = updateNoiseFloor(floor, level);
    if (speaking) {
      seg.speechMs += TICK_MS;
      seg.silentMs = 0;
    } else seg.silentMs += TICK_MS;
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
      stream.getTracks().forEach((t) => t.stop());
      ctx.close?.();
    },
  };
}
