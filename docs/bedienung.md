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
- **Aufbau von oben nach unten (eine Spalte):** Absender und Empfänger, Anhänge, **Aufgabe** (immer eine Zeile), **Zusammenfassung** (immer sichtbar), der **Verlauf** als eigene Sektion,
  die du auf- und zuklappen kannst (zunächst zu), und darunter die **Antwort** (Entwurf, Empfänger, Ablegen, Senden).
- **Zusammenfassung** ist ein Absatz aus Zusammenfassung und Begründung.
- **Verlauf:** die Konversation als Nachrichten (siehe unten). Aufgeklappt hat er einen festen, scrollbaren Rahmen mit der neuesten Nachricht unten. Der Knopf **⤢ rechts oben** macht den Rahmen
  so groß, dass du alles ohne Scrollen siehst; ein zweiter Klick macht ihn wieder so klein wie vorher. Das **Auge** in der Kopfzeile der Sektion (nur bei aufgeklapptem Verlauf) schaltet zwischen *Original* und
  *Anonymisiert* um: anonymisiert ersetzt es den Verlauf durch die geöffnete Mail so, wie Claude sie bekäme, mit markierten Platzhaltern, der Zuordnung als Dropdown, dem Text
  aus Bildern und Anhängen und dem Ergebnis der Prüfung (siehe [Datenschutz](datenschutz.md#was-geht-an-claude-ansehen)).
- **Aufgabe** in einer Zeile: Text, Überschrift in `📋 3 Aufgaben.md` (Vorschlag per Claude), Frist, „Wichtig“-Stern, **Übernehmen**. Sie steht über der Zusammenfassung.
  Die Mail bleibt danach in „Offen“; die Zeile zeigt „✓ Aufgabe übernommen“ mit „Weitere Aufgabe“.
- **Antwortentwurf:** wird im Hintergrund erzeugt, ist editierbar und kopierbar und lässt sich neu erzeugen. Aufbau: oben der **Hinweis** (Freitext für diese Antwort, z. B. „sag, dass ich nächste Woche Zeit habe“; Enter erzeugt sofort neu), darunter der Text, darunter die [Werkzeugleiste](#werkzeuge-für-den-text).
  - **Umschreiben ▾** enthält auch **Ablehnung**: schreibt neu, höflich ablehnen, ohne einen Grund zu erfinden (fehlt er, steht dort `[BITTE ERGÄNZEN: Grund]`).
  - Alles, auch „Neu erzeugen“, landet in **einer** Versionsliste (↶ ↷, „Version 3 von 5“).
  - Anrede und Gruß setzt die App aus dem [Absender-Gedächtnis](#absender-profil-und-gedächtnis) ein, wenn sie für den Absender bekannt sind.

## Verlauf als Nachrichten
Die Sektion **Verlauf** zeigt alle Nachrichten der Konversation, älteste oben, die neueste unten (zunächst die letzten 10, darüber **Ältere Nachrichten laden**).
- **Deine Nachrichten stehen rechts, die der anderen links.** Jede andere Person hat ihre eigene Farbe (immer dieselbe für dieselbe Adresse), die Nachricht, die du geöffnet hast, ist umrandet.
- **Kopfzeile je Nachricht:** nur der Name des Absenders (du selbst heißt „Du“) und die Zeit, in einer Zeile; eine Büroklammer zeigt einen Anhang. Fährst du mit der Maus über den Namen
  (oder springst mit der Tab-Taste hin), erscheint die vollständige Liste in den Blöcken **Von**, **An** und **CC**, je Zeile mit Name und Adresse.
- **Ohne zitierten Verlauf:** Outlook hängt in jede Antwort die alten Mails an. Die App schneidet das ab, weil jede frühere Nachricht ohnehin selbst im Verlauf steht.
- **Signaturen** erkennt die App selbst (Trennzeile „-- “, Grußformel mit Kontaktblock darunter, „Gesendet von meinem iPhone“, und ein Ende, das bei demselben Absender in mehreren Nachrichten gleich ist).
  Sie stehen unter der Nachricht im zugeklappten Dropdown **Signatur**. Im Zweifel bleibt Text stehen: Es wird nie etwas gelöscht, nur ausgeblendet.
- Kann der Verlauf nicht geladen werden (oder bei Testmails), zeigt die App nur die geöffnete Mail und sagt es.

## Antwort aus der App: Entwurf ablegen und senden
Die Antwort steht bei jeder offenen Mail unter dem Verlauf, auch wenn laut Bewertung keine nötig ist (dann ohne automatischen Entwurf, du schreibst selbst oder klickst „Jetzt erzeugen“). In Done gibt es sie nicht.
- **Über dem Text** stehen die [Werkzeuge](#werkzeuge-für-den-text) (Rechtschreibung, Struktur, Lücken, Diktieren).
- **An, CC und BCC** sind Felder mit Adressen als Chips. Vorbelegt ist „Nur an den Absender“ oder, wenn die Mail weitere Empfänger hatte, **Allen antworten** (ohne deine eigenen Adressen).
  BCC steht hinter „+ BCC“. Beim Tippen schlägt das [Adressbuch](#kontakte-das-adressbuch) Personen vor (Pfeiltasten und Enter, oder Klick); Enter, Komma, Semikolon oder Leerzeichen übernehmen eine getippte Adresse,
  mehrere eingefügte Adressen („Name <a@x.at>, b@y.at“) werden sofort zerlegt, die Rücktaste im leeren Feld entfernt die letzte. Eine Adresse steht nur in einem Feld (An vor CC vor BCC).
- **Meine Signatur anhängen:** erscheint, sobald im Verlauf eine eigene Signatur erkannt wurde, und hängt sie als Text an (Formatierung und Logo gehen dabei verloren).
- **In Outlook ablegen** legt die Antwort als Entwurf in Outlook an (mit dem zitierten Verlauf wie bei einer normalen Antwort). Gesendet wird nichts. Danach stehen dort
  „In Outlook öffnen“ und „Entwurf dort löschen“; legst du erneut ab, ersetzt der neue Entwurf den alten.
- **Senden** legt die Antwort zuerst als Entwurf ab und sendet nach **30 Sekunden**; bis dahin steht ein **Rückgängig** da (der Entwurf bleibt dann in Outlook, du kannst etwas ändern). Die Mail **bleibt danach offen**
  (auch die automatische Antworterkennung legt sie nicht von sich aus ab); unter dem Entwurf steht „Gesendet … In Done ablegen“. **Senden & Done** sendet und legt die Mail gleich in Done ab. **Senden planen** sendet später (siehe [unten](#senden-planen-entwürfe-und-geplantes)).
  Die App lernt aus dem gesendeten Text wie sonst auch.
- **Gesperrt** sind „Senden“ bei offenem `[BITTE ERGÄNZEN …]`, ohne Empfänger, bei leerem Text und bei einer halben Eingabe in einem Empfängerfeld (der Tooltip nennt den Grund). Anhänge lassen sich über die App nicht mitschicken.
- Dafür braucht die n8n-Verbindung zu Outlook die Rechte *Mail.ReadWrite* und *Mail.Send* (siehe [n8n/README.md](../n8n/README.md)).

## Neue Mail schreiben
Der Knopf **Neue Mail** oben rechts (oder **Neue Mail** im Absender-Profil, dort mit der Adresse vorbelegt) öffnet die Schreibansicht anstelle der Mail. Sie ist wie die Antwort aufgebaut:
1. **Text** oben, darüber die [Werkzeuge](#werkzeuge-für-den-text).
2. **Betreff** darunter. Der Knopf **Betreff vorschlagen** lässt Claude aus dem Text einen Betreff machen (geht erst mit Text, ein weiterer Klick macht einen neuen), du kannst ihn danach beliebig ändern.
3. **An, CC, BCC** wie bei der Antwort (Chips, Vorschläge aus dem [Adressbuch](#kontakte-das-adressbuch)); darunter die Knöpfe.
- **Meine Signatur anhängen:** erscheint, sobald die App deine Signatur in einem Verlauf erkannt hat (sie merkt sie sich); „ansehen“ zeigt den Text. Anhänge lassen sich nicht mitsenden.
- **Senden** legt die Mail als Entwurf in Outlook ab und sendet nach **30 Sekunden**; bis dahin steht ein **Rückgängig** da, danach kannst du weiterschreiben. Gesendet wird nur ein Entwurf, den die App selbst angelegt hat.
- **Senden planen** sendet zur gewählten Zeit (siehe unten). **In Outlook ablegen** legt einen Entwurf in Outlook an, falls du dort weiterarbeiten willst.
- **Entwurf:** Was du schreibst, speichert die App laufend **in der App** (nicht in Outlook); „Zurück“ und jedes Verlassen behalten ihn. Du findest ihn unter **Entwürfe**. **Verwerfen** löscht ihn (und einen abgelegten Outlook-Entwurf).
- Gesperrt sind Senden, Planen und Ablegen ohne Text, Betreff oder Empfänger und mit einer halben Adresse in einem Feld; der Tooltip nennt den Grund. Zum Ausprobieren eignet sich die eigene Adresse bei An.

## Werkzeuge für den Text
Eine Leiste unter dem Text jeder Antwort und jeder neuen Mail: **Diktieren | Umschreiben ▾ | Übersetzen ▾ | Prüfen ▾ | ↶ Version n von m ↷**.
- **Umschreiben:** *Aus Stichpunkten eine Mail* macht aus Stichpunkten im Feld eine fertige Mail; Empfänger, Du/Sie und Sprache kennt die App aus dem Gedächtnis, Anrede und Gruß setzt sie so ein, wie du sie dieser Person gegenüber schreibst (nichts wird erfunden, Offenes bleibt offen). *Kürzer*, *Förmlicher*, *Freundlicher* überarbeiten den Text im Feld.
- **Übersetzen:** *Ins Englische* oder *Ins Deutsche*, Ton und Aufbau bleiben.
- **Prüfen:** *Rechtschreibung* korrigiert nur Rechtschreibung, Grammatik und Zeichensetzung. *Rechtschreibung & Struktur* macht zusätzlich Absätze, Reihenfolge und Sätze klarer, ohne neue Fakten und ohne die Ansprache zu ändern. *Lücken suchen* ändert den Text nicht, sondern listet, was fehlen könnte (Bitte ohne Frist, Anhang, Termin ohne Datum, unbeantwortete Frage; bei Antworten kennt Claude die Mail). Jeder Hinweis lässt sich mit dem × erledigen.
- **Versionen ↶ ↷:** jede Änderung (auch deine eigenen Eingaben zwischen den Änderungen) ist eine Version, bis zu 30; mit ↶ und ↷ blätterst du, ein Tooltip nennt, was die Version war.
- **Warnungen vor dem Senden:** vor Senden und Planen prüft die App lokal (ohne KI) und zeigt Hinweise, die du mit „Trotzdem senden“ bestätigst oder mit „Zurück und ändern“ aufgreifst: falsche Ansprache (Text siezt, die Person wird sonst geduzt, oder umgekehrt), Empfänger aus verschiedenen Firmen sichtbar in An/CC, ein BCC, der auch in An/CC steht, und „Anhang“ im Text (die App hängt nichts an).
- **Diktieren** schreibt, was du sagst, an die Schreibmarke, mit Satzzeichen. Die Erkennung läuft lokal auf deinem Rechner (auch in Brave, unter Linux/Wayland/KDE): einmalig `./install-speech.sh` ausführen und die App neu starten; beim ersten Klick fragt der Browser nach dem Mikrofon (erlauben). Ohne die Einrichtung nutzt die App in Chrome/Edge die Browser-Erkennung. Befehle: „Komma“, „Punkt“, „Fragezeichen“, „Ausrufezeichen“, „Doppelpunkt“, „neue Zeile“, „neuer Absatz“, „Klammer auf“, „Klammer zu“. Danach helfen die Werkzeuge beim Aufräumen.
  Die Spracherkennung kommt vom Browser: In Chrome und Edge geht sie (das Audio läuft dabei über den Anbieter, siehe [Datenschutz](datenschutz.md#textwerkzeuge-und-spracheingabe)), in Brave und Firefox fehlt sie oder ist abgeschaltet;
  der Knopf sagt dann, was geht. Als Ersatz taugt das Diktat des Betriebssystems (Windows: Win+H).
- Claude sieht den Text wie überall nur pseudonymisiert. Verliert Claude beim Überarbeiten einen Platzhalter (also eine Angabe wie Name oder Nummer), verwirft die App den Vorschlag und lässt deinen Text stehen.

## Senden planen, Entwürfe und Geplantes
- **Senden planen** gibt es bei neuen Mails und bei Antworten: heute 16:00, morgen 08:00, Montag 08:00 oder eine eigene Zeit. Bei Antworten gibt es dazu „Danach in Done ablegen“.
- Eine geplante Mail liegt bis zur Sendezeit **nur in der App**. Zur Sendezeit legt die App sie in Outlook als Entwurf an und sendet sie sofort; so bleibt nichts halb fertig in Outlook liegen, und die Mail lässt sich bis zuletzt ändern oder abbrechen.
  **Die App muss zur Sendezeit laufen** (sie startet mit dem Rechner). War sie aus, geht die Mail beim nächsten Start sofort raus. Schlägt das Senden fehl, versucht es die App nach einer Minute bis zu dreimal und zeigt dann den Fehler.
- Der Knopf **Entwürfe** oben zeigt eine Zahl (Entwürfe plus Geplantes, rot bei einem Fehler) und öffnet die Übersicht. **Geplant:** „Jetzt senden“, „Bearbeiten“ (hebt die Planung bei einer neuen Mail auf und öffnet sie als Entwurf) und der Papierkorb (abbrechen).
  **Entwürfe:** ein Klick öffnet den Entwurf zum Weiterschreiben, der Papierkorb löscht ihn.
- Bei **Antworten** bleibt das, was du im Feld änderst, erhalten (auch nach dem Neuladen), ohne den erzeugten Entwurf zu überschreiben, damit das Lernen weiter beides vergleichen kann. „Neu erzeugen“ ersetzt deine Änderungen.

## Kontakte: das Adressbuch
Der Link **Kontakte** oben rechts öffnet das Adressbuch der App. Es liefert die Vorschläge bei An, CC und BCC und liegt nur auf diesem Rechner (`address-book.json` im Datenordner).
- **Es füllt sich von selbst** aus deinen Mails: Absender, An und CC der Mails in der Übersicht (sobald der Suchindex sie gelesen hat), alle Teilnehmer der Verläufe, die du öffnest, und die Empfänger deiner gesendeten Mails.
  Alles Eigene fehlt. Wem du geschrieben hast, steht in den Vorschlägen weiter oben, ebenso Neueres und Häufigeres; automatische Absender (noreply …) kommen ans Ende.
- **Aus gesendeten Mails übernehmen** liest die Empfänger aller erreichbaren gesendeten Mails auf einmal (ohne Claude). **Aus Outlook übernehmen** holt deine persönlichen Outlook-Kontakte
  (liegen dort keine, meldet die App das; das Firmenverzeichnis ist nicht abrufbar).
- **Von Hand:** Name, Adresse und Firma eintragen und „Hinzufügen“, oder **Liste einfügen** (eine Zeile je Kontakt, z. B. aus Excel: „Name;adresse“, „Name <adresse>“ oder nur Adressen).
- Name und Firma lassen sich in der Liste direkt ändern, der Papierkorb löscht einen Kontakt; ein Klick auf die Adresse öffnet das Absender-Profil. Die Suche filtert nach Name, Firma und Adresse, der Filter nach Herkunft
  (Mails, Angeschrieben, Outlook, Von Hand).

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
- andere Dateien in diesem Ordner erscheinen als Anhänge;
- `verlauf.json` in diesem Ordner ist der **Verlauf** der Testmail: eine Liste von Nachrichten `{ id, from, to, cc, sent, body }` (`from`, `to`, `cc` mit `name` und `address`, `sent` als ISO-Zeit,
  `body` als Text). Die Nachricht mit der `id` der Testmail zeigt den Text aus der Vorschau. Der Verlauf wird wie ein echter angezeigt (Farben, Signaturen, „Ältere Nachrichten laden“);
- **Ablegen und Senden** sind bei Testmails nur simuliert („Testmodus“): an Outlook geht nichts, gelernt wird daraus nichts, die Testmail wandert nach dem „Senden“ nach Done.

Der Testeintrag **TEST-VERLAUF-001** („TEST Verlauf: Rechnung 2026-0815 prüfen (dringend)“) deckt fast alles ab: Aufgabe mit Frist, „Wichtig“-Tags, Anhänge aller Typen, ein Bild im Text mit OCR,
ein Verlauf aus 14 Nachrichten von vier Personen mit CC, Signaturen, zitiertem Text und einer „Gesendet von meinem iPhone“-Zeile, Namen, Kennzeichen, Telefonnummer und IBAN für die Anonymisierung.
