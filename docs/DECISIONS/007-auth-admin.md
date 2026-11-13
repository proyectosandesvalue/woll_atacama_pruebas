# ADR 007 — Autenticación del panel admin con TOTP local

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-13 |
| Origen | Sprint 15 / decisión del dev |
| Relacionado | ADR 005 (VPS), spec 14-15, CONTRACT §12.3 |

## Contexto

El panel admin necesita autenticación antes del Sprint 16 (CRUD de capas).
El ROADMAP preveía OIDC institucional o TOTP local, pero el IdP de la
universidad no está disponible y no hay fecha. El panel correrá en el VPS,
detrás de Nginx, con un único operador inicial.

Requisitos:

- No introducir un proveedor SaaS ni una dependencia específica de Vercel o
  Supabase (ADR 005).
- MFA desde el primer día.
- Sesión sin tokens en `localStorage`.
- Auditoría de accesos.
- Poder migrar a OIDC sin rehacer el panel.

## Decisión

1. **Factor 1:** password verificada con `scrypt` (sal única, parámetros
   N=16384, r=8, p=1, 64 bytes). El hash vive en `admin.admin_users`.
2. **Factor 2:** TOTP RFC 6238 de 6 dígitos, ventana ±1 paso. El secreto vive
   **solo** en `ADMIN_TOTP_SECRET`; nunca en la base ni en el frontend.
3. **Sesión:** cookie `woll_admin` `HttpOnly`, `SameSite=Strict`, `Secure` en
   producción, 8 h, firmada con HMAC-SHA256 usando `ADMIN_SESSION_SECRET`
   (32+ caracteres). El payload incluye usuario, expiración y token CSRF.
4. **CSRF:** double-submit; el token va en el JSON de login/sesión y se exige
   en el header `X-CSRF-Token` para POST.
5. **Rate limit:** 5 fallos por IP+usuario en 60 s; bloqueo de 15 min.
6. **Auditoría:** `admin.audit_log` registra login/logout, resultado, actor,
   IP hasheada y detalle. Sin IP en claro.
7. **Bootstrap:** `npm run admin:user -- --username admin --password '…'`
   crea/actualiza el usuario; `--new-totp` genera el secreto base32 una vez.
8. **Evolución:** la verificación se aísla en `server/admin/auth.js`. Un
   futuro OIDC reemplaza solo el login; la cookie, CSRF, auditoría y el panel
   se mantienen.

## Consecuencias

**Positivas**
- No depende de la universidad ni de un SaaS.
- MFA y auditoría desde el inicio.
- Portable al VPS y testeable sin red.

**Negativas**
- La custodia del secreto TOTP y del password es manual.
- No hay SSO ni recuperación automática; si se pierde el TOTP, se rota el
  secreto con `--new-totp`.
- El rate limit es en memoria por proceso; en el VPS con una sola API es
  suficiente. Si se escala horizontalmente, moverlo a PostgreSQL/Redis.

## Alternativas consideradas

- **OIDC institucional:** mejor a largo plazo, pero bloqueado por credenciales
  y coordinación. Se implementará como adaptador cuando exista.
- **Supabase Auth:** acopla el panel a la demo congelada y no es portable.
- **Basic Auth en Nginx:** sin MFA, sin sesión ni auditoría; insuficiente.

## Pendiente

- Rotación de secretos documentada en el runbook del VPS (26-H).
- Evaluar OIDC cuando la universidad entregue cliente/redirect URI.
- Añadir alertas por fallos de login repetidos (Sprint 31).
