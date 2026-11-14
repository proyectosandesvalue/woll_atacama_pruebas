/**
 * Fuente del golden set del chat.
 *
 * Prioriza `admin.golden_cases` (editable desde el panel) y cae al archivo
 * `server/chat/__evals__/golden.json` si `--from-json`, si la BD no está
 * disponible o si no hay casos activos. INV-5: el eval no se rompe sin BD.
 */

export const GOLDEN_QUERY = `SELECT id, level, tier, intent_esperado, fuente_esperada, category,
              question, expected, notes, history
         FROM admin.golden_cases
        WHERE activo = true
        ORDER BY level, id`;

/**
 * @param {{
 *   fromJson?: boolean,
 *   getDB: () => Promise<object>,
 *   readFile: (path: string, encoding: string) => Promise<string>,
 *   goldenPath: string
 * }} opts
 * @returns {Promise<{cases: Array<object>, source: "db"|"json"} & Record<string, unknown>>}
 */
export async function loadGoldenCases({ fromJson = false, getDB, readFile, goldenPath }) {
  const fromFile = JSON.parse(await readFile(goldenPath, "utf8"));
  if (!Array.isArray(fromFile.cases)) {
    throw new Error("golden.json no tiene cases[].");
  }
  if (fromJson) return { ...fromFile, source: "json" };

  try {
    const db = await getDB();
    if (typeof db?.pool?.query !== "function") {
      return { ...fromFile, source: "json" };
    }
    const rows = await db.query(GOLDEN_QUERY);
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ...fromFile, source: "json" };
    }
    return { ...fromFile, cases: rows, source: "db" };
  } catch {
    return { ...fromFile, source: "json" };
  }
}
