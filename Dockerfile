# Mail-App im Container: Node, Poppler und Tesseract (Anhänge, OCR) und die Claude-CLI.
# Alles Veränderliche liegt in /data (config.json, Mail-Regeln.md, state.json, Suchindex) und wird als Volume eingebunden.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-deu tesseract-ocr-eng ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code \
 && npm cache clean --force

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
    HOME=/data/home

# Läuft als Benutzer "node" (uid 1000); /data muss für ihn beschreibbar sein.
USER node
VOLUME /data
EXPOSE 4711

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:4711/login').then(r=>process.exit(r.ok||r.status===200?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
