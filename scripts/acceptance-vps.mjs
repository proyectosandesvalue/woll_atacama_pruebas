#!/usr/bin/env node
/**
 * Aceptación funcional contra el VPS (Sprint 30).
 *
 * Uso:
 *   node scripts/acceptance-vps.mjs [--base https://visor.atacamawoll.cl] [--with-chat]
 *
 * No requiere credenciales. No escribe datos salvo que se pida --with-chat
 * (una consulta real al chat) o una valoración de prueba (no se hace aquí).
 */
const args = process.argv.slice(2);
const opts = { base: "https://visor.atacamawoll.cl", withChat: false };
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--base") opts.base = args[++i];
  else if (args[i] === "--with-chat") opts.withChat = true;
  else if (args[i] === "--help" || args[i] === "-h") {
    console.log("Uso: acceptance-vps.mjs [--base URL] [--with-chat]");
    process.exit(0);
  } else {
    console.error(`Argumento desconocido: ${args[i]}`);
    process.exit(2);
  }
}
const base = opts.base.replace(/\/+$/, "");
const results = [];

async function get(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    ...options,
  });
  return res;
}

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (err) {
    results.push({ name, ok: false, detail: err?.message || String(err) });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await check("/ responde portada Geodatos", async () => {
  const res = await get("/");
  const html = await res.text();
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(/<title>[^<]*Geodatos/i.test(html), "título sin Geodatos");
  assert(html.includes('id="ciHeader"') === false, "no debe ser el shell /chat");
  assert(res.headers.get("content-security-policy"), "sin CSP");
  return "200";
});

await check("/visor responde el visor", async () => {
  const res = await get("/visor");
  const html = await res.text();
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(/Plataforma Woll Atacama/i.test(html), "título del visor ausente");
  return "200";
});

await check("/chat responde el shell inmersivo", async () => {
  const res = await get("/chat");
  const html = await res.text();
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(html.includes('id="ciHeader"'), "sin header inmersivo");
  assert(html.includes('data-ci-query'), "sin consultas sugeridas");
  return "200";
});

await check("/chat/ redirige a /chat", async () => {
  const res = await get("/chat/");
  assert(res.status === 301, `HTTP ${res.status}`);
  assert((res.headers.get("location") || "").endsWith("/chat"), "location inválida");
  return "301";
});

await check("/visor/ redirige a /visor", async () => {
  const res = await get("/visor/");
  assert(res.status === 301, `HTTP ${res.status}`);
  return "301";
});

await check("/api/config responde snapshot", async () => {
  const res = await get("/api/config");
  const body = await res.json();
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(body.config && typeof body.config === "object", "sin config");
  return "200";
});

await check("/healthz y base de datos", async () => {
  const res = await get("/healthz");
  const body = await res.json();
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(body.ok === true && body.db === "up", "BD no disponible");
  return "200 db=up";
});

await check("admin disponible", async () => {
  const res = await get("/admin.html");
  const html = await res.text();
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(html.includes('id="forgotLink"'), "sin enlace de recuperación");
  assert(html.includes('id="loginCodeForm"'), "sin formulario de código");
  return "200";
});

await check("admin requiere sesión", async () => {
  const res = await get("/api/admin/session");
  assert(res.status === 401, `HTTP ${res.status}`);
  return "401";
});

await check("feedback admin requiere sesión", async () => {
  const res = await get("/api/admin/feedback");
  assert(res.status === 401, `HTTP ${res.status}`);
  return "401";
});

await check("GeoJSON se sirve comprimido", async () => {
  const res = await get("/geojson/acuiferos.geojson", {
    headers: { "accept-encoding": "gzip" },
  });
  const type = res.headers.get("content-type") || "";
  assert(res.status === 200, `HTTP ${res.status}`);
  assert(type.includes("geo+json"), `content-type ${type}`);
  assert(res.headers.get("content-encoding") === "gzip", "sin gzip");
  return "200 geo+json gzip";
});

await check("assets del visor y /chat", async () => {
  for (const path of [
    "/assets/geodatos/logo-atacamawoll.webp",
    "/css/components/chat-immersive.css",
    "/js/ui/chatImmersiveUI.js",
  ]) {
    const res = await get(path);
    assert(res.status === 200, `${path}: HTTP ${res.status}`);
  }
  return "3/3";
});

await check("feedback rechaza payload inválido", async () => {
  const res = await get("/api/chat/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response_id: "x", rating: "up" }),
  });
  assert(res.status === 400, `HTTP ${res.status}`);
  return "400";
});

if (opts.withChat) {
  await check("chat responde y devuelve response_id", async () => {
    const res = await get("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "¿Cuántas comunas tiene la región de Atacama?",
      }),
    });
    const body = await res.json();
    assert(res.status === 200, `HTTP ${res.status}`);
    assert(typeof body.reply === "string" && body.reply.length > 0, "sin reply");
    assert(
      /^[0-9a-f-]{36}$/i.test(String(body.response_id || "")),
      "sin response_id"
    );
    return "200";
  });
}

const failed = results.filter((r) => !r.ok);
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}  (${result.detail})`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks OK`);
process.exit(failed.length === 0 ? 0 : 1);
