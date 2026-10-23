// Absender-Gedächtnis: was die App über den Umgang mit einer Person (und ihrer Firma) weiß. Ansprache (Du/Sie), Anrede, Gruß und Sprache
// werden aus deinen gesendeten Antworten gezählt (style-extract.js), dazu kommen kurze Notizen. Zuerst gilt die Person, danach die Firma
// (Domain, außer bei privaten Anbietern wie gmail.com). Was du im Absender-Profil festlegst ("fixed"), schlägt das Gezählte.
// Alles liegt lokal in state.json (Bereich "contacts", Schlüssel: Adresse oder @domain). In den Entwurf geht nur der Text von Muster und Notizen.
import { applyStyle } from './style-extract.js';

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.at', 'hotmail.com', 'hotmail.de', 'hotmail.at', 'live.com', 'live.at', 'msn.com',
  'gmx.at', 'gmx.de', 'gmx.net', 'gmx.com', 'web.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'aon.at', 'chello.at', 'a1.net',
  'tele2.at', 'drei.at', 'bluewin.ch', 't-online.de', 'proton.me', 'protonmail.com',
]);
const FIELDS = ['form', 'anrede', 'gruss', 'sprache'];
const ENUMS = { form: ['du', 'sie'], sprache: ['de', 'en'] };
const MAX_NOTES = 20;
const PROMPT_NOTES = 12;
const MAX_TEXT = 300;

export const FIELD_LABEL = { form: 'Ansprache', anrede: 'Anrede', gruss: 'Gruß', sprache: 'Sprache' };
export const personKey = (address) => String(address || '').trim().toLowerCase();
/** "@firma.at" für Firmenadressen, null bei privaten Anbietern oder ohne Adresse. */
export function domainKey(address) {
  const d = personKey(address).split('@')[1];
  return d && !FREEMAIL.has(d) ? `@${d}` : null;
}

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const empty = () => ({ votes: {}, last: {}, fixed: {}, notes: [], name: '', updatedAt: null });

export function createContacts({ store, now = () => new Date().toISOString() }) {
  const read = (key) => ({ ...empty(), ...(store.get('contacts', key) || {}) });
  const write = (key, entry) => store.set('contacts', key, { ...entry, updatedAt: now() });

  /** Zählt die Stilmerkmale einer gesendeten Antwort für die Person und (ohne Anrede) für die Firma. */
  function learnStyle(address, style, name = '') {
    const pk = personKey(address);
    if (!pk) return;
    const dk = domainKey(address);
    const person = read(pk);
    const dom = dk ? read(dk) : null;
    for (const f of FIELDS) {
      const value = style?.[f];
      if (!value) continue;
      for (const [key, e] of [[pk, person], [dk, dom]]) {
        if (!e || (key === dk && f === 'anrede')) continue;
        e.votes[f] = { ...e.votes[f], [value]: (e.votes[f]?.[value] || 0) + 1 };
        e.last[f] = value;
      }
    }
    if (name && !String(name).includes('@')) person.name = name;
    write(pk, person);
    if (dk && dom) write(dk, dom);
  }

  /** Wert eines Merkmals in einem Eintrag: von dir festgelegt, sonst am häufigsten gezählt (bei Gleichstand der letzte). */
  function valueOf(entry, field) {
    if (entry.fixed?.[field]) return { value: entry.fixed[field], source: 'manuell' };
    const votes = Object.entries(entry.votes?.[field] || {});
    if (!votes.length) return null;
    const top = Math.max(...votes.map(([, n]) => n));
    const leaders = votes.filter(([, n]) => n === top).map(([v]) => v);
    const value = leaders.includes(entry.last?.[field]) ? entry.last[field] : leaders[0];
    return { value, source: 'gelernt', count: top, total: votes.reduce((s, [, n]) => s + n, 0) };
  }

  /** Was für diese Adresse gilt: Person vor Firma. Die Anrede kommt nur von der Person (Herr/Frau unterscheidet sich je Person). */
  function effective(address) {
    const pk = personKey(address);
    const dk = domainKey(address);
    const person = read(pk);
    const dom = dk ? read(dk) : empty();
    const out = { notes: [] };
    for (const f of FIELDS) {
      const p = valueOf(person, f);
      const d = f === 'anrede' ? null : valueOf(dom, f);
      out[f] = p ? { ...p, scope: 'person' } : d ? { ...d, scope: 'domain' } : null;
    }
    out.notes = [
      ...person.notes.map((n) => ({ ...n, scope: 'person' })),
      ...dom.notes.map((n) => ({ ...n, scope: 'domain' })),
    ];
    return out;
  }

  /** Notizen für eine Person (scope 'person') oder ihre Firma ('domain'; bei privaten Anbietern bleibt es die Person). */
  function addNotes(address, scope, texts, source = 'gelernt') {
    return addNotesTo(scope === 'domain' ? domainKey(address) || personKey(address) : personKey(address), texts, source);
  }

  function addNotesTo(key, texts, source) {
    if (!key) return 0;
    const e = read(key);
    let added = 0;
    for (const t of texts) {
      const text = String(t || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!text || e.notes.some((n) => norm(n.text) === norm(text))) continue;
      e.notes.push({ id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, source, at: now(), reviewed: source === 'manuell' });
      added += 1;
    }
    // Ist die Liste voll, fliegen zuerst die ältesten ungeprüften Notizen raus
    while (e.notes.length > MAX_NOTES) {
      const i = e.notes.findIndex((n) => !n.reviewed);
      e.notes.splice(i < 0 ? 0 : i, 1);
    }
    if (added) write(key, e);
    return added;
  }

  const mutate = (key, fn) => {
    const e = read(key);
    const result = fn(e);
    write(key, e);
    return result;
  };

  function checkKey(key) {
    if (!/^@?[^@\s]+(@[^@\s]+)?$/.test(String(key || ''))) throw new Error('Ungültiger Kontakt');
    return String(key).toLowerCase();
  }

  /** Merkmal festlegen (überschreibt das Gezählte); leerer Wert hebt die Festlegung auf. */
  function setField(key, field, value) {
    key = checkKey(key);
    if (!FIELDS.includes(field)) throw new Error('Unbekanntes Merkmal');
    if (key.startsWith('@') && field === 'anrede') throw new Error('Die Anrede gilt nur für eine Person');
    const v = String(value ?? '').trim();
    if (v && ENUMS[field] && !ENUMS[field].includes(v)) throw new Error(`Erlaubt: ${ENUMS[field].join(', ')}`);
    if (v.length > 80) throw new Error('Höchstens 80 Zeichen');
    return mutate(key, (e) => {
      if (v) e.fixed[field] = v;
      else delete e.fixed[field];
    });
  }

  const editNote = (key, id, { text, reviewed }) =>
    mutate(checkKey(key), (e) => {
      const n = e.notes.find((x) => x.id === id);
      if (!n) throw new Error('Notiz nicht gefunden');
      if (typeof text === 'string' && text.trim()) {
        n.text = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
        n.reviewed = true;
      }
      if (typeof reviewed === 'boolean') n.reviewed = reviewed;
    });

  const deleteNote = (key, id) => mutate(checkKey(key), (e) => void (e.notes = e.notes.filter((n) => n.id !== id)));
  const confirmAll = (key) => mutate(checkKey(key), (e) => void e.notes.forEach((n) => (n.reviewed = true)));
  const addManualNote = (key, text) => addNotesTo(checkKey(key), [text], 'manuell');

  /** Daten für das Absender-Profil: Person und Firma mit ihren Merkmalen und Notizen. */
  function profile(address) {
    const pk = personKey(address);
    const dk = domainKey(address);
    const part = (key) => {
      const e = read(key);
      return { key, name: e.name || '', fields: Object.fromEntries(FIELDS.map((f) => [f, valueOf(e, f)])), notes: e.notes, updatedAt: e.updatedAt };
    };
    return { person: part(pk), domain: dk ? part(dk) : null, effective: effective(address) };
  }

  /** Textblock für den Entwurfs-Prompt; leer, wenn nichts bekannt ist. */
  function promptBlock(address) {
    const e = effective(address);
    const lines = [];
    if (e.form) lines.push(`Ansprache: ${e.form.value === 'du' ? 'Du (duzen)' : 'Sie (siezen)'}`);
    if (e.sprache) lines.push(`Sprache: ${e.sprache.value === 'en' ? 'Englisch' : 'Deutsch'}`);
    for (const n of e.notes.slice(0, PROMPT_NOTES)) lines.push(n.text);
    return lines.length ? lines.map((l) => `- ${l}`).join('\n') : '';
  }

  /** Setzt Anrede und Gruß aus dem Gedächtnis in den Entwurf (nur wenn bekannt). */
  function applyToDraft(address, name, text) {
    const e = effective(address);
    return applyStyle(text, { anrede: e.anrede?.value || null, gruss: e.gruss?.value || null }, name);
  }

  return { learnStyle, effective, addNotes, addManualNote, setField, editNote, deleteNote, confirmAll, profile, promptBlock, applyToDraft, personKey, domainKey, read, write };
}
