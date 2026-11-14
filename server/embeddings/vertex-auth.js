/**
 * Autenticación de Google Cloud para embeddings (Vertex AI).
 *
 * Soporta:
 *   - GOOGLE_APPLICATION_CREDENTIALS_JSON (service account en el VPS)
 *   - Application Default Credentials (ADC local: gcloud auth application-default login)
 *
 * Cachea el access token hasta 5 minutos antes de su expiración. Nunca
 * registra el token ni el contenido de las credenciales.
 */
import { GoogleAuth } from "google-auth-library";

let _auth = null;
let _token = { token: null, expiresAt: 0 };

function buildAuth() {
  const scopes = ["https://www.googleapis.com/auth/cloud-platform"];
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credsJson) {
    return new GoogleAuth({
      credentials: JSON.parse(credsJson),
      scopes,
    });
  }
  return new GoogleAuth({ scopes });
}

export async function getAccessToken() {
  const now = Date.now();
  if (_token.token && _token.expiresAt > now + 5 * 60_000) {
    return _token.token;
  }

  const auth = _auth || (_auth = buildAuth());
  let client = auth;
  if (typeof auth.getClient === "function") {
    try {
      client = await auth.getClient();
    } catch {
      client = auth;
    }
  }

  const res = await client.getAccessToken();
  const token = typeof res === "string" ? res : res?.token;
  const expiresAt = res?.expiry_date || now + 55 * 60_000;
  if (!token) {
    throw new Error(
      "No se pudo obtener un access token de Google Cloud. " +
        "Configura GOOGLE_APPLICATION_CREDENTIALS_JSON o ADC."
    );
  }
  _token = { token, expiresAt };
  return token;
}

/** Solo para tests: limpia la caché de autenticación. */
export function _resetVertexAuth() {
  _auth = null;
  _token = { token: null, expiresAt: 0 };
}
