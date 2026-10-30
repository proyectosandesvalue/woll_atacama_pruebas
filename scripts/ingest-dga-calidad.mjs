import fs from 'fs';
import readline from 'readline';
import { getDB } from '../server/db/pool.js';

// Genera el indicator_id a partir del nombre del parámetro (igual que el extractor)
function buildIndicatorId(parametro) {
  return 'calidad_' + parametro.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

// Unidades específicas para ciertos parámetros
function getUnidad(indicatorId) {
  if (indicatorId === 'calidad_ph') return 'pH';
  if (indicatorId === 'calidad_conductividad_especifica') return 'µS/cm';
  if (indicatorId === 'calidad_temperatura_del_agua') return '°C';
  if (indicatorId === 'calidad_razon_de_absorcion_de_sodio_ras') return 'adimensional';
  return 'mg/L';
}

async function processCalidad(filePath) {
  const db = await getDB();
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headerFound = false;
  let batch = [];
  let totalInserted = 0;
  let totalSkipped = 0;
  let colCodigo = -1, colParametro = -1, colFecha = -1, colHora = -1, colValor = -1;

  console.log(`\n=== Iniciando carga de ${filePath} como calidad de agua ===`);

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!headerFound) {
      const headers = line.split(',').map(h => h.trim());
      const hUpper = headers.map(h => h.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      
      hUpper.forEach((hu, i) => {
        if (hu.includes('COD. ESTACION') || hu === 'CODIGO ESTACION') colCodigo = i;
        else if (hu === 'PARAMETRO') colParametro = i;
        else if (hu === 'FECHA MEDICION') colFecha = i;
        else if (hu === 'HORA MEDICION') colHora = i;
        else if (hu === 'VALOR') colValor = i;
      });
      
      headerFound = true;
      continue;
    }

    const parts = line.split(',');
    if (parts.length <= colValor) { totalSkipped++; continue; }

    const codigo = parts[colCodigo]?.trim();
    const parametroRaw = parts[colParametro]?.trim();
    const fechaRaw = parts[colFecha]?.trim();
    const horaRaw = colHora !== -1 ? parts[colHora]?.trim() : '00:00';
    const valorRaw = parts[colValor]?.trim();

    if (!codigo || !parametroRaw || !fechaRaw) { totalSkipped++; continue; }

    const indicatorId = buildIndicatorId(parametroRaw);

    // Parsear fecha DD-MM-YYYY
    const [d, m, y] = fechaRaw.split('-').map(s => s.trim());
    if (!d || !m || !y) { totalSkipped++; continue; }

    // Normalizar hora
    let hora = horaRaw || '00:00';
    if (/^\d{1,2}$/.test(hora)) hora = `${hora.padStart(2, '0')}:00:00`;
    else if (/^\d{1,2}:\d{2}$/.test(hora)) hora = `${hora}:00`;
    else if (!/^\d{2}:\d{2}:\d{2}$/.test(hora)) hora = '00:00:00';

    const periodStart = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hora}.000Z`;

    const valor = parseFloat(valorRaw.replace(',', '.'));
    if (isNaN(valor)) { totalSkipped++; continue; }

    batch.push({
      p_indicator_id: indicatorId,
      p_source_id: 'dga',
      p_entity_id: `estacion:${codigo}`,
      p_entity_type: 'estacion',
      p_entity_name: null,
      p_period_start: periodStart,
      p_period_end: periodStart,
      p_value: valor,
      p_unit: getUnidad(indicatorId),
      p_scenario: null,
      p_metadata: { parametro_original: parametroRaw }
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

const filePath = process.argv[2];
if (!filePath) {
  console.log('Uso: node --env-file=.env.staging scripts/ingest-dga-calidad.mjs <ruta_csv>');
  process.exit(1);
}

processCalidad(filePath).then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});