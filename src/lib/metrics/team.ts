import "server-only";
import type { DateRange } from "../dates";
import { monthOf } from "../dates";
import { evaluate, metricsForArea, type MetricValue } from "./registry";
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

export function performanceFor(user: User, range: DateRange): PersonPerformance {
  const period = monthOf(range.to);
  const metrics = metricsForArea(user.area).map((def) =>
    evaluate(def, { range, userIds: [user.id] }),
  );
  return { user, progress: personProgress(user.id, period), metrics };
}

export function teamPerformance(range: DateRange): PersonPerformance[] {
  // Orden estable por id: NO ordenar por progreso.
  return activeUsers().map((u) => performanceFor(u, range));
}

export function areaMetrics(area: Area, range: DateRange, userIds: number[] | null): MetricValue[] {
  return metricsForArea(area).map((def) => evaluate(def, { range, userIds }));
}
