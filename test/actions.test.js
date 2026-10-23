import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { actions } from '../actions/index.js';
import { createStore } from '../lib/store.js';
import { createScheduler } from '../lib/scheduler.js';

// Gemeinsame Attrappen: n8n merkt sich die Aufrufe, der Scheduler hält die Listen.
function setup(rows = {}) {
  const calls = [];
  const n8n = {
    listProposals: async (status) => (rows[status] || []).map((r) => ({ ...r })),
    setStatus: async (id, s) => calls.push(['setStatus', id, s]),
    deleteRow: async (id) => calls.push(['deleteRow', id]),
    hasReply: async () => ({ hasReply: false }),
  };
  const store = createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'actions-test-')), 'state.json'));
  const scheduler = createScheduler({ n8n, drafts: {}, learner: {}, store, poll: { proposalsSec: 1, repliesSec: 1, draftsSec: 1, learnSec: 1 }, log: () => {} });
  const rules = { appendIgnore: (a) => (calls.push(['ignore', a]), true) };
  return { calls, n8n, store, scheduler, rules, services: { n8n, store, scheduler, rules } };
}

const row = (id, extra = {}) => ({ id, mail_id: `M${id}`, absender_mail: `a${id}@x.at`, betreff: `B${id}`, ...extra });

test('Verwerfen legt die Mail nach Done ab: Status done, sofort in der Archiv-Liste, nicht mehr aktiv', async () => {
  const s = setup({ neu: [row(1), row(2)] });
  await s.scheduler.refresh();
  await actions.archive.run(s.services, { id: 1 });
  assert.deepEqual(s.calls, [['setStatus', 1, 'done']]);
  assert.deepEqual(s.scheduler.state.items.map((p) => p.id), [2]);
  assert.deepEqual(s.scheduler.state.archive.map((p) => [p.id, p.status]), [[1, 'done']]);
  assert.ok(s.scheduler.find(1), 'in Done weiterhin auffindbar (Suche)');
});

test('Verwerfen mit "Absender ignorieren" legt zusätzlich eine Regel an', async () => {
  const s = setup({ neu: [row(1)] });
  await s.scheduler.refresh();
  await actions.archive.run(s.services, { id: 1, ignoreSender: true });
  assert.ok(s.calls.some((c) => c[0] === 'ignore' && c[1] === 'a1@x.at'));
});

test('Zurückholen setzt den Status auf neu und lädt die Listen neu', async () => {
  const rows = { neu: [], done: [row(5, { status: 'done' })] };
  const s = setup(rows);
  await s.scheduler.refresh();
  assert.equal(s.scheduler.state.archive.length, 1);
  rows.neu = [row(5, { status: 'neu' })];
  rows.done = [];
  await actions.restore.run(s.services, { id: 5 });
  assert.deepEqual(s.calls, [['setStatus', 5, 'neu']]);
  assert.deepEqual(s.scheduler.state.items.map((p) => p.id), [5]);
  assert.equal(s.scheduler.state.archive.length, 0);
});

test('Löschen entfernt Zeile, Listen und alles Lokale, auch aus Done', async () => {
  const s = setup({ done: [row(7, { status: 'done' })] });
  await s.scheduler.refresh();
  s.store.set('drafts', 'M7', { text: 'Entwurf' });
  s.store.set('matches', 'M7', { heading: 'X' });
  s.store.set('snoozed', 'M7', '2099-01-01T00:00:00Z');
  await actions.delete.run(s.services, { id: 7 });
  assert.deepEqual(s.calls, [['deleteRow', 7]]);
  assert.equal(s.scheduler.find(7), undefined);
  for (const section of ['drafts', 'matches', 'snoozed']) assert.equal(s.store.get(section, 'M7'), undefined, section);
});

test('Löschen und Verwerfen einer unbekannten Mail melden einen Fehler statt still zu scheitern', async () => {
  const s = setup();
  await assert.rejects(actions.delete.run(s.services, { id: 99 }), /nicht gefunden/);
  await assert.rejects(actions.archive.run(s.services, { id: 99 }), /nicht gefunden/);
  assert.deepEqual(s.calls, []);
});

test('Done enthält verworfene, übernommene und beantwortete Mails, zuletzt abgelegte zuerst', async () => {
  const s = setup({
    done: [row(1, { status: 'done', updatedAt: '2026-10-20T10:00:00Z' })],
    angenommen: [row(2, { status: 'angenommen', updatedAt: '2026-10-21T09:00:00Z' })],
    beantwortet: [row(3, { status: 'beantwortet', updatedAt: '2026-10-19T09:00:00Z' })],
  });
  await s.scheduler.refresh();
  assert.deepEqual(s.scheduler.state.archive.map((p) => p.id), [2, 1, 3]);
});

test('Aufgabe übernehmen: Aufgabe wird eingetragen, die Mail bleibt in Offen, die Übernahme wird lokal vermerkt', async () => {
  const s = setup({ neu: [row(1, { web_link: 'https://outlook/x' }), row(2)] });
  await s.scheduler.refresh();
  const added = [];
  const vault = { addTask: (t) => (added.push(t), { duplicate: false }) };
  const out = await actions.accept.run({ ...s.services, vault }, { id: 1, text: 'Rückruf', heading: 'Kunden', due: '2026-10-30', important: true });
  assert.deepEqual(out, { duplicate: false });
  assert.deepEqual(added.map((t) => [t.text, t.heading, t.link, t.important]), [['Rückruf', 'Kunden', 'https://outlook/x', true]]);
  assert.deepEqual(s.calls, [], 'n8n-Status bleibt unverändert');
  assert.deepEqual(s.scheduler.state.items.map((p) => p.id), [1, 2], 'Mail bleibt in Offen');
  assert.equal(s.scheduler.state.archive.length, 0);
  assert.equal(s.store.get('tasks', 'M1').text, 'Rückruf');
  assert.equal(s.store.get('tasks', 'M1').heading, 'Kunden');
});
