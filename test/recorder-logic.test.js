import test from 'node:test';
import assert from 'node:assert/strict';
import { rmsOf, nextAction, updateNoiseFloor, speechThreshold } from '../public/js/recorder-logic.js';

test('Lautstärke: Stille ist 0, ein Dauerton hat seinen Effektivwert', () => {
  assert.equal(rmsOf([]), 0);
  assert.equal(rmsOf([0, 0, 0]), 0);
  assert.ok(Math.abs(rmsOf([0.5, -0.5, 0.5, -0.5]) - 0.5) < 1e-9);
});

test('Schneiden: nach genug Sprache und einer Pause; zu kurze Sprache zählt nicht; zu lange Abschnitte werden geschnitten; leere verworfen', () => {
  const a = (o) => nextAction({ elapsedMs: 0, speechMs: 0, silentMs: 0, ...o });
  assert.equal(a({ elapsedMs: 3000, speechMs: 2000, silentMs: 900 }), 'cut');
  assert.equal(a({ elapsedMs: 3000, speechMs: 2000, silentMs: 500 }), null, 'Pause noch zu kurz');
  assert.equal(a({ elapsedMs: 3000, speechMs: 200, silentMs: 1500 }), null, 'zu wenig Sprache: weiter warten');
  assert.equal(a({ elapsedMs: 28000, speechMs: 9000, silentMs: 0 }), 'cut', 'zu lang: mitten im Satz schneiden');
  assert.equal(a({ elapsedMs: 5000, speechMs: 0, silentMs: 5000 }), 'drop', 'nur Stille: verwerfen');
  assert.equal(a({ elapsedMs: 28000, speechMs: 100, silentMs: 100 }), 'drop');
  assert.equal(a({ elapsedMs: 1000, speechMs: 0, silentMs: 1000 }), null);
});

test('Grundrauschen: sinkt schnell, steigt langsam; Schwelle nie unter dem Mindestwert', () => {
  let floor = 0.05;
  for (let i = 0; i < 20; i += 1) floor = updateNoiseFloor(floor, 0.004);
  assert.ok(floor < 0.01, 'passt sich einem leisen Raum an');
  const loud = updateNoiseFloor(0.005, 0.2);
  assert.ok(loud < 0.0065, 'laute Sprache hebt das Grundrauschen kaum an');
  assert.equal(speechThreshold(0.001), 0.015);
  assert.ok(speechThreshold(0.02) > 0.05);
});
