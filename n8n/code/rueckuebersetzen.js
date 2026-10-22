// n8n Code-Node "Rückübersetzen" im Workflow "Mail-Eingang (pseudonymisiert)".
// Einstellung: Mode "Run Once for Each Item", Sprache JavaScript.
// Eingabe: Antwort des Modells (Feld "output"). Der Node holt die "map" aus dem Node "Pseudonymisieren" und setzt
// die echten Daten für Platzhalter wie [PERSON_1] wieder ein. Ausgabe: eine fertige Tabellenzeile.
const src = $('Pseudonymisieren').item.json;
const out = $input.item.json.output || {};
const map = src.map || {};
const back = (s) => String(s == null ? '' : s).replace(/\[?([A-ZÄÖÜ]+_\d+)\]?/g, (all, k) => (map['[' + k + ']'] !== undefined ? map['[' + k + ']'] : all));
const LEVELS = ['jetzt', 'heute', 'woche', 'egal'];
const level = LEVELS.includes(out.dringlichkeit) ? out.dringlichkeit : 'woche';
return {
  json: {
    mail_id: src.mail_id,
    conversation_id: src.conversation_id,
    received_at: src.received_at,
    absender: src.absender,
    absender_mail: src.absender_mail,
    betreff: src.betreff,
    vorschau: src.vorschau,
    web_link: src.web_link,
    dringlichkeit: level,
    kategorie: back(out.kategorie),
    zusammenfassung: back(out.zusammenfassung),
    antwort_noetig: out.antwort_noetig === true,
    aufgabe_text: back(out.aufgabe_text),
    aufgabe_thema: back(out.aufgabe_thema),
    frist: back(out.frist),
    begruendung: back(out.begruendung),
    status: 'neu'
  }
};
