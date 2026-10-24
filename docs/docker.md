# Betrieb im Container (Server, CasaOS)

Die App läuft als Container auf einem Server, damit alle Geräte dieselben Daten sehen (Entwürfe, Absender-Gedächtnis, Suchindex, Regeln).
Das Image baut GitHub Actions (`.github/workflows/docker.yml`) und legt es unter `ghcr.io/barnabaskiss/e-mail-task-uebersicht-outlook` ab
(Tag `latest` = Branch `main`, sonst der Branch-Name).

## Anmeldung
Sobald `MAIL_APP_PASSWORD` gesetzt ist, verlangt die App eine Anmeldung (Seite `/login`), sonst antwortet sie nur auf `127.0.0.1`.
- Sitzung: signiertes Cookie (`HttpOnly`, `SameSite=Strict`, `Secure` hinter HTTPS), 30 Tage gültig. Das Geheimnis liegt in `/data/session-secret` (oder `MAIL_APP_SESSION_SECRET`); wer die Datei löscht, meldet alle ab.
- Sperre: 5 Fehlversuche je Adresse sperren 15 Minuten (Adresse aus `cf-connecting-ip` oder `x-forwarded-for`).
- Beim Betrieb im Internet **immer** über HTTPS (Cloudflare-Tunnel o. Ä.) und ein langes Passwort.

## Umgebungsvariablen
| Variable | Bedeutung |
|---|---|
| `MAIL_APP_PASSWORD` | Passwort der Oberfläche (Pflicht im Container) |
| `MAIL_APP_USER` | Benutzername, Standard `admin` |
| `MAIL_APP_SESSION_SECRET` | optional, fester Signaturschlüssel |
| `CLAUDE_CODE_OAUTH_TOKEN` | Zugang der Claude-CLI (`claude setup-token` auf einem angemeldeten Gerät erzeugen) |
| `MAIL_APP_CONFIG` | Standard im Image `/data/config.json` |

## Volume `/data`
Muss für uid 1000 beschreibbar sein. Inhalt: `config.json` (Vorlage `config.docker.example.json`), `Mail-Regeln.md`, `state.json`, `doc-index.json`,
`vault/` (Aufgabenliste), `home/` (Einstellungen der Claude-CLI). Siehe [Installation](installation.md#datenordner).

## Grenzen im Container
- Diktieren läuft mit der Spracherkennung im Image (`speech.python` = `/opt/speech-venv/bin/python`). Das Modell (1,6 GB) lädt die App beim ersten Diktat nach `/data/hf-cache`. Der Browser erlaubt das Mikrofon **nur über HTTPS** oder `localhost`: im LAN per `http://192.168.68.62:4711` geht es nicht, über den Cloudflare-Tunnel schon.
- „In Editor öffnen“ bei den Regeln und das Öffnen lokaler Dateien gibt es nicht; die Regeln bearbeitet man in der App.
- Der Obsidian-Vault muss auf dem Server liegen (`/data/vault`). Er wird nur für die Aufgabenliste gebraucht.

## Daten vom bisherigen Gerät übernehmen
Den Datenordner (`~/.local/share/mail-app`: `state.json`, `address-book.json`, `doc-index.json`) und `Mail-Regeln.md` nach `/data` kopieren, solange der Container steht.
