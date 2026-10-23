import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createThread, ownText, testThread } from '../lib/thread.js';

const OWN = 'barni@firma.at';
const SIG = 'Barni Kiss\nProjektmanager\nFaircheck GmbH\nTel.: +43 1 234 56 78\nwww.faircheck.at';
const msg = (id, from, to, cc, sent, text) => ({ id, from, to, cc, sent, hasAttachments: false, body: `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>` });
const helga = { name: 'Helga Brunner', address: 'helga@partner.at' };
const paul = { name: 'Paul Weber', address: 'paul@partner.at' };
const me = { name: 'Barni Kiss', address: OWN };

const ITEMS = [
  msg('M3', paul, [helga, me], [], '2026-10-23T08:15:00Z', 'Danke, passt so.\n\nVon: Barni Kiss\nGesendet: Montag\nAn: Helga\nBetreff: AW: Rechnung\n\nJa, schaue ich mir an.'),
  msg('M2', me, [helga], [paul], '2026-10-22T11:05:00Z', `Ja, schaue ich mir an.\n\nMit freundlichen Grüßen\n${SIG}\n\nAm Mo., 22. Okt. 2026 um 10:42 schrieb Helga Brunner:\n> Kannst du die Rechnung prüfen?`),
  msg('M1', helga, [me], [paul], '2026-10-22T10:42:00Z', 'Kannst du die Rechnung prüfen?'),
];

function setup(over = {}) {
  const calls = [];
  const n8n = { getThread: async (conv, opts) => (calls.push([conv, opts]), over.thread ? over.thread(conv, opts) : { items: ITEMS, hasMore: true, total: 9 }) };
  const texts = { M1: 'Kannst du die Rechnung prüfen?', M3: 'Danke, passt so.\n\nVon: Barni Kiss\nGesendet: Montag\n\nJa, schaue ich mir an.' };
  const drafts = {
    getMail: async (p) => ({ from: { emailAddress: helga }, toRecipients: [{ emailAddress: me }], ccRecipients: [], receivedDateTime: '2026-10-22T10:42:00Z', text: texts[p.mail_id] ?? 'Kannst du die Rechnung prüfen?' }),
    mailText: (m, o) => `${m.text}${o?.images && m.text.startsWith('Kannst') ? '\n⟦bild:cid1⟧' : ''}`,
  };
  const attachments = { resolveImages: async (p, text) => ({ text: text.replace('⟦bild:cid1⟧', '⟦bild:ATT1⟧'), images: ['ATT1'] }) };
  const t = createThread({ n8n, drafts, attachments, ownAddress: OWN, log: () => {} });
  return { t, calls };
}
const proposal = (o = {}) => ({ mail_id: 'M1', conversation_id: 'CONV-123456789', received_at: '2026-10-22T10:42:00Z', ...o });

test('ownText schneidet zitierten Verlauf ab (Von:, Am … schrieb, > am Ende)', () => {
  assert.equal(ownText('Antwort\n\nVon: X\nGesendet: Y\n\nAlt'), 'Antwort');
  assert.equal(ownText('Antwort\n\nAm Mo., 22. Okt. um 10:42 schrieb Helga:\n> Alt'), 'Antwort');
  assert.equal(ownText('Antwort\n> Alt\n> noch älter'), 'Antwort');
  assert.equal(ownText('Nur ein Text'), 'Nur ein Text');
});

test('Verlauf: je Nachricht ohne Zitat, eigene als own, Signatur getrennt, Empfänger und Seite', async () => {
  const { t, calls } = setup();
  const r = await t.page(proposal({ mail_id: 'M3' }), { limit: 3 });
  assert.deepEqual(calls[0], ['CONV-123456789', { before: '', limit: 3 }]);
  assert.deepEqual(r.messages.map((m) => [m.id, m.own, m.current]), [['M3', false, true], ['M2', true, false], ['M1', false, false]]);
  assert.equal(r.messages[0].text, 'Danke, passt so.');
  assert.equal(r.messages[1].text, 'Ja, schaue ich mir an.\n\nMit freundlichen Grüßen');
  assert.equal(r.messages[1].signature, SIG);
  assert.deepEqual(r.messages[1].cc.map((p) => p.address), ['paul@partner.at']);
  assert.equal(r.hasMore, true);
  assert.equal(r.nextBefore, '2026-10-22T10:42:00Z', 'Zeitpunkt der ältesten Nachricht der Seite');
  assert.equal(r.degraded, false);
});

test('Verlauf: die geöffnete Mail zeigt ihre Bilder (Marken mit Anhang-ID)', async () => {
  const { t } = setup();
  const r = await t.page(proposal(), { limit: 3 });
  assert.match(r.messages.find((m) => m.current).text, /⟦bild:ATT1⟧/);
});

test('Verlauf: weitere Seite (before) holt keine geöffnete Mail nach', async () => {
  const { t, calls } = setup({ thread: () => ({ items: [ITEMS[2]], hasMore: false }) });
  const r = await t.page(proposal({ mail_id: 'M9' }), { before: '2026-10-22T11:00:00Z', limit: 10 });
  assert.equal(calls[0][1].before, '2026-10-22T11:00:00Z');
  assert.equal(r.hasMore, false);
  assert.equal(r.messages.length, 1);
});

test('Rückfall: ohne Konversation oder bei Fehler bleibt die geöffnete Mail als einzelne Nachricht', async () => {
  const a = await setup().t.page(proposal({ conversation_id: '', mail_id: 'TEST-1' }));
  assert.equal(a.degraded, true);
  assert.equal(a.messages.length, 1);
  assert.match(a.messages[0].text, /Rechnung prüfen/);
  const b = await setup({ thread: () => { throw new Error('n8n weg'); } }).t.page(proposal());
  assert.equal(b.degraded, true);
  assert.equal(b.messages[0].from.address, 'helga@partner.at');
});

test('Testmail-Verlauf aus verlauf.json: neueste zuerst, seitenweise, mit Signaturerkennung', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testthread-'));
  fs.mkdirSync(path.join(dir, 'TEST-V-1'));
  const all = Array.from({ length: 12 }, (_, i) => ({ id: `T${i}`, from: i % 2 ? me : helga, to: [i % 2 ? helga : me], sent: `2026-10-${String(10 + i).padStart(2, '0')}T08:00:00Z`, body: `Nachricht ${i}\n\nMit freundlichen Grüßen\n${SIG}` }));
  fs.writeFileSync(path.join(dir, 'TEST-V-1', 'verlauf.json'), JSON.stringify(all));
  const p = { mail_id: 'TEST-V-1', conversation_id: '', received_at: '2026-10-21T08:00:00Z' };
  assert.equal(testThread(dir, { mail_id: 'TEST-GIBT-ES-NICHT' }), null);
  const first = testThread(dir, p, { limit: 10 });
  assert.deepEqual([first.items.length, first.hasMore, first.items[0].id], [10, true, 'T11']);
  const t = createThread({ n8n: {}, drafts: { getMail: async () => ({ from: { emailAddress: helga }, toRecipients: [], ccRecipients: [], text: 'x' }), mailText: (m) => m.text }, attachments: { resolveImages: async (_p, text) => ({ text }) }, ownAddress: OWN, testDir: dir, log: () => {} });
  const page = await t.page(p, { limit: 10 });
  assert.equal(page.degraded, false);
  assert.equal(page.messages.length, 10);
  assert.equal(page.messages[0].own, true);
  assert.equal(page.messages[0].signature, SIG);
  const older = await t.page(p, { before: page.nextBefore, limit: 10 });
  assert.deepEqual([older.messages.length, older.hasMore], [2, false]);
});
