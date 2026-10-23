// Node "Gesendete bauen" (Code, Run Once for All Items): Aktion listSent.
// Macht aus den Outlook-Mails die Antwort der Schnittstelle: neueste zuerst, Empfänger als Name und Adresse, Text auf 40.000 Zeichen gekürzt.
const rows = $input.all().map((i) => i.json).filter((r) => r && r.id);
const p = (r) => ({ name: (r && r.emailAddress && r.emailAddress.name) || '', address: (r && r.emailAddress && r.emailAddress.address) || '' });
const items = rows
  .sort((a, b) => String(b.sentDateTime || '').localeCompare(String(a.sentDateTime || '')))
  .map((r) => ({
    id: r.id,
    conversationId: r.conversationId || '',
    subject: r.subject || '',
    sentDateTime: r.sentDateTime || '',
    to: (r.toRecipients || []).map(p),
    cc: (r.ccRecipients || []).map(p),
    body: String((r.body && r.body.content) || '').slice(0, 40000)
  }));
return [{ json: { items } }];
