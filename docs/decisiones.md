# Decisiones de diseño

Por que el dashboard esta hecho así. Si algo parece raro, probablemente esta explicado acá.

---

## 1. La barra individual no es un ranking

**La decisión mas importante del producto, y la mas fácil de romper sin querer.**

Una cosa es mostrar progreso contra objetivos. Otra muy distinta es publicar
"Facundo 92%, Max 74%, Sophia 61%". Son funciones diferentes, con inputs diferentes y
grados de control diferentes sobre el resultado. Un ranking público entre compañeros con
roles distintos genera incentivos malos: competir por el número en vez de por el resultado
del negocio, y esconder problemas en lugar de levantarlos.

Como esta implementado:

- **Orden fijo.** `teamPerformance()` devuelve siempre las personas ordenadas por `id`,
  nunca por porcentaje. Hay un comentario en el código que lo dice explicitamente.
- **Cada persona contra su objetivo**, nunca contra el resto. No existe ninguna vista que
  compare a dos personas entre si.
- **El equipo ve solo lo suyo.** `canSeeIndividualResults()` permite ver el resultado de
  otra persona únicamente a dirección. En `/mi-panel` cada uno ve su barra y el agregado
  de su area — nunca el desglose por compañero.
- **Sin objetivos, no hay número.** Ver punto 3.

Si en algun momento hace falta ordenar esa lista, conviene discutirlo antes que
implementarlo.

---

## 2. Objetivo vs resultado, no cantidad de tareas

El pedido fue explicito: que nadie llegue al 100% haciendo tareas irrelevantes.

Por eso la barra **no cuenta actividad**. Lo único que la mueve son los objetivos cargados
en `/objetivos`, y su resultado se calcula solo desde los datos reales del sistema (CRM,
clientes, tareas, finanzas). No hay ningún campo donde alguien escriba "voy 80%".

Además, **cada objetivo se tapa al 100% dentro del promedio**: sobrecumplir uno no compensa
incumplir otro. Se ve el sobrecumplimiento en el detalle, pero no infla el total.

Cada objetivo tiene un **peso**, para que cerrar 5 clientes pese mas que registrar 12
creativos.

Las métricas de cada función se muestran igual, etiquetadas como *informativas, no puntuan*.
Sirven para entender el trabajo; no mueven la barra.

---

## 3. Cuando falta información, se dice — no se inventa un número

Si una persona no tiene objetivos cargados, su progreso es `null` y la UI muestra
"sin objetivos cargados". **Nunca 0% ni 100%.**

Un 0% diria que la persona no rindio, cuando en realidad nadie definio contra que medirla.
Un dashboard que inventa números deja de usarse en cuánto alguien detecta el primero que
esta mal.

---

## 4. El funnel se mide por cohorte, no por actividad

Es el error clasico que hace que un funnel muestre "120% de contacto": mezclar leads que
entraron este mes con contactos hechos este mes sobre leads del mes pasado.

Acá están separados:

- **Cadena de conversión (cohorte):** leads que *ingresaron* en el rango y hasta donde
  llegaron. Los porcentajes siempre son ≤ 100% y decrecientes. Responde
  *"de lo que entro este mes, cuánto convertimos"*.
- **Actividad del período:** que paso *en* esas fechas, sin importar cuando entro el lead.
  Responde *"cuantas reuniones hicimos esta semana"*.

Ambos bloques están etiquetados en la pantalla para que nadie los confunda.

Para que la cohorte sea monotona, al mover una oportunidad de etapa se completan hacia
atrás las marcas de tiempo que falten (`backfillTimestamps`). Un lead que salta directo a
"Propuesta" queda igual registrado como contactado y calificado; si no, Propuestas sería
mayor que Contactados.

---

## 5. Una sola fuente de verdad para la inversión publicitaria

La inversión **no vive en una tabla aparte**: es `expenses` con `category = 'paid_media'`.

Si hubiera dos lugares donde cargar la pauta, el CPL del funnel y el gasto de finanzas se
contradirian a la primera semana, o se duplicaria el número. Con una sola tabla eso es
imposible por construcción.

Consecuencia util: Sophia puede cargar inversión desde `/inversión` sin ver ninguna otra
categoría de gasto ni ningún número financiero de la empresa. Es el permiso
`paid_media:cargar`, no `finanzas:*`.

---

## 6. Las reglas de negocio son constraints de la base, no solo validaciones de UI

*"Ningún lead debería poder quedar perdido sin estado, responsable o próxima acción."*

Eso esta escrito como `CHECK` en `schema.sql`:

```sql
CONSTRAINT lead_abierto_necesita_proxima_accion CHECK (
  outcome <> 'open'
  OR (next_action IS NOT NULL AND trim(next_action) <> ''
      AND next_action_date IS NOT NULL AND trim(next_action_date) <> '')
)
```

Mas `owner_id NOT NULL`, motivo obligatorio al perder una oportunidad, motivo obligatorio
al dar de baja un cliente, y descripción obligatoria al bloquear una tarea.

Una validación de formulario se saltea con un import, un script o un bug. Un constraint no.
Los mensajes de error se traducen a lenguaje del equipo en `src/lib/errors.ts`.

---

## 7. Al ganar una oportunidad se crea el cliente en el mismo paso

Cerrar como ganada abre el alta del cliente (fee, plan, fecha) en el mismo formulario.

Sin esto aparece el estado "oportunidad ganada pero cliente sin cargar", que rompe el MRR,
el CAC, el ticket promedio y el margen — justo los números por los que se mira el dashboard.

---

## 8. Los importes se guardan en su moneda original

NetFlow opera en ARS y USD. Cada importe se guarda como **centavos + moneda**, y la
consolidación ocurre recien al mostrar, con un tipo de cambio de referencia configurable
en Ajustes.

Cambiar el tipo de cambio **no modifica ningún dato cargado**: solo cambia como se suman
los totales. Los valores originales quedan siempre intactos y visibles.

Todo el dinero es `INTEGER` en centavos, nunca `float`.

---

## 9. Las alertas se calculan en vivo, no se guardan

Una alerta guardada sobrevive al problema que la genero: alguien resuelve el caso y la
alerta sigue ahi hasta que otro la marca como leida. Se acumula ruido y se dejan de mirar.

Acá se calculan sobre el estado real en cada request. Cuando el problema se resuelve, la
alerta desaparece sola. Cada una dice **que** pasa, **a quien** le corresponde y **donde**
resolverlo.

Además cada alerta declara su visibilidad: las financieras (cobros, facturación) nunca
llegan al panel del equipo.

---

## 10. Las integraciones no bloquean nada

*"Si una integración todavia no esta disponible, dejemos preparada la arquitectura pero no
frenemos la primera versión."*

El camino de entrada es uno solo para todas las fuentes:

```
webhook → se guarda el payload crudo → se normaliza → se aplica sobre el CRM
```

Guardar el crudo primero permite auditar que llego exactamente y reprocesar sin pedirle
nada al proveedor cuando cambia el mapeo.

Si una integración no esta configurada, su endpoint responde `503` (cerrado por defecto,
nunca abierto) y la carga sigue siendo manual. La app funciona igual.

El endpoint de leads deduplica por email o teléfono contra oportunidades abiertas: en una
agencia chica los mismos contactos vuelven a entrar por varios canales, y un CRM lleno de
duplicados es un CRM que se abandona.

---

## 11. La interfaz tiene una sola cifra protagonista por pantalla

La primera versión mostraba dieciséis tarjetas idénticas en el resumen. Todas del mismo
tamaño, el mismo peso, el mismo color. El resultado es que **nada se destaca**: hay que
leerlas una por una, que es exactamente lo contrario a "entender qué pasa en dos minutos".

Ahora cada pantalla tiene una jerarquía explícita: una cifra grande arriba (el objetivo
del mes), después las tarjetas de apoyo agrupadas por bloque con su título, y al final el
detalle. Si algo es importante se ve grande; si todo se ve igual, nada es importante.

## 12. Todo número principal se compara contra el período anterior

Un MRR de US$ 1.500 no dice nada por sí solo. La primera pregunta de cualquiera que abre
un dashboard no es *cuánto*, es *mejor o peor que antes*.

El período anterior es el bloque inmediatamente previo del mismo largo: un mes contra el
mes anterior, una semana contra la semana anterior, un rango de 12 días contra los 12 días
previos. Cuando no hay base (el valor anterior era cero), se muestra **«sin base de
comparación»** en lugar de un «+100%» que no significa nada.

El color de la variación indica dirección × si subir es bueno para esa métrica —bajar el
CPL es bueno, bajar el MRR no—, pero **nunca va solo**: siempre lo acompañan una flecha y
el nombre del período.

## 13. Los gráficos siguen reglas fijas, no gusto

Están escritos a mano en HTML y SVG, sin librería. Las reglas que cumplen todos:

- **Un solo eje.** Nunca dos escalas en el mismo gráfico: la alineación entre ellas es
  arbitraria e inventa correlaciones que no están en los datos.
- **Marcas finas.** Columnas de 24px como máximo, extremo redondeado de 4px apoyado en la
  línea base, líneas de 2px, grilla en hairline sólida.
- **Lo que separa dos marcas es un hueco de 2px del color de la superficie**, nunca un
  borde dibujado alrededor.
- **Leyenda siempre presente con dos o más series**, y etiquetas directas solo en el
  extremo o en el dato que cuenta la historia — nunca un número sobre cada punto.
- **El texto usa tinta, nunca el color de la serie.** La identidad la da la marca de color
  al lado del texto.
- **Todo gráfico tiene su vista de tabla** («Ver tabla»), que es la versión accesible y
  la que se puede copiar.

La paleta de series y de estado está **validada** para daltonismo y contraste (separación
CVD y contraste contra la superficie real, en claro y en oscuro). No conviene cambiar esos
hex sin volver a validarlos.

El embudo usa **un solo color** para toda la cadena: la longitud de la barra ya codifica la
magnitud, y pintar cada etapa de un color distinto duplicaría en color lo que la barra ya
dice. El único color diferente es el rojo de estado sobre el cuello de botella — que es
justo la historia que la pantalla tiene que contar.

## 14. Los valores de la base nunca se muestran crudos

`no_show`, `al_dia`, `correccion` son claves, no texto. Mostrarlas tal cual hace que el
producto se vea sin terminar. Toda pantalla que muestre uno de esos valores pasa por los
mapas de etiquetas de `src/lib/types.ts`.

Esto también explica por qué el español de la interfaz lleva tildes pero los valores de la
base no: `atencion` es una clave de un `CHECK` de SQLite, `Atención` es lo que se lee.
Confundir las dos cosas rompe la base — pasó durante el desarrollo y por eso quedó
documentado.

## 15. Las funciones no cruzan la frontera servidor → cliente

Los gráficos son componentes de cliente y reciben sus datos desde componentes de servidor.
Una función de formateo no se puede pasar como prop en ese borde: Next lo rechaza en
tiempo de ejecución.

Por eso `format` es un **objeto serializable** (`{ kind: "moneda", currency: "USD" }`) y no
un callback. Los importes viajan siempre en centavos y se formatean del lado del cliente.

## 16. La base no viaja dentro del build

El trazado de archivos de Next arrastra la carpeta `data/` dentro de `.next/standalone`,
porque `db.ts` arma ahí la ruta por defecto. Sin corregirlo, el artefacto de despliegue se
llevaría la base de producción adentro: datos del negocio y hashes de contraseñas dentro
de la imagen.

Se resuelve con `scripts/postbuild.mjs`, que barre el build y quita cualquier archivo de
base. **No** con `outputFileTracingExcludes`: esa opción, con la clave `"*"`, sobre-excluye
y deja afuera módulos internos de Next, y el servidor standalone deja de arrancar. Se
probó, se rompió, y por eso está resuelto de la otra forma.

---

## 17. Una barra de navegación abajo, no un menú arriba

El equipo abre esto desde el celular, con una mano y en el medio de otra cosa.
Un menú hamburguesa arriba a la izquierda es la esquina más incómoda de
alcanzar con el pulgar; una barra fija abajo queda justo donde el dedo ya está.

Van cuatro destinos y "Más". Cuatro y no seis porque a partir de ahí cada
botón baja de los 44px que recomiendan las guías de Apple y de Material, y
errarle a un botón con una mano es peor que un toque de más.

Los cuatro no son los primeros del menú lateral: ese está ordenado por tema y
la barra por uso diario. Para el equipo son Panel, CRM, Tareas y Alertas.

## 18. "Por dónde empezar hoy", arriba de todo

Un panel lleno de tarjetas **informa**, pero no **dirige**. Alguien entra,
ve nueve indicadores y sigue sin saber qué hacer primero.

Ahora lo primero que aparece es una lista corta de lo que hay que mover hoy,
ordenada por lo que más cuesta dejar pasar: leads sin contactar, reuniones de
hoy y mañana, acciones vencidas, tareas del día. Cada una lleva a su ficha.

Muestra pocas cosas a propósito. Una lista de veinte pendientes no se lee: se
ignora. Cuando no hay nada urgente lo dice, en vez de mostrar una lista vacía.

## 19. Fechas en lenguaje humano

"28/08/2026" obliga a hacer la cuenta mentalmente. "vence hoy" se lee de un
vistazo. En una lista de veinte oportunidades esa diferencia es la que hace
que alguien detecte lo urgente sin leer fila por fila.

La fecha exacta sigue estando en el `title` de cada elemento, para cuando hace
falta precisión.

## 20. Formularios que se abren por partes

La ficha de oportunidad tenía veinte campos de golpe. Un formulario así hace
que la gente cargue mal o directamente no cargue, que es el motivo más común
por el que se abandona un CRM.

Ahora arriba queda lo mínimo para que la oportunidad exista y sea accionable
—nombre, responsable, próxima acción y fecha— y el resto se abre solo si hace
falta: datos de contacto, reunión, oferta y valor.

Se usa `<details>` nativo: funciona sin JavaScript, el navegador ya sabe cómo
comportarse y es accesible por teclado sin escribir nada.

Los filtros del CRM siguen la misma idea: plegados en celular, siempre
abiertos en escritorio, con el mismo marcado.

## 21. Cuidado con los identificadores al corregir tildes

Acentuar el castellano de la interfaz rompió cosas tres veces, siempre igual:
una palabra que además era **una clave de código**.

- `'atencion'` y `'correccion'` son valores de un `CHECK` de la base: al
  acentuarlos, los `INSERT` empezaron a fallar.
- `"/inversion"` es una ruta: acentuada, el enlace daba 404.
- `numero:` era la clave de un mapa de traducción: acentuada, la búsqueda
  fallaba y la pantalla mostraba `numero` crudo al usuario.

La regla que quedó: **el texto que se lee lleva tilde; la clave que se compara,
nunca.** Y la verificación que lo detecta es leer el HTML renderizado de todas
las pantallas y buscar palabras sin tilde, en vez de revisar el código.
