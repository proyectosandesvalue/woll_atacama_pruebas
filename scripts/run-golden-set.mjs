/**
 * scripts/run-golden-set.mjs
 *
 * Corre el golden set del chat contra el orquestador.
 *
 * Uso:
 *   node --env-file=.env.staging scripts/run-golden-set.mjs --level 1
 *   node --env-file=.env.staging scripts/run-golden-set.mjs --level 2
 *   node --env-file=.env.staging scripts/run-golden-set.mjs --all
 *   node --env-file=.env.staging scripts/run-golden-set.mjs --id smoke-bloqueo-fecha
 *   node --env-file=.env.staging scripts/run-golden-set.mjs --all --remote
 *
 * Flags:
 *   --level <n>   Solo casos con level <= n (1, 2, 3).
 *   --all         Todos los casos.
 *   --limit <n>   Limita a los primeros n casos (después del filtro).
 *   --id <id>     Un caso específico.
 *   --from-json   Fuerza el archivo server/chat/__evals__/golden.json.
 *   --include-inactive  Incluye casos con activo=false (para probarlos antes
 *                 de activarlos; no se ejecutan por defecto).
 *   --remote      Usa la URL de Vercel en lugar del orquestador local.
 *                 En modo remoto, los checks que dependen de `trace`
 *                 (tools_any, tools_count_min, geojson_filter_required,
 *                 geojson_cuenca_contains) se reportan como warning,
 *                 no como failure, porque el trace no viaja por HTTP.
 *   --url <url>   URL custom para --remote.
 *   --quiet       Solo muestra el resumen.
 *
 * Requiere que el proyecto esté configurado con las env vars del LLM.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDB } from "../server/db/pool.js";
import { loadGoldenCases } from "./lib/golden-source.mjs";

// ── Config ──────────────────────────────────────────────────
const ROOT = process.cwd();
const GOLDEN_PATH = join(ROOT, "server", "chat", "__evals__", "golden.json");
const DEFAULT_REMOTE_URL = "https://wollatacamapruebas.vercel.app/api/chat";

const args = process.argv.slice(2);
const opts = {
  level: null,
  all: false,
  id: null,
  limit: null,
  remote: false,
  fromJson: false,
  includeInactive: false,
  url: DEFAULT_REMOTE_URL,
  quiet: false,
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--level") opts.level = Number(args[++i]);
  else if (a === "--all") opts.all = true;
  else if (a === "--id") opts.id = args[++i];
  else if (a === "--limit") opts.limit = Number(args[++i]);
  else if (a === "--remote") opts.remote = true;
  else if (a === "--from-json") opts.fromJson = true;
  else if (a === "--include-inactive") opts.includeInactive = true;
  else if (a === "--url") opts.url = args[++i];
  else if (a === "--quiet") opts.quiet = true;
}

if (!opts.level && !opts.all && !opts.id) {
  console.error("Falta --level <n>, --all o --id <id>");
  process.exit(2);
}

// ── Colores ANSI ────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

const log = (...a) => {
  if (!opts.quiet) console.log(...a);
};

// ── Cargar golden set ───────────────────────────────────────
const golden = await loadGoldenCases({
  fromJson: opts.fromJson,
  getDB,
  readFile,
  goldenPath: GOLDEN_PATH,
});
const allCases = golden.cases;
const inactiveCount = allCases.filter((c) => c.activo === false).length;
let cases = opts.includeInactive
  ? allCases
  : allCases.filter((c) => c.activo !== false);
if (!opts.quiet) {
  console.log(`Golden set: ${golden.source === "db" ? "admin.golden_cases" : "golden.json"}`);
  if (inactiveCount > 0) {
    console.log(
      `Casos inactivos: ${inactiveCount} (no se ejecutan; usa --include-inactive para probarlos).`
    );
  }
}

if (opts.id) {
  cases = cases.filter((c) => c.id === opts.id);
} else if (opts.level) {
  cases = cases.filter((c) => c.level <= opts.level);
} else if (opts.all) {
  // Todos.
}

if (opts.limit && Number.isFinite(opts.limit) && opts.limit > 0) {
  cases = cases.slice(0, opts.limit);
}

if (cases.length === 0) {
  console.error("No hay casos para los filtros especificados.");
  process.exit(2);
}

// ── Configuración de la corrida (para reproducir) ──────────
const LLM_MODEL = process.env.LLM_MODEL || "(no configurado)";
const FLAGS = {
  CHAT_ROUTER_ENABLED:
    process.env.CHAT_ROUTER_ENABLED || "(default 0)",
  CHAT_ROUTER_MIN_CONFIDENCE:
    process.env.CHAT_ROUTER_MIN_CONFIDENCE || "(default 0.7)",
  CHAT_UNAVAILABLE_ENABLED:
    process.env.CHAT_UNAVAILABLE_ENABLED || "(default 0)",
  CHAT_GEOJSON_ENABLED:
    process.env.CHAT_GEOJSON_ENABLED || "(default 1)",
  CHAT_VERBOSE: process.env.CHAT_VERBOSE || "(default 0)",
};

let promptVersions = "(no disponible)";
try {
  const { getDB } = await import("../server/db/pool.js");
  const db = await getDB();
  const sys = await db.rpc("chat_get_prompt", { p_id: "chat.system" });
  const cls = await db.rpc("chat_get_prompt", { p_id: "chat.classifier" });
  promptVersions =
    `chat.system ${sys ? sys.length + " chars" : "NO EXISTE"}, ` +
    `chat.classifier ${cls ? cls.length + " chars" : "NO EXISTE"}`;
} catch (err) {
  promptVersions = `(no se pudo leer la BD: ${err?.message || err})`;
}

// ── Header de la corrida ───────────────────────────────────
log(`${C.bold}Golden set: ${cases.length} caso(s)${C.reset}`);
log(`${C.gray}Modo: ${opts.remote ? "remoto" : "local"}${C.reset}`);
log(`${C.gray}Modelo: ${LLM_MODEL}${C.reset}`);
log(
  `${C.gray}Flags: ${Object.entries(FLAGS)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")}${C.reset}`
);
log(`${C.gray}Prompts: ${promptVersions}${C.reset}`);
if (opts.remote) {
  log(
    `${C.gray}Nota: en modo remoto, los checks de trace se reportan como warning.${C.reset}`
  );
}
log("");

// ── Llamar al chat ──────────────────────────────────────────
async function callChat(question, history = [], caseId = null) {
  const sessionId = `golden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Resetear caché del clasificador, del LLM y del system prompt.
  // En modo remoto no aplica (el server es otro proceso), pero no molesta.
  if (!opts.remote) {
    try {
      const { _resetDomainClassifier } = await import(
        "../server/chat/domain-classifier.js"
      );
      _resetDomainClassifier();
    } catch {}

    try {
      const { _resetLLM } = await import("../server/llm/provider.js");
      _resetLLM();
    } catch {}

    try {
      const { _resetSystemPrompt } = await import(
        "../server/chat/orchestrator.js"
      );
      _resetSystemPrompt();
    } catch {}

    try {
      const { _resetPromptCache } = await import(
        "../server/chat/prompts.js"
      );
      _resetPromptCache();
    } catch {}

    try {
      const { _resetClassifierPromptCache } = await import(
        "../server/chat/domain-classifier.js"
      );
      _resetClassifierPromptCache();
    } catch {}
  }

  if (opts.remote) {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: question, history, sessionId }),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  // Local: usar el mismo handler que /api/chat.
  try {
    const { handleChat } = await import("../server/handlers/chat.js");
    const result = await handleChat(
      { text: question, history, sessionId },
      {
        ip: "127.0.0.1",
        country: "CL",
        skipRateLimit: true,
        includeTrace: true,
        skipUnansweredLog: true,
        timingLabel: caseId,
      }
    );
    return { status: result.status, data: result.body };
  } catch (err) {
    return { status: 0, data: { error: err?.message || String(err) } };
  }
}

// ── Verificar un caso ───────────────────────────────────────
function verifyCase(c, response) {
  const failures = [];
  const warnings = [];

  const { status, data } = response;
  const exp = c.expected || {};
  const trace = Array.isArray(data?.trace) ? data.trace : [];
  const isRemote = opts.remote;

  // 1. Bloqueo esperado.
  if (exp.blocked === true) {
    if (
      status !== 403 &&
      !/no puedo responder/i.test(data?.error || data?.reply || "")
    ) {
      failures.push(`Esperaba bloqueo (403), recibió status=${status}`);
    }
    if (exp.reply_must_contain) {
      const text = String(data?.error || data?.reply || "").toLowerCase();
      for (const t of exp.reply_must_contain) {
        if (!text.includes(t.toLowerCase())) {
          failures.push(`reply debe contener "${t}"`);
        }
      }
    }
    return { ok: failures.length === 0, failures, warnings };
  }

  // 2. Caso normal: esperamos 200.
  if (status !== 200) {
    failures.push(`Esperaba 200, recibió ${status}: ${data?.error || ""}`);
    return { ok: false, failures, warnings };
  }

  // 2.1. Citas y abstención documental (Sprint 18-D).
  const citations = Array.isArray(data?.citations) ? data.citations : [];
  const citationTypes = new Set(
    citations.map((c) =>
      c?.type || (c?.document_slug ? "document" : c?.layer_id ? "layer" : "otro")
    )
  );

  if (exp.sources_any) {
    for (const source of exp.sources_any) {
      if (!citationTypes.has(source)) {
        failures.push(
          `sources_any esperaba "${source}", citations=[${Array.from(citationTypes).join(", ")}]`
        );
      }
    }
  }

  if (exp.citation_required === true && citations.length === 0) {
    failures.push("citation_required=true pero no hay citations");
  }

  const replyLower = String(data?.reply || "").toLowerCase();
  const abstained =
    /no (?:he |se )?(?:encontr|teng|hay|exist|dispon|cuent|pud)|sin (?:datos|evidencia|información|informacion)/.test(
      replyLower
    );
  if ((exp.abstain === true || exp.expected_abstain === true) && !abstained) {
    failures.push("se esperaba abstención y el reply no la declara");
  }
  if (exp.expected_abstain === false && abstained && citations.length === 0) {
    failures.push("expected_abstain=false pero el reply se abstiene");
  }

  // 3. tools_any.
  if (exp.tools_any) {
    if (isRemote) {
      warnings.push(
        `tools_any: no verificable en modo remoto (falta trace en el payload HTTP)`
      );
    } else {
      const called = new Set(trace.map((t) => t.tool));
      const anyMatch = exp.tools_any.some((t) => called.has(t));
      if (!anyMatch) {
        failures.push(
          `tools_any esperaba alguna de [${exp.tools_any.join(", ")}], se llamó [${Array.from(called).join(", ")}]`
        );
      }
    }
  }

  // 4. tools_count_min.
  if (exp.tools_count_min != null) {
    if (isRemote) {
      warnings.push(`tools_count_min: no verificable en modo remoto`);
    } else if (trace.length < exp.tools_count_min) {
      failures.push(
        `tools_count_min=${exp.tools_count_min}, se llamó ${trace.length} tool(s)`
      );
    }
  }

  // 5. geojson required.
  const hasGeojson =
    Boolean(data?.geojson) || Boolean(data?.geojson_layers?.length);
  if (exp.geojson_required === true && !hasGeojson) {
    failures.push(`geojson_required=true pero no hay geojson`);
  }
  if (exp.geojson_required === false && hasGeojson) {
    warnings.push(`geojson presente pero expected=false (no crítico)`);
  }

  // 6. geojson_filter_required.
  if (exp.geojson_filter_required) {
    if (isRemote) {
      warnings.push(`geojson_filter_required: no verificable en modo remoto`);
    } else {
      const filters = exp.geojson_filter_required;
      const hasFilter = trace.some((t) => {
        if (!t.ok) return false;
        const args = t.args || {};
        const argFilters = args.filters || args.where || {};
        if (Array.isArray(argFilters)) {
          return Object.entries(filters).every(([k, v]) =>
            argFilters.some(
              (f) =>
                String(f.field || "").toLowerCase() === k.toLowerCase() &&
                String(f.value || f.values?.[0] || "").toLowerCase() ===
                  String(v).toLowerCase()
            )
          );
        }
        return Object.entries(filters).every(
          ([k, v]) =>
            String(argFilters[k] || "").toLowerCase() === String(v).toLowerCase()
        );
      });
      if (!hasFilter) {
        failures.push(
          `geojson_filter_required=${JSON.stringify(filters)} no se encontró en los args de las tools`
        );
      }
    }
  }

  // 7. geojson_cuenca_contains.
  if (exp.geojson_cuenca_contains) {
    if (isRemote) {
      warnings.push(`geojson_cuenca_contains: no verificable en modo remoto`);
    } else {
      const needle = String(exp.geojson_cuenca_contains).toLowerCase();

      const hasCuencaInArgs = trace.some((t) => {
        const args = t.args || {};
        const argFilters = args.filters || args.where || {};
        const values = Array.isArray(argFilters)
          ? argFilters.flatMap((f) => [f.value, ...(f.values || [])])
          : Object.values(argFilters);
        return values.some((v) =>
          String(v || "").toLowerCase().includes(needle)
        );
      });

      const reply = String(data?.reply || "").toLowerCase();
      const hasCuencaInReply =
        reply.includes(needle) ||
        reply.includes("cuenca") ||
        reply.includes("copiapo");

      if (!hasCuencaInArgs && !hasCuencaInReply) {
        failures.push(
          `geojson_cuenca_contains="${exp.geojson_cuenca_contains}" no se encontró en los filtros ni en el reply`
        );
      } else if (!hasCuencaInArgs) {
        warnings.push(
          `geojson_cuenca_contains="${exp.geojson_cuenca_contains}" está en el reply pero no en los args (no determinismo)`
        );
      }
    }
  }

  // 8. geojson_meta_truncated_expected.
  if (exp.geojson_meta_truncated_expected === true) {
    const truncated = data?.geojson_meta?.truncated === true;
    if (!truncated) {
      failures.push(
        `geojson_meta_truncated_expected=true pero truncated no es true`
      );
    }
  }

  // 9. graceful_error.
  if (exp.graceful_error === true) {
    if (status !== 200) {
      failures.push(`graceful_error=true pero status=${status}`);
    }
    const reply = String(data?.reply || "").toLowerCase();
    if (reply.includes("no puedo responder esa pregunta")) {
      failures.push(
        `graceful_error=true pero el reply bloquea con "no puedo responder"`
      );
    }
  }

  // 10. charts_count.
  const chartsCount = Array.isArray(data?.charts)
    ? data.charts.length
    : data?.chart
      ? 1
      : 0;
  if (exp.charts_count_min != null && chartsCount < exp.charts_count_min) {
    failures.push(`charts_count=${chartsCount} < min=${exp.charts_count_min}`);
  }
  if (exp.charts_count_max != null && chartsCount > exp.charts_count_max) {
    failures.push(`charts_count=${chartsCount} > max=${exp.charts_count_max}`);
  }

  // 11. reply_must_contain.
  if (exp.reply_must_contain) {
    const text = String(data?.reply || "").toLowerCase();
    for (const t of exp.reply_must_contain) {
      if (!text.includes(t.toLowerCase())) {
        failures.push(`reply debe contener "${t}"`);
      }
    }
  }

  // 12. reply_must_not_contain.
  if (exp.reply_must_not_contain) {
    const text = String(data?.reply || "").toLowerCase();
    for (const t of exp.reply_must_not_contain) {
      if (text.includes(t.toLowerCase())) {
        failures.push(`reply NO debe contener "${t}"`);
      }
    }
  }

  // 13. reply_must_not_match (regex).
  if (exp.reply_must_not_match) {
    const text = String(data?.reply || "");
    for (const pattern of exp.reply_must_not_match) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(text)) {
          failures.push(`reply NO debe matchear /${pattern}/`);
        }
      } catch (err) {
        warnings.push(`regex inválido: ${pattern}`);
      }
    }
  }

  // 14. geojson_meta_style_hint_required.
  if (exp.geojson_meta_style_hint_required === true) {
    const hint = data?.geojson_meta?.style_hint;
    const layersWithHint = (data?.geojson_layers || []).some(
      (l) => l?.style_hint
    );
    if (!hint && !layersWithHint) {
      failures.push(`style_hint requerido pero ausente`);
    }
  }

  // 15. style_hint_attribute_any.
  if (exp.style_hint_attribute_any) {
    const hints = [];
    if (data?.geojson_meta?.style_hint) hints.push(data.geojson_meta.style_hint);
    for (const l of data?.geojson_layers || []) {
      if (l?.style_hint) hints.push(l.style_hint);
    }
    const attrs = hints.map((h) => String(h.attribute || "").toLowerCase());
    const anyMatch = exp.style_hint_attribute_any.some((a) =>
      attrs.includes(a.toLowerCase())
    );
    if (!anyMatch) {
      failures.push(
        `style_hint.attribute esperaba alguno de [${exp.style_hint_attribute_any.join(", ")}], recibió [${attrs.join(", ")}]`
      );
    }
  }

  // 16. notice_required.
  if (exp.notice_required === true && !data?.notice) {
    failures.push(`notice requerido pero ausente`);
  }

  return { ok: failures.length === 0, failures, warnings };
}

// ── Correr todos los casos ──────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];
const caseTimings = [];

for (const c of cases) {
  log(`${C.bold}[${c.level}] ${c.id}${C.reset}`);
  log(`${C.gray}Q: ${c.question}${C.reset}`);

  let response;
  const caseStarted = Date.now();
  try {
    response = await callChat(c.question, c.history || [], c.id);
  } catch (err) {
    response = { status: 0, data: { error: err?.message || String(err) } };
  }
  const caseMs = Date.now() - caseStarted;
  caseTimings.push({ id: c.id, ms: caseMs, status: response.status });

  const result = verifyCase(c, response);

  if (result.ok) {
    passed++;
    log(`${C.green}✓ PASS${C.reset} (status ${response.status}, ${caseMs} ms)`);
  } else {
    failed++;
    failures.push({ case: c, result, response });
    log(`${C.red}✗ FAIL${C.reset} (status ${response.status}, ${caseMs} ms)`);
    for (const f of result.failures) {
      log(`  ${C.red}• ${f}${C.reset}`);
    }
  }

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      log(`  ${C.yellow}⚠ ${w}${C.reset}`);
    }
  }
  log("");
}

// ── Resumen ─────────────────────────────────────────────────
log(`${C.bold}═══════════════════════════════════════════${C.reset}`);
log(`${C.bold}Resumen${C.reset}`);
log(`${C.green}✓ ${passed} pasaron${C.reset}`);
if (failed > 0) {
  log(`${C.red}✗ ${failed} fallaron${C.reset}`);
}
if (caseTimings.length > 0) {
  const sorted = caseTimings.map((t) => t.ms).sort((a, b) => a - b);
  const percentile = (p) => {
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
    );
    return sorted[index];
  };
  const mean = Math.round(
    sorted.reduce((acc, ms) => acc + ms, 0) / sorted.length
  );
  log(
    `${C.gray}Latencia: p50=${percentile(50)} ms, p95=${percentile(95)} ms, ` +
      `mean=${mean} ms (n=${sorted.length})${C.reset}`
  );
}
log("");

// Reporte por categoría
const byCategory = {};
for (const c of cases) {
  byCategory[c.category] = (byCategory[c.category] || 0) + 1;
}
log(`${C.bold}Por categoría:${C.reset}`);
for (const [cat, count] of Object.entries(byCategory).sort()) {
  log(`  ${cat}: ${count}`);
}
log("");

// Reporte por tier (si existe)
const byTier = {};
for (const c of cases) {
  if (c.tier) byTier[c.tier] = (byTier[c.tier] || 0) + 1;
}
if (Object.keys(byTier).length > 0) {
  log(`${C.bold}Por tier:${C.reset}`);
  for (const [tier, count] of Object.entries(byTier).sort()) {
    log(`  Tier ${tier}: ${count}`);
  }
  log("");
}

// Reporte por ruta (Sprint 18-A)
const failedIds = new Set(failures.map((f) => f.case.id));
const byRoute = {};
for (const c of cases) {
  const route = c.route || "sin_ruta";
  if (!byRoute[route]) byRoute[route] = { total: 0, passed: 0, failed: 0 };
  byRoute[route].total += 1;
  if (failedIds.has(c.id)) byRoute[route].failed += 1;
  else byRoute[route].passed += 1;
}
if (Object.keys(byRoute).length > 0) {
  log(`${C.bold}Por ruta:${C.reset}`);
  for (const [route, stats] of Object.entries(byRoute).sort()) {
    log(`  ${route}: ${stats.passed}/${stats.total} (${stats.failed} fallos)`);
  }
  log("");
}

// ── Fallos ─────────────────────────────────────────────────
if (failed > 0) {
  log(`${C.bold}Fallos:${C.reset}`);
  for (const f of failures) {
    log(`- ${f.case.id}`);
    for (const msg of f.result.failures) {
      log(`    ${msg}`);
    }
  }
  log("");
}

// ── Configuración de la corrida (para reproducir) ──────────
// (Movido ANTES de process.exit para que se imprima siempre.)
log(`${C.bold}Configuración de la corrida:${C.reset}`);
log(`  Modelo: ${LLM_MODEL}`);
for (const [k, v] of Object.entries(FLAGS)) {
  log(`  ${k}=${v}`);
}
log(`  Prompts: ${promptVersions}`);
log("");

process.exit(failed > 0 ? 1 : 0);