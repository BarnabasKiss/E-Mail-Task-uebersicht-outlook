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
  assert.deepEqual(s.sent[0], ['saveDraft', { id: 'M1', text: 'Hallo\n\nja.', to: ['h@x.at'], cc: ['p@x.at'], bcc: [] }]);
  assert.equal(s.store.get('outlookDrafts', 'M1').draftId, out.draftId);
  await actions['outlook-draft'].run(s.services, { id: 1, text: 'neu', to: ['h@x.at'] });
  assert.deepEqual(s.sent.map((c) => c[0]), ['saveDraft', 'deleteDraft', 'saveDraft'], 'der alte Entwurf wird zuerst gelöscht');
  await assert.rejects(actions['outlook-draft'].run(s.services, { id: 1, text: 'x', to: ['kaputt'] }), /Ungültige Adresse/);
  await assert.rejects(actions['outlook-draft'].run(s.services, { id: 1, text: 'x', to: [] }), /Empfänger/);
  await assert.rejects(actions['outlook-draft'].run(s.services, { id: 1, text: ' ', to: ['h@x.at'] }), /leer/);
});

test('Outlook-Entwurf: Löschen entfernt nur den gemerkten Entwurf', async () => {
  const s = outlookSetup();
  s.scheduler.state.items = [row(1)];
  await actions['outlook-draft'].run(s.services, { id: 1, text: 'x', to: ['h@x.at'] });
  const draftId = s.store.get('outlookDrafts', 'M1').draftId;
  assert.deepEqual(await actions['outlook-draft-delete'].run(s.services, { id: 1 }), { deleted: true });
  assert.equal(s.sent.at(-1)[1], draftId);
  assert.equal(s.store.get('outlookDrafts', 'M1'), undefined);
  assert.deepEqual(await actions['outlook-draft-delete'].run(s.services, { id: 1 }), { deleted: false });
});

test('Senden: nur der gemerkte Entwurf, nicht mit offenen Platzhaltern; die Mail bleibt offen, mit done wandert sie nach Done', async () => {
  const s = outlookSetup();
  await s.scheduler.refresh();
  await assert.rejects(actions['outlook-send'].run(s.services, { id: 1 }), /keinen abgelegten Entwurf/);
  await actions['outlook-draft'].run(s.services, { id: 1, text: 'Hallo\n\n[BITTE ERGÄNZEN: Termin]', to: ['h@x.at'] });
  await assert.rejects(actions['outlook-send'].run(s.services, { id: 1 }), /BITTE ERGÄNZEN/);
  assert.ok(!s.sent.some((c) => c[0] === 'sendDraft'), 'nichts gesendet');
  await actions['outlook-draft'].run(s.services, { id: 1, text: 'Hallo\n\nTermin passt.', to: ['h@x.at'] });
  const draftId = s.store.get('outlookDrafts', 'M1').draftId;
  assert.deepEqual(await actions['outlook-send'].run(s.services, { id: 1 }), { sent: true, simulated: false, done: false });
  assert.deepEqual(s.sent.at(-1), ['sendDraft', draftId]);
  assert.deepEqual(s.calls.filter((c) => c[0] === 'setStatus'), [], 'der Status bleibt: die Mail liegt weiter in Offen');
  assert.ok(s.scheduler.state.items.some((p) => p.id === 1));
  assert.ok(s.store.get('appSent', 'M1'), 'gemerkt, damit die Antworterkennung sie nicht von sich aus ablegt');
  assert.equal(s.store.get('replies', 'M1').reply.body, 'Hallo\n\nTermin passt.', 'zum Lernen');
  assert.equal(s.store.get('outlookDrafts', 'M1'), undefined);

  await actions['outlook-draft'].run(s.services, { id: 1, text: 'Noch eine Antwort', to: ['h@x.at'] });
  assert.equal((await actions['outlook-send'].run(s.services, { id: 1, done: true })).done, true);
  assert.deepEqual(s.calls.filter((c) => c[0] === 'setStatus'), [['setStatus', 1, 'beantwortet']]);
  assert.ok(s.scheduler.state.archive.some((p) => p.id === 1 && p.status === 'beantwortet'));
});

test('Antworterkennung: aus der App gesendete Mails lässt sie offen', async () => {
  const rows = { neu: [row(1, { antwort_noetig: true }), row(2, { antwort_noetig: true })] };
  const s = setup(rows);
  s.n8n.hasReply = async () => ({ hasReply: true, reply: { body: 'Antwort' } });
  s.scheduler = createScheduler({ n8n: s.n8n, drafts: { getMail: async () => null }, learner: {}, store: s.store, poll: { proposalsSec: 1, repliesSec: 1, draftsSec: 1, learnSec: 1 }, log: () => {} });
  await s.scheduler.refresh();
  s.store.set('appSent', 'M1', new Date().toISOString());
  await s.scheduler.checkReplies();
  assert.deepEqual(s.scheduler.state.items.map((p) => p.id), [1], 'Mail 1 bleibt offen, Mail 2 ist als beantwortet abgelegt');
});

test('Testmails: Ablegen, Verwerfen und Senden sind nur simuliert, an n8n geht nichts, gelernt wird nicht', async () => {
  const s = outlookSetup();
  s.scheduler.state.items = [row(2, { mail_id: 'TEST-X-1', antwort_noetig: true })];
  const out = await actions['outlook-draft'].run(s.services, { id: 2, text: 'Hallo', to: ['support@kunde.at'] });
  assert.equal(out.simulated, true);
  assert.deepEqual(s.sent, [], 'kein Aufruf an n8n');
  assert.deepEqual(await actions['outlook-draft-delete'].run(s.services, { id: 2 }), { deleted: true });
  await actions['outlook-draft'].run(s.services, { id: 2, text: 'Hallo', to: ['support@kunde.at'] });
  const sent = await actions['outlook-send'].run(s.services, { id: 2 });
  assert.deepEqual(sent, { sent: false, simulated: true, done: false });
  assert.ok(s.scheduler.state.items.some((p) => p.mail_id === 'TEST-X-1'), 'bleibt offen');
  await actions['outlook-draft'].run(s.services, { id: 2, text: 'Nochmal', to: ['support@kunde.at'] });
  await actions['outlook-send'].run(s.services, { id: 2, done: true });
  assert.deepEqual(s.sent, [], 'auch beim Senden nichts an n8n');
  assert.equal(s.store.get('replies', 'TEST-X-1'), undefined, 'daraus lernt die App nichts');
  assert.ok(s.scheduler.state.archive.some((p) => p.mail_id === 'TEST-X-1'), 'die Testmail liegt danach unter Done');
});

test('Outlook-Entwurf mit BCC: jede Adresse nur einmal (An vor CC vor BCC), Benutzte kommen ins Adressbuch', async () => {
  const s = outlookSetup();
  await s.scheduler.refresh();
  const touched = [];
  s.services.addressBook = { touch: (a) => touched.push(...a) };
  await actions['outlook-draft'].run(s.services, { id: 1, text: 'Hallo', to: ['h@x.at'], cc: ['p@x.at', 'h@x.at'], bcc: ['b@x.at', 'p@x.at', 'H@x.at'] });
  assert.deepEqual(s.sent[0][1], { id: 'M1', text: 'Hallo', to: ['h@x.at'], cc: ['p@x.at'], bcc: ['b@x.at'] });
  assert.deepEqual(touched, ['h@x.at', 'p@x.at', 'b@x.at']);
  await assert.rejects(actions['outlook-draft'].run(s.services, { id: 1, text: 'x', to: ['h@x.at'], bcc: ['kaputt'] }), /Ungültige Adresse bei BCC/);
});

test('Adressbuch-Aktion: anlegen, ändern, löschen, Liste und Outlook-Import (auch leer)', async () => {
  const { createAddressBook } = await import('../lib/address-book.js');
  const book = createAddressBook({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'book-act-')), 'b.json'), ownAddresses: ['ich@x.at'], log: () => {} });
  const s = outlookSetup();
  s.services.addressBook = book;
  s.n8n.listContacts = async () => ({ items: [] });
  const run = (op, p = {}) => actions.book.run(s.services, { op, ...p });
  assert.equal((await run('add', { name: 'Anna', address: 'a@x.at' })).address, 'a@x.at');
  assert.equal((await run('edit', { address: 'a@x.at', company: 'Kunde' })).company, 'Kunde');
  assert.deepEqual(await run('import-text', { text: 'Max;m@y.at' }), { added: 1, updated: 0, skipped: 0 });
  assert.equal((await run('import-outlook')).empty, true);
  s.n8n.listContacts = async () => ({ items: [{ name: 'Paul', company: '', addresses: [{ name: '', address: 'p@z.at' }] }] });
  assert.deepEqual(await run('import-outlook'), { added: 1, updated: 0, total: 1, empty: false });
  assert.deepEqual(await run('remove', { address: 'a@x.at' }), { removed: true });
  await assert.rejects(run('zaubern'), /Unbekannte Änderung/);
});

test('Adressbuch aus gesendeten Mails: beide Quellen, jede Mail einmal, Empfänger An und CC', async () => {
  const { createAddressBook } = await import('../lib/address-book.js');
  const book = createAddressBook({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'book-sent-')), 'b.json'), ownAddresses: ['ich@x.at'], log: () => {} });
  const s = outlookSetup();
  s.services.addressBook = book;
  const pages = { sent: [{ id: 'S1', sentDateTime: '2026-10-02T08:00:00Z', to: [{ name: 'Anna', address: 'a@x.at' }], cc: [{ name: '', address: 'c@x.at' }] }], all: [{ id: 'S1', sentDateTime: '2026-10-02T08:00:00Z', to: [{ name: 'Anna', address: 'a@x.at' }], cc: [] }, { id: 'S2', sentDateTime: '2026-09-01T08:00:00Z', to: [{ name: 'Max', address: 'm@y.at' }, { name: 'Ich', address: 'ich@x.at' }], cc: [] }] };
  s.n8n.listSent = async ({ scope, before }) => (before ? [] : pages[scope]);
  const r = await actions.book.run(s.services, { op: 'import-sent' });
  assert.deepEqual(r, { mails: 2, people: 3 });
  assert.deepEqual(book.list().items.map((p) => p.address), ['a@x.at', 'c@x.at', 'm@y.at']);
  assert.equal(book.search('anna')[0].sentCount, 1);
});

// --- Neue Mail
test('Neue Mail: als Entwurf ablegen (prüft Betreff, Text, Empfänger), erneutes Ablegen ersetzt den alten Entwurf, Senden nur für App-Entwürfe', async () => {
  const s = outlookSetup();
  s.n8n.saveNewDraft = async (a) => (s.sent.push(['saveNewDraft', a]), { draftId: `N${s.sent.length}-xxxxxxxxxxxxxxxxxxxx`, webLink: 'https://outlook/n' });
  const touched = [];
  s.services.addressBook = { touch: (a) => touched.push(...a) };
  const run = (name, p) => actions[name].run(s.services, p);
  await assert.rejects(run('compose-draft', { subject: ' ', text: 'x', to: ['a@x.at'] }), /Betreff/);
  await assert.rejects(run('compose-draft', { subject: 'Hallo', text: ' ', to: ['a@x.at'] }), /Text/);
  await assert.rejects(run('compose-draft', { subject: 'Hallo', text: 'x', to: [] }), /Empfänger/);
  await assert.rejects(run('compose-draft', { subject: 'Hallo', text: 'x', to: ['kaputt'] }), /Ungültige Adresse bei An/);
  assert.deepEqual(s.sent, [], 'bei Fehlern geht nichts an n8n');

  const first = await run('compose-draft', { subject: 'Angebot\nZeile 2', text: 'Text', to: ['A@x.at'], cc: ['a@x.at', 'c@x.at'], bcc: ['c@x.at', 'b@x.at'] });
  assert.deepEqual(s.sent[0], ['saveNewDraft', { subject: 'Angebot Zeile 2', text: 'Text', to: ['a@x.at'], cc: ['c@x.at'], bcc: ['b@x.at'] }]);
  const second = await run('compose-draft', { subject: 'Angebot', text: 'Text 2', to: ['a@x.at'], replaceId: first.draftId });
  assert.deepEqual(s.sent.map((c) => c[0]), ['saveNewDraft', 'deleteDraft', 'saveNewDraft']);
  assert.equal(s.sent[1][1], first.draftId, 'der alte Entwurf wird zuerst gelöscht');
  assert.equal(s.store.get('composeDrafts', first.draftId), undefined);

  await assert.rejects(run('compose-send', { draftId: 'FREMD-xxxxxxxxxxxxxxxxxxxx' }), /nicht aus der App/);
  assert.deepEqual(await run('compose-send', { draftId: second.draftId }), { sent: true });
  assert.deepEqual(s.sent.at(-1), ['sendDraft', second.draftId]);
  assert.deepEqual(touched, ['a@x.at']);
  await assert.rejects(run('compose-send', { draftId: second.draftId }), /schon gesendet/, 'nicht zweimal');
});

test('Neue Mail: Verwerfen löscht nur App-Entwürfe', async () => {
  const s = outlookSetup();
  s.n8n.saveNewDraft = async () => ({ draftId: 'N1-xxxxxxxxxxxxxxxxxxxx' });
  const d = await actions['compose-draft'].run(s.services, { subject: 'S', text: 'T', to: ['a@x.at'] });
  assert.deepEqual(await actions['compose-discard'].run(s.services, { draftId: 'FREMD-xxxxxxxxxxxxxxxxxxxx' }), { deleted: false });
  assert.deepEqual(s.sent.filter((c) => c[0] === 'deleteDraft'), [], 'fremde ID: nichts gelöscht');
  assert.deepEqual(await actions['compose-discard'].run(s.services, { draftId: d.draftId }), { deleted: true });
  assert.equal(s.sent.at(-1)[1], d.draftId);
});
