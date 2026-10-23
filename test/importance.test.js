import test from 'node:test';
import assert from 'node:assert/strict';
import { importanceReasons } from '../lib/importance.js';

const now = new Date(2026, 9, 23, 10, 0);
const mail = (o) => ({ dringlichkeit: 'heute', kategorie: 'Kunde', betreff: '', vorschau: '', zusammenfassung: '', begruendung: '', frist: '', archiviert: false, ...o });

test('Stichwörter im Inhalt machen eine Mail wichtig, der Grund nennt das Wort', () => {
  const r = importanceReasons(mail({ betreff: 'Eskalation: Störung im Portal', vorschau: 'Bitte umgehend melden.' }), now);
  assert.equal(r.length, 3);
  assert.ok(r.some((x) => x.includes('Eskalation')) && r.some((x) => x.includes('Störung')) && r.some((x) => x.includes('umgehend')));
});

test('Frist heute, morgen und überschritten; spätere Fristen nicht', () => {
  assert.deepEqual(importanceReasons(mail({ frist: '2026-10-23' }), now), ['Frist heute']);
  assert.deepEqual(importanceReasons(mail({ frist: '2026-10-24' }), now), ['Frist morgen']);
  assert.deepEqual(importanceReasons(mail({ frist: '2026-10-22' }), now), ['Frist überschritten']);
  assert.deepEqual(importanceReasons(mail({ frist: '2026-10-30' }), now), []);
});

test('Verneinung, Teilwörter, Newsletter, Egal und Done zählen nicht', () => {
  assert.deepEqual(importanceReasons(mail({ begruendung: 'Nicht dringend, keine Eskalation, ohne Frist.' }), now), []);
  assert.deepEqual(importanceReasons(mail({ vorschau: 'Wir freuen uns auf das Klagenfurter Treffen' }), now), []);
  assert.deepEqual(importanceReasons(mail({ betreff: 'Dringend: Angebot!', kategorie: 'Newsletter/Werbung' }), now), []);
  assert.deepEqual(importanceReasons(mail({ betreff: 'Dringend', dringlichkeit: 'egal' }), now), []);
  assert.deepEqual(importanceReasons(mail({ betreff: 'Dringend', archiviert: true }), now), []);
  assert.deepEqual(importanceReasons(mail({ betreff: 'Ticket 4412' }), now), []);
});
