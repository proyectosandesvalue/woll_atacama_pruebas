/**
 * scripts/check-config-coherence.mjs
 *
 * Compara los nombres de columnas usados en js/config/*.js
 * con las columnas reales de la BD (vía chat_columns_for_table).
 *
 * Uso: node --env-file=.env.staging scripts/check-config-coherence.mjs
 * Salida: reports/CONFIG-COHERENCE.md
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getDB } from "../server/db/pool.js";

// ── Normalización ────────────────────────────────────────────
function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // quitar tildes
    .replace(/[_\s]+/g, " ")            // unificar espacios y guiones
    .replace(/\s+/g, " ");
}

// Comparación más agresiva: remueve paréntesis y contenido
function normalizeAggressive(s) {
  return normalize(s)
    .replace(/\([^)]*\)/g, "")          // quitar paréntesis
    .replace(/\b(en|de|del|la|el|los|las)\b/g, "")  // quitar preposiciones
    .replace(/\s+/g, " ")
    .trim();
}

// ── Extraer config de un archivo JS ──────────────────────────
// Simple: busca popupCampos, atributo, alias en el texto.
function extractFromConfigFile(content, layerId) {
  const result = { popupCampos: [], atributo: null, alias: [] };

  // Bloque de la capa: desde "layerId: {" hasta el próximo "},\n  <nombre>: {" o fin
  const re = new RegExp(
    `${layerId}\\s*:\\s*\\{[\\s\\S]*?(?=\\n  \\w+\\s*:\\s*\\{|\\n\\};)`,
    "m"
  );
  const block = content.match(re);
  if (!block) return result;
  const b = block[0];

  // popupCampos: [...]
  const popupMatch = b.match(/popupCampos\s*:\s*\[([\s\S]*?)\]/);
  if (popupMatch) {
    const raw = popupMatch[1];
    // Extrae strings entre comillas
    const items = [...raw.matchAll(/"([^"]+)"|'([^']+)'/g)].map(
      (m) => m[1] ?? m[2]
    );
    result.popupCampos = items;
  }

  // atributo: "..."
  const atrMatch = b.match(/atributo\s*:\s*["']([^"']+)["']/);
  if (atrMatch) result.atributo = atrMatch[1];

  // alias: { key: "...", ... }
  const aliasMatch = b.match(/alias\s*:\s*\{([\s\S]*?)\}/);
  if (aliasMatch) {
    const raw = aliasMatch[1];
    const keys = [...raw.matchAll(/["']?([a-zA-Z0-9_À-ÿ ]+)["']?\s*:/g)].map(
      (m) => m[1].trim()
    );
    result.alias = keys;
  }

  return result;
}

// ── Leer todos los archivos de config ────────────────────────
async function loadAllConfigs() {
  const dir = join(process.cwd(), "js", "config");
  const files = (await readdir(dir)).filter(
    (f) => f.endsWith(".js") && !f.includes("allTemasConfig") && !f.includes("capasBase") && !f.includes("constants") && !f.includes("leyendaAliases") && !f.includes("wms_services")
  );

  const byLayer = new Map();

  for (const file of files) {
    const content = await readFile(join(dir, file), "utf8");

    // Extrae las claves de estilo (los layer_id de las capas)
    // Heurística: "  layer_id: {" o "    layer_id: {"
    const matches = [...content.matchAll(/^\s{2,4}([a-z][a-z0-9_]+)\s*:\s*\{/gm)];
    const layerIds = new Set(matches.map((m) => m[1]));

    // Filtrar falsos positivos (propiedades del nivel superior como "capas", "grupos", "estilo")
    const skip = new Set(["capas", "cargaInicial", "grupos", "estilo", "leyenda"]);

    for (const layerId of layerIds) {
      if (skip.has(layerId)) continue;
      const parsed = extractFromConfigFile(content, layerId);
      if (!parsed.popupCampos.length && !parsed.atributo) continue;
      byLayer.set(layerId, { ...parsed, file });
    }
  }

  return byLayer;
}

// ── Fuzzy match simple ───────────────────────────────────────
function suggestMatch(field, realColumns) {
  const target = normalizeAggressive(field);
  const candidates = realColumns
    .map((c) => ({
      col: c,
      score: (() => {
        const n = normalizeAggressive(c);
        if (n === target) return 100;
        if (n.includes(target) || target.includes(n)) return 80;
        const t1 = target.split(" ").filter(Boolean);
        const t2 = n.split(" ").filter(Boolean);
        const shared = t1.filter((w) => t2.includes(w)).length;
        return shared * 10;
      })(),
    }))
    .filter((x) => x.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return candidates;
}

// ── Main ─────────────────────────────────────────────────────
const db = await getDB();
const configs = await loadAllConfigs();

const report = [];
const totalIssues = { popup: 0, atributo: 0, alias: 0 };

report.push(`# Coherencia entre configs y BD`);
report.push(``);
report.push(`- Fecha: ${new Date().toISOString()}`);
report.push(`- Capas analizadas: ${configs.size}`);
report.push(``);
report.push(`---`);
report.push(``);

for (const [layerId, cfg] of configs) {
  let realColumns = [];
  try {
    const rows = await db.rpc("chat_columns_for_table", {
      p_schema: "public",
      p_table: layerId,
    });
    realColumns = (Array.isArray(rows) ? rows : []).map((r) => r.column_name);
  } catch {
    report.push(`## ${layerId} — ❌ error consultando la tabla`);
    report.push(``);
    continue;
  }

  const realSet = new Set(realColumns.map(normalize));
  const missing = [];

  for (const f of cfg.popupCampos) {
    if (!realSet.has(normalize(f))) missing.push({ kind: "popup", field: f });
  }
  if (cfg.atributo && !realSet.has(normalize(cfg.atributo))) {
    missing.push({ kind: "atributo", field: cfg.atributo });
  }
  for (const k of cfg.alias) {
    if (!realSet.has(normalize(k))) missing.push({ kind: "alias", field: k });
  }

  if (missing.length === 0) continue;

  report.push(`## ${layerId} (${cfg.file})`);
  report.push(``);

  for (const m of missing) {
    totalIssues[m.kind]++;
    const suggestions = suggestMatch(m.field, realColumns);
    report.push(`- **${m.kind}:** \`${m.field}\``);
    if (suggestions.length > 0) {
      report.push(`  - Sugerencias: ${suggestions.map((s) => `\`${s.col}\` (score ${s.score})`).join(", ")}`);
    } else {
      report.push(`  - ⚠️ Sin sugerencia`);
    }
  }
  report.push(``);
}

report.push(`---`);
report.push(``);
report.push(`## Resumen`);
report.push(``);
report.push(`| Tipo | Total |`);
report.push(`|---|---|`);
report.push(`| popupCampos huérfanos | ${totalIssues.popup} |`);
report.push(`| atributo huérfano | ${totalIssues.atributo} |`);
report.push(`| alias huérfano | ${totalIssues.alias} |`);

await mkdir("reports", { recursive: true });
await writeFile("reports/CONFIG-COHERENCE.md", report.join("\n"), "utf8");
console.log("✓ Reporte generado: reports/CONFIG-COHERENCE.md");
console.log(`  ${totalIssues.popup + totalIssues.atributo + totalIssues.alias} config_issues encontrados`);