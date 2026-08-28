import type { Currency } from "./types";

/**
 * Utilidades de dinero PURAS: formateo, parseo y conversion con un tipo de
 * cambio explicito. Este modulo no toca la base de datos a proposito, para
 * poder usarlo tambien desde componentes de cliente.
 *
 * El tipo de cambio y la moneda base configurados viven en `@/lib/fx`
 * (solo servidor, lee de settings).
 *
 * Regla de oro: el valor original NUNCA se pisa. Se guarda siempre
 * (importe en centavos + moneda) y la consolidacion se hace al mostrar.
 */

export interface Money {
  cents: number;
  currency: Currency;
}

/** Convierte un importe entre monedas con un tipo de cambio explicito. */
export function convert(cents: number, from: Currency, to: Currency, arsPerUsd: number): number {
  if (from === to) return cents;
  if (to === "USD") return Math.round(cents / arsPerUsd); // venia en ARS
  return Math.round(cents * arsPerUsd); // venia en USD
}

const FORMATTERS: Record<Currency, Intl.NumberFormat> = {
  ARS: new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
};

export function formatMoney(cents: number, currency: Currency): string {
  return FORMATTERS[currency].format(cents / 100);
}

/** Parsea "1.234,56" / "1234.56" / "$ 1.234" a centavos. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = String(input ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // el separador decimal es el que aparece mas a la derecha
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (lastComma > -1) {
    // una sola coma: decimal si tiene 1-2 digitos detras, si no es separador de miles
    normalized = cleaned.length - lastComma - 1 <= 2
      ? cleaned.replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (lastDot > -1 && cleaned.length - lastDot - 1 > 2) {
    normalized = cleaned.replace(/\./g, "");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
