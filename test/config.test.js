import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../lib/config.js';

test('Windows-Pfad mit %LOCALAPPDATA% wird unter Linux/macOS zu einem normalen Pfad', { skip: path.sep !== '/' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  const prev = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = dir;
  try {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify({ dataDir: '%LOCALAPPDATA%\\mail-app' }));
    const cfg = loadConfig(file);
    assert.equal(cfg.dataDir, path.join(dir, 'mail-app'));
    assert.ok(fs.statSync(cfg.dataDir).isDirectory());
  } finally {
    if (prev === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
