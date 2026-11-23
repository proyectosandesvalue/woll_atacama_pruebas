# Spec 32 — Marco legal y privacidad

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 32 |
| **Estado de la spec** | DRAFT |
| **Tamaño** | Mediano |
| **Duración estimada** | 4-5 h (32-A 2 h, 32-B 1 h, 32-C 1 h; 32-D externo) |
| **Dependencias** | 24 (alcance de entrega), 31-A (observabilidad), 28-A (assets locales) |
| **Última revisión** | 2026-11-19 |

> **Qué es esta spec.** Fija qué se construye en 32-A/B/C, qué queda fuera y
> cómo se verifica. No es asesoría legal: la revisión profesional es 32-D.

---

## 1. Objetivo y contexto

El visor y el chat ya reciben usuarios, pero no tienen páginas públicas de
términos, privacidad ni fuentes de datos, no declaran un período de retención y
el botón de información del chat no explica qué proveedor procesa las
consultas. El Sprint 32 cierra ese vacío con contenido estático verificable,
una política de retención aplicada por script y un aviso del proveedor LLM
obtenido del entorno (no hardcodeado).

El resultado debe servir tanto para la demo en Vercel como para el VPS, sin
depender de un servicio externo ni de un build. La revisión legal de fondo
(Ley 21.719 y normativa aplicable) queda en 32-D y puede ajustar los textos sin
cambiar la estructura.

## 2. Alcance

**Dentro del alcance**
- Tres páginas públicas: `terminos.html`, `privacidad.html` y `fuentes.html`.
- Hoja compartida `css/legal.css` y script mínimo `js/ui/legal.js` (tema y año).
- Enlaces a las tres páginas desde el visor (diálogo de bienvenida) y desde
  `help.html` (sección de soporte).
- Política de retención en `docs/RETENTION.md`: qué se guarda, por qué, dónde,
  por cuánto tiempo y cómo se borra.
- Migración `056_retention.sql` con una RPC idempotente de purga para
  `admin.unanswered_questions` y `admin.audit_log`.
- Script `scripts/retention.mjs` + `npm run retention:run` con `--dry-run`.
- Endpoint `GET /api/chat/info` con proveedor y modelo, sin secretos.
- Aviso visible en el chat (`#chatInfoModal`) con el proveedor que procesa la
  consulta y enlace a privacidad.
- ADR 011 — aviso del proveedor LLM y límites de retención.

**Fuera del alcance**
- Revisión legal externa y firma de 32-D.
- Banner de cookies o consentimiento: el visor no usa cookies de seguimiento.
- Acuerdo de tratamiento de datos (DPA) con el proveedor LLM.
- Procedimiento de derechos ARCO o formulario de solicitudes.
- Inventario exhaustivo de fuentes y licencias por capa (Sprint 29-A).
- Cambios en la capa base (28-C).

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §6.6 RAG | Solo documentos públicos con licencia; la página de fuentes no inventa licencias. |
| §6.7 Calidad del chat | El aviso no promete precisión ni sustituye la abstención del chat. |
| §7.5 Idioma | Español neutro para Chile, sin voseo, en páginas y mensajes. |
| §5.3 API | `GET /api/chat/info` es de solo lectura, sin body y sin datos personales. |
| ADR 005/006 | La política aplica igual a demo y VPS; no se agregan servicios no portables. |
| Sprint 50 | `admin.unanswered_questions` no guarda email, sesión ni historial. |

## 4. Contrato de datos / API

### 4.1. Páginas estáticas

No hay datos nuevos. Las páginas se sirven como HTML estático y no consultan
APIs, salvo el aviso del chat que usa `/api/chat/info`.

Contenido mínimo:

| Página | Secciones |
|---|---|
| `terminos.html` | Objeto y alcance; uso aceptable; propiedad intelectual y licencias; limitación de responsabilidad; modificaciones; contacto. |
| `privacidad.html` | Responsable; datos tratados; finalidades y base de licitud; proveedores; retención; derechos; seguridad; contacto. |
| `fuentes.html` | Instituciones y servicios; atribuciones (OSM, Copernicus, IDE Chile, CIREN, DGA, ARClim, BCN); vigencia y limitaciones; enlace a la ficha de cada capa. |

Reglas de contenido:
- Fecha visible de última actualización.
- Enlace cruzado entre las tres páginas y de vuelta al visor.
- Sin recursos externos (CSP `'self'`).
- Sin promesas de exactitud ni de disponibilidad.
- La página de fuentes distingue “fuente del dato” de “proveedor de la capa
  base”; el inventario completo queda para 29-A.

### 4.2. `GET /api/chat/info`

Respuesta `200`:

```json
{
  "provider": "openai-compatible",
  "provider_label": "Groq",
  "model": "openai/gpt-oss-120b",
  "external_processing": true,
  "notice_version": "2026-11"
}
```

- `provider_label` se deriva de `LLM_PROVIDER` y `LLM_BASE_URL` con un mapeo
  explícito (Groq, Google AI Studio, OpenAI, Vertex AI, proveedor compatible).
- Si faltan variables, responde `200` con
  `provider_label: "Proveedor externo de modelos de lenguaje"` y `model: null`.
- No expone `LLM_API_KEY`, `LLM_BASE_URL`, credenciales de Google ni rutas.
- `Cache-Control: public, max-age=300`.

### 4.3. Retención

Migración `056_retention.sql`:

```sql
public.admin_purge_retention(
  p_unanswered_days int DEFAULT 365,
  p_audit_days int DEFAULT 730,
  p_dry_run boolean DEFAULT false
) RETURNS jsonb
```

- Borra de `admin.unanswered_questions` las filas con
  `last_seen_at < now() - p_unanswered_days`.
- Borra de `admin.audit_log` las filas con `at < now() - p_audit_days`.
- Con `p_dry_run = true` solo cuenta.
- Devuelve `{ "unanswered": n, "audit": n, "dry_run": bool }`.
- `SECURITY DEFINER`, `search_path = public, admin, extensions`, sin acceso
  para `anon` ni `authenticated`.

Script `scripts/retention.mjs`:
- `--dry-run`, `--unanswered-days`, `--audit-days`, `--help`.
- Lee `DATABASE_ADMIN_URL` o `DATABASE_URL`.
- Imprime el JSON de la RPC y no registra contenido de preguntas.

### 4.4. Aviso en el chat

`#chatInfoModal` reutiliza `welcome-dialog` y se abre con `#chatInfoBtn`.
El texto se completa al abrir el modal:

> El Asistente IA envía tu consulta a **{provider_label}** para generar la
> respuesta. No se guarda la conversación. Las preguntas sin respuesta se
> registran de forma agregada y sin datos personales. Más información en la
> Política de Privacidad.

Si el endpoint falla, usa el texto genérico “un proveedor externo de modelos
de lenguaje”.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | El visor | Abro el diálogo de bienvenida o la ayuda | Hay enlaces visibles a términos, privacidad y fuentes; las tres páginas cargan | test + manual |
| CA-2 | El chat | Abro “Información del asistente” | Veo el proveedor real y un enlace a privacidad; si la API falla, veo el texto genérico | test + manual |
| CA-3 | La política de retención | Ejecuto `npm run retention:run -- --dry-run` | La RPC informa cuántas filas se borrarían sin borrar nada | test + SQL |
| CA-4 | Las páginas legales | Inspecciono el HTML | No hay scripts, estilos ni fuentes externas; no hay datos personales de ejemplo | test |
| CA-5 | Las páginas legales | Navego con teclado y lector de pantalla | Títulos jerárquicos, `main`, enlaces con texto descriptivo y foco visible | manual + test estático |
| CA-6 | La migración 056 | La aplico dos veces | No falla y la RPC queda disponible | SQL |
| CA-7 | El endpoint de info | Lo consulto sin variables LLM | Responde 200 con el texto genérico, sin secretos | test |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| 32-A | Páginas, CSS, enlaces desde visor/ayuda y tests estáticos | 2 | ⏳ |
| 32-B | `docs/RETENTION.md`, migración 056, script y comando npm | 1 | ⏳ |
| 32-C | `GET /api/chat/info`, modal del chat, ADR 011 y tests | 1 | ⏳ |
| 32-D | Revisión legal externa (fuera de esta ejecución) | 2 | ⏳ |

Un commit por tramo (`feat: sprint-32-A paginas legales`,
`feat: sprint-32-B retencion`, `feat: sprint-32-C aviso proveedor llm`).

## 7. Tests requeridos (`node:test`)

- `scripts/__tests__/legal-pages.test.js`
  - existen las tres páginas, `css/legal.css` y `js/ui/legal.js`;
  - no hay recursos `http(s)://` en `<script>`, `<link rel=stylesheet>` ni
    `@font-face`;
  - hay enlaces cruzados y enlaces desde `index.html` y `help.html`;
  - las páginas tienen `<main>`, `<h1>` y fecha de actualización.
- `server/handlers/__tests__/chat-info.test.js`
  - mapeo de proveedor para Groq, Google AI Studio, OpenAI y Vertex;
  - respuesta sin variables y sin claves;
  - `Cache-Control` esperado.
- `scripts/__tests__/retention.test.js`
  - parseo de argumentos y defaults;
  - `--dry-run` pasa `p_dry_run=true`;
  - falla con un mensaje claro si no hay conexión.
- Extender `scripts/__tests__/security-frontend.test.js` para incluir las
  páginas legales y el modal en la revisión de assets locales.

## 8. Seguridad y procedencia

- El endpoint de info no lee la BD ni el LLM; solo variables de entorno no
  secretas.
- La RPC de purga es `SECURITY DEFINER` y solo la ejecuta el rol de servicio.
- La página de fuentes no publica rutas internas, tokens ni URLs de proxy.
- No se agregan cookies, analítica ni píxeles de seguimiento.
- La retención de logs de contenedor ya está acotada a 10 MB × 5 archivos en
  `docker-compose.yml`; la política lo documenta.
- Los textos no afirman cumplimiento legal certificado antes de 32-D.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ¿Qué razón social y correo de contacto se publican? | “Andes Value Research (AVR)” y el canal institucional que defina el cliente en 32-D | no |
| R2 | ¿La retención de preguntas sin respuesta es 12 meses? | 365 días desde `last_seen_at` | no |
| R3 | ¿La retención de auditoría admin es 24 meses? | 730 días | no |
| R4 | ¿Se publica el modelo además del proveedor? | sí, `LLM_MODEL`; nunca la clave ni la URL base | no |
| R5 | ¿La página de fuentes lista todas las capas? | no; instituciones y atribuciones ahora, inventario por capa en 29-A | no |

## 10. Riesgos, reversión y documentación

- **Riesgo:** textos legales incompletos o desactualizados. Mitigación: fecha
  visible, revisión 32-D y enlace a la fuente de cada dato.
- **Riesgo:** el proveedor cambia y el aviso queda obsoleto. Mitigación:
  `provider_label` se deriva del entorno en cada request.
- **Riesgo:** la purga borra datos aún útiles. Mitigación: `--dry-run`,
  defaults conservadores y ejecución programada fuera de horario.
- **Reversión:** las páginas y el modal son aditivos; se retiran los enlaces y
  el endpoint. La migración 056 se revierte con `DROP FUNCTION`; no borra
  columnas.
- **Documentos a actualizar:** `ROADMAP.md`, `CHANGELOG.md`,
  `ARCHITECTURE.md`, `README.md`, `docs/specs/README.md`, `.env.example`,
  `AGENTS.md` (si cambia una regla), ADR 011.

## 11. Puntos de integración

- **Sprint 28:** el test de seguridad frontend cubre las páginas nuevas.
- **Sprint 29-A:** el inventario de fuentes y licencias alimenta
  `fuentes.html`; esta spec solo publica el marco general.
- **Sprint 45/47:** la ficha de capa y el gestor pueden enlazar a la página de
  fuentes cuando exista metadata de procedencia.
- **Sprint 50:** la retención aplica a `admin.unanswered_questions`.
- **Sprint 26-G:** backups cifrados con retención de 14 días; la política lo
  referencia, no lo modifica.
- **Sprint 33:** el runbook del operador incluye `retention:run`.

## 12. Cierre

- Horas reales:
- Desvíos:
- Lecciones:
