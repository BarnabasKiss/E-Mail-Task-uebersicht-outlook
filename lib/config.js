import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// %LOCALAPPDATA% gibt es nur unter Windows. Auf anderen Systemen gilt der XDG-Datenordner, damit dieselbe
// config.json überall funktioniert. "~" am Anfang steht für das Home-Verzeichnis.
const fallbackEnv = {
  LOCALAPPDATA: () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
};

const expandEnv = (s) =>
  s
    .replace(/^~(?=$|[\\/])/, os.homedir())
    .replace(/%([^%]+)%/g, (all, k) => process.env[k] ?? fallbackEnv[k]?.() ?? all);

const expandDeep = (v) => {
  if (typeof v === 'string') return expandEnv(v);
  if (Array.isArray(v)) return v.map(expandDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expandDeep(x)]));
  return v;
};

export function loadConfig(file = process.env.MAIL_APP_CONFIG || path.join(root, 'config.json')) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const cfg = expandDeep(JSON.parse(raw));
  cfg.root = root;
  // Dieselbe config.json wie unter Windows: aus "%LOCALAPPDATA%\\mail-app" darf kein Ordner mit Backslash im Namen werden.
  if (path.sep === '/') cfg.dataDir = cfg.dataDir.replace(/\\/g, '/');
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  return cfg;
}
