// HTTP-Schnittstelle (lib/api.js): echter Handler auf einem freien Port, n8n und Outlook sind Attrappen.
// Sichert Routen, Sicherheitsprüfungen (Host, Header) und die Auslieferung von Anhängen ab.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from '../lib/api.js';
import { createStore } from '../lib/store.js';
import { createScheduler } from '../lib/scheduler.js';
import { createAttachments } from '../lib/attachments.js';
import { createDrafts } from '../lib/drafts.js';
import { createContacts } from '../lib/contacts.js';
import { createAddressBook } from '../lib/address-book.js';
import { createOutbox } from '../lib/outbox.js';
import { createTextTools } from '../lib/text-tools.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const addr = (name, address) => ({ emailAddress: { name, address } });
const OWN = 'barni@firma.at';

const MAILS = {
  M1: {
    subject: 'Rechnung prüfen',
    from: addr('Helga Brunner', 'helga@partner.at'),
    toRecipients: [addr('Barni', OWN)],
    ccRecipients: [addr('Paul Weber', 'paul@partner.at')],
    receivedDateTime: '2026-10-23T07:00:00Z',
    body: { contentType: 'html', content: '<p>Hallo Barni,</p><p>siehe Bild:</p><img src="cid:shot.png"><p>Lg Helga</p>' },
  },
};
const FILES = {
  'doc.pdf': { contentType: 'application/pdf', data: Buffer.from('%PDF-1.4 test') },
  'page.html': { contentType: 'text/html', data: Buffer.from('<script>alert(1)</script>') },
  'notiz.txt': { contentType: 'text/plain', data: Buffer.from('Notiztext') },
  'shot.png': { contentType: 'image/png', data: Buffer.alloc(5000, 1) },
};
const row = (id, o = {}) => ({ id, mail_id: `M${id}`, conversation_id: `C${id}`, betreff: `B${id}`, absender: 'Helga Brunner', absender_mail: 'helga@partner.at', received_at: '2026-10-23T07:00:00Z', dringlichkeit: 'woche', kategorie: 'Kunde', zusammenfassung: `Z${id}`, antwort_noetig: false, status: 'neu', vorschau: `Vorschau ${id}`, web_link: 'https://outlook/x', ...o });

async function start({ rows = { neu: [row(1), row(2, { dringlichkeit: 'jetzt' })], done: [row(3, { status: 'done' })] }, getMailFails = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'));
  const calls = [];
  const n8n = {
    listProposals: async (status) => (rows[status] || []).map((r) => ({ ...r })),
    setStatus: async (id, s) => calls.push(['setStatus', id, s]),
    deleteRow: async (id) => calls.push(['deleteRow', id]),
    hasReply: async () => ({ hasReply: false }),
    getMail: async (id) => {
      if (getMailFails) throw new Error('Outlook weg');
      return MAILS[id];
    },
    listAttachments: async () => [
      ...Object.entries(FILES).map(([name, f]) => ({ id: name, name, contentType: f.contentType, size: f.data.length, isInline: name === 'shot.png' })),
    ],
    getAttachment: async (_m, id) => ({ name: id, contentType: FILES[id].contentType, contentBase64: FILES[id].data.toString('base64') }),
  };
  const store = createStore(path.join(dir, 'state.json'));
  const scheduler = createScheduler({ n8n, drafts: {}, learner: {}, store, poll: { proposalsSec: 1, repliesSec: 1, draftsSec: 1, learnSec: 1 }, log: () => {} });
  await scheduler.refresh();
  const attachments = createAttachments({ n8n, tmpDir: dir });
  const drafts = createDrafts({ n8n, claude: {}, rules: { read: () => '' }, store, ownNames: ['barni'], ownAddress: OWN, pseudonymize: true, attachments });
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const cfg = { root, port, ownAddress: OWN, ownNames: ['barni'], pseudonymize: true, attachments: { readByAi: true } };
  const docIndex = {
    search: (q) => (q === 'gesamtbetrag' ? { M1: [{ kind: 'doc', name: 'doc.pdf', snippet: '…Gesamtbetrag…' }] } : {}),
    coverage: () => ({ indexed: 1, total: 3 }),
    recipients: (id) => (id === 'M1' ? { an: ['Barni barni@firma.at'], cc: [] } : null),
  };
  const roles = { get: (id) => (id === 'M1' ? 'direkt' : null), remember: () => 'direkt' };
  const attInfo = { get: (id) => (id === 'M1' ? ['doc.pdf'] : null), remember: () => {} };
  const ruleCalls = [];
  let urgency = { ignorieren: [], jetzt: [], heute: [] };
  const rules = { urgencyRules: () => urgency, setUrgencyRule: (...a) => ruleCalls.push(a), file: path.join(dir, 'Regeln.md'), read: () => '' };
  const contacts = createContacts({ store });
  const addressBook = createAddressBook({ file: path.join(dir, 'book.json'), ownAddresses: [OWN], log: () => {} });
  const outbox = createOutbox({ n8n, store, scheduler, drafts, addressBook, log: () => {} });
  const textTools = createTextTools({ claude: { run: async (p) => p.split('TEXT:\n')[1] ?? 'Betreff', runJson: async () => ({ gaps: [{ punkt: 'Frist', hinweis: 'fehlt' }] }) }, ownNames: ['barni'], ownAddress: OWN, pseudonymize: false });
  const vault = { headings: () => ['Kunden', 'Intern'], addTask: () => ({}) };
  server.on('request', createApi({ cfg, scheduler, n8n, vault, rules, store, drafts, matcher: {}, claude: { busy: false }, attachments, review: null, roles, attInfo, docIndex, contacts, addressBook, outbox, textTools }));
  const get = (p, init) => fetch(`http://127.0.0.1:${port}${p}`, init);
  return { outbox, addressBook, get, calls, ruleCalls, setUrgency: (u) => (urgency = u), contacts, port, store, close: () => server.close() };
}

test('Liste: nach Dringlichkeit sortiert, mit Rolle, Anhängen und Done-Liste', async () => {
  const s = await start();
  try {
    const j = await (await s.get('/api/proposals')).json();
    assert.deepEqual(j.items.map((i) => i.id), [2, 1]); // Jetzt vor Diese Woche
    assert.equal(j.archive.length, 1);
    assert.equal(j.ownAddress, OWN);
    const m1 = j.items.find((i) => i.id === 1);
    assert.equal(m1.rolle, 'direkt');
    assert.deepEqual(m1.anhaenge, ['doc.pdf']);
    assert.deepEqual(m1.empfaenger, { an: ['Barni barni@firma.at'], cc: [] });
    assert.equal(m1.archiviert, false);
    assert.equal(j.archive[0].archiviert, true);
  } finally {
    s.close();
  }
});

test('Detail: Mailtext, Empfänger, Bild-Marken, anonymisierte Ansicht und Überschriften', async () => {
  const s = await start();
  try {
    const d = await (await s.get('/api/proposals/1')).json();
    assert.equal(d.mailError, null);
    assert.equal(d.mail.source, 'outlook');
    assert.equal(d.mail.from.address, 'helga@partner.at');
    assert.equal(d.mail.cc[0].name, 'Paul Weber');
    assert.match(d.mail.text, /siehe Bild/);
    assert.match(d.mail.imageText, /⟦bild:shot\.png⟧/); // cid-Bild ist dem Anhang zugeordnet
    assert.ok(d.mail.masked.text.includes('[PERSON_'), 'Name maskiert');
    assert.ok(!d.mail.masked.text.includes('Helga'));
    assert.deepEqual(d.headings, ['Kunden', 'Intern']);
    assert.equal((await s.get('/api/proposals/999')).status, 404);
  } finally {
    s.close();
  }
});

test('Detail: Fällt Outlook aus, zeigt die Vorschau mit Fehlerhinweis', async () => {
  const s = await start({ getMailFails: true });
  try {
    const d = await (await s.get('/api/proposals/1')).json();
    assert.equal(d.mail.source, 'vorschau');
    assert.equal(d.mail.text, 'Vorschau 1');
    assert.ok(d.mailError);
  } finally {
    s.close();
  }
});

test('Anhänge: Liste ohne eingebettete Bilder, PDF und Bild inline, HTML nie als HTML, Text als Vorschau', async () => {
  const s = await start();
  try {
    const list = await (await s.get('/api/proposals/1/attachments')).json();
    assert.deepEqual(list.items.map((a) => a.id).sort(), ['doc.pdf', 'notiz.txt', 'page.html']);
    assert.equal(list.readByAi, true);

    const pdf = await s.get('/api/proposals/1/attachments/doc.pdf');
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.match(pdf.headers.get('content-disposition'), /^inline/);
    assert.equal(pdf.headers.get('x-content-type-options'), 'nosniff');

    const img = await s.get('/api/proposals/1/attachments/shot.png'); // eingebettetes Bild ist abrufbar
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.match(img.headers.get('content-security-policy'), /sandbox/);

    // HTML wird nie als HTML ausgeliefert: ohne download als Nur-Text-Vorschau, mit download als Datei mit CSP
    const html = await s.get('/api/proposals/1/attachments/page.html');
    assert.match(html.headers.get('content-type'), /^text\/plain/);
    assert.equal(html.headers.get('x-content-type-options'), 'nosniff');
    const htmlDl = await s.get('/api/proposals/1/attachments/page.html?download=1');
    assert.equal(htmlDl.headers.get('content-type'), 'application/octet-stream');
    assert.match(htmlDl.headers.get('content-disposition'), /^attachment/);
    assert.match(htmlDl.headers.get('content-security-policy'), /sandbox/);

    const txt = await s.get('/api/proposals/1/attachments/notiz.txt');
    assert.equal(await txt.text(), 'Notiztext');
    const dl = await s.get('/api/proposals/1/attachments/notiz.txt?download=1');
    assert.equal(dl.headers.get('content-type'), 'application/octet-stream');
  } finally {
    s.close();
  }
});

test('Anonymisierte Vorschau (ai-view): Text je Bild/Anhang, Prüfergebnis, Zuordnung der Bild-Marken', async () => {
  const s = await start();
  try {
    const v = await (await s.get('/api/proposals/1/ai-view')).json();
    assert.deepEqual(v.imageIds, ['shot.png']);
    assert.match(v.text, /⟦bild:1⟧/);
    assert.ok(Array.isArray(v.problems));
    assert.ok(v.items.some((i) => i.name === 'notiz.txt' && i.original === 'Notiztext'));
    assert.ok(v.map && Object.keys(v.map).length > 0);
  } finally {
    s.close();
  }
});

test('Suche und Status', async () => {
  const s = await start();
  try {
    const r = await (await s.get('/api/search?q=gesamtbetrag')).json();
    assert.deepEqual(Object.keys(r.hits), ['M1']);
    assert.deepEqual([r.indexed, r.total], [1, 3]);
    assert.deepEqual((await (await s.get('/api/search?q=nichts')).json()).hits, {});
    const st = await (await s.get('/api/status')).json();
    assert.equal(st.claudeBusy, false);
    assert.ok(st.fetchedAt);
  } finally {
    s.close();
  }
});

test('Schreibende Aufrufe brauchen den Header; unbekannte Aktion und Route', async () => {
  const s = await start();
  try {
    assert.equal((await s.get('/api/actions/archive', { method: 'POST', body: '{"id":1}' })).status, 403);
    const ok = await s.get('/api/actions/archive', { method: 'POST', headers: { 'x-mail-app': '1', 'content-type': 'application/json' }, body: JSON.stringify({ id: 1 }) });
    assert.equal(ok.status, 200);
    assert.deepEqual(s.calls, [['setStatus', 1, 'done']]);
    assert.equal((await s.get('/api/actions/gibtesnicht', { method: 'POST', headers: { 'x-mail-app': '1' }, body: '{}' })).status, 404);
    assert.equal((await s.get('/api/gibtesnicht')).status, 404);
    const after = await (await s.get('/api/proposals')).json();
    assert.deepEqual(after.items.map((i) => i.id), [2]); // Mail 1 liegt jetzt in Done
    assert.ok(after.archive.some((i) => i.id === 1));
  } finally {
    s.close();
  }
});

test('Nur über localhost erreichbar: fremder Host wird abgelehnt', async () => {
  const s = await start();
  try {
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: s.port, path: '/api/proposals', headers: { host: 'boese.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403);
  } finally {
    s.close();
  }
});

test('Statische Dateien: Startseite wird geliefert, Pfade außerhalb von public/ nicht', async () => {
  const s = await start();
  try {
    const index = await s.get('/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.match(await index.text(), /Mail-Übersicht/);
    assert.equal((await s.get('/js/main.js')).status, 200);
    assert.equal((await s.get('/..%2fpackage.json')).status, 404);
    assert.equal((await s.get('/%2e%2e/config.example.json')).status, 404);
    assert.equal((await s.get('/gibtesnicht.js')).status, 404);
  } finally {
    s.close();
  }
});

test('Absender-Profil: Zahlen aus den Mails, Regeln und Gedächtnis; Änderungen über die Aktion contact', async () => {
  const s = await start();
  try {
    const post = (name, body) => s.get(`/api/actions/${name}`, { method: 'POST', headers: { 'x-mail-app': '1', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    s.setUrgency({ ignorieren: [], jetzt: ['helga@partner.at'], heute: [] });
    s.contacts.learnStyle('helga@partner.at', { form: 'sie', gruss: 'Beste Grüße' }, 'Helga Brunner');
    const profile = await (await s.get('/api/contacts/Helga%40Partner.at')).json();
    assert.equal(profile.address, 'helga@partner.at');
    assert.equal(profile.name, 'Helga Brunner');
    assert.equal(profile.stats.total, 3, 'zwei offene und eine in Done');
    assert.equal(profile.stats.open, 2);
    assert.equal(profile.recent.length, 3);
    assert.equal(profile.recent[0].zusammenfassung.startsWith('Z'), true, 'mit denselben Angaben wie die Liste');
    assert.ok(['anhaenge', 'wichtig', 'rolle', 'aufgabe_uebernommen'].every((k) => k in profile.recent[0]));
    assert.equal(profile.domain.key, '@partner.at');
    assert.deepEqual(profile.rules, [{ kind: 'jetzt', pattern: 'helga@partner.at' }]);
    assert.equal(profile.memory.person.fields.form.value, 'sie');
    assert.equal((await s.get('/api/contacts/kaputt')).status, 500);

    assert.equal((await post('contact', { op: 'field', key: 'helga@partner.at', field: 'form', value: 'du' })).status, 200);
    assert.equal(s.contacts.effective('helga@partner.at').form.source, 'manuell');
    assert.equal((await post('contact', { op: 'note-add', key: '@partner.at', text: 'Immer Aktenzeichen nennen.' })).status, 200);
    assert.equal(s.contacts.effective('x@partner.at').notes[0].text, 'Immer Aktenzeichen nennen.');
    assert.equal((await post('contact', { op: 'rule', key: '@partner.at', kind: 'heute', on: true })).status, 200);
    assert.deepEqual(s.ruleCalls, [['heute', '@partner.at', true]]);
    assert.equal((await post('contact', { op: 'zaubern', key: 'x@y.at' })).status, 500);
  } finally {
    s.close();
  }
});

test('Verlauf und Antwortvorschläge: Schnittstelle liefert den Verlauf, die Detailansicht die Empfänger für Antworten', async () => {
  const s = await start();
  try {
    const thread = await (await s.get('/api/proposals/1/thread?limit=5')).json();
    assert.equal(thread.degraded, true, 'ohne n8n-Verlauf bleibt die geöffnete Mail');
    assert.equal(thread.messages[0].current, true);
    const detail = await (await s.get('/api/proposals/1')).json();
    assert.deepEqual(detail.reply.only, { to: ['helga@partner.at'], cc: [] });
    assert.deepEqual(detail.reply.all, { to: ['helga@partner.at'], cc: ['paul@partner.at'] });
    assert.equal(detail.reply.draft, null);
  } finally {
    s.close();
  }
});

test('Adressbuch: Vorschläge und Liste über die Schnittstelle, Anlegen über die Aktion book', async () => {
  const s = await start();
  try {
    const post = (body) => s.get('/api/actions/book', { method: 'POST', headers: { 'x-mail-app': '1', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ op: 'add', name: 'Anna Berger', address: 'anna@kunde.at', company: 'Kunde GmbH' })).status, 200);
    s.addressBook.remember([{ name: 'Anton Huber', address: 'anton@x.at' }]);
    const sug = await (await s.get('/api/address-book/suggest?q=an&exclude=anton@x.at')).json();
    assert.deepEqual(sug.items.map((p) => p.address), ['anna@kunde.at']);
    const list = await (await s.get('/api/address-book?limit=1')).json();
    assert.deepEqual([list.total, list.items.length, list.stats.total, list.stats.manuell], [2, 1, 2, 1]);
    assert.equal((await post({ op: 'add', address: 'kaputt' })).status, 500);
    assert.equal((await post({ op: 'remove', address: 'anna@kunde.at' })).status, 200);
  } finally {
    s.close();
  }
});

test('Neue Mail: compose-info liefert die gemerkte Signatur', async () => {
  const s = await start();
  try {
    assert.deepEqual(await (await s.get('/api/compose-info')).json(), { signature: '', manual: null, detected: '', ownAddress: OWN });
    s.store.set('settings', 'signature', 'Barni Kiss\nTel.: +43 1');
    assert.equal((await (await s.get('/api/compose-info')).json()).signature, 'Barni Kiss\nTel.: +43 1');
  } finally {
    s.close();
  }
});

test('Ausgang: Entwürfe und Geplantes über Aktionen, Liste, Zähler im Status, Antwort-Änderungen in der Detailansicht', async () => {
  const s = await start();
  try {
    const post = (name, body) => s.get(`/api/actions/${name}`, { method: 'POST', headers: { 'x-mail-app': '1', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const saved = await (await post('mail-draft-save', { subject: 'Angebot', text: 'Hallo', to: ['max@y.at'] })).json();
    assert.ok(saved.id);
    const at = new Date(Date.now() + 3600_000).toISOString();
    const sched = await (await post('schedule', { kind: 'new', payload: { subject: 'Später', text: 'Hallo', to: ['a@x.at'] }, sendAt: at })).json();
    assert.ok(sched.id);
    assert.equal((await post('schedule', { kind: 'new', payload: { subject: 'Zu früh', text: 'x', to: ['a@x.at'] }, sendAt: new Date().toISOString() })).status, 500);
    const list = await (await s.get('/api/outbox')).json();
    assert.deepEqual([list.drafts.length, list.scheduled.length, list.counts], [1, 1, { drafts: 1, scheduled: 1, failed: 0 }]);
    assert.deepEqual((await (await s.get('/api/status')).json()).outbox, { drafts: 1, scheduled: 1, failed: 0 });
    assert.equal((await post('reply-edit', { id: 1, text: 'Von Hand geändert' })).status, 200);
    s.store.set('drafts', 'M1', { text: 'Erzeugt', createdAt: 'x' });
    const detail = await (await s.get('/api/proposals/1')).json();
    assert.deepEqual([detail.draft.text, detail.draft.edited], ['Erzeugt', 'Von Hand geändert']);
    assert.equal((await post('schedule-cancel', { id: sched.id })).status, 200);
    assert.equal((await post('mail-draft-delete', { id: saved.id })).status, 200);
    assert.deepEqual((await (await s.get('/api/outbox')).json()).counts, { drafts: 0, scheduled: 0, failed: 0 });
  } finally {
    s.close();
  }
});

test('Textwerkzeuge über die Aktionen: Verbessern, Lücken, Betreff', async () => {
  const s = await start();
  try {
    const post = (name, body) => s.get(`/api/actions/${name}`, { method: 'POST', headers: { 'x-mail-app': '1', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await (await post('text-improve', { mode: 'spelling', text: 'Hallo Max' })).json()).text, 'Hallo Max');
    assert.deepEqual((await (await post('text-improve', { mode: 'gaps', text: 'Hallo' })).json()).gaps, [{ punkt: 'Frist', hinweis: 'fehlt' }]);
    assert.ok((await (await post('text-subject', { text: 'Bitte das Angebot prüfen.' })).json()).subject);
    assert.equal((await post('text-improve', { mode: 'zaubern', text: 'x' })).status, 500);
  } finally {
    s.close();
  }
});
