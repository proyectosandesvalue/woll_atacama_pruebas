import { test } from "node:test";
import assert from "node:assert/strict";

import { describeProvider, handleChatInfo } from "../chat-info.js";
import { chatInfoRoute } from "../../routes/chat-info.js";

test("chat-info identifica Groq", () => {
  const info = describeProvider({
    LLM_PROVIDER: "openai-compatible",
    LLM_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_MODEL: "openai/gpt-oss-120b",
    LLM_API_KEY: "gsk_secreto",
  });

  assert.equal(info.provider, "openai-compatible");
  assert.equal(info.provider_label, "Groq");
  assert.equal(info.model, "openai/gpt-oss-120b");
  assert.equal(info.external_processing, true);
  assert.equal(info.notice_version, "2026-11");
});

test("chat-info identifica Google AI Studio", () => {
  const info = describeProvider({
    LLM_PROVIDER: "openai-compatible",
    LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
    LLM_MODEL: "gemini-3.1-flash-lite",
  });

  assert.equal(info.provider_label, "Google AI Studio");
});

test("chat-info identifica Vertex AI", () => {
  const info = describeProvider({
    LLM_PROVIDER: "vertex-ai",
    GOOGLE_CLOUD_PROJECT: "woll-atacama",
    LLM_MODEL: "gemini-2.5-flash",
  });

  assert.equal(info.provider_label, "Google Cloud Vertex AI");
  assert.equal(info.model, "gemini-2.5-flash");
});

test("chat-info identifica OpenAI y proveedores compatibles", () => {
  assert.equal(
    describeProvider({
      LLM_BASE_URL: "https://api.openai.com/v1",
      LLM_MODEL: "gpt-4.1-mini",
    }).provider_label,
    "OpenAI"
  );

  assert.equal(
    describeProvider({
      LLM_BASE_URL: "https://llm.example.com/v1",
      LLM_MODEL: "modelo-local",
    }).provider_label,
    "Proveedor compatible con OpenAI"
  );
});

test("chat-info usa un texto genérico sin configuración", () => {
  const info = describeProvider({});

  assert.equal(info.provider_label, "Proveedor externo de modelos de lenguaje");
  assert.equal(info.model, null);
  assert.equal(info.external_processing, true);
});

test("chat-info no expone secretos ni la URL base", async () => {
  const env = {
    LLM_PROVIDER: "openai-compatible",
    LLM_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_MODEL: "openai/gpt-oss-120b",
    LLM_API_KEY: "gsk_secreto",
    GOOGLE_APPLICATION_CREDENTIALS_JSON: "{\"private_key\":\"secreto\"}",
  };

  const result = await handleChatInfo(undefined, { env });

  assert.equal(result.status, 200);
  assert.equal(result.headers["Cache-Control"], "public, max-age=300");
  assert.equal(JSON.stringify(result.body).includes("gsk_secreto"), false);
  assert.equal(JSON.stringify(result.body).includes("private_key"), false);
  assert.equal(JSON.stringify(result.body).includes("api.groq.com"), false);
});

test("la ruta de chat-info es GET y no requiere body", () => {
  assert.equal(chatInfoRoute.method, "GET");
  assert.equal(chatInfoRoute.path, "/api/chat/info");
  assert.equal(chatInfoRoute.body, undefined);
});
