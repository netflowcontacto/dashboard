import "server-only";
import { addDays, daysBetween, endOfMonth, isoDate, type DateRange } from "../dates";
import { evaluate, findMetric, type MetricContext } from "./registry";

/**
 * Comparación contra el período anterior.
 *
 * La primera pregunta de cualquiera que abre un dashboard no es "cuánto",
 * es "mejor o peor que antes". Sin esto, un MRR de US$ 1.500 no dice nada.
 *
 * El período anterior es el bloque inmediatamente previo del MISMO largo:
 * un mes se compara contra el mes anterior, una semana contra la semana
 * anterior, y un rango personalizado de 12 días contra los 12 días previos.
 */

export function previousRange(range: DateRange): DateRange {
  const length = daysBetween(range.from, range.to) + 1;
  const to = addDays(range.from, -1);
  const from = addDays(to, -(length - 1));

  const label =
    range.preset === "mes"
      ? "el mes anterior"
      : range.preset === "semana"
        ? "la semana anterior"
        : range.preset === "hoy"
          ? "ayer"
          : range.preset === "trimestre"
            ? "el trimestre anterior"
            : `los ${length} días previos`;

  return { from, to, preset: range.preset, label };
}

/**
 * Variación relativa. Devuelve null cuando no hay base contra la cual
 * comparar: mostrar "+100%" porque antes había cero es ruido, no información.
 */
export function deltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface MetricComparison {
  current: number | null;
  previous: number | null;
  pct: number | null;
  higherIsBetter: boolean;
  vs: string;
}

export function compareMetric(
  metricKey: string,
  range: DateRange,
  userIds: number[] | null = null,
): MetricComparison | null {
  const def = findMetric(metricKey);
  if (!def) return null;

  const prev = previousRange(range);
  const ctxNow: MetricContext = { range, userIds };
  const ctxPrev: MetricContext = { range: prev, userIds };

  const current = evaluate(def, ctxNow).value;
  const previous = evaluate(def, ctxPrev).value;

  return {
    current,
    previous,
    pct: deltaPct(current, previous),
    higherIsBetter: def.higherIsBetter,
    vs: prev.label,
  };
}

/** Compara varias métricas de una sola pasada. */
export function compareMetrics(
  keys: string[],
  range: DateRange,
  userIds: number[] | null = null,
): Record<string, MetricComparison> {
  const out: Record<string, MetricComparison> = {};
  for (const key of keys) {
    const cmp = compareMetric(key, range, userIds);
    if (cmp) out[key] = cmp;
  }
  return out;
}

export interface HistoryPoint {
  label: string;
  period: string;
  value: number;
}

/**
 * Serie de los últimos `months` meses de una métrica, para las sparklines.
 * Se calcula mes calendario a mes calendario, no en ventanas móviles: es lo
 * que el equipo tiene en la cabeza cuando mira una tendencia.
 */
export function metricHistory(
  metricKey: string,
  months: number,
  asOf: string,
  userIds: number[] | null = null,
): HistoryPoint[] {
  const def = findMetric(metricKey);
  if (!def) return [];

  const [year, month] = asOf.slice(0, 7).split("-").map(Number);
  const out: HistoryPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(year, month - 1 - i, 1));
    const from = isoDate(start);
    const period = from.slice(0, 7);
    // El mes en curso se corta en la fecha de hoy: comparar un mes a medio
    // andar contra meses completos exagera la caída del último punto.
    const to = period === asOf.slice(0, 7) ? asOf : endOfMonth(from);

    const range: DateRange = { from, to, preset: "mes", label: period };
    const value = evaluate(def, { range, userIds }).value ?? 0;
    out.push({ label: MONTH_SHORT[start.getUTCMonth()], period, value });
  }

  return out;
}

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export { MONTH_SHORT };
