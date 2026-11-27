import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const exists = async (path) => {
  await access(new URL(`../../${path}`, import.meta.url));
};

test("la portada Geodatos vive en la raíz y apunta al visor interno", async () => {
  const html = await read("geodatos.html");

  assert.match(html, /<html lang="es">/);
  assert.match(html, /<title>Geodatos \| Atacamawoll/);
  assert.match(html, /href="\/visor"/);
  assert.match(html, /href="\/chat"/);
  assert.match(html, /assets\/geodatos\/logo-atacamawoll\.webp/);
  assert.match(html, /css\/fonts\/plus-jakarta-sans-latin\.woff2/);
});

test("la portada no depende de CDNs ni de scripts inline", async () => {
  const html = await read("geodatos.html");

  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(html, /<script[^>]*src="https?:\/\//);

  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].map(
    ([tag]) => tag,
  );
  assert.deepEqual(inlineScripts, ['<script type="application/ld+json">']);
});

test("Nginx sirve la portada en / y el visor en /visor", async () => {
  const conf = await read("deploy/nginx/woll.conf");
  const dev = await read("deploy/nginx/woll.dev.conf");
  const locations = await read("deploy/nginx/woll-locations.conf");

  assert.match(conf, /index geodatos\.html;/);
  assert.match(dev, /index geodatos\.html;/);
  assert.match(locations, /location = \/visor \{/);
  assert.match(locations, /try_files \/index\.html =404;/);
  assert.match(locations, /location = \/visor\/ \{/);
  assert.match(locations, /return 301 \/visor/);
  assert.match(locations, /try_files \$uri \$uri\/ \/geodatos\.html;/);
});

test("el logo del visor apunta al sitio principal", async () => {
  const visor = await read("index.html");
  assert.match(
    visor,
    /<a href="https:\/\/www\.atacamawoll\.cl\/" class="brand" aria-label="Ir a Atacamawoll"/
  );
});

test("Vercel mantiene /visor para la demo/staging", async () => {
  const vercel = JSON.parse(await read("vercel.json"));
  assert.ok(
    vercel.rewrites.some(
      (rewrite) =>
        rewrite.source === "/visor" && rewrite.destination === "/index.html",
    ),
  );
  assert.ok(
    vercel.redirects.some(
      (redirect) =>
        redirect.source === "/visor/" && redirect.destination === "/visor",
    ),
  );
});

test("los assets y el JS de la portada existen", async () => {
  await exists("js/geodatos.js");
  await exists("assets/geodatos/logo-atacamawoll.webp");
  await exists("assets/geodatos/og-geodatos.webp");
  await exists("css/fonts/plus-jakarta-sans-latin.woff2");
  await exists("css/fonts/plus-jakarta-sans-OFL.txt");
});

test("el release verifica la portada y el visor", async () => {
  const release = await read("deploy/vps/release.sh");
  assert.match(release, /wait_http \//);
  assert.match(release, /wait_http \/visor/);
  assert.match(release, /\/visor\?chat=1/);
});

test("la portada habla de herramientas, no de productos", async () => {
  const html = await read("geodatos.html");

  assert.match(html, /Explorar las herramientas/);
  assert.match(html, /id="herramientas"/);
  assert.match(html, /Tres herramientas, un ecosistema/);
  assert.doesNotMatch(html, /productos/i);
});
