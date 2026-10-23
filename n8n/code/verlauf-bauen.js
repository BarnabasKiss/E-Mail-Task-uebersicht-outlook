// Node "Verlauf bauen" (Code, Run Once for All Items): Aktion getThread.
// Sortiert die Nachrichten der Konversation (neueste zuerst), lässt Entwürfe weg und liefert eine Seite: limit (höchstens 25) und before (nur ältere).
const req = $('Mail-App Anfrage').item.json.body || {};
const before = String(req.before || '');
const limit = Math.min(Math.max(parseInt(req.limit, 10) || 10, 1), 25);
const p = (r) => ({ name: (r && r.emailAddress && r.emailAddress.name) || '', address: (r && r.emailAddress && r.emailAddress.address) || '' });
const time = (r) => String(r.sentDateTime || r.receivedDateTime || '');
const rows = $input.all().map((i) => i.json).filter((r) => r && r.id && !r.isDraft);
rows.sort((a, b) => time(b).localeCompare(time(a)));
const older = rows.filter((r) => !before || time(r) < before);
const page = older.slice(0, limit);
return [{ json: {
  items: page.map((r) => ({
    id: r.id,
    from: p(r.from),
    to: (r.toRecipients || []).map(p),
    cc: (r.ccRecipients || []).map(p),
    subject: r.subject || '',
    sent: time(r),
    hasAttachments: !!r.hasAttachments,
    body: String((r.body && r.body.content) || '').slice(0, 60000)
  })),
  hasMore: older.length > page.length,
  total: rows.length
} }];
