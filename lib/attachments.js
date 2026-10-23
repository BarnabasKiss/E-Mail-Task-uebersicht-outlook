// Mail-Anhänge: Liste und Download über n8n, Textauszug für die KI.
// Die KI sieht nie die Datei selbst, nur den Text daraus, und der wird vorher pseudonymisiert (siehe drafts.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { htmlToText } from './html.js';
import { isTestMail } from './test-mail.js';

export const MAX_BYTES = 25 * 1024 * 1024; // größere Anhänge werden weder angezeigt noch gelesen
const CACHE_MS = 10 * 60 * 1000;
const CACHE_BYTES = 60 * 1024 * 1024;

const EXT_TEXT = new Set(['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'log', 'ics', 'eml', 'html', 'htm']);
const EXT_IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff']);
// Eingebettete Bilder: Pixel und Logos unter dieser Größe werden nicht angezeigt und nicht gelesen. Für die KI zählt nur
// OCR-Text, und der muss mindestens so lang sein (Logos liefern höchstens ein Wort).
const INLINE_MIN_BYTES = 400;
const INLINE_OCR_MIN_BYTES = 4 * 1024;
const INLINE_OCR_MIN_CHARS = 20;
const INLINE_OCR_MAX = 5;
const INLINE_SHOW_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ext = (name) => String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';

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

// Testmails haben keinen Anhang in Outlook: Dateien aus <testDir>/<mail_id>/ ersetzen ihn (nur zum Ausprobieren).
const testFiles = (testDir, proposal) => {
  const dir = path.join(testDir, String(proposal.mail_id).replace(/[^\w.-]/g, '_'));
  try {
    return fs.readdirSync(dir).map((name) => ({ name, file: path.join(dir, name) }));
  } catch {
    return [];
  }
};
const TEST_INLINE = /^bild-/i; // Testdateien "bild-*" gelten als eingebettete Bilder
const TEST_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

/**
 * Ordnet die cid-Werte aus dem Mailtext den eingebetteten Bildern zu. Zuerst nach contentId (falls die Schnittstelle sie
 * liefert), dann nach Dateiname ("image001.png@01D..." heißt oft wie die Datei), zuletzt der Reihe nach.
 * @returns {Map<string, string>} cid -> Anhang-ID (nur zugeordnete)
 */
export function matchInline(cids, items) {
  const norm = (s) => String(s || '').replace(/^<|>$/g, '').toLowerCase();
  const out = new Map();
  const free = [...items];
  const take = (cid, pred) => {
    const i = free.findIndex(pred);
    if (i < 0) return false;
    out.set(cid, free.splice(i, 1)[0].id);
    return true;
  };
  const unique = [...new Set(cids)];
  const rest = unique.filter((cid) => !take(cid, (a) => a.contentId && norm(a.contentId) === norm(cid)));
  const rest2 = rest.filter((cid) => !take(cid, (a) => norm(a.name) === norm(cid) || norm(a.name) === norm(cid.split('@')[0])));
  rest2.forEach((cid) => take(cid, () => true));
  return out;
}

// extract: Textauszug aus Dateiinhalten; nur für Tests austauschbar (ohne tesseract oder Shell-Attrappen)
export function createAttachments({ n8n, tmpDir, testDir, inlineOcr = true, extract = extractText }) {
  const lists = new Map(); // mail_id -> { at, items }
  const files = new Map(); // mail_id|attId -> { at, name, contentType, buffer }
  const texts = new Map(); // mail_id|attId -> Ergebnis von extractText
  let bytes = 0;

  const fresh = (hit) => hit && Date.now() - hit.at < CACHE_MS;

  function evict() {
    for (const [k, v] of files) {
      if (bytes <= CACHE_BYTES && Date.now() - v.at < CACHE_MS) break;
      bytes -= v.buffer.length;
      files.delete(k);
    }
  }

  /** Alle Anhänge der Mail inklusive eingebetteter Bilder (isInline). Echte Anhänge liefert list(). */
  async function listAll(proposal) {
    if (isTestMail(proposal)) {
      return testDir
        ? testFiles(testDir, proposal).map(({ name, file }) => {
            const size = fs.statSync(file).size;
            const item = { id: name, name, contentType: TEST_TYPES[ext(name)] || '', size, tooBig: false, isInline: TEST_INLINE.test(name), contentId: name };
            return { ...item, readable: kindOf(item) !== null };
          })
        : [];
    }
    const hit = lists.get(proposal.mail_id);
    if (fresh(hit)) return hit.items;
    const items = (await n8n.listAttachments(proposal.mail_id))
      .map((a) => ({
        id: a.id,
        isInline: !!a.isInline,
        contentId: a.contentId || '',
        name: a.name || '(ohne Namen)',
        contentType: a.contentType || '',
        size: a.size || 0,
        tooBig: (a.size || 0) > MAX_BYTES,
        readable: kindOf(a) !== null && (a.size || 0) <= MAX_BYTES,
      }));
    lists.set(proposal.mail_id, { at: Date.now(), items });
    return items;
  }

  /** Echte Anhänge (ohne eingebettete Bilder wie Signaturlogos) mit Hinweis, ob die KI sie lesen kann. */
  const list = async (proposal) => (await listAll(proposal)).filter((a) => !a.isInline);

  const showable = (a) => !a.tooBig && a.size >= INLINE_MIN_BYTES && INLINE_SHOW_TYPES.has(String(a.contentType).split(';')[0].trim().toLowerCase());

  /** Eingebettete Bilder, die sich anzeigen lassen (ohne Tracking-Pixel). */
  async function listInline(proposal) {
    return (await listAll(proposal)).filter((a) => a.isInline && showable(a));
  }

  /** Ersetzt cid-Marken im Anzeigetext durch Marken mit Anhang-ID. Unbekannte Marken verschwinden. */
  async function resolveImages(proposal, text, marks) {
    const cids = [...text.matchAll(marks)].map((m) => m[1]);
    if (!cids.length) return { text, images: [] };
    let map;
    try {
      // Zuordnung gegen alle eingebetteten Bilder (auch Pixel), sonst verrutscht die Reihenfolge; gezeigt wird nur Brauchbares.
      const inline = (await listAll(proposal)).filter((a) => a.isInline);
      const shown = new Set(inline.filter(showable).map((a) => a.id));
      map = new Map([...matchInline(cids, inline)].filter(([, id]) => shown.has(id)));
    } catch {
      map = new Map();
    }
    return { text: text.replace(marks, (all, cid) => (map.has(cid) ? `⟦bild:${map.get(cid)}⟧` : '')).replace(/\n{3,}/g, '\n\n'), images: [...map.values()] };
  }

  async function get(proposal, attachmentId) {
    const key = `${proposal.mail_id}|${attachmentId}`;
    const hit = files.get(key);
    if (fresh(hit)) return hit;
    const known = (await listAll(proposal)).find((a) => a.id === attachmentId);
    if (!known) throw new Error('Anhang nicht gefunden');
    if (isTestMail(proposal)) {
      const t = testFiles(testDir, proposal).find((f) => f.name === attachmentId);
      return { at: Date.now(), name: known.name, contentType: known.contentType, buffer: fs.readFileSync(t.file) };
    }
    if (known.tooBig) throw new Error(`Anhang ist größer als ${MAX_BYTES / 1024 / 1024} MB`);
    const out = await n8n.getAttachment(proposal.mail_id, attachmentId);
    const file = { at: Date.now(), name: out.name || known.name, contentType: out.contentType || known.contentType, buffer: Buffer.from(out.contentBase64 || '', 'base64') };
    files.set(key, file);
    bytes += file.buffer.length;
    evict();
    return file;
  }

  async function textOf(proposal, a) {
    const key = `${proposal.mail_id}|${a.id}`;
    let ex = texts.get(key);
    if (!ex) {
      const f = await get(proposal, a.id);
      ex = await extract(a, f.buffer, tmpDir);
      texts.set(key, ex);
    }
    return ex;
  }

  /** Text aus eingebetteten Bildern (Screenshots): nur OCR, nur wenn genug Text erkannt wird. Fehler überspringen das Bild. */
  async function readInline(proposal) {
    if (!inlineOcr) return [];
    const result = [];
    try {
      const images = (await listInline(proposal)).filter((a) => a.size >= INLINE_OCR_MIN_BYTES).slice(0, INLINE_OCR_MAX);
      for (const a of images) {
        try {
          const ex = await textOf(proposal, a);
          if (ex.text && ex.text.length >= INLINE_OCR_MIN_CHARS) result.push({ name: `Bild im Text ${result.length + 1}`, contentType: a.contentType, text: ex.text, attId: a.id });
        } catch {
          // OCR fehlgeschlagen (z. B. tesseract fehlt): das Bild zählt einfach nicht
        }
      }
    } catch {
      // Anhangliste nicht erreichbar: dann gibt es auch keine Bildtexte
    }
    return result;
  }

  /** Textauszüge aller lesbaren Anhänge und Bilder im Text. Fehler pro Anhang stehen in `reason`, nie als Ausnahme. */
  async function readAll(proposal) {
    const result = [];
    for (const a of await list(proposal)) {
      if (!a.readable) {
        result.push({ name: a.name, contentType: a.contentType, text: null, reason: a.tooBig ? 'Zu groß' : 'Dateityp wird nicht gelesen' });
        continue;
      }
      const key = `${proposal.mail_id}|${a.id}`;
      let ex = texts.get(key);
      if (!ex) {
        try {
          const f = await get(proposal, a.id);
          ex = await extract(a, f.buffer, tmpDir);
        } catch (e) {
          result.push({ name: a.name, contentType: a.contentType, text: null, reason: e.message });
          continue; // nicht merken, beim nächsten Mal erneut versuchen
        }
        texts.set(key, ex);
      }
      result.push({ name: a.name, contentType: a.contentType, ...ex });
    }
    result.push(...(await readInline(proposal)));
    return result;
  }

  return { list, listInline, resolveImages, get, readAll };
}
