# Bedienung

## Die Liste (links)
Reiter **Offen**, **Egal**, **Später** und **Done** (Zähler an jedem Reiter). Die Liste unter „Offen“ ist nach Dringlichkeit gruppiert,
jede Überschrift hat Farbe und Symbol:

| Gruppe | Inhalt |
|---|---|
| **Jetzt** | von der Bewertung oder per Regel als „heute noch reagieren“ eingestuft, bleibt hier, auch wenn die Mail alt ist |
| **Überfällig** | „Heute“-Mails von einem früheren Tag, „Diese Woche“-Mails älter als 7 Tage und alle mit einer Frist vor heute. Die am längsten überfällige Mail steht oben. |
| **Heute** | heute zu erledigen |
| **Diese Woche** | diese Woche genügt |

„Egal“ (Newsletter, reine Info), „Später“ (ausgeblendet bis zu einem Zeitpunkt) und Done sind eigene Reiter. Done ist nie überfällig.

### Was eine Zeile zeigt
Absender mit **Rolle**, Zeit, Betreff, Zusammenfassung und unten die Tags:

| Tag | Bedeutung |
|---|---|
| **Direkt** (blau) / **CC** / **Shared** (grau) neben dem Absender | wie die Mail bei dir ankam: du stehst in An, nur in Cc, oder weder noch (Shared Inbox, Verteiler, Bcc). Weitere eigene Adressen: `ownAliases`. |
| **Wichtig** (orange) | der Inhalt deutet auf etwas Kritisches hin (siehe unten) |
| Büroklammer mit Formaten | Anhänge, z. B. `PDF · XLSX`, ab drei Formaten `+n`; der Tooltip nennt die Dateinamen |
| Häkchen-Kasten | eine Aufgabe wird vorgeschlagen; mit grünem Haken: schon übernommen |
| **Frist** | genannte Frist |
| **TEST** | Testmail |

Die Dringlichkeit steht nur in der Gruppen-Überschrift (in Suchergebnissen und Done als Farbstreifen am Zeilenrand).
Beim Darüberfahren erscheinen **Done** (Haken) und **Löschen**; in Done **Zurückholen** und **Löschen**.

### Tag „Wichtig“
Lokal und ohne KI-Aufruf (`lib/importance.js`). Gelesen werden Betreff, Vorschau und die Bewertung (Zusammenfassung, Begründung, Aufgabe).
Auslöser: Stichwörter wie dringend, umgehend, sofort, Eskalation, kritisch, Störung, Ausfall, Mahnung, Inkasso, Anwalt, Haftung, Kündigung,
Geschäftsführung, Beschwerde, Behörde, Datenleck, Fristablauf, oder eine Frist, die heute, morgen oder schon vorbei ist.
„Nicht dringend“ und „keine Eskalation“ zählen nicht, Newsletter, „Egal“ und Done nie. Der Tooltip nennt den Grund.

## Die Detailansicht (rechts)
- **Kopf:** Betreff, Marken (Dringlichkeit, Kategorie, Wichtig, Frist) und oben rechts die Aktionen:
  *In Outlook öffnen* (Symbol), *Später* (Menü mit Zeitpunkten), **Done**, *Löschen* (Symbol).
  - **Done** legt die Mail ab (erledigt, keine Aufgabe nötig). Sie bleibt durchsuchbar, direkt danach gibt es „Rückgängig“. Im Menü daneben:
    „Absender künftig ignorieren“ (Eintrag in `Mail-Regeln.md`).
  - **Löschen** entfernt die Konversation vollständig aus der Übersicht (Tabellenzeile in n8n und alles Lokale, auch aus Done), nicht rückgängig,
    mit Rückfrage. In Outlook bleibt die Mail unverändert.
- **Absender und Empfänger** mit Rolle, **Anhänge** als Chips (PDF und Bilder öffnen im Browser, Office und Text als Textvorschau, alles andere
  als Download; ✦ = Claude liest den Text daraus mit).
- **Zusammenfassung / Nachricht** per Umschalter. *Zusammenfassung* ist ein Absatz aus Zusammenfassung und Begründung. *Nachricht* zeigt den Mailtext
  mit seinen Bildern. Das **Auge** darüber schaltet zwischen *Original* und *Anonymisiert* um (siehe [Datenschutz](datenschutz.md#was-geht-an-claude-ansehen)).
- **Aufgabe** in einer Zeile: Text, Überschrift in `📋 3 Aufgaben.md` (Vorschlag per Claude), Frist, „Wichtig“-Stern, **Übernehmen**.
  Die Mail bleibt danach in „Offen“; die Zeile zeigt „✓ Aufgabe übernommen“ mit „Weitere Aufgabe“.
- **Antwortentwurf:** wird im Hintergrund erzeugt, ist editierbar und kopierbar und lässt sich neu erzeugen.

## Tastatur
`/` Suche · `j`/`k` oder Pfeile nächste/vorherige Mail · `e` in Done ablegen (in Done: zurückholen) · `Entf` löschen.
Link zu einer Mail: `http://localhost:4711/#mail=ID`.

## Tab-Symbol und Benachrichtigungen
Der Browser-Tab zeigt, ob etwas offen ist, auch angepinnt (dort zählt nur das Symbol):
- nichts offen: normales Symbol · etwas offen: **blauer Punkt**, Titel `(4) Mail-Übersicht`
- etwas **Wichtiges** offen: **orange-roter Punkt**, Titel `(2 wichtig) Mail-Übersicht`. Kommt neu etwas Wichtiges dazu, pulsiert das Symbol etwa 5 Sekunden.
- *Offen* = alles im Reiter „Offen“. *Wichtig* = davon „Jetzt“, „Überfällig“ oder mit dem Tag „Wichtig“. Testmails zählen mit.
- **Systembenachrichtigung** nur für neue wichtige Mails (Absender, Betreff, Grund; mehr als drei auf einmal werden zusammengefasst, Klick springt zur Mail,
  Testmails melden nichts). Einschalten mit der Glocke oben rechts: einmal klicken und im Browser „Zulassen“; danach schickt ein Klick eine Testmeldung.
  Der erste Start meldet nichts, der Bestand gilt als bekannt.
- **Grenzen:** Der Tab muss geöffnet sein. Hintergrund-Tabs werden gedrosselt, das Nachladen kann bis zu eine Minute dauern. Brave und Chrome schlafen
  inaktive Tabs mit „Speicher sparen“ ein: `localhost:4711` dort von der Funktion ausnehmen.

## Testmails
Mails mit `mail_id` ab `TEST-` sind violett als TEST markiert, haben keinen Outlook-Link und bekommen Entwürfe nur per Klick. Ihr Inhalt kommt aus der
Vorschau der Tabellenzeile. Zum Ausprobieren:
- erste Vorschauzeile `[Rolle: cc]` oder `[Rolle: shared]` stellt ein, wie die Mail angekommen ist;
- `[bild:name.png]` in der Vorschau fügt ein Bild ein: Datei `bild-…` in `<Datenordner>/test-anhaenge/<mail_id>/`;
- andere Dateien in diesem Ordner erscheinen als Anhänge.
