// Strenge Anonymisierung für Texte aus Anhängen (und alles, was sonst keine Anrede/Signatur hat).
// Baut auf lib/pseudonymize.js auf und ergänzt: Namenserkennung über eine Vornamenliste und Beschriftungen
// ("Versicherungsnehmer: ..."), weitere Kennungen (UID, Firmenbuch, Konto, PLZ/Ort, Karte) und eine Prüfung
// NACH dem Maskieren. Findet die Prüfung noch etwas, wird nichts an Claude geschickt (AnonymizationError).
import { pseudonymizeTexts, TITLES, STOP } from './pseudonymize.js';

// Häufige Vornamen (Österreich/Deutschland und die in der Branche üblichen Zuwanderungsnamen). Bewusst ohne Wörter,
// die auch normale Hauptwörter oder Monate sind (Mark, Rosa, Ernst, August, Wolf ...). Ergänzen ist jederzeit möglich.
const FIRST_NAMES = `
Aaron Adam Adrian Agnes Ahmed Alan Albert Alessandra Alexander Alexandra Alfred Alice Alina Alois Amelie Andrea Andreas Angela Angelika Anita Anja Anke Ann Anna Annette Anton Antonia Arnold Arthur Astrid Attila Barbara Bastian Beate Benedikt Benjamin Bernadette Bernd Bernhard Bettina Birgit Bianca Boris Brigitte Bruno Carina Carla Carmen Caroline Catharina Celine Charlotte Christa Christian Christiane Christina Christine Christoph Christopher Claudia Claudio Clemens Constantin Cornelia Csaba Dagmar Daniel Daniela David Denis Dennis Désirée Diana Dieter Dietmar Dirk Dominik Dominic Doris Dorothea Dragan Eduard Edith Elena Elfriede Elias Elisabeth Elke Ella Ellen Elmar Emanuel Emil Emilia Emma Emre Eric Erich Erik Erika Erwin Eva Evelyn Fabian Fabienne Fatma Felix Ferdinand Ferenc Fiona Florian Franz Franziska Friedrich Fritz Gabriel Gabriele Gabriela Gábor Georg Gerald Gerda Gerhard Gerlinde Gernot Gertraud Gertrude Gisela Gottfried Gregor Gudrun Günter Günther Gustav Hanna Hannah Hannelore Hans Harald Hartmut Hedwig Heide Heidi Heike Heinrich Heinz Helene Helga Helmut Henrik Herbert Hermann Hildegard Horst Hubert Hugo Ilona Ildikó Ines Inge Ingeborg Ingo Ingrid Irene Irina Iris Irmgard Isabella Isabelle István Ivan Ivana Jakob Jan Jana Janina Jasmin Jean Jennifer Jens Jessica Joachim Johann Johanna Johannes Jonas Josef Josefine Joseph Judith Judit Julia Julian Juliane Jürgen Justin Kai Karin Karina Karl Karoline Katalin Katharina Kathrin Katja Katrin Kevin Klara Klaus Konrad Konstantin Kristina Krisztina Kurt Lara Laszlo László Laura Lea Lena Lennart Leo Leon Leonard Leonhard Leonie Leopold Liesbeth Lilli Lina Linda Lisa Livia Lorenz Lothar Louis Louisa Lucas Ludwig Luis Luisa Lukas Lydia Magdalena Maik Manfred Manuel Mara Marc Marcel Marco Marcus Margarete Margit Maria Marianne Marie Marina Mario Marion Marius Marko Markus Marlene Marta Martha Martin Martina Mathias Matthias Maurice Max Maximilian Mehmet Melanie Melissa Michael Michaela Michelle Milan Miriam Mirko Mona Monika Moritz Murat Mustafa Nadine Natalie Natascha Nathalie Nenad Nicola Nicole Nico Niklas Nikolaus Nina Nora Norbert Olga Oliver Olivia Oskar Otto Pamela Pascal Patricia Patrick Paul Paula Pauline Pavel Peter Petra Petr Philipp Pia Piotr Rafael Ralf Raimund Rainer Ramona Raphael Regina Reinhard Reinhold Renate Renata Rene René Richard Rita Robert Roland Roman Romana Rosemarie Rosina Rudolf Rupert Ruth Sabine Sabrina Sandra Sandro Sara Sarah Sascha Sebastian Selina Sigrid Silvia Simon Simone Slavko Sofia Sophie Sonja Stefan Stefanie Stephan Stephanie Susanne Sven Svenja Sylvia Tamás Tanja Tatjana Teresa Theodor Theresa Therese Thomas Tim Timo Tobias Tom Tomasz Tomáš Ulrich Ulrike Ursula Uwe Valentin Valerie Vanessa Verena Veronika Viktor Viktoria Vincent Vera Walter Werner Wilhelm Willi Wolfgang Xaver Yvonne Zoltán Zsuzsanna Aleksandar Goran Mirjana Jelena Milica Marija Ayse Ali Hasan Hüseyin Ibrahim Yusuf Ömer Zeynep Elif Mihaela Andrei Mihai Ionut Alina Katarzyna Agnieszka Marek Jakub Balázs Gergely Péter Tibor Zsolt Erzsébet Éva Anikó Barnabás
`
  .split(/\s+/)
  .filter(Boolean);
export const FIRST_NAME_SET = new Set(FIRST_NAMES.map((n) => n.toLowerCase()));

const CAP = '[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?';
const CAPW = '[A-ZÄÖÜ][\\wäöüß]+(?:-[A-ZÄÖÜ][\\wäöüß]+)?';
const isFirstName = (w) => w.split('-').every((p) => FIRST_NAME_SET.has(p.toLowerCase()));

const LABELS =
  'Name|Vorname|Nachname|Kunde|Kundin|Versicherungsnehmer(?:in)?|VN|Geschädigte[rn]?|Anspruchsteller(?:in)?|Ansprechpartner(?:in)?|Sachbearbeiter(?:in)?|Gutachter(?:in)?|Fahrer(?:in)?|Halter(?:in)?|Lenker(?:in)?|Zeuge|Zeugin|Mandant(?:in)?|Unterzeichner(?:in)?|Verfasser(?:in)?|Eigentümer(?:in)?|Mieter(?:in)?|Vermieter(?:in)?|Patient(?:in)?|Antragsteller(?:in)?|Begünstigte[rn]?|Kontoinhaber(?:in)?|Erstellt von|Bearbeitet von|Betreuer(?:in)?|Referent(?:in)?|Ihr Ansprechpartner|Ihre Ansprechpartnerin';
const LABELED = new RegExp(`(?:^|[\\s(])(?:${LABELS})(?:[ \\t]*:|[ \\t]+-)[ \\t]*((?:Herr|Frau|Dr\\.|Mag\\.|DI|Ing\\.|Prof\\.)?[ \\t]*${CAPW}(?:[ \\t]+[A-ZÄÖÜ][\\wäöüß\\-\\.]+){0,2})`, 'gm');
// Grußzeile mit Rufnamen: "Lg Dani", "LG\nMax", "Beste Grüße, Susi" (die Standard-Erkennung kennt "Lg" nur in Großbuchstaben und mit Nachnamen)
const CLOSING = /(?:^|\n)[ \t]*(?:Lg|LG|Mfg|MfG|VG|Gruß|Grüße|Beste Grüße|Liebe Grüße|Viele Grüße|Freundliche Grüße|Schöne Grüße)[,.!]?[ \t]*(?:\n[ \t]*)?([A-ZÄÖÜ][a-zäöüß]{2,})\b/g;
const REVERSED = new RegExp(`(${CAPW}),[ \\t]+(${CAP}(?:[ \\t]+${CAP})*)`, 'g');

/** Namen, die die Standard-Pseudonymisierung (Absender, Anrede, Grußformel, "Herr/Frau") nicht findet. */
export function detectNames(text) {
  const found = new Set();

  for (const m of text.matchAll(new RegExp(`(?<![\\wäöüÄÖÜß])${CAP}`, 'g'))) {
    if (!isFirstName(m[0])) continue;
    let full = m[0];
    let rest = text.slice(m.index + m[0].length);
    for (;;) {
      const next = new RegExp(`^[ \\t]+(${CAP})`).exec(rest);
      if (!next || !isFirstName(next[1])) break;
      full += ` ${next[1]}`;
      rest = rest.slice(next[0].length);
    }
    const surname = new RegExp(`^[ \\t]+((?:(?:von|van|de|zu|der)[ \\t]+)?${CAPW})`).exec(rest);
    if (surname) full += ` ${surname[1]}`;
    found.add(full);
  }

  for (const m of text.matchAll(CLOSING)) if (!STOP.test(m[1])) found.add(m[1]);

  for (const m of text.matchAll(REVERSED)) if (isFirstName(m[2].split(/\s+/)[0])) found.add(`${m[2]} ${m[1]}`);

  for (const m of text.matchAll(LABELED)) {
    const name = m[1].replace(/^(?:Herr|Frau|Dr\.|Mag\.|DI|Ing\.|Prof\.)[ \t]*/, '').trim();
    // Beschriftung mit Firmen- oder Sachwort ("Von: Team Support") ist kein Name
    if (name.length > 2 && !STOP.test(name) && !/\b(?:GmbH|AG|KG|OG|Versicherung|Service|Support|Abteilung)\b/i.test(name)) found.add(name);
  }
  return [...found];
}

// Weitere Kennungen. Steht der Treffer in der Gruppe `v`, wird nur diese Gruppe ersetzt (Beschriftung bleibt lesbar).
// Reihenfolge zählt: Adressen mit PLZ vor "ORT", sonst hat ORT die PLZ schon ersetzt.
const STREET = 'Straße|Strasse|Gasse|Weg|Platz|Allee|Ring|Zeile|Kai|Gürtel|Steig|Markt';
export function extraPatterns(ownAddress = '') {
  const ownDomain = ownAddress.split('@')[1] || '';
  const notOwn = ownDomain ? `(?!${ownDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b)` : '';
  return [
    { type: 'UID', re: /\bATU\s?\d{8}\b/g },
    { type: 'FN', re: /\bFN\s?\d{1,6}\s?[a-z]\b/g },
    { type: 'KARTE', re: /\b(?:\d{4}[ -]){3}\d{3,4}\b/g },
    { type: 'KONTO', re: /\b(?:[Ss]teuernummer|StNr\.?|[Kk]onto(?:nummer|nr\.?)?|BIC|SWIFT|[Kk]artennummer)[ \t]*:?[ \t]*(?<v>(?=[A-Z0-9 /-]*\d)[A-Z0-9][A-Z0-9 /-]{5,}[A-Z0-9])/g },
    // "Krottendorfer Straße 9a", "Leopold-Ungar-Platz 2" (Straßenname mit groß geschriebenem Zusatzwort)
    { type: 'ADRESSE', re: new RegExp(`(?<![\\wäöüÄÖÜß])(?:[A-ZÄÖÜ][\\wäöüß.]*[ \\t-]){1,3}(?:${STREET})[ \\t]+\\d+[a-z]?(?:[/-]\\d+)?`, 'g') },
    // Ortsteil/Dorf mit Hausnummer, direkt vor der PLZ: "Blons 93, 6723 Blons"
    { type: 'ADRESSE', re: /(?<![\wäöüÄÖÜß])[A-ZÄÖÜ][\wäöüß-]+(?:[ \t][A-ZÄÖÜ][\wäöüß-]+)?[ \t]+\d{1,4}[a-z]?(?:\/\d+)?(?=,[ \t]*(?:A-)?\d{4}[ \t])/g },
    { type: 'ORT', re: /(?:^|[,\n])[ \t]*(?<v>(?:A-)?[1-9]\d{3}[ \t]+[A-ZÄÖÜ][a-zäöüß]+(?:[ \t]+(?:an der|am|bei|im|a\.d\.)[ \t]+[A-ZÄÖÜ][a-zäöüß]+|-[A-ZÄÖÜ][a-zäöüß]+)?)/gm },
    // Domains (Kunden, Testumgebungen ...). Die eigene Domain bleibt, sie sagt, ob eine Mail intern ist.
    { type: 'DOMAIN', re: new RegExp(`(?<![\\w@-])${notOwn}(?:[a-z0-9][a-z0-9-]*\\.)+(?:com|at|de|eu|net|org|io|ch|hu|info|biz|co\\.at)\\b`, 'g') },
  ];
}

export class AnonymizationError extends Error {}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Namen und Kennungen werden beim Maskieren genau (Groß/Klein) ersetzt, also prüfen wir auch so: "Eine" soll "eine" nicht auslösen.
const word = (s) => new RegExp(`(?<![\\wäöüÄÖÜß])${esc(s)}(?![\\wäöüÄÖÜß])`);
const ID_TYPES = ['AKTE', 'NR', 'TEL', 'IBAN', 'FIN', 'KFZ', 'SVNR', 'ADRESSE', 'GEBDAT', 'UID', 'FN', 'KARTE', 'KONTO', 'ORT', 'DOMAIN'];

/** Prüft maskierte Texte auf Reste. Gibt eine Liste von Problemen zurück (leer = sauber). Nennt nie den Klartext selbst. */
export function findLeaks(texts, map, { ownNames = [], ownAddress = '' } = {}) {
  const problems = [];
  const hay = texts.join('\n');
  const isOwn = (s) => (ownAddress ? String(s).toLowerCase() === ownAddress.toLowerCase() : ownNames.some((o) => String(s).toLowerCase().includes(o.toLowerCase())));

  for (const [ph, value] of Object.entries(map)) {
    const type = ph.slice(1, ph.indexOf('_'));
    if (type === 'PERSON') {
      const tokens = value.split(/[\s,;()]+/).filter((t) => t.length > 2 && /^[A-Za-zÄÖÜäöüß-]+$/.test(t) && !TITLES.test(t) && !STOP.test(t));
      if (tokens.some((t) => word(t).test(hay) || word(t.toUpperCase()).test(hay))) problems.push(`${ph}: Name noch im Text`);
    } else if (ID_TYPES.includes(type) && value.length >= 4 && word(value).test(hay)) problems.push(`${ph}: Kennung noch im Text`);
  }

  const residual = [
    ['E-Mail-Adresse', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => !isOwn(m)],
    ['Link', /https?:\/\/\S+/g],
    ['IBAN', /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/g],
    ['Telefonnummer', /(?:\+|00)\d{2}[\d\s/\-()]{6,}\d/g],
    ['lange Zahl', /\b\d{7,}\b/g],
  ];
  for (const [label, re, keep = () => true] of residual) {
    if ([...hay.matchAll(re)].some((m) => keep(m[0]))) problems.push(`${label} im Text übrig`);
  }
  return problems;
}

/**
 * Maskiert Texte streng. Mit check (Standard) wirft es AnonymizationError, wenn nach dem Maskieren noch Reste
 * gefunden werden. Aufrufer schicken dann nichts an ein Modell.
 */
export function maskTexts(meta, texts, { ownNames = [], ownAddress = '', check = true, findProblems = findLeaks } = {}) {
  const out = pseudonymizeTexts(meta, texts, { ownNames, ownAddress, extraPersons: detectNames(texts.join('\n')), extraPatterns: extraPatterns(ownAddress) });
  if (check) {
    const problems = findProblems(out.texts, out.map, { ownNames, ownAddress });
    if (problems.length) throw new AnonymizationError(`Anonymisierung unsicher: ${[...new Set(problems)].slice(0, 5).join('; ')}`);
  }
  return out;
}
