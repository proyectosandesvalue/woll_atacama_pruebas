# ADR 023 — Streaming SSE del chat

| Campo | Valor |
|---|---|
| Estado | Aceptada (fase 1); fase 2 diferida |
| Fecha | 2026-11-09 |
| Origen | Sprint 25-F (spike) |
| Relacionado | 25-B (latencia), 25-C (clasificador), 26 (plataforma propia), 31 (observabilidad) |

## Contexto

La línea base del Sprint 25-B midió, en producción y con 20 casos:

- p50 extremo a extremo: **3.553 ms**; p95: **15.234 ms**.
- `classifier`: ~1,1 s p50; `router` p95: 6 s; orquestador p95: 17,5 s.
- La síntesis L2 (la respuesta final) costó ~2,1 s en el único caso que llegó a esa etapa.

El chat actual responde JSON completo: el usuario no ve nada hasta que termina
el clasificador, las tools y la síntesis. El objetivo del spike 25-F es decidir
si conviene transmitir la respuesta con SSE (Server-Sent Events) y con qué
alcance, considerando que la plataforma debe soportar **20-50 usuarios
concurrentes**.

## Opciones evaluadas

| Opción | Ventaja | Costo / riesgo |
|---|---|---|
| **A. Sin streaming** (actual) | Simple; compatible con el contrato JSON | Peor latencia percibida; el usuario espera todo el pipeline |
| **B. SSE de estado** (clasificando, consultando tools, redactando) | Bajo riesgo; mejora la percepción sin cambiar el contrato final | No reduce el tiempo total; requiere endpoint y cliente nuevos |
| **C. SSE de tokens** (streaming de la respuesta final) | El texto aparece mientras se genera; buena percepción en L2 | Conexiones largas; complejidad en driver, fallback y Vercel; solo aplica a L2 |
| **D. WebSocket** | Bidireccional y estado persistente | No encaja con Vercel Functions; requiere servidor persistente (Sprint 26) |

## Factibilidad técnica

### Driver LLM

Los drivers actuales (`vertex-openai.js`, `openai-compatible.js`) hacen
`fetch` y `res.json()`: **no soportan streaming**. Para la opción C hay que
agregar un método `chatStream(args)` que envíe `stream: true`, lea el cuerpo
como `ReadableStream` y parsee las líneas `data: {...}` / `data: [DONE]`.

El wrapper de fallback actual reintenta antes de devolver la respuesta. Con
streaming, el fallback solo puede ocurrir **antes del primer token**; una vez
enviados los headers, un fallo debe emitirse como evento `error`, no como un
nuevo intento transparente.

### Orquestador

El bucle L1 necesita la respuesta completa para leer `tool_calls`; el
clasificador también necesita JSON completo. Por lo tanto, **solo la síntesis
L2 puede transmitir tokens**. Las etapas previas solo pueden emitir eventos de
estado. Esto limita la ganancia de la opción C a los ~2,1 s de L2, no a los
6-17 s de tools/orquestador.

### Vercel

Vercel Functions soporta respuestas en streaming (`res.write` /
`ReadableStream`) y `api/chat.js` tiene `maxDuration: 300`. Requisitos:

- `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`,
  `Connection: keep-alive` y `X-Accel-Buffering: no`.
- Heartbeat cada 15 s para evitar timeouts de proxies.
- Abortar el stream cuando el cliente se desconecta (`req.on("close")`).
- No fijar `Content-Length`.

Cada conexión SSE es una invocación de Function que permanece abierta. Con
20-50 usuarios concurrentes, eso son 20-50 invocaciones largas; es viable en
Vercel, pero consume concurrencia y no elimina la saturación de LLM/DB.

### Cliente

`EventSource` solo hace GET y el chat usa POST con body. Las alternativas son:

1. `fetch` + `ReadableStream` en el navegador (recomendada): mantiene el POST y
   permite leer eventos.
2. Crear una sesión por POST y abrir un `EventSource` GET por sesión: requiere
   estado compartido (Redis/DB), justo lo que se quiere evitar en Vercel.

## Decisión

**Fase 1 — Aceptada:** implementar SSE de **estado** (sin tokens) cuando se
retome el chat:

- Eventos: `status` (`clasificando`, `consultando`, `redactando`), `done` y
  `error`.
- El payload final sigue siendo el JSON actual; se envía en el evento `done`.
- No cambia el contrato del endpoint JSON; se agrega un endpoint o
  `Accept: text/event-stream`.
- Requiere un límite de streams por instancia y aborto por desconexión.

**Fase 2 — Diferida:** SSE de tokens para L2, después de:

1. Tener un limitador de concurrencia global (Redis/Upstash o VPS).
2. Medir una prueba de carga con 20-50 usuarios concurrentes.
3. Resolver los cuellos de DB/tools (25-B mostró 6 s en proximidad).
4. Preferentemente, ejecutar sobre el servidor persistente del Sprint 26, donde
   una conexión SSE no compite con el modelo de invocaciones de Vercel.

**No se implementa WebSocket** en esta etapa.

## Consecuencias

- Se mantiene el endpoint JSON actual; el streaming es aditivo.
- El cliente debe consumir el stream con `fetch`, no con `EventSource`.
- El fallback de proveedor solo aplica antes del primer byte.
- La observabilidad debe registrar `request_id`, duración del stream y
  desconexiones; el timing de 25-B sirve como base.
- La prueba de carga de 20-50 usuarios es requisito para pasar a fase 2.

## Criterios para pasar a fase 2

- Load test de 20-50 usuarios concurrentes con p95 objetivo acordado.
- Limitador global de LLM y rate limit distribuido.
- `count_near_layer`/`aggregate_near_layer` por debajo de 2 s p95.
- Proxy persistente con caché compartida para las capas Copernicus.
- Prueba de streaming con desconexiones y fallback antes del primer token.

## Referencias

- `docs/chat-latency-baseline.md` (25-B).
- `server/llm/drivers/vertex-openai.js`, `server/llm/provider.js`.
- `api/chat.js`, `server/handlers/chat.js`.
- `vercel.json` (`api/chat.js`, `maxDuration: 300`).
