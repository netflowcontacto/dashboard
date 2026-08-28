import "server-only";
import { getDb } from "../db";
import { fxRate, baseCurrency, toBase } from "../fx";
import type { DateRange } from "../dates";
import type { Currency } from "../types";

/**
 * Funnel comercial de NetFlow.
 *
 * Dos lecturas distintas, a propósito:
 *
 *  - COHORTE: se toman los leads que INGRESARON en el rango y se mira hasta
 *    donde llegaron. Es la única forma de que los porcentajes de conversión
 *    sean honestos (siempre <= 100% y decrecientes). Es la que responde
 *    "de lo que entro este mes, cuánto convertimos".
 *
 *  - ACTIVIDAD: que paso EN el rango, sin importar cuando entro el lead.
 *    Es la que responde "cuantas reuniones hicimos esta semana".
 *
 * Mezclar las dos es el error clasico que hace que un funnel muestre
 * "120% de contacto". Acá están separadas y etiquetadas.
 */

export interface FunnelStageRow {
  key: string;
  label: string;
  value: number;
  /** % respecto de la etapa anterior */
  stepRate: number | null;
  /** % respecto de leads */
  totalRate: number | null;
}

export interface FunnelResult {
  investmentCents: number;
  currency: Currency;
  cohort: {
    leads: number;
    contactados: number;
    calificados: number;
    reunionesAgendadas: number;
    reunionesRealizadas: number;
    propuestas: number;
    clientes: number;
  };
  activity: {
    reunionesAgendadas: number;
    reunionesRealizadas: number;
    noShows: number;
    propuestas: number;
    clientes: number;
  };
  rates: {
    cplCents: number | null;
    contacto: number | null;
    calificación: number | null;
    leadAReunion: number | null;
    showRate: number | null;
    reunionAPropuesta: number | null;
    reunionACliente: number | null;
    cacCents: number | null;
  };
  revenueCents: number;
  stages: FunnelStageRow[];
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

/** Inversión publicitaria del rango. Fuente única: gastos de categoría paid_media. */
export function adInvestmentCents(range: DateRange): number {
  const rows = getDb()
    .prepare(
      `SELECT amount_cents AS cents, currency FROM expenses
       WHERE category = 'paid_media' AND date BETWEEN ? AND ?`,
    )
    .all(range.from, range.to) as { cents: number; currency: Currency }[];

  const rate = fxRate();
  const base = baseCurrency();
  return rows.reduce((acc, r) => acc + toBase(r.cents, r.currency, rate, base), 0);
}

export function computeFunnel(range: DateRange): FunnelResult {
  const db = getDb();
  const { from, to } = range;

  const cohort = db
    .prepare(
      `SELECT
         COUNT(*)                                                             AS leads,
         SUM(first_contacted_at   IS NOT NULL)                                AS contactados,
         SUM(qualified_at         IS NOT NULL)                                AS calificados,
         SUM(meeting_scheduled_at IS NOT NULL)                                AS reunionesAgendadas,
         SUM(meeting_held_at      IS NOT NULL)                                AS reunionesRealizadas,
         SUM(proposal_sent_at     IS NOT NULL)                                AS propuestas,
         SUM(outcome = 'won')                                                 AS clientes
       FROM leads WHERE entered_at BETWEEN ? AND ?`,
    )
    .get(from, to) as Record<string, number | null>;

  const activity = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM leads WHERE substr(meeting_scheduled_at,1,10) BETWEEN ? AND ?) AS reunionesAgendadas,
         (SELECT COUNT(*) FROM leads WHERE substr(meeting_held_at,1,10)      BETWEEN ? AND ?) AS reunionesRealizadas,
         (SELECT COUNT(*) FROM leads WHERE meeting_outcome = 'no_show'
                                       AND substr(meeting_at,1,10)           BETWEEN ? AND ?) AS noShows,
         (SELECT COUNT(*) FROM leads WHERE substr(proposal_sent_at,1,10)     BETWEEN ? AND ?) AS propuestas,
         (SELECT COUNT(*) FROM leads WHERE outcome = 'won'
                                       AND substr(closed_at,1,10)            BETWEEN ? AND ?) AS clientes`,
    )
    .get(from, to, from, to, from, to, from, to, from, to) as Record<string, number>;

  const num = (v: number | null | undefined) => Number(v ?? 0);
  const c = {
    leads: num(cohort.leads),
    contactados: num(cohort.contactados),
    calificados: num(cohort.calificados),
    reunionesAgendadas: num(cohort.reunionesAgendadas),
    reunionesRealizadas: num(cohort.reunionesRealizadas),
    propuestas: num(cohort.propuestas),
    clientes: num(cohort.clientes),
  };

  const investmentCents = adInvestmentCents(range);

  // Revenue generado = MRR nuevo de los clientes que se cerraron en el rango.
  const rate = fxRate();
  const base = baseCurrency();
  const wonClients = db
    .prepare(
      `SELECT fee_cents AS cents, fee_currency AS currency FROM clients
       WHERE start_date BETWEEN ? AND ? AND churned_at IS NULL`,
    )
    .all(from, to) as { cents: number; currency: Currency }[];
  const revenueCents = wonClients.reduce((acc, r) => acc + toBase(r.cents, r.currency, rate, base), 0);

  // Show rate: solo reuniones cuya fecha ya paso dentro del rango.
  const showRow = db
    .prepare(
      `SELECT
         SUM(meeting_outcome IN ('realizada','no_show')) AS resueltas,
         SUM(meeting_outcome = 'realizada')              AS realizadas
       FROM leads
       WHERE meeting_at IS NOT NULL AND substr(meeting_at,1,10) BETWEEN ? AND ?`,
    )
    .get(from, to) as { resueltas: number | null; realizadas: number | null };

  const clientesPeriodo = activity.clientes;

  const rates = {
    cplCents: c.leads > 0 ? Math.round(investmentCents / c.leads) : null,
    contacto: pct(c.contactados, c.leads),
    calificación: pct(c.calificados, c.contactados),
    leadAReunion: pct(c.reunionesAgendadas, c.leads),
    showRate: pct(num(showRow.realizadas), num(showRow.resueltas)),
    reunionAPropuesta: pct(c.propuestas, c.reunionesRealizadas),
    reunionACliente: pct(c.clientes, c.reunionesRealizadas),
    cacCents: clientesPeriodo > 0 ? Math.round(investmentCents / clientesPeriodo) : null,
  };

  const chain: { key: string; label: string; value: number }[] = [
    { key: "leads", label: "Leads", value: c.leads },
    { key: "contactados", label: "Contactados", value: c.contactados },
    { key: "calificados", label: "Calificados", value: c.calificados },
    { key: "reuniones_agendadas", label: "Reuniones agendadas", value: c.reunionesAgendadas },
    { key: "reuniones_realizadas", label: "Reuniones realizadas", value: c.reunionesRealizadas },
    { key: "propuestas", label: "Propuestas", value: c.propuestas },
    { key: "clientes", label: "Clientes cerrados", value: c.clientes },
  ];

  const stages: FunnelStageRow[] = chain.map((s, i) => ({
    ...s,
    stepRate: i === 0 ? null : pct(s.value, chain[i - 1].value),
    totalRate: pct(s.value, c.leads),
  }));

  return {
    investmentCents,
    currency: base,
    cohort: c,
    activity: {
      reunionesAgendadas: activity.reunionesAgendadas,
      reunionesRealizadas: activity.reunionesRealizadas,
      noShows: activity.noShows,
      propuestas: activity.propuestas,
      clientes: activity.clientes,
    },
    rates,
    revenueCents,
    stages,
  };
}

/** Origen de los leads del rango, para ver de donde viene el volumen real. */
export function leadsBySource(range: DateRange): { source: string; leads: number; clientes: number }[] {
  return getDb()
    .prepare(
      `SELECT source,
              COUNT(*)             AS leads,
              SUM(outcome = 'won') AS clientes
       FROM leads WHERE entered_at BETWEEN ? AND ?
       GROUP BY source ORDER BY leads DESC`,
    )
    .all(range.from, range.to) as { source: string; leads: number; clientes: number }[];
}
