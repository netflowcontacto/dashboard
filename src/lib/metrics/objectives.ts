import "server-only";
import { getDb } from "../db";
import { daysBetween, endOfMonth, todayISO, type DateRange } from "../dates";
import { evaluate, findMetric, type MetricUnit } from "./registry";
import type { Area, User } from "../types";

/**
 * Objetivos y barras de progreso.
 *
 * Principio de diseño (explicito, para que no se pierda):
 *
 *  1. La barra individual mide OBJETIVO vs RESULTADO. No cuenta tareas.
 *     Nadie llega al 100% haciendo volumen de cosas irrelevantes: solo
 *     suben las métricas que alguien definio como objetivo del mes.
 *
 *  2. Si una persona no tiene objetivos cargados, su progreso es `null`
 *     ("sin objetivos definidos"), NUNCA 0% ni 100%. Un dashboard que
 *     inventa un número es peor que uno que dice que le falta información.
 *
 *  3. El progreso agregado tapa cada objetivo al 100%: sobrecumplir uno no
 *     compensa incumplir otro. Se ve el sobrecumplimiento en el detalle,
 *     pero no infla el total.
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
  /** 0..n — puede pasar de 1 si se sobrecumplio */
  achievement: number | null;
  /** achievement * 100, redondeado para mostrar */
  pct: number | null;
  onTrack: boolean | null;
  /** Ritmo necesario según los días transcurridos del período */
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

export function listObjectives(period: string, filter?: {
  scope?: "empresa" | "area" | "persona";
  userId?: number;
  area?: Area;
}): ObjectiveRow[] {
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
  return getDb()
    .prepare(`SELECT * FROM objectives WHERE ${clauses.join(" AND ")} ORDER BY scope, id`)
    .all(...params) as ObjectiveRow[];
}

export function progressFor(objectives: ObjectiveRow[], period: string, asOf = todayISO()): ProgressSummary {
  const range = periodRange(period);
  const expectedPct = periodElapsedPct(period, asOf);
  const daysLeft = daysLeftInPeriod(period, asOf);

  const rows: ObjectiveProgress[] = objectives.map((o) => {
    const def = findMetric(o.metric_key);
    const userIds = o.scope === "persona" && o.user_id ? [o.user_id] : usersOfArea(o);
    const value = def ? evaluate(def, { range, userIds }).value : null;
    const achievement = achievementOf(value, o.target_value, o.direction);
    const pct = achievement === null ? null : achievement * 100;

    return {
      objective: o,
      label: o.label || def?.label || o.metric_key,
      unit: def?.unit ?? "número",
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
  });

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

/** Para objetivos de area, el resultado se mide sobre las personas de esa area. */
function usersOfArea(o: ObjectiveRow): number[] | null {
  if (o.scope !== "area" || !o.area) return null;
  const rows = getDb()
    .prepare("SELECT id FROM users WHERE area = ? AND active = 1")
    .all(o.area) as { id: number }[];
  return rows.map((r) => r.id);
}

export function companyProgress(period: string, asOf = todayISO()): ProgressSummary {
  return progressFor(listObjectives(period, { scope: "empresa" }), period, asOf);
}

export function personProgress(userId: number, period: string, asOf = todayISO()): ProgressSummary {
  return progressFor(listObjectives(period, { scope: "persona", userId }), period, asOf);
}

export function areaProgress(area: Area, period: string, asOf = todayISO()): ProgressSummary {
  return progressFor(listObjectives(period, { scope: "area", area }), period, asOf);
}

/** El objetivo principal del mes (ej: 5 clientes nuevos), destacado arriba de todo. */
export function headlineObjective(period: string, asOf = todayISO()): ObjectiveProgress | null {
  const objectives = listObjectives(period, { scope: "empresa" });
  if (objectives.length === 0) return null;
  const preferred = objectives.find((o) => o.metric_key === "clientes_nuevos") ?? objectives[0];
  return progressFor([preferred], period, asOf).objectives[0] ?? null;
}

export function activeUsers(): User[] {
  return getDb()
    .prepare(
      "SELECT id, name, email, role, area, job_title, active FROM users WHERE active = 1 ORDER BY id",
    )
    .all() as User[];
}
