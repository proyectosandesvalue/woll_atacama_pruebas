/**
 * Instrumentación de latencia del chat (Sprint 25-B).
 *
 * Emite una línea JSON por request cuando `CHAT_TIMING_ENABLED=1`.
 * No escribe en la base de datos: pensado para los logs de Vercel o para
 * una corrida local del golden set.
 *
 * Formato:
 *   {"event":"chat.timing","ts":"...","request_id":"...","total_ms":123,
 *    "case_id":"...","domain":"IN","route":"orchestrator",
 *    "stages":[{"stage":"classifier","at_ms":40,"delta_ms":40}, ...]}
 *
 * Los marks con `duration_ms` (tools concurrentes, llamadas al LLM) no
 * alteran el delta secuencial de las etapas.
 */

const TRUE = /^(1|true|yes)$/i;
let counter = 0;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isTimingEnabled(env = process.env) {
  return TRUE.test(String(env.CHAT_TIMING_ENABLED || ""));
}

/**
 * Crea un colector de marcas para un request.
 *
 * @param {object} [meta] Metadatos iniciales (`case_id`, `request_id`, etc.).
 */
export function createTiming(meta = {}) {
  const enabled = isTimingEnabled();
  const startedAt = Date.now();
  const id =
    meta.request_id ||
    `chat-${startedAt.toString(36)}-${(counter++).toString(36)}`;
  const baseMeta = { ...meta };
  const marks = [];
  let finished = false;

  return {
    enabled,
    id,

    /**
     * Agrega una marca. Si `extra.duration_ms` existe, se interpreta como
     * una medición puntual (por ejemplo, una tool) y no como el fin de una
     * etapa secuencial.
     */
    mark(stage, extra = {}) {
      if (!enabled) return;
      marks.push({
        stage,
        at_ms: Date.now() - startedAt,
        ...extra,
      });
    },

    /** Agrega o reemplaza metadatos del request. */
    setMeta(extra = {}) {
      Object.assign(baseMeta, extra);
    },

    /**
     * Emite el registro una sola vez. Devuelve el objeto emitido o null.
     */
    finish(extra = {}) {
      if (!enabled || finished) return null;
      finished = true;

      const total_ms = Date.now() - startedAt;
      let previousStageAt = 0;
      const stages = marks.map((mark) => {
        if (mark.duration_ms !== undefined) return { ...mark };
        const delta_ms = mark.at_ms - previousStageAt;
        previousStageAt = mark.at_ms;
        return { ...mark, delta_ms };
      });

      const record = {
        event: "chat.timing",
        ts: new Date().toISOString(),
        request_id: id,
        total_ms,
        ...baseMeta,
        ...extra,
        stages,
      };

      try {
        console.log(JSON.stringify(record));
      } catch {
        // Un fallo al serializar nunca debe romper la respuesta del chat.
      }
      return record;
    },
  };
}
