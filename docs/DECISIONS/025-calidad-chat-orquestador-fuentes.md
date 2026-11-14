# ADR 025 — Calidad del chat como orquestador de fuentes

| Campo | Valor |
|---|---|
| Estado | Aceptada |
| Fecha | 2026-11-14 |
| Origen | Revisión de la integración RAG y del comportamiento del chat |
| Relacionado | CONTRACT §6.2, §6.3, §6.6 y §6.7; ADR 019 (router); ADR 022 (embeddings y chunking); specs 17, 18 y 45-48 |

## Contexto

El chat dejó de ser una sola tool o un prompt con contexto. Hoy es un
orquestador con varias fuentes:

- RPCs tipadas sobre PostgreSQL/PostGIS para datos y geometrías;
- catálogo de capas para saber qué existe y cómo se llama;
- estaciones meteorológicas y ARClim para clima;
- RAG documental para normativa, metodología y contexto;
- inventario de datos no disponibles para no inventar;
- prompts, settings y mensajes que definen el comportamiento.

Cada fuente tiene un contrato distinto. Las RPCs entregan cifras exactas y
agregaciones; el RAG entrega prosa y citas; el catálogo entrega nombres; el
detector de datos no disponibles entrega límites. La calidad del chat no es
la suma de la calidad de sus fuentes, sino la calidad de las decisiones que
toma para elegir, combinar, citar y abstenerse.

El riesgo actual es sumar fuentes sin un eje común. Un RAG conectado sin
enrutamiento puede responder una agregación con un fragmento de PDF; una tool
nueva sin caso de evaluación puede degradar una ruta que ya funcionaba; un
cambio de prompt sin golden set puede mejorar una respuesta y romper diez. El
golden set actual mide respuestas, pero no siempre la ruta ni la fuente usada.

## Decisión

Se adopta el chat como **orquestador de fuentes** y se fijan ocho reglas de
calidad, detalladas en CONTRACT §6.7:

1. **Mapa de fuentes y rutas.** Cada tipo de pregunta declara su ruta
   esperada: tool, RAG, mixta, clima, datos no disponibles o fuera de alcance.
   El mapa vive en la spec del sprint y en el golden set; no se improvisa en
   runtime.
2. **Contrato de evidencia.** Cada respuesta declara sus fuentes (tipo, id,
   fecha y cobertura) en la respuesta o en su traza de evidencia. El backend
   construye la evidencia; el LLM no la inventa.
3. **Abstención obligatoria.** Si la evidencia no alcanza, el chat responde
   que no hay datos o evidencia suficiente, con el motivo. No completa con
   conocimiento general del modelo.
4. **Precedencia de fuentes.** BD estructurada > API oficial > RAG >
   conocimiento del LLM. Si hay conflicto, la respuesta muestra ambas fuentes
   y explica la precedencia.
5. **Evaluación por ruta.** El golden set incluye `route_accuracy`,
   `source_precision`, `citation_accuracy`, `abstention_rate`,
   `answer_correctness` y `faithfulness`. Un cambio no se activa si baja el
   acierto de su ruta.
6. **Configuración versionada y auditable.** Prompts, settings, mensajes,
   datos no disponibles y golden set se editan desde el panel y se auditan.
   Las tools son código y quedan como inventario de solo lectura.
7. **Degradación documentada.** Si una fuente falla, el chat sigue con las
   demás y lo declara. Si el LLM falla, se usa el mensaje estándar. Si la BD
   falla, se usa el fallback de INV-5.
8. **Observabilidad sin contenido sensible.** Cada consulta deja una traza de
   fuentes intentadas, latencia, evidencia y abstención. No se registran
   prompts, documentos ni datos personales.

El RAG se incorpora como una fuente subordinada, no como el centro del chat.
Los fragmentos se tratan como `untrusted`, se delimitan en el prompt y nunca
se interpretan como instrucciones ni como permiso para ejecutar tools o SQL.

## Consecuencias

**Positivas**
- El comportamiento del chat se vuelve predecible por tipo de pregunta.
- Las respuestas son verificables: se sabe de qué fuente salió cada dato.
- Menos alucinación en cifras y menos citas de documentos derogados.
- El RAG se integra sin rehacer el orquestador ni las tools existentes.
- Cada mejora se puede medir contra un baseline por ruta.

**Negativas**
- Más disciplina: cada fuente nueva exige mapa, caso de golden y evidencia.
- El golden set crece y hay que mantenerlo por ruta, no solo por tema.
- El enrutamiento es código y no se edita desde el panel; un cambio de ruta
  requiere deploy y evaluación.
- La latencia puede subir si se combinan tools y RAG en la misma respuesta.

**Riesgos y mitigación**
- **Sobre-enrutar:** no toda pregunta necesita RAG ni tools. El clasificador
  y el router deciden; ante la duda, se prefiere la fuente más exacta.
- **Corpus deficiente:** el RAG no arregla documentos obsoletos o mal
  extraídos. La metadata de vigencia y la revisión de chunks son obligatorias.
- **Prompt injection documental:** los fragmentos se delimitan, no se
  obedecen y no habilitan tools.
- **Evaluación incompleta:** si el golden set no cubre la ruta nueva, el
  cambio no se considera listo.

## Alternativas descartadas

- **RAG puro:** no puede hacer agregaciones, filtros, proximidad ni mapas; es
  incapaz de garantizar cifras exactas.
- **Solo tools:** no cubre normativa, metodología ni contexto documental.
- **Optimizar solo el prompt:** si el fragmento o el dato correcto no entra
  al contexto, el mejor prompt produce una respuesta incorrecta mejor escrita.
- **Fine-tuning antes de retrieval y evaluación:** agrega costo y rigidez sin
  resolver el problema de encontrar la evidencia correcta.

## Pendiente

- Implementar el Sprint 18 con el mapa de fuentes y rutas como primera fase.
- Extender `buildEvidence` para documentos y respuestas mixtas.
- Agregar métricas por ruta al runner del golden set.
- Revisar el mapa cada vez que se agregue una fuente o una tool.
- Validar en el VPS con el corpus documental real y su vigencia.
