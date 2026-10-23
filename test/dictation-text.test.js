import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVoiceCommands, joinDictation } from '../public/js/dictation-text.js';

test('Sprachbefehle: Satzzeichen, Absatz und Zeile, Leerzeichen davor verschwinden', () => {
  assert.equal(applyVoiceCommands('Hallo Anna komma neuer Absatz ich melde mich punkt'), 'Hallo Anna,\n\nich melde mich.');
  assert.equal(applyVoiceCommands('passt das fragezeichen'), 'passt das?');
  assert.equal(applyVoiceCommands('Klammer auf siehe Anhang Klammer zu'), '(siehe Anhang)');
  assert.equal(applyVoiceCommands('Bitte um Rückmeldung doppelpunkt Termin neue Zeile Ort'), 'Bitte um Rückmeldung: Termin\nOrt');
  assert.equal(applyVoiceCommands('  nichts zu ersetzen  '), 'nichts zu ersetzen');
});

test('Anfügen: Abstand, Großschreibung nach Satzende oder Zeilenanfang, keine doppelten Leerzeichen', () => {
  assert.equal(joinDictation('', 'hallo anna komma'), 'Hallo anna,');
  assert.equal(joinDictation('Hallo Anna,', 'ich melde mich'), ' ich melde mich');
  assert.equal(joinDictation('Ich melde mich.', 'danke dir'), ' Danke dir');
  assert.equal(joinDictation('Hallo Anna,\n\n', 'ich melde mich'), 'Ich melde mich');
  assert.equal(joinDictation('Ich melde mich', 'punkt'), '.');
  assert.equal(joinDictation('Zeile 1 ', 'weiter'), 'weiter');
  assert.equal(joinDictation('Text', 'neuer Absatz Danke'), '\n\nDanke');
  assert.equal(joinDictation('Text', '   '), '');
});
