/**
 * Proveedor SMTP (SiteGround u otro servidor de correo).
 *
 * Usa `nodemailer` con timeout corto: un login no puede quedarse esperando
 * al correo. Nunca registra la contraseña ni el cuerpo del mensaje.
 */
import nodemailer from "nodemailer";

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   transportFactory?: (opts: object) => { sendMail: (msg: object) => Promise<object> }
 * }} [opts]
 */
export function createSmtpProvider({
  env = process.env,
  transportFactory,
} = {}) {
  const host = String(env.SMTP_HOST || "").trim();
  if (!host) {
    throw new Error("Falta SMTP_HOST para EMAIL_PROVIDER=smtp.");
  }

  const port = Number(env.SMTP_PORT) || 465;
  const secure =
    env.SMTP_SECURE === undefined || env.SMTP_SECURE === ""
      ? port === 465
      : /^(1|true|yes)$/i.test(env.SMTP_SECURE);

  const user = String(env.SMTP_USER || "").trim();
  const pass = String(env.SMTP_PASS || "");
  if (user && !pass) {
    throw new Error("Falta SMTP_PASS para autenticar en SMTP.");
  }

  const factory = transportFactory || nodemailer.createTransport;
  const transporter = factory({
    host,
    port,
    secure,
    ...(user ? { auth: { user, pass } } : {}),
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });

  return {
    async send({ to, subject, text, html, from, replyTo }) {
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
        ...(replyTo ? { replyTo } : {}),
      });
      return { id: info?.messageId || null };
    },
  };
}
