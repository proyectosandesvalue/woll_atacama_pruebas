import test from "node:test";
import assert from "node:assert/strict";

import { buildDateRange } from "../get-wms-available-dates.js";

test("buildDateRange arma un mes completo", () => {
  assert.deepEqual(buildDateRange(2024, 2), {
    from: "2024-02-01",
    to: "2024-02-29",
  });
  assert.deepEqual(buildDateRange(2023, 2), {
    from: "2023-02-01",
    to: "2023-02-28",
  });
});

test("buildDateRange arma un año completo", () => {
  assert.deepEqual(buildDateRange(2024), {
    from: "2024-01-01",
    to: "2024-12-31",
  });
});

test("buildDateRange usa los últimos 90 días si no hay año/mes", () => {
  const range = buildDateRange(null, null, new Date("2026-11-27T12:00:00Z"));
  assert.equal(range.to, "2026-11-27");
  assert.equal(range.from, "2026-08-29");
});
