import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VOSEO =
  /(?<![\p{L}\p{N}_])(escribí|escribime|escuchá|buscá|usá|tenés|podés|querés|hacé|mirá|probá|elegí|completá|subí|guardá|publicá|revisá|andá|vení|decí|salí|poné|dejá|creá|agregá|seleccioná|configurá|ejecutá|corré|abrí|cerrá|cargá|esperá|intentá|volvé|sos|sabés|hacés|debés|commiteás|fijate|avisá|decime|contame|acordate|sumá|restá|chequeá|logueate|registrate|normalizá|documentá|actualizá|migrá|instalá|copiá|cambiá|editá|borrá|eliminá|definí|mové|activá|desactivá|asigná|ubicá|armá|conectá|fijá|acá|allá|recién|laburo|guita|corrélo|hacelo|dejalo|revisalo|corregilo|actualizalo|subilo|bajalo|guardalo|abrilo|cerralo)(?![\p{L}\p{N}_])/iu;

const ROOT_FILES = ["admin.html", "help.html", "index.html", "README.md", "rag/README.md"];
const ROOT_DIRS = ["js", "server", "scripts", "docs"];
const EXTENSIONS = new Set([".js", ".mjs", ".html", ".md"]);
const EXCLUDED = new Set([
  "AGENTS.md",
  "docs/CONTRACT.md",
  "scripts/__tests__/language-neutral.test.js",
]);

async function textFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "geojson" || entry.name === "tiles") {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(ROOT, absolute);
    if (EXCLUDED.has(relative)) continue;
    if (entry.isDirectory()) out.push(...(await textFiles(absolute)));
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(absolute);
  }
  return out;
}

test("la UI y la documentación usan español neutro, sin voseo rioplatense", async () => {
  const files = ROOT_FILES.map((file) => path.join(ROOT, file));
  for (const dir of ROOT_DIRS) files.push(...(await textFiles(path.join(ROOT, dir))));

  const findings = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    text.split("\n").forEach((line, index) => {
      if (VOSEO.test(line)) {
        findings.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim().slice(0, 160)}`);
      }
    });
  }

  assert.deepEqual(findings, [], `Se encontró voseo:\n${findings.join("\n")}`);
});
