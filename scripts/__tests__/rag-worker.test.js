import { test } from "node:test";
import assert from "node:assert/strict";

import { mapIngestStatus } from "../../scripts/rag-worker.mjs";

test("mapIngestStatus traduce resultados del pipeline a estados de job", () => {
  assert.equal(mapIngestStatus({ status: "ready" }), "succeeded");
  assert.equal(mapIngestStatus({ status: "dry-run" }), "succeeded");
  assert.equal(mapIngestStatus({ status: "skipped" }), "skipped");
  assert.equal(mapIngestStatus({ status: "needs_ocr" }), "needs_ocr");
  assert.equal(mapIngestStatus({ status: "rejected" }), "rejected");
  assert.equal(mapIngestStatus({ status: "otro" }), "failed");
  assert.equal(mapIngestStatus(null), "failed");
});
