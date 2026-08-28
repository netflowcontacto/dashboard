/**
 * Limpieza posterior al build.
 *
 * El trazado de archivos de Next arrastra `data/` dentro de `.next/standalone`,
 * porque `db.ts` arma ahí la ruta por defecto de la base. Sin esta limpieza, el
 * artefacto de despliegue se llevaría la base de producción adentro: datos del
 * negocio y hashes de contraseñas dentro de la imagen.
 *
 * Se resuelve acá y no con `outputFileTracingExcludes` porque esa opción, con
 * la clave "*", sobre-excluye y deja afuera módulos internos de Next: el
 * servidor standalone deja de arrancar.
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
      // Carpeta que quedó vacía tras sacar la base
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    } else if (/\.db(-wal|-shm|-journal)?$/.test(entry.name)) {
      fs.unlinkSync(full);
      removed.push(path.relative(standalone, full));
    }
  }
}

sweep(standalone);

if (removed.length > 0) {
  console.log(`postbuild: se quitaron ${removed.length} archivo(s) de base del build:`);
  for (const r of removed) console.log(`  - ${r}`);
} else {
  console.log("postbuild: el build no contiene archivos de base.");
}
