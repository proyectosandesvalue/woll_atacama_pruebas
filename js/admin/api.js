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
  login: (username, password) =>
    request("/api/admin/login", {
      method: "POST",
      body: { username, password },
    }),
  loginVerify: (challengeId, code) =>
    request("/api/admin/login/verify", {
      method: "POST",
      body: { challenge_id: challengeId, code },
    }),
  forgotPassword: (email) =>
    request("/api/admin/password/forgot", { method: "POST", body: { email } }),
  resetPassword: (token, password) =>
    request("/api/admin/password/reset", {
      method: "POST",
      body: { token, password },
    }),
  logout: () => request("/api/admin/logout", { method: "POST", body: {} }),
  session: () => request("/api/admin/session"),
  config: () => request("/api/admin/config"),
  prompts: () => request("/api/admin/prompts"),
  settings: () => request("/api/admin/settings"),
  messages: () => request("/api/admin/messages"),
  unavailable: () => request("/api/admin/unavailable"),
  audit: (limit = 50) => request(`/api/admin/audit?limit=${limit}`),
  feedbackStats: () => request("/api/admin/feedback"),

  chatTools: () => request("/api/admin/chat/tools"),
  promptSave: (payload) =>
    request("/api/admin/prompts", { method: "POST", body: payload }),
  promptActivate: (id, version) =>
    request("/api/admin/prompts/activate", { method: "POST", body: { id, version } }),
  promptDelete: (id, version) =>
    request(`/api/admin/prompts?id=${encodeURIComponent(id)}&version=${encodeURIComponent(version)}`, {
      method: "DELETE",
    }),
  settingSave: (payload) =>
    request("/api/admin/settings", { method: "PUT", body: payload }),
  settingDelete: (key) =>
    request(`/api/admin/settings?key=${encodeURIComponent(key)}`, { method: "DELETE" }),
  messageSave: (payload) =>
    request("/api/admin/messages", { method: "PUT", body: payload }),
  messageDelete: (key) =>
    request(`/api/admin/messages?key=${encodeURIComponent(key)}`, { method: "DELETE" }),
  unavailableSave: (payload) =>
    request("/api/admin/unavailable", { method: "PUT", body: payload }),
  unavailableDelete: (id) =>
    request(`/api/admin/unavailable?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  goldenList: () => request("/api/admin/golden"),
  goldenSave: (payload) =>
    request("/api/admin/golden", { method: "PUT", body: payload }),
  goldenDelete: (id) =>
    request(`/api/admin/golden?id=${encodeURIComponent(id)}`, { method: "DELETE" }),

  unansweredList: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ).toString();
    return request(`/api/admin/unanswered${query ? `?${query}` : ""}`);
  },
  unansweredStats: () => request("/api/admin/unanswered/stats"),
  unansweredUpdate: (payload) =>
    request("/api/admin/unanswered", { method: "PUT", body: payload }),
  unansweredBrief: (id) =>
    request(`/api/admin/unanswered/brief?id=${encodeURIComponent(id)}`),

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
    const isZip =
      /\.zip$/i.test(file?.name || "") || /zip/i.test(file?.type || "");
    const headers = {
      Accept: "application/json",
      "Content-Type": isZip ? "application/zip" : "application/geo+json",
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
