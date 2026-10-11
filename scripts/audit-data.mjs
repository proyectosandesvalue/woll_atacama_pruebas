/**
 * scripts/audit-data.mjs
 *
 * Auditoría de calidad de datos por capa.
 *
 * Uso:
 *   node --env-file=.env.staging scripts/audit-data.mjs
 *   node --env-file=.env.staging scripts/audit-data.mjs --layer glaciares --layer humedales
 *
 * Opciones:
 *   --layer <id>     Audita solo esa capa (repetible).
 *   --timeout <ms>   Timeout por llamada RPC (default 20000).
 *   --out <dir>      Carpeta de reportes (default reports/).
 *   --no-save        No persiste en la BD (solo genera reportes).
 *   --strict         Sale con código 1 si alguna capa queda `blocked`.
 *   --trigger <txt>  Etiqueta de la corrida (default "manual").
 *
 * Salida: reports/audit-data.json y reports/audit-data.md
 * Una capa o columna que falla NO aborta la corrida.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { getDB } from "../server/db/pool.js";
import { withTimeout } from "../server/chat/tools/_helpers.js";
import { THRESHOLDS } from "../server/audit/thresholds.js";
import {
  classifyColumn, classifyLayer, checkConfigCoherence,
  computeProvenance, isAuditableColumn, normalizeName,
} from "../server/audit/classify.js";

// ── Argumentos ──────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { layers: [], timeout: 20000, out: "reports", save: true, strict: false, trigger: "manual" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--layer") o.layers.push(argv[++i]);
    else if (a === "--timeout") o.timeout = Number(argv[++i]) || o.timeout;
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--trigger") o.trigger = argv[++i];
    else if (a === "--no-save") o.save = false;
    else if (a === "--strict") o.strict = true;
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config del visor: layer_id → [estilo, ...] ──────────────────
async function loadStyleConfigs() {
  const mod = await import(join(__dirname, "..", "js", "config", "allTemasConfig.js"));
  const all = mod.default ?? {};
  const map = new Map();
  for (const tema of Object.values(all)) {
    for (const [capa, estilo] of Object.entries(tema?.estilo ?? {})) {
      if (!map.has(capa)) map.set(capa, []);
      map.get(capa).push(estilo);
    }
  }
  return map;
}

const rpc = (db, name, params) => withTimeout(db.rpc(name, params), opts.timeout);

// ── Auditoría de una capa ───────────────────────────────────────
async function auditLayer(db, layerId, styleMap) {
  const exceptions = THRESHOLDS.perLayer[layerId] ?? {};
  const ignore = new Set((exceptions.ignore_columns ?? []).map(normalizeName));
  const sparse = new Set((exceptions.expected_sparse ?? []).map(normalizeName));

  const catalogRow = await rpc(db, "chat_columns_for_table", { p_schema: "public", p_table: layerId });
  const tableColumns = (Array.isArray(catalogRow) ? catalogRow : [])
    .map((c) => c.column_name)
    .filter(Boolean);

  const columns = [];
  for (const name of tableColumns.filter(isAuditableColumn)) {
    if (ignore.has(normalizeName(name))) continue;
    let facts;
    try {
      facts = await rpc(db, "chat_audit_column", { p_layer: layerId, p_column: name });
    } catch (err) {
      console.error(`  ✗ ${layerId}.${name}: ${err?.message || err}`);
      facts = { column_name: name, error: String(err?.message || err).slice(0, 200) };
    }
    const verdict = classifyColumn(facts, { expectedSparse: sparse.has(normalizeName(name)) });
    columns.push({ ...facts, column_name: name, ...verdict });
  }

  let geometry = null;
  try {
    geometry = await rpc(db, "chat_audit_geometry", {
      p_layer: layerId, p_bbox: THRESHOLDS.atacamaBbox,
    });
  } catch (err) {
    console.error(`  ✗ ${layerId} geometría: ${err?.message || err}`);
  }

  const configIssues = checkConfigCoherence(styleMap.get(layerId) ?? [], tableColumns);
  const provenance = computeProvenance(columns);
  const rowCount = columns.find((c) => c.row_count != null)?.row_count ?? geometry?.total ?? 0;
  const { status, warnings } = classifyLayer({
    rowCount, geometry, columns, configIssues, provenance,
  });

  return {
    layer_id: layerId,
    row_count: Number(rowCount),
    geometry, columns,
    config_issues: configIssues,
    provenance, flags: provenance.flags,
    status, warnings,
  };
}

// ── Reporte Markdown ────────────────────────────────────────────
function renderMarkdown(run, results) {
  const count = (s) => results.filter((r) => r.status === s).length;
  const L = [];
  L.push(`# Auditoría de calidad de datos`);
  L.push(``);
  L.push(`- Fecha: ${run.finished_at}`);
  L.push(`- Umbrales: ${run.thresholds_version}`);
  L.push(`- Capas: ${results.length} (ok ${count("ok")}, warning ${count("warning")}, blocked ${count("blocked")})`);
  L.push(``);
  L.push(`| Capa | Estado | Filas | Cols problemáticas | Config | Procedencia |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const r of results) {
    const bad = r.columns.filter((c) => ["dirty", "broken", "error"].includes(c.quality)).length;
    L.push(`| ${r.layer_id} | ${r.status} | ${r.row_count} | ${bad} | ${r.config_issues.length} | ${r.flags.join(", ") || "—"} |`);
  }
  for (const r of results.filter((x) => x.status !== "ok")) {
    L.push(``);
    L.push(`## ${r.layer_id} — ${r.status}`);
    for (const w of r.warnings) L.push(`- ${w.code}${w.detail ? `: ${w.detail}` : ""}`);
    const bad = r.columns.filter((c) => ["dirty", "broken", "error", "has_nulls"].includes(c.quality));
    if (bad.length) {
      L.push(``);
      L.push(`| Columna | Calidad | % nulos | % sospechosos | Flags |`);
      L.push(`|---|---|---|---|---|`);
      for (const c of bad) {
        L.push(`| ${c.column_name} | ${c.quality} | ${c.null_pct} | ${c.suspicious_pct} | ${(c.flags ?? []).join(", ")} |`);
      }
    }
    if (r.config_issues.length) {
      L.push(``);
      L.push(`Config inconsistente:`);
      for (const i of r.config_issues) L.push(`- ${i.type}: \`${i.field}\``);
    }
  }
  return L.join("\n") + "\n";
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const db = await getDB();
  const styleMap = await loadStyleConfigs();

  const catalog = (await db.rpc("chat_catalog_all")) ?? [];
  let layerIds = catalog.map((c) => c.layer_id);
  if (opts.layers.length) {
    const wanted = new Set(opts.layers);
    layerIds = layerIds.filter((id) => wanted.has(id));
    const missing = opts.layers.filter((id) => !layerIds.includes(id));
    if (missing.length) console.warn(`Capas no encontradas en el catálogo: ${missing.join(", ")}`);
  }
  if (layerIds.length === 0) {
    console.error("✗ No hay capas para auditar.");
    process.exit(2);
  }

  let runId = null;
  if (opts.save) {
    runId = await db.rpc("chat_audit_start_run", {
      p_trigger: opts.trigger, p_thresholds_version: THRESHOLDS.version,
    });
  }

  const results = [];
  let failures = 0;
  for (const layerId of layerIds) {
    process.stdout.write(`Auditando ${layerId}... `);
    try {
      const r = await auditLayer(db, layerId, styleMap);
      results.push(r);
      console.log(r.status);
      if (runId) {
        await db.rpc("chat_audit_save_layer", { p_run: runId, p_layer: layerId, p_result: r });
      }
    } catch (err) {
      failures++;
      console.log("ERROR");
      console.error(`  ✗ ${layerId}: ${err?.message || err}`);
      const failed = {
        layer_id: layerId, row_count: 0, geometry: null, columns: [],
        config_issues: [], provenance: { flags: [] }, flags: [],
        status: "warning",
        warnings: [{ code: "audit_failed" }],
        error: String(err?.message || err).slice(0, 300),
      };
      results.push(failed);
      if (runId) {
        try { await db.rpc("chat_audit_save_layer", { p_run: runId, p_layer: layerId, p_result: failed }); }
        catch { /* se registra en el reporte */ }
      }
    }
  }

  const run = {
    run_id: runId,
    thresholds_version: THRESHOLDS.version,
    finished_at: new Date().toISOString(),
    trigger: opts.trigger,
  };

  if (runId) {
    await db.rpc("chat_audit_finish_run", {
      p_run: runId,
      p_status: failures === 0 ? "ok" : failures === layerIds.length ? "failed" : "partial",
      p_error: failures ? `${failures} capa(s) con error` : null,
      p_keep: 12,
    });
  }

  await mkdir(opts.out, { recursive: true });
  await writeFile(join(opts.out, "audit-data.json"), JSON.stringify({ run, results }, null, 2));
  await writeFile(join(opts.out, "audit-data.md"), renderMarkdown(run, results));

  const blocked = results.filter((r) => r.status === "blocked").length;
  console.log(`\n✓ Hecho. ${results.length} capas, ${blocked} blocked, ${failures} con error.`);
  console.log(`  Reportes en ${opts.out}/audit-data.{json,md}`);
  process.exit(opts.strict && blocked > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ Error:", err?.message || err);
  process.exit(1);
});