import test from "node:test";
import assert from "node:assert/strict";

import { unpublishDocument } from "../unpublish.js";

function fakePool({ rows = [{ document_id: "doc-1" }], rowCount = 4, failOn = null } = {}) {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: text.trim(), params });
      if (failOn && text.includes(failOn)) throw new Error("fallo simulado");
      if (text.includes("SELECT document_id")) return { rows, rowCount: rows.length };
      if (text.includes("DELETE FROM rag.chunks")) return { rows: [], rowCount };
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push({ text: "RELEASE", params: [] });
    },
  };
  return {
    calls,
    pool: {
      async connect() {
        return client;
      },
    },
  };
}

test("despublica: marca superseded, borra chunks y deja corrida", async () => {
  const { calls, pool } = fakePool();
  const out = await unpublishDocument({ pool, slug: "catastro-2024" });

  assert.deepEqual(out, {
    slug: "catastro-2024",
    status: "unpublished",
    chunks_deleted: 4,
  });
  const texts = calls.map((c) => c.text);
  assert.equal(texts[0], "BEGIN");
  assert.ok(texts.some((t) => t.startsWith("SELECT document_id")));
  assert.ok(texts.some((t) => t.startsWith("DELETE FROM rag.chunks")));
  assert.ok(texts.some((t) => t.startsWith("UPDATE rag.documents")));
  assert.ok(texts.some((t) => t.startsWith("INSERT INTO rag.ingestion_runs")));
  assert.equal(texts.at(-2), "COMMIT");
  assert.equal(texts.at(-1), "RELEASE");
});

test("sin versión ready hace rollback y no borra", async () => {
  const { calls, pool } = fakePool({ rows: [] });
  const out = await unpublishDocument({ pool, slug: "no-existe" });
  assert.equal(out.status, "sin_version_ready");
  const texts = calls.map((c) => c.text);
  assert.ok(texts.includes("ROLLBACK"));
  assert.ok(!texts.some((t) => t.startsWith("DELETE FROM rag.chunks")));
  assert.equal(texts.at(-1), "RELEASE");
});

test("si falla la escritura hace rollback y libera", async () => {
  const { calls, pool } = fakePool({ failOn: "DELETE FROM rag.chunks" });
  await assert.rejects(
    () => unpublishDocument({ pool, slug: "catastro-2024" }),
    /fallo simulado/
  );
  const texts = calls.map((c) => c.text);
  assert.ok(texts.includes("ROLLBACK"));
  assert.equal(texts.at(-1), "RELEASE");
});
