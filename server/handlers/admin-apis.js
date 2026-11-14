/**
 * Gestor de conexiones externas (Sprint 45-B).
 *
 * Lista las conexiones conocidas, muestra el estado de sus variables de
 * entorno (solo nombres), permite probarlas y editar parámetros no secretos.
 * No permite agregar URLs arbitrarias: el proxy sigue siendo una allowlist.
 */

import { getDB as defaultGetDB } from "../db/pool.js";
import {
  API_REGISTRY,
  getApiDefinition,
  publicDefinition,
} from "../admin/api-registry.js";
import { recordAudit } from "../admin/auth.js";
import { getService } from "../proxy/services.js";
import {
  isPostgres,
  requireCsrf,
  requireSession,
} from "./admin.js";

const MAX_LABEL = 120;
const MAX_RATE_LIMIT = 120;

function envComplete(definition, env = process.env) {
  const required = (definition.requiredEnv || []).every((name) => Boolean(env[name]));
  const any = definition.requiredAnyEnv;
  const anyOk = !any || any.length === 0 || any.some((name) => Boolean(env[name]));
  return required && anyOk;
}

function resultHeaders() {
  return { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
}

function jsonResponse(status, body, headers = {}) {
  return { status, body, headers: { ...resultHeaders(), ...headers } };
}

async function audit(ctx, session, action, target, result, detail = {}) {
  let db = null;
  try {
    db = await defaultGetDB();
  } catch {
    return;
  }
  await recordAudit(db, {
    actor: session?.sub || null,
    action,
    target,
    result,
    ip: ctx.ip,
    detail,
  });
}

function validateUpdate(body, definition) {
  const label = String(body.label || "").trim();
  if (!label || label.length > MAX_LABEL) {
    return { error: `El nombre debe tener entre 1 y ${MAX_LABEL} caracteres.` };
  }
  const timeout = Number.parseInt(body.timeout_ms, 10);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) {
    return { error: "El timeout debe estar entre 1000 y 120000 ms." };
  }
  const rateLimit = body.rate_limit === undefined || body.rate_limit === null
    ? null
    : String(body.rate_limit).trim().slice(0, MAX_RATE_LIMIT);
  return {
    value: {
      label,
      timeout_ms: timeout,
      rate_limit: rateLimit || null,
      activo: body.activo !== false,
    },
    definition,
  };
}

async function probeUrl(url, { method = "HEAD", headers = {}, timeoutMs = 15000, fetchImpl = fetch }) {
  const started = performance.now();
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return {
      ok: false,
      status: null,
      latencyMs: Math.round(performance.now() - started),
      error: err?.name === "TimeoutError" ? "Timeout" : "No se pudo conectar.",
    };
  }

  // HEAD puede no estar soportado; se reintenta con GET sin leer el cuerpo.
  if ((res.status === 405 || res.status === 501) && method === "HEAD") {
    res.body?.cancel?.().catch?.(() => {});
    try {
      res = await fetchImpl(url, {
        method: "GET",
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      return {
        ok: false,
        status: null,
        latencyMs: Math.round(performance.now() - started),
        error: err?.name === "TimeoutError" ? "Timeout" : "No se pudo conectar.",
      };
    }
  }

  res.body?.cancel?.().catch?.(() => {});
  const latencyMs = Math.round(performance.now() - started);
  const status = res.status;
  const ok = status >= 200 && status < 400;
  return {
    ok,
    status,
    latencyMs,
    error: ok ? null : `HTTP ${status}`,
  };
}

/**
 * Prueba una conexión sin exponer secretos ni leer cuerpos grandes.
 *
 * @param {object} definition
 * @param {{env?: NodeJS.ProcessEnv, timeoutMs?: number, fetchImpl?: Function}} [opts]
 */
export async function testApiConnection(definition, opts = {}) {
  const { env = process.env, timeoutMs = 15000, fetchImpl = fetch } = opts;

  if (!envComplete(definition, env)) {
    return {
      ok: false,
      status: null,
      latencyMs: 0,
      error: "Faltan variables de entorno requeridas.",
    };
  }

  if (definition.testType === "proxy") {
    try {
      const service = getService(definition.service);
      const base = service.buildUrl(env);
      const url = definition.testQuery
        ? `${base}${base.includes("?") ? "&" : "?"}${definition.testQuery}`
        : base;
      return await probeUrl(url, { method: "GET", timeoutMs, fetchImpl });
    } catch (err) {
      return {
        ok: false,
        status: null,
        latencyMs: 0,
        error: err?.message || "No se pudo construir la URL del servicio.",
      };
    }
  }

  if (definition.testType === "embeddings") {
    const base = String(env.EMBEDDINGS_BASE_URL || "").replace(/\/+$/, "");
    if (!base) {
      return { ok: false, status: null, latencyMs: 0, error: "Falta EMBEDDINGS_BASE_URL." };
    }
    const headers = {};
    if (env.EMBEDDINGS_API_KEY) {
      headers.Authorization = `Bearer ${env.EMBEDDINGS_API_KEY}`;
    }
    return probeUrl(`${base}/models`, {
      method: "GET",
      headers,
      timeoutMs,
      fetchImpl,
    });
  }

  return probeUrl(definition.baseUrl, {
    method: definition.testMethod || "HEAD",
    timeoutMs,
    fetchImpl,
  });
}

/**
 * GET /api/admin/apis
 */
export async function handleAdminApisList(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;

  let db;
  try {
    db = await getDB();
  } catch {
    return jsonResponse(503, { error: "PostgreSQL no disponible." });
  }
  if (!isPostgres(db)) {
    return jsonResponse(503, { error: "El gestor de APIs requiere PostgreSQL." });
  }

  try {
    const rows = await db.query(
      `SELECT key, label, timeout_ms, rate_limit, activo,
              last_check_at, last_status, last_latency_ms, last_error
         FROM admin.api_connections
        ORDER BY key`
    );
    const byKey = new Map(rows.map((row) => [row.key, row]));

    const items = API_REGISTRY.map((definition) => {
      const row = byKey.get(definition.key) || {};
      return {
        ...publicDefinition(definition, ctx.env),
        label: row.label || definition.label,
        timeout_ms: row.timeout_ms || 15000,
        rate_limit: row.rate_limit || null,
        activo: row.activo !== false,
        last_check_at: row.last_check_at || null,
        last_status: row.last_status ?? null,
        last_latency_ms: row.last_latency_ms ?? null,
        last_error: row.last_error || null,
        env_complete: envComplete(definition, ctx.env),
      };
    });

    return jsonResponse(200, {
      items,
      counts: {
        total: items.length,
        active: items.filter((item) => item.activo).length,
        envReady: items.filter((item) => item.env_complete).length,
        failing: items.filter((item) => item.last_status && item.last_status >= 400).length,
      },
    });
  } catch (err) {
    console.error("[admin:apis] error listando:", err?.message || err);
    return jsonResponse(503, { error: "No se pudieron leer las conexiones." });
  }
}

/**
 * PUT /api/admin/apis
 */
export async function handleAdminApisUpdate(ctx, { getDB = defaultGetDB } = {}) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return jsonResponse(403, { error: "Token CSRF inválido." });
  }

  const definition = getApiDefinition(ctx.body?.key);
  if (!definition) {
    return jsonResponse(404, { error: "Conexión desconocida." });
  }
  const validated = validateUpdate(ctx.body || {}, definition);
  if (validated.error) return jsonResponse(400, { error: validated.error });

  let db;
  try {
    db = await getDB();
  } catch {
    return jsonResponse(503, { error: "PostgreSQL no disponible." });
  }
  if (!isPostgres(db)) {
    return jsonResponse(503, { error: "El gestor de APIs requiere PostgreSQL." });
  }

  try {
    const value = validated.value;
    const rows = await db.query(
      `INSERT INTO admin.api_connections
         (key, label, timeout_ms, rate_limit, activo, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key) DO UPDATE
         SET label = EXCLUDED.label,
             timeout_ms = EXCLUDED.timeout_ms,
             rate_limit = EXCLUDED.rate_limit,
             activo = EXCLUDED.activo,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by
       RETURNING key, label, timeout_ms, rate_limit, activo, updated_at`,
      [
        definition.key,
        value.label,
        value.timeout_ms,
        value.rate_limit,
        value.activo,
        auth.session.sub,
      ]
    );
    await audit(ctx, auth.session, "api.update", definition.key, "ok", {
      label: value.label,
      timeout_ms: value.timeout_ms,
      activo: value.activo,
    });
    return jsonResponse(200, { item: rows[0] });
  } catch (err) {
    console.error("[admin:apis] error actualizando:", err?.message || err);
    return jsonResponse(503, { error: "No se pudo actualizar la conexión." });
  }
}

/**
 * POST /api/admin/apis/test?key=...
 */
export async function handleAdminApisTest(
  ctx,
  { getDB = defaultGetDB, fetchImpl = fetch } = {}
) {
  const auth = requireSession(ctx);
  if (auth.error) return auth.error;
  if (!requireCsrf(ctx, auth.session)) {
    return jsonResponse(403, { error: "Token CSRF inválido." });
  }

  const definition = getApiDefinition(ctx.query?.key);
  if (!definition) {
    return jsonResponse(404, { error: "Conexión desconocida." });
  }

  let db;
  try {
    db = await getDB();
  } catch {
    return jsonResponse(503, { error: "PostgreSQL no disponible." });
  }
  if (!isPostgres(db)) {
    return jsonResponse(503, { error: "El gestor de APIs requiere PostgreSQL." });
  }

  let timeoutMs = 15000;
  try {
    const rows = await db.query(
      "SELECT timeout_ms FROM admin.api_connections WHERE key = $1",
      [definition.key]
    );
    if (rows[0]?.timeout_ms) timeoutMs = rows[0].timeout_ms;
  } catch {
    // Sigue con el default; la prueba es más útil que fallar por el registro.
  }

  const result = await testApiConnection(definition, {
    env: ctx.env,
    timeoutMs,
    fetchImpl,
  });

  try {
    await db.query(
      `INSERT INTO admin.api_connections
         (key, label, timeout_ms, last_check_at, last_status, last_latency_ms, last_error, updated_by)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7)
       ON CONFLICT (key) DO UPDATE
         SET last_check_at = now(),
             last_status = EXCLUDED.last_status,
             last_latency_ms = EXCLUDED.last_latency_ms,
             last_error = EXCLUDED.last_error,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by`,
      [
        definition.key,
        definition.label,
        timeoutMs,
        result.status,
        result.latencyMs,
        result.error,
        auth.session.sub,
      ]
    );
  } catch (err) {
    console.error("[admin:apis] no se pudo guardar la prueba:", err?.message || err);
  }

  await audit(ctx, auth.session, "api.test", definition.key, result.ok ? "ok" : "fail", {
    status: result.status,
    latency_ms: result.latencyMs,
  });

  return jsonResponse(200, {
    key: definition.key,
    ok: result.ok,
    status: result.status,
    latency_ms: result.latencyMs,
    error: result.error,
    checked_at: new Date().toISOString(),
  });
}
