/** Borra la base local. Util para volver a empezar en desarrollo. */
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "netflow.db");
let removed = 0;
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const file = `${dbPath}${suffix}`;
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    removed++;
  }
}
console.log(removed > 0 ? `Base borrada (${removed} archivo/s).` : "No habia base que borrar.");
