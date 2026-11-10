import { test } from "node:test";
import assert from "node:assert/strict";

import { createTiming, isTimingEnabled } from "../timing.js";

function withCapturedLogs(fn) {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    return { result: fn(), logs };
  } finally {
    console.log = original;
  }
}

function withTimingEnv(value, fn) {
  const previous = process.env.CHAT_TIMING_ENABLED;
  process.env.CHAT_TIMING_ENABLED = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.CHAT_TIMING_ENABLED;
    else process.env.CHAT_TIMING_ENABLED = previous;
  }
}

test("emite un registro JSON con etapas y metadatos", () => {
  const { result, logs } = withTimingEnv("1", () =>
    withCapturedLogs(() => {
      const timing = createTiming({ case_id: "caso-1" });
      timing.mark("start");
      timing.mark("classifier", { domain: "IN" });
      timing.setMeta({ status: 200, route: "orchestrator" });
      return timing.finish();
    })
  );

  assert.equal(result.event, "chat.timing");
  assert.equal(result.case_id, "caso-1");
  assert.equal(result.status, 200);
  assert.equal(result.route, "orchestrator");
  assert.equal(result.stages.length, 2);
  assert.equal(result.stages[0].stage, "start");
  assert.equal(result.stages[1].stage, "classifier");
  assert.ok(result.stages[1].delta_ms >= 0);
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), result);
});

test("no emite nada si CHAT_TIMING_ENABLED está apagado", () => {
  const { result, logs } = withTimingEnv("0", () =>
    withCapturedLogs(() => {
      const timing = createTiming();
      timing.mark("start");
      return timing.finish();
    })
  );

  assert.equal(result, null);
  assert.equal(logs.length, 0);
  assert.equal(isTimingEnabled({ CHAT_TIMING_ENABLED: "0" }), false);
  assert.equal(isTimingEnabled({ CHAT_TIMING_ENABLED: "1" }), true);
});

test("finish emite una sola vez", () => {
  const { logs } = withTimingEnv("1", () =>
    withCapturedLogs(() => {
      const timing = createTiming();
      timing.mark("start");
      const first = timing.finish();
      const second = timing.finish();
      assert.ok(first);
      assert.equal(second, null);
    })
  );

  assert.equal(logs.length, 1);
});

test("las marcas con duration_ms no alteran el delta secuencial", () => {
  const { result } = withTimingEnv("1", () =>
    withCapturedLogs(() => {
      const timing = createTiming();
      timing.mark("stage_a");
      timing.mark("tool", { name: "query_layer", duration_ms: 10, ok: true });
      timing.mark("stage_b");
      return timing.finish();
    })
  );

  const stageB = result.stages.find((s) => s.stage === "stage_b");
  assert.ok(stageB.delta_ms >= 0);
  const tool = result.stages.find((s) => s.stage === "tool");
  assert.equal(tool.duration_ms, 10);
  assert.equal(tool.delta_ms, undefined);
});
