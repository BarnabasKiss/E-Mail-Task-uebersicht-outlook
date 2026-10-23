import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilters, matchesFilters, matchesText, filterCount, hasRealFilter, filterChips, clearChip, filtersToParams, filtersFromParams, formatOf } from '../public/js/search.js';

const mail = (o = {}) => ({
  absender: 'Paul Weber', absender_mail: 'paul.weber@beispiel-firma.at', betreff: 'Spezifikation DLZ', zusammenfassung: 'Rückfrage zu Spalten', aufgabe_text: '', kategorie: 'Intern', begruendung: '',
  received_at: new Date(2026, 9, 20, 9, 0).toISOString(), anhaenge: ['Rechnung.pdf', 'Liste.XLSX'], rolle: 'cc', wichtig: [], empfaenger: { an: ['Barni Kiss barni@faircheck.at'], cc: ['Helga Brunner helga@y.at'] }, ...o,
});
const f = (o = {}) => ({ ...defaultFilters(), ...o });

test('Von: Teile von Name oder Adresse, alle Wörter', () => {
  assert.ok(matchesFilters(mail(), f({ from: 'weber' })));
  assert.ok(matchesFilters(mail(), f({ from: 'paul @beispiel' })));
  assert.ok(!matchesFilters(mail(), f({ from: 'brunner' })));
});

test('Zeitraum: nach lokalem Tag, Grenzen zählen mit', () => {
  assert.ok(matchesFilters(mail(), f({ after: '2026-10-20', before: '2026-10-20' })));
  assert.ok(!matchesFilters(mail(), f({ after: '2026-10-21' })));
  assert.ok(!matchesFilters(mail(), f({ before: '2026-10-19' })));
  assert.ok(!matchesFilters(mail({ received_at: 'kaputt' }), f({ after: '2026-01-01' })));
});

test('Anhang und Format (Endung egal in Groß/Klein), unbekannte Anhänge zählen nicht', () => {
  assert.equal(formatOf('Liste.XLSX'), 'XLSX');
  assert.ok(matchesFilters(mail(), f({ anhang: true })));
  assert.ok(matchesFilters(mail(), f({ anhang: true, format: 'XLSX' })));
  assert.ok(!matchesFilters(mail(), f({ anhang: true, format: 'DOCX' })));
  assert.ok(!matchesFilters(mail({ anhaenge: [] }), f({ anhang: true })));
  assert.ok(!matchesFilters(mail({ anhaenge: null }), f({ anhang: true })));
});

test('Aufgabe, Wichtig und Eingang', () => {
  assert.ok(!matchesFilters(mail(), f({ aufgabe: true })));
  assert.ok(matchesFilters(mail({ aufgabe_uebernommen: { text: 'x' } }), f({ aufgabe: true })));
  assert.ok(matchesFilters(mail({ wichtig: ['Frist heute'] }), f({ wichtig: true })));
  assert.ok(!matchesFilters(mail(), f({ wichtig: true })));
  assert.ok(matchesFilters(mail(), f({ rollen: ['cc', 'shared'] })));
  assert.ok(!matchesFilters(mail(), f({ rollen: ['direkt'] })));
  assert.ok(!matchesFilters(mail({ rolle: null }), f({ rollen: ['direkt'] })));
});

test('Text: alle Wörter, nur in eingeschalteten Bereichen; Dokumenttreffer zählt', () => {
  const s = defaultFilters().scope;
  assert.ok(matchesText(mail(), 'weber spezifikation', s));
  assert.ok(!matchesText(mail(), 'weber gibtesnicht', s));
  assert.ok(matchesText(mail(), 'rückfrage', s));
  assert.ok(!matchesText(mail(), 'rückfrage', { ...s, bewertung: false }));
  assert.ok(!matchesText(mail(), 'weber', { ...s, meta: false }));
  assert.ok(matchesText(mail(), 'gesamtbetrag', s, true));
  assert.ok(matchesText(mail(), '  ', s));
});

test('Zähler, Chips und Zurücksetzen einzelner Chips', () => {
  const x = f({ from: 'weber', anhang: true, format: 'PDF', rollen: ['direkt'], scope: { meta: true, text: true, bewertung: false, content: true, names: true } });
  assert.equal(filterCount(x), 4); // Von, Format, Eingang, Bereiche
  assert.ok(hasRealFilter(x));
  assert.ok(!hasRealFilter(f({ scope: { meta: true, text: true, bewertung: false, content: true, names: true } })));
  assert.deepEqual(filterChips(x).map((c) => c.key), ['scope', 'from', 'format', 'rollen']);
  const y = clearChip(clearChip(x, 'format'), 'scope');
  assert.equal(y.format, '');
  assert.equal(y.anhang, false);
  assert.ok(y.scope.bewertung);
  assert.equal(filterCount(y), 2);
});

test('URL-Zustand: Hin und zurück, ungültige Werte werden verworfen', () => {
  const x = f({ from: 'weber', after: '2026-10-01', before: '2026-10-23', format: 'PDF', anhang: true, aufgabe: true, rollen: ['direkt', 'shared'], scope: { meta: true, text: true, bewertung: false, content: true, names: false } });
  const p = new URLSearchParams();
  filtersToParams(x, p);
  assert.deepEqual(filtersFromParams(new URLSearchParams(p.toString())), x);
  assert.deepEqual(filtersFromParams(new URLSearchParams('')), defaultFilters());
  const bad = filtersFromParams(new URLSearchParams('f_ab=morgen&f_ein=direkt,irgendwas'));
  assert.equal(bad.after, '');
  assert.deepEqual(bad.rollen, ['direkt']);
});

test('An/CC: nach Name oder Adresse, An und CC getrennt wählbar, ungelesene Mails zählen nicht', () => {
  assert.ok(matchesFilters(mail(), f({ to: 'brunner' })));
  assert.ok(matchesFilters(mail(), f({ to: 'barni @faircheck' })));
  assert.ok(matchesFilters(mail(), f({ to: 'brunner', toMode: 'cc' })));
  assert.ok(!matchesFilters(mail(), f({ to: 'brunner', toMode: 'an' })));
  assert.ok(!matchesFilters(mail(), f({ to: 'barni', toMode: 'cc' })));
  assert.ok(!matchesFilters(mail({ empfaenger: null }), f({ to: 'barni' })));
  const x = f({ to: 'brunner', toMode: 'cc' });
  assert.equal(filterCount(x), 1);
  assert.deepEqual(filterChips(x), [{ key: 'to', label: 'CC: brunner' }]);
  assert.deepEqual(clearChip(x, 'to').toMode, 'beide');
  const p = new URLSearchParams();
  filtersToParams(x, p);
  assert.deepEqual(filtersFromParams(new URLSearchParams(p.toString())), x);
});
