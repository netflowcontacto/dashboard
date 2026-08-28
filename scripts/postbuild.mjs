/**
 * Limpieza posterior al build.
 *
 * El trazado de archivos de Next arrastra la carpeta `data/` dentro de
 * `.next/standalone`. Con PostgreSQL ahí ya no vive la base, pero sí pueden
 * vivir los archivos adjuntos del equipo (contratos, propuestas). Que eso
 * termine dentro del artefacto de despliegue sería una filtración.
 *
 * Se resuelve acá y no con `outputFileTracingExcludes` porque esa opción, con
 * la clave "*", sobre-excluye y deja afuera módulos internos de Next: el
 * servidor standalone deja de arrancar. Se probó, se rompió, quedó documentado.
 *
 * npm lo ejecuta solo después de `npm run build`.
 */
import fs from "node:fs";
import path from "node:path";

const standalone = path.join(process.cwd(), ".next", "standalone");
if (!fs.existsSync(standalone)) process.exit(0);

const removed = [];

function sweep(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      sweep(full);
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    } else if (/\.(db|db-wal|db-shm|db-journal|sql\.gz)$/.test(entry.name)) {
      fs.unlinkSync(full);
      removed.push(path.relative(standalone, full));
    }
  }
}

// La carpeta de datos completa no tiene nada que hacer en el build.
const dataDir = path.join(standalone, "data");
if (fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  removed.push("data/");
}
sweep(standalone);

console.log(
  removed.length > 0
    ? `postbuild: se quitaron del build ${removed.join(", ")}`
    : "postbuild: el build no contiene datos del negocio.",
);
