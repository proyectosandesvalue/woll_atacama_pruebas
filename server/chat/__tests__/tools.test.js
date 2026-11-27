import test from "node:test";
import assert from "node:assert/strict";

import { TOOL_DEFINITIONS, getToolDefinitions } from "../tools/index.js";

test("el catálogo completo tiene 24 tools y search_documents", () => {
  assert.equal(TOOL_DEFINITIONS.length, 24);
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "search_documents")
  );
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "get_historical_series")
  );
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "compare_layers")
  );
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "rank_multicriteria")
  );
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "spatial_overlay")
  );
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "nearest_distance")
  );
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "get_layer_metadata")
  );
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "get_wms_layer_info")
  );
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "get_wms_pixel")
  );
  assert.ok(
    TOOL_DEFINITIONS.some(
      (t) => t.function?.name === "get_wms_available_dates"
    )
  );
  assert.ok(
    TOOL_DEFINITIONS.some((t) => t.function?.name === "get_wms_statistics")
  );
});

test("el killswitch quita search_documents de las tools del LLM", () => {
  const enabled = getToolDefinitions({ documentsEnabled: true });
  const disabled = getToolDefinitions({ documentsEnabled: false });
  assert.equal(enabled.length, 24);
  assert.equal(disabled.length, 23);
  assert.ok(disabled.every((t) => t.function?.name !== "search_documents"));
  assert.ok(disabled.some((t) => t.function?.name === "aggregate_layer"));
});

test("query_layer expone filtros avanzados, orden y top-N", () => {
  const query = TOOL_DEFINITIONS.find(
    (t) => t.function?.name === "query_layer"
  );
  const props = query.function.parameters.properties;
  assert.ok(props.conditions);
  assert.ok(props.order_by);
  assert.deepEqual(props.order_dir.enum, ["asc", "desc"]);
});

test("spatial_overlay expone intersects, within y area", () => {
  const overlay = TOOL_DEFINITIONS.find(
    (t) => t.function?.name === "spatial_overlay"
  );
  assert.deepEqual(
    overlay.function.parameters.properties.operation.enum,
    ["intersects", "within", "area"]
  );
});
