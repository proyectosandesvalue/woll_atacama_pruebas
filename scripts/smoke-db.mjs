/**
 * scripts/smoke-db.mjs
 *
 * Smoke test del driver de base de datos. Lee SUPABASE_URL y
 * SUPABASE_SERVICE_KEY de las variables de entorno (no las imprime, no
 * las persiste en disco), prueba la conexión con la RPC `chat_catalog()`,
 * y termina.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/smoke-db.mjs
 *
 * Imprime el número de capas del catálogo o el detalle del error.
 * Sale con código 0 si todo OK, != 0 si falla.
 */

import { getDB } from "../server/db/pool.js";

const startMs = Date.now();

try {
  const db = await getDB();
  const catalog = await db.rpc("chat_catalog");
  const n = Array.isArray(catalog) ? catalog.length : 0;
  const dt = Date.now() - startMs;
  console.log(`✓ chat_catalog() OK: ${n} capas (${dt} ms)`);
  process.exit(0);
} catch (err) {
  console.error("✗ Error de conexión al driver de BD:");
  console.error(`  ${err?.message || err}`);
  process.exit(1);
}
