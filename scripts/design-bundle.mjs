/**
 * Arma el paquete que se sube a Claude Design.
 *
 * Cada componente se publica como un HTML que se abre solo: los tokens y las
 * clases reales salen de `src/app/globals.css` —no de una copia a mano— así que
 * el paquete no puede quedar diciendo un color que la aplicación ya no usa. Lo
 * único propio de las muestras es el andamiaje de `PREVIEW_CSS`.
 *
 *   npm run design:bundle
 *
 * Salida: design-system/*.html, listos para subir con DesignSync.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TOKENS, COMPONENTES } from "./design-css.mjs";
import { paginas } from "./design-pages.mjs";

const SALIDA = join(process.cwd(), "design-system");
mkdirSync(SALIDA, { recursive: true });

/* Andamiaje propio de las muestras: nada de esto viaja en la aplicación. */
const PREVIEW_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px;
    background: var(--plane); color: var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  h1 { font-size: 1.05rem; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 2px; }
  h1 + p { margin: 0 0 22px; font-size: 0.8rem; color: var(--muted); max-width: 62ch; line-height: 1.55; }
  h2 { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
       color: var(--faint); margin: 26px 0 10px; }
  h2:first-of-type { margin-top: 0; }
  a { text-decoration: none; }
  .fila { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .cols { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  .caja { border: 1px solid var(--border); background: var(--surface); border-radius: 0.75rem;
          box-shadow: var(--shadow-sm); }
  .caja > header { border-bottom: 1px solid var(--border); padding: 12px 16px; }
  .caja > header strong { display: block; font-size: 0.875rem; font-weight: 600; }
  .caja > header span { display: block; margin-top: 2px; font-size: 0.75rem; color: var(--muted); }
  .caja > .cuerpo { padding: 16px; }
  .nota { border: 1px solid var(--border); background: var(--surface-2); border-radius: 0.5rem;
          padding: 10px 12px; font-size: 0.75rem; line-height: 1.6; color: var(--muted); }
  .muted { color: var(--muted); } .faint { color: var(--faint); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.72rem;
         background: var(--surface-2); border-radius: 4px; padding: 1px 5px; color: var(--muted); }

  /* Muestra de color: el valor se lee al lado, nunca solo por el color. */
  .muestra { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 0.78rem; }
  .chip { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--border); flex: none; }
  .muestra b { font-weight: 500; } .muestra code { margin-left: auto; }

  .badge { display: inline-flex; align-items: center; gap: 4px; border: 1px solid;
           border-radius: 0.375rem; padding: 2px 6px; font-size: 0.75rem; font-weight: 500; }
  .badge-neutral { background: var(--surface-2); color: var(--muted); border-color: var(--border); }
  .badge-brand { background: var(--brand-soft); color: var(--brand-ink); border-color: transparent; }
  .badge-ok { background: var(--ok-soft); color: var(--ok); border-color: transparent; }
  .badge-warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
  .badge-risk { background: var(--risk-soft); color: var(--risk); border-color: transparent; }

  .stat { border: 1px solid var(--border); background: var(--surface); border-radius: 0.75rem;
          padding: 14px; box-shadow: var(--shadow-sm); }
  .stat .et { font-size: 0.75rem; font-weight: 500; color: var(--muted); }
  .stat .cifra { margin-top: 6px; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
  .stat .pista { margin-top: 4px; font-size: 0.75rem; color: var(--faint); }
  .t-ok { color: var(--ok); } .t-warn { color: var(--warn); } .t-risk { color: var(--risk); }

  .barra { width: 100%; height: 8px; border-radius: 999px; overflow: hidden; }
  .barra > i { display: block; height: 100%; border-radius: 999px; }

  .vacio { border: 1px dashed var(--border-strong); border-radius: 0.5rem;
           padding: 34px 16px; text-align: center; }
  .vacio p { margin: 0; font-size: 0.875rem; font-weight: 500; }
  .vacio span { display: block; margin-top: 6px; font-size: 0.75rem; color: var(--muted); }
`;

function pagina({ card, titulo, bajada, cuerpo }) {
  return `<!-- @dsCard group="${card.group}" -->
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} · NetFlow</title>
<style>
${TOKENS}

/* --- clases reales de la aplicación (src/app/globals.css) --- */
${COMPONENTES}

/* --- solo para estas muestras --- */
${PREVIEW_CSS}
</style>
</head>
<body>
<h1>${titulo}</h1>
<p>${bajada}</p>
${cuerpo}
</body>
</html>
`;
}

for (const p of paginas) {
  writeFileSync(join(SALIDA, p.archivo), pagina(p));
  console.log("design-system/" + p.archivo);
}
console.log(`\n${paginas.length} muestras generadas.`);
