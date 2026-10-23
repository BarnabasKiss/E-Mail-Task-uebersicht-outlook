// Node "Entwurf-Antwort bauen" (Code): Antwort der Aktion saveDraft. Liest den Entwurf aus "Empfänger setzen" (nicht aus dem Vorgänger:
// mit einem Signaturbild liegt dazwischen der Aufruf, der das Bild anhängt).
const d = $('Empfänger setzen').first().json;
const a = (l) => (l || []).map((r) => (r.emailAddress && r.emailAddress.address) || '');
return [{ json: { draftId: d.id, webLink: d.webLink || '', isDraft: d.isDraft, to: a(d.toRecipients), cc: a(d.ccRecipients), preview: String((d.body && d.body.content) || '').slice(0, 400) } }];
