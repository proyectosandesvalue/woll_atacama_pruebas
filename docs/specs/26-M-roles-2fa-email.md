# Spec 26-M — Roles, 2FA por email y dispositivos de confianza

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-M |
| **Estado de la spec** | EN EJECUCIÓN — Fase 1 (RBAC) y 2 (notificaciones) ✅; 3 (OTP) y 4 (dispositivos) pendientes |
| **Tamaño** | Grande (17-22 h) |
| **Dependencias** | 26-H (VPS), 15 (panel admin), 31 (auditoría/ops) |
| **Última revisión** | 2026-11-24 |

## 1. Objetivo

Separar el control de la plataforma del trabajo editorial y proteger el panel
con un segundo factor enviado por correo, sin depender de una IP fija. El
`owner` conserva el control total; el `editor` prepara contenido y no puede
crear usuarios, cambiar autenticación, ver auditoría ni tocar integraciones.

## 2. Decisiones

1. **Roles:** `owner` (control total) y `editor` (contenido y operación
   diaria). El usuario `admin` existente pasa a `owner`.
2. **Segundo factor:** código de 6 dígitos por email, 10 minutos de vida, un
   solo uso, máximo 5 intentos. Se envía al correo registrado de cada usuario.
3. **Dispositivo de confianza:** cookie firmada de 30 días, revocable. Si el
   equipo ya es confiable y sigue en Chile, no se pide código.
4. **Ubicación:** se compara país; si el login viene de otro país, se exige
   código aunque la cookie sea válida.
5. **Editor también usa OTP.**
6. **Publicar:** solo `owner`. El editor prepara borradores, cargas y
   asignaciones; no publica taxonomía, configuración ni capas.
7. **Proveedor de correo:** Resend. Remitente verificado en un subdominio
   propio (`notificaciones.atacamawoll.cl`); el destinatario puede ser Gmail u
   otro. No se envía nunca "desde Gmail".
8. **Fallar cerrado:** si el proveedor de correo no responde, el login se
   deniega; el SSH sigue siendo el mecanismo de recuperación.

## 3. Matriz de permisos

| Capacidad | Owner | Editor |
|---|---|---|
| Crear, desactivar o cambiar roles | ✅ | ❌ |
| Configurar 2FA, correo y seguridad | ✅ | ❌ |
| Ver auditoría y estado del sistema | ✅ | ❌ |
| Gestionar integraciones y claves de APIs | ✅ | ❌ |
| Prompts, settings y mensajes del chat | ✅ | ❌ |
| Publicar taxonomía o snapshot de config | ✅ | ❌ |
| Subir capas, editar borradores, asignar taxonomía | ✅ | ✅ |
| Subir PDFs al RAG y ver jobs | ✅ | ✅ |
| Ver y clasificar demanda no satisfecha | ✅ | ✅ |
| Publicar capas/tiles | ✅ | ❌ (queda como deuda hasta separar draft/publish) |

Los permisos se aplican **en el servidor**; la UI solo oculta secciones.

## 4. Arquitectura de notificaciones

```
server/notifications/
  index.js        sendEmail({ to, template, data, env, fetchImpl })
  providers/
    console.js    desarrollo: imprime evento sin destinatario completo
    resend.js     POST https://api.resend.com/emails
  templates/
    login-code.js
    alert.js
    status.js
  render.js       texto + HTML escapado
```

- `EMAIL_PROVIDER=resend|console`; `RESEND_API_KEY`, `EMAIL_FROM`,
  `EMAIL_REPLY_TO`, `EMAIL_APP_NAME`.
- El login usa envío sincrónico con timeout de 5 s. Alertas y avisos pueden
  ir en segundo plano.
- Nunca se registran códigos, API keys ni el destinatario completo; solo
  plantilla, resultado y un hash/redacción.

## 5. Flujo de login

1. `POST /api/admin/login` con usuario y contraseña.
2. Si el usuario está activo y la cookie de dispositivo es válida y el país es
   Chile: sesión directa (auditada como `admin.login.trusted`).
3. Si no: se crea un challenge en `admin.login_challenges` (hash del código,
   expiración, intentos, IP hasheada), se envía el correo y se responde con
   `challenge_id`.
4. `POST /api/admin/login/verify` con `challenge_id` y código: si es correcto,
   se crea la sesión y se emite la cookie de dispositivo.
5. Cambiar contraseña, correo o 2FA invalida dispositivos y sesiones.

## 6. Modelo de datos

- `admin_users`: `role`, `email`, `email_verified_at`, `two_factor`
  (`email`/`totp`/`none`).
- `admin.login_challenges`: usuario, hash del código, expiración, intentos,
  IP hasheada, consumido.
- `admin.trusted_devices`: usuario, hash del token, creado, último uso, último
  país, hash del user-agent, expiración, revocado.
- `admin.audit_log`: se reutiliza con actor y rol.

## 7. Seguridad

- 5 intentos por challenge; 3 envíos/hora por usuario y 10/hora por IP.
- Código y token guardados como hash; comparación en tiempo constante.
- Respuestas genéricas para no enumerar usuarios.
- Rate limit en Nginx y en la API para `/api/admin/login*`.
- Cookie de dispositivo `HttpOnly`, `Secure`, `SameSite=Lax`, 30 días,
  revocable y rotada al cambiar credenciales.
- El buzón destinatario debe tener su propio 2FA.
- Recuperación por SSH: desactivar 2FA o resetear correo del owner.

## 8. Tests

- `roles`: mapa de rutas y denegación por defecto (owner).
- Gate de `createApp`: 401 sin sesión, 403 para editor en ruta owner, 200 en
  ruta editor, 403 con usuario inactivo.
- Notificaciones: render escapado, payload de Resend, redacción en consola,
  error si falta configuración.
- OTP: expiración, intentos, un solo uso, reenvío y rate limit.
- Dispositivos: cookie válida, expirada, revocada y cambio de país.

## 9. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Roles, migración, gate de rutas, tests | ✅ 2026-11-24 |
| 2 | Módulo de notificaciones, adapter Resend, plantillas, tests | ✅ 2026-11-24 |
| 3 | OTP por email, challenges, rate limits, UI de login | ⏳ pendiente |
| 4 | Dispositivos de confianza, país, revocación, UI | ⏳ pendiente |

## 10. Fuera de alcance

- Passkeys/WebAuthn.
- TOTP por usuario (el TOTP actual es global y queda solo para flujos
  sensibles del owner).
- WAF/Cloudflare y VPN (Tailscale/Headscale) quedan documentados como opción
  futura, no como requisito.


## 11. Estado en el VPS (2026-11-24)

- Migración `056_admin_roles.sql` aplicada; el usuario existente
  (`diegovelasquezf@gmail.com`) quedó como `owner`.
- Gate de roles activo: sin cookie 401; owner en auditoría 200; editor en
  auditoría y publicación 403; editor en RAG y taxonomía 200. Se probó con un
  editor temporal y se eliminó después.
- `/api/admin/session` y el login devuelven `role`; la UI oculta APIs, Chat IA,
  Auditoría y los botones de publicar para el editor.
- Bug corregido: el driver PostgreSQL devuelve filas como array, no `{rows}`;
  el gate ahora acepta ambas formas.
- Módulo de notificaciones desplegado con `EMAIL_PROVIDER=console`. Falta
  Resend: cuenta, verificación de `notificaciones.atacamawoll.cl` y API key.
- Pendiente: fases 3 y 4 (OTP por email y dispositivos de confianza).
