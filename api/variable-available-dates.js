import { getDB } from "../server/db/pool.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { variable } = req.query;
  if (!variable) return res.status(400).json({ error: "Falta variable" });

  try {
    const db = await getDB();
    const dates = await db.rpc("chat_variable_available_dates", { p_variable: variable });
    return res.status(200).json({ variable, dates: dates || [] });
  } catch (err) {
    console.error("[/api/variable-available-dates] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}