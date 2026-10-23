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
const contactNotes = [{ id: 'n1', text: 'Antwortet knapp.', source: 'gelernt', reviewed: false, scope: 'person' }];
let contactRules = [];
const outboxData = {
  drafts: [{ id: 'd-1', subject: 'Angebot Oktober', text: 'Hallo Max, anbei das Angebot.', to: ['max@y.at'], cc: [], bcc: [], updatedAt: '2026-10-22T08:00:00Z' }],
  scheduled: [
    { id: 's-1', kind: 'new', payload: { subject: 'Erinnerung', text: 'x', to: ['a@x.at'], cc: [], bcc: [] }, sendAt: '2026-10-30T08:00:00Z', status: 'geplant', attempts: 0, error: '' },
    { id: 's-2', kind: 'reply', betreff: 'Rechnung prüfen', payload: { id: 1, text: 'x', to: ['h@y.at'], cc: [], bcc: [], done: true }, sendAt: '2026-10-29T08:00:00Z', status: 'fehler', attempts: 3, error: 'Outlook-Fehler' },
  ],
};
let outboxCall = null;
let rulesList = ['Anrede kurz und österreichisch.', 'Keine Signatur schreiben.'];
let rulesCall = null;
const rulesDoc = () => ({ file: '/x/Mail-Regeln.md', version: 'v1', text: '# Regeln', title: 'Regeln', intro: ['Diese Datei steuert die App.'], sections: [{ heading: 'Grundton', level: 2, hints: ['Stil für Entwürfe.'], rules: rulesList.map((text, index) => ({ index, text })) }, { heading: 'Gelernt', level: 2, hints: [], rules: [] }] });
let book = [{ name: 'Helga Brunner', address: 'helga@y.at', company: '', sources: ['mail', 'sent'], count: 4, sentCount: 2, last: '2026-10-22T08:00:00Z' }];
let bookCall = null;
let learnStatus = { running: false, phase: 'idle', read: 0, usable: 0, people: 0, error: null, result: null };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url, 'http://localhost:4711');
  const method = init.method || 'GET';
  requests.push({ method, path: u.pathname + u.search, header: init.headers?.['x-mail-app'] });
  const p = u.pathname;
  const all = [...db.items, ...db.archive];
  const byId = (id) => all.find((m) => String(m.id) === String(id));
  if (p === '/api/proposals' || p === '/api/refresh') return json({ items: db.items, archive: db.archive, hidden: 0, ownAddress: 'barni@firma.at' });
  if (p === '/api/status') return json({ fetchedAt: new Date().toISOString(), error: null, claudeBusy: false, rulesFile: '/x/Mail-Regeln.md', outbox: { drafts: outboxData.drafts.length, scheduled: outboxData.scheduled.length, failed: outboxData.scheduled.filter((x) => x.status === 'fehler').length } });
  if (p === '/api/rules') return json(rulesDoc());
  if (p === '/api/actions/rules') {
    const b = JSON.parse(init.body);
    rulesCall = b;
    if (b.op === 'edit' && b.was !== rulesList[b.index]) return json({ error: 'Die Regel wurde inzwischen geändert.' }, 409);
    if (b.op === 'edit') rulesList[b.index] = b.text;
    if (b.op === 'add') rulesList.push(b.text);
    if (b.op === 'delete') rulesList.splice(b.index, 1);
    return json(rulesDoc());
  }
  if (p === '/api/outbox') return json(outboxData);
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
  if (p === '/api/history-learn') return json(learnStatus);
  if (p === '/api/compose-info') return json({ signature: 'Barni Kiss', ownAddress: 'barni@firma.at' });
  if (p === '/api/address-book') return json({ total: book.length, items: book.filter((b) => !u.searchParams.get('q') || b.name.toLowerCase().includes(u.searchParams.get('q'))), stats: { total: book.length, mail: 1, manuell: book.length - 1 } });
  m = /^\/api\/contacts\/(.+)$/.exec(p);
  if (m) {
    const address = decodeURIComponent(m[1]);
    const part = (key, extra = {}) => ({ key, name: '', fields: { form: { value: 'sie', source: 'gelernt', count: 2, total: 2 }, sprache: null, anrede: null, gruss: null }, notes: contactNotes, ...extra });
    return json({
      address, name: 'Helga Brunner', stats: { total: 3, open: 2, first: '2026-01-05T08:00:00Z', last: '2026-10-22T08:00:00Z', roles: { direkt: 2, cc: 1, shared: 0 }, tasksTaken: 1, tasksOpen: 1, replyAsked: 2, replied: 1 },
      recent: [mk(2, { zusammenfassung: 'Helga fragt nach dem Betrag.', kategorie: 'Kunde', anhaenge: ['Rechnung.pdf', 'Liste.xlsx'], frist: '2026-10-30', aufgabe_text: 'Betrag prüfen', rolle: 'direkt', wichtig: ['Frist'] })], domain: { key: '@y.at', mails: 3, persons: 1 }, rules: contactRules,
      memory: { person: part(address), domain: part('@y.at', { notes: [] }) },
    });
  }
  m = /^\/api\/actions\/(\w[\w-]*)$/.exec(p);
  if (m && method === 'POST') {
    const { id, ...rest } = JSON.parse(init.body);
    if (['mail-draft-save', 'mail-draft-delete', 'schedule-cancel', 'schedule-now'].includes(m[1])) {
      outboxCall = { name: m[1], ...rest, id };
      if (m[1] === 'mail-draft-delete') outboxData.drafts = outboxData.drafts.filter((d) => d.id !== id);
      if (m[1] === 'schedule-cancel') outboxData.scheduled = outboxData.scheduled.filter((x) => x.id !== id);
      return json(m[1] === 'mail-draft-save' ? { id: id || 'A1', updatedAt: new Date().toISOString() } : { ok: true });
    }
    if (m[1] === 'book') {
      bookCall = { id, ...rest };
      if (rest.op === 'add') book.push({ name: rest.name, address: rest.address, company: rest.company || '', sources: ['manuell'], count: 0, sentCount: 0, last: null });
      if (rest.op === 'remove') book = book.filter((b) => b.address !== rest.address);
      return json(rest.op === 'import-outlook' ? { added: 0, updated: 0, total: 0, empty: true } : { ok: true });
    }
    if (m[1] === 'bulk') {
      for (const bid of rest.ids) {
        const it = byId(bid);
        if (rest.action === 'archive') (db.items = db.items.filter((x) => x.id !== bid), db.archive.unshift({ ...it, status: 'done', archiviert: true }));
        if (rest.action === 'restore') (db.archive = db.archive.filter((x) => x.id !== bid), db.items.push({ ...it, status: 'neu', archiviert: false }));
        if (rest.action === 'snooze') it.snoozed_until = rest.until;
        if (rest.action === 'delete') (db.items = db.items.filter((x) => x.id !== bid), db.archive = db.archive.filter((x) => x.id !== bid));
      }
      return json({ done: rest.ids.length, failed: [], ignored: 0 });
    }
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
  assert.deepEqual([...$('tabs').querySelectorAll('.chip')].map((c) => c.textContent), ['Offen3', 'Später0', 'Done1']);
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

const marked = () => rows().filter((r) => r.classList.contains('is-marked')).map((r) => r.querySelector('.row-subject').textContent);
const bar = () => $('mark-bar');
const bulkPosts = () => requests.filter((r) => r.path === '/api/actions/bulk');
const lastBulkBody = () => bulkBody;
let bulkBody = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).endsWith('/api/actions/bulk')) bulkBody = JSON.parse(init.body);
  return realFetch(url, init);
};

const click = (node, extra = {}) => node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, ...extra }));
const barButton = (text) => [...bar().querySelectorAll('button')].find((b) => b.textContent.includes(text));

test('Sammelaktion: Strg + Klick markiert (ohne Kästchen), die Leiste hat einfache Buttons, "Zurückholen" holt alle zurück', opts, async () => {
  $('search').blur(); // der Test davor hat mit / ins Suchfeld gewechselt
  rows()[0].click(); // Betreff 1 in Done
  await tick(30);
  assert.ok(bar().hidden);
  click(rows()[0], { ctrlKey: true });
  click(rows()[1], { ctrlKey: true });
  await tick(30);
  assert.deepEqual(marked(), ['Betreff 1', 'Betreff 9']);
  assert.match(document.querySelector('#detail h2').textContent, /Betreff 1/, 'Strg + Klick wählt keine andere Mail');
  assert.match(bar().textContent, /2 markiert/);
  assert.ok(barButton('Zurückholen'));
  assert.ok(!barButton('Später'), 'Später gibt es für Done-Mails nicht');
  assert.ok(!bar().textContent.includes('ignorieren'), 'kein Absender ignorieren in der Sammelaktion');
  const delBtn = bar().querySelector('.icon-btn.danger');
  assert.ok(delBtn && delBtn.textContent.trim() === '' && /löschen/i.test(delBtn.title), 'Löschen ist nur ein Symbol');
  assert.ok(bar().querySelector('.spacer'));
  assert.equal(bar().querySelectorAll('kbd').length, 0, 'keine Tastenkürzel');
  assert.equal(document.querySelectorAll('#list input[type=checkbox]').length, 0, 'keine Kästchen');
  click(rows()[0], { ctrlKey: true }); // Markierung wieder aufheben
  assert.deepEqual(marked(), ['Betreff 9']);
  click(rows()[0], { ctrlKey: true });
  barButton('Zurückholen').click();
  await tick(80);
  assert.equal(lastBulkBody().action, 'restore');
  assert.deepEqual([...lastBulkBody().ids].sort(), [1, 9]);
  assert.ok(bar().hidden);
  assert.ok($('toast').textContent.includes('2 Mails zurückgeholt'));
});

test('Sammelaktion: Umschalt + Klick markiert einen Bereich, Später zeigt Zeitpunkte als Buttons', opts, async () => {
  [...$('tabs').querySelectorAll('.chip')].find((c) => c.textContent.startsWith('Offen')).click();
  await tick(30);
  assert.deepEqual(rowTitles(), ['Betreff 1', 'Betreff 2', 'Betreff 3', 'Betreff 9']);
  rows()[1].click(); // Betreff 2
  await tick(30);
  click(rows()[2], { shiftKey: true });
  assert.deepEqual(marked(), ['Betreff 2', 'Betreff 3']);
  barButton('Später').click();
  assert.match(bar().textContent, /In 1 Stunde/);
  assert.match(bar().textContent, /Nächste Woche/);
  assert.ok(!bar().textContent.includes('Mo 08:00'));
  assert.ok(!bar().textContent.includes('markiert'), 'in einer Zeile: nur die Zeitpunkte');
  bar().querySelector('.icon-btn').click(); // zurück zu den Aktionen, die Markierung bleibt
  assert.match(bar().textContent, /2 markiert/);
  assert.ok(!bar().textContent.includes('In 1 Stunde'));
  barButton('Später').click();
  barButton('In 1 Stunde').click();
  await tick(80);
  assert.equal(lastBulkBody().action, 'snooze');
  assert.deepEqual(lastBulkBody().ids, [2, 3]);
  assert.ok(Date.parse(lastBulkBody().until) > Date.now());
  assert.ok(bar().hidden);
});

test('Sammelaktion: Alle, Aufheben und Esc, Löschen fragt einmal mit Anzahl nach', opts, async () => {
  assert.equal(rowTitles().length, 2); // 2 und 3 sind zurückgestellt
  click(rows()[0], { ctrlKey: true });
  barButton('Alle').click();
  assert.equal(marked().length, 2);
  bar().querySelector('.icon-btn:not(.danger)').click();
  assert.equal(marked().length, 0);
  assert.ok(bar().hidden);
  click(rows()[0], { ctrlKey: true });
  key('Escape');
  assert.equal(marked().length, 0, 'Esc hebt die Markierung auf');
  click(rows()[0], { ctrlKey: true });
  barButton('Alle').click();
  let asked = '';
  globalThis.confirm = (t) => ((asked = t), true);
  bar().querySelector('.icon-btn.danger').click();
  await tick(80);
  assert.match(asked, /^2 Konversationen endgültig löschen/);
  assert.equal(lastBulkBody().action, 'delete');
  assert.equal(rows().length, 0);
});

test('Tasten x, a, s und Umschalt+j lösen keine Sammelaktion mehr aus', opts, async () => {
  db.items.push(mk(31), mk(32));
  $('refresh').click();
  await tick(80);
  rows()[0].click();
  await tick(30);
  const before = requests.length;
  for (const k of ['x', 'a', 's']) key(k);
  key('J', { shiftKey: true });
  assert.equal(marked().length, 0);
  assert.ok(bar().hidden);
  assert.equal(requests.slice(before).filter((r) => r.method === 'POST').length, 0);
});

test('Sammelaktionen gehen nur über den Sammelaufruf (bulk), je Klick genau einer', opts, () => {
  assert.equal(bulkPosts().length, 3, 'bisher nur die drei Sammelaufrufe');
});

const posted = (name) => requests.filter((r) => r.method === 'POST' && r.path === `/api/actions/${name}`).length;
let contactBody = null;
let lastLearnBody = null;
const fetchBefore = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).endsWith('/api/actions/contact')) contactBody = JSON.parse(init.body);
  if (String(url).endsWith('/api/actions/history-learn')) lastLearnBody = init.body;
  return fetchBefore(url, init);
};

test('Absender-Profil: Klick aufs Profilbild öffnet es, Zahlen und Gedächtnis stehen da, Änderungen gehen als Aktion contact raus, Zurück öffnet die Mail', opts, async () => {
  [...$('tabs').querySelectorAll('.chip')].find((c) => c.textContent.startsWith('Offen')).click();
  await tick(30);
  db.items.push(mk(21, { absender: 'Helga Brunner', absender_mail: 'helga@y.at' }));
  $('refresh').click();
  await tick(80);
  rows().find((r) => r.querySelector('.row-subject').textContent === 'Betreff 21').click();
  await tick(60);
  assert.equal(document.querySelectorAll('.avatar-btn').length, 1);
  document.querySelector('.avatar-btn').click();
  await tick(60);
  assert.match(location.hash, /kontakt=helga%40y\.at/);
  const profile = document.querySelector('#detail .profile');
  assert.ok(profile);
  assert.equal(profile.querySelector('h2').textContent, 'Helga Brunner');
  const visible = [...profile.children].filter((c) => !c.hidden && c.matches('section'));
  assert.equal(visible.length, 1, 'standardmäßig nur die letzten Mails');
  assert.ok(visible[0].querySelector('.p-mail'));
  const card = visible[0].querySelector('.p-mail').textContent;
  assert.match(card, /Betreff 2/);
  assert.match(card, /Helga fragt nach dem Betrag/);
  assert.match(card, /PDF · XLSX/);
  assert.match(card, /Aufgabe vorgeschlagen/);
  assert.match(card, /Frist 30\.10\./);
  assert.match(card, /Wichtig/);
  assert.deepEqual([...profile.querySelectorAll('.seg-btn')].map((b) => b.textContent), ['Letzte Mails', 'Überblick', 'Optionen']);
  const tabBtn = (name) => [...profile.querySelectorAll('.seg-btn')].find((b) => b.textContent === name);
  tabBtn('Überblick').click();
  assert.ok(!profile.querySelector('.stats').closest('section').hidden);
  assert.match(profile.querySelector('.stats').textContent, /3 \(2 offen\)/);
  tabBtn('Optionen').click();
  assert.ok(!profile.querySelector('.p-options').hidden);
  assert.match(profile.querySelector('.stats').textContent, /3 \(2 offen\)/);
  assert.match(profile.querySelector('.stats').textContent, /Direkt 2 · CC 1/);
  assert.match(profile.querySelector('.stats').textContent, /1 von 2/);
  assert.equal(profile.querySelectorAll('.memory').length, 2, 'Person und Firma');
  assert.match(profile.querySelector('.memory option').textContent, /Automatisch \(gelernt: Sie \(2 von 2\)\)/);
  assert.ok(profile.querySelector('.mem-note.unreviewed'), 'Neues ist als "prüfen" markiert');

  const select = profile.querySelector('.memory select');
  select.value = 'du';
  select.dispatchEvent(new w.Event('change'));
  await tick(60);
  assert.deepEqual(contactBody, { op: 'field', key: 'helga@y.at', field: 'form', value: 'du' });

  contactRules = [{ kind: 'jetzt', pattern: 'helga@y.at' }];
  const jetzt = [...document.querySelectorAll('.rule-row .btn')].find((b) => b.textContent.includes('Jetzt'));
  jetzt.click();
  await tick(80);
  assert.deepEqual(contactBody, { op: 'rule', key: 'helga@y.at', kind: 'jetzt', on: true });
  assert.equal([...document.querySelectorAll('.rule-row .btn')].find((b) => b.textContent.includes('Jetzt')).getAttribute('aria-pressed'), 'true');
  assert.ok(!document.querySelector('#detail .p-options').hidden, 'nach einer Änderung bleibt der Tab Optionen offen');

  [...document.querySelectorAll('#detail .d-actions .btn')].find((b) => b.textContent.includes('Zurück')).click();
  await tick(60);
  assert.equal(document.querySelector('#detail h2').textContent, 'Betreff 21');
  assert.ok(!location.hash.includes('kontakt'));
});

test('Lernen aus Gesendetem: Ansicht mit Start, Fortschritt und Ergebnis', opts, async () => {
  $('learn-link').click();
  await tick(60);
  assert.equal(document.querySelector('#detail .learn h2').textContent, 'Aus gesendeten Mails lernen');
  learnStatus = { running: true, phase: 'personen', read: 25, usable: 20, people: 3, error: null, result: null };
  const startBtn = [...document.querySelectorAll('#detail .learn .btn.primary')][0];
  document.querySelector('#detail .learn input[type=number]').value = '50';
  startBtn.click();
  await tick(60);
  assert.deepEqual(JSON.parse(lastLearnBody), { count: 50 });
  assert.match(document.querySelector('#detail .learn-progress').textContent, /Notizen je Person/);
  assert.match(document.querySelector('#detail .learn-progress').textContent, /25 Mails gelesen, 20 brauchbar, Person 3/);
  assert.ok(document.querySelector('#detail .learn .btn.primary').disabled, 'während des Laufs nicht nochmal startbar');
  learnStatus = { running: false, phase: 'fertig', read: 25, usable: 20, people: 3, error: null, result: { mails: 25, usable: 20, newMails: 20, people: 5, rulesAdded: 4, notesAdded: 6, skipped: 1 } };
  await tick(2100); // der Stand wird alle 2 Sekunden abgefragt
  assert.match(document.querySelector('#detail .learn-result').textContent, /4 neue allgemeine Regeln/);
  assert.match(document.querySelector('#detail .learn-result').textContent, /1 Mails wurden nicht an Claude gegeben/);
  [...document.querySelectorAll('#detail .d-actions .btn')].find((b) => b.textContent.includes('Zurück')).click();
  await tick(60);
  assert.ok(document.querySelector('#detail h2'));
  assert.ok(!document.querySelector('#detail .learn'));
});

test('Egal ist eine zuklappbare Gruppe unter Offen: zunächst zu, zählt nicht am Reiter, zugeklappte Mails bleiben für Tastatur und "Alle" außen vor', opts, async () => {
  $('search').blur();
  [...$('tabs').querySelectorAll('.chip')].find((c) => c.textContent.startsWith('Offen')).click();
  await tick(30);
  const before = rowTitles().length;
  const offenChip = () => [...$('tabs').querySelectorAll('.chip')].find((c) => c.textContent.startsWith('Offen')).textContent;
  const chipBefore = offenChip();
  db.items.push(mk(41, { dringlichkeit: 'egal', betreff: 'Newsletter A' }), mk(42, { dringlichkeit: 'egal', betreff: 'Newsletter B' }));
  $('refresh').click();
  await tick(80);
  const head = document.querySelector('#list .group-head.g-egal');
  assert.ok(head, 'Gruppe Egal ist da');
  assert.equal(head.textContent.replace(/\d+$/, '').trim(), 'Egal', 'ohne Zähler im Namen');
  assert.equal(head.querySelector('.group-count').textContent, '2');
  assert.equal(head.getAttribute('aria-expanded'), 'false');
  assert.equal(rowTitles().length, before, 'zugeklappt: keine Egal-Mails in der Liste');
  assert.equal(offenChip(), chipBefore, 'Zähler am Reiter ohne Egal');
  assert.ok(![...$('tabs').querySelectorAll('.chip')].some((c) => c.textContent.startsWith('Egal')), 'kein Reiter Egal mehr');

  click(rows()[0], { ctrlKey: true });
  barButton('Alle').click();
  assert.equal(marked().length, before, '"Alle" markiert nur Sichtbares');
  key('Escape');

  head.click();
  await tick(30);
  assert.equal(document.querySelector('#list .group-head.g-egal').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(rowTitles().slice(-2), ['Newsletter A', 'Newsletter B']);
  assert.equal(JSON.parse(localStorage.getItem('mail-app.collapsed')).includes('egal'), false, 'die Wahl wird gemerkt');

  document.querySelector('#list .group-head.g-egal').click();
  await tick(30);
  assert.equal(rowTitles().length, before);
  assert.deepEqual(JSON.parse(localStorage.getItem('mail-app.collapsed')), ['egal']);
});

test('Kontakte: Ansicht mit Adressbuch, Anlegen, Löschen und Outlook-Import (leer) mit verständlicher Meldung', opts, async () => {
  $('contacts-link').click();
  await tick(60);
  assert.equal(document.querySelector('#detail .contacts h2').textContent, 'Kontakte');
  assert.match(document.querySelector('#detail .contacts .d-badges').textContent, /1 im Adressbuch/);
  assert.equal(document.querySelectorAll('#detail .ct-row').length, 1);
  const [name, addr] = document.querySelectorAll('#detail .ct-add input');
  name.value = 'Paul Weber';
  addr.value = 'paul@z.at';
  document.querySelector('#detail .ct-add .btn').click();
  await tick(80);
  assert.deepEqual(bookCall, { id: undefined, op: 'add', name: 'Paul Weber', address: 'paul@z.at', company: '' });
  assert.equal(document.querySelectorAll('#detail .ct-row').length, 2);
  assert.match(document.querySelector('#detail .ct-note').textContent, /Kontakt hinzugefügt/);
  [...document.querySelectorAll('#detail .ct-tools .btn')][1].click();
  await tick(80);
  assert.equal(bookCall.op, 'import-outlook');
  assert.match(document.querySelector('#detail .ct-note').textContent, /keine Kontakte/);
  document.querySelectorAll('#detail .ct-row .icon-btn.danger')[1].click();
  await tick(80);
  assert.equal(bookCall.op, 'remove');
  assert.equal(document.querySelectorAll('#detail .ct-row').length, 1);
  [...document.querySelectorAll('#detail .d-actions .btn')].find((b) => b.textContent.includes('Zurück')).click();
  await tick(60);
  assert.ok(!document.querySelector('#detail .contacts'));
});

test('Neue Mail: Knopf in der Kopfzeile öffnet die Ansicht, der Entwurf wird beim Verlassen in der App gesichert (ohne Rückfrage)', opts, async () => {
  $('compose-link').click();
  await tick(60);
  assert.equal(document.querySelector('#detail .compose h2').textContent, 'Neue Mail');
  const subject = document.querySelector('#detail .cp-subject');
  subject.value = 'Angebot';
  subject.dispatchEvent(new w.Event('input'));
  let asked = 0;
  globalThis.confirm = () => (asked += 1, true);
  outboxCall = null;
  document.querySelector('#list .mail-row')?.click();
  await tick(120);
  assert.equal(asked, 0, 'keine Rückfrage: der Entwurf liegt in der App');
  assert.ok(!document.querySelector('#detail .compose'), 'verlassen');
  assert.equal(outboxCall?.name, 'mail-draft-save', 'der letzte Stand wurde gesichert');
  assert.equal(outboxCall.subject, 'Angebot');
});

test('Kopfzeile: Symbole an den Knöpfen und Zähler am Knopf "Entwürfe" (rot bei Fehlern)', opts, async () => {
  for (const id of ['compose-link', 'outbox-link', 'contacts-link', 'learn-link', 'rules-link', 'refresh']) assert.ok($(id).querySelector('svg.icon, svg'), `${id} hat ein Symbol`);
  await tick(5200); // die Statusabfrage läuft alle 5 Sekunden
  const badge = $('outbox-badge');
  assert.equal(badge.hidden, false);
  assert.equal(badge.textContent, '3');
  assert.ok(badge.classList.contains('bad'), 'ein geplanter Versand ist fehlgeschlagen');
});

test('Optionen: ein Menü mit Kontakte, Lernen und Regeln; die offene Ansicht markiert Menü und Eintrag', opts, async () => {
  assert.equal($('options-menu').hidden, true);
  $('options-link').click();
  assert.equal($('options-menu').hidden, false);
  assert.deepEqual([...$('options-menu').querySelectorAll('.menu-item')].map((b) => b.textContent.trim()), ['Kontakte', 'Lernen', 'Regeln']);
  $('rules-link').click();
  await tick(80);
  assert.equal($('options-menu').hidden, true, 'schließt nach der Wahl');
  assert.equal($('options-link').getAttribute('aria-current'), 'page');
  assert.equal($('rules-link').getAttribute('aria-current'), 'page');
  assert.equal(document.querySelector('#detail .rules h2').textContent, 'Regeln');
  assert.deepEqual([...document.querySelectorAll('#detail .rl-section h3')].map((h) => h.firstChild.textContent), ['Grundton', 'Gelernt']);
});

test('Regeln bearbeiten: ändern, hinzufügen, löschen; ein Konflikt lädt neu; ganze Datei als Text', opts, async () => {
  const area = () => document.querySelectorAll('#detail .rl-text');
  assert.equal(area().length, 2);
  area()[0].value = 'Anrede locker.';
  area()[0].dispatchEvent(new w.Event('change'));
  await tick(60);
  assert.deepEqual(rulesCall, { op: 'edit', section: 'Grundton', index: 0, was: 'Anrede kurz und österreichisch.', text: 'Anrede locker.' });
  assert.equal(area()[0].value, 'Anrede locker.');
  assert.match(document.querySelector('#detail .ct-note').textContent, /Regel geändert/);
  const input = document.querySelector('.rl-section[data-section="Gelernt"] .rl-new');
  input.value = 'Immer Du bei Kollegen.';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(60);
  assert.deepEqual(rulesCall, { op: 'add', section: 'Gelernt', text: 'Immer Du bei Kollegen.' });
  document.querySelectorAll('#detail .rl-row .icon-btn.danger')[0].click();
  await tick(60);
  assert.equal(rulesCall.op, 'delete');
  assert.equal(area().length, 2, 'eine gelöscht, eine hinzugefügt');
  // Konflikt: die Datei hat sich inzwischen geändert
  rulesList[0] = 'heimlich geändert';
  area()[0].value = 'Mein Text';
  area()[0].dispatchEvent(new w.Event('change'));
  await tick(80);
  assert.equal(area()[0].value, 'heimlich geändert', 'neu geladen statt überschrieben');
  [...document.querySelectorAll('#detail .d-actions .btn')].find((b) => b.textContent.includes('Ganzen Text')).click();
  await tick(60);
  assert.ok(document.querySelector('#detail .rl-all'));
  [...document.querySelectorAll('#detail .d-actions .btn')].find((b) => b.textContent.includes('Zurück')).click();
  await tick(60);
  assert.equal($('rules-link').getAttribute('aria-current'), null);
});

test('Entwürfe und Geplantes: Liste, Entwurf öffnen, löschen, Planung abbrechen, sofort senden', opts, async () => {
  globalThis.confirm = () => true;
  $('outbox-link').click();
  await tick(80);
  assert.equal(document.querySelector('#detail .outbox h2').textContent, 'Entwürfe und Geplantes');
  const current = () => ['compose-link', 'outbox-link', 'contacts-link', 'learn-link', 'rules-link', 'options-link'].filter((id) => $(id).getAttribute('aria-current') === 'page');
  assert.deepEqual(current(), ['outbox-link'], 'die offene Ansicht ist in der Kopfzeile markiert');
  const rows = [...document.querySelectorAll('#detail .ob-row')];
  assert.equal(rows.length, 3);
  assert.match(rows[0].textContent, /Erinnerung|Rechnung prüfen/);
  assert.ok(document.querySelector('#detail .ob-row.failed'), 'Fehler hervorgehoben');
  assert.match(document.querySelector('#detail .ob-error').textContent, /Outlook-Fehler/);
  [...document.querySelectorAll('#detail .ob-actions')][0].querySelector('.btn').click();
  await tick(80);
  assert.equal(outboxCall.name, 'schedule-now');
  document.querySelector('#detail .ob-actions .icon-btn.danger').click();
  await tick(80);
  assert.equal(outboxCall.name, 'schedule-cancel');
  assert.match(document.querySelector('#detail .ob-note').textContent, /Planung abgebrochen/);
  [...document.querySelectorAll('#detail .ob-row')].pop().querySelector('.icon-btn.danger').click();
  await tick(80);
  assert.equal(outboxCall.name, 'mail-draft-delete');
  assert.equal(document.querySelectorAll('#detail .ob-row').length, 1);
  [...document.querySelectorAll('#detail .d-actions .btn')].find((b) => b.textContent.includes('Zurück')).click();
  await tick(60);
  assert.deepEqual(current(), [], 'nach Zurück ist nichts markiert');
  assert.ok(!document.querySelector('#detail .outbox'));
});
