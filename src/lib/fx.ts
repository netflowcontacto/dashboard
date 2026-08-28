import "server-only";
import { getSetting } from "./db";
import { convert, type Money } from "./money";
import type { Currency } from "./types";

/**
 * Tipo de cambio y moneda de consolidación.
 *
 * NetFlow opera en ARS y USD. Los importes se guardan en su moneda original;
 * esto solo decide cómo se suman para mostrar un total. Cambiar el tipo de
 * cambio no modifica ningún dato cargado.
 *
 * El contexto se carga UNA vez por pantalla con `loadFx()` y después se pasa
 * a funciones puras. Antes `toBase()` leía la configuración en cada llamada;
 * con una base remota eso serían cientos de viajes de red por página.
 */

export interface Fx {
  rate: number;
  base: Currency;
}

// Memo corto: una pantalla hace varias llamadas seguidas y no tiene sentido
// volver a preguntar la configuración en cada una.
let cache: { value: Fx; at: number } | null = null;
const TTL_MS = 2_000;

export async function loadFx(): Promise<Fx> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const [rawRate, rawBase] = await Promise.all([
    getSetting("fx_ars_per_usd", "1000"),
    getSetting("base_currency", "USD"),
  ]);

  const rate = Number(rawRate);
  const value: Fx = {
    rate: Number.isFinite(rate) && rate > 0 ? rate : 1000,
    base: rawBase === "ARS" ? "ARS" : "USD",
  };

  cache = { value, at: Date.now() };
  return value;
}

/** Invalida el memo. Lo llama el guardado de ajustes. */
export function clearFxCache(): void {
  cache = null;
}

/** Convierte a la moneda base. Función pura: el contexto llega por parámetro. */
export function toBase(cents: number, currency: Currency, fx: Fx): number {
  return convert(cents, currency, fx.base, fx.rate);
}

export function sumToBase(rows: Money[], fx: Fx): number {
  return rows.reduce((acc, r) => acc + toBase(r.cents, r.currency, fx), 0);
}
