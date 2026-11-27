import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const PAGES = [
  {
    file: "terminos.html",
    title: /Términos de uso/,
    anchor: 'href="terminos.html"',
  },
  {
    file: "privacidad.html",
    title: /Política de privacidad/,
    anchor: 'href="privacidad.html"',
  },
  {
    file: "fuentes.html",
    title: /Fuentes de datos/,
    anchor: 'href="fuentes.html"',
  },
];

test("existen las tres páginas legales y la hoja compartida", () => {
  for (const page of PAGES) {
    const html = read(page.file);
    assert.ok(html.length > 2000, `${page.file} parece vacío`);
  }
  assert.ok(read("css/legal.css").length > 2000, "falta css/legal.css");
});

test("las páginas legales no cargan recursos externos", () => {
  for (const page of PAGES) {
    const html = read(page.file);
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
    const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
    for (const url of [...scripts, ...styles]) {
      assert.equal(/^https?:\/\//.test(url), false, `${page.file}: recurso externo ${url}`);
    }
    assert.equal(/\son[a-z]+\s*=/.test(html), false, `${page.file}: handler inline`);
  }

  const css = read("css/legal.css");
  assert.equal(/url\(\s*["']?https?:\/\//.test(css), false, "css/legal.css no debe cargar fuentes externas");
  assert.match(css, /url\("\.\/fonts\/plus-jakarta-sans-latin\.woff2"\)/);
});

test("cada página tiene estructura accesible y fecha de actualización", () => {
  for (const page of PAGES) {
    const html = read(page.file);
    assert.match(html, /<html lang="es">/);
    assert.match(html, /<main id="contenido"/);
    assert.match(html, /<h1>/);
    assert.match(html, /<h2>/);
    assert.match(html, /Última actualización:/);
    assert.match(html, page.title);
    assert.match(html, /class="skip-link"/);
    assert.match(html, /aria-label="Enlaces legales"/);
  }
});

test("las tres páginas se enlazan entre sí", () => {
  for (const page of PAGES) {
    const html = read(page.file);
    for (const other of PAGES) {
      assert.ok(
        html.includes(`href="${other.file}"`),
        `${page.file} no enlaza a ${other.file}`
      );
    }
  }
});

test("el visor, la ayuda y la portada enlazan a las páginas legales", () => {
  const index = read("index.html");
  for (const page of PAGES) {
    assert.ok(index.includes(`href="${page.file}"`), `index.html no enlaza a ${page.file}`);
  }

  const help = read("help.html");
  for (const page of PAGES) {
    assert.ok(help.includes(`href="${page.file}"`), `help.html no enlaza a ${page.file}`);
  }

  const geodatos = read("geodatos.html");
  for (const page of PAGES) {
    assert.ok(
      geodatos.includes(`href="./${page.file}"`),
      `geodatos.html no enlaza a ${page.file}`
    );
  }
});

test("el aviso del chat existe y apunta a privacidad", () => {
  const html = read("index.html");
  assert.match(html, /id="chatInfoModal"/);
  assert.match(html, /id="chatProviderLabel"/);
  assert.match(html, /href="privacidad.html"/);
});
