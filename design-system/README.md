# Sistema de diseño de NetFlow

Estas páginas son el paquete que se sube a Claude Design. **No se editan a
mano**: se generan desde el código real de la aplicación con

```bash
npm run design:bundle
```

Los tokens de color y las clases de componente (`.btn`, `.field`, `table.nf`,
`.seg-item`, `.tap`, `.scroll-x`) salen tal cual de `src/app/globals.css`, y los
iconos de `src/components/icons.tsx`. Es a propósito: un sistema de diseño que
se copia a mano queda desactualizado el día que alguien cambia un color, y
entonces miente. Lo único escrito para las muestras es el andamiaje de layout,
que vive junto en `PREVIEW_CSS` dentro de `scripts/design-bundle.mjs`.

Qué muestra cada quién está en `scripts/design-pages.mjs`. El texto de cada
muestra explica **cuándo** se usa la pieza, no cómo se ve: lo que se ve ya está
ahí.

| Página | Grupo | Qué contiene |
|---|---|---|
| `colores.html` | Fundamentos | Superficies, tinta, marca, estado, colores de gráfico |
| `tipografia.html` | Fundamentos | Escala de texto y cifras alineadas |
| `botones.html` | Acciones | Jerarquía, tamaño chico, control segmentado |
| `formularios.html` | Formularios | Campos, estados, avisos de error y de éxito |
| `datos.html` | Datos | Cifra protagonista, KPIs, avance contra ritmo esperado, semáforo |
| `tablas.html` | Datos | Tabla de listado y estados de fecha |
| `pipeline.html` | Patrones | La tarjeta del tablero comercial |
| `avisos.html` | Patrones | Aviso con deshacer, avisos de página, vacío, cargando |
| `navegacion.html` | Navegación | Columna de escritorio y barra inferior de celular |

Cada archivo abre solo: no depende de ninguna hoja de estilo, fuente ni script
externo, y respeta el tema claro y oscuro del navegador.

## Cómo subirlo

Necesita autorización de Claude Design una sola vez, desde una sesión
interactiva de Claude Code en la máquina: `/design-login`. Después, la
herramienta `DesignSync` lista los proyectos, se fija el plan de archivos y
sube estas páginas. El agrupado del panel sale del comentario
`<!-- @dsCard group="…" -->` que cada página lleva en su primera línea.
