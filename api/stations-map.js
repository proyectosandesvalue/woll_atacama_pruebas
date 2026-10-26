import { getDB } from "../server/db/pool.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const variable = req.query.variable || "temp_avg";

  try {
    const db = await getDB();
    const stations = await db.rpc("chat_stations_map_data", {
      p_variable: variable,
      p_period: "latest",
    });
    return res.status(200).json({ variable, stations });
  } catch (err) {
    console.error(`[/api/stations-map] Error:`, err);
    console.error(`[/api/stations-map] Cause:`, err?.cause);
    return res.status(500).json({
      error: err.message,
      cause: err?.cause?.message || String(err?.cause || ""),
      code: err?.cause?.code || null,
      variable,
    });
  }
}