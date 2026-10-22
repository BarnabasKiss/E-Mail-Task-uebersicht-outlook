import test from 'node:test';
import assert from 'node:assert/strict';
import { surnameAfterTitle } from '../lib/drafts.js';

const map = { '[PERSON_1]': 'Anna Berger', '[PERSON_2]': 'Huber', '[TEL_1]': '+43 664 1234567' };

test('Anrede: Herr/Frau + voller Name wird zu Herr/Frau + Nachname', () => {
  assert.equal(surnameAfterTitle('Guten Tag Frau Anna Berger,\nich rufe Anna Berger an.', map), 'Guten Tag Frau Berger,\nich rufe Anna Berger an.');
});

test('Einzelnamen und andere Platzhalter bleiben unverändert', () => {
  assert.equal(surnameAfterTitle('Sehr geehrter Herr Huber, Tel. +43 664 1234567', map), 'Sehr geehrter Herr Huber, Tel. +43 664 1234567');
});
