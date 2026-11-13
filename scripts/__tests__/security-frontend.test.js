import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("index.html carga los CDN con SRI y sin handlers inline", () => {
  const html = read("index.html");

  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"[^>]*>/g)];
  const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>/g)];

  assert.ok(scripts.length > 0, "debe haber scripts externos");
  assert.ok(styles.length > 0, "debe haber estilos externos");

  for (const [tag, url] of [...scripts, ...styles].map((match) => [match[0], match[1]])) {
    assert.match(tag, /\bintegrity="sha(256|384|512)-/, `falta integrity en ${url}`);
    assert.match(tag, /\bcrossorigin="anonymous"/, `falta crossorigin en ${url}`);
  }

  assert.equal(html.includes("onclick="), false, "index.html no debe tener onclick inline");
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
