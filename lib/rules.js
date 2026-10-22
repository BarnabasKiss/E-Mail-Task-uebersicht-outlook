// Regeldatei "📧 Mail-Regeln.md" im Vault: wird von Barni gepflegt, die App hängt nur Zeilen an.
import fs from 'node:fs';
import path from 'node:path';

const SECTION_STYLE = '## Grundton und Formulierungen';
const SECTION_CONTACTS = '## Regeln pro Kontakt oder Firma';
const SECTION_URGENCY = '## Dringlichkeit und Ignorieren';
const SECTION_LEARNED = '## Automatisch gelernt';

const TEMPLATE = `# 📧 Mail-Regeln

Diese Datei steuert die Mail-App. Du kannst alles jederzeit selbst ändern.
Schreibe hier bitte keine Klarnamen oder Kundendaten, sondern Regeln: der Inhalt geht als Kontext an Claude.

${SECTION_STYLE}
- Anrede und Gruß: höflich, österreichisch, kurz.
- Keine Signatur schreiben, Outlook fügt sie hinzu.

${SECTION_CONTACTS}
- (Beispiel) Versicherung X wird gesiezt, interne Kollegen geduzt.

${SECTION_URGENCY}
Zeilen im Format "Ignorieren: absender@firma.at" oder "Ignorieren: @firma.at". Ebenso "Immer jetzt:" und "Immer heute:".
- (Beispiel) Ignorieren: newsletter@beispiel.at

${SECTION_LEARNED}
`;

const URGENCY_LINE = /^\s*[-*]?\s*(Ignorieren|Immer jetzt|Immer heute)\s*:\s*(.+?)\s*$/i;

export function parseUrgencyRules(text) {
  const rules = { ignorieren: [], jetzt: [], heute: [] };
  for (const line of text.split(/\r?\n/)) {
    const m = URGENCY_LINE.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase() === 'ignorieren' ? 'ignorieren' : m[1].toLowerCase().endsWith('jetzt') ? 'jetzt' : 'heute';
    for (const v of m[2].split(/[,;]/)) {
      const val = v.trim().toLowerCase();
      if (val && !val.startsWith('(')) rules[key].push(val);
    }
  }
  return rules;
}

const matches = (address, pattern) => {
  const a = String(address || '').toLowerCase();
  if (pattern.startsWith('@')) return a.endsWith(pattern);
  return a === pattern || a.endsWith(`@${pattern}`);
};

export function applyUrgencyRules(proposal, rules) {
  const addr = proposal.absender_mail;
  if (rules.ignorieren.some((p) => matches(addr, p))) return { hidden: true };
  if (rules.jetzt.some((p) => matches(addr, p))) return { hidden: false, urgency: 'jetzt' };
  if (rules.heute.some((p) => matches(addr, p))) return { hidden: false, urgency: 'heute' };
  return { hidden: false };
}

function insertIntoSection(text, heading, line) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return `${text.replace(/\s*$/, '')}${eol}${eol}${heading}${eol}${line}${eol}`;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  let at = end;
  while (at > start + 1 && lines[at - 1].trim() === '') at -= 1;
  lines.splice(at, 0, line);
  return lines.join(eol);
}

export function createRules({ file }) {
  const ensure = () => {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, TEMPLATE, 'utf8');
    }
  };
  const read = () => {
    ensure();
    return fs.readFileSync(file, 'utf8');
  };
  const write = (text) => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
  };

  return {
    file,
    read,
    urgencyRules: () => parseUrgencyRules(read()),
    appendLearned(notes, date = new Date().toISOString().slice(0, 10)) {
      let text = read();
      const existing = text.toLowerCase();
      let added = 0;
      for (const n of notes) {
        const note = String(n).replace(/\s+/g, ' ').trim();
        if (!note || existing.includes(note.toLowerCase())) continue;
        text = insertIntoSection(text, SECTION_LEARNED, `- ${date}: ${note}`);
        added += 1;
      }
      if (added) write(text);
      return added;
    },
    appendIgnore(address) {
      const addr = String(address || '').trim().toLowerCase();
      if (!addr) return false;
      const text = read();
      if (parseUrgencyRules(text).ignorieren.includes(addr)) return false;
      write(insertIntoSection(text, SECTION_URGENCY, `- Ignorieren: ${addr}`));
      return true;
    },
  };
}
