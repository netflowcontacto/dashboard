import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;

  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "netflow.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8");
  db.exec(schema);

  instance = db;
  return db;
}

/** Ejecuta un bloque dentro de una transacción. */
export function tx<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  return db.transaction(fn)(db);
}

export function getSetting(key: string, fallback: string): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, value);
}
