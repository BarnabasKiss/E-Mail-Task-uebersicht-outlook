// Suchindex: Text aus Anhängen (PDF, Word, Excel, ... und Bilder per OCR) sowie Empfänger (An, Cc) und voller Text der Mail werden
// im Hintergrund gelesen und lokal in einer eigenen Datei gemerkt (nicht in state.json, die wird bei jeder Änderung komplett
// geschrieben). Die Suche läuft nur über diese Datei. Nichts davon geht an Claude oder ins Netz. Die Datei enthält echte Inhalte:
// im Datenordner lassen, nicht in die Cloud legen.
import fs from 'node:fs';

const RETRY_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;
// Gründe, die kein Fehler sind (Dateityp unbekannt, zu groß, kein Text): nicht erneut versuchen
const NOT_AN_ERROR = /nicht gelesen|Zu groß|Kein Text/i;

// ocrVersion: Stand der Textauszüge (0 = ohne PDF-OCR). Eintrag mit kleinerem Stand wird einmal neu gelesen, damit gescannte PDFs nachträglich auffindbar werden.
export function createDocIndex({ attachments, drafts, file, getScheduler, perRun = 2, maxChars = 60000, maxMailChars = 100000, ocrVersion = 0, log = console.log }) {
  // mail_id -> { at, attempts, errors, mailError, docs: [{ name, text }], mail: { to: ["Name adresse"], cc: [...], text } }
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // erster Start
  }

  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
        fs.renameSync(`${file}.tmp`, file);
      } catch (e) {
        log(`[docIndex] Speichern: ${e.message}`);
      }
    }, 1000);
    timer.unref?.();
  };

  const failed = new Map(); // mail_id -> Zeitpunkt des letzten Abruffehlers (10 Minuten Pause)
  const failCount = new Map(); // mail_id -> Fehler in Folge; nach MAX_ATTEMPTS gilt die Mail als nicht lesbar (z. B. in Outlook gelöscht)
  const everything = () => {
    const s = getScheduler().state;
    const seen = new Set();
    return [...s.items, ...s.archive].filter((p) => !seen.has(p.mail_id) && seen.add(p.mail_id));
  };
  const retryable = (e, bad) => bad && e.attempts < MAX_ATTEMPTS && Date.now() - Date.parse(e.at) > RETRY_MS;
  // Was fehlt noch? Dokumente (neu oder nach Fehler) und die Mail selbst (Empfänger und Text; ältere Einträge haben sie noch nicht)
  const todoFor = (p) => {
    const e = data[p.mail_id];
    if (Date.now() - (failed.get(p.mail_id) || 0) < 10 * 60 * 1000) return { docs: false, mail: false };
    return { docs: !e || retryable(e, e.errors > 0) || (e.ocrV || 0) < ocrVersion, mail: !e?.mail && (!e || !e.mailError || retryable(e, e.mailError)) };
  };
  const needs = (p) => {
    const t = todoFor(p);
    return t.docs || t.mail;
  };

  const people = (list) => (list || []).map((r) => `${r?.emailAddress?.name || ''} ${r?.emailAddress?.address || ''}`.trim()).filter(Boolean);

  async function run() {
    const all = everything();
    for (const p of all.filter(needs).slice(0, perRun)) {
      const todo = todoFor(p);
      const prev = data[p.mail_id];
      try {
        const entry = { at: new Date().toISOString(), attempts: (prev?.attempts || 0) + 1, errors: prev?.errors || 0, mailError: false, docs: prev?.docs || [], mail: prev?.mail, ocrV: prev?.ocrV || 0 };
        if (todo.docs) {
          const read = await attachments.readAll(p);
          entry.errors = read.filter((a) => !a.text && a.reason && !NOT_AN_ERROR.test(a.reason)).length;
          entry.docs = read.filter((a) => a.text).map((a) => ({ name: a.name, text: a.text.slice(0, maxChars) }));
          entry.ocrV = ocrVersion;
        }
        if (todo.mail) {
          try {
            const m = await drafts.getMail(p);
            entry.mail = { to: people(m.toRecipients), cc: people(m.ccRecipients), text: drafts.mailText(m, { paragraphs: true }).slice(0, maxMailChars) };
          } catch (e) {
            entry.mailError = true; // später noch einmal versuchen, die Dokumente bleiben gemerkt
            log(`[docIndex] Mail ${p.id} (Text): ${e.message}`);
          }
        }
        data[p.mail_id] = entry;
        failCount.delete(p.mail_id);
        save();
      } catch (e) {
        failed.set(p.mail_id, Date.now());
        const n = (failCount.get(p.mail_id) || 0) + 1;
        failCount.set(p.mail_id, n);
        log(`[docIndex] Mail ${p.id}: ${e.message}${n >= MAX_ATTEMPTS ? ' (gebe auf)' : ''}`);
        if (n >= MAX_ATTEMPTS) {
          data[p.mail_id] = { at: new Date().toISOString(), attempts: MAX_ATTEMPTS, errors: 1, mailError: true, docs: prev?.docs || [], mail: prev?.mail, ocrV: ocrVersion };
          save();
        }
      }
    }
    // Einträge von Mails, die es nicht mehr gibt, aufräumen (erst wenn das Archiv geladen ist)
    if (getScheduler().state.archiveAt && all.length) {
      const ids = new Set(all.map((p) => p.mail_id));
      const gone = Object.keys(data).filter((id) => !ids.has(id));
      if (gone.length) {
        gone.forEach((id) => delete data[id]);
        save();
      }
    }
  }

  const snippetOf = (text, terms) => {
    const lower = text.toLowerCase();
    const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;
    return at < 0 ? '' : `${at > 50 ? '…' : ''}${text.slice(Math.max(0, at - 50), at + 110).replace(/\s+/g, ' ').trim()}${at + 110 < text.length ? '…' : ''}`;
  };

  /**
   * Suchbegriffe: alle müssen im selben Dokument (bzw. im Mailtext) vorkommen. Gibt je Mail die Fundstellen zurück:
   * { kind: 'doc', name, snippet } und { kind: 'text', snippet }. Bereiche: content (Dokumentinhalt), names (Dateinamen), text (Mailtext).
   * Ein Treffer nur im Dateinamen hat keinen Ausschnitt.
   */
  function search(query, { content = true, names = true, text = true } = {}) {
    const terms = String(query || '').toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    const hits = {};
    if (!terms.length || (!content && !names && !text)) return hits;
    for (const [mailId, entry] of Object.entries(data)) {
      for (const doc of entry.docs) {
        const body = content ? doc.text.toLowerCase() : '';
        const name = names ? doc.name.toLowerCase() : '';
        if (!terms.every((t) => body.includes(t) || name.includes(t))) continue;
        (hits[mailId] ??= []).push({ kind: 'doc', name: doc.name, snippet: content ? snippetOf(doc.text, terms) : '' });
      }
      if (text && entry.mail?.text) {
        const lower = entry.mail.text.toLowerCase();
        if (terms.every((t) => lower.includes(t))) (hits[mailId] ??= []).push({ kind: 'text', snippet: snippetOf(entry.mail.text, terms) });
      }
    }
    return hits;
  }

  /** Empfänger je Mail (für den Filter An/Cc in der Liste): { an: [...], cc: [...] } oder null, solange nicht gelesen. */
  const recipients = (mailId) => (data[mailId]?.mail ? { an: data[mailId].mail.to, cc: data[mailId].mail.cc } : null);

  const coverage = () => {
    const all = everything();
    return { indexed: all.filter((p) => data[p.mail_id]?.mail).length, total: all.length };
  };

  return { run, search, recipients, coverage };
}
