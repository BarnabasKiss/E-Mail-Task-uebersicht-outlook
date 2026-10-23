# Mail-App

Lokaler Mini-Mailclient. Zeigt die in n8n bewerteten Outlook-Mails wie einen Posteingang, übernimmt Aufgaben nach Obsidian
(`📋 3 Aufgaben.md`), schreibt Antwortentwürfe über das lokale `claude -p`, lernt aus deinen gesendeten Antworten und durchsucht Mails samt
Anhängen. Sie schreibt nie in Outlook, und Claude sieht nie eine Datei, nur anonymisierten Text.

```
Outlook ─► n8n "Mail-Eingang"  ─► Datentabelle "Mail-Vorschläge" ◄─► n8n "Mail-App Schnittstelle" ◄─► diese App (localhost)
           pseudonymisiert,        (Status: neu, done,                (Webhook, Token)                 │
           Modell bewertet,         angenommen, beantwortet)                                            ├─► Obsidian: 📋 3 Aufgaben.md
           Platzhalter zurück                                                                           └─► claude -p (lokal): Entwürfe, Lernen
```

## Was die App kann
- **Posteingang nach Dringlichkeit:** Jetzt, Überfällig, Heute, Diese Woche und Egal (zuklappbar), dazu die Reiter Später und Done. Pro Zeile Tags: Direkt/CC/Shared,
  Wichtig, Anhang mit Formaten, Aufgabe, Frist.
- **Aufgaben und Entwürfe:** Aufgabe mit Überschrift-Vorschlag in die Obsidian-Liste übernehmen, Antwortentwurf im Hintergrund erzeugen
  (pseudonymisiert), als Variante (kürzer, förmlicher, freundlicher, Ablehnung) und mit Hinweis neu erzeugen.
- **Sammelaktionen:** mehrere Mails mit Strg + Klick markieren und per Button gemeinsam in Done legen, zurückstellen, löschen oder ihre Absender ignorieren.
- **Absender-Gedächtnis und Profil:** Du/Sie, Anrede, Gruß, Sprache und Notizen je Person und Firma, gelernt aus deinen gesendeten Antworten und
  aus vielen gesendeten Mails auf einmal (anonymisiert), im Absender-Profil prüf- und änderbar.
- **Suche:** Absender, Betreff, voller Mailtext, Bewertung, Dokumentinhalt (auch gescannte PDFs) und Dokumentnamen; Filter für Von, An/CC, Zeitraum, Anhang, Format,
  Aufgabe, Wichtig und Eingang.
- **Bilder und Anhänge:** Bilder stehen im Mailtext; Text aus Bildern (OCR) und Anhängen geht nur anonymisiert und geprüft an Claude, und du siehst vorher,
  was gesendet würde.
- **Tab-Signal:** Brave/Chrome-Tab (auch angepinnt) zeigt blau „etwas offen“ und orange-rot „Wichtiges offen“, optional mit Systembenachrichtigung.

## Schnellstart
```bash
git clone <dieses Repo> && cd E-Mail-Task-uebersicht-outlook
cp config.example.json config.json      # ausfüllen: n8n-Adresse und Token, Vault, Claude, eigene Adresse
node server.js                          # dann http://localhost:4711 öffnen
```
Voraussetzung: Node.js 20 oder neuer (keine Pakete nötig), Claude-Code-CLI, die n8n-Workflows. Autostart für Windows und Linux,
optionale Programme für PDF und OCR und alles Weitere: [docs/installation.md](docs/installation.md).

## Dokumentation
| | |
|---|---|
| [docs/installation.md](docs/installation.md) | Einrichten, Starten und Autostart (Windows, Linux, macOS), PDF und OCR installieren, Datenordner |
| [docs/bedienung.md](docs/bedienung.md) | Liste, Tags, Detailansicht, Tastatur, Tab-Symbol und Benachrichtigungen, Testmails |
| [docs/suche.md](docs/suche.md) | erweiterte Suche, Filter, Suchindex |
| [docs/datenschutz.md](docs/datenschutz.md) | Pseudonymisierung, strenge Anonymisierung, was an Claude geht, Modul „Bewertung mit Anhängen“, Grenzen |
| [docs/konfiguration.md](docs/konfiguration.md) | alle Einstellungen, Hintergrundjobs, Regeldatei |
| [docs/architektur.md](docs/architektur.md) | Aufbau, Dateikarte, Schnittstelle, Erweitern, Tests |
| [n8n/README.md](n8n/README.md) | die n8n-Workflows und die Datentabelle zum Nachbauen |

## Entwickeln
```bash
npm install     # nur für die Oberflächen-Tests (jsdom); die App selbst braucht nichts
node --test     # alle Tests, ohne Netz, Outlook und Claude
```
GitHub Actions führt die Tests bei jedem Push unter Linux, Windows und macOS aus. Mehr in [docs/architektur.md](docs/architektur.md#entwicklung-und-tests).

## Datenschutz in einem Satz
`config.json` (n8n-Token), `Mail-Regeln.md` und der Datenordner (Entwürfe, Suchindex mit echten Inhalten) bleiben auf deinem Rechner und
stehen nicht im Repo. Details und Grenzen der Anonymisierung: [docs/datenschutz.md](docs/datenschutz.md).
