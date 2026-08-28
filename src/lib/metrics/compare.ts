import "server-only";
import { addDays, daysBetween, endOfMonth, isoDate, type DateRange } from "../dates";
import { evaluate, findMetric, metricContext } from "./registry";

/**
 * Comparación contra el período anterior.
 *
 * La primera pregunta de cualquiera que abre un dashboard no es "cuánto",
 * es "mejor o peor que antes". Sin esto, un MRR de US$ 1.500 no dice nada.
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

export async function compareMetric(
  metricKey: string,
  range: DateRange,
  userIds: number[] | null = null,
): Promise<MetricComparison | null> {
  const def = findMetric(metricKey);
  if (!def) return null;

  const prev = previousRange(range);
  const [current, previous] = await Promise.all([
    evaluate(def, await metricContext(range, userIds)).then((r) => r.value),
    evaluate(def, await metricContext(prev, userIds)).then((r) => r.value),
  ]);

  return {
    current,
    previous,
    pct: deltaPct(current, previous),
    higherIsBetter: def.higherIsBetter,
    vs: prev.label,
  };
}

/** Compara varias métricas en paralelo. */
export async function compareMetrics(
  keys: string[],
  range: DateRange,
  userIds: number[] | null = null,
): Promise<Record<string, MetricComparison>> {
  const results = await Promise.all(keys.map((key) => compareMetric(key, range, userIds)));
  const out: Record<string, MetricComparison> = {};
  keys.forEach((key, i) => {
    const cmp = results[i];
    if (cmp) out[key] = cmp;
  });
  return out;
}

export interface HistoryPoint {
  label: string;
  period: string;
  value: number;
}

/**
 * Serie de los últimos `months` meses de una métrica, para las sparklines.
 * Se calcula mes calendario a mes calendario, en paralelo.
 */
export async function metricHistory(
  metricKey: string,
  months: number,
  asOf: string,
  userIds: number[] | null = null,
): Promise<HistoryPoint[]> {
  const def = findMetric(metricKey);
  if (!def) return [];

  const [year, month] = asOf.slice(0, 7).split("-").map(Number);

  return Promise.all(
    Array.from({ length: months }, async (_, idx) => {
      const i = months - 1 - idx;
      const start = new Date(Date.UTC(year, month - 1 - i, 1));
      const from = isoDate(start);
      const period = from.slice(0, 7);
      // El mes en curso se corta en la fecha de hoy: comparar un mes a medio
      // andar contra meses completos exagera la caída del último punto.
      const to = period === asOf.slice(0, 7) ? asOf : endOfMonth(from);

      const range: DateRange = { from, to, preset: "mes", label: period };
      const value = (await evaluate(def, await metricContext(range, userIds))).value ?? 0;
      return { label: MONTH_SHORT[start.getUTCMonth()], period, value };
    }),
  );
}

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export { MONTH_SHORT };
