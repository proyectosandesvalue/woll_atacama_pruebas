#!/usr/bin/env node
/**
 * Aceptación automática del Sprint 08.
 *
 * Requiere el stack local/VPS levantado (Nginx + API + PostgreSQL) y los tiles
 * generados. No modifica datos.
 *
 * Uso:
 *   npm run acceptance:08
 *   ACCEPTANCE_BASE_URL=http://127.0.0.1:8090 npm run acceptance:08
 *
 * Variables opcionales:
 *   DATABASE_ADMIN_URL  para comparar conteos con SQL.
 *
 * Sprint 08 / 30.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const BASE = process.env.ACCEPTANCE_BASE_URL || "http://127.0.0.1:8090";
const LAYER = "borde_costero";
const VERSION = "2026";
const results = [];
let failures = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    failures += 1;
    results.push({ name, ok: false, error: err.message });
    console.error(`FAIL ${name} — ${err.message}`);
  }
}

async function fetchOk(url, options) {
  const res = await fetch(`${BASE}${url}`, options);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res;
}

async function fetchJson(url) {
  const res = await fetchOk(url, { headers: { Accept: "application/json" } });
  return res.json();
}

function countLines(text) {
  return text.split(/\r?\n/).filter((line) => line.length > 0).length;
}

async function main() {
  console.log(`[acceptance:08] base=${BASE}`);
  let db = null;
  if (process.env.DATABASE_ADMIN_URL) {
    db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 2 });
  }

  await check("tiles/index.json con capas y manifests", async () => {
    const index = JSON.parse(await readFile("tiles/index.json", "utf8"));
    if (!Array.isArray(index.layers) || index.layers.length < 40) {
      throw new Error(`capas en índice: ${index.layers?.length}`);
    }
    for (const layer of index.layers) {
      for (const version of layer.versions) {
        const manifestPath = version.manifest.replace(/^\//, "");
        await stat(manifestPath);
      }
    }
    return `${index.layers.length} capas`;
  });

  await check("configs con source PostGIS", async () => {
    const files = (await readdir("js/config")).filter((file) => file.endsWith(".js"));
    let count = 0;
    for (const file of files) {
      const text = await readFile(path.join("js/config", file), "utf8");
      for (const match of text.matchAll(/urlTemplate: "\/tiles\/([^/]+)\/([^/]+)\//g)) {
        count += 1;
        await stat(path.join("tiles", match[1], match[2], "manifest.json"));
      }
    }
    if (count < 40) throw new Error(`sources: ${count}`);
    return `${count} sources`;
  });

  await check("tile estático", async () => {
    const res = await fetchOk(`/tiles/${LAYER}/${VERSION}/10/308/596.mvt`);
    const type = res.headers.get("content-type") || "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (!type.includes("mapbox-vector-tile") || buf.length === 0) {
      throw new Error(`content-type=${type} bytes=${buf.length}`);
    }
    return `${buf.length} bytes`;
  });

  await check("tile on-demand", async () => {
    const url = `/api/layer-tiles?layer_id=${LAYER}&z=10&x=308&y=596`;
    const res = await fetchOk(url);
    const type = res.headers.get("content-type") || "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (!type.includes("mapbox-vector-tile") || buf.length === 0) {
      throw new Error(`content-type=${type} bytes=${buf.length}`);
    }
    return `${buf.length} bytes`;
  });

  await check("tile on-demand fuera de cobertura → 204", async () => {
    const res = await fetch(
      `${BASE}/api/layer-tiles?layer_id=${LAYER}&z=14&x=0&y=0`
    );
    if (res.status !== 204) throw new Error(`HTTP ${res.status}`);
    return "204";
  });

  const all = await fetchJson(
    `/api/layer-features?layer_id=${LAYER}&limit=2&offset=0`
  );
  await check("features: total del manifest y paginación", async () => {
    const manifest = JSON.parse(
      await readFile(`tiles/${LAYER}/${VERSION}/manifest.json`, "utf8")
    );
    if (all.total !== manifest.feature_count) {
      throw new Error(`total=${all.total}, manifest=${manifest.feature_count}`);
    }
    if (all.returned !== 2) throw new Error(`returned=${all.returned}`);
    return `total=${all.total}`;
  });

  const filtered = await fetchJson(
    `/api/layer-features?layer_id=${LAYER}&limit=100&filter=` +
      encodeURIComponent(
        JSON.stringify({
          op: "and",
          conditions: [{ column: "ZONA_1", operator: "in", value: ["ZP"] }],
        })
      )
  );
  await check("features: filtro ZONA_1=ZP", async () => {
    if (filtered.total <= 0 || filtered.total >= all.total) {
      throw new Error(`total filtrado=${filtered.total}`);
    }
    if (filtered.total !== filtered.returned) {
      throw new Error(`total=${filtered.total}, returned=${filtered.returned}`);
    }
    return `total=${filtered.total}`;
  });

  if (db) {
    await check("SQL: conteo del filtro coincide", async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM public.${LAYER} WHERE "ZONA_1" = 'ZP'`
      );
      if (rows[0].n !== filtered.total) {
        throw new Error(`SQL=${rows[0].n}, API=${filtered.total}`);
      }
      return `SQL=${rows[0].n}`;
    });
  }

  await check("features: búsqueda y orden", async () => {
    const page = await fetchJson(
      `/api/layer-features?layer_id=${LAYER}&limit=5&search=ZP&sort=ZONA_1&order=desc`
    );
    if (page.total <= 0) throw new Error("sin resultados de búsqueda");
    if (page.sort !== "ZONA_1" || page.order !== "desc") {
      throw new Error(`sort=${page.sort}, order=${page.order}`);
    }
    return `total=${page.total}`;
  });

  await check("feature puntual con geometría", async () => {
    const feature = await fetchJson(
      `/api/layer-feature?layer_id=${LAYER}&id=3&id_column=fid`
    );
    if (feature.type !== "Feature" || !feature.geometry) {
      throw new Error(`type=${feature.type}, geometry=${feature.geometry?.type}`);
    }
    return feature.geometry.type;
  });

  await check("export CSV completo", async () => {
    const res = await fetchOk(`/api/layer-export?layer_id=${LAYER}&format=csv`);
    const text = await res.text();
    const lines = countLines(text);
    if (lines !== all.total + 1) {
      throw new Error(`líneas=${lines}, esperado=${all.total + 1}`);
    }
    return `${lines} líneas`;
  });

  await check("export GeoJSON filtrado", async () => {
    const url =
      `/api/layer-export?layer_id=${LAYER}&format=geojson&filter=` +
      encodeURIComponent(
        JSON.stringify({
          op: "and",
          conditions: [{ column: "ZONA_1", operator: "in", value: ["ZP"] }],
        })
      );
    const res = await fetchOk(url);
    const collection = await res.json();
    if (collection.features.length !== filtered.total) {
      throw new Error(
        `features=${collection.features.length}, API=${filtered.total}`
      );
    }
    return `${collection.features.length} features`;
  });

  await check("export rechaza columnas fuera de allowlist", async () => {
    const res = await fetch(
      `${BASE}/api/layer-export?layer_id=${LAYER}&format=csv&filter=` +
        encodeURIComponent(
          JSON.stringify({
            op: "and",
            conditions: [{ column: "geom", operator: "=", value: "x" }],
          })
        )
    );
    if (res.status !== 400) throw new Error(`HTTP ${res.status}`);
    return "400";
  });

  if (db) await db.end();

  console.log(
    `\n[acceptance:08] ${results.length - failures}/${results.length} PASS` +
      (failures ? `, ${failures} FAIL` : "")
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[acceptance:08] error fatal:", err?.message || err);
  process.exitCode = 1;
});
