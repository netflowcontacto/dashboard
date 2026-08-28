# NetFlow — Centro de control interno

Dashboard interno de NetFlow. Dos vistas sobre los mismos datos:

- **Dashboard Administrador (direccion):** empresa completa — ventas, caja, costos,
  rentabilidad, performance, clientes y equipo.
- **Dashboard Equipo:** operativo — objetivos, tareas, progreso, resultados y la
  informacion necesaria para trabajar, **sin** informacion financiera sensible.

El objetivo es que el dashboard responda tres preguntas en dos minutos:

1. ¿Como esta NetFlow?
2. ¿Donde esta el cuello de botella?
3. ¿Quien es responsable de la proxima accion?

Cada pantalla esta construida alrededor de esas tres preguntas.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local          # y completar SESSION_SECRET
npm run db:seed                     # equipo + objetivos del mes, sin datos de ejemplo
npm run dev                         # http://localhost:3000
```

Para ver el dashboard con datos de demostracion antes de cargar los reales:

```bash
npm run db:seed -- --demo
```

`SESSION_SECRET` es obligatorio en produccion (la app no arranca sin el). Se genera con
`openssl rand -hex 32`.

El seed crea el equipo (Leandro, Facundo, Sophia, Max, Santiago). La contrasena inicial
sale de `SEED_ADMIN_PASSWORD`; **cambiarla desde Ajustes despues del primer ingreso**.

Otros comandos:

| Comando | Que hace |
|---|---|
| `npm run build` / `npm start` | build y arranque de produccion |
| `npm run typecheck` | chequeo de tipos |
| `npm run db:reset` | borra la base local |

---

## Stack

Next.js 15 (App Router, server components y server actions) · TypeScript · Tailwind CSS 4 ·
SQLite via better-sqlite3 · sesiones con cookie firmada (HMAC) y contrasenas con bcrypt.

Sin dependencias de servicios externos: la app corre entera en un proceso y un archivo de
base de datos. Es deliberado — una V1 que funciona hoy vale mas que una arquitectura que
hay que administrar.

---

## Que incluye la V1

**Comercial**
- CRM con pipeline completo: Nuevo lead → Contactado → Calificado → Reunion agendada →
  Reunion realizada → Propuesta → Follow-up → Ganado / Perdido.
- Funnel con inversion, CPL, % de contacto, % de calificacion, lead → reunion, show rate,
  reunion → propuesta, reunion → cliente, CAC y revenue generado.
- Filtros por dia, semana, mes, trimestre y rango personalizado en todas las vistas.
- Deteccion automatica del cuello de botella.

**Clientes**
- Plan, fee, alta, proximo cobro, estado de pago, responsables, desarrollo, landing,
  onboarding, renovacion, baja con motivo y semaforo Bien / Atencion / Riesgo.

**Objetivos y equipo**
- Objetivos mensuales de empresa, area y persona, con objetivo / resultado /
  % cumplimiento / dias restantes.
- Barra de progreso individual con logica de objetivo vs resultado.

**Finanzas (solo direccion)**
- Carga manual de gastos con las 11 categorias, fijo/variable, recurrente/no recurrente,
  proveedor, cliente asociado y estado.
- Ingresos − costos directos − gastos operativos = resultado.
- Burn, costos fijos y variables, costo operativo por cliente, margen por cliente,
  margen total, caja y runway.
- Operacion en ARS y USD con tipo de cambio de referencia configurable, **sin perder los
  valores originales**.

**Operacion**
- Tareas, proyectos, landings, incidencias, contenido y procesos de gestion.
- Calendario de 4 semanas con reuniones, vencimientos, proximas acciones y contenido.
- Alertas calculadas en vivo.

**Integraciones**
- Endpoint generico de leads entrantes (formularios / landings / ManyChat), funcionando.
- Webhook de Calendly implementado y firmado, listo para activar.
- Arquitectura preparada para Google Calendar y Meta Ads.

Ver [`docs/roadmap.md`](docs/roadmap.md) para V2 y V3.

---

## Documentacion

| Documento | Contenido |
|---|---|
| [`docs/decisiones.md`](docs/decisiones.md) | Decisiones de diseno y por que. **Incluye la regla de que el dashboard no es un ranking.** |
| [`docs/metricas.md`](docs/metricas.md) | Definicion exacta de cada metrica |
| [`docs/permisos.md`](docs/permisos.md) | Que ve cada rol y como se garantiza |
| [`docs/integraciones.md`](docs/integraciones.md) | Como conectar cada herramienta |
| [`docs/roadmap.md`](docs/roadmap.md) | V1 / V2 / V3 |

---

## Estructura

```
src/
├─ app/
│  ├─ (app)/            paginas de la app (comparten shell y navegacion)
│  ├─ api/integrations/ webhooks entrantes
│  └─ login/
├─ actions/             server actions (escritura): crm, clients, finance, objectives, tasks, users
├─ lib/
│  ├─ schema.sql        esquema de la base, con las reglas de negocio como constraints
│  ├─ permissions.ts    modelo de permisos en un solo lugar
│  ├─ alerts.ts         motor de alertas
│  └─ metrics/          registry, funnel, finance, objectives, team, overview
└─ components/          UI compartida
```

Las metricas se definen **una sola vez** en `src/lib/metrics/registry.ts` y las consumen
por igual el resumen, el funnel, los objetivos y las barras del equipo. Por eso
"reuniones realizadas" significa lo mismo en todas las pantallas.
