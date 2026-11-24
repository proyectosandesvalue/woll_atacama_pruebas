/**
 * Chequeos operativos del VPS (Sprint 31-B).
 *
 * `collectChecks()` obtiene métricas y `evaluateChecks()` aplica umbrales.
 * Ambas son inyectables para tests: no leen `process.env` ni abren sockets
 * por sí solas.
 *
 * No registra URLs de webhook, tokens ni contenido de usuarios.
 */

export const DEFAULT_THRESHOLDS = {
  maxDiskPct: 80,
  maxBackupHours: 26,
  minCertDays: 14,
  maxHeartbeatMinutes: 10,
  maxBacklog: 25,
};

/**
 * @param {{
 *   apiOk: boolean, nginxOk: boolean,
 *   certDays: number|null, diskUsedPct: number|null,
 *   backupAgeHours: number|null,
 *   workers: Record<string, number|null>,
 *   backlog: {rag: number, layer: number}
 * }} metrics
 * @param {Partial<typeof DEFAULT_THRESHOLDS>} [thresholds]
 */
export function evaluateChecks(metrics, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const alerts = [];
  const add = (check, message) => alerts.push({ check, message });

  if (!metrics.apiOk) add("api", "la API no responde /healthz o la BD está caída");
  if (!metrics.nginxOk) add("nginx", "Nginx no responde /nginx-health");

  if (metrics.certDays === null || Number.isNaN(metrics.certDays)) {
    add("cert", "no se pudo leer el certificado TLS");
  } else if (metrics.certDays < t.minCertDays) {
    add(
      "cert",
      `el certificado vence en ${metrics.certDays.toFixed(1)} días (mínimo ${t.minCertDays})`
    );
  }

  if (metrics.diskUsedPct === null || Number.isNaN(metrics.diskUsedPct)) {
    add("disk", "no se pudo leer el uso de disco");
  } else if (metrics.diskUsedPct >= t.maxDiskPct) {
    add(
      "disk",
      `disco al ${metrics.diskUsedPct.toFixed(1)} % (máximo ${t.maxDiskPct} %)`
    );
  }

  if (metrics.backupAgeHours === null) {
    add("backup", "no hay backups en el directorio configurado");
  } else if (metrics.backupAgeHours > t.maxBackupHours) {
    add(
      "backup",
      `el último backup tiene ${metrics.backupAgeHours.toFixed(1)} h (máximo ${t.maxBackupHours} h)`
    );
  }

  for (const worker of ["rag-worker", "layer-worker"]) {
    const age = metrics.workers?.[worker];
    if (age === undefined || age === null) {
      add(`worker:${worker}`, `${worker} no tiene heartbeat`);
    } else if (age > t.maxHeartbeatMinutes) {
      add(
        `worker:${worker}`,
        `${worker} sin heartbeat hace ${age.toFixed(1)} min (máximo ${t.maxHeartbeatMinutes})`
      );
    }
  }

  const rag = metrics.backlog?.rag ?? 0;
  const layer = metrics.backlog?.layer ?? 0;
  if (rag > t.maxBacklog) {
    add("backlog:rag", `${rag} jobs RAG en cola (máximo ${t.maxBacklog})`);
  }
  if (layer > t.maxBacklog) {
    add("backlog:layer", `${layer} jobs de capas en cola (máximo ${t.maxBacklog})`);
  }

  return { ok: alerts.length === 0, alerts, thresholds: t };
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   statfs?: (path: string) => Promise<{blocks:number,bfree:number}>,
 *   readdir?: (path: string) => Promise<string[]>,
 *   stat?: (path: string) => Promise<{mtimeMs:number}>,
 *   certDays?: () => Promise<number|null>,
 *   db?: {query: (sql: string) => Promise<{rows: any[]}>},
 *   now?: () => number,
 *   env?: Record<string, string|undefined>
 * }} deps
 */
export async function collectChecks(deps = {}) {
  const env = deps.env || {};
  const fetchImpl = deps.fetchImpl || fetch;
  const statfs = deps.statfs || (await import("node:fs/promises")).statfs;
  const readdir = deps.readdir || (await import("node:fs/promises")).readdir;
  const stat = deps.stat || (await import("node:fs/promises")).stat;
  const now = deps.now || Date.now;

  const apiUrl = env.OPS_HEALTH_API || "http://api:3000/healthz";
  const nginxUrl = env.OPS_HEALTH_NGINX || "http://nginx/nginx-health";
  const backupDir = env.OPS_BACKUP_DIR || "/var/backups/woll";
  const diskPath = env.OPS_DISK_PATH || backupDir;

  const metrics = {
    apiOk: false,
    nginxOk: false,
    certDays: null,
    diskUsedPct: null,
    backupAgeHours: null,
    workers: {},
    backlog: { rag: 0, layer: 0 },
  };

  try {
    const res = await fetchImpl(apiUrl, { signal: AbortSignal.timeout(5000) });
    const body = await res.json().catch(() => ({}));
    metrics.apiOk = res.status === 200 && body?.db === "up";
  } catch {
    metrics.apiOk = false;
  }

  try {
    const res = await fetchImpl(nginxUrl, { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    metrics.nginxOk = res.status === 200 && text.trim() === "ok";
  } catch {
    metrics.nginxOk = false;
  }

  if (deps.certDays) {
    metrics.certDays = await deps.certDays().catch(() => null);
  }

  try {
    const s = await statfs(diskPath);
    const total = Number(s.blocks) || 0;
    const free = Number(s.bfree) || 0;
    metrics.diskUsedPct = total > 0 ? ((total - free) / total) * 100 : null;
  } catch {
    metrics.diskUsedPct = null;
  }

  try {
    const files = (await readdir(backupDir)).filter((f) => f.endsWith(".dump.gpg"));
    if (files.length > 0) {
      const stats = await Promise.all(
        files.map(async (f) => ({
          file: f,
          mtimeMs: (await stat(`${backupDir}/${f}`)).mtimeMs,
        }))
      );
      const newest = Math.max(...stats.map((s) => s.mtimeMs));
      metrics.backupAgeHours = (now() - newest) / 3_600_000;
    }
  } catch {
    metrics.backupAgeHours = null;
  }

  if (deps.db) {
    try {
      const { rows } = await deps.db.query(
        `select worker, extract(epoch from (now() - last_seen_at)) / 60 as age_min
           from admin.worker_heartbeats
          where worker in ('rag-worker','layer-worker')`
      );
      for (const row of rows) {
        metrics.workers[row.worker] = Number(row.age_min);
      }
    } catch {
      // Sin BD los heartbeats quedan ausentes y evaluateChecks alerta.
    }

    try {
      const { rows } = await deps.db.query(
        `select
           (select count(*) from admin.rag_jobs where status in ('queued','running')) as rag,
           (select count(*) from admin.layer_jobs where status in ('queued','running')) as layer`
      );
      if (rows[0]) {
        metrics.backlog = {
          rag: Number(rows[0].rag) || 0,
          layer: Number(rows[0].layer) || 0,
        };
      }
    } catch {
      // Se deja el backlog en cero; el chequeo de API/BD ya alerta.
    }
  }

  return metrics;
}
