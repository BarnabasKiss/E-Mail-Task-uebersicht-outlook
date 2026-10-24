# Mail-App im Container: Node, Poppler und Tesseract (Anhänge, OCR), die Claude-CLI und die lokale Spracherkennung (faster-whisper).
# Alles Veränderliche liegt in /data (config.json, Mail-Regeln.md, state.json, Suchindex) und wird als Volume eingebunden.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv poppler-utils tesseract-ocr tesseract-ocr-deu tesseract-ocr-eng ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code \
 && npm cache clean --force

# Diktieren: Python-Umgebung im Image; das Whisper-Modell lädt die App beim ersten Diktat in /data/hf-cache (bleibt über Updates erhalten)
RUN python3 -m venv /opt/speech-venv \
 && /opt/speech-venv/bin/pip install --no-cache-dir faster-whisper "av>=14,<17"

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY actions ./actions
COPY public ./public
COPY tools ./tools

ENV NODE_ENV=production \
    MAIL_APP_CONFIG=/data/config.json \
    MAIL_APP_HOST=0.0.0.0 \
    HOME=/data/home \
    HF_HOME=/data/hf-cache

# Läuft als Benutzer "node" (uid 1000); /data muss für ihn beschreibbar sein.
USER node
VOLUME /data
EXPOSE 4711

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:4711/login').then(r=>process.exit(r.ok||r.status===200?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
