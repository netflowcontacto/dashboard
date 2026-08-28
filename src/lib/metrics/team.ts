import "server-only";
import type { DateRange } from "../dates";
import { monthOf } from "../dates";
import { evaluate, metricContext, metricsForArea, type MetricValue } from "./registry";
import { activeUsers, personProgress, type ProgressSummary } from "./objectives";
import type { Area, User } from "../types";

/**
 * Performance del equipo.
 *
 * Nota de diseño importante: esta función devuelve las personas SIEMPRE en
 * orden fijo (por id), nunca ordenadas por porcentaje. El dashboard no es un
 * ranking entre compañeros: cada persona se compara contra su objetivo, no
 * contra el resto. Ver docs/decisiones.md.
 */

export interface PersonPerformance {
  user: User;
  progress: ProgressSummary;
  metrics: MetricValue[];
}

/**
 * `includeSensitive` decide si entran las métricas de facturación (MRR,
 * cobrado). Solo va en true para Dirección: el resto del equipo ve todas las
 * métricas operativas de la función, pero ninguna de lo que factura.
 */
export async function performanceFor(
  user: User,
  range: DateRange,
  includeSensitive = false,
): Promise<PersonPerformance> {
  const period = monthOf(range.to);
  const ctx = await metricContext(range, [user.id]);
  const [metrics, progress] = await Promise.all([
    Promise.all(metricsForArea(user.area, includeSensitive).map((def) => evaluate(def, ctx))),
    personProgress(user.id, period, undefined, includeSensitive),
  ]);
  return { user, progress, metrics };
}

export async function teamPerformance(
  range: DateRange,
  includeSensitive = false,
): Promise<PersonPerformance[]> {
  const users = await activeUsers();
  // Orden estable por id: NO ordenar por progreso.
  return Promise.all(users.map((u) => performanceFor(u, range, includeSensitive)));
}

export async function areaMetrics(
  area: Area,
  range: DateRange,
  userIds: number[] | null,
  includeSensitive = false,
): Promise<MetricValue[]> {
  const ctx = await metricContext(range, userIds);
  return Promise.all(metricsForArea(area, includeSensitive).map((def) => evaluate(def, ctx)));
}
