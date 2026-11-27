/**
 * Despublicar una versión RAG (Sprint 18-F).
 *
 * Marca la versión `ready` como `superseded`, borra sus chunks y deja una
 * corrida `unpublished` en `rag.ingestion_runs`. No borra el documento ni el
 * PDF: la procedencia se conserva y se puede reingestar como versión nueva.
 *
 * Se ejecuta en el worker, que tiene el rol de escritura de `rag.*`.
 */

/**
 * @param {{
 *   pool: { connect: () => Promise<any> },
 *   slug: string
 * }} input
 */
export async function unpublishDocument({ pool, slug }) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("unpublishDocument requiere un pool de PostgreSQL.");
  }
  if (typeof slug !== "string" || !slug.trim()) {
    throw new TypeError("unpublishDocument requiere un slug.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const docs = await client.query(
      `SELECT document_id
         FROM rag.documents
        WHERE slug = $1 AND status = 'ready'
        FOR UPDATE`,
      [slug]
    );

    if (docs.rows.length === 0) {
      await client.query("ROLLBACK");
      return { slug, status: "sin_version_ready", chunks_deleted: 0 };
    }

    const ids = docs.rows.map((row) => row.document_id);
    const deleted = await client.query(
      `DELETE FROM rag.chunks WHERE document_id = ANY($1::uuid[])`,
      [ids]
    );

    await client.query(
      `UPDATE rag.documents
          SET status = 'superseded'
        WHERE document_id = ANY($1::uuid[])`,
      [ids]
    );

    await client.query(
      `INSERT INTO rag.ingestion_runs
         (document_id, slug, status, finished_at, chunks_total)
       VALUES ($1, $2, 'unpublished', now(), $3)`,
      [ids[0], slug, deleted.rowCount || 0]
    );

    await client.query("COMMIT");
    return {
      slug,
      status: "unpublished",
      chunks_deleted: deleted.rowCount || 0,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
