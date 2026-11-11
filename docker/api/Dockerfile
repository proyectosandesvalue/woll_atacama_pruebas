# Imagen de la API Node para el VPS.
#
# Solo incluye runtime: servidor, scripts de ingesta y migraciones. Los
# estáticos y GeoJSON los sirve Nginx desde el checkout, no esta imagen.
FROM docker.io/library/node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY server ./server
COPY scripts ./scripts
COPY db ./db

USER node
EXPOSE 3000

CMD ["node", "server/index.js"]
