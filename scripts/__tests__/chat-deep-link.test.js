import test from "node:test";
import assert from "node:assert/strict";

import { shouldOpenChatFromUrl } from "../../js/utils/chatDeepLink.js";

test("abre el chat con ?chat=1", () => {
  assert.equal(shouldOpenChatFromUrl("?chat=1", ""), true);
});

test("abre el chat con #chat", () => {
  assert.equal(shouldOpenChatFromUrl("", "#chat"), true);
});

test("no abre el chat sin el parámetro", () => {
  assert.equal(shouldOpenChatFromUrl("", ""), false);
  assert.equal(shouldOpenChatFromUrl("?chat=0", ""), false);
  assert.equal(shouldOpenChatFromUrl("?otro=1", "#otro"), false);
});
