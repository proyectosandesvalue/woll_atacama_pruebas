/**
 * workerPool.js
 * Gestiona un pool de Web Workers para evitar la creación y destrucción constante.
 *
 * - Si `Worker` no está disponible (navegadores muy antiguos o entornos de test),
 *   cae a un "fallback" que hace el fetch y el procesamiento en el hilo principal.
 * - El pool se termina en `beforeunload` para liberar memoria.
 *
 * @module utils/workerPool
 */

import { createContextLogger } from "../utils/logger.js";

const log = createContextLogger("WorkerPool");

const POOL_SIZE = 4;
const workers = [];
const taskQueue = [];

let fallbackWarned = false;

/**
 * Comprueba si el navegador soporta Web Workers.
 * @returns {boolean}
 */
function supportsWorkers() {
  try {
    return typeof Worker !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Crea el pool de workers. Idempotente.
 */
export function initWorkerPool() {
  if (workers.length > 0) return;

  if (!supportsWorkers()) {
    if (!fallbackWarned) {
      log.warn("Web Workers no soportados; se usará fetch en el hilo principal.");
      fallbackWarned = true;
    }
    return;
  }

  const workerUrl = new URL("./layerProcessor.worker.js", import.meta.url);
  for (let i = 0; i < POOL_SIZE; i++) {
    const worker = new Worker(workerUrl);
    worker.isBusy = false;
    workers.push(worker);
  }
}

/**
 * Termina todos los workers y limpia la cola.
 * Llamar en `beforeunload` para no dejar workers huérfanos.
 */
export function destroyWorkerPool() {
  workers.forEach((w) => {
    try {
      w.terminate();
    } catch {
      /* silent */
    }
  });
  workers.length = 0;
  taskQueue.length = 0;
  log.debug("Worker pool destruido");
}

// Terminación limpia al cerrar la pestaña.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", destroyWorkerPool, { once: true });
}

/**
 * Ejecuta una tarea en un worker disponible (o encolada).
 * Si no hay workers, cae a un fallback en el hilo principal.
 *
 * @param {{type: string, url?: string}} message
 * @returns {Promise<any>}
 */
export function runWorkerTask(message) {
  if (workers.length === 0) initWorkerPool();

  // Fallback sin Workers
  if (workers.length === 0) {
    return runFallbackTask(message);
  }

  return new Promise((resolve, reject) => {
    const availableWorker = workers.find((w) => !w.isBusy);
    const task = { message, resolve, reject };

    if (availableWorker) {
      assignTask(availableWorker, task);
    } else {
      taskQueue.push(task);
    }
  });
}

function assignTask(worker, task) {
  worker.isBusy = true;

  worker.onmessage = (e) => {
    worker.isBusy = false;
    const { type, data, error } = e.data;

    if (type === "SUCCESS") {
      task.resolve(data);
    } else if (type === "ERROR") {
      task.reject(new Error(error));
    }

    checkQueue();
  };

  worker.onerror = (err) => {
    worker.isBusy = false;
    task.reject(new Error(`Worker Error: ${err.message}`));
    checkQueue();
  };

  worker.postMessage(task.message);
}

function checkQueue() {
  if (taskQueue.length > 0) {
    const availableWorker = workers.find((w) => !w.isBusy);
    if (availableWorker) {
      assignTask(availableWorker, taskQueue.shift());
    }
  }
}

/**
 * Fallback: ejecuta fetch + transformación en el hilo principal.
 * Se usa cuando `Worker` no está disponible.
 *
 * Nota: duplica la lógica de transformación de `layerProcessor.worker.js`.
 * Si esa lógica cambia, actualizar ambos sitios.
 *
 * @param {{type: string, url?: string}} message
 * @returns {Promise<any>}
 */
async function runFallbackTask(message) {
  if (message.type !== "FETCH_AND_PROCESS" || !message.url) {
    throw new Error(`Tarea no soportada sin workers: ${message.type}`);
  }

  const res = await fetch(message.url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  return transformCoordinates(data);
}

// ── Transformación EPSG:3857 → EPSG:4326 (duplicada del worker) ──
const R = 6378137;

function unproject(point) {
  const d = 180 / Math.PI;
  return {
    lat: (2 * Math.atan(Math.exp(point.y / R)) - Math.PI / 2) * d,
    lng: (point.x * d) / R,
  };
}

function transformCoordinates(data) {
  const crs = data.crs && data.crs.properties && data.crs.properties.name;
  if (crs !== "urn:ogc:def:crs:EPSG::3857" && crs !== "EPSG:3857") {
    return data;
  }

  const transformedFeatures = data.features
    .filter((feature) => feature?.geometry?.coordinates != null)
    .map((feature) => {
      const newFeature = { ...feature, geometry: { ...feature.geometry } };
      if (!newFeature.geometry.coordinates) return newFeature;

      const geomType = newFeature.geometry.type;

      if (geomType === "Point") {
        const coords = newFeature.geometry.coordinates;
        const latlng = unproject({ x: coords[0], y: coords[1] });
        newFeature.geometry.coordinates = [latlng.lng, latlng.lat];
      } else if (geomType === "LineString" || geomType === "MultiLineString") {
        const isMulti = geomType === "MultiLineString";
        const processRing = (ring) =>
          ring.map((coords) => {
            const latlng = unproject({ x: coords[0], y: coords[1] });
            return [latlng.lng, latlng.lat];
          });
        newFeature.geometry.coordinates = isMulti
          ? newFeature.geometry.coordinates.map(processRing)
          : processRing(newFeature.geometry.coordinates);
      } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
        const isMulti = geomType === "MultiPolygon";
        const processPolygon = (poly) =>
          poly.map((ring) =>
            ring.map((coords) => {
              const latlng = unproject({ x: coords[0], y: coords[1] });
              return [latlng.lng, latlng.lat];
            })
          );
        newFeature.geometry.coordinates = isMulti
          ? newFeature.geometry.coordinates.map(processPolygon)
          : processPolygon(newFeature.geometry.coordinates);
      }
      return newFeature;
    });

  return {
    ...data,
    features: transformedFeatures,
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } },
  };
}