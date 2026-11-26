import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const exists = async (path) => {
  await access(new URL(`../../${path}`, import.meta.url));
};

test("la SPA contiene el shell del chat inmersivo", async () => {
  const html = await read("index.html");

  assert.match(html, /id="ciHeader"/);
  assert.match(html, /id="ciIntro"/);
  assert.match(html, /id="ciMapTop"/);
  assert.match(html, /id="ciDivider"/);
  assert.match(html, /id="ciNewConversation"/);
  assert.match(html, /class="header header-custom"/);
  assert.match(html, /css\/components\/chat-immersive\.css/);
});

test("el módulo inmersivo reutiliza el mapa y los resultados del chat", async () => {
  const js = await read("js/ui/chatImmersiveUI.js");

  assert.match(js, /window\.location\.pathname === "\/chat"/);
  assert.match(js, /clearResultsByLayerId/);
  assert.match(js, /woll:chat-results/);
  assert.match(js, /woll:chat-cleared/);
  assert.match(js, /--ci-map-width/);
  assert.match(js, /invalidateSize/);
  assert.match(js, /chat-immersive/);
});

test("el chat avisa al shell cuando cambian los resultados", async () => {
  const chat = await read("js/ui/chatUI.js");

  assert.match(chat, /woll:chat-results/);
  assert.match(chat, /woll:chat-cleared/);
  assert.match(chat, /chat-immersive/);
  assert.match(chat, /layers: Array\.isArray\(focusLayers\)/);
});

test("en /chat el mapa abre solo con límites comunales y lo consultado", async () => {
  const app = await read("js/app.js");

  assert.match(app, /isChatImmersiveRoute/);
  assert.match(app, /\["limite_comunal_linea"\]/);
});

test("el shell no duplica la caja de capas visibles en el mapa", async () => {
  const html = await read("index.html");
  const shell = await read("js/ui/chatImmersiveUI.js");

  assert.doesNotMatch(html, /id="ciMapLegend"/);
  assert.doesNotMatch(shell, /ci-legend-/);
  assert.doesNotMatch(shell, /Capas visibles/);
});

test("el encuadre usa solo las capas nuevas y espera a que el mapa abra", async () => {
  const shell = await read("js/ui/chatImmersiveUI.js");
  const chat = await read("js/ui/chatUI.js");

  assert.match(shell, /detail\?\.layers/);
  assert.match(shell, /requestAnimationFrame\(fit\)/);
  assert.match(shell, /fitBounds/);
  assert.match(chat, /const before = new Set\(appState\.chat\.resultsLayers/);
  assert.match(chat, /updateClearResultsBtn\(added\)/);
  assert.match(chat, /fitBounds: !isChatImmersiveRoute/);
});

test("el mapa permite cambiar entre OpenStreetMap y Google Maps", async () => {
  const html = await read("index.html");
  const shell = await read("js/ui/chatImmersiveUI.js");

  assert.match(html, /id="ciBasemapSelect"/);
  assert.match(html, /value="openStreetMap"/);
  assert.match(html, /value="googleMaps"/);
  assert.match(shell, /capasBaseConfig/);
  assert.match(shell, /setCurrentBaseLayer/);
  assert.match(shell, /function applyBasemap/);
});

test("el mapa se puede volver a abrir desde el chat si hay capas", async () => {
  const html = await read("index.html");
  const shell = await read("js/ui/chatImmersiveUI.js");

  assert.match(html, /id="ciShowMap"/);
  assert.match(shell, /mapCollapsed/);
  assert.match(shell, /mapToggle/);
  assert.match(shell, /mapCollapsed = false/);
});

test("Nginx y dev-site sirven /chat sin cambiar la URL", async () => {
  const locations = await read("deploy/nginx/woll-locations.conf");
  const devSite = await read("scripts/dev-site.mjs");

  assert.match(locations, /location = \/chat \{/);
  assert.match(locations, /try_files \/index\.html =404;/);
  assert.match(locations, /location = \/chat\/ \{/);
  assert.match(devSite, /pathname === "\/visor" \|\| pathname === "\/chat"/);
});

test("Vercel expone /chat para la demo", async () => {
  const vercel = JSON.parse(await read("vercel.json"));

  assert.ok(
    vercel.rewrites.some(
      (rewrite) =>
        rewrite.source === "/chat" && rewrite.destination === "/index.html",
    ),
  );
  assert.ok(
    vercel.redirects.some(
      (redirect) =>
        redirect.source === "/chat/" && redirect.destination === "/chat",
    ),
  );
});

test("la portada Geodatos abre el chat inmersivo", async () => {
  const html = await read("geodatos.html");

  assert.match(html, /href="\/chat"/);
  assert.doesNotMatch(html, /href="\/visor\?chat=1"/);
});

test("el release verifica /chat y conserva /visor", async () => {
  const release = await read("deploy/vps/release.sh");

  assert.match(release, /wait_http \/chat/);
  assert.match(release, /wait_http \/visor/);
  await exists("css/components/chat-immersive.css");
});

test("el body de /chat se marca antes de pintar el visor", async () => {
  const html = await read("index.html");
  const early = await read("js/chat-route.js");

  assert.match(
    html,
    /<body>\s*<script src="js\/chat-route\.js\?v=20261126e"><\/script>/
  );
  assert.match(early, /pathname === "\/chat"/);
  assert.match(early, /classList\.add\("chat-immersive"\)/);
});
