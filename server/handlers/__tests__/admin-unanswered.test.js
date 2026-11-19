import { test } from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../../admin/auth.js";
import {
  buildUnansweredBrief,
  handleAdminUnansweredBrief,
  handleAdminUnansweredList,
  handleAdminUnansweredStats,
  handleAdminUnansweredUpdate,
  publicUnanswered,
} from "../admin-unanswered.js";

const ENV = { ADMIN_SESSION_SECRET: "s".repeat(48) };
const ID = "6bd28fb6-8182-471a-84a3-05fc8e1573fc";

function ctx(overrides = {}) {
  const session = createSession({ user: "admin", secret: ENV.ADMIN_SESSION_SECRET });
  return {
    env: ENV,
    ip: "127.0.0.1",
    query: {},
    body: {},
    req: {
      headers: {
        cookie: `woll_admin=${encodeURIComponent(session.token)}`,
        "x-csrf-token": session.csrf,
      },
    },
    ...overrides,
  };
}

function mockDb({ list, stats, update, briefRow } = {}) {
  return {
    pool: { query: async () => [] },
    rpc: async (name) => {
      if (name === "admin_list_unanswered") {
        return list ?? { items: [], total: 0 };
      }
      if (name === "admin_unanswered_stats") return stats ?? {};
      if (name === "admin_update_unanswered") return update ?? null;
      return null;
    },
    query: async () => (briefRow ? [briefRow] : []),
  };
}

test("demanda exige sesión", async () => {
  const result = await handleAdminUnansweredList(
    { req: { headers: {} }, env: ENV, query: {} },
    { getDB: async () => mockDb() }
  );
  assert.equal(result.status, 401);
});

test("lista la demanda y elimina columnas privadas", async () => {
  const result = await handleAdminUnansweredList(ctx(), {
    getDB: async () => mockDb({
      list: {
        items: [{
          id: ID,
          question: "¿Cuántas lagunas hay?",
          user_email: "persona@example.com",
          session_id: "abc",
          context: [{ content: "hola" }],
        }],
        total: 1,
      },
    }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].question, "¿Cuántas lagunas hay?");
  assert.equal(result.body.items[0].user_email, undefined);
  assert.equal(result.body.items[0].session_id, undefined);
  assert.equal(result.body.items[0].context, undefined);
});

test("rechaza un estado inválido en el listado", async () => {
  const result = await handleAdminUnansweredList(
    ctx({ query: { status: "otro" } }),
    { getDB: async () => mockDb() }
  );
  assert.equal(result.status, 400);
});

test("devuelve estadísticas", async () => {
  const result = await handleAdminUnansweredStats(ctx(), {
    getDB: async () => mockDb({ stats: { pending: 3, total: 5 } }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.pending, 3);
});

test("el triage exige CSRF", async () => {
  const base = ctx({ body: { id: ID, status: "accepted" } });
  base.req.headers = { cookie: base.req.headers.cookie };
  const result = await handleAdminUnansweredUpdate(base, {
    getDB: async () => mockDb(),
  });
  assert.equal(result.status, 403);
});

test("el triage rechaza un estado inválido", async () => {
  const result = await handleAdminUnansweredUpdate(
    ctx({ body: { id: ID, status: "otro" } }),
    { getDB: async () => mockDb() }
  );
  assert.equal(result.status, 400);
});

test("el triage actualiza y devuelve la fila", async () => {
  let params = null;
  const db = {
    pool: { query: async () => [] },
    rpc: async (name, values) => {
      if (name === "admin_update_unanswered") {
        params = values;
        return {
          id: ID,
          status: "accepted",
          priority: "alta",
          decision: "new_tool",
          user_email: "persona@example.com",
        };
      }
      return null;
    },
    query: async () => [],
  };
  const result = await handleAdminUnansweredUpdate(
    ctx({
      body: {
        id: ID,
        status: "accepted",
        priority: "alta",
        decision: "new_tool",
        sprint_target: "19",
        notes: "Crear tool de ejemplo.",
      },
    }),
    { getDB: async () => db }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.item.status, "accepted");
  assert.equal(result.body.item.user_email, undefined);
  assert.equal(params.p_actor, "admin");
  assert.equal(params.p_sprint_target, "19");
});

test("devuelve 404 si la pregunta no existe", async () => {
  const result = await handleAdminUnansweredUpdate(
    ctx({ body: { id: ID, status: "accepted" } }),
    { getDB: async () => mockDb({ update: null }) }
  );
  assert.equal(result.status, 404);
});

test("genera un brief sin datos personales", () => {
  const brief = buildUnansweredBrief({
    id: ID,
    question: "¿Cuántos kilos de jojoba se producen?",
    occurrences: 2,
    reason: "no_tool",
    reason_detail: "Falta una tool de producción.",
    status: "accepted",
    priority: "alta",
    decision: "new_tool",
    sprint_target: "19",
    notes: "Revisar catastro.",
    classification: { intent: "dato_simple", confidence: 0.9 },
    route: { pipeline: null, slots: { layer_id: "catastro" } },
    user_email: "persona@example.com",
    session_id: "abc",
  });
  assert.equal(brief.filename, `demanda-${ID}.md`);
  assert.match(brief.markdown, /¿Cuántos kilos de jojoba se producen\?/);
  assert.match(brief.markdown, /new_tool/);
  assert.doesNotMatch(brief.markdown, /persona@example\.com/);
  assert.doesNotMatch(brief.markdown, /session_id/);
});

test("el brief descargable responde con markdown", async () => {
  const result = await handleAdminUnansweredBrief(
    ctx({ query: { id: ID } }),
    {
      getDB: async () => mockDb({
        briefRow: {
          id: ID,
          question: "¿Dónde están las desaladoras?",
          occurrences: 1,
          reason: "no_data",
          status: "pending",
          classification: {},
          route: {},
        },
      }),
    }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.filename, `demanda-${ID}.md`);
  assert.match(result.body.markdown, /desaladoras/);
});

test("publicUnanswered quita email, sesión, contexto y normaliza JSON", () => {
  const item = publicUnanswered({
    id: ID,
    question: "x",
    user_email: "a@b.cl",
    session_id: "s",
    context: [],
    classification: '{"intent":"dato_simple"}',
    route: '{"pipeline":null}',
  });
  assert.deepEqual(item, {
    id: ID,
    question: "x",
    classification: { intent: "dato_simple" },
    route: { pipeline: null },
  });
});
