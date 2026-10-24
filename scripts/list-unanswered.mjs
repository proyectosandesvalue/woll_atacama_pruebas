/**
 * scripts/list-unanswered.mjs
 *
 * Lista las preguntas que el chat no pudo responder.
 *
 * Uso:
 *   node --env-file=.env.staging scripts/list-unanswered.mjs
 *   node --env-file=.env.staging scripts/list-unanswered.mjs --reason no_data
 *   node --env-file=.env.staging scripts/list-unanswered.mjs --stats
 *   node --env-file=.env.staging scripts/list-unanswered.mjs --resolve <id> \
 *     --type data_added --note "Ingestado MeteoChile heladas"
 */

import { getDB } from "../server/db/pool.js";

const args = process.argv.slice(2);
const opts = {
  reason: null,
  stats: false,
  resolve: null,
  type: null,
  note: null,
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--reason") opts.reason = args[++i];
  else if (a === "--stats") opts.stats = true;
  else if (a === "--resolve") opts.resolve = args[++i];
  else if (a === "--type") opts.type = args[++i];
  else if (a === "--note") opts.note = args[++i];
}

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

const db = await getDB();

// ── Stats ─────────────────────────────────────────────────
if (opts.stats) {
  const stats = await db.rpc("admin_unanswered_stats");
  console.log(`${C.bold}Estadísticas:${C.reset}`);
  console.log(`  Total pendientes: ${C.cyan}${stats.total_pending}${C.reset}`);
  console.log(`  Total resueltas: ${C.cyan}${stats.total_resolved}${C.reset}`);
  console.log("");
  console.log(`${C.bold}Por motivo:${C.reset}`);
  for (const [reason, count] of Object.entries(stats.by_reason || {})) {
    console.log(`  ${C.yellow}${reason}${C.reset}: ${count}`);
  }
  console.log("");
  console.log(`${C.bold}Top 10 preguntas repetidas:${C.reset}`);
  for (const q of stats.top_questions || []) {
    console.log(`  ${C.cyan}[${q.count}x]${C.reset} ${q.question} (${q.reason})`);
  }
  process.exit(0);
}

// ── Resolve ───────────────────────────────────────────────
if (opts.resolve) {
  if (!opts.type) {
    console.error("Falta --type (data_added, recipe_created, tool_added, document_added, wont_fix)");
    process.exit(1);
  }
  await db.rpc("admin_resolve_unanswered", {
    p_id: opts.resolve,
    p_resolution_type: opts.type,
    p_resolution_note: opts.note || null,
    p_resolved_by: process.env.USER || "cli",
  });
  console.log(`${C.green}✓ Pregunta ${opts.resolve} marcada como resuelta (${opts.type})${C.reset}`);
  process.exit(0);
}

// ── List ──────────────────────────────────────────────────
const pending = await db.rpc("admin_list_unanswered", {
  p_status: "pending",
  p_reason: opts.reason || null,
  p_limit: 100,
});

if (!pending || pending.length === 0) {
  console.log(`${C.green}No hay preguntas pendientes. ✅${C.reset}`);
  process.exit(0);
}

console.log(`${C.bold}Preguntas pendientes: ${pending.length}${C.reset}`);
if (opts.reason) {
  console.log(`${C.gray}Filtro: ${opts.reason}${C.reset}`);
}
console.log("");

for (const q of pending) {
  const similar = q.count_similar > 1 ? ` ${C.yellow}[${q.count_similar}x]${C.reset}` : "";
  console.log(`${C.bold}${q.id}${C.reset}${similar}`);
  console.log(`  ${C.cyan}${q.question}${C.reset}`);
  console.log(`  ${C.gray}reason: ${q.reason}${q.reason_detail ? ` — ${q.reason_detail}` : ""}${C.reset}`);
  console.log(`  ${C.gray}creada: ${new Date(q.created_at).toLocaleString("es-CL")}${C.reset}`);
  console.log("");
}

console.log(`${C.gray}Para resolver: node --env-file=.env.staging scripts/list-unanswered.mjs --resolve <id> --type <type> --note "<nota>"${C.reset}`);