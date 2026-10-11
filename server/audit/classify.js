/**
 * Clasificación pura de resultados de auditoría. Sin I/O: testeable.
 * Recibe los HECHOS devueltos por las RPCs y decide calidad, flags y estado.
 */

import { THRESHOLDS } from "./thresholds.js";

const TEXT_TYPES = new Set([
  "text", "character varying", "character", "varchar", "citext",
]);
const GEOM_NAMES = new Set(["geom", "geometry", "the_geom", "gid"]);

const num = (v) => Number(v ?? 0) || 0;
const round2 = (n) => Math.round(n * 100) / 100;

export function pct(n, total) {
  return total > 0 ? (num(n) / total) * 100 : 0;
}

export function normalizeName(s) {
  return String(s ?? "").toLowerCase().trim();
}

/** Minúsculas, sin tildes: para patrones de procedencia. */
export function normalizeLoose(s) {
  return normalizeName(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isAuditableColumn(name) {
  return !GEOM_NAMES.has(normalizeName(name));
}

/**
 * @param {object} facts  Salida de chat_audit_column (o {error}).
 * @param {{thresholds?: object, expectedSparse?: boolean}} [opts]
 * @returns {{quality: string, flags: string[], null_pct: number, suspicious_pct: number}}
 */
export function classifyColumn(facts, opts = {}) {
  const c = (opts.thresholds ?? THRESHOLDS).column;

  if (!facts || facts.error) {
    return { quality: "error", flags: ["audit_error"], null_pct: 0, suspicious_pct: 0 };
  }

  const rows = num(facts.row_count);
  if (rows === 0) {
    return { quality: "empty", flags: [], null_pct: 0, suspicious_pct: 0 };
  }

  const nulls = num(facts.null_count) + num(facts.empty_count);
  const susp = num(facts.suspicious_count);
  const moji = num(facts.mojibake_count);
  const sparse = opts.expectedSparse === true;

  const nullPct = pct(nulls, rows);
  const suspPct = pct(susp, rows);
  const effNull = sparse ? 0 : nullPct;

  let quality;
  if (effNull > c.brokenNullPct || suspPct > c.brokenSuspPct) quality = "broken";
  else if (effNull > c.hasNullsMaxPct || suspPct > c.dirtySuspPct || moji > 0) quality = "dirty";
  else if (nulls + susp + moji === 0) quality = "clean";
  else if (effNull < c.mostlyCleanNullPct && suspPct < c.mostlyCleanSuspPct) quality = "mostly_clean";
  else quality = "has_nulls";

  const flags = [];
  const nonNull = rows - nulls;

  if (
    TEXT_TYPES.has(normalizeName(facts.declared_type)) &&
    nonNull > 0 &&
    num(facts.numeric_parseable_count) / nonNull > c.numericAsTextRatio
  ) flags.push("numeric_as_text");

  if (
    nonNull > 0 &&
    num(facts.unique_count) < c.categoricalMaxUnique &&
    (quality === "clean" || quality === "mostly_clean")
  ) flags.push("categorical");

  if (
    rows >= c.idLikeMinRows && nonNull > 0 &&
    num(facts.unique_count) / nonNull >= c.idLikeRatio
  ) flags.push("id_like");

  if (num(facts.variant_groups) > 0) flags.push("has_case_variants");
  if (sparse) flags.push("expected_sparse");

  return {
    quality,
    flags,
    null_pct: round2(nullPct),
    suspicious_pct: round2(suspPct),
  };
}

/**
 * Compara la config del visor con las columnas reales de la tabla.
 * @param {object[]} styleConfigs  Entradas `estilo[capa]` de todas las dimensiones.
 * @param {string[]} columnNames   Columnas reales de la tabla.
 * @returns {{type: string, field: string}[]}
 */
export function checkConfigCoherence(styleConfigs, columnNames) {
  const cols = new Set(columnNames.map(normalizeName));
  const issues = [];
  const seen = new Set();
  const add = (type, field) => {
    const key = `${type}:${normalizeName(field)}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ type, field: String(field) });
  };

  for (const cfg of styleConfigs ?? []) {
    if (!cfg || cfg.tipo === "wms" || cfg.type === "wms") continue;
    for (const f of cfg.popupCampos ?? []) {
      if (!cols.has(normalizeName(f))) add("popup_field_missing", f);
    }
    if (cfg.atributo && !cols.has(normalizeName(cfg.atributo))) {
      add("atributo_missing", cfg.atributo);
    }
    if (cfg.etiquetas?.campo && !cols.has(normalizeName(cfg.etiquetas.campo))) {
      add("label_field_missing", cfg.etiquetas.campo);
    }
    for (const k of Object.keys(cfg.alias ?? {})) {
      if (!cols.has(normalizeName(k))) add("alias_key_missing", k);
    }
  }
  return issues;
}

/**
 * Procedencia y vigencia. Usa columnas YA clasificadas (con null_pct y max_date).
 * @returns {{flags: string[], newest_date: string|null, age_days: number|null}}
 */
export function computeProvenance(columns, opts = {}) {
  const p = (opts.thresholds ?? THRESHOLDS).provenance;
  const now = opts.now ?? new Date();
  const flags = [];

  const provCols = columns.filter((c) =>
    p.provenanceColumnPattern.test(normalizeLoose(c.column_name)));
  if (provCols.length === 0) {
    flags.push("missing_provenance");
  } else {
    const bestFill = Math.max(...provCols.map((c) => 100 - num(c.null_pct)));
    if (bestFill < p.minProvenanceFillPct) flags.push("missing_provenance");
  }

  let newest = null;
  for (const c of columns) {
    if (!c.max_date || !p.dateColumnPattern.test(normalizeLoose(c.column_name))) continue;
    const d = new Date(c.max_date);
    if (!Number.isNaN(d.getTime()) && (!newest || d > newest)) newest = d;
  }

  let ageDays = null;
  if (newest) {
    ageDays = Math.floor((now.getTime() - newest.getTime()) / 86400000);
    if (ageDays > p.staleDays) flags.push("stale");
  }

  return {
    flags,
    newest_date: newest ? newest.toISOString().slice(0, 10) : null,
    age_days: ageDays,
  };
}

/**
 * Estado de la capa: ok | warning | blocked, con motivos estructurados.
 * @returns {{status: string, warnings: {code: string, detail?: string}[]}}
 */
export function classifyLayer(input, opts = {}) {
  const t = opts.thresholds ?? THRESHOLDS;
  const { rowCount, geometry, columns = [], configIssues = [], provenance } = input;
  const warnings = [];
  let blocked = false;
  const block = (code, detail) => { blocked = true; warnings.push({ code, detail }); };
  const warn = (code, detail) => warnings.push({ code, detail });

  if (num(rowCount) === 0) block("table_empty");

  if (geometry && geometry.has_geometry !== false) {
    const total = num(geometry.total);
    const bad = num(geometry.null_geom) + num(geometry.empty_geom) + num(geometry.invalid_geom);
    if (pct(bad, total) > t.layer.blockedBadGeomPct) {
      block("bad_geometries", `${round2(pct(bad, total))}%`);
    }
    if (pct(geometry.zero_zero, total) > t.layer.blockedZeroZeroPct) {
      block("zero_zero", `${round2(pct(geometry.zero_zero, total))}%`);
    }
    if (num(geometry.outside_bbox) > 0) warn("outside_bbox", String(geometry.outside_bbox));
    if (num(geometry.srid_mismatch) > 0) warn("srid_mismatch", String(geometry.srid_mismatch));
    if (pct(geometry.duplicate_geom, total) > t.layer.warnDuplicateGeomPct) {
      warn("duplicate_geom", String(geometry.duplicate_geom));
    }
  }

  for (const c of columns) {
    if (c.quality === "dirty" || c.quality === "broken") {
      warn(`column_${c.quality}`, c.column_name);
    }
    if (c.quality === "error") warn("column_error", c.column_name);
  }

  if (configIssues.length > 0) warn("config_issues", String(configIssues.length));
  for (const f of provenance?.flags ?? []) warn(f);

  const status = blocked ? "blocked" : warnings.length > 0 ? "warning" : "ok";
  return { status, warnings };
}