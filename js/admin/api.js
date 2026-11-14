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
    error.code = data.code;
    error.output = data.output;
    error.retryAfter = res.headers.get("Retry-After");
    throw error;
  }
  return data;
}

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.code = data.code;
    error.output = data.output;
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

  layersList: () => request("/api/admin/layers"),
  layerSave: (payload) =>
    request("/api/admin/layers", {
      method: payload.id ? "PUT" : "POST",
      body: payload,
    }),
  layerArchive: (id) =>
    request(`/api/admin/layers?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  layerQueue: (payload) =>
    request("/api/admin/layers/jobs", { method: "POST", body: payload }),
  layerJobs: (id) =>
    request(`/api/admin/layers/jobs${id ? `?id=${encodeURIComponent(id)}` : ""}`),
  layerCancel: (id) =>
    request("/api/admin/layers/jobs/cancel", { method: "POST", body: { id } }),
  layerUpload: async (key, file, name) => {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/geo+json",
    };
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    const params = new URLSearchParams({ key });
    if (name) params.set("name", name);
    const res = await fetch(`/api/admin/layers/upload?${params.toString()}`, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: file,
    });
    return parseResponse(res);
  },

  ragOverview: () => request("/api/admin/rag/overview"),
  ragSaveManifest: (entry) =>
    request("/api/admin/rag/manifest", { method: "POST", body: entry }),
  ragDeleteManifest: (slug, file = false) =>
    request(
      `/api/admin/rag/manifest?slug=${encodeURIComponent(slug)}${file ? "&file=1" : ""}`,
      { method: "DELETE" }
    ),
  ragQueue: (slug, action, force = false) =>
    request("/api/admin/rag/jobs", {
      method: "POST",
      body: { slug, action, force },
    }),
  ragJobs: (id) =>
    request(`/api/admin/rag/jobs${id ? `?id=${encodeURIComponent(id)}` : ""}`),
  ragCancel: (id) =>
    request("/api/admin/rag/jobs/cancel", { method: "POST", body: { id } }),
  ragChunks: (documentId, limit = 20, offset = 0) =>
    request(
      `/api/admin/rag/chunks?document_id=${encodeURIComponent(documentId)}` +
        `&limit=${limit}&offset=${offset}`
    ),
  apisList: () => request("/api/admin/apis"),
  apisUpdate: (payload) =>
    request("/api/admin/apis", { method: "PUT", body: payload }),
  apisTest: (key) =>
    request(`/api/admin/apis/test?key=${encodeURIComponent(key)}`, {
      method: "POST",
      body: {},
    }),

  taxonomy: () => request("/api/admin/taxonomy"),
  taxonomySaveDimension: (payload) =>
    request("/api/admin/taxonomy/dimensions", {
      method: payload.id ? "PUT" : "POST",
      body: payload,
    }),
  taxonomyDeleteDimension: (id) =>
    request(`/api/admin/taxonomy/dimensions?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  taxonomySaveGroup: (payload) =>
    request("/api/admin/taxonomy/groups", {
      method: payload.id ? "PUT" : "POST",
      body: payload,
    }),
  taxonomyDeleteGroup: (id) =>
    request(`/api/admin/taxonomy/groups?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  taxonomySaveSubgroup: (payload) =>
    request("/api/admin/taxonomy/subgroups", {
      method: payload.id ? "PUT" : "POST",
      body: payload,
    }),
  taxonomyDeleteSubgroup: (id) =>
    request(`/api/admin/taxonomy/subgroups?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  taxonomySavePlacement: (payload) =>
    request("/api/admin/taxonomy/placements", { method: "POST", body: payload }),
  taxonomyDeletePlacement: (id) =>
    request(`/api/admin/taxonomy/placements?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  taxonomyPublish: () =>
    request("/api/admin/taxonomy/publish", { method: "POST", body: {} }),

  ragUpload: async (slug, file) => {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/pdf",
    };
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    const res = await fetch(
      `/api/admin/rag/upload?slug=${encodeURIComponent(slug)}`,
      {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: file,
      }
    );
    return parseResponse(res);
  },
};
