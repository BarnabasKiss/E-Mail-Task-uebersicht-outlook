import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionOf, titleFor, faviconSvg, svgUrl, freshImportant, whyImportant } from '../public/js/attention.js';

const now = new Date(2026, 9, 23, 10, 0);
const today = new Date(2026, 9, 23, 7, 0).toISOString();
const mail = (id, o = {}) => ({ id, dringlichkeit: 'woche', received_at: today, frist: '', archiviert: false, snoozed_until: null, wichtig: [], absender: 'A', betreff: 'B', ...o });

test('offen zählt nur den Tab "Offen"; wichtig = Jetzt, Überfällig oder Tag "Wichtig"', () => {
  const items = [
    mail(1), // offen
    mail(2, { dringlichkeit: 'jetzt' }), // wichtig
    mail(3, { dringlichkeit: 'heute', received_at: new Date(2026, 9, 21).toISOString() }), // überfällig
    mail(4, { wichtig: ['Frist heute'] }), // Tag
    mail(5, { dringlichkeit: 'egal', wichtig: ['x'] }), // zählt nicht
    mail(6, { snoozed_until: '2026-10-30T08:00:00Z', dringlichkeit: 'jetzt' }), // später
    mail(7, { archiviert: true, dringlichkeit: 'jetzt' }), // Done
  ];
  const a = attentionOf(items, now);
  assert.equal(a.open, 4);
  assert.equal(a.important, 3);
  assert.deepEqual(a.importantItems.map((m) => m.id), [2, 3, 4]);
});

test('Titel: wichtig vor offen, leer ohne Zähler', () => {
  assert.equal(titleFor({ open: 0, important: 0 }), 'Mail-Übersicht');
  assert.equal(titleFor({ open: 4, important: 0 }), '(4) Mail-Übersicht');
  assert.equal(titleFor({ open: 4, important: 2 }), '(2 wichtig) Mail-Übersicht');
});

test('Tab-Symbol: ohne Zähler nur der Brief, blau für offen, orange-rot für wichtig, ab 10 "9+"', () => {
  assert.ok(!faviconSvg({ level: null }).includes('<circle'));
  const open = faviconSvg({ level: 'open', count: 4 });
  assert.ok(open.includes('#2563eb') && open.includes('>4<'));
  const imp = faviconSvg({ level: 'important', count: 12, big: true });
  assert.ok(imp.includes('#f2480b') && imp.includes('>9+<') && imp.includes('r="12.5"'));
  assert.ok(svgUrl(open).startsWith('data:image/svg+xml,%3Csvg'));
});

test('Benachrichtigung nur für neu wichtige Mails, erster Start meldet nichts', () => {
  const imp = [mail(1), mail(2)];
  assert.deepEqual(freshImportant(null, imp).fresh, []);
  assert.deepEqual(freshImportant(null, imp).ids, ['1', '2']);
  assert.deepEqual(freshImportant(['1'], imp).fresh.map((m) => m.id), [2]);
  assert.deepEqual(freshImportant(['1', '2'], imp).fresh, []);
});

test('Grund: Tag-Gründe vor Jetzt vor Überfällig', () => {
  assert.equal(whyImportant(mail(1, { wichtig: ['Eskalation („eskalation“)', 'Frist heute'] }), now), 'Eskalation („eskalation“), Frist heute');
  assert.equal(whyImportant(mail(2, { dringlichkeit: 'jetzt' }), now), 'Jetzt');
  assert.equal(whyImportant(mail(3, { dringlichkeit: 'heute', received_at: new Date(2026, 9, 20).toISOString() }), now), 'Überfällig');
});
