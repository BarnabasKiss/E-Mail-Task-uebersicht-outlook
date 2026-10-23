// Testmails (von Claude erzeugt, mail_id beginnt mit "TEST-") gibt es in Outlook nicht.
// Die App kennzeichnet sie und baut den Mailinhalt aus der gespeicherten Vorschau.
export const isTestMail = (p) => String(p?.mail_id || '').startsWith('TEST-');

export function mailFromPreview(p, ownAddress) {
  // Erste Zeile "[Rolle: cc]" oder "[Rolle: shared]" in der Vorschau stellt ein, wie die Testmail angekommen ist (sonst direkt).
  const role = /^\[Rolle:\s*(cc|shared)\]\s*\n?/i.exec(String(p.vorschau || ''));
  const mine = { emailAddress: { name: '', address: ownAddress } };
  const other = { emailAddress: { name: 'Support', address: 'support@kunde-beispiel.at' } };
  p = role ? { ...p, vorschau: p.vorschau.slice(role[0].length) } : p;
  const kind = role?.[1].toLowerCase();
  return {
    subject: p.betreff,
    receivedDateTime: p.received_at,
    from: { emailAddress: { name: p.absender || '', address: p.absender_mail || '' } },
    toRecipients: [kind === 'shared' || kind === 'cc' ? other : mine],
    ccRecipients: kind === 'cc' ? [mine] : [],
    // [bild:Dateiname] in der Vorschau steht für ein eingebettetes Bild aus <testDir>/<mail_id>/ (Dateiname beginnt mit "bild-")
    body: { contentType: 'text', content: String(p.vorschau || '').replace(/\[bild:([^\]]+)\]/g, '<img src="cid:$1">') },
    webLink: p.web_link,
  };
}
