/**
 * scripts/register_admin_layer.mjs
 *
 * Registra la capa administrativa (public.comunas_poligonos) en
 * chat.chat_catalog para que el LLM la conozca y la use en
 * aggregate_by_admin.
 *
 * Uso:
 *   node --env-file=.env scripts/register_admin_layer.mjs
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *
 * Idempotente: re-ejecutable (UPSERT vía chat_upsert_layer).
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el entorno. " +
      "Usa: node --env-file=.env scripts/register_admin_layer.mjs"
  );
  process.exit(1);
}

const baseUrl = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
const headers = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// ── Verificar que la tabla existe (vía RPC) ──────────────────────
async function tableExists(schema, table) {
  const res = await fetch(`${baseUrl}/rpc/chat_table_exists`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_schema: schema, p_table: table }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`chat_table_exists falló (${res.status}): ${text}`);
  }
  return (await res.json()) === true;
}

// ── Obtener columnas (vía RPC) ───────────────────────────────────
async function getColumns(schema, table) {
  const res = await fetch(`${baseUrl}/rpc/chat_columns_for_table`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_schema: schema, p_table: table }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`chat_columns_for_table falló (${res.status}): ${text}`);
  }
  return (await res.json()) || [];
}

// ── Upsert catálogo ──────────────────────────────────────────────
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

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const schema = "public";
  const table = "comunas_poligonos";

  console.log(`Verificando ${schema}.${table}...`);
  const exists = await tableExists(schema, table);
  if (!exists) {
    console.error(
      `\n✗ La tabla ${schema}.${table} no existe.\n` +
        `  Súbela desde QGIS (SRID 4326, columna 'geom')\n` +
        `  y vuelve a ejecutar este script.`
    );
    process.exit(1);
  }

  const cols = await getColumns(schema, table);
  const colNames = cols.map((c) => c.column_name);
  console.log(`  Columnas detectadas: ${colNames.join(", ")}`);

  const required = ["comuna", "provincia", "region", "geom"];
  const missing = required.filter(
    (r) => !colNames.some((c) => c.toLowerCase() === r.toLowerCase())
  );
  if (missing.length > 0) {
    console.error(
      `\n✗ Faltan columnas en ${schema}.${table}: ${missing.join(", ")}\n` +
        `  Columnas actuales: ${colNames.join(", ")}`
    );
    process.exit(1);
  }

  console.log(`✓ Tabla ${schema}.${table} encontrada (${cols.length} columnas).`);

  const attributes = cols
    .filter(
      (c) =>
        !["geom", "geometry", "the_geom", "gid", "id"].includes(
          c.column_name.toLowerCase()
        )
    )
    .map((c) => ({
      name: c.column_name,
      type: c.data_type,
      descripcion: null,
    }));

  const record = {
    layer_id: "comunas_poligonos",
    physical_table: `${schema}.${table}`,
    display_name: "Límites Administrativos (Comunas, Provincias, Regiones)",
    dimension: "contexto",
    geometry_type: "MULTIPOLYGON",
    srid: 4326,
    description:
      "Capa de contexto usada por aggregate_by_admin. No visible en el visor. " +
      "Columnas: comuna, provincia, region, geom.",
    attributes,
    enabled: true,
  };

  console.log(`Registrando en chat_catalog...`);
  await upsertCatalogRecord(record);
  console.log(`✓ Capa "comunas_poligonos" registrada en chat_catalog.`);

  // Verificación final
  const checkRes = await fetch(`${baseUrl}/rpc/chat_catalog`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const catalog = await checkRes.json();
  console.log(`\nResumen:`);
  console.log(
    `  Capas en chat_catalog: ${Array.isArray(catalog) ? catalog.length : "?"}`
  );
  console.log(`\n✓ Hecho.`);
}

main().catch((err) => {
  console.error("✗ Error:", err.message);
  process.exit(1);
});