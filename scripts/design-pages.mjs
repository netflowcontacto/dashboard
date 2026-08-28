/**
 * Qué muestra cada tarjeta del sistema de diseño.
 *
 * El texto de cada muestra explica *cuándo* se usa la pieza, no cómo se ve:
 * lo que se ve ya está ahí. Los grupos siguen la forma en que se piensa el
 * dashboard: primero los fundamentos, después lo que se toca, después lo que
 * muestra datos, y al final los patrones armados.
 */
import { icono, tokensDeRaiz } from "./design-css.mjs";

const ETIQUETA = {
  plane: "Fondo de la página",
  surface: "Superficie de tarjeta",
  "surface-2": "Superficie hundida",
  "surface-3": "Superficie hundida (paso 2)",
  border: "Borde",
  "border-strong": "Borde marcado",
  text: "Tinta principal",
  muted: "Tinta secundaria",
  faint: "Tinta terciaria",
  brand: "Marca",
  "brand-ink": "Marca sobre fondo suave",
  "brand-soft": "Fondo de marca",
  "series-1": "Serie 1",
  "series-2": "Serie 2",
  "series-3": "Serie 3",
  "status-good": "Bien (marca de gráfico)",
  "status-warning": "Atención (marca de gráfico)",
  "status-critical": "Riesgo (marca de gráfico)",
  ok: "Bien (texto)",
  "ok-soft": "Bien (fondo)",
  warn: "Atención (texto)",
  "warn-soft": "Atención (fondo)",
  risk: "Riesgo (texto)",
  "risk-soft": "Riesgo (fondo)",
  grid: "Grilla del gráfico",
  axis: "Eje del gráfico",
  track: "Pista de la barra",
};

function muestras(nombres) {
  const todos = Object.fromEntries(tokensDeRaiz().map((t) => [t.nombre, t.valor]));
  return nombres
    .map(
      (n) => `  <div class="muestra">
    <span class="chip" style="background: var(--${n})"></span>
    <b>${ETIQUETA[n] ?? n}</b>
    <code>--${n}</code>
  </div>`,
    )
    .filter((_, i) => todos[nombres[i]] !== undefined)
    .join("\n");
}

export const paginas = [
  {
    archivo: "colores.html",
    card: { group: "Fundamentos" },
    titulo: "Color",
    bajada:
      "Un solo lugar donde vive la paleta: todo el dashboard la consume por rol, nunca por hex suelto, así el cambio de tema ocurre en un punto. Los colores de serie y de estado salen de una paleta validada para daltonismo y contraste — no se tocan sin volver a validar.",
    cuerpo: `
<h2>Superficies</h2>
<div class="cols"><div>${muestras(["plane", "surface", "surface-2", "surface-3", "border", "border-strong"])}</div></div>

<h2>Tinta</h2>
<div class="cols"><div>${muestras(["text", "muted", "faint"])}</div></div>

<h2>Marca</h2>
<div class="cols"><div>${muestras(["brand", "brand-ink", "brand-soft"])}</div></div>

<h2>Estado en la interfaz</h2>
<p class="nota">Estos pares están calculados para dar contraste AA del texto sobre su propio fondo suave. El color nunca lleva el significado solo: siempre viene con icono y palabra.</p>
<div class="cols" style="margin-top:10px"><div>${muestras(["ok", "ok-soft", "warn", "warn-soft", "risk", "risk-soft"])}</div></div>
<div class="fila" style="margin-top:12px">
  <span class="badge badge-ok">${icono("Check", 12)} Bien</span>
  <span class="badge badge-warn">${icono("Alertas", 12)} Atención</span>
  <span class="badge badge-risk">${icono("Alertas", 12)} Riesgo</span>
  <span class="badge badge-neutral">Neutro</span>
  <span class="badge badge-brand">Marca</span>
</div>

<h2>Gráficos</h2>
<div class="cols"><div>${muestras(["series-1", "series-2", "series-3", "status-good", "status-warning", "status-critical", "grid", "axis", "track"])}</div></div>
`,
  },

  {
    archivo: "tipografia.html",
    card: { group: "Fundamentos" },
    titulo: "Tipografía y cifras",
    bajada:
      "Tipografía del sistema, sin fuentes que descargar: en un panel interno que se abre veinte veces por día, esperar una fuente es peor que no tenerla.",
    cuerpo: `
<h2>Escala</h2>
<div class="caja"><div class="cuerpo">
  <p style="margin:0;font-size:3rem;font-weight:600;letter-spacing:-0.03em;line-height:1">US$ 3.150</p>
  <p class="faint" style="margin:2px 0 18px;font-size:0.75rem">Cifra protagonista · una sola por pantalla</p>
  <p style="margin:0;font-size:1.5rem;font-weight:600;letter-spacing:-0.02em">1.500 · KPI de tarjeta</p>
  <p style="margin:14px 0 0;font-size:1.25rem;font-weight:600;letter-spacing:-0.01em">Título de página</p>
  <p style="margin:12px 0 0;font-size:0.875rem;font-weight:600">Título de tarjeta</p>
  <p style="margin:10px 0 0;font-size:0.875rem">Texto de lectura, 14px, el tamaño en el que vive casi todo.</p>
  <p class="muted" style="margin:8px 0 0;font-size:0.75rem">Ayuda y subtítulo, 12px.</p>
  <p class="faint" style="margin:8px 0 0;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Encabezado de sección</p>
</div></div>

<h2>Cifras alineadas</h2>
<p class="nota">Las columnas de números llevan <code>.tnum</code> para que las cifras se alineen. La cifra protagonista <em>no</em> lo lleva: a 48px la cifra tabular se ve suelta.</p>
<div class="cols" style="margin-top:12px">
  <div class="caja"><div class="cuerpo">
    <p class="faint" style="margin:0 0 8px;font-size:0.7rem">Con <code>.tnum</code></p>
    <p class="tnum" style="margin:0;line-height:1.7;font-size:0.875rem">US$ 1.200<br>US$ 11.100<br>US$ 111.000</p>
  </div></div>
  <div class="caja"><div class="cuerpo">
    <p class="faint" style="margin:0 0 8px;font-size:0.7rem">Sin <code>.tnum</code></p>
    <p style="margin:0;line-height:1.7;font-size:0.875rem">US$ 1.200<br>US$ 11.100<br>US$ 111.000</p>
  </div></div>
</div>
`,
  },

  {
    archivo: "botones.html",
    card: { group: "Acciones" },
    titulo: "Botones",
    bajada:
      "Una acción primaria por pantalla. El resto son secundarios o fantasma: si todo pesa, nada guía. En pantalla táctil todos crecen a 44px de alto — con el dedo no hay puntería fina.",
    cuerpo: `
<h2>Jerarquía</h2>
<div class="fila">
  <button class="btn btn-primary">Nueva oportunidad</button>
  <button class="btn">${icono("Descargar", 15)}Exportar CSV</button>
  <button class="btn btn-ghost">Cancelar</button>
  <button class="btn btn-danger">Cerrar como perdida</button>
  <button class="btn" disabled>Guardando…</button>
</div>

<h2>Tamaño chico</h2>
<p class="nota">Para acciones dentro de una fila o una tarjeta. Es el tamaño que más se toca en celular —avanzar de etapa, escribir por WhatsApp— así que con puntero grueso pasa a 44×44 aunque el icono siga siendo chico.</p>
<div class="fila" style="margin-top:12px">
  <button class="btn btn-sm">${icono("Mas", 13)}Adjuntar</button>
  <button class="btn btn-sm btn-primary">Registrar</button>
  <button class="btn btn-ghost btn-sm">Deshacer</button>
</div>

<h2>Control segmentado</h2>
<p class="nota">Para elegir entre dos o tres vistas del mismo dato: el filtro de período y el cambio entre tablero y lista. Se implementa con enlaces cuando cambia la URL, para que funcione antes de que cargue el JavaScript.</p>
<div class="fila" style="margin-top:12px">
  <div style="display:inline-flex;overflow:hidden;border-radius:0.5rem;border:1px solid var(--border);background:var(--surface)">
    <a class="seg-item" style="background:var(--brand);color:#fff">Tablero</a>
    <a class="seg-item" style="color:var(--muted)">Lista</a>
  </div>
  <div style="display:inline-flex;overflow:hidden;border-radius:0.5rem;border:1px solid var(--border);background:var(--surface)">
    <a class="seg-item" style="color:var(--muted)">Hoy</a>
    <a class="seg-item" style="color:var(--muted)">Semana</a>
    <a class="seg-item" style="background:var(--brand);color:#fff">Mes</a>
    <a class="seg-item" style="color:var(--muted)">Trimestre</a>
  </div>
</div>
`,
  },

  {
    archivo: "formularios.html",
    card: { group: "Formularios" },
    titulo: "Campos",
    bajada:
      "La etiqueta va arriba y la ayuda abajo, siempre en el mismo orden. Lo obligatorio se marca con un asterisco rojo, y la ayuda dice para qué sirve el dato, no cómo se llama.",
    cuerpo: `
<h2>Estados</h2>
<div class="cols">
  <label style="display:block">
    <span style="display:block;margin-bottom:4px;font-size:0.75rem;font-weight:500;color:var(--muted)">Nombre<span style="color:var(--risk);margin-left:2px">*</span></span>
    <input class="field" value="Dra. Paula Rivas">
  </label>
  <label style="display:block">
    <span style="display:block;margin-bottom:4px;font-size:0.75rem;font-weight:500;color:var(--muted)">Email de contacto</span>
    <input class="field" placeholder="paula@ejemplo.com">
  </label>
  <label style="display:block">
    <span style="display:block;margin-bottom:4px;font-size:0.75rem;font-weight:500;color:var(--muted)">Origen del lead</span>
    <select class="field"><option>Meta Ads</option><option>Instagram Ads</option><option>Referido</option></select>
  </label>
  <label style="display:block">
    <span style="display:block;margin-bottom:4px;font-size:0.75rem;font-weight:500;color:var(--muted)">Motivo de pérdida<span style="color:var(--risk);margin-left:2px">*</span></span>
    <input class="field" aria-invalid="true">
    <span style="display:block;margin-top:4px;font-size:0.75rem;color:var(--risk)">Sin motivo no se puede cerrar: es como aprendemos.</span>
  </label>
</div>

<h2>Con ayuda</h2>
<p class="nota" style="margin-bottom:12px">La ayuda dice para qué sirve el dato, no cómo se llama. Cuando algo es opcional se dice, y se dice por qué conviene igual.</p>
<div style="max-width:420px">
  <label style="display:block">
    <span style="display:block;margin-bottom:4px;font-size:0.75rem;font-weight:500;color:var(--muted)">Y ahora qué sigue</span>
    <input class="field" placeholder="Ej: llamar el lunes">
    <span style="display:block;margin-top:4px;font-size:0.75rem;color:var(--faint)">Opcional, pero es lo que evita que se enfríe.</span>
  </label>
</div>

<h2>Aviso de error del formulario</h2>
<div style="margin-top:4px;border:1px solid transparent;background:var(--risk-soft);color:var(--risk);border-radius:0.5rem;padding:10px 12px;font-size:0.875rem">
  Una oportunidad abierta no puede quedar sin próxima acción y fecha.
</div>
<div style="margin-top:8px;border:1px solid transparent;background:var(--ok-soft);color:var(--ok);border-radius:0.5rem;padding:10px 12px;font-size:0.875rem">
  Cambios guardados.
</div>
`,
  },

  {
    archivo: "datos.html",
    card: { group: "Datos" },
    titulo: "Tarjetas, KPIs y medidores",
    bajada:
      "Seis KPIs por pantalla como máximo: pasando los doce, la gente deja de mirarlos. La cifra protagonista es una sola, y las barras comparan el avance contra el ritmo esperado, no contra el 100%.",
    cuerpo: `
<h2>Cifra protagonista</h2>
<div class="caja"><div class="cuerpo">
  <p class="faint" style="margin:0;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Clientes nuevos este mes</p>
  <p style="margin:6px 0 0;font-size:3rem;font-weight:600;line-height:1;letter-spacing:-0.03em">3</p>
  <p class="muted" style="margin:10px 0 0;font-size:0.875rem">Objetivo del mes: 5. Faltan 2 y quedan 9 días.</p>
  <div class="barra track" style="margin-top:12px"><i style="width:60%;background:var(--status-warning)"></i></div>
</div></div>

<h2>Tarjetas de KPI</h2>
<div class="cols">
  <div class="stat"><div class="et">Oportunidades abiertas</div><div class="cifra tnum">6</div></div>
  <div class="stat"><div class="et">Con acción vencida</div><div class="cifra tnum t-ok">0</div></div>
  <div class="stat"><div class="et">Sin próxima acción</div><div class="cifra tnum t-warn">2</div><div class="pista">Son las primeras que hay que ordenar.</div></div>
  <div class="stat"><div class="et">Valor potencial abierto</div><div class="cifra tnum">US$ 3.150</div></div>
</div>

<h2>Avance contra el ritmo esperado</h2>
<p class="nota">La marca vertical es dónde debería ir el avance a esta altura del mes. La barra se pone roja solo cuando está claramente atrasada, no apenas se corre.</p>
<div class="caja" style="margin-top:12px"><div class="cuerpo" style="display:grid;gap:16px">
  <div>
    <div class="fila" style="justify-content:space-between;font-size:0.8rem;margin-bottom:6px"><span>Leads del mes</span><span class="tnum muted">84 / 100</span></div>
    <div style="position:relative"><div class="barra track"><i style="width:84%;background:var(--status-good)"></i></div>
      <span style="position:absolute;top:0;left:calc(70% - 1px);width:2px;height:100%;background:var(--text);opacity:.35;border-radius:999px"></span></div>
  </div>
  <div>
    <div class="fila" style="justify-content:space-between;font-size:0.8rem;margin-bottom:6px"><span>Reuniones realizadas</span><span class="tnum muted">9 / 20</span></div>
    <div style="position:relative"><div class="barra track"><i style="width:45%;background:var(--series-1)"></i></div>
      <span style="position:absolute;top:0;left:calc(50% - 1px);width:2px;height:100%;background:var(--text);opacity:.35;border-radius:999px"></span></div>
  </div>
  <div>
    <div class="fila" style="justify-content:space-between;font-size:0.8rem;margin-bottom:6px"><span>Clientes nuevos</span><span class="tnum muted">1 / 5</span></div>
    <div style="position:relative"><div class="barra track"><i style="width:20%;background:var(--status-critical)"></i></div>
      <span style="position:absolute;top:0;left:calc(70% - 1px);width:2px;height:100%;background:var(--text);opacity:.35;border-radius:999px"></span></div>
  </div>
</div></div>

<h2>Semáforo de cuenta</h2>
<p class="nota">Color, icono y palabra juntos. Quien no distingue el rojo del verde lee lo mismo que el resto.</p>
<div class="fila" style="margin-top:12px">
  <span class="badge badge-ok">${icono("Check", 12)} Bien</span>
  <span class="badge badge-warn">${icono("Alertas", 12)} Atención</span>
  <span class="badge badge-risk">${icono("Alertas", 12)} Riesgo</span>
</div>
`,
  },

  {
    archivo: "tablas.html",
    card: { group: "Datos" },
    titulo: "Tablas",
    bajada:
      "Encabezado en versalitas, filas que se iluminan al pasar, sin líneas verticales. La tabla scrollea dentro de su propia caja: el cuerpo de la página nunca se corre de costado.",
    cuerpo: `
<div class="caja">
  <header><strong>Todas las oportunidades del filtro</strong><span>6 resultados.</span></header>
  <div class="scroll-x">
    <table class="nf">
      <thead><tr><th>Nombre</th><th>Empresa / centro</th><th>Origen</th><th>Etapa</th><th>Responsable</th><th>Próxima acción</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        <tr><td style="white-space:nowrap"><a href="#" style="font-weight:500;color:inherit">Centro Visión Sur</a></td><td class="muted">Centro Visión Sur</td><td class="muted">Meta Ads</td><td><span class="badge badge-neutral">Nuevo lead</span></td><td>Max</td><td class="muted">vence hoy · Primer contacto</td><td class="tnum" style="text-align:right">—</td></tr>
        <tr><td style="white-space:nowrap"><a href="#" style="font-weight:500;color:inherit">Dr. Ramiro Cano</a></td><td class="muted">Traumatología Cano</td><td class="muted">Meta Ads</td><td><span class="badge badge-neutral">Contactado</span></td><td>Max</td><td class="muted">vence hoy · Segundo intento por WhatsApp</td><td class="tnum" style="text-align:right">—</td></tr>
        <tr><td style="white-space:nowrap"><a href="#" style="font-weight:500;color:inherit">Dra. Paula Rivas</a></td><td class="muted">Centro Dermatológico Rivas</td><td class="muted">Meta Ads</td><td><span class="badge badge-neutral">Propuesta</span></td><td>Max</td><td style="color:var(--risk)">venció ayer · Enviar propuesta</td><td class="tnum" style="text-align:right">US$ 900</td></tr>
        <tr><td style="white-space:nowrap"><a href="#" style="font-weight:500;color:inherit">Clínica Norte</a></td><td class="muted">Clínica Norte</td><td class="muted">Referido</td><td><span class="badge badge-neutral">Reunión agendada</span></td><td>Max</td><td class="muted">vence en 2 días · Confirmar asistencia</td><td class="tnum" style="text-align:right">US$ 1.200</td></tr>
      </tbody>
    </table>
  </div>
</div>

<h2>Fecha vencida</h2>
<p class="nota">Lo vencido se dice con palabras —«venció ayer»— y además se pinta. La palabra sola alcanza; el color es el refuerzo.</p>
`,
  },

  {
    archivo: "pipeline.html",
    card: { group: "Patrones" },
    titulo: "Tarjeta del pipeline",
    bajada:
      "La unidad del tablero comercial. Dice de un vistazo quién es, quién lo tiene, cuánto vale y qué sigue — y deja contactar sin abrir la ficha. En escritorio se arrastra entre columnas; en celular la flecha la manda a la etapa siguiente.",
    cuerpo: `
<div class="fila" style="align-items:flex-start;gap:14px">
  <div style="width:256px">
    <div class="fila" style="justify-content:space-between;padding:0 4px;margin-bottom:8px">
      <span class="faint" style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Propuesta</span>
      <span class="tnum faint" style="font-size:0.75rem">1</span>
    </div>
    <div style="border:1px solid var(--border);background:var(--surface);border-radius:0.5rem;padding:10px">
      <div class="fila" style="flex-wrap:nowrap;align-items:flex-start;gap:4px">
        <span style="min-width:0;flex:1;font-size:0.875rem;font-weight:500">Dra. Paula Rivas</span>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px;color:var(--faint)">${icono("Flecha", 13)}</button>
      </div>
      <p class="muted" style="margin:2px 0 0;font-size:0.75rem">Centro Dermatológico Rivas</p>
      <div class="fila" style="gap:4px;margin-top:6px">
        <span class="badge badge-neutral">Max</span>
        <span class="badge badge-brand">US$ 900</span>
      </div>
      <p style="margin:6px 0 0;font-size:0.75rem;color:var(--risk)">venció ayer · Enviar propuesta</p>
      <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
        <div class="fila" style="flex-wrap:nowrap;gap:6px">
          <button class="btn btn-sm" style="padding:5px 9px">${icono("Whatsapp", 13)}</button>
          <button class="btn btn-sm" style="padding:5px 9px">${icono("Telefono", 13)}</button>
          <button class="btn btn-sm" style="padding:5px 9px">${icono("Email", 13)}</button>
        </div>
      </div>
    </div>
  </div>

  <div style="width:256px">
    <div class="fila" style="justify-content:space-between;padding:0 4px;margin-bottom:8px">
      <span class="faint" style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Calificado</span>
      <span class="tnum faint" style="font-size:0.75rem">0</span>
    </div>
    <div style="border:2px dashed var(--brand);background:var(--brand-soft);border-radius:0.5rem;padding:22px 12px;text-align:center;font-size:0.75rem;color:var(--faint)">
      Soltar acá
    </div>
  </div>
</div>

<h2>Estados de la próxima acción</h2>
<div class="caja" style="max-width:420px"><div class="cuerpo" style="display:grid;gap:8px;font-size:0.75rem">
  <span style="color:var(--faint)">vence en 2 días · Confirmar asistencia</span>
  <span style="color:var(--risk)">venció ayer · Enviar propuesta</span>
  <span style="color:var(--warn)">Sin próxima acción</span>
</div></div>
<p class="nota" style="margin-top:12px">«Sin próxima acción» es amarillo y no rojo a propósito: no es un error, es una oportunidad que todavía nadie ordenó. La regla del sistema es que ninguna oportunidad abierta puede quedar sin responsable, estado y próxima acción — y eso está puesto como restricción en la base, no solo en la pantalla.</p>
`,
  },

  {
    archivo: "avisos.html",
    card: { group: "Patrones" },
    titulo: "Avisos, notas y vacíos",
    bajada:
      "Qué le dice el sistema a la persona cuando algo pasó, cuando algo falta y cuando no hay nada que mostrar. Cada uno tiene un lugar fijo, para que no haya que buscarlo.",
    cuerpo: `
<h2>Aviso con deshacer</h2>
<p class="nota">Aparece abajo, dura seis segundos y ofrece volver atrás. Es lo que hace que arrastrar una tarjeta sea seguro: sin poder revertir un movimiento equivocado, la gente deja de confiar en el tablero.</p>
<div class="fila" style="margin-top:12px">
  <div style="display:flex;align-items:center;gap:12px;border:1px solid var(--border);background:var(--surface);border-radius:0.6rem;box-shadow:var(--shadow-lg);padding:10px 12px">
    <span style="font-size:0.875rem">Movida a Calificado.</span>
    <button class="btn btn-ghost btn-sm" style="color:var(--brand-ink);font-weight:600">Deshacer</button>
  </div>
</div>
<div class="fila" style="margin-top:8px">
  <div style="display:flex;align-items:center;gap:12px;border:1px solid transparent;background:var(--risk-soft);color:var(--risk);border-radius:0.6rem;box-shadow:var(--shadow-lg);padding:10px 12px;font-size:0.875rem">
    No se pudo mover. Volvió a su lugar.
  </div>
</div>

<h2>Aviso en la página</h2>
<div style="border:1px solid var(--warn-soft);background:var(--warn-soft);color:var(--warn);border-radius:0.5rem;padding:10px 12px;font-size:0.875rem">
  2 oportunidades abiertas sin próxima acción definida. Son las primeras que hay que ordenar.
</div>

<h2>Nota al pie</h2>
<p class="nota">Explica cómo funciona la pantalla, en el idioma de quien la usa. Va al final, no arriba: el que ya sabe no la lee, el que no sabe la encuentra donde se le acabaron las ideas.</p>

<h2>Sin nada que mostrar</h2>
<div class="vacio">
  <p>No hay oportunidades con este filtro</p>
  <span>Probá quitar algún filtro, o cargá la primera.</span>
  <div style="margin-top:14px"><button class="btn btn-primary">Cargar la primera</button></div>
</div>

<h2>Cargando</h2>
<div class="caja"><div class="cuerpo">
  <div class="skel" style="height:20px;width:180px"></div>
  <div class="skel" style="height:14px;width:100%;margin-top:12px"></div>
  <div class="skel" style="height:14px;width:70%;margin-top:8px"></div>
</div></div>
`,
  },

  {
    archivo: "navegacion.html",
    card: { group: "Navegación" },
    titulo: "Navegación",
    bajada:
      "En escritorio, una columna fija agrupada por para qué sirve cada cosa: mi trabajo, comercial, operación. En celular la navegación vive abajo, en la zona del pulgar, con cuatro destinos y «Más».",
    cuerpo: `
<div class="fila" style="align-items:flex-start;gap:20px">
  <nav style="width:216px;border:1px solid var(--border);background:var(--surface);border-radius:0.75rem;padding:10px 8px">
    <p class="faint" style="margin:4px 8px 4px;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em">Mi trabajo</p>
    <a style="display:flex;align-items:center;gap:8px;border-radius:0.5rem;padding:7px 8px;font-size:0.875rem;color:var(--text)">${icono("Panel", 16)}Mi panel</a>
    <p class="faint" style="margin:14px 8px 4px;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em">Comercial</p>
    <a style="display:flex;align-items:center;gap:8px;border-radius:0.5rem;padding:7px 8px;font-size:0.875rem;background:var(--brand-soft);color:var(--brand-ink);font-weight:500">${icono("Crm", 16)}CRM</a>
    <a style="display:flex;align-items:center;gap:8px;border-radius:0.5rem;padding:7px 8px;font-size:0.875rem;color:var(--text)">${icono("Clientes", 16)}Clientes</a>
    <p class="faint" style="margin:14px 8px 4px;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em">Operación</p>
    <a style="display:flex;align-items:center;gap:8px;border-radius:0.5rem;padding:7px 8px;font-size:0.875rem;color:var(--text)">${icono("Objetivos", 16)}Objetivos</a>
    <a style="display:flex;align-items:center;gap:8px;border-radius:0.5rem;padding:7px 8px;font-size:0.875rem;color:var(--text)">${icono("Tareas", 16)}Tareas y proyectos</a>
    <a style="display:flex;align-items:center;justify-content:space-between;border-radius:0.5rem;padding:7px 8px;font-size:0.875rem;color:var(--text)"><span style="display:flex;align-items:center;gap:8px">${icono("Alertas", 16)}Alertas</span>
      <span class="badge badge-risk" style="border-radius:999px;min-width:18px;justify-content:center">3</span></a>
  </nav>

  <div style="width:300px">
    <p class="faint" style="margin:0 0 8px;font-size:0.7rem">Barra inferior en celular</p>
    <div style="display:flex;border:1px solid var(--border);border-radius:0.75rem;background:var(--surface);overflow:hidden">
      ${[
        ["Panel", "Panel"],
        ["CRM", "Crm"],
        ["Tareas", "Tareas"],
        ["Alertas", "Alertas"],
        ["Más", "Menu"],
      ]
        .map(
          ([etiqueta, ic], i) =>
            `<a style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 2px;font-size:0.65rem;${i === 1 ? "color:var(--brand-ink);font-weight:600" : "color:var(--muted)"}">${icono(ic, 18)}${etiqueta}</a>`,
        )
        .join("")}
    </div>
    <p class="nota" style="margin-top:12px">Cuatro destinos y «Más». Los cuatro son los que se abren todos los días; el resto está a un toque de distancia y no compite por lugar.</p>
  </div>
</div>
`,
  },
];
