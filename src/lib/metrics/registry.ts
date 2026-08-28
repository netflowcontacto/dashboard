import "server-only";
import { getDb, getSetting } from "../db";
import { fxRate, baseCurrency, toBase } from "../fx";
import type { DateRange } from "../dates";
import type { Area, Currency } from "../types";

/**
 * Registro único de métricas de NetFlow.
 *
 * Toda métrica se define UNA sola vez acá y la consumen por igual:
 *   - las barras de resultado individual (equipo)
 *   - los objetivos (objetivo vs resultado)
 *   - el resumen de dirección
 *
 * Esto es lo que evita que "reuniones realizadas" signifique una cosa en el
 * panel de Facundo y otra distinta en el funnel.
 *
 * `value` se devuelve siempre en unidades de presentación:
 *   número -> cantidad | porcentaje -> 0..100 | moneda -> unidades de la
 *   moneda base (no centavos) | horas -> horas.
 */

export type MetricUnit = "número" | "porcentaje" | "moneda" | "horas";

export interface MetricContext {
  range: DateRange;
  /** null = toda la empresa. Si viene, filtra por esas personas. */
  userIds: number[] | null;
}

export interface MetricDef {
  key: string;
  label: string;
  unit: MetricUnit;
  /** Area a la que pertenece la métrica. 'empresa' = transversal. */
  scope: Area | "empresa";
  /** Cuando es false, un valor mas bajo es mejor (ej: tiempo de respuesta, CPL). */
  higherIsBetter: boolean;
  help?: string;
  compute: (ctx: MetricContext) => number | null;
}

// --- helpers ---------------------------------------------------------------

function db() {
  return getDb();
}

/** Genera "AND col IN (?,?,?)" o cadena vacia si no hay filtro de personas. */
function userFilter(column: string, userIds: number[] | null): { sql: string; params: number[] } {
  if (!userIds || userIds.length === 0) return { sql: "", params: [] };
  return { sql: ` AND ${column} IN (${userIds.map(() => "?").join(",")})`, params: userIds };
}

function count(sql: string, params: unknown[]): number {
  const row = db().prepare(sql).get(...params) as { n: number | null } | undefined;
  return Number(row?.n ?? 0);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function moneyMajor(rows: { cents: number; currency: Currency }[]): number {
  const rate = fxRate();
  const base = baseCurrency();
  return rows.reduce((acc, r) => acc + toBase(r.cents, r.currency, rate, base), 0) / 100;
}

/** Origenes de lead que se consideran pauta paga (configurable en Ajustes). */
export function paidSources(): string[] {
  return getSetting("paid_lead_sources", "meta_ads,google_ads,instagram_ads,pauta")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function paidSourceFilter(): { sql: string; params: string[] } {
  const sources = paidSources();
  if (sources.length === 0) return { sql: " AND 0", params: [] };
  return { sql: ` AND source IN (${sources.map(() => "?").join(",")})`, params: sources };
}

// --- métricas comerciales --------------------------------------------------

const commercial: MetricDef[] = [
  {
    key: "reuniones_realizadas",
    label: "Reuniones realizadas",
    unit: "número",
    scope: "closer",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("closer_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM leads
         WHERE substr(meeting_held_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "propuestas",
    label: "Propuestas enviadas",
    unit: "número",
    scope: "closer",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("closer_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM leads
         WHERE substr(proposal_sent_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "cierres",
    label: "Cierres",
    unit: "número",
    scope: "closer",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("closer_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM leads
         WHERE outcome = 'won' AND substr(closed_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "close_rate",
    label: "Close rate",
    unit: "porcentaje",
    scope: "closer",
    higherIsBetter: true,
    help: "Cierres sobre reuniones realizadas en el período.",
    compute: (ctx) => {
      const cierres = byKey("cierres").compute(ctx) ?? 0;
      const reuniones = byKey("reuniones_realizadas").compute(ctx) ?? 0;
      return ratio(cierres, reuniones);
    },
  },
  {
    key: "mrr_nuevo",
    label: "MRR nuevo",
    unit: "moneda",
    scope: "closer",
    higherIsBetter: true,
    help: "Fee mensual de los clientes dados de alta en el período.",
    compute: ({ range, userIds }) => {
      const f = userFilter("l.closer_id", userIds);
      const rows = db()
        .prepare(
          `SELECT c.fee_cents AS cents, c.fee_currency AS currency
           FROM clients c
           ${userIds ? "JOIN leads l ON l.client_id = c.id" : ""}
           WHERE c.start_date BETWEEN ? AND ? AND c.churned_at IS NULL${userIds ? f.sql : ""}`,
        )
        .all(range.from, range.to, ...(userIds ? f.params : [])) as { cents: number; currency: Currency }[];
      return moneyMajor(rows);
    },
  },
];

// --- métricas de setter ----------------------------------------------------

const setter: MetricDef[] = [
  {
    key: "leads_recibidos",
    label: "Leads recibidos",
    unit: "número",
    scope: "setter",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("setter_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM leads WHERE entered_at BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "leads_contactados",
    label: "Leads contactados",
    unit: "número",
    scope: "setter",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("setter_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM leads
         WHERE substr(first_contacted_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "tiempo_respuesta_horas",
    label: "Tiempo de respuesta",
    unit: "horas",
    scope: "setter",
    higherIsBetter: false,
    help: "Promedio entre el ingreso del lead y el primer contacto.",
    compute: ({ range, userIds }) => {
      const f = userFilter("setter_id", userIds);
      const row = db()
        .prepare(
          `SELECT AVG((julianday(first_contacted_at) - julianday(created_at)) * 24.0) AS n
           FROM leads
           WHERE first_contacted_at IS NOT NULL
             AND substr(first_contacted_at,1,10) BETWEEN ? AND ?
             AND julianday(first_contacted_at) >= julianday(created_at)${f.sql}`,
        )
        .get(range.from, range.to, ...f.params) as { n: number | null };
      return row.n === null ? null : Number(row.n);
    },
  },
  {
    key: "leads_calificados",
    label: "Leads calificados",
    unit: "número",
    scope: "setter",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("setter_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM leads
         WHERE substr(qualified_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "reuniones_agendadas",
    label: "Reuniones agendadas",
    unit: "número",
    scope: "setter",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("setter_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM leads
         WHERE substr(meeting_scheduled_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "show_rate",
    label: "Show rate",
    unit: "porcentaje",
    scope: "setter",
    higherIsBetter: true,
    help: "Reuniones realizadas sobre reuniones que ya tuvieron fecha (realizadas + no-show).",
    compute: ({ range, userIds }) => {
      const f = userFilter("setter_id", userIds);
      const row = db()
        .prepare(
          `SELECT SUM(meeting_outcome = 'realizada')              AS ok,
                  SUM(meeting_outcome IN ('realizada','no_show')) AS total
           FROM leads
           WHERE meeting_at IS NOT NULL
             AND substr(meeting_at,1,10) BETWEEN ? AND ?${f.sql}`,
        )
        .get(range.from, range.to, ...f.params) as { ok: number | null; total: number | null };
      return ratio(Number(row.ok ?? 0), Number(row.total ?? 0));
    },
  },
  {
    key: "follow_ups",
    label: "Follow-ups",
    unit: "número",
    scope: "setter",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("user_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM lead_events
         WHERE type = 'follow_up' AND substr(at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "recuperaciones",
    label: "Recuperaciones de no-show",
    unit: "número",
    scope: "setter",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("setter_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM leads
         WHERE recovered_from_noshow = 1
           AND substr(meeting_held_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
];

// --- métricas de paid media ------------------------------------------------

const paidMedia: MetricDef[] = [
  {
    key: "inversión",
    label: "Inversión publicitaria",
    unit: "moneda",
    scope: "paid_media",
    higherIsBetter: true,
    help: "Gastos de categoría Paid Media en el período. Fuente única compartida con Finanzas.",
    compute: ({ range }) => {
      const rows = db()
        .prepare(
          `SELECT amount_cents AS cents, currency FROM expenses
           WHERE category = 'paid_media' AND date BETWEEN ? AND ?`,
        )
        .all(range.from, range.to) as { cents: number; currency: Currency }[];
      return moneyMajor(rows);
    },
  },
  {
    key: "leads_pauta",
    label: "Leads de pauta",
    unit: "número",
    scope: "paid_media",
    higherIsBetter: true,
    compute: ({ range }) => {
      const s = paidSourceFilter();
      return count(
        `SELECT COUNT(*) AS n FROM leads WHERE entered_at BETWEEN ? AND ?${s.sql}`,
        [range.from, range.to, ...s.params],
      );
    },
  },
  {
    key: "cpl",
    label: "CPL",
    unit: "moneda",
    scope: "paid_media",
    higherIsBetter: false,
    help: "Inversión dividida por leads de pauta.",
    compute: (ctx) => {
      const inversión = byKey("inversión").compute(ctx) ?? 0;
      const leads = byKey("leads_pauta").compute(ctx) ?? 0;
      return leads > 0 ? inversión / leads : null;
    },
  },
  {
    key: "leads_calificados_pauta",
    label: "Leads calificados de pauta",
    unit: "número",
    scope: "paid_media",
    higherIsBetter: true,
    compute: ({ range }) => {
      const s = paidSourceFilter();
      return count(
        `SELECT COUNT(*) AS n FROM leads
         WHERE substr(qualified_at,1,10) BETWEEN ? AND ?${s.sql}`,
        [range.from, range.to, ...s.params],
      );
    },
  },
  {
    key: "creativos_tests",
    label: "Creativos y tests",
    unit: "número",
    scope: "paid_media",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("user_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM campaign_assets WHERE date BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "reuniones_generadas_pauta",
    label: "Reuniones generadas por pauta",
    unit: "número",
    scope: "paid_media",
    higherIsBetter: true,
    help: "Contribución de paid media a la agenda comercial.",
    compute: ({ range }) => {
      const s = paidSourceFilter();
      return count(
        `SELECT COUNT(*) AS n FROM leads
         WHERE substr(meeting_scheduled_at,1,10) BETWEEN ? AND ?${s.sql}`,
        [range.from, range.to, ...s.params],
      );
    },
  },
];

// --- métricas de desarrollo ------------------------------------------------

const desarrollo: MetricDef[] = [
  {
    key: "proyectos_asignados",
    label: "Proyectos asignados",
    unit: "número",
    scope: "desarrollo",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("assignee_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category IN ('proyecto','landing')
           AND substr(created_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "proyectos_terminados",
    label: "Proyectos terminados",
    unit: "número",
    scope: "desarrollo",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("assignee_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category IN ('proyecto','landing') AND status = 'hecho'
           AND substr(done_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "entregas_a_tiempo",
    label: "Entregas a tiempo",
    unit: "porcentaje",
    scope: "desarrollo",
    higherIsBetter: true,
    help: "De lo entregado en el período, cuánto llego antes de su fecha comprometida.",
    compute: ({ range, userIds }) => {
      const f = userFilter("assignee_id", userIds);
      const row = db()
        .prepare(
          `SELECT SUM(substr(done_at,1,10) <= due_date) AS ok, COUNT(*) AS total
           FROM tasks
           WHERE status = 'hecho' AND due_date IS NOT NULL
             AND substr(done_at,1,10) BETWEEN ? AND ?${f.sql}`,
        )
        .get(range.from, range.to, ...f.params) as { ok: number | null; total: number | null };
      return ratio(Number(row.ok ?? 0), Number(row.total ?? 0));
    },
  },
  {
    key: "landings_activas",
    label: "Landings activas",
    unit: "número",
    scope: "desarrollo",
    higherIsBetter: true,
    compute: ({ range }) =>
      count(
        `SELECT COUNT(*) AS n FROM clients
         WHERE landing = 1 AND start_date <= ? AND (churned_at IS NULL OR churned_at > ?)`,
        [range.to, range.to],
      ),
  },
  {
    key: "pendientes",
    label: "Pendientes abiertos",
    unit: "número",
    scope: "desarrollo",
    higherIsBetter: false,
    compute: ({ userIds }) => {
      const f = userFilter("assignee_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE status IN ('pendiente','en_curso','bloqueado')
           AND category IN ('proyecto','landing','incidencia','correccion','tarea')${f.sql}`,
        [...f.params],
      );
    },
  },
  {
    key: "incidencias",
    label: "Correcciones e incidencias",
    unit: "número",
    scope: "desarrollo",
    higherIsBetter: false,
    compute: ({ range, userIds }) => {
      const f = userFilter("assignee_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category IN ('incidencia','correccion')
           AND substr(created_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
];

// --- métricas de dirección / gestión ---------------------------------------

const direccion: MetricDef[] = [
  {
    key: "piezas_planificadas",
    label: "Piezas planificadas",
    unit: "número",
    scope: "direccion",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("assignee_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category = 'contenido' AND planned_date BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "piezas_publicadas",
    label: "Piezas publicadas",
    unit: "número",
    scope: "direccion",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("assignee_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category = 'contenido' AND substr(published_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
  {
    key: "cumplimiento_contenido",
    label: "Cumplimiento del calendario",
    unit: "porcentaje",
    scope: "direccion",
    higherIsBetter: true,
    help: "Piezas publicadas sobre piezas planificadas en el período.",
    compute: (ctx) => {
      const publicadas = byKey("piezas_publicadas").compute(ctx) ?? 0;
      const planificadas = byKey("piezas_planificadas").compute(ctx) ?? 0;
      return ratio(publicadas, planificadas);
    },
  },
  {
    key: "linkedin_netflow",
    label: "LinkedIn NetFlow",
    unit: "número",
    scope: "direccion",
    higherIsBetter: true,
    compute: ({ range }) =>
      count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category = 'contenido' AND channel = 'linkedin_netflow'
           AND substr(published_at,1,10) BETWEEN ? AND ?`,
        [range.from, range.to],
      ),
  },
  {
    key: "linkedin_facundo",
    label: "LinkedIn Facundo",
    unit: "número",
    scope: "direccion",
    higherIsBetter: true,
    compute: ({ range }) =>
      count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category = 'contenido' AND channel = 'linkedin_facundo'
           AND substr(published_at,1,10) BETWEEN ? AND ?`,
        [range.from, range.to],
      ),
  },
  {
    key: "crm_actualizado",
    label: "CRM actualizado",
    unit: "porcentaje",
    scope: "direccion",
    higherIsBetter: true,
    help: "Oportunidades abiertas con responsable, próxima acción y fecha no vencida.",
    compute: ({ range }) => {
      const row = db()
        .prepare(
          `SELECT COUNT(*) AS total,
                  SUM(owner_id IS NOT NULL
                      AND next_action IS NOT NULL AND trim(next_action) <> ''
                      AND next_action_date IS NOT NULL AND next_action_date >= ?) AS ok
           FROM leads WHERE outcome = 'open'`,
        )
        .get(range.to) as { total: number | null; ok: number | null };
      return ratio(Number(row.ok ?? 0), Number(row.total ?? 0));
    },
  },
  {
    key: "procesos_abiertos",
    label: "Procesos de gestión abiertos",
    unit: "número",
    scope: "direccion",
    higherIsBetter: false,
    compute: ({ userIds }) => {
      const f = userFilter("assignee_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category = 'proceso' AND status <> 'hecho' AND status <> 'cancelada'${f.sql}`,
        [...f.params],
      );
    },
  },
  {
    key: "procesos_completados",
    label: "Procesos de gestión completados",
    unit: "número",
    scope: "direccion",
    higherIsBetter: true,
    compute: ({ range, userIds }) => {
      const f = userFilter("assignee_id", userIds);
      return count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category = 'proceso' AND status = 'hecho'
           AND substr(done_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
    },
  },
];

// --- métricas de empresa ---------------------------------------------------

const empresa: MetricDef[] = [
  {
    key: "clientes_nuevos",
    label: "Clientes nuevos",
    unit: "número",
    scope: "empresa",
    higherIsBetter: true,
    compute: ({ range }) =>
      count(
        `SELECT COUNT(*) AS n FROM clients WHERE start_date BETWEEN ? AND ? AND churned_at IS NULL`,
        [range.from, range.to],
      ),
  },
  {
    key: "clientes_activos",
    label: "Clientes activos",
    unit: "número",
    scope: "empresa",
    higherIsBetter: true,
    compute: ({ range }) =>
      count(
        `SELECT COUNT(*) AS n FROM clients
         WHERE start_date <= ? AND (churned_at IS NULL OR churned_at > ?)`,
        [range.to, range.to],
      ),
  },
  {
    key: "leads_totales",
    label: "Leads totales",
    unit: "número",
    scope: "empresa",
    higherIsBetter: true,
    compute: ({ range }) =>
      count(`SELECT COUNT(*) AS n FROM leads WHERE entered_at BETWEEN ? AND ?`, [range.from, range.to]),
  },
  {
    key: "mrr_total",
    label: "MRR total",
    unit: "moneda",
    scope: "empresa",
    higherIsBetter: true,
    compute: ({ range }) => {
      const rows = db()
        .prepare(
          `SELECT fee_cents AS cents, fee_currency AS currency FROM clients
           WHERE start_date <= ? AND (churned_at IS NULL OR churned_at > ?)`,
        )
        .all(range.to, range.to) as { cents: number; currency: Currency }[];
      return moneyMajor(rows);
    },
  },
  {
    key: "ingresos_cobrados",
    label: "Facturación cobrada",
    unit: "moneda",
    scope: "empresa",
    higherIsBetter: true,
    compute: ({ range }) => {
      const rows = db()
        .prepare(
          `SELECT amount_cents AS cents, currency FROM invoices
           WHERE status = 'cobrada' AND substr(paid_at,1,10) BETWEEN ? AND ?`,
        )
        .all(range.from, range.to) as { cents: number; currency: Currency }[];
      return moneyMajor(rows);
    },
  },
  {
    key: "churn_clientes",
    label: "Bajas de clientes",
    unit: "número",
    scope: "empresa",
    higherIsBetter: false,
    compute: ({ range }) =>
      count(`SELECT COUNT(*) AS n FROM clients WHERE churned_at BETWEEN ? AND ?`, [range.from, range.to]),
  },
];

export const METRICS: MetricDef[] = [
  ...empresa,
  ...commercial,
  ...setter,
  ...paidMedia,
  ...desarrollo,
  ...direccion,
];

const INDEX = new Map(METRICS.map((m) => [m.key, m]));

export function byKey(key: string): MetricDef {
  const def = INDEX.get(key);
  if (!def) throw new Error(`Métrica desconocida: ${key}`);
  return def;
}

export function findMetric(key: string): MetricDef | undefined {
  return INDEX.get(key);
}

export function metricsForArea(area: Area): MetricDef[] {
  return METRICS.filter((m) => m.scope === area);
}

export interface MetricValue {
  key: string;
  label: string;
  unit: MetricUnit;
  value: number | null;
  higherIsBetter: boolean;
  help?: string;
}

export function evaluate(def: MetricDef, ctx: MetricContext): MetricValue {
  let value: number | null = null;
  try {
    value = def.compute(ctx);
  } catch {
    value = null;
  }
  return {
    key: def.key,
    label: def.label,
    unit: def.unit,
    value,
    higherIsBetter: def.higherIsBetter,
    help: def.help,
  };
}
