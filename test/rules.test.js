import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRules, parseUrgencyRules, applyUrgencyRules } from '../lib/rules.js';
import { snoozeOptions } from '../public/js/snooze-options.js';

const tmpRules = () => createRules({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rules-test-')), 'Regeln.md') });

test('legt die Datei mit Vorlage an', () => {
  const text = tmpRules().read();
  for (const h of ['## Grundton und Formulierungen', '## Regeln pro Kontakt oder Firma', '## Dringlichkeit und Ignorieren', '## Automatisch gelernt']) {
    assert.ok(text.includes(h), h);
  }
});

test('Dringlichkeitsregeln: Adresse und Domain', () => {
  const rules = parseUrgencyRules('- Ignorieren: news@a.at, @spam.com\n- Immer jetzt: chef@firma.at\nImmer heute: firma2.at');
  assert.deepEqual(applyUrgencyRules({ absender_mail: 'news@a.at' }, rules), { hidden: true });
  assert.deepEqual(applyUrgencyRules({ absender_mail: 'x@SPAM.com' }, rules), { hidden: true });
  assert.deepEqual(applyUrgencyRules({ absender_mail: 'chef@firma.at' }, rules), { hidden: false, urgency: 'jetzt' });
  assert.deepEqual(applyUrgencyRules({ absender_mail: 'a@firma2.at' }, rules), { hidden: false, urgency: 'heute' });
  assert.deepEqual(applyUrgencyRules({ absender_mail: 'a@andere.at' }, rules), { hidden: false });
});

test('Beispielzeilen mit "(Beispiel)" und erklärende Sätze wirken nicht als Regel', () => {
  assert.deepEqual(parseUrgencyRules('- (Beispiel) Ignorieren: newsletter@beispiel.at').ignorieren, []);
  assert.deepEqual(parseUrgencyRules(tmpRules().read()).ignorieren, [], 'die Vorlage blendet nichts aus');
});

test('gelernte Regeln werden unter "Automatisch gelernt" angehängt, ohne Duplikate', () => {
  const r = tmpRules();
  assert.equal(r.appendLearned(['Kunden werden gesiezt', 'Kürzer schreiben'], '2026-10-20'), 2);
  assert.equal(r.appendLearned(['kunden werden gesiezt'], '2026-10-21'), 0);
  const text = r.read();
  assert.ok(text.indexOf('## Automatisch gelernt') < text.indexOf('- 2026-10-20: Kunden werden gesiezt'));
  assert.ok(text.trimEnd().endsWith('- 2026-10-20: Kürzer schreiben'));
});

test('Ignorieren-Regel landet im passenden Abschnitt und wirkt', () => {
  const r = tmpRules();
  assert.equal(r.appendIgnore('Neu@Beispiel.at'), true);
  assert.equal(r.appendIgnore('neu@beispiel.at'), false);
  const text = r.read();
  assert.ok(text.indexOf('- Ignorieren: neu@beispiel.at') > text.indexOf('## Dringlichkeit und Ignorieren'));
  assert.ok(text.indexOf('- Ignorieren: neu@beispiel.at') < text.indexOf('## Automatisch gelernt'));
  assert.equal(applyUrgencyRules({ absender_mail: 'neu@beispiel.at' }, r.urgencyRules()).hidden, true);
});

test('Später-erinnern-Optionen liegen in der Zukunft', () => {
  const now = new Date('2026-10-20T17:30:00');
  const opts = snoozeOptions(now);
  assert.ok(opts.every((o) => o.date > now));
  assert.ok(!opts.some((o) => o.label === 'Heute 16:00'), 'Heute 16:00 ist schon vorbei');
  assert.equal(opts.at(-1).date.getDay(), 1, 'nächste Woche = Montag');
});

test('Regel für einen Absender setzen und aufheben; je Adresse nur eine Art', async () => {
  const { matchingUrgencyRules } = await import('../lib/rules.js');
  const r = tmpRules();
  r.setUrgencyRule('ignorieren', 'News@A.at');
  assert.deepEqual(r.urgencyRules().ignorieren, ['news@a.at']);
  r.setUrgencyRule('jetzt', 'news@a.at');
  assert.deepEqual(r.urgencyRules(), { ignorieren: [], jetzt: ['news@a.at'], heute: [] });
  assert.deepEqual(matchingUrgencyRules('news@a.at', r.urgencyRules()), [{ kind: 'jetzt', pattern: 'news@a.at' }]);
  r.setUrgencyRule('jetzt', 'news@a.at', false);
  assert.deepEqual(r.urgencyRules(), { ignorieren: [], jetzt: [], heute: [] });
  assert.throws(() => r.setUrgencyRule('wichtig', 'x@y.at'), /Unbekannte Regel/);
  assert.throws(() => r.setUrgencyRule('jetzt', 'a b'), /Ungültige Adresse/);
});

test('Regel aufheben lässt die anderen Einträge einer Sammelzeile stehen', () => {
  const r = tmpRules();
  fs.appendFileSync(r.file, '\n- Ignorieren: a@x.at, @y.at, b@x.at\n');
  r.setUrgencyRule('ignorieren', '@y.at', false);
  assert.deepEqual(r.urgencyRules().ignorieren, ['a@x.at', 'b@x.at']);
});
