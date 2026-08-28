import "server-only";
import { all, one, getSetting } from "../db";
import { loadFx, toBase, type Fx } from "../fx";
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

export type MetricUnit = "numero" | "porcentaje" | "moneda" | "horas";

export interface MetricContext {
  range: DateRange;
  /** null = toda la empresa. Si viene, filtra por esas personas. */
  userIds: number[] | null;
  /** Tipo de cambio ya resuelto: evita que cada métrica lo vuelva a pedir. */
  fx: Fx;
}

export interface MetricDef {
  key: string;
  label: string;
  unit: MetricUnit;
  /** Área a la que pertenece la métrica. 'empresa' = transversal. */
  scope: Area | "empresa";
  /** Cuando es false, un valor más bajo es mejor (ej: tiempo de respuesta, CPL). */
  higherIsBetter: boolean;
  /**
   * Métrica de facturación: solo la ve Dirección.
   *
   * La línea es "lo que entra": MRR, facturación cobrada, revenue. La
   * inversión publicitaria y el CPL NO son sensibles — son costos, y Paid
   * Media los necesita para trabajar.
   */
  sensitive?: boolean;
  help?: string;
  compute: (ctx: MetricContext) => Promise<number | null>;
}

// --- helpers ---------------------------------------------------------------

/** Genera "AND col IN (...)" o cadena vacía si no hay filtro de personas. */
function userFilter(column: string, userIds: number[] | null): { sql: string; params: number[][] } {
  if (!userIds || userIds.length === 0) return { sql: "", params: [] };
  // = ANY(?) con un array evita armar la lista de placeholders a mano.
  return { sql: ` AND ${column} = ANY(?)`, params: [userIds] };
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const row = await one<{ n: number | null }>(sql, params);
  return Number(row?.n ?? 0);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function moneyMajor(rows: { cents: number; currency: Currency }[], fx: Fx): number {
  return rows.reduce((acc, r) => acc + toBase(r.cents, r.currency, fx), 0) / 100;
}

/** Orígenes de lead que se consideran pauta paga (configurable en Ajustes). */
export async function paidSources(): Promise<string[]> {
  const raw = await getSetting("paid_lead_sources", "meta_ads,google_ads,instagram_ads,pauta");
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function paidSourceFilter(): Promise<{ sql: string; params: string[][] }> {
  const sources = await paidSources();
  if (sources.length === 0) return { sql: " AND false", params: [] };
  return { sql: " AND source = ANY(?)", params: [sources] };
}

// --- métricas comerciales --------------------------------------------------

const commercial: MetricDef[] = [
  {
    key: "reuniones_realizadas",
    label: "Reuniones realizadas",
    unit: "numero",
    scope: "closer",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    unit: "numero",
    scope: "closer",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    unit: "numero",
    scope: "closer",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    compute: async (ctx) => {
      const [cierres, reuniones] = await Promise.all([
        byKey("cierres").compute(ctx),
        byKey("reuniones_realizadas").compute(ctx),
      ]);
      return ratio(cierres ?? 0, reuniones ?? 0);
    },
  },
  {
    key: "mrr_nuevo",
    label: "MRR nuevo",
    unit: "moneda",
    scope: "closer",
    higherIsBetter: true,
    sensitive: true,
    help: "Fee mensual de los clientes dados de alta en el período.",
    compute: async ({ range, userIds, fx }) => {
      const f = userFilter("l.closer_id", userIds);
      const rows = await all<{ cents: number; currency: Currency }>(
        `SELECT c.fee_cents AS cents, c.fee_currency AS currency
         FROM clients c
         ${userIds ? "JOIN leads l ON l.client_id = c.id" : ""}
         WHERE c.start_date BETWEEN ? AND ? AND c.churned_at IS NULL${userIds ? f.sql : ""}`,
        [range.from, range.to, ...(userIds ? f.params : [])],
      );
      return moneyMajor(rows, fx);
    },
  },
];

// --- métricas de setter ----------------------------------------------------

const setter: MetricDef[] = [
  {
    key: "leads_recibidos",
    label: "Leads recibidos",
    unit: "numero",
    scope: "setter",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    unit: "numero",
    scope: "setter",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    compute: async ({ range, userIds }) => {
      const f = userFilter("setter_id", userIds);
      const row = await one<{ n: number | null }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (first_contacted_at::timestamp - created_at::timestamp)) / 3600.0) AS n
         FROM leads
         WHERE first_contacted_at IS NOT NULL
           AND substr(first_contacted_at,1,10) BETWEEN ? AND ?
           AND first_contacted_at::timestamp >= created_at::timestamp${f.sql}`,
        [range.from, range.to, ...f.params],
      );
      return row?.n === null || row?.n === undefined ? null : Number(row.n);
    },
  },
  {
    key: "leads_calificados",
    label: "Leads calificados",
    unit: "numero",
    scope: "setter",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    unit: "numero",
    scope: "setter",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    compute: async ({ range, userIds }) => {
      const f = userFilter("setter_id", userIds);
      const row = await one<{ ok: number | null; total: number | null }>(
        `SELECT COUNT(*) FILTER (WHERE meeting_outcome = 'realizada')              AS ok,
                COUNT(*) FILTER (WHERE meeting_outcome IN ('realizada','no_show')) AS total
         FROM leads
         WHERE meeting_at IS NOT NULL
           AND substr(meeting_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
      return ratio(Number(row?.ok ?? 0), Number(row?.total ?? 0));
    },
  },
  {
    key: "follow_ups",
    label: "Follow-ups",
    unit: "numero",
    scope: "setter",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    unit: "numero",
    scope: "setter",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    key: "inversion",
    label: "Inversión publicitaria",
    unit: "moneda",
    scope: "paid_media",
    higherIsBetter: true,
    help: "Gastos de categoría Paid Media en el período. Fuente única compartida con Finanzas.",
    compute: async ({ range, fx }) => {
      const rows = await all<{ cents: number; currency: Currency }>(
        `SELECT amount_cents AS cents, currency FROM expenses
         WHERE category = 'paid_media' AND date BETWEEN ? AND ?`,
        [range.from, range.to],
      );
      return moneyMajor(rows, fx);
    },
  },
  {
    key: "leads_pauta",
    label: "Leads de pauta",
    unit: "numero",
    scope: "paid_media",
    higherIsBetter: true,
    compute: async ({ range }) => {
      const s = await paidSourceFilter();
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
    compute: async (ctx) => {
      const [inversion, leads] = await Promise.all([
        byKey("inversion").compute(ctx),
        byKey("leads_pauta").compute(ctx),
      ]);
      return (leads ?? 0) > 0 ? (inversion ?? 0) / (leads as number) : null;
    },
  },
  {
    key: "leads_calificados_pauta",
    label: "Leads calificados de pauta",
    unit: "numero",
    scope: "paid_media",
    higherIsBetter: true,
    compute: async ({ range }) => {
      const s = await paidSourceFilter();
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
    unit: "numero",
    scope: "paid_media",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    unit: "numero",
    scope: "paid_media",
    higherIsBetter: true,
    help: "Contribución de paid media a la agenda comercial.",
    compute: async ({ range }) => {
      const s = await paidSourceFilter();
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
    unit: "numero",
    scope: "desarrollo",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    unit: "numero",
    scope: "desarrollo",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    help: "De lo entregado en el período, cuánto llegó antes de su fecha comprometida.",
    compute: async ({ range, userIds }) => {
      const f = userFilter("assignee_id", userIds);
      const row = await one<{ ok: number | null; total: number | null }>(
        `SELECT COUNT(*) FILTER (WHERE substr(done_at,1,10) <= due_date) AS ok,
                COUNT(*)                                                 AS total
         FROM tasks
         WHERE status = 'hecho' AND due_date IS NOT NULL
           AND substr(done_at,1,10) BETWEEN ? AND ?${f.sql}`,
        [range.from, range.to, ...f.params],
      );
      return ratio(Number(row?.ok ?? 0), Number(row?.total ?? 0));
    },
  },
  {
    key: "landings_activas",
    label: "Landings activas",
    unit: "numero",
    scope: "desarrollo",
    higherIsBetter: true,
    compute: async ({ range }) =>
      count(
        `SELECT COUNT(*) AS n FROM clients
         WHERE landing = 1 AND start_date <= ? AND (churned_at IS NULL OR churned_at > ?)`,
        [range.to, range.to],
      ),
  },
  {
    key: "pendientes",
    label: "Pendientes abiertos",
    unit: "numero",
    scope: "desarrollo",
    higherIsBetter: false,
    compute: async ({ userIds }) => {
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
    unit: "numero",
    scope: "desarrollo",
    higherIsBetter: false,
    compute: async ({ range, userIds }) => {
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

// --- métricas de marketing y contenido -------------------------------------

const marketing: MetricDef[] = [
  {
    key: "piezas_planificadas",
    label: "Piezas planificadas",
    unit: "numero",
    scope: "marketing",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    unit: "numero",
    scope: "marketing",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    scope: "marketing",
    higherIsBetter: true,
    help: "Piezas publicadas sobre piezas planificadas en el período.",
    compute: async (ctx) => {
      const [publicadas, planificadas] = await Promise.all([
        byKey("piezas_publicadas").compute(ctx),
        byKey("piezas_planificadas").compute(ctx),
      ]);
      return ratio(publicadas ?? 0, planificadas ?? 0);
    },
  },
  {
    key: "linkedin_netflow",
    label: "LinkedIn NetFlow",
    unit: "numero",
    scope: "marketing",
    higherIsBetter: true,
    compute: async ({ range }) =>
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
    unit: "numero",
    scope: "marketing",
    higherIsBetter: true,
    compute: async ({ range }) =>
      count(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE category = 'contenido' AND channel = 'linkedin_facundo'
           AND substr(published_at,1,10) BETWEEN ? AND ?`,
        [range.from, range.to],
      ),
  },
];

// --- métricas de dirección / gestión ---------------------------------------

const direccion: MetricDef[] = [
  {
    key: "crm_actualizado",
    label: "CRM actualizado",
    unit: "porcentaje",
    scope: "direccion",
    higherIsBetter: true,
    help: "Oportunidades abiertas con responsable, próxima acción y fecha no vencida.",
    compute: async ({ range }) => {
      const row = await one<{ total: number | null; ok: number | null }>(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (
                  WHERE owner_id IS NOT NULL
                    AND next_action IS NOT NULL AND trim(next_action) <> ''
                    AND next_action_date IS NOT NULL AND next_action_date >= ?
                ) AS ok
         FROM leads WHERE outcome = 'open'`,
        [range.to],
      );
      return ratio(Number(row?.ok ?? 0), Number(row?.total ?? 0));
    },
  },
  {
    key: "procesos_abiertos",
    label: "Procesos de gestión abiertos",
    unit: "numero",
    scope: "direccion",
    higherIsBetter: false,
    compute: async ({ userIds }) => {
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
    unit: "numero",
    scope: "direccion",
    higherIsBetter: true,
    compute: async ({ range, userIds }) => {
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
    unit: "numero",
    scope: "empresa",
    higherIsBetter: true,
    compute: async ({ range }) =>
      count(
        `SELECT COUNT(*) AS n FROM clients WHERE start_date BETWEEN ? AND ? AND churned_at IS NULL`,
        [range.from, range.to],
      ),
  },
  {
    key: "clientes_activos",
    label: "Clientes activos",
    unit: "numero",
    scope: "empresa",
    higherIsBetter: true,
    compute: async ({ range }) =>
      count(
        `SELECT COUNT(*) AS n FROM clients
         WHERE start_date <= ? AND (churned_at IS NULL OR churned_at > ?)`,
        [range.to, range.to],
      ),
  },
  {
    key: "leads_totales",
    label: "Leads totales",
    unit: "numero",
    scope: "empresa",
    higherIsBetter: true,
    compute: async ({ range }) =>
      count(`SELECT COUNT(*) AS n FROM leads WHERE entered_at BETWEEN ? AND ?`, [range.from, range.to]),
  },
  {
    key: "mrr_total",
    label: "MRR total",
    unit: "moneda",
    scope: "empresa",
    higherIsBetter: true,
    sensitive: true,
    compute: async ({ range, fx }) => {
      const rows = await all<{ cents: number; currency: Currency }>(
        `SELECT fee_cents AS cents, fee_currency AS currency FROM clients
         WHERE start_date <= ? AND (churned_at IS NULL OR churned_at > ?)`,
        [range.to, range.to],
      );
      return moneyMajor(rows, fx);
    },
  },
  {
    key: "ingresos_cobrados",
    label: "Facturación cobrada",
    unit: "moneda",
    scope: "empresa",
    higherIsBetter: true,
    sensitive: true,
    compute: async ({ range, fx }) => {
      const rows = await all<{ cents: number; currency: Currency }>(
        `SELECT amount_cents AS cents, currency FROM invoices
         WHERE status = 'cobrada' AND substr(paid_at,1,10) BETWEEN ? AND ?`,
        [range.from, range.to],
      );
      return moneyMajor(rows, fx);
    },
  },
  {
    key: "churn_clientes",
    label: "Bajas de clientes",
    unit: "numero",
    scope: "empresa",
    higherIsBetter: false,
    compute: async ({ range }) =>
      count(`SELECT COUNT(*) AS n FROM clients WHERE churned_at BETWEEN ? AND ?`, [range.from, range.to]),
  },
];

export const METRICS: MetricDef[] = [
  ...empresa,
  ...commercial,
  ...setter,
  ...paidMedia,
  ...desarrollo,
  ...marketing,
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

export function metricsForArea(area: Area, includeSensitive = true): MetricDef[] {
  return METRICS.filter((m) => m.scope === area && (includeSensitive || !m.sensitive));
}

/** Métricas que se pueden ofrecer como objetivo a quien está mirando. */
export function selectableMetrics(includeSensitive: boolean): MetricDef[] {
  return METRICS.filter((m) => includeSensitive || !m.sensitive);
}

export function isSensitiveMetric(key: string): boolean {
  return Boolean(findMetric(key)?.sensitive);
}

export interface MetricValue {
  key: string;
  label: string;
  unit: MetricUnit;
  value: number | null;
  higherIsBetter: boolean;
  help?: string;
}

export async function evaluate(def: MetricDef, ctx: MetricContext): Promise<MetricValue> {
  let value: number | null = null;
  try {
    value = await def.compute(ctx);
  } catch (e) {
    // Una métrica rota no debe tumbar la pantalla entera: se muestra "—".
    console.error(`Error calculando la métrica ${def.key}:`, e instanceof Error ? e.message : e);
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

/** Contexto listo para usar, con el tipo de cambio ya resuelto. */
export async function metricContext(
  range: DateRange,
  userIds: number[] | null = null,
): Promise<MetricContext> {
  return { range, userIds, fx: await loadFx() };
}
