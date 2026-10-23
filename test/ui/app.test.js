// Die ganze Oberfläche (public/js/main.js) im simulierten Browser, der Server ist eine Attrappe (fetch).
// Sichert das Zusammenspiel ab: Liste, Auswahl, Suche und Filter, Aktionen, Tastatur, Tab-Titel, URL-Zustand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, importApp, tick, SKIP } from './dom.js';

const w = await setupDom();
const opts = { skip: !w && SKIP };
const $ = (id) => document.getElementById(id);

const mk = (id, o = {}) => ({
  id, mail_id: `M${id}`, is_test: false, betreff: `Betreff ${id}`, absender: `Absender ${id}`, absender_mail: `a${id}@x.at`, received_at: new Date().toISOString(),
  dringlichkeit: 'woche', dringlichkeit_original: 'woche', durch_regel: false, kategorie: 'Kunde', zusammenfassung: `Zusammenfassung ${id}`, begruendung: '', antwort_noetig: false,
  aufgabe_text: '', aufgabe_thema: '', frist: '', web_link: `https://outlook/${id}`, anhang_bewertung: null, rolle: null, empfaenger: null, wichtig: [], anhaenge: null,
  aufgabe_uebernommen: null, hat_entwurf: false, entwurf_fehler: null, snoozed_until: null, status: 'neu', archiviert: false, abgelegt_am: null, ...o,
});
const db = { items: [mk(1, { dringlichkeit: 'jetzt', rolle: 'direkt' }), mk(2, { absender: 'Helga Brunner', absender_mail: 'helga@y.at' }), mk(3, { anhaenge: ['Rechnung.pdf'] })], archive: [mk(9, { status: 'done', archiviert: true })] };
const requests = [];

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url, 'http://localhost:4711');
  const method = init.method || 'GET';
  requests.push({ method, path: u.pathname + u.search, header: init.headers?.['x-mail-app'] });
  const p = u.pathname;
  const all = [...db.items, ...db.archive];
  const byId = (id) => all.find((m) => String(m.id) === String(id));
  if (p === '/api/proposals') return json({ items: db.items, archive: db.archive, hidden: 0, ownAddress: 'barni@firma.at' });
  if (p === '/api/status') return json({ fetchedAt: new Date().toISOString(), error: null, claudeBusy: false, rulesFile: '/x/Mail-Regeln.md' });
  if (p === '/api/search') return json({ hits: u.searchParams.get('q') === 'rechnung' ? { M3: [{ kind: 'doc', name: 'Rechnung.pdf', snippet: '…Rechnung 4711…' }] } : {}, indexed: 1, total: 4 });
  let m = /^\/api\/proposals\/(\d+)\/attachments$/.exec(p);
  if (m) return json({ items: [], readByAi: true, canPreview: false });
  if (/^\/api\/proposals\/\d+\/ai-view$/.test(p)) return json({ items: [], imageIds: [], text: null, problems: [] });
  m = /^\/api\/proposals\/(\d+)\/match$/.exec(p);
  if (m) return json({ heading: null, quiet: true, reason: '' });
  m = /^\/api\/proposals\/(\d+)$/.exec(p);
  if (m) {
    const it = byId(m[1]);
    return json({ proposal: it, mail: { source: 'outlook', subject: it.betreff, from: { name: it.absender, address: it.absender_mail }, to: [], cc: [], receivedDateTime: it.received_at, text: `Text von ${it.betreff}` }, mailError: null, draft: null, headings: [] });
  }
  m = /^\/api\/actions\/(\w[\w-]*)$/.exec(p);
  if (m && method === 'POST') {
    const { id } = JSON.parse(init.body);
    if (m[1] === 'archive') {
      const it = db.items.find((x) => x.id === id);
      db.items = db.items.filter((x) => x.id !== id);
      db.archive.unshift({ ...it, status: 'done', archiviert: true });
    }
    return json({ ok: true });
  }
  return json({ error: `Unbekannt: ${p}` }, 404);
};

// Die Seite startet Intervalle (Nachladen, Status): im Test dürfen sie den Prozess nicht festhalten.
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (...a) => {
  const t = realSetInterval(...a);
  t.unref?.();
  return t;
};

if (w) {
  await importApp('main.js'); // Start: lädt die Liste, öffnet die erste Mail
  await tick(60);
}

const rows = () => [...document.querySelectorAll('#list .mail-row')];
const rowTitles = () => rows().map((r) => r.querySelector('.row-subject').textContent);
const heads = () => [...document.querySelectorAll('#list .group-head')].map((g) => g.textContent.replace(/\d+$/, ''));
const type = async (text) => {
  $('search').value = text;
  $('search').dispatchEvent(new w.Event('input'));
  await tick(300); // Dokumentsuche wartet kurz (Entprellen)
};
const key = (k, extra = {}) => document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));

test('Start: Liste gruppiert, erste Mail geöffnet, Tab-Titel zählt wichtige Mails, Zähler an den Reitern', opts, () => {
  assert.deepEqual(heads(), ['Jetzt', 'Diese Woche']);
  assert.deepEqual(rowTitles(), ['Betreff 1', 'Betreff 2', 'Betreff 3']);
  assert.equal(document.querySelector('#detail h2').textContent, 'Betreff 1');
  assert.equal(document.title, '(1 wichtig) Mail-Übersicht');
  assert.deepEqual([...$('tabs').querySelectorAll('.chip')].map((c) => c.textContent), ['Offen3', 'Egal0', 'Später0', 'Done1']);
  assert.match(location.hash, /mail=1/);
  assert.equal(document.querySelector('.mail-row[aria-selected="true"] .row-subject').textContent, 'Betreff 1');
});

test('Auswahl: Klick öffnet die Mail, Tasten j/k wechseln, die Adresszeile merkt die Mail', opts, async () => {
  rows()[1].click();
  await tick(30);
  assert.equal(document.querySelector('#detail h2').textContent, 'Betreff 2');
  assert.match(location.hash, /mail=2/);
  key('j');
  await tick(30);
  assert.equal(document.querySelector('#detail h2').textContent, 'Betreff 3');
  key('k');
  await tick(30);
  assert.equal(document.querySelector('#detail h2').textContent, 'Betreff 2');
});

test('Suche: Text filtert die Liste, Dokumenttreffer erscheinen mit Fundstelle, Leeren stellt die Gruppen wieder her', opts, async () => {
  await type('helga');
  assert.deepEqual(rowTitles(), ['Betreff 2']);
  assert.match(document.querySelector('#list .group-head').textContent, /1 Treffer in allen Mails/);
  await type('rechnung');
  assert.deepEqual(rowTitles(), ['Betreff 3']);
  assert.ok(document.querySelector('#list .row-doc').textContent.includes('Rechnung 4711'));
  assert.match(location.hash, /q=rechnung/);
  $('search-clear').click();
  await tick(30);
  assert.deepEqual(heads(), ['Jetzt', 'Diese Woche']);
  assert.ok(!location.hash.includes('q='));
});

test('Filter: Anhang-Filter ohne Suchtext, auch über Done hinweg, Chip entfernt ihn wieder', opts, async () => {
  $('filter-toggle').click();
  const boxes = [...$('filter-panel').querySelectorAll('input[type=checkbox]')];
  boxes[5].click(); // Mit Anhang
  await tick(30);
  assert.deepEqual(rowTitles(), ['Betreff 3']);
  assert.match(location.hash, /f_anh=1/);
  assert.equal($('filter-toggle').querySelector('.filter-count').textContent, '1');
  $('filter-chips').querySelector('.filter-chip').click();
  await tick(30);
  assert.deepEqual(heads(), ['Jetzt', 'Diese Woche']);
  $('filter-toggle').click();
});

test('Aktion: Done legt die Mail ab (POST mit Header), die Liste lädt neu, die nächste Mail wird gewählt', opts, async () => {
  rows()[0].click(); // Betreff 1
  await tick(30);
  const done = [...document.querySelectorAll('.d-actions button')].find((b) => b.textContent.includes('Done'));
  done.click();
  await tick(80);
  const post = requests.find((r) => r.method === 'POST' && r.path === '/api/actions/archive');
  assert.ok(post && post.header === '1');
  assert.deepEqual(rowTitles(), ['Betreff 2', 'Betreff 3']);
  assert.equal(document.title, '(2) Mail-Übersicht', 'nichts Wichtiges mehr offen');
  assert.ok($('toast').textContent.includes('In Done abgelegt'));
  assert.equal(document.querySelector('#detail h2').textContent, 'Betreff 2');
});

test('Reiter Done zeigt die abgelegten Mails; Taste / springt ins Suchfeld', opts, async () => {
  [...$('tabs').querySelectorAll('.chip')].find((c) => c.textContent.startsWith('Done')).click();
  await tick(30);
  assert.deepEqual(rowTitles(), ['Betreff 1', 'Betreff 9']);
  key('/');
  assert.equal(document.activeElement, $('search'));
});
