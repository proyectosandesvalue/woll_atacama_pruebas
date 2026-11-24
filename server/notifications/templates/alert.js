import { escapeHtml, layout } from "../render.js";

/**
 * Alerta operativa (ops-check, backup, certificado, ingestas).
 *
 * @param {{ title: string, lines?: string[], appName?: string }} data
 * @returns {{ subject: string, text: string, html: string }}
 */
export function alertTemplate({ title, lines = [], appName = "WOLL Atacama" }) {
  const subject = `[${appName}] ${title}`;
  const text = [title, ...lines].join("\n");
  const html = layout({
    appName,
    title: subject,
    bodyHtml: [
      `<p><strong>${escapeHtml(title)}</strong></p>`,
      lines.length
        ? `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
        : "",
    ].join(""),
  });
  return { subject, text, html };
}

/**
 * Aviso de estado o mantenimiento.
 *
 * @param {{ title: string, message: string, appName?: string }} data
 * @returns {{ subject: string, text: string, html: string }}
 */
export function statusTemplate({ title, message, appName = "WOLL Atacama" }) {
  const subject = `[${appName}] ${title}`;
  const text = `${title}\n\n${message}`;
  const html = layout({
    appName,
    title: subject,
    bodyHtml: [
      `<p><strong>${escapeHtml(title)}</strong></p>`,
      `<p>${escapeHtml(message)}</p>`,
    ].join(""),
  });
  return { subject, text, html };
}
