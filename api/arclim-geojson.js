// api/arclim-geojson.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { indicator, seasons = "annual" } = req.query;
  if (!indicator) return res.status(400).json({ error: "Falta parámetro 'indicator'" });

  try {
    const seasonList = seasons.split(",");
    const attrs = [];
    for (const season of seasonList) {
      attrs.push(`$CLIMA$${indicator}$${season}$present`);
      attrs.push(`$CLIMA$${indicator}$${season}$future$ssp245`);
      attrs.push(`$CLIMA$${indicator}$${season}$future$ssp585`);
      attrs.push(`$CLIMA$${indicator}$${season}$delta$ssp245`);
      attrs.push(`$CLIMA$${indicator}$${season}$delta$ssp585`);
    }
    
    const encodedAttrs = attrs.map(a => encodeURIComponent(a)).join(",");
    const url = `https://arclim.mma.gob.cl/api/datos/comunas/geojson/?attributes=NOM_COMUNA,${encodedAttrs}`;
    
    const arclimRes = await fetch(url);
    if (!arclimRes.ok) throw new Error(`Error consultando ARClim: HTTP ${arclimRes.status}`);
    
    const json = await arclimRes.json();
    const geojson = json.data;

    const atacamaFeatures = geojson.features.filter(f => {
      const id = String(f.properties.arclim_id || "");
      return id.startsWith("3");
    });

    return res.status(200).json({
      type: "FeatureCollection",
      features: atacamaFeatures
    });
  } catch (err) {
    console.error("[/api/arclim-geojson] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}