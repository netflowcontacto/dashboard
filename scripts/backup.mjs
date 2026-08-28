/**
 * Respaldo de la base.
 *
 * Usa la API de backup de SQLite, no `cp`: copiar el archivo mientras la app
 * escribe puede dejar una copia corrupta o sin las transacciones del WAL.
 * Esta forma es segura con la aplicación corriendo.
 *
 *   node scripts/backup.mjs
 *
 * Variables:
 *   DATABASE_PATH  ruta de la base            (default ./data/netflow.db)
 *   BACKUP_DIR     carpeta de destino          (default ./backups)
 *   BACKUP_KEEP    cuántas copias conservar    (default 14)
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "netflow.db");
const outDir = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
const keep = Math.max(1, Number(process.env.BACKUP_KEEP || 14));

export async function runBackup() {
  if (!fs.existsSync(dbPath)) {
    console.error(`No existe la base en ${dbPath}`);
    return null;
  }

  fs.mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = path.join(outDir, `netflow-${stamp}.db`);

  const db = new Database(dbPath, { readonly: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }

  // Verificación: una copia que no abre no es un respaldo.
  const check = new Database(target, { readonly: true });
  const ok = check.prepare("PRAGMA integrity_check").get();
  const users = check.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  check.close();

  // Abrir la copia para verificarla deja archivos -wal/-shm al lado; el
  // respaldo tiene que ser un solo archivo autocontenido.
  for (const side of ["-wal", "-shm"]) {
    if (fs.existsSync(target + side)) fs.unlinkSync(target + side);
  }

  if (ok.integrity_check !== "ok") {
    fs.unlinkSync(target);
    throw new Error(`El respaldo salió corrupto: ${ok.integrity_check}`);
  }

  // Rotación: se conservan las últimas `keep` copias.
  const olds = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith("netflow-") && f.endsWith(".db"))
    .sort()
    .reverse()
    .slice(keep);
  for (const f of olds) fs.unlinkSync(path.join(outDir, f));

  const size = (fs.statSync(target).size / 1024).toFixed(0);
  console.log(`Respaldo ok: ${target} (${size} KB, ${users} usuario/s)`);
  if (olds.length) console.log(`Rotadas ${olds.length} copia(s) vieja(s); se conservan ${keep}.`);

  return target;
}

// Ejecutado directamente (no importado por el loop)
if (import.meta.url === `file://${process.argv[1]}`) {
  runBackup().catch((e) => {
    console.error("Falló el respaldo:", e.message);
    process.exit(1);
  });
}
