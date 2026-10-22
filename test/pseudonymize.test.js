import test from 'node:test';
import assert from 'node:assert/strict';
import { pseudonymizeTexts, restore } from '../lib/pseudonymize.js';

const meta = {
  from: { name: 'Anna Berger', address: 'anna.berger@beispiel-versicherung.at' },
  to: [{ name: 'Barni Kiss', address: 'barnabas.kiss@faircheck.at' }],
  cc: [],
};
const subject = 'Dringend: Rückruf zu Schaden Nr. 2026-778 bis Freitag';
const body = `Sehr geehrter Herr Kiss,
der Geschädigte Herr Max Muster (geb. 01.02.1980, KFZ G 123 AB, wohnhaft Hauptstraße 12, 8010 Graz) hat sich heute gemeldet. Die Schadennummer lautet: AB-2026/778. Er ist unter +43 664 1234567 erreichbar. Frau Huber vom Kundenservice weiß Bescheid. Bitte um Rückruf bis Freitag, 23.10.2026, mail an max.muster@beispiel.at oder https://x.at/a?id=5. IBAN: AT61 1904 3002 3457 3201.
Mit freundlichen Grüßen
Anna Berger`;

const opts = { ownNames: ['barni', 'barnabas', 'kiss'] };

test('maskiert personenbezogene Daten', () => {
  const { texts } = pseudonymizeTexts(meta, [subject, body], opts);
  const all = texts.join('\n');
  for (const leak of ['Muster', 'Max', 'Huber', 'Berger', 'AB-2026', '2026-778', '664', '1904', 'G 123', 'Hauptstraße', '01.02.1980', 'max.muster', 'x.at/a']) {
    assert.ok(!all.includes(leak), `Leck: ${leak}`);
  }
});

test('lässt Frist, eigenen Namen und Domain stehen', () => {
  const { texts } = pseudonymizeTexts(meta, [subject, body], opts);
  const all = texts.join('\n');
  assert.ok(all.includes('23.10.2026'));
  assert.ok(all.includes('Herr Kiss'));
  assert.ok(all.includes('@beispiel.at'));
});

test('gleiche Person bekommt in allen Texten denselben Platzhalter', () => {
  const { texts, map } = pseudonymizeTexts(meta, ['Rückruf an Herr Max Muster', 'Herr Muster ist erreichbar'], opts);
  const ph = Object.keys(map).find((k) => map[k] === 'Max Muster');
  assert.ok(ph, 'Platzhalter für Max Muster');
  assert.ok(texts[0].includes(ph) && texts[1].includes(ph), 'Vor- und Nachname führen zum selben Platzhalter');
  assert.ok(!texts.join('').includes('Muster') && !texts.join('').includes('Max'));
});

test('Signatur: Zeile unter dem Namen (Funktion, Firma) wird nicht mit maskiert', () => {
  const sig = 'Bitte rufen Sie zurück.\nMit freundlichen Grüßen\nAnna Berger\nTeamleiterin Schaden\nBeispiel Versicherung';
  const { texts, map } = pseudonymizeTexts(meta, [sig, 'Anna Berger'], opts);
  assert.ok(texts[0].includes('Teamleiterin Schaden'), texts[0]);
  assert.ok(texts[0].includes('Beispiel Versicherung'));
  assert.equal(texts[1], '[PERSON_1]');
  assert.equal(map['[PERSON_1]'], 'Anna Berger');
});

test('BEKANNTE GRENZE: Name ohne Herr/Frau, Anrede, Signatur oder Absender bleibt unmaskiert', () => {
  const { texts } = pseudonymizeTexts(meta, ['Bitte ruf Max Muster zurück.'], opts);
  assert.ok(texts[0].includes('Max Muster'), 'Falls dieser Test fehlschlägt: Erkennung wurde verbessert, Test und Doku anpassen');
});

test('Rückübersetzung stellt die Originaldaten wieder her', () => {
  const { texts, map } = pseudonymizeTexts(meta, [subject, body], opts);
  assert.equal(restore(texts[1], map).includes('+43 664 1234567'), true);
  assert.equal(restore(texts[0], map), subject.replace('Schaden Nr. 2026-778', 'Schaden Nr. 2026-778'));
  assert.equal(restore('Rufe [TEL_1] an. [UNBEKANNT_9] bleibt.', { '[TEL_1]': '123' }), 'Rufe 123 an. [UNBEKANNT_9] bleibt.');
});
