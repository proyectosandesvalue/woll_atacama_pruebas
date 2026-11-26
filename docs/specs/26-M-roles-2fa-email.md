# Spec 26-M — Roles, 2FA por email y dispositivos de confianza

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 26-M |
| **Estado de la spec** | CERRADA — RBAC, notificaciones, OTP, dispositivos y recuperación ✅ |
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
| 3 | OTP por email, challenges, rate limits, UI de login | ✅ 2026-11-25 |
| 4 | Dispositivos de confianza, país, revocación | ✅ 2026-11-25 |

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


## 12. Implementación 2026-11-25

- Migraciones `057_admin_login_challenges.sql` y `058_admin_user_email_backfill.sql`.
- Login en dos pasos: contraseña → código de 6 dígitos por SMTP de SiteGround →
  sesión. Código con HMAC, expiración 10 min, un solo uso, 5 intentos, máximo
  3 envíos por 15 min y auditoría de envío/verificación.
- UI del panel con formulario de código y botón “Volver”.
- Detección de ráfagas: 10 fallos en 15 min (cualquier IP/usuario) envía alerta
  al owner con cooldown de 1 h.
- `scripts/admin-user.mjs` acepta `--email` y `--role` y avisa al usuario al
  crear la cuenta, cambiar contraseña/rol/correo, reactivar o desactivar.
- Verificado: `POST /api/admin/login/verify` con un desafío de prueba responde
  200 y crea sesión; el correo de prueba y los avisos llegan a Gmail.
- Pendiente: dispositivos de confianza (30 días/Chile) para no pedir código en
  el PC habitual, y CRUD de usuarios en el panel (hoy se usa el CLI).


## 13. Recuperación de contraseña (2026-11-25)

- Enlace “¿Olvidaste tu contraseña?” en el login y formulario de solicitud.
- `POST /api/admin/password/forgot` responde siempre `202` (no enumera
  cuentas). Si la cuenta existe, envía un enlace de un solo uso por SMTP.
- Token de 32 bytes con formato `id.token`; en la base solo su HMAC. Expira en
  30 minutos, se usa una vez y tiene límite de 3 solicitudes/hora por correo/IP
  con cooldown de 60 s.
- `POST /api/admin/password/reset` valida token y contraseña (mínimo 8),
  actualiza el hash, consume todos los tokens de ese usuario, revoca sus
  dispositivos de confianza y envía un aviso de “contraseña restablecida”.
- La página `admin.html?reset=…` muestra el formulario de nueva contraseña y
  limpia el token de la URL con `history.replaceState`.
- Verificado con un usuario temporal: reset `200`, reutilización `400`, login
  con la nueva contraseña `200`; solicitud de correo inexistente `202`.
- Las sesiones abiertas no se invalidan al instante; expiran en 8 h. Queda como
  mejora agregar `password_changed_at` al chequeo de sesión.


## 14. Dispositivos de confianza (2026-11-25)

- Cookie `woll_device` con formato `id.token`; token de 32 bytes guardado como
  HMAC en `admin.trusted_devices`. `HttpOnly`, `Secure` en producción,
  `SameSite=Lax`, 30 días.
- El dispositivo se considera válido si coinciden usuario, token, **prefijo de
  red** (`/24` IPv4, `/64` IPv6) y **user-agent**, y no está expirado ni
  revocado.
- Si el dispositivo es válido y el país es Chile (o no hay cabecera de país),
  el login crea sesión sin pedir código. Si cambia el equipo o la red, se pide
  código y al verificarlo se **rota** el dispositivo.
- En el VPS no hay cabecera geográfica (`GEO_PROVIDER=none`), así que el control
  efectivo es prefijo de red + user-agent; si más adelante se pone Cloudflare,
  se suma `CF-IPCountry`.
- Se revocan todos los dispositivos al cambiar contraseña, rol, correo,
  desactivar la cuenta o restablecer la contraseña.
- Verificado en producción con un usuario temporal: el primer login con código
  emitió la cookie de dispositivo y el siguiente login, misma red y
  user-agent, respondió `200` sin pedir código.
- Limitación: la cookie es un bearer; si se roba, evita el código. Por eso
  expira a 30 días, se revoca al cambiar credenciales y las acciones sensibles
  siguen exigiendo sesión válida.
