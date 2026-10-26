import { getDB } from "../server/db/pool.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const codigo = req.query.codigo;
  if (!codigo) return res.status(400).json({ error: "Falta el código de la estación" });

  try {
    const db = await getDB();
    const values = await db.rpc("chat_station_details", { p_codigo_nacional: codigo });
    return res.status(200).json({ codigo, values });
  } catch (err) {
    console.error("[/api/station-details] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}