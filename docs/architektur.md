# Architektur und Entwicklung

## Überblick

```
Outlook ─► n8n "Mail-Eingang"  ─► Datentabelle "Mail-Vorschläge" ◄─► n8n "Mail-App Schnittstelle" ◄─► diese App (localhost)
           pseudonymisiert,        (Status: neu, done,                (Webhook, Token)                 │
           Modell bewertet,         angenommen, beantwortet)                                            ├─► Obsidian: 📋 3 Aufgaben.md
           Platzhalter zurück                                                                           └─► claude -p (lokal): Entwürfe, Lernen
```

- **n8n** (Server) holt neue Outlook-Mails, pseudonymisiert sie, lässt ein Modell Dringlichkeit, Zusammenfassung und Aufgabenvorschlag bestimmen,
  setzt die Daten wieder ein und speichert eine Zeile je Mail. Nachbauanleitung: [n8n/README.md](../n8n/README.md).
- **Die App** (lokal, Node.js ohne Pakete) liest die Zeilen über den Webhook, zeigt sie wie einen Posteingang, übernimmt Aufgaben in Obsidian,
  erzeugt Entwürfe über `claude -p` und führt einen lokalen Suchindex. Sie schreibt nie in Outlook. Ohne Build: die Oberfläche sind ES-Module.

## Dateikarte

```
server.js               Startpunkt: baut alle Module zusammen, startet Hintergrundjobs und den lokalen Webserver
config.example.json     Vorlage der Einstellungen (config.json ist nicht im Repo)
actions/                eine Datei je Aktion: accept, archive, delete, restore, snooze, regenerate-draft, review-revert
lib/
  Schnittstelle
    api.js              Routen unter /api/ (nur Routing), statische Dateien
    http.js             Antworten senden, JSON lesen, statische Dateien sicher ausliefern
    proposal-view.js    Mailliste für die Oberfläche (Zeile aus n8n + alles Lokale)
    mail-view.js        Detailansicht und "Was bekäme Claude?" (anonymisierte Vorschau)
    attachment-http.js  Auslieferung eines Anhangs (nie als HTML/Skript)
    open-file.js        Datei mit dem Standardprogramm öffnen (Windows, macOS, Linux)
  Daten und Dienste
    n8n-client.js       spricht nur mit der n8n-Schnittstelle (list, setStatus, getMail, hasReply, Anhänge)
    scheduler.js        Hintergrundjobs: Vorschläge, Done-Liste, Antworten, Entwürfe, Lernen (+ Zusatzjobs der Module)
    store.js            lokaler Zustand (state.json, atomar geschrieben)
    config.js           config.json laden, ~ und %VAR% in Pfaden ersetzen
    rules.js            Regeldatei Mail-Regeln.md: lesen, Regeln anhängen, Dringlichkeits-/Ignorieren-Regeln
    vault.js            einzige Stelle, die die Aufgabenliste ändert (Sicherung, Prüfung, Rückspielen)
    claude.js           ruft claude -p ohne Werkzeuge auf, nacheinander
    matcher.js          ordnet eine Aufgabe einer Überschrift zu
    drafts.js           Antwortentwurf erzeugen (pseudonymisiert), Mail holen
    learner.js          Entwurf mit gesendeter Antwort vergleichen, Stilregeln ableiten
  Anonymisierung
    pseudonymize.js     Namen und Kennungen durch Platzhalter ersetzen und zurücktauschen
    mask-strict.js      strenge Stufe für Anhangs- und Bildtext, mit Prüfung danach
  Anhänge, Text, Suche
    extract-text.js     Text aus Dateien (Text/HTML, Word, Excel, PowerPoint, PDF, Bilder per OCR)
    attachments.js      Anhang-Dienst: Liste, Download, Zwischenspeicher, Bilder im Mailtext, Textauszüge
    attachment-info.js  Hintergrundjob: Anhangsnamen für den Anhang-Tag
    doc-index.js        Hintergrundjob und Suche: Anhangstext, Empfänger, Mailtext
    html.js             HTML zu Text, Marken für eingebettete Bilder, zitierte Verläufe abschneiden
    test-mail.js        Testmails (mail_id ab TEST-)
  Auswertung
    roles.js            Direkt/CC/Shared aus An/Cc
    importance.js       Tag "Wichtig" aus dem Inhalt
    attachment-review.js  Modul: Mails mit Anhängen lokal neu bewerten (abschaltbar)
    errors.js           technische Fehler in verständliche Sätze
public/                 Oberfläche
  index.html, app.css
  js/
    main.js             Zustand und Ablauf (Liste, Detail, Aktionen)
    search-controller.js, search.js     Suche und Filter (Zustand, Logik)
    attention.js, attention-signal.js, tab-signal.js, notifier.js   Tab-Symbol, Titel, Benachrichtigungen
    hash.js, shortcuts.js, status-bar.js, api.js, util.js, icons.js, snooze-options.js
    components/         list, detail, mail-body, mail-text, attachments-box, task-row, draft-panel, search-panel, menu, snooze-menu
test/                   Tests (node --test); test/ui/ = Oberfläche im simulierten Browser
n8n/                    Nachbauanleitung, Code der Code-Nodes, Prompt
docs/                   diese Doku
```

## Hintergrundjobs
Alle laufen im Scheduler (`lib/scheduler.js`), nacheinander je Job, ein Fehler stoppt keinen anderen. Intervalle: [Konfiguration](konfiguration.md#hintergrundjobs-poll-sekunden).
Jobs, die Outlook abfragen, begrenzen sich selbst (wenige Mails je Lauf), merken sich das Ergebnis und pausieren nach einem Fehler.

| Job | Datei | Zweck |
|---|---|---|
| proposals, archive | scheduler | offene Mails und Done aus n8n holen |
| replies | scheduler | hast du schon geantwortet? Dann „beantwortet“ |
| drafts, learn | scheduler, drafts, learner | Entwürfe erzeugen, aus gesendeten Antworten lernen |
| roles | roles | Direkt/CC/Shared bestimmen |
| attInfo | attachment-info | Anhangsnamen für den Tag |
| docIndex | doc-index | Suchindex nachführen |
| review | attachment-review | Anhangs-Bewertung (nur wenn eingeschaltet) |

## Schnittstelle (`/api/`)
| Aufruf | Zweck |
|---|---|
| `GET /proposals` | Liste (offen und Done) |
| `GET /proposals/:id` | Detail: Mail, Empfänger, Entwurf, Überschriften |
| `GET /proposals/:id/ai-view` | anonymisierte Vorschau (Mailtext, Bilder, Anhänge, Prüfergebnis) |
| `GET /proposals/:id/attachments[/:attId]` | Anhangsliste oder eine Datei (`?download=1`), `review-preview` mit dem Modul |
| `POST /proposals/:id/match` | Überschrift für die Aufgabe vorschlagen |
| `POST /actions/:name` | Aktion ausführen (Header `x-mail-app: 1` nötig) |
| `POST /refresh`, `POST /open-rules`, `GET /status` | neu laden, Regeldatei öffnen, Zustand |
| `GET /search?q=&content=&names=&text=` | Treffer im Suchindex (`=0` schaltet einen Bereich ab) |

## Erweitern
**Neue Aktion:** `actions/meine-aktion.js` mit `export default { name: 'meine-aktion', async run(services, payload) { … } }`, in `actions/index.js` aufnehmen,
in der Oberfläche `api.action('meine-aktion', {…})` aufrufen. `services` = `{ n8n, vault, rules, store, drafts, matcher, scheduler, review }`.

**Neuer Hintergrundjob:** ein Modul mit `run()`, in `server.js` als `[name, run, Sekunden]` in `extraJobs` eintragen (Vorbild: `lib/roles.js`).

**Neues Feld in der Liste:** in `lib/proposal-view.js` ergänzen, in `public/js/components/list.js` darstellen, Test in `test/api.test.js` und `test/ui/list.test.js`.

**Entwürfe direkt in Outlook ablegen:** Heute landet der Entwurf in der Oberfläche (Kopieren-Knopf in `draft-panel.js`). Für Outlook-Entwürfe braucht n8n eine
weitere Aktion, die mit `saveAsDraft: true` antwortet (ohne diese Option sendet der Outlook-Node sofort), und Schreibrechte der Outlook-Verbindung.

## Entwicklung und Tests
- `node --test` führt alle Tests aus (ohne Netz, ohne Outlook, ohne Claude). Windows, Linux und macOS werden bei jedem Push von GitHub Actions geprüft
  (`.github/workflows/test.yml`).
- **Logik- und Schnittstellentests** (`test/*.test.js`): Pseudonymisierung, strenge Maskierung, Vault, Regeln, Textauszug, Anhänge, Suchindex, Wichtig, Rollen,
  Suchlogik, Aktionen und die HTTP-Schnittstelle mit Attrappen für n8n und Outlook (`test/api.test.js`).
- **Oberflächentests** (`test/ui/*.test.js`): die echte `index.html` und die echten Module in einem simulierten Browser (jsdom), `fetch` ist eine Attrappe.
  Sie brauchen `npm install` (jsdom ist die einzige Entwicklungs-Abhängigkeit); ohne jsdom werden sie übersprungen. Sie sichern das Zusammenspiel
  (Liste, Auswahl, Suche, Filter, Aktionen, Tastatur, Tab-Titel) ab, ersetzen aber keinen Blick in den echten Browser (Layout, Farben).
- Stil: ES-Module ohne Build, deutsche Kommentare, Inhalte werden in der Oberfläche immer als Text eingefügt (nie als HTML). Dateien beginnen mit einem Kommentar,
  der ihre Aufgabe nennt. Reine Logik steht getrennt von DOM und Netz (z. B. `search.js`, `attention.js`), damit sie sich testen lässt.
