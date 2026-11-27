import { test } from "node:test";
import assert from "node:assert/strict";

import {
  helpText,
  parseArgs,
  parsePositiveDays,
  resolveConnection,
  runRetention,
} from "../retention.mjs";

test("parseArgs usa los plazos por defecto", () => {
  const opts = parseArgs([], {});
  assert.equal(opts.unansweredDays, 365);
  assert.equal(opts.auditDays, 730);
  assert.equal(opts.dryRun, false);
  assert.equal(opts.help, false);
});

test("parseArgs acepta plazos y dry-run", () => {
  const opts = parseArgs([
    "--dry-run",
    "--unanswered-days",
    "180",
    "--audit-days",
    "365",
  ]);
  assert.equal(opts.unansweredDays, 180);
  assert.equal(opts.auditDays, 365);
  assert.equal(opts.dryRun, true);
});

test("parseArgs lee defaults desde el entorno", () => {
  const opts = parseArgs([], {
    RETENTION_UNANSWERED_DAYS: "90",
    RETENTION_AUDIT_DAYS: "365",
    RETENTION_DRY_RUN: "1",
  });
  assert.equal(opts.unansweredDays, 90);
  assert.equal(opts.auditDays, 365);
  assert.equal(opts.dryRun, true);
});

test("parsePositiveDays rechaza valores fuera de rango", () => {
  assert.equal(parsePositiveDays("365", "días"), 365);
  assert.throws(() => parsePositiveDays("0", "días"), /entre 1 y 3650/);
  assert.throws(() => parsePositiveDays("3651", "días"), /entre 1 y 3650/);
  assert.throws(() => parsePositiveDays("abc", "días"), /entre 1 y 3650/);
});

test("parseArgs rechaza argumentos desconocidos", () => {
  assert.throws(() => parseArgs(["--force"]), /Argumento desconocido/);
});

test("resolveConnection prioriza DATABASE_ADMIN_URL", () => {
  assert.equal(
    resolveConnection({
      DATABASE_ADMIN_URL: "postgres://admin",
      DATABASE_URL: "postgres://api",
    }),
    "postgres://admin"
  );
  assert.equal(
    resolveConnection({ DATABASE_URL: "postgres://api" }),
    "postgres://api"
  );
  assert.throws(() => resolveConnection({}), /Falta DATABASE_ADMIN_URL/);
});

test("runRetention llama a la RPC con los argumentos esperados", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [
          {
            result: {
              unanswered: 2,
              audit: 1,
              dry_run: true,
            },
          },
        ],
      };
    },
  };

  const result = await runRetention(client, {
    unansweredDays: 365,
    auditDays: 730,
    dryRun: true,
  });

  assert.deepEqual(result, { unanswered: 2, audit: 1, dry_run: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /admin_purge_retention/);
  assert.deepEqual(calls[0].params, [365, 730, true]);
});

test("helpText documenta las opciones principales", () => {
  const text = helpText();
  assert.match(text, /--dry-run/);
  assert.match(text, /--unanswered-days/);
  assert.match(text, /--audit-days/);
  assert.match(text, /DATABASE_ADMIN_URL/);
});
