import { getDB } from "../server/db/pool.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const variable = req.query.variable;
  if (!variable) {
    return res.status(400).json({ error: "Falta parámetro 'variable'" });
  }

  try {
    const db = await getDB();
    const data = await db.rpc("chat_variable_availability", {
      p_variable: variable,
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error("[/api/variable-availability] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
