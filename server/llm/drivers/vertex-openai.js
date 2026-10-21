/**
 * Driver LLM para Vertex AI (Google Cloud).
 *
 * Usa el endpoint compatible con OpenAI de Vertex AI:
 *   https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{LOCATION}/endpoints/openapi/chat/completions
 *
 * Autenticación: Application Default Credentials (ADC) via google-auth-library.
 * En local usa las credenciales de `gcloud auth application-default login`.
 * En producción (Vercel) usa una Service Account vía GOOGLE_APPLICATION_CREDENTIALS_JSON.
 *
 * El formato de mensajes y tools es idéntico al de OpenAI, por lo que
 * el orquestador no necesita cambios.
 */

import { GoogleAuth, ExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/functions/oidc";

let _auth = null;

async function getAuth() {
  if (_auth) return _auth;

  // 1. JSON de Service Account (desarrollo local, si existe).
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credsJson) {
    _auth = new GoogleAuth({
      credentials: JSON.parse(credsJson),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    return _auth;
  }

  // 2. Workload Identity Federation (producción en Vercel).
  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const saEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;

  if (projectNumber && poolId && providerId && saEmail) {
    _auth = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:generateAccessToken`,
    subject_token_supplier: {
        getSubjectToken: async () => await getVercelOidcToken(),
    },
    });
    return _auth;
  }

  // 3. ADC local (fallback para desarrollo sin JSON).
  _auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return _auth;
}

// ── Caché de access token (evita pedir uno nuevo en cada request) ──
let _tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (_tokenCache.token && _tokenCache.expiresAt > now + 5 * 60_000) {
    return _tokenCache.token;
  }

  const auth = await getAuth();

  // GoogleAuth (ADC local) expone getClient().getAccessToken().
  // ExternalAccountClient (WIF) expone getAccessToken() directamente.
  let tokenClient = auth;
  if (typeof auth.getClient === "function") {
    try {
      tokenClient = await auth.getClient();
    } catch {
      tokenClient = auth;
    }
  }

  const res = await tokenClient.getAccessToken();
  const token = typeof res === "string" ? res : res?.token;
  const expiresAt = res?.expiry_date || now + 55 * 60_000;

  if (!token) {
    throw new Error("No se pudo obtener access token de Vertex AI");
  }

  _tokenCache = { token, expiresAt };
  return token;
}

// ── Construcción de la URL del endpoint ──
function buildVertexUrl(config) {
  const { project, location } = config;
  if (!project) throw new Error("Vertex AI requiere config.project");
  if (!location) throw new Error("Vertex AI requiere config.location");

  // El endpoint global usa un host distinto.
  const host =
    location === "global"
      ? "aiplatform.googleapis.com"
      : `${location}-aiplatform.googleapis.com`;

  return (
    `https://${host}/v1/projects/${project}` +
    `/locations/${location}/endpoints/openapi/chat/completions`
  );
}

export function createProvider(config) {
  const url = buildVertexUrl(config);

  async function buildHeaders() {
    const token = await getAccessToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async function chat(args) {
    // ── Mismo formato OpenAI que openai-compatible.js ──
        const openaiMessages = [{ role: "system", content: args.system }];
    for (const m of args.messages) {
      if (m.role === "tool") {
        openaiMessages.push({
          role: "tool",
          tool_call_id: m.tool_call_id,
          content:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        });
      } else if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
        // Propagar extra_content (thought_signature) en cada tool call.
        openaiMessages.push({
          role: "assistant",
          content: m.content || "",
          tool_calls: m.tool_calls.map((tc) => {
            const mapped = {
              id: tc.id,
              type: "function",
              function: tc.function,
            };
            if (tc.extra_content) {
              mapped.extra_content = tc.extra_content;
            }
            return mapped;
          }),
        });
      } else {
        openaiMessages.push(m);
      }
    }

    // Vertex AI OpenAI-compatible endpoint requires <publisher>/<model> format.
    // Bare names like "gemini-3.1-flash-lite" must be prefixed with "google/".
    function normalizeVertexModel(model) {
    if (!model) return model;
    // If it already contains a publisher prefix (e.g. "google/", "anthropic/"), leave as-is.
    if (model.includes("/")) return model;
    return `google/${model}`;
    }

    const body = {
      model: normalizeVertexModel(config.model),
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

    const reqHeaders = await buildHeaders();

    const res = await fetch(url, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(body),
      signal: args.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");

      // 429 → marcamos retryable para que el wrapper active el fallback.
      if (res.status === 429 || /rate_limit/i.test(text)) {
        const err = new Error(
          "El proveedor de IA alcanzó su límite, experimentamos alta demanda. " +
            "Esto es temporal, reintenta en unos segundos. Detalle: " +
            (text || res.statusText).slice(0, 300)
        );
        err.retryable = true;
        err.status = 429;
        throw err;
      }

      if (res.status === 503 || /UNAVAILABLE/i.test(text)) {
        const err = new Error(
          "El servicio de IA está temporalmente saturado. " +
            "Reintentando en unos segundos... Detalle: " +
            (text || res.statusText).slice(0, 200)
        );
        err.retryable = true;
        err.status = 503;
        throw err;
      }

      if (res.status === 401 || res.status === 403) {
        const err = new Error(
          `Vertex AI rechazó la autenticación (${res.status}). ` +
            `Verifica GOOGLE_APPLICATION_CREDENTIALS_JSON o ADC local. Detalle: ` +
            (text || res.statusText).slice(0, 300)
        );
        err.retryable = false;
        err.status = res.status;
        throw err;
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