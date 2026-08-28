/**
 * Todo el dashboard trabaja con rangos [from, to] inclusivos en formato
 * YYYY-MM-DD. Los presets (día / semana / mes) y el rango personalizado
 * producen exactamente la misma estructura, así que cualquier métrica
 * acepta cualquier filtro sin ramificar.
 */

export interface DateRange {
  from: string;
  to: string;
  label: string;
  preset: RangePreset;
}

export type RangePreset = "hoy" | "semana" | "mes" | "trimestre" | "personalizado";

/**
 * Zona horaria de la operación. Es la misma que usa `nf_now()` en la base.
 *
 * Tienen que coincidir sí o sí: la base sella con hora argentina y si acá se
 * calculara "hoy" en UTC, entre las 21:00 y la medianoche la aplicación
 * entera estaría trabajando con la fecha de mañana. El preset "Hoy" saldría
 * vacío, una tarea que vence hoy diría "vence mañana", y marcar una tarea
 * como hecha a las 22 la sellaría con la fecha del día siguiente — eso último
 * corrompe "Entregas a tiempo" de forma permanente.
 */
const ZONA = process.env.TZ || "America/Argentina/Buenos_Aires";

// `en-CA` formatea como YYYY-MM-DD, que es exactamente el formato del esquema.
const FORMATO_FECHA = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** La fecha de hoy en la zona de la operación, no en UTC. */
export function todayISO(): string {
  return FORMATO_FECHA.format(new Date());
}

/**
 * La marca de tiempo de ahora, en la zona de la operación.
 * Mismo formato que `nf_now()`: 'YYYY-MM-DD HH:MI:SS'.
 */
export function nowStamp(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const g = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
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

/** Días que quedan del mes de `iso`, contando hoy. */
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

/**
 * Fechas en lenguaje humano.
 *
 * "28/08/2026" obliga a hacer la cuenta mentalmente; "vence mañana" se lee de
 * un vistazo. En una lista de veinte oportunidades, esa diferencia es la que
 * hace que alguien detecte lo urgente sin leer fila por fila.
 */
export function relativeDate(iso: string | null, asOf = todayISO()): string {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  const diff = daysBetween(asOf, day);

  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  if (diff > 1 && diff <= 7) return `en ${diff} días`;
  if (diff < -1 && diff >= -7) return `hace ${Math.abs(diff)} días`;
  if (diff > 7 && diff <= 30) return `en ${Math.round(diff / 7)} sem.`;
  if (diff < -7 && diff >= -30) return `hace ${Math.round(Math.abs(diff) / 7)} sem.`;
  return formatDate(day);
}

/** Como `relativeDate`, pero enmarcado como vencimiento. */
export function dueLabel(iso: string | null, asOf = todayISO()): string {
  if (!iso) return "sin fecha";
  const diff = daysBetween(asOf, iso.slice(0, 10));
  if (diff === 0) return "vence hoy";
  if (diff === 1) return "vence mañana";
  if (diff < 0) return `vencida ${relativeDate(iso, asOf)}`;
  return `vence ${relativeDate(iso, asOf)}`;
}

/** Fecha completa para tooltips: la relativa es cómoda pero ambigua. */
export function fullDate(iso: string | null): string {
  return iso ? formatDate(iso.slice(0, 10)) : "—";
}

/**
 * Plural en castellano.
 *
 * "4 día(s)" se lee como un formulario, no como una frase. Es un detalle
 * chico que aparece en toda la aplicación, así que resolverlo una vez vale
 * la pena.
 */
export function plural(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}
