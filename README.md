# Mail-App

Lokaler Mini-Mailclient. Zeigt die in n8n bewerteten Mails, übernimmt Aufgaben nach Obsidian (`📋 3 Aufgaben.md`),
schreibt Antwortentwürfe über das lokale `claude -p` und lernt aus deinen gesendeten Antworten.

## Überblick: so hängt alles zusammen

```
Outlook ─► n8n "Mail-Eingang"  ─► Datentabelle "Mail-Vorschläge" ◄─► n8n "Mail-App Schnittstelle" ◄─► diese App (localhost)
           pseudonymisiert,        (Status: neu, done,                (Webhook, Token)                 │
           Modell bewertet,         angenommen, beantwortet)                                            ├─► Obsidian: 📋 3 Aufgaben.md
           Platzhalter zurück                                                                           └─► claude -p (lokal): Entwürfe, Lernen
```

- **n8n** (Server): holt neue Outlook-Mails, ersetzt personenbezogene Daten durch Platzhalter, lässt ein Modell Dringlichkeit,
  Zusammenfassung und Aufgabenvorschlag bestimmen, setzt die Daten wieder ein und speichert eine Zeile pro Mail.
  Genaue Beschreibung zum Nachbauen: **[n8n/README.md](n8n/README.md)** (Nodes, Einstellungen, Code, Prompts, Datentabelle).
- **Diese App** (lokal): liest die Zeilen über einen Webhook, zeigt sie wie einen Posteingang, übernimmt Aufgaben in die Obsidian-Liste,
  erzeugt Antwortentwürfe und merkt sich Regeln in `Mail-Regeln.md`. Sie schreibt nie in Outlook.

## Auf einem neuen Gerät einrichten
1. Repo klonen, Node.js 20 oder neuer und die Claude-Code-CLI (`claude`) installieren und anmelden.
2. `config.example.json` nach `config.json` kopieren und ausfüllen: n8n-Adresse und Token (Header `x-app-token` aus dem
   n8n-Workflow „Mail-App Schnittstelle“), Pfad zum Obsidian-Vault, Pfad zu `claude` (`claude.exe` unter Windows), eigene Adresse und Namen.
3. Starten wie unten beschrieben. `config.json` und `Mail-Regeln.md` stehen bewusst **nicht** im Repo (Token, Pfade, persönliche Regeln).
   `Mail-Regeln.md` entsteht beim ersten Start neu. Wer dieselben Regeln auf mehreren Geräten will, kopiert die Datei von Hand.
4. Zustand (Entwürfe, Zuordnungen, Zurückgestelltes) liegt pro Gerät in `%LOCALAPPDATA%\mail-app` (Linux/macOS:
   `$XDG_DATA_HOME/mail-app`, meist `~/.local/share/mail-app`) und wird nicht geteilt.
   Die Mails selbst und ihr Status (Offen, Done) liegen in n8n und sind auf allen Geräten gleich.

## Starten

- Einmalig Windows: `powershell -File install-autostart.ps1` (Autostart beim Anmelden, unsichtbar)
- Einmalig Linux: `./install-autostart.sh` (systemd-Benutzerdienst `mail-app`, startet sofort und bei jeder Anmeldung)
- Sofort starten: `wscript.exe start-hidden.vbs` oder im Terminal `node server.js`
- Öffnen: `Mail-App öffnen.url` oder http://localhost:4711
- Log Windows: `%LOCALAPPDATA%\mail-app\server.log` (wird nicht automatisch gekürzt)
- Log Linux: `journalctl --user -u mail-app -f`
- Entfernen: `uninstall-autostart.ps1` bzw. `./uninstall-autostart.sh`

Pfade in `config.json` dürfen `%VAR%` und `~` enthalten. `%LOCALAPPDATA%` wird unter Linux/macOS durch den
XDG-Datenordner ersetzt, `dataDir` kann also auf allen Systemen gleich bleiben. Vault- und Claude-Pfad sind pro Gerät verschieden.

Voraussetzung: Node.js 20 oder neuer. Es gibt keine Pakete zu installieren.

## Bedienung
- Links: Suche (Taste `/`), Reiter Offen, Egal, Später, **Done**. Die Liste ist nach Dringlichkeit gruppiert.
  Die Suche durchsucht alle Mails, auch die in Done.
- Pro Mail in der Liste (beim Darüberfahren): **In Done ablegen** und **Löschen**. In Done: **Zurückholen** und **Löschen**.
- Rechts oben: **In Outlook öffnen**, **Später** (Mail ausblenden bis zu einem Zeitpunkt), **Done**, **Löschen**.
  - **Done** = in Done ablegen (erledigt, keine Aufgabe nötig). Die Mail bleibt durchsuchbar und lässt sich zurückholen.
    Direkt danach „Rückgängig“. Im Menü daneben: „Absender künftig ignorieren“ (Regel in Mail-Regeln.md).
  - **Löschen** = Konversation vollständig aus der Übersicht entfernen (Tabellenzeile in n8n und alles Lokale, auch aus Done).
    Nicht rückgängig zu machen, mit Rückfrage. In Outlook bleibt die Mail unverändert.
  - **Done** enthält erledigte, übernommene (Aufgabe angelegt) und beantwortete Mails.
- Anhänge stehen als Chips unter Absender und Empfängern (Signaturlogos und eingebettete Bilder werden ausgeblendet). PDF und Bilder öffnen
  im Browser, alles andere wird heruntergeladen. Chips mit ✦ liest Claude beim Antwortentwurf mit (siehe Datenschutz).
- Zusammenfassung oder Nachricht per Umschalter. Darunter die Aufgabe in einer Zeile und der Antwortentwurf.
- Tasten: `j`/`k` oder Pfeile = nächste/vorherige Mail, `/` = Suche, `e` = in Done ablegen (in Done: zurückholen),
  `Entf` = löschen. Link zu einer Mail: `http://localhost:4711/#mail=ID`.
- Testmails (mail_id beginnt mit `TEST-`) sind violett als TEST markiert, haben keinen Outlook-Link und bekommen Entwürfe nur per Klick.

## Aufbau

```
server.js            Startpunkt, baut die Module zusammen
config.json          alle Einstellungen (Port, n8n-Adresse und -Token, Vault, Claude, Intervalle)
lib/
  n8n-client.js      spricht nur mit der n8n-Schnittstelle (list, setStatus, getMail, hasReply)
  vault.js           einzige Stelle, die "📋 3 Aufgaben.md" ändert (Backup, Prüfung, Rückspielen)
  rules.js           Regeldatei "Mail-Regeln.md" (im App-Ordner, nicht im Vault): lesen, Regeln anhängen, Dringlichkeitsregeln
  matcher.js         ordnet eine Aufgabe einer Überschrift zu oder schlägt eine neue vor (claude -p)
  pseudonymize.js    ersetzt personenbezogene Daten durch Platzhalter und stellt sie wieder her
  attachments.js     Anhänge: Liste, Download über n8n, Textauszug (PDF, Word, Excel, PowerPoint, Text, Bilder per OCR)
  mask-strict.js     strenge Anonymisierung für Anhangtexte (Vornamenliste, Beschriftungen, Adressen, Domains) samt Prüfung danach
  attachment-review.js  Modul: Mails mit Anhängen lokal neu bewerten (abschaltbar, siehe unten)
  drafts.js          Antwortentwurf erzeugen
  learner.js         Entwurf mit gesendeter Antwort vergleichen, Regeln ableiten
  claude.js          ruft claude -p ohne Werkzeuge auf, nacheinander
  scheduler.js       Hintergrundschleifen: Vorschläge, Antworten, Entwürfe, Lernen
  store.js           lokaler Zustand in %LOCALAPPDATA%\mail-app\state.json
  api.js             HTTP-Schnittstelle (nur localhost)
actions/             eine Datei pro Aktion: accept, archive, delete, restore, snooze, regenerate-draft
public/              Oberfläche (ES-Module ohne Build), Bausteine unter public/js/components
test/                node --test
```

### Neue Aktion hinzufügen
1. Datei `actions/meine-aktion.js` mit `export default { name: 'meine-aktion', async run(services, payload) { ... } }`
2. In `actions/index.js` importieren und in die Liste aufnehmen.
3. In der Oberfläche `api.action('meine-aktion', {...})` aufrufen.

### Entwürfe später direkt in Outlook ablegen
Heute landet der Entwurf in der Oberfläche (Kopieren-Knopf in `public/js/components/draft-panel.js`).
Für Outlook-Entwürfe braucht n8n eine weitere Aktion, die mit `saveAsDraft: true` antwortet (Achtung: ohne diese Option
sendet der Outlook-Node sofort) und Schreibrechte der Outlook-Verbindung.

## Anhangs-Bewertung (Modul, abschaltbar)
Die Bewertung in n8n (Dringlichkeit, Zusammenfassung, Aufgabe) kennt nur den Mailtext. Dieses Modul bewertet Mails, die lesbare
Anhänge haben, zusätzlich lokal über `claude -p` neu und zeigt das Ergebnis statt der n8n-Bewertung.

- **Einschalten:** `"attachments": { "readByAi": true, "review": { "enabled": true } }` in `config.json`, Dienst neu starten.
  Weitere Werte: `maxPerRun` (Mails pro Durchlauf, Standard 3), `charsEach`/`charsTotal` (Textmenge pro Anhang/insgesamt, 6000/20000),
  `logPrompts` (Standard an), `logKeep` (Anzahl Protokolle, 40) und `poll.reviewSec` (Standard 90).
- **Was passiert:** Pro Mail einmal. Das Ergebnis liegt nur im lokalen Zustand (`attReviews`). In n8n wird nichts geändert, die
  Bewertung aus n8n bleibt erhalten. In der Mail steht dann "Mit Anhängen neu bewertet (…). Vorher: …" mit **Zurücksetzen**
  (zurück zur n8n-Bewertung, ohne erneut zu bewerten). Mails ohne lesbare Anhänge bleiben unberührt, es gibt keinen Claude-Aufruf.
- **Kontrolle:** In der Mail unter den Anhängen: **Was geht an Claude?** zeigt den anonymisierten Text, ohne ihn zu senden.
  Jeder tatsächlich gesendete Prompt samt Antwort steht in `<Datenordner>/review-log/` (die letzten 40, nur anonymisierter Text).
- **Anonymisierung** (`lib/mask-strict.js`): wie die normale Pseudonymisierung, zusätzlich Namen über eine Vornamenliste (auch
  "Nachname, Vorname" und GROSS geschrieben), Namen nach Beschriftungen ("Versicherungsnehmer: …", "Gutachter: …"), Rufnamen in
  der Grußzeile, Straße mit Hausnummer auch in der Form "Name Straße 9a" und "Ort 93, PLZ", PLZ/Ort, Domains (die eigene bleibt),
  UID, Firmenbuch-, Konto-, Steuer- und Kartennummern. Eine Kennung, die irgendwo erkannt wird, wird in allen Texten ersetzt.
  **Danach prüft die App den maskierten Text**: steht noch ein erkannter Name oder eine Kennung darin, oder eine E-Mail-Adresse,
  ein Link, eine IBAN, Telefon- oder lange Zahl, wird **nichts gesendet** und der Grund steht im Zustand der Mail.
- **Grenzen** (bitte kennen): Namen, die weder in der Vornamenliste stehen noch nach einer Beschriftung oder Anrede kommen,
  werden nicht erkannt. Firmennamen, Ortsnamen ohne PLZ und Domains in E-Mail-Adressen bleiben stehen. Die Prüfung findet nur, was
  die Maskierung selbst erkannt hat. Wer es ganz sicher will, lässt die Funktion aus oder schaut sich die Vorschau an.
- **Entfernen:** Am einfachsten `enabled` auf `false` (dann läuft nichts, die App verhält sich wie vorher). Ganz entfernen:
  `lib/attachment-review.js`, `actions/review-revert.js` und den Block "Modul Bewertung mit Anhängen" in `server.js` löschen,
  in `actions/index.js` den Import entfernen, in `lib/api.js` die Teile mit `review` und in `public/js/components/detail.js` den
  Abschnitt `anhang_bewertung` sowie den Link "Was geht an Claude?". Der Einhängepunkt `decorate`/`extraJobs` im Scheduler darf
  stehen bleiben. Gespeicherte Ergebnisse (`attReviews` in `state.json`) schaden nicht.

## Bilder in Mails
- **Anzeige:** In der Ansicht "Nachricht" stehen Bilder, die in der Mail eingebettet sind (Screenshots, `cid:`), an ihrer Stelle im
  Text. Klick öffnet das Bild groß. Bilder von fremden Servern (`http…`) werden nicht geladen (Tracking), Pixel und Mini-Bilder
  unter 400 Byte fallen weg. Die Bilder kommen über denselben Weg wie Anhänge, es wird nichts von außen nachgeladen.
- **Zuordnung:** Der Outlook-Node in n8n liefert keine `contentId`. Die App ordnet deshalb `cid:`-Bilder nach Dateiname und sonst
  der Reihe nach zu. Das reicht bei den üblichen Mails (Screenshots), kann bei vielen Bildern in untypischer Reihenfolge verrutschen.
- **Claude** sieht nie ein Bild, nur den OCR-Text (`tesseract`) von Bildern ab 4 KB, wenn mindestens 20 Zeichen erkannt werden
  (Logos fallen so weg), höchstens 5 Bilder pro Mail. Der Text läuft zusammen mit den Anhängen durch die strenge Maskierung samt
  Prüfung, bei unsicherem Ergebnis wird nichts gesendet. Er erscheint auch unter **Was geht an Claude?** als "Bild im Text n".
  Abschalten: `"attachments": { "ocrInline": false }`.
- **tesseract ohne Installation (ohne root):** Die RPMs `tesseract`, `tesseract-libs`, `tesseract-common`, `tesseract-langpack-deu`, `-eng`
  mit `dnf download` laden und mit `rpm2cpio <datei> | cpio -idm` nach `<Datenordner>/tesseract/` entpacken (ca. 9 MB). Die App nutzt
  das beim Start automatisch (Meldung "tesseract aus dem Datenordner"), sonst das tesseract aus dem PATH.

## Direkt, CC, Shared
Neben dem Absender zeigt die Liste, wie die Mail zu dir kam: **Direkt** (blau, du stehst in An), **CC** und **Shared** (grau, du bist
weder in An noch in Cc: Shared Inbox, Verteiler oder Bcc). Outlook liefert das nicht als Feld, `lib/roles.js` liest es im Hintergrund aus
An/Cc der Mail (6 Mails alle 30 s, neueste zuerst) und merkt es sich lokal (`roles` in `state.json`). Weitere eigene Adressen:
`"ownAliases": ["name@alias.at"]` in `config.json`. Testmails: erste Vorschauzeile `[Rolle: cc]` oder `[Rolle: shared]`.

## Liste: Überfällig und Anhang-Tag
- **Überfällig** steht zwischen "Jetzt" und "Heute": "Heute"-Mails von einem früheren Tag, "Diese Woche"-Mails älter als 7 Tage und
  alle mit einer Frist vor heute (am längsten überfällig zuerst). "Jetzt" bleibt immer in "Jetzt", "Egal" und Done sind nie überfällig
  (`isOverdue` in `public/js/components/list.js`).
- **Anhang-Tag:** Büroklammer mit den Dateiformaten (`PDF · XLSX`, ab drei Formaten `+n`), Tooltip mit den Dateinamen. Die App fragt die
  Anhänge im Hintergrund ab (`lib/attachment-info.js`, 6 Mails alle 30 s) und merkt sie lokal (`attInfo`). "Aufgabe" ist nur ein Symbol.

## Tag "Wichtig"
Orange, unten in der Zeile und in der Detailansicht, wenn der Inhalt auf etwas Kritisches hindeutet: Stichwörter wie Eskalation, Störung,
Ausfall, Mahnung, Anwalt, Kündigung, Geschäftsführung, Beschwerde, Behörde, Datenleck, "dringend/umgehend/sofort" oder eine Frist, die
heute, morgen oder schon vorbei ist. Gelesen werden Betreff, Vorschau und die Bewertung (Zusammenfassung, Begründung, Aufgabe);
"nicht dringend", "keine Eskalation" zählen nicht, Newsletter, "Egal" und Done nie. Der Tooltip nennt den Grund. Lokal, ohne KI-Aufruf
(`lib/importance.js`, Stichwörter dort anpassbar).

## Dokumentensuche und Mailindex
Die Suche findet auch Empfänger und den vollen Text jeder Mail (An, CC, Mailtext) sowie Text in Anhängen (PDF, Word, Excel, PowerPoint, Text) und in Bildern (OCR, auch Screenshots in der Mail). Ein
Hintergrundjob liest Anhänge, Empfänger und Mailtext aller Mails (auch Done), 2 Mails alle 45 s, neueste zuerst, und merkt sie in
`<Datenordner>/doc-index.json` (`lib/doc-index.js`). Nur lokal: nichts davon geht an Claude oder ins Netz. Die Datei enthält echte
Inhalte, deshalb im Datenordner lassen und nicht in die Cloud legen. Beim ersten Start dauert das Nachlesen je nach Mailmenge einige
Minuten bis eine Stunde, die Trefferliste zeigt dazu "Dokumente und Mailtext: x von y Mails gelesen". Mails, die Outlook nicht liefert (z. B. dort gelöscht),
werden nach 3 Versuchen übersprungen.
- Treffer erscheinen mit Dateiname und Ausschnitt (Suchbegriffe markiert) unter der Zusammenfassung. Mehrere Wörter müssen im selben
  Dokument stehen, der Dateiname zählt mit.
- Abschalten: `"attachments": { "searchDocs": false }` in `config.json`. Index löschen = Datei entfernen, er baut sich neu auf.
- Grenzen: pro Dokument die ersten 60.000 Zeichen, Anhänge über 25 MB und unbekannte Dateitypen fehlen, gescannte PDFs ohne Text
  werden nicht per OCR gelesen (nur Bilder). Der Mailtext ist auf 100.000 Zeichen begrenzt, Bcc-Empfänger kennt Outlook nicht.

## Erweiterte Suche
Der Filter-Knopf rechts neben dem Suchfeld klappt ein Panel auf (Zähler am Knopf, aktive Filter als Chips mit ×, "Zurücksetzen").
Alle Wörter müssen vorkommen. Ohne Suchtext genügen Filter.
- **Suchen in:** Absender & Betreff, Mailtext, Bewertung (Zusammenfassung, Aufgabe, Kategorie, Begründung), Dokumentinhalt,
  Dokumentnamen (standardmäßig alles an). Mailtext und Dokumente laufen über den lokalen Index (siehe oben).
- **Von:** Teil von Name oder Adresse (Vorschläge aus bekannten Absendern). **An / CC:** Teil von Name oder Adresse eines Empfängers,
  wählbar "An + CC", "Nur An" oder "Nur CC". **Zeitraum:** von/bis oder Heute, 7 Tage, 30 Tage.
- **Mit:** Anhang (mit Format-Auswahl aus den vorhandenen Anhängen), Aufgabe (vorgeschlagen oder übernommen), Wichtig.
  **Eingang:** Direkt, CC, Shared.
- Die Suche läuft über alle Mails inklusive Done. Der Zustand steht in der Adresszeile (`f_von`, `f_ab`, `f_bis`, `f_fmt`, `f_anh`,
  `f_auf`, `f_wi`, `f_ein`, `f_in`), Neuladen und Lesezeichen behalten die Suche.
- Der Filter An/CC und die Suche im Mailtext gelten erst für Mails, die der Hintergrundjob schon gelesen hat (die Trefferliste zeigt
  "Dokumente und Mailtext: x von y Mails gelesen"). Die Logik steht in `public/js/search.js`, das Panel in `public/js/components/search-panel.js`.

## Tab-Symbol und Benachrichtigungen
Der Browser-Tab zeigt, ob etwas offen ist, auch angepinnt (dort zählt nur das Symbol, ein Titel wird nicht angezeigt):
- nichts offen: normales Symbol; etwas offen: **blauer Punkt** mit der Zahl, Titel `(4) Mail-Übersicht`;
- **etwas Wichtiges offen: orange-roter Punkt** mit der Zahl der wichtigen Mails, Titel `(2 wichtig) Mail-Übersicht`. Kommt neu etwas
  Wichtiges dazu, pulsiert das Symbol etwa 5 Sekunden.
- *Offen* = alles im Tab "Offen" (ohne Egal, Später, Done). *Wichtig* = davon "Jetzt", "Überfällig" oder mit dem Tag "Wichtig"
  (Logik in `public/js/attention.js`, Symbol in `public/js/tab-signal.js`). Testmails zählen mit.
- **Systembenachrichtigung** nur für neue wichtige Mails (Absender, Betreff, Grund; mehr als 3 auf einmal werden zusammengefasst, Klick
  springt zur Mail, Testmails melden nichts). Einschalten mit der Glocke oben rechts: einmal klicken, im Browser "Zulassen"; danach
  schickt ein Klick eine Testmeldung. Der erste Start meldet nichts (der Bestand gilt als bekannt).
- Grenzen: der Tab muss geöffnet sein. Hintergrund-Tabs werden vom Browser gedrosselt, die App lädt alle 30 s nach, das kann im
  Hintergrund bis zu eine Minute dauern. In Brave unter *Einstellungen → System/Leistung* ("Speicher sparen") `localhost:4711` von der
  Ruhezustand-Funktion ausnehmen, sonst wird der Tab irgendwann eingeschlafen und zeigt nichts mehr.

## Regeldatei
`Mail-Regeln.md` liegt im App-Ordner (Einstellung `rulesFile` in `config.json`, relativ zum App-Ordner oder absolut).
Der Knopf "Regeln" in der App öffnet sie mit deinem Standardprogramm. Auf den Vault greift die App nur für
`📋 3 Aufgaben.md` zu (Aufgabe übernehmen).

## Datenschutz
- Mails werden in n8n und in der App pseudonymisiert, bevor sie an ein Modell gehen. Die Logik steht in
  `lib/pseudonymize.js` und im n8n-Workflow "Mail-Eingang". Bei Änderungen beide angleichen.
- Anhänge: Claude bekommt nie die Datei, nur den extrahierten Text, und der wird zusammen mit der Mail pseudonymisiert
  (gleiche Platzhalter, auch die Dateinamen). Pro Anhang höchstens 12.000 Zeichen, insgesamt 30.000. Abschalten mit
  `"attachments": { "readByAi": false }` in `config.json`. Anhangstexte laufen durch die strenge Maskierung mit Prüfung
  (`lib/mask-strict.js`, Einzelheiten und Grenzen im Abschnitt "Anhangs-Bewertung"). Fällt die Prüfung durch, wird der
  Entwurf ohne Anhänge geschrieben.
- Textauszug: Word, Excel, PowerPoint und Text ohne Zusatzprogramme. PDF braucht `pdftotext` (Paket `poppler-utils`),
  Bilder und gescannte Dokumente brauchen `tesseract` (mit `tesseract-langpack-deu`). Fehlt etwas, schreibt der Entwurf
  nur "Anhang konnte nicht gelesen werden" in den Prompt und Claude tut nicht so, als kenne er den Inhalt.
- Grenzen: Namen ohne Herr/Frau, Anrede, Signatur oder Absenderfeld und Firmennamen werden nicht maskiert.
- `config.json` enthält den n8n-Token. Der Ordner liegt in OneDrive: Token bei Bedarf in n8n neu vergeben.
- Entwürfe und Zustand liegen bewusst außerhalb von OneDrive in `%LOCALAPPDATA%\mail-app`.

## Tests
`node --test` (Pseudonymisierung, Vault-Schreiben, Regeldatei, Entwurfs-Nachbearbeitung)
