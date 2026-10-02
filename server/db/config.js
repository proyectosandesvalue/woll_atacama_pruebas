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
 * Drivers futuros (solo se documentan las variables; la implementación
 * del driver PostgreSQL nativo llega cuando se salga de Supabase a un
 * servidor propio):
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
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
    };
  }

  throw new Error(`DB_DRIVER no soportado: ${driver}. Drivers válidos: supabase, postgres.`);
}
