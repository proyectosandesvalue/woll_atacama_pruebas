import { getDB } from "../server/db/pool.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { codigo, indicator, granularity = "year", year_start, year_end, month, day } = req.query;
  if (!codigo || !indicator) return res.status(400).json({ error: "Faltan parametros" });

  try {
    const db = await getDB();
    const data = await db.rpc("chat_station_series", {
      p_codigo: codigo,
      p_indicator: indicator,
      p_granularity: granularity,
      p_year_start: year_start ? parseInt(year_start) : null,
      p_year_end: year_end ? parseInt(year_end) : null,
      p_month: month ? parseInt(month) : null,
      p_day: day ? parseInt(day) : null,
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error("[/api/station-series] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}