import "server-only";
import { all, one } from "../db";
import { loadFx, toBase, type Fx } from "../fx";
import type { DateRange } from "../dates";
import type { Currency } from "../types";

/**
 * Funnel comercial de NetFlow.
 *
 * Dos lecturas distintas, a propósito:
 *
 *  - COHORTE: se toman los leads que INGRESARON en el rango y se mira hasta
 *    dónde llegaron. Es la única forma de que los porcentajes de conversión
 *    sean honestos (siempre <= 100% y decrecientes). Responde "de lo que
 *    entró este mes, cuánto convertimos".
 *
 *  - ACTIVIDAD: qué pasó EN el rango, sin importar cuándo entró el lead.
 *    Responde "cuántas reuniones hicimos esta semana".
 *
 * Mezclar las dos es el error clásico que hace que un funnel muestre
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
    calificacion: number | null;
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
export async function adInvestmentCents(range: DateRange, fx?: Fx): Promise<number> {
  const context = fx ?? (await loadFx());
  const rows = await all<{ cents: number; currency: Currency }>(
    `SELECT amount_cents AS cents, currency FROM expenses
     WHERE category = 'paid_media' AND date BETWEEN ? AND ?`,
    [range.from, range.to],
  );
  return rows.reduce((acc, r) => acc + toBase(r.cents, r.currency, context), 0);
}

export async function computeFunnel(range: DateRange): Promise<FunnelResult> {
  const { from, to } = range;
  const fx = await loadFx();

  const [cohortRow, activityRow, wonClients, showRow, investmentCents] = await Promise.all([
    one<Record<string, number | null>>(
      `SELECT
         COUNT(*)                                                  AS leads,
         COUNT(*) FILTER (WHERE first_contacted_at   IS NOT NULL)  AS contactados,
         COUNT(*) FILTER (WHERE qualified_at         IS NOT NULL)  AS calificados,
         COUNT(*) FILTER (WHERE meeting_scheduled_at IS NOT NULL)  AS reuniones_agendadas,
         COUNT(*) FILTER (WHERE meeting_held_at      IS NOT NULL)  AS reuniones_realizadas,
         COUNT(*) FILTER (WHERE proposal_sent_at     IS NOT NULL)  AS propuestas,
         COUNT(*) FILTER (WHERE outcome = 'won')                   AS clientes
       FROM leads WHERE entered_at BETWEEN ? AND ?`,
      [from, to],
    ),
    one<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM leads WHERE substr(meeting_scheduled_at,1,10) BETWEEN ? AND ?) AS reuniones_agendadas,
         (SELECT COUNT(*) FROM leads WHERE substr(meeting_held_at,1,10)      BETWEEN ? AND ?) AS reuniones_realizadas,
         (SELECT COUNT(*) FROM leads WHERE meeting_outcome = 'no_show'
                                       AND substr(meeting_at,1,10)           BETWEEN ? AND ?) AS no_shows,
         (SELECT COUNT(*) FROM leads WHERE substr(proposal_sent_at,1,10)     BETWEEN ? AND ?) AS propuestas,
         (SELECT COUNT(*) FROM leads WHERE outcome = 'won'
                                       AND substr(closed_at,1,10)            BETWEEN ? AND ?) AS clientes`,
      [from, to, from, to, from, to, from, to, from, to],
    ),
    all<{ cents: number; currency: Currency }>(
      `SELECT fee_cents AS cents, fee_currency AS currency FROM clients
       WHERE start_date BETWEEN ? AND ? AND churned_at IS NULL`,
      [from, to],
    ),
    one<{ resueltas: number | null; realizadas: number | null }>(
      `SELECT
         COUNT(*) FILTER (WHERE meeting_outcome IN ('realizada','no_show')) AS resueltas,
         COUNT(*) FILTER (WHERE meeting_outcome = 'realizada')              AS realizadas
       FROM leads
       WHERE meeting_at IS NOT NULL AND substr(meeting_at,1,10) BETWEEN ? AND ?`,
      [from, to],
    ),
    adInvestmentCents(range, fx),
  ]);

  const num = (v: number | null | undefined) => Number(v ?? 0);
  const c = {
    leads: num(cohortRow?.leads),
    contactados: num(cohortRow?.contactados),
    calificados: num(cohortRow?.calificados),
    reunionesAgendadas: num(cohortRow?.reuniones_agendadas),
    reunionesRealizadas: num(cohortRow?.reuniones_realizadas),
    propuestas: num(cohortRow?.propuestas),
    clientes: num(cohortRow?.clientes),
  };

  // Revenue generado = MRR nuevo de los clientes que se cerraron en el rango.
  const revenueCents = wonClients.reduce((acc, r) => acc + toBase(r.cents, r.currency, fx), 0);

  const clientesPeriodo = num(activityRow?.clientes);

  const rates = {
    cplCents: c.leads > 0 ? Math.round(investmentCents / c.leads) : null,
    contacto: pct(c.contactados, c.leads),
    calificacion: pct(c.calificados, c.contactados),
    leadAReunion: pct(c.reunionesAgendadas, c.leads),
    showRate: pct(num(showRow?.realizadas), num(showRow?.resueltas)),
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
    currency: fx.base,
    cohort: c,
    activity: {
      reunionesAgendadas: num(activityRow?.reuniones_agendadas),
      reunionesRealizadas: num(activityRow?.reuniones_realizadas),
      noShows: num(activityRow?.no_shows),
      propuestas: num(activityRow?.propuestas),
      clientes: clientesPeriodo,
    },
    rates,
    revenueCents,
    stages,
  };
}

/** Origen de los leads del rango, para ver de dónde viene el volumen real. */
export async function leadsBySource(
  range: DateRange,
): Promise<{ source: string; leads: number; clientes: number }[]> {
  return all<{ source: string; leads: number; clientes: number }>(
    `SELECT source,
            COUNT(*)                                AS leads,
            COUNT(*) FILTER (WHERE outcome = 'won') AS clientes
     FROM leads WHERE entered_at BETWEEN ? AND ?
     GROUP BY source ORDER BY leads DESC`,
    [range.from, range.to],
  );
}
