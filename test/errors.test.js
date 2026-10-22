import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError } from '../lib/errors.js';
import { isTestMail, mailFromPreview } from '../lib/test-mail.js';

test('Outlook-Fehler wird verständlich erklärt', () => {
  const msg = friendlyError('n8n getMail: HTTP 502 {"error":"outlook","message":"Outlook-Fehler"}');
  assert.match(msg, /Outlook hat die Mail nicht geliefert/);
  assert.ok(!msg.includes('502') && !msg.includes('{'));
});

test('weitere Fehlerarten und unbekannte Texte', () => {
  assert.match(friendlyError('fetch failed'), /n8n ist gerade nicht erreichbar/);
  assert.match(friendlyError('Claude: Zeitlimit nach 180s'), /zu lange/);
  assert.match(friendlyError('n8n list: HTTP 401 {"error":"unauthorized"}'), /Token/);
  assert.equal(friendlyError('etwas ganz anderes'), 'etwas ganz anderes');
});

test('Testmails werden an der mail_id erkannt', () => {
  assert.equal(isTestMail({ mail_id: 'TEST-MAIL-003' }), true);
  assert.equal(isTestMail({ mail_id: 'AAMkAD...' }), false);
  assert.equal(isTestMail({}), false);
});

test('Mail aus Vorschau enthält Absender und eigene Adresse als Empfänger', () => {
  const m = mailFromPreview({ betreff: 'B', absender: 'Anna', absender_mail: 'a@x.at', vorschau: 'Text', received_at: 'R', web_link: 'L' }, 'me@x.at');
  assert.equal(m.from.emailAddress.address, 'a@x.at');
  assert.equal(m.toRecipients[0].emailAddress.address, 'me@x.at');
  assert.equal(m.body.content, 'Text');
});
