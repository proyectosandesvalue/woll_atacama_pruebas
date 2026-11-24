/**
 * Proveedor de correo para desarrollo.
 *
 * No imprime el cuerpo por defecto: los códigos de login no deben quedar en
 * logs. Para probar en local, activar `EMAIL_CONSOLE_SHOW_BODY=1`.
 */

/**
 * @param {string} email
 * @returns {string}
 */
export function redactEmail(email) {
  const value = String(email || "");
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  const user = value.slice(0, at);
  const domain = value.slice(at + 1);
  const visible = user.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function createConsoleProvider({ env = process.env, logger = console } = {}) {
  const showBody = /^(1|true|yes)$/i.test(env.EMAIL_CONSOLE_SHOW_BODY || "");
  return {
    async send({ to, subject, text, template }) {
      logger.log(
        JSON.stringify({
          event: "email.console",
          template,
          to: redactEmail(to),
          subject,
          ...(showBody ? { text } : {}),
        })
      );
      return { id: "console" };
    },
  };
}
