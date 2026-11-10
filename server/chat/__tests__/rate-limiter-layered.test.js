import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkChatRateLimit,
  CHAT_RATE_LIMITS,
  _resetRateLimiter,
} from "../rate-limiter.js";

test("limita la ráfaga por sesión aunque la IP tenga margen", () => {
  _resetRateLimiter();
  const total = CHAT_RATE_LIMITS.session.perBurst;

  for (let i = 0; i < total; i++) {
    const result = checkChatRateLimit({
      ip: "1.1.1.1",
      sessionId: "sesion-fija",
      country: "CL",
    });
    assert.equal(result.ok, true, `request ${i + 1} debería pasar`);
  }

  const blocked = checkChatRateLimit({
    ip: "1.1.1.1",
    sessionId: "sesion-fija",
    country: "CL",
  });

  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("permite 20-50 usuarios detrás de una IP institucional", () => {
  _resetRateLimiter();

  // 30 usuarios distintos, una request cada uno, misma IP.
  for (let i = 0; i < 30; i++) {
    const result = checkChatRateLimit({
      ip: "10.0.0.1",
      sessionId: `usuario-${i}`,
      country: "CL",
    });
    assert.equal(result.ok, true, `usuario ${i} debería pasar`);
  }
});

test("corta por ráfaga de IP cuando se supera el límite institucional", () => {
  _resetRateLimiter();
  const total = CHAT_RATE_LIMITS.latam.perBurst;

  for (let i = 0; i < total; i++) {
    const result = checkChatRateLimit({
      ip: "10.0.0.2",
      sessionId: `usuario-${i}`,
      country: "CL",
    });
    assert.equal(result.ok, true, `request ${i + 1} debería pasar`);
  }

  const blocked = checkChatRateLimit({
    ip: "10.0.0.2",
    sessionId: "usuario-extra",
    country: "CL",
  });

  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});
