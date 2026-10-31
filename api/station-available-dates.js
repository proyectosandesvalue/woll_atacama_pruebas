import { getDB } from "../server/db/pool.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { codigo, indicator } = req.query;
  if (!codigo || !indicator) return res.status(400).json({ error: "Faltan parametros" });

  try {
    const db = await getDB();
    const dates = await db.rpc("chat_station_available_dates", {
      p_codigo: codigo,
      p_indicator: indicator,
    });
    return res.status(200).json({ codigo, indicator, dates: dates || [] });
  } catch (err) {
    console.error("[/api/station-available-dates] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}