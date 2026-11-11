import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { HttpError } from "../http/errors.js";
import { parseQuery, readJsonBody } from "../http/body.js";
import { matchRoute } from "../http/router.js";

function mockRequest(body, headers = {}) {
  const req = Readable.from([Buffer.from(body)]);
  req.headers = {
    "content-type": "application/json",
    ...headers,
  };
  return req;
}

test("matchRoute encuentra por path y método", () => {
  const routes = [
    { method: "POST", path: "/api/chat" },
    { method: "GET", path: "/api/chat" },
    { method: "GET", path: "/healthz" },
  ];

  assert.equal(matchRoute(routes, "GET", "/healthz").methodAllowed, true);
  assert.equal(matchRoute(routes, "POST", "/api/chat").route.method, "POST");
  assert.equal(matchRoute(routes, "DELETE", "/api/chat").methodAllowed, false);
  assert.equal(matchRoute(routes, "GET", "/nope").pathExists, false);
});

test("matchRoute acepta OPTIONS si el path existe", () => {
  const result = matchRoute([{ method: "GET", path: "/healthz" }], "OPTIONS", "/healthz");
  assert.equal(result.route.path, "/healthz");
  assert.equal(result.methodAllowed, true);
});

test("readJsonBody parsea un objeto JSON", async () => {
  const body = await readJsonBody(mockRequest(JSON.stringify({ a: 1 })));
  assert.deepEqual(body, { a: 1 });
});

test("readJsonBody devuelve {} sin cuerpo", async () => {
  const body = await readJsonBody(mockRequest(""));
  assert.deepEqual(body, {});
});

test("readJsonBody rechaza JSON inválido", async () => {
  await assert.rejects(
    () => readJsonBody(mockRequest("{")),
    (err) => err instanceof HttpError && err.status === 400
  );
});

test("readJsonBody rechaza content-type no JSON", async () => {
  await assert.rejects(
    () =>
      readJsonBody(
        mockRequest("hola", { "content-type": "text/plain" })
      ),
    (err) => err instanceof HttpError && err.status === 415
  );
});

test("readJsonBody rechaza cuerpos sobre el límite", async () => {
  const req = mockRequest(JSON.stringify({ text: "x".repeat(100) }), {
    "content-length": "200",
  });
  await assert.rejects(
    () => readJsonBody(req, { limit: 50 }),
    (err) => err instanceof HttpError && err.status === 413
  );
});

test("parseQuery conserva el último valor repetido", () => {
  const query = parseQuery(new URLSearchParams("a=1&a=2&b=3"));
  assert.deepEqual(query, { a: "2", b: "3" });
});
