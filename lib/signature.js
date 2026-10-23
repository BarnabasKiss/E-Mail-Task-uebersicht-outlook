// Signaturerkennung für die Verlaufsansicht: trennt den Text einer Nachricht von der Signatur darunter. Die Signatur wird nur ausgeblendet
// (Dropdown), nie gelöscht. Im Zweifel bleibt alles im Text stehen. Drei Wege, vom sichersten zum unsichersten:
//  1. Trennzeile "-- ", 2. eine Signatur, die bei demselben Absender in mehreren Nachrichten gleich endet (commonSignature),
//  3. Grußformel mit Kontaktblock darunter (Name, Funktion, Telefon, Adresse, Haftungsausschluss).

const CLOSING = /^(mit (?:freundlichen|besten|herzlichen|lieben|kollegialen) gr(?:ü|ue)(?:ß|ss)en|freundliche[n]? gr(?:ü|ue)(?:ß|ss)e[n]?|beste gr(?:ü|ue)(?:ß|ss)e|liebe gr(?:ü|ue)(?:ß|ss)e|viele gr(?:ü|ue)(?:ß|ss)e|herzliche gr(?:ü|ue)(?:ß|ss)e|sch(?:ö|oe)ne gr(?:ü|ue)(?:ß|ss)e|lg|vg|mfg|best regards|kind regards|warm regards|regards|many thanks|danke und lg|bis bald|servus)\b/i;
const CONTACT = /(\btel\.?[:\s]|\btelefon|\bmobil\b|\bfax\b|\bhandy\b|\bphone\b|\bmob\.?[:\s]|\bt:\s|\bm:\s|\+\d{2}[\d\s/()-]{6,}|\bwww\.|https?:\/\/|\S@[\w-]+\.\w{2,}|\bFN\s?\d|\bUID\b|\bATU\s?\d|\bIBAN\b|\bgesch(?:ä|ae)ftsf(?:ü|ue)hr|\bsitz der gesellschaft|\bgmbh\b|\bstra(?:ß|ss)e\b|\bgasse\b|\b\d{4,5}\s+[A-ZÄÖÜ][a-zäöüß]+|vertraulich|confidential|disclaimer|diese e-?mail|this e-?mail|gesendet von|sent from|get outlook)/i;
const DEVICE_LINE = /^(gesendet von (?:meinem|mein)|sent from my|get outlook for|von meinem (?:iphone|ipad|android|handy))/i;
// Länge einer Zeile; eine Bildmarke (⟦bild:…⟧, enthält eine lange ID) zählt als ein Zeichen
const len = (l) => l.replace(/⟦bild:[^⟧]*⟧/g, '▣').trim().length;
const norm = (l) => l.toLowerCase().replace(/\s+/g, ' ').trim();
const lines = (text) => String(text || '').replace(/\r\n?/g, '\n').split('\n');
const join = (ls) => ls.join('\n').trimEnd();

const none = (text) => ({ body: String(text || ''), signature: '' });
const cut = (all, at) => {
  const body = join(all.slice(0, at));
  const signature = all.slice(at).join('\n').trim();
  return body.trim() && signature ? { body, signature } : null;
};

/** Gemeinsames Ende mehrerer Texte desselben Absenders (mindestens 2 Zeilen und 25 Zeichen): die Signatur, ohne Grußformel. */
export function commonSignature(texts) {
  const all = texts.map((t) => lines(t).map(norm).filter(Boolean)).filter((l) => l.length >= 3);
  if (all.length < 2) return [];
  let n = 0;
  while (all.every((l) => l.length > n + 1 && l.at(-1 - n) === all[0].at(-1 - n))) n += 1;
  let tail = all[0].slice(all[0].length - n);
  while (tail.length && !CLOSING.test(tail[0]) === false) tail = tail.slice(1); // Grußformel bleibt im Text
  return tail.length >= 2 && tail.join(' ').length >= 25 ? tail : [];
}

function byKnown(all, known) {
  if (!known?.length) return null;
  const nonEmpty = all.map((l, i) => [norm(l), i]).filter(([n]) => n);
  if (nonEmpty.length < known.length) return null;
  const tail = nonEmpty.slice(-known.length);
  return tail.every(([n], i) => n === known[i]) ? cut(all, tail[0][1]) : null;
}

function byClosing(all) {
  const from = Math.max(0, all.length - 30);
  for (let c = all.length - 1; c >= from; c -= 1) {
    if (!CLOSING.test(all[c].trim()) || len(all[c]) > 45) continue;
    const tail = all.slice(c + 1).filter((l) => l.trim());
    if (!tail.length || tail.length > 18 || tail.some((l) => len(l) > 110 && !CONTACT.test(l))) return null;
    const contact = tail.filter((l) => CONTACT.test(l)).length;
    // nur ein Name nach der Grußformel ist keine Signatur; ein Block mit Kontaktangaben oder mehreren kurzen Zeilen schon
    return contact >= 1 && tail.length >= 2 ? cut(all, c + 1) : null;
  }
  return null;
}

function byContactBlock(all) {
  const last = all.length;
  for (let k = Math.max(0, last - 14); k < last; k += 1) {
    const block = all.slice(k);
    const filled = block.filter((l) => l.trim());
    if (filled.length < 2 || filled.some((l) => len(l) > 90)) continue;
    const before = k === 0 ? '' : all[k - 1].trim();
    if (before && !CLOSING.test(before)) continue; // der Block beginnt nach einer Leerzeile oder Grußformel
    if (filled.filter((l) => CONTACT.test(l)).length >= 2) {
      const r = cut(all, k);
      if (r) return r;
    }
  }
  return null;
}

/** @param {string} text Text einer Nachricht (ohne zitierten Verlauf) @param {{known?: string[]}} opts known: Ergebnis von commonSignature */
export function splitSignature(text, { known } = {}) {
  const all = lines(text);
  if (all.length < 2) return none(text);
  const dash = all.findIndex((l, i) => i > 0 && /^--\s*$/.test(l));
  const device = all.findLastIndex((l) => DEVICE_LINE.test(l.trim()));
  // Mehrere Wege können passen (z. B. Grußformel und gemeinsames Ende): der früheste Schnitt nimmt Name und Funktion mit
  const found = [dash > 0 && cut(all, dash + 1) && { ...cut(all, dash + 1), body: join(all.slice(0, dash)) }, byClosing(all), byKnown(all, known)].filter(Boolean);
  if (found.length) return found.reduce((a, b) => (b.body.length < a.body.length ? b : a));
  return byContactBlock(all) || (device > 0 && device >= all.length - 3 && cut(all, device)) || none(text);
}
