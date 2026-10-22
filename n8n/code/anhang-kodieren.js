// n8n Code-Node "Anhang kodieren" im Workflow "Mail-App Schnittstelle" (Aktion getAttachment).
// Einstellung: Mode "Run Once for All Items", Sprache JavaScript.
// Der vorherige Outlook-Node (Message Attachment → Download) legt die Datei als Binary im Feld "data" ab.
// Daraus wird JSON mit Base64-Inhalt, das der Webhook direkt zurückgibt.
const item = $input.first();
const bin = item.binary && item.binary.data;
if (!bin) return [{ json: { error: 'attachment', message: 'Anhang hat keinen Inhalt' } }];
const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
return [{ json: { name: bin.fileName || item.json.name || '', contentType: bin.mimeType || item.json.contentType || 'application/octet-stream', size: buf.length, contentBase64: buf.toString('base64') } }];
