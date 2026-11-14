/**
 * Semáforo de concurrencia para llamadas al LLM.
 *
 * En Vercel el estado es por instancia; el límite real es
 * `LLM_MAX_CONCURRENCY × instancias`. Sirve para que una instancia no
 * dispare decenas de llamadas simultáneas y para degradar con un 503
 * claro cuando la cola se llena.
 *
 * Los errores de cola NO son retryable para el orquestador: no queremos
 * que los reintentos amplifiquen la saturación.
 */

function busyError(detail) {
  const err = new Error(
    "El asistente está con alta demanda. Intenta de nuevo en unos segundos."
  );
  err.code = "LLM_BUSY";
  err.status = 503;
  err.retryable = false;
  err.retryAfterSeconds = 5;
  err.detail = detail;
  return err;
}

/**
 * @param {{
 *   max?: number,
 *   maxQueue?: number,
 *   timeoutMs?: number
 * }} [opts]
 */
export function createSemaphore({ max = 4, maxQueue = 20, timeoutMs = 15000 } = {}) {
  const limit = Math.max(1, Number(max) || 4);
  const queueLimit = Math.max(0, Number(maxQueue) || 0);
  const waitMs = Math.max(0, Number(timeoutMs) || 0);

  let active = 0;
  const waiters = [];

  function acquire() {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }

    if (waiters.length >= queueLimit) {
      return Promise.reject(busyError("Cola de LLM llena"));
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };

      if (waitMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(busyError("Timeout esperando turno de LLM"));
        }, waitMs);
      }

      waiters.push(waiter);
    });
  }

  function release() {
    const next = waiters.shift();
    if (next) {
      if (next.timer) clearTimeout(next.timer);
      next.resolve();
      return;
    }
    active = Math.max(0, active - 1);
  }

  return {
    acquire,
    release,
    get active() {
      return active;
    },
    get queued() {
      return waiters.length;
    },
  };
}
