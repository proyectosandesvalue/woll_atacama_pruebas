# PostgreSQL 16 + PostGIS + pgvector para el VPS y el entorno local.
#
# La imagen oficial ya trae el repositorio PGDG configurado; se fijan las
# versiones de las extensiones que el proyecto necesita. Las extensiones se
# crean por migración (000_compat_roles.sql), no en initdb.
FROM docker.io/library/postgres:16-bookworm

# Versiones fijadas: se actualizan a propósito, no por un rebuild.
ARG POSTGIS_VERSION=3.7.0+dfsg-1.pgdg12+1
ARG PGVECTOR_VERSION=0.8.7-1.pgdg12+1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-16-postgis-3=${POSTGIS_VERSION} \
        postgresql-16-pgvector=${PGVECTOR_VERSION} \
    && rm -rf /var/lib/apt/lists/*

LABEL org.opencontainers.image.title="woll-postgres" \
      org.opencontainers.image.description="PostgreSQL 16 + PostGIS + pgvector para WOLL Atacama" \
      org.opencontainers.image.source="https://github.com/proyectosandesvalue/woll_atacama_pruebas"

# El entrypoint oficial sigue siendo el de la imagen base.
