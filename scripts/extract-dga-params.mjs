import fs from 'fs';
import readline from 'readline';

async function extractParams(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headerFound = false;
  let colParametro = -1;
  const parametros = new Set();

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!headerFound) {
      const headers = line.split(',').map(h => h.trim());
      headers.forEach((h, i) => {
        const hUpper = h.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (hUpper === 'PARAMETRO') colParametro = i;
      });
      headerFound = true;
      continue;
    }

    const parts = line.split(',');
    if (parts.length > colParametro) {
      const param = parts[colParametro]?.trim();
      if (param) parametros.add(param);
    }
  }

  console.log(`\n=== Parámetros únicos encontrados: ${parametros.size} ===\n`);

  console.log(`-- SQL para registrar todos los indicadores en Supabase:\n`);
  console.log(`INSERT INTO ingest.indicators (id, nombre, unidad, tipo, descripcion) VALUES`);

  const values = [];
  for (const param of Array.from(parametros).sort()) {
    // Limpiar el nombre para el ID: mayúsculas, sin tildes, reemplazar espacios por _
    const id = 'calidad_' + param.toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();

    // Nombre legible (mantener el original)
    const nombre = param.replace(/'/g, "''");

    // Unidad por defecto (ajustar si es pH o Conductividad)
    let unidad = 'mg/L';
    if (param.toLowerCase().includes('ph')) unidad = 'pH';
    else if (param.toLowerCase().includes('conductividad')) unidad = 'µS/cm';
    else if (param.toLowerCase().includes('temperatura')) unidad = '°C';
    else if (param.toLowerCase().includes('oxigeno')) unidad = 'mg/L';

    values.push(`('${id}', '${nombre}', '${unidad}', 'observado', 'DGA - Calidad del agua')`);
  }

  console.log(values.join(',\n') + '\nON CONFLICT (id) DO NOTHING;');
}

const filePath = process.argv[2];
if (!filePath) {
  console.log('Uso: node scripts/extract-dga-params.mjs <ruta_csv>');
  process.exit(1);
}

extractParams(filePath).catch(err => {
  console.error(err);
  process.exit(1);
});