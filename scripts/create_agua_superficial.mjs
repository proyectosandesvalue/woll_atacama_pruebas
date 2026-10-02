/**
 * scripts/create_agua_superficial.mjs
 *
 * Crea (o recrea) la tabla `public.agua_superficial` como UNION de las
 * capas de los grupos temáticos:
 *
 *   - agua.grupos.hidrografia.capas  → "Hidrografía y Cuerpos de Agua Superficial"
 *   - agua.grupos.reservas.capas     → "Reservas de Agua"
 *
 * Excluye `acuiferos` (está en Reservas pero no es agua superficial).
 *
 * Resultado esperado (según config actual):
 *   hidrografia, lagunas_embalses, salares, humedales, glaciares
 *
 * Registra `agua_superficial` en chat_catalog como capa "contexto"
 * (no visible en el visor, solo para uso del chat IA).
 *
 * Uso:
 *   node --env-file=.env scripts/create_agua_superficial.mjs
 *
 * Requisitos:
 *   - Las capas fuente deben estar subidas a Supabase.
 *   - 006_spatial_tools_2.sql aplicado (crea chat_create_union_layer).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── Config ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY.");
  process.exit(1);
}

const baseUrl = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
const headers = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// ── Configuración de la capa unificada ────────────────────────────
// Se derivan las capas fuente desde allTemasConfig.js, combinando los
// grupos indicados y excluyendo las capas declaradas como no-superficiales.

const TARGET_LAYER_ID = "agua_superficial";
const DIMENSION = "agua";
const INCLUDE_GROUPS = ["hidrografia", "reservas"];
const EXCLUDE_LAYERS = ["acuiferos"]; // Reservas incluye acuíferos, no son agua superficial

// ── Resolución de capas desde allTemasConfig.js ───────────────────
async function resolveSourceLayers() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const configPath = join(__dirname, "..", "js", "config", "allTemasConfig.js");

  const mod = await import(configPath);
  const allTemasConfig = mod.default ?? mod.allTemasConfig ?? {};
  const tema = allTemasConfig[DIMENSION];

  if (!tema || !tema.grupos) {
    throw new Error(`Dimensión "${DIMENSION}" no encontrada o sin grupos en allTemasConfig.js`);
  }

  const capas = new Set();
  for (const grupoKey of INCLUDE_GROUPS) {
    const grupo = tema.grupos[grupoKey];
    if (!grupo) {
      console.warn(`  ⚠ Grupo "${grupoKey}" no existe en ${DIMENSION}. Se omite.`);
      continue;
    }
    (grupo.capas || []).forEach((c) => capas.add(c));
  }

  const filtered = Array.from(capas).filter((c) => !EXCLUDE_LAYERS.includes(c));

  console.log(`Capas fuente resueltas (grupos: ${INCLUDE_GROUPS.join(", ")}):`);
  filtered.forEach((c) => console.log(`  - ${c}`));

  return filtered;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const sourceLayers = await resolveSourceLayers();

  if (sourceLayers.length === 0) {
    console.error("✗ No hay capas fuente para unificar.");
    process.exit(1);
  }

  console.log(`\nConstruyendo capa unificada "${TARGET_LAYER_ID}"...`);

  // 1. Ejecutar la RPC que crea la tabla
  const res = await fetch(`${baseUrl}/rpc/chat_create_union_layer`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_target_layer_id: TARGET_LAYER_ID,
      p_source_layer_ids: sourceLayers,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`✗ chat_create_union_layer falló (${res.status}): ${text}`);
    console.error("  ¿Ejecutaste 006_spatial_tools_2.sql?");
    process.exit(1);
  }

  const result = await res.json();
  console.log(`✓ Tabla creada: ${result.table}`);
  console.log(`  Total features: ${result.total_features}`);
  console.log(`  Capas incluidas: ${(result.source_layers || []).join(", ")}`);
  if (result.skipped_layers && result.skipped_layers.length > 0) {
    console.log(`  Capas omitidas (no encontradas): ${result.skipped_layers.join(", ")}`);
  }

  // 2. Registrar en chat_catalog
  const catalogRes = await fetch(`${baseUrl}/rpc/chat_upsert_layer`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_layer_id: TARGET_LAYER_ID,
      p_physical_table: `public.${TARGET_LAYER_ID}`,
      p_display_name: "Agua Superficial (unificada)",
      p_dimension: "contexto",
      p_geometry_type: "GEOMETRY",
      p_srid: 4326,
      p_description:
        "Capa de contexto: unión de hidrografía, lagunas/embalses, salares, " +
        "humedales y glaciares. No visible en el visor. Útil para análisis " +
        "de proximidad a fuentes de agua superficial.",
      p_attributes: JSON.stringify([
        { name: "source_layer", type: "text", descripcion: "Capa de origen" },
      ]),
      p_enabled: true,
    }),
  });

  if (!catalogRes.ok) {
    const text = await catalogRes.text().catch(() => "");
    console.error(`✗ UPSERT catálogo falló (${catalogRes.status}): ${text}`);
    process.exit(1);
  }

  console.log(`✓ Capa "${TARGET_LAYER_ID}" registrada en chat_catalog.`);

  // 3. Refrescar stats para que aparezca en get_layer_stats
  try {
    await fetch(`${baseUrl}/rpc/chat_refresh_stats`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    console.log(`✓ Stats refrescadas.`);
  } catch {
    /* opcional */
  }

  console.log(`\n✓ Hecho.`);
}

main().catch((err) => {
  console.error("✗ Error:", err.message);
  process.exit(1);
});