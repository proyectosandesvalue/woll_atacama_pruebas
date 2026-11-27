# ADR 011 — Aviso del proveedor LLM y retención de datos operativos

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-21 |
| Origen | Sprint 32-A/B/C: marco legal, privacidad y aviso del proveedor |
| Relacionado | ADR 005 (VPS), ADR 025 (calidad del chat), ADR 026 (embeddings Vertex), Sprint 26-G (backups), Sprint 50 (demanda) |

## Contexto

El chat envía la consulta del usuario a un proveedor externo de modelos de
lenguaje. El proveedor puede cambiar según el entorno: Groq en pruebas,
Google AI Studio como alternativa OpenAI-compatible o Google Cloud Vertex AI
en producción. El usuario no tenía una forma visible de saber qué proveedor
procesaba su consulta ni qué se conservaba.

La cola de demanda (`admin.unanswered_questions`) ya no guarda correo, sesión
ni historial desde la migración 053. El chat tampoco persiste la conversación:
el contexto vive en el navegador. Faltaba declarar los plazos de retención de
las preguntas sin respuesta y de la auditoría administrativa, y publicar una
política comprensible.

## Decisión

1. **El proveedor se declara en tiempo de ejecución**, no con un texto fijo.
   `GET /api/chat/info` deriva una etiqueta legible desde `LLM_PROVIDER` y
   `LLM_BASE_URL`, y devuelve también el modelo (`LLM_MODEL`). Nunca expone la
   API key, la URL base, credenciales de Google ni rutas internas.
2. **El aviso es visible en el chat.** El botón “Información” abre un diálogo
   que muestra el proveedor activo, recuerda que la conversación no se guarda
   en la base, explica el registro agregado de preguntas sin respuesta y
   enlaza a la política de privacidad.
3. **La conversación no se persiste.** El historial se mantiene en el
   navegador y se descarta al limpiar o cerrar. Los logs de latencia
   (`chat.timing`) no incluyen la pregunta.
4. **Retención operativa:** preguntas sin respuesta 365 días desde la última
   ocurrencia; auditoría administrativa 730 días; logs de contenedor con
   rotación de 10 MB × 5; backups cifrados 14 días (26-G).
5. **La purga es explícita y auditable.** La RPC `admin_purge_retention`
   (migración 064) y `npm run retention:run` aplican los plazos y permiten
   `--dry-run`. No se borran columnas ni se cambia el esquema.
6. **Las páginas públicas** (`terminos.html`, `privacidad.html`,
   `fuentes.html`) describen el marco general. La revisión legal externa
   (Sprint 32-D) puede ajustar los textos sin cambiar el contrato técnico.

## Consecuencias

- El aviso se mantiene correcto si cambia el proveedor: no requiere deploy de
  frontend, solo reiniciar el servicio con las nuevas variables.
- La etiqueta puede ser genérica si el entorno no está configurado; el chat
  sigue funcionando y el usuario ve un texto honesto.
- La retención se puede ejecutar manualmente o programar con systemd/cron. La
  primera ejecución debe ser `--dry-run`.
- El endpoint es público y cacheable 5 minutos; no consulta la BD ni el LLM.
- La política pública debe revisarse si cambian los plazos, los proveedores o
  la normativa.

## Alternativas evaluadas

| Alternativa | Por qué no se adopta |
|---|---|
| Texto fijo “Groq” en el HTML | Queda obsoleto al migrar a Vertex AI o a otro proveedor. |
| Exponer `LLM_BASE_URL` | Revela infraestructura y facilita reconocimiento; no aporta al usuario. |
| Guardar la conversación para auditoría | Aumenta el riesgo y el volumen de datos personales; no es necesario para operar. |
| Purga manual sin RPC | No es reproducible ni verificable; dificulta el runbook del VPS. |
| Declarar cumplimiento legal certificado | La revisión profesional es 32-D; el software no puede certificar cumplimiento por sí solo. |

## Referencias

- `docs/specs/32-marco-legal-privacidad.md`
- `docs/RETENTION.md`
- `server/handlers/chat-info.js`
- `server/routes/chat-info.js`
- `db/migrations/064_retention.sql`
- `scripts/retention.mjs`
- `privacidad.html`, `terminos.html`, `fuentes.html`
