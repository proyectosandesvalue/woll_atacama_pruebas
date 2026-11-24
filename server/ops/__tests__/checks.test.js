import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_THRESHOLDS,
  evaluateChecks,
  collectChecks,
} from "../checks.js";

function healthy() {
  return {
    apiOk: true,
    nginxOk: true,
    certDays: 300,
    diskUsedPct: 40,
    backupAgeHours: 3,
    workers: { "rag-worker": 1, "layer-worker": 1 },
    backlog: { rag: 0, layer: 0 },
  };
}

test("todo sano no genera alertas", () => {
  const result = evaluateChecks(healthy());
  assert.equal(result.ok, true);
  assert.deepEqual(result.alerts, []);
  assert.equal(result.thresholds.maxDiskPct, DEFAULT_THRESHOLDS.maxDiskPct);
});

test("detecta disco, backup, certificado, workers y backlog", () => {
  const result = evaluateChecks({
    apiOk: false,
    nginxOk: false,
    certDays: 5,
    diskUsedPct: 85,
    backupAgeHours: 30,
    workers: { "rag-worker": 11, "layer-worker": null },
    backlog: { rag: 26, layer: 1 },
  });
  const checks = result.alerts.map((a) => a.check).sort();
  assert.equal(result.ok, false);
  assert.deepEqual(checks, [
    "api",
    "backlog:rag",
    "backup",
    "cert",
    "disk",
    "nginx",
    "worker:layer-worker",
    "worker:rag-worker",
  ]);
});

test("respeta umbrales personalizados", () => {
  const result = evaluateChecks(
    { ...healthy(), diskUsedPct: 70, certDays: 10, backupAgeHours: 12 },
    { maxDiskPct: 90, minCertDays: 7, maxBackupHours: 24 }
  );
  assert.equal(result.ok, true);
});

test("una métrica nula cuenta como fallo", () => {
  const result = evaluateChecks({
    ...healthy(),
    certDays: null,
    diskUsedPct: null,
    backupAgeHours: null,
  });
  assert.equal(result.ok, false);
  const checks = result.alerts.map((a) => a.check);
  assert.ok(checks.includes("cert"));
  assert.ok(checks.includes("disk"));
  assert.ok(checks.includes("backup"));
});

test("collectChecks arma métricas con dependencias inyectadas", async () => {
  const responses = {
    "http://api:3000/healthz": { status: 200, json: async () => ({ db: "up" }) },
    "http://nginx/nginx-health": { status: 200, text: async () => "ok\n" },
  };
  const rows = [
    { worker: "rag-worker", age_min: "2.5" },
    { worker: "layer-worker", age_min: 3 },
  ];
  const metrics = await collectChecks({
    env: {
      OPS_HEALTH_API: "http://api:3000/healthz",
      OPS_HEALTH_NGINX: "http://nginx/nginx-health",
      OPS_BACKUP_DIR: "/backups",
      OPS_DISK_PATH: "/backups",
    },
    fetchImpl: async (url) => responses[url],
    statfs: async () => ({ blocks: 100, bfree: 40 }),
    readdir: async () => ["woll-a.dump.gpg", "nota.txt"],
    stat: async () => ({ mtimeMs: 1_000 }),
    certDays: async () => 42,
    now: () => 1_000 + 2 * 3_600_000,
    db: {
      query: async (sql) => {
        if (sql.includes("worker_heartbeats")) return { rows };
        return { rows: [{ rag: "3", layer: "4" }] };
      },
    },
  });

  assert.equal(metrics.apiOk, true);
  assert.equal(metrics.nginxOk, true);
  assert.equal(metrics.certDays, 42);
  assert.equal(metrics.diskUsedPct, 60);
  assert.equal(metrics.backupAgeHours, 2);
  assert.equal(metrics.workers["rag-worker"], 2.5);
  assert.deepEqual(metrics.backlog, { rag: 3, layer: 4 });
});

test("collectChecks tolera fallos de red y de BD", async () => {
  const metrics = await collectChecks({
    env: {},
    fetchImpl: async () => {
      throw new Error("sin red");
    },
    statfs: async () => {
      throw new Error("sin disco");
    },
    readdir: async () => {
      throw new Error("sin backups");
    },
    db: {
      query: async () => {
        throw new Error("sin BD");
      },
    },
    certDays: async () => {
      throw new Error("sin cert");
    },
  });
  assert.equal(metrics.apiOk, false);
  assert.equal(metrics.nginxOk, false);
  assert.equal(metrics.certDays, null);
  assert.equal(metrics.diskUsedPct, null);
  assert.equal(metrics.backupAgeHours, null);
  assert.deepEqual(metrics.backlog, { rag: 0, layer: 0 });
});
