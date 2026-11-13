# Spec 28 — Seguridad del frontend y dependencias

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | 28 |
| **Estado de la spec** | PARCIAL CERRADA: dependencias, SRI, CSP y XSS ✅; vendorización, ZAP y capa base pendientes |
| **Tamaño** | Mediano |
| **Duración estimada** | 9-10 h |
| **Dependencias** | 26-D, 30 |
| **Última revisión** | 2026-11-13 |

## 1. Objetivo

Reducir la superficie de ataque del visor: dependencias sin vulnerabilidades
conocidas, recursos externos con integridad verificable, CSP activa sin
`unsafe-eval` y datos externos escapados antes de entrar al DOM.

## 2. Alcance

**Dentro**
- Auditoría de dependencias de producción y `overrides` mínimos.
- SRI + `crossorigin="anonymous"` en los CDN de `index.html`.
- CSP en Nginx de producción (`woll.conf`) y desarrollo (`woll.dev.conf`).
- Retiro de handlers inline de `help.html`.
- Reemplazo de Turf.js por `js/utils/geoUtils.js` (`getBbox`).
- Escape de datos de API/GeoJSON en estaciones, gráficos, tabla de servidor
  y sidebar ARClim.
- Tests estáticos de SRI, CSP y handlers inline.
- `npm audit --omit=dev --audit-level=high` en CI.

**Fuera**
- Vendorizar Leaflet, markercluster, Chart.js, DOMPurify y tipografías en
  `js/vendor/` (28-A original). Se mantiene CDN fijo + SRI como control
  compensatorio; la vendorización queda pendiente para el VPS.
- Análisis OWASP ZAP contra staging (requiere 26-F).
- `security.txt` (requiere un contacto institucional definido).
- Cambio de capa base con licencia (28-C, ADR 010).

## 3. Dependencias

| Acción | Resultado |
|---|---|
| `@vercel/functions` actualizado a 3.11.2 | elimina el `zod` vulnerable transitivo |
| `overrides.uuid = ^11.1.1` | corrige `uuid@9` que arrastraba `gaxios@6` |
| `npm audit` | **0 vulnerabilidades** (producción y total) |

`@vercel/functions` solo se usa en la demo (OIDC de Vertex AI); no es una
dependencia del VPS. El `override` de `uuid` es compatible con `gaxios@6` y
`google-auth-library@9`.

## 4. Recursos externos y SRI

`index.html` fija versión e integridad de **11 recursos**:

- Leaflet 1.9.4 (CSS y JS).
- Leaflet.markercluster 1.5.3 (2 CSS y JS).
- flatpickr 4.6.13 (CSS, JS y locale `es`).
- DOMPurify 3.0.3.
- Chart.js 4.4.0.

Reglas:
- Todo `<script src="https://…">` y `<link rel="stylesheet" href="https://…">`
  lleva `integrity="sha384-…"` y `crossorigin="anonymous"`.
- Actualizar una versión exige recalcular el hash y volver a probar el visor.
- Las tipografías de Google no tienen SRI (CSS dinámico); se mantienen por
  `preconnect`. Vendorizarlas sigue pendiente.

## 5. CSP

Activa en `deploy/nginx/woll.conf` (TLS) y `deploy/nginx/woll.dev.conf` (local):

```text
default-src 'self'; base-uri 'self'; object-src 'none';
frame-ancestors 'self'; form-action 'self';
script-src 'self' https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com …;
font-src 'self' data: https://fonts.gstatic.com;
img-src 'self' data: blob: … tiles/WMS …;
connect-src 'self' … tiles/WMS …;
worker-src 'self' blob:; child-src 'self' blob:;
```

- **Sin `unsafe-eval`:** Turf.js usaba `new Function`; se reemplazó por
  `getBbox` en `js/utils/geoUtils.js`.
- **Sin `unsafe-inline` en `script-src`:** `help.html` ya no tiene `onclick`
  inline; los listeners viven en `js/ui/help.js`.
- **`style-src 'unsafe-inline'` se mantiene:** Leaflet, glify y los paneles
  aplican estilos por atributo. Retirarlo requeriría nonces/hashes y una
  refactorización grande; se acepta como riesgo bajo.
- **Dev:** `localhost:3001` (proxy Copernicus) se permite solo en
  `woll.dev.conf`; producción usa `/api/proxy` mismo origen.
- **Headers adicionales:** HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` y `Permissions-Policy`.

## 6. XSS

Se escapea todo dato que provenga de API o GeoJSON antes de `innerHTML`:

| Archivo | Datos escapados |
|---|---|
| `js/utils/stationsMapUtils.js` | nombre, comuna, tipo, etiqueta/unidad/período, tooltip del marcador, leyenda |
| `js/utils/chartModal.js` | nombre/código de estación, etiqueta, unidad, fecha, valor único |
| `js/utils/serverTable.js` | mensaje de error de la API |
| `js/utils/layerUtils.js` | `NOM_COMUNA`, descripción, escenario, temporada y unidad ARClim |
| `js/utils/popupUtils.js` / `styleUtils.js` | ya usaban `escapeHtml` + `safeHTML` |
| `js/utils/wmsFeatureInfo.js` | ya escapaba etiquetas, valores y metadatos |

`escapeHtml` se importa de `js/utils/helpers.js`. Cuando el valor puede ser
`0`, se convierte con `String(valor)` antes de escapar.

## 7. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | `package.json` | se instala | `npm audit` reporta 0 | `npm audit` |
| CA-2 | `index.html` | se carga | todos los CDN tienen SRI | `security-frontend.test.js` |
| CA-3 | CSP activa | uso normal (mapa, estaciones, tabla, ayuda) | 0 violaciones CSP | consola del navegador |
| CA-4 | `help.html` | se abre | sin handlers inline y navegación funciona | test + manual |
| CA-5 | API con datos hostiles | se abre sidebar/tabla/gráfico | el HTML se muestra como texto | revisión + `escapeHtml` |
| CA-6 | CI | push a `main` | audit, lint y tests pasan | GitHub Actions |
| CA-7 | recursos externos | auditoría | 0 scripts externos | **pendiente** (vendorización) |

## 8. Resultados (2026-11-13)

- `npm audit`: **0 vulnerabilidades**.
- `npm test`: **344 pasan, 12 omitidos, 0 fallos** (incluye 3 tests de
  `geoUtils` y 3 de seguridad frontend).
- `npm run lint`: **0 errores**, 33 warnings preexistentes.
- Navegador con CSP: mapa, estaciones, sidebar, modal de series y `help.html`
  sin violaciones. Se detectó y corrigió el bloqueo del proxy Copernicus en
  desarrollo (`localhost:3001`).
- Turf.js eliminado: el visor ya no requiere `unsafe-eval`.

## 9. Riesgos y pendientes

- **CDN + SRI:** mitiga manipulación del archivo, pero no una caída del CDN.
  Vendorizar en el VPS elimina la dependencia externa.
- **`style-src 'unsafe-inline'`:** riesgo bajo, necesario por los estilos
  inline de Leaflet/glify.
- **Tipografías externas:** sin SRI; evaluar alojarlas localmente.
- **ZAP, `security.txt` y capa base con licencia:** requieren staging,
  contacto institucional y ADR 010.
- **Accesibilidad de marcadores/canvas:** los fallos de target-size de
  Lighthouse pertenecen al tramo de accesibilidad, no a este.

## 10. Reversión

- Quitar CSP: eliminar el `add_header Content-Security-Policy` de Nginx y
  recargar. No se recomienda.
- Volver a Turf: restaurar el `<script>` con SRI y los `window.turf.bbox`;
  requiere `unsafe-eval` en CSP.
- Revertir el `override` de `uuid`: `npm install` tras borrarlo de
  `package.json`.

## 11. Cierre

- Horas reales: 4.
- 6/7 criterios verificables cumplidos; CA-7 (vendorización) queda para el
  VPS.
- Lección: la CSP detectó un uso real de `new Function` en Turf y el proxy
  local de Copernicus; ambos se corrigieron antes de producción.
