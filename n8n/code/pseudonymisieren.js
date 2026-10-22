// n8n Code-Node "Pseudonymisieren" im Workflow "Mail-Eingang (pseudonymisiert)".
// Einstellung: Mode "Run Once for Each Item", Sprache JavaScript.
// Eingabe: eine Mail vom Outlook-Trigger. Ausgabe: bereinigter Text (subject_clean, text_clean) plus "map"
// (Platzhalter -> Originalwert). Die map verlässt n8n nie, nur der bereinigte Text geht an das Modell.
// Dieselbe Logik steht als ES-Modul in lib/pseudonymize.js der App. Bei Änderungen beide angleichen.
// Hinweis: Das `return` am Ende steht auf oberster Ebene. Das ist in n8n-Code-Nodes erlaubt, als eigenständiges Skript nicht.
const m = $input.item.json;
const OWN = ['vorname', 'nachname']; // EIGENE Namen und Adresse-Teile eintragen: bleiben unmaskiert
const isOwn = (s) => OWN.some((o) => String(s).toLowerCase().includes(o));

const toText = (html) => (html || '')
  .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>|<\/h\d>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

let body = toText(m.body && m.body.content ? m.body.content : m.bodyPreview);
const hist = body.search(/\n(Von:|From:|Am [^\n]{5,80} schrieb|-----Original)/);
if (hist > 200) body = body.slice(0, hist);
body = body.slice(0, 4000);
const subject = m.subject || '';
const original = body;

const map = {};
const rev = {};
const counters = {};
const sub = (type, value) => {
  const key = type + '|' + value.toLowerCase();
  if (rev[key]) return rev[key];
  counters[type] = (counters[type] || 0) + 1;
  const ph = '[' + type + '_' + counters[type] + ']';
  rev[key] = ph;
  map[ph] = value;
  return ph;
};
const esc = (s) => s.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');

const TITLES = /^(Herr|Frau|Dr|Mag|DI|Ing|Prof|Dipl|und|von|van|der|de)$/i;
const CORP = /(GmbH|AG|KG|OG|Versicherung|Service|Team|Support|Office|Info|noreply|no-reply|Kundenservice|Schaden|Abteilung)/i;
const STOP = /^(Team|Zusammen|Kolleg|Allerseits|Damen|Herren|Alle|Kunde|Kunden|Leute)/i;

const groups = [];
const addPerson = (n) => {
  n = String(n || '').trim();
  if (n.length < 3 || isOwn(n) || STOP.test(n) || CORP.test(n)) return;
  if (groups.some((g) => g.full.toLowerCase() === n.toLowerCase())) return;
  const tokens = n.split(/[\s,;()]+/).filter((t) => t.length > 2 && /^[A-Za-zÄÖÜäöüß\-]+$/.test(t) && !TITLES.test(t) && !STOP.test(t));
  groups.push({ full: n, tokens: tokens.length > 1 ? tokens : [] });
};

const fromName = m.from && m.from.emailAddress ? m.from.emailAddress.name : '';
const fromAddr = m.from && m.from.emailAddress ? m.from.emailAddress.address : '';
addPerson(fromName);
for (const r of [].concat(m.toRecipients || [], m.ccRecipients || [])) {
  if (r && r.emailAddress) addPerson(r.emailAddress.name);
}
const greet = /(?:Sehr geehrte[r]?|Liebe[r]?|Hallo|Hi|Guten Tag|Guten Morgen|Grüß Gott|Servus)[ \t]+(?:(?:Herr|Frau|Dr\.|Mag\.|Dipl\.-Ing\.|DI|Ing\.|Prof\.)[ \t]+)*([A-ZÄÖÜ][\wäöüß\-]+(?:[ \t]+[A-ZÄÖÜ][\wäöüß\-]+)?)/g;
for (const g of body.matchAll(greet)) addPerson(g[1]);
const sign = /(?:Mit freundlichen Grüßen|Mit freundlichen Gruessen|Freundliche Grüße|Beste Grüße|Liebe Grüße|Best regards|Kind regards|Mfg|MfG|LG|VG)[,.!]?\s*\n+[ \t]*([A-ZÄÖÜ][\wäöüß\-]+(?:[ \t]+[A-ZÄÖÜ][\wäöüß\-\.]+){0,2})/g;
for (const g of body.matchAll(sign)) addPerson(g[1]);
const titled = /(?:Herr|Frau|Hr\.|Fr\.)[ \t]+([A-ZÄÖÜ][\wäöüß\-]+(?:[ \t]+[A-ZÄÖÜ][\wäöüß\-]+)?)/g;
for (const g of (subject + '\n' + body).matchAll(titled)) addPerson(g[1]);

const applyAll = (text) => {
  let s = String(text || '');
  s = s.replace(/https?:\/\/\S+/g, (u) => { const t = u.match(/[.,;:)\]]+$/); return sub('LINK', t ? u.slice(0, -t[0].length) : u) + (t ? t[0] : ''); });
  s = s.replace(/([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g, (all, local, dom) => (isOwn(all) ? all : sub('MAIL', local) + '@' + dom));
  s = s.replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g, (v) => sub('IBAN', v));
  s = s.replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, (v) => (/\d/.test(v) && /[A-Z]/.test(v) ? sub('FIN', v) : v));
  s = s.replace(/\b[A-ZÄÖÜ]{1,2}[ -]\d{1,5}[ -]?[A-Z]{1,3}\b/g, (v) => sub('KFZ', v));
  s = s.replace(/(geb\.?|geboren(?: am)?|Geburtsdatum:?)\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/gi, (all, l, d) => l + ' ' + sub('GEBDAT', d));
  s = s.replace(/\b(Schadennummer|Schadennr\.?|Schaden-Nr\.?|Schaden\s?Nr\.?|Aktenzeichen|Zl\.|GZ|Az\.?|Polizzennummer|Polizzennr\.?|Polizze|Vertragsnummer|Kundennummer|Auftragsnummer|Referenznummer|Referenz)\s*(?:lautet|ist)?\s*[:#]?\s*([A-Z0-9\/\-\.]{4,})/gi, (all, l, v) => { const t = v.match(/[.,;:)\]\/-]+$/); const core = t ? v.slice(0, -t[0].length) : v; return /\d/.test(core) ? l + ' ' + sub('AKTE', core) + (t ? t[0] : '') : all; });
  s = s.replace(/\b[A-Z]{1,4}-\d{4}\/\d{2,}\b/g, (v) => sub('AKTE', v));
  s = s.replace(/\b[A-ZÄÖÜ][a-zäöüß\-]+(?:straße|strasse|gasse|weg|platz|allee|ring|zeile|kai|gürtel|steig|markt)\s+\d+[a-z]?(?:[\/\-]\d+)?(?:,?\s*\d{4,5}\s+[A-ZÄÖÜ][a-zäöüß\-]+)?/g, (v) => sub('ADRESSE', v));
  s = s.replace(/\b\d{4}\s?\d{6}\b/g, (v) => sub('SVNR', v));
  s = s.replace(/(?:\+|00)\d{2}[\d\s\/\-()]{6,}\d/g, (v) => sub('TEL', v));
  s = s.replace(/\b0\d{2,4}[\s\/\-]?\d{3,}[\d\s\-]*\d\b/g, (v) => sub('TEL', v));
  s = s.replace(/\b\d{7,}\b/g, (v) => sub('NR', v));
  const sorted = groups.slice().sort((a, b) => b.full.length - a.full.length);
  for (const g of sorted) {
    const ph = sub('PERSON', g.full);
    for (const t of [g.full].concat(g.tokens)) {
      s = s.replace(new RegExp('(?<![\\wäöüÄÖÜß])' + esc(t) + '(?![\\wäöüÄÖÜß])', 'g'), ph);
    }
  }
  return s;
};

const subjectClean = applyAll(subject);
const textClean = applyAll(body);

return {
  json: {
    mail_id: m.id,
    conversation_id: m.conversationId,
    received_at: m.receivedDateTime,
    web_link: m.webLink,
    absender: fromName,
    absender_mail: fromAddr,
    betreff: subject,
    vorschau: original.slice(0, 400),
    subject_clean: subjectClean,
    text_clean: textClean,
    map,
    wichtigkeit: m.importance,
    anhang: !!m.hasAttachments
  }
};
