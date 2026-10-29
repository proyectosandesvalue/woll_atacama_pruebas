// server/ingest/adapters/agromet.js
import https from 'https';

export async function runAgrometEndpoint(db, source, endpoint) {
  const emaId = endpoint.params.ema_id;
  const codigoEntidad = endpoint.params.codigo_entidad;
  
  const url = `https://www.agromet.cl/ext/aux/getUltLectEma.php?ema_ia_id=${emaId}`;
  
  // Usamos https nativo para ignorar el certificado SSL roto de Agromet
  const html = await new Promise((resolve, reject) => {
    const req = https.get(url, {
      rejectUnauthorized: false,
      timeout: 10000, // <-- TIMEOUT DE 10 SEGUNDOS
      headers: {
        // Headers que imitan a un navegador real
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1"
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} al consultar Agromet`));
        } else {
          resolve(data);
        }
      });
    });

    // Manejar el evento de timeout
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout de 10s al conectar con Agromet (EMA ${emaId})`));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });

  if (!html.includes('span_fecha_ultima_lectura')) {
    throw new Error(`Agromet bloqueó la petición o cambió el formato (EMA ${emaId})`);
  }

  const fechaMatch = html.match(/id='span_fecha_ultima_lectura'[^>]*>([^<]+)</);
  const tempActualMatch = html.match(/class='ul_texto ul_temp_actual'[^>]*>([^<]+)</);
  
  const getDato = (title) => {
    const regex = new RegExp(`title='${title}'[^>]*>(.*?)<\/td>`, 'i');
    const match = html.match(regex);
    if (!match) return null;
    return match[1].replace(/<[^>]*>/g, '').trim();
  };

  const parseNum = (str) => {
    if (!str) return null;
    const num = str.replace(/[^\d,.-]/g, '').replace(',', '.');
    return isNaN(Number(num)) ? null : Number(num);
  };

  const periodStart = fechaMatch ? parseFecha(fechaMatch[1]) : null;
  if (!periodStart) throw new Error(`No se pudo extraer la fecha de Agromet (EMA ${emaId})`);

  const valores = {
    temp_avg: parseNum(tempActualMatch?.[1]),
    temp_max: parseNum(getDato('Temp. Máxima')),
    temp_min: parseNum(getDato('Temp. Mínima')),
    precip: parseNum(getDato('Precipitación horaria')),
    viento_vel: parseNum(getDato('Veloc. máx. viento')),
    viento_dir: parseNum(getDato('Dirección del viento')),
    radiacion: parseNum(getDato('Radiación solar máx.')),
    humedad: parseNum(getDato('Humed. rel. promedio')),
    presion: parseNum(getDato('Presión atmosférica')),
  };

  let loaded = 0;
  for (const [indicatorId, value] of Object.entries(valores)) {
    if (value === null) continue;
    
    let finalValue = value;
    let unit = "°C";
    if (indicatorId === "viento_vel") { finalValue = value * 1.94384; unit = "kt"; }
    else if (indicatorId === "viento_dir") unit = "°";
    else if (indicatorId === "precip") unit = "mm";
    else if (indicatorId === "radiacion") unit = "W/m2";
    else if (indicatorId === "humedad") unit = "%";
    else if (indicatorId === "presion") unit = "hPa";

    await db.rpc("ingest_upsert_value", {
      p_indicator_id: indicatorId,
      p_source_id: source.id,
      p_entity_id: `estacion:${codigoEntidad}`,
      p_entity_type: "estacion",
      p_entity_name: null,
      p_period_start: periodStart,
      p_period_end: periodStart,
      p_value: finalValue,
      p_unit: unit,
      p_scenario: null,
      p_metadata: null,
    });
    loaded++;
  }

  return { loaded, skipped: 0, errors: [] };
}

function parseFecha(str) {
  const [date, time] = str.trim().split(' ');
  const [d, m, y] = date.split('/');
  return `${y}-${m}-${d}T${time}:00-03:00`;
}