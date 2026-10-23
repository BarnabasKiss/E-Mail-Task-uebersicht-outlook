// Stilmerkmale aus einer gesendeten Antwort, rein lokal und ohne KI: Du/Sie, Anrede, Gruß, Sprache.
// Die Anrede wird als Muster gespeichert ("Hallo {Vorname},"), nie mit dem Klarnamen. applyStyle setzt Anrede und Gruß in einen Entwurf ein.

const GREETING = /^(Sehr geehrte[rs]?|Liebe[rs]?|Hallo|Hi|Hey|Guten (?:Tag|Morgen|Abend)|Grüß (?:Gott|dich|Sie)|Servus|Moin|Dear|Hello)\b/i;
const CLOSING = /^(Mit freundlichen Grüßen|Mit freundlichen Gruessen|Freundliche Grüße|Freundlichen Gruß|Beste Grüße|Liebe Grüße|Viele Grüße|Herzliche Grüße|Schöne Grüße|Lg|Mfg|Vg|Best regards|Kind regards|Regards|Servus|Bis bald|Bis dann)\b/i;
const TITLE_WORDS = /^(Herr|Frau|Hr|Fr|Dr|Mag|Dipl|Ing|DI|Prof|Dkfm)\.?$/i;
const KEEP_WORDS = /^(zusammen|allerseits|team|alle|liebes|und|sie|dich|geehrte|geehrter|geehrtes|liebe|lieber|tag|morgen|abend|gott|guten|grüß|sehr)$/i;

const lines = (text) => String(text || '').replace(/\r\n?/g, '\n').split('\n');
const firstLine = (text) => lines(text).map((l) => l.trim()).find(Boolean) || '';

/** "Berger, Anna", "Dr. Anna Maria Berger" oder "Helga" -> { first, last }. Ohne Namen (oder nur Adresse) leer. */
export function splitName(name) {
  let n = String(name || '').replace(/[<>()"]/g, ' ').trim();
  if (!n || /@/.test(n)) return { first: '', last: '' };
  if (n.includes(',')) {
    const [last, first] = n.split(',').map((s) => s.trim());
    n = `${first} ${last}`;
  }
  const parts = n.split(/\s+/).filter((p) => !TITLE_WORDS.test(p));
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0] || '', last: parts.at(-1) || '' };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Hallo Anna," + Name Anna Berger -> "Hallo {Vorname},". null, wenn keine Anrede oder noch ein unbekannter Name übrig bleibt. */
export function greetingPattern(line, name) {
  const g = String(line || '').trim();
  if (!GREETING.test(g) || g.length > 80) return null;
  const { first, last } = splitName(name);
  let out = g;
  if (last) out = out.replace(new RegExp(`\\b${esc(last)}\\b`, 'g'), '{Nachname}');
  if (first) out = out.replace(new RegExp(`\\b${esc(first)}\\b`, 'g'), '{Vorname}');
  const rest = out
    .replace(GREETING, ' ')
    .replace(/\{(Vorname|Nachname)\}/g, ' ')
    .split(/[\s,.!:;]+/)
    .filter((w) => w && !TITLE_WORDS.test(w) && !KEEP_WORDS.test(w));
  return rest.length ? null : out;
}

/** Setzt die Namen in ein Anrede-Muster ein. null, wenn ein benötigter Name fehlt. */
export function fillGreeting(pattern, name) {
  const { first, last } = splitName(name);
  if ((pattern.includes('{Vorname}') && !first) || (pattern.includes('{Nachname}') && !last)) return null;
  return pattern.replace('{Vorname}', first).replace('{Nachname}', last);
}

export const isGreeting = (line) => GREETING.test(String(line || '').trim());

function closingLine(text) {
  const tail = lines(text).map((l) => l.trim()).filter(Boolean).slice(-6);
  const line = tail.find((l) => CLOSING.test(l) && l.length <= 40);
  return line ? line.replace(/[,.!]+$/, '') : null;
}

const DU = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b/gi;
// "Sie" zählt nur mitten im Satz (nach Komma oder Kleinbuchstabe), sonst wäre jeder Satzanfang "Sie" (= sie, they) ein Treffer
const SIE = /(?<=[a-zäöüß,;]\s)Sie\b|\bIhnen\b|\bIhr(?:e|em|en|er|es)?\b(?=\s+[A-ZÄÖÜ])/g;

function formOf(text) {
  const du = (text.match(DU) || []).length;
  const sie = (text.match(SIE) || []).length;
  if (sie && !du) return 'sie';
  if (du && !sie) return 'du';
  return null;
}

const DE_WORDS = /\b(und|bitte|danke|ich|wir|die|der|das|nicht|mit|für|ist|sind|eine?)\b/gi;
const EN_WORDS = /\b(the|and|please|thank|thanks|you|we|is|are|with|for|regards|attached)\b/gi;
function languageOf(text) {
  const de = (text.match(DE_WORDS) || []).length;
  const en = (text.match(EN_WORDS) || []).length;
  if (en >= 3 && en > de * 1.5) return 'en';
  return de >= 3 ? 'de' : null;
}

/** @returns {{form: 'du'|'sie'|null, anrede: string|null, gruss: string|null, sprache: 'de'|'en'|null}} */
export function extractStyle(text, recipientName) {
  const body = String(text || '');
  const first = firstLine(body);
  const content = isGreeting(first) ? body.slice(body.indexOf(first) + first.length) : body;
  return { form: formOf(content), anrede: greetingPattern(first, recipientName), gruss: closingLine(body), sprache: languageOf(content) };
}

/** Ersetzt die erste Zeile (wenn Anrede) und die Grußzeile eines Entwurfs durch die gelernten. Fehlendes bleibt unverändert. */
export function applyStyle(draft, { anrede, gruss }, recipientName) {
  const all = lines(draft);
  const filled = anrede ? fillGreeting(anrede, recipientName) : null;
  const start = all.findIndex((l) => l.trim());
  if (filled && start >= 0 && isGreeting(all[start])) all[start] = filled;
  if (gruss) {
    for (let i = all.length - 1, seen = 0; i >= 0 && seen < 6; i -= 1) {
      if (!all[i].trim()) continue;
      seen += 1;
      if (CLOSING.test(all[i].trim()) && all[i].trim().length <= 40) {
        all[i] = gruss + (/[,.!]$/.test(all[i].trim()) ? all[i].trim().slice(-1) : '');
        break;
      }
    }
  }
  return all.join('\n');
}
