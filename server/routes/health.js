/**
 * Healthcheck del servidor Node.
 *
 * `/healthz` verifica que la API pueda hablar con la BD. `/readyz` es un alias
 * para orquestadores. No expone versiones de dependencias ni secretos.
 */

async function checkDatabase(ctx) {
  const db = await ctx.getDB();
  if (typeof db.ping === "function") {
    await db.ping();
    return;
  }
  // Compatibilidad con el driver REST de Supabase (demo).
  await db.rpc("chat_catalog");
}

async function healthHandler(ctx) {
  try {
    await checkDatabase(ctx);
    return {
      status: 200,
      body: {
        ok: true,
        service: "woll-api",
        db: "up",
        uptime_s: Math.round(process.uptime()),
      },
    };
  } catch (err) {
    ctx.logger?.error?.("[health] BD no responde:", err?.message || err);
    return {
      status: 503,
      body: { ok: false, service: "woll-api", db: "down" },
    };
  }
}

export const healthRoute = {
  method: "GET",
  path: "/healthz",
  handler: healthHandler,
};

export const readyRoute = {
  method: "GET",
  path: "/readyz",
  handler: healthHandler,
};
