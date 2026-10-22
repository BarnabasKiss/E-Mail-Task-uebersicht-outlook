// Pseudonymisierung: ersetzt personenbezogene Daten durch Platzhalter wie [PERSON_1].
// Dieselbe Logik läuft im n8n-Workflow "Mail-Eingang". Bei Änderungen beide Stellen angleichen.

export const TITLES = /^(Herr|Frau|Dr|Mag|DI|Ing|Prof|Dipl|und|von|van|der|de)$/i;
// Rechtsformen nur als ganzes Wort, sonst trifft "AG" auch Namen wie Agnes oder Olga und sie blieben unmaskiert.
const CORP = /\b(?:GmbH|AG|KG|OG)\b|(?:Versicherung|Service|Team|Support|Office|Info|noreply|no-reply|Kundenservice|Schaden|Abteilung)/i;
export const STOP = /^(Team|Zusammen|Kolleg|Allerseits|Damen|Herren|Alle|Kunde|Kunden|Leute)/i;

const NAME = '[A-ZÄÖÜ][\\wäöüß\\-]+';
// Zwischen den Wörtern eines Namens nur Leerzeichen/Tabs ([ \t]), nie Zeilenumbrüche: sonst frisst ein Name
// die nächste Zeile der Signatur mit.
const H = '[ \\t]+';
const GREET = new RegExp(
  `(?:Sehr geehrte[r]?|Liebe[r]?|Hallo|Hi|Guten Tag|Guten Morgen|Grüß Gott|Servus)${H}(?:(?:Herr|Frau|Dr\\.|Mag\\.|Dipl\\.-Ing\\.|DI|Ing\\.|Prof\\.)${H})*(${NAME}(?:${H}${NAME})?)`,
  'g',
);
const SIGN = new RegExp(
  `(?:Mit freundlichen Grüßen|Mit freundlichen Gruessen|Freundliche Grüße|Beste Grüße|Liebe Grüße|Best regards|Kind regards|Mfg|MfG|LG|VG)[,.!]?\\s*\\n+[ \\t]*(${NAME}(?:${H}[A-ZÄÖÜ][\\wäöüß\\-\\.]+){0,2})`,
  'g',
);
const TITLED = new RegExp(`(?:Herr|Frau|Hr\\.|Fr\\.)${H}(${NAME}(?:${H}${NAME})?)`, 'g');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {{from?: {name?: string, address?: string}, to?: Array<{name?: string}>, cc?: Array<{name?: string}>}} meta
 * @param {string[]} texts  Texte, die gemeinsam (mit gemeinsamer Zuordnung) bereinigt werden
 * @param {{ownNames?: string[], extraPersons?: string[], extraPatterns?: Array<{type: string, re: RegExp}>}} opts
 *   Eigene Namen bleiben sichtbar. Mit ownAddress bleibt nur genau diese Adresse sichtbar (sonst jede, die einen eigenen Namen enthält). extraPersons: zusätzlich erkannte Namen (umgehen den Firmen-Filter).
 *   extraPatterns: weitere Muster; steht der Treffer in der benannten Gruppe `v`, wird nur diese Gruppe ersetzt.
 * @returns {{texts: string[], map: Record<string,string>}}
 */
export function pseudonymizeTexts(meta, texts, { ownNames = [], ownAddress = '', extraPersons = [], extraPatterns = [] } = {}) {
  const isOwn = (s) => ownNames.some((o) => String(s).toLowerCase().includes(o.toLowerCase()));

  const isOwnMail = (a) => (ownAddress ? a.toLowerCase() === ownAddress.toLowerCase() : isOwn(a));

  const map = {};
  const rev = {};
  const counters = {};
  const sub = (type, value) => {
    const key = `${type}|${value.toLowerCase()}`;
    if (rev[key]) return rev[key];
    counters[type] = (counters[type] || 0) + 1;
    const ph = `[${type}_${counters[type]}]`;
    rev[key] = ph;
    map[ph] = value;
    return ph;
  };

  const groups = [];
  const addPerson = (n, force = false) => {
    n = String(n || '').trim();
    if (n.length < 3 || isOwn(n) || (!force && (STOP.test(n) || CORP.test(n)))) return;
    if (groups.some((g) => g.full.toLowerCase() === n.toLowerCase())) return;
    const tokens = n
      .split(/[\s,;()]+/)
      .filter((t) => t.length > 2 && /^[A-Za-zÄÖÜäöüß-]+$/.test(t) && !TITLES.test(t) && !STOP.test(t));
    groups.push({ full: n, tokens: tokens.length > 1 ? tokens : [] });
  };

  for (const n of extraPersons) addPerson(n, true);
  addPerson(meta?.from?.name);
  for (const r of [...(meta?.to || []), ...(meta?.cc || [])]) addPerson(r?.name);
  const all = texts.join('\n');
  for (const re of [GREET, SIGN, TITLED]) for (const g of all.matchAll(re)) addPerson(g[1]);

  const applyAll = (text) => {
    let s = String(text || '');
    s = s.replace(/https?:\/\/\S+/g, (u) => {
      const t = u.match(/[.,;:)\]]+$/);
      return sub('LINK', t ? u.slice(0, -t[0].length) : u) + (t ? t[0] : '');
    });
    s = s.replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (all2, local, dom) =>
      isOwnMail(all2) ? all2 : `${sub('MAIL', local)}@${dom}`,
    );
    s = s.replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, (v) => sub('IBAN', v));
    s = s.replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, (v) => (/\d/.test(v) && /[A-Z]/.test(v) ? sub('FIN', v) : v));
    s = s.replace(/\b[A-ZÄÖÜ]{1,2}[ -]\d{1,5}[ -]?[A-Z]{1,3}\b/g, (v) => sub('KFZ', v));
    s = s.replace(/(geb\.?|geboren(?: am)?|Geburtsdatum:?)\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/gi, (all2, l, d) => `${l} ${sub('GEBDAT', d)}`);
    s = s.replace(
      /\b(Schadennummer|Schadennr\.?|Schaden-Nr\.?|Schaden\s?Nr\.?|Aktenzeichen|Zl\.|GZ|Az\.?|Polizzennummer|Polizzennr\.?|Polizze|Vertragsnummer|Kundennummer|Auftragsnummer|Referenznummer|Referenz)\s*(?:lautet|ist)?\s*[:#]?\s*([A-Z0-9/\-.]{4,})/gi,
      (all2, l, v) => {
        const t = v.match(/[.,;:)\]/-]+$/);
        const core = t ? v.slice(0, -t[0].length) : v;
        return /\d/.test(core) ? `${l} ${sub('AKTE', core)}${t ? t[0] : ''}` : all2;
      },
    );
    s = s.replace(/\b[A-Z]{1,4}-\d{4}\/\d{2,}\b/g, (v) => sub('AKTE', v));
    s = s.replace(
      /\b[A-ZÄÖÜ][a-zäöüß-]+(?:straße|strasse|gasse|weg|platz|allee|ring|zeile|kai|gürtel|steig|markt)\s+\d+[a-z]?(?:[/-]\d+)?(?:,?\s*\d{4,5}\s+[A-ZÄÖÜ][a-zäöüß-]+)?/g,
      (v) => sub('ADRESSE', v),
    );
    s = s.replace(/\b\d{4}\s?\d{6}\b/g, (v) => sub('SVNR', v));
    s = s.replace(/(?:\+|00)\d{2}[\d\s/\-()]{6,}\d/g, (v) => sub('TEL', v));
    s = s.replace(/\b0\d{2,4}[\s/-]?\d{3,}[\d\s-]*\d\b/g, (v) => sub('TEL', v));
    s = s.replace(/\b\d{7,}\b/g, (v) => sub('NR', v));
    for (const { type, re } of extraPatterns) {
      s = s.replace(re, (...args) => {
        const groups = typeof args.at(-1) === 'object' ? args.at(-1) : null;
        const v = groups?.v;
        return v === undefined ? sub(type, args[0]) : args[0].replace(v, sub(type, v));
      });
    }
    for (const g of [...groups].sort((a, b) => b.full.length - a.full.length)) {
      const ph = sub('PERSON', g.full);
      // Auch die GROSS geschriebene Form ("RITTER Marcus" in Formularen)
      for (const t of new Set([g.full, ...g.tokens, ...g.tokens.map((x) => x.toUpperCase())])) {
        s = s.replace(new RegExp(`(?<![\\wäöüÄÖÜß])${esc(t)}(?![\\wäöüÄÖÜß])`, 'g'), ph);
      }
    }
    return s;
  };

  // Zweiter Durchlauf: Kennungen, die irgendwo erkannt wurden, werden überall ersetzt (auch in den anderen Texten).
  const GLOBAL_TYPES = ['AKTE', 'NR', 'TEL', 'IBAN', 'FIN', 'KFZ', 'SVNR', 'ADRESSE', 'GEBDAT', 'UID', 'FN', 'KARTE', 'KONTO', 'ORT', 'DOMAIN'];
  const global = (text) => {
    let s = text;
    for (const [ph, value] of Object.entries(map)) {
      if (!GLOBAL_TYPES.some((t) => ph.startsWith(`[${t}_`)) || value.length < 4) continue;
      s = s.replace(new RegExp(`(?<![\\wäöüÄÖÜß])${esc(value)}(?![\\wäöüÄÖÜß])`, 'g'), ph);
    }
    return s;
  };
  return { texts: texts.map(applyAll).map(global), map };
}

export function restore(text, map) {
  return String(text ?? '').replace(/\[?([A-ZÄÖÜ]+_\d+)\]?/g, (all, k) => map[`[${k}]`] ?? all);
}
