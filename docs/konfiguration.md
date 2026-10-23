# Konfiguration

Alles steht in `config.json` im App-Ordner (oder in der Datei, auf die die Umgebungsvariable `MAIL_APP_CONFIG` zeigt). Vorlage:
[`config.example.json`](../config.example.json). Änderungen gelten nach einem Neustart der App.

In den Tabellen heißt **Pflicht**: Der Schlüssel muss in `config.json` stehen (die Vorlage enthält ihn). Bei den übrigen steht der Wert,
der gilt, wenn der Schlüssel fehlt.

## Grundeinstellungen

| Schlüssel | Bedeutung | Standard |
|---|---|---|
| `port` | Port der Oberfläche (nur `127.0.0.1`), Vorlage 4711 | Pflicht |
| `dataDir` | Datenordner, siehe [Installation](installation.md#datenordner) | Pflicht |
| `ownAddress` | eigene Adresse: bleibt in anonymisierten Texten sichtbar, bestimmt Direkt/CC/Shared | Pflicht |
| `ownAliases` | weitere eigene Adressen (Liste), zählen für Direkt/CC | `[]` |
| `ownNames` | eigene Namen (Liste): werden nicht maskiert | Pflicht |
| `pseudonymize` | Namen und Kennungen vor jedem Claude-Aufruf maskieren. **Auf `true` lassen:** fehlt der Schlüssel, ist die Maskierung aus. | Pflicht |
| `rulesFile` | Regeldatei, relativ zum App-Ordner oder absolut, Vorlage `Mail-Regeln.md` | Pflicht |

## n8n, Vault, Claude

| Schlüssel | Bedeutung | Standard |
|---|---|---|
| `n8n.url` | Webhook „Mail-App Schnittstelle“ | Pflicht |
| `n8n.token` | Token, den der Workflow im Header `x-app-token` erwartet | Pflicht |
| `n8n.timeoutMs` | Zeitlimit je Aufruf | 60000 |
| `vault.dir` | Ordner mit der Aufgabenliste | Pflicht |
| `vault.tasksFile` | Name der Aufgabenliste, Vorlage `📋 3 Aufgaben.md` | Pflicht |
| `claude.path` | Pfad zur Claude-CLI | Pflicht |
| `claude.model` | Modell für Entwürfe, Zuordnung, Lernen, Vorlage `sonnet` | Pflicht |
| `claude.timeoutMs` | Zeitlimit je Claude-Aufruf | 180000 |

## Diktieren (`speech`, optional)

Lokale Spracherkennung (siehe `install-speech.sh`). Alle Felder optional.

| Schlüssel | Bedeutung | Standard |
|---|---|---|
| `speech.enabled` | `false` schaltet die lokale Erkennung ab | an |
| `speech.model` | Whisper-Modell (`small`, `medium`, `large-v3` …) | `small` |
| `speech.language` | Sprache der Erkennung | `de` |
| `speech.python` | Python des venv | `<Datenordner>/speech-venv/bin/python` |

## Anhänge, Bilder, Suche (`attachments`)

| Schlüssel | Bedeutung | Standard |
|---|---|---|
| `readByAi` | Text aus Anhängen und Bildern darf (anonymisiert) in Entwürfe | `true` |
| `ocrInline` | Text aus Bildern in der Mail per OCR lesen | `true` |
| `ocrPdf` | gescannte PDFs ohne Text per OCR lesen (`pdftoppm` + `tesseract`); auch für den Suchindex | `true` |
| `ocrPdfMaxPages` | wie viele Seiten eines gescannten PDFs gelesen werden | 10 |
| `searchDocs` | Hintergrundjob für den Suchindex (Anhänge, Empfänger, Mailtext) | `true` |
| `review.enabled` | Modul „Bewertung mit Anhängen“ ([Datenschutz](datenschutz.md#modul-bewertung-mit-anhängen)) | `false` |
| `review.maxPerRun` | Mails pro Durchlauf | 3 |
| `review.charsEach` / `review.charsTotal` | Textmenge je Anhang / insgesamt | 6000 / 20000 |
| `review.logPrompts` / `review.logKeep` | Prompts protokollieren / wie viele Protokolle behalten | `true` / 40 |

## Hintergrundjobs (`poll`, Sekunden)

| Schlüssel | Job | Standard |
|---|---|---|
| `proposalsSec` | Offene Mails aus n8n holen (Vorlage 120) | Pflicht |
| `archiveSec` | Done-Liste aus n8n holen | 300 |
| `repliesSec` | prüfen, ob du schon geantwortet hast (setzt die Mail auf „beantwortet“), Vorlage 600 | Pflicht |
| `draftsSec` | fehlende Antwortentwürfe erzeugen, Vorlage 60 | Pflicht |
| `learnSec` | aus gesendeten Antworten lernen, Vorlage 300 | Pflicht |
| `reviewSec` | Anhangs-Bewertung (nur mit `review.enabled`) | 90 |
| `rolesSec` | Direkt/CC/Shared bestimmen (6 Mails je Lauf) | 30 |
| `attInfoSec` | Anhangsnamen für den Anhang-Tag holen (6 Mails je Lauf) | 30 |
| `docIndexSec` | Suchindex nachführen (2 Mails je Lauf) | 45 |
| `addressBookSec` | Absender und Empfänger der Mails ins Adressbuch übernehmen | 120 |
| `outboxSec` | geplante Mails senden, die fällig sind | 30 |

Die Oberfläche selbst lädt die Liste alle 30 Sekunden neu (siehe `public/js/main.js`).

## Regeldatei `Mail-Regeln.md`
Liegt im App-Ordner, nicht im Vault und nicht im Repo. Der Knopf „Regeln“ oben rechts öffnet sie mit dem Standardprogramm für `.md`.
Du pflegst sie selbst, die App hängt nur Zeilen an. Abschnitte:
- **Grundton und Formulierungen**: Stil der Antwortentwürfe.
- **Regeln pro Kontakt oder Firma**: besondere Anreden oder Vorgaben.
- **Dringlichkeit und Ignorieren**: Absender (oder Domains), die immer „Jetzt“ oder „Heute“ sind oder ausgeblendet werden. „Done“ mit
  „Absender künftig ignorieren“ trägt hier einen Eintrag ein.
- **Automatisch gelernt**: allgemeine Stilregeln, die die App aus jeder deiner gesendeten Antworten ableitet.
- **Aus gesendeten Mails abgeleitet (bitte prüfen)**: Regeln aus dem [Lernen aus vielen gesendeten Mails](bedienung.md#aus-gesendeten-mails-lernen).

Was die App über einzelne Personen und Firmen lernt (Du/Sie, Anrede, Gruß, Sprache, Notizen), steht nicht in dieser Datei, sondern im Absender-Gedächtnis
(`state.json` im Datenordner) und wird im [Absender-Profil](bedienung.md#absender-profil-und-gedächtnis) bearbeitet.

Auf den Vault greift die App nur für die Aufgabenliste zu (Aufgabe übernehmen), mit Sicherung und Prüfung vor jeder Änderung.
