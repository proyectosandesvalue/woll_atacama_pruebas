/**
 * Utilidades geoespaciales mínimas (sin Turf).
 *
 * El visor solo necesita `bbox` para hacer zoom a una capa/feature. Turf
 * incluía `new Function` (bloqueado por CSP) y ~500 KB; esta implementación
 * cubre Feature, FeatureCollection, Geometry y GeometryCollection.
 *
 * @module utils/geoUtils
 */

/**
 * Calcula [minX, minY, maxX, maxY] de un GeoJSON.
 * @param {object} geojson
 * @returns {[number, number, number, number]|null}
 */
export function getBbox(geojson) {
  if (!geojson) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visitCoords = (coords) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === "number") {
      const [x, y] = coords;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const child of coords) visitCoords(child);
  };

  const visitGeometry = (geometry) => {
    if (!geometry) return;
    if (geometry.type === "GeometryCollection") {
      for (const child of geometry.geometries || []) visitGeometry(child);
      return;
    }
    visitCoords(geometry.coordinates);
  };

  if (geojson.type === "FeatureCollection") {
    for (const feature of geojson.features || []) visitGeometry(feature?.geometry);
  } else if (geojson.type === "Feature") {
    visitGeometry(geojson.geometry);
  } else {
    visitGeometry(geojson);
  }

  if (minX === Infinity) return null;
  return [minX, minY, maxX, maxY];
}
