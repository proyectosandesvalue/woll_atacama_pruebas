/**
 * Detección de style_hint para colorear elementos.
 *
 * Prioridad:
 *   1. color_by que el LLM ya pasó a get_layer_features.
 *   2. "por comuna/provincia/región".
 *   3. "por <campo>" genérico.
 *   4. null.
 */

export function detectStyleHint(userText, ctx) {
  if (ctx && ctx.lastColorBy) {
    return {
      attribute: ctx.lastColorBy,
      kind: "choropleth-points",
      palette: null,
    };
  }

  if (!userText || typeof userText !== "string") return null;
  const t = userText.toLowerCase();

  const adminMatch = t.match(
    /\bpor\s+(comuna|comunas|provincia|provincias|regi[oó]n|regiones)\b/
  );
  if (adminMatch) {
    const word = adminMatch[1];
    const attribute =
      word.startsWith("comun") ? "COMUNA"
      : word.startsWith("provinc") ? "PROVINCIA"
      : "REGION";
    return { attribute, kind: "choropleth-points", palette: null };
  }

  const genericMatch = t.match(/\bpor\s+([a-záéíóúñ_]{3,30})\b/);
  if (genericMatch) {
    const raw = genericMatch[1];
    const stopwords = new Set([
      "favor", "ejemplo", "ahora", "favor", "default",
      "comuna", "provincia", "region", "parte", "tipo",
    ]);
    if (!stopwords.has(raw)) {
      const attribute = raw.toUpperCase();
      return { attribute, kind: "choropleth-points", palette: null };
    }
  }

  return null;
}