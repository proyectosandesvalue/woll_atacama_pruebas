/**
 * scripts/smoke-orchestrator.mjs
 *
 * Smoke test end-to-end del orquestador del chat. Lee variables de
 * entorno (SUPABASE_*, LLM_*) y simula una pregunta del usuario,
 * ejecutando el ciclo de tool-calling contra Supabase y Groq.
 *
 * Imprime la respuesta estructurada {reply, chart, geojson} sin
 * persistir nada a disco ni exponer secretos.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
 *   LLM_BASE_URL=https://api.groq.com/openai/v1 \
 *   LLM_MODEL=openai/gpt-oss-120b \
 *   LLM_API_KEY=... \
 *   node scripts/smoke-orchestrator.mjs "¿cuántas plantas desaladoras hay?"
 */

import { runOrchestrator } from "../server/chat/orchestrator.js";

const text = process.argv.slice(2).join(" ").trim();
if (!text) {
  console.error('Uso: node scripts/smoke-orchestrator.mjs "pregunta de ejemplo"');
  process.exit(2);
}

const startMs = Date.now();

try {
  const payload = await runOrchestrator({ text, history: [] });
  const dt = Date.now() - startMs;

  console.log(`\n── Respuesta del orquestador (${dt} ms) ──`);
  console.log("REPLY:");
  console.log(payload.reply);
  if (payload.chart) {
    console.log("\nCHART:");
    console.log(JSON.stringify(payload.chart, null, 2));
  }
  if (payload.geojson) {
    console.log("\nGEOJSON:");
    console.log(JSON.stringify(payload.geojson, null, 2).slice(0, 400) + "...");
  }
  process.exit(0);
} catch (err) {
  console.error("✗ Error en el orquestador:");
  console.error(`  ${err?.message || err}`);
  process.exit(1);
}
