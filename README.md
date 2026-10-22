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
   n8n-Workflow „Mail-App Schnittstelle“), Pfad zum Obsidian-Vault, Pfad zu `claude.exe`, eigene Adresse und Namen.
3. Starten wie unten beschrieben. `config.json` und `Mail-Regeln.md` stehen bewusst **nicht** im Repo (Token, Pfade, persönliche Regeln).
   `Mail-Regeln.md` entsteht beim ersten Start neu. Wer dieselben Regeln auf mehreren Geräten will, kopiert die Datei von Hand.
4. Zustand (Entwürfe, Zuordnungen, Zurückgestelltes) liegt pro Gerät in `%LOCALAPPDATA%\mail-app` und wird nicht geteilt.
   Die Mails selbst und ihr Status (Offen, Done) liegen in n8n und sind auf allen Geräten gleich.

## Starten

- Einmalig: `powershell -File install-autostart.ps1` (Autostart beim Anmelden, unsichtbar)
- Sofort starten: `wscript.exe start-hidden.vbs` oder im Terminal `node server.js`
- Öffnen: `Mail-App öffnen.url` oder http://localhost:4711
- Log: `%LOCALAPPDATA%\mail-app\server.log` (wird nicht automatisch gekürzt)
- Entfernen: `uninstall-autostart.ps1`

Voraussetzung: Node.js 20 oder neuer. Es gibt keine Pakete zu installieren.

## Bedienung
- Links: Suche (Taste `/`), Reiter Offen, Egal, Später, **Done**. Die Liste ist nach Dringlichkeit gruppiert.
  Die Suche durchsucht alle Mails, auch die in Done.
- Pro Mail in der Liste (beim Darüberfahren): **In Done ablegen** und **Löschen**. In Done: **Zurückholen** und **Löschen**.
- Rechts oben: **In Outlook öffnen**, **Später** (Mail ausblenden bis zu einem Zeitpunkt), **Verwerfen**, **Löschen**.
  - **Verwerfen** = in Done ablegen (keine Aufgabe nötig). Die Mail bleibt durchsuchbar und lässt sich zurückholen.
    Direkt danach „Rückgängig“. Im Menü daneben: „Absender künftig ignorieren“ (Regel in Mail-Regeln.md).
  - **Löschen** = Konversation vollständig aus der Übersicht entfernen (Tabellenzeile in n8n und alles Lokale, auch aus Done).
    Nicht rückgängig zu machen, mit Rückfrage. In Outlook bleibt die Mail unverändert.
  - **Done** enthält verworfene, übernommene (Aufgabe angelegt) und beantwortete Mails.
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

## Regeldatei
`Mail-Regeln.md` liegt im App-Ordner (Einstellung `rulesFile` in `config.json`, relativ zum App-Ordner oder absolut).
Der Knopf "Regeln" in der App öffnet sie mit deinem Standardprogramm. Auf den Vault greift die App nur für
`📋 3 Aufgaben.md` zu (Aufgabe übernehmen).

## Datenschutz
- Mails werden in n8n und in der App pseudonymisiert, bevor sie an ein Modell gehen. Die Logik steht in
  `lib/pseudonymize.js` und im n8n-Workflow "Mail-Eingang". Bei Änderungen beide angleichen.
- Grenzen: Namen ohne Herr/Frau, Anrede, Signatur oder Absenderfeld und Firmennamen werden nicht maskiert.
- `config.json` enthält den n8n-Token. Der Ordner liegt in OneDrive: Token bei Bedarf in n8n neu vergeben.
- Entwürfe und Zustand liegen bewusst außerhalb von OneDrive in `%LOCALAPPDATA%\mail-app`.

## Tests
`node --test` (Pseudonymisierung, Vault-Schreiben, Regeldatei, Entwurfs-Nachbearbeitung)
