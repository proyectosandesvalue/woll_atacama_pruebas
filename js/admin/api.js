/**
 * Cliente HTTP del panel admin.
 *
 * Same-origin, cookies HttpOnly y CSRF en el header para POST.
 * No guarda tokens en localStorage.
 */

let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = typeof token === "string" ? token : null;
}

export function getCsrfToken() {
  return csrfToken;
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const finalHeaders = { Accept: "application/json", ...headers };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) {
    finalHeaders["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.retryAfter = res.headers.get("Retry-After");
    throw error;
  }
  return data;
}

export const api = {
  login: (username, password, totp) =>
    request("/api/admin/login", {
      method: "POST",
      body: { username, password, totp },
    }),
  logout: () => request("/api/admin/logout", { method: "POST", body: {} }),
  session: () => request("/api/admin/session"),
  config: () => request("/api/admin/config"),
  prompts: () => request("/api/admin/prompts"),
  settings: () => request("/api/admin/settings"),
  messages: () => request("/api/admin/messages"),
  unavailable: () => request("/api/admin/unavailable"),
  audit: (limit = 50) => request(`/api/admin/audit?limit=${limit}`),
};
