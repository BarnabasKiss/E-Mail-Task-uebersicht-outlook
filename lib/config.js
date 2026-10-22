import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const expandEnv = (s) => s.replace(/%([^%]+)%/g, (all, k) => process.env[k] ?? all);

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
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  return cfg;
}
