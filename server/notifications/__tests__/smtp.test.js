import { test } from "node:test";
import assert from "node:assert/strict";

import { createSmtpProvider } from "../providers/smtp.js";
import { getEmailConfig } from "../index.js";

function fakeTransport() {
  const captured = { opts: null, mail: null };
  return {
    captured,
    factory: (opts) => {
      captured.opts = opts;
      return {
        sendMail: async (mail) => {
          captured.mail = mail;
          return { messageId: "msg-1" };
        },
      };
    },
  };
}

test("SMTP usa 465 seguro y autentica con la casilla", async () => {
  const { captured, factory } = fakeTransport();
  const provider = createSmtpProvider({
    env: {
      SMTP_HOST: "mail.atacamawoll.cl",
      SMTP_PORT: "465",
      SMTP_USER: "no-reply@atacamawoll.cl",
      SMTP_PASS: "secreto",
    },
    transportFactory: factory,
  });
  const result = await provider.send({
    to: "dueno@example.com",
    subject: "Prueba",
    text: "hola",
    html: "<p>hola</p>",
    from: "no-reply@atacamawoll.cl",
  });
  assert.equal(captured.opts.host, "mail.atacamawoll.cl");
  assert.equal(captured.opts.port, 465);
  assert.equal(captured.opts.secure, true);
  assert.equal(captured.opts.auth.user, "no-reply@atacamawoll.cl");
  assert.equal(captured.mail.to, "dueno@example.com");
  assert.equal(captured.mail.from, "no-reply@atacamawoll.cl");
  assert.equal(result.id, "msg-1");
});

test("SMTP en 587 no usa secure por defecto", () => {
  const { captured, factory } = fakeTransport();
  createSmtpProvider({
    env: { SMTP_HOST: "mail.example.com", SMTP_PORT: "587", SMTP_SECURE: "0" },
    transportFactory: factory,
  });
  assert.equal(captured.opts.secure, false);
});

test("SMTP exige host y contraseña si hay usuario", () => {
  assert.throws(() => createSmtpProvider({ env: {}, transportFactory: () => ({}) }), /SMTP_HOST/);
  assert.throws(
    () =>
      createSmtpProvider({
        env: { SMTP_HOST: "mail.example.com", SMTP_USER: "u@example.com" },
        transportFactory: () => ({}),
      }),
    /SMTP_PASS/
  );
});

test("EMAIL_PROVIDER=smtp exige un EMAIL_FROM real", () => {
  assert.throws(
    () => getEmailConfig({ EMAIL_PROVIDER: "smtp" }),
    /EMAIL_FROM/
  );
  const cfg = getEmailConfig({
    EMAIL_PROVIDER: "smtp",
    EMAIL_FROM: "no-reply@atacamawoll.cl",
  });
  assert.equal(cfg.provider, "smtp");
});
