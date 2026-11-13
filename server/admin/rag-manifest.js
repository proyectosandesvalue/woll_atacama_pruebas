/**
 * Manifiesto RAG y almacenamiento de PDFs (Sprint 45-A).
 *
 * El manifiesto sigue siendo `rag/manifest.json` (versionado). El panel lo
 * edita con escritura atómica y sube PDFs a `rag/inbox/`.
 *
 * No importa pdfjs: el API solo valida metadatos y mueve bytes.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RagError } from "../rag/errors.js";
import { normalizeEntry, validateEntry } from "../rag/manifest.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_MAX_PDF_BYTES = 25 * 1024 * 1024;

export function getManifestPaths(env = process.env) {
  const configured = env.RAG_MANIFEST_PATH;
  const manifestPath = configured
    ? path.resolve(ROOT, configured)
    : path.join(ROOT, "rag", "manifest.json");
  const baseDir = path.dirname(manifestPath);
  return {
    root: ROOT,
    manifestPath,
    baseDir,
    inboxDir: path.join(baseDir, "inbox"),
  };
}

function safePath(file, baseDir) {
  if (typeof file !== "string" || file.length === 0) {
    throw new RagError("BAD_FILE", "Falta el archivo del manifiesto.");
  }
  const absolute = path.resolve(baseDir, file);
  const relative = path.relative(baseDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RagError("BAD_FILE", "El archivo debe vivir dentro de rag/.");
  }
  if (!/\.pdf$/i.test(absolute)) {
    throw new RagError("BAD_FILE_TYPE", "El archivo debe ser .pdf.");
  }
  return absolute;
}

export function inboxPathForSlug(slug, env = process.env) {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug || "")) {
    throw new RagError("BAD_SLUG", "slug inválido.");
  }
  const { inboxDir } = getManifestPaths(env);
  return path.join(inboxDir, `${slug}.pdf`);
}

export function fileRelativeToBase(slug, env = process.env) {
  return path.relative(getManifestPaths(env).baseDir, inboxPathForSlug(slug, env));
}

export async function readManifest(env = process.env) {
  const { manifestPath } = getManifestPaths(env);
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new RagError("BAD_MANIFEST", "El manifiesto debe ser un arreglo JSON.");
    }
    return parsed;
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    if (err instanceof RagError) throw err;
    throw new RagError("BAD_MANIFEST", `No se pudo leer el manifiesto: ${err.message}`);
  }
}

export async function writeManifest(entries, env = process.env) {
  if (!Array.isArray(entries)) {
    throw new RagError("BAD_MANIFEST", "El manifiesto debe ser un arreglo.");
  }
  const { manifestPath, baseDir } = getManifestPaths(env);
  await mkdir(baseDir, { recursive: true });

  const temp = `${manifestPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const body = JSON.stringify(entries, null, 2) + "\n";
  try {
    await writeFile(temp, body, { encoding: "utf8", mode: 0o644 });
    await rename(temp, manifestPath);
  } catch (err) {
    await rm(temp, { force: true }).catch(() => {});
    throw new RagError("WRITE_MANIFEST", `No se pudo escribir el manifiesto: ${err.message}`);
  }
  return { manifestPath, entries: entries.length };
}

/**
 * Alta o edición por slug. Mantiene el orden existente.
 *
 * @param {object} input
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function upsertManifestEntry(input, env = process.env) {
  const entry = normalizeEntry({
    ...input,
    file: input.file || fileRelativeToBase(input.slug, env),
  });
  validateEntry(entry);
  const { baseDir } = getManifestPaths(env);
  safePath(entry.file, baseDir);

  const entries = await readManifest(env);
  const index = entries.findIndex((item) => item?.slug === entry.slug);
  if (index >= 0) entries[index] = entry;
  else entries.push(entry);
  await writeManifest(entries, env);
  return entry;
}

export async function removeManifestEntry(slug, env = process.env) {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug || "")) {
    throw new RagError("BAD_SLUG", "slug inválido.");
  }
  const entries = await readManifest(env);
  const next = entries.filter((item) => item?.slug !== slug);
  if (next.length === entries.length) {
    throw new RagError("NOT_FOUND", "El documento no está en el manifiesto.");
  }
  await writeManifest(next, env);
  return { removed: 1, remaining: next.length };
}

export async function findManifestEntry(slug, env = process.env) {
  const entries = await readManifest(env);
  return entries.find((item) => item?.slug === slug) || null;
}

export async function fileInfo(entry, env = process.env) {
  const { baseDir } = getManifestPaths(env);
  const absolute = safePath(entry?.file, baseDir);
  try {
    const info = await stat(absolute);
    return { exists: true, bytes: info.size, modified_at: info.mtime.toISOString() };
  } catch (err) {
    if (err?.code === "ENOENT") return { exists: false, bytes: 0, modified_at: null };
    throw err;
  }
}

/**
 * Guarda un PDF desde el stream del request.
 * Valida tamaño y firma `%PDF-` antes de moverlo a su destino final.
 *
 * @param {AsyncIterable<Buffer>} stream
 * @param {string} slug
 * @param {{maxBytes?: number, env?: NodeJS.ProcessEnv}} [opts]
 */
export async function savePdfStream(stream, slug, opts = {}) {
  const { maxBytes = DEFAULT_MAX_PDF_BYTES, env = process.env } = opts;
  const destination = inboxPathForSlug(slug, env);
  const { inboxDir } = getManifestPaths(env);
  await mkdir(inboxDir, { recursive: true });

  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new RagError("FILE_TOO_LARGE", `El PDF supera el límite de ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks);
  if (body.length < 5 || body.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new RagError("NOT_A_PDF", "El archivo no tiene la firma %PDF-.");
  }

  const temp = `${destination}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temp, body, { mode: 0o600 });
    await rename(temp, destination);
  } catch (err) {
    await rm(temp, { force: true }).catch(() => {});
    throw new RagError("WRITE_PDF", `No se pudo guardar el PDF: ${err.message}`);
  }

  return {
    file: path.relative(getManifestPaths(env).baseDir, destination),
    bytes: body.length,
  };
}

export async function deletePdf(slug, env = process.env) {
  const destination = inboxPathForSlug(slug, env);
  await rm(destination, { force: true });
  return { file: path.relative(getManifestPaths(env).baseDir, destination) };
}
