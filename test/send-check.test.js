import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBeforeSend } from '../lib/send-check.js';

const ids = (o) => checkBeforeSend({ ownAddress: 'barni@firma.at', ...o }).map((w) => w.id);

test('Sende-Check: eine saubere Mail hat keine Warnungen', () => {
  assert.deepEqual(ids({ text: 'Hallo Anna,\n\npasst so.', to: ['anna@kunde.at'], cc: ['chef@firma.at'] }), []);
});

test('Sende-Check: BCC, der auch in An/CC steht', () => {
  assert.deepEqual(ids({ text: 'x', to: ['a@kunde.at'], bcc: ['A@kunde.at'] }), ['bcc-doppelt']);
  assert.deepEqual(ids({ text: 'x', to: ['a@kunde.at'], bcc: ['b@kunde.at'] }), []);
});

test('Sende-Check: verschiedene Firmen sichtbar in An/CC (eigene Firma und private Anbieter zählen nicht, BCC ist verdeckt)', () => {
  assert.deepEqual(ids({ text: 'x', to: ['a@kunde.at'], cc: ['b@partner.com'] }), ['firmen']);
  assert.deepEqual(ids({ text: 'x', to: ['a@kunde.at'], cc: ['b@gmail.com', 'c@firma.at'] }), []);
  assert.deepEqual(ids({ text: 'x', to: ['a@kunde.at'], bcc: ['b@partner.com'] }), []);
});

test('Sende-Check: Anhang im Text', () => {
  assert.deepEqual(ids({ text: 'Anbei die Unterlagen.', to: ['a@kunde.at'] }), ['anhang']);
  assert.deepEqual(ids({ text: 'Ich habe es angehängt.', to: ['a@kunde.at'] }), ['anhang']);
  assert.deepEqual(ids({ text: 'Bis morgen.', to: ['a@kunde.at'] }), []);
});

test('Sende-Check: Du/Sie gegen das Gedächtnis; "Sie" am Satzanfang ist mehrdeutig und zählt nicht', () => {
  const formOf = (a) => (a === 'anna@kunde.at' ? 'du' : a === 'hr@kunde.at' ? 'sie' : '');
  assert.deepEqual(ids({ text: 'Danke für Ihre Nachricht.', to: ['anna@kunde.at'], formOf }), ['form']);
  assert.deepEqual(ids({ text: 'Ich schicke Ihnen den Termin.', to: ['anna@kunde.at'], formOf }), ['form']);
  assert.deepEqual(ids({ text: 'Danke, ich melde mich bei dir.', to: ['hr@kunde.at'], formOf }), ['form']);
  assert.deepEqual(ids({ text: 'Sie hat gestern angerufen.', to: ['anna@kunde.at'], formOf }), []);
  assert.deepEqual(ids({ text: 'Danke für deine Nachricht.', to: ['anna@kunde.at'], formOf }), []);
  assert.deepEqual(ids({ text: 'Danke für deine und Ihre Nachricht.', to: ['anna@kunde.at'], formOf }), [], 'gemischt: unklar, keine Warnung');
  assert.deepEqual(ids({ text: 'Danke für Ihre Nachricht.', to: ['neu@x.at'], formOf }), [], 'unbekannte Person');
});
