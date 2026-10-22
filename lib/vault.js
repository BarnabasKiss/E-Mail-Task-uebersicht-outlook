// Einzige Stelle, die "📋 3 Aufgaben.md" anfasst. Regeln wie in der Todo-Automation:
// - offene Aufgaben kommen als ERSTE Aufgabe unter ihre ###-Überschrift
// - neue Überschriften kommen GANZ OBEN vor die bisher oberste
// - bestehende Zeilen werden nie geändert, gelöscht oder umsortiert
// - vor jedem Schreiben Backup, danach Prüfung; bei Abweichung wird das Backup zurückgespielt
import fs from 'node:fs';
import path from 'node:path';

const HEADING_RE = /^###\s+(.*)$/;
const BACKUP_DAYS = 14;

const todayIso = () => new Date().toISOString().slice(0, 10);

export function formatTask({ text, link, due, important, today = todayIso() }) {
  const clean = String(text).replace(/\s*\n\s*/g, ' ').trim();
  const parts = [`- [${important ? '!' : ' '}] ${clean}`];
  if (link) parts.push(`[✉ Mail](${link.replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')})`);
  if (due) parts.push(`📅 ${due}`);
  parts.push(`➕ ${today}`);
  return parts.join(' ');
}

export function createVault({ dir, tasksFile, backupDir }) {
  const file = path.join(dir, tasksFile);

  const read = () => {
    const raw = fs.readFileSync(file, 'utf8');
    const bom = raw.startsWith('﻿');
    const body = bom ? raw.slice(1) : raw;
    return { lines: body.split(/\r?\n/), eol: body.includes('\r\n') ? '\r\n' : '\n', bom, mtime: fs.statSync(file).mtimeMs };
  };

  const serialize = ({ lines, eol, bom }) => (bom ? '﻿' : '') + lines.join(eol);

  const headingsOf = (lines) =>
    lines.flatMap((l, i) => {
      const m = HEADING_RE.exec(l);
      return m ? [{ title: m[1].trim(), line: i }] : [];
    });

  function pruneBackups() {
    if (!fs.existsSync(backupDir)) return;
    const limit = Date.now() - BACKUP_DAYS * 86400000;
    for (const d of fs.readdirSync(backupDir)) {
      const p = path.join(backupDir, d);
      if (fs.statSync(p).mtimeMs < limit) fs.rmSync(p, { recursive: true, force: true });
    }
  }

  function addTask({ heading, newHeading, text, link, due, important }) {
    if (!text?.trim()) throw new Error('Aufgabentext fehlt');
    if (!heading && !newHeading?.trim()) throw new Error('Überschrift fehlt');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const doc = read();
      const clean = text.replace(/\s*\n\s*/g, ' ').trim();
      if (doc.lines.some((l) => TASK_RE_HAS_TEXT(l, clean))) return { duplicate: true };

      const task = formatTask({ text, link, due, important });
      const heads = headingsOf(doc.lines);
      let insertAt;
      let block;
      let createdHeading = false;
      if (heading) {
        const h = heads.find((x) => x.title.toLowerCase() === heading.trim().toLowerCase());
        if (!h) throw new Error(`Überschrift nicht gefunden: ${heading}`);
        insertAt = h.line + 1;
        block = [task];
      } else {
        insertAt = heads.length ? heads[0].line : doc.lines.findIndex((l) => l.trim() !== '');
        if (insertAt < 0) insertAt = 0;
        block = [`### ${newHeading.trim()}`, task, ''];
        createdHeading = true;
      }

      const expected = [...doc.lines.slice(0, insertAt), ...block, ...doc.lines.slice(insertAt)];

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const bk = path.join(backupDir, stamp);
      fs.mkdirSync(bk, { recursive: true });
      fs.copyFileSync(file, path.join(bk, tasksFile));

      if (fs.statSync(file).mtimeMs !== doc.mtime) continue; // Datei hat sich inzwischen geändert, neu lesen

      const tmp = path.join(dir, `.${tasksFile}.mail-app.tmp`);
      fs.writeFileSync(tmp, serialize({ ...doc, lines: expected }), 'utf8');
      fs.renameSync(tmp, file);

      const after = read().lines;
      const ok = after.length === expected.length && after.every((l, i) => l === expected[i]);
      if (!ok) {
        fs.copyFileSync(path.join(bk, tasksFile), file);
        throw new Error('Prüfung nach dem Schreiben fehlgeschlagen, Backup wurde zurückgespielt');
      }
      pruneBackups();
      return { inserted: task, heading: heading || newHeading.trim(), createdHeading, backup: bk };
    }
    throw new Error('Aufgabendatei wurde währenddessen geändert, bitte erneut versuchen');
  }

  return { file, headings: () => headingsOf(read().lines).map((h) => h.title), addTask };
}

function TASK_RE_HAS_TEXT(line, cleanText) {
  return /^\s*- \[.\] /.test(line) && line.includes(cleanText);
}
