import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAddressBook, parsePerson, parseList, isEmail } from '../lib/address-book.js';

const make = (extra = {}) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'book-')), 'book.json');
  let t = Date.parse('2026-10-23T10:00:00Z');
  return { file, book: createAddressBook({ file, ownAddresses: ['barni@firma.at'], now: () => t, log: () => {}, ...extra }), tick: (ms) => (t += ms) };
};

test('Personen aus Text lesen: Name <adresse>, nackte Adresse, Name vor Adresse', () => {
  assert.deepEqual(parsePerson('Anna Berger <Anna@X.at>'), { name: 'Anna Berger', address: 'anna@x.at' });
  assert.deepEqual(parsePerson('"Berger, Anna" <a@x.at>'), { name: 'Berger, Anna', address: 'a@x.at' });
  assert.deepEqual(parsePerson('a@x.at'), { name: '', address: 'a@x.at' });
  assert.deepEqual(parsePerson('Anna Berger a@x.at'), { name: 'Anna Berger', address: 'a@x.at' });
  assert.equal(parsePerson('kein mail'), null);
  assert.ok(isEmail('a@b.co') && !isEmail('a@b') && !isEmail('a b@c.at'));
});

test('Eingefügte Liste: Zeilen, Semikolon, Tabulator, Name <adresse>, mehrere je Zeile', () => {
  const text = 'Anna Berger;anna@x.at\nMax Huber\tmax@y.at\nPaul Weber <paul@z.at>, Helga <helga@z.at>\nnur@adresse.at\nkaputt ohne adresse\n';
  assert.deepEqual(parseList(text).map((p) => [p.name, p.address]), [['Anna Berger', 'anna@x.at'], ['Max Huber', 'max@y.at'], ['Paul Weber', 'paul@z.at'], ['Helga', 'helga@z.at'], ['', 'nur@adresse.at']]);
});

test('Merken: eigene Adresse fehlt, der bessere Name gewinnt, Zähler und Quellen', () => {
  const { book } = make();
  book.remember([{ name: '', address: 'anna@x.at' }, { name: 'Barni', address: 'barni@firma.at' }]);
  book.remember([{ name: 'Anna Berger', address: 'ANNA@x.at' }], 'sent');
  const [a] = book.search('anna');
  assert.deepEqual([a.name, a.address, a.sources.sort(), a.count, a.sentCount], ['Anna Berger', 'anna@x.at', ['mail', 'sent'], 2, 1]);
  assert.equal(book.has('barni@firma.at'), false);
});

test('rememberOnce zählt je Schlüssel nur einmal', () => {
  const { book } = make();
  assert.equal(book.rememberOnce('M1', [{ name: 'A', address: 'a@x.at' }]), 1);
  assert.equal(book.rememberOnce('M1', [{ name: 'A', address: 'a@x.at' }]), 0);
  assert.equal(book.search('a')[0].count, 1);
});

test('Vorschläge: jedes Wort muss passen, Präfix vor Teilstück, Gesendetes und Neueres zuerst, Systemadressen hinten', () => {
  const { book, tick } = make();
  book.remember([{ name: 'Anna Berger', address: 'anna.berger@kunde.at' }, { name: 'Hanna Bauer', address: 'hanna@firma2.at' }, { name: '', address: 'noreply@kunde.at' }]);
  tick(86400_000);
  book.touch(['anna.berger@kunde.at']);
  assert.deepEqual(book.search('ann').map((p) => p.address), ['anna.berger@kunde.at', 'hanna@firma2.at']);
  assert.deepEqual(book.search('berger kunde').map((p) => p.address), ['anna.berger@kunde.at']);
  assert.deepEqual(book.search('zzz'), []);
  assert.equal(book.search('', { limit: 5 }).at(-1).address, 'noreply@kunde.at', 'ohne Eingabe: Systemadressen zuletzt');
  assert.deepEqual(book.search('ann', { exclude: ['ANNA.berger@kunde.at'] }).map((p) => p.address), ['hanna@firma2.at']);
});

test('Manuell hinzufügen, ändern, löschen; Liste und Zahlen', () => {
  const { book } = make();
  assert.throws(() => book.add({ name: 'X', address: 'kaputt' }), /Ungültige Adresse/);
  assert.throws(() => book.add({ name: 'Ich', address: 'barni@firma.at' }), /eigene Adresse/);
  book.remember([{ name: 'a', address: 'a@x.at' }]);
  book.add({ name: 'Anna Berger', address: 'a@x.at', company: 'Kunde GmbH' });
  book.add({ name: 'Zora Zeller', address: 'z@y.at' });
  assert.deepEqual(book.list().items.map((p) => p.name), ['Anna Berger', 'Zora Zeller'], 'der manuelle Name ersetzt den gelernten, alphabetisch');
  assert.equal(book.edit('a@x.at', { note: 'Kundin' }).note, 'Kundin');
  assert.deepEqual(book.stats(), { total: 2, mail: 1, sent: 0, outlook: 0, manuell: 2 });
  assert.equal(book.list({ q: 'kunde' }).total, 1);
  assert.equal(book.list({ source: 'mail' }).total, 1);
  assert.equal(book.remove('z@y.at'), true);
  assert.equal(book.remove('z@y.at'), false);
});

test('Importe: eingefügte Liste und Outlook-Kontakte (mehrere Adressen je Kontakt)', () => {
  const { book } = make();
  assert.deepEqual(book.importText('Anna;a@x.at\nMax;m@y.at\nMax Huber;m@y.at\nkaputt'), { added: 2, updated: 1, skipped: 0 });
  assert.equal(book.list().items.find((p) => p.address === 'm@y.at').name, 'Max Huber');
  const r = book.importOutlook([{ name: 'Paul Weber', company: 'Partner GmbH', addresses: [{ name: '', address: 'paul@z.at' }, { name: '', address: 'p.weber@z.at' }] }]);
  assert.deepEqual(r, { added: 2, updated: 0, total: 1 });
  assert.equal(book.search('paul')[0].company, 'Partner GmbH');
});

test('Speichern in die Datei und wieder laden', () => {
  const { book, file } = make();
  book.rememberOnce('M1', [{ name: 'Anna', address: 'a@x.at' }]);
  book.flush();
  const again = createAddressBook({ file, ownAddresses: [], log: () => {} });
  assert.equal(again.search('anna')[0].address, 'a@x.at');
  assert.equal(again.rememberOnce('M1', [{ name: 'Anna', address: 'a@x.at' }]), 0, 'schon gesehene Mails zählen nicht noch einmal');
});
