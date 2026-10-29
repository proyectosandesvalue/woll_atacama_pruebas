import { getDB } from "../server/db/pool.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const db = await getDB();
    const stations = await db.rpc("chat_historical_stations");
    return res.status(200).json({ stations });
  } catch (err) {
    console.error("[/api/historical-stations] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}