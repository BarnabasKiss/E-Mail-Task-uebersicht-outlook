// Gemeinsame Vorbereitung der Oberflächen-Tests: ein simulierter Browser (jsdom) mit der echten index.html.
// jsdom ist nur eine Entwicklungs-Abhängigkeit (npm install). Fehlt es, überspringen sich die UI-Tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SKIP = 'jsdom nicht installiert (npm install)';

let bodyHtml = '';
/** Setzt die Seite auf den Stand der index.html zurück (jeder Test startet frisch). */
export const resetBody = () => {
  document.body.innerHTML = bodyHtml;
};

/** @returns {Promise<object|null>} das Fenster, oder null ohne jsdom. Setzt document, window usw. als Globals. */
export async function setupDom() {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    return null;
  }
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  bodyHtml = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  const dom = new JSDOM(html, { url: 'http://localhost:4711/', pretendToBeVisual: true });
  const w = dom.window;
  w.Element.prototype.scrollIntoView = () => {}; // fehlt in jsdom
  Object.assign(globalThis, {
    window: w,
    document: w.document,
    Node: w.Node,
    location: w.location,
    history: w.history,
    localStorage: w.localStorage,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
  });
  return w;
}

// Unter Windows verlangt der Import absolute Pfade als file://-URL
export const importApp = (rel) => import(pathToFileURL(path.join(root, 'public/js', rel)).href);
export const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
