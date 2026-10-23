import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { kindOf, readZip, extractText } from '../lib/extract-text.js';

// Minimaler ZIP-Schreiber (deflate), nur für die Tests.
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const data = zlib.deflateRawSync(Buffer.from(content));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(content), 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(Buffer.byteLength(content), 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

test('kindOf erkennt Typen an Endung und Content-Type', () => {
  assert.equal(kindOf({ name: 'a.PDF' }), 'pdf');
  assert.equal(kindOf({ name: 'x', contentType: 'application/pdf' }), 'pdf');
  assert.equal(kindOf({ name: 'b.docx' }), 'docx');
  assert.equal(kindOf({ name: 'foto.jpg' }), 'image');
  assert.equal(kindOf({ name: 'notiz.txt' }), 'text');
  assert.equal(kindOf({ name: 'programm.exe', contentType: 'application/octet-stream' }), null);
});

test('readZip liest deflate-Einträge', () => {
  const z = readZip(zip({ 'a.txt': 'Hallo', 'dir/b.txt': 'Welt' }));
  assert.equal(z.get('a.txt')().toString(), 'Hallo');
  assert.equal(z.get('dir/b.txt')().toString(), 'Welt');
});

test('docx: Absätze und Entities', async () => {
  const buf = zip({ 'word/document.xml': '<w:document><w:p><w:r><w:t>Rechnung &amp; Mahnung</w:t></w:r></w:p><w:p><w:r><w:t>Zeile 2</w:t></w:r></w:p></w:document>' });
  assert.deepEqual(await extractText({ name: 'r.docx' }, buf), { text: 'Rechnung & Mahnung\nZeile 2' });
});

test('xlsx: geteilte Strings und Zahlen als Tabelle', async () => {
  const buf = zip({
    'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Summe</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>X</t></is></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>',
  });
  assert.equal((await extractText({ name: 't.xlsx' }, buf)).text, '--- Blatt 1 ---\nName\tSumme\nX\t42');
});

test('Text und HTML', async () => {
  assert.equal((await extractText({ name: 'a.txt' }, Buffer.from('Zeile\r\n\r\n\r\n\r\nEnde'))).text, 'Zeile\n\nEnde');
  assert.equal((await extractText({ name: 'a.html' }, Buffer.from('<p>Hallo <b>Welt</b></p>'))).text, 'Hallo Welt');
});

test('unbekannter Typ und leerer Text liefern einen Grund statt Text', async () => {
  assert.equal((await extractText({ name: 'a.exe' }, Buffer.from('x'))).text, null);
  assert.match((await extractText({ name: 'a.txt' }, Buffer.from('  '))).reason, /Kein Text/);
});
