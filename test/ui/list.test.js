import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, importApp, SKIP } from './dom.js';

const w = await setupDom();
const opts = { skip: !w && SKIP };

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const item = (id, o = {}) => ({
  id, mail_id: `M${id}`, betreff: `Betreff ${id}`, absender: `Absender ${id}`, absender_mail: `a${id}@x.at`, received_at: new Date().toISOString(),
  dringlichkeit: 'woche', zusammenfassung: `Zusammenfassung ${id}`, antwort_noetig: false, hat_entwurf: false, archiviert: false, snoozed_until: null,
  status: 'neu', wichtig: [], rolle: null, anhaenge: null, aufgabe_text: '', aufgabe_uebernommen: null, frist: '', ...o,
});
const render = async (items, o = {}) => {
  const { renderList } = await importApp('components/list.js');
  const box = document.createElement('div');
  renderList(box, { items, selectedId: null, query: '', tab: 'offen', actions: {}, ...o });
  return box;
};
const groups = (box) => [...box.querySelectorAll('.group-head')].map((g) => g.textContent.replace(/\d+$/, ''));

test('Liste: Gruppen Jetzt, Überfällig, Heute, Diese Woche mit Farbe und Symbol', opts, async () => {
  const box = await render([
    item(1, { dringlichkeit: 'jetzt' }),
    item(2, { dringlichkeit: 'heute', received_at: daysAgo(3) }), // überfällig
    item(3, { dringlichkeit: 'heute' }),
    item(4, { dringlichkeit: 'woche' }),
  ]);
  assert.deepEqual(groups(box), ['Jetzt', 'Überfällig', 'Heute', 'Diese Woche']);
  assert.ok(box.querySelector('.group-head.g-ueberfaellig svg'), 'Symbol');
  assert.equal(box.querySelectorAll('.mail-row').length, 4);
});

test('Zeile: Rolle neben dem Namen, Wichtig, Anhang mit Formaten, Aufgabe nur als Symbol, kein Entwurf-Tag', opts, async () => {
  const box = await render([
    item(1, { rolle: 'direkt', wichtig: ['Frist heute'], anhaenge: ['a.pdf', 'b.XLSX', 'c.docx', 'd.png'], aufgabe_text: 'Rückruf', antwort_noetig: true, hat_entwurf: true, frist: '2030-01-05' }),
  ]);
  const row = box.querySelector('.mail-row');
  assert.equal(row.querySelector('.row-who .role-direkt').textContent, 'Direkt');
  assert.equal(row.querySelector('.badge.wichtig').getAttribute('title'), 'Wichtig: Frist heute');
  const att = row.querySelector('.att-tag');
  assert.equal(att.textContent, 'PDF · XLSX +2');
  assert.equal(att.getAttribute('title'), 'a.pdf\nb.XLSX\nc.docx\nd.png');
  const icons = [...row.querySelectorAll('.tag-icon')];
  assert.equal(icons.length, 1);
  assert.equal(icons[0].getAttribute('title'), 'Aufgabe vorgeschlagen');
  assert.ok(!row.textContent.includes('Entwurf'));
  assert.ok(row.textContent.includes('Frist 05.01.'));
  assert.ok(!row.querySelector('.badge.u-woche'), 'Dringlichkeit steht nur in der Überschrift');
});

test('Zeile: übernommene Aufgabe zeigt ein Häkchen mit dem Text, Done-Mails ein Done-Badge', opts, async () => {
  const taken = await render([item(1, { aufgabe_text: 'x', aufgabe_uebernommen: { text: 'Rückruf Frau X', heading: 'Kunden' } })]);
  assert.equal(taken.querySelector('.tag-icon.ok').getAttribute('title'), 'Aufgabe übernommen: Rückruf Frau X');
  const done = await render([item(2, { archiviert: true, status: 'done' })], { tab: 'done' });
  assert.ok(done.querySelector('.badge').textContent.includes('Done · Erledigt'));
  assert.ok(!done.querySelector('.group-head'));
});

test('Suche: Kopfzeile mit Trefferzahl, Fundstellen in Dokument und Mailtext, Hinweis auf noch nicht gelesene Mails', opts, async () => {
  const hits = [{ kind: 'doc', name: 'Rechnung.pdf', snippet: '…Gesamtbetrag 4.824,00…' }, { kind: 'doc', name: 'Zweite.pdf', snippet: '' }, { kind: 'text', snippet: '…Betrag im Mailtext…' }];
  const box = await render([item(1, { doc_treffer: hits })], { query: 'betrag', searching: true, docCoverage: { indexed: 3, total: 10 } });
  assert.match(box.querySelector('.group-head').textContent, /1 Treffer in allen Mails · Dokumente und Mailtext: 3 von 10 Mails gelesen/);
  const lines = [...box.querySelectorAll('.row-doc')];
  assert.equal(lines.length, 2);
  assert.equal(lines[0].querySelector('.row-doc-name').textContent, 'Rechnung.pdf');
  assert.equal(lines[0].querySelector('.row-doc-more').textContent, '+1');
  assert.equal(lines[0].querySelector('mark.hit').textContent.toLowerCase(), 'betrag', 'Suchbegriff markiert');
  assert.ok(lines[1].textContent.includes('Betrag im Mailtext'));
});

test('Leerzustände: nichts offen, keine Treffer, Filter ohne Treffer', opts, async () => {
  assert.match((await render([])).textContent, /Alles erledigt/);
  assert.match((await render([], { query: 'xyz', searching: true })).textContent, /Nichts gefunden für „xyz“/);
  assert.match((await render([], { query: '', searching: true })).textContent, /Keine Mail passt zu den Filtern/);
});
