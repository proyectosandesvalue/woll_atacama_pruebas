import { test } from "node:test";
import assert from "node:assert/strict";

import { createSession } from "../../admin/auth.js";
import {
  handleChatTools,
  handleGoldenDelete,
  handleGoldenGet,
  handleGoldenSave,
  handleMessageDelete,
  handleMessageSave,
  handlePromptActivate,
  handlePromptCreate,
  handlePromptDelete,
  handleSettingDelete,
  handleSettingSave,
  handleUnavailableDelete,
  handleUnavailableSave,
} from "../admin-chat-config.js";

const ENV = { ADMIN_SESSION_SECRET: "s".repeat(48) };

function ctx(overrides = {}) {
  const session = createSession({ user: "admin", secret: ENV.ADMIN_SESSION_SECRET });
  return {
    env: ENV,
    ip: "127.0.0.1",
    query: {},
    body: {},
    req: {
      method: "POST",
      headers: {
        cookie: `woll_admin=${encodeURIComponent(session.token)}`,
        "x-csrf-token": session.csrf,
      },
    },
    ...overrides,
  };
}

function mockDb({ clientRows = [], maxVersion = 1, dbRows = [] } = {}) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ scope: "client", sql, params });
      if (sql.includes("COALESCE(MAX(version)")) {
        return { rows: [{ version: maxVersion + 1 }] };
      }
      if (sql.includes("SELECT content, description")) {
        return { rows: clientRows };
      }
      return { rows: [] };
    },
    release() {},
  };
  return {
    calls,
    pool: { query: async () => [], connect: async () => client },
    query: async (sql, params) => {
      calls.push({ scope: "db", sql, params });
      return typeof dbRows === "function" ? dbRows(sql, params, calls) : dbRows;
    },
  };
}

const getDBFrom = (db) => async () => db;

test("chat tools exige sesión", () => {
  const result = handleChatTools({ req: { headers: {} }, env: ENV });
  assert.equal(result.status, 401);
});

test("chat tools es un inventario de solo lectura", () => {
  const result = handleChatTools(ctx());
  assert.equal(result.status, 200);
  assert.equal(result.body.editable, false);
  assert.equal(result.body.items.length, 13);
  assert.ok(result.body.items.every((item) => item.name && item.parameters));
  assert.match(result.body.reason, /código/);
});

test("prompt create rechaza id inválido", async () => {
  const result = await handlePromptCreate(
    ctx({ body: { id: "Chat System", content: "x" } }),
    { getDB: getDBFrom(mockDb()) }
  );
  assert.equal(result.status, 400);
});

test("prompt create exige contenido", async () => {
  const result = await handlePromptCreate(
    ctx({ body: { id: "chat.system", content: "   " } }),
    { getDB: getDBFrom(mockDb()) }
  );
  assert.equal(result.status, 400);
});

test("prompt create exige CSRF", async () => {
  const base = ctx({ body: { id: "chat.system", content: "x" } });
  base.req.headers = { cookie: base.req.headers.cookie };
  const result = await handlePromptCreate(base, { getDB: getDBFrom(mockDb()) });
  assert.equal(result.status, 403);
});

test("prompt create guarda una versión nueva y la activa", async () => {
  const db = mockDb({ maxVersion: 2 });
  const result = await handlePromptCreate(
    ctx({ body: { id: "chat.system", content: "Nuevo prompt", description: "Prueba" } }),
    { getDB: getDBFrom(db) }
  );
  assert.equal(result.status, 201);
  assert.equal(result.body.item.version, 3);
  assert.equal(result.body.item.activo, true);
  assert.ok(db.calls.some((call) => call.sql.includes("UPDATE admin.prompt_templates SET activo = false")));
  assert.ok(db.calls.some((call) => call.sql.includes("INSERT INTO admin.prompt_templates")));
});

test("prompt activate devuelve 404 si la versión no existe", async () => {
  const result = await handlePromptActivate(
    ctx({ body: { id: "chat.system", version: 9 } }),
    { getDB: getDBFrom(mockDb({ clientRows: [] })) }
  );
  assert.equal(result.status, 404);
});

test("prompt activate copia la versión anterior como nueva", async () => {
  const db = mockDb({
    clientRows: [{ content: "Prompt anterior", description: "Original" }],
    maxVersion: 4,
  });
  const result = await handlePromptActivate(
    ctx({ body: { id: "chat.system", version: 1 } }),
    { getDB: getDBFrom(db) }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.item.version, 5);
});

test("prompt delete rechaza la versión activa", async () => {
  const result = await handlePromptDelete(
    ctx({ query: { id: "chat.system", version: "1" } }),
    { getDB: getDBFrom(mockDb({ dbRows: [] })) }
  );
  assert.equal(result.status, 409);
});

test("prompt delete borra una versión histórica", async () => {
  const result = await handlePromptDelete(
    ctx({ query: { id: "chat.system", version: "1" } }),
    { getDB: getDBFrom(mockDb({ dbRows: [{ id: "chat.system" }] })) }
  );
  assert.equal(result.status, 200);
});

test("setting save valida el tipo", async () => {
  const result = await handleSettingSave(
    ctx({ body: { key: "chat.router.enabled", value: "x", type: "xml" } }),
    { getDB: getDBFrom(mockDb()) }
  );
  assert.equal(result.status, 400);
});

test("setting save rechaza un setting no editable", async () => {
  const result = await handleSettingSave(
    ctx({ body: { key: "chat.router.enabled", value: true, type: "boolean" } }),
    { getDB: getDBFrom(mockDb({ dbRows: [] })) }
  );
  assert.equal(result.status, 409);
});

test("setting save hace upsert", async () => {
  const db = mockDb({
    dbRows: [{ key: "chat.router.enabled", value: true, type: "boolean", editable: true }],
  });
  const result = await handleSettingSave(
    ctx({
      body: {
        key: "chat.router.enabled",
        value: true,
        type: "boolean",
        description: "Killswitch",
      },
    }),
    { getDB: getDBFrom(db) }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.item.key, "chat.router.enabled");
  const insert = db.calls.find((call) => call.sql.includes("INSERT INTO admin.settings"));
  assert.ok(insert);
  assert.equal(insert.params[1], "true");
});

test("setting delete respeta editable", async () => {
  const result = await handleSettingDelete(
    ctx({ query: { key: "chat.router.enabled" } }),
    { getDB: getDBFrom(mockDb({ dbRows: [] })) }
  );
  assert.equal(result.status, 409);
});

test("message save exige contenido", async () => {
  const result = await handleMessageSave(
    ctx({ body: { key: "chat.out_of_scope", content: " " } }),
    { getDB: getDBFrom(mockDb()) }
  );
  assert.equal(result.status, 400);
});

test("message save guarda el mensaje", async () => {
  const result = await handleMessageSave(
    ctx({ body: { key: "chat.out_of_scope", content: "Fuera de alcance." } }),
    { getDB: getDBFrom(mockDb({ dbRows: [{ key: "chat.out_of_scope" }] })) }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.item.key, "chat.out_of_scope");
});

test("message delete devuelve 404 si no existe", async () => {
  const result = await handleMessageDelete(
    ctx({ query: { key: "chat.out_of_scope" } }),
    { getDB: getDBFrom(mockDb({ dbRows: [] })) }
  );
  assert.equal(result.status, 404);
});

test("unavailable save valida el motivo", async () => {
  const result = await handleUnavailableSave(
    ctx({
      body: {
        id: "test_dato",
        descripcion: "Dato de prueba",
        motivo: "otro",
      },
    }),
    { getDB: getDBFrom(mockDb()) }
  );
  assert.equal(result.status, 400);
});

test("unavailable save normaliza palabras y capas", async () => {
  const db = mockDb({
    dbRows: [{ id: "test_dato", palabras: ["prueba", "temporal"] }],
  });
  const result = await handleUnavailableSave(
    ctx({
      body: {
        id: "test_dato",
        descripcion: "Dato de prueba",
        palabras: "prueba, temporal",
        capas_relacionadas: "desaladoras",
        motivo: "sin_receta",
        source: "manual",
      },
    }),
    { getDB: getDBFrom(db) }
  );
  assert.equal(result.status, 200);
  const insert = db.calls.find((call) => call.sql.includes("INSERT INTO admin.unavailable_data"));
  assert.ok(insert);
  assert.deepEqual(insert.params[2], ["prueba", "temporal"]);
  assert.deepEqual(insert.params[3], ["desaladoras"]);
  assert.match(insert.sql, /verificado_en/);
});

test("unavailable delete devuelve 404 si no existe", async () => {
  const result = await handleUnavailableDelete(
    ctx({ query: { id: "test_dato" } }),
    { getDB: getDBFrom(mockDb({ dbRows: [] })) }
  );
  assert.equal(result.status, 404);
});

test("golden get lista los casos", async () => {
  const result = await handleGoldenGet(ctx(), {
    getDB: getDBFrom(mockDb({ dbRows: [{ id: "caso-1" }] })),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
});

test("golden save valida level y tier", async () => {
  const invalidLevel = await handleGoldenSave(
    ctx({
      body: {
        id: "caso-1",
        question: "¿Pregunta?",
        level: 4,
        tier: 1,
        expected: {},
      },
    }),
    { getDB: getDBFrom(mockDb()) }
  );
  assert.equal(invalidLevel.status, 400);

  const invalidTier = await handleGoldenSave(
    ctx({
      body: {
        id: "caso-1",
        question: "¿Pregunta?",
        level: 1,
        tier: 7,
        expected: {},
      },
    }),
    { getDB: getDBFrom(mockDb()) }
  );
  assert.equal(invalidTier.status, 400);
});

test("golden save exige expected como objeto", async () => {
  const result = await handleGoldenSave(
    ctx({
      body: {
        id: "caso-1",
        question: "¿Pregunta?",
        level: 1,
        tier: 1,
        expected: "[]",
      },
    }),
    { getDB: getDBFrom(mockDb()) }
  );
  assert.equal(result.status, 400);
});

test("golden save guarda un caso con tier 4", async () => {
  const result = await handleGoldenSave(
    ctx({
      body: {
        id: "caso-1",
        question: "¿Pregunta?",
        level: 2,
        tier: 4,
        expected: { tools_any: ["query_layer"] },
      },
    }),
    { getDB: getDBFrom(mockDb({ dbRows: [{ id: "caso-1" }] })) }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.item.id, "caso-1");
});

test("golden delete devuelve 404 si no existe", async () => {
  const result = await handleGoldenDelete(
    ctx({ query: { id: "caso-1" } }),
    { getDB: getDBFrom(mockDb({ dbRows: [] })) }
  );
  assert.equal(result.status, 404);
});

test("golden delete borra un caso existente", async () => {
  const result = await handleGoldenDelete(
    ctx({ query: { id: "caso-1" } }),
    { getDB: getDBFrom(mockDb({ dbRows: [{ id: "caso-1" }] })) }
  );
  assert.equal(result.status, 200);
});
