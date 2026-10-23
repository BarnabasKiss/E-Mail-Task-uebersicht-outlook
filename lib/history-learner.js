// Lernen aus vielen gesendeten Mails: n8n liefert deine gesendeten Mails (nur lesend), die App
//  1. erkennt lokal ohne KI Ansprache, Anrede, Gruß und Sprache je Empfänger (-> Absender-Gedächtnis),
//  2. lässt Claude aus anonymisierten Auszügen allgemeine Stilregeln (-> Abschnitt "Aus gesendeten Mails abgeleitet" in Mail-Regeln.md)
//     und Notizen je Person oder Firma (-> Absender-Gedächtnis, als "prüfen" markiert) ableiten.
// Alles, was an Claude geht, läuft durch die strenge Anonymisierung samt Prüfung; Mails, die sie nicht bestehen, werden übersprungen.
import { htmlToText, stripQuotedHistory } from './html.js';
import { maskTexts, AnonymizationError } from './mask-strict.js';
import { extractStyle } from './style-extract.js';
import { sortNotes } from './learner.js';

const PAGE = 25;
const MIN_CHARS = 30;
const MAX_RECIPIENTS = 4; // Rundmails sagen nichts über den Umgang mit einer Person
const GLOBAL_SAMPLES = 30;
const SAMPLE_CHARS = 700;
const PERSON_MAX = 12;
const PERSON_MIN_MAILS = 2;
const PERSON_SAMPLES = 5;
const MAX_COUNT = 1000;

export function createHistoryLearner({ n8n, claude, rules, contacts, store, ownNames, ownAddress, log = console.log, now = () => new Date().toISOString() }) {
  const state = { running: false, phase: 'idle', read: 0, usable: 0, people: 0, startedAt: null, finishedAt: null, error: null, result: store.get('history', 'last') || null };

  const set = (patch) => Object.assign(state, patch);
  const status = () => ({ ...state });

  // Erst "Gesendete Elemente", dann eigene Mails, die woanders liegen (Archiv, Unterordner). Doppelte fallen weg, neueste zuerst.
  async function fetchMails(count) {
    const byId = new Map();
    for (const scope of ['sent', 'all']) {
      let before = '';
      while (byId.size < count * 2) {
        const page = await n8n.listSent({ limit: PAGE, before, scope });
        if (!page.length) break;
        page.forEach((m) => byId.set(m.id, m));
        set({ read: byId.size });
        const oldest = page.map((m) => m.sentDateTime).filter(Boolean).sort()[0];
        if (!oldest || oldest === before || page.length < PAGE) break;
        before = oldest;
      }
    }
    return [...byId.values()].sort((a, b) => String(b.sentDateTime).localeCompare(String(a.sentDateTime))).slice(0, count);
  }

  /** Mail -> { id, sent, to, name, address, subject, text } oder null, wenn sie nichts über den Stil verrät. */
  function usable(m) {
    const to = (m.to || []).filter((r) => r.address && r.address.toLowerCase() !== ownAddress.toLowerCase());
    if (!to.length || (m.to || []).length + (m.cc || []).length > MAX_RECIPIENTS) return null;
    const text = stripQuotedHistory(htmlToText(m.body || ''), 20).trim();
    if (text.length < MIN_CHARS) return null;
    return { id: m.id, sent: m.sentDateTime, meta: { from: { name: ownNames[0] || '', address: ownAddress }, to: m.to || [], cc: m.cc || [] }, name: to[0].name, address: to[0].address.toLowerCase(), subject: m.subject || '', text };
  }

  // Maskierter Auszug einer Mail für den Prompt; null, wenn die Prüfung unsicher ist
  function sample(u) {
    try {
      return maskTexts(u.meta, [u.text.slice(0, SAMPLE_CHARS * 2)], { ownNames, ownAddress }).texts[0].slice(0, SAMPLE_CHARS);
    } catch (e) {
      if (e instanceof AnonymizationError) return null;
      throw e;
    }
  }

  const block = (samples) => samples.map((t, i) => `--- Mail ${i + 1} ---\n${t}`).join('\n\n');

  async function globalRules(mails, skipped) {
    // Erst je Empfänger eine Mail (möglichst viel Abwechslung), dann mit weiteren auffüllen
    const picked = [];
    const used = new Set();
    for (const distinct of [true, false]) {
      const seen = new Set();
      for (const u of mails) {
        if (picked.length >= GLOBAL_SAMPLES) break;
        if (used.has(u.id) || (distinct && seen.has(u.address))) continue;
        seen.add(u.address);
        used.add(u.id);
        const s = sample(u);
        if (s) picked.push(s);
        else skipped.n += 1;
      }
    }
    if (picked.length < 3) return { added: 0, samples: picked.length };
    const out = await claude.runJson(`Hier sind ${picked.length} Mails, die Barni (Projektmanager, Österreich) selbst geschrieben hat, anonymisiert. Leite Regeln ab, nach denen künftig Antwortentwürfe in seinem Stil entstehen sollen.

BESTEHENDE REGELN (nicht wiederholen):
---
${rules.read()}
---

MAILS:
${block(picked)}

Regeln für deine Ausgabe:
- Höchstens 8 Regeln, jeweils ein kurzer Satz, nur was in mehreren Mails erkennbar ist (Länge, Aufbau, Ton, typische Formulierungen, Umgang mit Terminen oder Fehlendem).
- Anrede, Gruß und Du/Sie je Person werden gesondert erfasst: nicht nennen.
- Keine Namen, Nummern oder Einzelfälle.
Antworte ausschließlich mit JSON: {"rules": ["..."]}`);
    const list = (Array.isArray(out.rules) ? out.rules : []).filter((r) => typeof r === 'string').slice(0, 8);
    return { added: rules.appendHistory(list), samples: picked.length };
  }

  async function personNotes(address, mails, skipped) {
    const picked = mails.map((u) => sample(u) || (skipped.n += 1, null)).filter(Boolean).slice(0, PERSON_SAMPLES);
    if (picked.length < PERSON_MIN_MAILS) return 0;
    const out = await claude.runJson(`Barni hat mehrmals an dieselbe Person geschrieben (anonymisiert). Leite Notizen ab, die für künftige Antworten an diese Person (oder deren Firma) nützlich sind.

Was schon bekannt ist (nicht wiederholen):
${contacts.promptBlock(address) || '(nichts)'}

MAILS:
${block(picked)}

Regeln für deine Ausgabe:
- Höchstens 3 Notizen, jeweils ein kurzer Satz, nur was in mehreren Mails erkennbar ist.
- Bereich "person" für das, was zu dieser Person gehört, "firma" nur für das, was für alle in ihrer Firma gelten dürfte.
- Ansprache (Du/Sie), Anrede, Gruß und Sprache werden gesondert erfasst: nicht nennen.
- Keine Namen, Nummern oder Einzelfälle.
Antworte ausschließlich mit JSON: {"notes": [{"bereich": "person|firma", "text": "..."}]}`);
    const sorted = sortNotes(out.notes, 3);
    return contacts.addNotes(address, 'person', [...sorted.person, ...sorted.global]) + contacts.addNotes(address, 'domain', sorted.firma);
  }

  async function run({ count = 200 } = {}) {
    if (state.running) throw new Error('Das Lernen läuft schon');
    const wanted = Math.min(Math.max(parseInt(count, 10) || 200, 1), MAX_COUNT);
    set({ running: true, phase: 'lesen', read: 0, usable: 0, people: 0, startedAt: now(), finishedAt: null, error: null });
    const result = { mails: 0, usable: 0, people: 0, rulesAdded: 0, notesAdded: 0, skipped: 0, newMails: 0 };
    try {
      const raw = await fetchMails(wanted);
      result.mails = raw.length;
      const seenIds = new Set(store.get('history', 'seen') || []);
      const all = raw.map(usable).filter(Boolean);
      result.usable = all.length;
      const fresh = all.filter((u) => !seenIds.has(u.id));
      result.newMails = fresh.length;
      set({ phase: 'auswerten', usable: all.length });

      // 1. lokal: Stilmerkmale je Empfänger zählen (jede Mail nur einmal, auch bei wiederholtem Lauf)
      for (const u of fresh) contacts.learnStyle(u.address, extractStyle(u.text, u.name), u.name);
      store.set('history', 'seen', [...seenIds, ...fresh.map((u) => u.id)].slice(-5000));

      // 2. Claude: allgemeine Regeln und Notizen je Person, jeweils aus anonymisierten Auszügen
      const skipped = { n: 0 };
      set({ phase: 'regeln' });
      const g = await globalRules(all, skipped);
      result.rulesAdded = g.added;
      const byPerson = new Map();
      for (const u of all) byPerson.set(u.address, [...(byPerson.get(u.address) || []), u]);
      const people = [...byPerson.entries()].filter(([, l]) => l.length >= PERSON_MIN_MAILS).sort((a, b) => b[1].length - a[1].length).slice(0, PERSON_MAX);
      result.people = byPerson.size;
      for (const [i, [address, list]] of people.entries()) {
        set({ phase: 'personen', people: i + 1 });
        try {
          result.notesAdded += await personNotes(address, list, skipped);
        } catch (e) {
          log(`[history] ${address}: ${e.message}`);
        }
      }
      result.skipped = skipped.n;
      result.at = now();
      store.set('history', 'last', result);
      set({ result, phase: 'fertig' });
    } catch (e) {
      set({ error: e.message, phase: 'fehler' });
      log(`[history] ${e.message}`);
    } finally {
      set({ running: false, finishedAt: now() });
    }
    return status();
  }

  /** Startet im Hintergrund (der Aufruf kehrt sofort zurück); den Verlauf zeigt status(). */
  function start(opts) {
    if (state.running) throw new Error('Das Lernen läuft schon');
    run(opts).catch((e) => log(`[history] ${e.message}`));
    return status();
  }

  return { run, start, status };
}
