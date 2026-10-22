import test from 'node:test';
import assert from 'node:assert/strict';
import { detectNames, maskTexts, findLeaks, AnonymizationError } from '../lib/mask-strict.js';

const own = ['barni', 'barnabas', 'kiss'];

test('Vornamenliste: Name ohne Anrede und Signatur wird erkannt, auch mit Nachnamen-Zusatz und "Nachname, Vorname"', () => {
  const names = detectNames('Bearbeitet durch Marcus Ritter und Anna Maria von Berger. Kontakt: Hofer, Agnes.');
  assert.ok(names.includes('Marcus Ritter'));
  assert.ok(names.includes('Anna Maria von Berger'));
  assert.ok(names.includes('Agnes Hofer'));
});

test('Beschriftung: "Versicherungsnehmer: Vorname Nachname" auch ohne Vornamenliste, "VN-Kontakt" nicht', () => {
  const names = detectNames('Versicherungsnehmer: Zlatko Pfeifenberger\nVN-Kontakt wurde hergestellt.');
  assert.deepEqual(names, ['Zlatko Pfeifenberger']);
});

test('Namen mit "ag"/"og" (Agnes, Olga) werden maskiert (früher hielt der Firmenfilter sie für "AG")', () => {
  const out = maskTexts({}, ['Rückruf an Agnes Hofer und Olga Meier.'], { ownNames: own });
  assert.equal(out.texts[0], 'Rückruf an [PERSON_1] und [PERSON_2].');
});

test('Zusätzliche Kennungen: UID, Konto, PLZ/Ort, Karte, IBAN bleibt IBAN', () => {
  const t = maskTexts({}, ['UID ATU12345678, Kontonummer: 123456789012, 1010 Wien, Karte 4111 1111 1111 1111, IBAN AT61 1904 3002 3457 3201'], { ownNames: own }).texts[0];
  assert.match(t, /UID \[UID_1\]/);
  assert.match(t, /Kontonummer: \[NR_1\]/);
  assert.match(t, /\[ORT_1\]/);
  assert.match(t, /Karte \[KARTE_1\]/);
  assert.match(t, /IBAN \[IBAN_1\]/);
  assert.doesNotMatch(t, /ATU1|4111|AT61|1010/);
});

test('Kennung aus einem Text wird auch in den anderen Texten ersetzt', () => {
  const out = maskTexts({}, ['Zl. 77123/26 bitte beachten', 'Im Anhang steht 77123/26 nochmals'], { ownNames: own });
  assert.equal(out.texts[1], 'Im Anhang steht [AKTE_1] nochmals');
});

test('Eigene Namen bleiben sichtbar, Absender aus den Metadaten wird maskiert', () => {
  const out = maskTexts({ from: { name: 'Harald Gölles' } }, ['Hallo Barni, Harald Gölles meldet sich.'], { ownNames: own });
  assert.equal(out.texts[0], 'Hallo Barni, [PERSON_1] meldet sich.');
});

test('Leak-Prüfung findet Reste und nennt nie den Klartext', () => {
  const problems = findLeaks(['Rückruf an Ritter, Mail an x@y.at'], { '[PERSON_1]': 'Marcus Ritter' }, { ownNames: own });
  assert.deepEqual(problems, ['[PERSON_1]: Name noch im Text', 'E-Mail-Adresse im Text übrig']);
  assert.ok(problems.every((p) => !p.includes('Marcus')));
});

test('Leak-Prüfung: Großschreibung zählt ("Eine" im Namen löst "eine" nicht aus)', () => {
  assert.deepEqual(findLeaks(['das ist eine Mail'], { '[PERSON_1]': 'Eine WEG' }), []);
});

test('maskTexts wirft AnonymizationError, wenn die Prüfung etwas findet', () => {
  assert.throws(() => maskTexts({}, ['harmlos'], { ownNames: own, findProblems: () => ['[PERSON_1]: Name noch im Text'] }), AnonymizationError);
  assert.doesNotThrow(() => maskTexts({}, ['harmlos'], { ownNames: own }));
});

test('Mit ownAddress bleibt nur die eigene Adresse sichtbar (nicht jede, die "kiss" enthält)', () => {
  const t = 'Von barnabas.kiss@faircheck.at an peter.kiss@x.hu';
  const out = maskTexts({}, [t], { ownNames: own, ownAddress: 'barnabas.kiss@faircheck.at' });
  assert.equal(out.texts[0], 'Von barnabas.kiss@faircheck.at an [MAIL_1]@x.hu');
});

test('GROSS geschriebene Nachnamen ("RITTER Marcus") werden mitmaskiert und geprüft', () => {
  const out = maskTexts({}, ['Gutachter Marcus Ritter, Unterschrift: RITTER'], { ownNames: own });
  assert.equal(out.texts[0], 'Gutachter [PERSON_1], Unterschrift: [PERSON_1]');
});

test('Adressen: "Krottendorfer Straße 9a", "Leopold-Ungar-Platz 2" und "Blons 93, 6723 Blons"', () => {
  const t = maskTexts({}, ['Krottendorfer Straße 9a, 8051 Graz\nz.H. Leopold-Ungar-Platz 2\nBesichtigungsort: Blons 93, 6723 Blons'], { ownNames: own }).texts[0];
  assert.doesNotMatch(t, /Krottendorfer|Ungar|Blons|9a|6723|8051/);
});

test('Domains werden maskiert, die eigene Domain bleibt', () => {
  const t = maskTexts({}, ['Scope: app.vex-portal.com und clients.vex-portal.com, Kontakt barnabas.kiss@faircheck.at, info@faircheck.at'], { ownNames: own, ownAddress: 'barnabas.kiss@faircheck.at' }).texts[0];
  assert.doesNotMatch(t, /vex-portal/);
  assert.match(t, /barnabas\.kiss@faircheck\.at/);
  assert.match(t, /@faircheck\.at/);
});

test('Normale Fließtexte bleiben lesbar (kein Überdecken von Wörtern, Zahlen und Abkürzungen)', () => {
  const s = 'Der Fall 12 hat Version 2 erreicht, d.h. Seite 4 stimmt. z.B. am 21.10.2026 (Mitte August) lief der Test mit 292 Fällen.';
  assert.equal(maskTexts({}, [s], { ownNames: own }).texts[0], s);
});

test('Grußzeile mit Rufnamen ("Lg Dani") wird erkannt und der Name überall maskiert', () => {
  const t = maskTexts({}, ['Dani meint, das passt.\nLg Dani'], { ownNames: own }).texts[0];
  assert.equal(t, '[PERSON_1] meint, das passt.\nLg [PERSON_1]');
});
