# Suche

Das Suchfeld (Taste `/`) durchsucht **alle** Mails, auch die in Done. Alle eingegebenen Wörter müssen vorkommen. Der Filter-Knopf rechts
daneben klappt die erweiterte Suche auf; ohne Suchtext genügen Filter.

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍  Rechnung 2026                         [⚙ Filter 2] [×] │
├─────────────────────────────────────────────────────────────┤
│ SUCHEN IN   [✓ Absender & Betreff] [✓ Mailtext] [✓ Bewertung]
│             [✓ Dokumentinhalt]     [✓ Dokumentnamen]        │
│ VON         [ Name oder Adresse ▾ ]                         │
│ AN / CC     [ Name oder Adresse ▾ ]  [An + CC ▾]            │
│ ZEITRAUM    [ von ] – [ bis ]  (Heute) (7 Tage) (30 Tage)   │
│ MIT         [ ] Anhang [Format ▾] [ ] Aufgabe [ ] Wichtig   │
│ EINGANG     [Direkt] [CC] [Shared]          Zurücksetzen    │
└─────────────────────────────────────────────────────────────┘
 Aktiv:  Von: weber ×   Format: PDF ×
```

| Feld | Bedeutung |
|---|---|
| **Suchen in** | Absender & Betreff · Mailtext (voller Text) · Bewertung (Zusammenfassung, Aufgabe, Kategorie, Begründung) · Dokumentinhalt · Dokumentnamen. Standardmäßig alles an. |
| **Von** | Teil von Name oder Adresse des Absenders (Vorschläge aus bekannten Absendern) |
| **An / CC** | Teil von Name oder Adresse eines Empfängers; „An + CC“, „Nur An“ oder „Nur CC“ |
| **Zeitraum** | Eingang von/bis, oder Schnellwahl |
| **Mit** | Anhang (mit Format-Auswahl aus den vorhandenen Anhängen), Aufgabe (vorgeschlagen oder übernommen), Wichtig |
| **Eingang** | Direkt, CC, Shared (mehrere möglich) |

Aktive Filter erscheinen als Chips mit ×, am Knopf steht ihre Zahl. Die Trefferliste zeigt zu jedem Treffer die Fundstelle:
Büroklammer mit Dateiname und Ausschnitt für Dokumente, Brief-Symbol für den Mailtext, Suchbegriffe markiert.

Der Zustand steht in der Adresszeile (`q`, `f_von`, `f_an`, `f_am`, `f_ab`, `f_bis`, `f_fmt`, `f_anh`, `f_auf`, `f_wi`, `f_ein`, `f_in`).
Neuladen und Lesezeichen behalten die Suche. Ein Klick auf einen Reiter beendet die Suche.

## Der Suchindex
Dokumentinhalt, Dokumentnamen, Mailtext und der Filter An/CC laufen über einen lokalen Index (`<Datenordner>/doc-index.json`, `lib/doc-index.js`).
Ein Hintergrundjob liest **Anhänge** (PDF, Word, Excel, PowerPoint, Text; Bilder per OCR, auch Screenshots in der Mail), **Empfänger** (An, Cc)
und den **vollen Mailtext** aller Mails, auch aus Done: 2 Mails alle 45 Sekunden, neueste zuerst. Das erste Nachlesen dauert je nach Mailmenge
einige Minuten bis eine Stunde; die Trefferliste zeigt solange „Dokumente und Mailtext: x von y Mails gelesen“.

- **Nur lokal.** Nichts davon geht an Claude oder ins Netz. Die Datei enthält echte Inhalte: im Datenordner lassen, nicht in die Cloud legen.
- Mehrere Wörter müssen im selben Dokument (bzw. im Mailtext) stehen; der Dateiname zählt mit. Ein Treffer nur im Dateinamen hat keinen Ausschnitt.
- **Grenzen:** pro Dokument die ersten 60.000 Zeichen, Mailtext höchstens 100.000 Zeichen; Anhänge über 25 MB und unbekannte Dateitypen fehlen;
  gescannte PDFs ohne Text werden nicht per OCR gelesen (nur Bilder); Bcc kennt Outlook nicht.
- Mails, die Outlook nicht liefert (z. B. dort gelöscht), werden nach drei Versuchen übersprungen.
- **Abschalten:** `"attachments": { "searchDocs": false }`. Index löschen = Datei entfernen, er baut sich neu auf.
