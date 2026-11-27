import test from "node:test";
import assert from "node:assert/strict";

import {
  getDocumentSettings,
  _resetDocumentSettingsCache,
  DOCUMENT_SETTINGS_DEFAULTS,
} from "../settings.js";

function fakeDb(values = {}, calls = { count: 0 }) {
  return {
    calls,
    async rpc(name, params) {
      calls.count += 1;
      if (name !== "chat_get_setting") return null;
      return params.p_key in values ? values[params.p_key] : params.p_default;
    },
  };
}

test("usa defaults sin BD ni env", async () => {
  _resetDocumentSettingsCache();
  const out = await getDocumentSettings({ env: {} });
  assert.deepEqual(out, DOCUMENT_SETTINGS_DEFAULTS);
});

test("lee enabled, min_score y top_k de la BD", async () => {
  _resetDocumentSettingsCache();
  const out = await getDocumentSettings({
    env: {},
    db: fakeDb({
      "chat.documents.enabled": false,
      "chat.documents.min_score": 0.7,
      "chat.documents.top_k": 3,
    }),
  });
  assert.deepEqual(out, { enabled: false, minScore: 0.7, topK: 3 });
});

test("env tiene prioridad sobre la BD", async () => {
  _resetDocumentSettingsCache();
  const out = await getDocumentSettings({
    env: {
      CHAT_DOCUMENTS_ENABLED: "0",
      RAG_MIN_SCORE: "0.8",
      RAG_TOP_K: "2",
    },
    db: fakeDb({
      "chat.documents.enabled": true,
      "chat.documents.min_score": 0.7,
      "chat.documents.top_k": 3,
    }),
  });
  assert.deepEqual(out, { enabled: false, minScore: 0.8, topK: 2 });
});

test("clampea valores fuera de rango", async () => {
  _resetDocumentSettingsCache();
  const out = await getDocumentSettings({
    env: { RAG_MIN_SCORE: "9", RAG_TOP_K: "99" },
    db: null,
  });
  assert.equal(out.minScore, 1);
  assert.equal(out.topK, 8);
});

test("cachea 5 min y force recarga", async () => {
  _resetDocumentSettingsCache();
  const calls = { count: 0 };
  const db = fakeDb(
    {
      "chat.documents.enabled": true,
      "chat.documents.min_score": 0.66,
      "chat.documents.top_k": 4,
    },
    calls
  );
  const a = await getDocumentSettings({ env: {}, db });
  const b = await getDocumentSettings({ env: {}, db });
  assert.deepEqual(a, b);
  assert.equal(calls.count, 3, "la segunda lectura debe usar caché");
  const c = await getDocumentSettings({ env: {}, db, force: true });
  assert.equal(calls.count, 6);
  assert.equal(c.topK, 4);
});

test("si la BD falla usa defaults", async () => {
  _resetDocumentSettingsCache();
  const db = {
    async rpc() {
      throw new Error("BD caída");
    },
  };
  const out = await getDocumentSettings({ env: {}, db });
  assert.deepEqual(out, DOCUMENT_SETTINGS_DEFAULTS);
});
