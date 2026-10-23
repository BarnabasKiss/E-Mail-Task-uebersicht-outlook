# Datenschutz und Anonymisierung

Grundsatz: **Claude sieht nie eine Datei oder ein Bild, nur Text, und der ist vorher anonymisiert.** Die App schreibt nie in Outlook.

## Wo was liegt
- **n8n** (Server): Zeile je Mail (Absender, Betreff, 400 Zeichen Vorschau, Bewertung, Status). Die Bewertung läuft über ein Modell
  (OpenRouter, EU) mit pseudonymisiertem Text; die Zuordnung der Platzhalter bleibt in n8n.
- **Lokal** (`<Datenordner>`): Entwürfe, Zuordnungen, Rollen und der Suchindex (`doc-index.json` mit Anhangstext, Empfängern und vollem Mailtext).
  Nur auf diesem Rechner, nicht synchronisiert. Nicht in eine Cloud legen.
- `config.json` enthält den n8n-Token und steht nicht im Repo. Der Token lässt sich in n8n jederzeit neu vergeben.
- Die Oberfläche ist nur über `localhost` erreichbar (andere Host-Namen werden abgelehnt), schreibende Aufrufe brauchen den Header `x-mail-app`.
  Anhänge werden nie als HTML oder Skript ausgeliefert: PDF und gängige Bilder inline, alles andere als Textvorschau oder Download mit
  `Content-Security-Policy: sandbox`.

## Pseudonymisierung (Mailtext)
Bevor ein Modell einen Mailtext sieht, ersetzt die App personenbezogene Daten durch Platzhalter wie `[PERSON_1]`, `[TEL_1]`, `[AKTE_2]`
(`lib/pseudonymize.js`; dieselbe Logik läuft im n8n-Workflow „Mail-Eingang“, siehe [n8n/README.md](../n8n/README.md). Bei Änderungen beide angleichen).
Ersetzt werden: Namen (Absender, An, Cc, Anrede, Grußformel, „Herr/Frau …“), E-Mail-Adressen (nur der Teil vor dem @), Links, IBAN, Fahrgestellnummern,
Kennzeichen, Geburtsdaten, Schaden-, Akten-, Rechnungs- und Belegnummern (auch nach „Akte“, „Schaden“, „Fall“, „Vorgang“), Adressen, Telefonnummern,
Sozialversicherungsnummern und lange Zahlen. Gleicher Wert gleicher Platzhalter. Eigene Namen (`ownNames`) bleiben stehen, Datumsangaben auch (sie bestimmen die Dringlichkeit).
Die Antwort von Claude wird danach zurückübersetzt.

## Strenge Anonymisierung (Anhänge und Bilder)
Texte aus Anhängen und aus Bildern (OCR) laufen durch eine strengere Stufe (`lib/mask-strict.js`): zusätzlich Namen über eine Vornamenliste
(auch „Nachname, Vorname“ und GROSS geschrieben), Namen nach Beschriftungen („Versicherungsnehmer: …“, „Gutachter: …“), Rufnamen in der Grußzeile,
Straße mit Hausnummer, PLZ/Ort, Domains (die eigene bleibt), UID, Firmenbuch-, Konto-, Steuer- und Kartennummern. Eine irgendwo erkannte Kennung
wird in allen Texten ersetzt.

**Danach prüft die App den maskierten Text.** Steht noch ein erkannter Name oder eine Kennung darin, oder eine E-Mail-Adresse, ein Link, eine IBAN,
eine Telefon- oder lange Zahl, wird **nichts an Claude gesendet**: Der Entwurf entsteht ohne Anhänge, die Bewertung vermerkt den Grund.

- Pro Anhang höchstens 12.000 Zeichen, insgesamt 30.000 (Entwürfe). Abschalten: `"attachments": { "readByAi": false }`.
- **Bilder:** Claude bekommt nur den OCR-Text von Bildern ab 4 KB, wenn mindestens 20 Zeichen erkannt werden (Logos fallen weg), höchstens 5 je Mail.
  Abschalten: `"attachments": { "ocrInline": false }`. Bilder von fremden Servern lädt die App nie (Tracking).

## Was geht an Claude? ansehen
- **Auge** in der Ansicht „Nachricht“: *Original* (Mail mit Bildern) oder *Anonymisiert*. Anonymisiert zeigt den maskierten Mailtext mit markierten
  Platzhaltern (Tooltip: Originalwert), die Zuordnung als zugeklapptes Dropdown, die Bilder an ihrer Stelle mit einem Tooltip auf den **maskierten Bildtext**,
  den Text aus Anhängen und das **Ergebnis der Prüfung** („Prüfung bestanden“ oder „Würde NICHT an Claude gesendet“ mit Grund). Nichts wird dabei gesendet.
- Bei aktivem Modul „Bewertung mit Anhängen“ zeigt **Was geht an Claude?** (unter den Anhängen) den genauen Prompt.

## Absender-Gedächtnis und Lernen aus Gesendetem
- Das Absender-Gedächtnis (Du/Sie, Anrede-Muster, Gruß, Sprache, Notizen) liegt nur lokal in `state.json`. Die Anrede wird als Muster gespeichert
  (`Hallo {Vorname},`), nie mit dem Klarnamen. Ansprache, Anrede, Gruß und Sprache erkennt die App **lokal ohne KI** (`lib/style-extract.js`).
- In einen Entwurf gehen nur Ansprache, Sprache und die Notizen, und die Notizen werden mit der Mail pseudonymisiert. Keine Klarnamen in Notizen schreiben.
- **Lernen aus vielen gesendeten Mails** (Knopf „Lernen“): n8n liefert deine gesendeten Mails nur lesend (`listSent`). Rundmails (mehr als 4 Empfänger)
  und sehr kurze Mails zählen nicht. An Claude gehen nur kurze **anonymisierte Auszüge** (strenge Maskierung mit Prüfung wie bei Anhängen, 700 Zeichen je Mail,
  höchstens 30 Mails für allgemeine Regeln und 5 je Person für höchstens 12 Personen). Besteht eine Mail die Prüfung nicht, bleibt sie draußen.
  Alles Abgeleitete ist als „prüfen“ markiert beziehungsweise steht in einem eigenen Abschnitt der Regeldatei.

## Modul „Bewertung mit Anhängen“
Die Bewertung in n8n kennt nur den Mailtext. Dieses abschaltbare Modul (`lib/attachment-review.js`) bewertet Mails mit lesbaren Anhängen zusätzlich lokal
über `claude -p` neu und überlagert die n8n-Bewertung. In n8n wird nichts geändert.

- **Einschalten:** `"attachments": { "review": { "enabled": true } }`, Neustart. Werte siehe [Konfiguration](konfiguration.md#anhänge-bilder-suche-attachments).
- Pro Mail einmal; das Ergebnis liegt nur lokal (`attReviews` in `state.json`). In der Mail steht „Mit Anhängen neu bewertet … Vorher: …“ mit **Zurücksetzen**.
  Mails ohne lesbare Anhänge bleiben unberührt (kein Claude-Aufruf).
- Jeder gesendete Prompt samt Antwort steht in `<Datenordner>/review-log/` (die letzten 40, nur anonymisierter Text).
- **Entfernen:** `enabled` auf `false` (dann läuft nichts). Ganz entfernen: `lib/attachment-review.js`, `actions/review-revert.js` und den Block „Modul Bewertung mit
  Anhängen“ in `server.js` löschen, den Import in `actions/index.js` entfernen, in `lib/api.js` die Teile mit `review`, in `public/js/components/detail.js` den Abschnitt
  `anhang_bewertung` und in `public/js/components/attachments-box.js` den Link „Was geht an Claude?“.

## Grenzen (bitte kennen)
- Namen, die weder in der Vornamenliste stehen noch nach einer Beschriftung, Anrede oder Signatur kommen, werden nicht erkannt.
- **Firmennamen, Ortsnamen ohne PLZ und Domains in E-Mail-Adressen bleiben stehen.** Die Prüfung findet nur, was die Maskierung selbst erkannt hat.
  Wer es ganz sicher will, lässt die Funktionen aus oder prüft mit dem Auge, was gesendet würde.
- Der Suchindex und die Entwürfe enthalten echte Inhalte (siehe oben).
