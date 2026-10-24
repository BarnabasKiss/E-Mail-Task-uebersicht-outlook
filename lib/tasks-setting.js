// Aufgabenliste (Optionen → Aufgabenliste): wählen, welche Markdown-Datei die App für "Aufgabe übernehmen" bearbeitet.
// Die Wahl liegt in state.json und gilt vor `vault` aus config.json. Es werden nur Ordner und .md-Dateien aufgelistet.
import fs from 'node:fs';
import path from 'node:path';

const check = (file) => {
  const out = { path: file, exists: false, writable: false, headings: 0 };
  try {
    if (!fs.statSync(file).isFile()) return out;
    out.exists = true;
    fs.accessSync(file, fs.constants.W_OK);
    fs.accessSync(path.dirname(file), fs.constants.W_OK); // die Datei wird über eine Temp-Datei im selben Ordner ersetzt
    out.writable = true;
    out.headings = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^###\s+/.test(l)).length;
  } catch {}
  return out;
};

export const tasksInfo = (vault, configured) => ({ ...check(vault.file), configured, custom: path.resolve(vault.file) !== path.resolve(configured) });

/** Datei wählen (absoluter Pfad einer vorhandenen, beschreibbaren .md-Datei) oder mit null auf config.json zurückstellen. */
export function setTasksFile({ vault, store, configured }, p) {
  if (p === null) {
    store.del('settings', 'tasksPath');
    vault.setFile(configured);
    return tasksInfo(vault, configured);
  }
  const file = String(p || '').trim();
  if (!path.isAbsolute(file)) throw new Error('Bitte den vollständigen Pfad angeben (beginnt mit / oder einem Laufwerk).');
  if (!/\.md$/i.test(file)) throw new Error('Die Aufgabenliste muss eine Markdown-Datei (.md) sein.');
  const c = check(path.resolve(file));
  if (!c.exists) throw new Error('Diese Datei gibt es nicht. Die App legt keine Aufgabenliste neu an.');
  if (!c.writable) throw new Error('Die Datei oder ihr Ordner ist nicht beschreibbar.');
  store.set('settings', 'tasksPath', c.path);
  vault.setFile(c.path);
  return tasksInfo(vault, configured);
}

/** Inhalt eines Ordners: Unterordner und .md-Dateien (ohne versteckte). Ohne Angabe der Ordner der aktuellen Datei. */
export function browse(dir) {
  const abs = path.resolve(dir);
  const entries = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
  return {
    dir: abs,
    parent: path.dirname(abs) === abs ? null : path.dirname(abs),
    dirs: entries.filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b)),
    files: entries.filter((e) => e.isFile() && /\.md$/i.test(e.name)).map((e) => e.name).sort((a, b) => a.localeCompare(b)),
  };
}
