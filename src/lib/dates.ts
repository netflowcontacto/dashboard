/**
 * Todo el dashboard trabaja con rangos [from, to] inclusivos en formato
 * YYYY-MM-DD. Los presets (dia / semana / mes) y el rango personalizado
 * producen exactamente la misma estructura, asi que cualquier metrica
 * acepta cualquier filtro sin ramificar.
 */

export interface DateRange {
  from: string;
  to: string;
  label: string;
  preset: RangePreset;
}

export type RangePreset = "hoy" | "semana" | "mes" | "trimestre" | "personalizado";

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return isoDate(new Date(Date.UTC(y, m, 0)));
}

/** Lunes de la semana de `iso` (la semana comercial arranca el lunes). */
export function startOfWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  return addDays(iso, -dow);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Dias que quedan del mes de `iso`, contando hoy. */
export function daysLeftInMonth(iso = todayISO()): number {
  return daysBetween(iso, endOfMonth(iso)) + 1;
}

export function daysInMonth(period: string): number {
  return daysBetween(`${period}-01`, endOfMonth(`${period}-01`)) + 1;
}

const VALID = /^\d{4}-\d{2}-\d{2}$/;

/** Construye el rango a partir de los search params de la URL. */
export function resolveRange(params: {
  preset?: string;
  from?: string;
  to?: string;
}): DateRange {
  const today = todayISO();
  const preset = (params.preset ?? "mes") as RangePreset;

  if (preset === "personalizado" && params.from && params.to && VALID.test(params.from) && VALID.test(params.to)) {
    const [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    return { from, to, preset: "personalizado", label: `${from} a ${to}` };
  }
  if (preset === "hoy") {
    return { from: today, to: today, preset, label: "Hoy" };
  }
  if (preset === "semana") {
    const from = startOfWeek(today);
    return { from, to: addDays(from, 6), preset, label: "Esta semana" };
  }
  if (preset === "trimestre") {
    const [y, m] = today.split("-").map(Number);
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const from = `${y}-${String(qStartMonth).padStart(2, "0")}-01`;
    return { from, to: endOfMonth(`${y}-${String(qStartMonth + 2).padStart(2, "0")}-01`), preset, label: "Este trimestre" };
  }
  return { from: startOfMonth(today), to: endOfMonth(today), preset: "mes", label: "Este mes" };
}

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const [date, time] = iso.split(/[T ]/);
  return time ? `${formatDate(date)} ${time.slice(0, 5)}` : formatDate(date);
}
