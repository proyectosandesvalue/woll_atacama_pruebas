/**
 * Utilidades compartidas para capas servidas por la API Node (08-D/08-E).
 *
 * - `hasLayerApi`: detecta si el despliegue expone `/api/layer-features`
 *   (VPS/local) o no (Vercel demo congelada).
 * - `buildFeatureFilter`: traduce el `dataFilter` del visor a la especificación
 *   `{ op:"and", conditions:[...] }` del backend.
 *
 * @module utils/layerApiUtils
 */

import { getDataFilter } from "../store/appState.js";
import { createContextLogger } from "./logger.js";

const log = createContextLogger("LayerApiUtils");
const apiCache = new Map();

/**
 * ¿El servidor Node expone el endpoint de capas?
 * @param {string} capaNombre
 * @returns {Promise<boolean>}
 */
export async function hasLayerApi(capaNombre) {
  if (!apiCache.has(capaNombre)) {
    try {
      const res = await fetch(
        `/api/layer-features?layer_id=${encodeURIComponent(capaNombre)}&limit=1`,
        { headers: { Accept: "application/json" } }
      );
      apiCache.set(capaNombre, res.ok);
      if (!res.ok) {
        log.warn(`La API de capas no está disponible para ${capaNombre}; se usa GeoJSON.`);
      }
    } catch {
      apiCache.set(capaNombre, false);
    }
  }
  return apiCache.get(capaNombre);
}

/**
 * Traduce `dataFilter` (Map atributo → Set valores) al filtro del backend.
 * @param {string} capaNombre
 * @returns {{op: string, conditions: Array<object>}|null}
 */
export function buildFeatureFilter(capaNombre) {
  const dataFilter = getDataFilter(capaNombre);
  if (!dataFilter || dataFilter.size === 0) return null;

  const conditions = [];
  dataFilter.forEach((values, column) => {
    if (values && values.size > 0) {
      conditions.push({ column, operator: "in", value: [...values] });
    }
  });

  return conditions.length > 0 ? { op: "and", conditions } : null;
}
