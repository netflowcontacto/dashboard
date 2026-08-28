import "server-only";
import { getSetting } from "./db";
import { convert, type Money } from "./money";
import type { Currency } from "./types";

/**
 * Tipo de cambio y moneda de consolidacion, leidos de la configuracion.
 *
 * NetFlow opera en ARS y USD. Los importes se guardan en su moneda original;
 * esto solo decide como se suman para mostrar un total. Cambiar el tipo de
 * cambio no modifica ningun dato cargado.
 *
 * Modulo solo-servidor: lee de la base. Para formatear en el cliente,
 * usar `@/lib/money`.
 */

export function fxRate(): number {
  const raw = Number(getSetting("fx_ars_per_usd", "1000"));
  return Number.isFinite(raw) && raw > 0 ? raw : 1000;
}

export function baseCurrency(): Currency {
  return getSetting("base_currency", "USD") === "ARS" ? "ARS" : "USD";
}

/** Convierte a la moneda base configurada, en centavos. */
export function toBase(
  cents: number,
  currency: Currency,
  rate = fxRate(),
  base = baseCurrency(),
): number {
  return convert(cents, currency, base, rate);
}

export function sumToBase(rows: Money[], rate = fxRate(), base = baseCurrency()): number {
  return rows.reduce((acc, r) => acc + toBase(r.cents, r.currency, rate, base), 0);
}
