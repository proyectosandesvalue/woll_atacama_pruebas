import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSystemPrompt,
  DOCUMENT_RULES,
  _resetPromptCache,
} from "../prompts.js";

function fakeDb({ documents = "REGLAS DOCUMENTALES DE PRUEBA ".repeat(8), enabled = true, failDocs = false } = {}) {
  return {
    async rpc(name, params = {}) {
      if (name === "chat_get_prompt" && params.p_id === "chat.documents") {
        if (failDocs) throw new Error("BD caída");
        return documents;
      }
      if (name === "chat_get_prompt") return null;
      if (name === "chat_get_setting" && params.p_key === "chat.documents.enabled") {
        return enabled;
      }
      if (name === "chat_get_setting") return null;
      return null;
    },
  };
}

test("incluye el prompt documental de la BD", async () => {
  _resetPromptCache();
  const prompt = await buildSystemPrompt("metodología", [], {
    db: fakeDb(),
    catalog: [],
  });
  assert.match(prompt, /REGLAS DOCUMENTALES DE PRUEBA/);
});

test("no incluye el bloque documental si está desactivado", async () => {
  _resetPromptCache();
  const prompt = await buildSystemPrompt("metodología", [], {
    db: fakeDb({ enabled: false }),
    catalog: [],
  });
  assert.doesNotMatch(prompt, /REGLAS DOCUMENTALES DE PRUEBA/);
  assert.doesNotMatch(prompt, /BLOQUE DOCUMENTAL/);
});

test("usa el fallback DOCUMENT_RULES si la BD falla", async () => {
  _resetPromptCache();
  const prompt = await buildSystemPrompt("metodología", [], {
    db: fakeDb({ failDocs: true }),
    catalog: [],
  });
  assert.match(prompt, /BLOQUE DOCUMENTAL/);
  assert.match(prompt, /NO CONFIABLE/);
});

test("incluye el bloque WMS/Copernicus", async () => {
  _resetPromptCache();
  const prompt = await buildSystemPrompt("NDVI en Copiapó", [], {
    db: fakeDb(),
    catalog: [],
  });
  assert.match(prompt, /CAPAS WMS\/SATELITALES/);
  assert.match(prompt, /copernicus_ndvi/);
  assert.match(prompt, /get_wms_pixel/);
});

test("DOCUMENT_RULES prohíbe usar documentos para conteos", () => {
  assert.match(DOCUMENT_RULES, /search_documents/);
  assert.match(DOCUMENT_RULES, /NO la uses para conteos/);
  assert.match(DOCUMENT_RULES, /No cites un documento/);
});
