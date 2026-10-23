import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox } from '../lib/outbox.js';

const memoryStore = () => {
  const data = {};
  return {
    get: (s, k) => data[s]?.[k],
    set: (s, k, v) => ((data[s] ??= {})[k] = JSON.parse(JSON.stringify(v))),
    del: (s, k) => data[s] && delete data[s][k],
    all: (s) => ({ ...(data[s] || {}) }),
  };
};

function setup() {
  let t = Date.parse('2026-10-23T10:00:00Z');
  const store = memoryStore();
  const calls = [];
  const rows = [{ id: 1, mail_id: 'M1-xxxxxxxxxxxxxxxxxxxxxxxxxx', status: 'neu' }, { id: 2, mail_id: 'TEST-1', status: 'neu' }];
  const scheduler = { find: (id) => rows.find((r) => String(r.id) === String(id)), moveToArchive: (p, st) => calls.push(['archive', p.id, st]) };
  const n8n = {
    saveNewDraft: async (p) => (calls.push(['saveNewDraft', p]), { draftId: 'N-1' }),
    saveDraft: async (p) => (calls.push(['saveDraft', p]), { draftId: 'R-1' }),
    sendDraft: async (id) => calls.push(['sendDraft', id]),
    deleteDraft: async (id) => calls.push(['deleteDraft', id]),
    setStatus: async (id, s) => calls.push(['setStatus', id, s]),
  };
  const touched = [];
  const outbox = createOutbox({ n8n, store, scheduler, drafts: { getMail: async () => null }, addressBook: { touch: (a) => touched.push(...a) }, now: () => t, log: () => {} });
  return { outbox, store, calls, n8n, touched, advance: (ms) => (t += ms), at: (ms) => new Date(t + ms).toISOString() };
}
const NEW = { subject: 'Angebot', text: 'Hallo Max', to: ['max@y.at'] };

test('Entwürfe: anlegen, ändern (gleiche ID), sortieren, löschen', () => {
  const s = setup();
  const a = s.outbox.saveDraft({ subject: 'A', text: 'x', to: ['A@x.at'] });
  s.advance(1000);
  const b = s.outbox.saveDraft({ subject: 'B' });
  assert.deepEqual(s.outbox.listDrafts().map((d) => d.subject), ['B', 'A']);
  s.advance(1000);
  assert.equal(s.outbox.saveDraft({ id: a.id, subject: 'A2', to: ['a@x.at'] }).id, a.id);
  assert.deepEqual(s.outbox.listDrafts().map((d) => [d.subject, d.to]), [['A2', ['a@x.at']], ['B', []]]);
  assert.equal(s.outbox.deleteDraft(b.id), true);
  assert.equal(s.outbox.deleteDraft(b.id), false);
  assert.deepEqual(s.outbox.counts(), { drafts: 1, scheduled: 0, failed: 0 });
});

test('Planen: prüft Zeit, Empfänger, Betreff, Platzhalter; macht aus einem Entwurf einen geplanten Eintrag', () => {
  const s = setup();
  const draft = s.outbox.saveDraft(NEW);
  assert.throws(() => s.outbox.schedule({ kind: 'new', payload: NEW, sendAt: s.at(1000) }), /Zukunft/);
  assert.throws(() => s.outbox.schedule({ kind: 'new', payload: NEW, sendAt: 'morgen' }), /Ungültige Sendezeit/);
  assert.throws(() => s.outbox.schedule({ kind: 'new', payload: NEW, sendAt: s.at(400 * 86400_000) }), /zu weit/);
  assert.throws(() => s.outbox.schedule({ kind: 'new', payload: { ...NEW, to: [] }, sendAt: s.at(3600_000) }), /Empfänger/);
  assert.throws(() => s.outbox.schedule({ kind: 'new', payload: { ...NEW, subject: ' ' }, sendAt: s.at(3600_000) }), /Betreff/);
  assert.throws(() => s.outbox.schedule({ kind: 'new', payload: { ...NEW, text: 'Termin [BITTE ERGÄNZEN: Datum]' }, sendAt: s.at(3600_000) }), /BITTE ERGÄNZEN/);
  assert.throws(() => s.outbox.schedule({ kind: 'reply', payload: { id: 99, text: 'x', to: ['a@x.at'] }, sendAt: s.at(3600_000) }), /nicht gefunden/);
  const item = s.outbox.schedule({ kind: 'new', payload: { ...NEW, cc: ['max@y.at', 'c@x.at'] }, sendAt: s.at(3600_000), fromDraftId: draft.id });
  assert.deepEqual(item.payload.cc, ['c@x.at']);
  assert.equal(s.outbox.getDraft(draft.id), null, 'der Entwurf ist jetzt geplant');
  assert.equal(s.outbox.listScheduled().length, 1);
});

test('Job: sendet erst zur Sendezeit, legt den Entwurf in Outlook an und sendet sofort; danach ist der Eintrag weg', async () => {
  const s = setup();
  s.outbox.schedule({ kind: 'new', payload: { ...NEW, bcc: ['b@x.at'] }, sendAt: s.at(3600_000) });
  await s.outbox.runDue();
  assert.deepEqual(s.calls, [], 'noch nicht fällig');
  s.advance(3601_000);
  await s.outbox.runDue();
  assert.deepEqual(s.calls.map((c) => c[0]), ['saveNewDraft', 'sendDraft']);
  assert.deepEqual(s.calls[0][1], { subject: 'Angebot', text: 'Hallo Max', to: ['max@y.at'], cc: [], bcc: ['b@x.at'] });
  assert.deepEqual(s.touched, ['max@y.at', 'b@x.at']);
  assert.equal(s.outbox.listScheduled().length, 0);
  await s.outbox.runDue();
  assert.equal(s.calls.length, 2, 'nicht noch einmal');
});

test('Job: geplante Antwort sendet an die Mail, bleibt offen oder geht mit done nach Done, merkt sich appSent', async () => {
  const s = setup();
  s.outbox.schedule({ kind: 'reply', payload: { id: 1, text: 'Danke', to: ['h@x.at'], done: false }, sendAt: s.at(60_000) });
  s.outbox.schedule({ kind: 'reply', payload: { id: 1, text: 'Danke 2', to: ['h@x.at'], done: true }, sendAt: s.at(60_000) });
  s.advance(61_000);
  await s.outbox.runDue();
  assert.deepEqual(s.calls.filter((c) => ['saveDraft', 'sendDraft', 'setStatus'].includes(c[0])).map((c) => c[0]), ['saveDraft', 'sendDraft', 'saveDraft', 'sendDraft', 'setStatus']);
  assert.deepEqual(s.calls.filter((c) => c[0] === 'archive'), [['archive', 1, 'beantwortet']], 'nur die mit done');
  assert.ok(s.store.get('appSent', 'M1-xxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('Job: Testmail-Antwort wird nur simuliert', async () => {
  const s = setup();
  s.outbox.schedule({ kind: 'reply', payload: { id: 2, text: 'Test', to: ['h@x.at'] }, sendAt: s.at(60_000) });
  s.advance(61_000);
  await s.outbox.runDue();
  assert.deepEqual(s.calls, []);
  assert.equal(s.outbox.listScheduled().length, 0);
});

test('Fehler: Eintrag bleibt mit Meldung, nach einer Minute bis zu dreimal erneut, "Jetzt senden" versucht es sofort; kein Entwurfsrest in Outlook', async () => {
  const s = setup();
  let fail = true;
  s.n8n.sendDraft = async (id) => {
    s.calls.push(['sendDraft', id]);
    if (fail) throw new Error('Outlook-Fehler');
  };
  s.outbox.schedule({ kind: 'new', payload: NEW, sendAt: s.at(60_000) });
  s.advance(61_000);
  await s.outbox.runDue();
  const [item] = s.outbox.listScheduled();
  assert.deepEqual([item.status, item.attempts, item.error], ['fehler', 1, 'Outlook-Fehler']);
  assert.deepEqual(s.calls.map((c) => c[0]), ['saveNewDraft', 'sendDraft', 'deleteDraft'], 'der halbe Entwurf wird in Outlook gelöscht');
  await s.outbox.runDue();
  assert.equal(s.calls.length, 3, 'zu früh für den nächsten Versuch');
  s.advance(61_000);
  await s.outbox.runDue();
  assert.equal(s.outbox.listScheduled()[0].attempts, 2);
  s.advance(61_000);
  await s.outbox.runDue();
  s.advance(61_000);
  await s.outbox.runDue();
  assert.equal(s.outbox.listScheduled()[0].attempts, 3, 'nach drei Versuchen Schluss');
  fail = false;
  await s.outbox.sendNow(item.id);
  assert.equal(s.outbox.listScheduled().length, 0);
});

test('Abbrechen: weg, oder bei einer neuen Mail zurück als Entwurf in der App', () => {
  const s = setup();
  const a = s.outbox.schedule({ kind: 'new', payload: NEW, sendAt: s.at(60_000) });
  const r = s.outbox.cancel(a.id, { toDraft: true });
  assert.equal(s.outbox.getDraft(r.draftId).subject, 'Angebot');
  assert.equal(s.outbox.listScheduled().length, 0);
  const b = s.outbox.schedule({ kind: 'new', payload: NEW, sendAt: s.at(60_000) });
  assert.deepEqual(s.outbox.cancel(b.id), { cancelled: true });
  assert.deepEqual(s.outbox.cancel('gibt-es-nicht'), { cancelled: false });
});
