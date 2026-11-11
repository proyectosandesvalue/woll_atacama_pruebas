/**
 * Driver PostgreSQL nativo con `pg.Pool`.
 *
 * Reemplaza al driver REST de Supabase cuando `DB_DRIVER=postgres`. Mantiene la
 * misma interfaz que consume el orquestador:
 *
 *   await db.rpc("chat_query", { p_layer: "desaladoras", p_filters: {} });
 *
 * Características:
 *   - Pool TCP persistente (no una conexión por request).
 *   - `statement_timeout` y `query_timeout` para acotar consultas.
 *   - Lista cerrada de RPCs (`server/db/rpc-signatures.js`); no hay SQL libre
 *     desde el chat.
 *   - Parámetros nombrados con casts explícitos (`p_layer => $1::text`).
 *   - Errores sin SQL ni parámetros (no se filtran datos a los logs).
 *
 * Sprint 26-B.
 */

import pg from "pg";

import { buildRpcCall } from "../rpc-signatures.js";

const { Pool } = pg;

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function envString(name, fallback) {
  const value = process.env[name];
  return value && String(value).trim() ? value : fallback;
}

function formatError(name, err) {
  const code = err?.code ? ` [${err.code}]` : "";
  const message = err?.message || String(err);
  return `RPC ${name} falló${code}: ${message}`;
}

/**
 * @param {{connectionString: string, applicationName?: string}} config
 */
export function createDriver(config) {
  if (!config?.connectionString) {
    throw new Error("El driver postgres requiere DATABASE_URL.");
  }

  const pool = new Pool({
    connectionString: config.connectionString,
    application_name: config.applicationName || envString("PG_APPLICATION_NAME", "woll-api"),
    max: envInt("PGPOOL_MAX", 10),
    idleTimeoutMillis: envInt("PG_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: envInt("PG_CONNECTION_TIMEOUT_MS", 5_000),
    statement_timeout: envInt("PG_STATEMENT_TIMEOUT_MS", 5_000),
    query_timeout: envInt("PG_QUERY_TIMEOUT_MS", 6_000),
  });

  // Sin este handler, un cliente idle que muere tumba el proceso.
  pool.on("error", (err) => {
    console.error("[db:postgres] error en cliente idle:", err?.message || err);
  });

  /**
   * Ejecuta una RPC registrada.
   *
   * `opts.signal` se respeta antes de ejecutar; `pg` no cancela una query en
   * vuelo por AbortSignal. El corte efectivo lo hacen `statement_timeout` y
   * `query_timeout`.
   *
   * @param {string} name
   * @param {Record<string, unknown>} [params]
   * @param {{signal?: AbortSignal}} [opts]
   * @returns {Promise<any>}
   */
  async function rpc(name, params = {}, opts = {}) {
    if (opts?.signal?.aborted) {
      throw new Error(`RPC ${name} cancelada antes de ejecutar.`);
    }

    const { sql, values } = buildRpcCall(name, params);

    try {
      const result = await pool.query({ text: sql, values });
      if (result.rows.length === 0) return null;
      return result.rows[0]?.result ?? null;
    } catch (err) {
      throw new Error(formatError(name, err));
    }
  }

  /**
   * Query directa para scripts internos (health, migraciones, RAG).
   * No se expone al chat ni acepta SQL del usuario.
   *
   * @param {string} text
   * @param {unknown[]} [params]
   */
  async function query(text, params = []) {
    const result = await pool.query({ text, values: params });
    return result.rows;
  }

  async function ping() {
    await pool.query("SELECT 1");
    return true;
  }

  async function close() {
    await pool.end();
  }

  return { rpc, query, ping, close, pool };
}
