import "server-only";
import { getDb } from "../db";
import { fxRate, baseCurrency, toBase } from "../fx";
import { addDays, monthOf, type DateRange } from "../dates";
import type { Currency } from "../types";

/**
 * Motor financiero. TODO lo que sale de aca es informacion sensible:
 * solo se consume desde paginas protegidas con requireAdmin().
 *
 * Regla de consolidacion: cada fila se guarda en su moneda original y se
 * convierte a la moneda base al sumar, con el tipo de cambio de referencia.
 */

interface MoneyRow {
  cents: number;
  currency: Currency;
}

function consolidate(rows: MoneyRow[]): number {
  const rate = fxRate();
  const base = baseCurrency();
  return rows.reduce((acc, r) => acc + toBase(r.cents, r.currency, rate, base), 0);
}

export interface FinanceSummary {
  currency: Currency;
  /** Facturacion emitida en el rango (devengado) */
  billedCents: number;
  collectedCents: number;
  pendingCents: number;
  mrrCents: number;
  newMrrCents: number;

  directCostsCents: number;
  operatingExpensesCents: number;
  totalExpensesCents: number;
  fixedCostsCents: number;
  variableCostsCents: number;
  unpaidExpensesCents: number;

  /** ingresos - costos directos - gastos operativos */
  resultCents: number;
  grossMarginCents: number;
  grossMarginPct: number | null;
  netMarginPct: number | null;

  activeClients: number;
  operatingCostPerClientCents: number | null;
  averageTicketCents: number | null;

  cashCents: number;
  burnPerMonthCents: number;
  runwayMonths: number | null;
}

export function financeSummary(range: DateRange): FinanceSummary {
  const db = getDb();
  const { from, to } = range;
  const base = baseCurrency();

  const billed = db
    .prepare(`SELECT amount_cents AS cents, currency FROM invoices WHERE issued_at BETWEEN ? AND ?`)
    .all(from, to) as MoneyRow[];
  const collected = db
    .prepare(
      `SELECT amount_cents AS cents, currency FROM invoices
       WHERE status = 'cobrada' AND substr(paid_at,1,10) BETWEEN ? AND ?`,
    )
    .all(from, to) as MoneyRow[];
  const pending = db
    .prepare(
      `SELECT amount_cents AS cents, currency FROM invoices
       WHERE status = 'pendiente' AND issued_at <= ?`,
    )
    .all(to) as MoneyRow[];

  const expenses = db
    .prepare(
      `SELECT amount_cents AS cents, currency, cost_type, direct_cost, status
       FROM expenses WHERE date BETWEEN ? AND ?`,
    )
    .all(from, to) as (MoneyRow & { cost_type: string; direct_cost: number; status: string })[];

  const directCostsCents = consolidate(expenses.filter((e) => e.direct_cost === 1));
  const operatingExpensesCents = consolidate(expenses.filter((e) => e.direct_cost === 0));
  const totalExpensesCents = directCostsCents + operatingExpensesCents;

  // Clientes activos al cierre del rango
  const activeClientRows = db
    .prepare(
      `SELECT fee_cents AS cents, fee_currency AS currency FROM clients
       WHERE start_date <= ? AND (churned_at IS NULL OR churned_at > ?)`,
    )
    .all(to, to) as MoneyRow[];
  const mrrCents = consolidate(activeClientRows);
  const activeClients = activeClientRows.length;

  const newClientRows = db
    .prepare(
      `SELECT fee_cents AS cents, fee_currency AS currency FROM clients
       WHERE start_date BETWEEN ? AND ? AND churned_at IS NULL`,
    )
    .all(from, to) as MoneyRow[];
  const newMrrCents = consolidate(newClientRows);

  const billedCents = consolidate(billed);
  const resultCents = billedCents - directCostsCents - operatingExpensesCents;
  const grossMarginCents = billedCents - directCostsCents;

  return {
    currency: base,
    billedCents,
    collectedCents: consolidate(collected),
    pendingCents: consolidate(pending),
    mrrCents,
    newMrrCents,
    directCostsCents,
    operatingExpensesCents,
    totalExpensesCents,
    fixedCostsCents: consolidate(expenses.filter((e) => e.cost_type === "fijo")),
    variableCostsCents: consolidate(expenses.filter((e) => e.cost_type === "variable")),
    unpaidExpensesCents: consolidate(expenses.filter((e) => e.status === "pendiente")),
    resultCents,
    grossMarginCents,
    grossMarginPct: billedCents > 0 ? (grossMarginCents / billedCents) * 100 : null,
    netMarginPct: billedCents > 0 ? (resultCents / billedCents) * 100 : null,
    activeClients,
    operatingCostPerClientCents: activeClients > 0 ? Math.round(operatingExpensesCents / activeClients) : null,
    averageTicketCents: activeClients > 0 ? Math.round(mrrCents / activeClients) : null,
    cashCents: cashAvailableCents(to),
    burnPerMonthCents: averageMonthlyBurnCents(to),
    runwayMonths: runwayMonths(to),
  };
}

/** Caja disponible = ultimo saldo declarado de cada cuenta, consolidado. */
export function cashAvailableCents(asOf: string): number {
  const rows = getDb()
    .prepare(
      `SELECT s.balance_cents AS cents, s.currency
       FROM cash_snapshots s
       JOIN (
         SELECT account, MAX(date || '/' || id) AS latest
         FROM cash_snapshots WHERE date <= ? GROUP BY account
       ) last ON last.account = s.account AND (s.date || '/' || s.id) = last.latest`,
    )
    .all(asOf) as MoneyRow[];
  return consolidate(rows);
}

/** Burn promedio de los ultimos 3 meses cerrados + el corriente. */
export function averageMonthlyBurnCents(asOf: string): number {
  const since = addDays(asOf, -89);
  const rows = getDb()
    .prepare(`SELECT amount_cents AS cents, currency FROM expenses WHERE date BETWEEN ? AND ?`)
    .all(since, asOf) as MoneyRow[];
  if (rows.length === 0) return 0;
  return Math.round(consolidate(rows) / 3);
}

export function runwayMonths(asOf: string): number | null {
  const burn = averageMonthlyBurnCents(asOf);
  if (burn <= 0) return null;
  return cashAvailableCents(asOf) / burn;
}

export interface ExpenseBreakdownRow {
  category: string;
  totalCents: number;
  count: number;
  pctOfTotal: number;
}

export function expensesByCategory(range: DateRange): ExpenseBreakdownRow[] {
  const rows = getDb()
    .prepare(
      `SELECT category, amount_cents AS cents, currency FROM expenses WHERE date BETWEEN ? AND ?`,
    )
    .all(range.from, range.to) as (MoneyRow & { category: string })[];

  const byCategory = new Map<string, { totalCents: number; count: number }>();
  const rate = fxRate();
  const base = baseCurrency();
  for (const r of rows) {
    const entry = byCategory.get(r.category) ?? { totalCents: 0, count: 0 };
    entry.totalCents += toBase(r.cents, r.currency, rate, base);
    entry.count += 1;
    byCategory.set(r.category, entry);
  }
  const total = [...byCategory.values()].reduce((a, b) => a + b.totalCents, 0);
  return [...byCategory.entries()]
    .map(([category, v]) => ({
      category,
      totalCents: v.totalCents,
      count: v.count,
      pctOfTotal: total > 0 ? (v.totalCents / total) * 100 : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

export interface ClientMarginRow {
  clientId: number;
  name: string;
  feeCents: number;
  directCostCents: number;
  marginCents: number;
  marginPct: number | null;
}

/** Margen por cliente: fee mensual menos los costos directos imputados a esa cuenta. */
export function marginByClient(range: DateRange): ClientMarginRow[] {
  const db = getDb();
  const rate = fxRate();
  const base = baseCurrency();

  const clients = db
    .prepare(
      `SELECT id, name, fee_cents, fee_currency FROM clients
       WHERE start_date <= ? AND (churned_at IS NULL OR churned_at > ?) ORDER BY name`,
    )
    .all(range.to, range.to) as
    { id: number; name: string; fee_cents: number; fee_currency: Currency }[];

  const costs = db
    .prepare(
      `SELECT client_id, amount_cents AS cents, currency FROM expenses
       WHERE client_id IS NOT NULL AND date BETWEEN ? AND ?`,
    )
    .all(range.from, range.to) as (MoneyRow & { client_id: number })[];

  const costByClient = new Map<number, number>();
  for (const c of costs) {
    costByClient.set(c.client_id, (costByClient.get(c.client_id) ?? 0) + toBase(c.cents, c.currency, rate, base));
  }

  return clients.map((c) => {
    const feeCents = toBase(c.fee_cents, c.fee_currency, rate, base);
    const directCostCents = costByClient.get(c.id) ?? 0;
    const marginCents = feeCents - directCostCents;
    return {
      clientId: c.id,
      name: c.name,
      feeCents,
      directCostCents,
      marginCents,
      marginPct: feeCents > 0 ? (marginCents / feeCents) * 100 : null,
    };
  });
}

/** Serie mensual de ingresos vs gastos, para ver tendencia. */
export function monthlyTrend(months: number, asOf: string): {
  period: string;
  billedCents: number;
  expensesCents: number;
  resultCents: number;
}[] {
  const db = getDb();
  const rate = fxRate();
  const base = baseCurrency();
  const out: { period: string; billedCents: number; expensesCents: number; resultCents: number }[] = [];

  const [year, month] = monthOf(asOf).split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const period = d.toISOString().slice(0, 7);

    const billed = db
      .prepare(`SELECT amount_cents AS cents, currency FROM invoices WHERE substr(issued_at,1,7) = ?`)
      .all(period) as MoneyRow[];
    const spent = db
      .prepare(`SELECT amount_cents AS cents, currency FROM expenses WHERE substr(date,1,7) = ?`)
      .all(period) as MoneyRow[];

    const billedCents = billed.reduce((a, r) => a + toBase(r.cents, r.currency, rate, base), 0);
    const expensesCents = spent.reduce((a, r) => a + toBase(r.cents, r.currency, rate, base), 0);
    out.push({ period, billedCents, expensesCents, resultCents: billedCents - expensesCents });
  }
  return out;
}
