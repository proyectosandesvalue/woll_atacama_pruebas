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
# Solo lo que necesita `npm run config:snapshot` (config + validador).
COPY js/config ./js/config
COPY js/utils/configValidator.js js/utils/logger.js ./js/utils/

USER node
EXPOSE 3000

CMD ["node", "server/index.js"]
