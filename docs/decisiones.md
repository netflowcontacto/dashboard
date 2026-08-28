# Decisiones de diseno

Por que el dashboard esta hecho asi. Si algo parece raro, probablemente esta explicado aca.

---

## 1. La barra individual no es un ranking

**La decision mas importante del producto, y la mas facil de romper sin querer.**

Una cosa es mostrar progreso contra objetivos. Otra muy distinta es publicar
"Facundo 92%, Max 74%, Sophia 61%". Son funciones diferentes, con inputs diferentes y
grados de control diferentes sobre el resultado. Un ranking publico entre companeros con
roles distintos genera incentivos malos: competir por el numero en vez de por el resultado
del negocio, y esconder problemas en lugar de levantarlos.

Como esta implementado:

- **Orden fijo.** `teamPerformance()` devuelve siempre las personas ordenadas por `id`,
  nunca por porcentaje. Hay un comentario en el codigo que lo dice explicitamente.
- **Cada persona contra su objetivo**, nunca contra el resto. No existe ninguna vista que
  compare a dos personas entre si.
- **El equipo ve solo lo suyo.** `canSeeIndividualResults()` permite ver el resultado de
  otra persona unicamente a direccion. En `/mi-panel` cada uno ve su barra y el agregado
  de su area — nunca el desglose por companero.
- **Sin objetivos, no hay numero.** Ver punto 3.

Si en algun momento hace falta ordenar esa lista, conviene discutirlo antes que
implementarlo.

---

## 2. Objetivo vs resultado, no cantidad de tareas

El pedido fue explicito: que nadie llegue al 100% haciendo tareas irrelevantes.

Por eso la barra **no cuenta actividad**. Lo unico que la mueve son los objetivos cargados
en `/objetivos`, y su resultado se calcula solo desde los datos reales del sistema (CRM,
clientes, tareas, finanzas). No hay ningun campo donde alguien escriba "voy 80%".

Ademas, **cada objetivo se tapa al 100% dentro del promedio**: sobrecumplir uno no compensa
incumplir otro. Se ve el sobrecumplimiento en el detalle, pero no infla el total.

Cada objetivo tiene un **peso**, para que cerrar 5 clientes pese mas que registrar 12
creativos.

Las metricas de cada funcion se muestran igual, etiquetadas como *informativas, no puntuan*.
Sirven para entender el trabajo; no mueven la barra.

---

## 3. Cuando falta informacion, se dice — no se inventa un numero

Si una persona no tiene objetivos cargados, su progreso es `null` y la UI muestra
"sin objetivos cargados". **Nunca 0% ni 100%.**

Un 0% diria que la persona no rindio, cuando en realidad nadie definio contra que medirla.
Un dashboard que inventa numeros deja de usarse en cuanto alguien detecta el primero que
esta mal.

---

## 4. El funnel se mide por cohorte, no por actividad

Es el error clasico que hace que un funnel muestre "120% de contacto": mezclar leads que
entraron este mes con contactos hechos este mes sobre leads del mes pasado.

Aca estan separados:

- **Cadena de conversion (cohorte):** leads que *ingresaron* en el rango y hasta donde
  llegaron. Los porcentajes siempre son ≤ 100% y decrecientes. Responde
  *"de lo que entro este mes, cuanto convertimos"*.
- **Actividad del periodo:** que paso *en* esas fechas, sin importar cuando entro el lead.
  Responde *"cuantas reuniones hicimos esta semana"*.

Ambos bloques estan etiquetados en la pantalla para que nadie los confunda.

Para que la cohorte sea monotona, al mover una oportunidad de etapa se completan hacia
atras las marcas de tiempo que falten (`backfillTimestamps`). Un lead que salta directo a
"Propuesta" queda igual registrado como contactado y calificado; si no, Propuestas seria
mayor que Contactados.

---

## 5. Una sola fuente de verdad para la inversion publicitaria

La inversion **no vive en una tabla aparte**: es `expenses` con `category = 'paid_media'`.

Si hubiera dos lugares donde cargar la pauta, el CPL del funnel y el gasto de finanzas se
contradirian a la primera semana, o se duplicaria el numero. Con una sola tabla eso es
imposible por construccion.

Consecuencia util: Sophia puede cargar inversion desde `/inversion` sin ver ninguna otra
categoria de gasto ni ningun numero financiero de la empresa. Es el permiso
`paid_media:cargar`, no `finanzas:*`.

---

## 6. Las reglas de negocio son constraints de la base, no solo validaciones de UI

*"Ningun lead deberia poder quedar perdido sin estado, responsable o proxima accion."*

Eso esta escrito como `CHECK` en `schema.sql`:

```sql
CONSTRAINT lead_abierto_necesita_proxima_accion CHECK (
  outcome <> 'open'
  OR (next_action IS NOT NULL AND trim(next_action) <> ''
      AND next_action_date IS NOT NULL AND trim(next_action_date) <> '')
)
```

Mas `owner_id NOT NULL`, motivo obligatorio al perder una oportunidad, motivo obligatorio
al dar de baja un cliente, y descripcion obligatoria al bloquear una tarea.

Una validacion de formulario se saltea con un import, un script o un bug. Un constraint no.
Los mensajes de error se traducen a lenguaje del equipo en `src/lib/errors.ts`.

---

## 7. Al ganar una oportunidad se crea el cliente en el mismo paso

Cerrar como ganada abre el alta del cliente (fee, plan, fecha) en el mismo formulario.

Sin esto aparece el estado "oportunidad ganada pero cliente sin cargar", que rompe el MRR,
el CAC, el ticket promedio y el margen — justo los numeros por los que se mira el dashboard.

---

## 8. Los importes se guardan en su moneda original

NetFlow opera en ARS y USD. Cada importe se guarda como **centavos + moneda**, y la
consolidacion ocurre recien al mostrar, con un tipo de cambio de referencia configurable
en Ajustes.

Cambiar el tipo de cambio **no modifica ningun dato cargado**: solo cambia como se suman
los totales. Los valores originales quedan siempre intactos y visibles.

Todo el dinero es `INTEGER` en centavos, nunca `float`.

---

## 9. Las alertas se calculan en vivo, no se guardan

Una alerta guardada sobrevive al problema que la genero: alguien resuelve el caso y la
alerta sigue ahi hasta que otro la marca como leida. Se acumula ruido y se dejan de mirar.

Aca se calculan sobre el estado real en cada request. Cuando el problema se resuelve, la
alerta desaparece sola. Cada una dice **que** pasa, **a quien** le corresponde y **donde**
resolverlo.

Ademas cada alerta declara su visibilidad: las financieras (cobros, facturacion) nunca
llegan al panel del equipo.

---

## 10. Las integraciones no bloquean nada

*"Si una integracion todavia no esta disponible, dejemos preparada la arquitectura pero no
frenemos la primera version."*

El camino de entrada es uno solo para todas las fuentes:

```
webhook → se guarda el payload crudo → se normaliza → se aplica sobre el CRM
```

Guardar el crudo primero permite auditar que llego exactamente y reprocesar sin pedirle
nada al proveedor cuando cambia el mapeo.

Si una integracion no esta configurada, su endpoint responde `503` (cerrado por defecto,
nunca abierto) y la carga sigue siendo manual. La app funciona igual.

El endpoint de leads deduplica por email o telefono contra oportunidades abiertas: en una
agencia chica los mismos contactos vuelven a entrar por varios canales, y un CRM lleno de
duplicados es un CRM que se abandona.
