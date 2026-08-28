import "server-only";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { sslFor } from "./pgssl";

/**
 * Acceso a PostgreSQL.
 *
 * Dos decisiones que explican la forma de este módulo:
 *
 * 1. `COUNT(*)` en Postgres devuelve `bigint`, y el driver lo entrega como
 *    STRING para no perder precisión. Sin los parsers de abajo, todo el motor
 *    de métricas recibiría "5" en vez de 5 y las cuentas darían mal en
 *    silencio. Lo mismo con los promedios (`numeric`).
 *
 * 2. Las consultas se escriben con `?` y se traducen a `$1..$n` acá. Es lo que
 *    permitió migrar 164 consultas desde SQLite sin reescribir cada una a
 *    mano, con el riesgo de equivocar un número de parámetro.
 */

pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.FLOAT8, (v) => Number(v));

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL. Es la cadena de conexión a PostgreSQL (ver .env.example).",
    );
  }
  return url;
}

function getPool(): pg.Pool {
  if (pool) return pool;

  const url = connectionString();
  // En entornos sin servidor cada invocación abre su propia conexión, así que
  // el pool se mantiene chico y se usa el endpoint agrupado del proveedor.
  const serverless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

  pool = new pg.Pool({
    connectionString: url,
    max: serverless ? 1 : 10,
    idleTimeoutMillis: serverless ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: sslFor(url),
  });

  pool.on("error", (err) => {
    console.error("Error inesperado en el pool de PostgreSQL:", err.message);
  });

  return pool;
}

/** Traduce los `?` posicionales al formato `$1..$n` de PostgreSQL. */
export function toPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Aplica el esquema una sola vez por proceso. Es idempotente
 * (`CREATE TABLE IF NOT EXISTS`), así que no hay paso de migración: desplegar
 * y arrancar alcanza.
 */
export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const file = path.join(process.cwd(), "src", "lib", "schema.sql");
      const sql = fs.readFileSync(file, "utf8");
      await getPool().query(sql);
    })().catch((e) => {
      schemaReady = null; // permite reintentar en la próxima petición
      throw e;
    });
  }
  return schemaReady;
}

async function exec<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[],
): Promise<pg.QueryResult<T>> {
  await ensureSchema();
  return getPool().query<T>(toPlaceholders(sql), params);
}

/** Todas las filas. */
export async function all<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await exec<T>(sql, params)).rows;
}

/** La primera fila, o undefined. */
export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await exec<T>(sql, params)).rows[0];
}

/** Escritura. Devuelve cuántas filas tocó. */
export async function run(sql: string, params: unknown[] = []): Promise<number> {
  return (await exec(sql, params)).rowCount ?? 0;
}

/** INSERT que devuelve el id generado. La consulta debe terminar en RETURNING id. */
export async function insert(sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ id: number }>(sql, params);
  if (!row) throw new Error("El INSERT no devolvió un id. ¿Falta RETURNING id?");
  return row.id;
}

export interface Tx {
  all<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<number>;
  insert(sql: string, params?: unknown[]): Promise<number>;
}

/**
 * Ejecuta un bloque dentro de una transacción. Si algo falla, se revierte
 * todo: nunca queda un cliente creado sin su oportunidad cerrada, ni al revés.
 */
export async function tx<T>(fn: (q: Tx) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const q: Tx = {
      async all(sql, params = []) {
        return (await client.query(toPlaceholders(sql), params)).rows as never;
      },
      async one(sql, params = []) {
        return (await client.query(toPlaceholders(sql), params)).rows[0] as never;
      },
      async run(sql, params = []) {
        return (await client.query(toPlaceholders(sql), params)).rowCount ?? 0;
      },
      async insert(sql, params = []) {
        const row = (await client.query(toPlaceholders(sql), params)).rows[0] as { id: number } | undefined;
        if (!row) throw new Error("El INSERT no devolvió un id. ¿Falta RETURNING id?");
        return row.id;
      },
    };
    const result = await fn(q);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await one<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, nf_now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = nf_now()`,
    [key, value],
  );
}

/** Cierra el pool. Solo lo usan los scripts de línea de comandos. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    schemaReady = null;
  }
}
