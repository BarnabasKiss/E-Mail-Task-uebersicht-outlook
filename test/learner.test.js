import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearner, sortNotes } from '../lib/learner.js';
import { createContacts } from '../lib/contacts.js';

const memoryStore = () => {
  const data = {};
  return { get: (s, k) => data[s]?.[k], set: (s, k, v) => ((data[s] ??= {})[k] = JSON.parse(JSON.stringify(v))) };
};

function setup(claudeAnswer) {
  const store = memoryStore();
  const contacts = createContacts({ store });
  const appended = [];
  const prompts = [];
  const rules = { read: () => '# Regeln', appendLearned: (n) => (appended.push(...n), n.length) };
  const claude = { runJson: async (p) => (prompts.push(p), claudeAnswer) };
  const learner = createLearner({ claude, rules, store, ownNames: ['Barni'], contacts });
  const meta = { from: { name: 'Anna Berger', address: 'anna@firma.at' }, to: [{ name: 'Barni Kiss', address: 'barni@x.at' }], cc: [] };
  store.set('replies', 'M1', { meta, reply: { body: '<p>Sehr geehrte Frau Berger,</p><p>danke, ich melde mich bei Ihnen morgen.</p><p>Mit freundlichen Grüßen</p>' } });
  store.set('drafts', 'M1', { text: 'Guten Tag Frau Berger,\n\nich melde mich morgen.\n\nBeste Grüße' });
  return { learner, contacts, store, appended, prompts };
}

test('sortNotes ordnet nach Bereich, Texte ohne Bereich gelten als global, Unbekanntes als Person', () => {
  assert.deepEqual(sortNotes([{ bereich: 'firma', text: 'A' }, { bereich: 'Global', text: 'B' }, { bereich: '?', text: 'C' }, 'D'], 4), { global: ['B', 'D'], person: ['C'], firma: ['A'] });
  assert.deepEqual(sortNotes(undefined), { global: [], person: [], firma: [] });
});

test('Lernen: Stil kommt lokal ins Gedächtnis, Notizen je nach Bereich an die richtige Stelle', async () => {
  const s = setup({ notes: [{ bereich: 'global', text: 'Keine Floskeln am Anfang.' }, { bereich: 'person', text: 'Mag es kurz.' }] });
  await s.learner.learnFor('M1');
  const e = s.contacts.effective('anna@firma.at');
  assert.equal(e.form.value, 'sie');
  assert.equal(e.anrede.value, 'Sehr geehrte Frau {Nachname},');
  assert.equal(e.gruss.value, 'Mit freundlichen Grüßen');
  assert.deepEqual(s.appended, ['Keine Floskeln am Anfang.']);
  assert.deepEqual(e.notes.map((n) => [n.text, n.scope, n.reviewed]), [['Mag es kurz.', 'person', false]]);
  assert.ok(!s.prompts[0].includes('Anna Berger') && !s.prompts[0].includes('Berger,'), 'Name im Prompt maskiert');
  assert.equal(s.store.get('learned', 'M1').added, 2);
});

test('Lernen: unverändert übernommen lernt den Stil, fragt aber die KI nicht', async () => {
  const s = setup({ notes: [] });
  s.store.set('replies', 'M1', { meta: { from: { name: 'Anna Berger', address: 'anna@firma.at' } }, reply: { body: 'Guten Tag Frau Berger,\n\nich melde mich morgen.\n\nBeste Grüße' } });
  await s.learner.learnFor('M1');
  assert.equal(s.prompts.length, 0);
  assert.equal(s.contacts.effective('anna@firma.at').gruss.value, 'Beste Grüße');
  assert.match(s.store.get('learned', 'M1').skipped, /unverändert/);
});
