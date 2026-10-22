// n8n Code-Node "Antwort bauen" im Workflow "Mail-App Schnittstelle" (Aktion list).
// Einstellung: Mode "Run Once for All Items", Sprache JavaScript.
// Der vorherige Data-Table-Node hat "Always Output Data" an. Gibt es keine Zeile, kommt ein leeres Element an.
// Dieser Node macht daraus immer genau eine Antwort {items: [...]} (bei keinen Treffern eine leere Liste),
// damit der Webhook nie ohne Antwort hängen bleibt.
const rows = $input.all().map((i) => i.json).filter((r) => r && r.mail_id);
return [{ json: { items: rows } }];
