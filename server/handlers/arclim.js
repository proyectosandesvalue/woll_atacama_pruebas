/**
 * Handler puro de `/api/arclim-geojson`.
 *
 * Consulta ARClim (MMA) y devuelve solo las comunas de Atacama (id que empieza
 * con "3"). No depende de Vercel: el adapter y el servidor Node lo comparten.
 */

const ARCLIM_URL = "https://arclim.mma.gob.cl/api/datos/comunas/geojson/";
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * @param {Record<string, unknown>} [query]
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [opts]
 * @returns {Promise<{status:number, body:unknown, headers?: Record<string,string>}>}
 */
export async function handleArclimGeoJSON(query = {}, opts = {}) {
  const { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const indicator = query.indicator;
  const seasons = String(query.seasons || "annual");

  if (!indicator) {
    return { status: 400, body: { error: "Falta parámetro 'indicator'" } };
  }

  try {
    const seasonList = seasons
      .split(",")
      .map((season) => season.trim())
      .filter(Boolean);

    const attrs = [];
    for (const season of seasonList) {
      attrs.push(`$CLIMA$${indicator}$${season}$present`);
      attrs.push(`$CLIMA$${indicator}$${season}$future$ssp245`);
      attrs.push(`$CLIMA$${indicator}$${season}$future$ssp585`);
      attrs.push(`$CLIMA$${indicator}$${season}$delta$ssp245`);
      attrs.push(`$CLIMA$${indicator}$${season}$delta$ssp585`);
    }

    const encodedAttrs = attrs.map((attr) => encodeURIComponent(attr)).join(",");
    const url = `${ARCLIM_URL}?attributes=NOM_COMUNA,${encodedAttrs}`;

    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Error consultando ARClim: HTTP ${response.status}`);
    }

    const json = await response.json();
    const geojson = json?.data;
    if (!geojson || !Array.isArray(geojson.features)) {
      throw new Error("Respuesta de ARClim inválida.");
    }

    const features = geojson.features.filter((feature) =>
      String(feature?.properties?.arclim_id || "").startsWith("3")
    );

    return {
      status: 200,
      body: { type: "FeatureCollection", features },
      headers: { "Cache-Control": "public, max-age=3600" },
    };
  } catch (err) {
    console.error("[/api/arclim-geojson] Error:", err?.message || err);
    return {
      status: 500,
      body: { error: err?.message || "Error consultando ARClim" },
    };
  }
}
