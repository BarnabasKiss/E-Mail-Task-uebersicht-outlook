// Aufgabenliste wählen (lib/tasks-setting.js): Prüfungen, Wechsel der Datei im Vault, Ordner durchsuchen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../lib/vault.js';
import { createStore } from '../lib/store.js';
import { setTasksFile, tasksInfo, browse } from '../lib/tasks-setting.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-setting-'));
  const a = path.join(dir, 'a.md');
  const b = path.join(dir, 'sub', 'b.md');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(a, '### Eins\n- [ ] x\n');
  fs.writeFileSync(b, '### Zwei\n### Drei\n');
  const vault = createVault({ dir, tasksFile: 'a.md', backupDir: path.join(dir, 'bk') });
  const store = createStore(path.join(dir, 'state.json'));
  return { dir, a, b, vault, store, ctx: { vault, store, configured: a } };
}

test('Datei wechseln: Vault schreibt danach in die neue Datei, Wahl wird gemerkt, Zurückstellen geht', () => {
  const { a, b, vault, store, ctx } = setup();
  assert.equal(tasksInfo(vault, a).custom, false);
  const info = setTasksFile(ctx, b);
  assert.equal(info.headings, 2);
  assert.equal(info.custom, true);
  assert.equal(store.get('settings', 'tasksPath'), b);
  assert.deepEqual(vault.headings(), ['Zwei', 'Drei']);
  vault.addTask({ heading: 'Zwei', text: 'neu' });
  assert.match(fs.readFileSync(b, 'utf8'), /- \[ \] neu/);
  assert.equal(fs.readFileSync(a, 'utf8'), '### Eins\n- [ ] x\n');
  assert.equal(setTasksFile(ctx, null).custom, false);
  assert.equal(store.get('settings', 'tasksPath'), undefined);
  assert.deepEqual(vault.headings(), ['Eins']);
});

test('ungültige Eingaben werden abgelehnt und ändern nichts', () => {
  const { dir, a, vault, store, ctx } = setup();
  assert.throws(() => setTasksFile(ctx, 'relativ/x.md'), /vollständigen Pfad/);
  assert.throws(() => setTasksFile(ctx, path.join(dir, 'a.txt')), /Markdown/);
  assert.throws(() => setTasksFile(ctx, path.join(dir, 'fehlt.md')), /gibt es nicht/);
  assert.throws(() => setTasksFile(ctx, dir + '.md'), /gibt es nicht/);
  assert.equal(vault.file, a);
  assert.equal(store.get('settings', 'tasksPath'), undefined);
});

test('browse listet Ordner und .md-Dateien, keine versteckten', () => {
  const { dir } = setup();
  fs.writeFileSync(path.join(dir, '.versteckt.md'), '');
  fs.writeFileSync(path.join(dir, 'x.png'), '');
  const r = browse(dir);
  assert.deepEqual(r.dirs, ['sub']);
  assert.deepEqual(r.files, ['a.md']);
  assert.equal(r.parent, path.dirname(dir));
});
