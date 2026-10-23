// "Wichtig": Hinweise im Mailinhalt auf etwas Kritisches oder sehr Wichtiges (Eskalation, Störung, Mahnung, Frist ...).
// Rein lokal und ohne KI-Aufruf, damit es sofort für alle Mails gilt. Liefert die Gründe (für den Tooltip), leer = nicht wichtig.
// Gelesen werden nur Felder, die ohnehin in der Tabelle stehen: Betreff, Vorschau, Zusammenfassung, Begründung, Aufgabe.

// [Anzeigename, Muster]. Muster steht ohne Wortgrenze, die setzt die Prüfung (auch vor Umlauten).
const SIGNALS = [
  ['Dringend', 'dringend\\w*|eilt|eilig\\w*|asap|umgehend\\w*|unverzüglich\\w*|sofort\\w*'],
  ['Kritisch/Eskalation', 'kritisch\\w*|eskalat\\w*|eskalier\\w*'],
  ['Störung/Ausfall', 'störung\\w*|ausfall\\w*|ausgefallen|nicht erreichbar'],
  ['Sicherheit/Datenschutz', 'datenleck\\w*|datenpanne\\w*|sicherheitsvorfall\\w*|sicherheitslücke\\w*|datenschutzverletzung\\w*|cyberangriff\\w*|hackerangriff\\w*'],
  ['Mahnung/Recht', 'mahnung\\w*|mahnverfahren|inkasso|zahlungsverzug|klage|klagen|(?:rechts)?anwalt\\w*|rechtsabteilung|haftung\\w*|schadenersatz\\w*'],
  ['Kündigung', 'kündigung\\w*|kündigen'],
  ['Geschäftsführung', 'geschäftsführ\\w*|vorstand'],
  ['Beschwerde', 'beschwerde\\w*|reklamation\\w*'],
  ['Behörde', 'behörde\\w*|finanzamt'],
  ['Frist läuft ab', 'fristablauf|frist läuft|letzte frist|ablauf der frist|letzte mahnung'],
].map(([label, re]) => [label, new RegExp(`(?<![\\wäöüÄÖÜß])(?:${re})(?![\\wäöüÄÖÜß])`, 'gi')]);

// "nicht dringend", "keine Eskalation", "ohne Frist" zählen nicht
const NEGATED = /(?:nicht|kein\w*|ohne|nie|wenig\w*)[\s,:-]*$/i;

const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function importanceReasons(p, now = new Date()) {
  if (p.archiviert || p.dringlichkeit === 'egal' || /newsletter|werbung/i.test(p.kategorie || '')) return [];
  const text = [p.betreff, p.vorschau, p.zusammenfassung, p.begruendung, p.aufgabe_text].filter(Boolean).join('\n');
  const reasons = [];
  for (const [label, re] of SIGNALS) {
    for (const m of text.matchAll(re)) {
      if (NEGATED.test(text.slice(Math.max(0, m.index - 16), m.index))) continue;
      reasons.push(`${label} („${m[0]}“)`);
      break;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(p.frist || '')) {
    const days = Math.round((new Date(`${p.frist.slice(0, 10)}T00:00:00`) - day(now)) / 86400000);
    if (days < 0) reasons.push('Frist überschritten');
    else if (days === 0) reasons.push('Frist heute');
    else if (days === 1) reasons.push('Frist morgen');
  }
  return reasons;
}
