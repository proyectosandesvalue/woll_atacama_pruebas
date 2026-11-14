#!/usr/bin/env node
/**
 * Prueba de carga del Sprint 30.
 *
 * Escenarios:
 *   static          tile MVT pregenerado (Nginx)
 *   table           /api/layer-features (100 filas)
 *   filtered        /api/layer-features con filtro ZONA_1=ZP
 *   on-demand       tile on-demand (cacheado por Nginx)
 *   on-demand-cold  tile on-demand con cache-buster (pega a PostgreSQL)
 *   mixed           mezcla 50% static, 20% table, 10% filtered, 20% on-demand
 *
 * Uso:
 *   node scripts/load-test-sprint30.mjs --concurrency 25,50 --duration 15
 *   node scripts/load-test-sprint30.mjs --scenarios static,table --concurrency 50
 *
 * Salida: p50/p95/p99, RPS, errores y códigos HTTP. Sale con código 1 si hay
 * 5xx, errores de red o si static/table superan los umbrales del Sprint 30.
 */

import http from "node:http";
import https from "node:https";

const args = process.argv.slice(2);
const opts = {
  base: "http://127.0.0.1:8090",
  duration: 15,
  concurrency: [25, 50],
  scenarios: ["static", "table", "on-demand", "mixed"],
  timeoutMs: 15000,
  thinkTime: 0,
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--base") opts.base = args[++i];
  else if (arg === "--duration") opts.duration = Number(args[++i]);
  else if (arg === "--concurrency") opts.concurrency = String(args[++i]).split(",").map(Number);
  else if (arg === "--scenarios") opts.scenarios = String(args[++i]).split(",");
  else if (arg === "--timeout") opts.timeoutMs = Number(args[++i]);
  else if (arg === "--think-time") opts.thinkTime = Number(args[++i]);
  else if (arg === "--help" || arg === "-h") {
    console.log("Uso: node scripts/load-test-sprint30.mjs [--base URL] [--duration s] [--concurrency 25,50] [--scenarios static,table,filtered,on-demand,on-demand-cold,mixed]");
    process.exit(0);
  } else {
    console.error(`Argumento desconocido: ${arg}`);
    process.exit(2);
  }
}

const LAYER = "borde_costero";
const FILTER = encodeURIComponent(
  JSON.stringify({
    op: "and",
    conditions: [{ column: "ZONA_1", operator: "in", value: ["ZP"] }],
  })
);

const scenarios = {
  static: () => `/tiles/${LAYER}/2026/10/308/596.mvt`,
  table: () => `/api/layer-features?layer_id=${LAYER}&limit=100&offset=0`,
  filtered: () => `/api/layer-features?layer_id=${LAYER}&limit=100&offset=0&filter=${FILTER}`,
  "on-demand": () =>
    `/api/layer-tiles?layer_id=${LAYER}&z=10&x=308&y=596`,
  "on-demand-cold": () =>
    `/api/layer-tiles?layer_id=${LAYER}&z=10&x=308&y=596&cb=${Date.now()}-${Math.random()}`,
};

// La mezcla 25/50 simula usuarios reales sobre tiles estáticos y tabla.
// El on-demand se mide aparte con baja concurrencia: Nginx limita por IP
// (20 r/s) y un test desde una sola IP dispararía 429.
const mixedWeights = [
  { scenario: "static", weight: 5 },
  { scenario: "table", weight: 3 },
  { scenario: "filtered", weight: 2 },
];

function mixedUrl() {
  const total = mixedWeights.reduce((sum, item) => sum + item.weight, 0);
  let pick = Math.random() * total;
  for (const item of mixedWeights) {
    pick -= item.weight;
    if (pick <= 0) return scenarios[item.scenario]();
  }
  return scenarios.static();
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

const isHttps = opts.base.startsWith("https:");
const agent = isHttps
  ? new https.Agent({ keepAlive: true, maxSockets: 200 })
  : new http.Agent({ keepAlive: true, maxSockets: 200 });

function oneRequest(pathname) {
  const target = new URL(`${opts.base}${pathname}`);
  const start = performance.now();

  return new Promise((resolve) => {
    const req = (isHttps ? https : http).request(
      target,
      { method: "GET", agent, headers: { Accept: "*/*" } },
      (res) => {
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            ms: performance.now() - start,
            bytes,
          });
        });
        res.on("error", (err) => {
          resolve({
            status: 0,
            ms: performance.now() - start,
            bytes,
            error: String(err),
          });
        });
      }
    );

    req.setTimeout(opts.timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err) => {
      resolve({
        status: 0,
        ms: performance.now() - start,
        bytes: 0,
        error: String(err),
      });
    });
    req.end();
  });
}

async function warmup(scenario) {
  for (let i = 0; i < 5; i += 1) {
    const url = scenario === "mixed" ? mixedUrl() : scenarios[scenario]();
    await oneRequest(url);
  }
}

async function runScenario(scenario, concurrency) {
  const latencies = [];
  const statuses = new Map();
  let bytes = 0;
  let networkErrors = 0;
  const startedAt = Date.now();
  const endAt = startedAt + opts.duration * 1000;

  const worker = async () => {
    while (Date.now() < endAt) {
      const url = scenario === "mixed" ? mixedUrl() : scenarios[scenario]();
      const result = await oneRequest(url);
      latencies.push(result.ms);
      statuses.set(result.status, (statuses.get(result.status) || 0) + 1);
      bytes += result.bytes;
      if (result.status === 0) networkErrors += 1;
      if (opts.thinkTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, opts.thinkTime));
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const sorted = latencies.sort((a, b) => a - b);
  const elapsed = (Date.now() - startedAt) / 1000;
  const count = sorted.length;
  const codes = Object.fromEntries([...statuses.entries()].sort((a, b) => a[0] - b[0]));
  const total5xx = Object.entries(codes)
    .filter(([code]) => Number(code) >= 500)
    .reduce((sum, [, n]) => sum + n, 0);

  return {
    scenario,
    concurrency,
    count,
    rps: Number((count / elapsed).toFixed(1)),
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    mean: Math.round(sorted.reduce((sum, value) => sum + value, 0) / Math.max(count, 1)),
    mb: Number((bytes / 1024 / 1024).toFixed(1)),
    networkErrors,
    total5xx,
    codes,
  };
}

function verdict(result) {
  const problems = [];
  if (result.networkErrors > 0) problems.push(`${result.networkErrors} errores de red`);
  if (result.total5xx > 0) problems.push(`${result.total5xx} respuestas 5xx`);
  if (result.scenario === "static" && result.p95 > 100) problems.push(`static p95 ${result.p95}ms > 100ms`);
  if ((result.scenario === "table" || result.scenario === "filtered") && result.p95 > 500) {
    problems.push(`${result.scenario} p95 ${result.p95}ms > 500ms`);
  }
  if (result.scenario === "on-demand" && result.p95 > 1000) {
    problems.push(`on-demand p95 ${result.p95}ms > 1000ms`);
  }
  return problems;
}

async function main() {
  console.log(
    `[load:30] base=${opts.base} duration=${opts.duration}s ` +
      `concurrency=${opts.concurrency.join(",")} scenarios=${opts.scenarios.join(",")}`
  );

  const all = [];
  for (const scenario of opts.scenarios) {
    if (!scenarios[scenario] && scenario !== "mixed") {
      console.error(`[load:30] escenario desconocido: ${scenario}`);
      process.exit(2);
    }
    console.log(`\n== ${scenario} ==`);
    for (const concurrency of opts.concurrency) {
      await warmup(scenario);
      const result = await runScenario(scenario, concurrency);
      all.push(result);
      console.log(
        `c=${result.concurrency} n=${result.count} rps=${result.rps} ` +
          `p50=${result.p50}ms p95=${result.p95}ms p99=${result.p99}ms ` +
          `mean=${result.mean}ms mb=${result.mb} http=${JSON.stringify(result.codes)}`
      );
      if (result.codes["429"]) {
        console.warn(
          `  aviso: ${result.codes["429"]} respuestas 429 (rate limit por IP; usa --think-time para simular usuarios)`
        );
      }
      const problems = verdict(result);
      if (problems.length > 0) {
        console.error(`  FAIL: ${problems.join("; ")}`);
      }
    }
  }

  const failed = all.filter((result) => verdict(result).length > 0);
  console.log(
    `\n[load:30] ${all.length - failed.length}/${all.length} escenarios dentro de umbral` +
      (failed.length ? `; ${failed.length} con problemas` : "")
  );
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[load:30] error fatal:", err?.stack || err);
  process.exitCode = 1;
});
