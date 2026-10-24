# ADR 021: API de ARClim (estado real, 2026-10-24)

- **Estado:** Aceptado (informativo)
- **Fecha:** 2026-10-24
- **Sprint:** 42-B
- **Relación:** ADR 018 (ingesta de fuentes externas), spec 42-B

## 1. Contexto

La documentación oficial de ARClim (`API_ARClim.pdf`, diciembre 2025)
describe 6 endpoints. Al testearlos contra la API real, **5 de 6 no
funcionan como están documentados**.

## 2. Hallazgo

| Endpoint documentado | Estado real | Notas |
|---|---|---|
| `/api/capas/` | ✅ Funciona | Devuelve las capas geográficas disponibles |
| `/api/indicadores_climaticos` | ✅ Funciona (con slash final) | Devuelve los 30+ indicadores (`hot_days`, `consecutive_days_over_25C`, etc.) |
| `/api/atributos/{capa}/` | ❌ 404 | Ni con `comunas`, ni con `regiones`, ni con slash final |
| `/api/datos/{capa}/{formato}/?attributes=...` | ⚠️ Parcial | Funciona con atributos simples (`NOM_COMUNA`, `ComCod`), pero devuelve 500 con cualquier indicador climático, en cualquier formato probado (`hot_days`, `SCLIMAhot_days`, `hot_days$annual$present`, `%24`, `.`, `_`) |
| `/api/series/{capa}/{indicador}/{season}/{scenario}/` | ❌ 404 | No existe |
| `/api/daily_series/{variable}/{scenario}/?lon=&lat=` | ✅ Funciona | Devuelve CSV con 20 modelos GCM × 36.500 días (1970-2069) |
| `/api/daily_series/{variable}/{scenario}/?capa=&id=` | ✅ Funciona | Ídem, por entidad geográfica |

## 3. Decisión

1. **`/api/datos/` con indicadores**: **descartado**. No funciona.
2. **`/api/series/`**: **descartado**. No existe.
3. **`/api/daily_series/`**: **único endpoint viable** para ingesta automatizada de ARClim. Devuelve CSV (no JSON).
4. **Estrategia de ingesta para ARClim**: descargar el CSV, calcular el indicador (mean, count, sum, etc.) en el adapter, y guardar **solo el agregado** en `ingest.indicator_values`. **No guardar los 730.000 valores raw** (20 modelos × 36.500 días × variable = mucho volumen).
5. **`getAguaCaidaMensualAnual` y `getTemperaturaHistorica`** (MeteoChile): requieren enhancement del adapter (nested periods / fan out por estación). Diferidos a una sesión dedicada.

## 4. Operaciones de agregación necesarias

Para ingerir `daily_series` de ARClim, el adapter CSV necesita:

| Operación | Qué hace | Ejemplo |
|---|---|---|
| `mean(values)` | Promedio del período | `temp_2050` = mean de temps 2035-2065 |
| `sum(values)` | Suma del período | `precip_2050` = sum de precipitaciones 2035-2065 |
| `count(values, condition)` | Conteo de días que cumplen | `olas_calor_2050` = count(días > 25°C) |
| `min(values)`, `max(values)` | Extremos | `temp_min_extreme` = min de temps |
| `mean_models(values_by_model)` | Promedio entre los 20 modelos GCM | (todas las operaciones promedian sobre modelos) |

Cada indicador define su operación de agregación en `value_mapping`.

## 5. Consecuencias

**Positivas**:
- ARClim sigue siendo viable, pero con un adapter más complejo (CSV + agregación).
- Se evita ingerir 1.2 mil millones de valores (solo se guardan ~100 agregados por variable por entidad).
- La documentación oficial de ARClim queda marcada como "parcialmente incorrecta".

**Negativas**:
- El adapter CSV es específico de ARClim, no genérico.
- La ingesta de ARClim tarda más (hay que descargar 8 MB por variable por entidad).
- El endpoint `/api/series/` de la doc no existe, así que no se puede obtener series anuales de indicadores.

## 6. Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Usar `/api/datos/` con `$` URL-encoded | 500 en todos los intentos |
| Usar `/api/series/` | 404 |
| Descarga manual anual | No automatizable |
| Esperar a que ARClim arregle su API | Sin fecha, sin garantía |
| Reemplazar ARClim por otra fuente de proyecciones | No hay fuente equivalente en Chile |

## 7. Próximos pasos

1. **Sprint 42-C.1**: implementar `server/ingest/adapters/csv-aggregate.js` con las operaciones de §4.
2. **Sprint 42-C.2**: agregar el endpoint `arclim:daily_series` a `ingest.endpoints` con el `value_mapping` correspondiente.
3. **Sprint 42-C.3**: test con 1 variable (temperatura máxima, `tasmax`) y 1 comuna (Arica, `1101`).
4. **Sprint 42-C.4**: extender a las 5 variables (`tasmax`, `tasmin`, `pr`, `sfcWind`, `rsds`) y a las 345 comunas.