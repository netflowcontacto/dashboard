/**
 * Lee el sistema de diseño desde `src/app/globals.css`.
 *
 * Las muestras que se publican salen de acá y no de una copia a mano: así el
 * paquete no puede quedar diciendo un color que la aplicación ya no usa.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Recorta un bloque balanceado que empieza en `inicio` (incluye las llaves). */
function bloque(inicio) {
  const i = css.indexOf(inicio);
  if (i === -1) throw new Error(`no encontré el bloque: ${inicio}`);
  let nivel = 0;
  for (let j = css.indexOf("{", i); j < css.length; j++) {
    if (css[j] === "{") nivel++;
    else if (css[j] === "}" && --nivel === 0) return css.slice(i, j + 1);
  }
  throw new Error(`bloque sin cerrar: ${inicio}`);
}

/** Los tokens tal cual los usa la aplicación, en sus tres formas. */
export const TOKENS = [
  bloque(":root {"),
  bloque("@media (prefers-color-scheme: dark) {"),
  bloque(':root[data-theme="dark"] {'),
].join("\n\n");

/** Las clases de componente, sin el envoltorio @layer (que acá no hace falta). */
export const COMPONENTES = bloque("@layer components {")
  .replace(/^@layer components \{/, "")
  .replace(/\}\s*$/, "");

const RAIZ = bloque(":root {");

/** Nombre y valor de cada token definido en :root, en orden de aparición. */
export function tokensDeRaiz() {
  return [...RAIZ.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, nombre, valor]) => ({
    nombre,
    valor: valor.trim(),
  }));
}

const iconos = readFileSync(join(process.cwd(), "src/components/icons.tsx"), "utf8");

/**
 * Devuelve un icono de la aplicación como SVG suelto.
 *
 * Se saca de `src/components/icons.tsx` en vez de redibujarlo: las muestras
 * tienen que mostrar el icono que la gente ve, no uno parecido.
 */
export function icono(nombre, tam = 16) {
  const m = iconos.match(
    new RegExp(`export const Icon${nombre} = \\(p: Props\\) => \\(\\s*<Svg \\{\\.\\.\\.p\\}>([\\s\\S]*?)</Svg>`),
  );
  if (!m) throw new Error(`no existe el icono: Icon${nombre}`);
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${m[1].trim()}</svg>`;
}
