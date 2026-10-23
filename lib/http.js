// Kleine HTTP-Helfer für die Schnittstelle: Antworten senden, JSON lesen, statische Dateien aus public/ ausliefern.
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

/** Objekt als JSON, Text und Buffer unverändert. Nie zwischenspeichern, die Daten ändern sich laufend. */
export const send = (res, code, body, headers = {}) => {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
};

/** Liest einen JSON-Body (höchstens 1 MB). Leerer Body ergibt {}. */
export const readJson = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (d) => {
      data += d;
      if (data.length > 1e6) reject(new Error('Anfrage zu groß'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Ungültiges JSON'));
      }
    });
  });

/** Liest einen Body als Bytes (höchstens max Bytes, sonst Fehler). */
export const readBuffer = (req, max) =>
  new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (d) => {
      size += d.length;
      if (size > max) {
        if (size - d.length <= max) reject(new Error('Anfrage zu groß'));
        // den Rest verwerfen, ohne die Verbindung zu kappen: so kann die Route noch mit einer Meldung antworten
      } else parts.push(d);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });

/** Liefert eine Datei aus publicDir. Pfade außerhalb von publicDir (../) werden nicht ausgeliefert. */
export function serveStatic(res, publicDir, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(publicDir, rel);
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Nicht gefunden');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
