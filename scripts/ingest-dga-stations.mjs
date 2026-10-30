import fs from 'fs';
import { getDB } from '../server/db/pool.js';

// Parser CSV que respeta comillas y saltos de línea internos
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false, i = 0;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (inQuotes) {
      if (c === '"') {
        if (n === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') {
      row.push(field);
      if (row.length > 1 || row[0].trim()) rows.push(row);
      row = []; field = ''; i++; continue;
    }
    if (c === '\r') { i++; continue; }
    field += c; i++;
  }
  if (field || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0].trim()) rows.push(row);
  }
  return rows;
}

function normalizarTipo(tipoRaw) {
  if (!tipoRaw) return 'DESCONOCIDO';
  const limpio = tipoRaw.replace(/[*\n\r]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const tipos = ['METEOROLOGICA', 'FLUVIOMETRICA', 'CALIDAD DE AGUA', 'CONTROL DE NIVEL', 'NIEVES Y GLACIARES', 'LAGOS Y EMBALSES'];
  const encontrados = tipos.filter(t => limpio.includes(t));
  return encontrados.length > 0 ? encontrados.join(',') : 'DESCONOCIDO';
}

function normalizarRegion(region) {
  if (!region) return null;
  const limpio = region.trim();
  if (limpio.toUpperCase().startsWith('DE ')) {
    return limpio.slice(3).split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return limpio;
}

async function processStations(filePath) {
  const db = await getDB();
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCSV(text);
  if (rows.length < 2) { console.error('Archivo vacío'); process.exit(1); }

  const headers = rows[0].map(h => h.trim());
  const hUpper = headers.map(h => h.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  
  let colCodigo = -1, colNombre = -1, colLat = -1, colLon = -1, colAlt = -1;
  let colRegion = -1, colProvincia = -1, colComuna = -1, colTipo = -1;
  hUpper.forEach((hu, i) => {
    if (hu === 'CODIGO') colCodigo = i;
    else if (hu === 'ESTACION' || hu === 'NOMBRE ESTACION') colNombre = i;
    else if (hu === 'LATITUD') colLat = i;
    else if (hu === 'LONGITUD') colLon = i;
    else if (hu.includes('ALTITUD')) colAlt = i;
    else if (hu === 'REGION') colRegion = i;
    else if (hu === 'PROVINCIA') colProvincia = i;
    else if (hu === 'COMUNA') colComuna = i;
    else if (hu === 'TIPO DE ESTACION') colTipo = i;
  });
  
  console.log(`Columnas: codigo=${colCodigo}, nombre=${colNombre}, lat=${colLat}, lon=${colLon}, tipo=${colTipo}`);
  
  if (colCodigo === -1 || colNombre === -1 || colLat === -1 || colLon === -1) {
    console.error('No se detectaron columnas necesarias'); process.exit(1);
  }

  let total = 0, skipped = 0, swapped = false;
  const errors = [];

  for (let r = 1; r < rows.length; r++) {
    const parts = rows[r];
    if (!parts || parts.length < 5) { skipped++; continue; }

    let codigo = parts[colCodigo]?.trim() || '';
    const nombre = parts[colNombre]?.trim() || '';
    let lat = parseFloat(parts[colLat]?.trim() || '');
    let lon = parseFloat(parts[colLon]?.trim() || '');
    const alt = colAlt !== -1 ? parseFloat(parts[colAlt]?.trim() || '') : null;
    const region = colRegion !== -1 ? normalizarRegion(parts[colRegion]) : null;
    const provincia = colProvincia !== -1 ? (parts[colProvincia]?.trim() || null) : null;
    const comuna = colComuna !== -1 ? (parts[colComuna]?.trim() || null) : null;
    const tipoRaw = colTipo !== -1 ? parts[colTipo] : null;

    // Pad código a 8 dígitos
    if (codigo && /^\d+$/.test(codigo) && codigo.length < 8) codigo = codigo.padStart(8, '0');

    // Auto-swap si lat/lon están invertidas
    if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) > 60 && Math.abs(lon) < 60) {
      [lat, lon] = [lon, lat];
      if (!swapped) { console.log('⚠️ Coordenadas invertidas detectadas. Intercambiando...'); swapped = true; }
    }

    if (!codigo || !nombre || isNaN(lat) || isNaN(lon)) { skipped++; continue; }

    try {
      await db.rpc('admin_upsert_station', {
        p_codigo_nacional: codigo,
        p_nombre_estacion: nombre,
        p_latitud: lat,
        p_longitud: lon,
        p_altitud: isNaN(alt) ? null : alt,
        p_region: region,
        p_provincia: provincia,
        p_comuna: comuna,
        p_tipo_estacion: normalizarTipo(tipoRaw),
        p_propietario: 'Dirección General de Aguas - DGA',
        p_estado_operativo: 'historica',
        p_activo: true
      });
      total++;
      process.stdout.write(`\rInsertados: ${total} | Saltados: ${skipped}`);
    } catch (err) {
      errors.push(`${codigo}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n\n✅ Finalizado. Cargados: ${total} | Saltados: ${skipped}`);
  if (errors.length) {
    console.log(`\nErrores (${errors.length}):`);
    errors.slice(0, 5).forEach(e => console.log('  ' + e));
  }
}

const filePath = process.argv[2];
if (!filePath) { console.log('Uso: node --env-file=.env.staging scripts/ingest-dga-stations.mjs <ruta>'); process.exit(1); }
processStations(filePath).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });