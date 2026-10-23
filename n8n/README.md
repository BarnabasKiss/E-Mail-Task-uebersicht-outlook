# n8n-Workflows nachbauen

Die App braucht in n8n **zwei Workflows** und **eine Datentabelle**. Hier steht alles, was man zum Nachbauen braucht.
Zugangsdaten, Token und interne Adressen stehen absichtlich nicht im Repo. Wo etwas Eigenes einzutragen ist, steht `DEIN-…`
oder ein Hinweis dabei. Der Code der Code-Nodes liegt als Dateien in [`code/`](code), die Prompts in [`prompts/`](prompts).

```
Outlook ──► [1] Mail-Eingang ──► Datentabelle "Mail-Vorschläge" ◄──► [2] Mail-App Schnittstelle ◄──► Mini-App (localhost)
            (Pseudonymisieren, Modell,                              (Webhook: list, setStatus,
             Rückübersetzen, Speichern)                              getMail, hasReply, delete,
                                                       listAttachments, getAttachment, listSent)
```

Dazu in n8n anlegen (Namen sind frei wählbar):

| Credential | Typ in n8n | Wofür |
|---|---|---|
| Outlook | "Microsoft Outlook OAuth2 API" | Trigger, Mail holen, Verlauf suchen. Lesen genügt (Mail.Read). Die App-Registrierung erledigt bei Firmenkonten meist die IT. |
| Modell | "OpenAI API" (OpenAI-kompatibel) | Bewertung. Im Beispiel OpenRouter mit EU-Routing. Basis-URL, Schlüssel und Modell sind eigene Werte. |

Die Mini-App schreibt **nie** in Outlook. n8n liest dort nur.

## 1. Datentabelle "Mail-Vorschläge"

n8n → "Data tables" → neue Tabelle, Spalten (Name exakt so, Typ in Klammern, alles Text außer `antwort_noetig`).
`id`, `createdAt` und `updatedAt` legt n8n selbst an.

| Spalte | Inhalt |
|---|---|
| `mail_id` | Outlook-Nachrichten-ID (Graph-ID) |
| `conversation_id` | Outlook-Konversations-ID, verbindet Mails und Antworten |
| `received_at` | Eingang, ISO-Zeit |
| `absender`, `absender_mail` | Name und Adresse des Absenders |
| `betreff` | Betreff im Klartext |
| `vorschau` | die ersten 400 Zeichen des Mailtexts im Klartext |
| `web_link` | Link zur Mail in Outlook im Web |
| `dringlichkeit` | `jetzt`, `heute`, `woche`, `egal` |
| `kategorie` | z. B. Kunde, Schadenfall, Intern, Rechnung/Buchhaltung, IT/Support, Newsletter/Werbung, Sonstiges |
| `zusammenfassung` | ein Satz |
| `antwort_noetig` | **Boolean** |
| `aufgabe_text`, `aufgabe_thema` | Aufgabenvorschlag und Themenbereich (leer, wenn keine Aufgabe) |
| `frist` | `YYYY-MM-DD` oder leer |
| `begruendung` | ein Satz, warum diese Dringlichkeit |
| `status` | siehe unten |

**Statuswerte:** `neu` (offen), `done` (verworfen), `angenommen` (Aufgabe wurde in die Liste übernommen),
`beantwortet` (Antwort in Outlook erkannt), `eigene_mail` und `test` (zur Seite gelegt). Der Bereich "Done" der App zeigt
`done`, `angenommen` und `beantwortet`.

## 2. Workflow "Mail-Eingang (pseudonymisiert)"

Holt neue Mails, ersetzt personenbezogene Daten durch Platzhalter, lässt ein Modell bewerten, setzt die Daten wieder ein
und speichert eine Zeile. **Personenbezogene Daten verlassen n8n nie im Klartext Richtung Modell.**

Nodes in dieser Reihenfolge, alle in einer Linie verbunden (das Modell und der Output-Parser hängen als Unter-Nodes am Chain-Node):

1. **Neue Mail (Outlook)** – Node "Microsoft Outlook Trigger", Credential Outlook.
   - Event: *Message Received*. Poll: alle **5 Minuten** (*Every X*, 5 Minuten).
   - Output: *Select Included Fields* mit `conversationId, subject, from, toRecipients, ccRecipients, body, bodyPreview, receivedDateTime, webLink, importance, hasAttachments`.
   - Filter: *Read Status* = **Both** (sonst gehen Mails verloren, die du am Handy schon gelesen hast).
   - Der Trigger holt nur **neue** Mails, kein altes Postfach.
2. **Eigene Mails ausschließen** – Node "Filter". Bedingung: `{{ ($json.from.emailAddress.address || '').toLowerCase() }}` *is not equal to* **deine Adresse**.
   Der Trigger liefert sonst auch deine gesendeten Mails.
3. **Pseudonymisieren** – Node "Code", *Run Once for Each Item*, JavaScript, Code aus [`code/pseudonymisieren.js`](code/pseudonymisieren.js).
   - Wandelt HTML in Text, kürzt auf 4000 Zeichen und schneidet zitierte Vorgängermails ab.
   - Ersetzt: Namen (Absender, An, Cc, Anrede, Grußformel, "Herr/Frau …"), E-Mail-Adressen (nur der Teil vor dem @), Links,
     IBAN, Fahrgestellnummern, Kennzeichen, Geburtsdaten, Schaden-, Akten-, Rechnungs- und Belegnummern (auch nach "Akte", "Schaden", "Fall", "Vorgang"), Adressen, Telefonnummern,
     Sozialversicherungsnummern und lange Zahlen. Frist- und andere Datumsangaben bleiben stehen, denn sie bestimmen die Dringlichkeit.
   - Gleicher Wert = gleicher Platzhalter (`[PERSON_1]`, `[TEL_1]`, `[AKTE_2]` …). So bleibt der Zusammenhang für das Modell erhalten.
   - Eigene Namen (Konstante `OWN`) bleiben unmaskiert.
   - Ausgabe: `subject_clean`, `text_clean`, `map` (Platzhalter → Originalwert) und die Felder der späteren Tabellenzeile.
     Die `map` verlässt n8n nicht.
4. **Mail bewerten** – Node "Basic LLM Chain". Prompt, System-Nachricht und Output-Parser stehen in [`prompts/bewertung.md`](prompts/bewertung.md).
   - *Require Specific Output Format* an. Unter-Nodes: **Chat Model** ("OpenAI Chat Model", Credential Modell, Modell frei wählbar,
     *Use Responses API* **aus**, Temperatur **0.1**) und **Structured Output Parser** (Schema aus JSON-Beispiel).
   - Das Modell liefert: `dringlichkeit`, `kategorie`, `zusammenfassung`, `antwort_noetig`, `aufgabe_text`, `aufgabe_thema`, `frist`, `begruendung`.
   - Es kennt die Aufgabenliste nicht und nennt nur ein kurzes Thema. Die Zuordnung zu einer Überschrift macht die App lokal.
5. **Rückübersetzen** – Node "Code", *Run Once for Each Item*, Code aus [`code/rueckuebersetzen.js`](code/rueckuebersetzen.js).
   Ersetzt die Platzhalter in allen Texten wieder durch die Originalwerte (aus der `map` des Nodes "Pseudonymisieren"),
   prüft die Dringlichkeit (sonst `woche`) und baut die Tabellenzeile mit `status = neu`.
6. **Vorschlag speichern** – Node "Data table", *Insert row*, Tabelle "Mail-Vorschläge", *Map Automatically* (Eingabefelder → Spalten).

Aktivieren (*Publish*). **Änderungen wirken in n8n erst nach erneutem Veröffentlichen.**

## 3. Workflow "Mail-App Schnittstelle"

Ein einziger Webhook, den nur die Mini-App aufruft. Er liest und ändert nur die Tabelle und liest Outlook, er schreibt nie in Outlook.

**Namen der Nodes:** Der Webhook-Node muss **`Mail-App Anfrage`** heißen, denn Ausdrücke und Code-Nodes verweisen mit
`$('Mail-App Anfrage')` auf ihn. Ebenso heißt in Workflow 1 der Code-Node **`Pseudonymisieren`** (der Node "Rückübersetzen" greift darauf zu).
Andere Namen funktionieren, wenn man die Verweise in Ausdrücken und Code mit umbenennt.

**Webhook-Node:** Methode **POST**, Pfad `mail-app`, Authentication *None*, *Respond* = **Using 'Respond to Webhook' Node**.
Aufruf: `POST https://DEINE-N8N-ADRESSE/webhook/mail-app` mit Header `x-app-token: DEIN-TOKEN` und JSON-Body `{"action": "…", …}`.

**Token:** selbst erzeugen (`openssl rand -hex 24`). Er steht an zwei Stellen: im IF-Node dieses Workflows und im `config.json` der App.
Er ist die einzige Absicherung. Jeder, der Workflows in deinem n8n öffnen darf, kann ihn lesen.

Ablauf:

1. **Token gültig?** – Node "If". `{{ $json.headers['x-app-token'] }}` *is equal to* dein Token (Groß/Klein beachten).
   *False* → Respond to Webhook, JSON `{ "error": "unauthorized" }`, Response Code **401**.
2. **Aktion wählen** – Node "Switch", Modus *Rules*, **acht** Regeln (`list`, `setStatus`, `getMail`, `hasReply`, `delete`, `listAttachments`, `getAttachment`, `listSent`) auf `{{ $json.body.action }}` (*String equals*), Ausgabe-Namen wie die Aktion,
   plus Ausgang **Fallback** (*Extra*): Respond to Webhook, JSON `{ "error": "unknown action" }`, Code **400**.

| Aktion | Body | Was passiert | Antwort |
|---|---|---|---|
| `list` | `status` (Standard `neu`) | **Data table → Get row(s)**: Bedingung `status` *equals* `{{ $('Mail-App Anfrage').item.json.body.status \|\| 'neu' }}`, *Return All*, sortiert nach `createdAt` absteigend, **Always Output Data** an. Danach Code-Node [`code/antwort-bauen.js`](code/antwort-bauen.js), dann Respond *First Incoming Item*. | `{ "items": [ Zeilen ] }` |
| `setStatus` | `id` (Zeilen-ID), `newStatus` | **Data table → Update row(s)**: Bedingung `id` *equals* `{{ $json.body.id }}`, setzt die Spalte `status` auf `{{ $json.body.newStatus }}`. Respond JSON. | `{ "ok": true }` |
| `getMail` | `id` (Outlook-ID = Spalte `mail_id`) | **Microsoft Outlook → Message → Get**, *Message ID* = `{{ $('Mail-App Anfrage').item.json.body.id }}` (Modus *By ID*), Output *Select Included Fields*: `body, from, toRecipients, ccRecipients, subject, receivedDateTime, conversationId, webLink`. Respond *First Incoming Item*. | die Mail (Graph-Format) |
| `hasReply` | `id`, `conversationId`, optional `after` | **Microsoft Outlook → Message → Get Many**: *Limit* 50, *Read Status* **Both**, *Filter Query* `={{ "conversationId eq '" + $('Mail-App Anfrage').item.json.body.conversationId + "'" }}`, Output *Select Included Fields*: `from, body, subject, sentDateTime, isDraft, conversationId, parentFolderId`, **Always Output Data** an. Danach Code-Node [`code/eigene-antwort-finden.js`](code/eigene-antwort-finden.js), dann Respond *First Incoming Item*. | `{ "hasReply": bool, "messagesInConversation": n, "reply": { sentDateTime, subject, body } oder null }` |
| `delete` | `id` (Zeilen-ID) | **Data table → Delete row(s)**: Bedingung `id` *equals* `{{ $json.body.id }}`, *Must match* **all conditions**. Respond JSON. | `{ "ok": true, "deleted": true }` |
| `listAttachments` | `id` (Outlook-ID) | **Microsoft Outlook → Message Attachment → Get Many**: *Message ID* = `{{ $('Mail-App Anfrage').item.json.body.id }}` (Modus *By ID*), *Return All*, Felder `contentType, isInline, name, size`, **Always Output Data** an. Danach Code-Node [`code/anhangliste-bauen.js`](code/anhangliste-bauen.js), dann Respond *First Incoming Item*. | `{ "items": [ { id, name, contentType, size, isInline } ] }` |
| `listSent` | `limit` (höchstens 25), `before` (ISO-Zeit `…Z`, optional: nur ältere), `scope` (`sent` = Ordner Gesendete Elemente, `all` = eigene Mails in Archiv, Posteingang und Unterordnern) | Node **Code** [`code/gesendet-filter-bauen.js`](code/gesendet-filter-bauen.js) (eigene Adresse eintragen) baut den Filter, dann **Microsoft Outlook → Message → Get Many**: *Limit* `{{ $json.limit }}`, *Read Status* **Both**, *Folders to Include* `{{ $json.folders }}`, *Filter Query* `{{ $json.filter }}`, Felder `from, body, subject, sentDateTime, isDraft, conversationId, toRecipients, ccRecipients`, **Always Output Data** an. Danach Code-Node [`code/gesendete-bauen.js`](code/gesendete-bauen.js), dann Respond *First Incoming Item*. Nur lesend; die App blättert damit durch deine gesendeten Mails (siehe [Lernen aus Gesendetem](../docs/bedienung.md#aus-gesendeten-mails-lernen)). | `{ "items": [ { id, conversationId, subject, sentDateTime, to, cc, body } ] }`, neueste zuerst |
| `getAttachment` | `id` (Outlook-ID), `attachmentId` | **Microsoft Outlook → Message Attachment → Download**: *Message ID* wie oben, *Attachment ID* = `{{ $('Mail-App Anfrage').item.json.body.attachmentId }}` (Modus *By ID*), *Put Output in Field* `data`. Danach Code-Node [`code/anhang-kodieren.js`](code/anhang-kodieren.js), dann Respond *First Incoming Item*. | `{ name, contentType, size, contentBase64 }` |

Beide Anhang-Aktionen haben in der Switch-Regel eine zweite Bedingung "ID nicht leer" (`getAttachment` zusätzlich "attachmentId nicht leer"), damit eine Anfrage ohne ID im Fallback (400) landet.

**Wichtig bei `delete`:** Die Switch-Regel für `delete` hat **zwei** Bedingungen (UND): `action` ist `delete` **und**
`{{ String($json.body.id ?? '') }}` *is not empty*. Ohne ID fällt die Anfrage in den Fallback (400), damit nie ohne Filter gelöscht wird.

**Fehlerbehandlung bei Outlook:** Bei den Nodes für `getMail`, `hasReply`, `listAttachments`, `getAttachment` und `listSent` unter *Settings → On Error* **Continue (using error output)** wählen
und den Fehler-Ausgang an einen Respond-to-Webhook-Node hängen: JSON
`={{ JSON.stringify({ error: 'outlook', message: ($json.error && $json.error.message) || 'Outlook-Fehler' }) }}`, Code **502**.
Ohne das antwortet der Webhook bei einem Outlook-Fehler leer mit 200, und die App kann ihn nicht erkennen.

Aktivieren (*Publish*). Danach zum Prüfen (Platzhalter ersetzen):

```bash
curl -s -X POST https://DEINE-N8N-ADRESSE/webhook/mail-app \
  -H "x-app-token: DEIN-TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"list","status":"neu"}'
# erwartet: {"items":[]}  – ohne oder mit falschem Token: 401, unbekannte Aktion: 400
```

## 4. Eigene Werte eintragen (Checkliste)

- [ ] Datentabelle angelegt (Namen und Typen wie oben)
- [ ] Credentials für Outlook und Modell erstellt und an den Nodes gewählt
- [ ] Workflow 1: eigene Adresse im Filter, eigene Namen in `OWN` im Code, Name und Firma im System-Prompt, Tabelle gewählt
- [ ] Workflow 2: Token im IF-Node, eigene Adresse in `eigene-antwort-finden.js` und `gesendet-filter-bauen.js`, Tabelle in den drei Data-table-Nodes gewählt
- [ ] Beide Workflows veröffentlicht
- [ ] In `config.json` der App: `n8n.url` und `n8n.token`

## 5. Tipps

- **Testen ohne Postfach:** Beim Trigger-Node Testdaten anheften (Pin Data) und den Workflow manuell ausführen. Die erfundene Mail sollte
  `mail_id` mit `TEST-` beginnen lassen. Die App markiert solche Mails als Testnachricht und holt für sie nichts aus Outlook.
- **Dringlichkeit und Aufgaben prüfen:** Die Qualität hängt am Prompt in `prompts/bewertung.md`. Dort anpassen (Kategorien, Regeln, Ton).
- **Pseudonymisierung:** Namen ohne "Herr/Frau", Anrede oder Signatur und Firmennamen werden nicht erkannt. Für sensible Fälle eine Namensliste
  oder ein lokales Modell als Zusatzschritt ergänzen.
