# Demanda no satisfecha

## ¿Qué es?

La **Demanda** es la cola de preguntas que el chat del visor no pudo responder.
Cuando una consulta queda sin respuesta por falta de datos, de una herramienta
o de un documento, el chat la registra para que el equipo la revise.

No es un chat ni un buscador: es una **bandeja de trabajo** para detectar qué
le falta al visor y priorizar el trabajo del próximo sprint.

## ¿Para qué sirve?

- Ver qué preguntas reales están quedando sin respuesta.
- Distinguir si falta un dato, una herramienta, una capa o un documento.
- Medir la demanda: una misma pregunta puede repetirse y suma ocurrencias.
- Seleccionar las preguntas válidas y preparar un **brief** para que el
  desarrollador implemente la solución.
- Cerrar el ciclo: marcar una demanda como resuelta cuando la solución ya está
  publicada.

## Cómo se llega

1. Entra a `/admin.html`.
2. Inicia sesión con tu usuario y contraseña.
3. En el menú superior, selecciona **Demanda**.
4. El número del menú indica cuántas preguntas están pendientes.

## Qué muestra la tabla

| Columna | Qué significa |
|---|---|
| **Pregunta** | La consulta que hizo el usuario. |
| **Veces** | Cuántas veces se repitió una pregunta equivalente. |
| **Razón** | Por qué no se pudo responder: sin dato, sin receta, sin tool, sin documento, fuera de alcance o desconocida. |
| **Tipo** | La clasificación de la pregunta: intención y ruta que eligió el chat. |
| **Estado** | En qué punto del triage está. |
| **Prioridad** | Alta, media o baja. |
| **Decisión** | Qué se hará: nueva tool, capa, documento, mejorar prompt, dato inexistente, etc. |
| **Última vez** | Cuándo apareció por última vez. |
| **Acciones** | **Ver** el detalle o **descargar el brief**. |

Puedes filtrar por estado, razón, prioridad y texto, y ordenar por última
aparición, ocurrencias, fecha o prioridad.

## Estados

| Estado | Significado |
|---|---|
| **Pendiente** | Todavía no se revisó. |
| **En revisión** | Alguien la está evaluando. |
| **Aceptada** | Es válida y se va a trabajar. |
| **Planificada** | Ya tiene un sprint asignado. |
| **Resuelta** | La solución se implementó y se verificó. |
| **Rechazada** | No se hará. |
| **Duplicada** | Ya está representada por otra demanda. |
| **Archivada** | Se conserva fuera de la cola activa. |

## Decisiones

| Decisión | Cuándo usarla |
|---|---|
| **Nueva tool** | Falta una consulta o cálculo que el chat puede resolver con una tool y una RPC. |
| **Nueva capa** | Falta un dato geoespacial que debe cargarse como capa. |
| **Nuevo documento RAG** | La respuesta está en un PDF o documento que no está en el corpus. |
| **Mejorar prompt** | El dato existe, pero el chat no lo encontró o lo interpretó mal. |
| **Dato inexistente** | El visor no tiene ese dato; puede registrarse en “Datos no disponibles”. |
| **Fuera de alcance** | La pregunta no corresponde al visor. |
| **No se hará** | Se evaluó y no se implementará. |
| **Duplicada** | Otra demanda ya cubre la misma necesidad. |

## Cómo hacer el triage

1. Filtra por **Pendiente**.
2. Abre una pregunta con **Ver**.
3. Revisa la pregunta, la razón, el tipo, la ruta y las ocurrencias.
4. Define una **prioridad**: alta si bloquea un flujo o se repite; media si es
   útil; baja si es ocasional.
5. Selecciona una **decisión**.
6. Indica el **sprint destino** si ya se sabe dónde se trabajará.
7. Escribe notas con lo que falta, los datos necesarios o las dudas.
8. Guarda el triage.

Si la pregunta no es válida, usa **Rechazar**, **Duplicada** o **Archivar**.
Si ya se resolvió, usa **Marcar resuelta** y deja el tipo y la nota de
resolución.

## El brief

El botón **Descargar brief** genera un archivo Markdown con:

- la pregunta y el número de ocurrencias;
- la razón, el tipo y la ruta;
- una propuesta de tool o RPC;
- criterios de aceptación;
- un caso de golden set propuesto;
- tus notas de triage.

El brief se puede usar como contexto para la IA o adjuntar al sprint donde se
implementará. **El panel no crea tools ni código**: solo prepara el trabajo.
La implementación se hace en el sprint correspondiente (18, 19, 40-D.3, 42 o
43, según la decisión).

## Privacidad

La Demanda **no guarda datos personales**. No se almacenan correo, sesión,
dirección IP ni el historial completo de la conversación. Solo se conserva:

- la pregunta;
- la razón por la que no se pudo responder;
- el tipo de pregunta y la ruta;
- las ocurrencias y las fechas;
- el triage y las notas del equipo.

## Preguntas frecuentes

**¿Por qué aparece una pregunta?**
Porque el chat no pudo responderla: falta un dato, una tool, una capa o un
documento, o la pregunta quedó fuera del alcance del visor.

**¿Qué significa “Veces”?**
Es el número de ocurrencias de una pregunta equivalente. Sirve para priorizar:
una pregunta repetida suele indicar una necesidad real.

**¿Puedo crear una tool desde el panel?**
No. Las tools son código y RPCs tipadas. El panel genera el brief; la tool se
implementa en el sprint de desarrollo y luego se marca la demanda como
resuelta.

**¿Qué hago si la pregunta está fuera de alcance?**
Márcala como **Rechazada** o **Fuera de alcance** y archívala. No genera
trabajo.

**¿Qué hago si el dato no existe en el visor?**
Usa la decisión **Dato inexistente**. Si corresponde, agrega el registro en
**Datos no disponibles** para que el chat responda mejor de inmediato.

**¿Cuándo marco una demanda como resuelta?**
Cuando la tool, capa o documento ya está publicado y el caso de evaluación
pasa. Deja una nota con el sprint o el commit.

**¿Cada cuánto se revisa?**
Una revisión semanal es suficiente para un visor en operación. Prioriza las
preguntas con varias ocurrencias o las que bloquean un flujo completo.

## Glosario

- **Ocurrencia:** cada vez que aparece una pregunta equivalente.
- **Razón:** motivo por el que el chat no pudo responder.
- **Tipo:** clasificación de la pregunta (intención y ruta).
- **Tool:** función tipada que el chat usa para consultar datos.
- **RPC:** consulta segura del backend a la base de datos.
- **Brief:** documento con la propuesta de solución para el sprint.
- **Golden set:** conjunto de casos que se ejecutan para comprobar que el chat
  sigue respondiendo bien.
