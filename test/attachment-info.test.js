import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttachmentInfo } from '../lib/attachment-info.js';

test('Anhangsinfo: einmal pro Mail, [] ist bekannt, Fehler pausieren', async () => {
  const saved = {};
  const store = { get: (s, k) => saved[k], set: (s, k, v) => (saved[k] = v) };
  const items = [1, 2, 3].map((i) => ({ id: i, mail_id: `M${i}`, received_at: `2026-10-2${i}` }));
  let calls = 0;
  const attachments = {
    list: async (p) => {
      calls += 1;
      if (p.id === 2) throw new Error('Outlook weg');
      return p.id === 3 ? [{ name: 'a.pdf' }, { name: 'b.xlsx' }] : [];
    },
  };
  const info = createAttachmentInfo({ attachments, store, getScheduler: () => ({ state: { items } }), perRun: 2, log: () => {} });
  assert.equal(info.get('M3'), null);
  await info.run();
  assert.deepEqual(info.get('M3'), ['a.pdf', 'b.xlsx']);
  assert.equal(info.get('M2'), null);
  await info.run();
  assert.deepEqual(info.get('M1'), []); // [] = keine Anhänge, nicht mehr "unbekannt"
  assert.equal(calls, 3);
  await info.run();
  assert.equal(calls, 3);
});
