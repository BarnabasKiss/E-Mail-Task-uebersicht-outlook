# Bedienung

## Die Liste (links)
Reiter **Offen**, **Später** und **Done** (Zähler an jedem Reiter; bei Offen ohne die Gruppe Egal). Die Liste unter „Offen“ ist nach Dringlichkeit gruppiert,
jede Überschrift hat Farbe und Symbol:

| Gruppe | Inhalt |
|---|---|
| **Jetzt** | von der Bewertung oder per Regel als „heute noch reagieren“ eingestuft, bleibt hier, auch wenn die Mail alt ist |
| **Überfällig** | „Heute“-Mails von einem früheren Tag, „Diese Woche“-Mails älter als 7 Tage und alle mit einer Frist vor heute. Die am längsten überfällige Mail steht oben. |
| **Heute** | heute zu erledigen |
| **Diese Woche** | diese Woche genügt |
| **Egal** | Newsletter, reine Info. Die Gruppe steht ganz unten und ist **zuklappbar** (Klick auf die Überschrift); sie ist zunächst zugeklappt, und der Browser merkt sich deine Wahl. Zugeklappte Mails zählen weder am Reiter noch im Tab-Symbol und werden bei `j`/`k` und „Alle“ übersprungen. |

„Später“ (ausgeblendet bis zu einem Zeitpunkt) und Done sind eigene Reiter. Done ist nie überfällig.

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
- **Antwortentwurf:** wird im Hintergrund erzeugt, ist editierbar und kopierbar und lässt sich neu erzeugen. Darunter die Werkzeuge:
  - **Kürzer, Förmlicher, Freundlicher** überarbeiten den Text im Feld (auch deine Änderungen daran). **Ablehnung** schreibt neu: höflich ablehnen, ohne einen Grund
    zu erfinden (fehlt er, steht dort `[BITTE ERGÄNZEN: Grund]`).
  - **Hinweis**: Freitext für diese Antwort („sag, dass ich nächste Woche Zeit habe“), wirkt bei jeder Variante und bei „Neu erzeugen“ (Enter im Feld erzeugt sofort neu).
  - **Vorige Version** geht einen Schritt zurück; nochmal klicken stellt den Entwurf wieder her.
  - Anrede und Gruß setzt die App aus dem [Absender-Gedächtnis](#absender-profil-und-gedächtnis) ein, wenn sie für den Absender bekannt sind.

## Tastatur
`/` Suche · `j`/`k` oder Pfeile nächste/vorherige Mail · `e` in Done ablegen (in Done: zurückholen) · `Entf` löschen · `Esc` hebt eine Markierung auf.
Link zu einer Mail: `http://localhost:4711/#mail=ID`.

### Sammelaktionen
Mehrere Mails markierst du mit **gedrückter Strg-Taste (am Mac Cmd) und Klick** auf die Zeile (für „Absender ignorieren“ gibt es weiter das Menü neben „Done“ in der Detailansicht); ein zweiter Strg-Klick hebt die Markierung wieder auf. **Umschalt + Klick**
markiert alle Mails von der gewählten bis zur angeklickten. Markierte Zeilen sind farbig umrandet, Kästchen gibt es nicht. Über der Liste erscheint eine Leiste mit der Anzahl und einfachen Buttons:

| Button | Wirkung |
|---|---|
| **Done** (bei Mails in Done: **Zurückholen**) | alle markierten ablegen beziehungsweise zurückholen; danach „Rückgängig“ |
| **Später** | zeigt die Zeitpunkte als Buttons; ein Klick stellt alle markierten bis dahin zurück, das × daneben bricht ab |
| Papierkorb-Symbol | alle markierten endgültig löschen, mit einer Rückfrage mit Anzahl |
| **Alle** | alle Mails der Liste (mit Reiter, Suche und Filter) markieren |
| × | Markierung aufheben |

Jede Mail wird einzeln verarbeitet: Klappt eine nicht, steht das in der Meldung, und die anderen sind trotzdem erledigt. Ein Reiterwechsel, eine Suche oder ein Filter hebt die Markierung auf.

## Absender-Profil und Gedächtnis
Ein Klick auf das Profilbild des Absenders in der Detailansicht (es hebt sich beim Darüberfahren hervor) öffnet das Profil; die Adresszeile merkt es (`#kontakt=…`).
Das Profil hat drei Tabs:
- **Letzte Mails** (Standard): die 15 neuesten Mails des Absenders mit Betreff, Zusammenfassung und denselben Tags wie in der Liste (Dringlichkeit oder Done, Kategorie, Wichtig, Anhänge, Aufgabe, Frist, Eingang). Ein Klick öffnet die Mail.
- **Überblick:** Zahl der Mails (davon offen), erster und letzter Kontakt, Eingang (Direkt/CC/Shared), Aufgaben, wie viele Antworten du schon geschrieben hast.
- **Optionen:** alles, was du einstellst. Der Tab bleibt nach einer Änderung offen.
  - **Dringlichkeit:** „Immer Jetzt“, „Immer Heute“ oder „Ignorieren“ für die Adresse oder die ganze Firma. Wirkt sofort, steht in `Mail-Regeln.md`, nochmal klicken hebt auf.
  - **Gedächtnis** (je für die Person und für die Firma, außer bei privaten Anbietern wie gmail.com): Ansprache (Du/Sie), Sprache, Anrede (nur Person), Gruß und Notizen.
  Die App zählt Ansprache, Anrede, Gruß und Sprache aus deinen gesendeten Antworten mit. „Automatisch“ zeigt, was gelernt wurde; was du selbst einstellst („festgelegt“)
  gilt immer. Es gilt zuerst die Person, danach die Firma. Notizen kannst du bearbeiten, löschen und hinzufügen. Neu Gelerntes ist als **prüfen** markiert
  (Haken = passt, „alle bestätigen“ für die ganze Liste).

Das Gedächtnis fließt in jeden Entwurf ein (Ansprache, Sprache, Notizen) und setzt Anrede und Gruß wörtlich ein, so wie du sie dieser Person gegenüber verwendest.
Mehr zum Datenschutz: [Absender-Gedächtnis](datenschutz.md#absender-gedächtnis-und-lernen-aus-gesendetem).

## Aus gesendeten Mails lernen
Der Knopf **Lernen** oben rechts liest deine gesendeten Mails (über n8n, nur lesend; neueste zuerst, Standard 200) und leitet daraus Regeln ab:
Ansprache, Anrede, Gruß und Sprache je Empfänger lokal, dazu allgemeine Stilregeln und Notizen je Person über Claude mit anonymisierten Auszügen.
Das Ergebnis prüfst du danach: allgemeine Regeln stehen in `Mail-Regeln.md` im Abschnitt „Aus gesendeten Mails abgeleitet (bitte prüfen)“, Notizen im Absender-Profil
als „prüfen“. Jede Mail zählt nur einmal, ein zweiter Lauf ist harmlos. Das Lernen läuft im Hintergrund; je nach Zahl der Personen dauert es einige Minuten.

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
