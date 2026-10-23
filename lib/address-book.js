// Adressbuch der App: Vorschläge für An, CC und BCC. Es füllt sich von selbst aus deinen Mails (Absender, Empfänger, Verlauf, deine gesendeten Mails)
// und lässt sich manuell, per Liste oder aus den Outlook-Kontakten ergänzen. Alles liegt lokal in einer eigenen Datei (address-book.json im Datenordner),
// nicht in state.json, weil dort jede Änderung die ganze Datei schreibt.
import fs from 'node:fs';

const EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/;
// Automatische Absender sind selten ein Ziel für eine Antwort: sie landen in den Vorschlägen weit hinten
const SYSTEM = /^(no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster|notification|notifications|bounce)/i;
export const isEmail = (a) => EMAIL.test(String(a || '').trim());

/** "Anna Berger <anna@x.at>", "anna@x.at", "Anna Berger anna@x.at" -> { name, address } oder null */
export function parsePerson(text) {
  const s = String(text || '').trim();
  const angle = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(s);
  if (angle) return { name: angle[1].replace(/^["'\s]+|["'\s]+$/g, ''), address: angle[2].toLowerCase() };
  const tail = /^(.*?)\s*([^\s<>@,;]+@[^\s<>,;]+)\s*$/.exec(s);
  if (tail && isEmail(tail[2])) return { name: tail[1].replace(/^["'\s]+|["'\s]+$/g, ''), address: tail[2].toLowerCase() };
  return null;
}

/** Eingefügte Liste (Zeilen, Komma oder Semikolon, "Name <adresse>", Excel/CSV mit Tabulator) in Personen zerlegen. */
export function parseList(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    // eine Zeile mit "Name;Adresse" oder "Name<TAB>Adresse" oder mehreren Einträgen
    const parts = /<[^>]+@[^>]+>/.test(line) ? line.split(/[;,](?=[^<>]*(?:<|$))/) : line.split(/[;\t,]/);
    const cells = parts.map((c) => c.trim()).filter(Boolean);
    const mail = cells.find((c) => isEmail(c.replace(/^.*<|>.*$/g, '')) || parsePerson(c));
    if (!mail) continue;
    if (cells.length === 2 && isEmail(cells[1]) && !isEmail(cells[0])) out.push({ name: cells[0].replace(/^["']|["']$/g, ''), address: cells[1].toLowerCase() });
    else if (cells.length === 2 && isEmail(cells[0]) && !isEmail(cells[1])) out.push({ name: cells[1].replace(/^["']|["']$/g, ''), address: cells[0].toLowerCase() });
    else for (const c of cells) {
      const p = parsePerson(c);
      if (p) out.push(p);
    }
  }
  return out;
}

const better = (a, b) => {
  // der aussagekräftigere Name gewinnt: ein echter Name schlägt die Adresse, ein längerer einen kürzeren
  const real = (n) => n && !n.includes('@');
  if (real(b) && !real(a)) return b;
  if (real(a) && !real(b)) return a;
  return (b || '').length > (a || '').length ? b : a;
};

export function createAddressBook({ file, ownAddresses = [], log = console.log, now = () => Date.now() }) {
  // address -> { name, address, company, sources: { mail, sent, outlook, manuell }, count, sentCount, last, note }
  let data = { people: {}, seen: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = { people: raw.people || {}, seen: raw.seen || [] };
  } catch {
    // erster Start
  }
  const seen = new Set(data.seen);
  const mine = new Set(ownAddresses.filter(Boolean).map((a) => a.toLowerCase()));
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        fs.writeFileSync(`${file}.tmp`, JSON.stringify({ people: data.people, seen: [...seen].slice(-20000) }));
        fs.renameSync(`${file}.tmp`, file);
      } catch (e) {
        log(`[addressBook] Speichern: ${e.message}`);
      }
    }, 800);
    timer.unref?.();
  };
  const flush = () => {
    clearTimeout(timer);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ people: data.people, seen: [...seen].slice(-20000) }));
    fs.renameSync(`${file}.tmp`, file);
  };

  function upsert({ name = '', address, company = '', note }, source, { weight = 1 } = {}) {
    const a = String(address || '').trim().toLowerCase();
    if (!isEmail(a) || mine.has(a)) return null;
    const e = data.people[a] || { name: '', address: a, company: '', sources: {}, count: 0, sentCount: 0, last: 0 };
    e.name = better(e.name, String(name || '').trim().replace(/\s+/g, ' ')) || '';
    if (company) e.company = company;
    if (note !== undefined) e.note = note;
    e.sources[source] = (e.sources[source] || 0) + 1;
    e.count += weight;
    if (source === 'sent') e.sentCount += weight;
    e.last = Math.max(e.last, now());
    data.people[a] = e;
    return e;
  }

  /** Personen merken. Zählt bei jedem Aufruf mit; für Mails, die nur einmal zählen sollen, rememberOnce nehmen. */
  function remember(people, source = 'mail') {
    let n = 0;
    for (const p of people || []) if (upsert(p, source)) n += 1;
    if (n) save();
    return n;
  }

  /** Wie remember, aber höchstens einmal je key (z. B. Mail-ID). */
  function rememberOnce(key, people, source = 'mail') {
    const k = `${source}:${key}`;
    if (seen.has(k)) return 0;
    seen.add(k);
    return remember(people, source) || (save(), 0);
  }

  /** Beim Absenden benutzt: zählt kräftiger und merkt sich den Zeitpunkt. */
  function touch(addresses) {
    for (const a of addresses || []) upsert({ address: a }, 'sent', { weight: 3 });
    save();
  }

  const words = (e) => `${e.name} ${e.company} ${e.address.replace(/[@._-]/g, ' ')}`.toLowerCase().split(/\s+/).filter(Boolean);

  function score(e, tokens) {
    const w = words(e);
    let s = 0;
    for (const t of tokens) {
      if (e.address.startsWith(t) || e.name.toLowerCase().startsWith(t)) s += 8;
      else if (w.some((x) => x.startsWith(t))) s += 5;
      else if (e.address.includes(t) || e.name.toLowerCase().includes(t)) s += 2;
      else return -1; // jedes Wort muss irgendwo vorkommen
    }
    const recent = Math.max(0, 1 - (now() - e.last) / (180 * 86400_000)); // 0 bis 1, halbjährlich abnehmend
    return s + Math.log2(1 + e.count) + 2 * Math.log2(1 + e.sentCount) + 2 * recent + (e.sources.manuell || e.sources.outlook ? 3 : 0) - (SYSTEM.test(e.address) ? 12 : 0);
  }

  /** Vorschläge zu einem eingetippten Teil von Name oder Adresse, beste zuerst. Ohne Eingabe die zuletzt und häufig benutzten. */
  function search(q, { limit = 8, exclude = [] } = {}) {
    const skip = new Set(exclude.map((a) => a.toLowerCase()));
    const tokens = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const all = Object.values(data.people).filter((e) => !skip.has(e.address));
    const ranked = tokens.length ? all.map((e) => [e, score(e, tokens)]).filter(([, s]) => s >= 0) : all.map((e) => [e, Math.log2(1 + e.count) + 2 * Math.log2(1 + e.sentCount) - (SYSTEM.test(e.address) ? 12 : 0)]);
    return ranked.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([e]) => view(e));
  }

  const view = (e) => ({ name: e.name, address: e.address, company: e.company || '', note: e.note || '', sources: Object.keys(e.sources), count: e.count, sentCount: e.sentCount, last: e.last ? new Date(e.last).toISOString() : null });

  /** Liste für die Verwaltung, alphabetisch; q filtert, source ('mail' | 'sent' | 'outlook' | 'manuell') schränkt ein. */
  function list({ q = '', source = '', limit = 200, offset = 0 } = {}) {
    const tokens = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    let all = Object.values(data.people);
    if (source) all = all.filter((e) => e.sources[source]);
    if (tokens.length) all = all.filter((e) => tokens.every((t) => `${e.name} ${e.company} ${e.address}`.toLowerCase().includes(t)));
    all.sort((a, b) => (a.name || a.address).toLowerCase().localeCompare((b.name || b.address).toLowerCase(), 'de'));
    return { total: all.length, items: all.slice(offset, offset + limit).map(view) };
  }

  function stats() {
    const out = { total: 0, mail: 0, sent: 0, outlook: 0, manuell: 0 };
    for (const e of Object.values(data.people)) {
      out.total += 1;
      for (const s of Object.keys(e.sources)) if (s in out) out[s] += 1;
    }
    return out;
  }

  function add({ name, address, company, note }) {
    if (!isEmail(address)) throw new Error('Ungültige Adresse');
    if (mine.has(String(address).trim().toLowerCase())) throw new Error('Das ist deine eigene Adresse');
    const e = upsert({ name, address, company, note }, 'manuell', { weight: 0 });
    // ein manueller Name soll den gelernten ersetzen, auch wenn er kürzer ist
    if (name) e.name = String(name).trim().replace(/\s+/g, ' ');
    save();
    return view(e);
  }

  function edit(address, { name, company, note }) {
    const e = data.people[String(address).toLowerCase()];
    if (!e) throw new Error('Kontakt nicht gefunden');
    if (name !== undefined) e.name = String(name).trim().replace(/\s+/g, ' ');
    if (company !== undefined) e.company = String(company).trim();
    if (note !== undefined) e.note = String(note).trim();
    e.sources.manuell = e.sources.manuell || 1;
    save();
    return view(e);
  }

  function remove(address) {
    const key = String(address).toLowerCase();
    if (!data.people[key]) return false;
    delete data.people[key];
    save();
    return true;
  }

  /** Eingefügte Liste übernehmen. @returns {{ added: number, updated: number, skipped: number }} */
  function importText(text) {
    const people = parseList(text);
    let added = 0;
    let updated = 0;
    for (const p of people) {
      const existed = !!data.people[p.address];
      if (!upsert(p, 'manuell', { weight: 0 })) continue;
      if (p.name) data.people[p.address].name = p.name;
      if (existed) updated += 1;
      else added += 1;
    }
    if (added || updated) save();
    return { added, updated, skipped: people.length - added - updated };
  }

  /** Outlook-Kontakte (n8n listContacts: { name, company, addresses: [{ name, address }] }). */
  function importOutlook(contacts) {
    let added = 0;
    let updated = 0;
    for (const c of contacts || []) {
      for (const a of c.addresses || []) {
        const existed = !!data.people[String(a.address).toLowerCase()];
        const e = upsert({ name: c.name || a.name, address: a.address, company: c.company }, 'outlook', { weight: 0 });
        if (!e) continue;
        if (existed) updated += 1;
        else added += 1;
      }
    }
    if (added || updated) save();
    return { added, updated, total: (contacts || []).length };
  }

  return { remember, rememberOnce, touch, search, list, stats, add, edit, remove, importText, importOutlook, flush, has: (a) => !!data.people[String(a).toLowerCase()] };
}
