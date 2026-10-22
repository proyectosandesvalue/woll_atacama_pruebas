/**
 * Detección de datos no disponibles en el visor.
 *
 * Lee el inventario de `admin.unavailable_data` vía la RPC
 * `chat_unavailable_data()` (Sprint 40-D.2 + preparación Sprint 15).
 *
 * Killswitch: CHAT_UNAVAILABLE_ENABLED (default 0 = apagado).
 *
 * El inventario es configurable desde el panel admin (Sprint 15).
 */

const DEBUG = /^(1|true|yes)$/i.test(process.env.ORCHESTRATOR_DEBUG || "");
function dbg(...args) {
  if (DEBUG) console.log("[unavailable]", ...args);
}

function isEnabled() {
  return /^(1|true|yes)$/i.test(process.env.CHAT_UNAVAILABLE_ENABLED || "0");
}

let _inventoryCache = null;
let _inventoryCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

async function loadInventory() {
  const now = Date.now();
  if (_inventoryCache && now - _inventoryCacheTime < CACHE_TTL_MS) {
    return _inventoryCache;
  }

  try {
    const { getDB } = await import("../db/pool.js");
    const db = await getDB();
    const rows = await db.rpc("chat_unavailable_data");
    _inventoryCache = Array.isArray(rows) ? rows : [];
    _inventoryCacheTime = now;
    dbg(`Inventario cargado desde RPC: ${_inventoryCache.length} entradas`);
    return _inventoryCache;
  } catch (err) {
    dbg(`No se pudo cargar el inventario: ${err?.message || err}`);
    _inventoryCache = [];
    _inventoryCacheTime = now;
    return _inventoryCache;
  }
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function detectUnavailable(userText) {
  if (!isEnabled()) return [];
  if (typeof userText !== "string" || userText.trim().length === 0) return [];

  const inventory = await loadInventory();
  if (inventory.length === 0) return [];

  const normalized = normalizeText(userText);
  const matches = [];

  for (const entry of inventory) {
    if (!entry || !Array.isArray(entry.palabras)) continue;
    const matched = entry.palabras.some((p) => {
      const np = normalizeText(p);
      return np.length > 0 && normalized.includes(np);
    });
    if (matched) {
      matches.push({
        id: entry.id,
        motivo: entry.motivo || "dato_inexistente",
        existe: entry.existe || null,
        descripcion: entry.descripcion || null,
      });
    }
  }

  if (matches.length > 0) {
    dbg(
      `Datos no disponibles detectados: ${matches.map((m) => m.id).join(", ")}`
    );
  }
  return matches;
}

export function buildUnavailableNotice(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const lines = matches.map((m) => {
    const desc = m.descripcion || "ese dato";
    if (m.existe) {
      return `El visor no incluye ${desc}. Sí dispone de ${m.existe}.`;
    }
    return `El visor no incluye ${desc}.`;
  });

  return lines.join(" ");
}

export async function validateInventory() {
  const inventory = await loadInventory();
  const errors = [];

  let catalogIds = null;
  try {
    const { getDB } = await import("../db/pool.js");
    const db = await getDB();
    const catalog = (await db.rpc("chat_catalog")) ?? [];
    catalogIds = new Set(catalog.map((c) => c.layer_id));
  } catch (err) {
    return {
      ok: false,
      errors: [`No se pudo cargar el catálogo: ${err?.message || err}`],
    };
  }

  for (const entry of inventory) {
    if (!entry || typeof entry.id !== "string") {
      errors.push(`Entrada sin id: ${JSON.stringify(entry)}`);
      continue;
    }

    if (entry.motivo === "sin_receta") {
      if (
        !Array.isArray(entry.capas_relacionadas) ||
        entry.capas_relacionadas.length === 0
      ) {
        errors.push(
          `Entrada "${entry.id}" tiene motivo "sin_receta" pero no declara capas_relacionadas`
        );
      }
    }

    if (Array.isArray(entry.capas_relacionadas)) {
      for (const lid of entry.capas_relacionadas) {
        if (!catalogIds.has(lid)) {
          errors.push(
            `Entrada "${entry.id}" referencia la capa "${lid}", que no existe en el catálogo`
          );
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function _resetUnavailable() {
  _inventoryCache = null;
  _inventoryCacheTime = 0;
}