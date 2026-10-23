import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, importApp, resetBody, tick, SKIP } from './dom.js';

const w = await setupDom();
const opts = { skip: !w && SKIP };

const proposal = (o = {}) => ({
  id: 7, mail_id: 'M7', is_test: false, betreff: 'Rechnung prüfen', absender: 'Helga Brunner', absender_mail: 'helga@partner.at', received_at: '2026-10-23T07:00:00Z',
  dringlichkeit: 'heute', dringlichkeit_original: 'heute', durch_regel: false, kategorie: 'Kunde', zusammenfassung: 'Helga fragt nach dem Betrag.', begruendung: 'Zahlung diese Woche.',
  antwort_noetig: false, aufgabe_text: 'Betrag prüfen', frist: '', web_link: 'https://outlook/x', anhang_bewertung: null, rolle: 'direkt', wichtig: [], hat_entwurf: false,
  entwurf_fehler: null, snoozed_until: null, status: 'neu', archiviert: false, aufgabe_uebernommen: null, abgelegt_am: null, ...o,
});
const mailData = (o = {}) => ({
  source: 'outlook', subject: 'Rechnung prüfen', from: { name: 'Helga Brunner', address: 'helga@partner.at' }, to: [{ name: 'Barni', address: 'barni@firma.at' }], cc: [],
  receivedDateTime: '2026-10-23T07:00:00Z', text: 'Hallo Barni,\n\nsiehe Bild.\n\nLg Helga',
  masked: { text: 'Hallo Barni,\n\nsiehe Bild.\n\nLg [PERSON_1]', map: { '[PERSON_1]': 'Helga' } }, ...o,
});
const NAMES = ['accept', 'archive', 'remove', 'restore', 'snooze', 'reload', 'revertReview', 'regenerate', 'previousDraft'];
const handlers = () => {
  const calls = [];
  const h = Object.fromEntries(NAMES.map((k) => [k, (...a) => calls.push([k, ...a])]));
  h.attachments = async () => ({ items: [], readByAi: true, canPreview: false });
  return { h, calls };
};

async function render(data, ctx = {}) {
  resetBody();
  const { renderDetail } = await importApp('components/detail.js');
  const box = document.createElement('div');
  document.body.append(box);
  const { h, calls } = handlers();
  const controller = renderDetail(box, { proposal: proposal(), mail: mailData(), mailError: null, draft: null, headings: ['Kunden'], ...data }, { view: 'summary', ownAddress: 'barni@firma.at', handlers: { ...h, aiView: ctx.aiView, ...ctx.extra }, ...ctx });
  return { box, calls, controller };
}

test('Kopf: Löschen und "In Outlook öffnen" sind Symbole mit Tooltip, Done-Knopf mit Haken', opts, async () => {
  const { box } = await render({});
  const outlook = box.querySelector('a.icon-btn');
  assert.equal(outlook.getAttribute('href'), 'https://outlook/x');
  assert.match(outlook.getAttribute('title'), /^In Outlook öffnen/);
  assert.equal(outlook.textContent.trim(), '', 'nur Symbol');
  const del = box.querySelector('button.icon-btn.danger');
  assert.match(del.getAttribute('title'), /^Löschen/);
  assert.equal(del.getAttribute('aria-label'), 'Löschen');
  const actions = box.querySelector('.d-actions').textContent;
  assert.ok(actions.includes('Done') && actions.includes('Später') && !actions.includes('Verwerfen'));
});

test('Testmail: Outlook-Symbol ist deaktiviert; Done-Mail bietet "Zurückholen"', opts, async () => {
  const t = await render({ proposal: proposal({ is_test: true }) });
  assert.ok(t.box.querySelector('span.icon-btn.disabled'));
  assert.ok(t.box.querySelector('.banner.test'));
  const d = await render({ proposal: proposal({ archiviert: true, status: 'done' }) });
  assert.ok(d.box.querySelector('.d-actions').textContent.includes('Zurückholen'));
  assert.ok(d.box.querySelector('.banner.done'));
});

test('Zusammenfassung: Zusammenfassung und Begründung stehen in einem Absatz, Regelhinweis dahinter', opts, async () => {
  const { box } = await render({ proposal: proposal({ durch_regel: true, dringlichkeit: 'jetzt' }) });
  const paragraphs = box.querySelectorAll('.msg-summary > p');
  assert.equal(paragraphs.length, 1);
  assert.match(paragraphs[0].textContent, /^Helga fragt nach dem Betrag\. Zahlung diese Woche\./);
  assert.match(paragraphs[0].querySelector('.by-rule').textContent, /per Regel von „Heute“ geändert/);
  const done = await render({ proposal: proposal({ archiviert: true, status: 'done' }) });
  assert.equal(done.box.querySelector('.msg-summary p').textContent, 'Helga fragt nach dem Betrag.', 'in Done ohne Begründung');
});

test('Kopfbereich: Rolle am Absender, Wichtig-Badge mit Grund, Empfänger-Chips mit "Du"', opts, async () => {
  const { box } = await render({ proposal: proposal({ wichtig: ['Frist heute'] }) });
  assert.equal(box.querySelector('.from-text .role-direkt').textContent, 'Direkt');
  assert.equal(box.querySelector('.d-badges .badge.wichtig').getAttribute('title'), 'Wichtig: Frist heute');
  assert.equal(box.querySelector('.people .person.own').textContent, 'Du');
});

test('Aufgabe: Formular, nach Übernahme nur der Vermerk mit "Weitere Aufgabe"', opts, async () => {
  const open = await render({});
  assert.ok(!open.box.querySelector('.task-row').hidden);
  assert.equal(open.box.querySelector('.taken'), null);
  const taken = await render({ proposal: proposal({ aufgabe_uebernommen: { text: 'Betrag prüfen', heading: 'Kunden' } }) });
  const row = taken.box.querySelector('.task-row.taken');
  assert.match(row.textContent, /Aufgabe übernommen: Betrag prüfen · Kunden/);
  const form = [...taken.box.querySelectorAll('.task-row')].find((r) => !r.classList.contains('taken'));
  assert.ok(form.hidden);
  row.querySelector('.link').click();
  assert.ok(!form.hidden && row.hidden);
});

test('Anhänge: Büroklammer mittig, Chips mit Download, "Was geht an Claude?" nur wenn das Modul aktiv ist', opts, async () => {
  const items = [{ id: 'a.pdf', name: 'a.pdf', size: 20480, readable: true, tooBig: false }, { id: 'big.zip', name: 'big.zip', size: 30e6, readable: false, tooBig: true }];
  resetBody();
  const { renderDetail } = await importApp('components/detail.js');
  const box = document.createElement('div');
  document.body.append(box);
  renderDetail(box, { proposal: proposal(), mail: mailData(), mailError: null, draft: null, headings: [] }, { view: 'summary', ownAddress: 'x', handlers: { attachments: async () => ({ items, readByAi: true, canPreview: true }), aiView: async () => ({}) } });
  await tick();
  const att = box.querySelector('.attachments');
  assert.ok(!att.hidden && att.querySelector(':scope > .icon svg'));
  assert.equal(att.querySelector('a.att').getAttribute('href'), '/api/proposals/7/attachments/a.pdf');
  assert.equal(att.querySelector('a.att-dl').getAttribute('href'), '/api/proposals/7/attachments/a.pdf?download=1');
  assert.ok(att.querySelector('.att.disabled'), 'zu große Datei nicht klickbar');
  assert.ok(att.textContent.includes('20 KB') && att.textContent.includes('Was geht an Claude?'));
});

test('Nachricht: Original-Text, Auge zeigt die anonymisierte Fassung mit Zuordnung (zugeklappt) und wieder zurück', opts, async () => {
  const { box } = await render({}, { view: 'message', aiView: async () => ({ items: [], imageIds: [], text: null, problems: [] }) });
  const body = box.querySelector('.mailtext');
  const eye = box.querySelector('.eye-btn');
  assert.equal(body.textContent, 'Hallo Barni,\n\nsiehe Bild.\n\nLg Helga');
  assert.match(eye.textContent, /Original/);
  eye.click();
  assert.match(eye.textContent, /Anonymisiert/);
  assert.equal(body.querySelector('mark.mask').textContent, '[PERSON_1]');
  assert.equal(body.querySelector('mark.mask').getAttribute('title'), 'Original: Helga');
  const legend = box.querySelector('details.mask-legend');
  assert.ok(!legend.hidden && !legend.open, 'Zuordnung ist ein zugeklapptes Dropdown');
  assert.equal(legend.querySelector('summary').textContent, '1 Angaben ersetzt');
  eye.click();
  assert.equal(body.textContent, 'Hallo Barni,\n\nsiehe Bild.\n\nLg Helga');
  assert.ok(legend.hidden);
});

test('Nachricht: Bilder stehen im Text, in der anonymisierten Ansicht mit Tooltip auf den Bildtext, Prüfergebnis erscheint', opts, async () => {
  const aiView = async () => ({
    text: 'Siehe\n⟦bild:1⟧\nDanke [PERSON_1]',
    imageIds: ['shot.png'],
    map: { '[PERSON_1]': 'Helga', '[PERSON_2]': 'Ritter' },
    problems: [],
    items: [{ name: 'Bild im Text 1', maskedName: 'Bild im Text 1', original: 'Kunde Ritter', masked: 'Kunde [PERSON_2]', attId: 'shot.png' }],
  });
  const mail = mailData({ text: 'Siehe\n\nDanke Helga', imageText: 'Siehe\n⟦bild:shot.png⟧\nDanke Helga' });
  const { box } = await render({ mail }, { view: 'message', aiView });
  assert.equal(box.querySelector('.mailtext img').getAttribute('src'), '/api/proposals/7/attachments/shot.png');
  await tick(20); // aiView ist geladen
  box.querySelector('.eye-btn').click();
  const wrap = box.querySelector('.mail-img-wrap');
  assert.ok(wrap && wrap.querySelector('.ocr-badge'), 'Bild mit OCR-Kennzeichnung');
  wrap.dispatchEvent(new w.Event('mouseenter'));
  const tip = document.body.querySelector('.ai-tip.on');
  assert.ok(tip.textContent.includes('Kunde [PERSON_2]'), 'Tooltip zeigt den maskierten Bildtext');
  wrap.dispatchEvent(new w.Event('mouseleave'));
  assert.equal(document.body.querySelector('.ai-tip'), null, 'Tooltip verschwindet');
  assert.match(box.querySelector('.ai-check.ok').textContent, /Prüfung bestanden/);
});

test('Nachricht: Fällt die Prüfung durch, steht "Würde NICHT an Claude gesendet" mit Grund; Fehler von Outlook zeigen die Vorschau', opts, async () => {
  const aiView = async () => ({ text: 'Text', imageIds: [], map: {}, problems: ['[PERSON_1]: Name noch im Text'], items: [{ name: 'a.pdf', maskedName: 'a.pdf', original: 'x', masked: 'y', attId: null }] });
  const bad = await render({}, { view: 'message', aiView });
  await tick(20);
  bad.box.querySelector('.eye-btn').click();
  assert.match(bad.box.querySelector('.ai-check.bad').textContent, /Würde NICHT an Claude gesendet.*Name noch im Text/);
  assert.ok(bad.box.querySelector('.ai-items .mailtext'), 'Text aus dem Anhang');
  const offline = await render({ mailError: 'Outlook ist gerade nicht erreichbar.', mail: mailData({ source: 'vorschau', masked: undefined }) }, { view: 'message' });
  assert.match(offline.box.querySelector('.inline-error').textContent, /Outlook ist gerade nicht erreichbar/);
  assert.equal(offline.box.querySelector('.eye-btn'), null, 'ohne Maskierung kein Auge');
});

test('Zusammenfassung ist immer sichtbar, der Verlauf eine zunächst zugeklappte Sektion, die die Wahl meldet', opts, async () => {
  const seen = [];
  const { box } = await render({}, { onView: (v) => seen.push(v) });
  assert.deepEqual(seen, ['summary']);
  const toggle = box.querySelector('.v-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(box.querySelector('.msg-full').hidden, 'Verlauf zu');
  assert.ok(!box.querySelector('.msg-summary').closest('section').hidden, 'Zusammenfassung sichtbar');
  toggle.click();
  assert.ok(!box.querySelector('.msg-full').hidden);
  assert.ok(!box.querySelector('.msg-summary').closest('section').hidden, 'Zusammenfassung bleibt sichtbar');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  toggle.click();
  assert.deepEqual(seen, ['summary', 'message', 'summary']);
});
test('Entwurf: Varianten und Hinweis gehen mit dem Text im Feld an regenerate, "Vorige Version" nur mit Vorversion', opts, async () => {
  const withDraft = { proposal: proposal({ antwort_noetig: true, hat_entwurf: true }), draft: { text: 'Hallo Helga,\n\nja.', variant: null, previous: null } };
  const { box, calls } = await render(withDraft);
  const buttons = () => Object.fromEntries([...box.querySelectorAll('.draft-tools .btn')].map((b) => [b.textContent.trim(), b]));
  assert.deepEqual(Object.keys(buttons()), ['Kürzer', 'Förmlicher', 'Freundlicher', 'Ablehnung', 'Vorige Version']);
  assert.ok(buttons()['Vorige Version'].hidden, 'ohne Vorversion versteckt');

  const area = box.querySelector('.draft-text');
  area.value = 'Hallo Helga,\n\nich schaue es mir an.';
  area.dispatchEvent(new w.Event('input'));
  box.querySelector('.draft-hint').value = 'sag, dass ich nächste Woche Zeit habe';
  buttons().Kürzer.click();
  await tick(10);
  assert.deepEqual(calls.at(-1), ['regenerate', { variant: 'kuerzer', hint: 'sag, dass ich nächste Woche Zeit habe', base: 'Hallo Helga,\n\nich schaue es mir an.' }]);
  assert.equal(box.querySelector('.draft-hint').value, '', 'Hinweis ist verbraucht');

  box.querySelector('.draft-hint').value = 'nur kurz';
  box.querySelector('.draft-hint').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(10);
  assert.equal(calls.at(-1)[1].variant, undefined, 'Enter im Hinweisfeld erzeugt neu ohne Variante');
  assert.equal(calls.at(-1)[1].hint, 'nur kurz');
});

test('Entwurf: ohne Text im Feld sind nur Ablehnung und Neu erzeugen möglich; mit Vorversion erscheint der Zurück-Knopf', opts, async () => {
  const { box, calls } = await render({ proposal: proposal({ antwort_noetig: true }), draft: { text: '', previous: { text: 'alt' }, variant: 'kuerzer' } });
  const btn = (name) => [...box.querySelectorAll('.draft-tools .btn')].find((b) => b.textContent.trim() === name);
  assert.ok(btn('Kürzer').disabled && btn('Förmlicher').disabled && btn('Freundlicher').disabled);
  assert.ok(!btn('Ablehnung').disabled);
  assert.ok(!btn('Vorige Version').hidden);
  btn('Vorige Version').click();
  await tick(10);
  assert.deepEqual(calls.at(-1), ['previousDraft']);
});

const addr = (name, address) => ({ name, address });
const ME = addr('Barni Kiss', 'barni@firma.at');
const HELGA = addr('Helga Brunner', 'helga@partner.at');
const PAUL = addr('Paul Weber', 'paul@partner.at');
const SIG = 'Barni Kiss\nProjektmanager\nTel.: +43 1 234 56 78';
const page1 = {
  messages: [
    { id: 'M3', from: PAUL, to: [HELGA, ME], cc: [], sent: '2026-10-23T08:15:00Z', own: false, current: true, hasAttachments: true, text: 'Danke, passt so.', signature: '' },
    { id: 'M2', from: ME, to: [HELGA], cc: [PAUL, addr('A', 'a@x.at'), addr('B', 'b@x.at')], sent: '2026-10-22T11:05:00Z', own: true, current: false, hasAttachments: false, text: 'Ja, schaue ich mir an.\n\nMit freundlichen Grüßen', signature: SIG },
    { id: 'M1', from: HELGA, to: [ME], cc: [], sent: '2026-10-22T10:42:00Z', own: false, current: false, hasAttachments: false, text: 'Kannst du die Rechnung prüfen?', signature: '' },
  ],
  hasMore: true,
  nextBefore: '2026-10-22T10:42:00Z',
  degraded: false,
};

test('Verlauf: Nachrichten alt nach neu, eigene rechts, andere links in ihrer Farbe, kompakte Kopfzeile, Signatur als Dropdown', opts, async () => {
  const { box } = await render({}, { view: 'message', extra: { thread: async () => page1 } });
  await tick(30);
  const rows = [...box.querySelectorAll('.bubble-row')];
  assert.deepEqual(rows.map((r) => r.dataset.id), ['M1', 'M2', 'M3'], 'älteste zuerst');
  assert.deepEqual(rows.map((r) => r.classList.contains('own')), [false, true, false]);
  const from = (r) => r.querySelector('.b-from').textContent;
  assert.deepEqual(rows.map(from), ['Helga Brunner', 'Du', 'Paul Weber'], 'in der Kopfzeile steht nur der Name');
  assert.ok(rows.every((r) => !r.querySelector('.b-to, .b-cc, .b-arrow')), 'An und CC stehen nicht in der Kopfzeile');
  // Vollständige Liste als Popover (kein Browser-Tooltip): Von, An und CC getrennt, je Zeile Name und Adresse
  const pop = rows[1].querySelector('.b-pop');
  assert.deepEqual([...pop.querySelectorAll('.pop-title')].map((x) => x.textContent), ['Von', 'An', 'CC']);
  assert.match(pop.textContent, /Paul Weberpaul@partner\.at/);
  assert.match(pop.textContent, /b@x\.at/);
  assert.equal(rows[1].querySelector('.b-people[title]'), null, 'kein title-Tooltip'); 
  const hue = (r) => r.querySelector('.bubble').getAttribute('style');
  assert.match(hue(rows[0]), /--h:\d+/);
  assert.notEqual(hue(rows[0]), hue(rows[2]), 'verschiedene Personen, verschiedene Farben');
  assert.ok(rows[2].querySelector('.b-att'), 'Büroklammer bei Anhang');
  assert.ok(rows[2].querySelector('.bubble.current'));
  const sig = rows[1].querySelector('details.b-sig');
  assert.ok(sig && !sig.open, 'Signatur ist zugeklappt');
  assert.equal(sig.querySelector('pre').textContent, SIG);
  assert.equal(rows[1].querySelector('.b-text').textContent, 'Ja, schaue ich mir an.\n\nMit freundlichen Grüßen');
  assert.ok(!rows[0].querySelector('.b-sig'));
});

test('Verlauf: "Ältere Nachrichten laden" holt die nächste Seite und stellt sie davor; Rückfall zeigt einen Hinweis', opts, async () => {
  const calls = [];
  const older = { messages: [{ id: 'M0', from: HELGA, to: [ME], cc: [], sent: '2026-10-21T09:00:00Z', own: false, current: false, hasAttachments: false, text: 'Erste Frage', signature: '' }], hasMore: false, nextBefore: '2026-10-21T09:00:00Z', degraded: false };
  const { box } = await render({}, { view: 'message', extra: { thread: async (before) => (calls.push(before), before ? older : page1) } });
  await tick(30);
  const btn = box.querySelector('.thread-older');
  assert.ok(!btn.hidden);
  btn.click();
  await tick(30);
  assert.deepEqual(calls, ['', '2026-10-22T10:42:00Z']);
  assert.deepEqual([...box.querySelectorAll('.bubble-row')].map((r) => r.dataset.id), ['M0', 'M1', 'M2', 'M3']);
  assert.ok(box.querySelector('.thread-older').hidden, 'nichts Älteres mehr');

  const { box: b2 } = await render({}, { view: 'message', extra: { thread: async () => ({ ...page1, messages: [page1.messages[0]], hasMore: false, degraded: true }) } });
  await tick(30);
  assert.match(b2.querySelector('.thread .hint').textContent, /nur diese Nachricht/);
});

test('Aufbau in einer Spalte: Person, Anhänge, Aufgabe, Zusammenfassung, Verlauf, Antwortentwurf', opts, async () => {
  const { box } = await render({ proposal: proposal({ antwort_noetig: true }), draft: { text: 'Hallo', previous: null } });
  const article = box.querySelector('article.detail');
  assert.equal(box.querySelector('.d-main, .d-left, .d-right'), null, 'keine zweite Spalte');
  const labels = [...article.children].map((c) => c.getAttribute('aria-label')).filter(Boolean);
  assert.deepEqual(labels.filter((l) => ['Absender und Empfänger', 'Aufgabe', 'Zusammenfassung', 'Verlauf', 'Antwortentwurf'].includes(l)), ['Absender und Empfänger', 'Aufgabe', 'Zusammenfassung', 'Verlauf', 'Antwortentwurf']);
});

test('Anonymisierung mit dem Verlauf: das Auge ersetzt den Verlauf durch die maskierte Mail und wieder zurück', opts, async () => {
  const aiView = async () => ({ items: [], imageIds: [], text: null, problems: [] });
  const { box } = await render({}, { aiView, extra: { thread: async () => page1 } });
  const eye = box.querySelector('.eye-btn');
  const thread = box.querySelector('.thread');
  const text = box.querySelector('.mailtext');
  assert.ok(eye.hidden, 'bei zugeklapptem Verlauf kein Auge');
  box.querySelector('.v-toggle').click();
  assert.ok(!eye.hidden, 'bei offenem Verlauf ist das Auge da');
  eye.click();
  await tick(30);
  assert.ok(!box.querySelector('.msg-full').hidden, 'Verlauf offen');
  assert.ok(thread.hidden && !text.hidden, 'statt des Verlaufs steht die maskierte Mail');
  assert.ok(text.querySelector('mark.mask'), 'Platzhalter sind markiert');
  assert.match(text.textContent, /\[PERSON_1\]/);
  assert.ok(!box.querySelector('.mask-legend').hidden, 'Zuordnung als Dropdown');
  assert.match(eye.textContent, /Anonymisiert/);
  eye.click();
  assert.ok(!thread.hidden && text.hidden, 'zurück zum Verlauf');
  assert.match(eye.textContent, /Original/);
  box.querySelector('.v-toggle').click();
  assert.ok(eye.hidden, 'zugeklappt: Auge weg');
});

const reply = (o = {}) => ({ sender: 'helga@partner.at', only: { to: ['helga@partner.at'], cc: [] }, all: { to: ['helga@partner.at', 'paul@partner.at'], cc: ['c@x.at'] }, draft: null, ...o });
const draftData = (r) => ({ proposal: proposal({ antwort_noetig: true }), draft: { text: 'Hallo Helga,\n\nTermin passt.', previous: null }, reply: r });

test('Senden: Empfänger vorbelegt, "Allen antworten" tauscht sie, In Outlook ablegen schickt Text, An und CC', opts, async () => {
  const calls = [];
  const { box } = await render(draftData(reply()), { extra: { outlookDraft: async (p) => (calls.push(p), { webLink: 'https://outlook/d', savedAt: '2026-10-23T09:00:00Z' }), outlookDraftDelete: async () => calls.push('delete'), outlookSend: async () => true } });
  const chips = (label) => [...box.querySelectorAll(`.rf[data-label="${label}"] .rf-chip`)].map((c) => c.getAttribute('title'));
  assert.deepEqual(chips('An'), ['helga@partner.at']);
  assert.deepEqual(chips('CC'), []);
  assert.ok(box.querySelector('.rf[data-label="BCC"]').closest('.send-row').hidden, 'BCC zunächst hinter "+ BCC"');
  const radios = box.querySelectorAll('.send-mode input');
  assert.equal(radios.length, 2);
  radios[1].dispatchEvent(new w.Event('change'));
  assert.deepEqual(chips('An'), ['helga@partner.at', 'paul@partner.at']);
  assert.deepEqual(chips('CC'), ['c@x.at']);
  [...box.querySelectorAll('.send-actions .btn')].find((b) => b.textContent.includes('Outlook ablegen')).click();
  await tick(30);
  assert.deepEqual(calls[0], { text: 'Hallo Helga,\n\nTermin passt.', to: ['helga@partner.at', 'paul@partner.at'], cc: ['c@x.at'], bcc: [] });
  assert.match(box.querySelector('.send-status').textContent, /In Outlook abgelegt/);
  assert.equal(box.querySelector('.send-status a').getAttribute('href'), 'https://outlook/d');
  [...box.querySelectorAll('.send-status .link')].find((b) => b.textContent.includes('löschen')).click();
  await tick(30);
  assert.equal(calls.at(-1), 'delete');
});

test('Senden: legt ab, wartet mit Rückgängig, sendet dann; Rückgängig bricht ab', opts, async () => {
  const calls = [];
  const extra = { undoSeconds: 1, outlookDraft: async (p) => (calls.push('save'), { webLink: '', savedAt: '' }), outlookSend: async () => (calls.push('send'), true), outlookDraftDelete: async () => {} };
  const { box } = await render(draftData(reply()), { extra });
  const sendBtn = () => [...box.querySelectorAll('.send-actions .btn')].find((b) => b.textContent.trim() === 'Senden');
  sendBtn().click();
  await tick(30);
  assert.deepEqual(calls, ['save']);
  assert.ok(!box.querySelector('.send-undo').hidden);
  assert.match(box.querySelector('.send-undo').textContent, /an helga@partner\.at gesendet/);
  assert.ok(sendBtn().disabled, 'während des Wartens nicht nochmal');
  await tick(1200);
  assert.deepEqual(calls, ['save', 'send']);

  calls.length = 0;
  const b2 = (await render(draftData(reply()), { extra })).box;
  [...b2.querySelectorAll('.send-actions .btn')].find((b) => b.textContent.trim() === 'Senden').click();
  await tick(30);
  [...b2.querySelectorAll('.send-undo .btn')].find((b) => b.textContent.includes('Rückgängig')).click();
  await tick(1300);
  assert.deepEqual(calls, ['save'], 'nach Rückgängig wird nicht gesendet');
  assert.match(b2.querySelector('.send-status').textContent, /Senden abgebrochen/);
});

test('Senden: gesperrt bei offenen Platzhaltern und ohne Empfänger; bei Testmails mit Hinweis auf den Testmodus', opts, async () => {
  const extra = { outlookDraft: async () => ({}), outlookSend: async () => true, outlookDraftDelete: async () => {} };
  const withPlaceholder = { ...draftData(reply()), draft: { text: 'Termin: [BITTE ERGÄNZEN: Datum]', previous: null } };
  const a = (await render(withPlaceholder, { extra })).box;
  const send = (b) => [...b.querySelectorAll('.send-actions .btn')].find((x) => x.textContent.trim() === 'Senden');
  assert.ok(send(a).disabled);
  assert.match(send(a).title, /BITTE ERGÄNZEN/);
  const b = (await render(draftData(reply({ only: { to: [], cc: [] } })), { extra })).box;
  assert.ok(send(b).disabled);
  assert.match(send(b).title, /Empfänger/);
  const t = (await render({ ...draftData(reply()), proposal: proposal({ antwort_noetig: true, is_test: true }) }, { extra })).box;
  assert.match(t.querySelector('.send-test').textContent, /Testmodus/);
  assert.ok(!send(t).disabled, 'im Testmodus geht Senden (simuliert)');
});

test('Senden: Signatur aus dem Verlauf lässt sich anhängen', opts, async () => {
  const calls = [];
  const extra = { thread: async () => page1, outlookDraft: async (p) => (calls.push(p), {}), outlookSend: async () => true, outlookDraftDelete: async () => {} };
  const { box } = await render(draftData(reply()), { extra });
  await tick(40); // der Verlauf wird im Hintergrund geladen
  const sigBox = box.querySelector('.send-sig');
  assert.ok(!sigBox.hidden, 'Signatur gefunden');
  box.querySelector('.send-actions .btn').click();
  await tick(30);
  assert.equal(calls[0].text, `Hallo Helga,\n\nTermin passt.\n\n${SIG}`);
  sigBox.querySelector('input').checked = false;
  box.querySelector('.send-actions .btn').click();
  await tick(30);
  assert.equal(calls[1].text, 'Hallo Helga,\n\nTermin passt.');
});

test('Verlauf: Adressen ohne Namen stehen im Popover nur einmal; "Ältere laden" verschwindet, wenn alles geladen ist', opts, async () => {
  const noName = { ...page1, messages: [{ ...page1.messages[0], cc: [addr('', 'service@gaminside.com')] }], hasMore: false };
  const { box } = await render({}, { view: 'message', extra: { thread: async () => noName } });
  await tick(30);
  const rows = [...box.querySelectorAll('.b-pop .pop-row')].map((r) => r.textContent);
  assert.ok(rows.includes('service@gaminside.com'), 'nur die Adresse, ohne Wiederholung');
  assert.ok(box.querySelector('.thread-older').hidden, 'nichts mehr zu laden: Knopf versteckt');
});

// --- Empfängerfelder, BCC, Antwort bei jeder Mail, Vergrößern
const typeInto = async (input, text) => {
  input.focus();
  input.value = text;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick(160);
};
const key = (input, k) => input.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

test('Empfängerfeld: Vorschläge beim Tippen, Auswahl per Pfeil und Enter, getippte Adresse mit Enter, Chips entfernen', opts, async () => {
  const asked = [];
  const suggest = async (q, exclude) => (asked.push([q, exclude]), q.startsWith('an') ? [{ name: 'Anna Berger', address: 'anna@kunde.at', company: 'Kunde GmbH' }, { name: 'Anton Huber', address: 'anton@x.at' }] : []);
  const extra = { suggest, outlookDraft: async () => ({}), outlookSend: async () => true, outlookDraftDelete: async () => {} };
  const { box } = await render(draftData(reply()), { extra });
  const to = box.querySelector('.rf[data-label="An"]');
  const input = to.querySelector('.rf-input');
  await typeInto(input, 'an');
  assert.deepEqual(asked.at(-1), ['an', ['helga@partner.at']], 'bereits eingetragene Adressen werden nicht noch einmal vorgeschlagen');
  assert.deepEqual([...to.querySelectorAll('.rf-item-name')].map((x) => x.textContent), ['Anna Berger', 'Anton Huber']);
  key(input, 'ArrowDown');
  key(input, 'Enter');
  assert.deepEqual([...to.querySelectorAll('.rf-chip')].map((c) => c.textContent.trim()), ['helga@partner.at', 'Anton Huber'], 'Chip zeigt den Namen, Tooltip die Adresse');
  assert.equal(to.querySelector('.rf-chip:last-child').getAttribute('title'), 'anton@x.at');
  await typeInto(input, 'neu@firma.at');
  key(input, 'Enter');
  assert.equal(to.querySelectorAll('.rf-chip').length, 3);
  to.querySelector('.rf-chip .rf-x').click();
  assert.deepEqual([...to.querySelectorAll('.rf-chip')].map((c) => c.getAttribute('title')), ['anton@x.at', 'neu@firma.at']);
  key(input, 'Backspace');
  assert.equal(to.querySelectorAll('.rf-chip').length, 1, 'Rücktaste im leeren Feld entfernt die letzte Adresse');
});

test('Empfängerfeld: Einfügen mehrerer Adressen, Komma übernimmt, Unfertiges sperrt das Senden', opts, async () => {
  const { box } = await render(draftData(reply()), { extra: { undoSeconds: 1, outlookDraft: async () => ({}), outlookSend: async () => true, outlookDraftDelete: async () => {} } });
  const cc = box.querySelector('.rf[data-label="CC"]');
  const input = cc.querySelector('.rf-input');
  const ev = new w.Event('paste', { bubbles: true, cancelable: true });
  ev.clipboardData = { getData: () => 'Max Huber <max@y.at>, paul@z.at; kaputt' };
  input.dispatchEvent(ev);
  assert.deepEqual([...cc.querySelectorAll('.rf-chip')].map((c) => c.getAttribute('title')), ['max@y.at', 'paul@z.at']);
  await typeInto(input, 'anna@x.at,');
  assert.equal(cc.querySelectorAll('.rf-chip').length, 3, 'das Komma übernimmt die Adresse');
  input.value = 'halbe';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  const sendBtn = [...box.querySelectorAll('.send-actions .btn')].find((b) => b.textContent.trim() === 'Senden');
  assert.ok(sendBtn.disabled);
  assert.match(sendBtn.title, /unvollständige Adresse: „halbe“/);
});

test('BCC: erst hinter "+ BCC", wird mit An und CC an das Ablegen übergeben', opts, async () => {
  const calls = [];
  const { box } = await render(draftData(reply()), { extra: { outlookDraft: async (p) => (calls.push(p), {}), outlookSend: async () => true, outlookDraftDelete: async () => {} } });
  const row = box.querySelector('.rf[data-label="BCC"]').closest('.send-row');
  assert.ok(row.hidden);
  box.querySelector('.send-bcc').click();
  assert.ok(!row.hidden && box.querySelector('.send-bcc').hidden);
  await typeInto(row.querySelector('.rf-input'), 'chef@firma.at');
  key(row.querySelector('.rf-input'), 'Enter');
  [...box.querySelectorAll('.send-actions .btn')].find((b) => b.textContent.includes('Outlook ablegen')).click();
  await tick(30);
  assert.deepEqual(calls[0].bcc, ['chef@firma.at']);
  assert.deepEqual(calls[0].to, ['helga@partner.at']);
});

test('Antwort gibt es bei jeder offenen Mail, auch wenn laut Bewertung keine nötig ist', opts, async () => {
  const { box } = await render({ proposal: proposal({ antwort_noetig: false }), draft: null, reply: reply() }, { extra: { outlookDraft: async () => ({}), outlookSend: async () => true, outlookDraftDelete: async () => {} } });
  const panel = box.querySelector('.draft');
  assert.ok(panel && panel.querySelector('.send-box'));
  assert.match(panel.querySelector('.draft-status').textContent, /keine Antwort nötig/);
  box.querySelector('.draft-text').value = 'Kurze Antwort.';
  box.querySelector('.draft-text').dispatchEvent(new w.Event('input'));
  const sendBtn = [...box.querySelectorAll('.send-actions .btn')].find((b) => b.textContent.trim() === 'Senden');
  assert.ok(!sendBtn.disabled, 'selbst geschriebener Text lässt sich senden');
  const done = (await render({ proposal: proposal({ archiviert: true, status: 'done' }), draft: null })).box;
  assert.equal(done.querySelector('.draft'), null, 'in Done keine Antwort');
});

test('Verlauf: Knopf zum Vergrößern und wieder Verkleinern, nur bei aufgeklapptem Verlauf', opts, async () => {
  const { box } = await render({}, { extra: { thread: async () => page1 } });
  const size = box.querySelector('.v-size');
  const verlauf = box.querySelector('.card.verlauf');
  assert.ok(size.hidden, 'zugeklappt kein Knopf');
  box.querySelector('.v-toggle').click();
  assert.ok(!size.hidden);
  assert.ok(!verlauf.classList.contains('big'));
  assert.match(size.title, /vergrößern/);
  size.click();
  assert.ok(verlauf.classList.contains('big'), 'vergrößert: alles ohne Scrollen im Rahmen');
  assert.equal(size.getAttribute('aria-pressed'), 'true');
  assert.match(size.title, /verkleinern/);
  size.click();
  assert.ok(!verlauf.classList.contains('big'), 'wieder so klein wie vorher');
});
