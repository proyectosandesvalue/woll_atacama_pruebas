import test from "node:test";
import assert from "node:assert/strict";

import { TOOL_DEFINITIONS, getToolDefinitions } from "../tools/index.js";

test("el catálogo completo tiene 14 tools y search_documents", () => {
  assert.equal(TOOL_DEFINITIONS.length, 14);
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "search_documents")
  );
});

test("el killswitch quita search_documents de las tools del LLM", () => {
  const enabled = getToolDefinitions({ documentsEnabled: true });
  const disabled = getToolDefinitions({ documentsEnabled: false });
  assert.equal(enabled.length, 14);
  assert.equal(disabled.length, 13);
  assert.ok(disabled.every((t) => t.function?.name !== "search_documents"));
  assert.ok(disabled.some((t) => t.function?.name === "aggregate_layer"));
});
