import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, stripQuotedHistory, IMAGE_MARK } from '../lib/html.js';

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

test('Bilder: cid-Bilder werden zur Marke, andere Bilder verschwinden, ohne Option nie Marken', () => {
  const h = '<p>Siehe Fehler:</p><img src="cid:image001.png%4001D9">\n<p>Danke <img src="https://x.example/p.gif"></p>';
  const t = htmlToText(h, { paragraphs: true, images: true });
  assert.equal(t, 'Siehe Fehler:\n\n⟦bild:image001.png@01D9⟧\n\nDanke');
  assert.deepEqual([...t.matchAll(IMAGE_MARK)].map((m) => m[1]), ['image001.png@01D9']);
  assert.ok(!htmlToText(h).includes('⟦'));
});
