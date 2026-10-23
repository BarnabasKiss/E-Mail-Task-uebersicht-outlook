# Installation und Betrieb

## Voraussetzungen
- **Node.js 20 oder neuer.** Die App braucht keine Pakete (`npm install` ist nur für die Oberflächen-Tests nötig, siehe [Entwicklung](architektur.md#entwicklung-und-tests)).
- **Claude-Code-CLI** (`claude`), installiert und angemeldet. Sie schreibt Entwürfe und ordnet Aufgaben zu.
- **n8n** mit den zwei Workflows und der Datentabelle aus [n8n/README.md](../n8n/README.md).
- **Obsidian-Vault** mit der Aufgabenliste (`📋 3 Aufgaben.md`).
- Optional, für Textauszüge aus Anhängen: **`pdftotext`** und **`pdftoppm`** (beide aus Poppler, für PDF) und **`tesseract`** (Bilder und gescannte PDFs, OCR).
  Fehlt eines, steht im Entwurf nur „Anhang konnte nicht gelesen werden“, und Claude tut nicht so, als kenne er den Inhalt.
  Gescannte PDFs ohne Text liest die App per OCR (die ersten 10 Seiten); dafür braucht sie `pdftoppm` und `tesseract`.

| System | pdftotext, pdftoppm | tesseract |
|---|---|---|
| Windows | Poppler für Windows, den Ordner `bin` in den `PATH` | Installer von UB Mannheim (mit Sprache „German“), in den `PATH` |
| Linux (Fedora) | `sudo dnf install poppler-utils` | `sudo dnf install tesseract tesseract-langpack-deu` |
| Linux (Debian/Ubuntu) | `sudo apt install poppler-utils` | `sudo apt install tesseract-ocr tesseract-ocr-deu` |
| macOS | `brew install poppler` | `brew install tesseract tesseract-lang` |

- Optional, für das **Diktieren**: **Python 3** und `./install-speech.sh` (siehe [Diktieren einrichten](#diktieren-einrichten)).

**tesseract ohne root (Linux):** Die Pakete `tesseract`, `tesseract-libs`, `tesseract-common`, `tesseract-langpack-deu` und `-eng` mit
`dnf download` laden und mit `rpm2cpio <datei> | cpio -idm` nach `<Datenordner>/tesseract/` entpacken (etwa 9 MB). Die App findet das
beim Start selbst (Meldung „tesseract aus dem Datenordner“), sonst nimmt sie das tesseract aus dem `PATH`.

## Diktieren einrichten
Das Diktieren erkennt Sprache lokal mit [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (läuft auf der CPU, auch in Brave und unter Linux/Wayland, ohne Cloud).
1. `./install-speech.sh` (Linux/macOS) ausführen. Es legt eine eigene Python-Umgebung unter `<Datenordner>/speech-venv` an und lädt das Modell einmalig herunter
   (Standard `large-v3-turbo`, etwa 1,6 GB; kleiner und schneller: `./install-speech.sh small`, etwa 460 MB). Unter Windows dieselben Schritte von Hand: `py -m venv`, dann `pip install faster-whisper "av>=14,<17"`.
2. App neu starten. Beim ersten Klick auf **Diktieren** fragt der Browser nach dem Mikrofon (erlauben).
3. Das Modell lädt beim ersten Diktat (einige Sekunden) und wird nach 10 Minuten Leerlauf wieder beendet.

Einstellungen: [`speech`](konfiguration.md#diktieren-speech-optional). Claude selbst kann keine Audiodaten verarbeiten; das Modell hier ist ein reines Spracherkennungsmodell, das nur auf deinem Rechner läuft.

## Einrichten auf einem neuen Gerät
1. Repo klonen.
2. `config.example.json` nach `config.json` kopieren und ausfüllen (alle Schlüssel: [Konfiguration](konfiguration.md)):
   n8n-Adresse und Token, Pfad zum Vault, Pfad zu `claude` (`claude.exe` unter Windows), eigene Adresse und Namen.
3. Starten (unten). Beim ersten Start entstehen die Regeldatei `Mail-Regeln.md` und der Datenordner.

`config.json` und `Mail-Regeln.md` stehen bewusst **nicht** im Repo (Token, Pfade, persönliche Regeln). Wer dieselben Regeln auf mehreren
Geräten will, kopiert `Mail-Regeln.md` von Hand. Die Mails und ihr Status (Offen, Done) liegen in n8n und sind auf allen Geräten gleich,
alles Lokale (Entwürfe, Zuordnungen, Suchindex) liegt pro Gerät im Datenordner.

## Starten

| | Windows | Linux | macOS |
|---|---|---|---|
| Einmalig, Autostart | `powershell -File install-autostart.ps1` (beim Anmelden, unsichtbar) | `./install-autostart.sh` (systemd-Benutzerdienst `mail-app`, startet sofort und bei jeder Anmeldung) | nicht vorbereitet |
| Sofort starten | `wscript.exe start-hidden.vbs` oder `node server.js` | `node server.js` | `node server.js` |
| Log | `%LOCALAPPDATA%\mail-app\server.log` (wird nicht gekürzt) | `journalctl --user -u mail-app -f` | Terminal |
| Entfernen | `uninstall-autostart.ps1` | `./uninstall-autostart.sh` | |

Öffnen: http://localhost:4711 oder die Datei `Mail-App öffnen.url`. Die App lauscht nur auf `127.0.0.1` und lehnt andere Host-Namen ab.

## Datenordner
`dataDir` aus der Konfiguration. Pfade dürfen `~` und `%VAR%` enthalten, `%LOCALAPPDATA%` wird außerhalb von Windows durch den
XDG-Datenordner ersetzt (`$XDG_DATA_HOME/mail-app`, meist `~/.local/share/mail-app`). Dieselbe `config.json` läuft so überall.

| Inhalt | Zweck |
|---|---|
| `state.json` | Entwürfe, Aufgabenzuordnung, Zurückgestelltes, Rollen (Direkt/CC/Shared), Aufgaben-Vermerke, Anhangsnamen |
| `doc-index.json` | Suchindex: Text der Anhänge, Empfänger und voller Mailtext |
| `review-log/` | gesendete Prompts der Anhangs-Bewertung (nur anonymisierter Text, die letzten 40) |
| `backups/` | Sicherungen der Aufgabenliste vor jeder Änderung |
| `tesseract/` | optional: entpacktes tesseract (siehe oben) |
| `speech-venv/` | optional: Python-Umgebung der lokalen Spracherkennung (siehe [Diktieren einrichten](#diktieren-einrichten)) |
| `address-book.json` | Adressbuch für die Empfängerfelder |
| `test-anhaenge/` | Dateien für Testmails (`<mail_id>/…`) |

Alles darin enthält echte Inhalte. Nicht in eine Cloud legen (OneDrive, Dropbox). Löschen ist ungefährlich: Der Index baut sich neu auf,
Entwürfe entstehen neu.
