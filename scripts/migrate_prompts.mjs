/**
 * scripts/migrate_prompts.mjs
 *
 * Carga los prompts hardcodeados (SYSTEM_PROMPT_BASE y
 * CLASSIFIER_SYSTEM_PROMPT) en admin.prompt_templates.
 *
 * Uso:
 *   node --env-file=.env.staging scripts/migrate_prompts.mjs
 *
 * Idempotente: si el prompt ya existe y el contenido es idéntico, no hace
 * nada. Si el contenido cambió, crea una versión nueva (version + 1) y
 * desactiva la anterior.
 *
 * Se corre en cada deploy después de aplicar las migraciones.
 */

import { getDB } from "../server/db/pool.js";
import { SYSTEM_PROMPT_BASE } from "../server/chat/prompts.js";
import { CLASSIFIER_SYSTEM_PROMPT } from "../server/chat/domain-classifier.js";

const prompts = [
  {
    id: "chat.system",
    content: SYSTEM_PROMPT_BASE,
    description:
      "System prompt del chat (reglas del analista territorial).",
  },
  {
    id: "chat.classifier",
    content: CLASSIFIER_SYSTEM_PROMPT,
    description:
      "Prompt del clasificador unificado (domain + intent + pipeline + slots).",
  },
];

async function main() {
  const db = await getDB();
  let updated = 0;
  let unchanged = 0;

  for (const p of prompts) {
    // Leer la versión activa actual.
    const current = await db.rpc("chat_get_prompt", { p_id: p.id });

    if (typeof current === "string" && current === p.content) {
      console.log(`✓ ${p.id}: sin cambios (v${await getCurrentVersion(db, p.id)})`);
      unchanged++;
      continue;
    }

    const version = await db.rpc("admin_set_prompt", {
      p_id: p.id,
      p_content: p.content,
      p_description: p.description,
      p_by: "migrate_prompts.mjs",
    });

    console.log(`→ ${p.id}: cargada v${version}`);
    updated++;
  }

  console.log("");
  console.log(`Resumen: ${updated} actualizados, ${unchanged} sin cambios.`);
}

async function getCurrentVersion(db, id) {
  // No hay RPC para esto, así que usamos una query directa (solo para log).
  try {
    const rows = await db.rpc("chat_get_prompt", { p_id: id });
    return rows ? "activa" : "—";
  } catch {
    return "—";
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});