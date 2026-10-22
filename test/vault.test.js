import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault, formatTask } from '../lib/vault.js';

const SAMPLE = [
  '',
  '### VEX & Vermessung',
  '- [x] Mail an Expira! [[💼 Daily Notes#18.08.2026]] ✅ 2026-08-19',
  '',
  '### Professionisten ',
  '- [ ] Umfrage für neue Funktionen [[💼 Daily Notes#19.10.26]] ➕ 2026-10-20',
  '- [b] Funktion fixen [[💼 Daily Notes#19.10.26]] ⏫ ➕ 2026-10-20',
  '    - [ ] Unteraufgabe',
  '',
  '### Sonstiges',
  '- [x] Etwas erledigt ✅ 2026-10-13',
  '',
].join('\n');

function setup({ eol = '\n', bom = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
  const file = path.join(dir, 'Aufgaben.md');
  fs.writeFileSync(file, (bom ? '﻿' : '') + SAMPLE.replace(/\n/g, eol), 'utf8');
  const vault = createVault({ dir, tasksFile: 'Aufgaben.md', backupDir: path.join(dir, 'bk') });
  return { dir, file, vault, lines: () => fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/) };
}

const task = { text: 'Max zurückrufen', link: 'https://outlook.example/x(1)', due: '2026-10-25', important: false };

test('formatTask: Link vor den Emoji-Feldern, Klammern kodiert', () => {
  const t = formatTask({ ...task, today: '2026-10-20' });
  assert.equal(t, '- [ ] Max zurückrufen [✉ Mail](https://outlook.example/x%281%29) 📅 2026-10-25 ➕ 2026-10-20');
  assert.ok(formatTask({ text: 'a', important: true, today: '2026-10-20' }).startsWith('- [!] a'));
});

test('liest Überschriften (Leerzeichen am Ende ignoriert)', () => {
  assert.deepEqual(setup().vault.headings(), ['VEX & Vermessung', 'Professionisten', 'Sonstiges']);
});

test('fügt als erste Aufgabe unter bestehender Überschrift ein, nichts anderes ändert sich', () => {
  const s = setup();
  const before = s.lines();
  const r = s.vault.addTask({ ...task, heading: 'Professionisten' });
  const after = s.lines();
  const at = before.findIndex((l) => l.startsWith('### Professionisten')) + 1;
  assert.equal(after[at], r.inserted);
  assert.deepEqual([...after.slice(0, at), ...after.slice(at + 1)], before);
  assert.ok(fs.readdirSync(path.join(s.dir, 'bk')).length === 1, 'Backup angelegt');
});

test('neue Überschrift kommt ganz nach oben, vor die bisher oberste', () => {
  const s = setup();
  const before = s.lines();
  const r = s.vault.addTask({ ...task, newHeading: 'Mail-Automatisierung' });
  const after = s.lines();
  assert.equal(r.createdHeading, true);
  assert.equal(after[1], '### Mail-Automatisierung');
  assert.equal(after[2], r.inserted);
  assert.equal(after[3], '');
  assert.deepEqual(after.slice(4), before.slice(1));
});

test('doppelte Aufgabe wird nicht noch einmal eingefügt', () => {
  const s = setup();
  s.vault.addTask({ ...task, heading: 'Sonstiges' });
  assert.deepEqual(s.vault.addTask({ ...task, heading: 'Sonstiges' }), { duplicate: true });
});

test('unbekannte Überschrift und leerer Text werden abgelehnt, Datei bleibt unverändert', () => {
  const s = setup();
  const before = fs.readFileSync(s.file, 'utf8');
  assert.throws(() => s.vault.addTask({ ...task, heading: 'Gibt es nicht' }), /nicht gefunden/);
  assert.throws(() => s.vault.addTask({ ...task, text: ' ', heading: 'Sonstiges' }), /Aufgabentext/);
  assert.equal(fs.readFileSync(s.file, 'utf8'), before);
});

test('behält Windows-Zeilenenden und BOM', () => {
  const s = setup({ eol: '\r\n', bom: true });
  s.vault.addTask({ ...task, heading: 'Sonstiges' });
  const raw = fs.readFileSync(s.file, 'utf8');
  assert.ok(raw.startsWith('﻿'));
  assert.ok(raw.includes('\r\n') && !/[^\r]\n/.test(raw));
});
