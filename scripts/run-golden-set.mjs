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
 *
 * Flags:
 *   --level <n>   Solo casos con level <= n (1, 2, 3).
 *   --all         Todos los casos.
 *   --id <id>     Un caso específico.
 *   --remote      Usa la URL de Vercel en lugar del orquestador local.
 *   --url <url>   URL custom para --remote.
 *   --quiet       Solo muestra el resumen.
 *
 * Requiere que el proyecto esté configurado con las env vars del LLM.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ── Config ──────────────────────────────────────────────────
const ROOT = process.cwd();
const GOLDEN_PATH = join(ROOT, "server", "chat", "__evals__", "golden.json");
const DEFAULT_REMOTE_URL = "https://wollatacamapruebas.vercel.app/api/chat";

const args = process.argv.slice(2);
const opts = {
  level: null,
  all: false,
  id: null,
  remote: false,
  url: DEFAULT_REMOTE_URL,
  quiet: false,
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--level") opts.level = Number(args[++i]);
  else if (a === "--all") opts.all = true;
  else if (a === "--id") opts.id = args[++i];
  else if (a === "--remote") opts.remote = true;
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
const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8"));
let cases = golden.cases;

if (opts.id) {
  cases = cases.filter((c) => c.id === opts.id);
} else if (opts.level) {
  cases = cases.filter((c) => c.level <= opts.level);
} else if (opts.all) {
  // Todos.
}

if (cases.length === 0) {
  console.error("No hay casos para los filtros especificados.");
  process.exit(2);
}

log(`${C.bold}Golden set: ${cases.length} caso(s)${C.reset}`);
log(`${C.gray}Modo: ${opts.remote ? "remoto" : "local"}${C.reset}`);
log("");

// ── Llamar al chat ──────────────────────────────────────────
async function callChat(question, history = []) {
  const sessionId = `golden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (opts.remote) {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: question, history, sessionId }),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  // Local: simula el pipeline completo de /api/chat.
  // 1. Clasificador de dominio.
  try {
    const { classifyDomain } = await import("../server/chat/domain-classifier.js");
    const domain = await classifyDomain(question, sessionId);
    if (domain === "OUT") {
      return {
        status: 403,
        data: {
          error:
            "No puedo responder esa pregunta. Soy un asistente especializado " +
            "en el Visor Territorial de Atacama y solo puedo ayudarte con " +
            "consultas sobre los datos geoespaciales del portal.",
        },
      };
    }
  } catch (err) {
    // Fail-open: si el clasificador falla, seguimos.
    console.warn(`[golden] Clasificador falló, continúo: ${err?.message || err}`);
  }

  // 2. Orquestador.
  const { runOrchestrator } = await import("../server/chat/orchestrator.js");
  try {
    const data = await runOrchestrator({ text: question, history, sessionId });
    return { status: 200, data };
  } catch (err) {
    return { status: 500, data: { error: err?.message || String(err) } };
  }
}

// ── Verificar un caso ───────────────────────────────────────
function verifyCase(c, response) {
  const failures = [];
  const warnings = [];

  const { status, data } = response;
  const exp = c.expected || {};

  // 1. Bloqueo esperado.
  if (exp.blocked === true) {
    if (status !== 403 && !/no puedo responder/i.test(data?.error || data?.reply || "")) {
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

  // 3. geojson required.
  const hasGeojson = Boolean(data?.geojson) || Boolean(data?.geojson_layers?.length);
  if (exp.geojson_required === true && !hasGeojson) {
    failures.push(`geojson_required=true pero no hay geojson`);
  }
  if (exp.geojson_required === false && hasGeojson) {
    warnings.push(`geojson presente pero expected=false (no crítico)`);
  }

  // 4. charts_count.
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

  // 5. reply_must_contain.
  if (exp.reply_must_contain) {
    const text = String(data?.reply || "").toLowerCase();
    for (const t of exp.reply_must_contain) {
      if (!text.includes(t.toLowerCase())) {
        failures.push(`reply debe contener "${t}"`);
      }
    }
  }

  // 6. reply_must_not_contain.
  if (exp.reply_must_not_contain) {
    const text = String(data?.reply || "").toLowerCase();
    for (const t of exp.reply_must_not_contain) {
      if (text.includes(t.toLowerCase())) {
        failures.push(`reply NO debe contener "${t}"`);
      }
    }
  }

  // 7. geojson_meta_style_hint_required.
  if (exp.geojson_meta_style_hint_required === true) {
    const hint = data?.geojson_meta?.style_hint;
    const layersWithHint = (data?.geojson_layers || []).some(
      (l) => l?.style_hint
    );
    if (!hint && !layersWithHint) {
      failures.push(`style_hint requerido pero ausente`);
    }
  }

  // 8. style_hint_attribute_any.
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

  // 9. notice_required.
  if (exp.notice_required === true && !data?.notice) {
    failures.push(`notice requerido pero ausente`);
  }

  // 10. tools_count_min (no podemos ver tools desde el payload, pero podemos contar tool calls via debug).
  // Skipped por ahora.

  return { ok: failures.length === 0, failures, warnings };
}

// ── Correr todos los casos ──────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

for (const c of cases) {
  log(`${C.bold}[${c.level}] ${c.id}${C.reset}`);
  log(`${C.gray}Q: ${c.question}${C.reset}`);

  let response;
  try {
    response = await callChat(c.question, c.history || []);
  } catch (err) {
    response = { status: 0, data: { error: err?.message || String(err) } };
  }

  const result = verifyCase(c, response);

  if (result.ok) {
    passed++;
    log(`${C.green}✓ PASS${C.reset} (status ${response.status})`);
  } else {
    failed++;
    failures.push({ case: c, result, response });
    log(`${C.red}✗ FAIL${C.reset} (status ${response.status})`);
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
log("");

if (failed > 0) {
  log(`${C.bold}Fallos:${C.reset}`);
  for (const f of failures) {
    log(`- ${f.case.id}`);
    for (const msg of f.result.failures) {
      log(`    ${msg}`);
    }
  }
  process.exit(1);
}

process.exit(0);