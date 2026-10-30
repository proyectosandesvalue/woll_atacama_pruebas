import { getDB } from "../server/db/pool.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const variable = req.query.variable || "temp_avg";
  const date = req.query.date || null;
  const estado = req.query.estado || null;

  try {
    const db = await getDB();
    let stations;

    if (date) {
      stations = await db.rpc("chat_stations_map_data_at_date", {
        p_variable: variable,
        p_date: date,
        p_estado: estado,
      });
    } else {
      stations = await db.rpc("chat_stations_map_data", {
        p_variable: variable,
        p_period: "latest",
      });
    }

    return res.status(200).json({ variable, date, estado, stations });
  } catch (err) {
    console.error("[/api/stations-map] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}