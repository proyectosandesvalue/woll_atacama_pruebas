#!/usr/bin/env node
/**
 * Publica la configuración del visor como snapshot versionado.
 *
 * Sprint 14 (docs/specs/14-15-panel-admin.md).
 *
 * Uso:
 *   npm run config:snapshot -- --dry-run     # valida e imprime, no escribe
 *   npm run config:snapshot -- --publish     # publica el snapshot activo
 *   npm run config:snapshot -- --check       # falla si el activo difiere
 *
 * Requiere DATABASE_ADMIN_URL (o DATABASE_URL) para --publish/--check.
 * El snapshot es la config completa de `allTemasConfig`; `admin.config_layers`
 * es un índice plano para el panel admin.
 */

import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import { validarConfiguracionGlobal } from "../js/utils/configValidator.js";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/**
 * Serialización estable (claves ordenadas) para que el checksum no dependa
 * del orden de inserción de las propiedades.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])])
    );
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

/**
 * @param {object} config
 * @returns {string} SHA-256 hex.
 */
export function checksum(config) {
  return createHash("sha256").update(stableStringify(config)).digest("hex");
}

function layerConfigFor(estilo, layerKey) {
  return estilo && Object.prototype.hasOwnProperty.call(estilo, layerKey)
    ? estilo[layerKey]
    : {};
}

/**
 * Convierte la config en filas planas para `admin.config_layers`.
 *
 * - `master`: lista `capas` del tema (índice maestro).
 * - `group`: capas directas de un grupo.
 * - `subgroup`: capas de un subgrupo (clima/ARClim).
 *
 * Una misma capa puede aparecer en master y en uno o más grupos: es el diseño
 * actual (`capas` es el índice maestro y los grupos reutilizan subconjuntos).
 *
 * @param {object} config
 * @returns {Array<object>}
 */
export function flattenLayers(config) {
  const rows = [];

  for (const [dimensionKey, tema] of Object.entries(config || {})) {
    if (!tema || typeof tema !== "object") continue;
    const estilo = tema.estilo || {};

    const push = (layerKey, { scope, groupKey = null, subgroupKey = null, ordinal }) => {
      if (typeof layerKey !== "string" || layerKey.length === 0) return;
      const layerConfig = layerConfigFor(estilo, layerKey);
      rows.push({
        dimension_key: dimensionKey,
        group_key: groupKey,
        subgroup_key: subgroupKey,
        scope,
        layer_key: layerKey,
        nombre: layerConfig.nombrePersonalizado || layerKey,
        tipo: layerConfig.type || layerConfig.tipo || null,
        source_type: layerConfig.source?.type || null,
        has_tiles: Boolean(layerConfig.source?.tiles || layerConfig.source?.raster),
        ordinal,
        config: layerConfig,
      });
    };

    (Array.isArray(tema.capas) ? tema.capas : []).forEach((layerKey, index) => {
      push(layerKey, { scope: "master", ordinal: index });
    });

    for (const [groupKey, group] of Object.entries(tema.grupos || {})) {
      if (!group || typeof group !== "object") continue;

      (Array.isArray(group.capas) ? group.capas : []).forEach((layerKey, index) => {
        push(layerKey, { scope: "group", groupKey, ordinal: index });
      });

      for (const [subgroupKey, subgroup] of Object.entries(group.subgrupos || {})) {
        if (!subgroup || typeof subgroup !== "object") continue;
        (Array.isArray(subgroup.capas) ? subgroup.capas : []).forEach(
          (layerKey, index) => {
            push(layerKey, {
              scope: "subgroup",
              groupKey,
              subgroupKey,
              ordinal: index,
            });
          }
        );
      }
    }
  }

  return rows;
}

/**
 * @param {object} config
 * @returns {{dimensions:number, layers:number, rows:number, checksum:string}}
 */
export function summarize(config) {
  const rows = flattenLayers(config);
  return {
    dimensions: Object.keys(config || {}).length,
    layers: rows.filter((row) => row.scope === "master").length,
    rows: rows.length,
    checksum: checksum(config),
  };
}

/**
 * Carga y valida `js/config/allTemasConfig.js` sin depender del navegador.
 *
 * @returns {Promise<object>}
 */
export async function loadConfig() {
  const url = pathToFileURL(
    path.join(ROOT, "js", "config", "allTemasConfig.js")
  ).href;
  const mod = await import(url);
  const config = mod.default ?? mod.allTemasConfig;
  if (!config || typeof config !== "object") {
    throw new Error("allTemasConfig no exporta un objeto válido.");
  }
  return config;
}

/**
 * Inserta el snapshot y sus capas en una transacción y activa la versión.
 *
 * @param {import("pg").Client} client
 * @param {object} config
 * @param {{
 *   source?: string,
 *   notes?: string|null,
 *   by?: string|null,
 *   force?: boolean
 * }} [opts]
 * @returns {Promise<{version:number|null, skipped:boolean, checksum:string}>}
 */
export async function publishSnapshot(client, config, opts = {}) {
  const hash = checksum(config);
  const source = opts.source || "js";
  const notes = opts.notes || null;
  const by = opts.by || "cli";
  const rows = flattenLayers(config);

  const active = await client.query(
    "SELECT version, checksum FROM admin.config_snapshots WHERE active LIMIT 1"
  );
  if (!opts.force && active.rows[0]?.checksum === hash) {
    return { version: null, skipped: true, checksum: hash };
  }

  await client.query("BEGIN");
  try {
    const inserted = await client.query(
      `INSERT INTO admin.config_snapshots
         (content, checksum, source, notes, created_by, active)
       VALUES ($1::jsonb, $2, $3, $4, $5, false)
       RETURNING version`,
      [JSON.stringify(config), hash, source, notes, by]
    );
    const version = Number(inserted.rows[0].version);

    for (const row of rows) {
      await client.query(
        `INSERT INTO admin.config_layers
           (snapshot_version, dimension_key, group_key, subgroup_key, scope,
            layer_key, nombre, tipo, source_type, has_tiles, ordinal, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
        [
          version,
          row.dimension_key,
          row.group_key,
          row.subgroup_key,
          row.scope,
          row.layer_key,
          row.nombre,
          row.tipo,
          row.source_type,
          row.has_tiles,
          row.ordinal,
          JSON.stringify(row.config || {}),
        ]
      );
    }

    await client.query(
      "UPDATE admin.config_snapshots SET active = false WHERE active"
    );
    await client.query(
      "UPDATE admin.config_snapshots SET active = true WHERE version = $1",
      [version]
    );
    await client.query("COMMIT");
    return { version, skipped: false, checksum: hash };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    publish: false,
    check: false,
    force: false,
    source: "js",
    notes: null,
    by: "cli",
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--publish") opts.publish = true;
    else if (arg === "--check") opts.check = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--source") opts.source = argv[++i];
    else if (arg === "--notes") opts.notes = argv[++i];
    else if (arg === "--by") opts.by = argv[++i];
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  if (!opts.dryRun && !opts.publish && !opts.check) opts.dryRun = true;
  return opts;
}

function connectionString() {
  return process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || "";
}

async function withClient(fn) {
  const url = connectionString();
  if (!url) {
    throw new Error(
      "Falta DATABASE_ADMIN_URL o DATABASE_URL para publicar/verificar el snapshot."
    );
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(
      "Uso: node scripts/config-snapshot.mjs [--dry-run|--publish|--check] [--force] [--source js] [--notes texto] [--by usuario]"
    );
    return;
  }

  const config = await loadConfig();
  const validation = validarConfiguracionGlobal(config);
  if (validation.errores > 0) {
    throw new Error(
      `La configuración tiene ${validation.errores} error(es); no se publica.`
    );
  }

  const summary = summarize(config);
  console.log(
    `[config:snapshot] dimensiones=${summary.dimensions} capas=${summary.layers} ` +
      `filas=${summary.rows} checksum=${summary.checksum.slice(0, 12)}…`
  );

  if (opts.dryRun) {
    console.log("[config:snapshot] dry-run: no se escribió nada.");
    return;
  }

  await withClient(async (client) => {
    if (opts.check) {
      const active = await client.query(
        "SELECT version, checksum FROM admin.config_snapshots WHERE active LIMIT 1"
      );
      const current = active.rows[0]?.checksum;
      if (!current) {
        console.error("[config:snapshot] no hay snapshot activo.");
        process.exitCode = 1;
        return;
      }
      if (current !== summary.checksum) {
        console.error(
          `[config:snapshot] el snapshot activo v${active.rows[0].version} ` +
            `(${String(current).slice(0, 12)}…) no coincide con la config ` +
            `(${summary.checksum.slice(0, 12)}…).`
        );
        process.exitCode = 1;
        return;
      }
      console.log(
        `[config:snapshot] OK: el snapshot activo v${active.rows[0].version} coincide.`
      );
      return;
    }

    const result = await publishSnapshot(client, config, opts);
    if (result.skipped) {
      console.log(
        `[config:snapshot] sin cambios: el snapshot activo ya tiene checksum ${result.checksum.slice(0, 12)}…`
      );
      return;
    }
    console.log(
      `[config:snapshot] publicado v${result.version} (${result.checksum.slice(0, 12)}…) con ${summary.rows} filas de capas.`
    );
  });
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((err) => {
    console.error("[config:snapshot] error:", err?.message || err);
    process.exitCode = 1;
  });
}
