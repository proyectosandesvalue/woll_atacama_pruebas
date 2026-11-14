#!/usr/bin/env node
/**
 * Compila la taxonomía normalizada al shape de `allTemasConfig`, valida y
 * publica un snapshot.
 *
 * Sprint 46-A (docs/specs/45-panel-admin-operaciones/00-spec-madre.md).
 *
 * Uso:
 *   npm run taxonomy:compile -- --dry-run
 *   npm run taxonomy:compile -- --publish --notes "nueva dimensión"
 *   npm run taxonomy:compile -- --check
 *
 * Requiere DATABASE_ADMIN_URL o DATABASE_URL.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import { checksum, publishSnapshot, summarize } from "./config-snapshot.mjs";
import { validarConfiguracionGlobal } from "../js/utils/configValidator.js";

const { Client } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { dryRun: false, publish: false, check: false, notes: null, by: "taxonomy-compile", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--publish") opts.publish = true;
    else if (arg === "--check") opts.check = true;
    else if (arg === "--notes") opts.notes = argv[++i];
    else if (arg === "--by") opts.by = argv[++i];
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (!opts.dryRun && !opts.publish && !opts.check) opts.dryRun = true;
  return opts;
}

function sortedByOrder(items) {
  return [...items].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

/**
 * @param {{
 *   dimensions: any[], groups: any[], subgroups: any[],
 *   layers: any[], placements: any[], initial: any[]
 * }} rows
 */
export function compileConfigFromRows(rows) {
  const layersById = new Map(rows.layers.map((layer) => [Number(layer.id), layer]));
  const config = {};
  const warnings = [];

  for (const dimension of sortedByOrder(rows.dimensions)) {
    const dimensionKey = dimension.key;
    const dimensionPlacements = sortedByOrder(
      rows.placements.filter((placement) => placement.dimension_key === dimensionKey)
    );
    const dimensionGroups = sortedByOrder(
      rows.groups.filter((group) => group.dimension_key === dimensionKey)
    );
    const dimensionSubgroups = rows.subgroups.filter(
      (subgroup) => subgroup.dimension_key === dimensionKey
    );
    const initialItems = rows.initial.filter(
      (item) => item.dimension_key === dimensionKey
    );

    const layerConfig = (placement) =>
      placement.config ??
      layersById.get(Number(placement.layer_id))?.config ??
      {};

    const usedLayers = new Set();
    const master = dimensionPlacements
      .filter((placement) => placement.scope === "master")
      .map((placement) => {
        usedLayers.add(placement.layer_key);
        return placement.layer_key;
      });

    const grupos = {};
    for (const group of dimensionGroups) {
      const groupKey = group.key;
      const direct = dimensionPlacements
        .filter(
          (placement) =>
            placement.scope === "group" &&
            placement.group_key === groupKey
        )
        .map((placement) => {
          usedLayers.add(placement.layer_key);
          return placement.layer_key;
        });

      const subgroups = {};
      for (const subgroup of sortedByOrder(
        dimensionSubgroups.filter((item) => item.group_key === groupKey)
      )) {
        const subgroupLayers = dimensionPlacements
          .filter(
            (placement) =>
              placement.scope === "subgroup" &&
              placement.group_key === groupKey &&
              placement.subgroup_key === subgroup.key
          )
          .map((placement) => {
            usedLayers.add(placement.layer_key);
            return placement.layer_key;
          });
        if (subgroupLayers.length > 0) {
          subgroups[subgroup.key] = {
            ...(subgroup.extra || {}),
            nombre: subgroup.nombre,
            capas: subgroupLayers,
          };
        }
      }

      const compiledGroup = { ...(group.extra || {}), nombre: group.nombre };
      if (direct.length > 0) compiledGroup.capas = direct;
      if (Object.keys(subgroups).length > 0) compiledGroup.subgrupos = subgroups;
      grupos[groupKey] = compiledGroup;
    }

    const initialGroups = sortedByOrder(
      initialItems.filter((item) => item.kind === "group")
    ).map((item) => item.group_key);
    const initialLayers = sortedByOrder(
      initialItems.filter((item) => item.kind === "layer")
    ).map((item) => item.layer_key);

    const estilo = {};
    for (const placement of dimensionPlacements) {
      if (estilo[placement.layer_key]) continue;
      estilo[placement.layer_key] = layerConfig(placement);
    }
    for (const layerKey of initialLayers) {
      if (estilo[layerKey]) continue;
      const placement = dimensionPlacements.find((item) => item.layer_key === layerKey);
      const layer = rows.layers.find((item) => item.layer_key === layerKey);
      estilo[layerKey] = placement ? layerConfig(placement) : layer?.config || {};
      usedLayers.add(layerKey);
    }

    // Detecta variantes distintas de la misma capa dentro de una dimensión.
    const variants = new Map();
    for (const placement of dimensionPlacements) {
      const value = JSON.stringify(layerConfig(placement));
      if (!variants.has(placement.layer_key)) variants.set(placement.layer_key, value);
      else if (variants.get(placement.layer_key) !== value) {
        warnings.push(
          `La capa ${placement.layer_key} tiene variantes de estilo en ${dimensionKey}; se usa la primera.`
        );
      }
    }

    const compiled = {
      ...(dimension.extra || {}),
      capas: master,
      grupos,
      estilo,
    };
    // Solo se materializa el nombre si difiere de la clave; así el snapshot
    // compilado conserva la forma histórica del visor.
    if (dimension.nombre && dimension.nombre !== dimension.key) {
      compiled.nombre = dimension.nombre;
    }
    if (dimension.icono) compiled.icono = dimension.icono;
    if (initialGroups.length > 0 || initialLayers.length > 0) {
      compiled.cargaInicial = {};
      if (initialGroups.length > 0) compiled.cargaInicial.grupos = initialGroups;
      if (initialLayers.length > 0) compiled.cargaInicial.capas = initialLayers;
    }
    config[dimensionKey] = compiled;
  }

  return { config, warnings };
}

async function loadRows(client) {
  // Secuencial: `pg` no permite queries concurrentes sobre un mismo Client.
  const dimensions = await client.query(
    "SELECT id, key, nombre, icono, extra, orden FROM admin.dimensions WHERE activo ORDER BY orden, key"
  );
  const groups = await client.query(
    `SELECT g.id, g.key, g.nombre, g.extra, g.orden, d.key AS dimension_key
       FROM admin.groups g
       JOIN admin.dimensions d ON d.id = g.dimension_id
      WHERE g.activo AND d.activo
      ORDER BY g.orden, g.key`
  );
  const subgroups = await client.query(
    `SELECT s.id, s.key, s.nombre, s.extra, s.orden, g.key AS group_key,
            d.key AS dimension_key
       FROM admin.subgroups s
       JOIN admin.groups g ON g.id = s.group_id
       JOIN admin.dimensions d ON d.id = g.dimension_id
      WHERE s.activo AND g.activo AND d.activo
      ORDER BY s.orden, s.key`
  );
  const layers = await client.query(
    "SELECT id, layer_key, nombre, tipo, source_type, has_tiles, config FROM admin.layers WHERE activo"
  );
  const placements = await client.query(
    `SELECT p.id, p.scope, p.config, p.orden, p.layer_id,
            l.layer_key, d.key AS dimension_key,
            g.key AS group_key, s.key AS subgroup_key
       FROM admin.layer_placements p
       JOIN admin.layers l ON l.id = p.layer_id
       JOIN admin.dimensions d ON d.id = p.dimension_id
       LEFT JOIN admin.groups g ON g.id = p.group_id
       LEFT JOIN admin.subgroups s ON s.id = p.subgroup_id
      WHERE p.activo AND l.activo AND d.activo
      ORDER BY p.orden, p.id`
  );
  const initial = await client.query(
    `SELECT i.id, i.kind, i.orden, d.key AS dimension_key,
            g.key AS group_key, l.layer_key
       FROM admin.dimension_initial_items i
       JOIN admin.dimensions d ON d.id = i.dimension_id
       LEFT JOIN admin.groups g ON g.id = i.group_id
       LEFT JOIN admin.layers l ON l.id = i.layer_id
      WHERE d.activo
      ORDER BY i.orden, i.id`
  );

  return {
    dimensions: dimensions.rows,
    groups: groups.rows,
    subgroups: subgroups.rows,
    layers: layers.rows,
    placements: placements.rows,
    initial: initial.rows,
  };
}

function connectionString() {
  return process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || "";
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      "Uso: node scripts/taxonomy-compile.mjs [--dry-run|--publish|--check] [--notes texto] [--by usuario]"
    );
    return;
  }

  const url = connectionString();
  if (!url) throw new Error("Falta DATABASE_ADMIN_URL o DATABASE_URL.");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const rows = await loadRows(client);
    const { config, warnings } = compileConfigFromRows(rows);
    const summary = summarize(config);
    const validation = validarConfiguracionGlobal(config);

    console.log(
      `[taxonomy:compile] dimensiones=${rows.dimensions.length} ` +
        `capas=${summary.layers} filas=${summary.rows} checksum=${summary.checksum.slice(0, 12)}…`
    );
    for (const warning of warnings) console.warn(`[taxonomy:compile] aviso: ${warning}`);
    if (validation.errores > 0) {
      throw new Error(`La taxonomía tiene ${validation.errores} error(es); no se publica.`);
    }
    if (validation.advertencias > 0) {
      console.warn(`[taxonomy:compile] ${validation.advertencias} advertencia(s) de config.`);
    }

    if (opts.dryRun) {
      console.log("[taxonomy:compile] dry-run: no se escribió nada.");
      return;
    }

    if (opts.check) {
      const active = await client.query(
        "SELECT version, checksum FROM admin.config_snapshots WHERE active LIMIT 1"
      );
      const current = active.rows[0]?.checksum;
      if (!current) throw new Error("No hay snapshot activo.");
      if (current !== summary.checksum) {
        throw new Error(
          `El snapshot activo v${active.rows[0].version} no coincide con la taxonomía.`
        );
      }
      console.log(`[taxonomy:compile] OK: snapshot v${active.rows[0].version} coincide.`);
      return;
    }

    const result = await publishSnapshot(client, config, {
      source: "panel",
      notes: opts.notes,
      by: opts.by,
      force: true,
    });
    console.log(
      result.skipped
        ? "[taxonomy:compile] sin cambios: el snapshot ya coincide."
        : `[taxonomy:compile] publicado v${result.version}.`
    );
  } finally {
    await client.end().catch(() => {});
  }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((err) => {
    console.error("[taxonomy:compile] error:", err?.message || err);
    process.exitCode = 1;
  });
}
