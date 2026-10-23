// Textauszug aus Dateien (nur Text, nie die Datei selbst): Text und HTML, Word, Excel, PowerPoint (ZIP/XML ohne Zusatzpaket),
// PDF (pdftotext) und Bilder (tesseract, OCR). Die beiden Programme sind optional; fehlt eines, steht der Grund im Ergebnis.
// Der Anhang-Dienst (Liste, Cache, Bilder im Text) steht in attachments.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { htmlToText } from './html.js';

const EXT_TEXT = new Set(['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'log', 'ics', 'eml', 'html', 'htm']);
const EXT_IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff']);
/** Dateiendung in Kleinbuchstaben ohne Punkt, '' wenn keine. */
export const ext = (name) => String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';

/** Welche Art von Textauszug ist für diesen Anhang möglich? null = keiner. */
export function kindOf({ name, contentType }) {
  const e = ext(name);
  const t = String(contentType || '').toLowerCase();
  if (e === 'pdf' || t === 'application/pdf') return 'pdf';
  if (e === 'docx') return 'docx';
  if (e === 'xlsx') return 'xlsx';
  if (e === 'pptx') return 'pptx';
  if (EXT_IMAGE.has(e) || t.startsWith('image/')) return 'image';
  if (EXT_TEXT.has(e) || t.startsWith('text/')) return 'text';
  return null;
}

// --- ZIP (nur Lesen, reicht für docx/xlsx/pptx)
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Kein gültiges ZIP');
  const entries = new Map();
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0 && buf.readUInt32LE(p) === 0x02014b50; n -= 1) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    entries.set(name, () => {
      const raw = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(raw) : raw;
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

const xmlText = (xml) => decodeXml(xml.replace(/<[^>]+>/g, ''));

function docxText(buf) {
  const doc = readZip(buf).get('word/document.xml');
  if (!doc) throw new Error('word/document.xml fehlt');
  return decodeXml(
    doc()
      .toString('utf8')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

function pptxText(buf) {
  const zip = readZip(buf);
  const slides = [...zip.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  return slides
    .map((k, i) => `--- Folie ${i + 1} ---\n${decodeXml(zip.get(k)().toString('utf8').replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, ''))}`)
    .join('\n');
}

function xlsxText(buf) {
  const zip = readZip(buf);
  const shared = zip.has('xl/sharedStrings.xml')
    ? [...zip.get('xl/sharedStrings.xml')().toString('utf8').matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1]))
    : [];
  const sheets = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  const out = [];
  sheets.forEach((k, i) => {
    out.push(`--- Blatt ${i + 1} ---`);
    for (const row of zip.get(k)().toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [...row[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
        const type = /\bt="([^"]+)"/.exec(c[1])?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || '')?.[1];
        if (type === 's') return shared[+v] ?? '';
        if (type === 'inlineStr') return xmlText(/<is>([\s\S]*?)<\/is>/.exec(c[2] || '')?.[1] || '');
        return v === undefined ? '' : decodeXml(v);
      });
      if (cells.some(Boolean)) out.push(cells.join('\t'));
    }
  });
  return out.join('\n');
}

// --- externe Programme (optional): pdftotext (poppler) und tesseract
function run(cmd, args, { input, timeoutMs = 60000, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, env: env ? { ...process.env, ...env } : process.env });
    const chunks = [];
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd}: Zeitlimit`));
    }, timeoutMs);
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.setEncoding('utf8').on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e.code === 'ENOENT' ? new Error(`${cmd} ist nicht installiert`) : e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${cmd}: ${err.slice(0, 200) || `Code ${code}`}`));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function pdfText(buf, tmpDir) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `att-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(file, buf);
  try {
    return await run('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-']);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// tesseract ohne Systeminstallation: Liegt es entpackt in <dir> (usr/bin, usr/lib64, usr/share/tesseract/tessdata),
// nimmt die App dieses. Sonst gilt das tesseract aus dem PATH.
let tess = { cmd: 'tesseract', env: undefined };
export function useLocalTesseract(dir) {
  const cmd = path.join(dir, 'usr', 'bin', 'tesseract');
  if (!fs.existsSync(cmd)) return false;
  tess = { cmd, env: { LD_LIBRARY_PATH: path.join(dir, 'usr', 'lib64'), TESSDATA_PREFIX: path.join(dir, 'usr', 'share', 'tesseract', 'tessdata') } };
  return true;
}

async function imageText(buf) {
  const opts = { input: buf, timeoutMs: 90000, env: tess.env };
  try {
    return await run(tess.cmd, ['stdin', 'stdout', '-l', 'deu+eng'], opts);
  } catch (e) {
    if (/nicht installiert/.test(e.message)) throw e;
    return run(tess.cmd, ['stdin', 'stdout'], opts); // Sprachpaket deu fehlt
  }
}

/** @returns {Promise<{text: string|null, reason?: string}>} */
export async function extractText({ name, contentType }, buf, tmpDir = os.tmpdir()) {
  const kind = kindOf({ name, contentType });
  try {
    let text;
    if (kind === 'text') {
      const raw = buf.toString('utf8');
      text = ext(name) === 'html' || ext(name) === 'htm' || /html/i.test(contentType || '') ? htmlToText(raw) : raw;
    } else if (kind === 'docx') text = docxText(buf);
    else if (kind === 'xlsx') text = xlsxText(buf);
    else if (kind === 'pptx') text = pptxText(buf);
    else if (kind === 'pdf') text = await pdfText(buf, tmpDir);
    else if (kind === 'image') text = await imageText(buf);
    else return { text: null, reason: 'Dateityp wird nicht gelesen' };
    text = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return text ? { text } : { text: null, reason: kind === 'pdf' || kind === 'image' ? 'Kein Text erkannt (gescannt oder reines Bild)' : 'Kein Text enthalten' };
  } catch (e) {
    return { text: null, reason: e.message };
  }
}
