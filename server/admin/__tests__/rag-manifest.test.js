import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  fileInfo,
  readManifest,
  removeManifestEntry,
  savePdfStream,
  upsertManifestEntry,
} from "../rag-manifest.js";

async function tempEnv() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "woll-rag-"));
  return {
    dir,
    env: { RAG_MANIFEST_PATH: path.join(dir, "rag", "manifest.json") },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const ENTRY = {
  slug: "ley-glaciares",
  title: "Ley de glaciares",
  source_url: "https://example.gob.cl/ley.pdf",
  license: "Dominio público",
  publisher: "BCN",
  published_at: "2024-03-01",
  copyright_cleared: true,
  tags: ["agua", "normativa"],
};

test("upsert/read/remove del manifiesto con escritura atómica", async () => {
  const { env, cleanup } = await tempEnv();
  try {
    const entry = await upsertManifestEntry(ENTRY, env);
    assert.equal(entry.file, "inbox/ley-glaciares.pdf");
    assert.equal(entry.slug, ENTRY.slug);

    const manifest = await readManifest(env);
    assert.equal(manifest.length, 1);
    assert.equal(manifest[0].title, ENTRY.title);

    await upsertManifestEntry({ ...ENTRY, title: "Título nuevo" }, env);
    const updated = await readManifest(env);
    assert.equal(updated.length, 1);
    assert.equal(updated[0].title, "Título nuevo");

    const removed = await removeManifestEntry(ENTRY.slug, env);
    assert.equal(removed.remaining, 0);
    assert.deepEqual(await readManifest(env), []);
  } finally {
    await cleanup();
  }
});

test("rechaza copyright no liberado y source_url http", async () => {
  const { env, cleanup } = await tempEnv();
  try {
    await assert.rejects(
      upsertManifestEntry({ ...ENTRY, copyright_cleared: false }, env),
      /copyright_cleared/
    );
    await assert.rejects(
      upsertManifestEntry({ ...ENTRY, source_url: "http://example.gob.cl" }, env),
      /https/
    );
  } finally {
    await cleanup();
  }
});

test("savePdfStream valida firma y escribe el PDF", async () => {
  const { env, dir, cleanup } = await tempEnv();
  try {
    const body = Buffer.from("%PDF-1.4\n% prueba\n", "latin1");
    const saved = await savePdfStream(
      (async function* () {
        yield body;
      })(),
      ENTRY.slug,
      { env, maxBytes: 1024 }
    );
    assert.equal(saved.file, "inbox/ley-glaciares.pdf");
    assert.equal(saved.bytes, body.length);
    const stored = await readFile(path.join(dir, "rag", "inbox", "ley-glaciares.pdf"));
    assert.deepEqual(stored, body);

    const info = await fileInfo({ file: saved.file }, env);
    assert.equal(info.exists, true);
    assert.equal(info.bytes, body.length);
  } finally {
    await cleanup();
  }
});

test("savePdfStream rechaza archivos que no son PDF y exceso de tamaño", async () => {
  const { env, cleanup } = await tempEnv();
  try {
    await assert.rejects(
      savePdfStream(
        (async function* () {
          yield Buffer.from("no es un pdf");
        })(),
        ENTRY.slug,
        { env }
      ),
      /%PDF-/
    );
    await assert.rejects(
      savePdfStream(
        (async function* () {
          yield Buffer.from("%PDF-1234");
        })(),
        ENTRY.slug,
        { env, maxBytes: 5 }
      ),
      /límite/
    );
  } finally {
    await cleanup();
  }
});
