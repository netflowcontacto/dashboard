/** Helpers de parseo de formularios. Devuelven valores ya normalizados. */

export function str(fd: FormData, key: string, fallback = ""): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : fallback;
}

export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function int(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function optInt(fd: FormData, key: string): number | null {
  const raw = str(fd, key);
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function num(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function bool(fd: FormData, key: string): 0 | 1 {
  const v = fd.get(key);
  return v === "on" || v === "1" || v === "true" ? 1 : 0;
}

export function pick<T extends string>(fd: FormData, key: string, allowed: readonly T[], fallback: T): T {
  const v = str(fd, key);
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function date(fd: FormData, key: string, fallback: string): string {
  const v = str(fd, key);
  return ISO_DATE.test(v) ? v : fallback;
}

export function optDate(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return ISO_DATE.test(v) ? v : null;
}

/** datetime-local llega como "YYYY-MM-DDTHH:mm". Se guarda con segundos. */
export function optDateTime(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  return v.length === 16 ? `${v}:00` : v.slice(0, 19);
}

export class ValidationError extends Error {}

export function requireField(value: string | null, label: string): string {
  if (value === null || value.trim() === "") {
    throw new ValidationError(`Falta completar: ${label}.`);
  }
  return value.trim();
}
