# Metricas

Todas se definen una sola vez en `src/lib/metrics/registry.ts` y las consumen por igual el
resumen, el funnel, los objetivos y las barras del equipo. Por eso "reuniones realizadas"
significa exactamente lo mismo en todas las pantallas.

Cualquiera puede usarse como objetivo mensual: su resultado se calcula solo, nunca se carga
a mano. El listado completo tambien esta visible en **Ajustes**.

## Empresa

| Metrica | Definicion |
|---|---|
| Clientes nuevos | Clientes con fecha de alta dentro del rango y sin baja |
| Clientes activos | Alta ≤ fin del rango y sin baja a esa fecha |
| Leads totales | Leads con fecha de ingreso dentro del rango |
| MRR total | Suma del fee mensual de los clientes activos, consolidado |
| Facturacion cobrada | Facturas con estado *cobrada* y fecha de cobro en el rango |
| Bajas de clientes | Clientes con fecha de baja en el rango |

## Comercial / Closer

| Metrica | Definicion |
|---|---|
| Reuniones realizadas | Reuniones con fecha de realizacion en el rango, atribuidas al closer |
| Propuestas | Propuestas enviadas en el rango |
| Cierres | Oportunidades ganadas con fecha de cierre en el rango |
| Close rate | Cierres ÷ reuniones realizadas |
| MRR nuevo | Fee mensual de los clientes dados de alta en el rango |

## Setter

| Metrica | Definicion |
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

| Metrica | Definicion |
|---|---|
| Inversion publicitaria | Gastos de categoria `paid_media` en el rango. Fuente unica compartida con Finanzas |
| Leads de pauta | Leads cuyo origen esta en la lista de origenes pagos (configurable en Ajustes) |
| CPL | Inversion ÷ leads de pauta. *Menos es mejor* |
| Leads calificados de pauta | Leads de pauta calificados en el rango |
| Creativos y tests | Piezas registradas en el rango |
| Reuniones generadas por pauta | Reuniones agendadas de leads con origen pago |

## Desarrollo

| Metrica | Definicion |
|---|---|
| Proyectos asignados | Proyectos y landings creados en el rango |
| Proyectos terminados | Proyectos y landings entregados en el rango |
| Entregas a tiempo | De lo entregado en el rango con fecha comprometida, cuanto llego antes |
| Landings activas | Clientes activos con landing |
| Pendientes abiertos | Trabajo sin terminar. *Menos es mejor* |
| Correcciones e incidencias | Creadas en el rango. *Menos es mejor* |

## Direccion / Marketing / Gestion

| Metrica | Definicion |
|---|---|
| Piezas planificadas | Contenido con fecha planificada en el rango |
| Piezas publicadas | Contenido con fecha de publicacion en el rango |
| Cumplimiento del calendario | Publicadas ÷ planificadas |
| LinkedIn NetFlow | Piezas publicadas en ese canal |
| LinkedIn Facundo | Piezas publicadas en ese canal |
| CRM actualizado | % de oportunidades abiertas con responsable, proxima accion y fecha no vencida |
| Procesos abiertos | Procesos de gestion sin cerrar. *Menos es mejor* |
| Procesos completados | Procesos cerrados en el rango |

## Funnel

Los porcentajes de conversion se calculan **por cohorte**: sobre los leads que ingresaron
en el rango. Los contadores de "actividad del periodo" se muestran aparte. Ver
[`decisiones.md`](decisiones.md#4-el-funnel-se-mide-por-cohorte-no-por-actividad).

| Indicador | Formula |
|---|---|
| % de contacto | Contactados ÷ leads |
| % de calificacion | Calificados ÷ contactados |
| Lead → reunion | Reuniones agendadas ÷ leads |
| Show rate | Realizadas ÷ (realizadas + no-show) con fecha en el rango |
| Reunion → propuesta | Propuestas ÷ reuniones realizadas |
| Reunion → cliente | Clientes ÷ reuniones realizadas |
| CPL | Inversion ÷ leads |
| CAC | Inversion del periodo ÷ clientes cerrados en el periodo |
| Revenue generado | MRR nuevo de los clientes dados de alta en el periodo |

## Finanzas

| Indicador | Formula |
|---|---|
| Resultado | Facturado − costos directos − gastos operativos |
| Margen bruto | (Facturado − costos directos) ÷ facturado |
| Margen neto | Resultado ÷ facturado |
| Margen por cliente | Fee − costos directos imputados a esa cuenta |
| Burn mensual | Promedio de gastos de los ultimos 3 meses |
| Caja disponible | Ultimo saldo declarado de cada cuenta, consolidado |
| Runway | Caja ÷ burn mensual |
| Costo operativo por cliente | Gastos operativos ÷ clientes activos |
| Ticket promedio | MRR ÷ clientes activos |

Un gasto cuenta como **costo directo** (y por lo tanto entra en el margen bruto) solo si se
marca como tal al cargarlo.
