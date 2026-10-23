import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { matchInline, createAttachments } from '../lib/attachments.js';

test('matchInline: contentId, dann Dateiname, dann Reihenfolge', () => {
  const items = [
    { id: 'A', name: 'logo.png', contentId: '<cid-logo>' },
    { id: 'B', name: 'image002.png' },
    { id: 'C', name: 'x.png' },
  ];
  const m = matchInline(['cid-logo', 'image002.png@01D9', 'was-anderes'], items);
  assert.equal(m.get('cid-logo'), 'A');
  assert.equal(m.get('image002.png@01D9'), 'B');
  assert.equal(m.get('was-anderes'), 'C');
  assert.equal(matchInline(['a', 'b'], [{ id: 'A', name: 'q' }]).size, 1);
});

const png = (n) => Buffer.alloc(n, 1);
function fakeN8n(inline) {
  return {
    listAttachments: async () => inline.map((a) => ({ contentType: 'image/png', isInline: true, ...a })),
    getAttachment: async (_m, id) => ({ name: id, contentType: 'image/png', contentBase64: png(5000).toString('base64') }),
  };
}

test('eingebettete Bilder: Pixel fallen weg, Marken bekommen die Anhang-ID, echte Anhänge bleiben getrennt', async () => {
  const n8n = fakeN8n([{ id: 'px', name: 'pixel.png', size: 100, contentId: 'px' }, { id: 'shot', name: 'shot.png', size: 9000, contentId: 'shot' }]);
  n8n.listAttachments = async () => [
    { id: 'px', name: 'pixel.png', size: 100, contentType: 'image/png', isInline: true, contentId: 'px' },
    { id: 'shot', name: 'shot.png', size: 9000, contentType: 'image/png', isInline: true, contentId: 'shot' },
    { id: 'doc', name: 'a.pdf', size: 9000, contentType: 'application/pdf', isInline: false },
  ];
  const att = createAttachments({ n8n, tmpDir: os.tmpdir() });
  const p = { mail_id: 'M1' };
  assert.deepEqual((await att.list(p)).map((a) => a.id), ['doc']);
  assert.deepEqual((await att.listInline(p)).map((a) => a.id), ['shot']);
  const { text, images } = await att.resolveImages(p, 'a\n⟦bild:px⟧\nb\n⟦bild:shot⟧\nc', /⟦bild:([^⟧]*)⟧/g);
  assert.equal(text, 'a\n\nb\n⟦bild:shot⟧\nc');
  assert.deepEqual(images, ['shot']);
  assert.equal((await att.get(p, 'shot')).buffer.length, 5000); // Bild lässt sich über get() laden
});

test('readAll liest Inline-Bilder nur per OCR, kurzer OCR-Text zählt nicht, Schalter schaltet ab', async () => {
  const n8n = {
    listAttachments: async () => [
      { id: 'shot', name: 'shot.png', size: 9000, contentType: 'image/png', isInline: true },
      { id: 'logo', name: 'logo.png', size: 9000, contentType: 'image/png', isInline: true },
    ],
    getAttachment: async (_m, id) => ({ name: id, contentType: 'image/png', contentBase64: png(5000).toString('base64') }),
  };
  // OCR-Attrappe: "shot" liefert genug Text, "logo" nur ein Wort (zählt nicht). Plattformunabhängig, ohne tesseract.
  const extract = async ({ name }) => ({ text: name === 'logo.png' ? 'Logo' : 'Fehler 500 beim Speichern der Akte' });
  const make = (o = {}) => createAttachments({ n8n, tmpDir: os.tmpdir(), extract, ...o });
  const out = await make().readAll({ mail_id: 'M2' });
  assert.equal(out.length, 1);
  assert.match(out[0].name, /^Bild im Text 1$/);
  assert.match(out[0].text, /Fehler 500/);
  assert.equal(out[0].attId, 'shot');
  assert.deepEqual(await make({ inlineOcr: false }).readAll({ mail_id: 'M3' }), []);
  const onlyLogo = { ...n8n, listAttachments: async () => [{ id: 'logo', name: 'logo.png', size: 9000, contentType: 'image/png', isInline: true }] };
  assert.deepEqual(await make({ n8n: onlyLogo }).readAll({ mail_id: 'M4' }), []);
});
