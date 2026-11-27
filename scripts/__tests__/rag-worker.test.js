import { test } from "node:test";
import assert from "node:assert/strict";

import { mapIngestStatus, mapJobStatus } from "../../scripts/rag-worker.mjs";

test("mapIngestStatus traduce resultados del pipeline a estados de job", () => {
  assert.equal(mapIngestStatus({ status: "ready" }), "succeeded");
  assert.equal(mapIngestStatus({ status: "dry-run" }), "succeeded");
  assert.equal(mapIngestStatus({ status: "skipped" }), "skipped");
  assert.equal(mapIngestStatus({ status: "needs_ocr" }), "needs_ocr");
  assert.equal(mapIngestStatus({ status: "rejected" }), "rejected");
  assert.equal(mapIngestStatus({ status: "otro" }), "failed");
  assert.equal(mapIngestStatus(null), "failed");
});

test("mapJobStatus distingue unpublish de ingest", () => {
  assert.equal(
    mapJobStatus({ action: "unpublish" }, { status: "unpublished" }),
    "succeeded"
  );
  assert.equal(
    mapJobStatus({ action: "unpublish" }, { status: "sin_version_ready" }),
    "skipped"
  );
  assert.equal(mapJobStatus({ action: "ingest" }, { status: "ready" }), "succeeded");
  assert.equal(mapJobStatus({ action: "dry_run" }, { status: "dry-run" }), "succeeded");
});
