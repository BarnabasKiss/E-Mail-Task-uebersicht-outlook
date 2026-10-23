import test from 'node:test';
import assert from 'node:assert/strict';
import { surnameAfterTitle, createDrafts } from '../lib/drafts.js';

const map = { '[PERSON_1]': 'Anna Berger', '[PERSON_2]': 'Huber', '[TEL_1]': '+43 664 1234567' };

test('Anrede: Herr/Frau + voller Name wird zu Herr/Frau + Nachname', () => {
  assert.equal(surnameAfterTitle('Guten Tag Frau Anna Berger,\nich rufe Anna Berger an.', map), 'Guten Tag Frau Berger,\nich rufe Anna Berger an.');
});

test('Einzelnamen und andere Platzhalter bleiben unverändert', () => {
  assert.equal(surnameAfterTitle('Sehr geehrter Herr Huber, Tel. +43 664 1234567', map), 'Sehr geehrter Herr Huber, Tel. +43 664 1234567');
});

test('Entwurf bekommt den (maskierten) Text aus Anhängen und Bildern, auch bei Testmails', async () => {
  let prompt = '';
  const drafts = createDrafts({
    n8n: {},
    claude: { run: async (p) => ((prompt = p), 'Antwort') },
    rules: { read: () => '' },
    store: { set() {}, del() {} },
    ownNames: ['Barni'],
    ownAddress: 'barni@example.at',
    pseudonymize: true,
    attachments: { readAll: async () => [{ name: 'Bild im Text 1', text: 'Gesamtbetrag EUR 4.824,00\nKunde: Marcus Ritter' }] },
  });
  await drafts.generate({ mail_id: 'TEST-BILD-9', betreff: 'Rechnung', absender: 'Helga Brunner', absender_mail: 'h@x.at', vorschau: 'Hallo, stimmt der Betrag?' });
  assert.match(prompt, /Gesamtbetrag EUR 4\.824,00/);
  assert.ok(!prompt.includes('Marcus Ritter'));
});
