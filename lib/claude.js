// Ruft die lokale Claude-CLI (claude -p) ohne Werkzeuge auf. Aufrufe laufen nacheinander.
import { spawn } from 'node:child_process';

function extractJson(text) {
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`Keine JSON-Antwort von Claude: ${s.slice(0, 200)}`);
  return JSON.parse(s.slice(start, end + 1));
}

export function createClaude({ path: exe, model, timeoutMs = 180000, cwd }) {
  let chain = Promise.resolve();
  let running = 0;

  const runOnce = (prompt) =>
    new Promise((resolve, reject) => {
      const args = ['-p', '--model', model, '--tools', '', '--no-session-persistence', '--disable-slash-commands'];
      const child = spawn(exe, args, { cwd, windowsHide: true });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Claude: Zeitlimit nach ${timeoutMs / 1000}s`));
      }, timeoutMs);
      child.stdout.setEncoding('utf8').on('data', (d) => (out += d));
      child.stderr.setEncoding('utf8').on('data', (d) => (err += d));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(`Claude beendet mit Code ${code}: ${(err || out).slice(0, 300)}`));
        else resolve(out.trim());
      });
      // Beendet sich die CLI sofort (nicht angemeldet, Absturz), schlägt das Schreiben fehl; der Fehler steht dann im close-Ereignis, der Server läuft weiter
      child.stdin.on('error', () => {});
      child.stdin.end(prompt, 'utf8');
    });

  const run = (prompt) => {
    const p = chain.then(async () => {
      running += 1;
      try {
        return await runOnce(prompt);
      } finally {
        running -= 1;
      }
    });
    chain = p.catch(() => {});
    return p;
  };

  return {
    run,
    runJson: async (prompt) => extractJson(await run(prompt)),
    get busy() {
      return running > 0;
    },
  };
}
