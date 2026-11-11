/**
 * Configuración del driver de base de datos (server-side).
 *
 * Centraliza las variables de entorno y resuelve la URL/base de cada
 * driver soportado. El pool selecciona el driver activo a partir de
 * `DB_DRIVER`; cambiar de BD = cambiar variables de entorno, nunca código.
 *
 * Variables esperadas:
 *   DB_DRIVER            "supabase" (default) | "postgres" | ...
 *   SUPABASE_URL         https://...supabase.co
 *   SUPABASE_SERVICE_KEY eyJ...   (SERVICE_ROLE, secreto, solo server)
 *
 * PostgreSQL propio (Sprint 26-B):
 *   DATABASE_URL          postgres://woll_api:...@host:5432/woll
 *   PG_APPLICATION_NAME   nombre visible en pg_stat_activity (default woll-api)
 *   PGPOOL_MAX, PG_STATEMENT_TIMEOUT_MS, PG_QUERY_TIMEOUT_MS
 */

function required(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(
      `Variable de entorno requerida no configurada: ${name}. ` +
      `Revisa .env.example y configura ${name} en tu .env local o en Vercel.`
    );
  }
  return v;
}

function optional(name, fallback) {
  const v = process.env[name];
  return v && String(v).trim() ? v : fallback;
}

export function getDBConfig() {
  const driver = optional("DB_DRIVER", "supabase");

  if (driver === "supabase") {
    return {
      driver,
      url: required("SUPABASE_URL"),
      serviceKey: required("SUPABASE_SERVICE_KEY"),
    };
  }

  if (driver === "postgres") {
    return {
      driver,
      connectionString: required("DATABASE_URL"),
      applicationName: optional("PG_APPLICATION_NAME", "woll-api"),
    };
  }

  throw new Error(`DB_DRIVER no soportado: ${driver}. Drivers válidos: supabase, postgres.`);
}
