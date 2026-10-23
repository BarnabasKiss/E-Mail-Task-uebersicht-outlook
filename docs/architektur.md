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
  erzeugt Entwürfe über `claude -p` und führt einen lokalen Suchindex. In Outlook schreibt sie nur auf deinen Klick (Entwurf ablegen, senden). Ohne Build: die Oberfläche sind ES-Module.

## Dateikarte

```
server.js               Startpunkt: baut alle Module zusammen, startet Hintergrundjobs und den lokalen Webserver
config.example.json     Vorlage der Einstellungen (config.json ist nicht im Repo)
actions/                eine Datei je Aktion: accept, archive, delete, restore, snooze, regenerate-draft, review-revert, contact, history-learn, outlook-draft, outlook-draft-delete, outlook-send, book, compose (compose-draft, compose-send, compose-discard), text-tools (text-improve, text-subject), send-check, outbox (mail-draft-save, mail-draft-delete, schedule, schedule-cancel, schedule-now, reply-edit), bulk (Sammelaktion)
lib/
  Schnittstelle
    api.js              Routen unter /api/ (nur Routing), statische Dateien
    http.js             Antworten senden, JSON lesen, statische Dateien sicher ausliefern
    proposal-view.js    Mailliste für die Oberfläche (Zeile aus n8n + alles Lokale)
    mail-view.js        Detailansicht und "Was bekäme Claude?" (anonymisierte Vorschau)
    attachment-http.js  Auslieferung eines Anhangs (nie als HTML/Skript), mit ?preview=1 die erste PDF-Seite als PNG
    pdf-preview.js      erste PDF-Seite als Vorschaubild (pdftoppm, optional)
    open-file.js        Datei mit dem Standardprogramm öffnen (Windows, macOS, Linux)
  Daten und Dienste
    n8n-client.js       spricht nur mit der n8n-Schnittstelle (list, setStatus, getMail, hasReply, Anhänge, listSent, getThread, saveDraft, saveNewDraft, deleteDraft, sendDraft, listContacts)
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
  Verlauf und Antworten
    outbox.js           App-Entwürfe neuer Mails und geplante Mails (Job zur Sendezeit)
    text-tools.js       Umschreiben (kürzer, förmlicher, freundlicher, Stichpunkte → Mail), Übersetzen, Rechtschreibung, Struktur, Lücken, Betreff über claude -p (pseudonymisiert)
    send-check.js       Warnungen vor dem Senden (Du/Sie, Firmen, BCC, Anhang), rein lokal
    speech.js           lokale Spracherkennung: startet tools/stt-worker.py, Aufträge nacheinander, Leerlauf-Ende, Halluzinationsfilter
    reply-sent.js       was nach dem Senden einer Antwort zu tun ist
    address-book.js     Adressbuch für die Empfängerfelder (Vorschläge, Import, eigene Datei address-book.json)
    address-job.js      Hintergrundjob: Absender und Empfänger der Mails ins Adressbuch
    thread.js           Verlauf einer Konversation (n8n getThread), je Nachricht ohne Zitat und mit getrennter Signatur
    signature.js        Signaturerkennung (Trennzeile, gemeinsames Ende, Grußformel + Kontaktblock)
    signature-setting.js  wirksame Signatur: von Hand eingestellt (Optionen → Signatur) vor der erkannten; Signaturbild (prüfen, speichern, für den Versand)
  Gedächtnis und Lernen
    contacts.js         Absender-Gedächtnis je Person und Firma (Du/Sie, Anrede, Gruß, Sprache, Notizen)
    style-extract.js    Stilmerkmale aus einem Text erkennen (ohne KI), Anrede/Gruß in Entwürfe einsetzen
    contact-profile.js  Zahlen und Gedächtnis für das Absender-Profil
    history-learner.js  Lernen aus vielen gesendeten Mails (n8n listSent, Claude mit anonymisierten Auszügen)
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
    signature-image.js  Signaturbild aus einer Datei vorbereiten (verkleinern)
    hash.js, shortcuts.js, status-bar.js, api.js, util.js, icons.js, snooze-options.js
    marking.js, shortcuts.js    markierte Mails (Sammelaktionen) und Tastatur
    components/         list, detail, mail-body, mail-text, attachments-box, task-row, draft-panel, search-panel, menu, snooze-menu,
                        mark-bar, profile, memory-panel, learn-panel, contacts-view (Adressbuch), thread (Verlauf),
                        send-box (Empfänger, Ablegen, Senden), recipient-field (Chips und Vorschläge), compose-view (neue Mail), outbox-view (Entwürfe, Geplantes),
                        improve-bar (Werkzeugleiste mit Versionsliste), rules-view (Regeldatei bearbeiten), signature-view (Signatur bearbeiten), tool-menu (Aufklappliste), send-warn (Warnungen vor dem Senden),
                        dictation (Spracheingabe), schedule-menu (Senden planen);
                        recorder.js, recorder-logic.js (Mikrofonaufnahme, Schnitt an Sprechpausen),                         countdown.js (30 Sekunden vor dem Senden), dictation-text.js (Sprachbefehle)
tools/stt-worker.py      Python-Worker der Spracherkennung (faster-whisper), Zeilenprotokoll über stdin/stdout
install-speech.sh       richtet die Spracherkennung ein (Python-Umgebung + Modell)
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
| `POST /actions/:name` | Aktion ausführen (Header `x-mail-app: 1` nötig); neu: `bulk` (Sammelaktion), `contact`, `history-learn`, `outlook-draft`, `outlook-draft-delete`, `outlook-send`, `book`, `compose-draft`, `compose-send`, `compose-discard`, `text-improve`, `text-subject`, `send-check`, `mail-draft-save`, `mail-draft-delete`, `schedule`, `schedule-cancel`, `schedule-now`, `reply-edit` |
| `POST /refresh`, `POST /open-rules`, `GET /status` | neu laden, Regeldatei im Standardprogramm öffnen, Zustand |
| `GET /rules` | Regeldatei als Dokument (Abschnitte, Regeln, Version); ändern: Aktion `rules` (`add`, `edit`, `delete`, `save-text`) |
| `GET /search?q=&content=&names=&text=` | Treffer im Suchindex (`=0` schaltet einen Bereich ab) |
| `GET /proposals/:id/thread?before=&limit=` | Nachrichten des Verlaufs, neueste zuerst, seitenweise (`hasMore`, `nextBefore`) |
| `GET /outbox` | App-Entwürfe, geplante Mails und Zähler |
| `GET /signature-image` | das gespeicherte Signaturbild (Vorschau in den Optionen und beim Schreiben) |
| `GET /speech`, `POST /transcribe` | Stand der lokalen Spracherkennung; Audio (rohe Bytes, Header `x-mail-app: 1`) in Text umsetzen |
| `GET /compose-info` | wirksame, von Hand eingestellte und erkannte Signatur; ändern: Aktion `signature` (`set`, `reset`) |
| `GET /address-book/suggest?q=&exclude=` | Vorschläge für die Empfängerfelder |
| `GET /address-book?q=&source=&limit=` | Liste und Zahlen für die Kontaktverwaltung (ändern: Aktion `book`) |
| `GET /contacts/:adresse` | Absender-Profil: Zahlen, Regeln, Gedächtnis (Änderungen: Aktion `contact`) |
| `GET /history-learn` | Stand des Lernens aus gesendeten Mails (starten: Aktion `history-learn`) |

## Erweitern
**Neue Aktion:** `actions/meine-aktion.js` mit `export default { name: 'meine-aktion', async run(services, payload) { … } }`, in `actions/index.js` aufnehmen,
in der Oberfläche `api.action('meine-aktion', {…})` aufrufen. `services` = `{ n8n, vault, rules, store, drafts, matcher, scheduler, review, contacts, history, addressBook, outbox, textTools, ownAddress, actions }`.

**Neuer Hintergrundjob:** ein Modul mit `run()`, in `server.js` als `[name, run, Sekunden]` in `extraJobs` eintragen (Vorbild: `lib/roles.js`).

**Neues Feld in der Liste:** in `lib/proposal-view.js` ergänzen, in `public/js/components/list.js` darstellen, Test in `test/api.test.js` und `test/ui/list.test.js`.

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
