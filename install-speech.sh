#!/usr/bin/env bash
# Richtet die lokale Spracherkennung für das Diktieren ein (faster-whisper, läuft ohne Netz und ohne Grafikkarte).
# Legt eine eigene Python-Umgebung im Datenordner der App an und lädt das Modell einmalig herunter (large-v3-turbo: etwa 1,6 GB).
# Aufruf: ./install-speech.sh [modell]    Modelle: tiny, base, small, medium, large-v3-turbo (Standard). Größer = genauer und langsamer.
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
model="${1:-large-v3-turbo}"
data="$(cd "$dir" && node --input-type=module -e "import { loadConfig } from './lib/config.js'; console.log(loadConfig().dataDir)")"
venv="$data/speech-venv"
echo "Datenordner: $data"
command -v ffmpeg >/dev/null || echo "Hinweis: ffmpeg ist nicht installiert; die Erkennung braucht es nicht, aber es hilft bei der Fehlersuche (Fedora: sudo dnf install ffmpeg-free)."
python3 -m venv "$venv"
"$venv/bin/pip" install --quiet --upgrade pip
# av muss älter als 17 sein: faster-whisper ruft eine Funktion auf, die neuere Versionen nicht mehr kennen
"$venv/bin/pip" install --quiet faster-whisper "av>=14,<17"
echo "Lade das Modell \"$model\" (einmalig) und prüfe die Erkennung …"
"$venv/bin/python" - "$model" <<'PY'
import sys
from faster_whisper import WhisperModel
WhisperModel(sys.argv[1], device="cpu", compute_type="int8")
print("Modell bereit.")
PY
echo
echo "Fertig. In config.json (optional):  \"speech\": { \"model\": \"$model\", \"language\": \"de\" }"
echo "Dann die App neu starten (Linux: systemctl --user restart mail-app)."
