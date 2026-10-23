import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAddressBook } from '../lib/address-book.js';
import { createAddressJob } from '../lib/address-job.js';

test('Adressbuch-Job: Absender sofort, Empfänger sobald der Suchindex sie kennt, jede Mail einmal, Testmails nie', () => {
  const book = createAddressBook({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'job-')), 'b.json'), ownAddresses: ['ich@x.at'], log: () => {} });
  const sched = { state: { items: [{ mail_id: 'M1', absender: 'Anna Berger', absender_mail: 'anna@kunde.at' }, { mail_id: 'TEST-1', absender: 'Test', absender_mail: 'test@x.at' }], archive: [{ mail_id: 'M2', absender: 'Paul', absender_mail: 'paul@z.at' }] } };
  let recipients = null;
  const job = createAddressJob({ book, getScheduler: () => sched, docIndex: { recipients: (id) => (id === 'M1' ? recipients : null) } });
  job.run();
  assert.deepEqual(book.list().items.map((p) => p.address), ['anna@kunde.at', 'paul@z.at']);
  recipients = { an: ['Ich ich@x.at', 'Max Huber max@y.at'], cc: ['helga@z.at'] };
  job.run();
  job.run();
  const all = book.list().items;
  assert.deepEqual(all.map((p) => p.address), ['anna@kunde.at', 'helga@z.at', 'max@y.at', 'paul@z.at'], 'eigene Adresse fehlt');
  assert.equal(book.search('max')[0].name, 'Max Huber');
  assert.equal(book.search('anna')[0].count, 1, 'zweimal ausgeführt, einmal gezählt');
});
