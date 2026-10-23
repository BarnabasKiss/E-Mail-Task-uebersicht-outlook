import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDocIndex } from '../lib/doc-index.js';

const addr = (name, address) => ({ emailAddress: { name, address } });
const fakeDrafts = (over = {}) => ({
  getMail: async (p) => ({ toRecipients: [addr('Barni Kiss', 'barni@x.at')], ccRecipients: [addr('Helga Brunner', 'helga@y.at')], text: `Mailtext ${p.id} mit Kennwort Zebra${p.id}` }),
  mailText: (m) => m.text,
  ...over,
});
const setup = (readAll, drafts = fakeDrafts()) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docidx-'));
  const items = [1, 2, 3].map((i) => ({ id: i, mail_id: `M${i}` }));
  const sched = { state: { items, archive: [], archiveAt: null } };
  const idx = createDocIndex({ attachments: { readAll }, drafts, file: path.join(dir, 'i.json'), getScheduler: () => sched, perRun: 2, log: () => {} });
  return { idx, sched, dir };
};

test('Index liest Anhänge im Hintergrund und findet Begriffe samt Fundstelle', async () => {
  const { idx } = setup(async (p) => (p.id === 1 ? [{ name: 'Rechnung.pdf', text: 'Autohaus Steiner\nGesamtbetrag brutto EUR 4.824,00\nZahlbar bis 04.11.2026' }] : [{ name: 'x.bin', text: null, reason: 'Dateityp wird nicht gelesen' }]));
  await idx.run();
  assert.deepEqual(idx.coverage(), { indexed: 2, total: 3 });
  const hits = idx.search('gesamtbetrag 4.824');
  assert.deepEqual(Object.keys(hits), ['M1']);
  assert.equal(hits.M1[0].name, 'Rechnung.pdf');
  assert.equal(hits.M1[0].kind, 'doc');
  assert.match(hits.M1[0].snippet, /Gesamtbetrag brutto EUR 4\.824,00/);
  assert.deepEqual(idx.search('gibt es nicht'), {});
  assert.deepEqual(idx.search('a'), {}); // zu kurz
  await idx.run();
  assert.deepEqual(idx.coverage(), { indexed: 3, total: 3 });
});

test('alle Begriffe müssen im selben Dokument stehen; Dateiname zählt mit', async () => {
  const { idx } = setup(async (p) => [{ name: `Gutachten_${p.id}.pdf`, text: p.id === 1 ? 'Frontschaden links' : 'Heckschaden rechts' }]);
  await idx.run();
  assert.deepEqual(Object.keys(idx.search('frontschaden links')), ['M1']);
  assert.deepEqual(Object.keys(idx.search('frontschaden rechts')), []);
  assert.deepEqual(Object.keys(idx.search('gutachten_2')), ['M2']);
});

test('Fehler werden begrenzt wiederholt, Ausfall des Abrufs stoppt den Lauf nicht, Datei wird gespeichert und geladen', async () => {
  let calls = 0;
  const { idx, dir } = setup(async (p) => {
    calls += 1;
    if (p.id === 1) throw new Error('Outlook weg');
    return [{ name: 'a.pdf', text: 'Inhalt Alpha' }];
  });
  await idx.run();
  assert.equal(calls, 2);
  assert.deepEqual(Object.keys(idx.search('alpha')), ['M2']);
  await new Promise((r) => setTimeout(r, 1200));
  const again = createDocIndex({ attachments: { readAll: async () => [] }, drafts: fakeDrafts(), file: path.join(dir, 'i.json'), getScheduler: () => ({ state: { items: [], archive: [], archiveAt: null } }) });
  assert.deepEqual(Object.keys(again.search('alpha')), ['M2']);
});

test('Suche getrennt nach Dokumentinhalt und Dokumentnamen', async () => {
  const { idx } = setup(async (p) => [{ name: p.id === 1 ? 'Gutachten.pdf' : 'Anderes.pdf', text: p.id === 1 ? 'Frontschaden' : 'Gutachten zum Heckschaden' }]);
  await idx.run();
  assert.deepEqual(Object.keys(idx.search('gutachten')).sort(), ['M1', 'M2']);
  assert.deepEqual(Object.keys(idx.search('gutachten', { names: false })), ['M2']); // nur Inhalt
  assert.deepEqual(Object.keys(idx.search('gutachten', { content: false })), ['M1']); // nur Name
  assert.equal(idx.search('gutachten', { content: false }).M1[0].snippet, ''); // Treffer im Namen: kein Ausschnitt
  assert.deepEqual(idx.search('gutachten', { content: false, names: false }), {});
});

test('Mailtext und Empfänger werden mitgelesen; Treffer im Mailtext haben die Art "text"', async () => {
  const { idx } = setup(async () => []);
  await idx.run();
  assert.deepEqual(idx.recipients('M1'), { an: ['Barni Kiss barni@x.at'], cc: ['Helga Brunner helga@y.at'] });
  assert.equal(idx.recipients('M3'), null, 'noch nicht gelesen');
  const hits = idx.search('kennwort zebra2');
  assert.deepEqual(Object.keys(hits), ['M2']);
  assert.equal(hits.M2[0].kind, 'text');
  assert.match(hits.M2[0].snippet, /Kennwort Zebra2/);
  assert.deepEqual(idx.search('kennwort zebra2', { text: false }), {}, 'Bereich Mailtext abgeschaltet');
});

test('Ältere Einträge ohne Mail bekommen sie nachgeliefert, ohne die Dokumente neu zu lesen; Abruffehler wird später wiederholt', async () => {
  let reads = 0;
  let mailFails = true;
  const drafts = fakeDrafts({ getMail: async () => { if (mailFails) throw new Error('Outlook weg'); return { toRecipients: [], ccRecipients: [addr('A', 'a@b.at')], text: 'Nachtrag' }; } });
  const { idx } = setup(async () => (reads += 1, [{ name: 'a.pdf', text: 'Inhalt Alpha' }]), drafts);
  await idx.run();
  assert.equal(reads, 2);
  assert.deepEqual(Object.keys(idx.search('alpha')).sort(), ['M1', 'M2'], 'Dokumente sind trotz Mail-Fehler gemerkt');
  assert.deepEqual(idx.coverage(), { indexed: 0, total: 3 });
  mailFails = false;
  await idx.run(); // M3 ist neu; M1/M2 warten auf die Pause nach dem Fehler (30 Minuten)
  assert.equal(reads, 3);
  assert.equal(idx.recipients('M3').cc[0], 'A a@b.at');
});

test('Mail, die Outlook dauerhaft nicht liefert, wird nach drei Versuchen aufgegeben', async () => {
  let calls = 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docidx-'));
  const sched = { state: { items: [{ id: 1, mail_id: 'M1' }], archive: [], archiveAt: null } };
  const idx = createDocIndex({ attachments: { readAll: async () => (calls += 1, Promise.reject(new Error('Outlook-Fehler'))) }, drafts: fakeDrafts(), file: path.join(dir, 'i.json'), getScheduler: () => sched, perRun: 1, log: () => {} });
  const realNow = Date.now;
  let t = realNow();
  Date.now = () => t;
  try {
    for (let i = 0; i < 6; i += 1) {
      await idx.run();
      t += 11 * 60 * 1000; // die 10 Minuten Pause nach einem Fehler verstreichen lassen
    }
  } finally {
    Date.now = realNow;
  }
  assert.equal(calls, 3);
});
