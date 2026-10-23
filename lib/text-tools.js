// Textwerkzeuge für Antworten und neue Mails über das lokale claude -p: Umschreiben (kürzer, förmlicher, freundlicher, Stichpunkte zur Mail), Übersetzen, Rechtschreibung, Rechtschreibung und Struktur, Lücken suchen, Betreff vorschlagen.
// Der Text geht wie alles andere nur pseudonymisiert an Claude (Namen, Nummern, Adressen als Platzhalter) und wird danach zurückübersetzt.
// Gibt Claude einen Platzhalter nicht zurück, wird der Vorschlag verworfen: so geht nie eine Angabe (Telefonnummer, Name) verloren.
import { pseudonymizeTexts, restore } from './pseudonymize.js';
import { surnameAfterTitle } from './drafts.js';

const MAX_CHARS = 20000;
const PLACEHOLDER = /\[[A-ZÄÖÜ]+_\d+\]/g;

const RULES = {
  spelling: `Korrigiere ausschließlich Rechtschreibung, Grammatik und Zeichensetzung. Wortwahl, Ton, Anrede (Du oder Sie), Reihenfolge, Absätze und Länge bleiben genau wie sie sind. Füge nichts hinzu und streiche nichts.`,
  structure: `Korrigiere Rechtschreibung, Grammatik und Zeichensetzung und verbessere die Struktur: klare Absätze, logische Reihenfolge, kurze und verständliche Sätze, das Wichtigste zuerst. Inhalt, Ton und Ansprache (Du oder Sie) bleiben. Erfinde keine neuen Fakten, Zusagen oder Termine.`,
  kuerzer: `Kürze den Text deutlich (etwa um ein Drittel bis die Hälfte). Alle Fakten, Termine, Zusagen, die Ansprache (Du oder Sie), Anrede und Gruß bleiben.`,
  foermlicher: `Formuliere den Text förmlicher und höflicher. Inhalt, Länge ungefähr und die Ansprache (Du oder Sie) bleiben. Erfinde nichts dazu.`,
  freundlicher: `Formuliere den Text freundlicher und wärmer, aber nicht überschwänglich. Inhalt, Länge ungefähr und die Ansprache (Du oder Sie) bleiben. Erfinde nichts dazu.`,
  'translate-en': `Übersetze den Text ins Englische, im gleichen Ton (höflich, geschäftlich), einschließlich Anrede und Gruß. Inhalt und Absätze bleiben.`,
  'translate-de': `Übersetze den Text ins Deutsche (österreichisches Geschäftsdeutsch), im gleichen Ton, einschließlich Anrede und Gruß. Inhalt und Absätze bleiben.`,
  notes: `Der Text besteht aus Stichpunkten oder Rohnotizen. Schreibe daraus eine fertige, knappe, höfliche E-Mail: Anrede, kurze Absätze, Gruß. Verwende nur, was in den Stichpunkten steht. Erfinde keine Fakten, Zahlen, Termine oder Zusagen; was offen ist, lässt du offen.`,
};

export function createTextTools({ claude, ownNames = [], ownAddress = '', pseudonymize = true, nameOf = () => '', contacts = null }) {
  // meta für die Pseudonymisierung: wer schreibt an wen (Namen aus dem Adressbuch, damit sie als Platzhalter erkannt werden)
  const metaFor = (to = []) => ({ from: { name: ownNames[0] || '', address: ownAddress }, to: to.map((a) => ({ name: nameOf(a) || '', address: a })), cc: [] });
  const mask = (to, texts) => (pseudonymize ? pseudonymizeTexts(metaFor(to), texts, { ownNames, ownAddress }) : { texts, map: {} });
  const back = (raw, map) => surnameAfterTitle(restore(raw, map), map);
  const holders = (s) => [...new Set(String(s).match(PLACEHOLDER) || [])];

  /** @returns {Promise<{ text: string }>} überarbeiteter Text (alle Modi außer „gaps“) */
  async function improveText({ mode, text, to = [] }) {
    if (!RULES[mode]) throw new Error('Unbekannte Verbesserung');
    const body = String(text || '').trim();
    if (!body) throw new Error('Es gibt noch keinen Text');
    if (body.length > MAX_CHARS) throw new Error(`Der Text ist zu lang (höchstens ${MAX_CHARS} Zeichen)`);
    const notes = mode === 'notes';
    const who = notes ? nameOf(to[0]) : '';
    const { texts, map } = mask(to, [body, who]);
    const known = notes && to[0] && contacts ? contacts.effective(to[0]) : null;
    const style = known ? [known.form && `Ansprache: ${known.form.value === 'du' ? 'Du (duzen)' : 'Sie (siezen)'}`, known.sprache && `Sprache: ${known.sprache.value === 'en' ? 'Englisch' : 'Deutsch'}`].filter(Boolean).join('\n') : '';
    const prompt = `Du überarbeitest einen E-Mail-Text von Barni (Projektmanager, Österreich, Deutsch).

Aufgabe: ${RULES[mode]}
${texts[1] ? `Empfänger: ${texts[1]}\n` : ''}${style ? `${style}\n` : ''}
Der Text ist pseudonymisiert. Platzhalter wie [PERSON_1], [TEL_1], [AKTE_2] stehen für echte Daten. Übernimm sie unverändert und exakt in dieser Schreibweise. Rate nie, was dahinter steckt.
Gib ausschließlich den überarbeiteten Text zurück, ohne Erklärung, ohne Anführungszeichen, ohne Markdown.

TEXT:
${texts[0]}`;
    const raw = (await claude.run(prompt)).trim();
    const missing = holders(texts[0]).filter((h) => !raw.includes(h));
    if (missing.length) throw new Error('Claude hat Angaben im Text verändert. Der Vorschlag wurde verworfen, dein Text ist unverändert.');
    if (!raw) throw new Error('Claude hat keinen Text geliefert');
    const out = back(raw, map);
    return { text: notes && contacts && to[0] ? contacts.applyToDraft(to[0], who, out) : out };
  }

  /** @returns {Promise<{ gaps: Array<{ punkt: string, hinweis: string }> }>} */
  async function findGaps({ text, subject = '', to = [], context = '' }) {
    const body = String(text || '').trim();
    if (!body) throw new Error('Es gibt noch keinen Text');
    const { texts, map } = mask(to, [body, subject, String(context || '').slice(0, 4000)]);
    const prompt = `Du prüfst einen E-Mail-Text von Barni (Projektmanager, Österreich, Deutsch) auf Lücken, bevor er gesendet wird.

Suche nur, was wirklich fehlt oder unklar ist, zum Beispiel: eine Frage oder Bitte ohne klare Frist, ein genannter Anhang oder Link, der nicht dabei ist, ein Termin ohne Datum oder Uhrzeit, ein Bezug ("das", "wie besprochen") ohne Erklärung, eine Frage der Mail, auf die nicht geantwortet wird, ein fehlender nächster Schritt, Anrede oder Gruß, die zum Gegenüber nicht passen.
${texts[2] ? 'Die Mail, auf die geantwortet wird, steht unten als Kontext: Prüfe, ob alle ihre Fragen beantwortet sind.\n' : ''}
Der Text ist pseudonymisiert; Platzhalter wie [PERSON_1] stehen für echte Daten und sind kein Fehler.
Höchstens 6 Punkte, jeweils kurz. Findest du nichts, gib eine leere Liste zurück. Ändere den Text nicht.
Antworte ausschließlich mit JSON: {"gaps": [{"punkt": "worum es geht", "hinweis": "was fehlt oder was du ergänzen könntest"}]}

${texts[1] ? `BETREFF: ${texts[1]}\n\n` : ''}TEXT:
${texts[0]}${texts[2] ? `\n\nKONTEXT (die Mail, auf die geantwortet wird):\n${texts[2]}` : ''}`;
    const out = await claude.runJson(prompt);
    const gaps = (Array.isArray(out.gaps) ? out.gaps : [])
      .filter((g) => g && typeof g.punkt === 'string' && typeof g.hinweis === 'string')
      .slice(0, 6)
      .map((g) => ({ punkt: back(g.punkt, map).trim(), hinweis: back(g.hinweis, map).trim() }));
    return { gaps };
  }

  /** Betreff aus dem Text (höchstens 80 Zeichen, ohne "AW:"/"Betreff:"). */
  async function suggestSubject({ text, to = [] }) {
    const body = String(text || '').trim();
    if (!body) throw new Error('Schreibe zuerst den Text, dann kann ich einen Betreff vorschlagen');
    const { texts, map } = mask(to, [body.slice(0, MAX_CHARS)]);
    const prompt = `Schreibe den Betreff für diese E-Mail von Barni (Projektmanager, Österreich, Deutsch). Kurz und konkret, höchstens 70 Zeichen, nennt das Anliegen, keine Floskeln, kein "Betreff:", keine Anführungszeichen, kein Punkt am Ende. Platzhalter wie [PERSON_1] oder [AKTE_1] nur übernehmen, wenn sie im Betreff wirklich helfen (Aktenzeichen ja, Personennamen eher nicht).
Gib ausschließlich den Betreff zurück.

TEXT:
${texts[0]}`;
    const raw = (await claude.run(prompt)).split('\n')[0].replace(/^\s*Betreff:\s*/i, '').replace(/^["„»'\s]+/, '').replace(/["“«'\s.]+$/, '').trim();
    if (!raw) throw new Error('Claude hat keinen Betreff geliefert');
    return { subject: back(raw, map).slice(0, 120) };
  }

  return { improveText, findGaps, suggestSubject };
}
