import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, stripQuotedHistory } from '../lib/html.js';

const html = '<p>Sehr geehrter Herr Kiss,</p><p>erster Absatz<br>zweite Zeile</p><div>Gruß</div><style>p{color:red}</style>';

test('kompakt: ein Zeilenumbruch zwischen Absätzen, Style-Block entfernt', () => {
  assert.equal(htmlToText(html), 'Sehr geehrter Herr Kiss,\nerster Absatz\nzweite Zeile\nGruß');
});

test('Anzeige: Absätze bleiben durch eine Leerzeile getrennt, keine drei Umbrüche in Folge', () => {
  const t = htmlToText(html, { paragraphs: true });
  assert.equal(t, 'Sehr geehrter Herr Kiss,\n\nerster Absatz\nzweite Zeile\n\nGruß');
  assert.ok(!/\n{3,}/.test(t));
});

test('Entities und Tags', () => {
  assert.equal(htmlToText('<b>A&nbsp;&amp;&nbsp;B</b> &lt;x&gt;'), 'A & B <x>');
});

test('zitierter Verlauf wird abgeschnitten, kurze Texte bleiben', () => {
  const long = `${'Antworttext '.repeat(30)}\nVon: Anna\nGesendet: gestern`;
  assert.ok(!stripQuotedHistory(long).includes('Gesendet'));
  assert.equal(stripQuotedHistory('Kurz\nVon: x'), 'Kurz\nVon: x');
});
