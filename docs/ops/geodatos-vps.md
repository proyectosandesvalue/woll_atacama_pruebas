# Geodatos como portada del VPS

> Destino: `https://visor.atacamawoll.cl/` (IP `136.243.227.86`).
> Última revisión: 2026-11-25. Publicado con TLS real; renovación
> automática vía contenedor `certbot`.
> Checklist operativo para publicar la portada `geodatos.html` en `/` y el
> visor en `/visor`. No se edita nada directamente en el VPS: todo entra por
> `deploy/vps/release.sh`.

## 1. Decisión de arquitectura

| Ruta | Qué sirve | Archivo |
|---|---|---|
| `/` | Portada institucional Geodatos | `geodatos.html` |
| `/geodatos.html` | Misma portada (enlace directo) | `geodatos.html` |
| `/visor` | Visor territorial; la URL se mantiene en `/visor` | `index.html` |
| `/visor?chat=1` | Visor con el panel del chat abierto | `index.html` |
| `/visor/` | Redirección 301 a `/visor` | — |
| `/index.html` | Acceso directo heredado al visor | `index.html` |
| `/api/*` | API Node | proxy a `api:3000` |
| `/tiles/*`, `/geojson/*`, `/raster/*` | Estáticos del visor | disco |

**No se usa iframe.** El visor es una aplicación de pantalla completa:
un iframe duplicaría cabeceras, rompería el botón atrás y la URL compartible,
y sumaría un nivel de scroll. `/visor` conserva la misma pestaña, el historial,
la URL, el rendimiento y la CSP. Si más adelante se necesita un modo embebido,
se implementa una ruta `?embed=1` específica y se revisa `X-Frame-Options`.

La portada mantiene su cabecera y pie institucionales. Los enlaces a
Oportunidades, Recursos y Proyectos pilotos apuntan a `https://atacamawoll.cl/`
porque esas páginas no viven en el VPS. El visor se abre en `/visor` y su marca
(el logo del header) vuelve a `/`. Vercel conserva `/visor` como rewrite para
la demo/staging, pero la ruta oficial es la del VPS.

## 2. Archivos que se publican

- `geodatos.html` — portada.
- `js/geodatos.js` — menú móvil de la portada.
- `assets/geodatos/` — logo, logos de aliados y `og-geodatos.webp`.
- `css/fonts/plus-jakarta-sans-latin.woff2` — tipografía vendorizada
  (licencia OFL en `css/fonts/plus-jakarta-sans-OFL.txt`).
- `index.html` — la marca del visor enlaza a `/` (portada).
- `deploy/nginx/woll.conf` — `index geodatos.html;`.
- `deploy/nginx/woll.dev.conf` — misma portada en local.
- `deploy/nginx/woll-locations.conf` — `/visor` y fallback.
- `deploy/vps/release.sh` — smoke de `/`, `/visor` y `/visor?chat=1`.
- `scripts/__tests__/geodatos-landing.test.js` — guard de rutas y assets.
- `scripts/__tests__/chat-deep-link.test.js` — guard de `?chat=1`.

## 3. Antes de tocar el VPS

- [x] DNS: registro `A visor.atacamawoll.cl → 136.243.227.86` (2026-11-25).
- [x] Certificado TLS para `visor.atacamawoll.cl` con
      `certbot certonly --webroot --cert-name woll` (Let's Encrypt, vence 2027-02-23).
- [x] `DOMAIN=visor.atacamawoll.cl` y `CERTBOT_EMAIL` en `.env`.
- [x] `ALLOWED_ORIGINS=https://visor.atacamawoll.cl`.
- [ ] El sitio principal `atacamawoll.cl` actualizará su enlace “Geodatos” a
      `https://visor.atacamawoll.cl/` (no al visor de Vercel).
- [ ] Confirmar que el visor de Vercel queda como demo/staging y no como
      enlace de producción.

## 4. Validación local

```bash
# 1. Tests de la portada y del enlace directo al chat
node --test scripts/__tests__/geodatos-landing.test.js
node --test scripts/__tests__/chat-deep-link.test.js

# 2. Lint de los archivos nuevos
npx eslint js/geodatos.js js/utils/chatDeepLink.js js/ui/chatUI.js

# 3. Previsualización integrada (portada + visor + proxy /api)
npm run dev:site
# http://localhost:8099/       -> portada
# http://localhost:8099/visor  -> visor
```

- [ ] La portada carga la tipografía local (sin Google Fonts).
- [ ] La consola no muestra violaciones de CSP.
- [ ] Los logos y el favicon responden 200.
- [ ] El menú móvil abre/cierra y la FAQ funciona sin JS.
- [ ] Lighthouse: accesibilidad, buenas prácticas y SEO en 100.

> **Validación local ya realizada:** Nginx 1.27.5 en Podman sirvió `/` y
> `/geodatos.html` con la portada, `/visor` y `/visor?chat=1` con el visor, y
> `/visor/` con `301`. `nginx -t` pasó. Falta ejecutar el release en el VPS.

## 5. Release en el VPS

```bash
# 1. Commit y push desde local
git add geodatos.html js/geodatos.js assets/geodatos \
  css/fonts/plus-jakarta-sans-latin.woff2 css/fonts/plus-jakarta-sans-OFL.txt \
  deploy/nginx deploy/vps/release.sh vercel.json \
  scripts/__tests__/geodatos-landing.test.js \
  scripts/__tests__/chat-deep-link.test.js \
  js/utils/chatDeepLink.js js/ui/chatUI.js index.html \
  docs/ops/geodatos-vps.md docs/DEV_GUIDE.md docs/ARCHITECTURE.md \
  docs/CHANGELOG.md README.md AGENTS.md
git commit -m "feat: portada geodatos y visor en /visor del vps"
git push vps main

# 2. Release controlado (backup -> build -> migraciones -> up -> smoke)
ssh woll-vps 'cd /srv/woll && deploy/vps/release.sh --with-chat'

# 3. Verificar que Nginx tomó la configuración
ssh woll-vps 'cd /srv/woll && deploy/vps/compose.sh exec -T nginx nginx -t'
ssh woll-vps 'cd /srv/woll && deploy/vps/compose.sh up -d --force-recreate nginx'
```

- [ ] El release termina con `release OK`.
- [ ] `nginx -t` responde `syntax is ok` y `test is successful`.
- [ ] El contenedor Nginx se recreó (los archivos se montan por inodo).

## 6. Smoke en el servidor

Ejecutar desde el VPS o desde un equipo con acceso:

```bash
curl -skI https://127.0.0.1/ | head -1
curl -sk https://127.0.0.1/ | grep -o '<title>[^<]*'
curl -skI https://127.0.0.1/visor | head -1
curl -sk https://127.0.0.1/visor | grep -o '<title>[^<]*'
curl -skI 'https://127.0.0.1/visor?chat=1' | head -1
curl -skI https://127.0.0.1/visor/ | head -1
curl -skI https://127.0.0.1/api/config | head -1
curl -skI https://127.0.0.1/assets/geodatos/logo-atacamawoll.webp | head -1
curl -skI https://127.0.0.1/css/fonts/plus-jakarta-sans-latin.woff2 | head -1
```

Resultados esperados:

| Comprobación | Esperado |
|---|---|
| `/` | `200` y `<title>Geodatos ...` |
| `/geodatos.html` | `200` y mismo título |
| `/visor` | `200` y `<title>Plataforma Woll Atacama</title>` |
| `/visor?chat=1` | `200` y el panel del chat abierto en el navegador |
| `/visor/` | `301` a `/visor` |
| `/api/config` | `200` |
| logo y fuente | `200` |
| `/healthz` | `200` |

## 7. Aceptación en navegador

Abrir `https://visor.atacamawoll.cl/` y comprobar:

- [ ] La portada carga sin errores en consola ni violaciones de CSP.
- [ ] “Abrir geoportal” y las tarjetas del geoportal llevan a `/visor`.
- [ ] “Abrir chat” lleva a `/visor?chat=1` y el panel “Asistente IA” aparece
      abierto.
- [ ] El botón atrás vuelve a la portada.
- [ ] Recargar `/visor` mantiene el visor (no cae en 404).
- [ ] `/help.html` y `/admin.html` siguen funcionando.
- [ ] El menú móvil, la FAQ y los enlaces del pie funcionan.
- [ ] El logo del header y el pie de la portada llevan a `atacamawoll.cl`.
- [ ] El logo del header del visor vuelve a `/` (portada).
- [ ] En móvil, la portada no tiene scroll horizontal y el visor abre a pantalla
      completa.

## 8. Actualización del sitio principal

En `atacamawoll.cl` (CMS o plantilla global):

- [ ] Cambiar el enlace “Geodatos” del menú de escritorio y móvil a
      `https://visor.atacamawoll.cl/`.
- [ ] Cambiar “Geoportal de datos” del pie a `https://visor.atacamawoll.cl/visor`.
- [ ] Cambiar “Chat con IA” del pie a
      `https://visor.atacamawoll.cl/visor?chat=1`.
- [ ] Mantener el enlace de Vercel solo como demo/staging interno.
- [ ] Actualizar la ficha de Recursos para que “Visor territorial de datos”
      apunte a `/visor`.

## 9. Rollback

Si la portada o la ruta `/visor` fallan:

1. `git revert <commit>` en local, push y `deploy/vps/release.sh --skip-backup`.
2. Si solo falla Nginx: restaurar la versión anterior de
   `deploy/nginx/woll.conf` y `woll-locations.conf`, y recrear:
   ```bash
   ssh woll-vps 'cd /srv/woll && deploy/vps/compose.sh up -d --force-recreate nginx'
   ```
3. Si se necesita volver al visor en `/` de inmediato:
   - cambiar `index geodatos.html;` por `index index.html;`,
   - dejar `/visor` en la configuración (no molesta),
   - recrear Nginx.
4. El release deja un backup previo en `/var/backups/woll`; no borrarlo.

## 10. Post-publicación

- [ ] Revisar `deploy/vps/compose.sh logs --since 10m nginx` sin errores.
- [ ] Revisar `deploy/vps/compose.sh logs --since 10m api`.
- [ ] Ejecutar `ops-check` y confirmar `ok=true`.
- [ ] Verificar el certificado:
      `echo | openssl s_client -connect 127.0.0.1:443 -servername visor.atacamawoll.cl`.
- [ ] Anotar el cambio en `docs/CHANGELOG.md`.
- [ ] Comunicar la URL oficial: `https://visor.atacamawoll.cl/`.
