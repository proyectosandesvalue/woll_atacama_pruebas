/**
 * Archivos de capas GeoJSON y manifests de tiles (Sprint 47).
 *
 * El panel sube GeoJSON a `geojson/uploads/`; el worker lo carga a PostGIS y
 * genera tiles en `tiles/`. Nada de esto se sirve desde el API.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MAX_GEOJSON_BYTES = 100 * 1024 * 1024;
export const LAYER_KEY_RE = /^[a-z][a-z0-9_]{1,60}$/;

const ALLOWED_GEOMETRIES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

export function validateLayerKey(key) {
  if (!LAYER_KEY_RE.test(key || "")) {
    throw new Error(
      "La clave debe empezar con minúscula y usar solo minúsculas, números y guion bajo."
    );
  }
  return key;
}

export function layerFilePath(key) {
  validateLayerKey(key);
  return path.join(ROOT, "geojson", "uploads", `${key}.geojson`);
}

export function layerFileRelative(key) {
  validateLayerKey(key);
  return `geojson/uploads/${key}.geojson`;
}

export function layerTileVersion(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`
  );
}

export function tileSlug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "layer";
}

export function tileManifestPath(key, version) {
  validateLayerKey(key);
  return path.join(ROOT, "tiles", tileSlug(key), version, "manifest.json");
}

export async function readTileManifest(key, version) {
  const file = tileManifestPath(key, version);
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

function geometryType(features) {
  const types = new Set(
    features
      .map((feature) => feature?.geometry?.type)
      .filter((type) => type && type !== "GeometryCollection")
  );
  if (types.size === 0) return "polygon";
  if ([...types].every((type) => type === "Point" || type === "MultiPoint")) return "point";
  if ([...types].every((type) => type === "LineString" || type === "MultiLineString")) return "line";
  if ([...types].every((type) => type === "Polygon" || type === "MultiPolygon")) return "polygon";
  return "polygon";
}

export async function saveGeoJsonStream(stream, key, opts = {}) {
  validateLayerKey(key);
  const { maxBytes = MAX_GEOJSON_BYTES } = opts;
  const destination = layerFilePath(key);
  await mkdir(path.dirname(destination), { recursive: true });

  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error(`El GeoJSON supera el límite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks);
  if (body.length === 0) throw new Error("El archivo está vacío.");

  let collection;
  try {
    collection = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("El archivo no es JSON válido.");
  }
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error("El archivo debe ser una FeatureCollection GeoJSON.");
  }

  const features = collection.features.filter((feature) => feature?.geometry);
  if (features.length === 0) {
    throw new Error("La colección no tiene features con geometría.");
  }
  for (const feature of features) {
    if (feature.geometry.type && !ALLOWED_GEOMETRIES.has(feature.geometry.type)) {
      throw new Error(`Geometría no soportada: ${feature.geometry.type}.`);
    }
  }

  const temp = `${destination}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temp, body, { mode: 0o644 });
    await rename(temp, destination);
  } catch (err) {
    await rm(temp, { force: true }).catch(() => {});
    throw new Error(`No se pudo guardar el GeoJSON: ${err.message}`);
  }

  return {
    file: layerFileRelative(key),
    bytes: body.length,
    features: features.length,
    type: geometryType(features),
  };
}

export async function layerFileInfo(key) {
  try {
    const info = await stat(layerFilePath(key));
    return {
      exists: true,
      bytes: info.size,
      modified_at: info.mtime.toISOString(),
      file: layerFileRelative(key),
    };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { exists: false, bytes: 0, modified_at: null, file: layerFileRelative(key) };
    }
    throw err;
  }
}

export async function deleteLayerFile(key) {
  await rm(layerFilePath(key), { force: true });
}
