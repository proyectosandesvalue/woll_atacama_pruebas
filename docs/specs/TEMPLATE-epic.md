# Spec madre NN — <Nombre del sprint grande>

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | NN |
| **Estado de la spec** | DRAFT / APROBADA / EN EJECUCIÓN / CERRADA |
| **Tamaño** | Grande (> 15h) |
| **Duración estimada** | Xh (spike incluido) |
| **Dependencias** | Sprint NN |
| **Última revisión** | AAAA-MM-DD |

> **Qué es esta spec.** Fija lo que **no cambia** durante el sprint: objetivo, invariantes, decisiones, riesgos y el mapa de tramos. **No** diseña el detalle de cada tramo: cada tramo tiene su propia spec (plantilla `_TEMPLATE-sprint.md`), que se escribe **al empezar ese tramo**, con lo aprendido en el anterior.
>
> **Dónde viven:** carpeta `docs/specs/NN-nombre/` con `00-spec-madre.md` y una spec por tramo (`NN-A-nombre.md`, `NN-B-nombre.md`...).

---

## 1. Objetivo y métricas de éxito

Qué cambia al terminar el sprint completo y cómo se mide. Cada métrica lleva **línea base** (medida antes de empezar) y **meta**.

| Métrica | Línea base | Meta | Cómo se mide |
|---|---|---|---|
| ... | ... | ... | ... |

## 2. Alcance

**Dentro del alcance**
- ...

**Fuera de alcance** *(obligatorio)*
- ...

## 3. Invariantes

Lo que **nunca** se rompe mientras dure el sprint, aunque un tramo falle. Cada invariante debe poder comprobarse en la puerta de cada tramo.

| # | Invariante | Cómo se comprueba |
|---|---|---|
| INV-1 | El visor en producción no cambia hasta la promoción explícita (CONTRACT §1.1) | ... |
| INV-2 | ... | ... |

## 4. Decisiones arquitectónicas

Lista de ADRs que este sprint exige o produce. Una decisión estructural sin ADR no entra en la spec.

| Decisión | ADR | Estado |
|---|---|---|
| ... | NNN-nombre.md | Pendiente (la resuelve el spike) / Aceptado |

## 5. Spike (fase 0)

Solo si hay una incógnita técnica que cambia el plan. **Limitado en tiempo.** Produce un ADR, no código de producción.

| Pregunta a resolver | Opciones | Criterios de decisión | Tiempo máx. | Salida |
|---|---|---|---|---|
| ... | A / B / C | ... | Xh | ADR NNN |

## 6. Mapa de tramos

Cada tramo: máximo 8h, deja el sistema funcionando y desplegable, y tiene reversión propia. Primero un esqueleto de punta a punta; después se ensancha.

| Tramo | Nombre | Horas | Depende de | Reversión | Spec | Estado |
|---|---|---|---|---|---|---|
| NN-A | ... | | spike | ... | pendiente | |

## 7. Criterios de aceptación del sprint completo

Formato **Dado / Cuando / Entonces**, verificables. Los criterios de cada tramo viven en su spec; aquí solo los que valen para el conjunto.

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | ... | ... | ... | ... |

## 8. Puertas entre tramos

Un tramo no se da por cerrado hasta cumplir **todo**:

- [ ] Tests pasando (`npm test`) y lint limpio.
- [ ] Invariantes comprobados.
- [ ] Verificado en staging.
- [ ] Reversión probada al menos una vez.
- [ ] Docs y CHANGELOG actualizados.
- [ ] **Re-estimación** del resto. Si el tramo tomó el doble de lo previsto, se revisa esta spec antes de seguir.

## 9. Riesgos

| Riesgo | Prob. | Impacto | Mitigación | Señal de alarma |
|---|---|---|---|---|
| ... | | | | |

## 10. Preguntas abiertas

Cada una con **default propuesto**. Las que bloquean el spike se marcan.

| # | Pregunta | Default propuesto | Impacto si cambia | ¿Bloquea? |
|---|---|---|---|---|
| M1 | ... | ... | ... | sí / no |

## 11. Reversión global y promoción

- Cómo se desactiva todo el sprint si hay que volver atrás.
- Orden de promoción a producción: migraciones → variables de entorno → código (ADR 004).
- Qué se retira y cuándo (nunca dentro del mismo sprint si es irreversible).

## 12. Documentos a actualizar

ROADMAP, CHANGELOG, ARCHITECTURE, CONTRACT (si cambia una regla), ADRs, `.env.example`.

## 13. Cierre

- Fecha de cierre:
- Horas reales por tramo vs. estimadas:
- Desvíos y lecciones: