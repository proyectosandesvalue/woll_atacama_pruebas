# Spec NN — <Nombre>

| Campo | Valor |
|---|---|
| **Sprint (ROADMAP)** | NN |
| **Estado de la spec** | DRAFT |
| **Tamaño** | Pequeño / Mediano / Grande |
| **Duración estimada** | X h |
| **Dependencias** | Sprint NN / ninguna |
| **Última revisión** | AAAA-MM-DD |

> **Qué es esta spec.** Fija qué se construye, qué queda fuera, cómo se verifica y qué reglas del CONTRACT aplican. No es un plan de código: es el acuerdo previo.

---

## 1. Objetivo y contexto

Qué cambia al terminar y por qué. 1-3 párrafos.

## 2. Alcance

**Dentro del alcance**
- ...

**Fuera del alcance**
- ...

## 3. Reglas del CONTRACT que aplican

| Regla | Implicancia |
|---|---|
| §... | ... |

## 4. Contrato de datos / API

Tablas, columnas, RPCs, endpoints, payloads, permisos y validaciones. Si no hay datos nuevos, indicarlo.

## 5. Criterios de aceptación

| # | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|
| CA-1 | ... | ... | ... | test / manual / SQL |
| CA-2 | ... | ... | ... | ... |

## 6. Plan por sub-sprint

| Tramo | Contenido | Horas | Estado |
|---|---|---|---|
| NN-A | ... | ... | ⏳ |
| NN-B | ... | ... | ⏳ |

Un commit por tramo, con el ID en el mensaje (`feat: sprint-NN-A ...`).

## 7. Tests requeridos (`node:test`)

- ...

## 8. Seguridad y procedencia

- Secretos solo en variables de entorno.
- RLS/permisos si hay tablas nuevas.
- Datos personales, licencias o contenido no confiable.
- Límites de tamaño, timeouts y rate limits.

## 9. Preguntas abiertas

| # | Pregunta | Default | ¿Bloquea? |
|---|---|---|---|
| R1 | ... | ... | sí/no |

## 10. Riesgos, reversión y documentación

- Riesgos:
- Reversión:
- Documentos a actualizar: ROADMAP, CHANGELOG, ARCHITECTURE, CONTRACT, `.env.example`, ADR.

## 11. Puntos de integración

- Sprint NN:
- Infraestructura:
- Frontend/backend:

## 12. Cierre

- Horas reales:
- Desvíos:
- Lecciones:
