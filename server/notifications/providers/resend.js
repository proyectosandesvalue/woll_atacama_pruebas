/**
 * Proveedor Resend (https://resend.com).
 *
 * El remitente debe pertenecer a un dominio verificado en Resend. No se
 * registra la API key ni el cuerpo del mensaje.
 */

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch
 * }} [opts]
 */
export function createResendProvider({ env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Falta RESEND_API_KEY para EMAIL_PROVIDER=resend.");
  }

  return {
    async send({ to, subject, text, html, from, replyTo }) {
      const payload = {
        from,
        to: [to],
        subject,
        text,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      };

      let res;
      try {
        res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000),
        });
      } catch (err) {
        const reason = err?.name === "TimeoutError" ? "timeout" : "red";
        throw new Error(`Resend no respondió (${reason}).`);
      }

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = String(body?.message || body?.error || "").slice(0, 200);
        throw new Error(`Resend ${res.status}${detail ? `: ${detail}` : ""}`);
      }
      return { id: body?.id || null };
    },
  };
}
