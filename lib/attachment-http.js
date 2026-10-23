// Auslieferung eines Anhangs an den Browser. Sicherheit zuerst: Anhänge dürfen nie als HTML oder Skript im Ursprung der App laufen.
import { extractText, kindOf } from './extract-text.js';
import { send } from './http.js';

// Nur diese Typen zeigt der Browser direkt an. Alles andere (auch HTML und SVG, die Skripte enthalten können)
// wird zum Download gezwungen.
const INLINE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const PREVIEW_AS_TEXT = ['text', 'docx', 'xlsx', 'pptx'];

/**
 * file: { name, contentType, buffer }. Mit download=true immer als Datei.
 * Ohne download: PDF und Bilder inline, Office/Text/HTML als Nur-Text-Vorschau (der Browser kann sie nicht anzeigen), sonst Datei.
 */
export async function serveAttachment(res, file, { download = false } = {}) {
  const type = String(file.contentType).split(';')[0].trim().toLowerCase();
  if (!download && !INLINE_TYPES.has(type) && PREVIEW_AS_TEXT.includes(kindOf({ name: file.name, contentType: file.contentType }))) {
    const ex = await extractText({ name: file.name, contentType: file.contentType }, file.buffer);
    return send(res, 200, ex.text ?? `(Keine Vorschau: ${ex.reason})`, { 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=600' });
  }
  const inline = !download && INLINE_TYPES.has(type);
  res.writeHead(200, {
    'content-type': inline ? type : 'application/octet-stream',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'content-length': file.buffer.length,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=600',
    ...(type === 'application/pdf' ? {} : { 'content-security-policy': "sandbox; default-src 'none'; img-src 'self' data:" }),
  });
  res.end(file.buffer);
}
