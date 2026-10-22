# ADR 020: Inventario dinámico de datos no disponibles

- **Estado:** Propuesto (para el Sprint 41)
- **Fecha:** 2026-10-21
- **Sprint:** 41 (o antes si se cargan datos en 42)
- **Relación:** ADR 016 (orquestación determinística), 40-D.2 (inventario estático de prueba)

## 1. Contexto

El 40-D.2 introdujo un inventario estático (`server/chat/data/no-disponible.json`)
con 2 entradas. Es una prueba mínima. No escala: cada vez que se carga una capa
nueva, el inventario queda obsoleto y hay que editarlo a mano.

## 2. Decisión

Reemplazar el JSON estático por un inventario **generado dinámicamente** desde:

1. **El catálogo** (`chat.chat_catalog`): qué capas existen y qué columnas tienen.
2. **El registro de fuentes ingeridas** (`ingest.sources`): qué fuentes externas
   están cargadas (DGAC, BCN, ArClim).
3. **El registro de recetas** (`admin.analysis_recipes`): qué análisis están
   implementados.

El inventario se materializa en una vista o tabla (`chat.unavailable_data`)
que se refresca con un job:
- Al cargar una capa nueva (`chat_upsert_layer`).
- Al ingerir una fuente externa (Sprint 42).
- Al registrar una receta (Sprint 41).

## 3. Estructura de la tabla

```sql
CREATE TABLE chat.unavailable_data (
  id text PRIMARY KEY,
  descripcion text NOT NULL,
  palabras text[] NOT NULL,           -- palabras clave para matching
  capas_relacionadas text[],          -- capas que SÍ existen y podrían servir
  existe text,                        -- qué sí tiene el visor
  motivo text NOT NULL CHECK (motivo IN ('dato_inexistente', 'sin_receta', 'fuente_no_ingerida')),
  verificado_en date NOT NULL,
  source text NOT NULL                -- 'manual' | 'catalog' | 'ingest' | 'recipe'
);