// Pseudonymisierung: ersetzt personenbezogene Daten durch Platzhalter wie [PERSON_1].
// Dieselbe Logik läuft im n8n-Workflow "Mail-Eingang". Bei Änderungen beide Stellen angleichen.

const TITLES = /^(Herr|Frau|Dr|Mag|DI|Ing|Prof|Dipl|und|von|van|der|de)$/i;
const CORP = /(GmbH|AG|KG|OG|Versicherung|Service|Team|Support|Office|Info|noreply|no-reply|Kundenservice|Schaden|Abteilung)/i;
const STOP = /^(Team|Zusammen|Kolleg|Allerseits|Damen|Herren|Alle|Kunde|Kunden|Leute)/i;

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
 * @param {{ownNames?: string[]}} opts  Eigene Namen bleiben sichtbar
 * @returns {{texts: string[], map: Record<string,string>}}
 */
export function pseudonymizeTexts(meta, texts, { ownNames = [] } = {}) {
  const isOwn = (s) => ownNames.some((o) => String(s).toLowerCase().includes(o.toLowerCase()));

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
  const addPerson = (n) => {
    n = String(n || '').trim();
    if (n.length < 3 || isOwn(n) || STOP.test(n) || CORP.test(n)) return;
    if (groups.some((g) => g.full.toLowerCase() === n.toLowerCase())) return;
    const tokens = n
      .split(/[\s,;()]+/)
      .filter((t) => t.length > 2 && /^[A-Za-zÄÖÜäöüß-]+$/.test(t) && !TITLES.test(t) && !STOP.test(t));
    groups.push({ full: n, tokens: tokens.length > 1 ? tokens : [] });
  };

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
      isOwn(all2) ? all2 : `${sub('MAIL', local)}@${dom}`,
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
    for (const g of [...groups].sort((a, b) => b.full.length - a.full.length)) {
      const ph = sub('PERSON', g.full);
      for (const t of [g.full, ...g.tokens]) {
        s = s.replace(new RegExp(`(?<![\\wäöüÄÖÜß])${esc(t)}(?![\\wäöüÄÖÜß])`, 'g'), ph);
      }
    }
    return s;
  };

  return { texts: texts.map(applyAll), map };
}

export function restore(text, map) {
  return String(text ?? '').replace(/\[?([A-ZÄÖÜ]+_\d+)\]?/g, (all, k) => map[`[${k}]`] ?? all);
}
