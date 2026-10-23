#!/usr/bin/env python3
"""Lokale Spracherkennung für die Mail-App (faster-whisper). Läuft als Arbeitsprozess: liest je Zeile einen Auftrag als JSON
({"id": 1, "file": "/pfad/aufnahme.webm"}) und antwortet je Zeile mit {"id": 1, "text": "..."} oder {"id": 1, "error": "..."}.
Aufruf: stt-worker.py <modell> <sprache> [threads]. Das Modell wird beim ersten Start geladen (und einmalig heruntergeladen)."""
import json
import os
import sys

model_name = sys.argv[1] if len(sys.argv) > 1 else "small"
language = sys.argv[2] if len(sys.argv) > 2 else "de"
threads = int(sys.argv[3]) if len(sys.argv) > 3 else max(2, (os.cpu_count() or 4) // 2)

# Satzzeichen und Schreibweise orientieren sich an diesem Beispiel (Whisper übernimmt den Stil des Anfangstexts)
PROMPT = "Hallo Anna, vielen Dank für deine Nachricht. Ich melde mich morgen wegen der Rechnung, Schaden-Nr. 2026-0815."

try:
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads)
    print(json.dumps({"ready": True, "model": model_name}), flush=True)
except Exception as e:  # noqa: BLE001
    print(json.dumps({"fatal": str(e)}), flush=True)
    sys.exit(1)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = json.loads(line)
    try:
        segments, _info = model.transcribe(
            req["file"],
            language=language,
            vad_filter=True,  # Stille und Rauschen weglassen, damit Whisper dort nichts erfindet
            beam_size=5,
            condition_on_previous_text=False,
            initial_prompt=req.get("prompt") or PROMPT,
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        print(json.dumps({"id": req["id"], "text": text}), flush=True)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"id": req.get("id"), "error": str(e)}), flush=True)
