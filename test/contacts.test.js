import test from 'node:test';
import assert from 'node:assert/strict';
import { createContacts, domainKey } from '../lib/contacts.js';

const memoryStore = () => {
  const data = {};
  return { get: (s, k) => data[s]?.[k], set: (s, k, v) => ((data[s] ??= {})[k] = JSON.parse(JSON.stringify(v))), all: () => data };
};
const make = () => createContacts({ store: memoryStore(), now: () => '2026-10-23T08:00:00.000Z' });

test('Firmenadresse ergibt eine Domain, private Anbieter nicht', () => {
  assert.equal(domainKey('Anna@Firma.at'), '@firma.at');
  assert.equal(domainKey('anna@gmail.com'), null);
  assert.equal(domainKey('kaputt'), null);
});

test('Gelerntes wird gezählt: Person zuerst, sonst die Firma; die Anrede gilt nur für die Person', () => {
  const c = make();
  c.learnStyle('anna@firma.at', { form: 'sie', anrede: 'Sehr geehrte Frau {Nachname},', gruss: 'Mit freundlichen Grüßen', sprache: 'de' }, 'Anna Berger');
  c.learnStyle('max@firma.at', { form: 'sie', anrede: null, gruss: 'Mit freundlichen Grüßen', sprache: 'de' }, 'Max Huber');
  const anna = c.effective('anna@firma.at');
  assert.equal(anna.form.value, 'sie');
  assert.equal(anna.form.scope, 'person');
  assert.equal(anna.anrede.value, 'Sehr geehrte Frau {Nachname},');
  const neu = c.effective('neu@firma.at'); // unbekannte Person derselben Firma
  assert.equal(neu.form.value, 'sie');
  assert.equal(neu.form.scope, 'domain');
  assert.equal(neu.anrede, null);
  assert.equal(c.effective('fremd@andere.at').form, null);
});

test('Mehrheit gewinnt, bei Gleichstand der Letzte; Festgelegtes schlägt alles', () => {
  const c = make();
  c.learnStyle('a@x.at', { form: 'sie' });
  c.learnStyle('a@x.at', { form: 'du' });
  assert.equal(c.effective('a@x.at').form.value, 'du');
  c.learnStyle('a@x.at', { form: 'sie' });
  c.learnStyle('a@x.at', { form: 'sie' });
  assert.equal(c.effective('a@x.at').form.value, 'sie');
  c.setField('a@x.at', 'form', 'du');
  assert.deepEqual([c.effective('a@x.at').form.value, c.effective('a@x.at').form.source], ['du', 'manuell']);
  c.setField('a@x.at', 'form', '');
  assert.equal(c.effective('a@x.at').form.value, 'sie');
  assert.throws(() => c.setField('a@x.at', 'form', 'duzen'), /Erlaubt/);
  assert.throws(() => c.setField('@x.at', 'anrede', 'Hallo'), /nur für eine Person/);
});

test('Notizen: ohne Doppelte, gelernte sind ungeprüft, bearbeiten bestätigt, löschen geht', () => {
  const c = make();
  assert.equal(c.addNotes('a@firma.at', 'person', ['Antwortet knapp.', 'antwortet  knapp.']), 1);
  assert.equal(c.addNotes('a@firma.at', 'domain', ['Immer die Schadennummer nennen.']), 1);
  const notes = c.effective('a@firma.at').notes;
  assert.deepEqual(notes.map((n) => [n.scope, n.reviewed]), [['person', false], ['domain', false]]);
  c.editNote('a@firma.at', notes[0].id, { text: 'Antworte knapp, ohne Floskeln.' });
  assert.equal(c.effective('a@firma.at').notes[0].reviewed, true);
  c.confirmAll('@firma.at');
  assert.equal(c.effective('a@firma.at').notes[1].reviewed, true);
  c.deleteNote('a@firma.at', notes[0].id);
  assert.equal(c.effective('a@firma.at').notes.length, 1);
  assert.equal(c.addManualNote('a@firma.at', 'Mag keine Anhänge.'), 1);
  assert.equal(c.effective('a@firma.at').notes.at(-1).reviewed, true);
});

test('private Adresse: Firmen-Notiz landet bei der Person', () => {
  const c = make();
  c.addNotes('a@gmail.com', 'domain', ['Duzt gern.']);
  assert.equal(c.effective('a@gmail.com').notes[0].scope, 'person');
});

test('Prompt-Block nennt Ansprache, Sprache und Notizen; applyToDraft setzt Anrede und Gruß ein', () => {
  const c = make();
  assert.equal(c.promptBlock('a@x.at'), '');
  c.learnStyle('a@x.at', { form: 'du', anrede: 'Hallo {Vorname},', gruss: 'LG', sprache: 'de' }, 'Max Huber');
  c.addNotes('a@x.at', 'person', ['Kurz halten.']);
  assert.equal(c.promptBlock('a@x.at'), '- Ansprache: Du (duzen)\n- Sprache: Deutsch\n- Kurz halten.');
  assert.equal(c.applyToDraft('a@x.at', 'Max Huber', 'Guten Tag Max Huber,\n\nja.\n\nBeste Grüße'), 'Hallo Max,\n\nja.\n\nLG');
});

test('Profil liefert Person und Firma getrennt', () => {
  const c = make();
  c.learnStyle('a@firma.at', { form: 'sie' }, 'Anna Berger');
  const p = c.profile('a@firma.at');
  assert.equal(p.person.name, 'Anna Berger');
  assert.equal(p.person.fields.form.value, 'sie');
  assert.equal(p.domain.key, '@firma.at');
  assert.equal(c.profile('a@gmail.com').domain, null);
});
