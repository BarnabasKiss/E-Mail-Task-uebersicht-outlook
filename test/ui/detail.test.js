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
const NAMES = ['accept', 'archive', 'remove', 'restore', 'snooze', 'reload', 'revertReview', 'regenerate'];
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
  const controller = renderDetail(box, { proposal: proposal(), mail: mailData(), mailError: null, draft: null, headings: ['Kunden'], ...data }, { view: 'summary', ownAddress: 'barni@firma.at', handlers: { ...h, aiView: ctx.aiView }, ...ctx });
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

test('Ansichtswechsel meldet die Wahl, Zusammenfassung ist Standard', opts, async () => {
  const seen = [];
  const { box } = await render({}, { onView: (v) => seen.push(v) });
  assert.deepEqual(seen, ['summary']);
  const [tabSummary, tabMessage] = box.querySelectorAll('.seg-btn');
  tabMessage.click();
  assert.ok(box.querySelector('.msg-summary').hidden && !box.querySelector('.msg-full').hidden);
  assert.equal(tabMessage.getAttribute('aria-selected'), 'true');
  tabSummary.click();
  assert.deepEqual(seen, ['summary', 'message', 'summary']);
});
