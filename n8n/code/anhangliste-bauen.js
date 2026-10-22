// n8n Code-Node "Anhangliste bauen" im Workflow "Mail-App Schnittstelle" (Aktion listAttachments).
// Einstellung: Mode "Run Once for All Items", Sprache JavaScript.
// Der vorherige Outlook-Node (Message Attachment → Get Many) hat "Always Output Data" an.
// Liefert immer genau eine Antwort {items: [...]}, auch wenn die Mail keine Anhänge hat. Kein Dateiinhalt.
const rows = $input.all().map((i) => i.json).filter((r) => r && r.id);
return [{ json: { items: rows.map((r) => ({ id: r.id, name: r.name || '', contentType: r.contentType || '', size: r.size || 0, isInline: !!r.isInline })) } }];
