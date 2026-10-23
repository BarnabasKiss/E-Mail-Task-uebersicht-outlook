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
  const outlookBtn = () => [...box.querySelectorAll('.send-actions .btn')].find((b) => b.textContent.includes('Outlook ablegen'));
  outlookBtn().click();
  await tick(30);
  assert.equal(calls[0].text, `Hallo Helga,\n\nTermin passt.\n\n${SIG}`);
  sigBox.querySelector('input').checked = false;
  outlookBtn().click();
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

test('Senden lässt die Mail offen und bietet danach "In Done ablegen" an; "Senden & Done" übergibt done', opts, async () => {
  const sends = [];
  const extra = { undoSeconds: 1, outlookDraft: async () => ({}), outlookSend: async (o) => (sends.push(o), true), outlookDraftDelete: async () => {} };
  const { box, calls } = await render(draftData(reply()), { extra });
  const btn = (b, name) => [...b.querySelectorAll('.send-actions .btn')].find((x) => x.textContent.trim() === name);
  assert.deepEqual([...box.querySelectorAll('.send-actions .btn')].map((b) => b.textContent.trim()), ['Senden', 'Senden & Done', 'Senden planen', 'In Outlook ablegen']);
  btn(box, 'Senden').click();
  await tick(1500);
  assert.deepEqual(sends, [{ done: false }]);
  assert.match(box.querySelector('.send-status').textContent, /Gesendet .* an helga@partner\.at/);
  [...box.querySelectorAll('.send-status .link')].find((b) => b.textContent.includes('In Done ablegen')).click();
  assert.deepEqual(calls.at(-1), ['archive', { ignoreSender: false }]);

  sends.length = 0;
  const b2 = (await render(draftData(reply()), { extra })).box;
  btn(b2, 'Senden & Done').click();
  await tick(30);
  assert.match(b2.querySelector('.send-undo').textContent, /und danach in Done abgelegt/);
  await tick(1500);
  assert.deepEqual(sends, [{ done: true }]);
  assert.ok(![...b2.querySelectorAll('.send-status .link')].some((b) => b.textContent.includes('In Done')), 'bei "Senden & Done" kein zweiter Knopf');
});

// --- Neue Mail
async function composeView(opts2 = {}) {
  resetBody();
  const { renderCompose } = await importApp('components/compose-view.js');
  const box = document.createElement('div');
  document.body.append(box);
  const calls = [];
  const view = renderCompose(box, {
    signature: 'Barni Kiss\nTel.: +43 1',
    suggest: async (q) => (q.startsWith('an') ? [{ name: 'Anna Berger', address: 'anna@kunde.at', company: 'Kunde GmbH' }] : []),
    appSave: async (p) => (calls.push(['appSave', p]), { id: 'A1', updatedAt: '2026-10-23T09:00:00Z' }),
    appDelete: async (id) => calls.push(['appDelete', id]),
    save: async (p) => (calls.push(['save', p]), { draftId: `D${calls.length}`, webLink: 'https://outlook/n', savedAt: '2026-10-23T09:00:00Z' }),
    send: async (p) => (calls.push(['send', p]), true),
    discard: async (p) => calls.push(['discard', p]),
    schedule: async (p, at) => calls.push(['schedule', p, at]),
    improve: async (o) => (calls.push(['improve', o]), o.mode === 'gaps' ? { gaps: [{ punkt: 'Frist', hinweis: 'Es fehlt ein Datum' }] } : { text: `${o.text} (verbessert)` }),
    makeSubject: async (o) => (calls.push(['subject', o]), { subject: 'Angebot Oktober' }),
    back: () => calls.push(['back']),
    undoSeconds: 1,
    autosaveMs: 30,
    ...opts2,
  });
  return { box, calls, view };
}
const cbtn = (box, name) => [...box.querySelectorAll('.cp-card .send-actions .btn')].find((b) => b.textContent.trim() === name);
const setText = (box, v) => {
  const t = box.querySelector('.cp-text');
  t.value = v;
  t.dispatchEvent(new w.Event('input', { bubbles: true }));
};

test('Neue Mail: Aufbau wie die Antwort (zuerst der Text, dann Betreff, dann An/CC/BCC und die Knöpfe)', opts, async () => {
  const { box } = await composeView();
  const order = [...box.querySelectorAll('.cp-card > *')].map((c) => (c.classList.contains('imp-bar') ? 'Werkzeuge' : c.classList.contains('cp-text') ? 'Text' : c.classList.contains('cp-subject-row') ? 'Betreff' : c.querySelector?.('.rf[data-label="An"]') ? 'An' : c.querySelector?.('.rf[data-label="CC"]') ? 'CC' : c.classList.contains('send-actions') ? 'Knöpfe' : '')).filter(Boolean);
  assert.deepEqual(order, ['Werkzeuge', 'Text', 'Betreff', 'An', 'CC', 'Knöpfe']);
  assert.deepEqual([...box.querySelectorAll('.cp-card .send-actions .btn')].map((b) => b.textContent.trim()), ['Senden', 'Senden planen', 'In Outlook ablegen', 'Verwerfen']);
});

test('Neue Mail: Pflichtfelder (Text, Betreff, An) sperren Senden, Planen und Ablegen mit Grund', opts, async () => {
  const { box } = await composeView();
  assert.ok(cbtn(box, 'Senden').disabled);
  assert.match(cbtn(box, 'Senden').title, /Text ist leer/);
  setText(box, 'Guten Tag, anbei das Angebot.');
  assert.match(cbtn(box, 'Senden').title, /Betreff/);
  const subj = box.querySelector('.cp-subject');
  subj.value = 'Angebot';
  subj.dispatchEvent(new w.Event('input'));
  assert.match(cbtn(box, 'Senden').title, /Empfänger bei An/);
  assert.ok(cbtn(box, 'Senden planen').disabled, 'Planen gesperrt');
  const to = box.querySelector('.rf[data-label="An"] .rf-input');
  await typeInto(to, 'max@y.at');
  key(to, 'Enter');
  assert.ok(!cbtn(box, 'Senden').disabled && !cbtn(box, 'In Outlook ablegen').disabled && !cbtn(box, 'Senden planen').disabled);
});

test('Neue Mail: Betreff per Knopf vorschlagen (nur mit Text) und danach änderbar', opts, async () => {
  const { box, calls } = await composeView({ prefill: { to: ['max@y.at'] } });
  const btn = [...box.querySelectorAll('.cp-subject-row .btn')].find((b) => b.textContent.includes('Betreff vorschlagen'));
  assert.ok(btn.disabled, 'ohne Text kein Vorschlag');
  setText(box, 'Anbei das Angebot für Oktober.');
  assert.ok(!btn.disabled);
  btn.click();
  await tick(30);
  assert.deepEqual(calls.find((c) => c[0] === 'subject')[1], { text: 'Anbei das Angebot für Oktober.', to: ['max@y.at'] });
  const subj = box.querySelector('.cp-subject');
  assert.equal(subj.value, 'Angebot Oktober');
  subj.value = 'Angebot Oktober (angepasst)';
  subj.dispatchEvent(new w.Event('input'));
  assert.equal(subj.value, 'Angebot Oktober (angepasst)');
});

test('Neue Mail: Verbessern mit Rückgängig (Rechtschreibung, Struktur) und Lücken als Liste, Text bleibt bei Lücken unverändert', opts, async () => {
  const { box, calls } = await composeView({ prefill: { to: ['max@y.at'], subject: 'S', text: 'Hallo Max' } });
  const imp = (name) => [...box.querySelectorAll('.imp-bar .btn')].find((b) => b.textContent.trim() === name);
  assert.deepEqual([...box.querySelectorAll('.imp-bar .btn')].filter((b) => !b.hidden).map((b) => b.textContent.trim()), ['Rechtschreibung', 'Rechtschreibung & Struktur', 'Lücken suchen', 'Diktieren']);
  imp('Rechtschreibung').click();
  await tick(30);
  assert.equal(box.querySelector('.cp-text').value, 'Hallo Max (verbessert)');
  assert.deepEqual(calls.find((c) => c[0] === 'improve')[1], { mode: 'spelling', text: 'Hallo Max', subject: 'S', to: ['max@y.at'] });
  imp('Rechtschreibung & Struktur').click();
  await tick(30);
  assert.equal(box.querySelector('.cp-text').value, 'Hallo Max (verbessert) (verbessert)');
  imp('Vorige Version').click();
  assert.equal(box.querySelector('.cp-text').value, 'Hallo Max (verbessert)');
  imp('Vorige Version').click();
  assert.equal(box.querySelector('.cp-text').value, 'Hallo Max', 'zwei Schritte zurück');
  assert.ok(imp('Vorige Version').hidden, 'nichts mehr zurückzuholen');
  imp('Lücken suchen').click();
  await tick(30);
  assert.equal(box.querySelector('.cp-text').value, 'Hallo Max', 'Lücken ändern den Text nicht');
  assert.match(box.querySelector('.imp-gaps').textContent, /1 mögliche Lücke.*Frist.*Es fehlt ein Datum/);
  box.querySelector('.imp-gaps li .icon-btn').click();
  assert.ok(box.querySelector('.imp-gaps').hidden, 'ausgeblendet, wenn alle erledigt sind');
});

test('Neue Mail: Entwurf wird in der App gespeichert (nicht in Outlook), Zurück behält ihn, Verwerfen löscht ihn', opts, async () => {
  const { box, calls, view } = await composeView({ prefill: { to: ['max@y.at'] } });
  assert.equal(view.dirty(), false);
  setText(box, 'Erster Satz');
  assert.equal(view.dirty(), true, 'noch nicht gespeichert');
  await tick(120);
  assert.deepEqual(calls.find((c) => c[0] === 'appSave')[1], { id: '', subject: '', text: 'Erster Satz', to: ['max@y.at'], cc: [], bcc: [] });
  assert.equal(view.dirty(), false);
  assert.match(box.querySelector('.cp-saved').textContent, /in der App gespeichert/);
  assert.ok(!calls.some((c) => c[0] === 'save'), 'nichts in Outlook');
  setText(box, 'Erster Satz, zweiter Satz');
  await tick(120);
  assert.equal(calls.filter((c) => c[0] === 'appSave').at(-1)[1].id, 'A1', 'derselbe Entwurf wird fortgeschrieben');
  [...box.querySelectorAll('.d-actions .btn')][0].click();
  await tick(60);
  assert.equal(calls.at(-1)[0], 'back');
  assert.ok(!calls.some((c) => c[0] === 'appDelete'), 'Zurück behält den Entwurf');
  globalThis.confirm = () => true;
  const b2 = await composeView({ prefill: { to: ['max@y.at'], draftId: 'A7', text: 'x' } });
  assert.match(b2.box.querySelector('.cp-saved').textContent, /aus der App geöffnet/);
  cbtn(b2.box, 'Verwerfen').click();
  await tick(60);
  assert.deepEqual(b2.calls.slice(-2), [['appDelete', 'A7'], ['back']]);
});

test('Neue Mail: Ablegen in Outlook sendet Betreff, Text mit Signatur, An, CC, BCC; erneutes Ablegen ersetzt den alten Entwurf', opts, async () => {
  const { box, calls } = await composeView({ prefill: { to: ['max@y.at'], subject: 'Angebot', text: 'Hallo Max' } });
  const cc = box.querySelector('.rf[data-label="CC"] .rf-input');
  await typeInto(cc, 'an');
  key(cc, 'Enter');
  box.querySelector('.send-bcc').click();
  const bcc = box.querySelector('.rf[data-label="BCC"] .rf-input');
  await typeInto(bcc, 'chef@firma.at');
  key(bcc, 'Enter');
  cbtn(box, 'In Outlook ablegen').click();
  await tick(30);
  const first = calls.find((c) => c[0] === 'save');
  assert.deepEqual(first[1], { subject: 'Angebot', text: 'Hallo Max\n\nBarni Kiss\nTel.: +43 1', to: ['max@y.at'], cc: ['anna@kunde.at'], bcc: ['chef@firma.at'], replaceId: '' });
  assert.match(box.querySelector('.send-status').textContent, /In Outlook abgelegt/);
  box.querySelector('.cp-sig input').checked = false;
  cbtn(box, 'In Outlook ablegen').click();
  await tick(30);
  const second = calls.filter((c) => c[0] === 'save')[1];
  assert.match(second[1].replaceId, /^D\d+$/, 'der erste Entwurf wird ersetzt');
  assert.equal(second[1].text, 'Hallo Max', 'ohne Signatur');
});

test('Neue Mail: Senden legt ab, wartet mit Rückgängig (zum Ändern), sendet, löscht den App-Entwurf und schließt; Rückgängig sendet nichts', opts, async () => {
  const { box, calls } = await composeView({ prefill: { to: ['max@y.at'], subject: 'Angebot', text: 'Hallo Max', draftId: 'A1' } });
  cbtn(box, 'Senden').click();
  await tick(30);
  assert.equal(calls.find((c) => c[0] === 'save')[0], 'save');
  assert.match(box.querySelector('.send-undo').textContent, /an max@y\.at gesendet.*noch etwas ändern/);
  assert.ok(cbtn(box, 'Senden').disabled);
  await tick(1500);
  const tail = calls.map((c) => c[0]).slice(-3);
  assert.deepEqual(tail, ['send', 'appDelete', 'back']);
  assert.match(calls.find((c) => c[0] === 'send')[1].draftId, /^D\d+$/);

  const b2 = await composeView({ prefill: { to: ['max@y.at'], subject: 'S', text: 'T' } });
  cbtn(b2.box, 'Senden').click();
  await tick(30);
  [...b2.box.querySelectorAll('.send-undo .btn')].find((b) => b.textContent.includes('Rückgängig')).click();
  await tick(1400);
  assert.ok(!b2.calls.some((c) => c[0] === 'send' || c[0] === 'back'), 'nichts gesendet, nicht geschlossen');
  assert.match(b2.box.querySelector('.send-status').textContent, /Senden abgebrochen/);
  assert.ok(!b2.box.querySelector('.cp-text').disabled, 'danach lässt sich weiterschreiben');
});

test('Neue Mail: Senden planen mit eigener Zeit übergibt Inhalt, Zeit und den App-Entwurf; danach schließt die Ansicht', opts, async () => {
  const { box, calls } = await composeView({ prefill: { to: ['max@y.at'], subject: 'Angebot', text: 'Hallo Max', draftId: 'A1' } });
  box.querySelector('.sch button').click();
  assert.ok(!box.querySelector('.sch-pop').hidden);
  assert.ok(!/false/.test(box.querySelector('.sch-pop').textContent), 'kein verirrtes "false" (Neue Mail hat keine Done-Option)');
  assert.equal(box.querySelector('.sch-done'), null, 'bei neuen Mails kein "Danach in Done"');
  assert.match(box.querySelector('.sch-pop').textContent, /Heute 16:00|Morgen 08:00/);
  const when = box.querySelector('.sch-when');
  const target = new Date(Date.now() + 2 * 86400_000);
  const pad = (n) => String(n).padStart(2, '0');
  when.value = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T09:30`;
  [...box.querySelectorAll('.sch-custom .btn')][0].click();
  await tick(60);
  const call = calls.find((c) => c[0] === 'schedule');
  assert.equal(call[1].kind, 'new');
  assert.deepEqual([call[1].payload.subject, call[1].payload.to, call[1].fromDraftId], ['Angebot', ['max@y.at'], 'A1']);
  assert.equal(new Date(call[1].sendAt).getHours(), 9);
  assert.equal(calls.at(-1)[0], 'back');
});

// --- Spracheingabe
class FakeRecognition {
  static last = null;
  constructor() {
    FakeRecognition.last = this;
    this.started = 0;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  say(text, isFinal = true) {
    this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] });
  }
}

test('Diktieren: Knopf startet die Erkennung, fügt Gesagtes mit Satzzeichen an der Schreibmarke ein, Zwischenstand und Fehler stehen im Hinweis', opts, async () => {
  const { createDictation, dictationSupported } = await importApp('components/dictation.js');
  const win = { SpeechRecognition: FakeRecognition, Event: w.Event };
  assert.equal(dictationSupported(win), true);
  assert.equal(dictationSupported({}), false);
  resetBody();
  const ta = document.createElement('textarea');
  const hint = document.createElement('span');
  document.body.append(ta, hint);
  let texts = 0;
  const d = createDictation({ textarea: ta, hint, win, onText: () => (texts += 1) });
  document.body.append(d.node);
  assert.match(d.node.textContent, /Diktieren/);
  d.node.click();
  assert.match(d.node.textContent, /Stopp/);
  assert.equal(d.node.getAttribute('aria-pressed'), 'true');
  const rec = FakeRecognition.last;
  assert.equal(rec.lang, 'de-AT');
  assert.equal(rec.continuous, true);
  rec.say('hallo anna komma', false);
  assert.match(hint.textContent, /hallo anna komma/, 'Zwischenstand');
  assert.equal(ta.value, '', 'Zwischenstand steht noch nicht im Text');
  rec.say('hallo anna komma neuer absatz ich melde mich punkt');
  assert.equal(ta.value, 'Hallo anna,\n\nich melde mich.');
  assert.equal(texts, 1);
  rec.say('danke dir');
  assert.equal(ta.value, 'Hallo anna,\n\nich melde mich. Danke dir');
  rec.onend(); // Chrome beendet nach einer Pause: es läuft weiter
  assert.equal(rec.started, 2);
  rec.onerror({ error: 'network' });
  assert.match(hint.textContent, /nicht erreichbar.*Win\+H/);
  assert.match(d.node.textContent, /Diktieren/, 'nach einem Fehler wieder bereit');
});

test('Diktieren: ohne Spracherkennung im Browser ist der Knopf gesperrt und nennt Alternativen', opts, async () => {
  const { createDictation } = await importApp('components/dictation.js');
  resetBody();
  const d = createDictation({ textarea: document.createElement('textarea'), win: { Event: w.Event } });
  assert.ok(d.node.disabled);
  assert.match(d.node.title, /Chrome oder Edge|Win\+H/);
});

// --- Antwort: Werkzeuge, gemerkte Änderungen, Planen
test('Antwort: Verbessern (mit Kontext der Mail), Rückgängig und gemerkte Änderungen am Entwurf', opts, async () => {
  const improved = [];
  const edits = [];
  const extra = {
    improve: async (o) => (improved.push(o), o.mode === 'gaps' ? { gaps: [] } : { text: 'Hallo Helga,\n\nTermin passt (korrigiert).' }),
    saveEdit: async (t) => edits.push(t),
    outlookDraft: async () => ({}), outlookSend: async () => true, outlookDraftDelete: async () => {},
  };
  const { box } = await render(draftData(reply()), { extra });
  const imp = (name) => [...box.querySelectorAll('.draft .imp-bar .btn')].find((b) => b.textContent.trim() === name);
  imp('Rechtschreibung').click();
  await tick(30);
  assert.equal(box.querySelector('.draft-text').value, 'Hallo Helga,\n\nTermin passt (korrigiert).');
  assert.equal(improved[0].mode, 'spelling');
  assert.equal(improved[0].text, 'Hallo Helga,\n\nTermin passt.');
  assert.deepEqual(improved[0].to, ['helga@partner.at']);
  assert.match(improved[0].context, /Hallo Barni/, 'der Text der Mail geht als Kontext mit (für "Lücken")');
  imp('Vorige Version').click();
  assert.equal(box.querySelector('.draft-text').value, 'Hallo Helga,\n\nTermin passt.');
  const area = box.querySelector('.draft-text');
  area.value = 'Hallo Helga, ich habe es geändert.';
  area.dispatchEvent(new w.Event('input'));
  await tick(1400);
  assert.equal(edits.at(-1), 'Hallo Helga, ich habe es geändert.', 'eigene Änderungen werden gemerkt');
  imp('Lücken suchen').click();
  await tick(30);
  assert.match(box.querySelector('.draft .imp-gaps').textContent, /Keine Lücken gefunden/);
});

test('Antwort: geänderter Text wird beim erneuten Öffnen wiederhergestellt', opts, async () => {
  const { box } = await render({ proposal: proposal({ antwort_noetig: true }), draft: { text: 'Erzeugt', edited: 'Von dir geändert', previous: null }, reply: reply() }, { extra: { outlookDraft: async () => ({}), outlookSend: async () => true, outlookDraftDelete: async () => {} } });
  assert.equal(box.querySelector('.draft-text').value, 'Von dir geändert');
});

test('Antwort: Senden planen übergibt Text, Empfänger, done und Zeit; "Planung zurücknehmen" ruft unschedule', opts, async () => {
  const scheduled = [];
  const unscheduled = [];
  const extra = { schedule: async (p, at) => (scheduled.push([p, at]), { id: 's-9', sendAt: at }), unschedule: async (id) => unscheduled.push(id), outlookDraft: async () => ({}), outlookSend: async () => true, outlookDraftDelete: async () => {} };
  const { box } = await render(draftData(reply()), { extra });
  const planBtn = [...box.querySelectorAll('.send-actions .btn')].find((b) => b.textContent.includes('Senden planen'));
  planBtn.click();
  assert.ok(!box.querySelector('.sch-pop').hidden);
  assert.ok(box.querySelector('.sch-done'), 'bei Antworten: danach in Done ablegen');
  box.querySelector('.sch-done input').checked = true;
  const when = box.querySelector('.sch-when');
  const t = new Date(Date.now() + 3 * 86400_000);
  const pad = (n) => String(n).padStart(2, '0');
  when.value = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T08:00`;
  box.querySelector('.sch-custom .btn').click();
  await tick(60);
  assert.deepEqual([scheduled[0][0].text, scheduled[0][0].to, scheduled[0][0].done], ['Hallo Helga,\n\nTermin passt.', ['helga@partner.at'], true]);
  assert.equal(new Date(scheduled[0][1]).getHours(), 8);
  assert.match(box.querySelector('.send-status').textContent, /Geplant für .*danach in Done/);
  [...box.querySelectorAll('.send-status .link')].find((b) => b.textContent.includes('zurücknehmen')).click();
  await tick(30);
  assert.deepEqual(unscheduled, ['s-9']);
  assert.match(box.querySelector('.send-status').textContent, /zurückgenommen/);
});

test('Empfängerfeld: nach der Auswahl eines Vorschlags ist die halbe Eingabe weg und Senden nicht mehr gesperrt', opts, async () => {
  const suggest = async (q) => (q.startsWith('ma') ? [{ name: 'Maria Berger', address: 'maria@kunde.at' }] : []);
  const { box } = await render(draftData(reply({ only: { to: [], cc: [] } })), { extra: { suggest, outlookDraft: async () => ({}), outlookSend: async () => true, outlookDraftDelete: async () => {} } });
  const input = box.querySelector('.rf[data-label="An"] .rf-input');
  await typeInto(input, 'ma');
  const send = [...box.querySelectorAll('.send-actions .btn')].find((b) => b.textContent.trim() === 'Senden');
  assert.match(send.title, /unvollständige Adresse/);
  box.querySelector('.rf-item').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  assert.equal(input.value, '');
  assert.ok(!send.disabled, 'Senden ist frei');
});
