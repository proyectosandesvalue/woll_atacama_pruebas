/**
 * Driver Supabase (REST).
 *
 * Implementa la interfaz del pool usando la API REST de Supabase:
 *   - `rpc(name, params)` → POST /rest/v1/rpc/<name>
 *   - `query(table, opts)` → GET /rest/v1/<table> con select, filters, etc.
 *
 * Autenticación: SERVICE_ROLE key (secreta, solo server-side).
 *
 * No requiere dependencias npm: usa fetch nativo de Node 18+ (Vercel).
 *
 * Limitaciones:
 *   - Las RPCs están parametrizadas (no SQL injection); el driver solo
 *     pasa los parámetros tal cual al body JSON.
 *   - Supavisor (pooler) nativo no aplica aquí: REST no abre TCP.
 *     Cuando migren a Postgres directo vía pg.Pool, este driver se
 *     reemplaza por drivers/postgres.js sin tocar al orquestador.
 */

/**
 * @param {{ url: string, serviceKey: string }} config
 * @returns {{ rpc: Function, query: Function }}
 */
export function createDriver(config) {
  const baseUrl = config.url.replace(/\/+$/, "") + "/rest/v1";
  const headers = {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  /**
   * Llama a una función RPC (Postgres SECURITY DEFINER).
   * @param {string} name Nombre de la RPC (sin prefijo de esquema; se resuelve como "chat.<name>")
   * @param {object} params Parámetros nombrados (snake-case → coincidan con la firma PL/pgSQL)
   * @returns {Promise<any>} Resultado JSON (puede ser objeto, array, etc.)
   */
  async function rpc(name, params = {}) {
    // Pre-pender esquema "chat" salvo que el llamador ya lo haya incluido.
    const fnName = name.includes(".") ? name : `chat.${name}`;
    const url = `${baseUrl}/rpc/${encodeURIComponent(fnName.split(".").pop())}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Supabase RPC ${fnName} falló (${res.status}): ${text || res.statusText}`
      );
    }

    // Supabase RPC devuelve 204 No Content si el retorno es void.
    if (res.status === 204) return null;
    return res.json();
  }

  /**
   * Query directa a una tabla vía PostgREST (uso opcional; el chat usa
   * RPCs, no queries directas, pero queda expuesto para integraciones).
   *
   * @param {string} table Nombre de tabla (puede ser "schema.tabla")
   * @param {{ select?: string, filters?: Record<string, any>, limit?: number, single?: boolean }} opts
   */
  async function query(table, opts = {}) {
    const qs = new URLSearchParams();
    if (opts.select) qs.set("select", opts.select);
    if (opts.limit) qs.set("limit", String(opts.limit));
    if (opts.single) qs.set("single", "true");
    if (opts.filters) {
      for (const [col, val] of Object.entries(opts.filters)) {
        qs.append(col, `eq.${val}`);
      }
    }
    const url = `${baseUrl}/${encodeURIComponent(table)}?${qs.toString()}`;
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase query ${table} falló (${res.status}): ${text}`);
    }
    return res.json();
  }

  return { rpc, query };
}
