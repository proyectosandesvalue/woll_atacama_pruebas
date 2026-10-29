/**
 * scripts/ingest-run.mjs
 *
 * Ejecuta un endpoint o todos los de una fuente.
 *
 * Uso:
 *   node --env-file=.env.staging scripts/ingest-run.mjs --endpoint meteochile:getDatosRecientesRedEma
 *   node --env-file=.env.staging scripts/ingest-run.mjs --source meteochile
 *   node --env-file=.env.staging scripts/ingest-run.mjs --stats
 *   node --env-file=.env.staging scripts/ingest-run.mjs --agromet
 */

import fs from "fs"; // <-- FALTABA ESTO
import { runEndpoint, runSource } from "../server/ingest/runner.js";
import { getDB } from "../server/db/pool.js";

const args = process.argv.slice(2); // <-- DECLARADO UNA SOLA VEZ

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

async function main() {
  // ─── MODO AGROMET (SCRAPING) ───
  if (args.includes("--agromet")) {
    console.log(`${C.bold}=== Iniciando Scraping de Agromet ===${C.reset}`);
    const stations = JSON.parse(fs.readFileSync('./scripts/agromet-stations.json', 'utf8'));
    let totalLoaded = 0;
    const db = await getDB();

    for (const station of stations) {
      const codigoEntidad = `AGROMET_${station.ema_id}`;
      
      try {
        console.log(`\nScrapeando ${station.nombre} (EMA: ${station.ema_id}, Código: ${codigoEntidad})...`);
        
        const source = { id: 'agromet', nombre: 'Agromet' };
        const endpoint = { 
          params: { 
            ema_id: station.ema_id, 
            codigo_entidad: codigoEntidad
          },
          source_id: 'agromet'
        };
        
        const { runAgrometEndpoint } = await import('../server/ingest/adapters/agromet.js');
        const result = await runAgrometEndpoint(db, source, endpoint);
        
        console.log(`  ${C.green}✓${C.reset} loaded=${result.loaded} errors=${result.errors.length}`);
        totalLoaded += result.loaded;
      } catch (err) {
        console.error(`  ${C.red}❌ Error en ${station.nombre}: ${err.message}${C.reset}`);
      }

      // Pacing: 2 segundos entre estaciones
      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log(`\n${C.bold}=== Scraping finalizado. Total valores cargados: ${totalLoaded} ===${C.reset}`);
    process.exit(0);
  }

  // ─── MODOS NORMALES (ENDPOINT / SOURCE / STATS) ───
  const opts = {
    endpoint: null,
    source: null,
    stats: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--endpoint") opts.endpoint = args[++i];
    else if (a === "--source") opts.source = args[++i];
    else if (a === "--stats") opts.stats = true;
  }

  if (opts.stats) {
    const db = await getDB();
    const stats = await db.rpc("admin_ingest_stats");
    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
  }

  if (!opts.endpoint && !opts.source) {
    console.error("Falta --endpoint <id>, --source <id>, --stats o --agromet");
    process.exit(1);
  }

  try {
    if (opts.endpoint) {
      console.log(`${C.bold}Ejecutando ${opts.endpoint}...${C.reset}`);
      const r = await runEndpoint(opts.endpoint);
      console.log(
        `${C.green}✓${C.reset} loaded=${r.loaded} skipped=${r.skipped} errors=${r.errors.length}`
      );
      if (r.errors.length > 0) {
        for (const e of r.errors.slice(0, 5)) {
          console.log(`  ${C.red}• ${e}${C.reset}`);
        }
      }
    }

    if (opts.source) {
      console.log(`${C.bold}Ejecutando todos los endpoints de ${opts.source}...${C.reset}`);
      const results = await runSource(opts.source);
      for (const r of results) {
        const status = r.errors.length === 0 ? "✓" : "✗";
        const color = r.errors.length === 0 ? C.green : C.red;
        console.log(
          `  ${color}${status}${C.reset} ${r.endpointId}: loaded=${r.loaded} skipped=${r.skipped} errors=${r.errors.length}`
        );
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(`${C.red}Error: ${err?.message || err}${C.reset}`);
    if (process.env.ORCHESTRATOR_DEBUG) {
      console.error(err?.stack);
    }
    process.exit(1);
  }
}

main();