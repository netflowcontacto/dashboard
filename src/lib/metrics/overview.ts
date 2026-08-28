import "server-only";
import { all, one } from "../db";
import { monthOf, type DateRange } from "../dates";
import { financeSummary, type FinanceSummary } from "./finance";
import { computeFunnel, type FunnelResult } from "./funnel";
import { headlineObjective, type ObjectiveProgress } from "./objectives";
import type { Health } from "../types";

/**
 * Resumen general de dirección. Responde en dos minutos las tres preguntas
 * que el dashboard tiene que responder:
 *   1. Cómo está NetFlow      -> headline + finanzas + clientes
 *   2. Dónde está el cuello    -> bottleneck (etapa del funnel más floja)
 *   3. Quién tiene la próxima  -> nextActions
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

/** La conversión más floja de la cadena, en puntos porcentuales. */
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

export async function buildOverview(range: DateRange): Promise<OverviewData> {
  const period = monthOf(range.to);

  const [finance, funnel, headline, clientCounts, nextActions] = await Promise.all([
    financeSummary(range),
    computeFunnel(range),
    headlineObjective(period),
    one<Record<string, number | null>>(
      `SELECT
         COUNT(*) FILTER (WHERE start_date <= ? AND (churned_at IS NULL OR churned_at > ?)) AS active,
         COUNT(*) FILTER (WHERE start_date BETWEEN ? AND ? AND churned_at IS NULL)          AS new_in_range,
         COUNT(*) FILTER (WHERE churned_at BETWEEN ? AND ?)                                 AS churned_in_range,
         COUNT(*) FILTER (WHERE account_health = 'bien'     AND churned_at IS NULL)         AS bien,
         COUNT(*) FILTER (WHERE account_health = 'atencion' AND churned_at IS NULL)         AS atencion,
         COUNT(*) FILTER (WHERE account_health = 'riesgo'   AND churned_at IS NULL)         AS riesgo,
         COUNT(*) FILTER (WHERE payment_status <> 'al_dia'  AND churned_at IS NULL)         AS pending_payment
       FROM clients`,
      [range.to, range.to, range.from, range.to, range.from, range.to],
    ),
    all<{
      owner_id: number; owner_name: string;
      overdue: number; today: number; upcoming: number; missing: number;
    }>(
      `SELECT u.id AS owner_id, u.name AS owner_name,
              COUNT(*) FILTER (WHERE l.next_action_date IS NOT NULL AND l.next_action_date <  ?) AS overdue,
              COUNT(*) FILTER (WHERE l.next_action_date = ?)                                     AS today,
              COUNT(*) FILTER (WHERE l.next_action_date IS NOT NULL AND l.next_action_date >  ?) AS upcoming,
              COUNT(*) FILTER (WHERE l.next_action_date IS NULL
                                  OR trim(COALESCE(l.next_action,'')) = '')                      AS missing
       FROM leads l JOIN users u ON u.id = l.owner_id
       WHERE l.outcome = 'open'
       GROUP BY u.id, u.name ORDER BY u.id`,
      [range.to, range.to, range.to],
    ),
  ]);

  const n = (v: number | null | undefined) => Number(v ?? 0);

  return {
    finance,
    funnel,
    headline,
    period,
    clients: {
      active: n(clientCounts?.active),
      newInRange: n(clientCounts?.new_in_range),
      churnedInRange: n(clientCounts?.churned_in_range),
      byHealth: {
        bien: n(clientCounts?.bien),
        atencion: n(clientCounts?.atencion),
        riesgo: n(clientCounts?.riesgo),
      },
      pendingPayment: n(clientCounts?.pending_payment),
    },
    bottleneck: findBottleneck(funnel),
    nextActions: nextActions.map((r) => ({
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      overdue: n(r.overdue),
      today: n(r.today),
      upcoming: n(r.upcoming),
      missing: n(r.missing),
    })),
  };
}
