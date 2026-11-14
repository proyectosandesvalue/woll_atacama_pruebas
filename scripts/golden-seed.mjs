#!/usr/bin/env node
/**
 * Siembra `admin.golden_cases` desde server/chat/__evals__/golden.json.
 * Uso: npm run golden:seed [--dry-run]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN = path.join(ROOT, "server", "chat", "__evals__", "golden.json");

export const SEED_SQL = `INSERT INTO admin.golden_cases
           (id, level, tier, intent_esperado, fuente_esperada, category,
            question, expected, notes, history, route, activo, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12,'golden-seed')
         ON CONFLICT (id) DO UPDATE
           SET level=EXCLUDED.level, tier=EXCLUDED.tier,
               intent_esperado=EXCLUDED.intent_esperado,
               fuente_esperada=EXCLUDED.fuente_esperada,
               category=EXCLUDED.category, question=EXCLUDED.question,
               expected=EXCLUDED.expected, notes=EXCLUDED.notes,
               history=EXCLUDED.history, route=EXCLUDED.route,
               activo=EXCLUDED.activo,
               updated_at=now(), updated_by='golden-seed'`;

/**
 * Normaliza los casos del JSON a filas insertables.
 * @param {{cases?: Array<object>}} golden
 * @returns {Array<Array<unknown>>}
 */
export function normalizeGoldenCases(golden) {
  if (!Array.isArray(golden?.cases)) {
    throw new Error("golden.json no tiene cases[].");
  }
  return golden.cases.map((item) => [
    item.id,
    item.level ?? 1,
    item.tier ?? 1,
    item.intent_esperado || null,
    item.fuente_esperada || null,
    item.category || null,
    item.question,
    JSON.stringify(item.expected || {}),
    item.notes || null,
    item.history ? JSON.stringify(item.history) : null,
    item.route || null,
    item.activo !== false,
  ]);
}

/**
 * Inserta/actualiza los casos en una transacción sobre `client`.
 * @param {{query: Function}} client
 * @param {Array<Array<unknown>>} rows
 */
export async function seedGoldenCases(client, rows) {
  await client.query("BEGIN");
  try {
    for (const params of rows) {
      await client.query(SEED_SQL, params);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

function connectionString() {
  return process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || "";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const raw = await readFile(GOLDEN, "utf8");
  const rows = normalizeGoldenCases(JSON.parse(raw));

  if (dryRun) {
    console.log(`[golden:seed] ${rows.length} casos listos; dry-run.`);
    return;
  }

  const url = connectionString();
  if (!url) throw new Error("Falta DATABASE_ADMIN_URL o DATABASE_URL.");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await seedGoldenCases(client, rows);
    console.log(`[golden:seed] ${rows.length} casos sembrados.`);
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[golden:seed] error:", err?.message || err);
    process.exitCode = 1;
  });
}
