// Lernen aus deinen Antworten: vergleicht Entwurf und gesendete Antwort (beides pseudonymisiert)
// und hängt neue Stilregeln sofort an die Regeldatei an.
import { htmlToText, stripQuotedHistory } from './html.js';
import { pseudonymizeTexts } from './pseudonymize.js';

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

export function createLearner({ claude, rules, store, ownNames }) {
  async function learnFor(mailId) {
    const rec = store.get('replies', mailId);
    const draft = store.get('drafts', mailId);
    if (!rec || !draft || store.get('learned', mailId)) return null;

    const final = stripQuotedHistory(htmlToText(rec.reply?.body || ''), 20);
    if (!final.trim()) {
      store.set('learned', mailId, { at: new Date().toISOString(), notes: [], skipped: 'leere Antwort' });
      return [];
    }
    if (norm(final).includes(norm(draft.text).slice(0, 200)) && norm(final).length < norm(draft.text).length * 1.15) {
      store.set('learned', mailId, { at: new Date().toISOString(), notes: [], skipped: 'unverändert übernommen' });
      return [];
    }

    const { texts } = pseudonymizeTexts(rec.meta, [draft.text, final], { ownNames });
    const domain = String(rec.meta?.from?.address || '').split('@')[1] || '';
    const prompt = `Barni hat einen Antwortentwurf bekommen und die Mail dann selbst beantwortet. Vergleiche beides und leite Regeln für künftige Entwürfe ab.

BESTEHENDE REGELN (von Barni gepflegt):
---
${rules.read()}
---

ENTWURF:
${texts[0]}

TATSÄCHLICH GESENDET:
${texts[1]}

Absender-Domain dieser Mail: ${domain || 'unbekannt'}

Regeln für deine Ausgabe:
- Höchstens 2 Regeln, jeweils ein kurzer Satz.
- Es ist nur ein einziger Fall. Ton, Anrede und Gruß hängen oft vom Gegenüber ab: Beginne solche Regeln mit "Bei @${domain || 'domain'}:". Nur was erkennbar immer gilt (z. B. Länge, Aufbau), schreibst du ohne Präfix.
- Keine Namen, Telefonnummern, Aktennummern oder Details dieses Falls.
- Wiederhole keine bestehende Regel. Widerspricht der Fall einer bestehenden Regel, formuliere nur eine Ausnahme mit Bedingung statt einer neuen Grundregel.
- Sind die Unterschiede unwichtig oder rein fallbezogen, gib eine leere Liste zurück.
Antworte ausschließlich mit JSON: {"notes": ["..."]}`;

    const out = await claude.runJson(prompt);
    const notes = Array.isArray(out.notes) ? out.notes.filter((n) => typeof n === 'string').slice(0, 2) : [];
    const added = rules.appendLearned(notes);
    store.set('learned', mailId, { at: new Date().toISOString(), notes, added });
    return notes;
  }

  return { learnFor };
}
