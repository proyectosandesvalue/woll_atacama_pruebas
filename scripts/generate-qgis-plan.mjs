/**
 * scripts/generate-qgis-plan.mjs
 *
 * Genera docs/QGIS-FIX-PLAN.md con el plan de corrección
 * en QGIS de todas las capas.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const AUDIT = join(ROOT, "reports", "audit-data.json");
const CONFIG = join(ROOT, "reports", "CONFIG-COHERENCE.md");
const OUTPUT = join(ROOT, "docs", "QGIS-FIX-PLAN.md");

const data = JSON.parse(await readFile(AUDIT, "utf8"));
const configReport = await readFile(CONFIG, "utf8");

const { results } = data;

// ── Ordenar por gravedad ────────────────────────────────────
const order = { blocked: 0, warning: 1, ok: 2 };
const sorted = [...results].sort((a, b) => {
  const d = order[a.status] - order[b.status];
  return d !== 0 ? d : a.layer_id.localeCompare(b.layer_id);
});

const L = [];

// ── Encabezado ──────────────────────────────────────────────
L.push(`# Plan de corrección en QGIS`);
L.push(``);
L.push(`**Fecha:** ${new Date().toISOString().slice(0, 10)}`);
L.push(`**Corrida auditoría:** \`${data.run?.run_id}\``);
L.push(``);
L.push(`Este documento lista **todos los problemas detectados** por la auditoría`);
L.push(`de datos y debe usarse como guía para corregir las capas en QGIS.`);
L.push(``);
L.push(`---`);
L.push(``);

// ── 1. Resumen ejecutivo ────────────────────────────────────
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
L.push(`**Total de capas auditadas:** ${results.length}`);
L.push(``);
L.push(`---`);
L.push(``);

// ── 2. Capas bloqueadas ────────────────────────────────────
const blocked = results.filter((r) => r.status === "blocked");
L.push(`## 2. Capas bloqueadas (${blocked.length})`);
L.push(``);
L.push(`Estas capas NO deben publicarse hasta corregir sus geometrías.`);
L.push(``);

let sectionNum = 0;
for (const r of blocked) {
  sectionNum++;
  L.push(`### 2.${sectionNum}. \`${r.layer_id}\` (${r.row_count} filas)`);
  L.push(``);
  for (const w of r.warnings || []) {
    L.push(`- **${w.code}**: ${w.detail || ""}`);
  }
  if (r.geometry) {
    L.push(``);
    L.push(`| Métrica | Valor |`);
    L.push(`|---|---|`);
    L.push(`| Total | ${r.geometry.total} |`);
    L.push(`| Nulas | ${r.geometry.null_geom} |`);
    L.push(`| Vacías | ${r.geometry.empty_geom} |`);
    L.push(`| Inválidas | ${r.geometry.invalid_geom} |`);
    L.push(`| Zero-Zero | ${r.geometry.zero_zero} |`);
    L.push(`| SRID mismatch | ${r.geometry.srid_mismatch} |`);
    L.push(`| Fuera del bbox | ${r.geometry.outside_bbox} |`);
    L.push(`| Duplicadas | ${r.geometry.duplicate_geom} |`);
  }
  L.push(``);
  L.push(`**Acción en QGIS:**`);
  L.push(`1. Abrir el archivo original de la capa en QGIS.`);
  L.push(`2. \`Vector → Herramientas de geometría → Comprobar validez\`.`);
  L.push(`3. Corregir las features inválidas (auto o manual).`);
  L.push(`4. Verificar con "Comprobar validez" que no queden errores.`);
  L.push(`5. Exportar como GeoJSON (EPSG:4326).`);
  L.push(``);
}
L.push(`---`);
L.push(``);

// ── 3. Duplicados de geometría ─────────────────────────────
const withDupes = results.filter((r) => r.geometry?.duplicate_geom > 0);
L.push(`## 3. Capas con geometrías duplicadas (${withDupes.length})`);
L.push(``);
L.push(`Las geometrías repetidas pueden ser legítimas (mismo punto con`);
L.push(`diferentes atributos) o errores de carga. **Verificar en QGIS.**`);
L.push(``);
L.push(`| Capa | Duplicadas | Total | % |`);
L.push(`|---|---|---|---|`);
for (const r of withDupes) {
  const pct = r.geometry.total
    ? Math.round(100 * r.geometry.duplicate_geom / r.geometry.total)
    : 0;
  L.push(
    `| \`${r.layer_id}\` | ${r.geometry.duplicate_geom} | ${r.geometry.total} | ${pct}% |`
  );
}
L.push(``);
L.push(`---`);
L.push(``);

// ── 4. Columnas rotas ──────────────────────────────────────
L.push(`## 4. Columnas rotas por capa`);
L.push(``);
L.push(`Columnas con >70% nulos o >50% sospechosos.`);
L.push(`Se recomienda **eliminarlas del GeoJSON** antes de re-subir.`);
L.push(``);

let totalBroken = 0;
for (const r of sorted) {
  const broken = (r.columns || []).filter((c) => c.quality === "broken");
  if (broken.length === 0) continue;
  totalBroken += broken.length;
  L.push(`### \`${r.layer_id}\` — ${broken.length} columna(s) rota(s)`);
  L.push(``);
  L.push(`| Columna | % nulos | % sospechosos | Acción |`);
  L.push(`|---|---|---|---|`);
  for (const c of broken) {
    const action =
      c.null_pct >= 95
        ? "Eliminar del GeoJSON"
        : c.suspicious_pct >= 50
          ? "Revisar valores / eliminar"
          : "Revisar";
    L.push(`| \`${c.column_name}\` | ${c.null_pct} | ${c.suspicious_pct} | ${action} |`);
  }
  L.push(``);
}
L.push(`**Total de columnas rotas:** ${totalBroken}`);
L.push(``);
L.push(`---`);
L.push(``);

// ── 5. Incoherencias config ─────────────────────────────────
L.push(`## 5. Incoherencias config ↔ BD`);
L.push(``);
L.push(`Campos que el visor pide pero **no existen** en la tabla.`);
L.push(`El fix es en los archivos \`js/config/*.js\`, no en QGIS.`);
L.push(``);
// Subordinar los ## de CONFIG-COHERENCE a ### dentro de la sección 5
const configLines = configReport
  .split("\n")
  .slice(6)
  .map((line) => (line.startsWith("## ") ? "### " + line.slice(3) : line))
  .join("\n");
L.push(configLines);
L.push(``);
L.push(`---`);
L.push(``);

// ── 6. Capas con muchas columnas problemáticas ────────────
L.push(`## 6. Capas con 5+ columnas problemáticas`);
L.push(``);
const manyBad = sorted
  .map((r) => ({
    layer_id: r.layer_id,
    dirty: (r.columns || []).filter((c) => c.quality === "dirty").length,
    broken: (r.columns || []).filter((c) => c.quality === "broken").length,
  }))
  .filter((r) => r.dirty + r.broken >= 5)
  .sort((a, b) => b.dirty + b.broken - (a.dirty + a.broken));

L.push(`| Capa | Dirty | Broken | Total |`);
L.push(`|---|---|---|---|`);
for (const r of manyBad) {
  L.push(
    `| \`${r.layer_id}\` | ${r.dirty} | ${r.broken} | ${r.dirty + r.broken} |`
  );
}
L.push(``);
L.push(`---`);
L.push(``);

// ── 7. Tablas vacías ───────────────────────────────────────
const empty = results.filter((r) => r.row_count === 0);
L.push(`## 7. Tablas vacías (${empty.length})`);
L.push(``);
if (empty.length === 0) {
  L.push(`Ninguna.`);
} else {
  for (const r of empty) {
    L.push(`- \`${r.layer_id}\``);
  }
  L.push(``);
  L.push(`**Acción:** buscar el archivo original o deshabilitar del catálogo.`);
}
L.push(``);
L.push(`---`);
L.push(``);

// ── 8. Plan de acción ──────────────────────────────────────
L.push(`## 8. Plan de acción por fases`);
L.push(``);
L.push(`### Fase 1 — Geometrías inválidas (QGIS)`);
L.push(``);
for (const r of blocked) {
  if (r.warnings?.some((w) => w.code === "bad_geometries")) {
    L.push(`- [ ] \`${r.layer_id}\``);
  }
}
L.push(``);
L.push(`### Fase 2 — Columnas rotas (QGIS)`);
L.push(``);
for (const r of sorted) {
  const broken = (r.columns || []).filter((c) => c.quality === "broken");
  if (broken.length >= 3) {
    L.push(`- [ ] \`${r.layer_id}\` (${broken.length} columnas)`);
  }
}
L.push(``);
L.push(`### Fase 3 — Incoherencias config (editar \`js/config/*.js\`)`);
L.push(``);
L.push(`Ver sección 5.`);
L.push(``);
L.push(`### Fase 4 — Duplicados de geometría`);
L.push(``);
for (const r of withDupes) {
  L.push(`- [ ] \`${r.layer_id}\` (${r.geometry.duplicate_geom} duplicadas)`);
}
L.push(``);
L.push(`### Fase 5 — Tablas vacías`);
L.push(``);
for (const r of empty) {
  L.push(`- [ ] \`${r.layer_id}\``);
}
L.push(``);
L.push(`---`);
L.push(``);

// ── 9. Prioridades ─────────────────────────────────────────
L.push(`## 9. Prioridades`);
L.push(``);
L.push(`### 9.1. Urgente (esta semana) — 1-2h en QGIS`);
L.push(``);
L.push(`Corregir las capas con más del 30% de geometrías inválidas:`);
L.push(``);
for (const r of blocked) {
  const pct = r.warnings?.find((w) => w.code === "bad_geometries")?.detail;
  if (pct) {
    const num = parseFloat(pct);
    if (num >= 30) {
      L.push(`- [ ] \`${r.layer_id}\` (${pct} inválidas)`);
    }
  }
}
L.push(``);

L.push(`### 9.2. Alta (próximas 2 semanas) — 3-4h en QGIS`);
L.push(``);
L.push(`Capas con 5-30% inválidas y columnas rotas grandes:`);
L.push(``);
for (const r of blocked) {
  const pct = r.warnings?.find((w) => w.code === "bad_geometries")?.detail;
  if (pct) {
    const num = parseFloat(pct);
    if (num >= 5 && num < 30) {
      L.push(`- [ ] \`${r.layer_id}\` (${pct} inválidas)`);
    }
  }
}
for (const r of manyBad) {
  L.push(`- [ ] \`${r.layer_id}\` (${r.dirty + r.broken} columnas problemáticas)`);
}
L.push(``);

L.push(`### 9.3. Media (cuando haya tiempo)`);
L.push(``);
L.push(`- Incoherencias config: 92 issues en 23 capas (ver sección 5).`);
L.push(`- Duplicados de geometría: ${withDupes.length} capas.`);
L.push(`- Tablas vacías: ${empty.length} capa(s).`);
L.push(`- Columnas dirty (30-70% nulos): revisar caso por caso.`);
L.push(``);
L.push(`---`);
L.push(``);
L.push(`_Generado automáticamente desde audit-data.json y CONFIG-COHERENCE.md._`);

await mkdir(join(ROOT, "docs"), { recursive: true });
await writeFile(OUTPUT, L.join("\n"), "utf8");
console.log(`✓ Informe QGIS generado: ${OUTPUT}`);
console.log(`  ${L.length} líneas`);