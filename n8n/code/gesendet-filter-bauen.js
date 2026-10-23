// Node "Gesendet-Filter bauen" (Code, Run Once for All Items): Aktion listSent.
// Baut Filter und Ordnerliste für die gesendeten Mails. Eigene Adresse (OWN) und Ordner-IDs eintragen (IDs: im Outlook-Node bei "Folders to Include" nachsehen).
// scope "sent" (Standard) = nur der Ordner Gesendete Elemente. scope "all" = eigene Mails in den anderen Ordnern (Archiv, Posteingang, Unterordner).
// "before" wird streng geprüft, damit nichts in den Filter geschleust wird.
const OWN = 'DEINE-ADRESSE@firma.at';
const SENT = 'ID-DES-ORDNERS-GESENDETE-ELEMENTE';
const OTHER = ['ID-ARCHIV', 'ID-POSTEINGANG']; // weitere Ordner nach Bedarf
const req = $('Mail-App Anfrage').item.json.body || {};
const before = String(req.before || '');
const okBefore = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(before);
const limit = Math.min(Math.max(parseInt(req.limit, 10) || 25, 1), 25);
const all = req.scope === 'all';
const filter = (all ? `from/emailAddress/address eq '${OWN}' and ` : '') + 'isDraft eq false' + (okBefore ? ` and sentDateTime lt ${before}` : '');
return [{ json: { filter, limit, folders: all ? OTHER : [SENT] } }];
