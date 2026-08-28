# Métricas

Todas se definen una sola vez en `src/lib/metrics/registry.ts` y las consumen por igual el
resumen, el funnel, los objetivos y las barras del equipo. Por eso "reuniones realizadas"
significa exactamente lo mismo en todas las pantallas.

Cualquiera puede usarse como objetivo mensual: su resultado se calcula solo, nunca se carga
a mano. El listado completo también esta visible en **Ajustes**.

## Empresa

| Métrica | Definicion |
|---|---|
| Clientes nuevos | Clientes con fecha de alta dentro del rango y sin baja |
| Clientes activos | Alta ≤ fin del rango y sin baja a esa fecha |
| Leads totales | Leads con fecha de ingreso dentro del rango |
| MRR total | Suma del fee mensual de los clientes activos, consolidado |
| Facturación cobrada | Facturas con estado *cobrada* y fecha de cobro en el rango |
| Bajas de clientes | Clientes con fecha de baja en el rango |

## Comercial / Closer

| Métrica | Definicion |
|---|---|
| Reuniones realizadas | Reuniones con fecha de realizacion en el rango, atribuidas al closer |
| Propuestas | Propuestas enviadas en el rango |
| Cierres | Oportunidades ganadas con fecha de cierre en el rango |
| Close rate | Cierres ÷ reuniones realizadas |
| MRR nuevo | Fee mensual de los clientes dados de alta en el rango |

## Setter

| Métrica | Definicion |
|---|---|
| Leads recibidos | Leads ingresados en el rango con ese setter |
| Leads contactados | Leads con primer contacto en el rango |
| Tiempo de respuesta | Promedio entre el alta del lead y el primer contacto. *Menos es mejor* |
| Leads calificados | Leads calificados en el rango |
| Reuniones agendadas | Reuniones agendadas en el rango (fecha en que se agendo) |
| Show rate | Realizadas ÷ (realizadas + no-show), sobre reuniones cuya fecha ya paso |
| Follow-ups | Eventos de follow-up registrados en el rango |
| Recuperaciones de no-show | Reuniones realizadas tras un no-show previo |

## Paid Media

| Métrica | Definicion |
|---|---|
| Inversión publicitaria | Gastos de categoría `paid_media` en el rango. Fuente única compartida con Finanzas |
| Leads de pauta | Leads cuyo origen esta en la lista de origenes pagos (configurable en Ajustes) |
| CPL | Inversión ÷ leads de pauta. *Menos es mejor* |
| Leads calificados de pauta | Leads de pauta calificados en el rango |
| Creativos y tests | Piezas registradas en el rango |
| Reuniones generadas por pauta | Reuniones agendadas de leads con origen pago |

## Desarrollo

| Métrica | Definicion |
|---|---|
| Proyectos asignados | Proyectos y landings creados en el rango |
| Proyectos terminados | Proyectos y landings entregados en el rango |
| Entregas a tiempo | De lo entregado en el rango con fecha comprometida, cuánto llego antes |
| Landings activas | Clientes activos con landing |
| Pendientes abiertos | Trabajo sin terminar. *Menos es mejor* |
| Correcciones e incidencias | Creadas en el rango. *Menos es mejor* |

## Dirección / Marketing / Gestión

| Métrica | Definicion |
|---|---|
| Piezas planificadas | Contenido con fecha planificada en el rango |
| Piezas publicadas | Contenido con fecha de publicación en el rango |
| Cumplimiento del calendario | Publicadas ÷ planificadas |
| LinkedIn NetFlow | Piezas publicadas en ese canal |
| LinkedIn Facundo | Piezas publicadas en ese canal |
| CRM actualizado | % de oportunidades abiertas con responsable, próxima acción y fecha no vencida |
| Procesos abiertos | Procesos de gestión sin cerrar. *Menos es mejor* |
| Procesos completados | Procesos cerrados en el rango |

## Funnel

Los porcentajes de conversión se calculan **por cohorte**: sobre los leads que ingresaron
en el rango. Los contadores de "actividad del período" se muestran aparte. Ver
[`decisiones.md`](decisiones.md#4-el-funnel-se-mide-por-cohorte-no-por-actividad).

| Indicador | Formula |
|---|---|
| % de contacto | Contactados ÷ leads |
| % de calificación | Calificados ÷ contactados |
| Lead → reunión | Reuniones agendadas ÷ leads |
| Show rate | Realizadas ÷ (realizadas + no-show) con fecha en el rango |
| Reunión → propuesta | Propuestas ÷ reuniones realizadas |
| Reunión → cliente | Clientes ÷ reuniones realizadas |
| CPL | Inversión ÷ leads |
| CAC | Inversión del período ÷ clientes cerrados en el período |
| Revenue generado | MRR nuevo de los clientes dados de alta en el período |

## Finanzas

| Indicador | Formula |
|---|---|
| Resultado | Facturado − costos directos − gastos operativos |
| Margen bruto | (Facturado − costos directos) ÷ facturado |
| Margen neto | Resultado ÷ facturado |
| Margen por cliente | Fee − costos directos imputados a esa cuenta |
| Burn mensual | Promedio de gastos de los últimos 3 meses |
| Caja disponible | Último saldo declarado de cada cuenta, consolidado |
| Runway | Caja ÷ burn mensual |
| Costo operativo por cliente | Gastos operativos ÷ clientes activos |
| Ticket promedio | MRR ÷ clientes activos |

Un gasto cuenta como **costo directo** (y por lo tanto entra en el margen bruto) solo si se
marca como tal al cargarlo.
