import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../lib/store.js';
import { createScheduler } from '../lib/scheduler.js';
import { createAttachmentReview } from '../lib/attachment-review.js';
import { AnonymizationError } from '../lib/mask-strict.js';
import actions from '../actions/review-revert.js';

const mail = {
  subject: 'Gutachten Zl. 77123/26',
  from: { emailAddress: { name: 'Harald Gölles', address: 'h.goelles@firma.at' } },
  toRecipients: [], ccRecipients: [],
  body: { content: '<p>Hallo Barni,</p><p>anbei das Gutachten.</p><p>Mit freundlichen Grüßen<br>Harald Gölles</p>' },
};

function setup({ mask, attText = 'Gutachter: Marcus Ritter, Tel +43 664 1234567. Frist 2026-10-30. Dringend.', answer, rows } = {}) {
  const store = createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'review-')), 'state.json'));
  const prompts = [];
  const claude = { run: async (p) => (prompts.push(p), answer ?? '{"dringlichkeit":"jetzt","kategorie":"Schadenfall","zusammenfassung":"[PERSON_1] liefert Gutachten, Frist 30.10.","antwort_noetig":true,"aufgabe_text":"Gutachten von [PERSON_1] prüfen","aufgabe_thema":"Gutachten","frist":"2026-10-30","begruendung":"Frist"}') };
  const attachments = { readAll: async () => (attText === null ? [] : [{ name: 'Gutachten Ritter.pdf', text: attText }]) };
  const drafts = { getMail: async () => mail };
  const items = rows || [{ id: 1, mail_id: 'M1', betreff: 'Gutachten', dringlichkeit: 'woche', kategorie: 'Kunde', zusammenfassung: 'alt', received_at: '2026-10-22T10:00:00Z' }];
  const n8n = { listProposals: async (s) => (s === 'neu' ? items.map((r) => ({ ...r })) : []) };
  let scheduler;
  const review = createAttachmentReview({ attachments, drafts, claude, store, ownNames: ['barni'], getScheduler: () => scheduler, review: { logPrompts: false }, mask, log: () => {} });
  scheduler = createScheduler({ n8n, drafts: {}, learner: {}, store, poll: {}, log: () => {}, decorate: review.decorate });
  return { review, scheduler, store, prompts };
}

test('Prompt enthält Anhangtext, aber keine Namen, Telefonnummern oder Kennungen im Klartext', async () => {
  const s = setup();
  await s.scheduler.refresh();
  await s.review.run();
  const p = s.prompts[0];
  assert.match(p, /ANHÄNGE/);
  assert.match(p, /Frist 2026-10-30/);
  for (const secret of ['Ritter', 'Gölles', 'goelles', '664', '77123']) assert.ok(!p.includes(secret), `"${secret}" im Prompt`);
  assert.ok(p.includes('Barni'), 'eigener Name bleibt');
});

test('Ergebnis überlagert die n8n-Bewertung, Platzhalter werden zurückübersetzt, Original bleibt in der Info', async () => {
  const s = setup();
  await s.scheduler.refresh();
  await s.review.run();
  const [p] = s.scheduler.state.items;
  assert.equal(p.dringlichkeit, 'jetzt');
  assert.equal(p.zusammenfassung, 'Harald Gölles liefert Gutachten, Frist 30.10.'); // [PERSON_1] ist der Absender
  assert.equal(p.antwort_noetig, true);
  assert.deepEqual(p.anhang_bewertung, { vorher: 'woche', anhaenge: ['Gutachten Ritter.pdf'] });
});

test('Wird nur einmal pro Mail bewertet, auch nach einem neuen Abruf aus n8n (Überlagerung bleibt)', async () => {
  const s = setup();
  await s.scheduler.refresh();
  await s.review.run();
  await s.review.run();
  await s.scheduler.refresh();
  assert.equal(s.prompts.length, 1);
  assert.equal(s.scheduler.state.items[0].dringlichkeit, 'jetzt');
});

test('Ohne lesbare Anhänge: kein Aufruf an Claude, Mail bleibt unverändert', async () => {
  const s = setup({ attText: null });
  await s.scheduler.refresh();
  await s.review.run();
  assert.equal(s.prompts.length, 0);
  assert.equal(s.scheduler.state.items[0].dringlichkeit, 'woche');
  assert.equal(s.store.get('attReviews', 'M1').skipped, 'keine lesbaren Anhänge');
});

test('Unsichere Anonymisierung: nichts wird gesendet, Grund steht im Store, Mail bleibt unverändert', async () => {
  const s = setup({
    mask: () => {
      throw new AnonymizationError('Anonymisierung unsicher: [PERSON_1]: Name noch im Text');
    },
  });
  await s.scheduler.refresh();
  await s.review.run();
  assert.equal(s.prompts.length, 0);
  assert.match(s.store.get('attReviews', 'M1').error, /Anonymisierung unsicher/);
  assert.equal(s.scheduler.state.items[0].dringlichkeit, 'woche');
});

test('Ungültige Antwort von Claude: Fehler wird vermerkt, Mail bleibt unverändert', async () => {
  const s = setup({ answer: 'keine ahnung' });
  await s.scheduler.refresh();
  await s.review.run();
  assert.ok(s.store.get('attReviews', 'M1').error);
  assert.equal(s.scheduler.state.items[0].dringlichkeit, 'woche');
});

test('Zurücksetzen stellt die n8n-Bewertung wieder her und bewertet nicht neu', async () => {
  const s = setup();
  await s.scheduler.refresh();
  await s.review.run();
  await actions.run({ review: s.review, scheduler: s.scheduler }, { id: 1 });
  assert.equal(s.scheduler.state.items[0].dringlichkeit, 'woche');
  assert.equal(s.scheduler.state.items[0].anhang_bewertung, undefined);
  await s.review.run();
  assert.equal(s.prompts.length, 1);
});

test('Ohne Modul (kein review) bricht die Aktion verständlich ab', async () => {
  await assert.rejects(actions.run({ review: null, scheduler: {} }, { id: 1 }), /nicht aktiv/);
});
