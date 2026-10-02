/**
 * Pool de conexiones a la base de datos.
 *
 * En Vercel Functions (serverless) cada invocación es una "lambda" aislada;
 * no existen pools TCP persistentes entre invocaciones frías. Aquí el
 * "pool" es una fábrica de clientes cacheada por invocación: la primera
 * vez que se pide un cliente para un driver, se construye; las llamadas
 * subsiguientes dentro de la misma invocación reusan esa instancia.
 *
 * Cuando el proyecto salga de serverless a un servidor dedicado, el
 * driver `postgres.js` (a implementar) montará un `pg.Pool` real de
 * conexiones TCP, manteniendo la misma interfaz `rpc(name, params)`
 * que consume el orquestador.
 *
 * Para agregar un driver nuevo:
 *   1. Crear server/db/drivers/<driver>.js exportando:
 *        export function createDriver(config) { return { rpc, raw }; }
 *      donde `rpc(name, params)` devuelve una Promise<any> y `raw` (opcional)
 *      expone queries directas al driver.
 *   2. Registrar el driver en la fábrica `buildDriver()` de este archivo.
 */

import { getDBConfig } from "./config.js";
import { createDriver as createSupabaseDriver } from "./drivers/supabase.js";
// import { createDriver as createPostgresDriver } from "./drivers/postgres.js";

const DRIVERS = {
  supabase: createSupabaseDriver,
  // postgres: createPostgresDriver,
};

function buildDriver(config) {
  const factory = DRIVERS[config.driver];
  if (!factory) {
    throw new Error(
      `No hay driver registrado para "${config.driver}". Registra uno en server/db/pool.js.`
    );
  }
  return factory(config);
}

let _client = null;

/**
 * Devuelve el cliente del driver activo. Singleton dentro de la
 * invocación actual (en serverless se recrea en cada cold start, lo
 * cual está bien: Supabase REST no requiere conexión persistente).
 *
 * Interfaz:
 *   await db.rpc('chat_query', { p_layer: 'desaladoras', p_filters: { ... } })
 *   await db.rpc('chat_layer_stats', { p_layer: 'desaladoras' })
 */
export async function getDB() {
  if (_client) return _client;
  const config = getDBConfig();
  _client = buildDriver(config);
  return _client;
}

/**
 * Resetea el cliente cacheado. Útil en tests que cambian variables de
 * entorno entre ejecuciones; no usar en producción.
 */
export function _resetDB() {
  _client = null;
}
