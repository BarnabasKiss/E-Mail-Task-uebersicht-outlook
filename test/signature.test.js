import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSignature, commonSignature } from '../lib/signature.js';

const SIG = 'Barni Kiss\nProjektmanager KI, Prozesse und IT\nFaircheck Schadenservice GmbH\nMusterstraße 1, 1010 Wien\nTel.: +43 1 234 56 78\nwww.faircheck.at';

test('Grußformel mit Kontaktblock: Text und Grußformel bleiben, die Signatur wird abgetrennt', () => {
  const r = splitSignature(`Hallo Helga,\n\nich schaue es mir an.\n\nMit freundlichen Grüßen\n${SIG}`);
  assert.equal(r.body, 'Hallo Helga,\n\nich schaue es mir an.\n\nMit freundlichen Grüßen');
  assert.equal(r.signature, SIG);
});

test('Nur ein Name nach der Grußformel ist keine Signatur', () => {
  const t = 'Hallo Helga,\n\nja, passt.\n\nLG\nBarni';
  assert.deepEqual(splitSignature(t), { body: t, signature: '' });
});

test('Trennzeile "-- "', () => {
  const r = splitSignature('Kurz und knapp.\n\n-- \nBarni Kiss\nirgendwas');
  assert.equal(r.body, 'Kurz und knapp.');
  assert.equal(r.signature, 'Barni Kiss\nirgendwas');
});

test('Kontaktblock ohne Grußformel nach einer Leerzeile; Haftungsausschluss', () => {
  const r = splitSignature(`Danke für die Info, ich melde mich.\n\nBarni Kiss\nTel.: +43 1 234 56 78\nbarni@faircheck.at`);
  assert.equal(r.body, 'Danke für die Info, ich melde mich.');
  assert.match(r.signature, /^Barni Kiss/);
});

test('"Gesendet von meinem iPhone" am Ende', () => {
  const r = splitSignature('Passt, danke.\n\nGesendet von meinem iPhone');
  assert.deepEqual(r, { body: 'Passt, danke.', signature: 'Gesendet von meinem iPhone' });
});

test('Im Zweifel bleibt alles stehen: Fließtext, Kontaktdaten mitten im Text, nach der Grußformel noch Inhalt', () => {
  const plain = 'Hallo,\n\nruf mich unter Tel.: +43 1 234 56 78 an, dann klären wir alles.\n\nDanke';
  assert.equal(splitSignature(plain).signature, '');
  const more = 'LG\nBarni\nTel.: +43 664 1234567\n\nP.S. Bitte bring unbedingt die komplette Unterlage mit, weil wir sonst am Donnerstag nicht weiterkommen und die Frist sicher verpassen werden, das wäre ärgerlich.';
  assert.equal(splitSignature(more).signature, '');
  assert.equal(splitSignature('Nur eine Zeile').signature, '');
});

test('gemeinsame Signatur mehrerer Nachrichten desselben Absenders (ohne Grußformel)', () => {
  const a = `Erste Nachricht.\n\nBeste Grüße\n${SIG}`;
  const b = `Zweite, ganz andere Nachricht.\n\nBeste Grüße\n${SIG}`;
  const known = commonSignature([a, b]);
  assert.equal(known[0], 'barni kiss');
  assert.equal(known.length, 6);
  const r = splitSignature('Dritte Nachricht ohne Kontaktzeilen im Text.\n\nViele Grüße\nBarni Kiss\nProjektmanager KI, Prozesse und IT\nFaircheck Schadenservice GmbH\nMusterstraße 1, 1010 Wien\nTel.: +43 1 234 56 78\nwww.faircheck.at', { known });
  assert.equal(r.signature, SIG);
  assert.ok(r.body.endsWith('Viele Grüße'));
  assert.deepEqual(commonSignature([a]), [], 'ein Text allein ergibt nichts');
  assert.deepEqual(commonSignature(['A\nB\nC', 'X\nY\nC']), [], 'zu kurz gemeinsam');
});

test('Gemeinsames Ende und Grußformel: der frühere Schnitt gewinnt, Name und Funktion gehören zur Signatur', () => {
  const sig = 'Max Huber\nSenior Developer\nHauptstraße 1, 3365 Ort, Austria\nTel.: +43 7472 12345\nwww.firma.at';
  const known = commonSignature([`A\n\nLG\n${sig}`, `B\n\nLG\n${sig}`]);
  const r = splitSignature(`Dritte Nachricht.\n\nLG.\n${sig}`, { known });
  assert.equal(r.body, 'Dritte Nachricht.\n\nLG.');
  assert.equal(r.signature, sig);
});

test('Bildmarken (Logo) machen eine Zeile nicht "zu lang"', () => {
  const logo = `⟦bild:${'A'.repeat(120)}⟧`;
  const r = splitSignature(`Passt so, danke.\n\nMax Huber | Senior Developer | ${logo}\nHauptstraße 1, 3365 Ort, Austria\nTel.: +43 7472 12345`);
  assert.equal(r.body, 'Passt so, danke.');
  assert.match(r.signature, /^Max Huber/);
});
