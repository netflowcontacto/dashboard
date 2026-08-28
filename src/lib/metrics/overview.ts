import "server-only";
import { getDb } from "../db";
import { monthOf, type DateRange } from "../dates";
import { financeSummary, type FinanceSummary } from "./finance";
import { computeFunnel, type FunnelResult } from "./funnel";
import { headlineObjective, type ObjectiveProgress } from "./objectives";
import type { Health } from "../types";

/**
 * Resumen general de direccion. Responde en 2 minutos las tres preguntas
 * que el dashboard tiene que responder:
 *   1. Como esta NetFlow      -> headline + finanzas + clientes
 *   2. Donde esta el cuello    -> bottleneck (etapa del funnel mas floja)
 *   3. Quien tiene la proxima  -> nextActions
 */

export interface Bottleneck {
  from: string;
  to: string;
  rate: number;
  detail: string;
}

export interface OverviewData {
  finance: FinanceSummary;
  funnel: FunnelResult;
  headline: ObjectiveProgress | null;
  period: string;
  clients: {
    active: number;
    newInRange: number;
    churnedInRange: number;
    byHealth: Record<Health, number>;
    pendingPayment: number;
  };
  bottleneck: Bottleneck | null;
  nextActions: {
    ownerId: number;
    ownerName: string;
    overdue: number;
    today: number;
    upcoming: number;
    missing: number;
  }[];
}

/** La conversion mas floja de la cadena, en puntos porcentuales. */
export function findBottleneck(funnel: FunnelResult): Bottleneck | null {
  const steps = funnel.stages
    .map((s, i) => ({ s, prev: funnel.stages[i - 1] }))
    .filter((x) => x.prev !== undefined && x.s.stepRate !== null && x.prev.value > 0);

  if (steps.length === 0) return null;

  const worst = steps.reduce((a, b) => ((a.s.stepRate ?? 100) <= (b.s.stepRate ?? 100) ? a : b));
  return {
    from: worst.prev!.label,
    to: worst.s.label,
    rate: worst.s.stepRate ?? 0,
    detail: `${worst.prev!.value} → ${worst.s.value}`,
  };
}

export function buildOverview(range: DateRange): OverviewData {
  const db = getDb();
  const finance = financeSummary(range);
  const funnel = computeFunnel(range);
  const period = monthOf(range.to);

  const clientCounts = db
    .prepare(
      `SELECT
         SUM(start_date <= ? AND (churned_at IS NULL OR churned_at > ?))                       AS active,
         SUM(start_date BETWEEN ? AND ? AND churned_at IS NULL)                                AS newInRange,
         SUM(churned_at BETWEEN ? AND ?)                                                       AS churnedInRange,
         SUM(account_health = 'bien'     AND churned_at IS NULL)                               AS bien,
         SUM(account_health = 'atencion' AND churned_at IS NULL)                               AS atencion,
         SUM(account_health = 'riesgo'   AND churned_at IS NULL)                               AS riesgo,
         SUM(payment_status <> 'al_dia'  AND churned_at IS NULL)                               AS pendingPayment
       FROM clients`,
    )
    .get(range.to, range.to, range.from, range.to, range.from, range.to) as Record<string, number | null>;

  const n = (v: number | null | undefined) => Number(v ?? 0);

  const nextActions = db
    .prepare(
      `SELECT u.id AS ownerId, u.name AS ownerName,
              SUM(l.next_action_date IS NOT NULL AND l.next_action_date <  ?) AS overdue,
              SUM(l.next_action_date =  ?)                                    AS today,
              SUM(l.next_action_date IS NOT NULL AND l.next_action_date >  ?) AS upcoming,
              SUM(l.next_action_date IS NULL OR trim(COALESCE(l.next_action,'')) = '') AS missing
       FROM leads l JOIN users u ON u.id = l.owner_id
       WHERE l.outcome = 'open'
       GROUP BY u.id, u.name ORDER BY u.id`,
    )
    .all(range.to, range.to, range.to) as OverviewData["nextActions"];

  return {
    finance,
    funnel,
    headline: headlineObjective(period),
    period,
    clients: {
      active: n(clientCounts.active),
      newInRange: n(clientCounts.newInRange),
      churnedInRange: n(clientCounts.churnedInRange),
      byHealth: {
        bien: n(clientCounts.bien),
        atencion: n(clientCounts.atencion),
        riesgo: n(clientCounts.riesgo),
      },
      pendingPayment: n(clientCounts.pendingPayment),
    },
    bottleneck: findBottleneck(funnel),
    nextActions: nextActions.map((r) => ({
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      overdue: n(r.overdue),
      today: n(r.today),
      upcoming: n(r.upcoming),
      missing: n(r.missing),
    })),
  };
}
