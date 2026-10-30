import fs from 'fs';
import readline from 'readline';
import { getDB } from '../server/db/pool.js';

async function processCSV(filePath, indicatorId) {
  const db = await getDB();
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isFirstLine = true;
  let batch = [];
  let totalInserted = 0;
  let totalSkipped = 0;
  
  let colCodigo = 0, colFecha = -1, colAnio = -1, colMes = -1, colValor = -1, colUnidad = -1;

  console.log(`\n=== Iniciando carga de ${filePath} como ${indicatorId} ===`);

  for await (const line of rl) {
    if (isFirstLine) {
      const headers = line.split(',').map(h => h.trim());
      const hUpper = headers.map(h => h.toUpperCase());
      
      hUpper.forEach((hu, i) => {
        if (hu.includes('CODIGO ESTACION') || hu === 'CODIGO_ESTACION') colCodigo = i;
        else if (hu === 'FECHA') colFecha = i;
        else if (hu === 'ANIO') colAnio = i;
        else if (hu === 'MES') colMes = i;
        else if (hu === 'UNIDAD') colUnidad = i;
      });
      
      // Detección genérica de la columna de valor:
      // Es la columna que está justo antes de UNIDAD
      if (colUnidad !== -1) {
        colValor = colUnidad - 1;
      } else {
        colValor = headers.length - 1;
      }
      
      isFirstLine = false;
      continue;
    }

    if (!line.trim()) continue;

    const parts = line.split(',');
    if (parts.length <= colValor) { totalSkipped++; continue; }

    const codigo = parts[colCodigo].trim();
    if (!codigo) { totalSkipped++; continue; }

    let periodStart = null;

    if (colFecha !== -1) {
      // Formato Diario: DD/MM/YYYY
      const fechaRaw = parts[colFecha].trim();
      const [d, m, y] = fechaRaw.split('/');
      if (d && m && y) {
        periodStart = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`;
      }
    } else if (colAnio !== -1 && colMes !== -1) {
      // Formato Mensual: YYYY + MM
      const anio = parts[colAnio].trim();
      const mes = parts[colMes].trim();
      if (anio && mes) {
        periodStart = `${anio}-${mes.padStart(2, '0')}-01T00:00:00.000Z`;
      }
    } else if (colAnio !== -1) {
      // Formato Anual (solo ANIO): usar 1 de enero
      const anio = parts[colAnio].trim();
      if (anio) {
        periodStart = `${anio}-01-01T00:00:00.000Z`;
      }
    }

    if (!periodStart) { totalSkipped++; continue; }

    const valorRaw = parts[colValor].trim();
    const valor = parseFloat(valorRaw.replace(',', '.'));
    if (isNaN(valor)) { totalSkipped++; continue; }

    const unidad = colUnidad !== -1 ? parts[colUnidad].trim() : 'mm';

    batch.push({
      p_indicator_id: indicatorId,
      p_source_id: 'dga',
      p_entity_id: `estacion:${codigo}`,
      p_entity_type: 'estacion',
      p_entity_name: null,
      p_period_start: periodStart,
      p_period_end: periodStart,
      p_value: valor,
      p_unit: unidad,
      p_scenario: null,
      p_metadata: null
    });

    if (batch.length >= 1000) {
      await insertBatch(db, batch);
      totalInserted += batch.length;
      batch = [];
      process.stdout.write(`\rInsertados: ${totalInserted} | Saltados: ${totalSkipped}`);
    }
  }

  if (batch.length > 0) {
    await insertBatch(db, batch);
    totalInserted += batch.length;
  }

  console.log(`\n✅ Finalizado. Total cargados: ${totalInserted} | Saltados: ${totalSkipped}`);
}

async function insertBatch(db, batch) {
  try {
    await db.rpc('ingest_bulk_upsert_values', { p_values: batch });
  } catch (err) {
    console.error(`\n❌ Error insertando bloque:`, err.message);
    throw err;
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Uso: node --env-file=.env.staging scripts/ingest-dga-csv.mjs <ruta_csv> <indicator_id>');
  process.exit(1);
}

const [csvPath, indicator] = args;
processCSV(csvPath, indicator).then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});