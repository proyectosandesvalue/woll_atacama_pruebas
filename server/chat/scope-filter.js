/**
 * Filtro determinístico de scope.
 *
 * Es la CAPA 1 del sistema de bloqueo de consultas fuera de dominio.
 * Detecta por regex patrones obvios de consultas no relacionadas con el
 * Visor Territorial de Atacama:
 *   - Generación de código.
 *   - Preguntas de precios de productos de consumo.
 *   - Contenido obvio fuera de dominio (chistes, temas personales).
 *
 * Es conservador: solo bloquea lo evidente. Los casos ambiguos pasan a
 * la capa 2 (domain-classifier.js, basado en LLM).
 */

/**
 * Patrones que bloquean directamente.
 *
 * Cada entrada: { name, regex, reason }.
 * El regex se evalúa contra el texto en minúsculas.
 */
const BLOCK_PATTERNS = [
  // ── Generación de código ──
  {
    name: "code_generation",
    reason: "no puedo generar código",
    regex: /\b(escrib|gener|hac|cre|dame|d[áa]me|mostr[áa]me|necesito|quiero)\w*\s+(?:un[ao]?\s+)?(?:(?:ejemplo|caso|muestra|snippet)\s+(?:de\s+)?)?(c[óo]digo|script|funci[óo]n|programa|snippet|algoritmo|clase|m[ée]todo)\b/i,
  },
  {
    name: "code_language",
    reason: "no puedo escribir código",
    regex: /\b(?:en\s+)?(python|javascript|typescript|java|c\+\+|c#|rust|go|ruby|php|kotlin|swift|sql|html|css|react|vue|angular|node|django|flask|spring)\b.*\b(c[óo]digo|programa|script|funci[óo]n|ejemplo)\b/i,
  },
  {
    name: "code_help",
    reason: "no puedo ayudarte con programación",
    regex: /\b(c[óo]mo\s+program|ay[úu]dame\s+a\s+program|c[óo]digo\s+para|funci[óo]n\s+en\s+\w+\s+que)\b/i,
  },
  // ── Precios de productos de consumo ──
  {
    name: "consumer_prices",
    reason: "no soy un asistente de compras",
    regex: /\b(cu[áa]nto|cuanto)\s+(cuesta|vale|sale|est[áa])\s+(?:un[ao]?\s+)?(iphone|ipad|macbook|samsung|xiaomi|auto|coche|carro|moto|casa|departamento|depa|producto|servicio|suscripci[óo]n|membres[íi]a|netflix|spotify|amazon|mercado\s+libre)\b/i,
  },
  // ── Contenido claramente fuera de dominio ──
  {
    name: "jokes_personal",
    reason: "no soy un asistente de entretenimiento",
    regex: /\b(cu[ée]ntame\s+un\s+chiste|dime\s+un\s+chiste|hazme\s+re[íi]r|cu[ée]ntame\s+una\s+historia|qu[ée]\s+opin[áa]s\s+de\s+la\s+pol[íi]tica|qui[ée]n\s+gan[óo]\s+las?\s+elecciones)\b/i,
  },
  {
    name: "personal_advice",
    reason: "no puedo dar consejos personales",
    regex: /\b(dame\s+consejos?\s+(?:para|sobre)\s+(?:mi\s+vida|mi\s+relaci[óo]n|mi\s+pareja|amor|salud|dinero|inversiones?)|c[óo]mo\s+hago\s+para\s+ser\s+rico|terapia|psic[óo]logo)\b/i,
  },
  // ── Prompts para jailbreak obvio ──
  {
    name: "jailbreak_attempt",
    reason: "no puedo cambiar mi rol",
    regex: /\b(ignora|olvida|desactiva)\s+(todas?\s+)?(las?\s+)?(instrucciones|reglas|prompts?)\b/i,
  },
];

/**
 * Devuelve true si el texto contiene al menos un patrón bloqueante.
 *
 * @param {string} text
 * @returns {{blocked: true, reason: string} | {blocked: false}}
 */
export function scopeFilter(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { blocked: false };
  }

  const lower = text.toLowerCase();

  for (const rule of BLOCK_PATTERNS) {
    if (rule.regex.test(lower)) {
      return { blocked: true, reason: rule.reason };
    }
  }

  return { blocked: false };
}

/**
 * Patrones bloqueantes, expuestos para tests.
 */
export const SCOPE_PATTERNS = BLOCK_PATTERNS;