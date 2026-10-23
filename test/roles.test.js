import test from 'node:test';
import assert from 'node:assert/strict';
import { roleOf, createRoles } from '../lib/roles.js';
import { mailFromPreview } from '../lib/test-mail.js';

const r = (a) => ({ emailAddress: { address: a } });
const ME = 'barni@faircheck.at';

test('roleOf: direkt, cc und shared (weder An noch Cc)', () => {
  assert.equal(roleOf({ toRecipients: [r('Barni@faircheck.at'), r('x@y.at')] }, ME), 'direkt');
  assert.equal(roleOf({ toRecipients: [r('x@y.at')], ccRecipients: [r(ME)] }, ME), 'cc');
  assert.equal(roleOf({ toRecipients: [r('support@faircheck.at')], ccRecipients: [] }, ME), 'shared');
  assert.equal(roleOf({ toRecipients: [r('b@alias.at')] }, ME, ['b@alias.at']), 'direkt');
  assert.equal(roleOf({ toRecipients: [r(ME)] }, ''), null);
});

test('Testmail: Rolle über erste Vorschauzeile', () => {
  const p = { betreff: 'x', vorschau: '[Rolle: cc]\nHallo' };
  const m = mailFromPreview(p, ME);
  assert.equal(roleOf(m, ME), 'cc');
  assert.equal(m.body.content, 'Hallo');
  assert.equal(roleOf(mailFromPreview({ vorschau: '[Rolle: shared]\nHi' }, ME), ME), 'shared');
  assert.equal(roleOf(mailFromPreview({ vorschau: 'Hi' }, ME), ME), 'direkt');
});

test('Job bestimmt Rollen neuer Mails einmal, begrenzt pro Durchlauf, Fehler stoppen nicht', async () => {
  const saved = {};
  const store = { get: (s, k) => saved[k], set: (s, k, v) => (saved[k] = v) };
  const items = [1, 2, 3].map((i) => ({ id: i, mail_id: `M${i}`, received_at: `2026-10-2${i}` }));
  let calls = 0;
  const drafts = { getMail: async (p) => (calls++, p.id === 2 ? Promise.reject(new Error('Outlook weg')) : { toRecipients: [r(ME)] }) };
  const roles = createRoles({ drafts, store, ownAddress: ME, getScheduler: () => ({ state: { items } }), perRun: 2, log: () => {} });
  await roles.run();
  assert.equal(calls, 2); // neueste zuerst: M3, M2
  assert.equal(roles.get('M3'), 'direkt');
  assert.equal(roles.get('M2'), null);
  await roles.run();
  assert.equal(calls, 3); // M3 ist bekannt, M2 pausiert nach dem Fehler, also kommt M1 dran
  assert.equal(roles.get('M1'), 'direkt');
});
