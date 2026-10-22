// n8n Code-Node "Eigene Antwort finden" im Workflow "Mail-App Schnittstelle" (Aktion hasReply).
// Einstellung: Mode "Run Once for All Items", Sprache JavaScript.
// Eingabe: alle Mails des Verlaufs (Outlook "Verlauf suchen", Filter conversationId eq '...').
// Gesucht wird die letzte eigene, gesendete Antwort: Absender = eigene Adresse, kein Entwurf, nicht die Mail selbst
// und (falls "after" mitgeschickt wird) nach dem Eingang der Mail gesendet.
const OWN = 'vorname.nachname@firma.at'; // EIGENE Adresse eintragen
const req = $('Mail-App Anfrage').item.json.body || {};
const after = String(req.after || '');
const rows = $input.all().map((i) => i.json).filter((r) => r && r.id);
const own = rows
  .filter((r) => r.from && r.from.emailAddress && String(r.from.emailAddress.address).toLowerCase() === OWN && !r.isDraft)
  .filter((r) => r.id !== req.id)
  .filter((r) => !after || String(r.sentDateTime || '') > after)
  .sort((a, b) => String(b.sentDateTime || '').localeCompare(String(a.sentDateTime || '')));
const last = own[0];
return [{
  json: {
    hasReply: own.length > 0,
    messagesInConversation: rows.length,
    reply: last ? { sentDateTime: last.sentDateTime, subject: last.subject, body: last.body && last.body.content ? last.body.content : '' } : null
  }
}];
