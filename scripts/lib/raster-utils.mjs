/**
 * Utilidades puras del publicador de ráster precalculado (Sprint 49).
 *
 * No ejecutan GDAL ni tocan la base: validan argumentos, leen manifests,
 * calculan checksums y normalizan el CSV de estadísticas. Así se pueden
 * testear sin contenedor ni PostgreSQL.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const RASTER_DEFAULTS = Object.freeze({
  minzoom: 8,
  maxzoom: 13,
  format: "webp",
  maxTiles: 20000,
  maxMb: 2048,
  out: "raster",
  dataOut: "data/raster",
  gdalImage: "ghcr.io/osgeo/gdal:alpine-normal-latest",
  keep: 2,
});

const LAYER_RE = /^[a-z0-9_]+$/;
const VERSION_RE = /^[A-Za-z0-9._-]+$/;
const ADMIN_LEVELS = new Set(["comuna", "provincia", "region"]);
const STATS_COLUMNS = [
  "admin_level",
  "admin_code",
  "admin_name",
  "class_id",
  "class_label",
  "class_min",
  "class_max",
  "hectares",
  "mean",
  "min",
  "max",
  "p10",
  "p90",
];

/** Slug ASCII para directorios y URLs. */
export function layerSlug(value) {
  return (
    String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "layer"
  );
}

export function validateLayerId(value) {
  const layer = String(value || "");
  if (!LAYER_RE.test(layer)) {
    throw new Error("--layer solo admite minúsculas, números y guion bajo.");
  }
  return layer;
}

export function validateVersion(value) {
  const version = String(value ?? "");
  if (!version || !VERSION_RE.test(version)) {
    throw new Error("--version solo admite letras, números, punto, guion y guion bajo.");
  }
  return version;
}

function integer(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return parsed;
}

export function parsePublishArgs(argv = []) {
  const opts = {
    file: null,
    layer: null,
    version: null,
    name: null,
    description: null,
    license: null,
    producer: null,
    method: null,
    attribution: "WOLL Atacama",
    createdAt: null,
    legendFile: null,
    modelFile: null,
    statsCsv: null,
    minzoom: RASTER_DEFAULTS.minzoom,
    maxzoom: RASTER_DEFAULTS.maxzoom,
    format: RASTER_DEFAULTS.format,
    resampling: "bilinear",
    maxTiles: RASTER_DEFAULTS.maxTiles,
    maxMb: RASTER_DEFAULTS.maxMb,
    engine: null,
    gdalImage: RASTER_DEFAULTS.gdalImage,
    out: RASTER_DEFAULTS.out,
    dataOut: RASTER_DEFAULTS.dataOut,
    dryRun: false,
    force: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") opts.file = argv[++i];
    else if (arg === "--layer") opts.layer = argv[++i];
    else if (arg === "--version") opts.version = argv[++i];
    else if (arg === "--name") opts.name = argv[++i];
    else if (arg === "--description") opts.description = argv[++i];
    else if (arg === "--license") opts.license = argv[++i];
    else if (arg === "--producer") opts.producer = argv[++i];
    else if (arg === "--method") opts.method = argv[++i];
    else if (arg === "--attribution") opts.attribution = argv[++i];
    else if (arg === "--created-at") opts.createdAt = argv[++i];
    else if (arg === "--legend") opts.legendFile = argv[++i];
    else if (arg === "--model") opts.modelFile = argv[++i];
    else if (arg === "--stats-csv") opts.statsCsv = argv[++i];
    else if (arg === "--minzoom") opts.minzoom = Number(argv[++i]);
    else if (arg === "--maxzoom") opts.maxzoom = Number(argv[++i]);
    else if (arg === "--format") opts.format = String(argv[++i] || "").toLowerCase();
    else if (arg === "--resampling") opts.resampling = String(argv[++i] || "").toLowerCase();
    else if (arg === "--max-tiles") opts.maxTiles = Number(argv[++i]);
    else if (arg === "--max-mb") opts.maxMb = Number(argv[++i]);
    else if (arg === "--engine") opts.engine = String(argv[++i] || "").toLowerCase();
    else if (arg === "--gdal-image") opts.gdalImage = argv[++i];
    else if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--data-out") opts.dataOut = argv[++i];
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  if (opts.help) return opts;

  if (!opts.file) throw new Error("Falta --file.");
  if (!/\.(tif|tiff)$/i.test(String(opts.file))) {
    throw new Error("--file debe ser un GeoTIFF (.tif o .tiff).");
  }
  opts.layer = validateLayerId(opts.layer);
  opts.version = validateVersion(opts.version);
  for (const key of ["name", "license", "producer", "method"]) {
    if (!opts[key] || !String(opts[key]).trim()) {
      throw new Error(`Falta --${key === "name" ? "name" : key}.`);
    }
  }
  if (!["webp", "png"].includes(opts.format)) {
    throw new Error("--format debe ser webp o png.");
  }
  if (!["near", "bilinear", "average", "cubic", "mode"].includes(opts.resampling)) {
    throw new Error("--resampling debe ser near, bilinear, average, cubic o mode.");
  }
  if (opts.engine && !["podman", "docker"].includes(opts.engine)) {
    throw new Error("--engine debe ser podman o docker.");
  }
  opts.minzoom = integer(opts.minzoom, "--minzoom", { min: 0, max: 18 });
  opts.maxzoom = integer(opts.maxzoom, "--maxzoom", { min: opts.minzoom, max: 18 });
  opts.maxTiles = integer(opts.maxTiles, "--max-tiles", { min: 1 });
  opts.maxMb = integer(opts.maxMb, "--max-mb", { min: 1 });
  return opts;
}

export function parseSyncArgs(argv = []) {
  const opts = {
    index: false,
    check: false,
    prune: false,
    pruneSources: false,
    dryRun: false,
    layer: null,
    version: null,
    keep: RASTER_DEFAULTS.keep,
    out: RASTER_DEFAULTS.out,
    dataOut: RASTER_DEFAULTS.dataOut,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--index") opts.index = true;
    else if (arg === "--check") opts.check = true;
    else if (arg === "--prune") opts.prune = true;
    else if (arg === "--prune-sources") {
      opts.prune = true;
      opts.pruneSources = true;
    } else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--layer") opts.layer = argv[++i];
    else if (arg === "--version") opts.version = argv[++i];
    else if (arg === "--keep") opts.keep = Number(argv[++i]);
    else if (arg === "--out") opts.out = argv[++i];
    else if (arg === "--data-out") opts.dataOut = argv[++i];
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  if (opts.help) return opts;
  if (opts.layer) opts.layer = validateLayerId(opts.layer);
  if (opts.version) opts.version = validateVersion(opts.version);
  opts.keep = integer(opts.keep, "--keep", { min: 1 });
  const actions = [opts.index, opts.check, opts.prune].filter(Boolean);
  if (actions.length === 0) opts.index = true;
  return opts;
}

export function defaultLegend(min, max) {
  const rawLo = Number.isFinite(Number(min)) ? Number(min) : 0;
  const rawHi = Number.isFinite(Number(max)) ? Number(max) : 1;
  const lo = rawHi > rawLo ? rawLo : 0;
  const hi = rawHi > rawLo ? rawHi : 1;
  return {
    type: "gradient",
    min: lo,
    max: hi,
    stops: [
      { value: lo, color: "#2c7bb6" },
      { value: hi, color: "#d7191c" },
    ],
    labels: [String(lo), String(hi)],
  };
}

export function normalizeLegend(legend, min, max) {
  if (!legend || typeof legend !== "object") return defaultLegend(min, max);
  if (legend.type === "gradient") {
    if (!Array.isArray(legend.stops) || legend.stops.length < 2) {
      throw new Error("La leyenda gradient necesita al menos dos stops.");
    }
    const stops = legend.stops.map((stop) => ({
      value: Number(stop.value),
      color: String(stop.color || ""),
    }));
    if (stops.some((stop) => !Number.isFinite(stop.value) || !/^#[0-9a-f]{3,8}$/i.test(stop.color))) {
      throw new Error("Cada stop de la leyenda necesita value numérico y color hex.");
    }
    return { ...legend, stops };
  }
  if (legend.type === "classes") {
    if (!Array.isArray(legend.classes) || legend.classes.length === 0) {
      throw new Error("La leyenda classes necesita un arreglo classes.");
    }
    const classes = legend.classes.map((item, index) => ({
      id: Number.isInteger(Number(item.id)) ? Number(item.id) : index,
      min: Number(item.min),
      max: Number(item.max),
      label: String(item.label || ""),
      color: String(item.color || ""),
    }));
    if (
      classes.some(
        (item) =>
          !Number.isFinite(item.min) ||
          !Number.isFinite(item.max) ||
          !item.label ||
          !/^#[0-9a-f]{3,8}$/i.test(item.color)
      )
    ) {
      throw new Error("Cada clase necesita min, max, label y color hex.");
    }
    return { ...legend, classes };
  }
  throw new Error('La leyenda debe ser de tipo "gradient" o "classes".');
}

export function buildRasterManifest(base, tiles) {
  const sorted = [...tiles].sort((a, b) => String(a.rel).localeCompare(String(b.rel)));
  const digest = createHash("sha256");
  digest.update(
    JSON.stringify({
      layer_id: base.layer_id,
      version: base.version,
      bbox: base.bbox,
      minzoom: base.tiles.minzoom,
      maxzoom: base.tiles.maxzoom,
    })
  );
  for (const tile of sorted) {
    digest.update(`${tile.rel}:${tile.bytes}\n`);
  }
  return {
    ...base,
    tiles: {
      ...base.tiles,
      count: sorted.length,
      bytes: sorted.reduce((total, tile) => total + tile.bytes, 0),
      checksum: digest.digest("hex"),
    },
  };
}

export async function walkTiles(root, format = "webp") {
  const ext = `.${String(format).toLowerCase()}`;
  const records = [];

  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.toLowerCase().endsWith(ext)) {
        const rel = path.relative(root, full).split(path.sep).join("/");
        const info = await stat(full);
        records.push({ rel, bytes: info.size });
      }
    }
  }

  await walk(root);
  return records.sort((a, b) => a.rel.localeCompare(b.rel));
}

export async function listVersions(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const versions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, "manifest.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (manifest?.tiles) versions.push({ version: entry.name, manifest, manifestPath });
    } catch {
      // Directorio sin manifest válido: corrida cortada, se ignora.
    }
  }

  return versions.sort((a, b) =>
    String(b.manifest.generated_at || "").localeCompare(String(a.manifest.generated_at || ""))
  );
}

export async function readManifests(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const layers = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const versions = await listVersions(path.join(root, entry.name));
    if (versions.length === 0) continue;
    layers.push({
      layer_id: versions[0].manifest.layer_id || entry.name,
      layer_slug: entry.name,
      active_version: versions[0].version,
      versions,
    });
  }

  return layers.sort((a, b) => a.layer_id.localeCompare(b.layer_id));
}

export function buildRasterIndex(layers) {
  const sorted = [...layers].sort((a, b) => a.layer_id.localeCompare(b.layer_id));
  return {
    generated_at: new Date().toISOString(),
    layers: sorted.map((layer) => ({
      layer_id: layer.layer_id,
      active_version: layer.active_version,
      versions: layer.versions.map(({ version, manifest }) => ({
        version,
        manifest: `/raster/${layer.layer_slug}/${version}/manifest.json`,
        url_template: manifest.tile_url_template,
        tiles: manifest.tiles?.count ?? 0,
        bytes: manifest.tiles?.bytes ?? 0,
        checksum: manifest.tiles?.checksum ?? null,
        bbox: manifest.bbox,
        minzoom: manifest.tiles?.minzoom ?? manifest.minzoom,
        maxzoom: manifest.tiles?.maxzoom ?? manifest.maxzoom,
        maxzoom_requested:
          manifest.tiles?.maxzoom_requested ??
          manifest.maxzoom_requested ??
          manifest.tiles?.maxzoom,
        generated_at: manifest.generated_at,
      })),
    })),
  };
}

export async function verifyVersion(root, manifest) {
  const errors = [];
  const records = await walkTiles(root, manifest.tiles?.format || "webp");
  const rebuilt = buildRasterManifest(
    {
      layer_id: manifest.layer_id,
      version: manifest.version,
      bbox: manifest.bbox,
      tiles: {
        minzoom: manifest.tiles?.minzoom ?? manifest.minzoom,
        maxzoom: manifest.tiles?.maxzoom ?? manifest.maxzoom,
      },
    },
    records
  );

  if (records.length !== manifest.tiles?.count) {
    errors.push(`tiles: manifest ${manifest.tiles?.count}, en disco ${records.length}`);
  }
  if (rebuilt.tiles.bytes !== manifest.tiles?.bytes) {
    errors.push(`bytes: manifest ${manifest.tiles?.bytes}, en disco ${rebuilt.tiles.bytes}`);
  }
  if (rebuilt.tiles.checksum !== manifest.tiles?.checksum) {
    errors.push("checksum no coincide (tiles alterados o manifest editado)");
  }
  return errors;
}

function flattenCoordinates(coords, out = []) {
  if (!Array.isArray(coords)) return out;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    out.push([Number(coords[0]), Number(coords[1])]);
    return out;
  }
  for (const item of coords) flattenCoordinates(item, out);
  return out;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function mercatorToLonLat(x, y) {
  const lon = (Number(x) / 20037508.342789244) * 180;
  const lat = (Math.atan(Math.exp((Number(y) / 20037508.342789244) * Math.PI)) * 360) / Math.PI - 90;
  return [lon, lat];
}

/**
 * Normaliza la salida de `gdalinfo -json -mm`.
 * Solo acepta EPSG:4326 y EPSG:3857; el resto se reproyecta en QGIS.
 */
export function parseGdalInfo(info) {
  if (!info || typeof info !== "object") throw new Error("gdalinfo no devolvió JSON.");
  const width = finite(info.size?.[0]);
  const height = finite(info.size?.[1]);
  if (!width || !height) throw new Error("gdalinfo no devolvió un tamaño válido.");

  const wkt = String(info.coordinateSystem?.wkt || "");
  const epsgMatch =
    wkt.match(/ID\["EPSG",\s*"?(\d+)"?\]/) ||
    wkt.match(/AUTHORITY\["EPSG",\s*"?(\d+)"?\]/);
  const epsg = epsgMatch ? Number(epsgMatch[1]) : null;
  if (epsg !== 4326 && epsg !== 3857) {
    throw new Error(
      `CRS no soportado (${epsg ? `EPSG:${epsg}` : "desconocido"}). ` +
        "Exporta el ráster en EPSG:4326 o EPSG:3857."
    );
  }

  let bbox = null;
  if (info.wgs84Extent) {
    const points = flattenCoordinates(info.wgs84Extent.coordinates);
    if (points.length > 0) {
      const lons = points.map(([lon]) => lon);
      const lats = points.map(([, lat]) => lat);
      bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    }
  }

  if (!bbox && info.cornerCoordinates) {
    const corners = ["upperLeft", "lowerLeft", "lowerRight", "upperRight"]
      .map((key) => info.cornerCoordinates[key])
      .filter((point) => Array.isArray(point));
    if (corners.length > 0) {
      const points =
        epsg === 4326
          ? corners.map(([x, y]) => [x, y])
          : corners.map(([x, y]) => mercatorToLonLat(x, y));
      const lons = points.map(([lon]) => lon);
      const lats = points.map(([, lat]) => lat);
      bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    }
  }

  if (!bbox) throw new Error("gdalinfo no devolvió una extensión válida.");
  if (bbox.some((value) => !Number.isFinite(value))) {
    throw new Error("La extensión del ráster no es válida.");
  }

  const band = info.bands?.[0] || {};
  const nodata = finite(band.noDataValue);
  const min = finite(band.minimum ?? band.computedMin ?? band.min) ?? 0;
  const max = finite(band.maximum ?? band.computedMax ?? band.max) ?? 1;
  const geoTransform = Array.isArray(info.geoTransform) ? info.geoTransform : null;
  let resolution = null;
  if (geoTransform) {
    if (epsg === 3857) {
      resolution = Math.abs(Number(geoTransform[1]));
    } else {
      const centerLat = (bbox[1] + bbox[3]) / 2;
      resolution =
        Math.abs(Number(geoTransform[1])) * 111320 * Math.cos((centerLat * Math.PI) / 180);
    }
  }

  return {
    width,
    height,
    crs: `EPSG:${epsg}`,
    epsg,
    bbox,
    resolution_m: resolution ? Number(resolution.toFixed(3)) : null,
    nodata,
    values: {
      type: String(band.type || "unknown"),
      min,
      max,
    },
    band_count: Array.isArray(info.bands) ? info.bands.length : 0,
  };
}

export function lonToTile(lon, z) {
  return Math.floor(((Number(lon) + 180) / 360) * 2 ** z);
}

export function latToTile(lat, z) {
  const rad = (Number(lat) * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  );
}

function clampTile(value, z) {
  return Math.min(Math.max(value, 0), 2 ** z - 1);
}

export function estimateTileCount(bbox, minzoom, maxzoom) {
  let total = 0;
  const zooms = {};
  for (let z = minzoom; z <= maxzoom; z += 1) {
    const minX = clampTile(lonToTile(bbox[0], z), z);
    const maxX = clampTile(lonToTile(bbox[2], z), z);
    const minY = clampTile(latToTile(bbox[3], z), z);
    const maxY = clampTile(latToTile(bbox[1], z), z);
    const count = (maxX - minX + 1) * (maxY - minY + 1);
    zooms[z] = count;
    total += count;
  }
  return { total, zooms };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((item) => item.some((value) => String(value).trim() !== ""));
}

export function parseStatsCsv(text, { layerId, version } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("El CSV de estadísticas está vacío.");

  const header = rows[0].map((value, index) =>
    String(value).replace(/^\uFEFF/, "").trim().toLowerCase()
  );
  const expected = new Set(STATS_COLUMNS);
  for (const column of STATS_COLUMNS) {
    if (!header.includes(column)) {
      throw new Error(`Falta la columna "${column}" en el CSV de estadísticas.`);
    }
  }
  for (const column of header) {
    if (!expected.has(column)) {
      throw new Error(`Columna desconocida en el CSV de estadísticas: "${column}".`);
    }
  }

  const index = Object.fromEntries(header.map((column, position) => [column, position]));
  const seen = new Set();
  const result = [];

  for (const raw of rows.slice(1)) {
    const value = (column) => String(raw[index[column]] ?? "").trim();
    const numberOrNull = (column) => {
      const textValue = value(column);
      if (textValue === "") return null;
      const number = Number(textValue);
      if (!Number.isFinite(number)) throw new Error(`Valor no numérico en ${column}: "${textValue}".`);
      return number;
    };

    const adminLevel = value("admin_level").toLowerCase();
    if (!ADMIN_LEVELS.has(adminLevel)) {
      throw new Error(`admin_level inválido: "${adminLevel}".`);
    }
    const adminCode = value("admin_code");
    const adminName = value("admin_name");
    if (!adminCode || !adminName) {
      throw new Error("admin_code y admin_name son obligatorios en cada fila.");
    }

    const classIdText = value("class_id");
    const classId = classIdText === "" ? -1 : Number.parseInt(classIdText, 10);
    if (!Number.isInteger(classId)) throw new Error(`class_id inválido: "${classIdText}".`);

    const key = `${adminLevel}:${adminCode}:${classId}`;
    if (seen.has(key)) throw new Error(`Fila duplicada en el CSV: ${key}.`);
    seen.add(key);

    result.push({
      layer_id: layerId,
      version,
      admin_level: adminLevel,
      admin_code: adminCode,
      admin_name: adminName,
      class_id: classId,
      class_label: value("class_label") || null,
      class_min: numberOrNull("class_min"),
      class_max: numberOrNull("class_max"),
      hectares: numberOrNull("hectares"),
      mean: numberOrNull("mean"),
      min: numberOrNull("min"),
      max: numberOrNull("max"),
      p10: numberOrNull("p10"),
      p90: numberOrNull("p90"),
    });
  }

  return result;
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(2)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}
