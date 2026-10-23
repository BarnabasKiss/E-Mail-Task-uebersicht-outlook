// Lernen aus deinen Antworten. Zwei Wege:
// 1. lokal, ohne KI: Ansprache (Du/Sie), Anrede, Gruß und Sprache der gesendeten Antwort gehen ins Absender-Gedächtnis (contacts.js).
// 2. Entwurf und gesendete Antwort werden (pseudonymisiert) verglichen. Allgemeine Stilregeln kommen sofort in die Regeldatei,
//    Beobachtungen zu Person oder Firma als ungeprüfte Notiz ins Absender-Gedächtnis, wo du sie im Absender-Profil prüfst.
import { htmlToText, stripQuotedHistory } from './html.js';
import { pseudonymizeTexts } from './pseudonymize.js';
import { extractStyle } from './style-extract.js';

/** Ordnet die Notizen aus der Antwort der KI nach Bereich; ältere Antworten (nur Texte) gelten als global. */
export function sortNotes(raw, max = 2) {
  const out = { global: [], person: [], firma: [] };
  for (const n of (Array.isArray(raw) ? raw : []).slice(0, max)) {
    const text = typeof n === 'string' ? n : n?.text;
    if (typeof text !== 'string' || !text.trim()) continue;
    const area = typeof n === 'string' ? 'global' : String(n.bereich || '').toLowerCase();
    out[area in out ? area : 'person'].push(text.trim());
  }
  return out;
}

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

export function createLearner({ claude, rules, store, ownNames, contacts }) {
  async function learnFor(mailId) {
    const rec = store.get('replies', mailId);
    const draft = store.get('drafts', mailId);
    if (!rec || !draft || store.get('learned', mailId)) return null;

    const final = stripQuotedHistory(htmlToText(rec.reply?.body || ''), 20);
    if (!final.trim()) {
      store.set('learned', mailId, { at: new Date().toISOString(), notes: [], skipped: 'leere Antwort' });
      return [];
    }
    const address = rec.meta?.from?.address || '';
    // Dein Stil zählt auch, wenn du den Entwurf unverändert übernommen hast
    if (contacts && address) contacts.learnStyle(address, extractStyle(final, rec.meta?.from?.name), rec.meta?.from?.name);
    if (norm(final).includes(norm(draft.text).slice(0, 200)) && norm(final).length < norm(draft.text).length * 1.15) {
      store.set('learned', mailId, { at: new Date().toISOString(), notes: [], skipped: 'unverändert übernommen' });
      return [];
    }

    const { texts } = pseudonymizeTexts(rec.meta, [draft.text, final], { ownNames });
    const domain = address.split('@')[1] || '';
    const known = contacts?.promptBlock(address) || '';
    const prompt = `Barni hat einen Antwortentwurf bekommen und die Mail dann selbst beantwortet. Vergleiche beides und leite Regeln für künftige Entwürfe ab.

BESTEHENDE REGELN (von Barni gepflegt):
---
${rules.read()}
---

ENTWURF:
${texts[0]}

TATSÄCHLICH GESENDET:
${texts[1]}

Was schon über diesen Absender bekannt ist (Ansprache, Anrede und Gruß werden gesondert erfasst, nenne sie nicht):
${known || '(nichts)'}

Regeln für deine Ausgabe:
- Höchstens 2 Notizen, jeweils ein kurzer Satz.
- Jede Notiz hat einen Bereich: "global" nur für das, was erkennbar immer gilt (Länge, Aufbau, Haltung). "person" für das, was zu diesem Gegenüber gehört. "firma" für das, was für alle bei @${domain || 'dieser Firma'} gelten dürfte. Es ist nur ein einziger Fall: im Zweifel "person".
- Keine Namen, Telefonnummern, Aktennummern oder Details dieses Falls.
- Wiederhole nichts, was schon bekannt oder in den Regeln steht. Widerspricht der Fall einer bestehenden Regel, formuliere nur eine Ausnahme mit Bedingung.
- Sind die Unterschiede unwichtig oder rein fallbezogen, gib eine leere Liste zurück.
Antworte ausschließlich mit JSON: {"notes": [{"bereich": "global|person|firma", "text": "..."}]}`;

    const out = await claude.runJson(prompt);
    const notes = sortNotes(out.notes);
    const added = rules.appendLearned(notes.global) + (contacts && address ? contacts.addNotes(address, 'person', notes.person) + contacts.addNotes(address, 'domain', notes.firma) : 0);
    const all = [...notes.global, ...notes.person, ...notes.firma];
    store.set('learned', mailId, { at: new Date().toISOString(), notes: all, added });
    return all;
  }

  return { learnFor };
}
