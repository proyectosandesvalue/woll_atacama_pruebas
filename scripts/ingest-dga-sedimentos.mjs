import fs from 'fs';
import readline from 'readline';
import { getDB } from '../server/db/pool.js';

async function processSedimentos(filePath, indicatorId) {
  const db = await getDB();
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headerFound = false;
  let batch = [];
  let totalInserted = 0;
  let totalSkipped = 0;

  let colCodigo = 0, colFecha = -1, colDia = -1, colMes = -1, colAnio = -1, colHora = -1, colValor = -1, colUnidad = -1;

  console.log(`\n=== Iniciando carga de ${filePath} como ${indicatorId} ===`);

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!headerFound) {
      const headers = line.split(',').map(h => h.trim());
      const hUpper = headers.map(h => h.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

      hUpper.forEach((hu, i) => {
        if (hu.includes('CODIGO ESTACION') || hu === 'CODIGO_ESTACION') colCodigo = i;
        else if (hu === 'FECHA') colFecha = i;
        else if (hu === 'DIA') colDia = i;
        else if (hu === 'MES') colMes = i;
        else if (hu === 'ANIO' || hu === 'ANO') colAnio = i;
        else if (hu === 'HORA') colHora = i;
        else if (hu === 'UNIDAD') colUnidad = i;
      });

      if (colUnidad !== -1) colValor = colUnidad - 1;
      else colValor = headers.length - 1;

      headerFound = true;
      continue;
    }

    const parts = line.split(',');
    if (parts.length <= colValor) { totalSkipped++; continue; }

    const codigo = parts[colCodigo].trim();
    if (!codigo) { totalSkipped++; continue; }

    let periodStart = null;

    // 1. Formato con Fecha completa (DD/MM/YYYY)
    if (colFecha !== -1 && parts[colFecha]?.trim()) {
      const fechaRaw = parts[colFecha].trim();
      const [d, m, y] = fechaRaw.split('/');
      if (d && m && y) {
        periodStart = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`;
      }
    } 
    // 2. Formato fragmentado (Día, Mes, Año)
        else if (colDia !== -1 && colMes !== -1 && colAnio !== -1) {
      const dia = parts[colDia]?.trim().padStart(2, '0');
      const mes = parts[colMes]?.trim().padStart(2, '0');
      const anio = parts[colAnio]?.trim();
      
      if (dia && mes && anio) {
        let hora = colHora !== -1 ? parts[colHora]?.trim() : '';
        
        // Normalizar la hora a formato HH:mm:ss
        if (!hora) {
          hora = '00:00:00';
        } else if (/^\d{1,2}$/.test(hora)) {
          // Si viene solo la hora (ej: "08" o "8")
          hora = `${hora.padStart(2, '0')}:00:00`;
        } else if (/^\d{1,2}:\d{2}$/.test(hora)) {
          // Si viene HH:mm (ej: "08:30")
          const [h, m] = hora.split(':');
          hora = `${h.padStart(2, '0')}:${m}:00`;
        }
        // Si ya viene HH:mm:ss, se deja como está
        
        periodStart = `${anio}-${mes}-${dia}T${hora}.000Z`;
      }
    }

    if (!periodStart) { totalSkipped++; continue; }

    const valorRaw = parts[colValor].trim();
    const valor = parseFloat(valorRaw.replace(',', '.'));
    if (isNaN(valor)) { totalSkipped++; continue; }

    const unidad = colUnidad !== -1 ? parts[colUnidad].trim() : 'mg/lt';

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
  console.log('Uso: node --env-file=.env.staging scripts/ingest-dga-sedimentos.mjs <ruta_csv> <indicator_id>');
  process.exit(1);
}

const [csvPath, indicator] = args;
processSedimentos(csvPath, indicator).then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});