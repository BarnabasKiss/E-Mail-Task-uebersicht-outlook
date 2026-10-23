import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextTools } from '../lib/text-tools.js';

const make = (answer, extra = {}) => {
  const prompts = [];
  const claude = { run: async (p) => (prompts.push(p), typeof answer === 'function' ? answer(p) : answer), runJson: async (p) => (prompts.push(p), typeof answer === 'function' ? answer(p) : answer) };
  return { tools: createTextTools({ claude, ownNames: ['Barni'], ownAddress: 'barni@firma.at', nameOf: (a) => (a === 'anna@kunde.at' ? 'Anna Berger' : ''), ...extra }), prompts };
};
const TEXT = 'Sehr geehrte Frau Berger,\n\nich rufe Sie unter +43 664 1234567 an wegen der Rechnung 2026-0815.\n\nLg Barni';

test('Rechtschreibung: Namen und Nummern gehen nur als Platzhalter an Claude und kommen zurück', async () => {
  const { tools, prompts } = make((p) => p.split('TEXT:\n')[1].replace('ich rufe', 'Ich rufe'));
  const out = await tools.improveText({ mode: 'spelling', text: TEXT, to: ['anna@kunde.at'] });
  assert.ok(!/Berger|1234567/.test(prompts[0].split('TEXT:\n')[1]), 'maskiert');
  assert.match(prompts[0], /ausschließlich Rechtschreibung/);
  assert.match(out.text, /Sehr geehrte Frau Berger,/);
  assert.match(out.text, /\+43 664 1234567/);
  assert.match(out.text, /Ich rufe Sie/);
});

test('Struktur: eigene Regeln im Prompt; verliert Claude einen Platzhalter, wird der Vorschlag verworfen', async () => {
  const { tools, prompts } = make((p) => 'Sehr geehrte Frau [PERSON_1], wir telefonieren.');
  await assert.rejects(tools.improveText({ mode: 'structure', text: TEXT, to: ['anna@kunde.at'] }), /Angaben im Text verändert/);
  assert.match(prompts[0], /Struktur/);
  await assert.rejects(tools.improveText({ mode: 'zaubern', text: TEXT }), /Unbekannte Verbesserung/);
  await assert.rejects(tools.improveText({ mode: 'spelling', text: '  ' }), /noch keinen Text/);
});

test('Lücken: Liste mit Punkt und Hinweis, Platzhalter zurückübersetzt, Kontext fließt ein, höchstens 6', async () => {
  const gaps = Array.from({ length: 8 }, (_, i) => ({ punkt: `Punkt ${i}`, hinweis: i === 0 ? 'Bei [PERSON_1] fehlt die Frist' : 'x' }));
  gaps.push({ punkt: 5 });
  const { tools, prompts } = make({ gaps });
  const out = await tools.findGaps({ text: TEXT, subject: 'Rechnung', to: ['anna@kunde.at'], context: 'Frau Berger fragt: Wann rufen Sie an? Bitte auch den Betrag nennen.' });
  assert.equal(out.gaps.length, 6);
  assert.match(out.gaps[0].hinweis, /Bei Berger fehlt|Bei Anna Berger fehlt/);
  assert.match(prompts[0], /KONTEXT/);
  assert.ok(!prompts[0].includes('1234567'));
  const { tools: none } = make({ gaps: [] });
  assert.deepEqual(await none.findGaps({ text: 'Alles klar.' }), { gaps: [] });
});

test('Betreff: eine Zeile ohne Betreff:/Anführungszeichen, aus dem Text', async () => {
  const { tools, prompts } = make('Betreff: „Rechnung [PERSON_1] prüfen“\nZweite Zeile');
  const out = await tools.suggestSubject({ text: 'Bitte die Rechnung von Frau Berger prüfen.', to: ['anna@kunde.at'] });
  assert.equal(out.subject, 'Rechnung Anna Berger prüfen');
  assert.ok(!prompts[0].includes('Berger'), 'der Name geht nicht an Claude');
  await assert.rejects(tools.suggestSubject({ text: ' ' }), /zuerst den Text/);
});

test('Ohne Pseudonymisierung (Einstellung) geht der Text unverändert', async () => {
  const { tools, prompts } = make((p) => p.split('TEXT:\n')[1], { pseudonymize: false });
  await tools.improveText({ mode: 'spelling', text: 'Hallo Anna Berger', to: [] });
  assert.match(prompts[0], /Hallo Anna Berger/);
});

test('Ton und Übersetzen: eigene Regeln im Prompt, Platzhalter bleiben erhalten', async () => {
  const echo = (p) => p.split('TEXT:\n')[1];
  const { tools, prompts } = make(echo);
  for (const [mode, rule] of [['kuerzer', /Kürze den Text/], ['foermlicher', /förmlicher/], ['freundlicher', /freundlicher/], ['translate-en', /ins Englische/], ['translate-de', /ins Deutsche/]]) {
    const out = await tools.improveText({ mode, text: TEXT, to: ['anna@kunde.at'] });
    assert.match(prompts.at(-1), rule);
    assert.match(out.text, /\+43 664 1234567/);
  }
  const { tools: lossy } = make('Dear Ms [PERSON_1], I will call.');
  await assert.rejects(lossy.improveText({ mode: 'translate-en', text: TEXT, to: ['anna@kunde.at'] }), /Angaben im Text verändert/);
});

test('Aus Stichpunkten: Empfänger und bekannte Ansprache gehen mit, Anrede und Gruß setzt das Gedächtnis ein', async () => {
  const contacts = {
    effective: (a) => ({ form: a === 'anna@kunde.at' ? { value: 'du' } : null, sprache: null }),
    applyToDraft: (a, name, text) => text.replace(/^Hallo[^\n]*/, `Hallo ${name.split(' ')[0]},`),
  };
  const { tools, prompts } = make('Hallo,\n\nich schaue mir die Unterlagen an.', { contacts });
  const out = await tools.improveText({ mode: 'notes', text: '- Unterlagen ansehen\n- Termin Freitag', to: ['anna@kunde.at'] });
  assert.match(prompts[0], /Stichpunkten/);
  assert.match(prompts[0], /Ansprache: Du/);
  assert.match(prompts[0], /Empfänger: \[PERSON_\d+\]/);
  assert.ok(!prompts[0].includes('Anna Berger'));
  assert.match(out.text, /^Hallo Anna,/);
});
