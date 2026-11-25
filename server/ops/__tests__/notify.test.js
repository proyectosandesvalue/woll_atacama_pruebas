import { test } from "node:test";
import assert from "node:assert/strict";

import { notifyOpsAlerts, planNotifications } from "../notify.js";

test("planNotifications avisa al aparecer, respeta cooldown y avisa recuperación", () => {
  const alerts = [{ check: "disk", message: "disco al 90 %" }];
  const now = 1_000_000;

  const first = planNotifications({ alerts, state: {}, now });
  assert.equal(first.toNotify.length, 1);

  const repeated = planNotifications({
    alerts,
    state: { disk: { state: "failing", last_sent_at: new Date(now - 1000).toISOString() } },
    now,
  });
  assert.equal(repeated.toNotify.length, 0);

  const later = planNotifications({
    alerts,
    state: {
      disk: {
        state: "failing",
        last_sent_at: new Date(now - 7 * 3_600_000).toISOString(),
      },
    },
    now,
  });
  assert.equal(later.toNotify.length, 1);

  const recovery = planNotifications({
    alerts: [],
    state: { disk: { state: "failing", last_sent_at: new Date(now).toISOString() } },
    now,
  });
  assert.equal(recovery.recovered.length, 1);
});

function fakeDB() {
  const state = new Map();
  return {
    state,
    query: async (sql, params = []) => {
      if (sql.includes("select key, state, last_sent_at")) {
        return [...state.entries()].map(([key, value]) => ({
          key,
          state: value.state,
          last_sent_at: value.last_sent_at,
        }));
      }
      if (sql.includes("INSERT INTO admin.notify_state")) {
        state.set(params[0], {
          state: params[1],
          last_sent_at: new Date(params[2]),
        });
        return [];
      }
      return [];
    },
  };
}

test("envía una alerta, no la repite y avisa la recuperación", async () => {
  const db = fakeDB();
  const sent = [];
  const sendEmail = async (message) => {
    sent.push(message);
  };
  const env = { OPS_ALERT_EMAIL: "owner@example.com" };
  const now = 2_000_000;

  const first = await notifyOpsAlerts({
    db,
    alerts: [{ check: "disk", message: "disco al 90 %" }],
    sendEmail,
    env,
    now,
  });
  assert.equal(first.alerts, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].template, "alert");
  assert.equal(db.state.get("disk").state, "failing");

  const second = await notifyOpsAlerts({
    db,
    alerts: [{ check: "disk", message: "disco al 91 %" }],
    sendEmail,
    env,
    now: now + 1000,
  });
  assert.equal(second.alerts, 0);
  assert.equal(sent.length, 1);

  const recovery = await notifyOpsAlerts({
    db,
    alerts: [],
    sendEmail,
    env,
    now: now + 2000,
  });
  assert.equal(recovery.recovered, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].template, "status");
  assert.equal(db.state.get("disk").state, "ok");
});

test("sin OPS_ALERT_EMAIL no envía nada", async () => {
  const db = fakeDB();
  let calls = 0;
  const result = await notifyOpsAlerts({
    db,
    alerts: [{ check: "api", message: "caída" }],
    sendEmail: async () => {
      calls += 1;
    },
    env: {},
  });
  assert.equal(result.skipped, true);
  assert.equal(calls, 0);
});
