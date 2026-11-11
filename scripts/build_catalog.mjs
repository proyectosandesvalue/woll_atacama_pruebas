/**
 * scripts/build_catalog.mjs — inventario de capas para el chat.
 *
 * Lee `js/config/allTemasConfig.js`, resuelve las columnas reales y hace UPSERT
 * en `chat.chat_catalog`; después refresca las stats.
 *
 * Soporta los dos transportes:
 *   - `DB_DRIVER=postgres` (VPS/local): driver `pg.Pool` y `DATABASE_URL`.
 *   - Supabase REST (demo): `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
 *
 * Uso:
 *   node --env-file=.env.local scripts/build_catalog.mjs
 *   node --env-file=.env.local scripts/build_catalog.mjs --only lagunas_embalses
 *   node --env-file=.env.staging scripts/build_catalog.mjs
 *   node ... --skip-stats
 *
 * Idempotente: re-ejecutable. No escribe archivos.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(argv) {
  const only = new Set();
  let skipStats = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--skip-stats") {
      skipStats = true;
    } else if (arg === "--only") {
      const value = argv[i + 1];
      if (!value) throw new Error("--only requiere una lista de layer_id separada por comas.");
      for (const id of String(value).split(",")) {
        if (id.trim()) only.add(id.trim());
      }
      i += 1;
    } else if (arg.startsWith("--only=")) {
      for (const id of arg.slice(7).split(",")) {
        if (id.trim()) only.add(id.trim());
      }
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }

  return { only, skipStats };
}

const args = parseArgs(process.argv.slice(2));

const usePostgres =
  process.env.DB_DRIVER === "postgres" ||
  (!process.env.SUPABASE_URL &&
    Boolean(process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL));

let pgDriver = null;
let supabaseBaseUrl = null;
let supabaseHeaders = null;

if (usePostgres) {
  const connectionString =
    process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Falta DATABASE_ADMIN_URL o DATABASE_URL para DB_DRIVER=postgres.");
    process.exit(1);
  }

  const { createDriver } = await import("../server/db/drivers/postgres.js");
  pgDriver = createDriver({ connectionString });
  console.log(`Catálogo: PostgreSQL (${process.env.PG_APPLICATION_NAME || "build-catalog"})`);
} else {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error(
      "Faltan SUPABASE_URL/SUPABASE_SERVICE_KEY, o configura DB_DRIVER=postgres y DATABASE_URL."
    );
    process.exit(1);
  }
  supabaseBaseUrl = process.env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
  supabaseHeaders = {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  console.log("Catálogo: Supabase REST");
}

async function supabaseRpc(name, params = {}) {
  const res = await fetch(`${supabaseBaseUrl}/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: supabaseHeaders,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RPC ${name} falló (${res.status}): ${text || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function rpc(name, params = {}) {
  if (pgDriver) return pgDriver.rpc(name, params);
  return supabaseRpc(name, params);
}

async function upsertCatalogRecord(record) {
  const base = {
    p_layer_id: record.layer_id,
    p_physical_table: record.physical_table,
    p_display_name: record.display_name,
    p_dimension: record.dimension,
    p_geometry_type: record.geometry_type,
    p_srid: record.srid,
    p_description: record.description,
    p_enabled: record.enabled,
  };

  if (pgDriver) {
    await pgDriver.rpc("chat_upsert_layer", {
      ...base,
      p_attributes: record.attributes ?? [],
    });
    return;
  }

  await supabaseRpc("chat_upsert_layer", {
    ...base,
    p_attributes: JSON.stringify(record.attributes ?? []),
  });
}

// ── 1. Cargar la configuración del visor ──────────────────────────
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
    // Las capas WMS no tienen tabla física en PostGIS.
    if (style.tipo === "wms" || style.type === "wms") continue;
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

const selectedLayers =
  args.only.size > 0
    ? new Map([...layers].filter(([layerId]) => args.only.has(layerId)))
    : layers;

if (args.only.size > 0) {
  const missing = [...args.only].filter((id) => !layers.has(id));
  if (missing.length > 0) {
    console.warn(`No están en allTemasConfig: ${missing.join(", ")}`);
  }
  console.log(`Capas seleccionadas por --only: ${selectedLayers.size}`);
}

// ── 2. Descubrir tablas con geometría ─────────────────────────────
let discovered = [];

if (pgDriver) {
  const rows = await pgDriver.query(
    `SELECT f_table_name, f_geometry_column, srid, type
       FROM geometry_columns
      WHERE f_table_schema = 'public'`
  );
  discovered = rows.map((row) => ({
    f_table_name: row.f_table_name,
    f_geometry_column: row.f_geometry_column,
    srid: row.srid,
    geom_type: row.type,
  }));
  console.log(`Tablas con geometría detectadas: ${discovered.length}`);
} else {
  try {
    discovered = (await rpc("chat_list_geom_tables")) || [];
    if (discovered.length > 0) {
      console.log(`Tablas con geometría detectadas por RPC: ${discovered.length}`);
    }
  } catch (err) {
    console.warn(`chat_list_geom_tables no accesible: ${err.message}`);
  }
}

const discoveredByTable = new Map();
for (const row of discovered) {
  discoveredByTable.set(row.f_table_name, row);
}

// ── 3. Resolver columnas reales ──────────────────────────────────
async function fetchRealColumns(physicalTable) {
  const [schema, table] = physicalTable.split(".");
  const rows = await rpc("chat_columns_for_table", {
    p_schema: schema,
    p_table: table,
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows
    .filter(
      (r) =>
        !["geom", "geometry", "the_geom", "gid", "id"].includes(
          String(r.column_name).toLowerCase()
        )
    )
    .map((r) => ({
      name: r.column_name,
      type: r.data_type,
      descripcion: null,
    }));
}

// ── 4. UPSERT en chat_catalog ────────────────────────────────────
let processed = 0;

for (const [layerId, meta] of selectedLayers) {
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

  await upsertCatalogRecord({
    layer_id: layerId,
    physical_table: physicalTable,
    display_name: meta.display_name,
    dimension: meta.dimension,
    geometry_type: disc?.geom_type || disc?.type || meta.geometry_type,
    srid: disc?.srid ? Number(disc.srid) : 4326,
    description: null,
    attributes,
    enabled: true,
  });
  processed += 1;
}

console.log(`Filas en chat_catalog procesadas: ${processed}`);

// ── 5. Refrescar stats ───────────────────────────────────────────
if (args.skipStats) {
  console.log("Stats omitidas por --skip-stats.");
} else {
  console.log("Refrescando stats (chat_refresh_stats)...");
  try {
    await rpc("chat_refresh_stats");
    console.log("Stats refrescadas.");
  } catch (err) {
    console.warn(`chat_refresh_stats falló: ${err.message}`);
    console.warn(
      "Continúa sin stats precalculadas. Las tools query_layer y " +
        "aggregate_layer funcionan igualmente; solo get_layer_stats " +
        "devuelve datos vacíos hasta que las stats se refresquen."
    );
  }
}

// ── 6. Resumen ───────────────────────────────────────────────────
try {
  const catalog = await rpc("chat_catalog");
  console.log("\nResumen:");
  console.log(
    `  Capas en chat_catalog: ${Array.isArray(catalog) ? catalog.length : "?"}`
  );
} catch {
  /* noop */
}

if (pgDriver) {
  await pgDriver.close();
}

console.log("\n✓ Hecho.");
