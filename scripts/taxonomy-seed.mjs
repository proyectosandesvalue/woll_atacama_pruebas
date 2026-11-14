#!/usr/bin/env node
/**
 * Siembra la taxonomía normalizada desde el snapshot activo (o desde
 * `js/config/allTemasConfig.js` con `--from-js`).
 *
 * Sprint 46-A (docs/specs/45-panel-admin-operaciones/00-spec-madre.md).
 *
 * Uso:
 *   npm run taxonomy:seed -- --dry-run
 *   npm run taxonomy:seed
 *   npm run taxonomy:seed -- --force
 *
 * Requiere DATABASE_ADMIN_URL o DATABASE_URL. No publica el snapshot; para eso
 * está `npm run taxonomy:compile -- --publish`.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { dryRun: false, force: false, fromJs: false, help: false };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--from-js") opts.fromJs = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return opts;
}

async function loadJsConfig() {
  const url = pathToFileURL(
    path.join(ROOT, "js", "config", "allTemasConfig.js")
  ).href;
  const mod = await import(url);
  return mod.default ?? mod.allTemasConfig;
}

async function loadActiveSnapshot(client) {
  const rows = await client.query(
    "SELECT content FROM admin.config_snapshots WHERE active ORDER BY version DESC LIMIT 1"
  );
  return rows.rows[0]?.content || null;
}

/**
 * Convierte una config en filas normalizadas.
 *
 * @param {object} config
 */
export function buildTaxonomy(config) {
  const dimensions = [];
  const groups = [];
  const subgroups = [];
  const layers = new Map();
  const placements = [];
  const initial = [];

  for (const [dimensionKey, tema] of Object.entries(config || {})) {
    if (!tema || typeof tema !== "object") continue;
    const dimensionExtra = Object.fromEntries(
      Object.entries(tema).filter(
        ([key]) => !["nombre", "icono", "capas", "grupos", "estilo", "cargaInicial"].includes(key)
      )
    );
    dimensions.push({
      key: dimensionKey,
      nombre: tema.nombre || dimensionKey,
      icono: tema.icono || null,
      extra: dimensionExtra,
      orden: dimensions.length,
    });

    const estilo = tema.estilo || {};
    const layerMeta = (layerKey) => {
      const cfg = estilo[layerKey] || {};
      if (!layers.has(layerKey)) {
        layers.set(layerKey, {
          layer_key: layerKey,
          nombre: cfg.nombrePersonalizado || layerKey,
          tipo: cfg.type || cfg.tipo || null,
          source_type: cfg.source?.type || null,
          has_tiles: Boolean(cfg.source?.tiles),
          config: cfg,
        });
      }
      return cfg;
    };

    (Array.isArray(tema.capas) ? tema.capas : []).forEach((layerKey, index) => {
      layerMeta(layerKey);
      placements.push({
        dimension_key: dimensionKey,
        scope: "master",
        group_key: null,
        subgroup_key: null,
        layer_key: layerKey,
        config: estilo[layerKey] || {},
        orden: index,
      });
    });

    const groupIndex = new Map();
    Object.entries(tema.grupos || {}).forEach(([groupKey, group], index) => {
      if (!group || typeof group !== "object") return;
      groupIndex.set(groupKey, index);
      const groupExtra = Object.fromEntries(
        Object.entries(group).filter(
          ([key]) => !["nombre", "capas", "subgrupos"].includes(key)
        )
      );
      groups.push({
        dimension_key: dimensionKey,
        key: groupKey,
        nombre: group.nombre || groupKey,
        extra: groupExtra,
        orden: index,
      });

      (Array.isArray(group.capas) ? group.capas : []).forEach((layerKey, order) => {
        layerMeta(layerKey);
        placements.push({
          dimension_key: dimensionKey,
          scope: "group",
          group_key: groupKey,
          subgroup_key: null,
          layer_key: layerKey,
          config: estilo[layerKey] || {},
          orden: order,
        });
      });

      Object.entries(group.subgrupos || {}).forEach(([subgroupKey, subgroup], subIndex) => {
        if (!subgroup || typeof subgroup !== "object") return;
        const subgroupExtra = Object.fromEntries(
          Object.entries(subgroup).filter(
            ([key]) => !["nombre", "capas"].includes(key)
          )
        );
        subgroups.push({
          dimension_key: dimensionKey,
          group_key: groupKey,
          key: subgroupKey,
          nombre: subgroup.nombre || subgroupKey,
          extra: subgroupExtra,
          orden: subIndex,
        });

        (Array.isArray(subgroup.capas) ? subgroup.capas : []).forEach((layerKey, order) => {
          layerMeta(layerKey);
          placements.push({
            dimension_key: dimensionKey,
            scope: "subgroup",
            group_key: groupKey,
            subgroup_key: subgroupKey,
            layer_key: layerKey,
            config: estilo[layerKey] || {},
            orden: order,
          });
        });
      });
    });

    (tema.cargaInicial?.grupos || []).forEach((groupKey, index) => {
      if (!groupIndex.has(groupKey)) return;
      initial.push({
        dimension_key: dimensionKey,
        kind: "group",
        group_key: groupKey,
        layer_key: null,
        orden: index,
      });
    });
    (tema.cargaInicial?.capas || []).forEach((layerKey, index) => {
      layerMeta(layerKey);
      initial.push({
        dimension_key: dimensionKey,
        kind: "layer",
        group_key: null,
        layer_key: layerKey,
        orden: index,
      });
    });
  }

  return {
    dimensions,
    groups,
    subgroups,
    layers: [...layers.values()],
    placements,
    initial,
  };
}

async function insertTaxonomy(client, taxonomy) {
  await client.query("BEGIN");
  try {
    await client.query(
      `TRUNCATE admin.dimension_initial_items, admin.layer_placements,
                admin.subgroups, admin.groups, admin.dimensions, admin.layers
       RESTART IDENTITY CASCADE`
    );

    const dimensionIds = new Map();
    for (const dimension of taxonomy.dimensions) {
      const rows = await client.query(
        `INSERT INTO admin.dimensions (key, nombre, icono, extra, orden, activo, updated_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, true, 'taxonomy-seed')
         RETURNING id`,
        [dimension.key, dimension.nombre, dimension.icono, JSON.stringify(dimension.extra || {}), dimension.orden]
      );
      dimensionIds.set(dimension.key, Number(rows.rows[0].id));
    }

    const groupIds = new Map();
    for (const group of taxonomy.groups) {
      const rows = await client.query(
        `INSERT INTO admin.groups (dimension_id, key, nombre, extra, orden, activo, updated_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, true, 'taxonomy-seed')
         RETURNING id`,
        [
          dimensionIds.get(group.dimension_key),
          group.key,
          group.nombre,
          JSON.stringify(group.extra || {}),
          group.orden,
        ]
      );
      groupIds.set(`${group.dimension_key}\u0000${group.key}`, Number(rows.rows[0].id));
    }

    const subgroupIds = new Map();
    for (const subgroup of taxonomy.subgroups) {
      const rows = await client.query(
        `INSERT INTO admin.subgroups (group_id, key, nombre, extra, orden, activo, updated_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, true, 'taxonomy-seed')
         RETURNING id`,
        [
          groupIds.get(`${subgroup.dimension_key}\u0000${subgroup.group_key}`),
          subgroup.key,
          subgroup.nombre,
          JSON.stringify(subgroup.extra || {}),
          subgroup.orden,
        ]
      );
      subgroupIds.set(
        `${subgroup.dimension_key}\u0000${subgroup.group_key}\u0000${subgroup.key}`,
        Number(rows.rows[0].id)
      );
    }

    const layerIds = new Map();
    for (const layer of taxonomy.layers) {
      const rows = await client.query(
        `INSERT INTO admin.layers
           (layer_key, nombre, tipo, source_type, has_tiles, config, activo, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, true, 'taxonomy-seed')
         RETURNING id`,
        [
          layer.layer_key,
          layer.nombre,
          layer.tipo,
          layer.source_type,
          layer.has_tiles,
          JSON.stringify(layer.config || {}),
        ]
      );
      layerIds.set(layer.layer_key, Number(rows.rows[0].id));
    }

    for (const placement of taxonomy.placements) {
      const groupId = placement.group_key
        ? groupIds.get(`${placement.dimension_key}\u0000${placement.group_key}`)
        : null;
      const subgroupId = placement.subgroup_key
        ? subgroupIds.get(
            `${placement.dimension_key}\u0000${placement.group_key}\u0000${placement.subgroup_key}`
          )
        : null;
      await client.query(
        `INSERT INTO admin.layer_placements
           (layer_id, dimension_id, group_id, subgroup_id, scope, config, orden, activo, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, true, 'taxonomy-seed')`,
        [
          layerIds.get(placement.layer_key),
          dimensionIds.get(placement.dimension_key),
          groupId,
          subgroupId,
          placement.scope,
          JSON.stringify(placement.config || {}),
          placement.orden,
        ]
      );
    }

    for (const item of taxonomy.initial) {
      await client.query(
        `INSERT INTO admin.dimension_initial_items
           (dimension_id, kind, group_id, layer_id, orden)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          dimensionIds.get(item.dimension_key),
          item.kind,
          item.group_key
            ? groupIds.get(`${item.dimension_key}\u0000${item.group_key}`)
            : null,
          item.layer_key ? layerIds.get(item.layer_key) : null,
          item.orden,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "Uso: node scripts/taxonomy-seed.mjs [--dry-run] [--force] [--from-js]\n" +
        "Requiere DATABASE_ADMIN_URL o DATABASE_URL."
    );
    return;
  }

  let config;
  let client = null;
  try {
    if (!opts.fromJs) {
      const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
      if (url) {
        client = new Client({ connectionString: url });
        await client.connect();
        config = await loadActiveSnapshot(client);
        if (config) console.log("[taxonomy:seed] usando snapshot activo.");
      }
    }
    if (!config) {
      config = await loadJsConfig();
      console.log("[taxonomy:seed] usando js/config/allTemasConfig.js.");
    }
    if (!config) throw new Error("No hay configuración para sembrar.");

    const taxonomy = buildTaxonomy(config);
    console.log(
      `[taxonomy:seed] dimensiones=${taxonomy.dimensions.length} ` +
        `grupos=${taxonomy.groups.length} subgrupos=${taxonomy.subgroups.length} ` +
        `capas=${taxonomy.layers.length} asignaciones=${taxonomy.placements.length} ` +
        `iniciales=${taxonomy.initial.length}`
    );

    if (opts.dryRun) {
      console.log("[taxonomy:seed] dry-run: no se escribió nada.");
      return;
    }
    if (!client) {
      const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
      if (!url) throw new Error("Falta DATABASE_ADMIN_URL o DATABASE_URL.");
      client = new Client({ connectionString: url });
      await client.connect();
    }

    if (!opts.force) {
      const rows = await client.query("SELECT count(*)::int AS n FROM admin.dimensions");
      if (rows.rows[0].n > 0) {
        throw new Error(
          "La taxonomía ya tiene datos. Usa --force para reemplazarla."
        );
      }
    }

    await insertTaxonomy(client, taxonomy);
    console.log("[taxonomy:seed] taxonomía sembrada.");
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((err) => {
    console.error("[taxonomy:seed] error:", err?.message || err);
    process.exitCode = 1;
  });
}
