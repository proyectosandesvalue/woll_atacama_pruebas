import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("index.html y help.html usan assets locales, sin CDN", () => {
  for (const file of [
    "index.html",
    "help.html",
    "admin.html",
    "geodatos.html",
    "terminos.html",
    "privacidad.html",
    "fuentes.html",
  ]) {
    const html = read(file);
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
    const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
    for (const url of [...scripts, ...styles]) {
      assert.equal(
        /^https?:\/\//.test(url),
        false,
        `${file} carga un recurso externo: ${url}`
      );
    }
  }

  for (const file of [
    "js/lib/leaflet/leaflet.js",
    "js/lib/leaflet/leaflet.css",
    "js/lib/leaflet.markercluster/leaflet.markercluster.js",
    "js/lib/leaflet.markercluster/MarkerCluster.css",
    "js/lib/flatpickr/flatpickr.min.js",
    "js/lib/flatpickr/flatpickr.min.css",
    "js/lib/dompurify/purify.min.js",
    "js/lib/chart.js/chart.umd.min.js",
    "css/fonts.css",
  ]) {
    assert.ok(read(file).length > 0, `falta el asset vendorizado ${file}`);
  }

  assert.equal(read("index.html").includes("onclick="), false, "index.html no debe tener onclick inline");
});

test("help.html no usa handlers inline", () => {
  const html = read("help.html");
  assert.equal(/\son[a-z]+\s*=/.test(html), false);
});

test("Nginx define una CSP sin unsafe-eval ni unsafe-inline en scripts", () => {
  for (const file of ["deploy/nginx/woll.conf", "deploy/nginx/woll.dev.conf"]) {
    const conf = read(file);
    const csp = conf.match(/Content-Security-Policy "([^"]+)"/)?.[1];
    assert.ok(csp, `${file} debe definir Content-Security-Policy`);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /script-src [^;]*'self'/);
    assert.equal(csp.includes("unsafe-eval"), false, `${file}: script-src no debe permitir unsafe-eval`);
    assert.equal(
      /script-src[^;]*'unsafe-inline'/.test(csp),
      false,
      `${file}: script-src no debe permitir unsafe-inline`
    );
    for (const domain of [
      "unpkg.com",
      "cdnjs.cloudflare.com",
      "cdn.jsdelivr.net",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
    ]) {
      assert.equal(csp.includes(domain), false, `${file}: CSP no debe permitir ${domain}`);
    }
  }
});

test("admin.html no usa handlers inline y no es indexable", () => {
  const html = read("admin.html");
  assert.equal(/\son[a-z]+\s*=/.test(html), false);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
});

test("el panel admin no usa innerHTML para datos dinámicos", () => {
  for (const file of ["js/admin/main.js", "js/admin/api.js"]) {
    const source = read(file);
    assert.equal(/\.innerHTML\s*=/.test(source), false, `${file} no debe usar innerHTML`);
    assert.equal(source.includes("insertAdjacentHTML"), false);
  }
});
