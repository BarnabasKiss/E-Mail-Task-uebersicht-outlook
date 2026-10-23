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

test('Sammelaktion: Done für mehrere Mails, ein Fehler stoppt die anderen nicht', async () => {
  const s = setup({ neu: [row(1), row(2), row(3)] });
  await s.scheduler.refresh();
  const out = await actions.bulk.run({ ...s.services, actions }, { action: 'archive', ids: [1, 99, 3, 3], ignoreSender: true });
  assert.equal(out.done, 2);
  assert.deepEqual(out.failed.map((f) => f.id), [99]);
  assert.equal(out.ignored, 2);
  assert.deepEqual(s.scheduler.state.items.map((p) => p.id), [2]);
  assert.deepEqual(s.calls.filter((c) => c[0] === 'setStatus'), [['setStatus', 1, 'done'], ['setStatus', 3, 'done']]);
});

test('Sammelaktion: Zurückholen lädt die Listen nur einmal neu', async () => {
  const rows = { neu: [], done: [row(5, { status: 'done' }), row(6, { status: 'done' })] };
  const s = setup(rows);
  let lists = 0;
  const list = s.n8n.listProposals;
  s.n8n.listProposals = async (st) => (lists += 1, list(st));
  await s.scheduler.refresh();
  lists = 0;
  rows.neu = rows.done.map((r) => ({ ...r, status: 'neu' }));
  rows.done = [];
  const out = await actions.bulk.run({ ...s.services, actions }, { action: 'restore', ids: [5, 6] });
  assert.equal(out.done, 2);
  assert.equal(lists, 4, 'eine Aktualisierung: neu + 3 Done-Status');
  assert.deepEqual(s.scheduler.state.items.map((p) => p.id), [5, 6]);
});

test('Sammelaktion: Später setzt den Zeitpunkt für alle, Löschen entfernt alle', async () => {
  const s = setup({ neu: [row(1), row(2)] });
  await s.scheduler.refresh();
  const until = new Date(Date.now() + 3600_000).toISOString();
  await actions.bulk.run({ ...s.services, actions }, { action: 'snooze', ids: [1, 2], until });
  assert.equal(s.store.get('snoozed', 'M1'), until);
  assert.equal(s.store.get('snoozed', 'M2'), until);
  const out = await actions.bulk.run({ ...s.services, actions }, { action: 'delete', ids: [1, 2] });
  assert.equal(out.done, 2);
  assert.deepEqual(s.scheduler.state.items, []);
});

test('Sammelaktion: nur erlaubte Aktionen, Liste nötig', async () => {
  const s = setup();
  await assert.rejects(actions.bulk.run({ ...s.services, actions }, { action: 'accept', ids: [1] }), /nicht möglich/);
  await assert.rejects(actions.bulk.run({ ...s.services, actions }, { action: 'archive', ids: [] }), /Keine Mails/);
});

test('Entwurf: eine Version zurück tauscht Entwurf und Vorversion', async () => {
  const s = setup({ neu: [row(1)] });
  await s.scheduler.refresh();
  s.store.set('drafts', 'M1', { text: 'neu', createdAt: 'b', previous: { text: 'alt', createdAt: 'a' } });
  await actions['draft-previous'].run(s.services, { id: 1 });
  assert.deepEqual(s.store.get('drafts', 'M1'), { text: 'alt', createdAt: 'a', previous: { text: 'neu', createdAt: 'b' } });
  await actions['draft-previous'].run(s.services, { id: 1 });
  assert.equal(s.store.get('drafts', 'M1').text, 'neu');
  s.store.set('drafts', 'M1', { text: 'x', previous: null });
  await assert.rejects(actions['draft-previous'].run(s.services, { id: 1 }), /keine vorige Version/);
});

// --- Entwurf in Outlook ablegen und senden
function outlookSetup() {
  const s = setup({ neu: [row(1, { antwort_noetig: true })] });
  const sent = [];
  s.n8n.saveDraft = async (a) => (sent.push(['saveDraft', a]), { draftId: `D${sent.length}-xxxxxxxxxxxxxxxxxxxx`, webLink: 'https://outlook/d' });
  s.n8n.deleteDraft = async (id) => sent.push(['deleteDraft', id]);
  s.n8n.sendDraft = async (id) => sent.push(['sendDraft', id]);
  s.services.drafts = { getMail: async () => ({ from: { emailAddress: { name: 'Helga', address: 'h@x.at' } }, toRecipients: [], ccRecipients: [] }) };
  return { ...s, sent };
}

test('Outlook-Entwurf: legt ihn an (sendet nichts), prüft Empfänger, ersetzt einen früheren Entwurf', async () => {
  const s = outlookSetup();
  await s.scheduler.refresh();
  const out = await actions['outlook-draft'].run(s.services, { id: 1, text: ' Hallo\n\nja. ', to: ['H@X.at', 'h@x.at'], cc: ['p@x.at', 'h@x.at'] });
  assert.equal(out.webLink, 'https://outlook/d');
  assert.deepEqual(s.sent[0], ['saveDraft', { id: 'M1', text: 'Hallo\n\nja.', to: ['h@x.at'], cc: ['p@x.at'] }]);
  assert.equal(s.store.get('outlookDrafts', 'M1').draftId, out.draftId);
  await actions['outlook-draft'].run(s.services, { id: 1, text: 'neu', to: ['h@x.at'] });
  assert.deepEqual(s.sent.map((c) => c[0]), ['saveDraft', 'deleteDraft', 'saveDraft'], 'der alte Entwurf wird zuerst gelöscht');
  await assert.rejects(actions['outlook-draft'].run(s.services, { id: 1, text: 'x', to: ['kaputt'] }), /Ungültige Adresse/);
  await assert.rejects(actions['outlook-draft'].run(s.services, { id: 1, text: 'x', to: [] }), /Empfänger/);
  await assert.rejects(actions['outlook-draft'].run(s.services, { id: 1, text: ' ', to: ['h@x.at'] }), /leer/);
});

test('Outlook-Entwurf: Testmails gehen nicht, Löschen entfernt nur den gemerkten Entwurf', async () => {
  const s = outlookSetup();
  s.scheduler.state.items = [row(2, { mail_id: 'TEST-1' }), row(1)];
  await assert.rejects(actions['outlook-draft'].run(s.services, { id: 2, text: 'x', to: ['h@x.at'] }), /Testnachrichten/);
  await actions['outlook-draft'].run(s.services, { id: 1, text: 'x', to: ['h@x.at'] });
  const draftId = s.store.get('outlookDrafts', 'M1').draftId;
  assert.deepEqual(await actions['outlook-draft-delete'].run(s.services, { id: 1 }), { deleted: true });
  assert.equal(s.sent.at(-1)[1], draftId);
  assert.equal(s.store.get('outlookDrafts', 'M1'), undefined);
  assert.deepEqual(await actions['outlook-draft-delete'].run(s.services, { id: 1 }), { deleted: false });
});

test('Senden: nur der gemerkte Entwurf, nicht mit offenen Platzhaltern; danach beantwortet und lernbereit', async () => {
  const s = outlookSetup();
  await s.scheduler.refresh();
  await assert.rejects(actions['outlook-send'].run(s.services, { id: 1 }), /keinen abgelegten Entwurf/);
  await actions['outlook-draft'].run(s.services, { id: 1, text: 'Hallo\n\n[BITTE ERGÄNZEN: Termin]', to: ['h@x.at'] });
  await assert.rejects(actions['outlook-send'].run(s.services, { id: 1 }), /BITTE ERGÄNZEN/);
  assert.ok(!s.sent.some((c) => c[0] === 'sendDraft'), 'nichts gesendet');
  await actions['outlook-draft'].run(s.services, { id: 1, text: 'Hallo\n\nTermin passt.', to: ['h@x.at'] });
  const draftId = s.store.get('outlookDrafts', 'M1').draftId;
  assert.deepEqual(await actions['outlook-send'].run(s.services, { id: 1 }), { sent: true });
  assert.deepEqual(s.sent.at(-1), ['sendDraft', draftId]);
  assert.deepEqual(s.calls.filter((c) => c[0] === 'setStatus'), [['setStatus', 1, 'beantwortet']]);
  assert.equal(s.store.get('replies', 'M1').reply.body, 'Hallo\n\nTermin passt.');
  assert.equal(s.store.get('outlookDrafts', 'M1'), undefined);
  assert.ok(s.scheduler.state.archive.some((p) => p.id === 1 && p.status === 'beantwortet'));
});
