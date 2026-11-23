# Worker de capas geográficas (Sprint 47).
#
# Incluye GDAL y unzip para importar Shapefile/ZIP con ogr2ogr. La API no
# incorpora GDAL: la importación corre solo en este worker.
FROM docker.io/library/node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends gdal-bin unzip \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY server ./server
COPY scripts ./scripts
COPY db ./db
COPY js/config ./js/config
COPY js/utils/configValidator.js js/utils/logger.js ./js/utils/

USER node

CMD ["node", "scripts/layer-worker.mjs"]
