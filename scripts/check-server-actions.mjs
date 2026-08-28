/**
 * Un archivo "use server" solo puede exportar funciones async.
 *
 * Exportar una constante desde ahí compila sin quejas y explota recién en
 * runtime, al renderizar la página que la importa ("A 'use server' file can
 * only export async functions, found object"). Como el error no aparece en el
 * build, lo buscamos acá.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

const fallas = [];
for (const p of archivos("src")) {
  const texto = readFileSync(p, "utf8");
  const primera = texto.split("\n").find((l) => l.trim() !== "");
  if (!primera || !/^["']use server["'];?$/.test(primera.trim())) continue;

  for (const [i, linea] of texto.split("\n").entries()) {
    if (!/^export\s/.test(linea)) continue;
    if (/^export\s+(async\s+function|type\b|interface\b)/.test(linea)) continue;
    fallas.push(`${p}:${i + 1}  ${linea.trim()}`);
  }
}

if (fallas.length) {
  console.error('Exportaciones invalidas en archivos "use server":\n' + fallas.join("\n"));
  process.exit(1);
}
console.log('OK: los archivos "use server" solo exportan funciones async.');
