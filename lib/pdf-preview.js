// Vorschaubild der ersten PDF-Seite für den Hover in der Anhangsleiste (pdftoppm aus Poppler, dieselbe optionale Installation wie für die OCR).
// Fehlt das Programm oder ist das PDF kaputt, gibt es einfach keine Vorschau (der Aufrufer antwortet dann mit 415).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DPI = 60;
const TIMEOUT_MS = 15_000;

/** @returns {Promise<Buffer>} PNG der ersten Seite; wirft, wenn pdftoppm fehlt oder scheitert */
export async function renderFirstPage(pdf, tmpDir = os.tmpdir()) {
  const dir = fs.mkdtempSync(path.join(tmpDir, 'pdfprev-'));
  try {
    const input = path.join(dir, 'in.pdf');
    fs.writeFileSync(input, pdf);
    await new Promise((resolve, reject) => {
      const child = spawn('pdftoppm', ['-f', '1', '-l', '1', '-r', String(DPI), '-png', '-singlefile', input, path.join(dir, 'page')], { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('pdftoppm: Zeitlimit'));
      }, TIMEOUT_MS);
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e.code === 'ENOENT' ? new Error('pdftoppm ist nicht installiert') : e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`pdftoppm: Code ${code}`));
      });
    });
    return fs.readFileSync(path.join(dir, 'page.png'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
