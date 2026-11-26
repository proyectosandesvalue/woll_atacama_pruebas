import { test } from "node:test";
import assert from "node:assert/strict";

import {
  _resetFeedbackLimiterForTests,
  handleAdminFeedback,
  handleChatFeedback,
} from "../handlers/feedback.js";
import { createSession } from "../admin/auth.js";

const UUID = "11111111-1111-4111-8111-111111111111";
const ENV = {
  NODE_ENV: "development",
  ADMIN_SESSION_SECRET: "s".repeat(48),
};

function db() {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("FILTER (WHERE rating = 'up')") && sql.includes("FROM chat.feedback")) {
        if (sql.includes("GROUP BY route")) {
          return [{ route: "orchestrator", up: 3, down: 2 }];
        }
        return [{ up: 5, down: 2, pending: 1 }];
      }
      if (sql.includes("GROUP BY reason")) {
        return [{ reason: "incorrect", count: 2 }];
      }
      return [];
    },
  };
}

test("feedback válido actualiza la valoración", async () => {
  _resetFeedbackLimiterForTests();
  const fake = db();
  const res = await handleChatFeedback(
    {
      body: { response_id: UUID, rating: "down", reason: "incorrect" },
      ip: "203.0.113.9",
    },
    { getDB: async () => fake }
  );
  assert.equal(res.status, 200);
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.calls[0].params, [UUID, "down", "incorrect"]);
});

test("feedback rechaza UUID, rating y motivo inválidos", async () => {
  _resetFeedbackLimiterForTests();
  const fake = db();
  const badId = await handleChatFeedback(
    { body: { response_id: "x", rating: "up" }, ip: "203.0.113.9" },
    { getDB: async () => fake }
  );
  assert.equal(badId.status, 400);
  const badRating = await handleChatFeedback(
    { body: { response_id: UUID, rating: "meh" }, ip: "203.0.113.9" },
    { getDB: async () => fake }
  );
  assert.equal(badRating.status, 400);
  const badReason = await handleChatFeedback(
    { body: { response_id: UUID, rating: "down", reason: "otro" }, ip: "203.0.113.9" },
    { getDB: async () => fake }
  );
  assert.equal(badReason.status, 400);
});

test("un up no guarda motivo", async () => {
  _resetFeedbackLimiterForTests();
  const fake = db();
  await handleChatFeedback(
    { body: { response_id: UUID, rating: "up", reason: "incorrect" }, ip: "203.0.113.9" },
    { getDB: async () => fake }
  );
  assert.deepEqual(fake.calls[0].params, [UUID, "up", null]);
});

test("el resumen admin devuelve totales, motivos y rutas", async () => {
  const session = createSession({ user: "dueno", secret: ENV.ADMIN_SESSION_SECRET });
  const res = await handleAdminFeedback(
    {
      req: { headers: { cookie: `woll_admin=${session.token}` } },
      env: ENV,
    },
    { getDB: async () => db() }
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.totals.up, 5);
  assert.equal(res.body.reasons[0].reason, "incorrect");
  assert.equal(res.body.routes[0].route, "orchestrator");
});
