// Regeldatei "Mail-Regeln.md" (im App-Ordner, nicht im Vault und nicht im Repo): wird von Barni gepflegt, die App hängt nur Zeilen an.
// Sie enthält Stilregeln für Entwürfe, Regeln pro Kontakt, Dringlichkeits-/Ignorieren-Regeln pro Absender und automatisch Gelerntes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SECTION_STYLE = '## Grundton und Formulierungen';
const SECTION_CONTACTS = '## Regeln pro Kontakt oder Firma';
const SECTION_URGENCY = '## Dringlichkeit und Ignorieren';
const SECTION_LEARNED = '## Automatisch gelernt';
const SECTION_HISTORY = '## Aus gesendeten Mails abgeleitet (bitte prüfen)';

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

const URGENCY_LABEL = { ignorieren: 'Ignorieren', jetzt: 'Immer jetzt', heute: 'Immer heute' };
const kindOfLabel = (label) => (label.toLowerCase() === 'ignorieren' ? 'ignorieren' : label.toLowerCase().endsWith('jetzt') ? 'jetzt' : 'heute');

/** Alle Dringlichkeitsregeln, die auf diese Adresse zutreffen: [{ kind: 'ignorieren'|'jetzt'|'heute', pattern }] */
export function matchingUrgencyRules(address, rules) {
  return Object.entries(rules).flatMap(([kind, patterns]) => patterns.filter((p) => matches(address, p)).map((pattern) => ({ kind, pattern })));
}

/** Entfernt einen Eintrag aus allen Regelzeilen (Zeilen, die dadurch leer werden, fallen weg). */
function removePattern(text, pattern) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = URGENCY_LINE.exec(line);
    const values = m ? m[2].split(/[,;]/).map((v) => v.trim()) : [];
    if (!m || !values.some((v) => v.toLowerCase() === pattern)) {
      out.push(line);
      continue;
    }
    const rest = values.filter((v) => v && v.toLowerCase() !== pattern);
    if (rest.length) out.push(`- ${m[1]}: ${rest.join(', ')}`);
  }
  return out.join(eol);
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


// --- Bearbeiten in der App: Dokument-Sicht, gezielte Änderungen einzelner Regeln, ganze Datei als Text
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE_LINE = /^(\s*)[-*]\s+(.*)$/;
const MAX_RULE = 600;
const MAX_FILE = 200_000;
const CHANGED = 'Die Regel wurde inzwischen geändert (zum Beispiel durch das Lernen). Die Liste wird neu geladen.';
const FILE_CHANGED = 'Die Datei hat sich inzwischen geändert (zum Beispiel durch das Lernen). Bitte neu laden, damit nichts überschrieben wird.';
const versionOf = (text) => crypto.createHash('sha1').update(text).digest('hex');
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const cleanRule = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

/** Abschnitt zu einer Überschrift (Text ohne #): Zeile der Überschrift und Ende (nächste Überschrift) */
function findSection(lines, heading) {
  const start = lines.findIndex((l) => {
    const m = HEADING.exec(l.replace(/^\uFEFF/, ''));
    return m && m[2] === heading;
  });
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (HEADING.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}
const ruleLines = (lines, { start, end }) => {
  const at = [];
  for (let i = start + 1; i < end; i += 1) if (RULE_LINE.test(lines[i])) at.push(i);
  return at;
};

/**
 * Regeldatei als Dokument für die Oberfläche: Titel, Einleitung, Abschnitte mit Hinweisen (Fließtext) und Regeln (Aufzählungspunkte).
 * "index" einer Regel zählt die Aufzählungspunkte innerhalb ihres Abschnitts.
 */
export function parseRulesDocument(text) {
  const doc = { title: '', intro: [], sections: [] };
  let current = null;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const h = HEADING.exec(raw);
    if (h) {
      if (h[1].length === 1 && !current && !doc.title) doc.title = h[2];
      else {
        current = { heading: h[2], level: h[1].length, hints: [], rules: [] };
        doc.sections.push(current);
      }
      continue;
    }
    if (!raw.trim()) continue;
    const r = RULE_LINE.exec(raw);
    if (current) {
      if (r) current.rules.push({ index: current.rules.length, text: r[2].trim() });
      else current.hints.push(raw.trim());
    } else if (!r) doc.intro.push(raw.trim());
  }
  return doc;
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

  function appendTo(section, notes, date = new Date().toISOString().slice(0, 10)) {
    let text = read();
    const existing = text.toLowerCase();
    let added = 0;
    for (const n of notes) {
      const note = String(n).replace(/\s+/g, ' ').trim();
      if (!note || existing.includes(note.toLowerCase())) continue;
      text = insertIntoSection(text, section, `- ${date}: ${note}`);
      added += 1;
    }
    if (added) write(text);
    return added;
  }

  return {
    file,
    read,
    urgencyRules: () => parseUrgencyRules(read()),
    /** Dokument für die Oberfläche: Datei, Version (für das Speichern als Text), Abschnitte und der Rohtext */
    document() {
      const text = read();
      return { file, version: versionOf(text), text, ...parseRulesDocument(text) };
    },
    /** Neue Regel am Ende eines Abschnitts (Überschrift ohne #) */
    addRule(heading, text) {
      const rule = cleanRule(text);
      if (!rule) throw new Error('Die Regel ist leer.');
      if (rule.length > MAX_RULE) throw new Error(`Die Regel ist zu lang (höchstens ${MAX_RULE} Zeichen).`);
      const raw = read();
      const lines = raw.split(/\r?\n/);
      const sec = findSection(lines, heading);
      if (!sec) throw new Error('Der Abschnitt ist in der Datei nicht mehr vorhanden.');
      const same = ruleLines(lines, sec).some((i) => RULE_LINE.exec(lines[i])[2].trim().toLowerCase() === rule.toLowerCase());
      if (same) throw new Error('Diese Regel gibt es in dem Abschnitt schon.');
      write(insertIntoSection(raw, lines[sec.start].replace(/^\uFEFF/, '').trim(), `- ${rule}`));
    },
    /** Regel ändern: "was" ist der bisherige Text. Stimmt er nicht mehr, wurde die Datei inzwischen geändert. */
    editRule(heading, index, was, text) {
      const rule = cleanRule(text);
      if (!rule) throw new Error('Die Regel ist leer. Zum Entfernen den Papierkorb nutzen.');
      if (rule.length > MAX_RULE) throw new Error(`Die Regel ist zu lang (höchstens ${MAX_RULE} Zeichen).`);
      const raw = read();
      const lines = raw.split(/\r?\n/);
      const sec = findSection(lines, heading);
      const at = sec ? ruleLines(lines, sec)[Number(index)] : undefined;
      if (at === undefined || RULE_LINE.exec(lines[at])[2].trim() !== cleanRule(was)) throw new Error(CHANGED);
      lines[at] = `${RULE_LINE.exec(lines[at])[1]}- ${rule}`;
      write(lines.join(eolOf(raw)));
    },
    deleteRule(heading, index, was) {
      const raw = read();
      const lines = raw.split(/\r?\n/);
      const sec = findSection(lines, heading);
      const at = sec ? ruleLines(lines, sec)[Number(index)] : undefined;
      if (at === undefined || RULE_LINE.exec(lines[at])[2].trim() !== cleanRule(was)) throw new Error(CHANGED);
      lines.splice(at, 1);
      write(lines.join(eolOf(raw)));
    },
    /** Ganze Datei als Text speichern. "version" stammt aus document(): hat sich die Datei seitdem geändert, wird nichts überschrieben. */
    saveText(text, version) {
      if (typeof text !== 'string') throw new Error('Kein Text übergeben.');
      if (text.length > MAX_FILE) throw new Error('Die Datei ist zu groß.');
      if (version !== versionOf(read())) throw new Error(FILE_CHANGED);
      write(text.endsWith('\n') || !text ? text : `${text}${eolOf(text)}`);
    },
    appendLearned: (notes, date) => appendTo(SECTION_LEARNED, notes, date),
    /** Regeln aus dem Lernen über viele gesendete Mails: eigener Abschnitt, damit du sie in Ruhe prüfen kannst. */
    appendHistory: (notes, date) => appendTo(SECTION_HISTORY, notes, date),
    /**
     * Regel für eine Adresse oder "@domain" setzen (on) oder aufheben. Eine Adresse hat höchstens eine Art von Regel:
     * wer "Immer jetzt" setzt, verliert "Ignorieren" und "Immer heute".
     */
    setUrgencyRule(kind, pattern, on = true) {
      const pat = String(pattern || '').trim().toLowerCase();
      if (!URGENCY_LABEL[kind]) throw new Error('Unbekannte Regel');
      if (!/^@?[^\s@,;]+(@[^\s@,;]+)?$/.test(pat)) throw new Error('Ungültige Adresse');
      let text = removePattern(read(), pat);
      if (on) text = insertIntoSection(text, SECTION_URGENCY, `- ${URGENCY_LABEL[kind]}: ${pat}`);
      write(text);
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
