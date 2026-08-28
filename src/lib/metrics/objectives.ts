import "server-only";
import { all } from "../db";
import { daysBetween, endOfMonth, todayISO, type DateRange } from "../dates";
import { evaluate, findMetric, metricContext, type MetricUnit } from "./registry";
import type { Area, User } from "../types";

/**
 * Objetivos y barras de progreso.
 *
 * Principio de diseño (explícito, para que no se pierda):
 *
 *  1. La barra individual mide OBJETIVO vs RESULTADO. No cuenta tareas.
 *     Nadie llega al 100% haciendo volumen de cosas irrelevantes: solo
 *     suben las métricas que alguien definió como objetivo del mes.
 *
 *  2. Si una persona no tiene objetivos cargados, su progreso es `null`
 *     ("sin objetivos definidos"), NUNCA 0% ni 100%. Un dashboard que
 *     inventa un número es peor que uno que dice que le falta información.
 *
 *  3. El progreso agregado tapa cada objetivo al 100%: sobrecumplir uno no
 *     compensa incumplir otro.
 */

export interface ObjectiveRow {
  id: number;
  period: string;
  scope: "empresa" | "area" | "persona";
  area: Area | null;
  user_id: number | null;
  metric_key: string;
  label: string;
  target_value: number;
  weight: number;
  direction: "higher_is_better" | "lower_is_better";
  notes: string;
}

export interface ObjectiveProgress {
  objective: ObjectiveRow;
  label: string;
  unit: MetricUnit;
  current: number | null;
  target: number;
  achievement: number | null;
  pct: number | null;
  onTrack: boolean | null;
  expectedPct: number;
  missing: number | null;
}

export interface ProgressSummary {
  /** null = no hay objetivos cargados. No asumir 0 ni 100. */
  pct: number | null;
  objectives: ObjectiveProgress[];
  daysLeft: number;
  expectedPct: number;
  status: "sin_objetivos" | "adelantado" | "en_ritmo" | "atrasado";
}

function periodRange(period: string): DateRange {
  const from = `${period}-01`;
  return { from, to: endOfMonth(from), preset: "mes", label: period };
}

/** Porcentaje del período ya transcurrido (0..100). */
export function periodElapsedPct(period: string, asOf = todayISO()): number {
  const { from, to } = periodRange(period);
  if (asOf < from) return 0;
  if (asOf > to) return 100;
  const total = daysBetween(from, to) + 1;
  const done = daysBetween(from, asOf) + 1;
  return (done / total) * 100;
}

export function daysLeftInPeriod(period: string, asOf = todayISO()): number {
  const { to } = periodRange(period);
  if (asOf > to) return 0;
  return Math.max(0, daysBetween(asOf, to) + 1);
}

function achievementOf(
  current: number | null,
  target: number,
  direction: "higher_is_better" | "lower_is_better",
): number | null {
  if (current === null) return null;
  if (direction === "lower_is_better") {
    if (current <= 0) return 1; // cero es el mejor resultado posible
    if (target <= 0) return 0;
    return target / current;
  }
  if (target <= 0) return 1;
  return current / target;
}

export async function listObjectives(
  period: string,
  filter?: { scope?: "empresa" | "area" | "persona"; userId?: number; area?: Area },
): Promise<ObjectiveRow[]> {
  const clauses = ["period = ?"];
  const params: unknown[] = [period];
  if (filter?.scope) {
    clauses.push("scope = ?");
    params.push(filter.scope);
  }
  if (filter?.userId !== undefined) {
    clauses.push("user_id = ?");
    params.push(filter.userId);
  }
  if (filter?.area) {
    clauses.push("area = ?");
    params.push(filter.area);
  }
  return all<ObjectiveRow>(
    `SELECT * FROM objectives WHERE ${clauses.join(" AND ")} ORDER BY scope, id`,
    params,
  );
}

/** Para objetivos de área, el resultado se mide sobre las personas de esa área. */
async function usersOfArea(o: ObjectiveRow): Promise<number[] | null> {
  if (o.scope !== "area" || !o.area) return null;
  const rows = await all<{ id: number }>(
    "SELECT id FROM users WHERE area = ? AND active = 1",
    [o.area],
  );
  return rows.map((r) => r.id);
}

export async function progressFor(
  objectives: ObjectiveRow[],
  period: string,
  asOf = todayISO(),
  includeSensitive = true,
): Promise<ProgressSummary> {
  if (!includeSensitive) {
    objectives = objectives.filter((o) => !findMetric(o.metric_key)?.sensitive);
  }
  const range = periodRange(period);
  const expectedPct = periodElapsedPct(period, asOf);
  const daysLeft = daysLeftInPeriod(period, asOf);

  // En paralelo: con una base remota, evaluar en serie multiplicaría por N
  // los viajes de red de cada pantalla.
  const rows: ObjectiveProgress[] = await Promise.all(
    objectives.map(async (o) => {
      const def = findMetric(o.metric_key);
      const userIds = o.scope === "persona" && o.user_id ? [o.user_id] : await usersOfArea(o);
      const value = def ? (await evaluate(def, await metricContext(range, userIds))).value : null;
      const achievement = achievementOf(value, o.target_value, o.direction);
      const pct = achievement === null ? null : achievement * 100;

      return {
        objective: o,
        label: o.label || def?.label || o.metric_key,
        unit: def?.unit ?? "numero",
        current: value,
        target: o.target_value,
        achievement,
        pct,
        onTrack: pct === null ? null : pct >= expectedPct,
        expectedPct,
        missing:
          value === null
            ? null
            : o.direction === "higher_is_better"
              ? Math.max(0, o.target_value - value)
              : Math.max(0, value - o.target_value),
      };
    }),
  );

  const scored = rows.filter((r) => r.achievement !== null);
  let pct: number | null = null;
  if (scored.length > 0) {
    const totalWeight = scored.reduce((a, r) => a + (r.objective.weight || 1), 0);
    // cada objetivo se tapa al 100%: sobrecumplir uno no tapa incumplir otro
    const weighted = scored.reduce(
      (a, r) => a + Math.min(1, r.achievement as number) * (r.objective.weight || 1),
      0,
    );
    pct = totalWeight > 0 ? (weighted / totalWeight) * 100 : null;
  }

  let status: ProgressSummary["status"] = "sin_objetivos";
  if (pct !== null) {
    if (pct >= expectedPct + 10) status = "adelantado";
    else if (pct >= expectedPct - 5) status = "en_ritmo";
    else status = "atrasado";
  }

  return { pct, objectives: rows, daysLeft, expectedPct, status };
}

export async function companyProgress(
  period: string,
  asOf = todayISO(),
  includeSensitive = true,
): Promise<ProgressSummary> {
  return progressFor(await listObjectives(period, { scope: "empresa" }), period, asOf, includeSensitive);
}

export async function personProgress(
  userId: number,
  period: string,
  asOf = todayISO(),
  includeSensitive = true,
): Promise<ProgressSummary> {
  return progressFor(
    await listObjectives(period, { scope: "persona", userId }),
    period,
    asOf,
    includeSensitive,
  );
}

export async function areaProgress(
  area: Area,
  period: string,
  asOf = todayISO(),
  includeSensitive = true,
): Promise<ProgressSummary> {
  return progressFor(await listObjectives(period, { scope: "area", area }), period, asOf, includeSensitive);
}

/** El objetivo principal del mes (ej: 5 clientes nuevos), destacado arriba de todo. */
export async function headlineObjective(
  period: string,
  asOf = todayISO(),
): Promise<ObjectiveProgress | null> {
  const objectives = await listObjectives(period, { scope: "empresa" });
  if (objectives.length === 0) return null;
  const preferred = objectives.find((o) => o.metric_key === "clientes_nuevos") ?? objectives[0];
  return (await progressFor([preferred], period, asOf)).objectives[0] ?? null;
}

export async function activeUsers(): Promise<User[]> {
  return all<User>(
    "SELECT id, name, email, role, area, job_title, active FROM users WHERE active = 1 ORDER BY id",
  );
}
