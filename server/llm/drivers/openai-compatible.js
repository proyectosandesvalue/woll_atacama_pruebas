/**
 * Driver LLM OpenAI-compatible.
 *
 * Implementa la interfaz `llm.chat(...)` sobre cualquier API que siga
 * el dialecto OpenAI Chat Completions: Groq, OpenAI, Together, Mistral,
 * OpenCode Go, vLLM local, etc.
 *
 * Soporta tool calling (function calling) en el formato OpenAI.
 *
 * Soporta `signal` (AbortSignal) para cancelar la petición si el
 * presupuesto de tiempo del orquestador se agota.
 *
 * Soporta `sessionId` para proveedores que lo requieren (OpenCode Go
 * requiere el header `x-opencode-session` desde 2026-09-05).
 */

import { randomUUID } from "node:crypto";

export function createProvider(config) {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const isOpenCode = /opencode\.ai/i.test(config.baseUrl);

  /**
   * Construye los headers HTTP. Si el proveedor es OpenCode, agrega
   * el header `x-opencode-session` requerido para el routing.
   */
  function buildHeaders(sessionId) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };

    if (isOpenCode) {
      // OpenCode requiere un ID de sesión estable por conversación.
      // Si no viene del caller, generamos uno efímero por request
      // (evita el 400 MissingSessionID pero pierde el caché de prompt).
      const session =
        (typeof sessionId === "string" && sessionId.length > 0)
          ? sessionId
          : `oneshot-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      headers["x-opencode-session"] = session;
    }

    return headers;
  }

  /**
   * Llama al endpoint de chat completions.
   *
   * @param {{
   *   system: string,
   *   messages: Array,
   *   tools?: Array,
   *   Choice?: string|object,
   *   maxTokens?: number,
   *   temperature?: number,
   *   reasoningEffort?: string,
   *   signal?: AbortSignal,
   *   sessionId?: string,
   * }} args
   * @returns {Promise<{content: string|null, toolCalls: Array|null, raw: any}>}
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

    if (args.reasoningEffort) {
      body.reasoning_effort = args.reasoningEffort;
    }

    if (args.tools && args.tools.length > 0) {
      body.tools = args.tools;
      body.tool_choice = args.toolChoice ?? "auto";
    
      if (config.supportsParallelTools !== false) {
        body.parallel_tool_calls = true;
      }
    }

    const reqHeaders = buildHeaders(args.sessionId);

    const res = await fetch(url, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(body),
      signal: args.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
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
          ? msg.tool_calls.map((tc) => {
              const mapped = {
                id: tc.id,
                name: tc.function?.name,
                arguments:
                  typeof tc.function?.arguments === "string"
                    ? safeParseJSON(tc.function.arguments)
                    : tc.function?.arguments || {},
              };
           
              if (tc.extra_content) {
                mapped.extra_content = tc.extra_content;
              }
              return mapped;
            })
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