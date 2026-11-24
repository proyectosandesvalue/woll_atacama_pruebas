import { escapeHtml, layout } from "../render.js";

/**
 * Código de segundo factor para el login del panel.
 *
 * @param {{ code: string, minutes?: number, appName?: string, ipHint?: string }} data
 * @returns {{ subject: string, text: string, html: string }}
 */
export function loginCodeTemplate({
  code,
  minutes = 10,
  appName = "WOLL Atacama",
  ipHint = null,
}) {
  const safeCode = escapeHtml(code);
  const safeApp = escapeHtml(appName);
  const subject = `${appName}: código de acceso`;

  const text = [
    `Tu código de acceso a ${appName} es: ${code}`,
    `Vence en ${minutes} minutos y se puede usar una sola vez.`,
    ipHint ? `Solicitud desde ${ipHint}.` : null,
    "Si no fuiste tú, ignora este mensaje y revisa el acceso al panel.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = layout({
    appName,
    title: subject,
    bodyHtml: [
      `<p>Tu código de acceso a <strong>${safeApp}</strong> es:</p>`,
      `<p style="font-size:30px;letter-spacing:6px;font-weight:bold;margin:16px 0">${safeCode}</p>`,
      `<p>Vence en ${minutes} minutos y se puede usar una sola vez.</p>`,
      ipHint ? `<p style="color:#52606d">Solicitud desde ${escapeHtml(ipHint)}.</p>` : "",
      "<p>Si no fuiste tú, ignora este mensaje y revisa el acceso al panel.</p>",
    ].join(""),
  });

  return { subject, text, html };
}
