import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHistoryLearner } from '../lib/history-learner.js';
import { createContacts } from '../lib/contacts.js';
import { createRules } from '../lib/rules.js';

const memoryStore = () => {
  const data = {};
  return { get: (s, k) => data[s]?.[k], set: (s, k, v) => ((data[s] ??= {})[k] = JSON.parse(JSON.stringify(v))) };
};
const OWN = 'barni@firma.at';
const mail = (i, to, body, extra = {}) => ({
  id: `S${i}`, sentDateTime: `2026-04-${String(30 - i).padStart(2, '0')}T10:00:00Z`, subject: `Betreff ${i}`, to, cc: [], body: `<p>${body.replace(/\n/g, '</p><p>')}</p>`, ...extra,
});
const anna = [{ name: 'Anna Berger', address: 'anna@kunde.at' }];
const max = [{ name: 'Max Huber', address: 'max@kunde.at' }];
const GOOD_ANNA = 'Sehr geehrte Frau Berger,\n\nvielen Dank für Ihre Nachricht. Ich melde mich bei Ihnen, sobald die Unterlagen geprüft sind.\n\nMit freundlichen Grüßen';
const GOOD_MAX = 'Hallo Max,\n\nich schicke dir die Unterlagen heute noch, ruf mich an wenn du Fragen hast.\n\nLG';

function setup(mails, answers = {}) {
  const store = memoryStore();
  const contacts = createContacts({ store });
  const rules = createRules({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hist-')), 'Regeln.md') });
  const prompts = [];
  const pages = [];
  const n8n = {
    listSent: async ({ limit, before, scope }) => {
      pages.push(`${scope}:${before}`);
      return mails.filter((m) => (m.scope || 'sent') === scope && (!before || m.sentDateTime < before)).slice(0, limit);
    },
  };
  const claude = {
    runJson: async (p) => {
      prompts.push(p);
      return p.includes('dieselbe Person') ? answers.person || { notes: [] } : answers.global || { rules: [] };
    },
  };
  const h = createHistoryLearner({ n8n, claude, rules, contacts, store, ownNames: ['Barni'], ownAddress: OWN, log: () => {} });
  return { h, contacts, rules, store, prompts, pages };
}

test('Lernen aus Gesendetem: Stil lokal je Empfänger, Regeln und Notizen aus anonymisierten Auszügen', async () => {
  const mails = [mail(1, anna, GOOD_ANNA), mail(2, anna, GOOD_ANNA), mail(3, max, GOOD_MAX), mail(4, max, GOOD_MAX)];
  const s = setup(mails, {
    global: { rules: ['Antworten beginnen mit dem Ergebnis.'] },
    person: { notes: [{ bereich: 'person', text: 'Schreibt knapp.' }, { bereich: 'firma', text: 'Bevorzugt Telefonate.' }] },
  });
  const out = await s.h.run({ count: 10 });
  assert.equal(out.error, null);
  assert.equal(out.result.mails, 4);
  assert.equal(out.result.rulesAdded, 1);
  assert.equal(out.result.notesAdded, 3, 'zwei Personen-Notizen und eine Firmen-Notiz (beide Personen sind bei @kunde.at, die Notiz gibt es nur einmal)');
  assert.match(s.rules.read(), /## Aus gesendeten Mails abgeleitet \(bitte prüfen\)\n- \d{4}-\d{2}-\d{2}: Antworten beginnen mit dem Ergebnis\./);

  const a = s.contacts.effective('anna@kunde.at');
  assert.deepEqual([a.form.value, a.anrede.value, a.gruss.value], ['sie', 'Sehr geehrte Frau {Nachname},', 'Mit freundlichen Grüßen']);
  assert.equal(s.contacts.effective('max@kunde.at').anrede.value, 'Hallo {Vorname},');
  assert.ok(a.notes.every((n) => !n.reviewed), 'alles Neue ist ungeprüft');
  assert.ok(s.prompts.length >= 3);
  for (const p of s.prompts) assert.ok(!/Berger|Huber|anna@kunde/.test(p.split('MAILS:')[1]), 'nur anonymisierter Text geht an Claude');
});

test('Lernen: jede Mail zählt nur einmal, auch bei einem zweiten Lauf', async () => {
  const s = setup([mail(1, anna, GOOD_ANNA), mail(2, anna, GOOD_ANNA)]);
  await s.h.run();
  await s.h.run();
  assert.equal(s.contacts.read('anna@kunde.at').votes.form.sie, 2);
});

test('Lernen: Rundmails, kurze und eigene Mails zählen nicht; ohne genug Mails kein Claude-Aufruf', async () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ name: `P ${i}`, address: `p${i}@x.at` }));
  const s = setup([mail(1, many, GOOD_ANNA), mail(2, anna, 'Ok'), mail(3, [{ name: 'Ich', address: OWN }], GOOD_ANNA)]);
  const out = await s.h.run();
  assert.equal(out.result.usable, 0);
  assert.equal(s.prompts.length, 0);
});

test('Lernen: blättert durch alle Seiten bis zur gewünschten Anzahl', async () => {
  const mails = Array.from({ length: 60 }, (_, i) => mail(i % 28 + 1, anna, GOOD_ANNA, { id: `S${i}`, sentDateTime: `2026-03-${String(28 - Math.floor(i / 3)).padStart(2, '0')}T10:${String(59 - (i % 3)).padStart(2, '0')}:00Z` }));
  const s = setup(mails);
  const out = await s.h.run({ count: 50 });
  assert.equal(out.result.mails, 50);
  assert.ok(s.pages.filter((p) => p.startsWith('sent:')).length >= 2, 'mehrere Seiten');
});

test('Lernen: läuft nur einmal gleichzeitig, Fehler stehen im Status', async () => {
  const store = memoryStore();
  const h = createHistoryLearner({ n8n: { listSent: async () => { throw new Error('n8n weg'); } }, claude: {}, rules: {}, contacts: {}, store, ownNames: [], ownAddress: OWN, log: () => {} });
  const out = await h.run();
  assert.equal(out.error, 'n8n weg');
  assert.equal(out.running, false);
});

test('Lernen: liest auch eigene Mails aus Archiv und Unterordnern, Doppelte zählen einmal', async () => {
  const s = setup([mail(1, anna, GOOD_ANNA), mail(2, anna, GOOD_ANNA, { scope: 'all' }), mail(3, max, GOOD_MAX, { scope: 'all' }), mail(3, max, GOOD_MAX, { scope: 'sent' })]);
  const out = await s.h.run({ count: 10 });
  assert.equal(out.result.mails, 3);
  assert.ok(s.pages.some((p) => p.startsWith('all:')));
});
