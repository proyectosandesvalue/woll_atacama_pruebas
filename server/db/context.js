/**
 * Contexto async para propagar el `AbortSignal` del request hasta el
 * driver de base de datos, sin tener que pasarlo por las 13 tools.
 *
 * `runners.js` abre el contexto con el signal de la tool; `supabase.js`
 * lo lee y lo pasa al `fetch`. Así, cuando `withTimeout` corta la tool,
 * también se aborta la request HTTP a PostgREST.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

/**
 * Ejecuta `fn` dentro de un contexto con el signal indicado.
 *
 * @template T
 * @param {AbortSignal} signal
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithDbSignal(signal, fn) {
  return storage.run({ signal }, fn);
}

/**
 * Devuelve el signal del request actual, o null fuera de contexto.
 *
 * @returns {AbortSignal|null}
 */
export function getDbSignal() {
  return storage.getStore()?.signal || null;
}
