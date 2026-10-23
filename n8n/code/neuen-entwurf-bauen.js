// Node "Neuen Entwurf bauen" (Code): Antwort der Aktion saveNewDraft. Liest den Entwurf aus "Empfänger setzen (neu)" (nicht aus dem Vorgänger:
// mit einem Signaturbild liegt dazwischen der Aufruf, der das Bild anhängt).
const d = $('Empfänger setzen (neu)').first().json;
const a = (l) => (l || []).map((r) => (r.emailAddress && r.emailAddress.address) || '');
return [{ json: { draftId: d.id, webLink: d.webLink || '', isDraft: d.isDraft, to: a(d.toRecipients), cc: a(d.ccRecipients), bcc: a(d.bccRecipients) } }];
