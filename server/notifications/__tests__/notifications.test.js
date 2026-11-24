import { test } from "node:test";
import assert from "node:assert/strict";

import { sendEmail, getEmailConfig } from "../index.js";
import { redactEmail } from "../providers/console.js";
import { loginCodeTemplate } from "../templates/login-code.js";
import { alertTemplate } from "../templates/alert.js";

test("redactEmail no expone el buzón completo", () => {
  assert.equal(redactEmail("dueno@atacamawoll.cl"), "d***@atacamawoll.cl");
  assert.equal(redactEmail("sin-arroba"), "***");
  assert.equal(redactEmail(""), "***");
});

test("la plantilla de login incluye el código y escapa el nombre de la app", () => {
  const msg = loginCodeTemplate({
    code: "123456",
    minutes: 10,
    appName: "<WOLL>",
    ipHint: "Chile",
  });
  assert.ok(!msg.subject.includes("123456"));
  assert.match(msg.text, /123456/);
  assert.match(msg.html, /123456/);
  assert.match(msg.html, /&lt;WOLL&gt;/);
  assert.ok(!msg.html.includes("<WOLL>"));
});

test("la plantilla de alerta escapa sus líneas", () => {
  const msg = alertTemplate({
    title: "Disco <lleno>",
    lines: ["uso 90 %", "<script>alert(1)</script>"],
  });
  assert.match(msg.subject, /Disco <lleno>/);
  assert.ok(!msg.html.includes("<script>"));
  assert.match(msg.html, /&lt;script&gt;/);
});

test("console no registra el código por defecto", async () => {
  const lines = [];
  const result = await sendEmail({
    to: "dueno@example.com",
    template: "login-code",
    data: { code: "987654" },
    env: { EMAIL_PROVIDER: "console", EMAIL_APP_NAME: "WOLL" },
    logger: { log: (line) => lines.push(line) },
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, "console");
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.event, "email.console");
  assert.equal(entry.to, "d***@example.com");
  assert.ok(!lines[0].includes("987654"));
  assert.ok(!lines[0].includes("dueno@example.com"));
});

test("console puede mostrar el cuerpo si se pide explícitamente", async () => {
  const lines = [];
  await sendEmail({
    to: "dueno@example.com",
    template: "login-code",
    data: { code: "987654" },
    env: {
      EMAIL_PROVIDER: "console",
      EMAIL_CONSOLE_SHOW_BODY: "1",
    },
    logger: { log: (line) => lines.push(line) },
  });
  assert.ok(lines[0].includes("987654"));
});

test("resend arma el payload correcto", async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts, body: JSON.parse(opts.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "msg_1" }),
    };
  };

  const result = await sendEmail({
    to: "dueno@example.com",
    template: "alert",
    data: { title: "Backup falló", lines: ["hace 30 h"] },
    env: {
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "no-reply@notificaciones.example.com",
      EMAIL_APP_NAME: "WOLL",
    },
    fetchImpl,
  });

  assert.equal(result.provider, "resend");
  assert.equal(result.id, "msg_1");
  assert.equal(captured.url, "https://api.resend.com/emails");
  assert.equal(captured.opts.headers.authorization, "Bearer re_test");
  assert.equal(captured.body.from, "no-reply@notificaciones.example.com");
  assert.deepEqual(captured.body.to, ["dueno@example.com"]);
  assert.match(captured.body.subject, /Backup falló/);
  assert.ok(captured.body.html.includes("hace 30 h"));
  assert.ok(!JSON.stringify(captured.body).includes("re_test"));
});

test("resend falla si no hay API key", async () => {
  await assert.rejects(
    sendEmail({
      to: "dueno@example.com",
      template: "alert",
      data: { title: "x", lines: [] },
      env: {
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "no-reply@example.com",
      },
    }),
    /RESEND_API_KEY/
  );
});

test("resend propaga el error del proveedor sin filtrar la clave", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 422,
    json: async () => ({ message: "invalid from" }),
  });
  await assert.rejects(
    sendEmail({
      to: "dueno@example.com",
      template: "alert",
      data: { title: "x", lines: [] },
      env: {
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_secreto",
        EMAIL_FROM: "no-reply@example.com",
      },
      fetchImpl,
    }),
    (err) => {
      assert.match(err.message, /Resend 422/);
      assert.ok(!err.message.includes("re_secreto"));
      return true;
    }
  );
});

test("valida destinatario, plantilla y proveedor", async () => {
  await assert.rejects(
    sendEmail({
      to: "sin-arroba",
      template: "alert",
      env: { EMAIL_PROVIDER: "console" },
      logger: { log() {} },
    }),
    /Destinatario/
  );
  await assert.rejects(
    sendEmail({
      to: "a@b.cl",
      template: "desconocida",
      env: { EMAIL_PROVIDER: "console" },
      logger: { log() {} },
    }),
    /Plantilla/
  );
  assert.throws(() => getEmailConfig({ EMAIL_PROVIDER: "otro" }), /no soportado/);
});
