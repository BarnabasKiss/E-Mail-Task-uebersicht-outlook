import test from 'node:test';
import assert from 'node:assert/strict';
import { splitName, greetingPattern, fillGreeting, extractStyle, applyStyle } from '../lib/style-extract.js';

test('Namen werden in Vor- und Nachname zerlegt', () => {
  assert.deepEqual(splitName('Anna Berger'), { first: 'Anna', last: 'Berger' });
  assert.deepEqual(splitName('Berger, Anna'), { first: 'Anna', last: 'Berger' });
  assert.deepEqual(splitName('Dr. Anna Maria Berger'), { first: 'Anna', last: 'Berger' });
  assert.deepEqual(splitName('Helga'), { first: 'Helga', last: '' });
  assert.deepEqual(splitName('anna@x.at'), { first: '', last: '' });
});

test('Anrede wird zum Muster ohne Klarnamen', () => {
  assert.equal(greetingPattern('Hallo Anna,', 'Anna Berger'), 'Hallo {Vorname},');
  assert.equal(greetingPattern('Sehr geehrte Frau Berger,', 'Anna Berger'), 'Sehr geehrte Frau {Nachname},');
  assert.equal(greetingPattern('Guten Tag Frau Berger,', 'Anna Berger'), 'Guten Tag Frau {Nachname},');
  assert.equal(greetingPattern('Hallo zusammen,', 'Anna Berger'), 'Hallo zusammen,');
  assert.equal(greetingPattern('Hallo Herr Müller,', 'Anna Berger'), null, 'unbekannter Name bleibt nicht im Muster');
  assert.equal(greetingPattern('Danke für die Info', 'Anna Berger'), null);
});

test('Muster füllen: fehlt ein Name, gibt es nichts', () => {
  assert.equal(fillGreeting('Hallo {Vorname},', 'Max Huber'), 'Hallo Max,');
  assert.equal(fillGreeting('Sehr geehrte Frau {Nachname},', 'Helga'), null);
});

test('extractStyle erkennt Sie, Anrede, Gruß und Sprache', () => {
  const s = extractStyle('Sehr geehrte Frau Berger,\n\nvielen Dank für Ihre Nachricht. Ich melde mich bei Ihnen, sobald die Unterlagen für den Fall da sind und wir die Sache prüfen konnten.\n\nMit freundlichen Grüßen\nBarni', 'Anna Berger');
  assert.deepEqual(s, { form: 'sie', anrede: 'Sehr geehrte Frau {Nachname},', gruss: 'Mit freundlichen Grüßen', sprache: 'de' });
});

test('extractStyle: Du, Englisch und gemischte Anrede', () => {
  assert.equal(extractStyle('Hallo Max,\nich schicke dir die Datei, ruf mich an wenn du Fragen hast.\nLG', 'Max Huber').form, 'du');
  assert.equal(extractStyle('Hallo Max,\nich schicke dir die Datei, bitte melden Sie sich', 'Max Huber').form, null);
  assert.equal(extractStyle('Hi Tom,\nthank you for the update, we are happy with the plan and the schedule.\nBest regards', 'Tom Hill').sprache, 'en');
});

test('"Sie" am Satzanfang (= sie, they) zählt nicht als Anrede', () => {
  assert.equal(extractStyle('Hallo Max,\nSie haben das Auto abgeholt und ich habe dir das geschickt.', 'Max Huber').form, 'du');
});

test('applyStyle ersetzt Anrede und Gruß im Entwurf, der Rest bleibt', () => {
  const draft = 'Guten Tag Max Huber,\n\nich schaue es mir an.\n\nBeste Grüße';
  assert.equal(applyStyle(draft, { anrede: 'Hallo {Vorname},', gruss: 'LG' }, 'Max Huber'), 'Hallo Max,\n\nich schaue es mir an.\n\nLG');
  assert.equal(applyStyle(draft, { anrede: null, gruss: null }, 'Max Huber'), draft);
  assert.equal(applyStyle('Kein Gruß hier', { anrede: 'Hallo {Vorname},', gruss: 'LG' }, 'Max Huber'), 'Kein Gruß hier');
});
