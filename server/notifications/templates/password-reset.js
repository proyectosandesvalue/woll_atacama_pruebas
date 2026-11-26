import { escapeHtml, layout } from "../render.js";

/**
 * Enlace de recuperación de contraseña.
 *
 * @param {{ link: string, minutes?: number, appName?: string }} data
 * @returns {{ subject: string, text: string, html: string }}
 */
export function passwordResetTemplate({
  link,
  minutes = 30,
  appName = "WOLL Atacama",
}) {
  const subject = `${appName}: restablece tu contraseña`;
  const text = [
    `Recibimos una solicitud para restablecer la contraseña de ${appName}.`,
    `Abre este enlace (vence en ${minutes} minutos y se usa una sola vez):`,
    link,
    "Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue vigente.",
  ].join("\n");

  const html = layout({
    appName,
    title: subject,
    bodyHtml: [
      `<p>Recibimos una solicitud para restablecer tu contraseña.</p>`,
      `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1f4e79;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Restablecer contraseña</a></p>`,
      `<p style="color:#52606d">El enlace vence en ${minutes} minutos y se usa una sola vez.</p>`,
      `<p>Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue vigente.</p>`,
    ].join(""),
  });

  return { subject, text, html };
}
