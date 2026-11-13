/**
 * Renderer de tiles vectoriales MVT pregenerados (Sprint 08-B).
 *
 * El visor usa `leaflet.vectorgrid` (vendorizado en `js/lib`) para pintar los
 * tiles del viewport. El GeoJSON queda como fallback: si el manifest o los
 * tiles fallan, `layerUtils` sigue por la rama GeoJSON.
 *
 * Los filtros (`dataFilter`) y las categorías ocultas (`hiddenAttributes`) se
 * evalúan en la función de estilo, de modo que un `redraw()` refleja el estado
 * actual sin descargar datos.
 *
 * @module utils/vectorTileUtils
 */

import { appState, getDataFilter } from "../store/appState.js";
import { getEstiloCapa } from "./styleUtils.js";
import { showFeatureInfo } from "./popupUtils.js";
import { createContextLogger } from "./logger.js";

const log = createContextLogger("VectorTileUtils");
const manifestCache = new Map();

/**
 * ¿La configuración declara tiles estáticos de PostGIS?
 * @param {object} configCapa
 * @returns {boolean}
 */
export function isVectorTileLayer(configCapa) {
  const source = configCapa?.source;
  return (
    source?.type === "postgis" &&
    source.tiles?.mode === "static" &&
    Boolean(source.tiles.urlTemplate)
  );
}

/**
 * Descarga (y cachea) el manifest de una versión.
 * @param {string} url
 * @returns {Promise<object>}
 */
export function getTileManifest(url) {
  if (!manifestCache.has(url)) {
    const promise = fetch(url, { headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${url}`);
        return res.json();
      })
      .catch((err) => {
        manifestCache.delete(url);
        throw err;
      });
    manifestCache.set(url, promise);
  }
  return manifestCache.get(url);
}

/** Limpia la caché de manifests (tests o recarga de versión). */
export function clearTileManifestCache() {
  manifestCache.clear();
}

function geometryTypeForStyle(type) {
  if (type === "line" || type === "lineString") return "LineString";
  if (type === "point") return "Point";
  return "Polygon";
}

function isFeatureVisible(properties, capaNombre, configCapa) {
  const dataFilter = getDataFilter(capaNombre);
  if (dataFilter && dataFilter.size > 0) {
    for (const [attr, allowedValues] of dataFilter.entries()) {
      const value = properties?.[attr];
      if (value === undefined || value === null) return false;
      if (!allowedValues.has(String(value))) return false;
    }
  }

  if (configCapa.atributo && appState.layers.hiddenAttributes.has(capaNombre)) {
    const hidden = appState.layers.hiddenAttributes.get(capaNombre);
    if (hidden && hidden.has(properties?.[configCapa.atributo])) return false;
  }

  return true;
}

function styleForProperties(properties, capaNombre, configCapa, geometryType) {
  if (!isFeatureVisible(properties, capaNombre, configCapa)) {
    return {
      fill: false,
      stroke: false,
      opacity: 0,
      fillOpacity: 0,
      weight: 0,
      interactive: false,
    };
  }

  return getEstiloCapa(
    { type: "Feature", properties, geometry: { type: geometryType } },
    configCapa
  );
}

function boundsFromManifest(manifest) {
  const bbox = manifest?.bbox;
  if (!bbox) return undefined;
  return L.latLngBounds(
    [bbox.miny, bbox.minx],
    [bbox.maxy, bbox.maxx]
  );
}

/**
 * Crea la capa de tiles vectoriales de una capa configurada con `source.tiles`.
 * @param {string} capaNombre
 * @param {object} configCapa
 * @returns {Promise<L.Layer>}
 */
export async function createVectorTileLayer(capaNombre, configCapa) {
  if (typeof L === "undefined" || !L.vectorGrid) {
    throw new Error("leaflet.vectorgrid no está cargado.");
  }

  // leaflet.vectorgrid@1.3.0 fue escrito para Leaflet 1.0 y usa
  // L.DomEvent.fakeStop, eliminado en Leaflet 1.9. Sin este shim, el clic
  // sobre un feature lanza TypeError y no abre la ficha.
  if (typeof L.DomEvent.fakeStop !== "function") {
    L.DomEvent.fakeStop = (event) => {
      if (event) event._stopped = true;
    };
  }

  const tiles = configCapa.source.tiles;
  const manifest = tiles.manifest ? await getTileManifest(tiles.manifest) : null;
  const layerName =
    manifest?.tile_slug || tiles.layerName || capaNombre;
  const geometryType = geometryTypeForStyle(configCapa.type);
  const maxNativeZoom =
    manifest?.maxzoom ?? tiles.maxZoom ?? configCapa.source.maxZoom ?? 14;
  const minZoom = manifest?.minzoom ?? tiles.minZoom ?? 0;
  const maxZoom = appState.map?.getMaxZoom ? appState.map.getMaxZoom() : 18;
  const idColumn = configCapa.source.idColumn || "fid";

  const options = {
    // overlayPane (no tilePane) para compartir el orden z con las capas SVG
    // y quedar por encima del mapa base. `bringToFront` sigue funcionando.
    pane: "overlayPane",
    minZoom,
    maxZoom,
    maxNativeZoom,
    bounds: boundsFromManifest(manifest),
    interactive: true,
    rendererFactory: L.canvas.tile,
    getFeatureId: (feature) => {
      const id = feature?.properties?.[idColumn];
      const value = Number(id);
      return Number.isFinite(value) ? value : undefined;
    },
    vectorTileLayerStyles: {
      [layerName]: (properties) =>
        styleForProperties(properties, capaNombre, configCapa, geometryType),
    },
  };

  const layer = L.vectorGrid.protobuf(tiles.urlTemplate, options);

  layer._isVectorTile = true;
  layer._configCapa = configCapa;
  layer._capaNombre = capaNombre;
  layer._tileManifest = manifest;

  const bounds = boundsFromManifest(manifest);
  if (bounds) {
    layer.getBounds = () => bounds;
  }

  layer.on("click", (event) => {
    const properties = event.layer?.properties;
    if (!properties) return;
    if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
    showFeatureInfo({ properties }, configCapa);
  });

  layer.on("tileerror", (event) => {
    // Un 404 es un tile fuera de la cobertura de la capa: no es un error real.
    const status = event.error?.status ?? event.status;
    if (status && status !== 404) {
      log.warn(
        `Tile ${event.coords?.z}/${event.coords?.x}/${event.coords?.y} falló (${status})`
      );
    }
  });

  log.log(
    `Capa ${capaNombre} creada con tiles ${tiles.version || ""} ` +
      `(z${minZoom}-${maxNativeZoom}, ${manifest?.tiles ?? "?"} tiles)`
  );

  return layer;
}
