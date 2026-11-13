# Worker de ingesta RAG (Sprint 45-A).
#
# Necesita devDependencies (`pdfjs-dist`) para extraer PDFs. Corre separado del
# API y comparte el volumen `./rag` con el panel.
FROM docker.io/library/node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

COPY server ./server
COPY scripts ./scripts
COPY db ./db
COPY rag ./rag

RUN mkdir -p /app/rag/inbox && chown -R node:node /app/rag

USER node
CMD ["node", "scripts/rag-worker.mjs"]
