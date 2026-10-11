/**
 * scripts/generate-audit-report.mjs
 *
 * Genera un informe markdown completo desde reports/audit-data.json.
 * Uso: node scripts/generate-audit-report.mjs
 * Salida: reports/DATA-AUDIT-COMPLETO.md
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const INPUT = join(ROOT, "reports", "audit-data.json");
const OUTPUT = join(ROOT, "reports", "DATA-AUDIT-COMPLETO.md");

const data = JSON.parse(await readFile(INPUT, "utf8"));
const { run, results } = data;

// Ordenar por gravedad
const order = { blocked: 0, warning: 1, ok: 2 };
const sorted = [...results].sort((a, b) => {
  const d = order[a.status] - order[b.status];
  if (d !== 0) return d;
  return a.layer_id.localeCompare(b.layer_id);
});

const L = [];

// ─── Encabezado ─────────────────────────────────────────────
L.push(`# Auditoría de calidad de datos — Informe completo`);
L.push(``);
L.push(`- **Fecha:** ${run.finished_at}`);
L.push(`- **Umbrales:** ${run.thresholds_version}`);
L.push(`- **Corrida:** \`${run.run_id}\``);
L.push(`- **Capas auditadas:** ${results.length}`);
L.push(``);

// ─── Resumen ejecutivo ──────────────────────────────────────
const byStatus = { ok: 0, warning: 0, blocked: 0 };
for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

L.push(`## 1. Resumen ejecutivo`);
L.push(``);
L.push(`| Estado | Cantidad | % |`);
L.push(`|---|---|---|`);
L.push(`| ✅ OK | ${byStatus.ok} | ${Math.round(100 * byStatus.ok / results.length)}% |`);
L.push(`| ⚠️ Warning | ${byStatus.warning} | ${Math.round(100 * byStatus.warning / results.length)}% |`);
L.push(`| 🚨 Blocked | ${byStatus.blocked} | ${Math.round(100 * byStatus.blocked / results.length)}% |`);
L.push(``);

// ─── Tabla completa ─────────────────────────────────────────
L.push(`## 2. Tabla completa (69 capas)`);
L.push(``);
L.push(`| Capa | Estado | Filas | Cols problemáticas | Config | Procedencia |`);
L.push(`|---|---|---|---|---|---|`);

for (const r of sorted) {
  const badCols = (r.columns || []).filter(
    (c) => c.quality === "dirty" || c.quality === "broken" || c.quality === "error"
  ).length;
  const configCount = (r.config_issues || []).length;
  const provFlags = (r.flags || []).join(", ") || "—";
  L.push(
    `| ${r.layer_id} | ${r.status} | ${r.row_count} | ${badCols} | ${configCount} | ${provFlags} |`
  );
}
L.push(``);

// ─── Detalle por capa ───────────────────────────────────────
L.push(`## 3. Detalle por capa`);
L.push(``);

for (const r of sorted) {
  L.push(`### 3.x. \`${r.layer_id}\` — ${r.status.toUpperCase()}`);
  L.push(``);
  L.push(`- **Filas:** ${r.row_count}`);
  if (r.geometry) {
    L.push(`- **Geometrías:** total ${r.geometry.total}, nulas ${r.geometry.null_geom}, vacías ${r.geometry.empty_geom}, inválidas ${r.geometry.invalid_geom}, zero_zero ${r.geometry.zero_zero}, srid_mismatch ${r.geometry.srid_mismatch}, outside_bbox ${r.geometry.outside_bbox}, duplicadas ${r.geometry.duplicate_geom}`);
  }
  L.push(`- **Flags:** ${(r.flags || []).join(", ") || "—"}`);
  L.push(`- **Warnings:** ${(r.warnings || []).map((w) => w.code).join(", ") || "—"}`);
  if (r.config_issues?.length > 0) {
    L.push(`- **Config issues:**`);
    for (const ci of r.config_issues) {
      L.push(`  - \`${ci.type}\`: \`${ci.field}\``);
    }
  }
  L.push(``);

  // Columnas problemáticas
  const problemCols = (r.columns || []).filter(
    (c) => c.quality !== "clean" && c.quality !== "mostly_clean"
  );
  if (problemCols.length > 0) {
    L.push(`**Columnas problemáticas (${problemCols.length}):**`);
    L.push(``);
    L.push(`| Columna | Calidad | % nulos | % sospechosos | Flags |`);
    L.push(`|---|---|---|---|---|`);
    for (const c of problemCols) {
      L.push(`| \`${c.column_name}\` | ${c.quality} | ${c.null_pct} | ${c.suspicious_pct} | ${(c.flags || []).join(", ")} |`);
    }
    L.push(``);
  }
}

// ─── Anexo A: Config issues ─────────────────────────────────
L.push(`## 4. Anexo A — Config issues (visores)`);
L.push(``);
const withConfig = results.filter((r) => (r.config_issues || []).length > 0);
L.push(`**Capas con problemas de config:** ${withConfig.length}`);
L.push(``);
for (const r of withConfig) {
  L.push(`- **${r.layer_id}:**`);
  for (const ci of r.config_issues) {
    L.push(`  - \`${ci.type}\`: \`${ci.field}\``);
  }
}
L.push(``);

// ─── Anexo B: Procedencia ───────────────────────────────────
L.push(`## 5. Anexo B — Procedencia y vigencia`);
L.push(``);
const missingProv = results.filter((r) => (r.flags || []).includes("missing_provenance"));
const stale = results.filter((r) => (r.flags || []).includes("stale"));
L.push(`**Capas sin columna de origen:** ${missingProv.length}`);
for (const r of missingProv) L.push(`- ${r.layer_id}`);
L.push(``);
L.push(`**Capas con datos obsoletos (>3 años):** ${stale.length}`);
for (const r of stale) L.push(`- ${r.layer_id}`);
L.push(``);

// ─── Anexo C: Geometrías ────────────────────────────────────
L.push(`## 6. Anexo C — Geometrías`);
L.push(``);
const blocked = results.filter((r) => r.status === "blocked");
L.push(`**Capas bloqueadas por geometría/tabla vacía:** ${blocked.length}`);
L.push(``);
for (const r of blocked) {
  L.push(`- **${r.layer_id}** (${r.row_count} filas):`);
  for (const w of r.warnings || []) {
    L.push(`  - \`${w.code}\`: ${w.detail || ""}`);
  }
}
L.push(``);

// ─── Anexo D: Plan de acción ────────────────────────────────
L.push(`## 7. Anexo D — Plan de acción`);
L.push(``);
L.push(`### Fase 1 — Fix de las 6 blocked en QGIS`);
L.push(``);
L.push(`Corregir geometrías \`Ring Self-intersection\` con QGIS:`);
for (const r of blocked) {
  if (r.warnings?.some((w) => w.code === "bad_geometries")) {
    L.push(`- \`${r.layer_id}\``);
  }
}
L.push(``);
L.push(`Y resolver \`energia_linea_media_transmision\` (tabla vacía).`);
L.push(``);
L.push(`### Fase 2 — Capas con muchas columnas problemáticas`);
L.push(``);
const manyBadCols = results.filter((r) => {
  const bad = (r.columns || []).filter((c) => ["dirty", "broken", "error"].includes(c.quality)).length;
  return bad >= 5;
}).sort((a, b) => b.columns.filter((c) => ["dirty", "broken", "error"].includes(c.quality)).length - a.columns.filter((c) => ["dirty", "broken", "error"].includes(c.quality)).length);
for (const r of manyBadCols) {
  const bad = (r.columns || []).filter((c) => ["dirty", "broken", "error"].includes(c.quality)).length;
  L.push(`- \`${r.layer_id}\`: ${bad} columnas problemáticas.`);
}
L.push(``);
L.push(`### Fase 3 — Config issues del visor`);
L.push(``);
for (const r of withConfig) L.push(`- \`${r.layer_id}\``);
L.push(``);
L.push(`### Fase 4 — Resto de warnings`);
L.push(``);
L.push(`Las capas restantes tienen 1-2 columnas problemáticas o flags menores.`);
L.push(`Se resuelven en la medida que se toquen.`);
L.push(``);

await writeFile(OUTPUT, L.join("\n"), "utf8");
console.log(`✓ Informe generado: ${OUTPUT}`);
console.log(`  ${L.length} líneas`);