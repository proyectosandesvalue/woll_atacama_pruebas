/**
 * scripts/build_catalog.mjs — Plan K
 *
 * Inventario directo desde allTemasConfig.js (sin descubrimiento PostGIS).
 * El script intenta primero descubrir las geometrías con
 * `chat_list_geom_tables()` y, si falla (porque esa RPC no existe o el
 * proyecto está en Plan K), cae automáticamente a poblar `chat_catalog`
 * directamente desde la configuración del visor, asumiendo la
 * convención layer_id == nombre de tabla en public.
 *
 * A diferencia de la versión original, ahora las `attributes` de cada
 * capa se leen de las columnas REALES de Postgres (vía la RPC
 * `chat_columns_for_table`), no del `popupCampos` del visor. Esto evita
 * que el LLM alucine nombres de columnas cuando los del visor no
 * coinciden con los de la BD.
 *
 * Tras el UPSERT del catálogo, ejecuta `chat_refresh_stats()` para
 * precalcular count, min, max, mean, median, stddev y top_values.
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL          https://...supabase.co
 *   SUPABASE_SERVICE_KEY  eyJ...   (SECRET, no anon)
 *
 * Uso:
 *   node --env-file=.env scripts/build_catalog.mjs
 *
 * Idempotente: re-ejecutable. Imprime por stdout el resultado; no
 * escribe nada a disco.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── Config y helpers ──────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el entorno. " +
      "Configúralas en .env o como variables antes de ejecutar este script."
  );
  process.exit(1);
}

const baseUrl = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
const headers = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function rpc(name, params = {}) {
  const url = `${baseUrl}/rpc/${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RPC ${name} falló (${res.status}): ${text || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function upsertCatalogRecord(record) {
  const params = {
    p_layer_id: record.layer_id,
    p_physical_table: record.physical_table,
    p_display_name: record.display_name,
    p_dimension: record.dimension,
    p_geometry_type: record.geometry_type,
    p_srid: record.srid,
    p_description: record.description,
    p_attributes: JSON.stringify(record.attributes ?? []),
    p_enabled: record.enabled,
  };
  const res = await fetch(`${baseUrl}/rpc/chat_upsert_layer`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `UPSERT chat_catalog(${record.layer_id}) falló (${res.status}): ${text}`
    );
  }
}

// ── 1. Cargar la configuración del visor ──────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const allTemasConfigPath = join(__dirname, "..", "js", "config", "allTemasConfig.js");

let allTemasConfig;
try {
  const mod = await import(allTemasConfigPath);
  allTemasConfig = mod.default ?? mod.allTemasConfig ?? {};
} catch (err) {
  console.error("No se pudo cargar js/config/allTemasConfig.js:", err.message);
  process.exit(1);
}

// Map capa_id → {display_name, dimension, geometry_type, attributes}
const layers = new Map();

for (const [temaKey, tema] of Object.entries(allTemasConfig)) {
  if (!tema || typeof tema !== "object") continue;
  const capaNames = new Set();
  if (Array.isArray(tema.capas)) tema.capas.forEach((c) => capaNames.add(c));
  if (tema.estilo && typeof tema.estilo === "object") {
    Object.keys(tema.estilo).forEach((k) => capaNames.add(k));
  }
  for (const capaName of capaNames) {
    if (!capaName) continue;
    const style = tema.estilo?.[capaName] || {};
    const fields = Array.isArray(style.popupCampos) ? style.popupCampos : [];
    if (!layers.has(capaName)) {
      layers.set(capaName, {
        display_name: style.nombrePersonalizado || capaName,
        dimension: temaKey,
        geometry_type: style.type || "GEOMETRY",
        attributes: fields.map((name) => ({ name, type: "text", descripcion: null })),
      });
    }
  }
}

console.log(`Capas declaradas en allTemasConfig: ${layers.size}`);

// ── 2. Intentar descubrimiento vía chat_list_geom_tables ──────────
let discovered = [];
try {
  discovered = (await rpc("chat_list_geom_tables")) || [];
  if (discovered.length > 0) {
    console.log(`Tablas con geometría detectadas por RPC: ${discovered.length}`);
  }
} catch (err) {
  console.warn(`chat_list_geom_tables no accesible: ${err.message}`);
}

const discoveredByTable = new Map();
for (const row of discovered) {
  discoveredByTable.set(row.f_table_name, row);
}

// ── 3. Resolver columnas reales vía RPC ───────────────────────────
// PostgREST no expone information_schema; usamos la RPC
// chat_columns_for_table (definida en 003_chat_columns_rpc.sql) que
// corre en Postgres con permisos totales.

async function fetchRealColumns(physicalTable) {
  const [schema, table] = physicalTable.split(".");
  const res = await fetch(`${baseUrl}/rpc/chat_columns_for_table`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_schema: schema, p_table: table }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`chat_columns_for_table falló (${res.status}): ${text}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows
    .filter(
      (r) =>
        !["geom", "geometry", "the_geom", "gid", "id"].includes(
          r.column_name.toLowerCase()
        )
    )
    .map((r) => ({
      name: r.column_name,
      type: r.data_type,
      descripcion: null,
    }));
}

// ── 4. UPSERT en chat_catalog ─────────────────────────────────────
let processed = 0;
for (const [layerId, meta] of layers) {
  const disc = discoveredByTable.get(layerId);
  const physicalTable = `public.${layerId}`;

  let attributes = meta.attributes; // fallback: popupCampos del visor
  let source = "popupCampos";
  try {
    const real = await fetchRealColumns(physicalTable);
    if (real && real.length > 0) {
      attributes = real;
      source = "information_schema";
    }
  } catch (err) {
    console.log(`  ✗ ${layerId}: error leyendo columnas (${err.message})`);
  }

  console.log(
    `  ${source === "information_schema" ? "✓" : "⚠"} ${layerId}: ${attributes.length} columnas (${source})`
  );

  const record = {
    layer_id: layerId,
    physical_table: physicalTable,
    display_name: meta.display_name,
    dimension: meta.dimension,
    geometry_type: disc?.geom_type || disc?.type || meta.geometry_type,
    srid: disc?.srid ? Number(disc.srid) : 4326,
    description: null,
    attributes,
    enabled: true,
    updated_at: new Date().toISOString(),
  };
  await upsertCatalogRecord(record);
  processed += 1;
}

console.log(`Filas en chat_catalog procesadas: ${processed}`);

// ── 5. Refrescar stats ────────────────────────────────────────────
console.log("Refrescando stats (chat_refresh_stats)...");
try {
  await rpc("chat_refresh_stats");
  console.log("Stats refrescadas.");
} catch (err) {
  console.warn(`chat_refresh_stats falló: ${err.message}`);
  console.warn(
    "Continúa sin stats precalculadas. Las tools query_layer y " +
      "aggregate_layer funcionan igualmente; solo get_layer_stats " +
      "devolverá datos vacíos hasta que las stats se refresquen."
  );
}

// ── 6. Resumen ────────────────────────────────────────────────────
try {
  const catalog = await rpc("chat_catalog");
  console.log(`\nResumen:`);
  console.log(
    `  Capas en chat_catalog: ${Array.isArray(catalog) ? catalog.length : "?"}`
  );
} catch {
  /* noop */
}

console.log("\n✓ Hecho.");