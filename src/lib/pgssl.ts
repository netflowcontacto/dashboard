/**
 * Decide si la conexión a PostgreSQL usa TLS.
 *
 * Los Postgres gestionados (Neon, Supabase, Netlify DB) lo exigen; un Postgres
 * local o por socket Unix no lo tiene y falla si se lo pedís. Adivinar por el
 * texto de la URL era frágil, así que la regla es explícita.
 */
export function sslFor(url: string): false | { rejectUnauthorized: boolean } {
  const lower = url.toLowerCase();

  // Lo que diga la URL manda.
  if (lower.includes("sslmode=disable")) return false;
  if (lower.includes("sslmode=require") || lower.includes("sslmode=verify")) {
    return { rejectUnauthorized: false };
  }

  // Socket Unix: nunca lleva TLS.
  if (lower.includes("host=/") || lower.startsWith("postgres:///")) return false;

  try {
    const host = new URL(url).hostname;
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "postgres") {
      return false;
    }
  } catch {
    // URL no parseable: se asume remota, que es lo seguro.
  }

  return { rejectUnauthorized: false };
}
