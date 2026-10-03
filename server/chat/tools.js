/**
 * tools.js — Reexport delgado.
 *
 * El contenido original (8 schemas inline) se movió a `server/chat/tools/`
 * (una tool por archivo) durante la Fase 3 del refactor.
 *
 * Este archivo se mantiene para no romper `orchestrator.js`, que importa
 * `TOOL_DEFINITIONS` desde acá. En una feature posterior se puede borrar y
 * cambiar el import del orquestador directamente.
 *
 * @deprecated usar `server/chat/tools/index.js` directamente en código nuevo.
 */

export { TOOL_DEFINITIONS, TOOL_NAMES } from "./tools/index.js";