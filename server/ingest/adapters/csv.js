/**
 * Adapter genérico para endpoints CSV.
 *
 * Sprint 42-B (2026-10-24).
 *
 * ARClim devuelve CSV en `/api/daily_series/{variable}/{scenario}/`.
 * Este adapter parsea el CSV y hace UPSERT.
 */

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[ingest:csv]", ...args);
}

function parseCsv(text) {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j];
    }
    rows.push(row);
  }

  return rows;
}

function parseNumeric(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function runCsvEndpoint(db, source, endpoint) {
  const url = `${source.url_base}${endpoint.path}`;
  dbg(`GET ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const text = await res.text();
  const rows = parseCsv(text);
  dbg(`Filas: ${rows.length}`);

  // Stub: implementar el mapping de columnas CSV → indicator_values
  // (similar al adapter JSON, pero con headers de columnas).
  throw new Error("Adapter CSV no implementado todavía. Usar adapter específico.");
}