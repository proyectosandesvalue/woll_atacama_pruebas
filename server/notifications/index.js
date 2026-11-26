/**
 * Envío de emails transaccionales (Sprint 26-M).
 *
 * Un solo punto de entrada para códigos de login, alertas y avisos de estado.
 * El proveedor se elige con EMAIL_PROVIDER (`resend`, `smtp` o `console`).
 *
 * Seguridad:
 *   - No se registran códigos, API keys ni el destinatario completo.
 *   - El remitente debe ser un dominio verificado en Resend.
 */
import { loginCodeTemplate } from "./templates/login-code.js";
import { alertTemplate, statusTemplate } from "./templates/alert.js";
import { passwordResetTemplate } from "./templates/password-reset.js";
import { createConsoleProvider } from "./providers/console.js";
import { createResendProvider } from "./providers/resend.js";
import { createSmtpProvider } from "./providers/smtp.js";

const TEMPLATES = {
  "login-code": loginCodeTemplate,
  "password-reset": passwordResetTemplate,
  alert: alertTemplate,
  status: statusTemplate,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getEmailConfig(env = process.env) {
  const provider = String(env.EMAIL_PROVIDER || "console").trim();
  if (!["resend", "smtp", "console"].includes(provider)) {
    throw new Error(
      `EMAIL_PROVIDER no soportado: ${provider}. Válidos: resend, smtp, console.`
    );
  }
  const from = String(env.EMAIL_FROM || "no-reply@localhost").trim();
  if (provider === "smtp" && from.endsWith("@localhost")) {
    throw new Error("Falta EMAIL_FROM para EMAIL_PROVIDER=smtp.");
  }
  return {
    provider,
    from,
    replyTo: String(env.EMAIL_REPLY_TO || "").trim() || null,
    appName: String(env.EMAIL_APP_NAME || "WOLL Atacama").trim(),
  };
}

/**
 * @param {{
 *   to: string,
 *   template: "login-code"|"password-reset"|"alert"|"status",
 *   data?: object,
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   logger?: {log?: Function, error?: Function}
 * }} opts
 */
export async function sendEmail({
  to,
  template,
  data = {},
  env = process.env,
  fetchImpl = fetch,
  logger = console,
}) {
  if (!EMAIL_RE.test(String(to || ""))) {
    throw new Error("Destinatario de email inválido.");
  }
  const render = TEMPLATES[template];
  if (!render) {
    throw new Error(`Plantilla de email desconocida: ${template}`);
  }

  const config = getEmailConfig(env);
  const message = render({ ...data, appName: config.appName });

  const provider =
    config.provider === "resend"
      ? createResendProvider({ env, fetchImpl })
      : config.provider === "smtp"
        ? createSmtpProvider({ env })
        : createConsoleProvider({ env, logger });

  const result = await provider.send({
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    template,
    from: config.from,
    replyTo: config.replyTo,
  });

  return {
    ok: true,
    provider: config.provider,
    id: result?.id ?? null,
  };
}
