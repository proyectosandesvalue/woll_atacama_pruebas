/**
 * Driver LLM OpenAI-compatible.
 *
 * Implementa la interfaz `llm.chat(...)` sobre cualquier API que siga
 * el dialecto OpenAI Chat Completions: Groq, OpenAI, Together,
 * Mistral, vLLM local, etc. Solo cambia LLM_BASE_URL / LLM_MODEL /
 * LLM_API_KEY.
 *
 * Soporta tool calling (function calling). El formato de tools sigue
 * el estándar OpenAI: [{type:"function", function:{name, description,
 * parameters}}]. Esto es compatible con Groq (que usa el mismo formato).
 *
 * Soporta `signal` (AbortSignal) para cancelar la petición si el
 * presupuesto de tiempo del orquestador se agota.
 */

export function createProvider(config) {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  /**
   * Llama al endpoint de chat completions.
   *
   * @param {{
   *   system: string,
   *   messages: Array<{role:'user'|'assistant'|'tool', content?:string, tool_call_id?:string, name?:string, tool_calls?:any}>,
   *   tools?: Array<{type:'function', function:{name, description, parameters}}>,
   *   toolChoice?: 'auto'|'none'|'required'|{type:'function', function:{name}},
   *   maxTokens?: number,
   *   temperature?: number,
   *   signal?: AbortSignal
   * }} args
   * @returns {Promise<{content: string|null, toolCalls: Array<{name, arguments, id}>|null, raw: any}>}
   */
  async function chat(args) {
    const openaiMessages = [{ role: "system", content: args.system }];
    for (const m of args.messages) {
      if (m.role === "tool") {
        openaiMessages.push({
          role: "tool",
          tool_call_id: m.tool_call_id,
          content:
            typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        });
      } else {
        openaiMessages.push(m);
      }
    }

    const body = {
      model: config.model,
      messages: openaiMessages,
      temperature: args.temperature ?? config.temperature,
      max_tokens: args.maxTokens ?? config.maxTokens,
    };
    if (args.tools && args.tools.length > 0) {
      body.tools = args.tools;
      body.tool_choice = args.toolChoice ?? "auto";
      // Pedir paralelismo explícito cuando el proveedor lo soporta:
      // el orquestador ejecuta las tools en Promise.all.
      body.parallel_tool_calls = true;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: args.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Mensajes amigables para los errores de rate limit del proveedor:
      // 413/429 suelen ser límites de TPM del tier (ej. Groq free: 8000).
      if (res.status === 429 || res.status === 413 || /rate_limit/i.test(text)) {
        throw new Error(
          "El proveedor de IA alcanzó su límite de tokens por minuto (TPM). " +
            "Reintenta en unos segundos o sube el plan del proveedor LLM. Detalle: " +
            (text || res.statusText).slice(0, 300)
        );
      }
      throw new Error(`LLM ${res.status}: ${text || res.statusText}`);
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    const msg = choice?.message || {};
    return {
      content: msg.content ?? null,
      toolCalls:
        Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0
          ? msg.tool_calls.map((tc) => ({
              id: tc.id,
              name: tc.function?.name,
              arguments:
                typeof tc.function?.arguments === "string"
                  ? safeParseJSON(tc.function.arguments)
                  : tc.function?.arguments || {},
            }))
          : null,
      raw: data,
    };
  }

  return { chat };
}

function safeParseJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}