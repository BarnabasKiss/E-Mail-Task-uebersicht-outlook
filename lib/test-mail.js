// Testmails (von Claude erzeugt, mail_id beginnt mit "TEST-") gibt es in Outlook nicht.
// Die App kennzeichnet sie und baut den Mailinhalt aus der gespeicherten Vorschau.
export const isTestMail = (p) => String(p?.mail_id || '').startsWith('TEST-');

export function mailFromPreview(p, ownAddress) {
  return {
    subject: p.betreff,
    receivedDateTime: p.received_at,
    from: { emailAddress: { name: p.absender || '', address: p.absender_mail || '' } },
    toRecipients: [{ emailAddress: { name: '', address: ownAddress } }],
    ccRecipients: [],
    body: { contentType: 'text', content: p.vorschau || '' },
    webLink: p.web_link,
  };
}
