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
    store: { get() {}, set() {}, del() {} },
    ownNames: ['Barni'],
    ownAddress: 'barni@example.at',
    pseudonymize: true,
    attachments: { readAll: async () => [{ name: 'Bild im Text 1', text: 'Gesamtbetrag EUR 4.824,00\nKunde: Marcus Ritter' }] },
  });
  await drafts.generate({ mail_id: 'TEST-BILD-9', betreff: 'Rechnung', absender: 'Helga Brunner', absender_mail: 'h@x.at', vorschau: 'Hallo, stimmt der Betrag?' });
  assert.match(prompt, /Gesamtbetrag EUR 4\.824,00/);
  assert.ok(!prompt.includes('Marcus Ritter'));
});

test('Entwurf: Gedächtnis geht in den Prompt (maskiert), Anrede und Gruß setzt die App ein', async () => {
  let prompt = '';
  const contacts = {
    promptBlock: () => '- Ansprache: Du (duzen)\n- Schreibt gern an Helga Brunner.',
    applyToDraft: (address, name, text) => text.replace('Guten Tag', `Hallo (${address}, ${name})`),
  };
  const drafts = createDrafts({
    n8n: {},
    claude: { run: async (p) => ((prompt = p), 'Guten Tag [PERSON_1],\n\nja.') },
    rules: { read: () => '' },
    store: { get() {}, set() {}, del() {} },
    ownNames: ['Barni'],
    ownAddress: 'barni@example.at',
    pseudonymize: true,
    contacts,
  });
  const d = await drafts.generate({ mail_id: 'TEST-GED-1', betreff: 'Frage', absender: 'Helga Brunner', absender_mail: 'h@x.at', vorschau: 'Hallo, kurze Frage.' });
  assert.match(prompt, /Ansprache: Du \(duzen\)/);
  assert.ok(!prompt.includes('Helga Brunner'), 'Name in der Notiz maskiert');
  assert.match(d.text, /^Hallo \(h@x\.at, Helga Brunner\)/);
});

function variantSetup() {
  const saved = {};
  const prompts = [];
  const drafts = createDrafts({
    n8n: {},
    claude: { run: async (p) => (prompts.push(p), 'Neuer Text') },
    rules: { read: () => '' },
    store: { get: (s, k) => saved[`${s}/${k}`], set: (s, k, v) => (saved[`${s}/${k}`] = v), del() {} },
    ownNames: ['Barni'],
    ownAddress: 'barni@example.at',
    pseudonymize: true,
  });
  const p = { mail_id: 'TEST-VAR-1', betreff: 'Anfrage', absender: 'Helga Brunner', absender_mail: 'h@x.at', vorschau: 'Können Sie am Montag?' };
  return { drafts, prompts, saved, p };
}

test('Variante "kürzer" überarbeitet den Text im Entwurfsfeld (maskiert), der vorige bleibt als Vorversion', async () => {
  const { drafts, prompts, saved, p } = variantSetup();
  await drafts.generate(p);
  assert.equal(saved['drafts/TEST-VAR-1'].previous, null);
  const d = await drafts.generate(p, { variant: 'kuerzer', base: 'Guten Tag Helga Brunner,\n\nich habe am Montag leider keine Zeit, aber am Dienstag.' });
  const prompt = prompts[1];
  assert.match(prompt, /Kürze den bestehenden Entwurf/);
  assert.match(prompt, /Bestehender Entwurf/);
  assert.match(prompt, /keine Zeit, aber am Dienstag/);
  assert.ok(!prompt.includes('Helga Brunner'), 'Name im Entwurfstext maskiert');
  assert.equal(d.variant, 'kuerzer');
  assert.match(d.previous.text, /keine Zeit, aber am Dienstag/);
});

test('Variante "Ablehnung" schreibt neu aus der Mail; Hinweis geht maskiert mit und hat Vorrang', async () => {
  const { drafts, prompts, p } = variantSetup();
  await drafts.generate(p, { variant: 'ablehnung', hint: 'Sag, dass Helga Brunner nächste Woche zuständig ist.' });
  assert.match(prompts[0], /höfliche Ablehnung/);
  assert.match(prompts[0], /Erfinde keinen Grund/);
  assert.match(prompts[0], /Hinweis von Barni für diese Antwort \(hat Vorrang\): Sag, dass \[PERSON_1\]/);
  assert.ok(!prompts[0].includes('Bestehender Entwurf'));
});

test('Varianten: unbekannte Variante und Überarbeiten ohne Entwurf werden abgelehnt', async () => {
  const { drafts, p } = variantSetup();
  await assert.rejects(drafts.generate(p, { variant: 'lustiger' }), /Unbekannte Variante/);
  await assert.rejects(drafts.generate(p, { variant: 'freundlicher' }), /noch keinen Entwurf/);
});
