# Roadmap

Criterio: una V1 simple que funcione antes que 50 funcionalidades a medio terminar.

---

## V1 — hecha

CRM + funnel + clientes + objetivos + equipo + finanzas basicas.

- [x] Login con roles y permisos (admin / equipo)
- [x] CRM con pipeline completo y reglas de negocio en la base
- [x] Funnel comercial con todas las conversiones, CPL y CAC
- [x] Filtros por dia, semana, mes, trimestre y rango personalizado
- [x] Clientes con semaforo, onboarding, responsables y baja con motivo
- [x] Objetivos de empresa, area y persona con progreso automatico
- [x] Barra de resultado individual con logica objetivo vs resultado
- [x] Finanzas: gastos, categorias, caja, burn, runway, margenes, ARS/USD
- [x] Tareas, proyectos, contenido y procesos
- [x] Calendario operativo de 4 semanas
- [x] Alertas en vivo
- [x] Dashboard del equipo sin informacion financiera
- [x] Endpoint de leads entrantes (formularios / landings / ManyChat)
- [x] Webhook de Calendly implementado y firmado (falta activarlo)

---

## V2 — Calendly / Google Calendar + automatizaciones + reporting

**Prioridad 1: que una reunion agendada por Max en Calendly aparezca sola en el CRM,
sin cargarla dos veces.** El webhook ya esta escrito y validado; falta crear el webhook en
Calendly, cargar `CALENDLY_WEBHOOK_SIGNING_KEY` y probar con reuniones reales.

Despues:

- [ ] Google Calendar: OAuth por persona y agenda real en el calendario
- [ ] Marcar no-show automaticamente cuando pasa la hora sin registrar la reunion
- [ ] Recordatorios automaticos de proxima accion vencida
- [ ] Generacion automatica de la factura mensual de cada cliente en su fecha de cobro
- [ ] Reporte mensual exportable (PDF / envio por mail)
- [ ] Historico de metricas para comparar mes contra mes

---

## V3 — Meta / ManyChat y automatizaciones avanzadas

- [ ] Meta Ads: inversion, impresiones y leads por campana, sin carga manual
- [ ] ManyChat: leads conversacionales de Instagram y WhatsApp al pipeline
- [ ] Atribucion de campana a cliente cerrado (CAC real por campana)
- [ ] Objetivos colectivos y bonos asociados
- [ ] Alertas proactivas por canal (mail / WhatsApp) ademas del dashboard

---

## Pendientes conocidos de la V1

Cosas que quedaron deliberadamente afuera y conviene tener anotadas:

- **Backups.** La base es un archivo (`data/netflow.db`). Antes de cargar datos reales,
  definir una copia periodica a otro lado.
- **Historico de metricas.** Todo se calcula en vivo sobre el estado actual. Sirve para
  operar, pero no permite auditar como se veia un mes cerrado. Es lo que resuelve el
  historico de V2.
- **Sin tests automatizados.** Se valido con un smoke test manual de todas las rutas y
  roles. Al crecer, el motor de metricas es lo primero que conviene cubrir con tests.
- **Bajas de clientes y MRR.** Un cliente dado de baja deja de contar en el MRR desde su
  fecha de baja; no hay MRR historico por mes hasta V2.
- **Zona horaria.** Las fechas se manejan en la zona del servidor. Si se despliega fuera de
  Argentina, fijar `TZ=America/Argentina/Buenos_Aires`.
