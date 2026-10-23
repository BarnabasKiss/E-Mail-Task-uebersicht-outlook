import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSpeech, cleanTranscript, defaultPython } from '../lib/speech.js';

// Ein Ersatz für tools/stt-worker.py: gleiches Zeilenprotokoll, der "Text" ist der Dateiinhalt
const WORKER = `
const readline = require('node:readline');
const fs = require('node:fs');
if (process.env.FATAL) { console.log(JSON.stringify({ fatal: 'kein Modell' })); process.exit(1); }
console.log(JSON.stringify({ ready: true }));
readline.createInterface({ input: process.stdin }).on('line', (l) => {
  const req = JSON.parse(l);
  const text = fs.readFileSync(req.file, 'utf8');
  if (text === 'FEHLER') return console.log(JSON.stringify({ id: req.id, error: 'kaputte Aufnahme' }));
  setTimeout(() => console.log(JSON.stringify({ id: req.id, text })), text.startsWith('langsam') ? 80 : 5);
});
`;
function setup(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-'));
  const script = path.join(dir, 'worker.cjs');
  fs.writeFileSync(script, WORKER);
  const speech = createSpeech({ python: process.execPath, args: [script], tmpDir: dir, idleMs: 60_000, startMs: 5000, log: () => {}, ...extra });
  return { speech, dir };
}
const audio = (t) => Buffer.from(t, 'utf8');

test('Erkennung: Aufnahme geht an den Arbeitsprozess, Text kommt zurück, die Temp-Datei ist danach weg', async () => {
  const { speech, dir } = setup();
  assert.equal(speech.status().available, true);
  assert.equal(await speech.transcribe(audio('Hallo Anna, ich melde mich.'), 'audio/webm;codecs=opus'), 'Hallo Anna, ich melde mich.');
  assert.equal(speech.status().running, true);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith('stt-')), []);
  speech.close();
});

test('Aufträge laufen nacheinander in der Reihenfolge, ein Fehler im Auftrag stoppt die anderen nicht', async () => {
  const { speech } = setup();
  const results = await Promise.allSettled([speech.transcribe(audio('langsam eins')), speech.transcribe(audio('FEHLER')), speech.transcribe(audio('drei'))]);
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.equal(results[0].value, 'langsam eins');
  assert.match(results[1].reason.message, /kaputte Aufnahme/);
  assert.equal(results[2].value, 'drei');
  speech.close();
});

test('Erfundene Sätze bei Stille (Untertitel …) werden verworfen, echter Text bleibt', async () => {
  assert.equal(cleanTranscript('Untertitel der Amara.org-Community'), '');
  assert.equal(cleanTranscript('Vielen Dank fürs Zuschauen!'), '');
  assert.equal(cleanTranscript('  Hallo   Anna  '), 'Hallo Anna');
  assert.equal(cleanTranscript('Die Untertitel der Präsentation schicke ich dir morgen zusammen mit dem Angebot und den Unterlagen.'), 'Die Untertitel der Präsentation schicke ich dir morgen zusammen mit dem Angebot und den Unterlagen.');
  const { speech } = setup();
  assert.equal(await speech.transcribe(audio('Untertitel im Auftrag des ZDF')), '');
  speech.close();
});

test('Nicht eingerichtet, abgeschaltet, leere oder zu große Aufnahme: verständliche Fehler', async () => {
  const none = createSpeech({ python: '/gibt/es/nicht/python', script: '/x.py', log: () => {} });
  assert.equal(none.status().available, false);
  assert.match(none.status().hint, /install-speech\.sh/);
  await assert.rejects(none.transcribe(audio('x')), /install-speech\.sh/);
  const off = createSpeech({ enabled: false, python: process.execPath, log: () => {} });
  await assert.rejects(off.transcribe(audio('x')), /abgeschaltet/);
  const { speech } = setup();
  await assert.rejects(speech.transcribe(Buffer.alloc(0)), /leer/);
  await assert.rejects(speech.transcribe(Buffer.alloc(26 * 1024 * 1024)), /zu groß/);
  speech.close();
});

test('Startfehler des Arbeitsprozesses wird gemeldet, ein späterer Versuch startet neu', async () => {
  const { speech, dir } = setup();
  process.env.FATAL = '1';
  await assert.rejects(speech.transcribe(audio('x')), /kein Modell|beendet/);
  delete process.env.FATAL;
  assert.equal(await speech.transcribe(audio('geht wieder')), 'geht wieder');
  speech.close();
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith('stt-')), []);
});

test('Leerlauf: der Arbeitsprozess beendet sich von selbst und startet beim nächsten Diktat neu', async () => {
  const { speech } = setup({ idleMs: 60 });
  await speech.transcribe(audio('eins'));
  assert.equal(speech.status().running, true);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(speech.status().running, false);
  assert.equal(await speech.transcribe(audio('zwei')), 'zwei');
  speech.close();
});

test('Standard-Pfad der Python-Umgebung im Datenordner', () => {
  assert.match(defaultPython('/daten'), /speech-venv[\\/](bin[\\/]python|Scripts[\\/]python\.exe)$/);
});

test('Anfangstext des Modells (Prompt) und Trainingsfloskeln werden nicht als Diktat übernommen', () => {
  assert.equal(cleanTranscript('Hallo Anna, vielen Dank für deine Nachricht.'), '');
  assert.equal(cleanTranscript('Ich melde mich morgen wegen der Rechnung'), '');
  assert.equal(cleanTranscript('Ich melde mich morgen wegen der Rechnung und dem Termin am Freitag.'), 'Ich melde mich morgen wegen der Rechnung und dem Termin am Freitag.');
  assert.equal(cleanTranscript('Ja.'), 'Ja.', 'kurze echte Sätze bleiben');
});
